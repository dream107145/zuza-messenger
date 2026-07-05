import { config } from 'dotenv';
import { existsSync, readdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env') });

const PHOTO_DIR = process.env.TELEGRAM_PHOTO_DIR
  || resolve(dirname(fileURLToPath(import.meta.url)), '../../public/photos');

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
const photoPools = new Map<string, string[]>();

function listPhotos(category: string): string[] {
  const dir = join(PHOTO_DIR, category);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((file) => IMAGE_EXT.test(file))
    .map((file) => join(dir, file));
}

export function refreshPhotoPool(): number {
  photoPools.clear();

  const rootPhotos = existsSync(PHOTO_DIR)
    ? readdirSync(PHOTO_DIR)
      .filter((file) => IMAGE_EXT.test(file))
      .map((file) => join(PHOTO_DIR, file))
    : [];

  if (rootPhotos.length > 0) {
    photoPools.set('casual', rootPhotos);
  }

  for (const category of ['casual', 'selfie']) {
    const files = listPhotos(category);
    if (files.length > 0) {
      photoPools.set(category, files);
    }
  }

  let total = 0;
  for (const files of photoPools.values()) total += files.length;
  return total;
}

export function pickRandomPhoto(category = 'casual'): string | null {
  const pool = photoPools.get(category) || photoPools.get('casual') || [];
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function parsePhotoToken(block: string): { isPhoto: boolean; category: string } {
  const trimmed = block.trim();
  const match = trimmed.match(/^\[photo(?::([a-z]+))?\]$/i);
  if (!match) return { isPhoto: false, category: 'casual' };
  return { isPhoto: true, category: (match[1] || 'casual').toLowerCase() };
}

export function getPhotoDir(): string {
  return PHOTO_DIR;
}
