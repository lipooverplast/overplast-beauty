
import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Lock, Mail, Loader2, CheckCircle, AlertCircle, ShieldCheck, Key } from 'lucide-react';

const SecuritySettings: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({ email });
      if (error) throw error;
      setMessage({ type: 'success', text: 'Confirmation email sent to both old and new addresses. Please verify to complete the change.' });
      setEmail('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update email.' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    if (password.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }
    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMessage({ type: 'success', text: 'Security Key (Password) updated successfully.' });
      setPassword('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update password.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white p-10 rounded-[3.5rem] border border-gray-100 shadow-sm">
        <div className="flex items-center gap-4 mb-10">
          <div className="p-3 bg-black text-yellow-500 rounded-2xl shadow-lg">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Master Security Access</h3>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Update Admin Credentials & Encryption Keys</p>
          </div>
        </div>

        {message && (
          <div className={`p-6 rounded-2xl mb-8 flex items-center gap-4 animate-in zoom-in-95 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
            {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
            <p className="text-xs font-bold uppercase tracking-widest leading-relaxed">{message.text}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* Email Update */}
          <div className="space-y-6">
            <div>
              <h4 className="text-[11px] font-black text-gray-900 uppercase tracking-[0.3em] mb-2 flex items-center gap-2">
                <Mail size={14} className="text-yellow-600" /> Update Admin Email
              </h4>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed">Changing your email requires verification from both addresses.</p>
            </div>
            <form onSubmit={handleUpdateEmail} className="space-y-4">
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="new-admin@overplast.com"
                className="w-full px-6 py-4 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-yellow-50 font-bold transition-all"
              />
              <button 
                disabled={loading || !email}
                className="w-full py-4 bg-black text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-900 transition-all disabled:opacity-50 shadow-xl flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : 'Update Workplace Email'}
              </button>
            </form>
          </div>

          {/* Password Update */}
          <div className="space-y-6">
            <div>
              <h4 className="text-[11px] font-black text-gray-900 uppercase tracking-[0.3em] mb-2 flex items-center gap-2">
                <Key size={14} className="text-yellow-600" /> Update Security Key
              </h4>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed">Update your master password for dashboard access.</p>
            </div>
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-6 py-4 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-yellow-50 font-bold transition-all"
              />
              <button 
                disabled={loading || !password}
                className="w-full py-4 bg-yellow-500 text-black rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-yellow-600 transition-all disabled:opacity-50 shadow-xl flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : 'Update Security Key'}
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 p-8 rounded-[2.5rem] border border-gray-100 flex items-center gap-6 opacity-60">
        <div className="p-3 bg-white text-gray-400 rounded-xl shadow-sm">
          <ShieldCheck size={24} />
        </div>
        <div>
          <p className="text-[10px] font-black text-gray-900 uppercase tracking-widest mb-1">Security Protocol v2.5</p>
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed">All credential changes are logged and encrypted. Ensure you have access to your email before initiating a change.</p>
        </div>
      </div>
    </div>
  );
};

export default SecuritySettings;
