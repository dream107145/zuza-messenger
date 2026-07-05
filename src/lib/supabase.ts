import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

const isPlaceholder = (value: string) =>
  !value || value.includes('your-project') || value.includes('your-anon');

export const supabaseConfigured = !isPlaceholder(envUrl) && !isPlaceholder(envKey);

if (!supabaseConfigured) {
  console.warn(
    '[AutoMessenger] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env — restart dev server after adding them.'
  );
}

const supabaseUrl = supabaseConfigured ? envUrl : 'https://placeholder.supabase.co';
const supabaseAnonKey = supabaseConfigured ? envKey : 'placeholder-key';

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

export type Trigger = {
  id: string;
  keyword: string;
  response: string;
  enabled: boolean;
  jitter_min: number;
  jitter_max: number;
  created_at: string;
};

export type Log = {
  id: string;
  trigger_id: string;
  sender_id: string;
  message: string;
  response: string;
  delay_seconds: number;
  status: 'sent' | 'pending' | 'failed';
  created_at: string;
};
