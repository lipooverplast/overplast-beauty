
import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, FileText, CheckCircle, Clock, X, Eye, 
  Trash2, Loader2, Printer, Download, AlertCircle, 
  Sparkles, Upload, ArrowRight, Wallet, Banknote, 
  CreditCard, ChevronDown, Percent, Info, Shield, MapPin, Phone, AlertTriangle
} from 'lucide-react';
import { Invoice, Product, Client, InvoiceItem, UserRole, Payment, StockTransaction } from '../types';
import { db } from '../db';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { APP_LOGO_URL, APP_NAME } from '../constants';
import { geminiService } from '../geminiService';

const InvoiceLogo = () => (
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
          <p className="text-[7px] font-bold text-gray-400 uppercase tracking-tight">NTN/GST: 2521812-3</p>
        </div>
    </div>
  </div>
);

interface InvoicesProps {
  invoices: Invoice[];
  products: Product[];
  clients: Client[];
  onUpdate: () => void;
  role: UserRole;
  userId?: string;
  userEmail?: string;
  initialClientId?: string | null;
  onClearInitialClient?: () => void;
}

const Invoices: React.FC<InvoicesProps> = ({ invoices, products, clients, onUpdate, role, userId, userEmail, initialClientId, onClearInitialClient }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isParsingInvoice, setIsParsingInvoice] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [selectedItems, setSelectedItems] = useState<InvoiceItem[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [taxRate, setTaxRate] = useState(0);
  const [discountRate, setDiscountRate] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Credit'>('Cash');
  const [activeAssetId, setActiveAssetId] = useState(''); 
  const [assetSearchTerm, setAssetSearchTerm] = useState('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentNote, setPaymentNote] = useState('');
  
  // Deletion State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (initialClientId) {
      setSelectedClientId(initialClientId);
      setIsModalOpen(true);
      onClearInitialClient?.();
    }
  }, [initialClientId]);

  // Reset dropdown when modal opens/closes
  useEffect(() => {
    if (isModalOpen) {
      setActiveAssetId('');
      setAssetSearchTerm('');
    }
  }, [isModalOpen]);

  const calcDiscount = (mrp: number, tp: number) => {
    if (mrp <= 0 || tp >= mrp) return 0;
    return parseFloat((((mrp - tp) / mrp) * 100).toFixed(1));
  };

  const calculateSubtotal = () => selectedItems.reduce((sum, item) => sum + item.total, 0);
  const subtotal = calculateSubtotal();
  const discountTotal = subtotal * (discountRate / 100);
  const taxTotal = (subtotal - discountTotal) * (taxRate / 100);
  const grandTotal = subtotal - discountTotal + taxTotal;

  const addItem = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    if (product.stock <= 0) { 
      alert("No stock available for this asset."); 
      return; 
    }

    const existing = selectedItems.find(item => item.productId === productId);
    if (existing) {
      updateItem(productId, { quantity: existing.quantity + 1 });
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
        discount: calcDiscount(mrp, tp),
        total: tp
      }]);
    }
  };

  const updateItem = (productId: string, updates: Partial<InvoiceItem>) => {
    setSelectedItems(prev => prev.map(item => {
      if (item.productId !== productId) return item;
      const newItem = { ...item, ...updates };
      newItem.total = newItem.tp * (newItem.quantity || 0);
      newItem.discount = calcDiscount(newItem.mrp, newItem.tp);
      return newItem;
    }));
  };

  const handleAIParse = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingInvoice(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        const base64Data = base64.split(',')[1];
        const mimeType = file.type;

        const parsedData = await geminiService.parseInvoiceImage(base64Data, mimeType);
        
        if (parsedData.clientName) {
          const client = clients.find(c => c.name.toLowerCase().includes(parsedData.clientName!.toLowerCase()));
          if (client) setSelectedClientId(client.id);
        }

        if (parsedData.items && parsedData.items.length > 0) {
          const newItems: InvoiceItem[] = [];
          for (const item of parsedData.items) {
            const product = products.find(p => p.name.toLowerCase().includes(item.name.toLowerCase()));
            if (product) {
              const discount = calcDiscount(product.mrp, product.tp);
              newItems.push({
                productId: product.id,
                name: product.name,
                quantity: item.quantity || 1,
                price: product.tp,
                mrp: product.mrp,
                tp: product.tp,
                discount: discount,
                total: product.tp * (item.quantity || 1)
              });
            }
          }
          setSelectedItems(prev => [...prev, ...newItems]);
        }
        
        setIsParsingInvoice(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error("AI Parse Error:", err);
      alert("AI Parse Failed: " + (err.message || "Unknown error"));
      setIsParsingInvoice(false);
    }
  };

  const handleCreateInvoice = async () => {
    const client = clients.find(c => c.id === selectedClientId);
    if (!client) { alert("Please select a client."); return; }
    if (selectedItems.length === 0) { alert("Please add at least one item."); return; }

    setIsCreating(true);
    const newInvoice: Invoice = {
      id: db.generateUUID(),
      invoiceNumber: `OVI-${Math.floor(Math.random() * 90000) + 10000}`,
      clientId: client.id,
      clientName: client.name,
      date: new Date().toISOString().split('T')[0],
      items: selectedItems,
      subtotal,
      discountRate,
      discountTotal,
      taxRate,
      taxTotal,
      total: grandTotal,
      status: paymentMethod === 'Cash' ? 'Paid' : 'Pending',
      paymentMethod: paymentMethod,
      paidAmount: paymentMethod === 'Cash' ? grandTotal : 0,
      createdBy: userId,
      createdByName: userEmail
    };

    try {
      await db.saveInvoices([newInvoice]);
      
      const updatedProductEntries = products
        .filter(p => selectedItems.some(item => item.productId === p.id))
        .map(p => {
          const soldItem = selectedItems.find(item => item.productId === p.id);
          return { ...p, stock: Math.max(0, p.stock - (soldItem?.quantity || 0)) };
        });

      if (updatedProductEntries.length > 0) {
        await db.saveProducts(updatedProductEntries);
        
        // Create stock transactions for the activity log
        const transactions: StockTransaction[] = selectedItems.map(item => ({
          id: db.generateUUID(),
          productId: item.productId,
          productName: item.name,
          type: 'OUT',
          quantity: item.quantity,
          date: new Date().toISOString().split('T')[0],
          note: `Invoice #${newInvoice.invoiceNumber}`,
          createdBy: userId,
          createdByName: userEmail
        }));
        await db.saveStockTransactions(transactions);
      }
      
      onUpdate();
      setIsModalOpen(false);
      setSelectedItems([]);
      setSelectedClientId('');
      setActiveAssetId('');
      alert("Statement committed successfully. Stock updated.");
    } catch (err: any) {
      console.error("Invoice Creation Error:", err);
      alert("Failed to save invoice: " + (err.message || "Connectivity error. Try again."));
    } finally {
      setIsCreating(false);
    }
  };

  const triggerDeleteConfirm = (e: React.MouseEvent, invoice: Invoice) => {
    e.preventDefault();
    e.stopPropagation();
    if (role !== 'Admin') {
      alert("Unauthorized: Only Administrators can purge invoice records.");
      return;
    }
    setInvoiceToDelete(invoice);
    setShowDeleteConfirm(true);
  };

  const performDelete = async () => {
    if (!invoiceToDelete) return;
    const id = invoiceToDelete.id;
    setDeletingId(id);
    setShowDeleteConfirm(false);

    try {
      await db.deleteInvoice(id);
      if (viewingInvoice?.id === id) setViewingInvoice(null);
      await onUpdate();
    } catch (err: any) {
      console.error("Invoice Deletion Core Error:", err);
      alert("System Failure: Could not delete statement record. " + (err.message || "Unknown Error"));
    } finally {
      setDeletingId(null);
      setInvoiceToDelete(null);
    }
  };

  useEffect(() => {
    if (viewingInvoice) {
      fetchPayments(viewingInvoice.id);
    }
  }, [viewingInvoice]);

  const fetchPayments = async (invoiceId: string) => {
    try {
      const isAdmin = role === 'Admin';
      const filterId = isAdmin ? undefined : userId;
      const data = await db.getPayments(invoiceId, filterId);
      setPayments(data);
    } catch (err) {
      console.error("Error fetching payments:", err);
    }
  };

  const handleRecordPayment = async () => {
    if (!viewingInvoice || paymentAmount <= 0) return;
    
    const remaining = viewingInvoice.total - (viewingInvoice.paidAmount || 0);
    if (paymentAmount > remaining) {
      alert("Payment amount cannot exceed remaining balance.");
      return;
    }

    const newPayment: Payment = {
      id: db.generateUUID(),
      invoiceId: viewingInvoice.id,
      amount: paymentAmount,
      date: new Date().toISOString().split('T')[0],
      note: paymentNote,
      createdBy: userId,
    };

    try {
      await db.savePayment(newPayment);
      
      const newPaidAmount = (viewingInvoice.paidAmount || 0) + paymentAmount;
      const updatedInvoice: Invoice = {
        ...viewingInvoice,
        paidAmount: newPaidAmount,
        status: newPaidAmount >= viewingInvoice.total ? 'Paid' : 'Pending'
      };

      await db.saveInvoices([updatedInvoice]);
      setViewingInvoice(updatedInvoice);
      setPayments([newPayment, ...payments]);
      setIsRecordingPayment(false);
      setPaymentAmount(0);
      setPaymentNote('');
      onUpdate();
    } catch (err: any) {
      alert("Failed to record payment: " + err.message);
    }
  };

  const handleMarkAsPaid = async (invoice: Invoice) => {
    if (invoice.status === 'Paid') return;
    
    const updatedInvoice: Invoice = {
      ...invoice,
      status: 'Paid',
      paymentMethod: 'Cash',
      paidAmount: invoice.total
    };

    try {
      await db.saveInvoices([updatedInvoice]);
      if (viewingInvoice?.id === invoice.id) {
        setViewingInvoice(updatedInvoice);
      }
      onUpdate();
    } catch (err: any) {
      console.error("Payment Update Error:", err);
      alert("Failed to update payment status.");
    }
  };

  const exportToPdf = async () => {
    if (!viewingInvoice) return;
    setIsGeneratingPdf(true);
    const element = document.getElementById('printable-invoice-area');
    if (!element) {
      alert("Error: Print area not found.");
      setIsGeneratingPdf(false);
      return;
    }

    try {
      // Wait for any animations or rendering to complete
      await new Promise(r => setTimeout(r, 800));
      
      const canvas = await html2canvas(element, { 
        scale: 3, // Higher scale for better quality
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: element.scrollWidth,
        height: element.scrollHeight,
        windowWidth: 1200, // Fixed window width to ensure consistent layout
        onclone: (clonedDoc) => {
          const clonedElement = clonedDoc.getElementById('printable-invoice-area');
          if (clonedElement) {
            // Force the element to be fully expanded and visible
            clonedElement.style.overflow = 'visible';
            clonedElement.style.maxHeight = 'none';
            clonedElement.style.height = 'auto';
            clonedElement.style.padding = '60px'; // More padding for PDF margins
            clonedElement.style.width = '1100px'; // Fixed width for capture
            clonedElement.style.margin = '0';
            clonedElement.style.boxSizing = 'border-box';
            clonedElement.style.transform = 'none';
            
            // Fix grid layouts which html2canvas sometimes struggles with
            const gridElements = clonedElement.querySelectorAll('.grid');
            gridElements.forEach(el => {
              const htmlEl = el as HTMLElement;
              if (htmlEl.classList.contains('grid-cols-2')) {
                htmlEl.style.display = 'flex';
                htmlEl.style.flexDirection = 'row';
                htmlEl.style.justifyContent = 'space-between';
                htmlEl.style.gap = '40px';
                Array.from(htmlEl.children).forEach(child => {
                  (child as HTMLElement).style.flex = '1';
                });
              }
            });

            // Ensure tables are fully rendered and not cut
            const tables = clonedElement.querySelectorAll('table');
            tables.forEach(table => {
              (table as HTMLElement).style.width = '100%';
              (table as HTMLElement).style.tableLayout = 'fixed';
              (table as HTMLElement).style.borderCollapse = 'collapse';
            });

            // Ensure all text is visible and remove any animations
            const allElements = clonedElement.querySelectorAll('*');
            allElements.forEach(el => {
              const htmlEl = el as HTMLElement;
              htmlEl.style.animation = 'none';
              htmlEl.style.transition = 'none';
              const style = window.getComputedStyle(el);
              if (style.opacity === '0') {
                htmlEl.style.opacity = '1';
              }
            });
          }
        }
      });
      
      const imgData = canvas.toDataURL('image/png', 1.0);
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
        compress: true
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      // Add first page
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pdfHeight;

      // Add subsequent pages if content is long
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
        heightLeft -= pdfHeight;
      }

      pdf.save(`Overplast_Invoice_${viewingInvoice.invoiceNumber}.pdf`);
    } catch (err) {
      console.error("PDF Export Error:", err);
      alert("PDF Generation Failed. Please try again.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const viewingClient = viewingInvoice ? clients.find(c => c.id === viewingInvoice.clientId) : null;
  const totalSavings = viewingInvoice?.items.reduce((sum, item) => sum + ((item.mrp - item.tp) * item.quantity), 0) || 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Billing Ledger</h2>
          <p className="text-sm text-gray-500 font-medium italic">History of {invoices.length} business statements.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="bg-black hover:bg-gray-800 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2 shadow-xl transition-all">
          <Plus size={18} className="text-yellow-500" /> Create New Statement
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 border-b">
              <tr>
                <th className="px-6 py-6">Statement #</th>
                <th className="px-6 py-6">Client</th>
                <th className="px-6 py-6">Method</th>
                <th className="px-6 py-6 text-right">Total</th>
                <th className="px-6 py-6 text-right">Paid</th>
                <th className="px-6 py-6 text-right">Balance</th>
                <th className="px-6 py-6 text-center">Status</th>
                <th className="px-6 py-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map(inv => {
                const isDeleting = deletingId === inv.id;
                const pMethod = inv.paymentMethod || 'Cash';
                const paid = pMethod === 'Cash' ? inv.total : (inv.paidAmount || 0);
                const balance = inv.total - paid;
                return (
                  <tr key={inv.id} onClick={() => setViewingInvoice(inv)} className="hover:bg-yellow-50/20 cursor-pointer transition-colors group">
                    <td className="px-6 py-5 font-black text-gray-900">
                      {inv.invoiceNumber}
                      <p className="text-[8px] text-gray-400 font-bold mt-1">{inv.date}</p>
                    </td>
                    <td className="px-6 py-5 font-bold text-gray-600">{inv.clientName}</td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase text-gray-400">
                         {pMethod === 'Cash' ? <Banknote size={12} className="text-green-500" /> : <CreditCard size={12} className="text-blue-500" />}
                         {pMethod}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right font-black text-gray-900">Rs. {(inv.total || 0).toLocaleString()}</td>
                    <td className="px-6 py-5 text-right font-bold text-green-600">Rs. {(paid || 0).toLocaleString()}</td>
                    <td className="px-6 py-5 text-right font-bold text-red-600">Rs. {(balance || 0).toLocaleString()}</td>
                    <td className="px-6 py-5 text-center">
                      <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${inv.status === 'Paid' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{inv.status}</span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {inv.status === 'Pending' && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleMarkAsPaid(inv); }}
                            className="p-2.5 bg-green-50 border border-green-100 rounded-xl text-green-600 hover:bg-green-600 hover:text-white transition-all shadow-sm"
                            title="Mark as Paid"
                          >
                            <CheckCircle size={16} />
                          </button>
                        )}
                        <button 
                          onClick={(e) => { e.stopPropagation(); setViewingInvoice(inv); }}
                          className="p-2.5 bg-white border border-gray-200 rounded-xl text-gray-400 hover:text-black transition-all shadow-sm"
                        >
                          <Eye size={16} />
                        </button>
                        {role === 'Admin' && (
                          <button 
                            onClick={(e) => triggerDeleteConfirm(e, inv)} 
                            disabled={isDeleting}
                            className={`p-2.5 rounded-xl transition-all shadow-sm border ${
                              isDeleting 
                              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' 
                              : 'bg-white border-red-100 text-red-500 hover:bg-red-500 hover:text-white'
                            }`} 
                            title="Purge Record"
                          >
                            {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center opacity-30">
                    <FileText size={48} className="mx-auto mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest">No statements registered</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Custom Deletion Confirmation Modal */}
      {showDeleteConfirm && invoiceToDelete && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden border border-red-100 animate-in zoom-in-95 duration-200">
            <div className="p-10 text-center">
               <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                  <AlertTriangle size={40} />
               </div>
               <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter mb-2">Delete Statement</h3>
               <p className="text-sm text-gray-500 font-bold mb-8 leading-relaxed px-4">
                 Are you sure you want to permanently delete invoice <span className="text-red-600 font-black">"{invoiceToDelete.invoiceNumber}"</span>? This record will be purged from the financial archives.
               </p>
               
               <div className="flex flex-col gap-3">
                  <button 
                    onClick={performDelete}
                    className="w-full py-5 bg-red-600 text-white font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all shadow-xl shadow-red-900/10 flex items-center justify-center gap-2"
                  >
                    <Trash2 size={16} /> Yes, Purge Record
                  </button>
                  <button 
                    onClick={() => { setShowDeleteConfirm(false); setInvoiceToDelete(null); }}
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

      {/* Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-6xl rounded-[3rem] overflow-hidden flex flex-col max-h-[85vh] shadow-2xl animate-in zoom-in-95 my-auto">
            <div className="p-8 border-b flex justify-between items-center bg-gray-50/50">
              <div className="flex items-center gap-4">
                 <div className="p-3 bg-black text-yellow-500 rounded-2xl shadow-lg"><FileText size={24} /></div>
                 <h3 className="text-3xl font-black uppercase tracking-tighter">Statement</h3>
              </div>
              <div className="flex bg-gray-200 p-1.5 rounded-2xl border border-gray-300">
                <button onClick={() => setPaymentMethod('Cash')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${paymentMethod === 'Cash' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500'}`}>Cash</button>
                <button onClick={() => setPaymentMethod('Credit')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${paymentMethod === 'Credit' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>Credit</button>
              </div>
              <div className="flex items-center gap-3">
                <label className={`flex items-center gap-3 px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase cursor-pointer hover:bg-indigo-700 shadow-lg transition-all ${isParsingInvoice ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {isParsingInvoice ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {isParsingInvoice ? 'AI Parsing...' : 'AI Scan Invoice'}
                  <input type="file" accept="image/*" onChange={handleAIParse} className="hidden" disabled={isParsingInvoice} />
                </label>
                <button onClick={() => setIsModalOpen(false)} className="p-3 hover:bg-red-50 text-red-600 rounded-2xl"><X size={28} /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-10 space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                <div className="md:col-span-2">
                  <label className="text-[10px] font-black uppercase text-gray-400 mb-2 block tracking-widest">Client Portfolio</label>
                  <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)} className="w-full p-5 bg-gray-50 border border-gray-200 rounded-[1.25rem] font-bold outline-none">
                    <option value="">Select Target Client...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Asset Select</label>
                    <div className="relative group">
                      <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-yellow-500 transition-colors" />
                      <input 
                        type="text" 
                        placeholder="Find asset..." 
                        value={assetSearchTerm} 
                        onChange={e => setAssetSearchTerm(e.target.value)}
                        className="pl-6 pr-2 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-bold outline-none focus:ring-2 focus:ring-yellow-400 w-28 transition-all"
                      />
                    </div>
                  </div>
                  <select 
                    value={activeAssetId} 
                    onChange={e => { 
                      const val = e.target.value;
                      setActiveAssetId(val); 
                      if(val) addItem(val); 
                    }} 
                    className="w-full p-5 bg-yellow-50 text-yellow-800 border-yellow-200 border rounded-[1.25rem] font-black text-xs outline-none"
                  >
                    <option value="">+ SELECT ASSET...</option>
                    {products
                      .filter(p => 
                        p.name.toLowerCase().includes(assetSearchTerm.toLowerCase()) || 
                        p.sku?.toLowerCase().includes(assetSearchTerm.toLowerCase())
                      )
                      .map(p => <option key={p.id} value={p.id}>{p.name} {p.size ? `(${p.size})` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 mb-2 block tracking-widest">Discount (%)</label>
                  <input type="number" value={discountRate} onChange={e => setDiscountRate(parseFloat(e.target.value) || 0)} className="w-full p-5 bg-red-50 border border-red-100 rounded-[1.25rem] font-black outline-none text-center text-red-600" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 mb-2 block tracking-widest">Tax (%)</label>
                  <input type="number" value={taxRate} onChange={e => setTaxRate(parseFloat(e.target.value) || 0)} className="w-full p-5 bg-gray-50 border border-gray-200 rounded-[1.25rem] font-black outline-none text-center" />
                </div>
              </div>

              <div className="border border-gray-100 rounded-[2.5rem] overflow-hidden bg-white shadow-xl">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] border-b">
                    <tr>
                      <th className="px-8 py-6">Asset Description</th>
                      <th className="px-6 py-6 text-center">Size</th>
                      <th className="px-6 py-6 text-center">MRP</th>
                      <th className="px-6 py-6 text-center">Trade Price</th>
                      <th className="px-6 py-6 text-center">Qty</th>
                      <th className="px-8 py-6 text-right">Line Total</th>
                      <th className="px-6 py-6"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedItems.map(item => (
                      <tr key={item.productId}>
                        <td className="px-8 py-5">
                          <p className="font-black text-gray-900">{item.name}</p>
                          <p className="text-[9px] text-gray-400 uppercase tracking-widest font-bold">Ref: {item.productId.slice(-4)}</p>
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
                        <td className="px-6 py-5 text-center text-xs font-bold text-gray-400 line-through">Rs. {item.mrp}</td>
                        <td className="px-6 py-5 text-center">
                          <input type="number" value={item.tp} onChange={e => updateItem(item.productId, { tp: parseFloat(e.target.value) || 0 })} className="w-24 bg-yellow-50 border border-yellow-100 rounded-xl p-2.5 text-center font-black outline-none text-yellow-700" />
                        </td>
                        <td className="px-6 py-5 text-center">
                          <input type="number" min="1" value={item.quantity} onChange={e => updateItem(item.productId, { quantity: parseInt(e.target.value) || 1 })} className="w-16 bg-gray-100 border-none rounded-xl p-2.5 text-center font-black outline-none" />
                        </td>
                        <td className="px-8 py-5 text-right font-black text-gray-900">Rs. {(item.total || 0).toLocaleString()}</td>
                        <td className="px-6 py-5 text-right">
                          <button onClick={() => setSelectedItems(selectedItems.filter(i => i.productId !== item.productId))} className="p-2 text-red-300 hover:text-red-600 transition-colors"><Trash2 size={18} /></button>
                        </td>
                      </tr>
                    ))}
                    {selectedItems.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-8 py-20 text-center opacity-20 italic font-bold">Inventory items will appear here after selection.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

             <div className="p-10 border-t bg-gray-50 flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="grid grid-cols-4 gap-12">
                <div>
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Subtotal</p>
                   <p className="text-xl font-black text-gray-900">Rs. {(subtotal || 0).toLocaleString()}</p>
                </div>
                <div>
                   <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Discount ({discountRate}%)</p>
                   <p className="text-xl font-black text-red-600">Rs. {(discountTotal || 0).toLocaleString()}</p>
                </div>
                <div>
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Tax ({taxRate}%)</p>
                   <p className="text-xl font-black text-yellow-600">Rs. {(taxTotal || 0).toLocaleString()}</p>
                </div>
                <div>
                   <p className="text-[10px] font-black text-yellow-600 uppercase tracking-widest mb-1">Final Amount</p>
                   <p className="text-4xl font-black text-black tracking-tighter">Rs. {(grandTotal || 0).toLocaleString()}</p>
                </div>
              </div>
              <button 
                onClick={handleCreateInvoice} 
                disabled={isCreating || selectedItems.length === 0} 
                className="px-14 py-6 bg-black text-white rounded-3xl font-black uppercase tracking-[0.2em] text-[10px] hover:bg-gray-900 transition-all flex items-center gap-4 disabled:opacity-50 shadow-xl"
              >
                {isCreating ? <Loader2 className="animate-spin text-yellow-500" size={24} /> : <>Commit Record <ArrowRight size={20} className="text-yellow-500" /></>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail View Modal */}
      {viewingInvoice && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/95 backdrop-blur-md p-4 overflow-y-auto no-print">
          <div className="bg-white w-full max-w-5xl max-h-[85vh] rounded-[3rem] overflow-hidden flex flex-col shadow-2xl my-auto animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b flex justify-between items-center bg-gray-50/50 sticky top-0 z-10 no-print border-gray-100">
              <div className="flex items-center gap-4">
                 <FileText size={20} className="text-yellow-500" />
                 <h3 className="text-xl font-black uppercase tracking-widest">{viewingInvoice.invoiceNumber}</h3>
                 <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${viewingInvoice.status === 'Paid' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{viewingInvoice.status}</span>
              </div>
              <div className="flex items-center gap-3">
                {viewingInvoice.status === 'Pending' && (
                  <>
                    <button 
                      onClick={() => {
                        setPaymentAmount(viewingInvoice.total - (viewingInvoice.paidAmount || 0));
                        setIsRecordingPayment(true);
                      }}
                      className="flex items-center gap-3 px-6 py-3 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase hover:bg-blue-700 shadow-lg transition-all"
                    >
                      <Wallet size={18} /> Record Payment
                    </button>
                    <button 
                      onClick={() => handleMarkAsPaid(viewingInvoice)}
                      className="flex items-center gap-3 px-6 py-3 bg-green-600 text-white rounded-xl font-black text-[10px] uppercase hover:bg-green-700 shadow-lg transition-all"
                    >
                      <CheckCircle size={18} /> Mark as Paid
                    </button>
                  </>
                )}
                <button onClick={handlePrint} className="flex items-center gap-3 px-6 py-3 bg-white border border-gray-200 rounded-xl font-black text-[10px] uppercase hover:bg-gray-50 transition-all"><Printer size={18} /> Print</button>
                <button onClick={exportToPdf} disabled={isGeneratingPdf} className="flex items-center gap-3 px-6 py-3 bg-black text-white rounded-xl font-black text-[10px] uppercase hover:bg-gray-900 shadow-lg transition-all">
                  {isGeneratingPdf ? <Loader2 className="animate-spin text-yellow-500" size={18} /> : <Download size={18} />} PDF
                </button>
                {role === 'Admin' && (
                  <button 
                    onClick={(e) => triggerDeleteConfirm(e, viewingInvoice)} 
                    className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all"
                    title="Purge Invoice"
                  >
                    <Trash2 size={24} />
                  </button>
                )}
                <button onClick={() => setViewingInvoice(null)} className="p-3 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all"><X size={24} /></button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-16 md:p-24 bg-white" id="printable-invoice-area">
              <div className="flex justify-between items-start mb-24">
                <InvoiceLogo />
                <div className="text-right">
                  <h1 className="text-6xl font-black text-gray-900 tracking-tighter mb-4 opacity-5 uppercase leading-none">BILL</h1>
                  <p className="text-xl font-black text-black">{viewingInvoice.invoiceNumber}</p>
                  <p className="text-sm font-bold text-gray-400 tracking-widest uppercase">{viewingInvoice.date}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-20 mb-20">
                <div>
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-4">Client Portfolio</h4>
                  <p className="text-3xl font-black text-gray-900">{viewingInvoice.clientName}</p>
                  
                  {viewingClient?.address && (
                    <div className="mt-4 flex items-start gap-2 text-gray-500">
                      <MapPin size={16} className="mt-1 flex-shrink-0 text-yellow-600" />
                      <p className="text-sm font-bold leading-relaxed">{viewingClient.address}</p>
                    </div>
                  )}
                  {viewingClient?.phone && (
                    <div className="mt-2 flex items-center gap-2 text-gray-500">
                      <Phone size={14} className="flex-shrink-0 text-yellow-600" />
                      <p className="text-xs font-black uppercase tracking-widest">{viewingClient.phone}</p>
                    </div>
                  )}
                </div>
                <div className="text-right space-y-6">
                  <div>
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-4">Payment Mode</h4>
                    <div className="flex justify-end items-center">
                       <div className="px-10 py-5 border-4 border-black inline-block bg-white shadow-sm">
                          <span className="text-3xl font-black uppercase tracking-tighter text-black">
                            {viewingInvoice.paymentMethod || 'Cash'}
                          </span>
                       </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-20">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b-4 border-black">
                      <th className="py-6 text-left text-[11px] font-black uppercase tracking-widest">Item Description</th>
                      <th className="py-6 text-center text-[11px] font-black uppercase tracking-widest">Size</th>
                      <th className="py-6 text-center text-[11px] font-black uppercase tracking-widest">Quantity</th>
                      <th className="py-6 text-center text-[11px] font-black uppercase tracking-widest">MRP</th>
                      <th className="py-6 text-center text-[11px] font-black uppercase tracking-widest">Trade Price</th>
                      <th className="py-6 text-right text-[11px] font-black uppercase tracking-widest">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {viewingInvoice.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-6">
                          <p className="font-black text-gray-900">{item.name}</p>
                        </td>
                        <td className="py-6 text-center font-black text-gray-900">{item.size || 'N/A'}</td>
                        <td className="py-6 text-center font-black text-gray-900">{item.quantity}</td>
                        <td className="py-6 text-center font-black text-gray-900">Rs. {item.mrp}</td>
                        <td className="py-6 text-center font-black text-gray-900">Rs. {item.tp}</td>
                        <td className="py-6 text-right font-black text-gray-900">Rs. {(item.total || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-4 border-black">
                      <td colSpan={4}></td>
                      <td className="py-8 text-right font-black text-gray-400 uppercase text-[10px] tracking-widest">Subtotal</td>
                      <td className="py-8 text-right font-black text-gray-900 text-xl">Rs. {(viewingInvoice.subtotal || 0).toLocaleString()}</td>
                    </tr>
                    {viewingInvoice.discountTotal > 0 && (
                      <tr>
                        <td colSpan={4}></td>
                        <td className="py-2 text-right font-black text-red-400 uppercase text-[10px] tracking-widest">Discount ({viewingInvoice.discountRate}%)</td>
                        <td className="py-2 text-right font-black text-red-600 text-xl">Rs. {(viewingInvoice.discountTotal || 0).toLocaleString()}</td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={4}></td>
                      <td className="py-2 text-right font-black text-gray-400 uppercase text-[10px] tracking-widest">Tax ({viewingInvoice.taxRate}%)</td>
                      <td className="py-2 text-right font-black text-yellow-600 text-xl">Rs. {(viewingInvoice.taxTotal || 0).toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td colSpan={4}></td>
                      <td className="py-4 text-right font-black text-black uppercase text-[10px] tracking-widest">Total Amount</td>
                      <td className="py-4 text-right font-black text-black text-4xl tracking-tighter">Rs. {(viewingInvoice.total || 0).toLocaleString()}</td>
                    </tr>
                    {(viewingInvoice.paidAmount && viewingInvoice.paidAmount > 0) || viewingInvoice.paymentMethod === 'Cash' ? (
                      <>
                        <tr className="border-t border-gray-100">
                          <td colSpan={4}></td>
                          <td className="py-2 text-right font-black text-green-600 uppercase text-[10px] tracking-widest">Amount Paid</td>
                          <td className="py-2 text-right font-black text-green-600 text-xl">Rs. {(viewingInvoice.paymentMethod === 'Cash' ? viewingInvoice.total : (viewingInvoice.paidAmount || 0)).toLocaleString()}</td>
                        </tr>
                        <tr>
                          <td colSpan={4}></td>
                          <td className="py-2 text-right font-black text-red-600 uppercase text-[10px] tracking-widest">Remaining Balance</td>
                          <td className="py-2 text-right font-black text-red-600 text-xl">Rs. {(viewingInvoice.total - (viewingInvoice.paymentMethod === 'Cash' ? viewingInvoice.total : (viewingInvoice.paidAmount || 0))).toLocaleString()}</td>
                        </tr>
                      </>
                    ) : null}
                  </tfoot>
                </table>
              </div>

              {/* Payment History Section */}
              {payments.length > 0 && (
                <div className="mb-20 no-print">
                  <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.4em] mb-8 border-b border-gray-100 pb-4">Payment History</h4>
                  <div className="space-y-4">
                    {payments.map((p, idx) => (
                      <div key={idx} className="flex items-center justify-between p-6 bg-gray-50 rounded-2xl border border-gray-100">
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-green-100 text-green-600 rounded-xl">
                            <Banknote size={18} />
                          </div>
                          <div>
                            <p className="text-sm font-black text-gray-900">Rs. {p.amount.toLocaleString()}</p>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{p.date}</p>
                          </div>
                        </div>
                        {p.note && <p className="text-xs font-bold text-gray-500 italic">"{p.note}"</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-20 border-t border-gray-100 flex justify-between items-end opacity-40 grayscale">
                 <div>
                   <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-1">Authenticity Node</p>
                   <p className="text-xs font-bold">Overplast Beauty Cloud ERP v2.5</p>
                 </div>
                 <div className="text-right">
                   <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-1">Authorization</p>
                   <p className="text-xs font-black">Digital Statement - No Signature Required</p>
                 </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Record Payment Modal */}
      {isRecordingPayment && viewingInvoice && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-xl font-black uppercase tracking-tighter">Record Payment</h3>
              <button onClick={() => setIsRecordingPayment(false)} className="text-gray-400 hover:text-red-600 transition-colors"><X size={24} /></button>
            </div>
            <div className="p-10 space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Payment Amount (Rs.)</label>
                <input 
                  type="number" 
                  value={paymentAmount} 
                  onChange={e => setPaymentAmount(parseFloat(e.target.value) || 0)}
                  className="w-full p-5 bg-gray-50 border border-gray-200 rounded-2xl font-black text-xl outline-none focus:ring-4 focus:ring-blue-50 transition-all"
                  placeholder="0.00"
                />
                <p className="mt-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Remaining: Rs. {(viewingInvoice.total - (viewingInvoice.paidAmount || 0)).toLocaleString()}</p>
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Note (Optional)</label>
                <textarea 
                  value={paymentNote}
                  onChange={e => setPaymentNote(e.target.value)}
                  className="w-full p-5 bg-gray-50 border border-gray-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-blue-50 transition-all resize-none"
                  rows={3}
                  placeholder="e.g. Partial payment via bank transfer..."
                />
              </div>
              <button 
                onClick={handleRecordPayment}
                className="w-full py-6 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-700 shadow-xl transition-all"
              >
                Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Invoices;
