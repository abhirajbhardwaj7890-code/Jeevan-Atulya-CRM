import React, { useState } from 'react';
import { MemberCard } from '../components/MemberCard';
import { Search, Filter, UserPlus, Download, Users, X, CheckSquare, Square, FileSpreadsheet } from 'lucide-react';
import { Member, UserRole, Interaction, MemberGroup, Branch, Account, AccountType } from '../types';
import * as XLSX from 'xlsx';
import { formatDate } from '../services/utils';

interface MembersProps {
  members: Member[];
  accounts: Account[];
  interactions?: Interaction[];
  userRole: UserRole;
  onSelectMember: (member: Member) => void;
  onAddNew: () => void;
  groups?: MemberGroup[];
  onUpdateGroup?: (group: MemberGroup) => void;
  onAddGroup?: (group: MemberGroup) => void;
  branches?: Branch[]; // Added branches prop
}

export const Members: React.FC<MembersProps> = ({
  members,
  accounts,
  interactions = [],
  userRole,
  onSelectMember,
  onAddNew,
  groups = [],
  onUpdateGroup,
  onAddGroup,
  branches = []
}) => {
  // Persistence Key
  const STORAGE_KEY = 'jeevan_atulya_members_filters';

  // Load initial state from storage or default
  const getInitialState = () => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
    return {
      search: '',
      searchMetric: 'Member ID',
      showFilters: false,
      statusFilter: 'All',
      branchFilter: 'All',
      riskFilter: false,
      dateStart: '',
      dateEnd: ''
    };
  };

  const initialState = getInitialState();

  const [search, setSearch] = useState(initialState.search);
  const [searchMetric, setSearchMetric] = useState<'All' | 'Name' | 'Member ID' | 'Phone' | 'Father Name'>(initialState.searchMetric);
  const [showFilters, setShowFilters] = useState(initialState.showFilters);

  // Advanced Filters State
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Suspended' | 'Pending'>(initialState.statusFilter);
  const [branchFilter, setBranchFilter] = useState<string>(initialState.branchFilter);
  const [riskFilter, setRiskFilter] = useState(initialState.riskFilter);
  const [dateStart, setDateStart] = useState(initialState.dateStart);
  const [dateEnd, setDateEnd] = useState(initialState.dateEnd);

  // Persist state on change
  React.useEffect(() => {
    const state = {
      search,
      searchMetric,
      showFilters,
      statusFilter,
      branchFilter,
      riskFilter,
      dateStart,
      dateEnd
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [search, searchMetric, showFilters, statusFilter, branchFilter, riskFilter, dateStart, dateEnd]);

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



  const [showGroupModal, setShowGroupModal] = useState(false);
  const [selectedGroupOption, setSelectedGroupOption] = useState<string>('');
  const [newGroupName, setNewGroupName] = useState('');

  const handleBulkAction = async (action: string) => {
    if (action === 'Export') {
      const selectedMembers = members.filter(m => selectedIds.has(m.id));

      const exportData = selectedMembers.map(m => {
        const memberAccounts = accounts.filter(a => a.memberId === m.id);

        // Find specific account balances
        const smAcc = memberAccounts.find(a => a.type === AccountType.SHARE_CAPITAL);
        const cdAcc = memberAccounts.find(a => a.type === AccountType.COMPULSORY_DEPOSIT);
        const odAcc = memberAccounts.find(a => a.type === AccountType.OPTIONAL_DEPOSIT);
        const activeLoans = memberAccounts.filter(a => a.type === AccountType.LOAN && a.status === 'Active');
        const activeRDs = memberAccounts.filter(a => a.type === AccountType.RECURRING_DEPOSIT && a.status === 'Active');
        const activeFDs = memberAccounts.filter(a => a.type === AccountType.FIXED_DEPOSIT && a.status === 'Active');

        const totalLoanBalance = activeLoans.reduce((sum, a) => sum + a.balance, 0);
        const totalRDBalance = activeRDs.reduce((sum, a) => sum + a.balance, 0);
        const totalFDBalance = activeFDs.reduce((sum, a) => sum + a.balance, 0);

        return {
          'Member ID': m.id,
          'Full Name': m.fullName,
          'Father Name': m.fatherName || '',
          'Phone': m.phone,
          'Status': m.status,
          'Join Date': formatDate(m.joinDate),
          'Branch': branches.find(b => b.id === m.branchId)?.name || m.branchId || 'Head Office',
          'Current Address': m.currentAddress || '',
          'Email': m.email || '',
          'Share Money (SM)': smAcc?.balance || 0,
          'Compulsory Deposit (CD)': cdAcc?.balance || 0,
          'Optional Deposit (OD)': odAcc?.balance || 0,
          'Total RD Balance': totalRDBalance,
          'Total FD Balance': totalFDBalance,
          'Total Loan Outstanding': totalLoanBalance,
          'Total Balance': (smAcc?.balance || 0) + (cdAcc?.balance || 0) + (odAcc?.balance || 0) + totalRDBalance + totalFDBalance,
          'Risk Score': m.riskScore || 0
        };
      });

      // Create Worksheet
      const ws = XLSX.utils.json_to_sheet(exportData);

      // Add styling (column widths)
      const wscols = [
        { wch: 12 }, // ID
        { wch: 25 }, // Name
        { wch: 20 }, // Father
        { wch: 15 }, // Phone
        { wch: 10 }, // Status
        { wch: 12 }, // Date
        { wch: 15 }, // Branch
        { wch: 30 }, // Address
        { wch: 20 }, // Email
        { wch: 15 }, // SM
        { wch: 15 }, // CD
        { wch: 15 }, // OD
        { wch: 15 }, // RD
        { wch: 15 }, // FD
        { wch: 15 }, // Loan
        { wch: 15 }, // Total
        { wch: 10 }, // Risk
      ];
      ws['!cols'] = wscols;

      // Create Workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Members");

      // Generate Download
      const fileName = `Members_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);

      setSelectedIds(new Set());
    } else if (action === 'Add to Group') {
      setShowGroupModal(true);
    }
  };

  const handleConfirmAddToGroup = () => {
    if (!onUpdateGroup || !onAddGroup) return;

    if (selectedGroupOption === 'new') {
      if (!newGroupName.trim()) {
        alert("Please enter a group name");
        return;
      }
      const newGroup: MemberGroup = {
        id: `GRP-${Date.now()}`,
        name: newGroupName,
        description: 'Created from Member Directory',
        memberIds: Array.from(selectedIds),
        createdAt: new Date().toISOString()
      };
      onAddGroup(newGroup);
    } else {
      const group = groups.find(g => g.id === selectedGroupOption);
      if (group) {
        const updatedGroup = {
          ...group,
          memberIds: Array.from(new Set([...group.memberIds, ...Array.from(selectedIds)]))
        };
        onUpdateGroup(updatedGroup);
      }
    }

    setShowGroupModal(false);
    setSelectedIds(new Set());
    setNewGroupName('');
    setSelectedGroupOption('');
  };

  const filtered = members
    .filter(m => {
      // Text Search (Name, Email, Phone, Address, Member ID)
      const searchLower = search.toLowerCase();
      let matchesSearch = false;

      if (searchMetric === 'All') {
        matchesSearch =
          m.fullName.toLowerCase().includes(searchLower) ||
          m.id.toLowerCase().includes(searchLower) ||
          m.email.toLowerCase().includes(searchLower) ||
          m.phone.includes(searchLower) ||
          (m.fatherName || '').toLowerCase().includes(searchLower) ||
          (m.currentAddress || '').toLowerCase().includes(searchLower) ||
          (m.permanentAddress || '').toLowerCase().includes(searchLower);
      } else if (searchMetric === 'Name') {
        matchesSearch = m.fullName.toLowerCase().includes(searchLower);
      } else if (searchMetric === 'Member ID') {
        matchesSearch = m.id.toLowerCase().includes(searchLower);
      } else if (searchMetric === 'Phone') {
        matchesSearch = m.phone.includes(searchLower);
      } else if (searchMetric === 'Father Name') {
        matchesSearch = (m.fatherName || '').toLowerCase().includes(searchLower);
      }

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
    })
    .sort((a, b) => {
      // Numerical sort by ID if possible, otherwise alphabetical
      const idA = parseInt(a.id.replace(/\D/g, '')) || 0;
      const idB = parseInt(b.id.replace(/\D/g, '')) || 0;
      if (idA !== idB) return idA - idB;
      return a.id.localeCompare(b.id);
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
            <select
              className="w-auto border border-slate-200 bg-white text-slate-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchMetric}
              onChange={(e) => setSearchMetric(e.target.value as any)}
            >
              <option value="All">All Fields</option>
              <option value="Name">Name</option>
              <option value="Member ID">ID</option>
              <option value="Phone">Phone</option>
              <option value="Father Name">Father Name</option>
            </select>
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search name, Member ID, phone..."
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
                {branches.map(b => (
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
                className="px-3 py-1.5 hover:bg-emerald-600 bg-emerald-700 rounded text-sm flex items-center gap-2 transition-colors font-bold"
              >
                <FileSpreadsheet size={16} /> Export Excel
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
          const introducerName = members.find(m => m.id === member.introducerId)?.fullName;
          const lastInteraction = interactions
            .filter(i => i.memberId === member.id)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

          return (
            <MemberCard
              key={member.id}
              member={member}
              introducerName={introducerName}
              lastInteractionDate={lastInteraction?.date}
              onClick={() => {
                // If in selection mode, clicking card toggles selection. Otherwise opens detail.
                if (selectionMode) {
                  const e = { stopPropagation: () => { } } as React.MouseEvent;
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
      {/* Add To Group Modal */}
      {
        showGroupModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-scale-in">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="font-bold text-lg text-slate-900">Add to Group</h3>
                <button
                  onClick={() => setShowGroupModal(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Select Group</label>
                  <select
                    className="w-full border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={selectedGroupOption}
                    onChange={e => setSelectedGroupOption(e.target.value)}
                  >
                    <option value="">-- Choose a Group --</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                    <option value="new">+ Create New Group</option>
                  </select>
                </div>

                {selectedGroupOption === 'new' && (
                  <div className="animate-fade-in">
                    <label className="block text-sm font-medium text-slate-700 mb-2">New Group Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Committee Members"
                      className="w-full border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                      value={newGroupName}
                      onChange={e => setNewGroupName(e.target.value)}
                      autoFocus
                    />
                  </div>
                )}

                <div className="pt-2 flex gap-2">
                  <button
                    onClick={() => setShowGroupModal(false)}
                    className="flex-1 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmAddToGroup}
                    disabled={!selectedGroupOption || (selectedGroupOption === 'new' && !newGroupName.trim())}
                    className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    Add Members
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }
    </div>
  );
};
