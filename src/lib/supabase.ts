import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Dashboard will operate in mock mode.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
