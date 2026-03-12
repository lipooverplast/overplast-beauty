
import React, { useState } from 'react';
import { Plus, Search, User, Mail, Phone, MapPin, MoreVertical, X, Loader2, AlertCircle, Trash2, AlertTriangle, Edit, Eye } from 'lucide-react';
import { Client, UserRole, Invoice } from '../types';
import { db } from '../db';

interface ClientsProps {
  clients: Client[];
  invoices: Invoice[];
  onUpdate: () => void;
  onCreateInvoice?: (clientId: string) => void;
  role: UserRole;
}

const Clients: React.FC<ClientsProps> = ({ clients, invoices, onUpdate, onCreateInvoice, role }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [viewingClientDetails, setViewingClientDetails] = useState<Client | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Delete State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    
    const clientPayload: Client = {
      id: editingClient?.id || db.generateUUID(),
      name: formData.get('name') as string,
      phone: formData.get('phone') as string,
      address: formData.get('address') as string,
      doctorName: formData.get('doctorName') as string,
      hospitalName: formData.get('hospitalName') as string,
      doctorPhone: formData.get('doctorPhone') as string,
    };
    
    try {
      await db.saveClients([clientPayload]);
      onUpdate();
      setIsModalOpen(false);
      setEditingClient(null);
      alert(editingClient ? "Portfolio member updated successfully." : "Professional relationship established successfully.");
    } catch (err: any) {
      console.error("Client creation/update error:", err);
      const errorMsg = err.message || "Connectivity error. Ensure Supabase 'Repair Script' has been run in Settings.";
      setError(errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setError(null);
    setIsModalOpen(true);
  };

  const triggerDeleteConfirm = (e: React.MouseEvent, client: Client) => {
    e.preventDefault();
    e.stopPropagation();
    if (role !== 'Admin') {
      alert("Unauthorized: Only Administrators can remove clients.");
      return;
    }
    setClientToDelete(client);
    setShowDeleteConfirm(true);
  };

  const performDelete = async () => {
    if (!clientToDelete) return;
    const id = clientToDelete.id;
    setDeletingId(id);
    setShowDeleteConfirm(false);

    try {
      await db.deleteClient(id);
      await onUpdate();
      setClientToDelete(null);
    } catch (err: any) {
      console.error("Client deletion error:", err);
      alert("Failed to delete client: " + (err.message || "Database error"));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 w-full overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900 uppercase tracking-tighter">Clients Portfolio</h2>
          <p className="text-sm text-gray-600 font-medium italic">Your professional network and customer base.</p>
        </div>
        <button 
          onClick={() => { setEditingClient(null); setError(null); setIsModalOpen(true); }}
          className="flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all shadow-lg w-full sm:w-auto"
        >
          <Plus size={20} strokeWidth={3} />
          Add New Member
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {clients && clients.length > 0 ? clients.map(client => {
          const isDeleting = deletingId === client.id;
          const clientInvoices = invoices.filter(inv => inv.clientId === client.id);
          const totalOutstanding = clientInvoices.reduce((sum, inv) => {
            const paid = inv.paymentMethod === 'Cash' ? inv.total : (inv.paidAmount || 0);
            return sum + (inv.total - paid);
          }, 0);

          return (
            <div key={client.id} className="bg-white p-6 rounded-[2.5rem] border border-gray-200 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
              <div className="flex items-start justify-between mb-6">
                <div className="w-16 h-16 bg-blue-50 text-blue-700 rounded-2xl border border-blue-100 flex items-center justify-center font-black text-2xl group-hover:bg-black group-hover:text-white transition-all">
                  {(client.name || 'C')[0]}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {totalOutstanding > 0 && (
                    <div className="px-3 py-1 bg-red-50 text-red-600 rounded-lg text-[10px] font-black uppercase tracking-widest border border-red-100">
                      Credit: Rs. {totalOutstanding.toLocaleString()}
                    </div>
                  )}
                  <div className="flex gap-2">
                     <button 
                       onClick={() => setViewingClientDetails(client)}
                       className="p-3 text-gray-300 hover:text-black hover:bg-gray-50 rounded-xl transition-all"
                       title="View Details"
                     >
                       <Eye size={20} />
                     </button>
                     <button 
                       onClick={() => handleEdit(client)}
                       className="p-3 text-blue-300 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                       title="Edit Profile"
                     >
                       <Edit size={20} />
                     </button>
                     {role === 'Admin' && (
                        <button 
                          onClick={(e) => triggerDeleteConfirm(e, client)}
                          disabled={isDeleting}
                          className="p-3 text-red-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                          title="Delete Client"
                        >
                          {isDeleting ? <Loader2 size={20} className="animate-spin" /> : <Trash2 size={20} />}
                        </button>
                     )}
                  </div>
                </div>
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-1 truncate">{client.name}</h3>
              <p className="text-[10px] text-blue-600 font-black uppercase tracking-widest mb-6">Verified Client</p>
              
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-xs text-gray-600 font-bold">
                  <div className="p-2 bg-gray-50 rounded-lg text-gray-400"><Phone size={14} /></div>
                  <span>{client.phone || 'No Phone'}</span>
                </div>
                
                {/* New Medical Fields Display */}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Doctor</p>
                    <p className="text-[10px] font-bold text-gray-900 truncate">{client.doctorName || 'N/A'}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Hospital</p>
                    <p className="text-[10px] font-bold text-gray-900 truncate">{client.hospitalName || 'N/A'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 text-xs text-gray-600 font-bold">
                  <div className="p-2 bg-gray-50 rounded-lg text-gray-400 mt-0.5"><MapPin size={14} /></div>
                  <span className="flex-1 line-clamp-2">{client.address || 'No Address'}</span>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-gray-50 flex gap-2">
                <button className="flex-1 py-4 text-[10px] font-black uppercase tracking-widest bg-gray-50 text-gray-600 rounded-xl hover:bg-gray-100 transition-colors">History</button>
                <button 
                  onClick={() => onCreateInvoice?.(client.id)}
                  className="flex-1 py-4 text-[10px] font-black uppercase tracking-widest bg-black text-white rounded-xl hover:bg-gray-900 transition-all shadow-md"
                >
                  Invoice
                </button>
              </div>
            </div>
          );
        }) : (
          <div className="col-span-full py-24 text-center bg-white rounded-[3rem] border border-gray-200 border-dashed">
             <User size={48} className="mx-auto text-gray-200 mb-4" />
             <p className="text-xs font-black text-gray-400 uppercase tracking-widest">No clients found in portfolio</p>
          </div>
        )}
      </div>

      {/* Custom Deletion Confirmation Modal */}
      {showDeleteConfirm && clientToDelete && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden border border-red-100 animate-in zoom-in-95 duration-200">
            <div className="p-10 text-center">
               <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                  <AlertTriangle size={40} />
               </div>
               <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter mb-2">Terminate Profile</h3>
               <p className="text-sm text-gray-500 font-bold mb-8 leading-relaxed px-4">
                 Are you sure you want to permanently terminate <span className="text-red-600 font-black">"{clientToDelete.name}"</span>? All history associated with this portfolio entry will remain, but the profile will be purged.
               </p>
               
               <div className="flex flex-col gap-3">
                  <button 
                    onClick={performDelete}
                    className="w-full py-5 bg-red-600 text-white font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all shadow-xl shadow-red-900/10 flex items-center justify-center gap-2"
                  >
                    <Trash2 size={16} /> Yes, Purge Profile
                  </button>
                  <button 
                    onClick={() => { setShowDeleteConfirm(false); setClientToDelete(null); }}
                    className="w-full py-5 bg-gray-100 text-gray-600 font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all"
                  >
                    Abort Termination
                  </button>
               </div>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="bg-white w-full max-w-xl max-h-[90vh] rounded-[3rem] shadow-2xl overflow-hidden flex flex-col border border-gray-100 animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="text-xl font-black text-gray-900 uppercase tracking-tighter">
                {editingClient ? 'Update Portfolio Member' : 'Register New Portfolio Member'}
              </h3>
              <button onClick={() => { setIsModalOpen(false); setEditingClient(null); }} className="text-gray-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-xl transition-all">
                <X size={28} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-10 space-y-6">
              {error && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-700 text-xs font-bold animate-in shake duration-500">
                  <AlertCircle size={20} className="flex-shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Patient Name</label>
                <input required name="name" defaultValue={editingClient?.name} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-50 font-bold text-sm transition-all" placeholder="e.g. Ali Ahmed" />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Patient Mobile No</label>
                  <input required name="phone" defaultValue={editingClient?.phone} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-50 font-bold text-sm transition-all" placeholder="0321-XXXXXXX" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Doctor Name</label>
                  <input required name="doctorName" defaultValue={editingClient?.doctorName} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-50 font-bold text-sm transition-all" placeholder="Dr. Smith" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Doctor Mobile No</label>
                  <input required name="doctorPhone" defaultValue={editingClient?.doctorPhone} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-50 font-bold text-sm transition-all" placeholder="0300-XXXXXXX" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Hospital Name</label>
                <input required name="hospitalName" defaultValue={editingClient?.hospitalName} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-50 font-bold text-sm transition-all" placeholder="City Hospital" />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Patient Address</label>
                <textarea required name="address" rows={2} defaultValue={editingClient?.address} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-50 font-bold text-sm resize-none transition-all" placeholder="Complete address..." />
              </div>

              <button 
                type="submit" 
                disabled={isSaving}
                className="w-full py-6 bg-blue-700 text-white font-black rounded-[2rem] hover:bg-blue-800 transition-all shadow-xl shadow-blue-900/10 uppercase tracking-[0.2em] text-[10px] flex items-center justify-center gap-3 disabled:opacity-50 mt-4"
              >
                {isSaving ? <Loader2 className="animate-spin text-white" size={24} /> : (editingClient ? "Update Relationship" : "Establish Relationship")}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Full Detail View Modal */}
      {viewingClientDetails && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col border border-gray-100 animate-in zoom-in-95 duration-300">
            <div className="p-10 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 bg-black text-yellow-500 rounded-3xl flex items-center justify-center font-black text-2xl shadow-xl">
                  {viewingClientDetails.name[0]}
                </div>
                <div>
                  <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter leading-none">{viewingClientDetails.name}</h3>
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em] mt-2">Verified Portfolio Member</p>
                </div>
              </div>
              <button onClick={() => setViewingClientDetails(null)} className="text-gray-400 hover:text-red-600 p-3 hover:bg-red-50 rounded-2xl transition-all">
                <X size={32} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-12 space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Patient Mobile</p>
                  <p className="text-sm font-bold text-gray-900 flex items-center gap-3">
                    <Phone size={16} className="text-blue-500" /> {viewingClientDetails.phone || 'N/A'}
                  </p>
                </div>
              </div>

              <div className="p-8 bg-blue-50/50 rounded-[2.5rem] border border-blue-100 grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em]">Consulting Doctor</p>
                  <p className="text-sm font-black text-gray-900 uppercase tracking-tight">{viewingClientDetails.doctorName || 'N/A'}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em]">Doctor Contact</p>
                  <p className="text-sm font-black text-gray-900 tracking-widest">{viewingClientDetails.doctorPhone || 'N/A'}</p>
                </div>
                <div className="md:col-span-2 space-y-2">
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em]">Hospital / Clinic</p>
                  <p className="text-sm font-black text-gray-900 uppercase tracking-tight">{viewingClientDetails.hospitalName || 'N/A'}</p>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Registered Address</p>
                <div className="p-8 bg-gray-50 rounded-[2.5rem] border border-gray-100 flex items-start gap-4">
                  <MapPin size={20} className="text-gray-400 mt-1 flex-shrink-0" />
                  <p className="text-sm font-bold text-gray-600 leading-relaxed">{viewingClientDetails.address || 'No address registered.'}</p>
                </div>
              </div>

              <div className="pt-6 border-t border-gray-100 flex justify-between items-center opacity-40">
                <p className="text-[9px] font-black uppercase tracking-widest">Member ID: {viewingClientDetails.id}</p>
                <p className="text-[9px] font-black uppercase tracking-widest">Overplast Beauty Cloud v2.5</p>
              </div>
            </div>
            
            <div className="p-10 bg-gray-50/50 border-t border-gray-100">
              <button 
                onClick={() => setViewingClientDetails(null)}
                className="w-full py-5 bg-black text-white font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-gray-900 transition-all shadow-xl"
              >
                Dismiss Profile View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Clients;
