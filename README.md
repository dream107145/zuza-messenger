# AutoMessenger (Zuza Agent)

AI chat persona **Zuza** — a fun, human-like 19-year-old who replies in **English**. Available as:

- **Telegram bot** — run a bot that auto-replies on Telegram (recommended)
- **Chrome extension** — auto-replies on Facebook Messenger

Includes a **React dashboard** for configuration, mood switching, and activity logs — backed by **Supabase** for settings and **SQLite** for per-contact long-term memory.

---

## Features

- **Telegram bot** — message Zuza on Telegram with human-like typing delays
- **Messenger extension** — detects incoming Facebook messages and auto-replies
- **Human-like behavior** — random read/typing delays, debounced message batching, casual texting
- **English only** — always replies in English
- **Very fun personality** — witty, chaotic, playful (normal mood)
- **Three moods** — `normal` (fun & witty), `freaky` (flirty), `cold` (dry & dismissive)
- **Multiple AI providers** — Google Gemini, OpenAI, or local models (Ollama / LM Studio)
- **Per-contact memory** — optional SQLite server remembers conversation history per chat
- **Live dashboard** — view logs, switch moods, configure API keys

---

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │         src/lib/aiEngine.ts         │
                    │   (shared AI: prompts, LLM calls)   │
                    └──────────────┬──────────────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          ▼                        ▼                        ▼
  src/telegram/bot.ts      src/background.ts          src/App.tsx
  (Telegram bot)           (Chrome extension)         (Dashboard)
          │                        │
          ▼                        ▼
   Telegram API            Messenger DOM (content.js)
          │                        │
          └────────────┬───────────┘
                       ▼
              Supabase (config, logs)
              localhost:11435 (SQLite memory, optional)
```

| Component | File | Role |
|-----------|------|------|
| **AI engine** | `src/lib/aiEngine.ts` | Shared LLM logic, prompts, memory, logging |
| **Telegram bot** | `src/telegram/bot.ts` | Telegram long-polling bot with typing simulation |
| Content script | `src/content.ts` → `public/content.js` | Scrapes Messenger, sends messages to background |
| Background worker | `src/background.ts` → `public/background.js` | Chrome extension bridge to aiEngine |
| Dashboard | `src/App.tsx` | Web UI for settings, moods, and logs |
| Memory server | `sqlite_server.js` | Local SQLite store for per-contact chat history |
| Persona prompts | `src/config/prompts/` | Mood-specific system prompts for Zuza |

---

## Prerequisites

- **Node.js** 18+ and npm
- An **AI API key** (Gemini or OpenAI) **or** a local **Ollama** install
- **Supabase project** (for dashboard config & logs)
- For **Telegram**: a bot token from [@BotFather](https://t.me/BotFather)
- For **Messenger extension**: Google Chrome (or Chromium-based browser)

---

## Installation

### 1. Clone and install dependencies

```bash
git clone <your-repo-url>
cd automessage
npm install
```

### 2. Environment variables

Copy the example env file and fill in your credentials:

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
```

The extension background worker uses Supabase credentials baked in at build time via `bundle.cjs`. Rebuild after changing those if you use your own Supabase project.

---

## Telegram — personal account (stealth, recommended)

Replies are sent **from your real Telegram account**. No "BOT" badge — other people see normal messages from you.

### 1. Get API credentials

1. Go to [my.telegram.org](https://my.telegram.org) and log in
2. Open **API development tools**
3. Create an app (any name)
4. Copy **api_id** and **api_hash** into `.env`:

```env
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=your-api-hash
```

### 2. Log in once (save session)

```bash
npm run telegram:login
```

Enter your phone number, SMS/app code, and 2FA password if you have one.

Copy the printed `TELEGRAM_SESSION=...` line into `.env`.

### 3. Configure AI (dashboard)

```bash
npm run dev
```

Open `http://localhost:5173` → **Settings** → API key + model → **DEPLOY CONFIGURATION**.

### 4. Run

```bash
npm run memory          # optional — conversation memory
npm run telegram:user     # start as YOUR account
```

When someone DMs you on Telegram, Zuza replies **as you** with typing delays.

**Stealth settings in `.env`:**

| Variable | Default | Description |
|----------|---------|-------------|
| `TELEGRAM_REPLY_GROUPS` | `false` | Only private DMs (recommended). Set `true` for groups too. |
| `TELEGRAM_ALLOWED_USERS` | (empty) | Comma-separated user IDs — only reply to these people |

> **Warning:** Automating a user account may violate Telegram's Terms of Service and can risk account restrictions. Use at your own risk. Private DMs only is safer than groups.

---

## Telegram — bot mode (visible BOT badge)

Use this only if you want a separate `@YourBot` account (people will see it's a bot).

### 1. Create a bot

1. Open [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts
3. Copy the token into `.env` as `TELEGRAM_BOT_TOKEN`

### 2. Run

```bash
npm run telegram
```

**Bot commands:** `/start`, `/status`

---

## Messenger extension

### 1. Build the extension

```bash
npm run bundle
```

This compiles `src/content.ts` and `src/background.ts` into `public/content.js` and `public/background.js`.

### 2. Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `public/` folder

You should see **Zuza Messenger Agent** in your extensions list.

---

## Quick start (daily usage)

### Step 1 — Start the memory server (recommended)

Long-term per-contact memory is optional but improves conversation continuity:

```bash
npm run memory
```

Keep this terminal open. The server runs at `http://localhost:11435`.

> If the memory server is offline, the bot still works — it just uses only the last ~10 messages visible in the Messenger DOM.

### Step 2 — Start the dashboard (optional)

```bash
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`). Use the dashboard to:

- Configure your AI provider and API key
- Switch Zuza's mood
- Monitor incoming/outgoing message logs

### Step 3 — Configure AI in the dashboard

1. Go to the **Settings** tab
2. Choose a provider:
   - **Google Gemini** — paste your API key, set model e.g. `gemini-1.5-flash`
   - **OpenAI** — paste your API key, set model e.g. `gpt-4o-mini`
   - **Local AI** — set endpoint e.g. `http://localhost:11434/v1`, model e.g. `llama3.2` or `dolphin-llama3`
3. Click **DEPLOY CONFIGURATION**
4. Confirm the status bar shows **Worker Active**

### Step 4 — Open Messenger

1. Go to [messenger.com](https://www.messenger.com) and log in
2. Open a chat conversation
3. Wait for the **status dot** (top-left of the page):
   - **Green** — idle, watching for messages
   - **Yellow** — message queued, waiting for follow-ups
   - **Cyan** — generating/sending a reply
   - **Red** — error
   - **Orange** — worker offline or rate-limited

When someone sends you a message, Zuza will:

1. Wait 3.5–9 seconds (debounce — batches rapid messages)
2. Pause 1–5 seconds (simulated “reading”)
3. “Type” for a duration based on message length
4. Paste the reply and click Send

---

## Dashboard guide

### Logs tab

Shows the last 20 AI interactions from Supabase:

- **Incoming message** — what the other person wrote
- **AI Response** — what Zuza replied

Updates in real time when new messages are processed.

### Brain tab

Switch Zuza's personality mood. Only one persona should be `enabled` in Supabase; the active mood is stored in `social_style`.

| Mood | Button label | Behavior |
|------|--------------|----------|
| `normal` | normal | Fun, chaotic, witty bestie energy. Short casual replies. English only. |
| `freaky` | seksualny | Flirty, passionate, teasing. For intimate chats. |
| `cold` | cold | Dry, dismissive, 1-word replies. Ignores boring questions. |

Click a mood button — it saves to Supabase and notifies the extension background worker immediately.

### Settings tab

| Field | Description |
|-------|-------------|
| **AI Service Provider** | `gemini`, `openai`, or `local` |
| **Secret API Key / Endpoint** | API key for cloud providers, or base URL for local (e.g. `http://localhost:11434/v1`) |
| **LLM Model Target** | Model name passed to the API (e.g. `gemini-1.5-flash`, `gpt-4o-mini`, `dolphin-llama3`) |

---

## AI provider setup

### Google Gemini (recommended)

1. Get an API key from [Google AI Studio](https://aistudio.google.com/apikey)
2. Dashboard → Settings → Provider: **Google Gemini**
3. API Key: your key
4. Model: `gemini-1.5-flash` or `gemini-2.0-flash`
5. Deploy

Gemini uses the native SDK with safety filters disabled for unrestricted persona replies.

### OpenAI

1. Get an API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. Dashboard → Settings → Provider: **OpenAI**
3. Model: `gpt-4o-mini`, `gpt-4o`, etc.
4. Deploy

### Local AI (Ollama)

1. Install [Ollama](https://ollama.com) and pull a model:

```bash
ollama pull llama3.2
# or for uncensored persona use:
ollama pull dolphin-llama3
```

2. Ensure Ollama is running (`ollama serve` — usually starts automatically)
3. Dashboard → Settings → Provider: **Local AI**
4. Endpoint: `http://localhost:11434/v1`
5. Model: `llama3.2` or `dolphin-llama3`
6. Deploy

For vision/image messages with local models, use a multimodal model like `llava`.

---

## Memory system

The SQLite memory server stores conversation history **per contact name** (parsed from the Messenger chat header).

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/memory?name=ContactName` | GET | Fetch last 100 messages for a contact |
| `/memory` | POST | Save a message `{ name, role, text }` |

**Commands:**

```bash
# Start memory server
npm run memory

# Wipe ALL conversation memory
npm run wipe-memory

# Wipe memory for one contact only
npm run purge-session "Contact Name"
```

**Reset memory + rebuild extension:**

```bash
npm run reset-build
```

This wipes SQLite, rebuilds `content.js` and `background.js`, and is useful after prompt changes.

---

## Customizing Zuza's personality

Mood prompts live in:

```
src/config/prompts/
  normal.ts   ← default fun/casual personality
  freaky.ts   ← flirty mode
  cold.ts     ← dismissive mode
```

Register new moods in `src/config/aiModes.ts` and add a button in `src/App.tsx` (Brain tab).

After editing prompts:

```bash
node bundle.cjs
# or
npm run reset-build
```

Then reload the extension in `chrome://extensions`.

> **Note:** The extension loads prompts from code via `social_style` (mood id). The `system_prompt` field in Supabase is not used by the active extension path.

---

## npm scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `npm run dev` | Start Vite dashboard at localhost:5173 |
| `build` | `npm run build` | Type-check and build dashboard for production |
| `lint` | `npm run lint` | Run ESLint |
| `memory` | `npm run memory` | Start SQLite memory server on port 11435 |
| `wipe-memory` | `npm run wipe-memory` | Delete all stored conversation memory |
| `purge-session` | `npm run purge-session "Name"` | Delete memory for one contact |
| `telegram:user` | `npm run telegram:user` | **Run as your personal account** (stealth, no bot badge) |
| `telegram:login` | `npm run telegram:login` | One-time login to get `TELEGRAM_SESSION` |
| `telegram` | `npm run telegram` | Run @BotFather bot (visible BOT badge) |
| `bundle` | `npm run bundle` | Rebuild Chrome extension (`content.js` + `background.js`) |

| `reset-build` | `npm run reset-build` | Wipe memory + rebuild extension bundle |

**Extension bundle only:**

```bash
npm run bundle
```

---

## Project structure

```
automessage/
├── src/
│   ├── lib/
│   │   └── aiEngine.ts      # Shared AI engine (Telegram + extension)
│   ├── telegram/
│   │   └── bot.ts             # Telegram bot entry point
│   ├── content.ts             # Messenger DOM scraper
│   ├── background.ts          # Extension bridge to aiEngine
│   ├── App.tsx                # Dashboard UI
│   └── config/prompts/        # Zuza personality prompts
├── public/                    # Chrome extension (load unpacked)
├── sqlite_server.js           # Local memory API
├── bundle.cjs                 # esbuild bundler for extension
└── package.json
```

---

## How messaging works (technical)

1. **DOM scraper** (`content.ts`) uses a `MutationObserver` on Messenger's chat area
2. New **incoming** bubbles (left-aligned) are detected; outgoing bubbles are ignored
3. Messages are **debounced** (3.5–9 s) so rapid-fire texts become one prompt
4. Last ~10 visible messages are sent as conversation history
5. **Background worker** loads active API config + mood from Supabase
6. If memory server is up, long-term history for that contact is merged in
7. LLM generates a reply; post-processing removes AI artifacts and humanizes text
8. Reply is pasted into Messenger's Lexical editor and Send is clicked
9. Interaction is logged to Supabase `logs` table

**Status indicator** (fixed dot, top-left of Messenger page):

| Color | Meaning |
|-------|---------|
| Green | Ready |
| Yellow | Message queued |
| Cyan | Processing / typing |
| Orange | Worker offline or quota exceeded |
| Red | Error |

---

## Supabase tables

The dashboard and extension expect these tables:

### `api_configs`

| Column | Type | Description |
|--------|------|-------------|
| `provider` | text | `gemini`, `openai`, or `local` |
| `api_key` | text | API key or local endpoint URL |
| `model_name` | text | Model identifier |
| `is_active` | boolean | Only one should be active |

### `personas`

| Column | Type | Description |
|--------|------|-------------|
| `name` | text | Display name (e.g. Zuza) |
| `social_style` | text | Mood id: `normal`, `freaky`, or `cold` |
| `system_prompt` | text | Unused by extension (prompts come from code) |
| `enabled` | boolean | Active persona flag |

### `logs`

| Column | Type | Description |
|--------|------|-------------|
| `message` | text | Incoming user message |
| `response` | text | AI reply |
| `persona_id` | uuid | Reference to persona |
| `llm_model` | text | Model used |
| `created_at` | timestamp | When it happened |

---

## Troubleshooting

### Bot doesn't respond on Telegram

- Check `TELEGRAM_BOT_TOKEN` in `.env` is correct
- Run `npm run telegram` and look for errors in the terminal
- Send `/status` to the bot — should show `online`
- Configure API key in dashboard → Settings → Deploy

### Status dot stays red or orange (Messenger)

- Reload the extension at `chrome://extensions`
- Open the dashboard and confirm **Worker Active** in the status bar
- Check that API key/model are saved in Settings
- Open Chrome DevTools → **Service Worker** (under the extension) for error logs

### Bot doesn't reply

- Refresh the Messenger tab after loading/reloading the extension
- Make sure you're in an **open chat** (not the inbox list)
- Green dot must be visible — if not, content script didn't inject
- Check that incoming messages appear with a **green border** (debug overlay on detected bubbles)

### "RATE_LIMIT_QUOTA" / orange dot for 60 seconds

- API quota exceeded — wait or switch provider/model
- For Gemini free tier, try `gemini-1.5-flash` instead of Pro

### Replies feel robotic

- Use **normal** mood for fun/casual tone
- Try a more conversational model (Gemini Flash, `dolphin-llama3` for local)
- Edit prompts in `src/config/prompts/` and rebuild

### Memory not persisting

- Ensure `npm run memory` is running
- Check `database.sqlite` exists in the project root
- Contact name must match Messenger chat header (visible in console logs)

### Extension context invalidated

- The content script auto-reloads the page when the extension is updated
- After `node bundle.cjs`, always click **Reload** on the extension

### Dashboard can't reach extension worker

- The dashboard uses extension ID `abgidjgfikicidkkjfmdhnokmkbfplpl` — if you load a different unpacked copy, the ID changes and status won't sync (config still works via Supabase)

---

## Development workflow

```bash
# Terminal 1 — memory server (optional)
npm run memory

# Terminal 2 — Telegram bot
npm run telegram

# OR Terminal 2 — dashboard
npm run dev

# After changing content.ts, background.ts, aiEngine.ts, or prompts:
npm run bundle

# Then reload extension + refresh Messenger tab (extension only)
```

**Production dashboard build:**

```bash
npm run build
npm run preview
```

---

## Security notes

- API keys are stored in Supabase and cached in `chrome.storage.local`
- Do not commit `.env` files with real credentials
- The extension requests access to `messenger.com`, `facebook.com`, and your configured AI endpoints
- Use at your own risk — automated messaging may violate platform terms of service

---

## License

Private project. All rights reserved unless otherwise specified.
