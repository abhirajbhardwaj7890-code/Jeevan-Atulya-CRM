import React, { useState } from 'react';
import { Branch, Agent, Member, Account, AppSettings, AccountType } from '../types';
import { MapPin, User, Briefcase, Phone, TrendingUp, Users, Plus, X, Building, CheckCircle, Pencil, Percent, DollarSign, Search } from 'lucide-react';

interface NetworkProps {
  branches: Branch[];
  agents: Agent[];
  members: Member[];
  accounts: Account[];
  settings: AppSettings;
  onAddBranch: (branch: Branch) => void;
  onAddAgent: (agent: Agent) => void;
}

export const Network: React.FC<NetworkProps> = ({ branches, agents, members, accounts, settings, onAddBranch, onAddAgent }) => {
  const [activeTab, setActiveTab] = useState<'branches' | 'agents'>('branches');
  
  // Wizard/Edit State
  const [showWizard, setShowWizard] = useState(false);
  const [wizardType, setWizardType] = useState<'Branch' | 'Agent'>('Branch');
  const [isEditing, setIsEditing] = useState(false);
  
  const [branchForm, setBranchForm] = useState({ id: '', name: '', location: '', managerName: '' });
  const [agentForm, setAgentForm] = useState({ id: '', memberId: '', name: '', phone: '', branchId: '', commissionFee: '' });

  const formatCurrency = (amount: number) => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  const handleOpenWizard = (type: 'Branch' | 'Agent') => {
      setWizardType(type);
      setIsEditing(false);
      setShowWizard(true);
      // Reset forms
      setBranchForm({ id: '', name: '', location: '', managerName: '' });
      setAgentForm({ 
          id: '', 
          memberId: '', 
          name: '', 
          phone: '', 
          branchId: branches.length > 0 ? branches[0].id : '', 
          commissionFee: settings.defaultAgentFee.toString() 
      });
  };

  const handleEditAgent = (agent: Agent) => {
      setWizardType('Agent');
      setIsEditing(true);
      setShowWizard(true);
      setAgentForm({
          id: agent.id,
          memberId: agent.memberId || '',
          name: agent.name,
          phone: agent.phone,
          branchId: agent.branchId,
          commissionFee: (agent.commissionFee ?? settings.defaultAgentFee).toString()
      });
  };

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (wizardType === 'Branch') {
          if (!branchForm.name || !branchForm.location) return;
          const newBranch: Branch = {
              id: branchForm.id || `BR-${Date.now()}`,
              name: branchForm.name,
              location: branchForm.location,
              managerName: branchForm.managerName || 'TBD'
          };
          onAddBranch(newBranch);
      } else {
          // AGENT LOGIC
          if (isEditing) {
              if (!agentForm.name || !agentForm.phone || !agentForm.branchId) return;
              const updatedAgent: Agent = {
                  id: agentForm.id,
                  memberId: agentForm.memberId,
                  name: agentForm.name,
                  phone: agentForm.phone,
                  branchId: agentForm.branchId,
                  commissionFee: parseFloat(agentForm.commissionFee) || 0,
                  status: 'Active',
                  activeMembers: 0, 
                  totalCollections: 0
              };
              onAddAgent(updatedAgent);
          } else {
              // Add New Agent Logic
              if (!agentForm.memberId || !agentForm.branchId) {
                  alert("Please select a Branch and enter a valid Member ID.");
                  return;
              }

              // 1. Verify Member ID
              const member = members.find(m => m.id === agentForm.memberId);
              if (!member) {
                  alert(`Member with ID "${agentForm.memberId}" not found. Please verify the ID.`);
                  return;
              }

              // 2. Check for Duplicates
              const existingAgent = agents.find(a => a.memberId === member.id);
              if (existingAgent) {
                  alert(`Member ${member.fullName} is already registered as an agent.`);
                  return;
              }

              // 3. Derive Info & Create
              const newAgent: Agent = {
                  id: `AG-${Date.now()}`,
                  memberId: member.id,
                  name: member.fullName,
                  phone: member.phone,
                  branchId: agentForm.branchId,
                  commissionFee: settings.defaultAgentFee, // Use default
                  status: 'Active',
                  activeMembers: 0,
                  totalCollections: 0
              };
              onAddAgent(newAgent);
          }
      }
      setShowWizard(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Network Management</h2>
          <p className="text-slate-500 text-sm">Oversee branches, field agents, and commissions.</p>
        </div>
        <div className="flex gap-2">
            <button 
                onClick={() => handleOpenWizard('Branch')} 
                className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-2"
            >
                <Plus size={16} /> Add Branch
            </button>
            <button 
                onClick={() => handleOpenWizard('Agent')} 
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2"
            >
                <Plus size={16} /> Add Agent
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
           onClick={() => setActiveTab('agents')}
           className={`pb-3 px-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'agents' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}
        >
          Agents ({agents.length})
        </button>
      </div>

      {activeTab === 'branches' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {branches.map(branch => {
            const branchMembers = members.filter(m => m.branchId === branch.id);
            const branchAgents = agents.filter(a => a.branchId === branch.id);
            
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
                        <span className="text-slate-500">Agents</span>
                        <span className="font-medium text-slate-900">{branchAgents.length}</span>
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

      {activeTab === 'agents' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agents.map(agent => {
                const branch = branches.find(b => b.id === agent.branchId);
                const assignedMembers = members.filter(m => m.agentId === agent.id);
                
                // NEW LOGIC: Commission based on Member Count
                const feePerMember = agent.commissionFee ?? settings.defaultAgentFee;
                const earnedCommission = assignedMembers.length * feePerMember;

                return (
                    <div key={agent.id} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow relative group">
                        <button 
                            onClick={() => handleEditAgent(agent)}
                            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-full opacity-0 group-hover:opacity-100 transition-all"
                            title="Edit Agent"
                        >
                            <Pencil size={16} />
                        </button>

                        <div className="flex items-start justify-between mb-4">
                           <div className="flex items-center gap-3">
                               <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 font-bold text-lg">
                                   {agent.name.charAt(0)}
                               </div>
                               <div>
                                   <h3 className="font-bold text-slate-900">{agent.name}</h3>
                                   <span className={`text-xs px-2 py-0.5 rounded-full ${agent.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                       {agent.status}
                                   </span>
                               </div>
                           </div>
                        </div>

                        <div className="space-y-3 mb-4">
                             <div className="flex items-center gap-2 text-sm text-slate-600">
                                 <User size={16} className="text-slate-400" />
                                 <span>ID: {agent.memberId || 'N/A'}</span>
                             </div>
                             <div className="flex items-center gap-2 text-sm text-slate-600">
                                 <Briefcase size={16} className="text-slate-400" />
                                 <span>{branch?.name || 'Unknown Branch'}</span>
                             </div>
                             <div className="flex items-center gap-2 text-sm text-slate-600">
                                 <Phone size={16} className="text-slate-400" />
                                 <span>{agent.phone}</span>
                             </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100">
                            <div className="text-center p-2 bg-slate-50 rounded-lg">
                                <p className="text-xs text-slate-500 mb-1 flex items-center justify-center gap-1"><Users size={12}/> Active Members</p>
                                <p className="font-bold text-slate-900">{assignedMembers.length}</p>
                            </div>
                            <div className="text-center p-2 bg-slate-50 rounded-lg">
                                <p className="text-xs text-slate-500 mb-1 flex items-center justify-center gap-1"><DollarSign size={12}/> Fee/Member</p>
                                <p className="font-bold text-slate-900">{formatCurrency(feePerMember)}</p>
                            </div>
                        </div>

                        <div className="mt-3 p-3 bg-indigo-50 rounded-lg flex justify-between items-center">
                            <div>
                                <p className="text-xs text-indigo-500 font-bold flex items-center gap-1">
                                    Total Commission Earned
                                </p>
                            </div>
                            <p className="font-bold text-indigo-700">{formatCurrency(earnedCommission)}</p>
                        </div>
                    </div>
                );
            })}
             {agents.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  No agents found.
              </div>
          )}
        </div>
      )}

      {/* Add/Edit Wizard Modal */}
      {showWizard && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl w-full max-w-md overflow-hidden animate-fade-in shadow-2xl">
                  <div className="bg-slate-900 px-6 py-4 flex justify-between items-center text-white">
                      <h3 className="font-bold flex items-center gap-2">
                          {wizardType === 'Branch' ? <Building size={18}/> : <User size={18}/>}
                          {isEditing ? 'Edit' : 'Add New'} {wizardType}
                      </h3>
                      <button onClick={() => setShowWizard(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                  </div>
                  
                  <form onSubmit={handleSubmit} className="p-6">
                      {!isEditing && (
                          <div className="flex gap-4 mb-6 p-1 bg-slate-100 rounded-lg">
                              <button 
                                type="button" 
                                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${wizardType === 'Branch' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}
                                onClick={() => setWizardType('Branch')}
                              >
                                  Branch
                              </button>
                              <button 
                                type="button" 
                                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${wizardType === 'Agent' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}
                                onClick={() => setWizardType('Agent')}
                              >
                                  Agent
                              </button>
                          </div>
                      )}

                      {wizardType === 'Branch' ? (
                          <div className="space-y-4">
                              <div>
                                  <label className="block text-xs font-bold text-slate-500 mb-1">Branch Name</label>
                                  <input 
                                      type="text" 
                                      className="w-full border border-slate-300 bg-white text-slate-900 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                      value={branchForm.name}
                                      onChange={(e) => setBranchForm({...branchForm, name: e.target.value})}
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
                                      onChange={(e) => setBranchForm({...branchForm, location: e.target.value})}
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
                                      onChange={(e) => setBranchForm({...branchForm, managerName: e.target.value})}
                                      placeholder="e.g. John Doe"
                                  />
                              </div>
                          </div>
                      ) : (
                          <div className="space-y-4">
                              {/* ADD NEW AGENT FORM */}
                              {!isEditing ? (
                                  <>
                                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800 mb-2">
                                          <p><strong>Note:</strong> Agent Name and Phone will be automatically retrieved from the Member record.</p>
                                      </div>
                                      <div>
                                          <label className="block text-xs font-bold text-slate-500 mb-1">Assign to Branch</label>
                                          <select 
                                              className="w-full border border-slate-300 bg-white text-slate-900 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                              value={agentForm.branchId}
                                              onChange={(e) => setAgentForm({...agentForm, branchId: e.target.value})}
                                              required
                                          >
                                              <option value="">Select Branch</option>
                                              {branches.map(b => (
                                                  <option key={b.id} value={b.id}>{b.name}</option>
                                              ))}
                                          </select>
                                          {branches.length === 0 && <p className="text-xs text-red-500 mt-1">Please create a branch first.</p>}
                                      </div>
                                      <div>
                                          <label className="block text-xs font-bold text-slate-500 mb-1">Member ID</label>
                                          <div className="relative">
                                              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                              <input 
                                                  type="text" 
                                                  className="w-full border border-slate-300 bg-white text-slate-900 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                                  value={agentForm.memberId}
                                                  onChange={(e) => setAgentForm({...agentForm, memberId: e.target.value})}
                                                  placeholder="Enter Member ID (e.g. 1001)"
                                                  required
                                              />
                                          </div>
                                      </div>
                                  </>
                              ) : (
                                  /* EDIT AGENT FORM (Full details) */
                                  <>
                                      <div>
                                          <label className="block text-xs font-bold text-slate-500 mb-1">Agent Name</label>
                                          <input 
                                              type="text" 
                                              className="w-full border border-slate-300 bg-white text-slate-900 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                              value={agentForm.name}
                                              onChange={(e) => setAgentForm({...agentForm, name: e.target.value})}
                                              placeholder="e.g. Agent Smith"
                                              required
                                          />
                                      </div>
                                      <div>
                                          <label className="block text-xs font-bold text-slate-500 mb-1">Member ID</label>
                                          <input 
                                              type="text" 
                                              className="w-full border border-slate-300 bg-white text-slate-900 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                              value={agentForm.memberId}
                                              onChange={(e) => setAgentForm({...agentForm, memberId: e.target.value})}
                                              placeholder="e.g. 1001"
                                          />
                                      </div>
                                      <div>
                                          <label className="block text-xs font-bold text-slate-500 mb-1">Phone Number</label>
                                          <input 
                                              type="tel" 
                                              className="w-full border border-slate-300 bg-white text-slate-900 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                              value={agentForm.phone}
                                              onChange={(e) => setAgentForm({...agentForm, phone: e.target.value})}
                                              placeholder="e.g. 9876543210"
                                              required
                                          />
                                      </div>
                                      <div>
                                          <label className="block text-xs font-bold text-slate-500 mb-1">Assign to Branch</label>
                                          <select 
                                              className="w-full border border-slate-300 bg-white text-slate-900 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                              value={agentForm.branchId}
                                              onChange={(e) => setAgentForm({...agentForm, branchId: e.target.value})}
                                              required
                                          >
                                              <option value="">Select Branch</option>
                                              {branches.map(b => (
                                                  <option key={b.id} value={b.id}>{b.name}</option>
                                              ))}
                                          </select>
                                      </div>
                                      <div>
                                          <label className="block text-xs font-bold text-slate-500 mb-1">Commission Fee (₹)</label>
                                          <input 
                                              type="number" step="0.1"
                                              className="w-full border border-slate-300 bg-white text-slate-900 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                              value={agentForm.commissionFee}
                                              onChange={(e) => setAgentForm({...agentForm, commissionFee: e.target.value})}
                                              placeholder={settings.defaultAgentFee.toString()}
                                          />
                                          <p className="text-[10px] text-slate-500 mt-1">Leave blank to use default (₹{settings.defaultAgentFee})</p>
                                      </div>
                                  </>
                              )}
                          </div>
                      )}

                      <div className="pt-6 flex gap-3">
                          <button type="button" onClick={() => setShowWizard(false)} className="flex-1 py-2.5 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 font-medium">Cancel</button>
                          <button type="submit" className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2">
                             <CheckCircle size={18}/> {isEditing ? 'Update' : 'Create'} {wizardType}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
};