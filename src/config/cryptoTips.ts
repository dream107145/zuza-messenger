export type CryptoType = 'eth' | 'btc' | 'sol' | 'tron' | 'bnb' | 'polygon';

export const CRYPTO_ADDRESSES: Record<CryptoType, string> = {
  eth: (process.env.CRYPTO_TIP_ETH || '0xf952940d4B6Aa8FE20F8b01D947449f68B0b98aC').trim(),
  btc: (process.env.CRYPTO_TIP_BTC || 'bc1q0rwga6t5xlggd03gpnt7dvsu3vxcuycpxsae04').trim(),
  sol: (process.env.CRYPTO_TIP_SOL || '8qaXGnSqDwTnZbvgS4G8heLkguvk9KEXfue6jrpgrDpW').trim(),
  tron: (process.env.CRYPTO_TIP_TRON || 'TFxhkPTnaMoJtoWEFhhUgouw9j3cwEu1gm').trim(),
  bnb: (process.env.CRYPTO_TIP_BNB || '0xf952940d4B6Aa8FE20F8b01D947449f68B0b98aC').trim(),
  polygon: (process.env.CRYPTO_TIP_POLYGON || '0xf952940d4B6Aa8FE20F8b01D947449f68B0b98aC').trim(),
};

export const CRYPTO_LABELS: Record<CryptoType, string> = {
  eth: 'ETH / Ethereum',
  btc: 'BTC / Bitcoin',
  sol: 'SOL / Solana',
  tron: 'TRON / TRX',
  bnb: 'BNB / BSC',
  polygon: 'Polygon / MATIC',
};

const TIP_MIN_MESSAGES = parseInt(process.env.TIP_MIN_MESSAGES || '20', 10);

const tipPromptedChats = new Set<string>();

const CRYPTO_ALIASES: Array<{ type: CryptoType; pattern: RegExp }> = [
  { type: 'eth', pattern: /\b(eth|ethereum|erc-?20)\b/i },
  { type: 'btc', pattern: /\b(btc|bitcoin|sats?)\b/i },
  { type: 'sol', pattern: /\b(sol|solana)\b/i },
  { type: 'tron', pattern: /\b(tron|trx)\b/i },
  { type: 'bnb', pattern: /\b(bnb|bsc|binance\s*smart\s*chain)\b/i },
  { type: 'polygon', pattern: /\b(polygon|matic)\b/i },
];

const TIP_INTENT_PATTERN =
  /\b(tip|tips|tipping|donate|donation|send\s+(me\s+)?(some\s+)?(crypto|money|cash)|crypto\s+(tip|address|wallet)|wallet\s+address|your\s+(crypto\s+)?address|want\s+to\s+(tip|donate|support)|how\s+(can|do)\s+i\s+(tip|donate|pay|send)|support\s+you|buy\s+you\s+(a\s+)?(coffee|drink))\b/i;

const SATISFACTION_PATTERN =
  /\b(thank(s| you)|thx|tysm|love\s+(this|you|it)|you'?re\s+(the\s+)?(best|amazing|awesome|great|so\s+fun|hilarious)|this\s+is\s+(great|amazing|awesome|fun)|best\s+chat|had\s+fun|appreciate|grateful|you\s+rock|you\s+slay|so\s+helpful|perfect)\b/i;

export function detectCryptoType(text: string): CryptoType | null {
  for (const { type, pattern } of CRYPTO_ALIASES) {
    if (pattern.test(text)) return type;
  }
  return null;
}

export function detectTipIntent(text: string): boolean {
  return TIP_INTENT_PATTERN.test(text);
}

export function detectSatisfaction(text: string): boolean {
  return SATISFACTION_PATTERN.test(text);
}

export function countUserMessages(history: Array<{ role: string }>, currentText: string): number {
  const fromHistory = history.filter((m) => m.role === 'user').length;
  return fromHistory + (currentText.trim() ? 1 : 0);
}

export function shouldPromptForTip(
  chatName: string | undefined,
  messageCount: number,
  userText: string,
  mood: string
): boolean {
  if (mood === 'cold') return false;
  if (!chatName) return false;
  if (messageCount < TIP_MIN_MESSAGES) return false;
  if (tipPromptedChats.has(chatName)) return false;
  if (detectTipIntent(userText)) return false;
  return detectSatisfaction(userText);
}

export function markTipPrompted(chatName: string) {
  tipPromptedChats.add(chatName);
}

export function formatCryptoAddressReply(type: CryptoType): string {
  const label = CRYPTO_LABELS[type];
  const address = CRYPTO_ADDRESSES[type];
  return `omg yes ${label} works 🥺 send here: ${address}`;
}

export function formatAskCryptoTypeReply(): string {
  return 'aww thank you 🥺 which crypto — eth, btc, sol, tron, bnb, or polygon?';
}

export function getLastModelText(history: Array<{ role: string; parts?: Array<{ text: string }> }>): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== 'model') continue;
    const parts = history[i].parts;
    if (!parts?.length) continue;
    const text = parts[0]?.text;
    if (text) return text;
  }
  return '';
}

export function tryCryptoSelectionReply(
  userText: string,
  recentAssistantText = ''
): string | null {
  const trimmed = userText.trim();
  if (!trimmed || trimmed.length > 50) return null;

  const crypto = detectCryptoType(trimmed);
  if (!crypto) return null;

  const words = trimmed.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length > 5) return null;

  const askedCrypto = /\b(which crypto|crypto type|eth|btc|sol|tron|bnb|polygon)\b/i.test(recentAssistantText);
  if (!askedCrypto && !detectTipIntent(trimmed)) return null;

  return formatCryptoAddressReply(crypto);
}

export function tryDirectTipReply(userText: string): string | null {
  if (!detectTipIntent(userText)) return null;

  const crypto = detectCryptoType(userText);
  if (crypto) return formatCryptoAddressReply(crypto);

  return formatAskCryptoTypeReply();
}

export function buildTipSystemContext(
  chatName: string | undefined,
  messageCount: number,
  userText: string,
  mood: string
): string {
  if (mood === 'cold') return '';

  const lines: string[] = [];

  lines.push(`TIPS (crypto only):
- If they want to tip/donate/support you → ask which crypto: eth, btc, sol, tron, bnb, or polygon. Never guess an address.
- Once they pick a crypto, confirm warmly and give ONLY the exact address from this list:
  ETH: ${CRYPTO_ADDRESSES.eth}
  BTC: ${CRYPTO_ADDRESSES.btc}
  SOL: ${CRYPTO_ADDRESSES.sol}
  TRON: ${CRYPTO_ADDRESSES.tron}
  BNB: ${CRYPTO_ADDRESSES.bnb}
  POLYGON: ${CRYPTO_ADDRESSES.polygon}
- Keep it casual, not desperate. One short ask is enough.`);

  if (shouldPromptForTip(chatName, messageCount, userText, mood)) {
    if (chatName) markTipPrompted(chatName);
    lines.push(`- RIGHT NOW: You've chatted a while (${messageCount}+ messages) and they seem happy. End your reply by playfully asking if they'd tip you in crypto — ask which crypto they want to use. Do NOT paste addresses unless they already named one.`);
  }

  return lines.join('\n');
}
