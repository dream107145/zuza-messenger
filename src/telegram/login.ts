/**
 * One-time login — run: npm run telegram:login
 * Saves a session string you paste into .env as TELEGRAM_SESSION
 */
import { config } from 'dotenv';
import readline from 'readline';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';

config();

const apiId = parseInt(process.env.TELEGRAM_API_ID || '', 10);
const apiHash = process.env.TELEGRAM_API_HASH || '';

if (!apiId || !apiHash) {
  console.error('❌ Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env first.');
  console.error('   Get them from https://my.telegram.org → API development tools');
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

async function main() {
  const existing = process.env.TELEGRAM_SESSION || '';
  const client = new TelegramClient(new StringSession(existing), apiId, apiHash, {
    connectionRetries: 5,
  });

  console.log('\n📱 Telegram account login');
  console.log('   This links YOUR personal account (not a bot).\n');

  await client.start({
    phoneNumber: async () => ask('Phone number (with country code, e.g. +48123456789): '),
    password: async () => ask('2FA password (leave empty if none): '),
    phoneCode: async () => ask('Code from Telegram app/SMS: '),
    onError: (err) => console.error(err),
  });

  const session = client.session.save() as unknown as string;

  console.log('\n✅ Logged in successfully!\n');
  console.log('Add this to your .env file:\n');
  console.log(`TELEGRAM_SESSION=${session}\n`);
  console.log('Then run: npm run telegram:user\n');

  rl.close();
  await client.disconnect();
}

main().catch((err) => {
  console.error('Login failed:', err);
  process.exit(1);
});
