import { TelegramClient, Api } from 'telegram';
import bigInt from 'big-integer';

let stickerPool: Api.Document[] = [];

export async function refreshStickerPool(client: TelegramClient) {
  const pool: Api.Document[] = [];

  try {
    const recent = await client.invoke(
      new Api.messages.GetRecentStickers({ hash: bigInt(0), attached: false })
    );
    if ('stickers' in recent && Array.isArray(recent.stickers)) {
      for (const doc of recent.stickers) {
        if (doc instanceof Api.Document) {
          pool.push(doc);
        }
      }
    }
  } catch {
    // recent stickers optional
  }

  if (pool.length === 0) {
    try {
      const all = await client.invoke(new Api.messages.GetAllStickers({ hash: bigInt(0) }));
      const firstSet = 'sets' in all ? all.sets?.[0] : undefined;
      if (firstSet) {
        const full = await client.invoke(
          new Api.messages.GetStickerSet({
            stickerset: new Api.InputStickerSetID({
              id: firstSet.id,
              accessHash: firstSet.accessHash,
            }),
            hash: 0,
          })
        );
        if ('documents' in full && Array.isArray(full.documents)) {
          for (const doc of full.documents.slice(0, 40)) {
            if (doc instanceof Api.Document) {
              pool.push(doc);
            }
          }
        }
      }
    } catch {
      // sticker sets optional
    }
  }

  stickerPool = pool;
  if (pool.length > 0) {
    console.log(`🎨 Loaded ${pool.length} sticker(s) for replies.`);
  } else {
    console.warn('⚠️  No stickers loaded — send some stickers in Telegram first, or install a sticker pack.');
  }
}

export function pickRandomSticker(): Api.Document | null {
  if (stickerPool.length === 0) return null;
  return stickerPool[Math.floor(Math.random() * stickerPool.length)];
}

export function isStickerReplyToken(text: string): boolean {
  return text.trim().toLowerCase() === '[sticker]';
}
