
import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Package, FileText, Users, Settings, ChevronRight, X, Repeat,
  PanelLeftClose, PanelLeft, Loader2, CloudOff, Database, Cloud, LogOut, AlertCircle, RefreshCw, CheckCircle, Sparkles, UserCheck, Shield, Ban, UserRoundSearch, Star, Crown, Fingerprint, DatabaseZap, Zap
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
import SettingsView from './components/Settings';
import Auth from './components/Auth';

import { APP_LOGO_URL, APP_NAME, ADMIN_EMAIL } from './constants';

const AppLogo = ({ className = "" }: { className?: string }) => (
  <img 
    src={APP_LOGO_URL} 
    alt={APP_NAME} 
    className={`${className} object-contain`} 
    referrerPolicy="no-referrer"
    onError={(e) => {
      // Fallback if logo is missing
      e.currentTarget.src = "https://picsum.photos/seed/overplast/200/200";
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
    // Global error listener for Supabase refresh token errors and network failures
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const error = event.reason;
      const errorMsg = String(error?.message || error || '').toLowerCase();
      
      if (errorMsg.includes('refresh token') || errorMsg.includes('refresh_token_not_found')) {
        console.warn("Auth: Global refresh token error detected. Signing out.");
        if (supabase) {
          supabase.auth.signOut().then(() => {
            setUser(null);
            setIsLoading(false);
          }).catch(() => {
            setUser(null);
            setIsLoading(false);
          });
          // Clear local storage as a last resort
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.includes('supabase.auth.token')) {
              localStorage.removeItem(key);
            }
          }
        }
      } else if (errorMsg.includes('fetch') || errorMsg.includes('network')) {
        // Ignore errors that should be silenced (like MetaMask or background fetches)
        const silencePatterns = ['metamask', 'ethereum', 'web3', 'rpc', 'provider', 'wallet', 'failed to connect to metamask'];
        if (silencePatterns.some(p => errorMsg.includes(p))) {
          return;
        }
        
        // Only set dbError if it's not a silenced pattern
        setDbError(true);
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    if (isSupabaseConfigured && supabase) {
      supabase.auth.getSession().then(({ data: { session }, error }: any) => {
        if (error && (
          error.message.includes('Refresh Token') || 
          error.message.includes('refresh_token_not_found') || 
          error.message.includes('Invalid Refresh Token')
        )) {
          console.warn("Auth: Invalid refresh token detected. Clearing session.");
          supabase.auth.signOut().then(() => {
            setUser(null);
            setIsLoading(false);
          });
          // Clear local storage as a last resort
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.includes('supabase.auth.token')) {
              localStorage.removeItem(key);
            }
          }
        } else {
          setUser(session?.user ?? null);
        }
      }).catch((err: any) => {
        console.error("Auth: Session fetch failed", err);
        if (err.message?.includes('Refresh Token') || err.message?.includes('refresh_token_not_found') || err.message?.includes('Invalid Refresh Token')) {
          supabase.auth.signOut().then(() => {
            setUser(null);
            setIsLoading(false);
          });
        } else {
          setUser(null);
        }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((event: any, session: any) => {
        console.log("Auth State Change:", event);
        if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
          setUser(null);
        } else if (session) {
          setUser(session.user);
        } else {
          setUser(null);
        }
      });

      return () => {
        subscription.unsubscribe();
        window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      };
    } else {
      setIsLoading(false);
      refreshData();
      return () => {
        window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      };
    }
  }, []);

  const fetchInitialData = async () => {
    if (user && isSupabaseConfigured) {
      setIsProfileLoading(true);
      setDbError(false);
      try {
        const p = await db.getProfile(user.id) || await db.ensureProfile(user);
        if (!p) setDbError(true);
        setProfile(p);
        refreshData(false, p);
      } catch (e: any) {
        console.error("Init Data Fetch Error:", e);
        const errorMsg = String(e?.message || e || '').toLowerCase();
        if (errorMsg.includes('fetch') || errorMsg.includes('network')) {
          setDbError(true);
        }
        refreshData();
      } finally {
        setIsProfileLoading(false);
      }
    } else {
      setProfile(null);
      refreshData();
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, [user]);

  const refreshData = async (isManual = false, currentProfile = profile) => {
    if (isSupabaseConfigured && !user) {
      setIsLoading(false);
      return;
    }
    
    if (isManual) setIsRefreshing(true);
    else setIsLoading(true);
    
    try {
      const isAdmin = !isSupabaseConfigured || 
                      currentProfile?.role === 'Admin' || 
                      currentProfile?.role === 'admin' || 
                      user?.email === ADMIN_EMAIL;
      const filterId = isAdmin ? undefined : user?.id;

      const [p, c, i] = await Promise.all([
        db.getProducts(undefined), // Allow all users to see all products
        db.getClients(filterId),
        db.getInvoices(filterId)
      ]);
      setProducts(p || []);
      setClients(c || []);
      setInvoices(i || []);
      setLastSync(new Date().toLocaleTimeString());
      setDbError(false);
    } catch (err: any) {
      console.error("Bulk Refresh Error:", err);
      const errorMsg = String(err?.message || err || '').toLowerCase();
      if (errorMsg.includes('fetch') || errorMsg.includes('network') || errorMsg.includes('failed to connect')) {
        setDbError(true);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleCreateInvoiceForClient = (clientId: string) => {
    setPreselectedClientId(clientId);
    setActiveView('invoices');
  };

  const isAdmin = !isSupabaseConfigured || profile?.role === 'Admin' || user?.email === ADMIN_EMAIL;
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
    dashboard: <Dashboard products={products} invoices={invoices} clients={clients} role={effectiveRole} userId={user?.id || ''} onNavigate={setActiveView} />,
    inventory: <Inventory products={products} onUpdate={refreshData} role={effectiveRole} userId={user?.id} userEmail={user?.email} />,
    invoices: <Invoices invoices={invoices} products={products} clients={clients} onUpdate={refreshData} role={effectiveRole} userId={user?.id} userEmail={user?.email} initialClientId={preselectedClientId} onClearInitialClient={() => setPreselectedClientId(null)} />,
    recurring: <RecurringInvoices products={products} clients={clients} onUpdate={refreshData} role={effectiveRole} userId={user?.id} />,
    clients: <Clients clients={clients} invoices={invoices} onUpdate={refreshData} onCreateInvoice={handleCreateInvoiceForClient} role={effectiveRole} userId={user?.id} />,
    'admin-office': isAdmin ? <AdminOffice onUpdate={refreshData} onNavigate={setActiveView} invoices={invoices} clients={clients} products={products} userId={user?.id} userEmail={user?.email} role={effectiveRole} /> : <Dashboard products={products} invoices={invoices} clients={clients} role={effectiveRole} userId={user?.id || ''} onNavigate={setActiveView} />,
    users: isAdmin ? <AdminOffice onUpdate={refreshData} onNavigate={setActiveView} invoices={invoices} clients={clients} products={products} userId={user?.id} userEmail={user?.email} role={effectiveRole} /> : <Dashboard products={products} invoices={invoices} clients={clients} role={effectiveRole} userId={user?.id || ''} onNavigate={setActiveView} />,
    settings: <SettingsView role={effectiveRole} userId={user?.id || ''} />,
  }[activeView];

  return (
    <div className="h-screen flex bg-gray-50 text-gray-900 overflow-hidden relative">
      {/* Luxury Background Elements for the entire app */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-yellow-50/10 via-transparent to-transparent pointer-events-none"></div>
      <div className="absolute -top-48 -left-48 w-96 h-96 bg-yellow-100 rounded-full blur-[120px] opacity-20 pointer-events-none"></div>
      <div className="absolute -bottom-48 -right-48 w-96 h-96 bg-gray-200 rounded-full blur-[120px] opacity-20 pointer-events-none"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-50/5 rounded-full blur-[160px] pointer-events-none"></div>

      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-gray-200 transform transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-10 px-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 flex items-center justify-center">
                <AppLogo className="w-10 h-10" />
              </div>
              <div>
                <h1 className="text-lg font-black tracking-tighter uppercase leading-none text-gray-900">Overplast</h1>
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

      <main className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${isSidebarOpen ? 'md:ml-72' : 'ml-0'}`}>
        <header className="h-20 bg-white/90 backdrop-blur-xl border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-40 shadow-sm">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2.5 bg-gray-50 text-gray-400 border border-gray-200 rounded-xl hover:text-black hover:border-black transition-all"><PanelLeft size={20} /></button>
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 hidden sm:block">Infrastructure Management Hub</h2>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => refreshData(true)}
              disabled={isRefreshing}
              className="p-2.5 bg-gray-50 text-gray-400 border border-gray-200 rounded-xl hover:text-black hover:border-black transition-all disabled:opacity-50"
              title="Refresh Data"
            >
              <RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
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

        <div className="p-6 md:p-10 w-full flex-1 overflow-y-auto relative">
          <div className="w-full max-w-[1600px] mx-auto space-y-6">
            {dbError && (
              <div className="bg-red-50 border-4 border-red-600 p-8 rounded-[2rem] shadow-xl animate-in slide-in-from-top-4 duration-500">
                 <div className="flex items-start gap-6">
                   <div className="p-4 bg-red-600 text-white rounded-2xl shadow-lg"><DatabaseZap size={32} /></div>
                   <div className="flex-1">
                     <h3 className="text-2xl font-black text-red-900 uppercase tracking-tighter mb-2">Cloud Connectivity Interrupted</h3>
                     <p className="text-red-700 font-bold mb-4 leading-relaxed">The system could not reach your cloud database. This usually happens if your Supabase URL/Key is incorrect, your internet is disconnected, or Row Level Security (RLS) is blocking access.</p>
                     <div className="space-y-4">
                       <div className="bg-white p-4 rounded-xl border border-red-200">
                         <p className="text-[10px] font-black uppercase text-gray-400 mb-2">Troubleshooting Step 1: Check RLS</p>
                         <p className="text-xs text-red-900 mb-2">Run this in Supabase SQL Editor:</p>
                         <div className="bg-gray-900 p-3 rounded-lg text-[10px] font-mono text-green-400 break-all select-all">
                           ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
                         </div>
                       </div>
                       <div className="bg-white p-4 rounded-xl border border-red-200">
                         <p className="text-[10px] font-black uppercase text-gray-400 mb-2">Troubleshooting Step 2: Check Config</p>
                         <p className="text-xs text-red-900">Ensure your <span className="font-bold">VITE_SUPABASE_URL</span> and <span className="font-bold">VITE_SUPABASE_ANON_KEY</span> are correctly set in your environment variables.</p>
                       </div>
                     </div>
                     <div className="flex flex-col sm:flex-row gap-4 mt-8">
                        <button 
                          onClick={() => window.location.reload()}
                          className="px-6 py-3 bg-black text-white rounded-xl font-black uppercase tracking-widest hover:bg-gray-800 transition-all flex items-center justify-center gap-3 text-[10px]"
                        >
                          <RefreshCw size={14} />
                          Reload App
                        </button>
                        <button 
                          onClick={() => {
                            setDbError(false);
                            fetchInitialData();
                          }}
                          className="px-6 py-3 bg-gray-100 text-gray-900 rounded-xl font-black uppercase tracking-widest hover:bg-gray-200 transition-all flex items-center justify-center gap-3 text-[10px]"
                        >
                          <Zap size={14} />
                          Retry Connection
                        </button>
                      </div>
                     <p className="text-red-800 text-[10px] font-black uppercase tracking-widest mt-6">Click the refresh icon in the sidebar after fixing.</p>
                   </div>
                 </div>
              </div>
            )}
            {ActiveComponent}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
