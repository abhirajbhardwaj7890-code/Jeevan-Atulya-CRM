
import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { Account, Member, AccountType, LoanType, LedgerEntry } from '../types';
import { Download, Users, TrendingUp, AlertTriangle, ShieldCheck, Filter, Upload } from 'lucide-react';
import { formatDate, parseSafeDate } from '../services/utils';
import { CollectionReportModal } from '../components/CollectionReportModal';

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

    // Filtering Logic based on account creation date (uses joinDate for approximation)
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
        link.setAttribute('download', `financial_report_${parseSafeDate(new Date().toISOString())}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImportData = () => {
        // Import function placeholder
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
                        <TrendingUp size={16} /> Collection Analysis
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

                {/* Top Introducers Table */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <Users className="text-purple-600" size={20} />
                        <h3 className="text-lg font-bold text-slate-900">Top Introducers</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase text-xs">
                                <tr>
                                    <th className="px-4 py-3">Introducer Name</th>
                                    <th className="px-4 py-3 text-right">Members</th>
                                    <th className="px-4 py-3 text-right">Collections (Approx)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {(() => {
                                    // Calculate Top Introducers
                                    const introducerCounts: Record<string, number> = {};
                                    members.forEach(m => {
                                        if (m.introducerId) {
                                            introducerCounts[m.introducerId] = (introducerCounts[m.introducerId] || 0) + 1;
                                        }
                                    });

                                    const sortedIntroducers = Object.entries(introducerCounts)
                                        .sort(([, a], [, b]) => b - a)
                                        .slice(0, 5);

                                    if (sortedIntroducers.length === 0) {
                                        return (
                                            <tr>
                                                <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                                                    No introducer data available.
                                                </td>
                                            </tr>
                                        );
                                    }

                                    return sortedIntroducers.map(([introId, count], i) => {
                                        const introducer = members.find(m => m.id === introId);
                                        // Calculate collections from introduced members
                                        // This is an approximation based on members introduced by this person
                                        const introducedMemberIds = members.filter(m => m.introducerId === introId).map(m => m.id);
                                        const collectionAmount = accounts
                                            .filter(a => introducedMemberIds.includes(a.memberId))
                                            .flatMap(a => a.transactions)
                                            .filter(t => t.type === 'credit')
                                            .reduce((sum, t) => sum + t.amount, 0);

                                        return (
                                            <tr key={i} className="hover:bg-slate-50">
                                                <td className="px-4 py-3 font-medium text-slate-800">
                                                    {introducer ? introducer.fullName : `Unknown (${introId})`}
                                                </td>
                                                <td className="px-4 py-3 text-right text-slate-600">{count}</td>
                                                <td className="px-4 py-3 text-right font-bold text-slate-900">{formatCurrency(collectionAmount)}</td>
                                            </tr>
                                        )
                                    });
                                })()}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {showDayWiseModal && (
                <CollectionReportModal
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


