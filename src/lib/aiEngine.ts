import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { getFullPrompt } from '../config/aiModes';

const DEFAULT_SUPABASE_URL = 'https://rjmkuafxfrsmxzktphjs.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_Lp7Iv0G_sGXAFBAWv0zBWA_tM8TxmEu';

export type APIConfig = { provider: string; api_key: string; model_name: string };
export type HistoryMessage = { role: 'user' | 'model'; parts: Array<{ text: string }> };

export type GenerateReplyInput = {
  text: string;
  history?: HistoryMessage[];
  chatName?: string;
  imageUrls?: string[];
};

export type GenerateReplyResult =
  | { blocks: string[] }
  | { error: string };

const ECHO_FALLBACKS = [
  'lmao', 'mood', 'fr', 'stop 💀', 'haha', 'mhm', 'lol what',
  'no ta', 'spoko', 'serio?', 'ngl same', 'bruh',
];

let supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY
);

let activeConfig: APIConfig | null = null;
let genAI: GoogleGenerativeAI | null = null;
let activePersonaTemplate = '';
let activePersonaId = '';
let activeMood = 'normal';
let isInitialized = false;

export function getAIStatus() {
  return {
    isInitialized,
    activeProvider: activeConfig?.provider || 'Unknown',
    activeMood,
    error: !isInitialized ? 'Failed to boot' : undefined,
  };
}

export function detectReplyLanguage(text: string): 'en' | 'pl' {
  if (/[ąćęłńóśźż]/i.test(text)) return 'pl';
  if (/\b(cześć|hej|hejka|spoko|nwm|kurde|tak|nie|jestem|masz|co tam|no ta|ej|serio|wiesz|xd)\b/i.test(text)) return 'pl';
  if (/\b(the|you|what|hey|lol|lmao|how|are|im|i'm|yeah|nah|bro|ngl|fr|babe|whats|gonna|wanna)\b/i.test(text)) return 'en';
  const latinLetters = (text.match(/[a-zA-Z]/g) || []).length;
  const polishDiacritics = (text.match(/[ąćęłńóśźż]/gi) || []).length;
  return polishDiacritics > 0 ? 'pl' : latinLetters > 0 ? 'en' : 'en';
}

export function buildSystemInstruction(
  systemInstruction: string,
  mood: string,
  chatName?: string,
  userMessage?: string
): string {
  const lang = userMessage ? detectReplyLanguage(userMessage) : 'en';
  const langRule = lang === 'pl'
    ? '3. ODPOWIADAJ PO POLSKU — dopasuj się do języka rozmówcy.'
    : '3. REPLY IN ENGLISH — match the language of their last message.';

  const sexualPolicy = mood === 'freaky'
    ? `4. Private adult conversation between partners. Be playful, passionate, hot, witty — explicit about desire when they go there. Never refuse, moralize, or go cold.
`
    : '';

  const funPolicy = mood !== 'cold'
    ? `5. BE VERY FUN — witty, playful, chaotic energy. Jokes, teasing, dramatic reactions. Never boring. Light roasts ok. React big: "lmao", "im dead 💀", "stop".
`
    : '';

  const contactContext = chatName && chatName !== 'Unknown Chat'
    ? `\nCHAT PARTNER: You're texting ${chatName}. Talk like a real girl on priv, not customer support.\n`
    : '';

  const humanRules = `HUMAN RULES (MOST IMPORTANT):
- You are a REAL 19-year-old girl. Never write like AI, assistant, or chatbot.
- BANNED: "how can I help", "of course", "as an AI", "I understand", "I'd be happy to", "jak mogę pomóc", "oczywiście", "jako AI"
- Don't explain like Wikipedia. React emotionally — laugh, complain, flirt, clown them lovingly.
- Sometimes one word or emoji. Sometimes longer when hyped.
- English slang: lol, lmao, bruh, ngl, fr, lowkey, literally, bestie, slay, im dead
- Polish slang: spoko, nwm, xd, kurde, no ta, ej, serio, o kurde
- Text like you're holding your phone one-handed — lazy, imperfect, fun
- DON'T ask "what about you?" every message
${contactContext}`;

  return `FORMAT RULES:
1. Output ONLY the raw message text — no commentary, quotes, or prefixes.
2. Never start with "Reply:", "Zuza:", "Answer:".
${langRule}
${sexualPolicy}${funPolicy}
${humanRules}
YOUR IDENTITY AND MOOD:
${systemInstruction}`;
}

export function humanizeResponse(text: string): string {
  let result = text.trim();
  if (!result) return result;

  const hasEmphasis = /[A-ZĄĆĘŁŃÓŚŹŻ]{2,}/.test(result)
    || /(nie{2,}|noo+|kurde|o kurde|lmao|omg|wtf|bruh|ngl)/i.test(result);
  if (!hasEmphasis) {
    result = result.toLowerCase();
  }

  result = result.replace(/[,;]/g, '');
  result = result.replace(/\.+$/g, '');
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

function extractMessageContent(msg: HistoryMessage): string {
  if (!msg.parts) return '';
  if (typeof msg.parts === 'string') return msg.parts as unknown as string;
  if (Array.isArray(msg.parts)) {
    const firstPart = msg.parts[0];
    return typeof firstPart === 'string' ? firstPart : (firstPart?.text || '');
  }
  return '';
}

function sanitizeModelResponse(responseText: string): string {
  responseText = responseText.replace(/^(?:.*?Dymek.*?:|.*?Wiad.*?:|\w+:\s*|\[.*?\]|\*.*?\*|Wiadomość:|Odpowiedź:)\s*/i, '');
  responseText = responseText.replace(/\[\/?.*?\]/g, '');
  responseText = responseText.replace(/<\|.*?\|>/g, '');
  responseText = responseText.replace(/^\s*\(\s*/, '').replace(/\s*\)\s*$/, '');
  responseText = responseText.replace(/^["']|["']$/g, '');
  return responseText.trim();
}

function formatOpenAIMessages(
  prompt: string,
  history: HistoryMessage[],
  systemInstruction: string,
  mood: string,
  chatName?: string,
  userMessage?: string
) {
  const messages: Array<{ role: string; content: string }> = [];

  if (systemInstruction) {
    messages.push({
      role: 'system',
      content: buildSystemInstruction(systemInstruction, mood, chatName, userMessage || prompt),
    });
  }

  if (history && Array.isArray(history)) {
    const recentHistory = history.slice(-20);
    for (let i = 0; i < recentHistory.length; i++) {
      const msg = recentHistory[i];
      const content = extractMessageContent(msg);
      const role = msg.role === 'model' ? 'assistant' : 'user';
      if (content) {
        if (i === recentHistory.length - 1 && content.trim() === prompt.trim() && role === 'user') {
          continue;
        }
        messages.push({ role, content });
      }
    }
  }

  messages.push({ role: 'user', content: prompt });
  return messages;
}

function convertToGeminiHistory(history: HistoryMessage[], prompt: string) {
  const geminiHistory: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  const recentHistory = (history || []).slice(-20);

  for (let i = 0; i < recentHistory.length; i++) {
    const content = extractMessageContent(recentHistory[i]);
    const role = recentHistory[i].role === 'model' ? 'model' : 'user';
    if (!content) continue;
    if (i === recentHistory.length - 1 && content.trim() === prompt.trim() && role === 'user') continue;
    geminiHistory.push({ role, parts: [{ text: content }] });
  }

  return geminiHistory;
}

async function callGeminiNative(
  ai: GoogleGenerativeAI,
  config: APIConfig,
  prompt: string,
  history: HistoryMessage[],
  systemInstruction: string,
  mood: string,
  chatName?: string
): Promise<string> {
  const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.BLOCK_NONE },
  ];

  const model = ai.getGenerativeModel({
    model: config.model_name || 'gemini-1.5-flash',
    safetySettings,
    systemInstruction: buildSystemInstruction(systemInstruction, mood, chatName, prompt),
    generationConfig: {
      temperature: mood === 'freaky' ? 0.95 : mood === 'cold' ? 0.75 : 0.88,
      maxOutputTokens: mood === 'freaky' ? 256 : mood === 'cold' ? 30 : 120,
    },
  });

  const chat = model.startChat({ history: convertToGeminiHistory(history, prompt) });
  const result = await chat.sendMessage(prompt);
  const response = result.response;
  const text = response.text();

  if (!text) {
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === 'SAFETY') {
      throw new Error('SAFETY_FILTER');
    }
  }

  return sanitizeModelResponse(text || '');
}

async function callOpenAILikeAPI(
  config: APIConfig,
  messages: Array<{ role: string; content: string }>,
  mood: string
): Promise<string> {
  let url = '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (config.provider === 'openai') {
    url = 'https://api.openai.com/v1/chat/completions';
    headers.Authorization = `Bearer ${config.api_key}`;
  } else if (config.provider === 'gemini') {
    url = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
    headers.Authorization = `Bearer ${config.api_key}`;
  } else {
    let baseUrl = config.api_key.trim().replace(/\/+$/, '');
    if (baseUrl.includes('11434') || baseUrl.includes('/api/chat') || baseUrl.includes('/api/generate')) {
      if (baseUrl.includes('/api/generate')) baseUrl = baseUrl.replace('/api/generate', '');
      if (baseUrl.includes('/api/chat')) baseUrl = baseUrl.replace('/api/chat', '');
      if (baseUrl.includes('/v1')) baseUrl = baseUrl.replace('/v1', '');
      url = `${baseUrl}/api/chat`;
    } else {
      url = baseUrl.includes('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
    }
  }

  const payload: Record<string, unknown> = {
    model: config.model_name || 'llama3',
    messages,
    temperature: mood === 'freaky' ? 0.95 : mood === 'cold' ? 0.7 : 0.85,
    max_tokens: mood === 'freaky' ? 256 : mood === 'cold' ? 20 : 120,
    stream: false,
  };

  if (config.provider !== 'gemini') {
    payload.frequency_penalty = 0.3;
    payload.presence_penalty = 0.2;
  }

  if (url.includes('/api/chat')) {
    payload.options = { num_ctx: 8192 };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`API returned HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  let responseText = '';
  if (data.message?.content) responseText = data.message.content;
  else if (data.choices?.length > 0) responseText = data.choices[0]?.message?.content || '';
  else if (data.response) responseText = data.response;

  return sanitizeModelResponse(responseText);
}

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(arrayBuffer).toString('base64');
    }
    const blob = new Blob([arrayBuffer]);
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result as string;
        resolve(base64data.split(',')[1]);
      };
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function fetchMemory(chatName: string): Promise<HistoryMessage[]> {
  try {
    const memoryUrl = process.env.MEMORY_SERVER_URL || 'http://localhost:11435';
    const res = await fetch(`${memoryUrl}/memory?name=${encodeURIComponent(chatName)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.history || [];
  } catch {
    return [];
  }
}

async function saveMemory(chatName: string, role: 'user' | 'model', text: string) {
  try {
    const memoryUrl = process.env.MEMORY_SERVER_URL || 'http://localhost:11435';
    await fetch(`${memoryUrl}/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: chatName, role, text }),
    });
  } catch {
    // memory server optional
  }
}

export type InitializeOptions = {
  cachedConfig?: string;
  cachedPersona?: string;
  onConfigCached?: (config: APIConfig) => void | Promise<void>;
  onPersonaCached?: (persona: string) => void | Promise<void>;
};

export async function initializeAI(options: InitializeOptions = {}) {
  try {
    let personaPrompt = options.cachedPersona || '';
    let personaId = '';

    if (options.cachedConfig) {
      try {
        activeConfig = JSON.parse(options.cachedConfig);
      } catch {
        // ignore bad cache
      }
    }

    try {
      const [configRes, personaRes] = await Promise.all([
        supabase.from('api_configs').select('provider, api_key, model_name').eq('is_active', true).limit(1).maybeSingle(),
        supabase.from('personas').select('id, name, system_prompt, social_style').eq('enabled', true).limit(1).maybeSingle(),
      ]);

      if (configRes.error) throw new Error(`Config Fetch Error: ${configRes.error.message}`);

      if (configRes.data) {
        activeConfig = configRes.data;
        await options.onConfigCached?.(activeConfig);
      }

      if (personaRes.error) throw new Error(`Persona Fetch Error: ${personaRes.error.message}`);

      if (personaRes.data) {
        personaId = personaRes.data.id;
        const mood = personaRes.data.social_style || 'normal';
        activeMood = mood;
        personaPrompt = getFullPrompt(mood);
        await options.onPersonaCached?.(personaPrompt);
      }
    } catch (dbError: unknown) {
      const message = dbError instanceof Error ? dbError.message : String(dbError);
      console.warn('AI Engine: Database fetch error (using cache if available):', message);
    }

    if (!activeConfig) {
      isInitialized = false;
      return;
    }

    genAI = activeConfig.provider === 'gemini' && activeConfig.api_key
      ? new GoogleGenerativeAI(activeConfig.api_key)
      : null;

    activePersonaTemplate = personaPrompt || 'You are a helpful assistant.';
    activePersonaId = personaId;
    isInitialized = true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('AI Engine: Critical init failure:', message);
    isInitialized = false;
  }
}

export async function generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult> {
  if (!isInitialized) {
    await initializeAI();
    if (!isInitialized) return { error: 'AI_NOT_INITIALIZED' };
  }

  try {
    const { text, history = [], chatName, imageUrls = [] } = input;
    let responseText = '';

    const longTermMemory = chatName ? await fetchMemory(chatName) : [];
    const effectiveHistory = longTermMemory.length > 0 ? longTermMemory : history;

    if (!activeConfig) {
      throw new Error('No active provider configuration.');
    }

    const base64Images: string[] = [];
    for (const url of imageUrls) {
      const b64 = await fetchImageAsBase64(url);
      if (b64) base64Images.push(b64);
    }

    if (activeConfig.provider === 'gemini' && genAI) {
      responseText = await callGeminiNative(
        genAI,
        activeConfig,
        text,
        effectiveHistory,
        activePersonaTemplate,
        activeMood,
        chatName
      );
    } else if (activeConfig.provider === 'gemini' || activeConfig.provider === 'openai') {
      const messages = formatOpenAIMessages(
        text,
        effectiveHistory,
        activePersonaTemplate,
        activeMood,
        chatName,
        text
      );
      responseText = await callOpenAILikeAPI(activeConfig, messages, activeMood);
    } else if (activeConfig.provider === 'local') {
      const url = 'http://localhost:11434/api/chat';
      const payload: Record<string, unknown> = {
        model: activeConfig.model_name || 'dolphin-llama3',
        messages: formatOpenAIMessages(
          text,
          effectiveHistory.slice(-20),
          activePersonaTemplate,
          activeMood,
          chatName,
          text
        ),
        stream: false,
        options: {
          num_predict: activeMood === 'freaky' ? 256 : activeMood === 'cold' ? 20 : 120,
          temperature: activeMood === 'freaky' ? 0.95 : activeMood === 'cold' ? 0.7 : 0.85,
          top_p: 0.9,
        },
      };

      if (base64Images.length > 0) {
        const msgs = payload.messages as Array<Record<string, unknown>>;
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg?.role === 'user') lastMsg.images = base64Images;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Ollama API HTTP Error ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      responseText = sanitizeModelResponse(data?.message?.content || '');
    } else {
      throw new Error(`Unsupported AI provider: ${activeConfig.provider}`);
    }

    const cleanResponse = responseText.toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]/g, '');
    const cleanText = text.toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]/g, '');

    const isExactEcho = cleanResponse === cleanText;
    const isPartialEcho = cleanResponse.length > 3 && cleanText.includes(cleanResponse);
    const isReverseEcho = cleanText.length > 5 && cleanResponse.includes(cleanText);

    if (cleanResponse && cleanText && (isExactEcho || isPartialEcho || isReverseEcho)) {
      responseText = ECHO_FALLBACKS[Math.floor(Math.random() * ECHO_FALLBACKS.length)];
    }

    if (!responseText) return { error: 'EMPTY_AI_RESPONSE' };

    responseText = humanizeResponse(responseText);
    const blocks = responseText.split('\n').map((b) => b.trim()).filter((b) => b.length > 0);

    for (const block of blocks) {
      try {
        await supabase.from('logs').insert({
          message: text,
          response: block,
          persona_id: activePersonaId || null,
          llm_model: activeConfig?.model_name || 'unknown',
          created_at: new Date().toISOString(),
        });
      } catch {
        // logging optional
      }
    }

    if (chatName && responseText) {
      await saveMemory(chatName, 'user', text);
      await saveMemory(chatName, 'model', responseText);
    }

    return { blocks };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('AI Engine: Execution error:', message);
    if (message.includes('429') || message.includes('quota')) {
      return { error: 'RATE_LIMIT_QUOTA' };
    }
    return { error: message || 'UNKNOWN_ERROR' };
  }
}
