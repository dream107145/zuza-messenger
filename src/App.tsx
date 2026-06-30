import { useState, useEffect } from 'react';
import { 
  Settings, 
  MessageSquare, 
  UserCircle, 
  Activity, 
  Bot,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
// Removed unused dialog imports

type Persona = {
  id: string;
  name: string;
  system_prompt: string;
  social_style: string;
  enabled: boolean;
};

type APIConfig = {
  id: string;
  provider: string;
  api_key: string;
  model_name: string;
  is_active?: boolean;
};

type InteractionLog = {
  id: string;
  sender_id: string;
  message: string;
  response: string;
  created_at: string;
  status: string;
};

function App() {
  const [logs, setLogs] = useState<InteractionLog[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('gemini-1.5-flash');
  const [provider, setProvider] = useState('gemini');
  const [allConfigs, setAllConfigs] = useState<APIConfig[]>([]);
  
  // Background Worker Status
  const [bgStatus, setBgStatus] = useState<{ initialized: boolean; provider: string; error?: string }>({ initialized: false, provider: 'Unknown' });

  useEffect(() => {
    fetchLogs();
    fetchPersonas();
    fetchConfigs();

    const logsSub = supabase.channel('logs').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logs' }, () => {
      fetchLogs();
    }).subscribe();

    checkBackgroundStatus();
    const bgStatusInterval = setInterval(checkBackgroundStatus, 3000);

    return () => {
      logsSub.unsubscribe();
      clearInterval(bgStatusInterval);
    };
  }, []);

  const EXTENSION_ID = "abgidjgfikicidkkjfmdhnokmkbfplpl";

  const checkBackgroundStatus = () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(EXTENSION_ID, { action: "GET_STATUS" }, (response: any) => {
          if (!chrome.runtime.lastError && response) {
            setBgStatus({ initialized: response.isInitialized, provider: response.activeProvider, error: response.error });
          }
        });
      }
    } catch (e) {}
  };

  useEffect(() => {
    const current = allConfigs.find(c => c.provider === provider);
    if (current) {
      setApiKey(current.api_key);
      setModelName(current.model_name || '');
    } else {
      setApiKey('');
      setModelName(provider === 'gemini' ? 'gemini-1.5-flash' : 'llama3.2');
    }
  }, [provider, allConfigs]);

  const fetchLogs = async () => {
    const { data } = await supabase.from('logs').select('*').order('created_at', { ascending: false }).limit(20);
    if (data) setLogs(data);
  };

  const fetchPersonas = async () => {
    const { data } = await supabase.from('personas').select('*');
    if (data) setPersonas(data);
  };

  const fetchConfigs = async () => {
    const { data } = await supabase.from('api_configs').select('*');
    if (data) {
      setAllConfigs(data);
      const activeConfig = data.find(c => c.is_active);
      if (activeConfig) {
        setProvider(activeConfig.provider);
        setApiKey(activeConfig.api_key);
        setModelName(activeConfig.model_name || '');
      }
    }
  };

  const notifyBackgroundUpdate = () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(EXTENSION_ID, { action: "CONFIG_UPDATED" }, () => {
          setTimeout(checkBackgroundStatus, 500);
        });
      }
    } catch (e) {}
  };

  const handleSaveConfig = async () => {
    try {
      await supabase.from('api_configs').update({ is_active: false }).neq('provider', provider);

      const { error } = await supabase.from('api_configs').upsert({
        provider: provider,
        api_key: apiKey,
        model_name: modelName,
        is_active: true
      }, { onConflict: 'provider' });

      if (error) throw error;
      alert('Configuration saved! AI is now updated.');
      fetchConfigs();
      notifyBackgroundUpdate();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  const handleSavePersonaMood = async (persona: Persona, newMood: string) => {
    try {
      const updated = { ...persona, social_style: newMood, enabled: true };
      const { error } = await supabase.from('personas').upsert(updated);
      if (error) throw error;
      fetchPersonas();
      notifyBackgroundUpdate();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-purple-500/30 overflow-hidden relative font-sans">
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-purple-900/20 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute top-[40%] -right-[10%] w-[40%] h-[60%] bg-blue-900/10 blur-[150px] rounded-full mix-blend-screen" />
      </div>

      <div className="relative z-10">
        <Tabs defaultValue="logs" className="w-full">
          {/* Navigation Bar */}
          <nav className="border-b border-white/10 bg-black/20 backdrop-blur-3xl sticky top-0 z-50">
            <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-[0_0_20px_rgba(168,85,247,0.4)]">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-2xl font-black tracking-tight">AutoMessenger</h1>
              </div>
              
              <TabsList>
                <TabsTrigger value="logs"><Activity className="w-4 h-4 mr-2" /> Logs</TabsTrigger>
                <TabsTrigger value="persona"><UserCircle className="w-4 h-4 mr-2" /> Brain</TabsTrigger>
                <TabsTrigger value="config"><Settings className="w-4 h-4 mr-2" /> Settings</TabsTrigger>
              </TabsList>
            </div>
          </nav>

          {/* Status Bar */}
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-end">
            <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold border backdrop-blur-md ${bgStatus.initialized ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}`}>
              {bgStatus.initialized ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {bgStatus.initialized ? `Worker Active (${bgStatus.provider})` : 'Worker Offline / Initializing...'}
            </div>
          </div>

          <main className="max-w-6xl mx-auto p-6 min-h-[80vh]">
            {/* LOGS TAB */}
            <TabsContent value="logs">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">Activity Logs</h2>
                </div>
                
                <div className="grid grid-cols-1 gap-5">
                  <AnimatePresence>
                    {logs.map((log, i) => (
                      <motion.div 
                        initial={{ opacity: 0, x: -20 }} 
                        animate={{ opacity: 1, x: 0 }} 
                        transition={{ delay: i * 0.05 }}
                        key={log.id} 
                        className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-xl hover:bg-white/10 transition-all shadow-xl group"
                      >
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400 group-hover:scale-110 transition-transform">
                            <MessageSquare className="w-4 h-4" />
                          </div>
                          <span className="text-sm font-semibold text-gray-400 tracking-wider uppercase">{new Date(log.created_at).toLocaleTimeString()}</span>
                        </div>
                        <div className="space-y-4">
                          <div className="bg-black/50 p-4 rounded-2xl border border-white/5 text-gray-300 leading-relaxed">{log.message}</div>
                          <div className="bg-gradient-to-br from-purple-500/10 to-blue-600/10 p-4 rounded-2xl border border-purple-500/20 text-purple-100 leading-relaxed shadow-inner">
                            <span className="font-bold text-purple-300 block mb-1">AI Response:</span>
                            {log.response}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            </TabsContent>

            {/* PERSONA TAB */}
            <TabsContent value="persona">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="max-w-4xl mx-auto space-y-8">
                <h2 className="text-4xl font-bold text-center bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-500">AI Brain Editor</h2>
                
                {personas.map(p => (
                  <div key={p.id} className="bg-white/5 border border-white/10 rounded-[2rem] p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-blue-500 opacity-50 group-hover:opacity-100 transition-opacity" />
                    <div className="flex items-center justify-between mb-8">
                      <div className="flex items-center gap-5">
                        <div className="p-4 rounded-2xl bg-white/5 shadow-inner border border-white/10">
                          <UserCircle className="w-10 h-10 text-purple-400" />
                        </div>
                        <h3 className="text-3xl font-bold">{p.name}</h3>
                      </div>
                      
                      <div className="flex bg-black/50 p-1 rounded-2xl border border-white/10">
                        {[
                          { id: 'normal', label: 'normal' },
                          { id: 'freaky', label: 'seksualny' },
                          { id: 'cold', label: 'cold' },
                        ].map((mood) => {
                          const isActive = (p.social_style || 'normal') === mood.id;
                          return (
                            <button
                              key={mood.id}
                              onClick={() => handleSavePersonaMood(p, mood.id)}
                              className={`flex-1 py-3 px-6 rounded-xl font-bold uppercase tracking-wider text-sm transition-all duration-300 ${
                                isActive 
                                  ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-lg scale-[1.02]' 
                                  : 'text-gray-400 hover:text-white hover:bg-white/5'
                              }`}
                            >
                              {mood.label}
                            </button>
                          );
                        })}
                      </div>

                    </div>
                    <div className="bg-black/40 p-6 rounded-2xl border border-white/5 text-gray-400 italic text-lg leading-relaxed shadow-inner">
                      {p.social_style === 'freaky' && "🔥 Flirty, passionate, witty. English or Polish — matches their language."}
                      {p.social_style === 'cold' && "❄️ Dry, dismissive, ultra-short. English or Polish."}
                      {(!p.social_style || p.social_style === 'normal') && "✨ Fun, chaotic, witty bestie energy. Replies in English or Polish — whatever they use."}
                    </div>
                  </div>
                ))}
              </motion.div>
            </TabsContent>

            {/* CONFIG TAB */}
            <TabsContent value="config">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }} className="max-w-2xl mx-auto">
                <div className="bg-white/5 border border-white/10 rounded-[2rem] p-10 backdrop-blur-2xl shadow-2xl relative overflow-hidden">
                  <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/20 blur-3xl rounded-full" />
                  
                  <div className="flex items-center justify-between mb-10 relative z-10">
                    <div className="flex items-center gap-5">
                      <div className="p-3 rounded-xl bg-blue-500/20 border border-blue-500/30">
                        <Settings className="w-8 h-8 text-blue-400" />
                      </div>
                      <h2 className="text-3xl font-bold">Engine Configuration</h2>
                    </div>
                  </div>

                  <div className="space-y-8 relative z-10">
                    <div className="space-y-3">
                      <label className="text-sm font-bold text-gray-400 uppercase tracking-wider">AI Service Provider</label>
                      <div className="relative">
                        <select 
                          value={provider}
                          onChange={(e) => setProvider(e.target.value)}
                          className="w-full bg-black/50 border border-white/10 rounded-2xl px-5 py-4 text-white appearance-none outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 font-medium text-lg cursor-pointer"
                        >
                          <option value="gemini" className="bg-[#0f0f0f]">☁️ Google Gemini (Cloud)</option>
                          <option value="openai" className="bg-[#0f0f0f]">☁️ OpenAI (Cloud)</option>
                          <option value="local" className="bg-[#0f0f0f]">💻 Local AI (Ollama / LM Studio)</option>
                        </select>
                        <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">▼</div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-sm font-bold text-gray-400 uppercase tracking-wider">
                        {provider === 'local' ? 'Local API Endpoint' : 'Secret API Key'}
                      </label>
                      <input 
                        type={provider === 'local' ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        className="w-full bg-black/50 border border-white/10 rounded-2xl px-5 py-4 text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-mono"
                        placeholder={provider === 'local' ? 'http://localhost:11434/v1' : '••••••••••••••••'}
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="text-sm font-bold text-gray-400 uppercase tracking-wider">LLM Model Target</label>
                      <input 
                        type="text" 
                        value={modelName}
                        onChange={(e) => setModelName(e.target.value)}
                        className="w-full bg-black/50 border border-white/10 rounded-2xl px-5 py-4 text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-mono"
                        placeholder={provider === 'gemini' ? 'gemini-2.5-flash' : (provider === 'local' ? 'llava' : 'llama3.2')}
                      />
                    </div>

                    <div className="pt-6">
                      <button 
                        onClick={handleSaveConfig} 
                        className="w-full py-5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 rounded-2xl font-black text-lg shadow-[0_0_30px_rgba(37,99,235,0.3)] transition-all hover:-translate-y-1"
                      >
                        DEPLOY CONFIGURATION
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </TabsContent>
          </main>
        </Tabs>
      </div>
    </div>
  );
}

export default App;
