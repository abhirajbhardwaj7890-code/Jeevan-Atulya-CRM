import React, { useState, useMemo } from 'react';
import { Account, Member, LedgerEntry, AccountType } from '../types';
import { formatDate } from '../services/utils';
import { Download, AlertTriangle, Calendar, X, Filter } from 'lucide-react';

interface CollectionReportModalProps {
    onClose: () => void;
    accounts: Account[];
    members: Member[];
    ledger: LedgerEntry[];
    initialDate?: string;
}

type ReportType = 'Daily' | 'Monthly' | 'Yearly' | 'Custom';

export const CollectionReportModal: React.FC<CollectionReportModalProps> = ({ onClose, accounts, members, ledger, initialDate }) => {
    const today = new Date().toISOString().split('T')[0];
    const [reportType, setReportType] = useState<ReportType>('Daily');
    const [startDate, setStartDate] = useState(initialDate || today);
    const [endDate, setEndDate] = useState(initialDate || today);
    const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7)); // YYYY-MM
    const [selectedYear, setSelectedYear] = useState(today.slice(0, 4)); // YYYY

    // Helper to determine date range based on report type
    const dateRange = useMemo(() => {
        let start = startDate;
        let end = endDate;

        if (reportType === 'Daily') {
            end = start;
        } else if (reportType === 'Monthly') {
            const [y, m] = selectedMonth.split('-');
            start = `${y}-${m}-01`;
            // Get last day of month
            const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
            end = `${y}-${m}-${lastDay}`;
        } else if (reportType === 'Yearly') {
            start = `${selectedYear}-01-01`;
            end = `${selectedYear}-12-31`;
        }

        return { start, end };
    }, [reportType, startDate, endDate, selectedMonth, selectedYear]);

    // Filter and Aggregate Data
    const reportData = useMemo(() => {
        const results: any[] = [];
        const registrationMap = new Map<string, any>();
        let totalCash = 0;
        let totalOnline = 0;
        let ledgerCount = 0;
        let txCount = 0;

        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        // 1. Transactions from Accounts (Primary Source for Member Payments)
        accounts.forEach(acc => {
            const member = members.find(m => m.id === acc.memberId);

            // SKIP condition: Account must be Active AND Member must be Active
            if (acc.status !== 'Active' || (member && member.status !== 'Active')) {
                return;
            }

            acc.transactions.forEach(tx => {
                const txDate = new Date(tx.date);
                // Check if date is within range
                if (txDate >= start && txDate <= end) {

                    const cash = tx.cashAmount ?? (tx.paymentMethod === 'Cash' ? tx.amount : 0);
                    const online = tx.onlineAmount ?? (tx.paymentMethod === 'Online' ? tx.amount : 0);

                    // If simple payment method used and both are 0, infer based on method
                    let finalCash = cash;
                    let finalOnline = online;
                    if (finalCash === 0 && finalOnline === 0) {
                        if (tx.paymentMethod === 'Cash') finalCash = tx.amount;
                        else finalOnline = tx.amount;
                    }

                    // Only count "Collections" (Inflows) for the top-level stats
                    // In this system, tx.type === 'credit' is ALWAYS an inflow (deposit or repayment)
                    if (tx.type === 'credit') {
                        totalCash += finalCash;
                        totalOnline += finalOnline;
                    }

                    const isOpeningBalance = tx.category === 'Opening Balance' || (tx.description && tx.description.includes('Opening Balance'));
                    const isCDorSM = acc.type === AccountType.COMPULSORY_DEPOSIT || acc.type === AccountType.SHARE_CAPITAL;

                    if (isOpeningBalance && isCDorSM) {
                        const key = `${tx.date}_${acc.memberId}`;
                        if (!registrationMap.has(key)) {
                            registrationMap.set(key, {
                                id: `REG-${tx.date}-${acc.memberId}`,
                                date: tx.date,
                                accountNo: '-',
                                accountType: 'Registration',
                                memberId: acc.memberId,
                                memberName: member?.fullName || 'Unknown',
                                description: 'New Membership Registration (Fees + Deposit)',
                                category: 'Member Registration',
                                mode: 'Cash',
                                cash: 0,
                                online: 0,
                                amount: 0,
                                type: 'credit',
                                source: 'Registration'
                            });
                        }
                        const reg = registrationMap.get(key);
                        reg.cash += finalCash;
                        reg.online += finalOnline;
                        reg.amount += tx.amount;
                        reg.mode = reg.cash > 0 && reg.online > 0 ? 'Both' : (reg.cash > 0 ? 'Cash' : 'Online');
                    } else {
                        txCount++;
                        results.push({
                            id: tx.id,
                            date: tx.date,
                            accountNo: acc.accountNumber,
                            accountType: acc.type,
                            memberId: member?.id || 'N/A',
                            memberName: member?.fullName || 'Unknown',
                            description: tx.description,
                            category: tx.category || 'Transaction',
                            mode: finalCash > 0 && finalOnline > 0 ? 'Both' : (finalCash > 0 ? 'Cash' : 'Online'),
                            cash: finalCash,
                            online: finalOnline,
                            amount: tx.amount,
                            type: tx.type,
                            source: 'Member Account'
                        });
                    }
                }
            });
        });

        // 2. Ledger Income & Expense Entries
        ledger.forEach(entry => {
            const entryDate = new Date(entry.date);
            if (entryDate >= start && entryDate <= end) {

                const isAdmissionFee = entry.category.toLowerCase().trim() === 'admission fees';

                // Establish strict source hierarchy:
                // 1. If it's a member-linked entry, ONLY include it if it's 'Admission Fees' (part of Registration)
                // 2. Every other member-linked ledger entry is a duplicate of an account transaction.
                // 3. Entries without memberId are General Society Income.
                if (entry.memberId) {
                    const member = members.find(m => m.id === entry.memberId);
                    // Skip if member is pending/suspended (same as transaction logic)
                    if (member && member.status !== 'Active') {
                        return;
                    }

                    if (!isAdmissionFee) {
                        return; // Skip duplicate member transactions
                    }
                }

                const cash = entry.cashAmount || 0;
                const online = entry.onlineAmount || 0;

                let finalCash = cash;
                let finalOnline = online;
                if (cash === 0 && online === 0 && entry.amount > 0) {
                    finalCash = entry.amount;
                }

                // Only count Income for Collection stats
                if (entry.type === 'Income') {
                    totalCash += finalCash;
                    totalOnline += finalOnline;
                }

                if (isAdmissionFee && entry.memberId) {
                    const key = `${entry.date}_${entry.memberId}`;
                    if (!registrationMap.has(key)) {
                        const member = members.find(m => m.id === entry.memberId);
                        registrationMap.set(key, {
                            id: `REG-${entry.date}-${entry.memberId}`,
                            date: entry.date,
                            accountNo: '-',
                            accountType: 'Registration',
                            memberId: entry.memberId,
                            memberName: member?.fullName || 'Unknown',
                            description: 'New Membership Registration (Fees + Deposit)',
                            category: 'Member Registration',
                            mode: 'Cash',
                            cash: 0,
                            online: 0,
                            amount: 0,
                            type: 'credit',
                            source: 'Registration'
                        });
                    }
                    const reg = registrationMap.get(key);
                    reg.cash += finalCash;
                    reg.online += finalOnline;
                    reg.amount += entry.amount;
                    reg.mode = reg.cash > 0 && reg.online > 0 ? 'Both' : (reg.cash > 0 ? 'Cash' : 'Online');
                } else {
                    const member = entry.memberId ? members.find(m => m.id === entry.memberId) : null;
                    results.push({
                        id: entry.id,
                        date: entry.date,
                        accountNo: 'LEDGER',
                        accountType: member ? 'Member Payment' : 'General Income',
                        memberId: member?.id || '-',
                        memberName: member?.fullName || 'Society',
                        description: entry.description,
                        category: entry.category,
                        mode: finalCash > 0 && finalOnline > 0 ? 'Both' : (finalCash > 0 ? 'Cash' : 'Online'),
                        cash: finalCash,
                        online: finalOnline,
                        amount: entry.amount,
                        type: entry.type === 'Income' ? 'credit' : 'debit',
                        source: 'Society Ledger'
                    });
                }
            }
        });

        // Add merged registrations
        registrationMap.forEach(reg => results.push(reg));

        // Sort by Date Descending, then Name
        results.sort((a, b) => {
            const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
            if (dateDiff !== 0) return dateDiff;
            // secondary sort by ID to keep related items together
            return (a.id || '').localeCompare(b.id || '');
        });

        return { items: results, totalCash, totalOnline, total: totalCash + totalOnline, txCount, ledgerCount, regCount: registrationMap.size };
    }, [dateRange, accounts, members, ledger]);

    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const html = `
            <html>
                <head>
                    <title>Collection Report</title>
                    <style>
                        body { font-family: sans-serif; padding: 20px; color: #333; }
                        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #eee; padding-bottom: 10px; }
                        .meta { display: flex; justify-content: space-between; font-size: 12px; color: #666; margin-bottom: 20px; }
                        .summary { display: grid; grid-template-cols: repeat(3, 1fr); gap: 15px; margin-bottom: 20px; }
                        .stat-card { padding: 10px; border: 1px solid #eee; border-radius: 6px; background: #f9fafb; }
                        .stat-label { font-size: 10px; color: #666; font-weight: bold; text-transform: uppercase; }
                        .stat-value { font-size: 16px; font-weight: bold; margin-top: 5px; }
                        table { width: 100%; border-collapse: collapse; font-size: 10px; }
                        th, td { border: 1px solid #ddd; padding: 8px 6px; text-align: left; }
                        th { background: #f0f0f0; font-weight: bold; }
                        .text-right { text-align: right; }
                        .footer { margin-top: 30px; border-top: 1px solid #ccc; padding-top: 10px; font-size: 10px; display: flex; justify-content: space-between; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h2 style="margin:0;">Jeevan Atulya Co-operative Society</h2>
                        <h4 style="margin:5px 0; font-weight: normal;">Collection Report</h4>
                    </div>
                    
                    <div class="meta">
                        <div><strong>Report Type:</strong> ${reportType}</div>
                        <div><strong>Period:</strong> ${formatDate(dateRange.start)} to ${formatDate(dateRange.end)}</div>
                        <div><strong>Generated:</strong> ${new Date().toLocaleString()}</div>
                    </div>

                    <div class="summary">
                        <div class="stat-card">
                            <div class="stat-label">Total Cash</div>
                            <div class="stat-value">₹${reportData.totalCash.toLocaleString('en-IN')}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Total Online</div>
                            <div class="stat-value">₹${reportData.totalOnline.toLocaleString('en-IN')}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Grand Total</div>
                            <div class="stat-value">₹${reportData.total.toLocaleString('en-IN')}</div>
                        </div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Account</th>
                                <th>Member</th>
                                <th>Type</th>
                                <th>Description</th>
                                <th>Mode</th>
                                <th class="text-right">Cash</th>
                                <th class="text-right">Online</th>
                                <th class="text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${reportData.items.map((item) => `
                                <tr>
                                    <td>${formatDate(item.date)}</td>
                                    <td>${item.accountNo}</td>
                                    <td>${item.memberName} <br/><small style="color:#666">${item.memberId}</small></td>
                                    <td>${item.accountType.replace('_', ' ')}</td>
                                    <td>${item.description}</td>
                                    <td>${item.mode}</td>
                                    <td class="text-right">₹${item.cash.toLocaleString('en-IN')}</td>
                                    <td class="text-right">₹${item.online.toLocaleString('en-IN')}</td>
                                    <td class="text-right">₹${item.amount.toLocaleString('en-IN')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                             <tr style="background: #f0f0f0; font-weight: bold;">
                                <td colspan="6" class="text-right">Totals</td>
                                <td class="text-right">₹${reportData.totalCash.toLocaleString('en-IN')}</td>
                                <td class="text-right">₹${reportData.totalOnline.toLocaleString('en-IN')}</td>
                                <td class="text-right">₹${reportData.total.toLocaleString('en-IN')}</td>
                            </tr>
                        </tfoot>
                    </table>

                    <div class="footer">
                         <div>Jeevan Atulya CRM</div>
                         <div>Authorized Signature</div>
                    </div>
                </body>
            </html>
        `;

        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 500);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden animate-slide-up">

                {/* Header with Filters */}
                <div className="bg-slate-900 p-5 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 text-white shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/20 rounded-lg">
                            <Calendar className="text-blue-400" size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold">Collection Report</h3>
                            <p className="text-slate-400 text-xs">Analysis of all incoming payments</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto p-1 bg-slate-800 rounded-lg">
                        {(['Daily', 'Monthly', 'Yearly', 'Custom'] as ReportType[]).map(type => (
                            <button
                                key={type}
                                onClick={() => setReportType(type)}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${reportType === type
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                                    }`}
                            >
                                {type}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2">
                        {reportType === 'Daily' && (
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                                className="bg-slate-800 border border-slate-700 text-white text-sm rounded px-3 py-2 outline-none focus:border-blue-500" />
                        )}
                        {reportType === 'Monthly' && (
                            <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                                className="bg-slate-800 border border-slate-700 text-white text-sm rounded px-3 py-2 outline-none focus:border-blue-500" />
                        )}
                        {reportType === 'Yearly' && (
                            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
                                className="bg-slate-800 border border-slate-700 text-white text-sm rounded px-3 py-2 outline-none focus:border-blue-500">
                                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                        )}
                        {reportType === 'Custom' && (
                            <div className="flex items-center gap-2">
                                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                                    className="bg-slate-800 border border-slate-700 text-white text-sm rounded px-2 py-2 w-32 outline-none" />
                                <span className="text-slate-500">-</span>
                                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                                    className="bg-slate-800 border border-slate-700 text-white text-sm rounded px-2 py-2 w-32 outline-none" />
                            </div>
                        )}

                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors ml-2">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 bg-slate-50 border-b border-slate-200 shrink-0">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cash Collection</p>
                            <p className="text-2xl font-black text-emerald-600 mt-1">₹{reportData.totalCash.toLocaleString('en-IN')}</p>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600">
                            <Download size={20} className="rotate-180" />
                        </div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Online Collection</p>
                            <p className="text-2xl font-black text-blue-600 mt-1">₹{reportData.totalOnline.toLocaleString('en-IN')}</p>
                        </div>
                        <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
                            <Download size={20} className="rotate-180" />
                        </div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Collection</p>
                            <p className="text-2xl font-black text-slate-900 mt-1">₹{reportData.total.toLocaleString('en-IN')}</p>
                        </div>
                        <div className="p-3 bg-slate-100 rounded-lg text-slate-600">
                            <Filter size={20} />
                        </div>
                    </div>
                </div>

                {/* Source Stats Bar */}
                <div className="px-6 py-3 bg-slate-100/50 border-b border-slate-200 flex flex-wrap gap-4 items-center text-[10px] font-bold uppercase tracking-wider text-slate-500 overflow-x-auto shrink-0">
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-white rounded-full border border-slate-200 shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        <span>Member Transactions: {reportData.txCount}</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-white rounded-full border border-slate-200 shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                        <span>Society Ledger: {reportData.ledgerCount}</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-white rounded-full border border-slate-200 shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        <span>Registrations: {reportData.regCount}</span>
                    </div>
                </div>

                {/* Table Content */}
                <div className="flex-1 overflow-auto p-0">
                    <table className="w-full text-left text-sm border-separate border-spacing-0">
                        <thead className="sticky top-0 bg-white z-10 shadow-sm">
                            <tr>
                                <th className="px-6 py-4 border-b border-slate-200 font-bold text-slate-600">Date / Source</th>
                                <th className="px-6 py-4 border-b border-slate-200 font-bold text-slate-600">Member / Entity</th>
                                <th className="px-6 py-4 border-b border-slate-200 font-bold text-slate-600">Account / Category</th>
                                <th className="px-6 py-4 border-b border-slate-200 font-bold text-slate-600">Payment Details</th>
                                <th className="px-6 py-4 border-b border-slate-200 font-bold text-slate-600 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {reportData.items.map((item, idx) => (
                                <tr key={`${item.id}-${idx}`} className="hover:bg-slate-50 transition-colors group">
                                    <td className="px-6 py-3 border-b border-slate-50">
                                        <div className="font-mono text-xs text-slate-500">{formatDate(item.date)}</div>
                                        <div className={`text-[9px] font-bold uppercase tracking-tighter mt-1 px-1.5 py-0.5 rounded-sm inline-block ${item.source === 'Member Account' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                                            item.source === 'Society Ledger' ? 'bg-purple-50 text-purple-600 border border-purple-100' :
                                                'bg-amber-50 text-amber-600 border border-amber-100'
                                            }`}>
                                            {item.source}
                                        </div>
                                    </td>
                                    <td className="px-6 py-3 border-b border-slate-50">
                                        <div className="font-semibold text-slate-800">{item.memberName}</div>
                                        <div className="text-xs text-slate-400 font-mono mt-0.5">{item.memberId !== '-' ? `ID: ${item.memberId}` : 'General Ledger'}</div>
                                    </td>
                                    <td className="px-6 py-3 border-b border-slate-50">
                                        <div className="flex items-center gap-2">
                                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wide">
                                                {item.accountType.replace('_', ' ')}
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-500 font-mono mt-1">{item.accountNo}</div>
                                    </td>
                                    <td className="px-6 py-3 border-b border-slate-50">
                                        <div className="text-slate-700 text-sm">{item.description}</div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className={`text-[10px] font-bold uppercase tracking-wider ${item.mode === 'Cash' ? 'bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded' :
                                                item.mode === 'Online' ? 'bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded' : 'bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded'
                                                }`}>
                                                {item.mode}
                                            </span>
                                            {item.mode === 'Both' && (
                                                <span className="text-[10px] text-slate-400">
                                                    (Cash: {item.cash}, Online: {item.online})
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-3 border-b border-slate-50 text-right font-bold text-slate-900">
                                        ₹{item.amount.toLocaleString('en-IN')}
                                    </td>
                                </tr>
                            ))}
                            {reportData.items.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-16 text-center text-slate-400">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="p-3 bg-slate-50 rounded-full">
                                                <AlertTriangle size={24} className="text-slate-300" />
                                            </div>
                                            <p>No collections found for the selected period.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="p-5 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
                    <p className="text-slate-400 text-xs italic">
                        * Showing {reportData.items.length} records.
                    </p>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-6 py-2.5 border border-slate-300 rounded-xl text-slate-600 font-bold hover:bg-white transition-all shadow-sm text-sm">
                            Close
                        </button>
                        <button
                            onClick={handlePrint}
                            disabled={reportData.items.length === 0}
                            className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all shadow-md flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Download size={16} /> Print Report
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
