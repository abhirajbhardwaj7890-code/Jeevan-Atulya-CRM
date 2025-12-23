import React, { useState } from 'react';
import { MemberGroup, Member } from '../types';
import { Users, Plus, Trash2, Search, X, FolderOpen } from 'lucide-react';

interface GroupsProps {
    groups: MemberGroup[];
    members: Member[];
    onAddGroup: (group: MemberGroup) => void;
    onUpdateGroup: (group: MemberGroup) => void;
    onDeleteGroup: (groupId: string) => void;
}

export const Groups: React.FC<GroupsProps> = ({ groups, members, onAddGroup, onUpdateGroup, onDeleteGroup }) => {
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupDesc, setNewGroupDesc] = useState('');

    const selectedGroup = groups.find(g => g.id === selectedGroupId);

    const handleCreateGroup = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newGroupName.trim()) return;

        const newGroup: MemberGroup = {
            id: `GRP-${Date.now()}`,
            name: newGroupName,
            description: newGroupDesc,
            memberIds: [],
            createdAt: new Date().toISOString()
        };

        onAddGroup(newGroup);
        setNewGroupName('');
        setNewGroupDesc('');
        setShowCreateModal(false);
    };

    const handleRemoveMember = (memberId: string) => {
        if (!selectedGroup) return;
        const updatedGroup = {
            ...selectedGroup,
            memberIds: selectedGroup.memberIds.filter(id => id !== memberId)
        };
        onUpdateGroup(updatedGroup);
    };

    const getGroupMembers = (group: MemberGroup) => {
        return group.memberIds
            .map(id => members.find(m => m.id === id))
            .filter((m): m is Member => !!m);
    };

    return (
        <div className="space-y-6 animate-fade-in p-2">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Member Groups</h2>
                    <p className="text-slate-500 text-sm">Manage custom lists of members.</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 shadow-sm font-medium"
                >
                    <Plus size={18} /> Create Group
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-12rem)]">
                {/* Groups List */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-slate-100 bg-slate-50">
                        <h3 className="font-bold text-slate-700">Your Groups</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {groups.length === 0 ? (
                            <div className="text-center py-8 text-slate-400">
                                <FolderOpen size={32} className="mx-auto mb-2 opacity-50" />
                                <p>No groups created yet.</p>
                            </div>
                        ) : (
                            groups.map(group => (
                                <div
                                    key={group.id}
                                    onClick={() => setSelectedGroupId(group.id)}
                                    className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedGroupId === group.id
                                        ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                                        : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                                        }`}
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h4 className="font-bold text-slate-900">{group.name}</h4>
                                            <p className="text-xs text-slate-500 mt-1">{group.memberIds.length} members</p>
                                        </div>
                                        {selectedGroupId === group.id && (
                                            <div className="flex gap-2">
                                                {/* Add Edit later */}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Group Details */}
                <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col relative">
                    {selectedGroup ? (
                        <>
                            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                                <div>
                                    <h3 className="font-bold text-lg text-slate-900">{selectedGroup.name}</h3>
                                    {selectedGroup.description && <p className="text-sm text-slate-500">{selectedGroup.description}</p>}
                                </div>
                                <button
                                    onClick={() => {
                                        if (window.confirm('Are you sure you want to delete this group?')) {
                                            onDeleteGroup(selectedGroup.id);
                                            setSelectedGroupId(null);
                                        }
                                    }}
                                    className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"
                                    title="Delete Group"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4">
                                <div className="mb-4 text-sm text-slate-500 flex justify-between items-center">
                                    <span>Members in this group ({selectedGroup.memberIds.length})</span>
                                </div>

                                {selectedGroup.memberIds.length === 0 ? (
                                    <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                        <Users size={32} className="mx-auto mb-2 opacity-50" />
                                        <p>This group has no members.</p>
                                        <p className="text-xs mt-1">Go to Member Directory to add members.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {getGroupMembers(selectedGroup).map(member => (
                                            <div key={member.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:border-slate-300 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                                                        {member.fullName.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <div className="font-medium text-slate-900 text-sm">{member.fullName}</div>
                                                        <div className="text-xs text-slate-500">{member.id}</div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleRemoveMember(member.id)}
                                                    className="text-slate-400 hover:text-red-500 p-1"
                                                    title="Remove from group"
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                            <Users size={48} className="mb-4 opacity-20" />
                            <p className="text-lg font-medium">Select a group to view details</p>
                            <p className="text-sm">or create a new one to get started</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Create Group Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-scale-in">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-bold text-lg text-slate-900">Create New Group</h3>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleCreateGroup} className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Group Name</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Loan Defaulters, Committee"
                                    className="w-full border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={newGroupName}
                                    onChange={e => setNewGroupName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Description (Optional)</label>
                                <textarea
                                    rows={3}
                                    placeholder="What is this group for?"
                                    className="w-full border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                    value={newGroupDesc}
                                    onChange={e => setNewGroupDesc(e.target.value)}
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="flex-1 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                                >
                                    Create Group
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
