import React, { useState, useMemo } from 'react';
import { Branch, Member, Account, AppSettings } from '../types';
import { MapPin, User, Briefcase, Phone, TrendingUp, Users, Plus, X, Building, CheckCircle, Pencil, Percent, DollarSign, Search } from 'lucide-react';

interface NetworkProps {
    branches: Branch[];
    members: Member[];
    accounts: Account[];
    settings: AppSettings;
    onAddBranch: (branch: Branch) => void;
}

export const Network: React.FC<NetworkProps> = ({ branches, members, accounts, settings, onAddBranch }) => {
    const [activeTab, setActiveTab] = useState<'branches' | 'introducers'>('branches');

    // Wizard State
    const [showWizard, setShowWizard] = useState(false);
    const [branchForm, setBranchForm] = useState({ id: '', name: '', location: '', managerName: '' });

    // Details State
    const [viewIntroducerId, setViewIntroducerId] = useState<string | null>(null);

    const formatCurrency = (amount: number) => {
        if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
        if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
        return `₹${amount.toLocaleString('en-IN')}`;
    };

    const handleOpenWizard = () => {
        setBranchForm({ id: '', name: '', location: '', managerName: '' });
        setShowWizard(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!branchForm.name || !branchForm.location) return;

        const newBranch: Branch = {
            id: branchForm.id || `BR-${Date.now()}`,
            name: branchForm.name,
            location: branchForm.location,
            managerName: branchForm.managerName || 'TBD'
        };
        onAddBranch(newBranch);
        setShowWizard(false);
    };

    // Derived Introducers Data
    const introducers = useMemo(() => {
        // Find all unique introducer IDs
        const introducerCounts = new Map<string, number>();
        members.forEach(m => {
            if (m.introducerId) {
                const count = introducerCounts.get(m.introducerId) || 0;
                introducerCounts.set(m.introducerId, count + 1);
            }
        });

        // Map to member objects with counts
        const result = [];
        for (const [id, count] of introducerCounts.entries()) {
            const member = members.find(m => m.id === id);
            if (member) {
                result.push({
                    member,
                    count,
                    commission: count * settings.defaultIntroducerFee
                });
            }
        }
        return result.sort((a, b) => b.count - a.count); // Sort by most referrals
    }, [members, settings.defaultIntroducerFee]);

    // Derived Statistics
    const totalIntroducers = introducers.length;
    const totalIntroducedMembers = members.filter(m => m.introducerId).length;

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Network Management</h2>
                    <p className="text-slate-500 text-sm">Oversee branches and member introducers.</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleOpenWizard}
                        className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-2"
                    >
                        <Plus size={16} /> Add Branch
                    </button>
                </div>
            </div>

            <div className="flex gap-4 border-b border-slate-200">
                <button
                    onClick={() => setActiveTab('branches')}
                    className={`pb-3 px-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'branches' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}
                >
                    Branches ({branches.length})
                </button>
                <button
                    onClick={() => setActiveTab('introducers')}
                    className={`pb-3 px-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'introducers' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}
                >
                    Introducers ({totalIntroducers})
                </button>
            </div>

            {activeTab === 'branches' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {branches.map(branch => {
                        const branchMembers = members.filter(m => m.branchId === branch.id);
                        // Calculate introducers in this branch
                        const branchIntroducers = introducers.filter(i => i.member.branchId === branch.id);

                        return (
                            <div key={branch.id} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
                                        <Briefcase size={24} />
                                    </div>
                                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">
                                        ID: {branch.id}
                                    </span>
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 mb-1">{branch.name}</h3>
                                <div className="flex items-center text-slate-500 text-sm mb-4">
                                    <MapPin size={14} className="mr-1" /> {branch.location}
                                </div>

                                <div className="space-y-3 pt-4 border-t border-slate-100">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Manager</span>
                                        <span className="font-medium text-slate-900">{branch.managerName}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Members</span>
                                        <span className="font-medium text-slate-900">{branchMembers.length}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Introducers</span>
                                        <span className="font-medium text-slate-900">{branchIntroducers.length}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {branches.length === 0 && (
                        <div className="col-span-full py-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                            No branches found. Add a branch to get started.
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'introducers' && (
                <div className="space-y-6">
                    {/* Summary Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-blue-50 p-4 rounded-lg flex items-center justify-between">
                            <div>
                                <p className="text-sm text-blue-600 font-medium">Total Introducers</p>
                                <p className="text-2xl font-bold text-blue-900">{totalIntroducers}</p>
                            </div>
                            <User className="text-blue-300" size={32} />
                        </div>
                        <div className="bg-indigo-50 p-4 rounded-lg flex items-center justify-between">
                            <div>
                                <p className="text-sm text-indigo-600 font-medium">Total Introduced Members</p>
                                <p className="text-2xl font-bold text-indigo-900">{totalIntroducedMembers}</p>
                            </div>
                            <Users className="text-indigo-300" size={32} />
                        </div>
                        <div className="bg-emerald-50 p-4 rounded-lg flex items-center justify-between">
                            <div>
                                <p className="text-sm text-emerald-600 font-medium">Est. Commission Paid</p>
                                <p className="text-2xl font-bold text-emerald-900">{formatCurrency(totalIntroducedMembers * settings.defaultIntroducerFee)}</p>
                            </div>
                            <DollarSign className="text-emerald-300" size={32} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {introducers.map(({ member, count, commission }) => {
                            const branch = branches.find(b => b.id === member.branchId);

                            return (
                                <div
                                    key={member.id}
                                    onClick={() => setViewIntroducerId(member.id)}
                                    className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow relative group cursor-pointer"
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            {member.avatarUrl ? (
                                                <img src={member.avatarUrl} alt={member.fullName} className="w-12 h-12 rounded-full object-cover" />
                                            ) : (
                                                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 font-bold text-lg">
                                                    {member.fullName.charAt(0)}
                                                </div>
                                            )}
                                            <div>
                                                <h3 className="font-bold text-slate-900">{member.fullName}</h3>
                                                <span className={`text-xs px-2 py-0.5 rounded-full ${member.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                                    {member.status}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-3 mb-4">
                                        <div className="flex items-center gap-2 text-sm text-slate-600">
                                            <User size={16} className="text-slate-400" />
                                            <span>ID: {member.id}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-slate-600">
                                            <Briefcase size={16} className="text-slate-400" />
                                            <span>{branch?.name || 'Unknown Branch'}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-slate-600">
                                            <Phone size={16} className="text-slate-400" />
                                            <span>{member.phone}</span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100">
                                        <div className="text-center p-2 bg-slate-50 rounded-lg">
                                            <p className="text-xs text-slate-500 mb-1 flex items-center justify-center gap-1"><Users size={12} /> Introduced</p>
                                            <p className="font-bold text-slate-900">{count}</p>
                                        </div>
                                        <div className="text-center p-2 bg-slate-50 rounded-lg">
                                            <p className="text-xs text-slate-500 mb-1 flex items-center justify-center gap-1"><DollarSign size={12} /> Commission</p>
                                            <p className="font-bold text-slate-900">{formatCurrency(commission)}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {introducers.length === 0 && (
                            <div className="col-span-full py-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                                No introducers found yet. When members introduce new members, they will appear here.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Branch Wizard Modal */}
            {showWizard && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl w-full max-w-md overflow-hidden animate-fade-in shadow-2xl">
                        <div className="bg-slate-900 px-6 py-4 flex justify-between items-center text-white">
                            <h3 className="font-bold flex items-center gap-2">
                                <Building size={18} /> Add New Branch
                            </h3>
                            <button onClick={() => setShowWizard(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Branch Name</label>
                                    <input
                                        type="text"
                                        className="w-full border border-slate-300 bg-white text-slate-900 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        value={branchForm.name}
                                        onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                                        placeholder="e.g. Downtown Hub"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Location / Address</label>
                                    <input
                                        type="text"
                                        className="w-full border border-slate-300 bg-white text-slate-900 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        value={branchForm.location}
                                        onChange={(e) => setBranchForm({ ...branchForm, location: e.target.value })}
                                        placeholder="e.g. 123 Main St, City"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Manager Name</label>
                                    <input
                                        type="text"
                                        className="w-full border border-slate-300 bg-white text-slate-900 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        value={branchForm.managerName}
                                        onChange={(e) => setBranchForm({ ...branchForm, managerName: e.target.value })}
                                        placeholder="e.g. John Doe"
                                    />
                                </div>
                            </div>

                            <div className="pt-6 flex gap-3">
                                <button type="button" onClick={() => setShowWizard(false)} className="flex-1 py-2.5 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 font-medium">Cancel</button>
                                <button type="submit" className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2">
                                    <CheckCircle size={18} /> Create Branch
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* View Introducer Members Modal */}
            {viewIntroducerId && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl w-full max-w-2xl overflow-hidden animate-fade-in shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="bg-slate-900 px-6 py-4 flex justify-between items-center text-white shrink-0">
                            <h3 className="font-bold flex items-center gap-2">
                                <Users size={18} />
                                Introduced Members by {members.find(m => m.id === viewIntroducerId)?.fullName}
                            </h3>
                            <button onClick={() => setViewIntroducerId(null)} className="text-slate-400 hover:text-white"><X size={20} /></button>
                        </div>

                        <div className="p-0 overflow-y-auto flex-1">
                            {members.filter(m => m.introducerId === viewIntroducerId).length > 0 ? (
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-slate-50 sticky top-0">
                                        <tr>
                                            <th className="p-4 text-xs font-bold text-slate-500 border-b">Member Name</th>
                                            <th className="p-4 text-xs font-bold text-slate-500 border-b">ID</th>
                                            <th className="p-4 text-xs font-bold text-slate-500 border-b">Phone</th>
                                            <th className="p-4 text-xs font-bold text-slate-500 border-b">Status</th>
                                            <th className="p-4 text-xs font-bold text-slate-500 border-b">Join Date</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {members.filter(m => m.introducerId === viewIntroducerId).map(member => (
                                            <tr key={member.id} className="border-b last:border-0 hover:bg-slate-50">
                                                <td className="p-4 text-sm font-bold text-slate-900">{member.fullName}</td>
                                                <td className="p-4 text-sm font-mono text-slate-600">{member.id}</td>
                                                <td className="p-4 text-sm text-slate-600">{member.phone}</td>
                                                <td className="p-4">
                                                    <span className={`text-xs px-2 py-1 rounded-full font-bold ${member.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                        {member.status}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-sm text-slate-600">{new Date(member.joinDate).toLocaleDateString('en-IN')}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="p-12 text-center text-slate-400">
                                    <Users size={48} className="mx-auto mb-4 opacity-20" />
                                    <p>No members introduced by this person yet.</p>
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t border-slate-100 bg-slate-50 shrink-0 flex justify-end">
                            <button onClick={() => setViewIntroducerId(null)} className="px-6 py-2 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};