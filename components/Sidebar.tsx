
import React from 'react';
import { LayoutDashboard, Users, PieChart, Activity, Settings, LogOut, Shield, User, Network, Calculator, RefreshCw } from 'lucide-react';
import { UserRole } from '../types';

interface SidebarProps {
  activePage: string;
  userRole: UserRole;
  onNavigate: (page: string) => void;
  onSwitchRole: (role: UserRole) => void;
  onLogout: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ activePage, userRole, onNavigate, onSwitchRole, onLogout, onRefresh, isRefreshing }) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['Admin', 'Staff'] },
    { id: 'members', label: 'Members', icon: Users, roles: ['Admin', 'Staff'] },
    { id: 'groups', label: 'Groups', icon: Users, roles: ['Admin', 'Staff'] },
    { id: 'network', label: 'Branches & Introducers', icon: Network, roles: ['Admin', 'Staff'] },
    { id: 'accounts', label: 'All Accounts', icon: PieChart, roles: ['Admin'] }, // Restricted to Admin for global view
    { id: 'accounting', label: 'Accounting', icon: Calculator, roles: ['Admin', 'Staff'] },
    { id: 'reports', label: 'Reports', icon: Activity, roles: ['Admin'] }, // Restricted to Admin
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col h-screen fixed left-0 top-0 border-r border-slate-800 hidden md:flex">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
            J
          </div>
          Jeevan Atulya
        </h1>
        <p className="text-xs text-slate-500 mt-1">CO-OP Society System</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.filter(item => item.roles.includes(userRole)).map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive
                ? 'bg-blue-600 text-white'
                : 'hover:bg-slate-800 hover:text-white'
                }`}
            >
              <Icon size={20} />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800 space-y-4">
        <div className="bg-slate-800 p-3 rounded-lg">
          <p className="text-xs text-slate-500 uppercase font-bold mb-2">Current Access</p>
          <div className="flex items-center gap-2 text-sm text-white font-medium mb-1">
            {userRole === 'Admin' ? <Shield size={14} className="text-purple-400" /> : <User size={14} className="text-blue-400" />}
            {userRole} User
          </div>
        </div>

        <div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 mb-1 disabled:opacity-50"
            >
              <RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
              <span>{isRefreshing ? 'Syncing...' : 'Refresh Data'}</span>
            </button>
          )}

          {userRole === 'Admin' && (
            <button
              onClick={() => onNavigate('settings')}
              className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${activePage === 'settings' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <Settings size={20} />
              <span>Settings</span>
            </button>
          )}
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-red-900/20 hover:text-red-400 transition-colors text-slate-400 mt-1"
          >
            <LogOut size={20} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
