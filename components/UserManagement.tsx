
import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { Profile, UserRole, UserStatus } from '../types';
import { 
  Loader2, UserCheck, Shield, ShieldCheck, Mail, Clock, 
  RefreshCw, UserMinus, MoreVertical, Search, CheckCircle2,
  Ban, ShieldAlert, ArrowUpRight, ArrowDownRight, Trash2, AlertTriangle,
  Key, Eye, Lock
} from 'lucide-react';

import { supabaseUrl } from '../supabaseClient';

const UserManagement: React.FC<{ onUpdate: () => void, onBackToDashboard?: () => void }> = ({ onUpdate, onBackToDashboard }) => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [userToDelete, setUserToDelete] = useState<Profile | null>(null);
  const [editingPassword, setEditingPassword] = useState<{ id: string, email: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    fetchProfiles();
  }, []);

  const [updateStatus, setUpdateStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchProfiles = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await db.getAllProfiles();
      setProfiles(data);
    } catch (err) {
      console.error("Fetch profiles error:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleStatusToggle = async (id: string, currentStatus: UserStatus = 'Active') => {
    setIsUpdating(id);
    const newStatus: UserStatus = currentStatus === 'Active' ? 'Suspended' : 'Active';
    try {
      await db.updateUserStatus(id, newStatus);
      await fetchProfiles(true);
    } catch (err) {
      console.error("Status update failed:", err);
    } finally {
      setIsUpdating(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setIsUpdating(userToDelete.id);
    try {
      await db.deleteProfile(userToDelete.id);
      await fetchProfiles(true);
      setShowDeleteConfirm(false);
      setUserToDelete(null);
    } catch (err) {
      console.error("Failed to delete user profile:", err);
    } finally {
      setIsUpdating(null);
    }
  };

  const handleUpdatePassword = async () => {
    if (!editingPassword || !newPassword) return;
    
    setUpdateStatus('loading');
    setErrorMessage(null);
    console.log(`Starting password update for user: ${editingPassword.id}`);
    
    try {
      // 1. Update the actual Auth password via our new server API FIRST
      console.log("Updating Auth password via Admin API...");
      const response = await fetch('/api/admin/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: editingPassword.id.trim(), 
          newPassword: newPassword.trim(),
          supabaseUrl: supabaseUrl
        })
      });

      const result = await response.json();
      console.log("Admin API Response:", result);
      
      if (!response.ok) {
        const error = new Error(result.error || "Failed to update Auth password");
        (error as any).details = result.details;
        throw error;
      }

      // 2. ONLY IF AUTH SUCCEEDS, update the record in the profiles table (for Admin view)
      console.log("Updating profile record in database...");
      await db.updateProfilePassword(editingPassword.id, newPassword);
      console.log("Profile record updated.");

      // Update local state immediately for instant feedback
      setProfiles(prev => prev.map(p => p.id === editingPassword.id ? { ...p, password: newPassword } : p));
      
      setUpdateStatus('success');
      
      // Trigger background refresh and parent update
      fetchProfiles(true);
      onUpdate();
      
      // Auto close after 2 seconds
      setTimeout(() => {
        setEditingPassword(null);
        setNewPassword('');
        setUpdateStatus('idle');
      }, 2000);

    } catch (err: any) {
      console.error("Password update error:", err);
      setUpdateStatus('error');
      const msg = err.message || "Failed to update password.";
      setErrorMessage(err.details ? `${msg} ${err.details}` : msg);
    }
  };

  const filteredProfiles = profiles.filter(p => 
    p.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-4">
        <Loader2 className="animate-spin text-yellow-600" size={40} />
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Retrieving Staff Ledger...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row gap-6 items-center">
        {onBackToDashboard && (
          <button 
            onClick={onBackToDashboard}
            className="px-6 py-4 bg-black text-white rounded-[1.25rem] font-black text-[10px] uppercase tracking-widest hover:bg-gray-900 transition-all shadow-xl flex items-center gap-2"
          >
            <ArrowUpRight size={14} className="text-yellow-500" /> Dashboard
          </button>
        )}
        <div className="relative flex-1 w-full flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Search staff by email..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-14 pr-6 py-4 bg-white border border-gray-200 rounded-[1.5rem] font-bold text-sm focus:ring-4 focus:ring-yellow-50 outline-none transition-all shadow-sm"
            />
          </div>
          <button 
            onClick={async () => {
              try {
                const res = await fetch('/api/admin/health');
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                const data = await res.json();
                if (data.status === 'ok' && data.config.serviceKeySet) {
                  alert("✅ Admin API is working and configured!");
                } else {
                  alert(`❌ Admin API issue: ${data.error || 'Configuration incomplete'}. Check Secrets.`);
                }
              } catch (err: any) {
                console.error("Admin API Health Check Failed:", err);
                alert(`❌ Could not reach Admin API: ${err.message || "Network Error"}. Ensure server is running.`);
              }
            }}
            className="px-6 py-4 bg-gray-100 text-gray-600 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest hover:bg-gray-200 transition-all flex items-center gap-2 whitespace-nowrap"
          >
            <ShieldCheck size={14} /> Check API
          </button>
        </div>
        <button onClick={fetchProfiles} className="p-4 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-all text-gray-400 hover:text-gray-900 shadow-sm">
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 border-b">
              <tr>
                <th className="px-8 py-6">Identity</th>
                <th className="px-8 py-6">Security Key</th>
                <th className="px-8 py-6">Designation</th>
                <th className="px-8 py-6 text-center">Status</th>
                <th className="px-8 py-6">Last Session</th>
                <th className="px-8 py-6 text-right">Admin Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredProfiles.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black border transition-all ${
                        p.role === 'Admin' ? 'bg-black text-yellow-500 border-black shadow-lg shadow-gray-100' : 'bg-gray-100 text-gray-400 border-gray-200'
                      }`}>
                        {p.email[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-black text-gray-900 mb-0.5">{p.email}</p>
                        <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-gray-400">
                           {p.status === 'Suspended' ? 'Restricted Access' : 'Verified Staff Member'}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                      <div className="bg-gray-50 px-3 py-2 rounded-xl border border-gray-100 flex items-center gap-3">
                        <Key size={14} className="text-yellow-600" />
                        <span className="text-xs font-mono font-bold text-gray-900">
                          {p.password || <span className="text-gray-300 italic font-normal">Awaiting Login...</span>}
                        </span>
                        <button 
                          onClick={() => { setEditingPassword({ id: p.id, email: p.email }); setNewPassword(p.password || ''); }}
                          className="p-1 hover:bg-white rounded-lg transition-all text-gray-400 hover:text-yellow-600"
                          title="Edit Password Record"
                        >
                          <RefreshCw size={12} />
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm ${
                      p.role === 'Admin' ? 'bg-black text-yellow-500 border-black' : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}>
                      {p.role}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-center">
                    <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                      p.status === 'Suspended' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-green-50 text-green-600 border-green-200'
                    }`}>
                      {p.status || 'Active'}
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
                      <Clock size={14} />
                      {p.last_login ? new Date(p.last_login).toLocaleTimeString() : 'Never'}
                    </div>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleStatusToggle(p.id, p.status)}
                        disabled={isUpdating === p.id}
                        title={p.status === 'Suspended' ? 'Unsuspend User' : 'Suspend User'}
                        className={`p-2.5 rounded-xl transition-all border ${
                          p.status === 'Suspended' ? 'bg-green-50 text-green-600 border-green-200' : 'bg-red-50 text-red-600 border-red-200'
                        }`}
                      >
                         {p.status === 'Suspended' ? <CheckCircle2 size={18} /> : <Ban size={18} />}
                      </button>
                      <button 
                        onClick={() => { setUserToDelete(p); setShowDeleteConfirm(true); }}
                        disabled={isUpdating === p.id}
                        title="Delete User Profile"
                        className="p-2.5 bg-white border border-red-100 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all shadow-sm"
                      >
                         <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && userToDelete && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden border border-red-100 animate-in zoom-in-95 duration-200">
            <div className="p-10 text-center">
               <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                  <AlertTriangle size={40} />
               </div>
               <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter mb-2">Delete Profile</h3>
               <p className="text-sm text-gray-500 font-bold mb-8 leading-relaxed px-4">
                 Are you sure you want to permanently delete the profile for <span className="text-red-600 font-black">"{userToDelete.email}"</span>? This action cannot be undone.
               </p>
               
               <div className="flex flex-col gap-3">
                  <button 
                    onClick={handleDeleteUser}
                    disabled={isUpdating === userToDelete.id}
                    className="w-full py-5 bg-red-600 text-white font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all shadow-xl shadow-red-900/10 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isUpdating === userToDelete.id ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />} 
                    Yes, Delete Profile
                  </button>
                  <button 
                    onClick={() => { setShowDeleteConfirm(false); setUserToDelete(null); }}
                    className="w-full py-5 bg-gray-100 text-gray-600 font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all"
                  >
                    Cancel
                  </button>
               </div>
            </div>
            <div className="p-4 bg-gray-50 border-t border-gray-100 text-center">
               <p className="text-[8px] font-black text-gray-400 uppercase tracking-[0.2em]">Security Protocol v2.5</p>
            </div>
          </div>
        </div>
      )}

      {/* Edit Password Modal */}
      {editingPassword && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden border border-yellow-100 animate-in zoom-in-95 duration-200">
            <div className="p-10">
               <div className="w-20 h-20 bg-yellow-50 text-yellow-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                  <Key size={40} />
               </div>
               <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter mb-2 text-center">Update Password</h3>
               <p className="text-sm text-gray-500 font-bold mb-8 text-center px-4">
                 Updating password record for <span className="text-yellow-600 font-black">"{editingPassword.email}"</span>.
               </p>
               
               <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">New Security Key</label>
                    <input 
                      type="text" 
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-yellow-50 transition-all"
                      placeholder="Enter new password..."
                    />
                  </div>

                  <div className="flex flex-col gap-3 pt-4">
                    {updateStatus === 'success' ? (
                      <div className="bg-emerald-50 text-emerald-600 p-6 rounded-2xl flex flex-col items-center gap-3 animate-in fade-in zoom-in duration-300">
                        <CheckCircle2 size={32} />
                        <p className="text-[10px] font-black uppercase tracking-widest text-center">Password Updated Successfully</p>
                      </div>
                    ) : (
                      <>
                        {updateStatus === 'error' && (
                          <div className="bg-red-50 text-red-600 p-4 rounded-2xl flex items-start gap-3 mb-2">
                            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                            <p className="text-[10px] font-bold leading-tight">{errorMessage}</p>
                          </div>
                        )}
                        <button 
                          onClick={handleUpdatePassword}
                          disabled={updateStatus === 'loading' || !newPassword}
                          className="w-full py-5 bg-black text-white font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-gray-900 transition-all shadow-xl flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {updateStatus === 'loading' ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />} 
                          Save New Password
                        </button>
                        <button 
                          onClick={() => { setEditingPassword(null); setNewPassword(''); setUpdateStatus('idle'); }}
                          disabled={updateStatus === 'loading'}
                          className="w-full py-5 bg-gray-100 text-gray-600 font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
               </div>
            </div>
            <div className="p-4 bg-yellow-50 border-t border-yellow-100 text-center">
               <p className="text-[8px] font-black text-yellow-700 uppercase tracking-[0.2em]">Note: This updates the record in Admin panel.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
