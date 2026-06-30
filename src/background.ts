/// <reference types="chrome" />
import { initializeAI, generateReply, getAIStatus } from './lib/aiEngine';

async function bootAI() {
  await initializeAI({
    onConfigCached: async (config) => {
      try {
        await chrome.storage.local.set({ ACTIVE_CONFIG: JSON.stringify(config) });
      } catch {
        // extension storage unavailable
      }
    },
    onPersonaCached: async (persona) => {
      try {
        await chrome.storage.local.set({ ACTIVE_PERSONA: persona });
      } catch {
        // extension storage unavailable
      }
    },
  });
}

async function bootAIWithCache() {
  let cachedConfig = '';
  let cachedPersona = '';

  try {
    const storage = await chrome.storage.local.get(['ACTIVE_CONFIG', 'ACTIVE_PERSONA']);
    cachedConfig = (storage.ACTIVE_CONFIG as string) || '';
    cachedPersona = (storage.ACTIVE_PERSONA as string) || '';
  } catch {
    // storage read failed
  }

  await initializeAI({
    cachedConfig,
    cachedPersona,
    onConfigCached: async (config) => {
      await chrome.storage.local.set({ ACTIVE_CONFIG: JSON.stringify(config) });
    },
    onPersonaCached: async (persona) => {
      await chrome.storage.local.set({ ACTIVE_PERSONA: persona });
    },
  });
}

bootAIWithCache();

chrome.runtime.onStartup.addListener(() => {
  bootAIWithCache();
});

chrome.runtime.onInstalled.addListener(() => {
  bootAIWithCache();
  chrome.alarms.create('keep-alive', { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keep-alive' && !getAIStatus().isInitialized) {
    bootAIWithCache();
  }
});

chrome.runtime.onMessage.addListener((request: Record<string, unknown>, _sender, sendResponse) => {
  const action = request.action as string;

  if (action === 'HEARTBEAT') {
    const status = getAIStatus();
    sendResponse({ status: 'alive', isInitialized: status.isInitialized });
    return true;
  }

  if (action === 'PROCESS_MESSAGE') {
    generateReply({
      text: request.text as string,
      history: request.history as Parameters<typeof generateReply>[0]['history'],
      chatName: request.chatName as string | undefined,
      imageUrls: request.imageUrls as string[] | undefined,
    }).then(sendResponse);
    return true;
  }

  if (action === 'GET_STATUS') {
    sendResponse(getAIStatus());
    return true;
  }

  if (action === 'CONFIG_UPDATED') {
    bootAI().then(() => sendResponse({ success: true }));
    return true;
  }
});

chrome.runtime.onMessageExternal.addListener((request: Record<string, unknown>, _sender, sendResponse) => {
  const action = request.action as string;

  if (action === 'HEARTBEAT') {
    const status = getAIStatus();
    sendResponse({ status: 'alive', isInitialized: status.isInitialized });
    return true;
  }

  if (action === 'GET_STATUS') {
    sendResponse(getAIStatus());
    return true;
  }

  if (action === 'CONFIG_UPDATED') {
    bootAI().then(() => sendResponse({ success: true }));
    return true;
  }
});
