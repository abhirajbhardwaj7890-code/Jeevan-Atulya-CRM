import React, { useState, useMemo } from 'react';
import { LedgerEntry, Member } from '../types';
import { Plus, ArrowUpCircle, ArrowDownCircle, Search, Calendar, Save, Trash2, Download } from 'lucide-react';

interface AccountingProps {
    ledger: LedgerEntry[];
    members: Member[];
    onAddEntry: (entry: LedgerEntry) => void;
}

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(amount);
};

const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? dateStr : date.toLocaleDateString('en-GB');
};

export const Accounting: React.FC<AccountingProps> = ({ ledger, members, onAddEntry }) => {
    const [showModal, setShowModal] = useState(false);
    const [filterType, setFilterType] = useState<'All' | 'Income' | 'Expense'>('All');
    const [searchTerm, setSearchTerm] = useState('');

    const [form, setForm] = useState({
        description: '',
        amount: '',
        type: 'Expense',
        category: 'Rent',
        // Theoretically accounting entries are cash or bank, but for system consistency:
        cashAmount: '',
        onlineAmount: ''
    });

    const activeLedger = useMemo(() => {
        return ledger.filter(entry => {
            if (!entry.memberId) return true; // Internal society transactions always show
            const member = members.find(m => m.id === entry.memberId);
            return member ? member.status === 'Active' : true; // Only show if associated member is Active
        });
    }, [ledger, members]);

    const sortedLedger = useMemo(() => {
        return [...activeLedger].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [activeLedger]);

    const totalIncome = activeLedger.filter(l => l.type === 'Income').reduce((sum, l) => sum + l.amount, 0);
    const totalExpense = activeLedger.filter(l => l.type === 'Expense').reduce((sum, l) => sum + l.amount, 0);
    const netProfit = totalIncome - totalExpense;

    const categories = {
        Income: ['Service Charges', 'Interest Income', 'Commission', 'Penalties', 'Admission Fees', 'Other'],
        Expense: ['Rent', 'Electricity', 'Staff Salary', 'Maintenance', 'Office Supplies', 'Interest Paid', 'Marketing', 'Loan Disbursement', 'Other']
    };

    const filteredLedger = sortedLedger.filter(l => {
        const matchType = filterType === 'All' || l.type === filterType;
        const matchSearch = l.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
            l.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (l.memberId && l.memberId.toLowerCase().includes(searchTerm.toLowerCase()));
        return matchType && matchSearch;
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.amount || !form.description) return;

        const newEntry: LedgerEntry = {
            id: `LDG-${Date.now()}`,
            date: new Date().toISOString().split('T')[0],
            description: form.description,
            amount: parseFloat(form.amount),
            type: form.type as 'Income' | 'Expense',
            category: form.category,
            cashAmount: parseFloat(form.cashAmount) || 0,
            onlineAmount: parseFloat(form.onlineAmount) || 0,
        };

        onAddEntry(newEntry);
        setShowModal(false);
        setForm({ description: '', amount: '', type: 'Expense', category: 'Rent', cashAmount: '', onlineAmount: '' });
    };

    const handleExportCSV = () => {
        const headers = ['Date', 'ID', 'Description', 'Category', 'Type', 'Amount', 'Member ID'];
        const rows = filteredLedger.map(l => [formatDate(l.date), l.id, `"${l.description}"`, l.category, l.type, l.amount, l.memberId || '']);
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `society_ledger_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Society Accounting</h2>
                    <p className="text-slate-500 text-sm">Manage operational income and expenses.</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 flex items-center gap-2 text-sm font-medium shadow-sm"
                >
                    <Plus size={16} /> Add Entry
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-slate-500">Total Income</p>
                        <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(totalIncome)}</p>
                    </div>
                    <div className="p-3 bg-green-50 rounded-full text-green-600"><ArrowDownCircle size={24} /></div>
                </div>
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-slate-500">Total Expenses</p>
                        <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(totalExpense)}</p>
                    </div>
                    <div className="p-3 bg-red-50 rounded-full text-red-600"><ArrowUpCircle size={24} /></div>
                </div>
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-slate-500">Net Position</p>
                        <p className={`text-2xl font-bold mt-1 ${netProfit >= 0 ? 'text-slate-900' : 'text-red-600'}`}>{formatCurrency(netProfit)}</p>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-full text-blue-600"><Save size={24} /></div>
                </div>
            </div>

            {/* Ledger Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap gap-4 items-center justify-between">
                    <div className="flex gap-4 items-center">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="Search ledger (description, ID, member)..."
                                className="pl-9 pr-4 py-2 border border-slate-300 bg-white text-slate-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-80"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex bg-white rounded-lg border border-slate-300 p-1">
                            {['All', 'Income', 'Expense'].map(type => (
                                <button
                                    key={type}
                                    onClick={() => setFilterType(type as any)}
                                    className={`px-3 py-1 text-xs font-medium rounded ${filterType === type ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                                >
                                    {type}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button onClick={handleExportCSV} className="text-sm text-slate-600 hover:text-blue-600 flex items-center gap-2 font-medium px-3 py-2 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all">
                        <Download size={16} /> Export CSV
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-100 text-slate-600">
                            <tr>
                                <th className="px-6 py-3 font-semibold">Date</th>
                                <th className="px-6 py-3 font-semibold">Description</th>
                                <th className="px-6 py-3 font-semibold">Member</th>
                                <th className="px-6 py-3 font-semibold">Category</th>
                                <th className="px-6 py-3 font-semibold">Payment</th>
                                <th className="px-6 py-3 font-semibold text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredLedger.map(entry => (
                                <tr key={entry.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 text-slate-600 whitespace-nowrap">{formatDate(entry.date)}</td>
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-slate-900">{entry.description}</div>
                                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{entry.id}</div>
                                    </td>
                                    <td className="px-6 py-4 text-slate-600 font-mono">{entry.memberId || '-'}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${entry.type === 'Income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-800'
                                            }`}>
                                            {entry.category}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {entry.cashAmount! > 0 && entry.onlineAmount! > 0 ? (
                                            <div className="text-[10px] space-y-0.5">
                                                <div className="flex items-center gap-1"><span className="w-8 text-slate-400 uppercase">Cash:</span> <span className="font-bold text-slate-700">₹{entry.cashAmount}</span></div>
                                                <div className="flex items-center gap-1"><span className="w-8 text-slate-400 uppercase">Onl:</span> <span className="font-bold text-slate-700">₹{entry.onlineAmount}</span></div>
                                            </div>
                                        ) : entry.onlineAmount! > 0 ? (
                                            <div className="text-[10px] flex items-center gap-1 font-bold text-blue-600 uppercase tracking-tighter">
                                                Online {entry.utrNumber && <span className="text-slate-400 font-mono font-normal ml-1">[{entry.utrNumber}]</span>}
                                            </div>
                                        ) : (
                                            <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-tighter">Cash</div>
                                        )}
                                    </td>
                                    <td className={`px-6 py-4 text-right font-bold ${entry.type === 'Income' ? 'text-green-600' : 'text-red-900'}`}>
                                        {entry.type === 'Income' ? '+' : '-'} {formatCurrency(entry.amount)}
                                    </td>
                                </tr>
                            ))}
                            {filteredLedger.length === 0 && (
                                <tr><td colSpan={5} className="text-center py-8 text-slate-400">No ledger entries found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Entry Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in">
                        <div className="bg-slate-900 px-6 py-4 flex justify-between items-center text-white">
                            <h3 className="font-bold">Add Ledger Entry</h3>
                            <button onClick={() => setShowModal(false)}><Trash2 size={18} className="rotate-45" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Type</label>
                                    <select
                                        className="w-full border border-slate-300 bg-white text-slate-900 rounded-lg p-2 text-sm"
                                        value={form.type}
                                        onChange={(e) => {
                                            setForm({
                                                ...form,
                                                type: e.target.value,
                                                category: categories[e.target.value as 'Income' | 'Expense'][0]
                                            });
                                        }}
                                    >
                                        <option value="Expense">Expense</option>
                                        <option value="Income">Income</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Amount</label>
                                    <input
                                        type="number"
                                        className="w-full border border-slate-300 bg-white text-slate-900 rounded-lg p-2 text-sm"
                                        value={form.amount}
                                        onChange={(e) => setForm({ ...form, amount: e.target.value })}
                                        placeholder="0.00"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Category</label>
                                <select
                                    className="w-full border border-slate-300 bg-white text-slate-900 rounded-lg p-2 text-sm"
                                    value={form.category}
                                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                                >
                                    {categories[form.type as 'Income' | 'Expense'].map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Description</label>
                                <input
                                    type="text"
                                    className="w-full border border-slate-300 bg-white text-slate-900 rounded-lg p-2 text-sm"
                                    value={form.description}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    placeholder="Details of transaction"
                                    required
                                />
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 font-medium">Cancel</button>
                                <button type="submit" className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">Save Entry</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};