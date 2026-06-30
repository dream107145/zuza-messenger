(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/content.ts
  var HEARTBEAT = "background: #512da8; color: #fff; border-radius: 4px; padding: 2px 6px; font-weight: bold;";
  console.log("%c [ZUZA-E2EE-OBSERVER-INIT] Active ", HEARTBEAT);
  var indicator = document.createElement("div");
  indicator.id = "zuza-status-dot";
  indicator.style.cssText = "position:fixed; top:10px; left:10px; width:12px; height:12px; background:red; border-radius:50%; z-index:999999; border:2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5); pointer-events:none;";
  var appendIndicator = () => {
    if (!document.getElementById("zuza-status-dot")) {
      document.documentElement.appendChild(indicator);
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", appendIndicator);
  } else {
    appendIndicator();
  }
  var DOMScraper = class {
    constructor() {
      __publicField(this, "observer", null);
      __publicField(this, "lastMissingLog", 0);
      __publicField(this, "lastChatName", "");
      __publicField(this, "isProcessing", false);
      __publicField(this, "IGNORE_LIST", ["wys\u0142ano", "wy\u015Bwietlono", "dostarczono", "sent", "seen", "delivered", "seen at", "widziane"]);
      __publicField(this, "messageQueue", []);
      __publicField(this, "queueTimeout", null);
      __publicField(this, "initialAbsorbDone", false);
      __publicField(this, "knownSequence", []);
    }
    start() {
      indicator.style.background = "#00ff00";
      indicator.style.boxShadow = "0 0 10px #00ff00";
      setInterval(() => this.scan(), 2e3);
      setInterval(() => {
        try {
          chrome.runtime.sendMessage({ action: "HEARTBEAT" });
        } catch (e) {
        }
      }, 2e4);
      this.observer = new MutationObserver(() => this.scan());
      this.observer.observe(document.body, { childList: true, subtree: true });
    }
    scan() {
      if (this.isProcessing) return;
      let mainChat = document.querySelector('[role="main"]') || document.querySelector('[aria-label="Wiadomo\u015Bci"]') || document.querySelector('[aria-label="Messages"]');
      if (!mainChat) {
        if (Date.now() - this.lastMissingLog > 1e4) {
          console.warn("Zuza: mainChat not found! DOM might have changed.");
          this.lastMissingLog = Date.now();
        }
        return;
      }
      const chatRect = mainChat.getBoundingClientRect();
      if (chatRect.width === 0) return;
      let currentChat = "Unknown Chat";
      const mainChatArea = document.querySelector('[role="main"]') || document.querySelector('[aria-label="Wiadomo\u015Bci"]') || document.querySelector('[aria-label="Messages"]');
      if (mainChatArea) {
        const headers = Array.from(mainChatArea.querySelectorAll('a span[dir="auto"], h1, h2, h3, [role="heading"]'));
        for (const h of headers) {
          const t = h.textContent?.trim() || "";
          if (t && !t.toLowerCase().includes("powiadomienia") && !t.toLowerCase().includes("wiadomo\u015Bci")) {
            currentChat = t;
            break;
          }
        }
      }
      if (currentChat === "Unknown Chat") {
        const titleText = document.title.split("|")[0].replace(/\(\d+\)/, "").trim();
        if (!titleText.toLowerCase().includes("powiadomienia") && !titleText.toLowerCase().includes("messenger") && !titleText.toLowerCase().includes("facebook")) {
          currentChat = titleText;
        }
      }
      if (currentChat !== this.lastChatName) {
        console.log(`Zuza: \u{1F504} Switched to [${currentChat}]. Clearing context.`);
        this.lastChatName = currentChat;
        this.initialAbsorbDone = false;
      }
      const cells = Array.from(mainChat.querySelectorAll('[role="row"], [role="gridcell"], div[role="presentation"]'));
      let candidates = [];
      if (cells.length > 0) {
        for (const cell of cells) {
          const subs = cell.querySelectorAll('[dir="auto"], [data-lexical-text="true"]');
          const subsArray = Array.from(subs);
          if (subsArray.length > 0) {
            const topLevelSubs = subsArray.filter((sub) => {
              let p = sub.parentElement;
              while (p && p !== cell) {
                if (subsArray.includes(p)) return false;
                p = p.parentElement;
              }
              return true;
            });
            topLevelSubs.forEach((el) => candidates.push(el));
          } else {
            const potentialLeaves = cell.querySelectorAll("span, div");
            for (const leaf of Array.from(potentialLeaves)) {
              if (leaf.children.length === 0 && leaf.textContent?.trim()) {
                candidates.push(leaf);
              }
            }
          }
        }
      } else {
        const fallbacksArray = Array.from(mainChat.querySelectorAll('[dir="auto"], img'));
        const topLevelFallbacks = fallbacksArray.filter((el) => {
          if (el.tagName === "IMG" && (el.width < 50 || el.height < 50)) return false;
          let p = el.parentElement;
          while (p && p !== mainChat) {
            if (fallbacksArray.includes(p)) return false;
            p = p.parentElement;
          }
          return true;
        });
        topLevelFallbacks.forEach((el) => candidates.push(el));
      }
      let rawElements = Array.from(new Set(candidates));
      const elements = rawElements.filter((el) => {
        if (el.tagName === "IMG") return true;
        if (el.closest('form, input, textarea, [role="textbox"], [contenteditable="true"], [contenteditable], [role="button"], [role="link"], a, [role="heading"], h1, h2, h3, [role="navigation"], ul, li, [aria-label="Toolbar"], [role="toolbar"]')) {
          return false;
        }
        return true;
      });
      const validBubbles = elements.map((el) => {
        let text = el.textContent?.trim() || "";
        let imageUrls = [];
        if (el.tagName === "IMG") {
          const img = el;
          text = "[Wys\u0142ano zdj\u0119cie]";
          imageUrls.push(img.src);
        } else {
          const imgs = el.querySelectorAll("img");
          imgs.forEach((img) => {
            if (img.width > 50 && img.height > 50) imageUrls.push(img.src);
          });
          if (imageUrls.length > 0 && !text) text = "[Wys\u0142ano zdj\u0119cie]";
        }
        if (!text && (el.getAttribute("aria-label") === "(y)" || el.getAttribute("aria-label") === "Like")) {
          text = "kciuk (like)";
        }
        return { el, text, imageUrls };
      }).filter((item) => {
        if (!item.text && item.imageUrls.length === 0) return false;
        if (item.text.includes("Wiadomo\u015B\u0107 wys\u0142ana") || item.text.includes("Wprowad\u017A") || item.text.includes("Kliknij") || item.text.toLowerCase().includes("napisz wiadomo\u015B\u0107")) return false;
        if (/^(\d{1,2}:\d{2})$/.test(item.text)) return false;
        return true;
      }).map((item) => {
        const isOut = this.isOutgoingBubble(item.el);
        const signature = (isOut ? "OUT:" : "IN:") + item.text;
        return { ...item, isOut, signature };
      });
      validBubbles.forEach((item) => {
        if (!item.el.dataset.zuzaBordered) {
          item.el.dataset.zuzaBordered = "true";
          item.el.style.border = item.isOut ? "2px solid red" : "2px solid green";
        }
      });
      const newMessages = this.getNewMessages(validBubbles);
      if (!this.initialAbsorbDone) {
        this.initialAbsorbDone = true;
        console.log(`Zuza: \u{1F6D1} Absorbed ${validBubbles.length} existing messages on startup using Sequence Alignment.`);
        return;
      }
      for (const msg of newMessages) {
        console.log(`Zuza [Debug]: Evaluating NEW message candidate: "${msg.text.substring(0, 50)}"`);
        const lower = msg.text.toLowerCase().trim();
        if (this.IGNORE_LIST.some((word) => lower === word || lower.startsWith(word + " "))) {
          console.log(`Zuza [Filter]: Rejected ignored word match: "${msg.text}"`);
          continue;
        }
        if (msg.text === this.lastChatName) {
          console.log(`Zuza [Filter]: Rejected chat name echo: "${msg.text}"`);
          continue;
        }
        if (msg.isOut) {
          console.log(`Zuza [Filter]: Rejected OUTGOING bubble (Pawe\u0142 or Bot): "${msg.text}"`);
          continue;
        }
        console.log(`Zuza [Debug]: \u2705 VALID INCOMING SIGNAL! Queuing: "${msg.text}"`);
        this.queueMessage(msg.text, msg.imageUrls);
        return;
      }
    }
    getNewMessages(currentScreen) {
      if (currentScreen.length === 0) return [];
      if (this.knownSequence.length === 0) {
        this.knownSequence = currentScreen.map((x) => x.signature);
        return currentScreen;
      }
      let overlapScreenIndex = -1;
      let overlapMatchLength = 0;
      for (let len = Math.min(this.knownSequence.length, currentScreen.length); len > 0; len--) {
        const suffix = this.knownSequence.slice(this.knownSequence.length - len);
        for (let s = currentScreen.length - len; s >= 0; s--) {
          let match = true;
          for (let i = 0; i < len; i++) {
            if (suffix[i] !== currentScreen[s + i].signature) {
              match = false;
              break;
            }
          }
          if (match) {
            overlapScreenIndex = s;
            overlapMatchLength = len;
            break;
          }
        }
        if (overlapScreenIndex !== -1) break;
      }
      if (overlapScreenIndex === -1) {
        this.knownSequence = currentScreen.map((x) => x.signature);
        return [];
      }
      const newMessages = currentScreen.slice(overlapScreenIndex + overlapMatchLength);
      this.knownSequence = currentScreen.map((x) => x.signature);
      return newMessages;
    }
    isOutgoingBubble(el) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) return false;
      let node = el;
      let depth = 0;
      while (node && node !== document.body && depth < 8) {
        const style = window.getComputedStyle(node);
        if (style.justifyContent === "flex-end" || style.alignSelf === "flex-end" || style.alignItems === "flex-end") {
          return true;
        }
        if (style.marginLeft === "auto" && style.marginRight !== "auto") {
          return true;
        }
        node = node.parentElement;
        depth++;
      }
      const distToLeftEdge = rect.left;
      const distToRightEdge = window.innerWidth - rect.right;
      if (distToRightEdge < distToLeftEdge * 0.8) {
        return true;
      }
      return false;
    }
    queueMessage(text, imageUrls) {
      const history = this.extractHistory();
      this.messageQueue.push({ text, history, imageUrls });
      const debounceMs = 3500 + Math.random() * 5500;
      console.log(`Zuza [Debounce]: Message queued. Waiting ${Math.round(debounceMs / 1e3)}s for follow-ups...`);
      indicator.style.background = "yellow";
      if (this.queueTimeout) {
        clearTimeout(this.queueTimeout);
      }
      this.queueTimeout = setTimeout(() => {
        this.queueTimeout = null;
        this.tryFlushQueue();
      }, debounceMs);
    }
    async tryFlushQueue() {
      if (this.isProcessing || this.messageQueue.length === 0) {
        if (!this.isProcessing && this.messageQueue.length === 0) {
          indicator.style.background = "#00ff00";
        }
        return;
      }
      try {
        chrome.runtime.sendMessage({ action: "GET_STATUS" }, (statusResp) => {
          if (chrome.runtime.lastError || !statusResp?.isInitialized) {
            console.warn("Zuza: Worker offline or initializing. Buffering message...");
            indicator.style.background = "orange";
            return;
          }
          this.processNextMessage();
        });
      } catch (err) {
        console.error("Zuza: Worker check failed! FATAL ERROR:", err);
        if (!chrome.runtime || !chrome.runtime.id || err?.message?.includes("Extension context")) {
          console.warn("Zuza: Extension context invalidated. Reloading page automatically to reconnect...");
          window.location.reload();
        }
      }
    }
    async processNextMessage() {
      if (this.messageQueue.length === 0) return;
      this.isProcessing = true;
      indicator.style.background = "#00ffff";
      const allMessages = [...this.messageQueue];
      this.messageQueue = [];
      const lastMessage = allMessages[allMessages.length - 1];
      const text = allMessages.map((m) => m.text).join(". ");
      const imageUrls = allMessages.flatMap((m) => m.imageUrls);
      const history = lastMessage.history;
      try {
        chrome.runtime.sendMessage({ action: "PROCESS_MESSAGE", text, history, imageUrls, chatName: this.lastChatName }, async (response) => {
          if (chrome.runtime.lastError) {
            console.error("Zuza: Extension context invalidated:", chrome.runtime.lastError);
            indicator.style.background = "orange";
            this.messageQueue.unshift({ text, history, imageUrls });
            this.isProcessing = false;
            return;
          }
          if (response?.error === "RATE_LIMIT_QUOTA") {
            console.warn("Zuza: Quota exceeded! Entering 60s backoff...");
            indicator.style.background = "orange";
            indicator.title = "Quota Exceeded - Sleeping 60s";
            this.messageQueue.unshift({ text, history, imageUrls });
            await new Promise((r) => setTimeout(r, 6e4));
            this.isProcessing = false;
            return;
          }
          if (response?.error) {
            console.error("Zuza: Background Error:", response.error);
            indicator.style.background = "red";
            this.isProcessing = false;
            return;
          }
          if (response?.blocks) {
            await this.executeTypingDelays(response.blocks);
          }
          this.isProcessing = false;
          this.tryFlushQueue();
        });
      } catch (err) {
        console.error("Zuza: Message passing failed:", err);
        indicator.style.background = "orange";
        this.messageQueue.unshift({ text, history, imageUrls });
        this.isProcessing = false;
        if (!chrome.runtime || !chrome.runtime.id || err?.message?.includes("Extension context")) {
          console.warn("Zuza: Extension context invalidated. Reloading page automatically to reconnect...");
          window.location.reload();
        }
      }
    }
    extractHistory() {
      const mainChat = document.querySelector('[role="main"]') || document.querySelector('[aria-label="Wiadomo\u015Bci"]') || document.querySelector('[aria-label="Messages"]');
      if (!mainChat) return [];
      const chatRect = mainChat.getBoundingClientRect();
      if (chatRect.width === 0) return [];
      const cells = Array.from(mainChat.querySelectorAll('[role="row"], [role="gridcell"], div[role="presentation"]'));
      let candidates = [];
      if (cells.length > 0) {
        for (const cell of cells) {
          const subs = cell.querySelectorAll('[dir="auto"], [data-lexical-text="true"]');
          if (subs.length > 0) {
            subs.forEach((el) => candidates.push(el));
          } else {
            const potentialLeaves = cell.querySelectorAll("span, div");
            for (const leaf of Array.from(potentialLeaves)) {
              if (leaf.children.length === 0 && leaf.textContent?.trim()) {
                candidates.push(leaf);
              }
            }
          }
        }
      } else {
        const fallbacks = mainChat.querySelectorAll('[dir="auto"]');
        fallbacks.forEach((el) => candidates.push(el));
      }
      const uniqueElements = Array.from(new Set(candidates)).slice(-10);
      return uniqueElements.filter((el) => {
        if (el.closest('form, input, textarea, [role="textbox"], [contenteditable="true"], [contenteditable], [role="button"], [role="link"], a, [role="heading"], h1, h2, h3, [role="navigation"], ul, li')) {
          return false;
        }
        const textbox = document.querySelector('[role="textbox"]') || document.querySelector('[aria-label="Wiadomo\u015B\u0107"]') || document.querySelector('div[contenteditable="true"]');
        if (textbox) {
          const tbRect = textbox.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          if (elRect.top >= tbRect.top - 30) return false;
          if (elRect.left > tbRect.right + 50) return false;
        }
        return true;
      }).map((el) => {
        const text = el.textContent?.trim() || "";
        const isRight = this.isOutgoingBubble(el);
        if (el.getBoundingClientRect().width > 0) {
          el.style.border = isRight ? "2px solid red" : "2px solid green";
        }
        return { role: isRight ? "model" : "user", parts: [{ text }] };
      }).filter((m) => m.parts[0].text.length > 0 && !m.parts[0].text.includes("Wiadomo\u015B\u0107 wys\u0142ana") && !m.parts[0].text.toLowerCase().includes("napisz wiadomo\u015B\u0107") && !this.IGNORE_LIST.some((word) => m.parts[0].text.toLowerCase() === word));
    }
    async executeTypingDelays(blocks) {
      const input = document.querySelector('[role="textbox"][contenteditable="true"]') || document.querySelector('[aria-label="Wiadomo\u015B\u0107"]') || document.querySelector('div[contenteditable="true"]');
      if (!input) {
        console.warn("Zuza: Input editable field not found.");
        return;
      }
      if (!blocks || !Array.isArray(blocks)) {
        console.warn("Zuza: Invalid payload received. Aborting typing sequence.");
        return;
      }
      const uniqueBlocks = Array.from(new Set(blocks.map((b) => String(b).trim()))).filter((b) => b.length > 0).slice(0, 1);
      for (let block of uniqueBlocks) {
        const readDelay = 1200 + Math.random() * 3500;
        await new Promise((r) => setTimeout(r, readDelay));
        input.focus();
        const charMs = 35 + Math.random() * 45;
        const typingDuration = Math.max(block.length * charMs, 1e3 + Math.random() * 1500);
        await new Promise((r) => setTimeout(r, typingDuration));
        try {
          const dataTransfer = new DataTransfer();
          dataTransfer.setData("text/plain", block);
          const pasteEvent = new ClipboardEvent("paste", {
            clipboardData: dataTransfer,
            bubbles: true,
            cancelable: true
          });
          input.dispatchEvent(pasteEvent);
          console.log("Zuza: Paste simulated successfully.");
        } catch (err) {
          console.error("Zuza: Paste simulation error, falling back to InputEvents", err);
          const beforeInput = new InputEvent("beforeinput", {
            inputType: "insertText",
            data: block,
            bubbles: true,
            cancelable: true
          });
          input.dispatchEvent(beforeInput);
          const inputEvent = new InputEvent("input", {
            inputType: "insertText",
            data: block,
            bubbles: true,
            cancelable: true
          });
          input.dispatchEvent(inputEvent);
        }
        await new Promise((r) => setTimeout(r, 400 + Math.random() * 800));
        const sendBtn = document.querySelector('[aria-label="Send"], [aria-label="Wy\u015Blij"], [aria-label="Naci\u015Bnij Enter, aby wys\u0142a\u0107"]');
        if (sendBtn) {
          console.log("Zuza: Clicking Send Button directly.");
          const rect = sendBtn.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          sendBtn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse", clientX: x, clientY: y }));
          sendBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: x, clientY: y }));
          sendBtn.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerType: "mouse", clientX: x, clientY: y }));
          sendBtn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, clientX: x, clientY: y }));
          sendBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        } else {
          console.log("Zuza: Send button not found, dispatching Enter KeyEvents fallback.");
          input.focus();
          const enterDown = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true });
          const enterPress = new KeyboardEvent("keypress", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true });
          const enterUp = new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true });
          input.dispatchEvent(enterDown);
          input.dispatchEvent(enterPress);
          input.dispatchEvent(enterUp);
        }
        await new Promise((r) => setTimeout(r, 800 + Math.random() * 1200));
      }
    }
  };
  if (document.readyState === "complete") {
    setTimeout(() => new DOMScraper().start(), 2e3);
  } else {
    window.addEventListener("load", () => setTimeout(() => new DOMScraper().start(), 2e3));
  }
})();
