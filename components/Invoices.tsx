
import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, FileText, CheckCircle, Clock, X, Eye, 
  Trash2, Loader2, Printer, Download, AlertCircle, 
  Sparkles, Upload, ArrowRight, Wallet, Banknote, 
  CreditCard, ChevronDown, Percent, Info, Shield, MapPin, Phone, AlertTriangle, RotateCcw, Pencil
} from 'lucide-react';
import { Invoice, Product, Client, InvoiceItem, UserRole, Payment, StockTransaction } from '../types';
import { db } from '../db';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';
import { APP_LOGO_URL, APP_NAME, ADMIN_EMAIL } from '../constants';
import { geminiService } from '../geminiService';

const InvoiceLogo = () => (
  <div className="flex items-center gap-6">
    <div className="w-24 h-24 bg-white rounded-2xl flex items-center justify-center p-3 shadow-lg border border-gray-100">
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
        <h1 className="text-4xl font-black tracking-tighter text-gray-900 leading-none uppercase">OVERPLAST</h1>
        <p className="font-beauty text-2xl text-gray-800 italic mt-1 leading-none">Beauty</p>
        <p className="text-[10px] font-black text-yellow-600 uppercase tracking-widest mt-2">Cloud Base Management System</p>
        <div className="mt-3 space-y-1 border-t border-gray-100 pt-2">
          <p className="text-[11px] font-bold text-gray-600 uppercase tracking-tight">341-F, Johar Town, Lahore, PK</p>
          <p className="text-[11px] font-bold text-gray-600 uppercase tracking-tight">Ph: +92 301 844 4449</p>
          <p className="text-[11px] font-bold text-gray-600 lowercase tracking-tight">Email: care@overplast.org</p>
          <p className="text-[11px] font-bold text-gray-600 uppercase tracking-tight">NTN/GST: 2521812-3</p>
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
  const [isEditing, setIsEditing] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [isParsingInvoice, setIsParsingInvoice] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [selectedItems, setSelectedItems] = useState<InvoiceItem[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [taxRate, setTaxRate] = useState(0);
  const [discountRate, setDiscountRate] = useState(0);
  const [salesPerson, setSalesPerson] = useState('');
  const [expenseType, setExpenseType] = useState('');
  const [expenseAmount, setExpenseAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Credit'>('Cash');
  const [activeAssetId, setActiveAssetId] = useState(''); 
  const [assetSearchTerm, setAssetSearchTerm] = useState('');
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  const [invoiceToReturn, setInvoiceToReturn] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentNote, setPaymentNote] = useState('');
  const [searchSalesPerson, setSearchSalesPerson] = useState('');

  const exportToExcel = () => {
    const dataToExport = filteredInvoices.map(inv => {
      const pMethod = inv.paymentMethod || 'Cash';
      const isReturned = inv.status === 'Returned';
      const paid = isReturned ? 0 : (pMethod === 'Cash' ? inv.total : (inv.paidAmount || 0));
      const balance = isReturned ? 0 : (inv.total - paid);
      
      return {
        'Statement #': inv.invoiceNumber,
        'Date': inv.date,
        'Client': inv.clientName,
        'Sales Person': inv.salesPerson || inv.createdByName || 'N/A',
        'Method': pMethod,
        'Subtotal': inv.subtotal,
        'Discount': inv.discountTotal,
        'Tax': inv.taxTotal,
        'Expenses': inv.expenseAmount || 0,
        'Total': inv.total,
        'Paid': paid,
        'Balance': balance,
        'Status': inv.status
      };
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Billing Ledger");
    XLSX.writeFile(wb, `Overplast_Billing_Ledger_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  
  // Deletion State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  const filteredProducts = React.useMemo(() => {
    // Deduplicate products by Name+Size+Color+Type to ensure unique catalog entries
    const uniqueMap = new Map();
    products.forEach(p => {
      const name = (p.name || '').trim().toLowerCase();
      const size = (p.size || '').trim().toLowerCase();
      const color = (p.color || '').trim().toLowerCase();
      const type = (p.productType || '').trim().toLowerCase();
      
      const key = `${name}|${size}|${color}|${type}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, p);
      } else {
        // If duplicate found, we could potentially sum stock here if needed, 
        // but for now we follow the Inventory Vault logic of picking the first one.
      }
    });
    return Array.from(uniqueMap.values()) as Product[];
  }, [products]);

  useEffect(() => {
    if (initialClientId) {
      setSelectedClientId(initialClientId);
      setIsModalOpen(true);
      onClearInitialClient?.();
    }
  }, [initialClientId]);

  const filteredInvoices = React.useMemo(() => {
    return invoices.filter(inv => {
      const matchesSalesPerson = (inv.salesPerson || '').toLowerCase().includes(searchSalesPerson.toLowerCase()) ||
                                (inv.createdByName || '').toLowerCase().includes(searchSalesPerson.toLowerCase());
      return matchesSalesPerson;
    });
  }, [invoices, searchSalesPerson]);

  // Reset dropdown when modal opens/closes
  useEffect(() => {
    if (isModalOpen) {
      setActiveAssetId('');
      setAssetSearchTerm('');
      setClientSearchTerm('');
    }
  }, [isModalOpen]);

  const calcDiscount = (mrp: number, tp: number) => {
    if (mrp <= 0 || tp >= mrp) return 0;
    return parseFloat((((mrp - tp) / mrp) * 100).toFixed(1));
  };

  const calculateSubtotal = () => selectedItems.reduce((sum, item) => sum + (item.tp * item.quantity), 0);
  const grossSubtotal = calculateSubtotal();
  const totalItemDiscount = selectedItems.reduce((sum, item) => sum + ((item.tp * (item.discount / 100)) * item.quantity), 0);
  const netBeforeGlobal = grossSubtotal - totalItemDiscount;
  const globalDiscountAmount = netBeforeGlobal * (discountRate / 100);
  
  const subtotal = grossSubtotal;
  const discountTotal = totalItemDiscount + globalDiscountAmount;
  const taxTotal = (grossSubtotal - discountTotal) * (taxRate / 100);
  const grandTotal = grossSubtotal - discountTotal + taxTotal + expenseAmount;

  const addItem = (productId: string) => {
    const product = filteredProducts.find(p => p.id === productId);
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
        color: product.color,
        productType: product.productType,
        batchNo: product.batchNo,
        quantity: 1,
        price: tp,
        mrp: mrp,
        tp: tp,
        discount: 0,
        total: tp
      }]);
    }
  };

  const updateItem = (productId: string, updates: Partial<InvoiceItem>) => {
    setSelectedItems(prev => prev.map(item => {
      if (item.productId !== productId) return item;
      let newItem = { ...item, ...updates };
      
      const unitPriceAfterDiscount = newItem.tp * (1 - (newItem.discount || 0) / 100);
      newItem.price = unitPriceAfterDiscount;
      newItem.total = unitPriceAfterDiscount * (newItem.quantity || 0);
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
            const product = filteredProducts.find(p => p.name.toLowerCase().includes(item.name.toLowerCase()));
            if (product) {
              const discount = calcDiscount(product.mrp, product.tp);
              newItems.push({
                productId: product.id,
                name: product.name,
                size: product.size,
                color: product.color,
                productType: product.productType,
                batchNo: product.batchNo,
                quantity: item.quantity || 1,
                price: product.tp,
                mrp: product.mrp,
                tp: product.tp,
                discount: calcDiscount(product.mrp, product.tp),
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

  const handleEditInvoice = (invoice: Invoice) => {
    setIsEditing(true);
    setEditingInvoiceId(invoice.id);
    setSelectedClientId(invoice.clientId);
    setSelectedItems(invoice.items);
    setTaxRate(invoice.taxRate);
    setDiscountRate(invoice.discountRate || 0);
    setSalesPerson(invoice.salesPerson || '');
    setExpenseType(invoice.expenseType || '');
    setExpenseAmount(invoice.expenseAmount || 0);
    setPaymentMethod(invoice.paymentMethod as 'Cash' | 'Credit' || 'Cash');
    setIsModalOpen(true);
    setViewingInvoice(null);
  };

  const handleCreateInvoice = async () => {
    const client = clients.find(c => c.id === selectedClientId);
    if (!client) { alert("Please select a client."); return; }
    if (selectedItems.length === 0) { alert("Please add at least one item."); return; }

    setIsCreating(true);
    
    const invoiceId = isEditing && editingInvoiceId ? editingInvoiceId : db.generateUUID();
    const originalInvoice = isEditing ? invoices.find(inv => inv.id === editingInvoiceId) : null;

    const newInvoice: Invoice = {
      id: invoiceId,
      invoiceNumber: isEditing && originalInvoice ? originalInvoice.invoiceNumber : `OVI-${Math.floor(Math.random() * 90000) + 10000}`,
      clientId: client.id,
      clientName: client.name,
      date: isEditing && originalInvoice ? originalInvoice.date : new Date().toISOString().split('T')[0],
      items: selectedItems,
      subtotal,
      discountRate,
      discountTotal,
      taxRate,
      taxTotal,
      total: grandTotal,
      expenseType: expenseType,
      expenseAmount: expenseAmount,
      status: paymentMethod === 'Cash' ? 'Paid' : 'Pending',
      paymentMethod: paymentMethod,
      paidAmount: paymentMethod === 'Cash' ? grandTotal : (isEditing && originalInvoice ? originalInvoice.paidAmount : 0),
      salesPerson: salesPerson,
      createdBy: isEditing && originalInvoice ? originalInvoice.createdBy : userId,
      createdByName: isEditing && originalInvoice ? originalInvoice.createdByName : userEmail
    };

    try {
      // Handle Stock Updates
      const productsToUpdate: Product[] = [];
      const transactions: StockTransaction[] = [];

      if (isEditing && originalInvoice) {
        // 1. Revert original stock changes
        for (const oldItem of originalInvoice.items) {
          const product = products.find(p => p.id === oldItem.productId);
          if (product) {
            const existingInUpdate = productsToUpdate.find(p => p.id === product.id);
            if (existingInUpdate) {
              existingInUpdate.stock += oldItem.quantity;
            } else {
              productsToUpdate.push({ ...product, stock: product.stock + oldItem.quantity });
            }
          }
        }
      }

      // 2. Apply new stock changes
      for (const newItem of selectedItems) {
        const product = products.find(p => p.id === newItem.productId);
        if (product) {
          const existingInUpdate = productsToUpdate.find(p => p.id === product.id);
          if (existingInUpdate) {
            existingInUpdate.stock -= newItem.quantity;
          } else {
            productsToUpdate.push({ ...product, stock: product.stock - newItem.quantity });
          }

          // Create transaction record
          transactions.push({
            id: db.generateUUID(),
            productId: newItem.productId,
            productName: newItem.name,
            productSize: newItem.size,
            productColor: newItem.color,
            productType: newItem.productType,
            type: 'OUT',
            quantity: newItem.quantity,
            date: new Date().toISOString().split('T')[0],
            note: `${isEditing ? 'Updated' : 'New'} Invoice #${newInvoice.invoiceNumber}`,
            createdBy: userId,
            createdByName: userEmail
          });
        }
      }

      // Save everything
      await db.saveInvoices([newInvoice]);
      if (productsToUpdate.length > 0) {
        await db.saveProducts(productsToUpdate);
      }
      if (transactions.length > 0) {
        await db.saveStockTransactions(transactions);
      }
      
      onUpdate();
      setIsModalOpen(false);
      setIsEditing(false);
      setEditingInvoiceId(null);
      setSelectedItems([]);
      setSelectedClientId('');
      setActiveAssetId('');
      setSalesPerson('');
      setExpenseType('');
      setExpenseAmount(0);
      alert(isEditing ? "Statement updated successfully." : "Statement committed successfully. Stock updated.");
    } catch (err: any) {
      console.error("Invoice Save Error:", err);
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

  const handleReturnInvoice = (invoice: Invoice) => {
    if (invoice.status === 'Returned') return;
    setInvoiceToReturn(invoice);
    setShowReturnConfirm(true);
  };

  const confirmReturnInvoice = async () => {
    if (!invoiceToReturn) return;

    setIsReturning(true);
    try {
      await db.returnInvoice(invoiceToReturn, userId, userEmail);
      
      if (viewingInvoice?.id === invoiceToReturn.id) {
        setViewingInvoice({ ...invoiceToReturn, status: 'Returned' });
      }
      
      onUpdate();
      setShowReturnConfirm(false);
      setInvoiceToReturn(null);
    } catch (err: any) {
      console.error("Return Invoice Error:", err);
      // Still using alert here for errors, but the main interaction is now modal-based.
      alert("Failed to return invoice: " + (err.message || "Unknown error"));
    } finally {
      setIsReturning(false);
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
      await new Promise(r => setTimeout(r, 500));
      
      const canvas = await html2canvas(element, { 
        scale: 2, // 2 is usually enough for good quality and better performance
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 1200, // Fixed window width to ensure consistent layout
        onclone: (clonedDoc) => {
          const clonedElement = clonedDoc.getElementById('printable-invoice-area');
          if (clonedElement) {
            // Force the element to be fully expanded and visible
            clonedElement.style.overflow = 'visible';
            clonedElement.style.maxHeight = 'none';
            clonedElement.style.height = 'auto';
            clonedElement.style.padding = '40px'; 
            clonedElement.style.width = '1000px'; 
            clonedElement.style.margin = '0';
            clonedElement.style.boxSizing = 'border-box';
            clonedElement.style.transform = 'none';
            clonedElement.style.display = 'block';
            
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
              (table as HTMLElement).style.overflow = 'visible';
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
      
      const pdfWidth = pdf.internal.pageSize.getWidth() - 20; // 10mm margin on each side
      const pdfHeight = pdf.internal.pageSize.getHeight() - 20; // 10mm margin on top/bottom
      
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      let displayWidth = imgWidth;
      let displayHeight = imgHeight;
      
      // Force single page scaling
      if (displayHeight > pdfHeight) {
        const scale = pdfHeight / displayHeight;
        displayHeight = pdfHeight;
        displayWidth = displayWidth * scale;
      }
      
      // Center the image on the page (including the 10mm offset)
      const xOffset = 10 + (pdfWidth - displayWidth) / 2;
      const yOffset = 10 + (pdfHeight - displayHeight) / 2;

      pdf.addImage(imgData, 'PNG', xOffset, yOffset, displayWidth, displayHeight, undefined, 'FAST');

      pdf.save(`Overplast_Invoice_${viewingInvoice.invoiceNumber}.pdf`);
    } catch (err) {
      console.error("PDF Export Error:", err);
      alert("PDF Generation Failed. Please try again.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrint = () => {
    const printArea = document.getElementById('printable-invoice-area');
    if (!printArea) {
      alert("Error: Print area not found.");
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Please allow popups to print.");
      return;
    }

    const content = printArea.innerHTML;
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(style => style.outerHTML)
      .join('\n');

    printWindow.document.write(`
      <html>
        <head>
          <title>Print Invoice - ${viewingInvoice?.invoiceNumber || 'Invoice'}</title>
          ${styles}
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap');
            
            body { 
              background: white !important; 
              padding: 20px !important; 
              margin: 0 !important;
              color: black !important;
              font-family: 'Inter', sans-serif !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .font-beauty {
              font-family: 'Playfair Display', serif !important;
            }
            #printable-invoice-area { 
              display: block !important; 
              width: 100% !important; 
              visibility: visible !important;
              max-width: 1000px;
              margin: 0 auto;
            }
            .no-print { display: none !important; }
            @page { 
              margin: 10mm; 
              size: portrait; 
            }
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            thead { display: table-header-group; }
            tfoot { display: table-footer-group; }
          </style>
        </head>
        <body>
          <div id="printable-invoice-area">
            ${content}
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

  const viewingClient = viewingInvoice ? clients.find(c => c.id === viewingInvoice.clientId) : null;
  const totalSavings = viewingInvoice?.items.reduce((sum, item) => sum + ((item.mrp - item.tp) * item.quantity), 0) || 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Billing Ledger</h2>
          <p className="text-sm text-gray-500 font-medium italic">History of {invoices.length} business statements.</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={exportToExcel}
            className="p-4 bg-green-50 text-green-700 rounded-2xl border border-green-100 font-black uppercase tracking-widest text-[10px] flex items-center gap-2 hover:bg-green-100 transition-all shadow-sm group"
            title="Download Excel"
          >
            <Download size={18} className="text-green-600 group-hover:scale-110 transition-transform" />
            Excel
          </button>
          <div className="relative group">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-black transition-colors" />
            <input 
              type="text" 
              placeholder="Search Sales Person..." 
              value={searchSalesPerson}
              onChange={e => setSearchSalesPerson(e.target.value)}
              className="pl-12 pr-6 py-4 bg-white border border-gray-200 rounded-2xl font-bold text-xs outline-none focus:ring-2 focus:ring-black w-64 transition-all"
            />
          </div>
          <button onClick={() => setIsModalOpen(true)} className="bg-black hover:bg-gray-800 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2 shadow-xl transition-all">
            <Plus size={18} className="text-yellow-500" /> Create New Statement
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 border-b">
              <tr>
                <th className="px-6 py-6">Statement #</th>
                <th className="px-6 py-6">Client</th>
                <th className="px-6 py-6">Sales Person</th>
                <th className="px-6 py-6">Method</th>
                <th className="px-6 py-6 text-right">Total</th>
                <th className="px-6 py-6 text-right">Paid</th>
                <th className="px-6 py-6 text-right">Balance</th>
                <th className="px-6 py-6 text-center">Status</th>
                <th className="px-6 py-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredInvoices.map(inv => {
                const isDeleting = deletingId === inv.id;
                const pMethod = inv.paymentMethod || 'Cash';
                const isReturned = inv.status === 'Returned';
                const paid = isReturned ? 0 : (pMethod === 'Cash' ? inv.total : (inv.paidAmount || 0));
                const balance = isReturned ? 0 : (inv.total - paid);
                return (
                  <tr key={inv.id} onClick={() => setViewingInvoice(inv)} className="hover:bg-yellow-50/20 cursor-pointer transition-colors group">
                    <td className="px-6 py-5 font-black text-gray-900">
                      {inv.invoiceNumber}
                      <p className="text-[8px] text-gray-400 font-bold mt-1">{inv.date}</p>
                    </td>
                    <td className="px-6 py-5 font-bold text-gray-600">{inv.clientName}</td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-gray-900 uppercase tracking-tighter">{inv.salesPerson || '-'}</span>
                        <span className="text-[8px] font-bold text-gray-400 lowercase tracking-tight">{inv.createdByName || 'Admin'}</span>
                      </div>
                    </td>
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
                      <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                        inv.status === 'Paid' ? 'bg-green-50 text-green-700 border-green-200' : 
                        inv.status === 'Returned' ? 'bg-red-50 text-red-700 border-red-200' :
                        'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>{inv.status}</span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {inv.status !== 'Returned' && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleReturnInvoice(inv); }}
                            className="p-2.5 bg-orange-50 border border-orange-100 rounded-xl text-orange-600 hover:bg-orange-600 hover:text-white transition-all shadow-sm"
                            title="Return Invoice"
                          >
                            <RotateCcw size={16} />
                          </button>
                        )}
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
          <div className="bg-white w-full max-w-6xl rounded-[2rem] sm:rounded-[3rem] overflow-hidden flex flex-col h-full sm:h-auto max-h-[98vh] sm:max-h-[85vh] shadow-2xl animate-in zoom-in-95 my-auto">
            <div className="p-4 sm:p-8 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50/50 sticky top-0 z-20 gap-4">
              <div className="flex items-center gap-4">
                 <div className="p-2 sm:p-3 bg-black text-yellow-500 rounded-xl sm:rounded-2xl shadow-lg"><FileText size={20} className="sm:w-6 sm:h-6" /></div>
                 <h3 className="text-xl sm:text-3xl font-black uppercase tracking-tighter">{isEditing ? 'Edit Statement' : 'Statement'}</h3>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
                <div className="flex bg-gray-200 p-1 rounded-xl sm:rounded-2xl border border-gray-300">
                  <button onClick={() => setPaymentMethod('Cash')} className={`px-3 sm:px-6 py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl text-[8px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${paymentMethod === 'Cash' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500'}`}>Cash</button>
                  <button onClick={() => setPaymentMethod('Credit')} className={`px-3 sm:px-6 py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl text-[8px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${paymentMethod === 'Credit' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>Credit</button>
                </div>
                <div className="flex items-center gap-2">
                  <label className={`flex items-center gap-2 px-3 sm:px-6 py-2 sm:py-3 bg-indigo-600 text-white rounded-lg sm:rounded-xl font-black text-[8px] sm:text-[10px] uppercase cursor-pointer hover:bg-indigo-700 shadow-lg transition-all ${isParsingInvoice ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    {isParsingInvoice ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    <span className="hidden xs:inline">{isParsingInvoice ? 'Parsing...' : 'AI Scan'}</span>
                    <input type="file" accept="image/*" onChange={handleAIParse} className="hidden" disabled={isParsingInvoice} />
                  </label>
                  <button onClick={() => {
                    setIsModalOpen(false);
                    setIsEditing(false);
                    setEditingInvoiceId(null);
                    setSelectedItems([]);
                    setSelectedClientId('');
                    setClientSearchTerm('');
                    setSalesPerson('');
                    setExpenseType('');
                    setExpenseAmount(0);
                  }} className="p-3 sm:p-4 hover:bg-red-50 text-red-600 rounded-xl sm:rounded-2xl transition-colors"><X size={24} className="sm:w-8 sm:h-8" /></button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-10 space-y-6 sm:space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Client Portfolio</label>
                    <div className="relative group">
                      <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                      <input 
                        type="text" 
                        placeholder="Search Client..." 
                        value={clientSearchTerm} 
                        onChange={e => setClientSearchTerm(e.target.value)}
                        className="pl-6 pr-2 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-bold outline-none focus:ring-2 focus:ring-indigo-400 w-32 transition-all"
                      />
                    </div>
                  </div>
                  <select 
                    value={selectedClientId} 
                    onChange={e => setSelectedClientId(e.target.value)} 
                    className="w-full p-5 bg-gray-50 border border-gray-200 rounded-[1.25rem] font-bold outline-none"
                  >
                    <option value="">Select Target Client...</option>
                    {clients
                      .filter(c => c.name.toLowerCase().includes(clientSearchTerm.toLowerCase()))
                      .map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                    }
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
                    {filteredProducts
                      .filter(p => 
                        p.name.toLowerCase().includes(assetSearchTerm.toLowerCase()) || 
                        p.sku?.toLowerCase().includes(assetSearchTerm.toLowerCase())
                      )
                      .map(p => {
                        const details = [p.size, p.color, p.productType].filter(Boolean).join(', ');
                        return (
                          <option key={p.id} value={p.id}>
                            {p.name} {details ? `(${details})` : ''}
                          </option>
                        );
                      })}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 mb-2 block tracking-widest">Tax (%)</label>
                  <input type="number" value={taxRate} onChange={e => setTaxRate(parseFloat(e.target.value) || 0)} className="w-full p-5 bg-gray-50 border border-gray-200 rounded-[1.25rem] font-black outline-none text-center" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 mb-2 block tracking-widest">Sales Person</label>
                  <input 
                    type="text" 
                    value={salesPerson} 
                    onChange={e => setSalesPerson(e.target.value)} 
                    placeholder="Enter Name..."
                    className="w-full p-5 bg-gray-50 border border-gray-200 rounded-[1.25rem] font-black outline-none text-center" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 mb-2 block tracking-widest">Expense Type (TCS, Cash, Indrive etc.)</label>
                  <input 
                    type="text" 
                    value={expenseType} 
                    onChange={e => setExpenseType(e.target.value)} 
                    placeholder="e.g. TCS, Cash, Easypaisa, Indrive..."
                    className="w-full p-5 bg-gray-50 border border-gray-200 rounded-[1.25rem] font-black outline-none" 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 mb-2 block tracking-widest">Expense Amount (Rs.)</label>
                  <input 
                    type="number" 
                    value={expenseAmount} 
                    onChange={e => setExpenseAmount(parseFloat(e.target.value) || 0)} 
                    placeholder="0"
                    className="w-full p-5 bg-gray-50 border border-gray-200 rounded-[1.25rem] font-black outline-none text-center" 
                  />
                </div>
              </div>

              <div className="border border-gray-100 rounded-[1.5rem] sm:rounded-[2.5rem] overflow-hidden bg-white shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[800px] sm:min-w-0">
                    <thead className="bg-gray-50 text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] border-b">
                    <tr>
                      <th className="px-8 py-6">Asset Description</th>
                      <th className="px-6 py-6 text-center">Size</th>
                      <th className="px-6 py-6 text-center">Color</th>
                      <th className="px-6 py-6 text-center">Type</th>
                      <th className="px-6 py-6 text-center">Batch No</th>
                      <th className="px-6 py-6 text-center">MRP</th>
                      <th className="px-6 py-6 text-center">Trade Price</th>
                      <th className="px-6 py-6 text-center">Disc (%)</th>
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
                        <td className="px-6 py-5 text-center">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${
                            item.color 
                            ? 'bg-blue-50 border-blue-100 text-blue-600' 
                            : 'bg-gray-50 border-gray-100 text-gray-400'
                          }`}>
                            {item.color || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${
                            item.productType 
                            ? 'bg-emerald-50 border-emerald-100 text-emerald-600' 
                            : 'bg-gray-50 border-gray-100 text-gray-400'
                          }`}>
                            {item.productType || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${
                            item.batchNo 
                            ? 'bg-orange-50 border-orange-100 text-orange-600' 
                            : 'bg-gray-50 border-gray-100 text-gray-400'
                          }`}>
                            {item.batchNo || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-center text-xs font-bold text-gray-400 line-through">Rs. {item.mrp}</td>
                        <td className="px-6 py-5 text-center">
                          <input type="number" value={item.tp} onChange={e => updateItem(item.productId, { tp: parseFloat(e.target.value) || 0 })} className="w-24 bg-yellow-50 border border-yellow-100 rounded-xl p-2.5 text-center font-black outline-none text-yellow-700" />
                        </td>
                        <td className="px-6 py-5 text-center">
                          <input 
                            type="number" 
                            step="0.1"
                            value={item.discount} 
                            onChange={e => updateItem(item.productId, { discount: parseFloat(e.target.value) || 0 })} 
                            className="w-20 bg-red-50 border border-red-100 rounded-xl p-2.5 text-center font-black outline-none text-red-600" 
                          />
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
          </div>

             <div className="p-4 sm:p-10 border-t bg-gray-50 flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-12 w-full sm:w-auto">
                <div>
                   <p className="text-[8px] sm:text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Subtotal</p>
                   <p className="text-sm sm:text-xl font-black text-gray-900">Rs. {(subtotal || 0).toLocaleString()}</p>
                </div>
                <div>
                   <p className="text-[8px] sm:text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Total Discount</p>
                   <p className="text-sm sm:text-xl font-black text-red-600">Rs. {(discountTotal || 0).toLocaleString()}</p>
                </div>
                <div>
                   <p className="text-[8px] sm:text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Tax ({taxRate}%)</p>
                   <p className="text-sm sm:text-xl font-black text-yellow-600">Rs. {(taxTotal || 0).toLocaleString()}</p>
                </div>
                <div>
                   <p className="text-[8px] sm:text-[10px] font-black text-yellow-600 uppercase tracking-widest mb-1">Final Amount</p>
                   <p className="text-xl sm:text-4xl font-black text-black tracking-tighter">Rs. {(grandTotal - (expenseAmount || 0)).toLocaleString()}</p>
                </div>
              </div>
              <button 
                onClick={handleCreateInvoice} 
                disabled={isCreating || selectedItems.length === 0} 
                className="w-full sm:w-auto px-8 sm:px-14 py-4 sm:py-6 bg-black text-white rounded-2xl sm:rounded-3xl font-black uppercase tracking-[0.2em] text-[8px] sm:text-[10px] hover:bg-gray-900 transition-all flex items-center justify-center gap-4 disabled:opacity-50 shadow-xl"
              >
                {isCreating ? <Loader2 className="animate-spin text-yellow-500" size={20} /> : <>{isEditing ? 'Update Statement' : 'Commit Record'} <ArrowRight size={18} className="text-yellow-500" /></>}
              </button>
            </div>
          </div>
        </div>
      )}

       {/* Detail View Modal */}
      {viewingInvoice && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/95 backdrop-blur-md p-2 sm:p-4 overflow-y-auto invoice-modal-overlay">
          <div className="bg-white w-full max-w-5xl h-full sm:h-auto max-h-[98vh] sm:max-h-[85vh] rounded-[2rem] sm:rounded-[3rem] overflow-hidden flex flex-col shadow-2xl my-auto animate-in zoom-in-95 duration-200 invoice-modal-content">
            <div className="p-4 sm:p-8 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50/50 sticky top-0 z-10 no-print border-gray-100 gap-4">
              <div className="flex items-center gap-4">
                 <FileText size={18} className="text-yellow-500" />
                 <div className="flex flex-col">
                   <h3 className="text-sm sm:text-xl font-black uppercase tracking-widest">{viewingInvoice.invoiceNumber}</h3>
                   {viewingInvoice.salesPerson && (
                     <p className="text-[7px] sm:text-[9px] font-bold text-gray-400 uppercase tracking-widest -mt-1">Sales Person: {viewingInvoice.salesPerson}</p>
                   )}
                 </div>
                 <span className={`px-3 sm:px-4 py-1 rounded-full text-[7px] sm:text-[9px] font-black uppercase tracking-widest border ${
                   viewingInvoice.status === 'Paid' ? 'bg-green-50 text-green-700 border-green-200' : 
                   viewingInvoice.status === 'Returned' ? 'bg-red-50 text-red-700 border-red-200' :
                   'bg-amber-50 text-amber-700 border-amber-200'
                 }`}>{viewingInvoice.status}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
                {viewingInvoice.status !== 'Returned' && (
                  <button 
                    onClick={() => handleEditInvoice(viewingInvoice)}
                    className="flex items-center gap-2 px-3 sm:px-6 py-2 sm:py-3 bg-yellow-500 text-black rounded-lg sm:rounded-xl font-black text-[8px] sm:text-[10px] uppercase hover:bg-yellow-400 shadow-lg transition-all"
                  >
                    <Pencil size={14} className="sm:w-4 sm:h-4" /> <span className="hidden xs:inline">Edit</span>
                  </button>
                )}
                {viewingInvoice.status !== 'Returned' && (
                  <button 
                    onClick={() => handleReturnInvoice(viewingInvoice)}
                    disabled={isReturning}
                    className="flex items-center gap-2 px-3 sm:px-6 py-2 sm:py-3 bg-orange-600 text-white rounded-lg sm:rounded-xl font-black text-[8px] sm:text-[10px] uppercase hover:bg-orange-700 shadow-lg transition-all disabled:opacity-50"
                  >
                    {isReturning ? <Loader2 className="animate-spin" size={14} /> : <RotateCcw size={14} />} <span className="hidden xs:inline">Return</span>
                  </button>
                )}
                {viewingInvoice.status === 'Pending' && (
                  <>
                    <button 
                      onClick={() => {
                        setPaymentAmount(viewingInvoice.total - (viewingInvoice.paidAmount || 0));
                        setIsRecordingPayment(true);
                      }}
                      className="flex items-center gap-2 px-3 sm:px-6 py-2 sm:py-3 bg-blue-600 text-white rounded-lg sm:rounded-xl font-black text-[8px] sm:text-[10px] uppercase hover:bg-blue-700 shadow-lg transition-all"
                    >
                      <Wallet size={14} /> <span className="hidden xs:inline">Pay</span>
                    </button>
                    <button 
                      onClick={() => handleMarkAsPaid(viewingInvoice)}
                      className="flex items-center gap-2 px-3 sm:px-6 py-2 sm:py-3 bg-green-600 text-white rounded-lg sm:rounded-xl font-black text-[8px] sm:text-[10px] uppercase hover:bg-green-700 shadow-lg transition-all"
                    >
                      <CheckCircle size={14} /> <span className="hidden xs:inline">Paid</span>
                    </button>
                  </>
                )}
                <button onClick={handlePrint} className="flex items-center gap-2 px-3 sm:px-6 py-2 sm:py-3 bg-white border border-gray-200 rounded-lg sm:rounded-xl font-black text-[8px] sm:text-[10px] uppercase hover:bg-gray-50 transition-all"><Printer size={14} /> <span className="hidden xs:inline">Print</span></button>
                <button onClick={exportToPdf} disabled={isGeneratingPdf} className="flex items-center gap-2 px-3 sm:px-6 py-2 sm:py-3 bg-black text-white rounded-lg sm:rounded-xl font-black text-[8px] sm:text-[10px] uppercase hover:bg-gray-900 shadow-lg transition-all">
                  {isGeneratingPdf ? <Loader2 className="animate-spin text-yellow-500" size={14} /> : <Download size={14} />} <span className="hidden xs:inline">PDF</span>
                </button>
                {role === 'Admin' && (
                  <button 
                    onClick={(e) => triggerDeleteConfirm(e, viewingInvoice)} 
                    className="p-2 sm:p-3 bg-red-50 text-red-600 rounded-lg sm:rounded-xl hover:bg-red-100 transition-all"
                    title="Purge Invoice"
                  >
                    <Trash2 size={18} className="sm:w-6 sm:h-6" />
                  </button>
                )}
                <button onClick={() => setViewingInvoice(null)} className="p-3 sm:p-4 bg-gray-100 hover:bg-red-50 hover:text-red-600 rounded-xl sm:rounded-2xl transition-all shadow-sm"><X size={24} className="sm:w-8 sm:h-8" /></button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 sm:p-16 md:p-24 bg-white" id="printable-invoice-area">
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
                       <div className="px-6 py-2 border-2 border-black inline-block bg-white shadow-sm">
                          <span className="text-xl font-black uppercase tracking-tighter text-black">
                            {viewingInvoice.paymentMethod || 'Cash'}
                          </span>
                       </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-20">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse min-w-[800px] sm:min-w-0">
                    <thead>
                      <tr className="border-b-4 border-black">
                      <th className="py-6 text-left text-[11px] font-black uppercase tracking-widest">Item Description</th>
                      <th className="py-6 text-center text-[11px] font-black uppercase tracking-widest">Size</th>
                      <th className="py-6 text-center text-[11px] font-black uppercase tracking-widest">Color</th>
                      <th className="py-6 text-center text-[11px] font-black uppercase tracking-widest">Type</th>
                      <th className="py-6 text-center text-[11px] font-black uppercase tracking-widest">Batch No</th>
                      <th className="py-6 text-center text-[11px] font-black uppercase tracking-widest">Quantity</th>
                      <th className="py-6 text-center text-[11px] font-black uppercase tracking-widest">MRP</th>
                      <th className="py-6 text-center text-[11px] font-black uppercase tracking-widest">Trade Price</th>
                      <th className="py-6 text-center text-[11px] font-black uppercase tracking-widest">Disc (%)</th>
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
                        <td className="py-6 text-center font-black text-gray-900">{item.color || 'N/A'}</td>
                        <td className="py-6 text-center font-black text-gray-900">{item.productType || 'N/A'}</td>
                        <td className="py-6 text-center font-black text-gray-900">{item.batchNo || 'N/A'}</td>
                        <td className="py-6 text-center font-black text-gray-900">{item.quantity}</td>
                        <td className="py-6 text-center font-black text-gray-900">Rs. {item.mrp}</td>
                        <td className="py-6 text-center font-black text-gray-900">Rs. {item.tp}</td>
                        <td className="py-6 text-center font-black text-red-600">{item.discount}%</td>
                        <td className="py-6 text-right font-black text-gray-900">Rs. {(item.total || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-4 border-black">
                      <td colSpan={7}></td>
                      <td className="py-8 text-right font-black text-gray-400 uppercase text-[10px] tracking-widest">Gross Subtotal</td>
                      <td className="py-8 text-right font-black text-gray-900 text-xl">Rs. {(viewingInvoice.subtotal || 0).toLocaleString()}</td>
                    </tr>
                    {viewingInvoice.discountTotal > 0 && (
                      <tr>
                        <td colSpan={7}></td>
                        <td className="py-2 text-right font-black text-red-400 uppercase text-[10px] tracking-widest">Total Discount</td>
                        <td className="py-2 text-right font-black text-red-600 text-xl">Rs. {(viewingInvoice.discountTotal || 0).toLocaleString()}</td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={7}></td>
                      <td className="py-2 text-right font-black text-gray-400 uppercase text-[10px] tracking-widest">Tax ({viewingInvoice.taxRate}%)</td>
                      <td className="py-2 text-right font-black text-yellow-600 text-xl">Rs. {(viewingInvoice.taxTotal || 0).toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td colSpan={7}></td>
                      <td className="py-4 text-right font-black text-black uppercase text-[10px] tracking-widest">Total Amount</td>
                      <td className="py-4 text-right font-black text-black text-2xl tracking-tighter">Rs. {(viewingInvoice.total - (viewingInvoice.expenseAmount || 0)).toLocaleString()}</td>
                    </tr>
                    {(viewingInvoice.paidAmount && viewingInvoice.paidAmount > 0) || viewingInvoice.paymentMethod === 'Cash' ? (
                      <>
                        <tr className="border-t border-gray-100">
                          <td colSpan={6}></td>
                          <td className="py-2 text-right font-black text-green-600 uppercase text-[10px] tracking-widest">Amount Paid</td>
                          <td className="py-2 text-right font-black text-green-600 text-xl">Rs. {Math.max(0, (viewingInvoice.paymentMethod === 'Cash' ? (viewingInvoice.total - (viewingInvoice.expenseAmount || 0)) : ((viewingInvoice.paidAmount || 0) - (viewingInvoice.expenseAmount || 0)))).toLocaleString()}</td>
                        </tr>
                        <tr>
                          <td colSpan={6}></td>
                          <td className="py-2 text-right font-black text-red-600 uppercase text-[10px] tracking-widest">Remaining Balance</td>
                          <td className="py-2 text-right font-black text-red-600 text-xl">Rs. {Math.max(0, (viewingInvoice.total - (viewingInvoice.expenseAmount || 0)) - Math.max(0, (viewingInvoice.paymentMethod === 'Cash' ? (viewingInvoice.total - (viewingInvoice.expenseAmount || 0)) : ((viewingInvoice.paidAmount || 0) - (viewingInvoice.expenseAmount || 0))))).toLocaleString()}</td>
                        </tr>
                      </>
                    ) : null}
                    {viewingInvoice.expenseAmount && viewingInvoice.expenseAmount > 0 ? (
                      <tr>
                        <td colSpan={7}></td>
                        <td className="py-4 text-right font-black text-orange-600 uppercase text-[10px] tracking-widest pt-10">Expenses ({viewingInvoice.expenseType || 'Other'})</td>
                        <td className="py-4 text-right font-black text-orange-600 text-xl pt-10">Rs. {viewingInvoice.expenseAmount.toLocaleString()}</td>
                      </tr>
                    ) : null}
                  </tfoot>
                </table>
              </div>
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
      {/* Return Confirmation Modal */}
      {showReturnConfirm && invoiceToReturn && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-10 text-center">
              <div className="w-24 h-24 bg-orange-100 text-orange-600 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-inner">
                <RotateCcw size={40} />
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tighter mb-4">Return Invoice?</h3>
              <p className="text-gray-500 font-bold text-sm mb-10 leading-relaxed">
                Are you sure you want to return <span className="text-black font-black">Invoice #{invoiceToReturn.invoiceNumber}</span>? 
                This will restock all items and mark the invoice as <span className="text-red-600 font-black">Returned</span>.
              </p>
              
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => { setShowReturnConfirm(false); setInvoiceToReturn(null); }}
                  className="py-5 bg-gray-100 text-gray-400 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmReturnInvoice}
                  disabled={isReturning}
                  className="py-5 bg-orange-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-orange-700 shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isReturning ? <Loader2 className="animate-spin" size={16} /> : <RotateCcw size={16} />}
                  Confirm Return
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {isRecordingPayment && viewingInvoice && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-md rounded-[2rem] sm:rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 sm:p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg sm:text-xl font-black uppercase tracking-tighter">Record Payment</h3>
              <button onClick={() => setIsRecordingPayment(false)} className="text-gray-400 hover:text-red-600 transition-colors"><X size={24} /></button>
            </div>
            <div className="p-6 sm:p-10 space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Payment Amount (Rs.)</label>
                <input 
                  type="number" 
                  value={paymentAmount} 
                  onChange={e => setPaymentAmount(parseFloat(e.target.value) || 0)}
                  className="w-full p-4 sm:p-5 bg-gray-50 border border-gray-200 rounded-xl sm:rounded-2xl font-black text-lg sm:text-xl outline-none focus:ring-4 focus:ring-blue-50 transition-all"
                  placeholder="0.00"
                />
                <p className="mt-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Remaining: Rs. {(viewingInvoice.total - (viewingInvoice.paidAmount || 0)).toLocaleString()}</p>
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Note (Optional)</label>
                <textarea 
                  value={paymentNote}
                  onChange={e => setPaymentNote(e.target.value)}
                  className="w-full p-4 sm:p-5 bg-gray-50 border border-gray-200 rounded-xl sm:rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-blue-50 transition-all resize-none"
                  rows={3}
                  placeholder="e.g. Partial payment via bank transfer..."
                />
              </div>
              <button 
                onClick={handleRecordPayment}
                className="w-full py-4 sm:py-6 bg-blue-600 text-white rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-700 shadow-xl transition-all"
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
