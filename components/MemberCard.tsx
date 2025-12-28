
import React from 'react';
import { Member } from '../types';
import { Phone, Mail, Calendar, AlertTriangle, CheckSquare, Square, User, Clock } from 'lucide-react';
import { formatDate } from '../services/utils';

interface MemberCardProps {
  member: Member;
  onClick: () => void;
  selected?: boolean;
  onToggleSelect?: (e: React.MouseEvent) => void;
  selectionMode?: boolean;
  introducerName?: string;
  lastInteractionDate?: string;
}

export const MemberCard: React.FC<MemberCardProps> = ({ member, onClick, selected, onToggleSelect, selectionMode, introducerName, lastInteractionDate }) => {
  // Show checkbox if explicitly in selection mode, if the item is selected, or on hover
  const showCheckbox = selectionMode || selected || onToggleSelect;

  return (
    <div
      onClick={onClick}
      className={`bg-white border rounded-xl p-4 hover:shadow-lg transition-all cursor-pointer group relative ${selected ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50/10' : 'border-slate-200'}`}
    >
      {/* Selection Checkbox - Top Right */}
      {showCheckbox && (
        <div
          onClick={(e) => { e.stopPropagation(); if (onToggleSelect) onToggleSelect(e); }}
          className={`absolute top-4 right-4 z-20 text-slate-400 hover:text-blue-600 transition-colors ${!selected && !selectionMode ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}
        >
          {selected ? (
            <CheckSquare className="text-blue-600 fill-blue-50" size={24} />
          ) : (
            <Square size={24} />
          )}
        </div>
      )}

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img src={member.avatarUrl} alt={member.fullName} className="w-12 h-12 rounded-full object-cover border border-slate-100 shadow-sm" />
            <div className="absolute -bottom-1 -right-1 bg-blue-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full border-2 border-white shadow-sm">
              {member.id}
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 group-hover:text-blue-600">{member.fullName}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full ${member.status === 'Active' ? 'bg-green-100 text-green-700' : member.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
              {member.status}
            </span>
          </div>
        </div>

        {/* Risk Icon - shifted left slightly to not hit checkbox area */}
        {(member.riskScore || 0) > 70 && (
          <div className="text-amber-500 pr-12" title="High Risk Score">
            <AlertTriangle size={18} />
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2 text-sm text-slate-500">
        <div className="flex items-center gap-2">
          <Mail size={14} />
          <span className="truncate max-w-[180px]">{member.email}</span>
        </div>
        <div className="flex items-center gap-2">
          <Phone size={14} />
          <span>{member.phone}</span>
        </div>

        <div className="pt-2 mt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5" title="Introducer">
            <User size={12} className="text-slate-400" />
            <span className="truncate">{introducerName || 'Unassigned'}</span>
          </div>
          <div className="flex items-center gap-1.5" title="Last Interaction">
            <Clock size={12} className="text-slate-400" />
            <span className="truncate">{lastInteractionDate ? formatDate(lastInteractionDate) : 'No Activity'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
