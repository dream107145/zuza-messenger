/// <reference types="chrome" />

const HEARTBEAT = 'background: #512da8; color: #fff; border-radius: 4px; padding: 2px 6px; font-weight: bold;';
console.log('%c [ZUZA-E2EE-OBSERVER-INIT] Active ', HEARTBEAT);

const indicator = document.createElement('div');
indicator.id = 'zuza-status-dot';
indicator.style.cssText = 'position:fixed; top:10px; left:10px; width:12px; height:12px; background:red; border-radius:50%; z-index:999999; border:2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5); pointer-events:none;';

// Append indicator safely when DOM is ready
const appendIndicator = () => {
  if (!document.getElementById('zuza-status-dot')) {
    document.documentElement.appendChild(indicator);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', appendIndicator);
} else {
  appendIndicator();
}

class DOMScraper {
  private observer: MutationObserver | null = null;
  private lastMissingLog: number = 0;
  private lastChatName: string = "";
  private isProcessing: boolean = false;
  private readonly IGNORE_LIST = ['wysłano', 'wyświetlono', 'dostarczono', 'sent', 'seen', 'delivered', 'seen at', 'widziane'];
  private messageQueue: { text: string, imageUrls: string[], history: any[] }[] = [];
  private queueTimeout: any = null;
  private initialAbsorbDone: boolean = false;
  private knownSequence: string[] = [];

  start() {
    indicator.style.background = '#00ff00';
    indicator.style.boxShadow = '0 0 10px #00ff00';
    
    // Regular check to catch anything missed by mutations
    setInterval(() => this.scan(), 2000);

    // Heartbeat ping to keep service worker alive
    setInterval(() => {
      try { chrome.runtime.sendMessage({ action: 'HEARTBEAT' }); } catch (e) {}
    }, 20000);

    this.observer = new MutationObserver(() => this.scan());
    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  private scan() {
    if (this.isProcessing) return;

    // Strict target on primary chat container to prevent sidebar contamination
    let mainChat = document.querySelector('[role="main"]') || document.querySelector('[aria-label="Wiadomości"]') || document.querySelector('[aria-label="Messages"]');
    
    if (!mainChat) {
       if (Date.now() - this.lastMissingLog > 10000) {
           console.warn("Zuza: mainChat not found! DOM might have changed.");
           this.lastMissingLog = Date.now();
       }
       return; 
    }

    const chatRect = mainChat.getBoundingClientRect();
    if (chatRect.width === 0) return;

    // Detect Chat Thread to clear memory on switch
    let currentChat = "Unknown Chat";
    const mainChatArea = document.querySelector('[role="main"]') || document.querySelector('[aria-label="Wiadomości"]') || document.querySelector('[aria-label="Messages"]');
    
    if (mainChatArea) {
        const headers = Array.from(mainChatArea.querySelectorAll('a span[dir="auto"], h1, h2, h3, [role="heading"]'));
        for (const h of headers) {
            const t = h.textContent?.trim() || "";
            if (t && !t.toLowerCase().includes("powiadomienia") && !t.toLowerCase().includes("wiadomości")) {
                currentChat = t;
                break;
            }
        }
    }
    
    if (currentChat === "Unknown Chat") {
        const titleText = document.title.split('|')[0].replace(/\(\d+\)/, '').trim();
        if (!titleText.toLowerCase().includes("powiadomienia") && !titleText.toLowerCase().includes("messenger") && !titleText.toLowerCase().includes("facebook")) {
            currentChat = titleText;
        }
    }
    
    if (currentChat !== this.lastChatName) {
      console.log(`Zuza: 🔄 Switched to [${currentChat}]. Clearing context.`);
      this.lastChatName = currentChat;
      this.initialAbsorbDone = false; // Re-absorb the new chat screen
    }

    // Extract incoming text using explicit E2EE structural hierarchies or fallback
    const cells = Array.from(mainChat.querySelectorAll('[role="row"], [role="gridcell"], div[role="presentation"]'));
    let candidates: HTMLElement[] = [];
    
    if (cells.length > 0) {
      for (const cell of cells) {
        const subs = cell.querySelectorAll('[dir="auto"], [data-lexical-text="true"]');
        const subsArray = Array.from(subs);
        if (subsArray.length > 0) {
          const topLevelSubs = subsArray.filter(sub => {
            let p = sub.parentElement;
            while (p && p !== cell) {
              if (subsArray.includes(p)) return false;
              p = p.parentElement;
            }
            return true;
          });
          topLevelSubs.forEach(el => candidates.push(el as HTMLElement));
        } else {
          const potentialLeaves = cell.querySelectorAll('span, div');
          for (const leaf of Array.from(potentialLeaves)) {
            if (leaf.children.length === 0 && leaf.textContent?.trim()) {
              candidates.push(leaf as HTMLElement);
            }
          }
        }
      }
    } else {
      // Fallback: Meta completely removed structured roles in this E2EE chat
      const fallbacksArray = Array.from(mainChat.querySelectorAll('[dir="auto"], img'));
      const topLevelFallbacks = fallbacksArray.filter(el => {
        if (el.tagName === 'IMG' && ((el as HTMLImageElement).width < 50 || (el as HTMLImageElement).height < 50)) return false;
        let p = el.parentElement;
        while (p && p !== mainChat) {
          if (fallbacksArray.includes(p)) return false;
          p = p.parentElement;
        }
        return true;
      });
      topLevelFallbacks.forEach(el => candidates.push(el as HTMLElement));
    }

    let rawElements = Array.from(new Set(candidates));
    
    // STRICT DOM FILTER: Ensure we ONLY track actual chat bubbles
    const elements = rawElements.filter(el => {
      if (el.tagName === 'IMG') return true; // Keep valid images
      if (el.closest('form, input, textarea, [role="textbox"], [contenteditable="true"], [contenteditable], [role="button"], [role="link"], a, [role="heading"], h1, h2, h3, [role="navigation"], ul, li, [aria-label="Toolbar"], [role="toolbar"]')) {
        return false;
      }
      return true;
    });

    // Extract valid text and structure signatures
    const validBubbles = elements.map(el => {
        let text = el.textContent?.trim() || "";
        let imageUrls: string[] = [];

        if (el.tagName === 'IMG') {
            const img = el as HTMLImageElement;
            text = "[Wysłano zdjęcie]";
            imageUrls.push(img.src);
        } else {
            const imgs = el.querySelectorAll('img');
            imgs.forEach(img => {
                if (img.width > 50 && img.height > 50) imageUrls.push(img.src);
            });
            if (imageUrls.length > 0 && !text) text = "[Wysłano zdjęcie]";
        }

        if (!text && (el.getAttribute('aria-label') === '(y)' || el.getAttribute('aria-label') === 'Like')) {
            text = "kciuk (like)";
        }
        return { el, text, imageUrls };
    }).filter(item => {
        if (!item.text && item.imageUrls.length === 0) return false;
        if (item.text.includes("Wiadomość wysłana") || item.text.includes("Wprowadź") || item.text.includes("Kliknij") || item.text.toLowerCase().includes("napisz wiadomość")) return false;
        if (/^(\d{1,2}:\d{2})$/.test(item.text)) return false;
        return true;
    }).map(item => {
        const isOut = this.isOutgoingBubble(item.el);
        const signature = (isOut ? "OUT:" : "IN:") + item.text;
        return { ...item, isOut, signature };
    });

    // VISUAL DEBUGGER: Draw borders unconditionally
    validBubbles.forEach(item => {
        // @ts-ignore
        if (!item.el.dataset.zuzaBordered) {
            // @ts-ignore
            item.el.dataset.zuzaBordered = "true";
            (item.el as HTMLElement).style.border = item.isOut ? '2px solid red' : '2px solid green';
        }
    });

    // SEQUENCE ALIGNMENT: Find which messages are truly new
    const newMessages = this.getNewMessages(validBubbles);

    if (!this.initialAbsorbDone) {
      this.initialAbsorbDone = true;
      console.log(`Zuza: 🛑 Absorbed ${validBubbles.length} existing messages on startup using Sequence Alignment.`);
      return;
    }

    for (const msg of newMessages) {
        console.log(`Zuza [Debug]: Evaluating NEW message candidate: "${msg.text.substring(0, 50)}"`);
        
        const lower = msg.text.toLowerCase().trim();
        if (this.IGNORE_LIST.some(word => lower === word || lower.startsWith(word + ' '))) {
            console.log(`Zuza [Filter]: Rejected ignored word match: "${msg.text}"`);
            continue;
        }
        if (msg.text === this.lastChatName) {
            console.log(`Zuza [Filter]: Rejected chat name echo: "${msg.text}"`);
            continue;
        }
        if (msg.isOut) {
            console.log(`Zuza [Filter]: Rejected OUTGOING bubble (Paweł or Bot): "${msg.text}"`);
            continue;
        }

        console.log(`Zuza [Debug]: ✅ VALID INCOMING SIGNAL! Queuing: "${msg.text}"`);
        this.queueMessage(msg.text, msg.imageUrls);
        return; // Process one at a time to maintain sequence
    }
  }

  private getNewMessages(currentScreen: { el: Element, text: string, imageUrls: string[], isOut: boolean, signature: string }[]) {
      if (currentScreen.length === 0) return [];
      
      // If we have no known sequence, initialize it and treat all as new (unless initial absorb caught it above)
      if (this.knownSequence.length === 0) {
          this.knownSequence = currentScreen.map(x => x.signature);
          return currentScreen;
      }

      let overlapScreenIndex = -1;
      let overlapMatchLength = 0;

      // Find the longest suffix of knownSequence that matches a sequence ending in currentScreen
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
          // No overlap at all. E.g., user scrolled far away or completely refreshed. 
          // We assume we lost track and re-initialize to avoid replying to a whole page of old messages.
          this.knownSequence = currentScreen.map(x => x.signature);
          return [];
      }

      // Extract new messages that appear AFTER the matched overlap
      const newMessages = currentScreen.slice(overlapScreenIndex + overlapMatchLength);
      
      // Update known sequence
      this.knownSequence = currentScreen.map(x => x.signature);
      
      return newMessages;
  }

  private isOutgoingBubble(el: Element): boolean {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return false;

    // 1. Flexbox Layout Check (Most reliable)
    // Facebook uses flex-end for outgoing messages and flex-start for incoming.
    let node = el as HTMLElement | null;
    let depth = 0;
    while (node && node !== document.body && depth < 8) {
        const style = window.getComputedStyle(node);
        if (style.justifyContent === 'flex-end' || style.alignSelf === 'flex-end' || style.alignItems === 'flex-end') {
            return true;
        }
        if (style.marginLeft === 'auto' && style.marginRight !== 'auto') {
            return true;
        }
        node = node.parentElement;
        depth++;
    }

    // 2. Absolute Geometric Fallback
    // Regardless of dynamic containers, outgoing messages are pushed to the physical right edge of the screen.
    const distToLeftEdge = rect.left;
    const distToRightEdge = window.innerWidth - rect.right;
    
    // An outgoing message will be much closer to the right edge than the left edge.
    if (distToRightEdge < distToLeftEdge * 0.8) {
        return true; 
    }

    return false;
  }

  private queueMessage(text: string, imageUrls: string[]) {
    const history = this.extractHistory();
    this.messageQueue.push({ text, history, imageUrls });
    
    const debounceMs = 3500 + Math.random() * 5500;
    console.log(`Zuza [Debounce]: Message queued. Waiting ${Math.round(debounceMs / 1000)}s for follow-ups...`);
    indicator.style.background = 'yellow';
    
    if (this.queueTimeout) {
      clearTimeout(this.queueTimeout);
    }
    
    this.queueTimeout = setTimeout(() => {
      this.queueTimeout = null;
      this.tryFlushQueue();
    }, debounceMs);
  }

  private async tryFlushQueue() {
    if (this.isProcessing || this.messageQueue.length === 0) {
      if (!this.isProcessing && this.messageQueue.length === 0) {
        indicator.style.background = '#00ff00'; // Green when idle
      }
      return;
    }

    try {
      chrome.runtime.sendMessage({ action: "GET_STATUS" }, (statusResp: any) => {
        if (chrome.runtime.lastError || !statusResp?.isInitialized) {
          console.warn("Zuza: Worker offline or initializing. Buffering message...");
          indicator.style.background = 'orange';
          return; // Wait for next tick
        }

        // Background is ready, flush one item
        this.processNextMessage();
      });
    } catch (err: any) {
      console.error("Zuza: Worker check failed! FATAL ERROR:", err);
      if (!chrome.runtime || !chrome.runtime.id || err?.message?.includes("Extension context")) {
        console.warn("Zuza: Extension context invalidated. Reloading page automatically to reconnect...");
        window.location.reload();
      }
    }
  }

  private async processNextMessage() {
    if (this.messageQueue.length === 0) return;
    this.isProcessing = true;
    indicator.style.background = '#00ffff'; // Cyan while processing

    // Collapse rapid-fire messages into a single prompt to prevent double-responding
    const allMessages = [...this.messageQueue];
    this.messageQueue = []; // Clear queue

    const lastMessage = allMessages[allMessages.length - 1];
    const text = allMessages.map(m => m.text).join(". ");
    const imageUrls = allMessages.flatMap(m => m.imageUrls);
    const history = lastMessage.history;

    try {
      // Send to background service worker (Bypasses CSP)
      chrome.runtime.sendMessage({ action: "PROCESS_MESSAGE", text, history, imageUrls, chatName: this.lastChatName }, async (response: any) => {
        if (chrome.runtime.lastError) {
          console.error("Zuza: Extension context invalidated:", chrome.runtime.lastError);
          indicator.style.background = 'orange';
          this.messageQueue.unshift({ text, history, imageUrls }); // Re-queue on failure
          this.isProcessing = false;
          return;
        }

        if (response?.error === "RATE_LIMIT_QUOTA") {
          console.warn("Zuza: Quota exceeded! Entering 60s backoff...");
          indicator.style.background = 'orange';
          indicator.title = "Quota Exceeded - Sleeping 60s";
          this.messageQueue.unshift({ text, history, imageUrls }); // Re-queue
          await new Promise(r => setTimeout(r, 60000));
          this.isProcessing = false;
          return;
        }

        if (response?.error) {
          console.error("Zuza: Background Error:", response.error);
          indicator.style.background = 'red';
          this.isProcessing = false;
          return;
        }

        if (response?.blocks) {
          await this.executeTypingDelays(response.blocks);
        }
        
        this.isProcessing = false;
        this.tryFlushQueue(); // Try to process the next one immediately
      });
    } catch (err: any) {
      console.error("Zuza: Message passing failed:", err);
      indicator.style.background = 'orange';
      this.messageQueue.unshift({ text, history, imageUrls });
      this.isProcessing = false;
      
      if (!chrome.runtime || !chrome.runtime.id || err?.message?.includes("Extension context")) {
        console.warn("Zuza: Extension context invalidated. Reloading page automatically to reconnect...");
        window.location.reload();
      }
    }
  }

  private extractHistory() {
    const mainChat = document.querySelector('[role="main"]') || document.querySelector('[aria-label="Wiadomości"]') || document.querySelector('[aria-label="Messages"]');
    if (!mainChat) return [];

    const chatRect = mainChat.getBoundingClientRect();
    if (chatRect.width === 0) return [];

    const cells = Array.from(mainChat.querySelectorAll('[role="row"], [role="gridcell"], div[role="presentation"]'));
    let candidates: HTMLElement[] = [];
    
    if (cells.length > 0) {
      for (const cell of cells) {
        const subs = cell.querySelectorAll('[dir="auto"], [data-lexical-text="true"]');
        if (subs.length > 0) {
          subs.forEach(el => candidates.push(el as HTMLElement));
        } else {
          const potentialLeaves = cell.querySelectorAll('span, div');
          for (const leaf of Array.from(potentialLeaves)) {
            if (leaf.children.length === 0 && leaf.textContent?.trim()) {
              candidates.push(leaf as HTMLElement);
            }
          }
        }
      }
    } else {
      const fallbacks = mainChat.querySelectorAll('[dir="auto"]');
      fallbacks.forEach(el => candidates.push(el as HTMLElement));
    }
    
    const uniqueElements = Array.from(new Set(candidates)).slice(-10);

    return uniqueElements.filter(el => {
      // STRICT DOM FILTER for history
      if (el.closest('form, input, textarea, [role="textbox"], [contenteditable="true"], [contenteditable], [role="button"], [role="link"], a, [role="heading"], h1, h2, h3, [role="navigation"], ul, li')) {
        return false;
      }
      
      // GEOMETRIC FILTER for history
      const textbox = document.querySelector('[role="textbox"]') || document.querySelector('[aria-label="Wiadomość"]') || document.querySelector('div[contenteditable="true"]');
      if (textbox) {
        const tbRect = textbox.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        if (elRect.top >= tbRect.top - 30) return false;
        if (elRect.left > tbRect.right + 50) return false;
      }
      
      return true;
    }).map(el => {
      const text = el.textContent?.trim() || "";
      const isRight = this.isOutgoingBubble(el);
      // removed unused isValid
      if (el.getBoundingClientRect().width > 0) {
          el.style.border = isRight ? '2px solid red' : '2px solid green';
      }
      return { role: (isRight ? 'model' : 'user') as 'model' | 'user', parts: [{ text }] };
    }).filter(m => m.parts[0].text.length > 0 && 
                   !m.parts[0].text.includes("Wiadomość wysłana") && 
                   !m.parts[0].text.toLowerCase().includes("napisz wiadomość") &&
                   !this.IGNORE_LIST.some(word => m.parts[0].text.toLowerCase() === word));
  }

  private async executeTypingDelays(blocks: any) {
    const input = (document.querySelector('[role="textbox"][contenteditable="true"]') || 
                   document.querySelector('[aria-label="Wiadomość"]') ||
                   document.querySelector('div[contenteditable="true"]')) as HTMLElement;
                  
    if (!input) {
      console.warn("Zuza: Input editable field not found.");
      return;
    }

    if (!blocks || !Array.isArray(blocks)) {
      console.warn("Zuza: Invalid payload received. Aborting typing sequence.");
      return;
    }

    // Deduplicate blocks to prevent AI repetition loops from spamming the chat
    // Cap to exactly 1 block to ensure the bot sends one bubble and waits for a reply.
    const uniqueBlocks = Array.from(new Set(blocks.map(b => String(b).trim()))).filter(b => b.length > 0).slice(0, 1);

    for (let block of uniqueBlocks) {
      // Simulate reading the message before typing (humans don't reply instantly)
      const readDelay = 1200 + Math.random() * 3500;
      await new Promise(r => setTimeout(r, readDelay));

      input.focus();
      
      // Variable typing speed with jitter — short msgs feel faster, long msgs slower
      const charMs = 35 + Math.random() * 45;
      const typingDuration = Math.max(block.length * charMs, 1000 + Math.random() * 1500);
      await new Promise(r => setTimeout(r, typingDuration));

      // Lexical editor bypass - simulated paste event using DataTransfer
      try {
        const dataTransfer = new DataTransfer();
        dataTransfer.setData('text/plain', block);
        
        const pasteEvent = new ClipboardEvent('paste', {
          clipboardData: dataTransfer,
          bubbles: true,
          cancelable: true
        });
        
        input.dispatchEvent(pasteEvent);
        console.log("Zuza: Paste simulated successfully.");
      } catch (err) {
        console.error("Zuza: Paste simulation error, falling back to InputEvents", err);
        const beforeInput = new InputEvent('beforeinput', {
          inputType: 'insertText',
          data: block,
          bubbles: true,
          cancelable: true
        });
        input.dispatchEvent(beforeInput);
        
        const inputEvent = new InputEvent('input', {
          inputType: 'insertText',
          data: block,
          bubbles: true,
          cancelable: true
        });
        input.dispatchEvent(inputEvent);
      }

      await new Promise(r => setTimeout(r, 400 + Math.random() * 800));

      // Attempt to find send button with strict semantic attributes
      // Do NOT use "Wysłano" as it matches the "Sent" status text under previous messages!
      const sendBtn = document.querySelector('[aria-label="Send"], [aria-label="Wyślij"], [aria-label="Naciśnij Enter, aby wysłać"]');
      if (sendBtn) {
        console.log("Zuza: Clicking Send Button directly.");
        const rect = sendBtn.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        sendBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse', clientX: x, clientY: y }));
        sendBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        sendBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'mouse', clientX: x, clientY: y }));
        sendBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        sendBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
      } else {
        // Fallback to Enter KeyEvents directly on the input box if no button found
        console.log("Zuza: Send button not found, dispatching Enter KeyEvents fallback.");
        input.focus();
        const enterDown = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
        const enterPress = new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
        const enterUp = new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
        input.dispatchEvent(enterDown);
        input.dispatchEvent(enterPress);
        input.dispatchEvent(enterUp);
      }
      
      await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
    }
  }
}

// Start Scraper once window loads
if (document.readyState === 'complete') {
  setTimeout(() => new DOMScraper().start(), 2000);
} else {
  window.addEventListener('load', () => setTimeout(() => new DOMScraper().start(), 2000));
}
