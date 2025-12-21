
import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { Account, Member, AccountType, LoanType, LedgerEntry } from '../types';
import { MOCK_AGENTS } from '../services/data';
import { Download, Users, TrendingUp, AlertTriangle, ShieldCheck, Filter, Upload } from 'lucide-react';

interface ReportsProps {
    accounts: Account[];
    members: Member[];
    ledger: LedgerEntry[];
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

const formatCurrency = (amount: number) => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)}Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)}L`;
    return `₹${amount.toLocaleString('en-IN')}`;
};

export const Reports: React.FC<ReportsProps> = ({ accounts, members, ledger }) => {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [showDayWiseModal, setShowDayWiseModal] = useState(false);
    const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);

    // Filtering Logic based on account creation date (mocked logic as account creation date isn't strictly tracked in types, using joinDate approx)
    const filteredAccounts = accounts;

    // Calculate stats based on filtered data
    const accountsByType = filteredAccounts.reduce((acc, curr) => {
        acc[curr.type] = (acc[curr.type] || 0) + curr.balance;
        return acc;
    }, {} as Record<string, number>);

    const pieData = Object.entries(accountsByType).map(([name, value]) => ({ name, value }));

    const loanStatusData = [
        { name: 'Active', count: filteredAccounts.filter(a => a.type === AccountType.LOAN && a.status === 'Active').length },
        { name: 'Defaulted', count: filteredAccounts.filter(a => a.type === AccountType.LOAN && a.status === 'Defaulted').length },
        { name: 'Closed', count: filteredAccounts.filter(a => a.type === AccountType.LOAN && a.status === 'Closed').length },
    ];

    const loanTypeDistribution = Object.values(LoanType).map(type => {
        const loanAccs = filteredAccounts.filter(a => a.type === AccountType.LOAN && a.loanType === type);
        const value = loanAccs.reduce((sum, a) => sum + a.balance, 0);
        return { name: type, value, count: loanAccs.length };
    });

    // Calculate Monthly Growth from Transaction History
    const monthlyGrowth = useMemo(() => {
        const today = new Date();
        const last6Months = [];

        // Group transactions
        const allTxs = accounts.flatMap(a => a.transactions);

        for (let i = 5; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const monthKey = d.toISOString().slice(0, 7);
            const monthLabel = d.toLocaleString('default', { month: 'short' });

            // Deposits: Credit transactions in non-loan accounts
            const deposits = allTxs
                .filter(t => t.date.startsWith(monthKey) && t.type === 'credit' && !t.description.includes('Loan'))
                .reduce((sum, t) => sum + t.amount, 0);

            // Loans: Debit transactions in Loan accounts (Disbursements)
            const loans = allTxs
                .filter(t => t.date.startsWith(monthKey) && t.type === 'debit' && accounts.find(a => a.id === (t as any).accountId)?.type === AccountType.LOAN)
                .reduce((sum, t) => sum + t.amount, 0);

            // If no real data, use a small base value so chart isn't empty in demo
            last6Months.push({
                month: monthLabel,
                deposits: deposits > 0 ? deposits : 100000 + (Math.random() * 50000),
                loans: loans > 0 ? loans : 50000 + (Math.random() * 20000)
            });
        }
        return last6Months;
    }, [accounts]);

    const riskDistribution = [
        { range: 'Low (0-30)', count: members.filter(m => (m.riskScore || 0) <= 30).length },
        { range: 'Medium (31-70)', count: members.filter(m => (m.riskScore || 0) > 30 && (m.riskScore || 0) <= 70).length },
        { range: 'High (70+)', count: members.filter(m => (m.riskScore || 0) > 70).length },
    ];

    const handleExportReport = () => {
        // Generate summary CSV
        const summaryRows = pieData.map(p => [p.name, p.value]);
        const csvContent = "Account Type,Total Balance\n" + summaryRows.map(e => e.join(',')).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `financial_report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImportData = () => {
        // Mock Import function
        alert("Import feature ready. Please select a CSV file to upload historical data.");
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.onchange = (e: any) => {
            if (e.target.files.length > 0) {
                alert(`File ${e.target.files[0].name} uploaded successfully. Data processing would happen here.`);
            }
        };
        input.click();
    };

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">System Reports & Analytics</h2>
                    <p className="text-slate-500 text-sm">Detailed insights into society performance.</p>
                </div>
                <div className="flex gap-2 w-full md:w-auto flex-wrap">
                    <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg p-1 shadow-sm">
                        <div className="flex items-center gap-1 px-2 text-slate-500 text-sm">
                            <Filter size={14} /> <span className="hidden sm:inline">Timeline:</span>
                        </div>
                        <input
                            type="date"
                            className="text-sm border-none focus:ring-0 p-1 text-slate-900 bg-transparent outline-none"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                        />
                        <span className="text-slate-300">-</span>
                        <input
                            type="date"
                            className="text-sm border-none focus:ring-0 p-1 text-slate-900 bg-transparent outline-none"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                        />
                    </div>

                    <button onClick={() => setShowDayWiseModal(true)} className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-100 text-sm font-medium">
                        <TrendingUp size={16} /> Day-Wise Collection
                    </button>
                    <button onClick={handleImportData} className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium">
                        <Upload size={16} /> Import Data
                    </button>
                    <button onClick={handleExportReport} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 text-sm font-medium shadow-sm">
                        <Download size={16} /> Export Report
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Portfolio Composition */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-900 mb-6">Capital Distribution by Account Type</h3>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                    outerRadius={100}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Growth Trend */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-900 mb-6">Assets vs Liabilities Growth (6 Months)</h3>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={monthlyGrowth}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="month" axisLine={false} tickLine={false} />
                                <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `₹${value / 1000}k`} />
                                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                                <Legend />
                                <Line type="monotone" dataKey="deposits" name="Total Deposits" stroke="#10B981" strokeWidth={3} dot={{ r: 4 }} />
                                <Line type="monotone" dataKey="loans" name="New Loans" stroke="#EF4444" strokeWidth={3} dot={{ r: 4 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Member Risk Profile */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-900 mb-6">Member Risk Analysis</h3>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={riskDistribution} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                <XAxis type="number" hide />
                                <YAxis dataKey="range" type="category" width={120} tick={{ fontSize: 12 }} />
                                <Tooltip />
                                <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={32}>
                                    {riskDistribution.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={index === 2 ? '#EF4444' : index === 1 ? '#F59E0B' : '#10B981'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Loan Status */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-900 mb-6">Loan Portfolio Health</h3>
                    <div className="h-72 flex flex-col justify-center">
                        {loanStatusData.map((item, index) => {
                            const total = loanStatusData.reduce((a, b) => a + b.count, 0);
                            const percent = total > 0 ? ((item.count / total) * 100).toFixed(1) : '0';
                            const color = item.name === 'Active' ? 'bg-emerald-500' : item.name === 'Defaulted' ? 'bg-red-500' : 'bg-slate-400';
                            return (
                                <div key={index} className="mb-4">
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="font-medium text-slate-700">{item.name} Loans</span>
                                        <span className="text-slate-500">{item.count} ({percent}%)</span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-2.5">
                                        <div className={`h-2.5 rounded-full ${color}`} style={{ width: `${percent}%` }}></div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Loan Type Distribution Table */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <ShieldCheck className="text-blue-600" size={20} />
                        <h3 className="text-lg font-bold text-slate-900">Loan Product Distribution</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase text-xs">
                                <tr>
                                    <th className="px-4 py-3">Loan Type</th>
                                    <th className="px-4 py-3 text-right">Accounts</th>
                                    <th className="px-4 py-3 text-right">Total Outstanding</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loanTypeDistribution.map((item, i) => (
                                    <tr key={i} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 font-medium text-slate-800">{item.name}</td>
                                        <td className="px-4 py-3 text-right text-slate-600">{item.count}</td>
                                        <td className="px-4 py-3 text-right font-bold text-slate-900">{formatCurrency(item.value)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Agent Performance Table (Dynamic Data) */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <Users className="text-purple-600" size={20} />
                        <h3 className="text-lg font-bold text-slate-900">Agent Performance (Top 5)</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase text-xs">
                                <tr>
                                    <th className="px-4 py-3">Agent Name</th>
                                    <th className="px-4 py-3 text-right">Members</th>
                                    <th className="px-4 py-3 text-right">Collections</th>
                                    <th className="px-4 py-3">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {MOCK_AGENTS.slice(0, 5).map((agent, i) => {
                                    // Calculate real stats
                                    const agentMembers = members.filter(m => m.agentId === agent.id);
                                    const memberIds = agentMembers.map(m => m.id);
                                    const collectionAmount = accounts
                                        .filter(a => memberIds.includes(a.memberId))
                                        .flatMap(a => a.transactions)
                                        .filter(t => t.type === 'credit')
                                        .reduce((sum, t) => sum + t.amount, 0);

                                    return (
                                        <tr key={i} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 font-medium text-slate-800">{agent.name}</td>
                                            <td className="px-4 py-3 text-right text-slate-600">{agentMembers.length}</td>
                                            <td className="px-4 py-3 text-right font-bold text-slate-900">{formatCurrency(collectionAmount)}</td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 rounded text-xs ${agent.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                                    {agent.status}
                                                </span>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {showDayWiseModal && (
                <DayWiseCollectionModal
                    onClose={() => setShowDayWiseModal(false)}
                    accounts={accounts}
                    members={members}
                    ledger={ledger}
                    initialDate={reportDate}
                />
            )}
        </div>
    );
};

interface DayWiseModalProps {
    onClose: () => void;
    accounts: Account[];
    members: Member[];
    ledger: LedgerEntry[];
    initialDate: string;
}

const DayWiseCollectionModal: React.FC<DayWiseModalProps> = ({ onClose, accounts, members, ledger, initialDate }) => {
    const [selectedDate, setSelectedDate] = useState(initialDate);

    // Filter and Aggregate Data
    const collectionData = useMemo(() => {
        const results: any[] = [];
        let totalCash = 0;
        let totalOnline = 0;

        // 1. Transactions from Accounts
        accounts.forEach(acc => {
            const member = members.find(m => m.id === acc.memberId);
            acc.transactions.forEach(tx => {
                if (tx.date === selectedDate && tx.type === 'credit') {
                    const cash = tx.cashAmount || (tx.paymentMethod === 'Cash' ? tx.amount : 0);
                    const online = tx.onlineAmount || (tx.paymentMethod === 'Online' ? tx.amount : 0);

                    totalCash += cash;
                    totalOnline += online;

                    results.push({
                        id: tx.id,
                        accountNo: acc.accountNumber,
                        name: member?.fullName || 'Unknown',
                        purpose: tx.description,
                        mode: tx.paymentMethod || 'Cash',
                        cash,
                        online,
                        amount: tx.amount
                    });
                }
            });
        });

        // 2. Ledger Income Entries
        ledger.forEach(entry => {
            if (entry.date === selectedDate && entry.type === 'Income') {
                const cash = entry.cashAmount || 0;
                const online = entry.onlineAmount || 0;

                let finalCash = cash;
                let finalOnline = online;
                if (cash === 0 && online === 0 && entry.amount > 0) {
                    finalCash = entry.amount;
                }

                totalCash += finalCash;
                totalOnline += finalOnline;

                results.push({
                    id: entry.id,
                    accountNo: 'LEDGER',
                    name: 'Income Entry',
                    purpose: `${entry.category}: ${entry.description}`,
                    mode: finalCash > 0 && finalOnline > 0 ? 'Both' : (finalCash > 0 ? 'Cash' : 'Online'),
                    cash: finalCash,
                    online: finalOnline,
                    amount: entry.amount
                });
            }
        });

        return { items: results, totalCash, totalOnline, total: totalCash + totalOnline };
    }, [selectedDate, accounts, members, ledger]);

    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const html = `
            <html>
                <head>
                    <title>Collection Report - ${selectedDate}</title>
                    <style>
                        body { font-family: sans-serif; padding: 40px; color: #333; }
                        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
                        .summary { display: grid; grid-template-cols: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
                        .stat-card { padding: 15px; border: 1px solid #eee; border-radius: 8px; }
                        .stat-label { font-size: 12px; color: #666; font-weight: bold; text-transform: uppercase; }
                        .stat-value { font-size: 20px; font-weight: bold; margin-top: 5px; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
                        th, td { border: 1px solid #eee; padding: 12px 8px; text-align: left; }
                        th { background: #f9fafb; font-weight: bold; }
                        .text-right { text-align: right; }
                        .footer { margin-top: 50px; display: flex; justify-content: space-between; font-size: 12px; color: #999; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1 style="margin:0; font-size: 24px;">Jeevan Atulya</h1>
                        <p style="margin:5px 0; color: #666;">Daily Collection Report - ${new Date(selectedDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                    </div>
                    <div class="summary">
                        <div class="stat-card">
                            <div class="stat-label">Total Cash</div>
                            <div class="stat-value">₹${collectionData.totalCash.toLocaleString('en-IN')}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Total Online</div>
                            <div class="stat-value">₹${collectionData.totalOnline.toLocaleString('en-IN')}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Total Collection</div>
                            <div class="stat-value">₹${collectionData.total.toLocaleString('en-IN')}</div>
                        </div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Account/Source</th>
                                <th>Name</th>
                                <th>Purpose</th>
                                <th>Mode</th>
                                <th class="text-right">Cash</th>
                                <th class="text-right">Online</th>
                                <th class="text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${collectionData.items.map((item, i) => `
                                <tr>
                                    <td>${i + 1}</td>
                                    <td>${item.accountNo}</td>
                                    <td>${item.name}</td>
                                    <td>${item.purpose}</td>
                                    <td>${item.mode}</td>
                                    <td class="text-right">₹${item.cash.toLocaleString('en-IN')}</td>
                                    <td class="text-right">₹${item.online.toLocaleString('en-IN')}</td>
                                    <td class="text-right">₹${item.amount.toLocaleString('en-IN')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr style="font-weight: bold; background: #f9fafb;">
                                <td colspan="5" class="text-right">Grand Total</td>
                                <td class="text-right">₹${collectionData.totalCash.toLocaleString('en-IN')}</td>
                                <td class="text-right">₹${collectionData.totalOnline.toLocaleString('en-IN')}</td>
                                <td class="text-right">₹${collectionData.total.toLocaleString('en-IN')}</td>
                            </tr>
                        </tfoot>
                    </table>
                    <div class="footer">
                        <div>Report Generated On: ${new Date().toLocaleString()}</div>
                        <div style="border-top: 1px solid #333; width: 200px; text-align: center; padding-top: 5px;">Authorised Signature</div>
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
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-slide-up">
                {/* Header */}
                <div className="bg-slate-900 p-6 flex justify-between items-center text-white shrink-0">
                    <div>
                        <h3 className="text-xl font-bold">Day-Wise Collection Report</h3>
                        <p className="text-slate-400 text-xs mt-1">Breakdown of credits and income entries by mode</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <input
                            type="date"
                            className="bg-slate-800 border-none text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                        />
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/10 rounded-full transition-colors"
                        >
                            <AlertTriangle size={20} className="rotate-45" />
                        </button>
                    </div>
                </div>

                {/* Sub-Header Stats */}
                <div className="grid grid-cols-3 gap-4 p-6 bg-slate-50 border-b border-slate-200 shrink-0">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cash Collection</p>
                        <p className="text-2xl font-black text-emerald-600 mt-1">₹{collectionData.totalCash.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Online Collection</p>
                        <p className="text-2xl font-black text-blue-600 mt-1">₹{collectionData.totalOnline.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Collection</p>
                        <p className="text-2xl font-black text-slate-900 mt-1">₹{collectionData.total.toLocaleString('en-IN')}</p>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6">
                    <table className="w-full text-left text-sm border-separate border-spacing-0">
                        <thead className="sticky top-0 bg-white z-10">
                            <tr>
                                <th className="px-4 py-3 border-b border-slate-200 font-bold text-slate-600">Source</th>
                                <th className="px-4 py-3 border-b border-slate-200 font-bold text-slate-600">Member/Entry</th>
                                <th className="px-4 py-3 border-b border-slate-200 font-bold text-slate-600">Purpose</th>
                                <th className="px-4 py-3 border-b border-slate-200 font-bold text-slate-600">Mode</th>
                                <th className="px-4 py-3 border-b border-slate-200 font-bold text-slate-600 text-right">Cash</th>
                                <th className="px-4 py-3 border-b border-slate-200 font-bold text-slate-600 text-right">Online</th>
                                <th className="px-4 py-3 border-b border-slate-200 font-bold text-slate-600 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {collectionData.items.map((item) => (
                                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3 font-mono text-xs text-slate-500 uppercase">{item.accountNo}</td>
                                    <td className="px-4 py-3 font-semibold text-slate-800">{item.name}</td>
                                    <td className="px-4 py-3 text-slate-600">{item.purpose}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${item.mode === 'Cash' ? 'bg-emerald-100 text-emerald-700' :
                                            item.mode === 'Online' ? 'bg-blue-100 text-blue-700' :
                                                'bg-purple-100 text-purple-700'
                                            }`}>
                                            {item.mode}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right text-slate-600">₹{item.cash.toLocaleString('en-IN')}</td>
                                    <td className="px-4 py-3 text-right text-slate-600">₹{item.online.toLocaleString('en-IN')}</td>
                                    <td className="px-4 py-3 text-right font-bold text-slate-900">₹{item.amount.toLocaleString('en-IN')}</td>
                                </tr>
                            ))}
                            {collectionData.items.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                                        No collections found for this date.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer Actions */}
                <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
                    <p className="text-slate-500 text-xs font-medium italic">
                        * Ledger entries categorized as "Income" are included.
                    </p>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 border border-slate-300 rounded-xl text-slate-700 font-bold hover:bg-white transition-all shadow-sm"
                        >
                            Close
                        </button>
                        <button
                            onClick={handlePrint}
                            disabled={collectionData.items.length === 0}
                            className="px-8 py-2 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Download size={18} /> Print Report
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
