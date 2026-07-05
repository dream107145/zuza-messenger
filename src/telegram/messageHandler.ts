import {
  generateReply,
  getAIStatus,
  initializeAI,
  type HistoryMessage,
} from '../lib/aiEngine';
import { registerFirstContact } from '../lib/contactMemory';
import {
  clearReplyDelay,
  getOfflineExcuse,
  getReplyDelayUntil,
  hasPendingReplyDelay,
  logReplyDelayOnce,
  shouldSkipProactiveWhileOffline,
} from '../config/offlineSchedule';
import { parsePhotoToken } from './photos';
import { getReplyTiming, randomBetween } from './replyTiming';

const STICKER_TOKEN = /^\[sticker\]$/i;

type QueuedMessage = { text: string; chatName: string };

const MAX_CACHED_HISTORY = 40;
const PROACTIVE_FOLLOWUP_ENABLED = process.env.TELEGRAM_PROACTIVE_FOLLOWUP !== 'false';
const PROACTIVE_MIN_MINUTES = parseFloat(process.env.TELEGRAM_PROACTIVE_MIN_MINUTES || '45');
const PROACTIVE_MAX_MINUTES = parseFloat(process.env.TELEGRAM_PROACTIVE_MAX_MINUTES || '90');
const PROACTIVE_MAX_PER_CHAT = parseInt(process.env.TELEGRAM_PROACTIVE_MAX_PER_CHAT || '2', 10);

export type AutoReplyTransport = {
  sendTyping: (chatId: string) => Promise<void>;
  sendMessage: (chatId: string, text: string) => Promise<void>;
  sendSticker?: (chatId: string) => Promise<void>;
  sendPhoto?: (chatId: string, category?: string) => Promise<boolean>;
  loadHistory?: (chatId: string, chatName: string) => Promise<HistoryMessage[]>;
};

export type SetHistoryOptions = {
  chatName?: string;
  firstMessageAt?: string | Date;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trimHistory(history: HistoryMessage[]) {
  return history.slice(-MAX_CACHED_HISTORY);
}

function appendToHistory(
  history: HistoryMessage[],
  role: 'user' | 'model',
  text: string
): HistoryMessage[] {
  return trimHistory([...history, { role, parts: [{ text }] }]);
}

export function createAutoReplyHandler(transport: AutoReplyTransport) {
  const messageQueues = new Map<string, QueuedMessage[]>();
  const queueTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const processingChats = new Set<string>();
  const chatMessageCounts = new Map<string, number>();
  const chatHistories = new Map<string, HistoryMessage[]>();
  const proactiveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const proactiveCounts = new Map<string, number>();
  const delayedForOffline = new Set<string>();

  async function runTypingLoop(chatId: string, until: () => boolean) {
    const timing = getReplyTiming();
    if (!timing.typingWhileGenerating) return;

    while (until()) {
      await transport.sendTyping(chatId);
      await sleep(3500);
    }
  }

  async function simulatePostReplyTyping(chatId: string, text: string) {
    const timing = getReplyTiming();
    if (timing.readMax > 0) {
      await sleep(randomBetween(timing.readMin, timing.readMax));
    }

    const charMs = randomBetween(timing.charMsMin, timing.charMsMax);
    const typingDuration = Math.min(
      Math.max(text.length * charMs, timing.typingMin),
      timing.typingMax
    );

    if (typingDuration <= 0) return;

    const chunkMs = 3000;
    let elapsed = 0;
    while (elapsed < typingDuration) {
      await transport.sendTyping(chatId);
      const wait = Math.min(chunkMs, typingDuration - elapsed);
      await sleep(wait);
      elapsed += wait;
    }
  }

  async function sendBlocks(
    chatId: string,
    chatName: string,
    blocks: string[]
  ): Promise<string[]> {
    const timing = getReplyTiming();
    const sentParts: string[] = [];

    for (const block of blocks) {
      const photoToken = parsePhotoToken(block);
      if (photoToken.isPhoto) {
        if (transport.sendPhoto) {
          if (!timing.typingWhileGenerating && sentParts.length === 0) {
            await simulatePostReplyTyping(chatId, 'photo');
          }
          const sent = await transport.sendPhoto(chatId, photoToken.category);
          if (sent) sentParts.push(`[photo:${photoToken.category}]`);
        }
        continue;
      }

      if (STICKER_TOKEN.test(block.trim())) {
        if (transport.sendSticker) {
          if (!timing.typingWhileGenerating && sentParts.length === 0) {
            await simulatePostReplyTyping(chatId, 'sticker');
          }
          await transport.sendSticker(chatId);
          sentParts.push('[sticker]');
        }
        continue;
      }

      if (!timing.typingWhileGenerating && sentParts.length === 0) {
        await simulatePostReplyTyping(chatId, block);
      }

      await transport.sendMessage(chatId, block);
      sentParts.push(block);
    }

    if (sentParts.length > 0) {
      console.log(`AutoReply [${chatName}]: sent "${sentParts.join('\n').substring(0, 60)}..."`);
    }

    return sentParts;
  }

  function clearProactiveFollowUp(chatId: string) {
    const timer = proactiveTimers.get(chatId);
    if (timer) clearTimeout(timer);
    proactiveTimers.delete(chatId);
  }

  function scheduleProactiveFollowUp(chatId: string, chatName: string) {
    if (!PROACTIVE_FOLLOWUP_ENABLED) return;
    if (PROACTIVE_MAX_PER_CHAT <= 0) return;
    if (shouldSkipProactiveWhileOffline()) return;
    if ((proactiveCounts.get(chatId) || 0) >= PROACTIVE_MAX_PER_CHAT) return;

    clearProactiveFollowUp(chatId);

    const minMs = Math.max(1, PROACTIVE_MIN_MINUTES) * 60_000;
    const maxMs = Math.max(PROACTIVE_MIN_MINUTES, PROACTIVE_MAX_MINUTES) * 60_000;
    const delayMs = randomBetween(minMs, maxMs);

    const timer = setTimeout(() => {
      proactiveTimers.delete(chatId);
      void sendProactiveFollowUp(chatId, chatName);
    }, delayMs);

    proactiveTimers.set(chatId, timer);
  }

  async function sendProactiveFollowUp(chatId: string, chatName: string) {
    if (shouldSkipProactiveWhileOffline()) {
      scheduleProactiveFollowUp(chatId, chatName);
      return;
    }

    if (processingChats.has(chatId)) {
      scheduleProactiveFollowUp(chatId, chatName);
      return;
    }

    const queue = messageQueues.get(chatId);
    if (queue && queue.length > 0) return;

    try {
      const status = getAIStatus();
      if (!status.isInitialized) {
        await initializeAI();
      }

      let history = chatHistories.get(chatId) || [];
      if (transport.loadHistory && history.length === 0) {
        const loaded = await transport.loadHistory(chatId, chatName);
        if (loaded.length > 0) history = loaded;
      }

      const result = await generateReply({
        text: 'they have been silent for a while. send one short natural follow-up message',
        history,
        chatName,
        messageCount: chatMessageCounts.get(chatId) || history.filter((msg) => msg.role === 'user').length,
        proactive: true,
      });

      if ('error' in result) {
        if (result.error !== 'RATE_LIMIT_QUOTA' && result.error !== 'AI_NETWORK_ERROR') {
          console.error(`AutoReply [${chatId}]: proactive AI error:`, result.error);
        }
        return;
      }

      const blocks = result.blocks.filter((block) => block.trim());
      if (blocks.length === 0) return;

      const sentParts = await sendBlocks(chatId, chatName, blocks);
      if (sentParts.length === 0) return;

      const historyReply = sentParts.join('\n');
      chatHistories.set(chatId, appendToHistory(history, 'model', historyReply));
      proactiveCounts.set(chatId, (proactiveCounts.get(chatId) || 0) + 1);

      if ((proactiveCounts.get(chatId) || 0) < PROACTIVE_MAX_PER_CHAT) {
        scheduleProactiveFollowUp(chatId, chatName);
      }
    } catch (err) {
      console.error(`AutoReply [${chatId}]: proactive follow-up error:`, err);
    }
  }

  async function flushQueue(chatId: string) {
    if (processingChats.has(chatId)) {
      scheduleFlush(chatId);
      return;
    }

    const queue = messageQueues.get(chatId);
    if (!queue || queue.length === 0) return;

    processingChats.add(chatId);
    const batch = [...queue];
    messageQueues.set(chatId, []);

    const combinedText = batch.map((m) => m.text).join('. ');
    const chatName = batch[batch.length - 1].chatName;
    const shouldPrependExcuse = delayedForOffline.has(chatId) || hasPendingReplyDelay(chatId);
    delayedForOffline.delete(chatId);
    clearReplyDelay(chatId);

    let stillGenerating = true;
    const typingTask = runTypingLoop(chatId, () => stillGenerating);

    try {
      const status = getAIStatus();
      if (!status.isInitialized) {
        await initializeAI();
      }

      let history = chatHistories.get(chatId) || [];
      if (transport.loadHistory && history.length === 0) {
        try {
          const loaded = await transport.loadHistory(chatId, chatName);
          if (loaded.length > 0) {
            history = loaded;
          }
        } catch (err) {
          console.warn(`AutoReply [${chatId}]: could not load chat history:`, err);
        }
      }

      console.log(`🤖 AutoReply [${chatName}]: generating reply...`);

      const result = await generateReply({
        text: combinedText,
        history,
        chatName,
        messageCount: chatMessageCounts.get(chatId) || batch.length,
      });

      stillGenerating = false;
      await typingTask;

      if ('error' in result) {
        if (result.error === 'RATE_LIMIT_QUOTA' || result.error === 'AI_NETWORK_ERROR') {
          await transport.sendMessage(chatId, 'brb give me a min');
        } else {
          console.error(`AutoReply [${chatId}]: AI error:`, result.error);
        }
        return;
      }

      let blocks = result.blocks.filter((block) => block.trim());
      if (blocks.length === 0) {
        console.warn(`AutoReply [${chatName}]: AI returned empty response`);
        return;
      }

      if (shouldPrependExcuse && blocks[0] && !/^\[(sticker|photo)/i.test(blocks[0])) {
        blocks = [`${getOfflineExcuse()} ${blocks[0]}`, ...blocks.slice(1)];
      }

      const sentParts = await sendBlocks(chatId, chatName, blocks);
      if (sentParts.length === 0) return;

      const historyReply = sentParts.join('\n');
      chatHistories.set(
        chatId,
        appendToHistory(appendToHistory(history, 'user', combinedText), 'model', historyReply)
      );
      scheduleProactiveFollowUp(chatId, chatName);
    } catch (err) {
      stillGenerating = false;
      console.error(`AutoReply [${chatId}]: flush error:`, err);
    } finally {
      stillGenerating = false;
      processingChats.delete(chatId);
      const remaining = messageQueues.get(chatId);
      if (remaining && remaining.length > 0) {
        scheduleFlush(chatId);
      }
    }
  }

  function scheduleFlush(chatId: string) {
    const existing = queueTimers.get(chatId);
    if (existing) clearTimeout(existing);

    const timing = getReplyTiming();
    let debounceMs = randomBetween(timing.debounceMin, timing.debounceMax);
    const offlineDelayMs = getReplyDelayUntil(chatId);
    const queue = messageQueues.get(chatId) || [];
    const chatName = queue[queue.length - 1]?.chatName || chatId;

    if (offlineDelayMs > 0) {
      debounceMs = Math.max(debounceMs, offlineDelayMs);
      delayedForOffline.add(chatId);
      logReplyDelayOnce(chatId, chatName, offlineDelayMs);
    }

    const timer = setTimeout(() => {
      queueTimers.delete(chatId);
      void flushQueue(chatId);
    }, debounceMs);

    queueTimers.set(chatId, timer);
  }

  function queueMessage(chatId: string, text: string, chatName: string) {
    clearProactiveFollowUp(chatId);
    proactiveCounts.set(chatId, 0);

    const queue = messageQueues.get(chatId) || [];
    queue.push({ text, chatName });
    messageQueues.set(chatId, queue);
    chatMessageCounts.set(chatId, (chatMessageCounts.get(chatId) || 0) + 1);
    void registerFirstContact(chatName);
    scheduleFlush(chatId);
  }

  function setHistory(chatId: string, history: HistoryMessage[], options: SetHistoryOptions = {}) {
    chatHistories.set(chatId, trimHistory(history));
    const userMessages = history.filter((msg) => msg.role === 'user').length;
    if (userMessages > 0) {
      chatMessageCounts.set(chatId, userMessages);
    }

    if (options.chatName) {
      void registerFirstContact(options.chatName, options.firstMessageAt);
    }
  }

  return { queueMessage, setHistory };
}
