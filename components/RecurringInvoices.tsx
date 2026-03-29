
import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Repeat, Calendar, MoreVertical, X, Play, Pause, Trash2, 
  Loader2, CheckCircle, Sparkles, AlertTriangle, Eye, Printer, Download, 
  MapPin, Phone, FileText 
} from 'lucide-react';
import { RecurringInvoice, Product, Client, InvoiceItem, Frequency, UserRole } from '../types';
import { db } from '../db';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { APP_LOGO_URL, APP_NAME } from '../constants';

const RecurringLogo = () => (
  <div className="flex items-center gap-4">
    <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center p-2 shadow-lg border border-gray-100">
      <img 
        src={APP_LOGO_URL} 
        alt={APP_NAME} 
        className="w-full h-full object-contain" 
        referrerPolicy="no-referrer"
        onError={(e) => {
          e.currentTarget.src = "https://picsum.photos/seed/overplast/200/200";
        }}
      />
    </div>
    <div className="flex flex-col">
        <h1 className="text-3xl font-black tracking-tighter text-gray-900 leading-none uppercase">OVERPLAST</h1>
        <p className="font-beauty text-xl text-gray-800 italic -mt-1 leading-none">Beauty</p>
        <p className="text-[7px] font-black text-yellow-600 uppercase tracking-widest mt-1">Cloud Base Management System</p>
        <div className="mt-2 space-y-0.5 border-t border-gray-100 pt-1">
          <p className="text-[7px] font-bold text-gray-400 uppercase tracking-tight">341-F, Johar Town, Lahore, PK</p>
          <p className="text-[7px] font-bold text-gray-400 uppercase tracking-tight">Ph: +92 301 844 4449</p>
          <p className="text-[7px] font-bold text-gray-400 lowercase tracking-tight">Email: care@overplast.org</p>
        </div>
    </div>
  </div>
);

interface RecurringInvoicesProps {
  products: Product[];
  clients: Client[];
  onUpdate: () => void;
  role: UserRole;
  userId?: string;
}

const RecurringInvoices: React.FC<RecurringInvoicesProps> = ({ products, clients, onUpdate, role, userId }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [recurringInvoices, setRecurringInvoices] = useState<RecurringInvoice[]>([]);
  const [selectedItems, setSelectedItems] = useState<InvoiceItem[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('Monthly');
  const [taxRate, setTaxRate] = useState(0);
  const [discountRate, setDiscountRate] = useState(0);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeAssetId, setActiveAssetId] = useState('');
  const [assetSearchTerm, setAssetSearchTerm] = useState('');
  
  // Detail & Export State
  const [viewingRecurring, setViewingRecurring] = useState<RecurringInvoice | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Delete State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [idToDelete, setIdToDelete] = useState<string | null>(null);

  useEffect(() => {
    fetchRecurring();
  }, [userId, role]);

  const fetchRecurring = async () => {
    const data = await db.getRecurringInvoices(role === 'Admin' ? undefined : userId);
    setRecurringInvoices(data || []);
  };

  useEffect(() => {
    if (isModalOpen) {
      setActiveAssetId('');
      setAssetSearchTerm('');
    }
  }, [isModalOpen]);

  const calculateSubtotal = () => selectedItems.reduce((sum, item) => sum + item.total, 0);

  const addItem = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const existing = selectedItems.find(item => item.productId === productId);
    if (existing) {
      setSelectedItems(selectedItems.map(item => 
        item.productId === productId ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.tp } : item
      ));
    } else {
      const tp = product.tp || 0;
      const mrp = product.mrp || 0;
      setSelectedItems([...selectedItems, {
        productId: product.id,
        name: product.name,
        size: product.size,
        quantity: 1,
        price: tp,
        mrp: mrp,
        tp: tp,
        total: tp,
        discount: parseFloat((((mrp - tp) / Math.max(mrp, 1)) * 100).toFixed(1))
      }]);
    }
  };

  const removeItem = (productId: string) => {
    setSelectedItems(selectedItems.filter(i => i.productId !== productId));
  };

  const handleCreateRecurring = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    
    const client = clients.find(c => c.id === selectedClientId);
    if (!client) {
      alert("Please select a client.");
      return;
    }
    if (selectedItems.length === 0) {
      alert("Please add at least one product to the template.");
      return;
    }

    setIsSaving(true);
    const subtotalValue = calculateSubtotal();
    const discountTotal = subtotalValue * (discountRate / 100);
    const taxTotal = (subtotalValue - discountTotal) * (taxRate / 100);
    const grandTotal = subtotalValue - discountTotal + taxTotal;
    
    const newRecurring: RecurringInvoice = {
      id: db.generateUUID(), 
      clientId: client.id,
      clientName: client.name,
      items: selectedItems,
      subtotal: subtotalValue,
      discountRate,
      discountTotal,
      taxRate,
      taxTotal,
      total: grandTotal,
      frequency,
      startDate,
      nextRunDate: startDate,
      status: 'Active',
      createdBy: userId,
    };

    try {
      await db.saveRecurringInvoices([newRecurring]);
      await fetchRecurring();
      onUpdate();
      
      setIsModalOpen(false);
      setSelectedItems([]);
      setSelectedClientId('');
      setActiveAssetId('');
    } catch (err: any) {
      console.error("Failed to save recurring invoice:", err);
      alert("System Error: " + (err.message || "Please run Repair Script in Settings."));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStatus = async (id: string) => {
    const riToUpdate = recurringInvoices.find(ri => ri.id === id);
    if (!riToUpdate) return;

    const updatedRI = { 
      ...riToUpdate, 
      status: (riToUpdate.status === 'Active' ? 'Paused' : 'Active') as any 
    };

    try {
      await db.saveRecurringInvoices([updatedRI]);
      await fetchRecurring();
    } catch (err) {
      alert("Status update failed.");
    }
  };

  const triggerDeleteConfirm = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (role !== 'Admin') {
      alert("Unauthorized: Only Administrators can terminate recurring cycles.");
      return;
    }
    setIdToDelete(id);
    setShowDeleteConfirm(true);
  };

  const performDelete = async () => {
    if (!idToDelete || role !== 'Admin') return;
    const targetId = idToDelete;
    setShowDeleteConfirm(false);
    setIdToDelete(null);
    setRecurringInvoices(prev => prev.filter(ri => ri.id !== targetId));
    try {
      await db.deleteRecurringInvoice(targetId);
      onUpdate();
    } catch (err: any) {
      console.error("Failed to delete recurring invoice:", err);
      fetchRecurring();
      alert("Deletion failed: " + (err.message || "Database error"));
    }
  };

  const exportToPdf = async () => {
    if (!viewingRecurring) return;
    setIsGeneratingPdf(true);
    const element = document.getElementById('printable-recurring-area');
    if (!element) {
      alert("Error: Print area not found.");
      setIsGeneratingPdf(false);
      return;
    }

    try {
      await new Promise(r => setTimeout(r, 300));
      const canvas = await html2canvas(element, { 
        scale: 2, 
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 1000 
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Overplast_Subscription_${viewingRecurring.clientName}.pdf`);
    } catch (err) {
      console.error(err);
      alert("PDF Generation Failed.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const viewingClient = viewingRecurring ? clients.find(c => c.id === viewingRecurring.clientId) : null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Recurring Ledger</h2>
          <p className="text-sm text-gray-500 font-medium italic">Automate regular billing cycles for verified clients.</p>
        </div>
        <button 
          onClick={() => {
            setSelectedItems([]);
            setSelectedClientId('');
            setActiveAssetId('');
            setIsModalOpen(true);
          }}
          className="flex items-center justify-center gap-2 bg-indigo-700 hover:bg-indigo-800 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all shadow-xl"
        >
          <Plus size={20} strokeWidth={3} />
          Create New Schedule
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {recurringInvoices.map(ri => (
          <div key={ri.id} className="bg-white p-8 rounded-[2.5rem] border border-gray-200 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
            <div className={`absolute top-0 right-0 w-2 h-full ${ri.status === 'Active' ? 'bg-green-500' : 'bg-amber-500'}`}></div>
            
            <div className="flex items-start justify-between mb-8">
              <div className="p-4 bg-indigo-50 text-indigo-700 rounded-2xl border border-indigo-100">
                <Repeat size={28} />
              </div>
              <div className="flex items-center gap-2">
                 <button 
                  onClick={() => setViewingRecurring(ri)}
                  className="p-2 text-gray-400 hover:text-indigo-600 transition-all"
                  title="View Details"
                 >
                   <Eye size={20} />
                 </button>
                 <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                    ri.status === 'Active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {ri.status}
                  </span>
                  {role === 'Admin' && (
                    <button 
                      type="button"
                      onClick={(e) => triggerDeleteConfirm(e, ri.id)} 
                      className="p-2 text-gray-300 hover:text-red-600 transition-colors z-[20] relative"
                      title="Delete Subscription"
                    >
                      <Trash2 size={20} />
                    </button>
                  )}
              </div>
            </div>

            <h3 className="text-xl font-black text-gray-900 mb-1 uppercase tracking-tight">{ri.clientName}</h3>
            <div className="flex items-center gap-2 text-[10px] text-gray-400 font-black uppercase tracking-widest mb-6">
              <Calendar size={14} className="text-indigo-600" />
              <span>{ri.frequency} Cycle • Next: {ri.nextRunDate}</span>
            </div>

            <div className="space-y-3 mb-8 bg-gray-50 p-6 rounded-[1.5rem] border border-gray-100 shadow-inner">
               {(ri.items || []).slice(0, 3).map((item, idx) => (
                 <div key={idx} className="flex justify-between items-center text-xs font-bold text-gray-600">
                    <span className="truncate max-w-[140px]">{item.quantity}x {item.name}</span>
                    <span className="font-black text-gray-900">Rs. {(item.total || 0).toLocaleString()}</span>
                 </div>
               ))}
               {(ri.items || []).length > 3 && (
                 <p className="text-[9px] text-indigo-600 font-black tracking-widest mt-2 uppercase">+{ri.items.length - 3} Additional Assets</p>
               )}
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-gray-100">
               <div>
                 <p className="text-[9px] text-gray-400 uppercase font-black tracking-widest mb-1">Per Cycle Value</p>
                 <p className="text-2xl font-black text-gray-900 tracking-tighter">Rs. {(ri.total || 0).toLocaleString()}</p>
               </div>
               <button 
                type="button"
                onClick={() => toggleStatus(ri.id)}
                className={`p-4 rounded-2xl transition-all border ${
                  ri.status === 'Active' ? 'bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100' : 'bg-green-50 text-green-600 border-green-100 hover:bg-green-100'
                }`}
               >
                 {ri.status === 'Active' ? <Pause size={24} strokeWidth={3} /> : <Play size={24} strokeWidth={3} />}
               </button>
            </div>
          </div>
        ))}

        {recurringInvoices.length === 0 && (
          <div className="lg:col-span-3 py-28 text-center bg-white rounded-[3rem] border-4 border-dashed border-gray-100">
             <div className="w-20 h-20 bg-gray-50 text-gray-200 rounded-full flex items-center justify-center mx-auto mb-6">
                <Repeat size={48} />
             </div>
             <h3 className="text-xl font-black text-gray-400 uppercase tracking-widest">No Active Schedules</h3>
             <p className="text-sm font-bold text-gray-300 mb-8 max-w-xs mx-auto">Automate your business by setting up monthly or weekly templates.</p>
             <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-black text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-800 transition-all shadow-xl"
            >
              Configure Master Template
            </button>
          </div>
        )}
      </div>

      {/* Custom Deletion Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden border border-red-100 animate-in zoom-in-95 duration-200">
            <div className="p-10 text-center">
               <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                  <AlertTriangle size={40} />
               </div>
               <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter mb-2">Confirm Termination</h3>
               <p className="text-sm text-gray-500 font-bold mb-8 leading-relaxed px-4">
                 Are you sure you want to permanently delete this recurring schedule? This action will stop all future automated billings for this client.
               </p>
               
               <div className="flex flex-col gap-3">
                  <button 
                    onClick={performDelete}
                    className="w-full py-5 bg-red-600 text-white font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all shadow-xl shadow-red-900/10 flex items-center justify-center gap-2"
                  >
                    <Trash2 size={16} /> Yes, Purge Schedule
                  </button>
                  <button 
                    onClick={() => { setShowDeleteConfirm(false); setIdToDelete(null); }}
                    className="w-full py-5 bg-gray-100 text-gray-600 font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all"
                  >
                    Abort Deletion
                  </button>
               </div>
            </div>
            <div className="p-4 bg-gray-50 border-t border-gray-100 text-center">
               <p className="text-[8px] font-black text-gray-400 uppercase tracking-[0.2em]">Safety Protocol v2.5</p>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Architect Modal (Creation) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md">
          <div className="bg-white w-full max-w-6xl max-h-[95vh] rounded-[3rem] shadow-2xl overflow-hidden flex flex-col border border-gray-100 animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-black text-indigo-400 rounded-2xl flex items-center justify-center shadow-lg">
                  <Repeat size={24} strokeWidth={3} />
                </div>
                <div>
                   <h3 className="text-xl font-black text-gray-900 uppercase tracking-tighter leading-none">Subscription Architect</h3>
                   <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-1">Configuring Automated Inbound Logic</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-red-600 p-3 hover:bg-red-50 rounded-2xl transition-all">
                <X size={32} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-10 space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 mb-3 uppercase tracking-widest">Target Client Portfolio</label>
                  <select 
                    required 
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className="w-full px-6 py-4 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50 font-bold transition-all"
                  >
                    <option value="">Select a client...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 mb-3 uppercase tracking-widest">Temporal Frequency</label>
                  <select 
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as Frequency)}
                    className="w-full px-6 py-4 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50 font-bold transition-all"
                  >
                    <option value="Weekly">Weekly Cycle</option>
                    <option value="Monthly">Monthly Cycle</option>
                    <option value="Quarterly">Quarterly Cycle</option>
                    <option value="Yearly">Yearly Cycle</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 mb-3 uppercase tracking-widest">Initial Execution Date</label>
                  <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-6 py-4 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50 font-black transition-all" 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 mb-3 uppercase tracking-widest">Discount (%)</label>
                  <input 
                    type="number" 
                    value={discountRate}
                    onChange={(e) => setDiscountRate(parseFloat(e.target.value) || 0)}
                    className="w-full px-6 py-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl outline-none focus:ring-4 focus:ring-red-50 font-black transition-all text-center" 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 mb-3 uppercase tracking-widest">Tax (%)</label>
                  <input 
                    type="number" 
                    value={taxRate}
                    onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                    className="w-full px-6 py-4 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50 font-black transition-all text-center" 
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-black text-gray-900 uppercase text-[11px] tracking-[0.2em]">Asset Composition</h4>
                  <div className="flex items-center gap-3">
                    <div className="relative group">
                      <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                      <input 
                        type="text" 
                        placeholder="Search assets..." 
                        value={assetSearchTerm} 
                        onChange={e => setAssetSearchTerm(e.target.value)}
                        className="pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-[10px] font-bold outline-none focus:ring-4 focus:ring-indigo-50 w-40 transition-all"
                      />
                    </div>
                    <select 
                      value={activeAssetId}
                      onChange={(e) => { 
                        const val = e.target.value;
                        setActiveAssetId(val);
                        if(val) addItem(val); 
                      }}
                      className="px-6 py-3 bg-indigo-600 text-white text-[10px] font-black rounded-xl outline-none border-none shadow-lg uppercase tracking-widest hover:bg-indigo-700 transition-all cursor-pointer"
                    >
                      <option value="">+ SELECT ASSET TO TEMPLATE</option>
                      {products
                        .filter(p => 
                          p.name.toLowerCase().includes(assetSearchTerm.toLowerCase()) || 
                          p.sku?.toLowerCase().includes(assetSearchTerm.toLowerCase())
                        )
                        .map(p => <option key={p.id} value={p.id}>{p.name} {p.size ? `(${p.size})` : ''} (Rs. {p.tp})</option>)}
                    </select>
                  </div>
                </div>

                <div className="border border-gray-100 rounded-[2.5rem] overflow-hidden shadow-2xl bg-white">
                  <div className="overflow-x-auto w-full">
                    <table className="w-full text-left">
                      <thead className="bg-gray-50 text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-100">
                        <tr>
                          <th className="px-8 py-6">Item Description</th>
                          <th className="px-6 py-6 text-center">Size</th>
                          <th className="px-6 py-6 text-center">Quantity</th>
                          <th className="px-6 py-6 text-center">MRP</th>
                          <th className="px-6 py-6 text-center">Trade Price</th>
                          <th className="px-8 py-6 text-right">Total</th>
                          <th className="px-6 py-6"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {selectedItems.map(item => (
                          <tr key={item.productId} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-8 py-5">
                               <p className="text-sm font-black text-gray-900">{item.name}</p>
                               <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest italic">Fixed Recurring Item</p>
                            </td>
                            <td className="px-6 py-5 text-center">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${
                                item.size 
                                ? 'bg-purple-50 border-purple-100 text-purple-600' 
                                : 'bg-gray-50 border-gray-100 text-gray-400'
                              }`}>
                                {item.size || 'N/A'}
                              </span>
                            </td>
                            <td className="px-6 py-5">
                              <div className="flex justify-center">
                                <input 
                                  type="number" 
                                  min="1"
                                  value={item.quantity} 
                                  onChange={(e) => {
                                    const qty = Math.max(1, parseInt(e.target.value) || 1);
                                    setSelectedItems(selectedItems.map(si => si.productId === item.productId ? { ...si, quantity: qty, total: qty * si.tp } : si));
                                  }}
                                  className="w-16 bg-gray-100 border-none text-center font-black rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-indigo-100"
                                />
                              </div>
                            </td>
                            <td className="px-6 py-5 text-center text-xs font-bold text-gray-400 line-through">Rs. {(item.mrp || 0).toLocaleString()}</td>
                            <td className="px-6 py-5 text-center">
                               <input 
                                  type="number" 
                                  value={item.tp} 
                                  onChange={(e) => {
                                    const tp = parseFloat(e.target.value) || 0;
                                    setSelectedItems(selectedItems.map(si => si.productId === item.productId ? { ...si, tp, total: si.quantity * tp } : si));
                                  }}
                                  className="w-24 bg-yellow-50 border border-yellow-100 text-center font-black rounded-xl p-2.5 text-xs outline-none text-yellow-700"
                                />
                            </td>
                            <td className="px-8 py-5 text-right font-black text-gray-900">Rs. {(item.total || 0).toLocaleString()}</td>
                            <td className="px-6 py-5 text-right">
                              <button type="button" onClick={() => removeItem(item.productId)} className="text-red-300 hover:text-red-600 p-2 transition-colors"><Trash2 size={20} /></button>
                            </td>
                          </tr>
                        ))}
                        {selectedItems.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-8 py-20 text-center opacity-20 italic font-bold">No assets selected for this template.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-10 bg-gray-50 border-t border-gray-100 flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="grid grid-cols-4 gap-12">
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Cycle Subtotal</p>
                  <p className="text-2xl font-black text-gray-900">Rs. {(calculateSubtotal() || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Discount ({discountRate}%)</p>
                  <p className="text-2xl font-black text-red-600">Rs. {(calculateSubtotal() * (discountRate / 100) || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Tax ({taxRate}%)</p>
                  <p className="text-2xl font-black text-yellow-600">Rs. {((calculateSubtotal() - (calculateSubtotal() * (discountRate / 100))) * (taxRate / 100) || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">Recurring Total</p>
                  <p className="text-4xl font-black text-black tracking-tighter">Rs. {(calculateSubtotal() - (calculateSubtotal() * (discountRate / 100)) + ((calculateSubtotal() - (calculateSubtotal() * (discountRate / 100))) * (taxRate / 100)) || 0).toLocaleString()}</p>
                </div>
              </div>
              <div className="flex gap-4 w-full md:w-auto">
                <button 
                  onClick={() => setIsModalOpen(false)} 
                  className="px-10 py-5 bg-white border border-gray-200 text-gray-500 font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-gray-100 transition-all"
                >
                  Discard
                </button>
                <button 
                  onClick={handleCreateRecurring} 
                  disabled={isSaving || selectedItems.length === 0 || !selectedClientId}
                  className="flex-1 md:flex-none px-14 py-5 bg-black text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-900 transition-all flex items-center justify-center gap-4 disabled:opacity-50 shadow-2xl"
                >
                  {isSaving ? (
                    <Loader2 className="animate-spin text-indigo-400" size={24} />
                  ) : (
                    <>Activate Recurring Cycle <Sparkles size={20} className="text-indigo-400" /></>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail View Modal (Printable/PDF) */}
      {viewingRecurring && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/95 backdrop-blur-md p-4 overflow-y-auto no-print">
          <div className="bg-white w-full max-w-5xl rounded-[3rem] overflow-hidden flex flex-col shadow-2xl my-auto animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b flex justify-between items-center bg-gray-50/50 sticky top-0 z-10 no-print border-gray-100">
              <div className="flex items-center gap-4">
                 <Repeat size={20} className="text-indigo-600" />
                 <h3 className="text-xl font-black uppercase tracking-widest">Subscription Ledger</h3>
                 <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${viewingRecurring.status === 'Active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{viewingRecurring.status}</span>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={handlePrint} className="flex items-center gap-3 px-6 py-3 bg-white border border-gray-200 rounded-xl font-black text-[10px] uppercase hover:bg-gray-50 transition-all"><Printer size={18} /> Print</button>
                <button onClick={exportToPdf} disabled={isGeneratingPdf} className="flex items-center gap-3 px-6 py-3 bg-black text-white rounded-xl font-black text-[10px] uppercase hover:bg-gray-900 shadow-lg transition-all">
                  {isGeneratingPdf ? <Loader2 className="animate-spin text-yellow-500" size={18} /> : <Download size={18} />} PDF
                </button>
                <button onClick={() => setViewingRecurring(null)} className="p-3 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all"><X size={24} /></button>
              </div>
            </div>
            
            <div className="p-16 md:p-24 bg-white" id="printable-recurring-area">
              <div className="flex justify-between items-start mb-24">
                <RecurringLogo />
                <div className="text-right">
                  <h1 className="text-6xl font-black text-gray-900 tracking-tighter mb-4 opacity-5 uppercase leading-none">AUTO</h1>
                  <p className="text-xl font-black text-black">Master Template</p>
                  <p className="text-sm font-bold text-indigo-600 tracking-widest uppercase">{viewingRecurring.frequency} Billing Cycle</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-20 mb-20">
                <div>
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-4">Subscriber Identity</h4>
                  <p className="text-3xl font-black text-gray-900">{viewingRecurring.clientName}</p>
                  
                  {viewingClient?.address && (
                    <div className="mt-4 flex items-start gap-2 text-gray-500">
                      <MapPin size={16} className="mt-1 flex-shrink-0 text-indigo-600" />
                      <p className="text-sm font-bold leading-relaxed">{viewingClient.address}</p>
                    </div>
                  )}
                  {viewingClient?.phone && (
                    <div className="mt-2 flex items-center gap-2 text-gray-500">
                      <Phone size={14} className="flex-shrink-0 text-indigo-600" />
                      <p className="text-xs font-black uppercase tracking-widest">{viewingClient.phone}</p>
                    </div>
                  )}
                </div>
                <div className="text-right space-y-6">
                  <div>
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-4">Scheduling Details</h4>
                    <div className="space-y-2">
                       <p className="text-sm font-black text-gray-900 uppercase tracking-widest">Starts: {viewingRecurring.startDate}</p>
                       <p className="text-sm font-black text-indigo-600 uppercase tracking-widest">Next Run: {viewingRecurring.nextRunDate}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-20">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b-4 border-black">
                      <th className="py-6 text-left text-[11px] font-black uppercase tracking-widest">Item Description</th>
                      <th className="py-6 text-center text-[11px] font-black uppercase tracking-widest">Quantity</th>
                      <th className="py-6 text-center text-[11px] font-black uppercase tracking-widest">MRP</th>
                      <th className="py-6 text-center text-[11px] font-black uppercase tracking-widest">Trade Price</th>
                      <th className="py-6 text-right text-[11px] font-black uppercase tracking-widest">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {viewingRecurring.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-6">
                          <p className="font-black text-gray-900">{item.name}</p>
                        </td>
                        <td className="py-6 text-center font-black text-gray-900">{item.quantity}</td>
                        <td className="py-6 text-center font-black text-gray-900">Rs. {item.mrp}</td>
                        <td className="py-6 text-center font-black text-gray-900">Rs. {item.tp}</td>
                        <td className="py-6 text-right font-black text-gray-900">Rs. {(item.total || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-4 border-black">
                      <td colSpan={3}></td>
                      <td className="py-8 text-right font-black text-gray-400 uppercase text-[10px] tracking-widest">Cycle Subtotal</td>
                      <td className="py-8 text-right font-black text-gray-900 text-xl">Rs. {(viewingRecurring.subtotal || 0).toLocaleString()}</td>
                    </tr>
                    {viewingRecurring.discountTotal > 0 && (
                      <tr>
                        <td colSpan={3}></td>
                        <td className="py-2 text-right font-black text-red-400 uppercase text-[10px] tracking-widest">Discount ({viewingRecurring.discountRate}%)</td>
                        <td className="py-2 text-right font-black text-red-600 text-xl">Rs. {(viewingRecurring.discountTotal || 0).toLocaleString()}</td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={3}></td>
                      <td className="py-2 text-right font-black text-gray-400 uppercase text-[10px] tracking-widest">Tax ({viewingRecurring.taxRate}%)</td>
                      <td className="py-2 text-right font-black text-yellow-600 text-xl">Rs. {(viewingRecurring.taxTotal || 0).toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td colSpan={3}></td>
                      <td className="py-4 text-right font-black text-black uppercase text-[10px] tracking-widest">Master Amount</td>
                      <td className="py-4 text-right font-black text-black text-4xl tracking-tighter">Rs. {(viewingRecurring.total || 0).toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="pt-20 border-t border-gray-100 flex justify-between items-end opacity-40 grayscale">
                 <div>
                   <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-1">Authenticity Node</p>
                   <p className="text-xs font-bold">Overplast Beauty Cloud ERP v2.5</p>
                 </div>
                 <div className="text-right">
                   <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-1">Authorization</p>
                   <p className="text-xs font-black">Digital Master Template - Recurring Authorization</p>
                 </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecurringInvoices;
