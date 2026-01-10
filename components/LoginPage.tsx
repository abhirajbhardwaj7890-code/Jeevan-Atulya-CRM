
import React, { useState } from 'react';
import { Shield, User, Key, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { UserRole } from '../types';
import { getSupabaseClient } from '../services/supabaseClient';

interface LoginPageProps {
  onLogin: (role: UserRole) => void;
}

// Map emails to roles
const EMAIL_ROLE_MAP: Record<string, UserRole> = {
  'admin@jeevanatulya.com': 'Admin',
  'staff@jeevanatulya.com': 'Staff'
};

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('Admin');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Determine email based on selected role
    const email = selectedRole === 'Admin' ? 'admin@jeevanatulya.com' : 'staff@jeevanatulya.com';

    try {
      const supabase = getSupabaseClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) {
        console.error('Auth error:', authError);
        setError('Invalid password. Please try again.');
        setIsLoading(false);
        return;
      }

      if (data.user) {
        // Derive role from email
        const role = EMAIL_ROLE_MAP[data.user.email || ''] || 'Staff';
        onLogin(role);
      }
    } catch (err: any) {
      console.error('Login failed:', err);
      setError('Connection error. Please check your internet.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-slate-900 p-8 text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4">
            J
          </div>
          <h1 className="text-2xl font-bold text-white">Jeevan Atulya</h1>
          <p className="text-slate-400 text-sm mt-1">Co-operative Society System</p>
        </div>

        <div className="p-8">
          <h2 className="text-xl font-bold text-slate-800 mb-6 text-center">System Login</h2>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4 flex items-center gap-2">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => { setSelectedRole('Admin'); setError(''); setPassword(''); }}
                className={`py-2 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-2 ${selectedRole === 'Admin' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Shield size={16} /> Admin
              </button>
              <button
                type="button"
                onClick={() => { setSelectedRole('Staff'); setError(''); setPassword(''); }}
                className={`py-2 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-2 ${selectedRole === 'Staff' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <User size={16} /> Staff
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {selectedRole} Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-slate-200 bg-white text-slate-900 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="Enter access code"
                  autoFocus
                  disabled={isLoading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Authenticating...
                </>
              ) : (
                <>
                  <Key size={18} /> Authenticate
                </>
              )}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-8">
            Secured by Supabase Auth. <br /> Unauthorized access is prohibited.
          </p>
        </div>
      </div>
    </div>
  );
};
