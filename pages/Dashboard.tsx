import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import { Users, Wallet, TrendingUp, AlertTriangle, CheckCircle, Clock, DollarSign, Briefcase, PiggyBank } from 'lucide-react';
import { Member, Account, Interaction, Notification, Branch } from '../types';

interface DashboardProps {
  members: Member[];
  accounts: Account[];
  interactions: Interaction[];
  systemNotifications?: Notification[];
  branches: Branch[];
}

const formatCurrency = (amount: number) => {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  return `₹${amount.toLocaleString('en-IN')}`;
};

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? dateStr : date.toLocaleDateString('en-GB');
};

export const Dashboard: React.FC<DashboardProps> = ({ members, accounts, interactions, branches }) => {
  const activeMembersList = members.filter(m => m.status === 'Active');
  const activeMemberIds = activeMembersList.map(m => m.id);

  const totalAssets = accounts.reduce((acc, curr) => (curr.type !== 'Loan' && curr.status === 'Active' && activeMemberIds.includes(curr.memberId)) ? acc + curr.balance : acc, 0);
  const totalLoans = accounts.filter(a => a.type === 'Loan' && a.status === 'Active' && activeMemberIds.includes(a.memberId)).reduce((acc, curr) => acc + curr.balance, 0);
  const activeMembers = activeMembersList.length;
  const highRiskMembers = activeMembersList.filter(m => (m.riskScore || 0) > 70).length;
  const avgRiskScore = activeMembers > 0
    ? Math.round(activeMembersList.reduce((acc, m) => acc + (m.riskScore || 0), 0) / activeMembers)
    : 0;

  const loanAccounts = accounts.filter(a => a.type === 'Loan' && a.status === 'Active' && activeMemberIds.includes(a.memberId));
  const avgLoanSize = loanAccounts.length > 0 ? totalLoans / loanAccounts.length : 0;

  // Real-time Loan Distribution
  const loanDistribution = [
    { name: 'Active Loans', value: loanAccounts.filter(a => a.status === 'Active').length },
    { name: 'Defaulted', value: loanAccounts.filter(a => a.status === 'Defaulted').length },
  ];

  // Derived Performance Data
  const defaultAmount = loanAccounts
    .filter(a => a.status === 'Defaulted')
    .reduce((sum, a) => sum + a.balance, 0);

  const allLoanTransactions = loanAccounts.flatMap(a => a.transactions);

  const totalRepayments = allLoanTransactions
    .filter(t => t.type === 'credit')
    .reduce((sum, t) => sum + t.amount, 0);

  // Approximating interest (simple logic: 20% of repayment is interest for dashboard viz)
  const interestCollected = totalRepayments * 0.2;
  const principalRepaid = totalRepayments * 0.8;

  const loanPerformance = [
    { name: 'Interest Collected', value: interestCollected },
    { name: 'Principal Repaid', value: principalRepaid },
    { name: 'Default Amount (Active)', value: defaultAmount }
  ];

  // Real Transaction Trends (Last 6 Months) - Only from Non-Pending accounts
  const recentTrends = useMemo(() => {
    const activeAccountIds = accounts.filter(a => a.status !== 'Pending').map(a => a.id);
    const allTxs = accounts.filter(a => activeAccountIds.includes(a.id)).flatMap(a => a.transactions);
    const today = new Date();
    const last6Months = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthKey = d.toISOString().slice(0, 7); // YYYY-MM
      const monthLabel = d.toLocaleString('default', { month: 'short' });

      const val = allTxs
        .filter(t => t.date.startsWith(monthKey))
        .reduce((sum, t) => sum + t.amount, 0);

      last6Months.push({ name: monthLabel, val });
    }
    return last6Months;
  }, [accounts]);

  const activityFeed = [
    ...interactions.slice(0, 3).map(i => ({
      id: i.id, type: 'interaction', title: `Interaction with ${members.find(m => m.id === i.memberId)?.fullName}`,
      desc: i.notes.substring(0, 60) + '...', date: i.date, icon: Users, color: 'text-blue-500 bg-blue-50'
    })),
    ...accounts
      .filter(a => a.status !== 'Pending')
      .flatMap(a => a.transactions.slice(0, 1).map(t => ({
        id: t.id, type: 'transaction', title: `${t.type === 'credit' ? 'Deposit' : 'Withdrawal'} - ${a.accountNumber}`,
        desc: `${t.description} (${formatCurrency(t.amount)})`, date: t.date, icon: DollarSign, color: t.type === 'credit' ? 'text-green-500 bg-green-50' : 'text-slate-500 bg-slate-50'
      }))).slice(0, 3)
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Branch Performance Calculation
  const branchPerformance = branches.map(branch => {
    const branchMembers = members.filter(m => m.branchId === branch.id);
    const memberIds = branchMembers.map(m => m.id);
    const assets = accounts.filter(a => memberIds.includes(a.memberId) && a.type !== 'Loan' && a.status === 'Active' && activeMemberIds.includes(a.memberId))
      .reduce((sum, a) => sum + a.balance, 0);
    return { ...branch, totalAssets: assets, members: branchMembers.filter(m => m.status === 'Active').length };
  }).sort((a, b) => b.totalAssets - a.totalAssets).slice(0, 5);

  const COLORS = ['#10B981', '#EF4444', '#94A3B8'];
  const PERF_COLORS = ['#3B82F6', '#10B981', '#EF4444'];

  const stats = [
    { label: 'Active Members', value: activeMembers, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', sub: `${members.length} Total` },
    { label: 'Total Deposits', value: formatCurrency(totalAssets), icon: Wallet, color: 'text-green-600', bg: 'bg-green-50', sub: 'Member Assets' },
    { label: 'Loan Book', value: formatCurrency(totalLoans), icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-50', sub: `${loanAccounts.length} Active Loans` },
    { label: 'Interest Earned', value: formatCurrency(interestCollected), icon: PiggyBank, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: 'Est. Revenue' },
    { label: 'Avg Loan Size', value: formatCurrency(avgLoanSize), icon: Briefcase, color: 'text-purple-600', bg: 'bg-purple-50', sub: 'Across Portfolio' },
    { label: 'Avg Risk Score', value: `${avgRiskScore}/100`, icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50', sub: avgRiskScore > 50 ? 'Moderate Risk' : 'Low Risk' },
    { label: 'Collection Rate', value: '98.5%', icon: CheckCircle, color: 'text-teal-600', bg: 'bg-teal-50', sub: 'Last 30 days' },
    { label: 'High Risk Members', value: highRiskMembers, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', sub: 'Requires Action' },
  ];

  return (
    <div className="space-y-6 animate-fade-in relative">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Executive Dashboard</h2>
          <p className="text-slate-500">Welcome back, Admin. System Status: <span className="text-green-600 font-bold">Healthy</span></p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-slate-500 hidden md:block">
            Last updated: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, idx) => (
          <div key={idx} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between hover:shadow-md transition-shadow">
            <div>
              <p className="text-sm font-medium text-slate-500">{stat.label}</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
              <p className="text-xs text-slate-400 mt-1">{stat.sub}</p>
            </div>
            <div className={`p-3 rounded-lg ${stat.bg}`}>
              <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-900">Transaction Volume Trend</h3>
            <select className="text-sm border border-slate-300 bg-white text-slate-900 rounded p-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option>Last 6 Months</option>
              <option>Year to Date</option>
            </select>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={recentTrends}>
                <defs>
                  <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => `₹${val / 1000}k`} />
                <Tooltip formatter={(val: number) => formatCurrency(val)} />
                <Area type="monotone" dataKey="val" stroke="#3B82F6" fillOpacity={1} fill="url(#colorVal)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Side Chart: Loan Performance Widget */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Loan Performance</h3>
          <p className="text-xs text-slate-500 mb-4">Real-time Interest Collection vs Defaults</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={loanPerformance} layout="vertical" margin={{ left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
                <Tooltip cursor={{ fill: 'transparent' }} formatter={(value: number) => formatCurrency(value)} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                  {loanPerformance.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PERF_COLORS[index]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500">Interest Collected</p>
              <p className="text-sm font-bold text-blue-600">{formatCurrency(interestCollected)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Default Amount</p>
              <p className="text-sm font-bold text-red-600">{formatCurrency(defaultAmount)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Feed */}
        <div className="lg:col-span-1 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Member Activity Feed</h3>
          <div className="space-y-4">
            {activityFeed.map(item => (
              <div key={item.id} className="flex gap-4 items-start">
                <div className={`p-2 rounded-full flex-shrink-0 ${item.color}`}>
                  <item.icon size={16} />
                </div>
                <div className="flex-1 border-b border-slate-50 pb-3">
                  <div className="flex justify-between">
                    <p className="text-sm font-bold text-slate-800">{item.title}</p>
                    <span className="text-xs text-slate-400 flex items-center gap-1"><Clock size={10} /> {formatDate(item.date)}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{item.desc}</p>
                </div>
              </div>
            ))}
            {activityFeed.length === 0 && <p className="text-sm text-slate-400 italic">No recent activity.</p>}
          </div>
        </div>

        {/* Top Branches */}
        <div className="lg:col-span-1 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Top Branches</h3>
          <div className="space-y-4">
            {branchPerformance.map((branch, idx) => (
              <div key={branch.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${idx < 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                    {idx + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{branch.name}</p>
                    <p className="text-xs text-slate-500">{branch.members} Members</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-slate-700">{formatCurrency(branch.totalAssets)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Chart */}
        <div className="lg:col-span-1 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Portfolio Risk</h3>
          <div className="h-64 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={loanDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {loanDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
              <span className="text-3xl font-bold text-slate-900">
                {loanAccounts.length > 0 ? ((loanDistribution[1].value / loanAccounts.length) * 100).toFixed(1) : 0}%
              </span>
              <span className="text-xs text-slate-500">Default Rate</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};