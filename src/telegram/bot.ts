import { config } from 'dotenv';
import { Telegraf } from 'telegraf';
import { initializeAI, generateReply, getAIStatus } from '../lib/aiEngine';

config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('❌ TELEGRAM_BOT_TOKEN is required. Add it to your .env file.');
  console.error('   Get a token from @BotFather on Telegram.');
  process.exit(1);
}

const bot = new Telegraf(token);

type QueuedMessage = { text: string; chatName: string };
const messageQueues = new Map<number, QueuedMessage[]>();
const queueTimers = new Map<number, ReturnType<typeof setTimeout>>();
const processingChats = new Set<number>();

function getChatName(ctx: { from?: { first_name?: string; username?: string; id: number }; chat: { id: number } }) {
  const name = ctx.from?.first_name || ctx.from?.username || `user_${ctx.from?.id || ctx.chat.id}`;
  return `tg:${ctx.chat.id}:${name}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulateHumanTyping(chatId: number, text: string) {
  const readDelay = 1200 + Math.random() * 3500;
  await sleep(readDelay);

  const charMs = 35 + Math.random() * 45;
  const typingDuration = Math.max(text.length * charMs, 1000 + Math.random() * 1500);

  const chunkMs = 4000;
  let elapsed = 0;
  while (elapsed < typingDuration) {
    await bot.telegram.sendChatAction(chatId, 'typing');
    const wait = Math.min(chunkMs, typingDuration - elapsed);
    await sleep(wait);
    elapsed += wait;
  }
}

async function flushQueue(chatId: number) {
  if (processingChats.has(chatId)) return;

  const queue = messageQueues.get(chatId);
  if (!queue || queue.length === 0) return;

  processingChats.add(chatId);
  const batch = [...queue];
  messageQueues.set(chatId, []);

  const combinedText = batch.map((m) => m.text).join('. ');
  const chatName = batch[batch.length - 1].chatName;

  try {
    const status = getAIStatus();
    if (!status.isInitialized) {
      await initializeAI();
    }

    const result = await generateReply({
      text: combinedText,
      history: [],
      chatName,
    });

    if ('error' in result) {
      if (result.error === 'RATE_LIMIT_QUOTA') {
        await bot.telegram.sendMessage(chatId, 'brb quota exceeded lol give me a min');
      } else {
        console.error(`Telegram [${chatId}]: AI error:`, result.error);
      }
      return;
    }

    const reply = result.blocks[0];
    if (!reply) return;

    await simulateHumanTyping(chatId, reply);
    await bot.telegram.sendMessage(chatId, reply);
    console.log(`Telegram [${chatName}]: replied "${reply.substring(0, 60)}..."`);
  } catch (err) {
    console.error(`Telegram [${chatId}]: flush error:`, err);
  } finally {
    processingChats.delete(chatId);
    const remaining = messageQueues.get(chatId);
    if (remaining && remaining.length > 0) {
      scheduleFlush(chatId);
    }
  }
}

function scheduleFlush(chatId: number) {
  const existing = queueTimers.get(chatId);
  if (existing) clearTimeout(existing);

  const debounceMs = 3500 + Math.random() * 5500;
  const timer = setTimeout(() => {
    queueTimers.delete(chatId);
    flushQueue(chatId);
  }, debounceMs);

  queueTimers.set(chatId, timer);
}

function queueMessage(chatId: number, text: string, chatName: string) {
  const queue = messageQueues.get(chatId) || [];
  queue.push({ text, chatName });
  messageQueues.set(chatId, queue);
  scheduleFlush(chatId);
}

bot.start(async (ctx) => {
  const name = ctx.from?.first_name || 'there';
  await ctx.reply(`hey ${name} 👋 im zuza, just text me like a normal chat`);
});

bot.command('status', async (ctx) => {
  const status = getAIStatus();
  await ctx.reply(
    status.isInitialized
      ? `online ✨ provider: ${status.activeProvider}, mood: ${status.activeMood}`
      : 'offline — check api config in dashboard'
  );
});

bot.command('mood', async (ctx) => {
  const status = getAIStatus();
  await ctx.reply(`current mood: ${status.activeMood} (change in dashboard → Brain tab)`);
});

bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;

  const chatId = ctx.chat.id;
  const chatName = getChatName(ctx);
  queueMessage(chatId, ctx.message.text, chatName);
});

bot.catch((err) => {
  console.error('Telegram bot error:', err);
});

async function main() {
  console.log('🤖 Starting Zuza Telegram bot...');
  await initializeAI();

  const status = getAIStatus();
  if (status.isInitialized) {
    console.log(`✅ AI ready [${status.activeProvider}] mood: ${status.activeMood}`);
  } else {
    console.warn('⚠️  AI not initialized — configure API in dashboard (Settings tab)');
  }

  setInterval(() => initializeAI(), 60_000);

  await bot.launch();
  console.log('🚀 Telegram bot is running. Press Ctrl+C to stop.');

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
