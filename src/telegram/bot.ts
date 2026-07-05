/**
 * Telegram BOT mode (@BotFather) — shows "BOT" badge on your profile.
 * For personal account (no bot badge), use: npm run telegram:user
 */
import { config } from 'dotenv';
import { Telegraf } from 'telegraf';
import { initializeAI, getAIStatus } from '../lib/aiEngine';
import { createAutoReplyHandler } from './messageHandler';

config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('❌ TELEGRAM_BOT_TOKEN is required for bot mode.');
  console.error('   For your personal account (stealth), use: npm run telegram:user');
  process.exit(1);
}

const bot = new Telegraf(token);

function getChatName(ctx: { from?: { first_name?: string; username?: string; id: number }; chat: { id: number } }) {
  const name = ctx.from?.first_name || ctx.from?.username || `user_${ctx.from?.id || ctx.chat.id}`;
  return `tg:${ctx.chat.id}:${name}`;
}

const { queueMessage } = createAutoReplyHandler({
  sendTyping: async (chatId) => { await bot.telegram.sendChatAction(chatId, 'typing'); },
  sendMessage: async (chatId, text) => { await bot.telegram.sendMessage(chatId, text); },
});

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

bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;
  queueMessage(String(ctx.chat.id), ctx.message.text, getChatName(ctx));
});

bot.catch((err) => console.error('Telegram bot error:', err));

async function main() {
  console.log('🤖 Starting Telegram BOT mode (visible bot badge)...');
  console.log('   For stealth personal account: npm run telegram:user\n');

  await initializeAI();
  const status = getAIStatus();
  if (status.isInitialized) {
    console.log(`✅ AI ready [${status.activeProvider}] mood: ${status.activeMood}`);
  } else {
    console.warn('⚠️  AI not initialized — configure API in dashboard');
  }

  setInterval(() => initializeAI(), 60_000);
  await bot.launch();
  console.log('🚀 Bot running. Press Ctrl+C to stop.');

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
