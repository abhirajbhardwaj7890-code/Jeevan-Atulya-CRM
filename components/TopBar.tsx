import React, { useState } from 'react';
import { Bell, User, CheckCircle, AlertTriangle, Info, X, Shield } from 'lucide-react';
import { Notification, UserRole } from '../types';

interface TopBarProps {
  userRole: UserRole;
  notifications: Notification[];
  onMarkRead?: (id: string) => void;
}

const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? dateStr : date.toLocaleDateString('en-GB');
};

export const TopBar: React.FC<TopBarProps> = ({ userRole, notifications, onMarkRead }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="flex justify-end items-center gap-4 mb-4">
        <div className="relative">
            <button 
                onClick={() => setShowDropdown(!showDropdown)}
                className="p-2 bg-white border border-slate-200 rounded-full hover:bg-slate-50 text-slate-600 relative transition-all hover:shadow-sm"
                title="Notifications"
            >
                <Bell size={20} />
                {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
                )}
            </button>
            
            {showDropdown && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50 animate-fade-in">
                    <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
                        <h4 className="font-bold text-slate-900 text-sm">Notifications ({unreadCount})</h4>
                        <button onClick={() => setShowDropdown(false)}><X size={16} className="text-slate-400 hover:text-slate-600"/></button>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                        {notifications.length > 0 ? (
                            notifications.map(n => (
                                <div key={n.id} className={`p-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${!n.read ? 'bg-blue-50/30' : ''}`}>
                                    <div className="flex gap-3">
                                        <div className={`mt-1 flex-shrink-0 ${
                                            n.type === 'alert' ? 'text-red-500' : n.type === 'warning' ? 'text-amber-500' : 'text-blue-500'
                                        }`}>
                                            {n.type === 'alert' ? <AlertTriangle size={16} /> : n.type === 'warning' ? <Info size={16} /> : <CheckCircle size={16} />}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start">
                                                <p className={`text-xs font-bold ${!n.read ? 'text-slate-900' : 'text-slate-600'}`}>{n.title}</p>
                                                {(!n.read && onMarkRead) && (
                                                    <button onClick={() => onMarkRead(n.id)} className="text-[10px] text-blue-600 hover:underline">Mark Read</button>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">{n.message}</p>
                                            <p className="text-[10px] text-slate-400 mt-1">{formatDate(n.date)}</p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-8 text-center text-slate-400 text-xs">No notifications</div>
                        )}
                    </div>
                </div>
            )}
        </div>

        <div className="flex items-center gap-2 pl-4 border-l border-slate-200">
            <div className={`p-2 rounded-full ${userRole === 'Admin' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                {userRole === 'Admin' ? <Shield size={18} /> : <User size={18} />}
            </div>
            <div className="hidden sm:block">
                <p className="text-sm font-bold text-slate-900">{userRole}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Logged In</p>
            </div>
        </div>
    </div>
  );
};