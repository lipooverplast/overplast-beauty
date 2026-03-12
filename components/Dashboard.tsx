
import React, { useState, useEffect } from 'react';
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
  RefreshCw
} from 'lucide-react';
import { Product, Invoice, UserRole, ViewType } from '../types';
import { db } from '../db';
import { geminiService } from '../geminiService';
import { APP_LOGO_URL, APP_NAME } from '../constants';

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
      const inUnits = txs.filter(t => t.type === 'IN' && t.date.startsWith(currentMonth)).reduce((sum, t) => sum + t.quantity, 0);
      const outUnits = txs.filter(t => t.type === 'OUT' && t.date.startsWith(currentMonth)).reduce((sum, t) => sum + t.quantity, 0);
      setMonthlyIn(inUnits);
      setMonthlyOut(outUnits);
    };
    fetchTransactions();
  }, [products, invoices, userId, role]);

  const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const netSales = invoices.reduce((sum, inv) => sum + ((inv.subtotal || 0) - (inv.discountTotal || 0)), 0);
  const totalCost = invoices.reduce((sum, inv) => {
    return sum + (inv.items || []).reduce((itemSum, item) => {
      const product = products.find(p => p.id === item.productId);
      const purchasePrice = product?.purchasePrice || 0;
      return itemSum + (purchasePrice * item.quantity);
    }, 0);
  }, 0);
  const estimatedProfit = netSales - totalCost;
  const lowStockItems = products.filter(p => p.stock <= p.minStock).length;
  const inventoryValue = products.reduce((sum, p) => sum + (p.tp * p.stock), 0);

  const adminStats = [
    { label: 'Net Asset Value', value: `Rs. ${inventoryValue.toLocaleString()}`, icon: Wallet, color: 'text-indigo-600', bg: 'bg-indigo-50', trend: 'Valuation' },
    { label: 'Revenue (Total)', value: `Rs. ${totalRevenue.toLocaleString()}`, icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50', trend: 'Inbound' },
    { label: 'Estimated Profit', value: `Rs. ${estimatedProfit.toLocaleString()}`, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50', trend: 'Net Gain' },
    { label: 'Critical Assets', value: lowStockItems, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', trend: 'Reorder Now' },
  ];

  const staffStats = [
    { label: 'Total Assets', value: products.length, icon: Package, color: 'text-gray-900', bg: 'bg-gray-100', trend: 'Portfolio' },
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white p-10 rounded-[3.5rem] border border-gray-100 shadow-sm relative overflow-hidden group">
             <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gray-100 text-black rounded-xl group-hover:bg-black group-hover:text-white transition-all"><LayoutDashboard size={20} /></div>
                  <h3 className="font-black text-gray-900 uppercase tracking-widest text-lg">Inventory Flow Ledger</h3>
                </div>
                <button 
                  onClick={() => onNavigate('invoices')}
                  className="text-[9px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2 hover:translate-x-1 transition-transform"
                >
                   View Full Archive <ArrowRight size={12} />
                </button>
             </div>
             
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
          </div>
        </div>

        <div className="space-y-8">
          {role === 'Admin' ? (
            <div className="bg-black p-10 rounded-[4rem] text-white shadow-2xl relative overflow-hidden group border border-gray-800 animate-in zoom-in-95">
              <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/20 rounded-full blur-[60px] group-hover:bg-yellow-500/40 transition-all duration-700"></div>
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-10">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-yellow-500/10 text-yellow-500 rounded-2xl backdrop-blur-md border border-yellow-500/20 animate-pulse"><Sparkles size={24} /></div>
                    <div>
                      <h3 className="font-black text-xs uppercase tracking-[0.4em] mb-1">AI Stock Advisor</h3>
                      <p className="text-[8px] font-black text-yellow-500/50 uppercase tracking-widest">Master Intelligence Hub</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => fetchInsights(true)} 
                    disabled={loadingInsights}
                    className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white/40 hover:text-white"
                    title="Refresh AI Insights"
                  >
                    <RefreshCw size={16} className={loadingInsights ? 'animate-spin' : ''} />
                  </button>
                </div>
                {loadingInsights ? (
                  <div className="space-y-6">
                    <div className="h-4 bg-white/5 rounded-full w-full"></div>
                    <div className="h-4 bg-white/5 rounded-full w-3/4"></div>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div className="bg-white/5 p-8 rounded-[2.5rem] border border-white/10 relative group-hover:border-yellow-500/30 transition-all">
                      <p className="text-sm leading-relaxed font-bold opacity-80 italic">"{aiInsights}"</p>
                    </div>
                    <button 
                      onClick={() => onNavigate('admin-office')}
                      className="w-full py-6 bg-white text-black font-black rounded-[2rem] text-[10px] uppercase tracking-[0.2em] hover:bg-yellow-500 transition-all shadow-xl flex items-center justify-center gap-3"
                    >
                      Review Insights <ArrowRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
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
          )}
          
          <div className="bg-white p-10 rounded-[4rem] border border-gray-100 shadow-sm hover:shadow-lg transition-all">
            <div className="flex items-center justify-between mb-10">
               <div className="flex items-center gap-4">
                 <div className="p-3 bg-red-100 text-red-600 rounded-xl shadow-inner"><AlertTriangle size={20} /></div>
                 <h3 className="font-black text-gray-900 uppercase tracking-widest text-lg">Stock Depletion</h3>
               </div>
               <span className="text-[10px] font-black text-red-600 bg-red-50 px-4 py-1.5 rounded-full border border-red-100 uppercase tracking-widest">Attention</span>
            </div>
            <div className="space-y-8">
              {products.filter(p => p.stock <= p.minStock * 1.5).length > 0 ? (
                products.filter(p => p.stock <= p.minStock * 1.5).slice(0, 5).map((p, idx) => (
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
