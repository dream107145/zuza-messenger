import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rjmkuafxfrsmxzktphjs.supabase.co';
const supabaseKey = 'sb_publishable_Lp7Iv0G_sGXAFBAWv0zBWA_tM8TxmEu';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkConfig() {
    const { data, error } = await supabase
        .from('api_configs')
        .select('*')
        .eq('is_active', true)
        .single();
        
    if (error) {
        console.error("Error fetching config:", error);
    } else {
        console.log("Active Model Name:", data.model_name);
        console.log("Provider:", data.provider);
    }
}

checkConfig();
