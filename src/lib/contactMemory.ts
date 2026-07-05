import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env') });

export type ContactMeta = {
  contact_name: string;
  first_contact_at: string | null;
  message_count: number;
  facts: string[];
};

const memoryUrl = () => process.env.MEMORY_SERVER_URL || 'http://localhost:11435';
const MEMORY_FETCH_TIMEOUT_MS = parseInt(process.env.MEMORY_FETCH_TIMEOUT_MS || '5000', 10);

async function fetchMemoryApi(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MEMORY_FETCH_TIMEOUT_MS);
  try {
    return await fetch(`${memoryUrl()}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchContactMeta(chatName: string): Promise<ContactMeta | null> {
  try {
    const res = await fetchMemoryApi(`/contact?name=${encodeURIComponent(chatName)}`);
    if (!res.ok) return null;
    const data = await res.json() as Partial<ContactMeta>;
    return {
      contact_name: data.contact_name || chatName,
      first_contact_at: data.first_contact_at || null,
      message_count: data.message_count || 0,
      facts: Array.isArray(data.facts) ? data.facts : [],
    };
  } catch {
    return null;
  }
}

export async function upsertContactMeta(
  chatName: string,
  patch: Partial<Pick<ContactMeta, 'first_contact_at' | 'message_count' | 'facts'>>
): Promise<void> {
  try {
    await fetchMemoryApi('/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: chatName, ...patch }),
    });
  } catch {
    // memory server optional
  }
}

export async function registerFirstContact(chatName: string, firstMessageAt?: string | Date): Promise<void> {
  const meta = await fetchContactMeta(chatName);
  if (meta?.first_contact_at) return;

  const iso = firstMessageAt
    ? new Date(firstMessageAt).toISOString()
    : new Date().toISOString();

  await upsertContactMeta(chatName, { first_contact_at: iso });
}

export function getDaysSinceFirstContact(meta: ContactMeta | null): number | undefined {
  if (!meta?.first_contact_at) return undefined;
  const first = new Date(meta.first_contact_at).getTime();
  if (Number.isNaN(first)) return undefined;
  const diffMs = Date.now() - first;
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}

const FACT_EXTRACTORS: Array<{ key: string; pattern: RegExp }> = [
  { key: 'name', pattern: /\b(?:my name is|call me|i am|i'm|im)\s+([A-Za-z][A-Za-z'-]{1,24})\b/i },
  { key: 'age', pattern: /\b(?:i am|i'm|im)\s+(\d{1,2})\b(?:\s+years?\s+old)?/i },
  { key: 'job', pattern: /\b(?:i work as|i'm a|im a|my job is|i do)\s+([^,.!\n]{2,40})/i },
  { key: 'from', pattern: /\b(?:i'm from|im from|i live in|from)\s+([^,.!\n]{2,40})/i },
  { key: 'likes', pattern: /\b(?:i love|i like|my favorite|fav(?:orite)? is)\s+([^,.!\n]{2,40})/i },
];

export function extractFactsFromText(text: string): string[] {
  const facts: string[] = [];

  for (const { key, pattern } of FACT_EXTRACTORS) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const value = match[1].trim().replace(/\s+/g, ' ');
    if (value.length < 2) continue;
    facts.push(`${key}: ${value}`);
  }

  return facts;
}

export function mergeFacts(existing: string[], incoming: string[]): string[] {
  const map = new Map<string, string>();

  for (const fact of [...existing, ...incoming]) {
    const idx = fact.indexOf(':');
    if (idx <= 0) continue;
    const key = fact.slice(0, idx).trim().toLowerCase();
    const value = fact.slice(idx + 1).trim();
    if (!value) continue;
    map.set(key, `${key}: ${value}`);
  }

  return Array.from(map.values()).slice(-12);
}

export async function rememberFromUserMessage(chatName: string, text: string): Promise<void> {
  const newFacts = extractFactsFromText(text);
  if (newFacts.length === 0) return;

  const meta = await fetchContactMeta(chatName);
  const merged = mergeFacts(meta?.facts || [], newFacts);
  await upsertContactMeta(chatName, { facts: merged });
}

export function buildContactMemoryContext(meta: ContactMeta | null): string {
  if (!meta) return '';

  const lines: string[] = ['WHAT YOU REMEMBER ABOUT THEM (use naturally, don\'t list like a robot):'];

  if (meta.facts.length > 0) {
    for (const fact of meta.facts) {
      lines.push(`- ${fact}`);
    }
  } else {
    lines.push('- Nothing specific yet — learn as you chat.');
  }

  if (meta.first_contact_at) {
    const days = getDaysSinceFirstContact(meta);
    if (days !== undefined) {
      lines.push(`- You've been texting for about ${days} day(s) (since ${meta.first_contact_at.slice(0, 10)}).`);
    }
  }

  return lines.join('\n');
}
