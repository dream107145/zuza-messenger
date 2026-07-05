import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env') });

const OFFLINE_ENABLED = process.env.TELEGRAM_OFFLINE_SCHEDULE !== 'false';
const SLEEP_HOURS_ENABLED = process.env.TELEGRAM_SLEEP_HOURS !== 'false';
const TIMEZONE = process.env.TELEGRAM_TIMEZONE
  || Intl.DateTimeFormat().resolvedOptions().timeZone
  || 'UTC';
const SLEEP_START = parseInt(process.env.TELEGRAM_SLEEP_START || '23', 10);
const SLEEP_END = parseInt(process.env.TELEGRAM_SLEEP_END || '8', 10);
const RANDOM_SILENCE_WINDOW_HOURS = parseFloat(process.env.TELEGRAM_RANDOM_SILENCE_WINDOW_HOURS || '2');
const RANDOM_SILENCE_MAX_PER_WINDOW = parseInt(process.env.TELEGRAM_RANDOM_SILENCE_MAX_PER_WINDOW || '2', 10);
const RANDOM_SILENCE_MIN_GAP_MINUTES = parseFloat(process.env.TELEGRAM_RANDOM_SILENCE_MIN_GAP_MINUTES || '45');
const RANDOM_SILENCE_CHANCE = parseFloat(process.env.TELEGRAM_RANDOM_SILENCE_CHANCE || '0.15');
const RANDOM_SILENCE_MIN_MINUTES = parseFloat(process.env.TELEGRAM_RANDOM_SILENCE_MIN_MINUTES || '2');
const RANDOM_SILENCE_MAX_MINUTES = parseFloat(process.env.TELEGRAM_RANDOM_SILENCE_MAX_MINUTES || '5');

const randomDelayTimestamps: number[] = [];

const SLEEP_EXCUSES = [
  'sorry was asleep lol',
  'just woke up omg',
  'sorry i passed out',
  'was knocked out lol',
  'sorry was dead asleep',
];

const CLASS_EXCUSES = [
  'sorry was in class',
  'just got out of lecture',
  'was studying sorry',
  'in the library lol sorry',
];

const BUSY_EXCUSES = [
  'sorry was busy',
  'wasnt on my phone lol',
  'just saw this',
  'sorry late reply',
];

const replyAfterByChat = new Map<string, number>();
const delayLoggedForChat = new Set<string>();

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function getLocalParts(now = new Date()): { hour: number; minute: number } {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
    return { hour, minute };
  } catch {
    return { hour: now.getUTCHours(), minute: now.getUTCMinutes() };
  }
}

export function isSleeping(now = new Date()): boolean {
  if (!OFFLINE_ENABLED || !SLEEP_HOURS_ENABLED) return false;

  const { hour } = getLocalParts(now);
  if (SLEEP_START === SLEEP_END) return false;

  if (SLEEP_START > SLEEP_END) {
    return hour >= SLEEP_START || hour < SLEEP_END;
  }

  return hour >= SLEEP_START && hour < SLEEP_END;
}

export function isCurrentlyOffline(now = new Date()): boolean {
  return isSleeping(now);
}

export function msUntilWake(now = new Date()): number {
  const { hour, minute } = getLocalParts(now);
  const currentMinutes = hour * 60 + minute;
  const wakeMinutes = SLEEP_END * 60;

  let deltaMinutes = wakeMinutes - currentMinutes;
  if (deltaMinutes <= 0) deltaMinutes += 24 * 60;

  const jitterMs = randomBetween(2, 18) * 60_000;
  return deltaMinutes * 60_000 + jitterMs;
}

function pruneRandomDelays(now: number) {
  const windowMs = Math.max(1, RANDOM_SILENCE_WINDOW_HOURS) * 3_600_000;
  while (randomDelayTimestamps.length > 0 && now - randomDelayTimestamps[0] > windowMs) {
    randomDelayTimestamps.shift();
  }
}

function canUseRandomDelay(now: number): boolean {
  pruneRandomDelays(now);
  if (randomDelayTimestamps.length >= RANDOM_SILENCE_MAX_PER_WINDOW) return false;

  const last = randomDelayTimestamps[randomDelayTimestamps.length - 1];
  const minGapMs = Math.max(1, RANDOM_SILENCE_MIN_GAP_MINUTES) * 60_000;
  if (last && now - last < minGapMs) return false;

  return true;
}

export function rollRandomSilenceDelayMs(now = Date.now()): number {
  if (!OFFLINE_ENABLED || isSleeping()) return 0;
  if (!canUseRandomDelay(now)) return 0;
  if (Math.random() > RANDOM_SILENCE_CHANCE) return 0;

  const minMs = Math.max(1, RANDOM_SILENCE_MIN_MINUTES) * 60_000;
  const maxMs = Math.max(RANDOM_SILENCE_MIN_MINUTES, RANDOM_SILENCE_MAX_MINUTES) * 60_000;
  const delayMs = randomBetween(minMs, maxMs);
  randomDelayTimestamps.push(now);
  return delayMs;
}

export function getOfflineReplyDelayMs(now = new Date()): number {
  if (isSleeping(now)) return msUntilWake(now);
  return rollRandomSilenceDelayMs();
}

export function formatDelayMs(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}min`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

export function describeReplyDelay(ms: number, now = new Date()): string {
  if (ms <= 0) return 'now';
  if (isSleeping(now)) return `sleep hours (~${formatDelayMs(ms)})`;
  return `away from phone (~${formatDelayMs(ms)})`;
}

export function getReplyDelayUntil(chatId: string, now = Date.now()): number {
  const existing = replyAfterByChat.get(chatId);
  if (existing && existing > now) {
    return existing - now;
  }

  const delayMs = getOfflineReplyDelayMs(new Date(now));
  if (delayMs <= 0) {
    replyAfterByChat.delete(chatId);
    return 0;
  }

  replyAfterByChat.set(chatId, now + delayMs);
  return delayMs;
}

export function hasPendingReplyDelay(chatId: string, now = Date.now()): boolean {
  const existing = replyAfterByChat.get(chatId);
  return !!existing && existing > now;
}

export function clearReplyDelay(chatId: string) {
  replyAfterByChat.delete(chatId);
  delayLoggedForChat.delete(chatId);
}

export function logReplyDelayOnce(chatId: string, chatName: string, delayMs: number) {
  if (delayMs <= 0 || delayLoggedForChat.has(chatId)) return;
  delayLoggedForChat.add(chatId);
  console.log(`⏳ AutoReply [${chatName}]: reply delayed — ${describeReplyDelay(delayMs)}`);
}

export function getOfflineExcuse(now = new Date()): string {
  if (isSleeping(now)) return pickRandom(SLEEP_EXCUSES);

  const { hour } = getLocalParts(now);
  if (hour >= 8 && hour <= 17 && Math.random() < 0.35) {
    return pickRandom(CLASS_EXCUSES);
  }

  return pickRandom(BUSY_EXCUSES);
}

export function shouldSkipProactiveWhileOffline(): boolean {
  return isCurrentlyOffline();
}

export function getOfflineScheduleSummary(): string {
  if (!OFFLINE_ENABLED) return 'offline schedule disabled';
  const { hour } = getLocalParts();
  const sleepPart = SLEEP_HOURS_ENABLED
    ? `sleep ${SLEEP_START}:00-${SLEEP_END}:00 (${TIMEZONE})`
    : 'sleep hours off';
  const awake = SLEEP_HOURS_ENABLED && isSleeping() ? 'asleep now' : `awake now (${hour}:00 local)`;
  return `${sleepPart}, ${awake}, random silence max ${RANDOM_SILENCE_MAX_PER_WINDOW}/${RANDOM_SILENCE_WINDOW_HOURS}h (${RANDOM_SILENCE_MIN_MINUTES}-${RANDOM_SILENCE_MAX_MINUTES}min)`;
}

export function getStartupOfflineNotice(): string | null {
  if (!OFFLINE_ENABLED || !isSleeping()) return null;
  const delayMs = msUntilWake();
  return `😴 Sleep hours active — new replies delayed ~${formatDelayMs(delayMs)} (set TELEGRAM_TIMEZONE in .env if wrong)`;
}
