
import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  AlertTriangle, 
  DollarSign, 
  Briefcase, 
  Sparkles,
  FileText,
  Wallet,
  Activity,
  Award,
  ArrowUpRight,
  ArrowDownLeft,
  Crown,
  Fingerprint,
  Zap,
  Package,
  ArrowRight,
  ShieldCheck,
  LayoutDashboard,
  CheckCircle,
  PlusCircle,
  ClipboardList,
  UserPlus,
  RefreshCw,
  Calendar,
  BarChart3
} from 'lucide-react';
import { Product, Invoice, UserRole, ViewType } from '../types';
import { db } from '../db';
import { geminiService } from '../geminiService';
import { APP_LOGO_URL, APP_NAME } from '../constants';
import { 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend 
} from 'recharts';

interface DashboardProps {
  products: Product[];
  invoices: Invoice[];
  clients: any[];
  role: UserRole;
  userId: string;
  onNavigate: (view: ViewType) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ products, invoices, role, userId, onNavigate }) => {
  const [aiInsights, setAiInsights] = useState<string>("Reviewing Overplast Beauty metrics...");
  const [loadingInsights, setLoadingInsights] = useState(true);
  const [lastInsightUpdate, setLastInsightUpdate] = useState<number>(0);
  const [monthlyIn, setMonthlyIn] = useState(0);
  const [monthlyOut, setMonthlyOut] = useState(0);
  const [greeting, setGreeting] = useState('');

  // Analytics State
  const [chartYear, setChartYear] = useState<number>(new Date().getFullYear());
  const [selectedMonthPart, setSelectedMonthPart] = useState<string>(new Date().toISOString().slice(5, 7)); // MM
  const [selectedYearPart, setSelectedYearPart] = useState<number>(new Date().getFullYear()); // YYYY
  const [chartMonth, setChartMonth] = useState<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [yearlyViewMode, setYearlyViewMode] = useState<'value' | 'unit'>('value');
  const [monthlyViewMode, setMonthlyViewMode] = useState<'value' | 'unit'>('value');

  // Sync back to chartMonth
  useEffect(() => {
    setChartMonth(`${selectedYearPart}-${selectedMonthPart}`);
  }, [selectedMonthPart, selectedYearPart]);

  const [transactions, setTransactions] = useState<any[]>([]);
  const [flowPeriod, setFlowPeriod] = useState<'year' | 'month'>('year');
  const [flowViewType, setFlowViewType] = useState<'chart' | 'list'>('chart');

  const fetchInsights = async (force = false) => {
    if (role !== 'Admin') {
      setLoadingInsights(false);
      return;
    }
    
    // Only auto-fetch if it's been more than 30 minutes or if forced
    const now = Date.now();
    if (!force && lastInsightUpdate > 0 && (now - lastInsightUpdate < 1000 * 60 * 30)) {
      setLoadingInsights(false);
      return;
    }

    setLoadingInsights(true);
    try {
      const insight = await geminiService.analyzeInventory(products);
      setAiInsights(insight);
      setLastInsightUpdate(now);
    } catch (e) {
      setAiInsights("AI Advisor is currently resting. Check back later.");
    } finally {
      setLoadingInsights(false);
    }
  };

  useEffect(() => {
    setGreeting('Welcome');
    if (products.length > 0) fetchInsights();
    else setLoadingInsights(false);
  }, [role]); // Only re-fetch if role changes (Admin vs Staff)

  useEffect(() => {
    const fetchTransactions = async () => {
      const txs = await db.getStockTransactions(role === 'Admin' ? undefined : userId);
      const currentMonth = new Date().toISOString().slice(0, 7);
      
      // For Admin, show global flow; for Staff, show personal flow
      const filteredTxs = (role === 'Admin') ? txs : txs.filter(t => t.createdBy === userId);
      setTransactions(filteredTxs);
      
      const inUnits = filteredTxs.filter(t => (t.type === 'IN' || t.type === 'RETURN') && t.date.startsWith(currentMonth)).reduce((sum, t) => sum + t.quantity, 0);
      const outUnits = filteredTxs.filter(t => t.type === 'OUT' && t.date.startsWith(currentMonth)).reduce((sum, t) => sum + t.quantity, 0);
      setMonthlyIn(inUnits);
      setMonthlyOut(outUnits);
    };
    fetchTransactions();
  }, [products, invoices, userId, role]);

  // For Admin, summary stats reflect ALL products. For Staff, only their own.
  const displayProducts = role === 'Admin' ? products : products.filter(p => p.createdBy === userId);
  const staffProducts = displayProducts; // Legacy name used in some places

  const validInvoices = invoices.filter(inv => inv.status !== 'Returned');
  const totalRevenue = validInvoices.reduce((sum, inv) => sum + ((inv.subtotal || 0) - (inv.discountTotal || 0) + (inv.taxTotal || 0)), 0);
  const netSales = validInvoices.reduce((sum, inv) => sum + ((inv.subtotal || 0) - (inv.discountTotal || 0)), 0);
  const totalCost = validInvoices.reduce((sum, inv) => {
    return sum + (inv.items || []).reduce((itemSum, item) => {
      const product = products.find(p => p.id === item.productId);
      const purchasePrice = product?.purchasePrice || 0;
      return itemSum + (purchasePrice * item.quantity);
    }, 0);
  }, 0);
  const estimatedProfit = netSales - totalCost;
  const lowStockItems = displayProducts.filter(p => p.stock <= p.minStock).length;
  const inventoryValue = displayProducts.reduce((sum, p) => sum + (p.tp * p.stock), 0);

  const currentMonthPrefix = new Date().toISOString().slice(0, 7);
  const currentMonthInvoices = validInvoices.filter(inv => inv.date && inv.date.startsWith(currentMonthPrefix));
  const currentMonthUnits = currentMonthInvoices.reduce((sum, inv) => {
    return sum + (inv.items || []).reduce((itemSum, item) => itemSum + (item.quantity || 0), 0);
  }, 0);

  const adminStats = [
    { label: 'Critical Assets', value: lowStockItems, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', trend: 'Reorder Now' },
    { label: 'Total Invoices', value: invoices.length, icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50', trend: 'Issued' },
    { label: 'Total Products', value: products.length, icon: Package, color: 'text-indigo-600', bg: 'bg-indigo-50', trend: 'Catalog' },
    { label: 'Total Monthly Sales', value: `${currentMonthUnits.toLocaleString()} Units`, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50', trend: 'This Month' },
  ];

  // Calculate Yearly Sales Data (Value and Units)
  const yearlyData = useMemo(() => {
    const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return monthsShort.map((monthName, idx) => {
      const monthStr = (idx + 1).toString().padStart(2, '0');
      const yearMonthPrefix = `${chartYear}-${monthStr}`;
      
      const monthlyInvoices = validInvoices.filter(inv => inv.date && inv.date.startsWith(yearMonthPrefix));
      
      const totalVal = monthlyInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
      const totalUnits = monthlyInvoices.reduce((sum, inv) => {
        return sum + (inv.items || []).reduce((itemSum, item) => itemSum + (item.quantity || 0), 0);
      }, 0);

      return {
        name: monthName,
        value: totalVal,
        units: totalUnits,
      };
    });
  }, [validInvoices, chartYear]);

  // Calculate Monthly Sales Data (Value and Units)
  const monthlyData = useMemo(() => {
    const [yr, m] = chartMonth.split('-').map(Number);
    if (isNaN(yr) || isNaN(m)) return [];
    
    // Get last day of the month
    const daysInMonth = new Date(yr, m, 0).getDate();
    
    const data = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = day.toString().padStart(2, '0');
      const fullDate = `${chartMonth}-${dayStr}`;
      
      const dailyInvoices = validInvoices.filter(inv => inv.date === fullDate);
      
      const totalVal = dailyInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
      const totalUnits = dailyInvoices.reduce((sum, inv) => {
        return sum + (inv.items || []).reduce((itemSum, item) => itemSum + (item.quantity || 0), 0);
      }, 0);

      data.push({
        day: `${day}`,
        date: fullDate,
        value: totalVal,
        units: totalUnits,
      });
    }
    return data;
  }, [validInvoices, chartMonth]);

  // Calculate Yearly Inventory Flow Data (Inflow vs Outflow units)
  const yearlyFlowData = useMemo(() => {
    const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return monthsShort.map((monthName, idx) => {
      const monthStr = (idx + 1).toString().padStart(2, '0');
      const yearMonthPrefix = `${chartYear}-${monthStr}`;
      
      const monthlyTxs = transactions.filter(t => t.date && t.date.startsWith(yearMonthPrefix));
      
      const stockIn = monthlyTxs
        .filter(t => t.type === 'IN' || t.type === 'RETURN')
        .reduce((sum, t) => sum + (t.quantity || 0), 0);
        
      const stockOut = monthlyTxs
        .filter(t => t.type === 'OUT')
        .reduce((sum, t) => sum + (t.quantity || 0), 0);

      return {
        name: monthName,
        stockIn,
        stockOut,
      };
    });
  }, [transactions, chartYear]);

  // Calculate Monthly Inventory Flow Data (Inflow vs Outflow units by day)
  const monthlyFlowData = useMemo(() => {
    const [yr, m] = chartMonth.split('-').map(Number);
    if (isNaN(yr) || isNaN(m)) return [];
    
    // Get last day of the month
    const daysInMonth = new Date(yr, m, 0).getDate();
    
    const data = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = day.toString().padStart(2, '0');
      const fullDate = `${chartMonth}-${dayStr}`;
      
      const dailyTxs = transactions.filter(t => t.date === fullDate);
      
      const stockIn = dailyTxs
        .filter(t => t.type === 'IN' || t.type === 'RETURN')
        .reduce((sum, t) => sum + (t.quantity || 0), 0);
        
      const stockOut = dailyTxs
        .filter(t => t.type === 'OUT')
        .reduce((sum, t) => sum + (t.quantity || 0), 0);

      data.push({
        day: `${day}`,
        date: fullDate,
        stockIn,
        stockOut,
      });
    }
    return data;
  }, [transactions, chartMonth]);

  // Dynamic available years from invoices
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>();
    yearsSet.add(new Date().getFullYear());
    invoices.forEach(inv => {
      if (inv.date) {
        const yr = new Date(inv.date).getFullYear();
        if (!isNaN(yr)) yearsSet.add(yr);
      }
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [invoices]);

  const staffStats = [
    { label: 'Total Assets', value: staffProducts.length, icon: Package, color: 'text-gray-900', bg: 'bg-gray-100', trend: 'Portfolio' },
    { label: 'Monthly In', value: monthlyIn, icon: ArrowUpRight, color: 'text-green-600', bg: 'bg-green-50', trend: 'Received' },
    { label: 'Monthly Out', value: monthlyOut, icon: ArrowDownLeft, color: 'text-blue-600', bg: 'bg-blue-50', trend: 'Dispatched' },
    { label: 'Alerts', value: lowStockItems, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', trend: 'Low Stock' },
  ];

  const activeStats = role === 'Admin' ? adminStats : staffStats;

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20">
      <div className="relative overflow-hidden bg-white p-10 rounded-[3.5rem] border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-8 z-10 min-w-0">
          <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center shadow-2xl p-3 border border-gray-100 flex-shrink-0">
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
          <div className="min-w-0">
            <h1 className="text-2xl md:text-4xl font-black text-gray-900 tracking-tighter leading-tight mb-2 truncate">
              {greeting}, {role === 'Admin' ? 'Master Admin' : 'Staff Member'}
            </h1>
            <p className="text-[10px] md:text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 truncate">
              <Fingerprint size={14} className="text-yellow-600 flex-shrink-0" /> Overplast Node verified & synchronized
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 z-10">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">System Pulse</p>
            <div className="flex items-center gap-2 text-green-600 font-black">
              <Zap size={14} fill="currentColor" />
              <span>LATENCY: 12ms</span>
            </div>
          </div>
          <div className="w-[1px] h-10 bg-gray-100 mx-2 hidden sm:block"></div>
          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex items-center gap-3">
             <Activity size={20} className="text-indigo-600" />
             <span className="text-xs font-black uppercase tracking-widest text-gray-600">v2.5 Live</span>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-50 rounded-full -mr-32 -mt-32 blur-[80px] opacity-50"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-50 rounded-full -ml-24 -mb-24 blur-[60px] opacity-40"></div>
      </div>

      {role === 'Admin' && (
        <div className="bg-white p-8 rounded-[2.5rem] border-2 border-yellow-500/20 shadow-sm animate-in slide-in-from-left-4">
           <div className="flex items-center gap-3 mb-6 px-4">
              <Zap size={20} className="text-yellow-600 fill-yellow-600" />
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-900">Tactical Quick Actions</h3>
           </div>
           <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <button 
                onClick={() => onNavigate('inventory')}
                className="flex items-center justify-between p-6 bg-gray-50 rounded-[1.5rem] hover:bg-black hover:text-white transition-all group shadow-sm"
              >
                 <div className="flex items-center gap-3">
                    <PlusCircle size={20} className="text-yellow-600" />
                    <span className="text-[10px] font-black uppercase tracking-widest">New Asset</span>
                 </div>
                 <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
              </button>
              <button 
                onClick={() => onNavigate('invoices')}
                className="flex items-center justify-between p-6 bg-gray-50 rounded-[1.5rem] hover:bg-black hover:text-white transition-all group shadow-sm"
              >
                 <div className="flex items-center gap-3">
                    <ClipboardList size={20} className="text-blue-600" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Billing</span>
                 </div>
                 <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
              </button>
              <button 
                onClick={() => onNavigate('clients')}
                className="flex items-center justify-between p-6 bg-gray-50 rounded-[1.5rem] hover:bg-black hover:text-white transition-all group shadow-sm"
              >
                 <div className="flex items-center gap-3">
                    <UserPlus size={20} className="text-green-600" />
                    <span className="text-[10px] font-black uppercase tracking-widest">New Client</span>
                 </div>
                 <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
              </button>
              <button 
                onClick={() => onNavigate('admin-office')}
                className="flex items-center justify-between p-6 bg-gray-50 rounded-[1.5rem] hover:bg-black hover:text-white transition-all group shadow-sm"
              >
                 <div className="flex items-center gap-3">
                    <TrendingUp size={20} className="text-purple-600" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Analysis</span>
                 </div>
                 <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
              </button>
           </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {activeStats.map((stat, idx) => (
          <div key={idx} className="bg-white p-8 rounded-[2.5rem] border border-gray-200 shadow-sm hover:shadow-2xl transition-all group relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-full h-1 ${role === 'Admin' ? 'bg-black' : 'bg-indigo-600'} opacity-0 group-hover:opacity-100 transition-opacity`}></div>
            <div className="flex justify-between items-start mb-8">
              <div className={`p-4 ${stat.bg} ${stat.color} rounded-2xl transition-transform group-hover:rotate-6 group-hover:scale-110 shadow-sm`}>
                <stat.icon size={28} strokeWidth={2.5} />
              </div>
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-300 group-hover:text-gray-900 transition-colors">{stat.trend}</div>
            </div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">{stat.label}</p>
            <h4 className="text-3xl font-black text-gray-900 tracking-tighter">
              {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
            </h4>
          </div>
        ))}
      </div>

      {role === 'Admin' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in duration-500">
          {/* Monthly Sales Performance Card */}
          <div className="bg-white p-8 md:p-10 rounded-[3rem] border border-gray-100 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-yellow-500 opacity-80"></div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-yellow-50 text-yellow-600 rounded-2xl border border-yellow-100">
                  <Calendar size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Monthly Sales</h3>
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Daily performance tracking</p>
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                {/* Month Selector */}
                <select 
                  value={selectedMonthPart}
                  onChange={(e) => setSelectedMonthPart(e.target.value)}
                  className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-black uppercase text-gray-700 focus:outline-none focus:border-yellow-500 cursor-pointer"
                >
                  <option value="01">January</option>
                  <option value="02">February</option>
                  <option value="03">March</option>
                  <option value="04">April</option>
                  <option value="05">May</option>
                  <option value="06">June</option>
                  <option value="07">July</option>
                  <option value="08">August</option>
                  <option value="09">September</option>
                  <option value="10">October</option>
                  <option value="11">November</option>
                  <option value="12">December</option>
                </select>

                {/* Year Selector */}
                <select 
                  value={selectedYearPart}
                  onChange={(e) => setSelectedYearPart(Number(e.target.value))}
                  className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-black uppercase text-gray-700 focus:outline-none focus:border-yellow-500 cursor-pointer"
                >
                  {availableYears.map(yr => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>

                {/* Toggle View Mode */}
                <div className="flex bg-gray-100 p-1 rounded-xl">
                  <button 
                    onClick={() => setMonthlyViewMode('value')}
                    className={`px-3 py-1 text-[9px] font-black uppercase rounded-lg transition-all ${monthlyViewMode === 'value' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                  >
                    Value (Rs.)
                  </button>
                  <button 
                    onClick={() => setMonthlyViewMode('unit')}
                    className={`px-3 py-1 text-[9px] font-black uppercase rounded-lg transition-all ${monthlyViewMode === 'unit' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                  >
                    Units
                  </button>
                </div>
              </div>
            </div>

            <div className="h-[280px] w-full">
              {monthlyData.length > 0 && monthlyData.some(d => d.value > 0 || d.units > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="monthlyGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={monthlyViewMode === 'value' ? '#D4AF37' : '#4F46E5'} stopOpacity={0.2}/>
                        <stop offset="95%" stopColor={monthlyViewMode === 'value' ? '#D4AF37' : '#4F46E5'} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 9, fontWeight: 'bold', fill: '#9ca3af' }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 9, fontWeight: 'bold', fill: '#9ca3af' }} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '1rem', border: '1px solid #f3f4f6', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', fontSize: '11px', fontWeight: 'bold' }}
                      formatter={(value: any) => [monthlyViewMode === 'value' ? `Rs. ${Number(value).toLocaleString()}` : `${Number(value).toLocaleString()} Units`, monthlyViewMode === 'value' ? 'Revenue' : 'Units Sold']}
                    />
                    <Area 
                      type="monotone" 
                      dataKey={monthlyViewMode === 'value' ? 'value' : 'units'} 
                      stroke={monthlyViewMode === 'value' ? '#D4AF37' : '#4F46E5'} 
                      strokeWidth={2.5} 
                      fillOpacity={1} 
                      fill="url(#monthlyGrad)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-gray-100 rounded-[2rem] bg-gray-50/50 p-6">
                  <BarChart3 className="text-gray-300 mb-2 animate-bounce" size={32} />
                  <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">No sales logged in this period</p>
                </div>
              )}
            </div>
          </div>

          {/* Yearly Sales Performance Card */}
          <div className="bg-white p-8 md:p-10 rounded-[3rem] border border-gray-100 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-600 opacity-80"></div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100">
                  <BarChart3 size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Yearly Sales</h3>
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Monthly sales comparison</p>
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                {/* Year Selector */}
                <select 
                  value={chartYear}
                  onChange={(e) => setChartYear(Number(e.target.value))}
                  className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-black uppercase text-gray-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  {availableYears.map(yr => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>

                {/* Toggle View Mode */}
                <div className="flex bg-gray-100 p-1 rounded-xl">
                  <button 
                    onClick={() => setYearlyViewMode('value')}
                    className={`px-3 py-1 text-[9px] font-black uppercase rounded-lg transition-all ${yearlyViewMode === 'value' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                  >
                    Value (Rs.)
                  </button>
                  <button 
                    onClick={() => setYearlyViewMode('unit')}
                    className={`px-3 py-1 text-[9px] font-black uppercase rounded-lg transition-all ${yearlyViewMode === 'unit' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                  >
                    Units
                  </button>
                </div>
              </div>
            </div>

            <div className="h-[280px] w-full">
              {yearlyData.length > 0 && yearlyData.some(d => d.value > 0 || d.units > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={yearlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 9, fontWeight: 'bold', fill: '#9ca3af' }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 9, fontWeight: 'bold', fill: '#9ca3af' }} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '1rem', border: '1px solid #f3f4f6', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', fontSize: '11px', fontWeight: 'bold' }}
                      formatter={(value: any) => [yearlyViewMode === 'value' ? `Rs. ${Number(value).toLocaleString()}` : `${Number(value).toLocaleString()} Units`, yearlyViewMode === 'value' ? 'Revenue' : 'Units Sold']}
                    />
                    <Bar 
                      dataKey={yearlyViewMode === 'value' ? 'value' : 'units'} 
                      fill={yearlyViewMode === 'value' ? '#D4AF37' : '#4F46E5'} 
                      radius={[10, 10, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-gray-100 rounded-[2rem] bg-gray-50/50 p-6">
                  <BarChart3 className="text-gray-300 mb-2" size={32} />
                  <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">No sales logged in this period</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white p-10 rounded-[3.5rem] border border-gray-100 shadow-sm relative overflow-hidden group">
             <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gray-100 text-black rounded-xl group-hover:bg-black group-hover:text-white transition-all"><LayoutDashboard size={20} /></div>
                  <div>
                    <h3 className="font-black text-gray-900 uppercase tracking-widest text-lg">Inventory Flow Ledger</h3>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Inflow vs Outflow unit tracker</p>
                  </div>
                </div>
                
                {role === 'Admin' && (
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Flow View Mode Toggle */}
                    <div className="flex bg-gray-100 p-1 rounded-xl">
                      <button 
                        onClick={() => setFlowViewType('chart')}
                        className={`px-3 py-1.5 text-[9px] font-black uppercase rounded-lg transition-all ${flowViewType === 'chart' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                      >
                        Chart
                      </button>
                      <button 
                        onClick={() => setFlowViewType('list')}
                        className={`px-3 py-1.5 text-[9px] font-black uppercase rounded-lg transition-all ${flowViewType === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                      >
                        List
                      </button>
                    </div>

                    {flowViewType === 'chart' && (
                      <div className="flex bg-gray-100 p-1 rounded-xl">
                        <button 
                          onClick={() => setFlowPeriod('year')}
                          className={`px-3 py-1.5 text-[9px] font-black uppercase rounded-lg transition-all ${flowPeriod === 'year' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                        >
                          Yearly
                        </button>
                        <button 
                          onClick={() => setFlowPeriod('month')}
                          className={`px-3 py-1.5 text-[9px] font-black uppercase rounded-lg transition-all ${flowPeriod === 'month' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                        >
                          Monthly
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <button 
                  onClick={() => onNavigate('invoices')}
                  className="text-[9px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2 hover:translate-x-1 transition-transform"
                >
                   View Full Archive <ArrowRight size={12} />
                </button>
             </div>
             
             {role === 'Admin' && flowViewType === 'chart' ? (
               <div className="h-[300px] w-full">
                 {(flowPeriod === 'year' ? yearlyFlowData : monthlyFlowData).some(d => d.stockIn > 0 || d.stockOut > 0) ? (
                   <ResponsiveContainer width="100%" height="100%">
                     <AreaChart 
                       data={flowPeriod === 'year' ? yearlyFlowData : monthlyFlowData} 
                       margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                     >
                       <defs>
                         <linearGradient id="flowInGrad" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="#10B981" stopOpacity={0.2}/>
                           <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                         </linearGradient>
                         <linearGradient id="flowOutGrad" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/>
                           <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                         </linearGradient>
                       </defs>
                       <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                       <XAxis 
                         dataKey={flowPeriod === 'year' ? 'name' : 'day'} 
                         tickLine={false} 
                         axisLine={false} 
                         tick={{ fontSize: 9, fontWeight: 'bold', fill: '#9ca3af' }} 
                       />
                       <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 9, fontWeight: 'bold', fill: '#9ca3af' }} />
                       <Tooltip 
                         contentStyle={{ borderRadius: '1rem', border: '1px solid #f3f4f6', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', fontSize: '11px', fontWeight: 'bold' }}
                         formatter={(value: any, name: any) => [
                           `${value.toLocaleString()} Units`, 
                           name === 'stockIn' ? 'Stock Added / Returned' : 'Stock Dispatched'
                         ]}
                       />
                       <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }} />
                       <Area 
                         type="monotone" 
                         name="stockIn"
                         dataKey="stockIn" 
                         stroke="#10B981" 
                         strokeWidth={2.5} 
                         fillOpacity={1} 
                         fill="url(#flowInGrad)" 
                       />
                       <Area 
                         type="monotone" 
                         name="stockOut"
                         dataKey="stockOut" 
                         stroke="#ef4444" 
                         strokeWidth={2.5} 
                         fillOpacity={1} 
                         fill="url(#flowOutGrad)" 
                       />
                     </AreaChart>
                   </ResponsiveContainer>
                 ) : (
                   <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-gray-100 rounded-[2rem] bg-gray-50/50 p-6">
                     <BarChart3 className="text-gray-300 mb-2" size={32} />
                     <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">No inventory flow recorded</p>
                   </div>
                 )}
               </div>
             ) : (
               <div className="space-y-4">
                  {invoices.length > 0 ? invoices.slice(0, 5).map((inv, idx) => (
                    <div key={idx} className="flex items-center justify-between p-6 bg-gray-50 rounded-[2rem] border border-transparent hover:border-yellow-200 hover:bg-white transition-all group/item shadow-sm">
                      <div className="flex items-center gap-6">
                        <div className="w-14 h-14 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center text-gray-400 group-hover/item:bg-black group-hover/item:text-yellow-500 transition-all"><FileText size={22} /></div>
                        <div>
                          <p className="text-base font-black text-gray-900 uppercase tracking-tighter">{inv.invoiceNumber}</p>
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{inv.clientName} • {inv.date}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        {role === 'Admin' ? (
                          <p className="text-base font-black text-gray-900">Rs. {inv.total.toLocaleString()}</p>
                        ) : (
                          <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">DISPATCHED</p>
                        )}
                        <span className={`text-[9px] font-black uppercase px-4 py-1 rounded-full border ${inv.status === 'Paid' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                          {inv.status}
                        </span>
                      </div>
                    </div>
                  )) : (
                    <div className="py-20 text-center opacity-20">
                      <FileText size={48} className="mx-auto mb-4" />
                      <p className="font-black uppercase tracking-widest">No activity recorded</p>
                    </div>
                  )}
               </div>
             )}
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-indigo-700 p-12 rounded-[4rem] text-white shadow-2xl relative overflow-hidden group animate-in slide-in-from-right-4">
             <div className="absolute -bottom-10 -right-10 opacity-10 group-hover:rotate-12 transition-transform duration-700"><Crown size={200} /></div>
             <div className="relative z-10 flex flex-col items-center text-center gap-6">
                <div className="p-5 bg-white/10 rounded-[2rem] border border-white/20 shadow-xl">
                  <Award size={48} className="text-yellow-400" />
                </div>
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-tighter mb-2">Verified Node</h3>
                  <p className="text-xs font-bold text-indigo-100 opacity-70 leading-relaxed px-6">Your workplace session is secured with end-to-end cloud encryption. Movement metrics are synced with the central vault.</p>
                </div>
             </div>
          </div>
          
          <div className="bg-white p-10 rounded-[4rem] border border-gray-100 shadow-sm hover:shadow-lg transition-all">
            <div className="flex items-center justify-between mb-10">
               <div className="flex items-center gap-4">
                 <div className="p-3 bg-red-100 text-red-600 rounded-xl shadow-inner"><AlertTriangle size={20} /></div>
                 <h3 className="font-black text-gray-900 uppercase tracking-widest text-lg">Stock Depletion</h3>
               </div>
               <span className="text-[10px] font-black text-red-600 bg-red-50 px-4 py-1.5 rounded-full border border-red-100 uppercase tracking-widest">Attention</span>
            </div>
            <div className="space-y-8">
              {staffProducts.filter(p => p.stock <= p.minStock * 1.5).length > 0 ? (
                staffProducts.filter(p => p.stock <= p.minStock * 1.5).slice(0, 5).map((p, idx) => (
                  <div key={idx} className="space-y-4">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-[0.1em]">
                      <span className="text-gray-900 truncate max-w-[140px]">{p.name}</span>
                      <span className={p.stock <= p.minStock ? 'text-red-600' : 'text-amber-600'}>{p.stock} units</span>
                    </div>
                    <div className="h-2 bg-gray-50 rounded-full overflow-hidden border border-gray-100">
                       <div className={`h-full transition-all duration-1000 rounded-full ${p.stock <= p.minStock ? 'bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.5)]' : 'bg-amber-500'}`} style={{ width: `${Math.min((p.stock / (p.minStock * 2 || 1)) * 100, 100)}%` }} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-10">
                   <CheckCircle className="mx-auto text-green-500 mb-4" size={32} />
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic">All assets at optimal levels</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
