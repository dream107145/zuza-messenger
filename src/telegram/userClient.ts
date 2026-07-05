/**
 * Auto-reply from YOUR personal Telegram account (MTProto / GramJS).
 * Messages appear as you — no "BOT" badge.
 *
 * Setup:
 *   1. https://my.telegram.org → API development tools → get api_id + api_hash
 *   2. npm run telegram:login → save TELEGRAM_SESSION to .env
 *   3. npm run telegram:user
 */
import { config } from 'dotenv';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage, type NewMessageEvent } from 'telegram/events';
import { initializeAI, getAIStatus, type HistoryMessage } from '../lib/aiEngine';
import { createAutoReplyHandler } from './messageHandler';
import { getReplySpeed, getReplyTiming, randomBetween } from './replyTiming';
import { pickRandomSticker, refreshStickerPool } from './stickers';
import { getOfflineScheduleSummary, getStartupOfflineNotice } from '../config/offlineSchedule';
import { getPhotoDir, pickRandomPhoto, refreshPhotoPool } from './photos';

config();

const apiId = parseInt(process.env.TELEGRAM_API_ID || '', 10);
const apiHash = process.env.TELEGRAM_API_HASH || '';
const sessionString = process.env.TELEGRAM_SESSION || '';

const replyGroups = process.env.TELEGRAM_REPLY_GROUPS === 'true';
const startupUnreadLimit = parseInt(process.env.TELEGRAM_STARTUP_UNREAD_LIMIT || '10', 10);
const historyLimit = parseInt(process.env.TELEGRAM_HISTORY_LIMIT || '50', 10);
const startupHistoryContactLimit = parseInt(process.env.TELEGRAM_STARTUP_HISTORY_CONTACT_LIMIT || '25', 10);
const startupHistoryDelayMs = parseInt(process.env.TELEGRAM_STARTUP_HISTORY_DELAY_MS || '250', 10);
const allowedUsers = process.env.TELEGRAM_ALLOWED_USERS
  ? process.env.TELEGRAM_ALLOWED_USERS.split(',').map((s) => s.trim()).filter(Boolean)
  : null;

if (!apiId || !apiHash) {
  console.error('❌ TELEGRAM_API_ID and TELEGRAM_API_HASH required in .env');
  console.error('   Get them from https://my.telegram.org → API development tools');
  process.exit(1);
}

if (!sessionString) {
  console.error('❌ TELEGRAM_SESSION required. Run: npm run telegram:login');
  process.exit(1);
}

const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
  connectionRetries: 10,
  reconnectRetries: Number.POSITIVE_INFINITY,
  autoReconnect: true,
  retryDelay: 2000,
});

let telegramChain = Promise.resolve();

function withTelegramLock<T>(fn: () => Promise<T>): Promise<T> {
  const task = telegramChain.then(fn, fn);
  telegramChain = task.then(() => undefined, () => undefined);
  return task;
}

const peerCache = new Map<string, Api.TypeInputPeer>();

async function getInputPeer(chatId: string) {
  if (peerCache.has(chatId)) return peerCache.get(chatId)!;
  const peer = await client.getInputEntity(chatId);
  peerCache.set(chatId, peer);
  return peer;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadTelegramHistory(chatId: string): Promise<HistoryMessage[]> {
  return withTelegramLock(async () => {
    try {
      const peer = await getInputPeer(chatId);
      const messages = await client.getMessages(peer, { limit: historyLimit });
      const history: HistoryMessage[] = [];

      for (const msg of [...messages].reverse()) {
        const text = msg.text?.trim();
        if (!text) continue;
        history.push({
          role: msg.out ? 'model' : 'user',
          parts: [{ text }],
        });
      }

      return history;
    } catch {
      return [];
    }
  });
}

function historyFromMessages(messages: Array<{ text?: string; out?: boolean; date?: number }>): {
  history: HistoryMessage[];
  firstMessageAt?: Date;
} {
  const history: HistoryMessage[] = [];
  let firstMessageAt: Date | undefined;

  for (const msg of [...messages].reverse()) {
    const text = msg.text?.trim();
    if (!text) continue;

    if (msg.date) {
      const msgDate = new Date(msg.date * 1000);
      if (!firstMessageAt || msgDate < firstMessageAt) {
        firstMessageAt = msgDate;
      }
    }

    history.push({
      role: msg.out ? 'model' : 'user',
      parts: [{ text }],
    });
  }

  return { history, firstMessageAt };
}

async function markIncomingRead(chatId: string, messageId: number) {
  const timing = getReplyTiming();
  const delay = randomBetween(timing.readMin, timing.readMax);
  if (delay > 0) await sleep(delay);

  void withTelegramLock(async () => {
    try {
      await client.markAsRead(chatId, messageId);
    } catch {
      // read receipts are optional
    }
  });
}

const { queueMessage, setHistory } = createAutoReplyHandler({
  async sendTyping(chatId) {
    await withTelegramLock(async () => {
      try {
        await client.invoke(
          new Api.messages.SetTyping({
            peer: await getInputPeer(chatId),
            action: new Api.SendMessageTypingAction(),
          })
        );
      } catch {
        // typing indicator is optional
      }
    });
  },
  async sendMessage(chatId, text) {
    await withTelegramLock(async () => {
      await client.sendMessage(chatId, { message: text });
    });
  },
  async sendSticker(chatId) {
    await withTelegramLock(async () => {
      const sticker = pickRandomSticker();
      if (!sticker) return;
      await client.sendFile(chatId, { file: sticker });
    });
  },
  async sendPhoto(chatId, category = 'casual') {
    return withTelegramLock(async () => {
      const photo = pickRandomPhoto(category);
      if (!photo) {
        console.warn(`AutoReply [${chatId}]: no photos in ${getPhotoDir()}/${category}`);
        return false;
      }
      await client.sendFile(chatId, { file: photo });
      return true;
    });
  },
  loadHistory: async (chatId) => {
    const loaded = await loadTelegramHistory(chatId);
    return loaded;
  },
});

function isPrivateChat(event: NewMessageEvent): boolean {
  return event.isPrivate === true;
}

function isAllowedSender(senderId: string): boolean {
  if (!allowedUsers) return true;
  return allowedUsers.includes(senderId);
}

function getEntityName(entity: unknown): string {
  if (!entity || typeof entity !== 'object') return '';

  const maybeUser = entity as {
    firstName?: string;
    lastName?: string;
    username?: string;
    title?: string;
  };

  const fullName = `${maybeUser.firstName || ''} ${maybeUser.lastName || ''}`.trim();
  return fullName || maybeUser.username || maybeUser.title || '';
}

function getChatName(chatId: string, entity?: unknown) {
  const name = getEntityName(entity);
  return name ? `tg:${chatId}:${name}` : `tg:${chatId}`;
}

async function handleIncomingMessage(event: NewMessageEvent) {
  const message = event.message;

  if (message.out) return;
  if (!message.text?.trim()) return;

  if (!replyGroups && !isPrivateChat(event)) {
    return;
  }

  const chatId = event.chatId?.toString();
  if (!chatId) return;

  const senderId = message.senderId?.toString() || chatId;
  if (!isAllowedSender(senderId)) return;

  let chatName = `tg:${chatId}`;
  try {
    const sender = await message.getSender();
    chatName = getChatName(chatId, sender);
  } catch {
    // use default chatName
  }

  console.log(`📩 Incoming from ${chatName}: "${message.text.substring(0, 50)}..."`);

  if (message.id) {
    void markIncomingRead(chatId, message.id);
  }

  queueMessage(chatId, message.text, chatName);
}

async function preloadHistoriesOnStartup(dialogs: Awaited<ReturnType<typeof client.getDialogs>>) {
  try {
    let loadedChats = 0;
    let scannedDialogs = 0;

    for (const dialog of dialogs) {
      if (!replyGroups && !dialog.isUser) continue;

      const chatId = dialog.id?.toString();
      if (!chatId) continue;
      if (dialog.isUser && !isAllowedSender(chatId)) continue;
      if (startupHistoryContactLimit > 0 && scannedDialogs >= startupHistoryContactLimit) break;

      scannedDialogs++;
      try {
        const messages = await withTelegramLock(async () =>
          client.getMessages(dialog.inputEntity, { limit: historyLimit })
        );
        const chatName = getChatName(chatId, dialog.entity);
        const { history, firstMessageAt } = historyFromMessages(messages);

        if (history.length > 0) {
          setHistory(chatId, history, { chatName, firstMessageAt });
          loadedChats++;
        }

        await sleep(startupHistoryDelayMs);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`⚠️  Could not load history for ${chatId}: ${message}`);
      }
    }

    console.log(`📚 Loaded recent history for ${loadedChats} chat(s) on startup.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('⚠️  Could not preload startup histories:', message);
  }
}

async function queueUnreadMessagesOnStartup(dialogs: Awaited<ReturnType<typeof client.getDialogs>>) {
  try {
    let queuedChats = 0;
    let queuedMessages = 0;

    for (const dialog of dialogs) {
      if (!dialog.unreadCount) continue;
      if (!replyGroups && !dialog.isUser) continue;

      const chatId = dialog.id?.toString();
      if (!chatId) continue;

      if (dialog.isUser && !isAllowedSender(chatId)) continue;

      const limit = Math.min(dialog.unreadCount, startupUnreadLimit);
      const messages = await withTelegramLock(() =>
        client.getMessages(dialog.inputEntity, { limit, reverse: true })
      );
      const chatName = getChatName(chatId, dialog.entity);
      let latestMessageId = 0;
      let didQueue = false;

      for (const message of messages) {
        if (message.out || !message.text?.trim()) continue;

        latestMessageId = Math.max(latestMessageId, Number(message.id) || 0);
        queueMessage(chatId, message.text, chatName);
        didQueue = true;
        queuedMessages++;
      }

      if (didQueue) {
        queuedChats++;
        if (latestMessageId > 0) {
          void markIncomingRead(chatId, latestMessageId);
        }
      }
    }

    if (queuedMessages > 0) {
      console.log(`📬 Queued ${queuedMessages} unread startup message(s) from ${queuedChats} chat(s).`);
    } else {
      console.log('📭 No unread startup messages to answer.');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('⚠️  Could not check unread startup messages:', message);
  }
}

async function runStartupTasks() {
  try {
    const dialogs = await withTelegramLock(() => client.getDialogs({}));
    await preloadHistoriesOnStartup(dialogs);
    await queueUnreadMessagesOnStartup(dialogs);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('⚠️  Startup sync failed:', message);
  }
}

async function main() {
  console.log('📱 Starting Zuza Telegram user client (your account)...');
  console.log(`   Mode: ${replyGroups ? 'DMs + groups' : 'private chats only'}`);
  console.log(`   Reply speed: ${getReplySpeed()} (set TELEGRAM_REPLY_SPEED=instant|fast|normal in .env)`);
  console.log(`   Startup unread limit: ${startupUnreadLimit} message(s) per chat`);
  console.log(`   Chat history context: ${historyLimit} message(s)`);
  console.log(`   Startup history contacts: ${startupHistoryContactLimit > 0 ? startupHistoryContactLimit : 'all eligible'}`);
  console.log(`   Offline schedule: ${getOfflineScheduleSummary()}`);
  const offlineNotice = getStartupOfflineNotice();
  if (offlineNotice) console.log(`   ${offlineNotice}`);
  if (allowedUsers) console.log(`   Allowed senders: ${allowedUsers.join(', ')}`);

  await client.connect();

  if (!(await client.isUserAuthorized())) {
    console.error('❌ Session invalid or expired. Run: npm run telegram:login');
    process.exit(1);
  }

  const me = await client.getMe();
  console.log(`✅ Connected as ${me.firstName || ''} ${me.lastName || ''} (@${me.username || 'no username'})`);

  await initializeAI();
  const status = getAIStatus();
  if (status.isInitialized) {
    console.log(`✅ AI ready [${status.activeProvider}] mood: ${status.activeMood}`);
  } else {
    console.warn('⚠️  AI not initialized — configure API in dashboard (Settings tab)');
  }

  await refreshStickerPool(client);
  const photoCount = refreshPhotoPool();
  if (photoCount > 0) {
    console.log(`📷 Loaded ${photoCount} curated photo(s) from ${getPhotoDir()}`);
  } else {
    console.log(`📷 No curated photos yet — add images to ${getPhotoDir()}/casual/`);
  }

  setInterval(() => initializeAI(), 60_000);

  client.addEventHandler(handleIncomingMessage, new NewMessage({ incoming: true }));

  console.log('🚀 Listening for messages. Replies will be sent as YOU.');
  console.log('   Press Ctrl+C to stop.\n');

  void runStartupTasks();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

process.once('SIGINT', async () => {
  await client.disconnect();
  process.exit(0);
});
