import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Safely retrieve environment variables from multiple sources
const getEnvVar = (key: string): string | undefined => {
  // 1. Check import.meta.env (Vite standard)
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      // @ts-ignore
      return import.meta.env[key];
    }
  } catch (e) {}
  
  // 2. Check process.env (Node/Webpack/CRA standard)
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
  } catch (e) {}

  return undefined;
};

// Helper to check multiple common naming patterns
const findEnvValue = (baseKey: string): string | undefined => {
    // Try VITE_ prefix (Standard Vite)
    let val = getEnvVar(`VITE_${baseKey}`);
    if (val) return val;

    // Try REACT_APP_ prefix (CRA / some build presets)
    val = getEnvVar(`REACT_APP_${baseKey}`);
    if (val) return val;

    // Try plain key (System env vars often used in backend or misconfigured frontends)
    val = getEnvVar(baseKey);
    if (val) return val;

    return undefined;
};

let supabaseInstance: SupabaseClient | null = null;

export const getSupabaseClient = () => {
    if (supabaseInstance) return supabaseInstance;

    const SUPABASE_URL = findEnvValue('SUPABASE_URL');
    const SUPABASE_ANON_KEY = findEnvValue('SUPABASE_ANON_KEY');

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.warn("Supabase Config Missing. Checked VITE_SUPABASE_URL, REACT_APP_SUPABASE_URL, and SUPABASE_URL.");
    }

    // Default to placeholder if missing to prevent crash, but log error
    const url = SUPABASE_URL || 'https://placeholder.supabase.co';
    const key = SUPABASE_ANON_KEY || 'placeholder-key';

    try {
        supabaseInstance = createClient(url, key);
    } catch (error) {
        console.error("Failed to initialize Supabase client:", error);
        supabaseInstance = createClient('https://placeholder.supabase.co', 'placeholder-key'); 
    }
    
    return supabaseInstance;
};

export const isSupabaseConfigured = () => {
    const url = findEnvValue('SUPABASE_URL');
    const key = findEnvValue('SUPABASE_ANON_KEY');
    return !!(url && key && url !== 'https://placeholder.supabase.co');
};