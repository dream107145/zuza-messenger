import { GoogleGenerativeAI } from '@google/generative-ai';

export class GeminiService {
  private genAI: GoogleGenerativeAI | null = null;
  private readonly MODELS = ['gemini-1.5-flash', 'gemini-1.5-pro']; // Stable production models

  constructor(apiKey: string) {
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  async generateResponse(prompt: string, history: any[] = [], persona: string = ""): Promise<string> {
    if (!this.genAI) throw new Error("AI Service not initialized. Please check API config.");

    const systemPrompt = `
      ${persona}
      
      STRICT RULES:
      1. ALWAYS reply in the SAME language as the user's last message (English or Polish).
      2. Keep it short, fun, and natural — like a 19-year-old on Messenger. Be witty and playful.
      3. NEVER mention you are an AI or assistant.
      4. DO NOT repeat the user's message.
      5. If you are not sure what to say, react with humor or send an emoji.
    `;

    // Try models in order, but stop if rate limited
    for (const modelName of this.MODELS) {
      try {
        console.log(`AutoMsg: Using model ${modelName}...`);
        const model = this.genAI.getGenerativeModel({ 
          model: modelName,
          generationConfig: { temperature: 0.7, maxOutputTokens: 200 }
        });

        const chat = model.startChat({
          history: history.length > 0 ? history : undefined,
          systemInstruction: systemPrompt
        });

        const result = await chat.sendMessage(prompt);
        const response = result.response.text();
        
        return this.cleanResponse(response);
      } catch (error: any) {
        const errText = error.toString();
        if (errText.includes("429") || errText.includes("quota")) {
          console.warn(`AutoMsg: Quota exceeded for ${modelName}. Waiting...`);
          throw new Error("RATE_LIMIT");
        }
        console.error(`AutoMsg: Model ${modelName} failed:`, error);
        continue; // Try next model
      }
    }

    throw new Error("All AI models failed. Please check your internet or API key.");
  }

  private cleanResponse(text: string): string {
    let clean = text.trim();
    // Strip common AI hallucinations
    clean = clean.replace(/^(Zuza:|Zuza Szymańska:|AI:)/gi, '').trim();
    
    const botPhrases = ['as an ai', 'i am an ai', 'how can i help', "i'd be happy to"];
    if (botPhrases.some(word => clean.toLowerCase().includes(word))) {
      return "lol wait what, i zoned out for a sec";
    }

    return clean;
  }
}
