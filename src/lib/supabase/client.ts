import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Check if environment variables are available but don't throw an error
const hasSupabaseConfig = supabaseUrl && supabaseAnonKey;

export const supabase = hasSupabaseConfig 
  ? createClient<Database>(
      supabaseUrl, 
      supabaseAnonKey,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
          storage: window.localStorage
        }
      }
    )
  : null;

// Initialize auth state only if Supabase is configured
if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      // Clear any user-specific data from localStorage
      localStorage.clear();
    }
  });
}