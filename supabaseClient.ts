
import { createClient } from '@supabase/supabase-js';

const storedUrl = import.meta.env.VITE_SUPABASE_URL || localStorage.getItem('SUPABASE_URL_OVERRIDE') || '';
const storedKey = import.meta.env.VITE_SUPABASE_ANON_KEY || localStorage.getItem('SUPABASE_ANON_KEY_OVERRIDE') || '';

const isValidUrl = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

let supabaseInstance: any = null;

if (isValidUrl(storedUrl) && storedKey.length > 20) {
  try {
    supabaseInstance = createClient(storedUrl, storedKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      }
    });
  } catch (err) {
    console.error("Critical: Supabase initialization failed", err);
  }
}

export const supabase = supabaseInstance;

// isSupabaseConfigured now ensures both the keys exist AND the instance was successfully created
export const isSupabaseConfigured = !!supabaseInstance;

export const clearSupabaseConfig = () => {
  localStorage.removeItem('SUPABASE_URL_OVERRIDE');
  localStorage.removeItem('SUPABASE_ANON_KEY_OVERRIDE');
  // Clear any auth sessions safely
  try {
    if (supabaseInstance && supabaseInstance.auth) {
      supabaseInstance.auth.signOut().catch(() => {});
    }
  } catch (e) {
    console.warn("Logout cleanup failed", e);
  }
  window.location.href = window.location.origin; // Hard redirect to home
};
