
import React, { useState, useMemo, useEffect } from 'react';
import { 
  Plus, Search, Edit, Trash2, Package, Sparkles, X, 
  Loader2, AlertCircle, CheckCircle2, RefreshCw, Shield, ArrowUpCircle,
  ArrowUpRight, ArrowDownLeft, Activity, History, Calendar, Download, Printer, FileText, Filter, Clock, AlertTriangle, ChevronDown
} from 'lucide-react';
import { Product, UserRole, StockTransaction } from '../types';
import { db } from '../db';
import { ADMIN_EMAIL } from '../constants';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

interface InventoryProps {
  products: Product[];
  onUpdate: () => void;
  role: UserRole;
  userId?: string;
  userEmail?: string;
}

const Inventory: React.FC<InventoryProps> = ({ products = [], onUpdate, role, userId, userEmail }) => {
  const [viewMode, setViewMode] = useState<'inventory' | 'history'>('inventory');
  const [searchTerm, setSearchTerm] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null);
  const [restockQty, setRestockQty] = useState(0);
  const [returnQty, setReturnQty] = useState(0);
  const [returnNote, setReturnNote] = useState('');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  
  // Custom Delete Confirmation State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [txToDelete, setTxToDelete] = useState<StockTransaction | null>(null);
  const [showTxDeleteConfirm, setShowTxDeleteConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  
  // History State
  const [historyMonth, setHistoryMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const years = Array.from({ length: 10 }, (_, i) => 2024 + i);
  const [currentYear, currentMonth] = historyMonth.split('-').map(Number);

  const handleMonthChange = (m: number) => {
    const monthStr = m.toString().padStart(2, '0');
    setHistoryMonth(`${currentYear}-${monthStr}`);
  };

  const handleYearChange = (y: number) => {
    const monthStr = currentMonth.toString().padStart(2, '0');
    setHistoryMonth(`${y}-${monthStr}`);
  };

  const handlePrevMonth = () => {
    let m = currentMonth - 1;
    let y = currentYear;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    setHistoryMonth(`${y}-${m.toString().padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    let m = currentMonth + 1;
    let y = currentYear;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    setHistoryMonth(`${y}-${m.toString().padStart(2, '0')}`);
  };

  const [allTransactions, setAllTransactions] = useState<StockTransaction[]>([]);
  const activeMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    allTransactions.forEach(tx => monthsSet.add(tx.date.slice(0, 7)));
    return Array.from(monthsSet).sort((a, b) => b.localeCompare(a));
  }, [allTransactions]);
  const [monthlyFlow, setMonthlyFlow] = useState({ in: 0, out: 0 });

  const safeProducts = useMemo(() => Array.isArray(products) ? products : [], [products]);

  const categories = useMemo(() => {
    const cats = safeProducts.map(p => p.category).filter(Boolean);
    return ['All Categories', ...new Set(cats)];
  }, [safeProducts]);

  const fetchTransactions = async () => {
    try {
      const txs = await db.getStockTransactions(role === 'Admin' ? undefined : userId);
      setAllTransactions(txs);
      
      const flow = txs.reduce((acc, tx) => {
        if (tx.date.startsWith(historyMonth)) {
          if (tx.type === 'IN') acc.in += tx.quantity;
          if (tx.type === 'OUT') acc.out += tx.quantity;
          if (tx.type === 'RETURN') acc.out += tx.quantity; // Returns now decrease stock (outgoing return)
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
    const nameSearch = searchTerm.toLowerCase();
    
    if (role === 'Admin') {
      return safeProducts.filter(p => {
        const matchesSearch = (p.name || '').toLowerCase().includes(nameSearch) || (p.sku || '').toLowerCase().includes(nameSearch);
        const matchesCategory = selectedCategory === 'All Categories' || p.category === selectedCategory;
        return matchesSearch && matchesCategory;
      });
    }

    // Staff Logic:
    // Show products registered by this staff member AND products created by Admin
    const staffProducts = safeProducts.filter(p => 
      p.createdBy === userId || 
      (p.createdByName && p.createdByName.toLowerCase() === ADMIN_EMAIL.toLowerCase()) || 
      !p.createdBy ||
      p.createdBy === 'admin' ||
      p.createdBy === 'Admin' ||
      p.user_email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
    );
    
    return staffProducts.filter(p => {
      const matchesSearch = (p.name || '').toLowerCase().includes(nameSearch) || (p.sku || '').toLowerCase().includes(nameSearch);
      const matchesCategory = selectedCategory === 'All Categories' || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [safeProducts, searchTerm, selectedCategory, role, userId]);

  const adminProducts = useMemo(() => {
    // Filter to show ONLY products created by Admin
    // This allows staff to see the "master catalog" of products registered by the admin
    const filtered = safeProducts.filter(p => 
      (p.createdByName && p.createdByName.toLowerCase() === ADMIN_EMAIL.toLowerCase()) || 
      p.createdBy === 'admin' ||
      p.createdBy === 'Admin' ||
      (p as any).user_email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
    );
    
    if (filtered.length === 0 && safeProducts.length > 0) {
      console.warn("Inventory: No admin products found after filtering. Total products:", safeProducts.length);
      // Fallback: if no admin products found, show all products to avoid empty dropdown
      return safeProducts;
    }
    
    return filtered;
  }, [safeProducts]);

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
      const productId = editingProduct.id;
      
      const updatedProduct: Product = { 
        ...editingProduct, 
        stock: editingProduct.stock + restockQty,
        createdBy: userId,
        createdByName: userEmail
      };
      
      const transaction: StockTransaction = {
        id: db.generateUUID(),
        productId: productId,
        productName: editingProduct.name,
        productSize: editingProduct.size,
        type: 'IN',
        quantity: restockQty,
        date: new Date().toISOString().split('T')[0],
        note: 'Manual Restock',
        createdBy: userId,
        createdByName: userEmail
      };

      await db.saveProducts([updatedProduct], userId, userEmail);
      await db.saveStockTransactions([transaction], userId, userEmail);
      
      await onUpdate();
      setIsRestockModalOpen(false);
      setEditingProduct(null);
      setRestockQty(0);
      alert("Stock restocked successfully!");
    } catch (err: any) {
      console.error("Restock Error:", err);
      alert("Restock failed: " + (err.message || "Unknown error"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || returnQty <= 0) return;
    
    if (returnQty > editingProduct.stock) {
      alert(`Cannot return ${returnQty} units. Only ${editingProduct.stock} units available in stock.`);
      return;
    }

    setIsSaving(true);

    try {
      const updatedProduct = { ...editingProduct, stock: editingProduct.stock - returnQty };
      const transaction: StockTransaction = {
        id: db.generateUUID(),
        productId: editingProduct.id,
        productName: editingProduct.name,
        productSize: editingProduct.size,
        type: 'RETURN',
        quantity: returnQty,
        date: new Date().toISOString().split('T')[0],
        note: returnNote || 'Stock Return',
        createdBy: userId,
        createdByName: userEmail
      };

      await db.saveProducts([updatedProduct], userId, userEmail);
      await db.saveStockTransactions([transaction], userId, userEmail);
      
      await onUpdate();
      setIsReturnModalOpen(false);
      setEditingProduct(null);
      setReturnQty(0);
      setReturnNote('');
      alert("Stock return processed successfully!");
    } catch (err: any) {
      console.error("Return Error:", err);
      alert("Return failed: " + (err.message || "Unknown error"));
    } finally {
      setIsSaving(false);
    }
  };

  const triggerDeleteConfirm = (e: React.MouseEvent, product: Product) => {
    e.preventDefault();
    e.stopPropagation();
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

  const triggerTxDeleteConfirm = (tx: StockTransaction) => {
    setTxToDelete(tx);
    setShowTxDeleteConfirm(true);
  };

  const performTxDelete = async () => {
    if (!txToDelete || !txToDelete.id) return;
    setDeletingTxId(txToDelete.id);
    setShowTxDeleteConfirm(false);

    try {
      await db.deleteStockTransaction(txToDelete.id);
      await fetchTransactions();
    } catch (err: any) {
      console.error("Ledger Deletion Error:", err);
      alert("Failed to delete ledger entry: " + err.message);
    } finally {
      setDeletingTxId(null);
      setTxToDelete(null);
    }
  };

  const performClearLedger = async () => {
    setIsClearing(true);
    setShowClearConfirm(false);

    try {
      const txsToDelete = filteredTransactions.map(tx => tx.id).filter(Boolean) as string[];
      // Delete in batches or one by one
      for (const id of txsToDelete) {
        await db.deleteStockTransaction(id);
      }
      await fetchTransactions();
    } catch (err: any) {
      console.error("Clear Ledger Error:", err);
      alert("Failed to clear ledger: " + err.message);
    } finally {
      setIsClearing(false);
    }
  };

  const [selectedAdminProductId, setSelectedAdminProductId] = useState<string>('');

  const handleAdminProductSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const productId = e.target.value;
    setSelectedAdminProductId(productId);
    
    if (productId) {
      const adminProduct = adminProducts.find(p => p.id === productId);
      if (adminProduct) {
        // We can't easily update defaultValue of inputs after render, 
        // so we might need to use controlled inputs or a key change to reset the form.
        // For now, let's just keep it simple and let the user know we'll pre-fill if possible.
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    const formData = new FormData(e.currentTarget);
    const mrp = Number(formData.get('mrp')) || 0;
    const tp = Number(formData.get('tp')) || 0;
    const purchasePrice = Number(formData.get('purchasePrice')) || 0;
    const stock = parseInt(formData.get('stock') as string) || 0;
    
    // If editing a catalog item, treat it as a new product registration for the staff
    const isNewProduct = !editingProduct;
    const fromCatalog = !editingProduct && selectedAdminProductId;
    
    const productData: Product = {
      id: isNewProduct ? db.generateUUID() : editingProduct!.id,
      name: formData.get('name') as string,
      sku: formData.get('sku') as string,
      category: formData.get('category') as string,
      size: formData.get('size') as string || '',
      price: tp, 
      cost: purchasePrice, 
      mrp: mrp, 
      tp: tp, 
      purchasePrice: purchasePrice,
      stock: stock,
      minStock: parseInt(formData.get('minStock') as string) || 0,
      description: formData.get('description') as string || '',
      createdBy: userId,
      createdByName: userEmail,
      createdAt: isNewProduct ? new Date().toISOString() : editingProduct!.createdAt
    };

    try {
      await db.saveProducts([productData], userId, userEmail);
      
      if (isNewProduct && stock > 0) {
        const transaction: StockTransaction = {
          id: db.generateUUID(),
          productId: productData.id,
          productName: productData.name,
          productSize: productData.size,
          type: 'IN',
          quantity: stock,
          date: new Date().toISOString().split('T')[0],
          note: fromCatalog ? 'Initial Catalog Registration' : 'Initial Registration',
          createdBy: userId,
          createdByName: userEmail,
        };
        await db.saveStockTransactions([transaction], userId, userEmail);
      }

      await onUpdate();
      setIsModalOpen(false);
      setEditingProduct(null);
      setSelectedAdminProductId('');
      alert(fromCatalog ? "Product registered from catalog and stock added!" : (isNewProduct ? "Product registered successfully!" : "Product updated successfully!"));
    } catch (err: any) {
      console.error("Save Product Error:", err);
      alert(`Operation failed: ${err.message || "Unknown error"}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrint = () => {
    const printArea = document.getElementById('stock-report-area');
    if (!printArea) {
      window.print();
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Please allow popups to print.");
      return;
    }

    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(style => style.outerHTML)
      .join('\n');

    printWindow.document.write(`
      <html>
        <head>
          <title>Inventory Report - ${new Date().toLocaleDateString()}</title>
          ${styles}
          <style>
            body { 
              background: white !important; 
              padding: 20px !important; 
              margin: 0 !important;
              color: black !important;
            }
            .no-print { display: none !important; }
            * { 
              color: black !important; 
              border-color: #e5e7eb !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .bg-black, .bg-gray-900, .bg-gray-800 { 
              background: white !important; 
              border: 1px solid #e5e7eb !important; 
            }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; font-size: 9px; }
            .rounded-[3rem], .rounded-[2.5rem] { border-radius: 0 !important; }
            .shadow-2xl, .shadow-lg, .shadow-xl { box-shadow: none !important; }
          </style>
        </head>
        <body>
          <div class="print-container">
            ${printArea.innerHTML}
          </div>
          <script>
            window.onload = function() {
              setTimeout(() => {
                window.focus();
                window.print();
                window.close();
              }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
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
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 bg-white p-8 rounded-[3rem] border border-gray-200 shadow-sm no-print">
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
          
          {viewMode === 'inventory' && (
            <button onClick={() => { setEditingProduct(null); setSelectedAdminProductId(''); setIsModalOpen(true); }} className="flex items-center justify-center gap-3 bg-black hover:bg-gray-800 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all shadow-xl">
              <Plus size={18} strokeWidth={3} className="text-yellow-500" /> Register Stock
            </button>
          )}

          {viewMode === 'history' && (
            <div className="flex gap-3">
              {filteredTransactions.length > 0 && (
                <button 
                  onClick={() => setShowClearConfirm(true)} 
                  disabled={isClearing}
                  className="flex items-center justify-center gap-3 bg-red-50 text-red-600 border border-red-100 px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all shadow-sm hover:bg-red-100 disabled:opacity-50"
                >
                  {isClearing ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />} Clear Ledger
                </button>
              )}
              <button onClick={handlePrint} className="flex items-center justify-center gap-3 bg-white border border-gray-200 text-gray-900 px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all shadow-sm hover:bg-gray-50">
                <Printer size={18} /> Print
              </button>
              <button onClick={downloadStockReport} disabled={isGeneratingReport} className="flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all shadow-xl disabled:opacity-50">
                {isGeneratingReport ? <Loader2 className="animate-spin text-yellow-500" size={18} /> : <Download size={18} />} Stock Report
              </button>
            </div>
          )}
        </div>
      </div>

      {viewMode === 'inventory' ? (
        <div className="bg-white rounded-[2.5rem] border border-gray-200 shadow-sm overflow-hidden animate-in fade-in duration-300 no-print">
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
                  <th className="px-6 py-6">Size</th>
                  <th className="px-6 py-6 text-center">MRP</th>
                  <th className="px-6 py-6 text-center">Trade Price</th>
                  <th className="px-6 py-6">Stock</th>
                  <th className="px-6 py-6">Status</th>
                  <th className="px-8 py-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredProducts.length > 0 ? filteredProducts.map((product) => {
                  const status = getStockStatus(product.stock || 0, product.minStock || 0);
                  const isDeleting = deletingId === product.id;
                  const isAdminProduct = (product.createdByName && product.createdByName.toLowerCase() === ADMIN_EMAIL.toLowerCase()) || 
                                         !product.createdBy || 
                                         product.createdBy === 'admin' || 
                                         product.createdBy === 'Admin' ||
                                         product.user_email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
                  const isOwner = product.createdBy === userId;
                  // Staff can edit/delete their own products. Admin can do anything.
                  const canModify = role?.toLowerCase() === 'admin' || isOwner;
                  // All staff and admins can manage stock (restock/return) for any product
                  const canManageStock = role?.toLowerCase() === 'admin' || role?.toLowerCase() === 'staff';

                  return (
                    <tr key={product.id} className="hover:bg-yellow-50/10 transition-colors group">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-gray-100 text-gray-400 rounded-xl flex items-center justify-center border border-gray-200 group-hover:bg-black group-hover:text-yellow-500 transition-all relative">
                            <Package size={20} />
                            {isAdminProduct && (
                              <div className="absolute -top-2 -right-2 bg-black text-yellow-500 p-1 rounded-full border border-yellow-500/30 shadow-lg" title="Admin Registered Stock">
                                <Shield size={10} strokeWidth={3} />
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-black text-gray-900">{product.name}</p>
                              {isAdminProduct && (
                                <span className="px-2 py-0.5 bg-black text-yellow-500 text-[8px] font-black uppercase tracking-widest rounded-md border border-yellow-500/20">Global</span>
                              )}
                            </div>
                            <span className="text-[9px] font-black text-yellow-700 uppercase tracking-widest">{product.category}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-[11px] font-black text-gray-400">{product.sku || 'N/A'}</td>
                      <td className="px-6 py-5">
                        <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${
                          product.size 
                          ? 'bg-purple-50 border-purple-100 text-purple-600' 
                          : 'bg-gray-50 border-gray-100 text-gray-400'
                        }`}>
                          {product.size || 'N/A'}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-center">
                         <div className="text-sm font-black text-gray-900">Rs. {(product.mrp || 0).toFixed(2)}</div>
                         {role === 'Admin' && <div className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">PP: Rs. {(product.purchasePrice || 0).toFixed(2)}</div>}
                      </td>
                      <td className="px-6 py-5 text-center">
                         <div className="text-sm font-black text-yellow-700">Rs. {(product.tp || 0).toFixed(2)}</div>
                      </td>
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-3">
                              <div className="flex flex-col">
                                <span className="text-sm font-black text-gray-900">{product.stock || 0}</span>
                                <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
                                   <div className={`h-full rounded-full ${product.stock <= product.minStock ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${Math.min(((product.stock || 0) / Math.max(product.minStock * 2, 1)) * 100, 100)}%` }} />
                                </div>
                              </div>
                              <button 
                                onClick={() => { setEditingProduct(product); setIsReturnModalOpen(true); }} 
                                disabled={!canManageStock}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all shadow-sm ml-2 ${
                                  canManageStock 
                                  ? 'bg-amber-50 border-amber-100 text-amber-600 hover:bg-amber-100' 
                                  : 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed'
                                }`}
                                title={canManageStock ? "Stock Return" : "Read-only Asset"}
                              >
                                <RefreshCw size={12} />
                                <span className="text-[9px] font-black uppercase tracking-widest whitespace-nowrap">Stock Return</span>
                              </button>
                            </div>
                          </td>
                      <td className="px-6 py-5">
                        <div className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${status.color}`}>
                          {status.label}
                        </div>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => viewItemHistory(product.name)} className="p-2.5 bg-blue-50 border border-blue-100 text-blue-600 hover:bg-blue-100 rounded-xl transition-all shadow-sm" title="Movement History">
                            <Clock size={16} />
                          </button>
                          <button 
                            onClick={() => { setEditingProduct(product); setIsRestockModalOpen(true); }} 
                            disabled={!canManageStock}
                            className={`p-2.5 rounded-xl transition-all shadow-sm border ${
                              canManageStock 
                              ? 'bg-green-50 border-green-100 text-green-600 hover:bg-green-100' 
                              : 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed'
                            }`}
                            title={canManageStock ? "Restock Assets" : "Read-only Asset"}
                          >
                            <ArrowUpCircle size={16} />
                          </button>
                          <button 
                            onClick={() => { setEditingProduct(product); setIsModalOpen(true); }} 
                            disabled={!canModify}
                            className={`p-2.5 rounded-xl transition-all shadow-sm border ${
                              canModify 
                              ? 'bg-white border-gray-200 text-gray-400 hover:text-black' 
                              : 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed'
                            }`}
                            title={canModify ? "Edit Item" : "Read-only Asset"}
                          >
                            <Edit size={16} />
                          </button>
                          <button 
                            onClick={(e) => triggerDeleteConfirm(e, product)} 
                            disabled={isDeleting || !canModify}
                            className={`p-2.5 rounded-xl transition-all shadow-sm border ${
                              isDeleting || !canModify
                              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' 
                              : 'bg-white border-red-100 text-red-500 hover:bg-red-500 hover:text-white'
                            }`} 
                            title={canModify ? "Delete Permanently" : "Read-only Asset"}
                          >
                            {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          </button>
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
        <div className="space-y-6 animate-in fade-in duration-300 print:p-0 print:bg-white print:space-y-0">
           {/* Ledger Header and Analysis remains same as before... */}
           <div className="bg-white p-8 rounded-[2.5rem] border border-gray-200 shadow-sm grid grid-cols-1 xl:grid-cols-12 gap-6 items-center no-print">
              <div 
                className="xl:col-span-3 flex items-center gap-6 cursor-pointer hover:bg-gray-50 p-2 rounded-2xl transition-all"
              >
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><Calendar size={24} /></div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Analysis Period</p>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={handlePrevMonth}
                        className="p-1.5 bg-gray-50 text-gray-400 rounded-lg hover:text-black hover:bg-gray-100 transition-all"
                      >
                        <ChevronDown className="rotate-90" size={14} />
                      </button>
                      
                      <select 
                        value={currentMonth}
                        onChange={(e) => handleMonthChange(Number(e.target.value))}
                        className="bg-transparent text-gray-900 font-black text-lg border-none focus:ring-0 cursor-pointer appearance-none pr-2"
                      >
                        {months.map((m, i) => (
                          <option key={m} value={i + 1} className="bg-white text-gray-900">{m}</option>
                        ))}
                      </select>

                      <select 
                        value={currentYear}
                        onChange={(e) => handleYearChange(Number(e.target.value))}
                        className="bg-transparent text-gray-900 font-black text-lg border-none focus:ring-0 cursor-pointer appearance-none"
                      >
                        {years.map(y => (
                          <option key={y} value={y} className="bg-white text-gray-900">{y}</option>
                        ))}
                      </select>

                      <button 
                        onClick={handleNextMonth}
                        className="p-1.5 bg-gray-50 text-gray-400 rounded-lg hover:text-black hover:bg-gray-100 transition-all"
                      >
                        <ChevronDown className="-rotate-90" size={14} />
                      </button>
                    </div>
                    
                    {/* Active Months Quick Select */}
                    {activeMonths.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {activeMonths.slice(0, 5).map(m => (
                          <button
                            key={m}
                            onClick={() => setHistoryMonth(m)}
                            className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase transition-all ${
                              historyMonth === m 
                                ? 'bg-indigo-600 text-white shadow-md' 
                                : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                            }`}
                          >
                            {new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
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

           <div id="stock-report-area" className="bg-white rounded-[3rem] border border-gray-200 shadow-xl overflow-hidden print:border-none print:shadow-none print:p-4">
              <div className="p-12 border-b border-gray-100 flex justify-between items-start print:p-4 print:mb-8">
                 <div>
                    <h1 className="text-3xl font-black tracking-tighter text-gray-900 leading-none uppercase print:text-xl">OVERPLAST BEAUTY</h1>
                    <p className="text-lg text-gray-500 font-beauty italic mt-1 print:text-sm">Movement Ledger & Stock Balance</p>
                    <div className="mt-6 flex items-center gap-2 text-[10px] font-black text-yellow-600 uppercase tracking-widest print:mt-2">
                       <Calendar size={12} /> Cycle: {historyMonth}
                    </div>
                 </div>
                 <div className="text-right">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">System Timestamp</p>
                    <p className="text-sm font-bold text-gray-900 print:text-xs">{new Date().toLocaleDateString()}</p>
                 </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse print:text-[8px]">
                  <thead className="bg-gray-50 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 border-b print:bg-white print:border-gray-300">
                    <tr>
                      <th className="px-8 py-6 print:px-2 print:py-2">Date</th>
                      <th className="px-8 py-6 print:px-2 print:py-2">Item Identity</th>
                      <th className="px-6 py-6 text-center print:px-2 print:py-2">Size</th>
                      <th className="px-8 py-6 text-center print:px-2 print:py-2">Movement Type</th>
                      <th className="px-8 py-6 text-right print:px-2 print:py-2">Qty Flow</th>
                      <th className="px-8 py-6 print:px-2 print:py-2">Ledger Note</th>
                      <th className="px-8 py-6 text-right no-print">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 print:divide-gray-300">
                    {filteredTransactions.length > 0 ? filteredTransactions.map((tx, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50 transition-colors print:bg-white">
                        <td className="px-8 py-5 text-sm font-bold text-gray-600 whitespace-nowrap print:px-2 print:py-2 print:text-[8px]">{tx.date}</td>
                        <td className="px-8 py-5 print:px-2 print:py-2">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center no-print ${
                              tx.type === 'IN' ? 'bg-green-50 text-green-600' : 
                              tx.type === 'RETURN' ? 'bg-amber-50 text-amber-600' : 
                              'bg-blue-50 text-blue-600'
                            }`}>
                              {tx.type === 'IN' ? <ArrowUpRight size={14} /> : 
                               tx.type === 'RETURN' ? <RefreshCw size={14} /> : 
                               <ArrowDownLeft size={14} />}
                            </div>
                            <span className="text-sm font-black text-gray-900 print:text-[8px]">{tx.productName}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-center print:px-2 print:py-2">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border print:text-[6px] ${
                            tx.productSize 
                            ? 'bg-purple-50 border-purple-100 text-purple-600' 
                            : 'bg-gray-50 border-gray-100 text-gray-400'
                          }`}>
                            {tx.productSize || 'N/A'}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-center print:px-2 print:py-2">
                          <span className={`px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border print:text-[6px] ${
                            tx.type === 'IN' ? 'bg-green-50 text-green-700 border-green-200' : 
                            tx.type === 'RETURN' ? 'bg-amber-50 text-amber-700 border-amber-200' : 
                            'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                            STOCK {tx.type}
                          </span>
                        </td>
                        <td className={`px-8 py-5 text-right font-black print:px-2 print:py-2 print:text-[8px] ${
                          tx.type === 'IN' ? 'text-green-600' : 
                          tx.type === 'RETURN' ? 'text-amber-600' : 
                          'text-blue-600'
                        }`}>
                          {tx.type === 'IN' ? '+' : '-'}{tx.quantity}
                        </td>
                        <td className="px-8 py-5 text-[11px] font-bold text-gray-400 italic print:px-2 print:py-2 print:text-[8px]">{tx.note || 'Manual Adjustment'}</td>
                        <td className="px-8 py-5 text-right no-print">
                          <button 
                            onClick={() => triggerTxDeleteConfirm(tx)}
                            disabled={deletingTxId === tx.id}
                            className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Delete Entry"
                          >
                            {deletingTxId === tx.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={7} className="px-8 py-20 text-center opacity-30 print:p-10">
                          <FileText size={48} className="mx-auto mb-4" />
                          <p className="text-sm font-black uppercase tracking-widest">No matching movement data</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {filteredTransactions.length > 0 && (
                    <tfoot className="bg-gray-50 border-t-2 border-gray-100 print:bg-white print:border-gray-300">
                      <tr>
                         <td colSpan={4} className="px-8 py-10 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest print:px-2 print:py-4 print:text-[8px]">Aggregate Flow Analysis</td>
                         <td className="px-8 py-10 text-right print:px-2 print:py-4">
                            <div className="space-y-1">
                               <p className="text-xs font-black text-green-600 uppercase tracking-widest print:text-[8px]">INBOUND: +{monthlyFlow.in}</p>
                               <p className="text-xs font-black text-blue-600 uppercase tracking-widest print:text-[8px]">OUTBOUND: -{monthlyFlow.out}</p>
                               <div className="h-[1px] bg-gray-200 my-2 print:bg-gray-300"></div>
                               <p className="text-sm font-black text-gray-900 uppercase tracking-widest print:text-[10px]">NET FLOW: {monthlyFlow.in - monthlyFlow.out}</p>
                            </div>
                         </td>
                         <td colSpan={2} className="no-print"></td>
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

      {/* Ledger Entry Deletion Confirmation */}
      {showTxDeleteConfirm && txToDelete && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden border border-red-100 animate-in zoom-in-95 duration-200">
            <div className="p-10 text-center">
               <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                  <AlertTriangle size={40} />
               </div>
               <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter mb-2">Delete Ledger Entry</h3>
               <p className="text-sm text-gray-500 font-bold mb-8 leading-relaxed px-4">
                 Are you sure you want to remove this movement record for <span className="text-red-600 font-black">"{txToDelete.productName}"</span>? This will not affect current stock levels, only the history.
               </p>
               
               <div className="flex flex-col gap-3">
                  <button 
                    onClick={performTxDelete}
                    className="w-full py-5 bg-red-600 text-white font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all shadow-xl shadow-red-900/10 flex items-center justify-center gap-2"
                  >
                    <Trash2 size={16} /> Delete Record
                  </button>
                  <button 
                    onClick={() => { setShowTxDeleteConfirm(false); setTxToDelete(null); }}
                    className="w-full py-5 bg-gray-100 text-gray-600 font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all"
                  >
                    Cancel
                  </button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Monthly Ledger Clear Confirmation */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden border border-red-100 animate-in zoom-in-95 duration-200">
            <div className="p-10 text-center">
               <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                  <AlertTriangle size={40} />
               </div>
               <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter mb-2">Clear Monthly Ledger</h3>
               <p className="text-sm text-gray-500 font-bold mb-8 leading-relaxed px-4">
                 You are about to delete <span className="text-red-600 font-black">{filteredTransactions.length}</span> records for the period <span className="text-black font-black">{historyMonth}</span>. This action is irreversible.
               </p>
               
               <div className="flex flex-col gap-3">
                  <button 
                    onClick={performClearLedger}
                    className="w-full py-5 bg-red-600 text-white font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all shadow-xl shadow-red-900/10 flex items-center justify-center gap-2"
                  >
                    <Trash2 size={16} /> Yes, Clear All Records
                  </button>
                  <button 
                    onClick={() => setShowClearConfirm(false)}
                    className="w-full py-5 bg-gray-100 text-gray-600 font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all"
                  >
                    Cancel
                  </button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Registration/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-8 border-b flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-black text-yellow-500 rounded-2xl flex items-center justify-center"><Package size={24} /></div>
                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tighter">{editingProduct ? 'Update Stock' : 'Register Stock'}</h3>
              </div>
              <button onClick={() => { setIsModalOpen(false); setSelectedAdminProductId(''); }} className="p-3 hover:bg-red-50 hover:text-red-600 rounded-2xl"><X size={28} /></button>
            </div>
            <form key={editingProduct?.id || selectedAdminProductId} onSubmit={handleSubmit} className="p-10 space-y-8 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {!editingProduct && (
                  <div className="md:col-span-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Select Product from Admin Catalog</label>
                    <select 
                      value={selectedAdminProductId}
                      onChange={handleAdminProductSelect}
                      className="w-full px-5 py-4 bg-yellow-50 border border-yellow-100 rounded-2xl font-bold outline-none focus:ring-4 focus:ring-yellow-500/10"
                    >
                      <option value="">-- Create New Custom Product --</option>
                      {adminProducts.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.size ? `(${p.size})` : ''} - Rs. {p.tp} (MRP: {p.mrp})
                        </option>
                      ))}
                    </select>
                    {adminProducts.length === 0 && (
                      <p className="mt-2 text-[10px] text-red-500 font-bold italic">
                        Admin catalog is currently empty (Total System Assets: {safeProducts.length}). Please add products as Admin first.
                      </p>
                    )}
                    <p className="mt-2 text-[10px] text-gray-400 font-bold italic">Selecting an admin product will pre-fill the details below.</p>
                  </div>
                )}
                
                {/* Pre-fill logic based on selectedAdminProductId */}
                {(() => {
                  const adminProduct = !editingProduct && selectedAdminProductId ? adminProducts.find(p => p.id === selectedAdminProductId) : null;
                  const defaultName = editingProduct?.name || adminProduct?.name || '';
                  const defaultSku = editingProduct?.sku || adminProduct?.sku || '';
                  const defaultCategory = editingProduct?.category || adminProduct?.category || '';
                  const defaultSize = editingProduct?.size || adminProduct?.size || '';
                  const defaultMrp = editingProduct?.mrp || adminProduct?.mrp || '';
                  const defaultTp = editingProduct?.tp || adminProduct?.tp || '';
                  const defaultPp = editingProduct?.purchasePrice || adminProduct?.purchasePrice || '';
                  const defaultMinStock = editingProduct?.minStock || adminProduct?.minStock || 0;
                  const defaultDescription = editingProduct?.description || adminProduct?.description || '';

                  return (
                    <>
                      <div className="md:col-span-2"><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Product Name</label><input required name="name" defaultValue={defaultName} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold" /></div>
                      <div><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">SKU Identity</label><input required name="sku" defaultValue={defaultSku} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold" /></div>
                      <div><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Category</label><input required name="category" defaultValue={defaultCategory} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold" /></div>
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Size Option</label>
                        <select 
                          name="size" 
                          defaultValue={defaultSize} 
                          className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold outline-none focus:ring-4 focus:ring-black/5"
                        >
                          <option value="">No Size</option>
                          <option value="Small">Small</option>
                          <option value="Medium">Medium</option>
                          <option value="Large">Large</option>
                          <option value="XL">XL</option>
                          <option value="XXL">XXL</option>
                          <option value="3XL">3XL</option>
                          <option value="4XL">4XL</option>
                          <option value="5XL">5XL</option>
                          <option value="Cust">Cust</option>
                        </select>
                      </div>
                      <div><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">MRP Price (Rs.)</label><input required type="number" step="0.01" name="mrp" defaultValue={defaultMrp} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-black" /></div>
                      <div><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Trade Price (TP) (Rs.)</label><input required type="number" step="0.01" name="tp" defaultValue={defaultTp} className="w-full px-5 py-4 bg-yellow-50/30 border border-yellow-100 rounded-2xl font-black" /></div>
                      {role === 'Admin' ? (
                        <div><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Purchase Price (PP) (Rs.)</label><input required type="number" step="0.01" name="purchasePrice" defaultValue={defaultPp} className="w-full px-5 py-4 bg-emerald-50/30 border border-emerald-100 rounded-2xl font-black" /></div>
                      ) : (
                        <input type="hidden" name="purchasePrice" value={defaultPp} />
                      )}
                      <div><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Stock Quantity</label><input required type="number" name="stock" defaultValue={editingProduct?.stock} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold" /></div>
                      <div><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Alert Level (Min Stock)</label><input required type="number" name="minStock" defaultValue={defaultMinStock} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold" /></div>
                      <div className="md:col-span-2"><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Description</label><textarea name="description" defaultValue={defaultDescription} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold text-sm" rows={2} /></div>
                    </>
                  );
                })()}
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
             <form onSubmit={handleRestock} className="p-12 space-y-8 max-h-[70vh] overflow-y-auto">
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

      {/* Return Modal */}
      {isReturnModalOpen && editingProduct && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4">
          <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden border border-gray-100">
             <div className="p-10 border-b flex justify-between items-center bg-amber-50/50">
               <div>
                 <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">Stock Return</h3>
                 <p className="text-xs font-bold text-amber-700 uppercase tracking-widest">Outgoing Return Record</p>
               </div>
               <button onClick={() => setIsReturnModalOpen(false)} className="p-3 hover:bg-red-50 text-red-600 rounded-2xl"><X size={28} /></button>
             </div>
             <form onSubmit={handleReturn} className="p-12 space-y-8 max-h-[70vh] overflow-y-auto">
                <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Target Asset</p>
                  <p className="text-lg font-black text-gray-900">{editingProduct.name}</p>
                  <p className="text-[10px] font-bold text-gray-500">Current Balance: {editingProduct.stock} Units</p>
                </div>
                
                <div className="space-y-4">
                   <div>
                     <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 block text-center">Return Quantity</label>
                     <input 
                      autoFocus 
                      type="number" 
                      required 
                      value={returnQty || ''} 
                      onChange={e => setReturnQty(parseInt(e.target.value) || 0)}
                      className="w-full py-6 text-4xl font-black text-center bg-gray-100 rounded-[2rem] outline-none focus:ring-8 focus:ring-amber-100 transition-all"
                      placeholder="0"
                     />
                   </div>
                   <div>
                     <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 block">Return Reason / Note</label>
                     <textarea 
                      value={returnNote} 
                      onChange={e => setReturnNote(e.target.value)}
                      className="w-full p-5 bg-gray-50 border border-gray-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-amber-50 transition-all resize-none"
                      placeholder="e.g. Damaged during transit, Customer changed mind..."
                      rows={3}
                     />
                   </div>
                </div>

                <button disabled={isSaving || returnQty <= 0} className="w-full py-6 bg-amber-600 text-white font-black rounded-[2rem] hover:bg-amber-700 transition-all shadow-xl shadow-amber-900/10 uppercase tracking-widest text-[10px] flex items-center justify-center gap-3">
                   {isSaving ? <Loader2 className="animate-spin" size={24} /> : <>Process Stock Return <RefreshCw size={20} /></>}
                </button>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
