
import React, { useState, useMemo, useEffect } from 'react';
import { 
  Plus, Search, Edit, Trash2, Package, Sparkles, X, 
  Loader2, AlertCircle, CheckCircle2, RefreshCw, Shield, ArrowUpCircle,
  ArrowUpRight, ArrowDownLeft, Activity, History, Calendar, Download, Printer, FileText, Filter, Clock, AlertTriangle
} from 'lucide-react';
import { Product, UserRole, StockTransaction } from '../types';
import { db } from '../db';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

interface InventoryProps {
  products: Product[];
  onUpdate: () => void;
  role: UserRole;
}

const Inventory: React.FC<InventoryProps> = ({ products = [], onUpdate, role }) => {
  const [viewMode, setViewMode] = useState<'inventory' | 'history'>('inventory');
  const [searchTerm, setSearchTerm] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [restockQty, setRestockQty] = useState(0);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  
  // Custom Delete Confirmation State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  
  // History State
  const [historyMonth, setHistoryMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [allTransactions, setAllTransactions] = useState<StockTransaction[]>([]);
  const [monthlyFlow, setMonthlyFlow] = useState({ in: 0, out: 0 });

  const safeProducts = useMemo(() => Array.isArray(products) ? products : [], [products]);

  const categories = useMemo(() => {
    const cats = safeProducts.map(p => p.category).filter(Boolean);
    return ['All Categories', ...new Set(cats)];
  }, [safeProducts]);

  const fetchTransactions = async () => {
    try {
      const txs = await db.getStockTransactions();
      setAllTransactions(txs);
      
      const flow = txs.reduce((acc, tx) => {
        if (tx.date.startsWith(historyMonth)) {
          if (tx.type === 'IN') acc.in += tx.quantity;
          if (tx.type === 'OUT') acc.out += tx.quantity;
        }
        return acc;
      }, { in: 0, out: 0 });
      
      setMonthlyFlow(flow);
    } catch (err) {
      console.error("Failed to fetch transactions", err);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [products, historyMonth, viewMode]);

  const filteredProducts = useMemo(() => {
    return safeProducts.filter(p => {
      const name = (p.name || '').toLowerCase();
      const sku = (p.sku || '').toLowerCase();
      const search = searchTerm.toLowerCase();
      const matchesSearch = name.includes(search) || sku.includes(search);
      const matchesCategory = selectedCategory === 'All Categories' || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [safeProducts, searchTerm, selectedCategory]);

  const filteredTransactions = useMemo(() => {
    return allTransactions.filter(tx => {
      const matchesMonth = tx.date.startsWith(historyMonth);
      const matchesSearch = tx.productName.toLowerCase().includes(historySearch.toLowerCase()) || 
                          tx.note?.toLowerCase().includes(historySearch.toLowerCase());
      return matchesMonth && matchesSearch;
    });
  }, [allTransactions, historyMonth, historySearch]);

  const viewItemHistory = (productName: string) => {
    setHistorySearch(productName);
    setViewMode('history');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getStockStatus = (stock: number, minStock: number) => {
    if (stock <= 0) return { label: 'Out of Stock', color: 'bg-red-50 text-red-700 border-red-200' };
    if (stock <= minStock) return { label: 'Low Stock', color: 'bg-amber-50 text-amber-700 border-amber-200' };
    return { label: 'Available', color: 'bg-green-50 text-green-700 border-green-200' };
  };

  const handleRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || restockQty <= 0) return;
    setIsSaving(true);

    try {
      const updatedProduct = { ...editingProduct, stock: editingProduct.stock + restockQty };
      const transaction: StockTransaction = {
        id: `tx-in-${Date.now()}`,
        productId: editingProduct.id,
        productName: editingProduct.name,
        type: 'IN',
        quantity: restockQty,
        date: new Date().toISOString().split('T')[0],
        note: 'Manual Restock'
      };

      await db.saveProducts([updatedProduct]);
      await db.saveStockTransactions([transaction]);
      
      onUpdate();
      setIsRestockModalOpen(false);
      setEditingProduct(null);
      setRestockQty(0);
    } catch (err: any) {
      alert("Restock failed: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const triggerDeleteConfirm = (e: React.MouseEvent, product: Product) => {
    e.preventDefault();
    e.stopPropagation();
    if (role !== 'Admin') {
      alert("Unauthorized: Only Administrators can delete assets.");
      return;
    }
    setProductToDelete(product);
    setShowDeleteConfirm(true);
  };

  const performDelete = async () => {
    if (!productToDelete) return;
    const id = productToDelete.id;
    setDeletingId(id);
    setShowDeleteConfirm(false);

    try {
      await db.deleteProduct(id);
      await onUpdate();
    } catch (err: any) {
      console.error("Deletion Core Error:", err);
      alert("System Failure: Could not delete item. " + (err.message || "Unknown Database Error"));
    } finally {
      setDeletingId(null);
      setProductToDelete(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (role !== 'Admin') return;
    setIsSaving(true);
    const formData = new FormData(e.currentTarget);
    const mrp = Number(formData.get('mrp')) || 0;
    const tp = Number(formData.get('tp')) || 0;
    const stock = parseInt(formData.get('stock') as string) || 0;
    const isNewProduct = !editingProduct;
    
    const productData: Product = {
      id: editingProduct?.id || `prod-${Date.now()}`,
      name: formData.get('name') as string,
      sku: formData.get('sku') as string,
      category: formData.get('category') as string,
      price: tp, cost: tp, mrp: mrp, tp: tp,
      stock: stock,
      minStock: parseInt(formData.get('minStock') as string) || 0,
      description: formData.get('description') as string || '',
    };

    try {
      await db.saveProducts([productData]);
      
      if (isNewProduct && stock > 0) {
        const transaction: StockTransaction = {
          id: `tx-init-${Date.now()}`,
          productId: productData.id,
          productName: productData.name,
          type: 'IN',
          quantity: stock,
          date: new Date().toISOString().split('T')[0],
          note: 'Initial Registration'
        };
        await db.saveStockTransactions([transaction]);
      }

      onUpdate();
      setIsModalOpen(false);
      setEditingProduct(null);
    } catch (err: any) {
      alert(`Operation failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const downloadStockReport = async () => {
    setIsGeneratingReport(true);
    const element = document.getElementById('stock-report-area');
    if (!element) return;

    try {
      await new Promise(r => setTimeout(r, 200));
      const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Overplast_Stock_Report_${historyMonth}.pdf`);
    } catch (err) {
      console.error(err);
      alert("Report Generation Failed.");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 w-full pb-20">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 bg-white p-8 rounded-[3rem] border border-gray-200 shadow-sm">
        <div className="flex items-center gap-6">
           <div className={`p-4 rounded-2xl ${viewMode === 'inventory' ? 'bg-black text-yellow-500' : 'bg-indigo-600 text-white'} shadow-lg transition-all`}>
              {viewMode === 'inventory' ? <Package size={32} /> : <History size={32} />}
           </div>
           <div>
              <h2 className="text-3xl font-black text-gray-900 tracking-tight uppercase">
                {viewMode === 'inventory' ? 'Inventory Vault' : 'Movement Ledger'}
              </h2>
              <p className="text-sm text-gray-500 font-medium italic">
                {viewMode === 'inventory' ? `Managing ${safeProducts.length} registered beauty assets.` : `Detailed history of Stock IN and OUT flow.`}
              </p>
           </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-gray-100 p-1.5 rounded-2xl border border-gray-200">
             <button 
              onClick={() => { setViewMode('inventory'); setHistorySearch(''); }} 
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'inventory' ? 'bg-white text-black shadow-md' : 'text-gray-500'}`}
             >
              Live Assets
             </button>
             <button 
              onClick={() => setViewMode('history')} 
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'history' ? 'bg-white text-black shadow-md' : 'text-gray-500'}`}
             >
              Movement History
             </button>
          </div>
          
          <button onClick={onUpdate} className="p-4 bg-gray-50 text-gray-400 hover:text-black rounded-2xl border border-gray-200 transition-all"><RefreshCw size={20} /></button>
          
          {viewMode === 'inventory' && role === 'Admin' && (
            <button onClick={() => { setEditingProduct(null); setIsModalOpen(true); }} className="flex items-center justify-center gap-3 bg-black hover:bg-gray-800 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all shadow-xl">
              <Plus size={18} strokeWidth={3} className="text-yellow-500" /> Register Stock
            </button>
          )}

          {viewMode === 'history' && (
            <button onClick={downloadStockReport} disabled={isGeneratingReport} className="flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all shadow-xl disabled:opacity-50">
              {isGeneratingReport ? <Loader2 className="animate-spin text-yellow-500" size={18} /> : <Download size={18} />} Stock Report
            </button>
          )}
        </div>
      </div>

      {viewMode === 'inventory' ? (
        <div className="bg-white rounded-[2.5rem] border border-gray-200 shadow-sm overflow-hidden animate-in fade-in duration-300">
          <div className="p-6 md:p-8 border-b border-gray-200 flex flex-col xl:flex-row gap-6 bg-gray-50/30">
            <div className="relative flex-1">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input type="text" placeholder="Search by SKU or Name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-14 pr-6 py-4 bg-white border border-gray-200 rounded-[1.5rem] text-sm font-bold focus:ring-4 focus:ring-yellow-50 outline-none transition-all" />
            </div>
            
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 bg-white px-5 py-3 rounded-2xl border border-gray-200 shadow-sm whitespace-nowrap">
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">In Stock (Total)</span>
                  <div className="flex items-center gap-1.5 text-green-600">
                    <ArrowUpRight size={14} strokeWidth={3} />
                    <span className="text-xs font-black">{monthlyFlow.in}</span>
                  </div>
                </div>
                <div className="w-[1px] h-6 bg-gray-100 mx-2"></div>
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Out Stock (Total)</span>
                  <div className="flex items-center gap-1.5 text-blue-600">
                    <ArrowDownLeft size={14} strokeWidth={3} />
                    <span className="text-xs font-black">{monthlyFlow.out}</span>
                  </div>
                </div>
              </div>

              <div className="relative">
                <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="px-6 py-4 bg-white border border-gray-200 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest outline-none appearance-none cursor-pointer min-w-[200px] pr-12">
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
                <Activity className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={16} />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-gray-50 text-gray-400 text-[9px] font-black uppercase tracking-[0.2em] border-b border-gray-200">
                  <th className="px-8 py-6">Product</th>
                  <th className="px-6 py-6">SKU</th>
                  <th className="px-6 py-6 text-center">Price</th>
                  <th className="px-6 py-6">Stock</th>
                  <th className="px-6 py-6">Status</th>
                  <th className="px-8 py-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredProducts.length > 0 ? filteredProducts.map((product) => {
                  const status = getStockStatus(product.stock || 0, product.minStock || 0);
                  const isDeleting = deletingId === product.id;
                  return (
                    <tr key={product.id} className="hover:bg-yellow-50/10 transition-colors group">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-gray-100 text-gray-400 rounded-xl flex items-center justify-center border border-gray-200 group-hover:bg-black group-hover:text-yellow-500 transition-all">
                            <Package size={20} />
                          </div>
                          <div>
                            <p className="text-sm font-black text-gray-900">{product.name}</p>
                            <span className="text-[9px] font-black text-yellow-700 uppercase tracking-widest">{product.category}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-[11px] font-black text-gray-400">{product.sku || 'N/A'}</td>
                      <td className="px-6 py-5 text-center">
                         <div className="text-sm font-black text-gray-900">Rs. {(product.mrp || 0).toFixed(2)}</div>
                         <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">TP: Rs. {(product.tp || 0).toFixed(2)}</div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-black text-gray-900">{product.stock || 0}</span>
                          <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                             <div className={`h-full rounded-full ${product.stock <= product.minStock ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${Math.min(((product.stock || 0) / Math.max(product.minStock * 2, 1)) * 100, 100)}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${status.color}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => viewItemHistory(product.name)} className="p-2.5 bg-blue-50 border border-blue-100 text-blue-600 hover:bg-blue-100 rounded-xl transition-all shadow-sm" title="Movement History">
                            <Clock size={16} />
                          </button>
                          {role === 'Admin' ? (
                            <>
                              <button onClick={() => { setEditingProduct(product); setIsRestockModalOpen(true); }} className="p-2.5 bg-green-50 border border-green-100 text-green-600 hover:bg-green-100 rounded-xl transition-all shadow-sm" title="Restock Assets">
                                <ArrowUpCircle size={16} />
                              </button>
                              <button onClick={() => { setEditingProduct(product); setIsModalOpen(true); }} className="p-2.5 bg-white border border-gray-200 text-gray-400 hover:text-black rounded-xl transition-all shadow-sm" title="Edit Item">
                                <Edit size={16} />
                              </button>
                              <button 
                                onClick={(e) => triggerDeleteConfirm(e, product)} 
                                disabled={isDeleting}
                                className={`p-2.5 rounded-xl transition-all shadow-sm border ${
                                  isDeleting 
                                  ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' 
                                  : 'bg-white border-red-100 text-red-500 hover:bg-red-500 hover:text-white'
                                }`} 
                                title="Delete Permanently"
                              >
                                {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                              </button>
                            </>
                          ) : (
                            <span className="text-[10px] font-black text-gray-300 uppercase italic">View Only</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={6} className="px-8 py-20 text-center opacity-30">
                      <Package size={48} className="mx-auto mb-4" />
                      <p className="text-sm font-black uppercase tracking-widest">No products in vault</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in duration-300">
           {/* Ledger Header and Analysis remains same as before... */}
           <div className="bg-white p-8 rounded-[2.5rem] border border-gray-200 shadow-sm grid grid-cols-1 xl:grid-cols-12 gap-6 items-center">
              <div className="xl:col-span-3 flex items-center gap-6">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><Calendar size={24} /></div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Analysis Period</p>
                  <input 
                    type="month" 
                    value={historyMonth} 
                    onChange={(e) => setHistoryMonth(e.target.value)}
                    className="font-black text-gray-900 border-none bg-transparent focus:ring-0 text-xl outline-none cursor-pointer"
                  />
                </div>
              </div>

              <div className="xl:col-span-5 relative">
                 <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                 <input 
                    type="text" 
                    placeholder="Search history by item name..." 
                    value={historySearch} 
                    onChange={(e) => setHistorySearch(e.target.value)} 
                    className="w-full pl-14 pr-6 py-4 bg-gray-50 border border-gray-200 rounded-[1.5rem] text-sm font-bold focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
                 />
                 {historySearch && (
                   <button onClick={() => setHistorySearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 hover:bg-gray-200 rounded-lg text-gray-400">
                     <X size={14} />
                   </button>
                 )}
              </div>

              <div className="xl:col-span-4 flex items-center justify-end gap-8">
                 <div className="text-right">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">TOTAL IN</p>
                    <p className="text-2xl font-black text-green-600">+{monthlyFlow.in}</p>
                 </div>
                 <div className="text-right">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">TOTAL OUT</p>
                    <p className="text-2xl font-black text-blue-600">-{monthlyFlow.out}</p>
                 </div>
              </div>
           </div>

           <div id="stock-report-area" className="bg-white rounded-[3rem] border border-gray-200 shadow-xl overflow-hidden">
              <div className="p-12 border-b border-gray-100 flex justify-between items-start">
                 <div>
                    <h1 className="text-3xl font-black tracking-tighter text-gray-900 leading-none uppercase">OVERPLAST BEAUTY</h1>
                    <p className="text-lg text-gray-500 font-beauty italic mt-1">Movement Ledger & Stock Balance</p>
                    <div className="mt-6 flex items-center gap-2 text-[10px] font-black text-yellow-600 uppercase tracking-widest">
                       <Calendar size={12} /> Cycle: {historyMonth}
                    </div>
                 </div>
                 <div className="text-right">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">System Timestamp</p>
                    <p className="text-sm font-bold text-gray-900">{new Date().toLocaleDateString()}</p>
                 </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 border-b">
                    <tr>
                      <th className="px-8 py-6">Date</th>
                      <th className="px-8 py-6">Item Identity</th>
                      <th className="px-8 py-6 text-center">Movement Type</th>
                      <th className="px-8 py-6 text-right">Qty Flow</th>
                      <th className="px-8 py-6">Ledger Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredTransactions.length > 0 ? filteredTransactions.map((tx, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-8 py-5 text-sm font-bold text-gray-600 whitespace-nowrap">{tx.date}</td>
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tx.type === 'IN' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                              {tx.type === 'IN' ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
                            </div>
                            <span className="text-sm font-black text-gray-900">{tx.productName}</span>
                          </div>
                        </td>
                        <td className="px-8 py-5 text-center">
                          <span className={`px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                            tx.type === 'IN' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                            STOCK {tx.type}
                          </span>
                        </td>
                        <td className={`px-8 py-5 text-right font-black ${tx.type === 'IN' ? 'text-green-600' : 'text-blue-600'}`}>
                          {tx.type === 'IN' ? '+' : '-'}{tx.quantity}
                        </td>
                        <td className="px-8 py-5 text-[11px] font-bold text-gray-400 italic">{tx.note || 'Manual Adjustment'}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5} className="px-8 py-20 text-center opacity-30">
                          <FileText size={48} className="mx-auto mb-4" />
                          <p className="text-sm font-black uppercase tracking-widest">No matching movement data</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {filteredTransactions.length > 0 && (
                    <tfoot className="bg-gray-50 border-t-2 border-gray-100">
                      <tr>
                         <td colSpan={3} className="px-8 py-10 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Aggregate Flow Analysis</td>
                         <td className="px-8 py-10 text-right">
                            <div className="space-y-1">
                               <p className="text-xs font-black text-green-600 uppercase tracking-widest">INBOUND: +{monthlyFlow.in}</p>
                               <p className="text-xs font-black text-blue-600 uppercase tracking-widest">OUTBOUND: -{monthlyFlow.out}</p>
                               <div className="h-[1px] bg-gray-200 my-2"></div>
                               <p className="text-sm font-black text-gray-900 uppercase tracking-widest">NET FLOW: {monthlyFlow.in - monthlyFlow.out}</p>
                            </div>
                         </td>
                         <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              
              <div className="p-12 bg-gray-50/50 flex justify-between items-center opacity-40">
                <p className="text-[10px] font-black uppercase tracking-[0.2em]">Overplast Beauty Cloud ERP v2.5</p>
                <p className="text-[10px] font-black uppercase tracking-[0.2em]">Authenticity Verification: {Math.random().toString(36).substr(2, 9).toUpperCase()}</p>
              </div>
           </div>
        </div>
      )}

      {/* Custom Deletion Confirmation Modal - THIS FIXES THE SANDBOX ISSUE */}
      {showDeleteConfirm && productToDelete && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden border border-red-100 animate-in zoom-in-95 duration-200">
            <div className="p-10 text-center">
               <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                  <AlertTriangle size={40} />
               </div>
               <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter mb-2">Confirm Purge</h3>
               <p className="text-sm text-gray-500 font-bold mb-8 leading-relaxed px-4">
                 Are you sure you want to permanently remove <span className="text-red-600 font-black">"{productToDelete.name}"</span> from the vault? This process is irreversible.
               </p>
               
               <div className="flex flex-col gap-3">
                  <button 
                    onClick={performDelete}
                    className="w-full py-5 bg-red-600 text-white font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all shadow-xl shadow-red-900/10 flex items-center justify-center gap-2"
                  >
                    <Trash2 size={16} /> Yes, Purge Asset
                  </button>
                  <button 
                    onClick={() => { setShowDeleteConfirm(false); setProductToDelete(null); }}
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

      {/* Registration/Edit Modal */}
      {isModalOpen && role === 'Admin' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-8 border-b flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-black text-yellow-500 rounded-2xl flex items-center justify-center"><Package size={24} /></div>
                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tighter">{editingProduct ? 'Update Stock' : 'Register Stock'}</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-3 hover:bg-red-50 hover:text-red-600 rounded-2xl"><X size={28} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-10 space-y-8 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="md:col-span-2"><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Product Name</label><input required name="name" defaultValue={editingProduct?.name} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold" /></div>
                <div><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">SKU Identity</label><input required name="sku" defaultValue={editingProduct?.sku} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold" /></div>
                <div><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Category</label><input required name="category" defaultValue={editingProduct?.category} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold" /></div>
                <div><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">MRP Price (Rs.)</label><input required type="number" step="0.01" name="mrp" defaultValue={editingProduct?.mrp} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-black" /></div>
                <div><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Trade Price / Cost (Rs.)</label><input required type="number" step="0.01" name="tp" defaultValue={editingProduct?.tp} className="w-full px-5 py-4 bg-yellow-50/30 border border-yellow-100 rounded-2xl font-black" /></div>
                <div><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Stock Quantity</label><input required type="number" name="stock" defaultValue={editingProduct?.stock} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold" /></div>
                <div><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Alert Level (Min Stock)</label><input required type="number" name="minStock" defaultValue={editingProduct?.minStock} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold" /></div>
              </div>
              <button disabled={isSaving} className="w-full py-6 bg-black text-white font-black rounded-3xl uppercase tracking-widest text-[10px] hover:bg-gray-900 transition-all flex items-center justify-center gap-4 disabled:opacity-50">
                {isSaving ? <Loader2 className="animate-spin text-yellow-500" size={24} /> : <>Commit to Database <Sparkles size={20} className="text-yellow-500" /></>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Restock Modal */}
      {isRestockModalOpen && editingProduct && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4">
          <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden border border-gray-100">
             <div className="p-10 border-b flex justify-between items-center bg-green-50/50">
               <div>
                 <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">Purchase Assets</h3>
                 <p className="text-xs font-bold text-green-700 uppercase tracking-widest">Incoming Stock Record</p>
               </div>
               <button onClick={() => setIsRestockModalOpen(false)} className="p-3 hover:bg-red-50 text-red-600 rounded-2xl"><X size={28} /></button>
             </div>
             <form onSubmit={handleRestock} className="p-12 space-y-8">
                <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Target Asset</p>
                  <p className="text-lg font-black text-gray-900">{editingProduct.name}</p>
                  <p className="text-[10px] font-bold text-gray-500">Current Balance: {editingProduct.stock} Units</p>
                </div>
                
                <div>
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 block text-center">Enter Incoming Quantity</label>
                   <input 
                    autoFocus 
                    type="number" 
                    required 
                    value={restockQty || ''} 
                    onChange={e => setRestockQty(parseInt(e.target.value) || 0)}
                    className="w-full py-8 text-6xl font-black text-center bg-gray-100 rounded-[2rem] outline-none focus:ring-8 focus:ring-green-100 transition-all"
                    placeholder="0"
                   />
                </div>

                <button disabled={isSaving || restockQty <= 0} className="w-full py-6 bg-green-600 text-white font-black rounded-[2rem] hover:bg-green-700 transition-all shadow-xl shadow-green-900/10 uppercase tracking-widest text-[10px] flex items-center justify-center gap-3">
                   {isSaving ? <Loader2 className="animate-spin" size={24} /> : <>Commence Inbound Flow <ArrowUpCircle size={20} /></>}
                </button>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
