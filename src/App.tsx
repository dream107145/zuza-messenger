import { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  MessageSquare,
  UserCircle,
  Activity,
  Bot,
  CheckCircle2,
  AlertCircle,
  Database,
} from 'lucide-react';
import { supabase, supabaseConfigured } from './lib/supabase';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';

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
  message: string;
  response: string;
  created_at: string;
};

const EXTENSION_ID = 'abgidjgfikicidkkjfmdhnokmkbfplpl';

function App() {
  const [logs, setLogs] = useState<InteractionLog[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('gemini-1.5-flash');
  const [provider, setProvider] = useState('gemini');
  const [allConfigs, setAllConfigs] = useState<APIConfig[]>([]);
  const [bgStatus, setBgStatus] = useState({ initialized: false, provider: 'Unknown' });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dbReady, setDbReady] = useState(true);

  const fetchLogs = useCallback(async () => {
    const { data, error } = await supabase
      .from('logs')
      .select('id, message, response, created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    setLogs(data || []);
  }, []);

  const fetchPersonas = useCallback(async () => {
    const { data, error } = await supabase.from('personas').select('*');
    if (error) throw new Error(error.message);
    setPersonas(data || []);
  }, []);

  const fetchConfigs = useCallback(async () => {
    const { data, error } = await supabase.from('api_configs').select('*');
    if (error) throw new Error(error.message);
    setAllConfigs(data || []);
    const activeConfig = data?.find((c) => c.is_active);
    if (activeConfig) {
      setProvider(activeConfig.provider);
      setApiKey(activeConfig.api_key);
      setModelName(activeConfig.model_name || '');
    }
  }, []);

  const checkDb = useCallback(async () => {
    const { error } = await supabase.from('personas').select('id').limit(1);
    if (error) {
      setDbReady(false);
      setLoadError(error.message);
      return false;
    }
    setDbReady(true);
    setLoadError(null);
    return true;
  }, []);

  const refreshAll = useCallback(async () => {
    const ok = await checkDb();
    if (!ok) return;
    await Promise.all([fetchLogs(), fetchPersonas(), fetchConfigs()]);
  }, [checkDb, fetchLogs, fetchPersonas, fetchConfigs]);

  const checkBackgroundStatus = useCallback(() => {
    try {
      const chromeApi = (window as unknown as { chrome?: { runtime?: { sendMessage?: Function; lastError?: unknown } } }).chrome;
      chromeApi?.runtime?.sendMessage?.(EXTENSION_ID, { action: 'GET_STATUS' }, (response: unknown) => {
        if (!chromeApi?.runtime?.lastError && response) {
          const r = response as { isInitialized: boolean; activeProvider: string };
          setBgStatus({ initialized: r.isInitialized, provider: r.activeProvider });
        }
      });
    } catch {
      // normal browser tab
    }
  }, []);

  useEffect(() => {
    refreshAll().catch((err: unknown) => {
      setLoadError(err instanceof Error ? err.message : String(err));
    });
    checkBackgroundStatus();
    const interval = setInterval(checkBackgroundStatus, 3000);
    return () => clearInterval(interval);
  }, [refreshAll, checkBackgroundStatus]);

  useEffect(() => {
    const current = allConfigs.find((c) => c.provider === provider);
    if (current) {
      setApiKey(current.api_key);
      setModelName(current.model_name || '');
    } else {
      setApiKey('');
      setModelName(provider === 'gemini' ? 'gemini-1.5-flash' : 'llama3.2');
    }
  }, [provider, allConfigs]);

  const notifyBackgroundUpdate = () => {
    try {
      const chromeApi = (window as unknown as { chrome?: { runtime?: { sendMessage?: Function } } }).chrome;
      chromeApi?.runtime?.sendMessage?.(EXTENSION_ID, { action: 'CONFIG_UPDATED' }, () => {
        setTimeout(checkBackgroundStatus, 500);
      });
    } catch {
      // normal browser tab
    }
  };

  const handleSaveConfig = async () => {
    try {
      await supabase.from('api_configs').update({ is_active: false }).neq('provider', provider);
      const { error } = await supabase.from('api_configs').upsert(
        { provider, api_key: apiKey, model_name: modelName, is_active: true },
        { onConflict: 'provider' }
      );
      if (error) throw error;
      alert('Configuration saved!');
      await fetchConfigs();
      notifyBackgroundUpdate();
    } catch (error: unknown) {
      alert('Error: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleSavePersonaMood = async (persona: Persona, newMood: string) => {
    try {
      const { error } = await supabase
        .from('personas')
        .upsert({ ...persona, social_style: newMood, enabled: true });
      if (error) throw error;
      await fetchPersonas();
      notifyBackgroundUpdate();
    } catch (error: unknown) {
      alert('Error: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-purple-900/20 blur-[120px] rounded-full" />
        <div className="absolute top-[40%] -right-[10%] w-[40%] h-[60%] bg-blue-900/10 blur-[150px] rounded-full" />
      </div>

      <div className="relative z-10">
        <Tabs defaultValue={dbReady ? 'logs' : 'config'} className="w-full">
          <nav className="border-b border-white/10 bg-black/20 backdrop-blur-xl sticky top-0 z-50">
            <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-2xl font-black">AutoMessenger</h1>
              </div>
              <TabsList>
                <TabsTrigger value="logs"><Activity className="w-4 h-4 mr-2" /> Logs</TabsTrigger>
                <TabsTrigger value="persona"><UserCircle className="w-4 h-4 mr-2" /> Brain</TabsTrigger>
                <TabsTrigger value="config"><Settings className="w-4 h-4 mr-2" /> Settings</TabsTrigger>
              </TabsList>
            </div>
          </nav>

          <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col items-end gap-2">
            {!supabaseConfigured && (
              <div className="text-xs font-bold px-4 py-1.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                Add VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY to .env and restart dev server
              </div>
            )}
            {!dbReady && (
              <div className="text-xs font-bold px-4 py-1.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-2">
                <Database className="w-4 h-4" />
                Database not set up — run supabase_init.sql in Supabase SQL Editor
              </div>
            )}
            {loadError && dbReady && (
              <div className="text-xs font-bold px-4 py-1.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">
                {loadError}
              </div>
            )}
            <div className={`text-xs font-bold px-4 py-1.5 rounded-full border flex items-center gap-2 ${bgStatus.initialized ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}`}>
              {bgStatus.initialized ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {bgStatus.initialized ? `Worker Active (${bgStatus.provider})` : 'Worker Offline'}
            </div>
          </div>

          {!dbReady && (
            <div className="max-w-2xl mx-auto p-6 m-6 bg-white/5 border border-red-500/30 rounded-2xl">
              <h2 className="text-xl font-bold text-red-400 mb-3 flex items-center gap-2">
                <Database className="w-5 h-5" /> Setup required
              </h2>
              <p className="text-gray-300 mb-4">
                Your Supabase project is missing tables. The dashboard cannot load until you run the init script.
              </p>
              <ol className="list-decimal list-inside space-y-2 text-gray-400 text-sm mb-4">
                <li>Open <a href="https://supabase.com/dashboard" className="text-blue-400 underline" target="_blank" rel="noreferrer">Supabase Dashboard</a></li>
                <li>Go to <strong>SQL Editor</strong> → New query</li>
                <li>Copy all of <code className="text-purple-300">supabase_init.sql</code> from this repo</li>
                <li>Paste and click <strong>Run</strong></li>
                <li>Click the button below to retry</li>
              </ol>
              <button
                onClick={() => refreshAll()}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold"
              >
                I ran the SQL — retry
              </button>
            </div>
          )}

          <main className="max-w-6xl mx-auto p-6 min-h-[70vh]">
            <TabsContent value="logs">
              <h2 className="text-3xl font-bold mb-8">Activity Logs</h2>
              {logs.length === 0 && (
                <p className="text-gray-500">No logs yet. Send a message to the Telegram bot to see activity here.</p>
              )}
              <div className="grid gap-4">
                {logs.map((log) => (
                  <div key={log.id} className="bg-white/5 border border-white/10 rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-3 text-gray-400 text-sm">
                      <MessageSquare className="w-4 h-4" />
                      {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                    </div>
                    <div className="bg-black/40 p-4 rounded-xl mb-3 text-gray-300">{log.message}</div>
                    <div className="bg-purple-500/10 p-4 rounded-xl text-purple-100">
                      <span className="font-bold text-purple-300">AI: </span>{log.response}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="persona">
              <h2 className="text-3xl font-bold text-center mb-8">AI Brain</h2>
              {personas.length === 0 && (
                <p className="text-center text-gray-500">Run supabase_init.sql to create the default Zuza persona.</p>
              )}
              {personas.map((p) => (
                <div key={p.id} className="bg-white/5 border border-white/10 rounded-2xl p-8 mb-6">
                  <h3 className="text-2xl font-bold mb-6">{p.name}</h3>
                  <div className="flex gap-2 mb-4">
                    {(['normal', 'freaky', 'cold'] as const).map((mood) => (
                      <button
                        key={mood}
                        onClick={() => handleSavePersonaMood(p, mood)}
                        className={`px-4 py-2 rounded-xl font-bold text-sm ${
                          (p.social_style || 'normal') === mood
                            ? 'bg-purple-600 text-white'
                            : 'bg-white/5 text-gray-400 hover:text-white'
                        }`}
                      >
                        {mood}
                      </button>
                    ))}
                  </div>
                  <p className="text-gray-400 italic">
                    {(p.social_style || 'normal') === 'freaky' && '🔥 Flirty mode'}
                    {p.social_style === 'cold' && '❄️ Cold mode'}
                    {(!p.social_style || p.social_style === 'normal') && '✨ Fun & witty (default)'}
                  </p>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="config">
              <div className="max-w-2xl mx-auto bg-white/5 border border-white/10 rounded-2xl p-8">
                <h2 className="text-2xl font-bold mb-8">Engine Configuration</h2>
                <div className="space-y-6">
                  <div>
                    <label className="text-sm text-gray-400 font-bold uppercase">Provider</label>
                    <select
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                      className="w-full mt-2 bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white"
                    >
                      <option value="gemini">Google Gemini</option>
                      <option value="openai">OpenAI</option>
                      <option value="local">Local (Ollama)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-gray-400 font-bold uppercase">
                      {provider === 'local' ? 'Endpoint' : 'API Key'}
                    </label>
                    <input
                      type={provider === 'local' ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="w-full mt-2 bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white font-mono"
                      placeholder={provider === 'local' ? 'http://localhost:11434/v1' : '••••••••'}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-400 font-bold uppercase">Model</label>
                    <input
                      type="text"
                      value={modelName}
                      onChange={(e) => setModelName(e.target.value)}
                      className="w-full mt-2 bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white font-mono"
                    />
                  </div>
                  <button
                    onClick={handleSaveConfig}
                    disabled={!dbReady}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-xl font-bold"
                  >
                    DEPLOY CONFIGURATION
                  </button>
                </div>
              </div>
            </TabsContent>
          </main>
        </Tabs>
      </div>
    </div>
  );
}

export default App;
