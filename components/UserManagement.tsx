
import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { Profile, UserRole, UserStatus } from '../types';
import { 
  Loader2, UserCheck, Shield, ShieldCheck, Mail, Clock, 
  RefreshCw, UserMinus, MoreVertical, Search, CheckCircle2,
  Ban, ShieldAlert, ArrowUpRight, ArrowDownRight
} from 'lucide-react';

const UserManagement: React.FC<{ onUpdate: () => void }> = ({ onUpdate }) => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    setLoading(true);
    const data = await db.getAllProfiles();
    setProfiles(data);
    setLoading(false);
  };

  const handleStatusToggle = async (id: string, currentStatus: UserStatus = 'Active') => {
    setIsUpdating(id);
    const newStatus: UserStatus = currentStatus === 'Active' ? 'Suspended' : 'Active';
    try {
      await db.updateUserStatus(id, newStatus);
      await fetchProfiles();
    } catch (err) {
      alert("Status update failed.");
    } finally {
      setIsUpdating(null);
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
      <div className="flex flex-col md:flex-row gap-6">
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
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
