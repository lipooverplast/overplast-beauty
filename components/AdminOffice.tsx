
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../db';
import { Profile, UserRole, UserStatus, Invoice, Product, ViewType } from '../types';
import { 
  Users, Shield, Activity, Lock, Search, 
  MoreVertical, RefreshCw, Loader2, ShieldCheck, 
  UserPlus, Ban, CheckCircle, Database, Server,
  History, Eye, Trash2, Key, Mail, TrendingUp, BarChart3, PieChart as PieChartIcon, DollarSign,
  Receipt, ArrowUpRight, ArrowDownRight, Percent, Briefcase, Calendar, Printer, Download, FileText, X, AlertTriangle,
  Zap, PlusSquare, FilePlus, UserPlus2, Wallet2, ChevronDown
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell, PieChart, Pie, AreaChart, Area
} from 'recharts';
import UserManagement from './UserManagement';
import SettingsView from './Settings';
import SecuritySettings from './SecuritySettings';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

const AdminOffice: React.FC<{ onUpdate: () => void, onNavigate: (view: ViewType) => void }> = ({ onUpdate, onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'infrastructure' | 'reports' | 'intelligence' | 'security'>('intelligence');
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
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminData();
  }, [selectedMonth]);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const [profiles, invoices, products] = await Promise.all([
        db.getAllProfiles(),
        db.getInvoices(),
        db.getProducts()
      ]);

      setAllInvoices(invoices);
      setAllProducts(products);

      const monthlyInvoices = invoices.filter(inv => 
        inv.date.startsWith(selectedMonth)
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
          cost += (item.tp || 0) * (item.quantity || 0);
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
    const monthlyInvoices = allInvoices.filter(inv => inv.date.startsWith(selectedMonth));
    
    monthlyInvoices.forEach(inv => {
      const date = inv.date;
      const day = inv.date.split('-')[2];
      if (!dailyData[date]) dailyData[date] = { date, day, revenue: 0, debit: 0, profit: 0, invoices: [] };
      dailyData[date].revenue += inv.total;
      dailyData[date].invoices.push(inv);
      
      let invCost = 0;
      inv.items.forEach(item => { invCost += (item.tp || 0) * (item.quantity || 0); });
      const invDebit = invCost + inv.taxTotal;
      dailyData[date].debit += invDebit;
      dailyData[date].profit += (inv.total - invDebit);
    });

    return Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date));
  }, [allInvoices, selectedMonth]);

  const categoryData = useMemo(() => {
    const cats: Record<string, number> = {};
    allProducts.forEach(p => {
      cats[p.category] = (cats[p.category] || 0) + (p.stock * p.tp);
    });
    return Object.entries(cats).map(([name, value]) => ({ name, value }));
  }, [allProducts]);

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
        
        <div className="flex bg-gray-50 p-1.5 rounded-2xl border border-gray-200 shadow-inner overflow-x-auto">
          <button onClick={() => setActiveTab('intelligence')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'intelligence' ? 'bg-black text-white shadow-lg' : 'text-gray-500 hover:bg-white'}`}>
            <Zap size={14} /> Intelligence
          </button>
          <button onClick={() => setActiveTab('users')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'users' ? 'bg-black text-white shadow-lg' : 'text-gray-500 hover:bg-white'}`}>
            <Users size={14} /> Workforce
          </button>
          <button onClick={() => setActiveTab('reports')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'reports' ? 'bg-black text-white shadow-lg' : 'text-gray-500 hover:bg-white'}`}>
            <BarChart3 size={14} /> Financials
          </button>
          <button onClick={() => setActiveTab('security')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'security' ? 'bg-black text-white shadow-lg' : 'text-gray-500 hover:bg-white'}`}>
            <Lock size={14} /> Security
          </button>
          <button onClick={() => setActiveTab('infrastructure')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'infrastructure' ? 'bg-black text-white shadow-lg' : 'text-gray-500 hover:bg-white'}`}>
            <Server size={14} /> Cloud Nodes
          </button>
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
          <div className="lg:col-span-4 bg-black p-10 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 right-0 p-8 opacity-5"><PieChartIcon size={120} /></div>
             <div className="relative z-10 h-full flex flex-col">
                <h3 className="text-xl font-black uppercase tracking-tight mb-8">Asset Valuation</h3>
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
                        <span className="text-yellow-500">Rs. {cat.value.toLocaleString()}</span>
                     </div>
                   ))}
                </div>
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
            {activeTab === 'users' && <UserManagement onUpdate={fetchAdminData} />}
            {activeTab === 'security' && <SecuritySettings />}
            {activeTab === 'infrastructure' && <SettingsView />}
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
                      <button onClick={exportReportToPdf} disabled={isGeneratingPdf} className="flex items-center gap-3 px-8 py-4 bg-black text-white rounded-2xl font-black text-[10px] uppercase hover:bg-gray-900 shadow-xl transition-all">
                        {isGeneratingPdf ? <Loader2 className="animate-spin text-yellow-500" size={18} /> : <Download size={18} />} Export Report
                      </button>
                   </div>
                </div>

                <div className="bg-white p-16 md:p-24 rounded-[3.5rem] border border-gray-200 shadow-2xl relative overflow-hidden" id="monthly-report-area">
                  <div className="flex justify-between items-start mb-24">
                    <div>
                        <h1 className="text-4xl font-black tracking-tighter text-gray-900 leading-none uppercase">OVERPLAST BEAUTY</h1>
                        <p className="text-xl text-gray-500 italic font-serif mt-2">Executive P&L Statement</p>
                    </div>
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
                               <span className="text-sm font-bold text-gray-600 uppercase tracking-widest">Total Sales (Revenue)</span>
                               <span className="text-lg font-black text-green-600">Rs. {stats.totalRevenue.toLocaleString()}</span>
                             </div>
                             <div className="flex justify-between items-center">
                               <span className="text-sm font-bold text-gray-600 uppercase tracking-widest">Total Debit (Cost + Tax)</span>
                               <span className="text-lg font-black text-red-600">Rs. {(stats.totalCost + stats.totalTax).toLocaleString()}</span>
                             </div>
                             <div className="flex justify-between items-center">
                               <span className="text-sm font-bold text-amber-600 uppercase tracking-widest">Pending Collection</span>
                               <span className="text-lg font-black text-amber-600">Rs. {stats.pendingAmount.toLocaleString()}</span>
                             </div>
                             <div className="pt-4 border-t border-gray-50 flex justify-between items-center">
                               <span className="text-sm font-bold text-gray-400">Tax Component</span>
                               <span className="text-sm font-black text-gray-500">Rs. {stats.totalTax.toLocaleString()}</span>
                             </div>
                          </div>
                       </div>
                    </div>
                    <div className="bg-black p-16 rounded-[4rem] text-white shadow-2xl flex flex-col justify-center">
                        <p className="text-[10px] font-black text-yellow-500 uppercase tracking-[0.4em] mb-6">Net Profit</p>
                        <h2 className={`text-6xl font-black tracking-tighter ${stats.totalProfit >= 0 ? 'text-white' : 'text-red-400'}`}>Rs. {stats.totalProfit.toLocaleString()}</h2>
                    </div>
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
                                <p className="text-lg font-black text-green-600">Rs. {day.revenue.toLocaleString()}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Debit</p>
                                <p className="text-lg font-black text-red-600">Rs. {day.debit.toLocaleString()}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Profit</p>
                                <p className={`text-lg font-black ${day.profit >= 0 ? 'text-gray-900' : 'text-red-600'}`}>Rs. {day.profit.toLocaleString()}</p>
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
                                      <th className="py-4 text-right">Total</th>
                                      <th className="py-4 text-right">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-50">
                                    {day.invoices.map((inv, i) => (
                                      <tr key={i} className="group/row">
                                        <td className="py-4 font-black text-gray-900 text-xs">{inv.invoiceNumber}</td>
                                        <td className="py-4 font-bold text-gray-600 text-xs">{inv.clientName}</td>
                                        <td className="py-4 text-right font-black text-gray-900 text-xs">Rs. {inv.total.toLocaleString()}</td>
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
                          <History size={48} className="mx-auto mb-4" />
                          <p className="font-black uppercase tracking-widest">No ledger data for this period</p>
                        </div>
                      )}
                    </div>

                    {/* Static Detailed Table for Export/Print */}
                    <div className="mt-12 overflow-hidden border border-gray-200 rounded-[2rem]">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-gray-900 text-white">
                            <th className="p-6 text-[10px] font-black uppercase tracking-widest">Date</th>
                            <th className="p-6 text-[10px] font-black uppercase tracking-widest text-right">Credit</th>
                            <th className="p-6 text-[10px] font-black uppercase tracking-widest text-right">Debit</th>
                            <th className="p-6 text-[10px] font-black uppercase tracking-widest text-right">Profit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {chartData.map((day, idx) => (
                            <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                              <td className="p-6">
                                <p className="text-xs font-black text-gray-900">{day.date}</p>
                                <p className="text-[9px] font-bold text-gray-400 uppercase">{new Date(day.date).toLocaleDateString('en-PK', { weekday: 'short' })}</p>
                              </td>
                              <td className="p-6 text-right font-black text-green-600 text-sm">Rs. {day.revenue.toLocaleString()}</td>
                              <td className="p-6 text-right font-black text-red-600 text-sm">Rs. {day.debit.toLocaleString()}</td>
                              <td className="p-6 text-right font-black text-gray-900 text-sm">Rs. {day.profit.toLocaleString()}</td>
                            </tr>
                          ))}
                          {chartData.length === 0 && (
                            <tr>
                              <td colSpan={4} className="p-20 text-center text-xs font-black text-gray-400 uppercase tracking-widest">No data available</td>
                            </tr>
                          )}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t-2 border-gray-900">
                          <tr>
                            <td className="p-6 font-black text-gray-900 uppercase text-[10px] tracking-widest">Monthly Totals</td>
                            <td className="p-6 text-right font-black text-green-700 text-lg">Rs. {stats.totalRevenue.toLocaleString()}</td>
                            <td className="p-6 text-right font-black text-red-700 text-lg">Rs. {(stats.totalCost + stats.totalTax).toLocaleString()}</td>
                            <td className="p-6 text-right font-black text-gray-900 text-xl">Rs. {stats.totalProfit.toLocaleString()}</td>
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
