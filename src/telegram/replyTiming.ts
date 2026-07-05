import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env') });

export type ReplySpeed = 'instant' | 'fast' | 'normal';

const SPEEDS: Record<ReplySpeed, {
  debounceMin: number;
  debounceMax: number;
  readMin: number;
  readMax: number;
  charMsMin: number;
  charMsMax: number;
  typingMin: number;
  typingMax: number;
  typingWhileGenerating: boolean;
}> = {
  instant: {
    debounceMin: 150,
    debounceMax: 400,
    readMin: 0,
    readMax: 0,
    charMsMin: 0,
    charMsMax: 0,
    typingMin: 0,
    typingMax: 0,
    typingWhileGenerating: true,
  },
  fast: {
    debounceMin: 600,
    debounceMax: 1200,
    readMin: 150,
    readMax: 400,
    charMsMin: 8,
    charMsMax: 14,
    typingMin: 200,
    typingMax: 800,
    typingWhileGenerating: true,
  },
  normal: {
    debounceMin: 3500,
    debounceMax: 9000,
    readMin: 1200,
    readMax: 3500,
    charMsMin: 35,
    charMsMax: 45,
    typingMin: 1000,
    typingMax: 2500,
    typingWhileGenerating: false,
  },
};

export function getReplySpeed(): ReplySpeed {
  const raw = (process.env.TELEGRAM_REPLY_SPEED || 'fast').toLowerCase();
  if (raw === 'instant' || raw === 'fast' || raw === 'normal') return raw;
  return 'fast';
}

export function getReplyTiming() {
  return SPEEDS[getReplySpeed()];
}

export function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}
