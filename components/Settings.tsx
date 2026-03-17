
import React, { useRef, useState } from 'react';
import { 
  User, Bell, Shield, Globe, Cloud, Download, Upload, 
  AlertCircle, Database, Trash2, Rocket, Github, ExternalLink, CheckCircle2, Key, Info, Server, RefreshCw, ArrowRight, Clipboard, Settings as SettingsIcon, Code, Wifi, WifiOff, Eye, EyeOff, MousePointer2, Share2, Globe2, Heart, ShieldCheck, Crown, ShieldAlert, Zap, GlobeLock, ListChecks, Terminal, Monitor, HardDrive
} from 'lucide-react';
import { db } from '../db';
import { isSupabaseConfigured, clearSupabaseConfig, supabase } from '../supabaseClient';

interface SettingsProps {
  role?: string;
  userId?: string;
}

const SettingsView: React.FC<SettingsProps> = ({ role, userId }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'deployment' | 'hosting'>('hosting');
  const [cloudUrl, setCloudUrl] = useState(localStorage.getItem('SUPABASE_URL_OVERRIDE') || '');
  const [cloudKey, setCloudKey] = useState(localStorage.getItem('SUPABASE_ANON_KEY_OVERRIDE') || '');
  const [userEmail, setUserEmail] = useState<string>('');

  React.useEffect(() => {
    supabase?.auth.getUser().then(({data}: any) => {
      if (data?.user?.email) setUserEmail(data.user.email);
    });
  }, []);

  const sqlSetup = `-- 1. DATABASE REPAIR & INITIALIZATION SCRIPT (OVERPLAST BEAUTY)
-- Run this in the Supabase SQL Editor to fix missing tables or columns.

-- Enable pgcrypto extension for random_uuid generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'Staff',
  status TEXT DEFAULT 'Active',
  password TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  name TEXT NOT NULL,
  sku TEXT,
  category TEXT DEFAULT 'General',
  price NUMERIC DEFAULT 0,
  cost NUMERIC DEFAULT 0, -- Purchase Price
  mrp NUMERIC DEFAULT 0,
  tp NUMERIC DEFAULT 0,
  stock INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  doctor_name TEXT,
  hospital_name TEXT,
  doctor_phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  invoice_number TEXT NOT NULL,
  client_id TEXT,
  client_name TEXT,
  date DATE DEFAULT CURRENT_DATE,
  items JSONB,
  subtotal NUMERIC DEFAULT 0,
  discount_rate NUMERIC DEFAULT 0,
  discount_total NUMERIC DEFAULT 0,
  tax_rate NUMERIC DEFAULT 0,
  tax_total NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  paid_amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'Pending',
  payment_method TEXT DEFAULT 'Cash',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  invoice_id TEXT,
  amount NUMERIC DEFAULT 0,
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.recurring_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  client_id TEXT,
  client_name TEXT,
  items JSONB,
  subtotal NUMERIC DEFAULT 0,
  discount_rate NUMERIC DEFAULT 0,
  discount_total NUMERIC DEFAULT 0,
  tax_rate NUMERIC DEFAULT 0,
  tax_total NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  frequency TEXT,
  start_date DATE DEFAULT CURRENT_DATE,
  next_run_date DATE DEFAULT CURRENT_DATE,
  status TEXT DEFAULT 'Active',
  last_generated_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  product_id TEXT,
  product_name TEXT,
  type TEXT,
  quantity INTEGER,
  date DATE DEFAULT CURRENT_DATE,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- FORCE DISABLE RLS ON ALL TABLES FOR EASY SYNC
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.products DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_invoices DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments DISABLE ROW LEVEL SECURITY;

-- ADD MISSING COLUMNS TO EXISTING TABLES
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE public.recurring_invoices ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE public.stock_transactions ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS user_email TEXT;

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS doctor_name TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS hospital_name TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS doctor_phone TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS discount_rate NUMERIC DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS discount_total NUMERIC DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tax_total NUMERIC DEFAULT 0;
ALTER TABLE public.recurring_invoices ADD COLUMN IF NOT EXISTS discount_rate NUMERIC DEFAULT 0;
ALTER TABLE public.recurring_invoices ADD COLUMN IF NOT EXISTS discount_total NUMERIC DEFAULT 0;
ALTER TABLE public.recurring_invoices ADD COLUMN IF NOT EXISTS tax_rate NUMERIC DEFAULT 0;
ALTER TABLE public.recurring_invoices ADD COLUMN IF NOT EXISTS tax_total NUMERIC DEFAULT 0;

-- GRANT ALL PERMISSIONS TO USERS
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, postgres;
`;

  const copySql = () => {
    navigator.clipboard.writeText(sqlSetup);
    alert("Repair Script Copied! Open Supabase SQL Editor, Paste it, and click 'RUN'.");
  };

  const handleSaveCloudConfig = () => {
    if (!cloudUrl.trim() || !cloudKey.trim()) {
      alert("Please enter both URL and API Key.");
      return;
    }
    localStorage.setItem('SUPABASE_URL_OVERRIDE', cloudUrl.trim());
    localStorage.setItem('SUPABASE_ANON_KEY_OVERRIDE', cloudKey.trim());
    alert("System Linked. Reloading...");
    window.location.reload();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-gray-200 shadow-sm">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight uppercase">Base Infrastructure</h2>
          <p className="text-gray-500 font-medium italic">Database Health & Cloud Control Panel.</p>
        </div>
        <div className="flex bg-gray-100 p-1.5 rounded-2xl border border-gray-200">
          <button onClick={() => setActiveTab('hosting')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'hosting' ? 'bg-indigo-700 text-white shadow-lg' : 'text-gray-500'}`}>1. Live Guide</button>
          <button onClick={() => setActiveTab('deployment')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'deployment' ? 'bg-black text-white shadow-lg' : 'text-gray-500'}`}>2. Cloud Setup</button>
          <button onClick={() => setActiveTab('general')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'general' ? 'bg-white text-gray-900 shadow-md' : 'text-gray-500'}`}>Backups</button>
        </div>
      </div>

      {activeTab === 'hosting' && (
        <div className="animate-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto space-y-12 pb-20">
            <div className="bg-indigo-950 p-12 md:p-16 rounded-[4rem] text-white shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-12 opacity-5"><Rocket size={160} /></div>
                <div className="relative z-10">
                    <h2 className="text-4xl font-black tracking-tighter mb-4 uppercase">App Ko Live Karne Ka Tareeka</h2>
                    <p className="text-indigo-200 text-lg font-bold mb-12 max-w-2xl">Agar aap chahte hain ke ye app internet par chale aur aap kahin se bhi access kar sakein, to ye steps follow karein:</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white/10 p-8 rounded-[2.5rem] border border-white/10 flex gap-6">
                            <div className="w-12 h-12 bg-white text-indigo-900 rounded-2xl flex items-center justify-center font-black flex-shrink-0">1</div>
                            <div>
                                <h4 className="text-lg font-black uppercase mb-2">Code Download Karein</h4>
                                <p className="text-sm text-indigo-100/70 leading-relaxed">Pehley upar maujood <span className="text-white font-bold">Download</span> button se saari files apne computer mein save karein.</p>
                            </div>
                        </div>

                        <div className="bg-white/10 p-8 rounded-[2.5rem] border border-white/10 flex gap-6">
                            <div className="w-12 h-12 bg-white text-indigo-900 rounded-2xl flex items-center justify-center font-black flex-shrink-0">2</div>
                            <div>
                                <h4 className="text-lg font-black uppercase mb-2">GitHub Par Upload</h4>
                                <p className="text-sm text-indigo-100/70 leading-relaxed">GitHub.com par account banayein aur apna folder wahan <span className="text-white font-bold">Upload</span> kar dein.</p>
                                <a href="https://github.com/new" target="_blank" className="inline-flex items-center gap-2 mt-4 text-[10px] font-black uppercase tracking-widest text-indigo-400"><Github size={14}/> Create Repo</a>
                            </div>
                        </div>

                        <div className="bg-white/10 p-8 rounded-[2.5rem] border border-white/10 flex gap-6">
                            <div className="w-12 h-12 bg-white text-indigo-900 rounded-2xl flex items-center justify-center font-black flex-shrink-0">3</div>
                            <div>
                                <h4 className="text-lg font-black uppercase mb-2">Vercel Se Connect</h4>
                                <p className="text-sm text-indigo-100/70 leading-relaxed">Vercel.com par jayein aur apni GitHub repository select karke <span className="text-white font-bold">Deploy</span> karein.</p>
                                <a href="https://vercel.com/new" target="_blank" className="inline-flex items-center gap-2 mt-4 text-[10px] font-black uppercase tracking-widest text-indigo-400"><ExternalLink size={14}/> Open Vercel</a>
                            </div>
                        </div>

                        <div className="bg-white/10 p-8 rounded-[2.5rem] border border-white/10 flex gap-6">
                            <div className="w-12 h-12 bg-white text-indigo-900 rounded-2xl flex items-center justify-center font-black flex-shrink-0">4</div>
                            <div>
                                <h4 className="text-lg font-black uppercase mb-2">Keys (Env Vars)</h4>
                                <p className="text-sm text-indigo-100/70 leading-relaxed">Vercel ki settings mein <span className="text-white font-bold">API_KEY</span> aur Supabase keys add karna zaroori hai.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}

      {activeTab === 'deployment' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-500">
          <div className="lg:col-span-6 space-y-6">
            <div className="bg-white p-10 rounded-[3rem] border-4 border-black shadow-2xl">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 bg-black text-white rounded-xl flex items-center justify-center">
                    <Server size={24} />
                  </div>
                  <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">1. Link Database</h3>
                </div>
                <div className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Supabase URL</label>
                        <input type="text" placeholder="https://xyz.supabase.co" value={cloudUrl} onChange={(e) => setCloudUrl(e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold text-sm outline-none transition-all" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Anon Key</label>
                        <textarea rows={2} placeholder="Paste public anon key..." value={cloudKey} onChange={(e) => setCloudKey(e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold text-sm outline-none transition-all resize-none" />
                    </div>
                    <button onClick={handleSaveCloudConfig} className="w-full py-5 bg-black text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl hover:bg-gray-900 transition-all">
                        Establish Cloud Connection
                    </button>
                </div>
            </div>

            <div className="bg-amber-50 p-10 rounded-[3rem] border-2 border-amber-200 shadow-xl">
                <div className="flex items-center gap-3 mb-4">
                   <ShieldAlert size={24} className="text-amber-600" />
                   <h3 className="text-2xl font-black uppercase tracking-tight text-amber-900">Admin Rescue</h3>
                </div>
                <p className="text-xs text-amber-800 mb-6 font-bold leading-relaxed">Run this if you are stuck as 'Staff':</p>
                <div className="bg-white p-4 rounded-xl border border-amber-200 mb-6 font-mono text-[10px] text-amber-900 break-all select-all">
                  UPDATE profiles SET role = 'Admin' WHERE email = '{userEmail || 'YOUR_EMAIL'}';
                </div>
                <button onClick={() => { navigator.clipboard.writeText(`UPDATE profiles SET role = 'Admin' WHERE email = '${userEmail}';`); alert("Rescue SQL Copied!"); }} className="w-full py-4 bg-amber-600 text-white rounded-xl font-black uppercase tracking-widest text-[9px] hover:bg-amber-700 transition-all flex items-center justify-center gap-3 shadow-xl">
                  Copy Rescue SQL
                </button>
            </div>
          </div>
          
          <div className="lg:col-span-6 space-y-6">
            <div className="bg-black p-10 rounded-[3.5rem] text-white shadow-2xl border border-gray-800">
                <div className="flex items-center gap-4 mb-8">
                   <Code size={32} className="text-yellow-500" />
                   <div>
                      <h3 className="text-2xl font-black uppercase tracking-tight">2. Repair Tables</h3>
                      <p className="text-xs text-yellow-500 font-black uppercase tracking-widest">Mandatory Step</p>
                   </div>
                </div>
                
                <div className="space-y-6">
                    <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                       <h4 className="text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2">
                          <ListChecks size={14} className="text-yellow-500" /> Instructions:
                       </h4>
                       <ol className="text-[11px] font-bold text-gray-400 space-y-3 list-decimal ml-4">
                          <li>Click the <span className="text-white">"Copy Repair Script"</span> button below.</li>
                          <li>Open your <span className="text-white">Supabase Dashboard</span>.</li>
                          <li>Go to the <span className="text-white">"SQL Editor"</span> tab on the left.</li>
                          <li>Paste the code and click the <span className="text-yellow-500">"RUN"</span> button.</li>
                          <li>Refresh this app to start saving subscriptions.</li>
                       </ol>
                    </div>

                    <button onClick={copySql} className="w-full py-6 bg-yellow-500 text-black rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] hover:bg-yellow-400 transition-all flex items-center justify-center gap-4 shadow-xl">
                      <Clipboard size={18} /> Copy Repair Script
                    </button>
                </div>
            </div>

            <div className="bg-white p-10 rounded-[2.5rem] border border-gray-200 shadow-sm">
                <div className="w-16 h-16 bg-yellow-50 text-yellow-600 rounded-2xl flex items-center justify-center mb-6 border border-yellow-100"><ShieldCheck size={32} /></div>
                <h3 className="text-xl font-black text-gray-900 mb-4 uppercase tracking-tighter">Database Security</h3>
                <p className="text-gray-500 text-xs font-medium leading-relaxed">Our system uses Row Level Security (RLS) to protect data. Always ensure the SQL Setup script has been run to allow access to all authenticated users.</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'general' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in duration-500">
           <div className="bg-white p-10 rounded-[3rem] border border-gray-200 shadow-sm flex flex-col justify-between">
              <div>
                <h4 className="font-black text-gray-900 text-lg mb-2 uppercase tracking-tight">Ledger Export</h4>
                <p className="text-sm text-gray-500 font-medium">Download full business state as JSON.</p>
              </div>
              <button onClick={() => db.exportDatabase(role === 'Admin' ? undefined : userId)} className="mt-10 py-5 bg-black text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3">
                <Download size={16} /> Export JSON
              </button>
           </div>
           {role === 'Admin' && (
             <div className="bg-red-50 p-10 rounded-[3rem] border border-red-100 flex flex-col justify-between">
                <div>
                  <h4 className="font-black text-red-900 text-lg mb-2 uppercase tracking-tight">Erase Node</h4>
                  <p className="text-sm text-red-700 font-medium">Clear system configuration and unlink database.</p>
                </div>
                <button onClick={() => { if(confirm('Terminate app link?')) clearSupabaseConfig(); }} className="mt-10 py-5 bg-red-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3">
                  <Trash2 size={16} /> Wipe System
                </button>
             </div>
           )}
        </div>
      )}
    </div>
  );
};

export default SettingsView;
