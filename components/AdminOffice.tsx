
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../db';
import { Profile, UserRole, UserStatus, Invoice, Product, ViewType, Client, StockTransaction } from '../types';
import { 
  Users, Shield, Activity, Lock, Search, 
  MoreVertical, RefreshCw, Loader2, ShieldCheck, 
  UserPlus, Ban, CheckCircle, Database, Server,
  History, Eye, Trash2, Key, Mail, TrendingUp, BarChart3, PieChart as PieChartIcon, DollarSign,
  Receipt, ArrowUpRight, ArrowDownRight, Percent, Briefcase, Calendar, Printer, Download, FileText, X, AlertTriangle,
  Zap, PlusSquare, FilePlus, UserPlus2, Wallet2, ChevronDown, Sparkles, Package
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell, PieChart, Pie, AreaChart, Area
} from 'recharts';
import UserManagement from './UserManagement';
import ActivityLog from './ActivityLog';
import SettingsView from './Settings';
import SecuritySettings from './SecuritySettings';
import SalesReport from './SalesReport';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';
import { APP_LOGO_URL, APP_NAME, ADMIN_EMAIL } from '../constants';
import { geminiService } from '../geminiService';

const AdminLogo = () => (
  <div className="flex items-center gap-4">
    <div className="w-24 h-24 flex items-center justify-center p-2">
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

const AdminOffice: React.FC<{ 
  onUpdate: () => void, 
  onNavigate: (view: ViewType) => void,
  invoices?: Invoice[],
  clients?: Client[],
  products?: Product[],
  userId?: string,
  userEmail?: string,
  role?: UserRole
}> = ({ onUpdate, onNavigate, invoices: propInvoices, clients: propClients, products: propProducts, userId, userEmail, role }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'activity' | 'infrastructure' | 'reports' | 'intelligence' | 'security' | 'sales-report'>('intelligence');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeAdmins: 0,
    totalRevenue: 0,
    totalProfit: 0,
    totalCost: 0,
    totalTax: 0,
    pendingAmount: 0,
    dbSize: '0 KB',
  });
  const [allInvoices, setAllInvoices] = useState<Invoice[]>(propInvoices || []);
  const [allProducts, setAllProducts] = useState<Product[]>(propProducts || []);
  const [allTransactions, setAllTransactions] = useState<StockTransaction[]>([]);
  const [loading, setLoading] = useState(!propInvoices);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Sync with props if they change
  useEffect(() => {
    if (propInvoices) setAllInvoices(propInvoices);
    if (propProducts) setAllProducts(propProducts);
  }, [propInvoices, propProducts]);

  useEffect(() => {
    fetchAdminData();
  }, [selectedMonth, propInvoices, propProducts]);

  const fetchAdminData = async () => {
    // If props are empty, we fetch from DB to ensure we have data
    const shouldFetchInvoices = !propInvoices || propInvoices.length === 0;
    const shouldFetchProducts = !propProducts || propProducts.length === 0;

    if (shouldFetchInvoices || shouldFetchProducts) {
      setLoading(true);
    }

    try {
      const [profiles, invoices, products, transactions] = await Promise.all([
        db.getAllProfiles(),
        shouldFetchInvoices ? db.getInvoices() : Promise.resolve(propInvoices!),
        shouldFetchProducts ? db.getProducts() : Promise.resolve(propProducts!),
        db.getStockTransactions()
      ]);

      setAllInvoices(invoices);
      setAllProducts(products);
      setAllTransactions(transactions);
      
      // Reset AI summary when month changes
      setAiSummary(null);

      const monthlyInvoices = invoices.filter(inv => 
        inv.date.startsWith(selectedMonth) && inv.status !== 'Returned'
      );
      
      const rev = monthlyInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
      const tax = monthlyInvoices.reduce((sum, inv) => sum + (inv.taxTotal || 0), 0);
      const pending = monthlyInvoices.reduce((sum, inv) => {
        const paid = inv.paymentMethod === 'Cash' ? inv.total : (inv.paidAmount || 0);
        return sum + (inv.total - paid);
      }, 0);
      
      let cost = 0;
      monthlyInvoices.forEach(inv => {
        inv.items.forEach(item => {
          const product = products.find(p => p.id === item.productId);
          const purchasePrice = product?.purchasePrice || 0;
          cost += purchasePrice * (item.quantity || 0);
        });
      });

      const profit = (rev - tax) - cost;

      setStats({
        totalUsers: profiles.length,
        activeAdmins: profiles.filter(p => p.role === 'Admin').length,
        totalRevenue: rev,
        totalProfit: profit,
        totalCost: cost,
        totalTax: tax,
        pendingAmount: pending,
        dbSize: `${(profiles.length * 0.2 + invoices.length * 0.8 + products.length * 0.4).toFixed(1)} KB`,
      });
      
    } catch (e) {
      console.error("Admin stats fetch failed", e);
    } finally {
      setLoading(false);
    }
  };

  // Process data for charts
  const chartData = useMemo(() => {
    const dailyData: Record<string, { date: string, day: string, revenue: number, debit: number, profit: number, invoices: Invoice[] }> = {};
    const monthlyInvoices = allInvoices.filter(inv => inv.date.startsWith(selectedMonth) && inv.status !== 'Returned');
    
    monthlyInvoices.forEach(inv => {
      const date = inv.date;
      const day = inv.date.split('-')[2];
      if (!dailyData[date]) dailyData[date] = { date, day, revenue: 0, debit: 0, profit: 0, invoices: [] };
      dailyData[date].revenue += inv.total;
      dailyData[date].invoices.push(inv);
      
      let invCost = 0;
      inv.items.forEach(item => { 
        const product = allProducts.find(p => p.id === item.productId);
        const purchasePrice = product?.purchasePrice || 0;
        invCost += purchasePrice * (item.quantity || 0); 
      });
      const invProfit = (inv.total - inv.taxTotal) - invCost;
      const invDebit = invCost + inv.taxTotal;
      
      if (!dailyData[date]) dailyData[date] = { date, day, revenue: 0, debit: 0, profit: 0, invoices: [] };
      dailyData[date].revenue += inv.total;
      dailyData[date].invoices.push({ ...inv, profit: invProfit });
      
      dailyData[date].debit += invDebit;
      dailyData[date].profit += invProfit;
    });

    return Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date));
  }, [allInvoices, selectedMonth, allProducts]);

  const categoryData = useMemo(() => {
    const cats: Record<string, number> = {};
    allProducts.forEach(p => {
      cats[p.category] = (cats[p.category] || 0) + (p.stock * p.tp);
    });
    return Object.entries(cats).map(([name, value]) => ({ name, value }));
  }, [allProducts]);

  const topProducts = useMemo(() => {
    const productSales: Record<string, number> = {};
    const validInvoices = allInvoices.filter(inv => inv.status !== 'Returned');
    validInvoices.forEach(inv => {
      inv.items.forEach(item => {
        productSales[item.name] = (productSales[item.name] || 0) + (item.quantity || 0);
      });
    });
    return Object.entries(productSales)
      .map(([name, sales]) => ({ name, sales }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5);
  }, [allInvoices]);

  const clientGrowth = useMemo(() => {
    const monthlyClients: Record<string, number> = {};
    const validInvoices = allInvoices.filter(inv => inv.status !== 'Returned');
    validInvoices.forEach(inv => {
      const month = inv.date.slice(0, 7);
      monthlyClients[month] = (monthlyClients[month] || 0) + 1;
    });
    return Object.entries(monthlyClients)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [allInvoices]);

  const COLORS = ['#D4AF37', '#111827', '#4B5563', '#9CA3AF', '#E5E7EB'];

  const triggerDeleteConfirm = (inv: Invoice) => {
    setInvoiceToDelete(inv);
    setShowDeleteConfirm(true);
  };

  const performDelete = async () => {
    if (!invoiceToDelete) return;
    const id = invoiceToDelete.id;
    setDeletingId(id);
    setShowDeleteConfirm(false);

    try {
      await db.deleteInvoice(id);
      await fetchAdminData();
      onUpdate();
    } catch (err: any) {
      alert("Purge Failed: " + (err.message || "Database Error"));
    } finally {
      setDeletingId(null);
      setInvoiceToDelete(null);
    }
  };

  const handleGenerateSummary = async () => {
    setLoadingSummary(true);
    try {
      const monthlyInvoices = allInvoices.filter(inv => inv.date.startsWith(selectedMonth));
      const summary = await geminiService.summarizeFinancials(monthlyInvoices, stats, selectedMonth);
      setAiSummary(summary);
    } catch (err) {
      console.error("AI Summary Error:", err);
      setAiSummary("Failed to generate AI summary. Please try again later.");
    } finally {
      setLoadingSummary(false);
    }
  };

  const exportReportToPdf = async () => {
    setIsGeneratingPdf(true);
    const element = document.getElementById('monthly-report-area');
    if (!element) return;
    try {
      // Small delay to ensure any layout shifts are settled
      await new Promise(r => setTimeout(r, 200));
      
      const canvas = await html2canvas(element, { 
        scale: 2, 
        useCORS: true, 
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      
      // Calculate how many pages we need
      const ratio = pdfWidth / imgWidth;
      const canvasHeightInPdf = imgHeight * ratio;
      
      let heightLeft = canvasHeightInPdf;
      let position = 0;
      
      // Add first page
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, canvasHeightInPdf);
      heightLeft -= pdfHeight;
      
      // Add subsequent pages if needed
      while (heightLeft > 0) {
        position = heightLeft - canvasHeightInPdf;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, canvasHeightInPdf);
        heightLeft -= pdfHeight;
      }
      
      pdf.save(`Overplast_PL_Report_${selectedMonth}.pdf`);
    } catch (err) {
      console.error('PDF Generation Error:', err);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const exportReportToExcel = () => {
    const data = chartData.map(day => ({
      'Date': day.date,
      'Day': new Date(day.date).toLocaleDateString('en-PK', { weekday: 'long' }),
      'Credit (Revenue)': day.revenue,
      'Debit (Expenses)': day.debit
    }));

    // Add totals row
    data.push({
      'Date': 'TOTALS',
      'Day': '',
      'Credit (Revenue)': stats.totalRevenue,
      'Debit (Expenses)': stats.totalCost + stats.totalTax
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Financial Ledger");

    // Auto-size columns
    const maxWidths = Object.keys(data[0]).map(key => {
      return Math.max(...data.map(row => String((row as any)[key]).length), key.length) + 2;
    });
    worksheet['!cols'] = maxWidths.map(w => ({ wch: w }));

    XLSX.writeFile(workbook, `Overplast_Financial_Ledger_${selectedMonth}.xlsx`);
  };

  const shortcuts = [
    { label: 'New Asset', icon: PlusSquare, color: 'text-yellow-600', bg: 'bg-yellow-50', link: 'inventory' },
    { label: 'Create Bill', icon: FilePlus, color: 'text-blue-600', bg: 'bg-blue-50', link: 'invoices' },
    { label: 'New Client', icon: UserPlus2, color: 'text-indigo-600', bg: 'bg-indigo-50', link: 'clients' },
    { label: 'Audit Log', icon: History, color: 'text-gray-600', bg: 'bg-gray-50', type: 'internal', tab: 'reports' },
  ];

  const handleShortcutClick = (s: any) => {
    if (s.type === 'internal') {
      setActiveTab(s.tab);
    } else {
      onNavigate(s.link);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-700 pb-20">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm">
        <div className="flex items-center gap-6">
           <div className="p-4 bg-black text-yellow-500 rounded-2xl shadow-lg">
              <Shield size={32} />
           </div>
           <div>
              <h2 className="text-3xl font-black text-gray-900 tracking-tighter uppercase leading-none mb-2">Executive Office</h2>
              <p className="text-sm text-gray-500 font-medium italic">Administrative Command & Business Analytics Hub.</p>
           </div>
        </div>
        
        <div className="flex bg-gray-50 p-1.5 rounded-2xl border border-gray-200 shadow-inner overflow-x-auto items-center">
          <button 
            onClick={fetchAdminData}
            disabled={loading}
            className="p-2.5 text-gray-400 hover:text-black transition-all hover:bg-white rounded-xl mr-2 disabled:opacity-50"
            title="Sync All Data"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setActiveTab('intelligence')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'intelligence' ? 'bg-black text-white shadow-lg' : 'text-gray-500 hover:bg-white'}`}>
            <Zap size={14} /> Intelligence
          </button>
          <button onClick={() => setActiveTab('users')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'users' ? 'bg-black text-white shadow-lg' : 'text-gray-500 hover:bg-white'}`}>
            <Users size={14} /> Workforce
          </button>
          <button onClick={() => setActiveTab('activity')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'activity' ? 'bg-black text-white shadow-lg' : 'text-gray-500 hover:bg-white'}`}>
            <Activity size={14} /> Activity
          </button>
          <button onClick={() => setActiveTab('reports')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'reports' ? 'bg-black text-white shadow-lg' : 'text-gray-500 hover:bg-white'}`}>
            <BarChart3 size={14} /> Financials
          </button>
          <button onClick={() => setActiveTab('sales-report')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'sales-report' ? 'bg-black text-white shadow-lg' : 'text-gray-500 hover:bg-white'}`}>
            <Package size={14} /> Sales & Stocks
          </button>
          <button onClick={() => setActiveTab('security')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'security' ? 'bg-black text-white shadow-lg' : 'text-gray-500 hover:bg-white'}`}>
            <Lock size={14} /> Security
          </button>
          {userEmail === ADMIN_EMAIL && (window.location.hostname.includes('localhost') || window.location.hostname.includes('-dev-')) && (
            <button onClick={() => setActiveTab('infrastructure')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'infrastructure' ? 'bg-black text-white shadow-lg' : 'text-gray-500 hover:bg-white'}`}>
              <Server size={14} /> Cloud Nodes
            </button>
          )}
        </div>
      </div>

      {activeTab === 'intelligence' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-500">
          {/* Quick Shortcuts Bar */}
          <div className="lg:col-span-12 grid grid-cols-2 md:grid-cols-4 gap-4">
             {shortcuts.map((action, i) => (
               <button 
                key={i} 
                onClick={() => handleShortcutClick(action)}
                className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-xl transition-all group"
               >
                  <div className={`p-3 ${action.bg} ${action.color} rounded-xl group-hover:scale-110 transition-transform`}>
                    <action.icon size={20} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-900">{action.label}</span>
               </button>
             ))}
          </div>

          {/* Graphical Representation Card 1: Revenue & Profit Trend */}
          <div className="lg:col-span-8 bg-white p-10 rounded-[3.5rem] border border-gray-100 shadow-sm">
             <div className="flex items-center justify-between mb-8">
               <div>
                  <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Performance Trend</h3>
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Revenue vs Profit Logic (Month Index)</p>
               </div>
               <div className="flex gap-4">
                  <div className="flex items-center gap-2 text-[9px] font-black uppercase text-yellow-600"><div className="w-2 h-2 rounded-full bg-yellow-600" /> Revenue</div>
                  <div className="flex items-center gap-2 text-[9px] font-black uppercase text-gray-900"><div className="w-2 h-2 rounded-full bg-gray-900" /> Profit</div>
               </div>
             </div>
             <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#D4AF37" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold'}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold'}} />
                    <Tooltip contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', fontSize: '10px', fontWeight: 'bold'}} />
                    <Area type="monotone" dataKey="revenue" stroke="#D4AF37" fillOpacity={1} fill="url(#colorRev)" strokeWidth={3} />
                    <Area type="monotone" dataKey="profit" stroke="#111827" fillOpacity={0} strokeWidth={3} strokeDasharray="5 5" />
                  </AreaChart>
                </ResponsiveContainer>
             </div>
          </div>

          {/* Graphical Representation Card 2: Asset Allocation */}
          <div className="lg:col-span-4 bg-white p-10 rounded-[3.5rem] border border-gray-100 shadow-sm relative overflow-hidden">
             <div className="absolute top-0 right-0 p-8 opacity-5 text-gray-900"><PieChartIcon size={120} /></div>
             <div className="relative z-10 h-full flex flex-col">
                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight mb-8">Asset Valuation</h3>
                <div className="flex-1 h-[200px]">
                   <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={categoryData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                          {categoryData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                   </ResponsiveContainer>
                </div>
                <div className="mt-8 space-y-2">
                   {categoryData.slice(0, 3).map((cat, i) => (
                     <div key={i} className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                        <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{backgroundColor: COLORS[i % COLORS.length]}} /> {cat.name}</span>
                        <span className="text-yellow-500">Rs. {(cat.value || 0).toLocaleString()}</span>
                     </div>
                   ))}
                </div>
             </div>
          </div>

          {/* New Row: Top Selling Assets & Client Growth */}
          <div className="lg:col-span-6 bg-white p-10 rounded-[3.5rem] border border-gray-100 shadow-sm">
             <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight mb-8">Top Selling Assets</h3>
             <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProducts}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 8, fontWeight: 'bold'}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold'}} />
                    <Tooltip />
                    <Bar dataKey="sales" fill="#D4AF37" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
             </div>
          </div>

          <div className="lg:col-span-6 bg-white p-10 rounded-[3.5rem] border border-gray-100 shadow-sm">
             <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight mb-8">Client Growth</h3>
             <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={clientGrowth}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold'}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold'}} />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="#111827" strokeWidth={3} dot={{r: 6, fill: '#111827'}} />
                  </LineChart>
                </ResponsiveContainer>
             </div>
          </div>

          {/* Secondary Stats Row */}
          <div className="lg:col-span-12 grid grid-cols-1 md:grid-cols-3 gap-6">
             <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 flex items-center justify-between">
                <div>
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Database Payload</p>
                   <h4 className="text-2xl font-black text-gray-900">{stats.dbSize}</h4>
                </div>
                <div className="p-4 bg-gray-50 text-gray-400 rounded-2xl"><Database size={24} /></div>
             </div>
             <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 flex items-center justify-between">
                <div>
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Operating Nodes</p>
                   <h4 className="text-2xl font-black text-gray-900">4 Sub-systems</h4>
                </div>
                <div className="p-4 bg-gray-50 text-gray-400 rounded-2xl"><Server size={24} /></div>
             </div>
             <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 flex items-center justify-between">
                <div>
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Financial Integrity</p>
                   <h4 className="text-2xl font-black text-green-600">VERIFIED</h4>
                </div>
                <div className="p-4 bg-green-50 text-green-600 rounded-2xl"><ShieldCheck size={24} /></div>
             </div>
          </div>

          {/* AI Intelligence Row */}
          <div className="lg:col-span-12">
            <div className="bg-white p-12 rounded-[4rem] border border-gray-100 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/5 rounded-full blur-[100px] group-hover:bg-yellow-500/10 transition-all duration-1000"></div>
              <div className="relative z-10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12">
                  <div className="flex items-center gap-6">
                    <div className="p-5 bg-yellow-50 text-yellow-600 rounded-[2rem] border border-yellow-100 animate-pulse">
                      <Sparkles size={32} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tight mb-1">AI Financial Intelligence</h3>
                      <p className="text-[10px] font-black text-yellow-600 uppercase tracking-[0.3em]">Deep Ledger Analysis & Forecasting</p>
                    </div>
                  </div>
                  <button 
                    onClick={handleGenerateSummary}
                    disabled={loadingSummary}
                    className="px-10 py-5 bg-black text-white font-black rounded-2xl text-[10px] uppercase tracking-widest hover:bg-gray-900 transition-all shadow-xl flex items-center gap-3 disabled:opacity-50"
                  >
                    {loadingSummary ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
                    {loadingSummary ? 'Analyzing Ledger...' : 'Generate AI Summary'}
                  </button>
                </div>

                {aiSummary ? (
                  <div className="bg-gray-50 p-10 rounded-[3rem] border border-gray-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="prose max-w-none">
                      <p className="text-lg leading-relaxed font-medium text-gray-700 whitespace-pre-wrap">{aiSummary}</p>
                    </div>
                  </div>
                ) : (
                  <div className="py-20 text-center border-2 border-dashed border-gray-100 rounded-[3rem] opacity-30">
                    <Activity size={48} className="mx-auto mb-4 text-gray-400" />
                    <p className="text-xs font-black uppercase tracking-[0.3em] text-gray-400">Awaiting Intelligence Request</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legacy Tabs */}
      <div className="min-h-[60vh]">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="animate-spin text-yellow-600" size={48} />
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest italic">Authenticating Admin Context...</p>
          </div>
        ) : (
          <>
            {activeTab === 'users' && (
              <UserManagement 
                onUpdate={fetchAdminData} 
                onBackToDashboard={() => setActiveTab('intelligence')} 
              />
            )}
            {activeTab === 'activity' && (
              <ActivityLog 
                invoices={allInvoices} 
                clients={propClients} 
                products={allProducts} 
                onRefresh={fetchAdminData} 
                userId={userId}
                role={role}
              />
            )}
            {activeTab === 'security' && <SecuritySettings />}
            {activeTab === 'infrastructure' && <SettingsView />}
            {activeTab === 'sales-report' && (
              <SalesReport 
                products={allProducts}
                invoices={allInvoices}
                transactions={allTransactions}
                role={role || 'Staff'}
              />
            )}
            {activeTab === 'reports' && (
              <div className="space-y-10 animate-in fade-in zoom-in-95 duration-500">
                <div className="bg-white p-8 rounded-[2.5rem] border border-gray-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
                   <div className="flex items-center gap-6">
                      <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl"><Calendar size={24} /></div>
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Reporting Period</p>
                        <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="font-black text-gray-900 border-none bg-transparent focus:ring-0 text-2xl outline-none cursor-pointer" />
                      </div>
                   </div>
                   <div className="flex items-center gap-3">
                      <button onClick={() => window.print()} className="flex items-center gap-3 px-8 py-4 bg-white border border-gray-200 rounded-2xl font-black text-[10px] uppercase hover:bg-gray-50 transition-all"><Printer size={18} /> Print</button>
                      <button onClick={exportReportToPdf} disabled={isGeneratingPdf} className="flex items-center gap-3 px-8 py-4 bg-white border border-gray-200 text-gray-900 rounded-2xl font-black text-[10px] uppercase hover:bg-gray-50 transition-all">
                        {isGeneratingPdf ? <Loader2 className="animate-spin text-yellow-500" size={18} /> : <Download size={18} />} Export PDF
                      </button>
                      <button onClick={exportReportToExcel} className="flex items-center gap-3 px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase hover:bg-emerald-700 shadow-xl transition-all">
                        <FileText size={18} /> Export Excel
                      </button>
                   </div>
                </div>

                <div className="bg-white p-16 md:p-24 rounded-[3.5rem] border border-gray-200 shadow-2xl relative overflow-hidden" id="monthly-report-area">
                  <div className="flex justify-between items-start mb-24">
                    <AdminLogo />
                    <div className="text-right">
                       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Auth Status</p>
                       <span className="px-5 py-2 bg-green-50 text-green-700 border border-green-200 rounded-full text-[10px] font-black uppercase tracking-widest">Verified Ledger</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-24">
                    <div className="space-y-12">
                       <div>
                          <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.4em] mb-8 border-b border-gray-100 pb-4">Financial Summary</h4>
                          <div className="space-y-6">
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-bold text-gray-600 uppercase tracking-widest">Gross Revenue (Total Sales)</span>
                                <span className="text-lg font-black text-green-600">Rs. {(stats.totalRevenue || 0).toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-bold text-gray-600 uppercase tracking-widest">Total Expenses (COGS + Tax)</span>
                                <span className="text-lg font-black text-red-600">Rs. {(stats.totalCost + stats.totalTax || 0).toLocaleString()}</span>
                              </div>
                             <div className="flex justify-between items-center">
                               <span className="text-sm font-bold text-amber-600 uppercase tracking-widest">Pending Collection</span>
                               <span className="text-lg font-black text-amber-600">Rs. {(stats.pendingAmount || 0).toLocaleString()}</span>
                             </div>
                             <div className="pt-4 border-t border-gray-50 flex justify-between items-center">
                               <span className="text-sm font-bold text-gray-400">Tax Component</span>
                               <span className="text-sm font-black text-gray-500">Rs. {(stats.totalTax || 0).toLocaleString()}</span>
                             </div>
                          </div>
                       </div>
                    </div>
                    <div></div>
                  </div>

                  {/* Date-wise Ledger Section */}
                  <div className="mt-24">
                    <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.4em] mb-8 border-b border-gray-100 pb-4">Daily Transaction Ledger</h4>
                    <div className={`space-y-4 no-print ${isGeneratingPdf ? 'hidden' : ''}`}>
                      {chartData.length > 0 ? chartData.map((day, idx) => (
                        <div key={idx} className="bg-gray-50 rounded-[2rem] overflow-hidden border border-gray-100">
                          <button 
                            onClick={() => setExpandedDate(expandedDate === day.date ? null : day.date)}
                            className="w-full flex items-center justify-between p-8 hover:bg-white transition-all group"
                          >
                            <div className="flex items-center gap-6">
                              <div className="w-14 h-14 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center text-gray-900 font-black">
                                {day.day}
                              </div>
                              <div className="text-left">
                                <p className="text-sm font-black text-gray-900 uppercase tracking-widest">{new Date(day.date).toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{day.invoices.length} Statements Processed</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-12">
                              <div className="text-right">
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Credit</p>
                                <p className="text-lg font-black text-green-600">Rs. {(day.revenue || 0).toLocaleString()}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Debit</p>
                                <p className="text-lg font-black text-red-600">Rs. {(day.debit || 0).toLocaleString()}</p>
                              </div>
                              <div className={`p-2 rounded-lg bg-gray-100 text-gray-400 group-hover:bg-black group-hover:text-white transition-all ${expandedDate === day.date ? 'rotate-180' : ''}`}>
                                <ChevronDown size={16} />
                              </div>
                            </div>
                          </button>
                          
                          {expandedDate === day.date && (
                            <div className="p-8 pt-0 bg-white border-t border-gray-100 animate-in slide-in-from-top-2 duration-300">
                              <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                   <thead className="text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
                                    <tr>
                                      <th className="py-4">Invoice #</th>
                                      <th className="py-4">Client</th>
                                      <th className="py-4 text-right">Revenue</th>
                                      <th className="py-4 text-right">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-50">
                                    {day.invoices.map((inv: any, i: number) => (
                                      <tr key={i} className="group/row">
                                        <td className="py-4 font-black text-gray-900 text-xs">{inv.invoiceNumber}</td>
                                        <td className="py-4 font-bold text-gray-600 text-xs">{inv.clientName}</td>
                                        <td className="py-4 text-right font-black text-gray-900 text-xs">Rs. {(inv.total || 0).toLocaleString()}</td>
                                        <td className="py-4 text-right">
                                          <button 
                                            onClick={() => onNavigate('invoices')}
                                            className="p-2 bg-gray-50 text-gray-400 rounded-lg hover:bg-black hover:text-white transition-all"
                                          >
                                            <Eye size={14} />
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      )) : (
                        <div className="py-20 text-center opacity-20 border-2 border-dashed border-gray-200 rounded-[2rem]">
                          <History size={48} className="mx-auto mb-4 text-gray-400" />
                          <p className="font-black uppercase tracking-widest text-gray-400">No ledger data for this period</p>
                        </div>
                      )}
                    </div>

                    {/* Static Detailed Table for Export/Print */}
                    <div className="mt-12 overflow-hidden border border-gray-200 rounded-[2rem]">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-gray-100 text-gray-900 border-b border-gray-200">
                            <th className="p-6 text-[10px] font-black uppercase tracking-widest">Date</th>
                            <th className="p-6 text-[10px] font-black uppercase tracking-widest text-right">Credit</th>
                            <th className="p-6 text-[10px] font-black uppercase tracking-widest text-right">Debit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {chartData.map((day, idx) => (
                            <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                              <td className="p-6">
                                <p className="text-xs font-black text-gray-900">{day.date}</p>
                                <p className="text-[9px] font-bold text-gray-400 uppercase">{new Date(day.date).toLocaleDateString('en-PK', { weekday: 'short' })}</p>
                              </td>
                              <td className="p-6 text-right font-black text-green-600 text-sm">Rs. {(day.revenue || 0).toLocaleString()}</td>
                              <td className="p-6 text-right font-black text-red-600 text-sm">Rs. {(day.debit || 0).toLocaleString()}</td>
                            </tr>
                          ))}
                          {chartData.length === 0 && (
                            <tr>
                              <td colSpan={3} className="p-20 text-center text-xs font-black text-gray-400 uppercase tracking-widest">No data available</td>
                            </tr>
                          )}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t-2 border-gray-900">
                          <tr>
                            <td className="p-6 font-black text-gray-900 uppercase text-[10px] tracking-widest">Monthly Totals</td>
                            <td className="p-6 text-right font-black text-green-700 text-lg">Rs. {(stats.totalRevenue || 0).toLocaleString()}</td>
                            <td className="p-6 text-right font-black text-red-700 text-lg">Rs. {(stats.totalCost + stats.totalTax || 0).toLocaleString()}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showDeleteConfirm && invoiceToDelete && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden border border-red-100 animate-in zoom-in-95 duration-200">
            <div className="p-10 text-center">
               <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner"><AlertTriangle size={40} /></div>
               <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter mb-2">Confirm Purge</h3>
               <p className="text-sm text-gray-500 font-bold mb-8 px-4">Are you sure you want to delete statement <span className="text-red-600 font-black">"{invoiceToDelete.invoiceNumber}"</span>?</p>
               <div className="flex flex-col gap-3">
                  <button onClick={performDelete} className="w-full py-5 bg-red-600 text-white font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-red-700 shadow-xl">Purge Asset</button>
                  <button onClick={() => setShowDeleteConfirm(false)} className="w-full py-5 bg-gray-100 text-gray-600 font-black rounded-2xl uppercase tracking-widest text-[10px]">Abort</button>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminOffice;
