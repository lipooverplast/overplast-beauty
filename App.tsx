
import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Package, FileText, Users, Settings, ChevronRight, X, Repeat,
  PanelLeftClose, PanelLeft, Loader2, CloudOff, Database, Cloud, LogOut, AlertCircle, RefreshCw, CheckCircle, Sparkles, UserCheck, Shield, Ban, UserRoundSearch, Star, Crown, Fingerprint, DatabaseZap
} from 'lucide-react';
import { ViewType, Product, Client, Invoice, Profile, UserRole } from './types';
import { db } from './db';
import { isSupabaseConfigured, supabase, clearSupabaseConfig } from './supabaseClient';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import Invoices from './components/Invoices';
import RecurringInvoices from './components/RecurringInvoices';
import Clients from './components/Clients';
import AdminOffice from './components/AdminOffice';
import Auth from './components/Auth';

const AppLogo = ({ className = "" }: { className?: string }) => (
  <img 
    src="/logo.svg" 
    alt="Overplast Beauty" 
    className={`${className} object-contain brightness-110`} 
    onError={(e) => {
      // Fallback if logo is missing
      e.currentTarget.src = "https://picsum.photos/seed/beauty/200/200";
    }}
  />
);

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<ViewType>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024);
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<string>(new Date().toLocaleTimeString());
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [dbError, setDbError] = useState<boolean>(false);
  const [preselectedClientId, setPreselectedClientId] = useState<string | null>(null);

  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      supabase.auth.getSession().then(({ data: { session } }: any) => {
        setUser(session?.user ?? null);
      });
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
        setUser(session?.user ?? null);
      });
      return () => subscription.unsubscribe();
    } else {
      setIsLoading(false);
      refreshData();
    }
  }, []);

  useEffect(() => {
    const fetchInitialData = async () => {
      if (user && isSupabaseConfigured) {
        setIsProfileLoading(true);
        setDbError(false);
        try {
          const p = await db.getProfile(user.id) || await db.ensureProfile(user);
          if (!p) setDbError(true);
          setProfile(p);
        } catch (e) {
          console.error("Init Data Fetch Error:", e);
          setDbError(true);
        } finally {
          setIsProfileLoading(false);
        }
      } else {
        setProfile(null);
      }
      refreshData();
    };
    fetchInitialData();
  }, [user]);

  const refreshData = async (isManual = false) => {
    if (isSupabaseConfigured && !user) {
      setIsLoading(false);
      return;
    }
    
    if (isManual) setIsRefreshing(true);
    else setIsLoading(true);
    
    try {
      const [p, c, i] = await Promise.all([
        db.getProducts(),
        db.getClients(),
        db.getInvoices()
      ]);
      setProducts(p || []);
      setClients(c || []);
      setInvoices(i || []);
      setLastSync(new Date().toLocaleTimeString());
    } catch (err: any) {
      console.error("Bulk Refresh Error:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleCreateInvoiceForClient = (clientId: string) => {
    setPreselectedClientId(clientId);
    setActiveView('invoices');
  };

  const isAdmin = !isSupabaseConfigured || profile?.role === 'Admin';
  const effectiveRole = isAdmin ? 'Admin' : 'Staff';

  if (profile?.status === 'Suspended') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-8">
        <div className="bg-white p-12 rounded-[3rem] shadow-2xl text-center max-w-lg">
          <Ban size={48} className="text-red-600 mx-auto mb-6" />
          <h1 className="text-3xl font-black uppercase mb-4">Access Denied</h1>
          <p className="text-gray-500 mb-8">Node has been decommissioned by administrator.</p>
          <button onClick={() => supabase?.auth.signOut()} className="w-full py-4 bg-black text-white rounded-2xl font-black uppercase text-xs">Disconnect Session</button>
        </div>
      </div>
    );
  }

  if (isSupabaseConfigured && !user) return <Auth />;

  if (isLoading || isProfileLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
        <Loader2 className="animate-spin text-yellow-600" size={48} />
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic">Synchronizing State...</p>
      </div>
    );
  }

  const ActiveComponent = {
    dashboard: (
      <div className="space-y-6">
        {dbError && (
          <div className="bg-red-50 border-4 border-red-600 p-8 rounded-[2rem] shadow-xl animate-in slide-in-from-top-4 duration-500">
             <div className="flex items-start gap-6">
               <div className="p-4 bg-red-600 text-white rounded-2xl shadow-lg"><DatabaseZap size={32} /></div>
               <div className="flex-1">
                 <h3 className="text-2xl font-black text-red-900 uppercase tracking-tighter mb-2">Supabase Connectivity Interrupted</h3>
                 <p className="text-red-700 font-bold mb-4 leading-relaxed">The system is receiving a 500/Read error from your database. This usually means Row Level Security (RLS) is blocking the app from seeing your profile.</p>
                 <div className="bg-white p-4 rounded-xl border border-red-200 text-xs font-mono mb-4 text-red-900 break-all select-all">
                   ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
                 </div>
                 <p className="text-red-800 text-[10px] font-black uppercase tracking-widest">Run the above in Supabase SQL Editor, then click refresh in side navigation.</p>
               </div>
             </div>
          </div>
        )}
        <Dashboard products={products} invoices={invoices} clients={clients} role={effectiveRole} onNavigate={setActiveView} />
      </div>
    ),
    inventory: <Inventory products={products} onUpdate={refreshData} role={effectiveRole} />,
    invoices: <Invoices invoices={invoices} products={products} clients={clients} onUpdate={refreshData} role={effectiveRole} initialClientId={preselectedClientId} onClearInitialClient={() => setPreselectedClientId(null)} />,
    recurring: <RecurringInvoices products={products} clients={clients} onUpdate={refreshData} role={effectiveRole} />,
    clients: <Clients clients={clients} invoices={invoices} onUpdate={refreshData} onCreateInvoice={handleCreateInvoiceForClient} role={effectiveRole} />,
    'admin-office': isAdmin ? <AdminOffice onUpdate={refreshData} onNavigate={setActiveView} /> : <Dashboard products={products} invoices={invoices} clients={clients} role={effectiveRole} onNavigate={setActiveView} />,
    users: isAdmin ? <AdminOffice onUpdate={refreshData} onNavigate={setActiveView} /> : <Dashboard products={products} invoices={invoices} clients={clients} role={effectiveRole} onNavigate={setActiveView} />,
    settings: isAdmin ? <AdminOffice onUpdate={refreshData} onNavigate={setActiveView} /> : <Dashboard products={products} invoices={invoices} clients={clients} role={effectiveRole} onNavigate={setActiveView} />,
  }[activeView];

  return (
    <div className="min-h-screen flex bg-gray-50 text-gray-900 overflow-hidden">
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-gray-200 transform transition-transform duration-300 lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-10 px-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-black text-white rounded-xl flex items-center justify-center shadow-lg overflow-hidden">
                <AppLogo className="w-10 h-10 scale-125" />
              </div>
              <div>
                <h1 className="text-lg font-black tracking-tighter uppercase leading-none">Overplast</h1>
                <p className="text-[9px] font-bold text-yellow-600 uppercase tracking-tight">Mainframe v2.5</p>
              </div>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 text-gray-400"><X size={20} /></button>
          </div>

          <nav className="flex-1 space-y-6">
            <div>
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-4 mb-3">Operating System</p>
              <div className="space-y-1">
                {[
                  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
                  { id: 'inventory', label: 'Assets', icon: Package },
                  { id: 'invoices', label: 'Billing', icon: FileText },
                  { id: 'recurring', label: 'Subscriptions', icon: Repeat },
                  { id: 'clients', label: 'Network', icon: Users },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { 
                      setActiveView(item.id as ViewType); 
                      if (item.id !== 'invoices') setPreselectedClientId(null);
                      if (window.innerWidth < 1024) setIsSidebarOpen(false); 
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-bold text-sm ${
                      activeView === item.id ? 'bg-black text-white shadow-xl' : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <item.icon size={18} className={activeView === item.id ? 'text-yellow-500' : ''} />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {isAdmin && (
              <div>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-4 mb-3">Admin Panel</p>
                <div className="space-y-1">
                  <button
                    onClick={() => { setActiveView('admin-office'); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-bold text-sm ${
                      activeView === 'admin-office' ? 'bg-black text-white shadow-xl' : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <Shield size={18} className={activeView === 'admin-office' ? 'text-yellow-500' : ''} />
                    Control Center
                  </button>
                </div>
              </div>
            )}
          </nav>

          <div className="mt-auto pt-6 border-t border-gray-100">
            <div className="p-4 rounded-2xl bg-gray-50 flex items-center gap-3 border border-gray-100 mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${isAdmin ? 'bg-black text-yellow-500 shadow-inner shadow-white/10' : 'bg-gray-300 text-white'}`}>
                {effectiveRole[0]}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase text-gray-400 leading-none">{effectiveRole}</p>
                <p className="text-[11px] font-black truncate text-gray-900">{user?.email}</p>
              </div>
            </div>
            <button onClick={() => supabase?.auth.signOut()} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-red-500 font-bold text-sm hover:bg-red-50 transition-colors"><LogOut size={20} /> Terminate Session</button>
          </div>
        </div>
      </aside>

      <main className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${isSidebarOpen ? 'lg:ml-72' : 'ml-0'}`}>
        <header className="h-20 bg-white/90 backdrop-blur-xl border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-40 shadow-sm">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2.5 bg-gray-50 text-gray-400 border border-gray-200 rounded-xl hover:text-black hover:border-black transition-all"><PanelLeft size={20} /></button>
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 hidden sm:block">Infrastructure Management Hub</h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3">
               <div className="text-right hidden md:block">
                 <p className="text-[10px] font-black text-gray-900 uppercase leading-none truncate max-w-[120px] mb-0.5">{user?.email?.split('@')[0]}</p>
                 <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em]">{effectiveRole}</p>
               </div>
               <div className="w-10 h-10 bg-black border-2 border-white shadow-xl rounded-full flex items-center justify-center overflow-hidden">
                 <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${user?.email || 'G'}`} alt="avatar" />
               </div>
            </div>
          </div>
        </header>

        <div className="p-6 md:p-10 max-w-[1600px] w-full mx-auto overflow-y-auto">
          {ActiveComponent}
        </div>
      </main>
    </div>
  );
};

export default App;
