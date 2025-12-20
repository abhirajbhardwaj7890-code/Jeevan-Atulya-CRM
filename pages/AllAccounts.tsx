import React, { useState } from 'react';
import { Account, Member, AccountType, AccountStatus } from '../types';
import { Search, Filter, ArrowUpRight, ArrowDownLeft, AlertCircle } from 'lucide-react';

interface AllAccountsProps {
  accounts: Account[];
  members: Member[];
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

export const AllAccounts: React.FC<AllAccountsProps> = ({ accounts, members }) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  const getMemberName = (id: string) => members.find(m => m.id === id)?.fullName || 'Unknown';

  const filteredAccounts = accounts.filter(acc => {
    const memberName = getMemberName(acc.memberId).toLowerCase();
    const matchesSearch = acc.accountNumber.toLowerCase().includes(search.toLowerCase()) || 
                          memberName.includes(search.toLowerCase());
    const matchesType = typeFilter === 'All' || acc.type === typeFilter;
    const matchesStatus = statusFilter === 'All' || acc.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">All Financial Accounts</h2>
          <p className="text-slate-500 text-sm">Manage and monitor all member accounts.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search by name or account #" 
              className="w-full pl-10 pr-4 py-2 border border-slate-200 bg-white text-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select 
            className="border border-slate-200 rounded-lg p-2 text-sm bg-white text-slate-900"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="All">All Types</option>
            {Object.values(AccountType).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select 
            className="border border-slate-200 rounded-lg p-2 text-sm bg-white text-slate-900"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All">All Statuses</option>
            {Object.values(AccountStatus).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-700">Account Details</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Member</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-right">Balance</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Status</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Last Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAccounts.map(acc => {
                 const isLoan = acc.type === AccountType.LOAN;
                 return (
                  <tr key={acc.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-900">{acc.accountNumber}</span>
                        <span className="text-xs text-slate-500">{acc.type} {acc.loanType ? `(${acc.loanType})` : ''}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-slate-700 font-medium">{getMemberName(acc.memberId)}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`font-bold ${isLoan ? 'text-slate-900' : 'text-slate-900'}`}>
                        {formatCurrency(acc.balance)}
                      </span>
                      {isLoan && <span className="block text-xs text-slate-400">Outstanding</span>}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        acc.status === 'Active' ? 'bg-green-100 text-green-800' :
                        acc.status === 'Defaulted' ? 'bg-red-100 text-red-800' :
                        'bg-slate-100 text-slate-800'
                      }`}>
                        {acc.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      {acc.transactions.length > 0 ? (
                        <div className="flex items-center gap-1">
                          {acc.transactions[0].type === 'credit' ? <ArrowDownLeft size={14} className="text-green-500" /> : <ArrowUpRight size={14} className="text-slate-500" />}
                          {formatDate(acc.transactions[0].date)}
                        </div>
                      ) : 'No activity'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredAccounts.length === 0 && (
            <div className="p-8 text-center text-slate-500 flex flex-col items-center">
                <AlertCircle className="mb-2 text-slate-300" size={32} />
                No accounts found matching your filters.
            </div>
        )}
      </div>
    </div>
  );
};