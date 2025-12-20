import React, { useState } from 'react';
import { MemberCard } from '../components/MemberCard';
import { Search, Filter, UserPlus, Download, Users, X, CheckSquare, Square } from 'lucide-react';
import { Member, UserRole, Agent, Interaction } from '../types';
import { MOCK_BRANCHES } from '../services/data';

interface MembersProps {
  members: Member[];
  agents?: Agent[];
  interactions?: Interaction[];
  userRole: UserRole;
  onSelectMember: (member: Member) => void;
  onAddNew: () => void;
}

export const Members: React.FC<MembersProps> = ({ members, agents = [], interactions = [], userRole, onSelectMember, onAddNew }) => {
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  
  // Advanced Filters State
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Suspended' | 'Pending'>('All');
  const [branchFilter, setBranchFilter] = useState<string>('All');
  const [riskFilter, setRiskFilter] = useState(false); // Only high risk
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');

  // Bulk Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Derived selection mode
  const selectionMode = selectedIds.size > 0;

  const toggleSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleBulkAction = async (action: string) => {
    if (action === 'Export') {
        alert(`Exporting ${selectedIds.size} members...`);
        setSelectedIds(new Set());
    } else if (action === 'Add to Group') {
        alert(`Adding ${selectedIds.size} members to group...`);
        setSelectedIds(new Set());
    }
  };

  const filtered = members.filter(m => {
    // Text Search (Name, Email, Phone, Address)
    const searchLower = search.toLowerCase();
    const matchesSearch = m.fullName.toLowerCase().includes(searchLower) || 
                          m.email.toLowerCase().includes(searchLower) ||
                          m.phone.includes(searchLower) ||
                          (m.currentAddress || '').toLowerCase().includes(searchLower) ||
                          (m.permanentAddress || '').toLowerCase().includes(searchLower);
    
    // Status Filter
    const matchesStatus = statusFilter === 'All' || m.status === statusFilter;

    // Branch Filter
    const matchesBranch = branchFilter === 'All' || m.branchId === branchFilter;

    // Risk Filter
    const matchesRisk = !riskFilter || (m.riskScore || 0) > 70;

    // Date Range Filter
    const memberDate = new Date(m.joinDate).getTime();
    const start = dateStart ? new Date(dateStart).getTime() : 0;
    const end = dateEnd ? new Date(dateEnd).getTime() : Infinity;
    const matchesDate = memberDate >= start && memberDate <= end;

    return matchesSearch && matchesStatus && matchesRisk && matchesDate && matchesBranch;
  });

  const handleSelectAll = () => {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(m => m.id)));
    }
  };

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Member Directory</h2>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-slate-500 text-sm">
                {filtered.length} members found 
              </p>
              {filtered.length > 0 && (
                <button 
                  onClick={handleSelectAll}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                  {allSelected ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>
          </div>
          
          <div className="flex gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Search name, phone, address..." 
                className="w-full pl-10 pr-4 py-2 border border-slate-200 bg-white text-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-2 border rounded-lg hover:bg-slate-50 text-slate-600 ${showFilters ? 'bg-slate-100 border-slate-300' : 'border-slate-200'}`}
            >
              <Filter size={18} />
            </button>
            <button 
              onClick={onAddNew}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 shadow-sm font-medium"
            >
              <UserPlus size={18} /> Onboard
            </button>
          </div>
        </div>

        {/* Extended Filters Panel */}
        {showFilters && (
          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-5 gap-4 animate-fade-in">
             <div>
               <label className="block text-xs font-bold text-slate-500 mb-1">Status</label>
               <select 
                 className="w-full border border-slate-200 bg-white text-slate-900 rounded p-2 text-sm"
                 value={statusFilter}
                 onChange={(e) => setStatusFilter(e.target.value as any)}
               >
                 <option value="All">All Statuses</option>
                 <option value="Active">Active</option>
                 <option value="Pending">Pending</option>
                 <option value="Suspended">Suspended</option>
               </select>
             </div>
             <div>
               <label className="block text-xs font-bold text-slate-500 mb-1">Branch</label>
               <select 
                 className="w-full border border-slate-200 bg-white text-slate-900 rounded p-2 text-sm"
                 value={branchFilter}
                 onChange={(e) => setBranchFilter(e.target.value as any)}
               >
                 <option value="All">All Branches</option>
                 {MOCK_BRANCHES.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                 ))}
               </select>
             </div>
             <div>
               <label className="block text-xs font-bold text-slate-500 mb-1">Join Date (From)</label>
               <input 
                 type="date" 
                 className="w-full border border-slate-200 bg-white text-slate-900 rounded p-2 text-sm"
                 value={dateStart}
                 onChange={(e) => setDateStart(e.target.value)}
               />
             </div>
             <div>
               <label className="block text-xs font-bold text-slate-500 mb-1">Join Date (To)</label>
               <input 
                 type="date" 
                 className="w-full border border-slate-200 bg-white text-slate-900 rounded p-2 text-sm"
                 value={dateEnd}
                 onChange={(e) => setDateEnd(e.target.value)}
               />
             </div>
             <div className="flex items-end">
               <label className="flex items-center gap-2 cursor-pointer bg-slate-50 hover:bg-slate-100 w-full p-2 rounded border border-slate-200">
                 <input 
                   type="checkbox" 
                   className="w-4 h-4 text-blue-600 rounded"
                   checked={riskFilter}
                   onChange={(e) => setRiskFilter(e.target.checked)}
                 />
                 <span className="text-sm font-medium text-slate-700">High Risk Only (&gt;70)</span>
               </label>
             </div>
          </div>
        )}

        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && (
          <div className="bg-slate-900 text-white p-3 rounded-lg flex items-center justify-between shadow-lg animate-fade-in">
             <span className="text-sm font-medium px-2">{selectedIds.size} members selected</span>
             <div className="flex gap-2">
                <button 
                  onClick={() => handleBulkAction('Export')}
                  className="px-3 py-1.5 hover:bg-slate-700 rounded text-sm flex items-center gap-2 transition-colors"
                >
                  <Download size={16} /> Export CSV
                </button>
                <button 
                   onClick={() => handleBulkAction('Add to Group')}
                   className="px-3 py-1.5 hover:bg-slate-700 rounded text-sm flex items-center gap-2 transition-colors"
                >
                  <Users size={16} /> Add to Group
                </button>
                
                <button 
                  onClick={() => setSelectedIds(new Set())}
                  className="px-2 py-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white ml-2"
                >
                  <X size={18} />
                </button>
             </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map(member => {
            // Find additional details
            const agentName = agents.find(a => a.id === member.agentId)?.name;
            const lastInteraction = interactions
                .filter(i => i.memberId === member.id)
                .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
            
            return (
              <MemberCard 
                key={member.id} 
                member={member} 
                agentName={agentName}
                lastInteractionDate={lastInteraction?.date}
                onClick={() => {
                  // If in selection mode, clicking card toggles selection. Otherwise opens detail.
                  if (selectionMode) {
                     const e = { stopPropagation: () => {} } as React.MouseEvent;
                     toggleSelection(member.id, e);
                  } else {
                     onSelectMember(member);
                  }
                }}
                selectionMode={selectionMode}
                selected={selectedIds.has(member.id)}
                onToggleSelect={(e) => toggleSelection(member.id, e)}
              />
            );
        })}
        {filtered.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                No members found matching your search.
            </div>
        )}
      </div>
    </div>
  );
};
