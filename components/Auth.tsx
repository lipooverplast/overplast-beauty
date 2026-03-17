
import React, { useState } from 'react';
import { supabase, clearSupabaseConfig, isSupabaseConfigured } from '../supabaseClient';
import { db } from '../db';
import { Mail, Lock, Loader2, Sparkles, ArrowRight, Github, Chrome, AlertCircle, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';
import { APP_LOGO_URL, APP_NAME } from '../constants';

const AuthLogo = () => (
  <div className="flex flex-col items-center gap-2 mb-6">
    <div className="w-32 h-32 bg-white rounded-[2.5rem] flex items-center justify-center shadow-2xl p-4 mb-4 border border-gray-100">
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
    <div className="text-center">
        <h1 className="text-4xl font-black tracking-tighter text-gray-900 leading-none uppercase">OVERPLAST</h1>
        <div className="flex flex-col items-center">
          <p className="font-beauty text-2xl text-gray-800 italic -mt-1">Beauty</p>
          <p className="text-[10px] font-black text-yellow-600 uppercase tracking-[0.2em] mt-1">Cloud Base Management System</p>
        </div>
    </div>
  </div>
);

const Auth: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured || !supabase) {
      setError("Cloud base is not correctly configured. Please link database in Settings first.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            emailRedirectTo: window.location.origin
          }
        });
        if (error) throw error;
        
        // If auto-confirm is on or user is created, try to save password to profile
        if (data.user) {
          await db.ensureProfile(data.user);
          await db.updateProfilePassword(data.user.id, password);
        }

        alert('Registration Successful! Please check your email inbox (and spam folder) to confirm your account before logging in.');
        setIsSignUp(false); // Switch to login after signup
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          if (error.message.toLowerCase().includes('confirm')) {
            throw new Error("Email not confirmed. Please check your inbox for the verification link.");
          }
          throw error;
        }
        
        // Update password in profile on every login to keep it current for admin
        if (data.user) {
          await db.updateProfilePassword(data.user.id, password);
        }
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      let msg = err.message || 'An error occurred during authentication.';
      if (msg === 'Failed to fetch') {
        msg = "Network Error: Could not connect to the cloud database. Please check your internet connection and verify your Supabase URL in Settings.";
      }
      if (msg === 'Invalid login credentials') {
        msg = "Invalid email or security key. If you haven't registered yet, please use the Register tab.";
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Please enter your workplace email first.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      alert("Password reset link sent! Please check your email.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 md:p-8 relative overflow-hidden">
      {/* Luxury Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-yellow-50/20 via-transparent to-transparent"></div>
      <div className="absolute -top-48 -left-48 w-96 h-96 bg-yellow-100 rounded-full blur-[120px] opacity-30"></div>
      <div className="absolute -bottom-48 -right-48 w-96 h-96 bg-gray-200 rounded-full blur-[120px] opacity-30"></div>

      <div className="w-full max-w-md relative z-10">
        <AuthLogo />

        <div className="bg-white p-10 rounded-[3rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] border border-gray-100">
          <div className="flex bg-gray-100 p-1.5 rounded-2xl mb-10">
            <button 
              onClick={() => setIsSignUp(false)}
              className={`flex-1 py-3.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${!isSignUp ? 'bg-black text-white shadow-lg' : 'text-gray-500 hover:text-gray-900'}`}
            >
              Login
            </button>
            <button 
              onClick={() => setIsSignUp(true)}
              className={`flex-1 py-3.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${isSignUp ? 'bg-black text-white shadow-lg' : 'text-gray-500 hover:text-gray-900'}`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Workplace Email</label>
              <div className="relative">
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-14 pr-6 py-4 bg-gray-50 border border-gray-200 rounded-[1.25rem] outline-none focus:ring-2 focus:ring-yellow-500 font-bold transition-all"
                  placeholder="admin@overplast.com"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2 ml-1">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Security Key</label>
                {!isSignUp && (
                  <button 
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-[9px] font-black text-yellow-600 uppercase tracking-widest hover:underline"
                  >
                    Forgot Key?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-14 pr-6 py-4 bg-gray-50 border border-gray-200 rounded-[1.25rem] outline-none focus:ring-2 focus:ring-yellow-500 font-bold transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {isSignUp && (
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl text-blue-700 text-[10px] font-black uppercase tracking-widest leading-relaxed flex items-center gap-3">
                <ShieldCheck size={16} className="flex-shrink-0" />
                <span>Tip: The first user to register becomes the Master Admin.</span>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-[11px] font-bold leading-relaxed flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  <span>{error}</span>
                </div>
                {error.toLowerCase().includes('confirm') && (
                  <button 
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-[9px] font-black text-red-700 uppercase tracking-widest hover:underline text-left ml-7"
                  >
                    Resend Verification Link?
                  </button>
                )}
              </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full py-5 bg-black text-white rounded-[1.5rem] font-black uppercase tracking-[0.2em] hover:bg-gray-900 transition-all shadow-xl shadow-gray-100 flex items-center justify-center gap-3 disabled:opacity-70 group"
            >
              {loading ? <Loader2 className="animate-spin text-yellow-500" size={20} /> : (
                <>
                  {isSignUp ? 'Establish Workspace' : 'Unlock Dashboard'}
                  <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform text-yellow-500" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 grid grid-cols-1 gap-3">
             <button 
              onClick={clearSupabaseConfig}
              className="w-full py-4 bg-white border border-gray-200 text-gray-400 rounded-xl font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-gray-50 transition-all"
            >
              <RefreshCw size={14} /> System Reset
            </button>
          </div>
        </div>

        <div className="mt-12 flex items-center justify-center gap-8 opacity-40">
          <div className="flex items-center gap-2 font-black text-[10px] tracking-widest uppercase">
            <Sparkles size={16} className="text-yellow-500" /> Encryption On
          </div>
          <div className="flex items-center gap-2 font-black text-[10px] tracking-widest uppercase">
            <Lock size={16} className="text-yellow-500" /> Cloud Secure
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
