import { createClient } from '@supabase/supabase-js';
import { GeminiService } from '../lib/gemini';

export class ZuzaAgent {
  private supabase: any;
  private aiService: GeminiService | null = null;
  private persona: string = "";
  private personaId: string = "";
  private lastProcessedMessages: Set<string> = new Set();
  private lastChatName: string = "";
  private isProcessing: boolean = false;
  private observer: MutationObserver | null = null;

  constructor() {
    const supabaseUrl = "https://rjmkuafxfrsmxzktphjs.supabase.co";
    const supabaseKey = "sb_publishable_Lp7Iv0G_sGXAFBAWv0zBWA_tM8TxmEu";
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async start() {
    console.log('%c Zuza-Prime: SYSTEM INITIALIZING... 🚀', 'background: #1a237e; color: #fff; font-weight: bold; padding: 4px');
    
    try {
      // 1. Load Config & Persona
      const { data: config } = await this.supabase.from('api_configs').select('*').eq('is_active', true).limit(1).maybeSingle();
      const { data: persona } = await this.supabase.from('personas').select('*').eq('is_active', true).limit(1).maybeSingle();

      if (config && config.provider === 'gemini' && config.api_key) {
        this.aiService = new GeminiService(config.api_key);
      }

      if (persona) {
        this.persona = persona.system_prompt || persona.template || "";
        this.personaId = persona.id;
        console.log('Zuza-Prime: Persona loaded:', persona.name);
      }

      // 2. Start Mutation Observer
      this.observer = new MutationObserver(() => this.scan());
      this.observer.observe(document.body, { childList: true, subtree: true });

      // 3. Start Backup Polling
      setInterval(() => this.scan(), 3000);

      console.log('%c Zuza-Prime: MONITORING ACTIVE 🟢', 'background: #1b5e20; color: #fff; font-weight: bold; padding: 4px');
    } catch (err) {
      console.error('Zuza-Prime: Critical Init Error:', err);
    }
  }

  private scan() {
    if (this.isProcessing) return;

    // A. Detect Chat Thread
    const titleEl = document.querySelector('h1, h2, [role="heading"], .x1heor9g');
    const currentChat = titleEl?.textContent?.trim() || "Unknown";
    
    if (currentChat !== "Unknown" && currentChat !== this.lastChatName) {
      console.log(`Zuza-Prime: 🔄 Thread Switch -> [${currentChat}]. Memory Cleared.`);
      this.lastChatName = currentChat;
      this.lastProcessedMessages.clear();
    }

    // B. Find All Messages (Universal Selector)
    // We target [dir="auto"] and common Messenger bubble classes
    const elements = Array.from(document.querySelectorAll('[dir="auto"], .x19um61t, .x1heor9g'));
    
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i] as HTMLElement;
      let text = el.textContent?.trim() || "";

      // Handle Thumbs up / Reactions
      if (!text && (el.getAttribute('aria-label') === '(y)' || el.getAttribute('aria-label') === 'Like')) {
        text = "kciuk (like)";
      }

      if (this.isValid(text, el)) {
        console.log('Zuza-Prime: 🎯 Incoming Signal:', text);
        this.handleMessage(text);
        return;
      }
    }
  }

  private isValid(text: string, el: HTMLElement): boolean {
    if (!text || text.length < 1) return false;
    if (text.includes("Wiadomość wysłana") || text.includes("Wprowadź") || text.includes("Kliknij")) return false;
    
    const lower = text.toLowerCase().trim();
    if (this.lastProcessedMessages.has(lower)) return false;
    if (text === this.lastChatName) return false;

    // VISUAL ALIGNMENT CHECK
    const row = el.closest('[role="row"], [role="gridcell"]');
    if (!row) return false;

    const mainChat = document.querySelector('[role="main"]') || document.body;
    const rect = el.getBoundingClientRect();
    const chatRect = mainChat.getBoundingClientRect();
    if (rect.width === 0) return false;

    const elCenter = rect.left + rect.width / 2;
    const chatCenter = chatRect.left + chatRect.width / 2;
    const isRight = elCenter > chatCenter;

    if (isRight) {
      this.lastProcessedMessages.add(lower);
      return false;
    }

    return true;
  }

  private async handleMessage(text: string) {
    this.isProcessing = true;
    this.lastProcessedMessages.add(text.toLowerCase().trim());

    try {
      if (!this.aiService) throw new Error("AI Service not initialized.");

      const history = this.extractHistory();
      const response = await this.aiService.generateResponse(text, history, this.persona);

      if (response) {
        await this.simulateTyping(response);
        this.lastProcessedMessages.add(response.toLowerCase().trim());
        await this.safeLog(text, response);
      }
    } catch (err: any) {
      if (err.message === "RATE_LIMIT") {
        console.warn("Zuza-Prime: Rate limited. Sleeping 30s...");
        await new Promise(r => setTimeout(r, 30000));
      } else {
        console.error('Zuza-Prime: Response Error:', err);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async simulateTyping(text: string) {
    const input = document.querySelector('[role="textbox"][contenteditable="true"]') as HTMLElement;
    if (!input) return;

    input.focus();
    // 19-year old girl typing speed simulator
    const typingDuration = Math.min(text.length * 40, 2500);
    await new Promise(r => setTimeout(r, typingDuration));

    document.execCommand('insertText', false, text);
    await new Promise(r => setTimeout(r, 600));

    const sendBtn = document.querySelector('[aria-label="Send"], [aria-label="Wyślij"], [aria-label="Wysłano"]');
    if (sendBtn) (sendBtn as HTMLElement).click();
    else {
      const enter = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
      input.dispatchEvent(enter);
    }
  }

  private extractHistory() {
    const mainChat = document.querySelector('[role="main"]') || document.body;
    const chatRect = mainChat.getBoundingClientRect();
    const chatCenter = chatRect.left + chatRect.width / 2;

    const elements = Array.from(document.querySelectorAll('[dir="auto"]')).slice(-8);
    return elements.map(el => {
      const text = el.textContent?.trim() || "";
      const rect = el.getBoundingClientRect();
      const elCenter = rect.left + rect.width / 2;
      const isRight = chatRect.width > 0 ? (elCenter > chatCenter) : false;
      return { role: isRight ? 'model' : 'user', parts: [{ text }] };
    }).filter(m => m.parts[0].text.length > 0 && !m.parts[0].text.includes("Wiadomość wysłana"));
  }

  private async safeLog(message: string, response: string) {
    try {
      await this.supabase.from('logs').insert({
        message,
        response,
        persona_id: this.personaId || null,
        created_at: new Date().toISOString()
      });
    } catch {}
  }
}
