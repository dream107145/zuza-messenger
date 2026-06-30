export class TypingSimulator {
  private static async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static async type(element: HTMLElement, text: string) {
    element.focus();
    
    // We use the most reliable method for ContentEditable: execCommand
    // This simulates real typing that Messenger's internal code recognizes perfectly.
    const canExec = document.queryCommandSupported('insertText');
    
    if (canExec) {
      // Type character by character to trigger "typing..." indicators naturally
      for (const char of text) {
        document.execCommand('insertText', false, char);
        await this.sleep(30 + Math.random() * 70);
      }
    } else {
      // Fallback for older browsers
      element.innerText = text;
      element.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }

    await this.sleep(500);

    // Press Enter to send
    const enterDown = new KeyboardEvent('keydown', { 
      key: 'Enter', 
      code: 'Enter', 
      keyCode: 13, 
      which: 13, 
      bubbles: true 
    });
    element.dispatchEvent(enterDown);
  }

  static async simulateTypingIndicator(element: HTMLElement, durationMs: number) {
    element.focus();
    const startTime = Date.now();
    while (Date.now() - startTime < durationMs) {
      element.dispatchEvent(new InputEvent('input', { bubbles: true }));
      await this.sleep(2000);
    }
  }

  static async getRandomDelay(min: number = 10, max: number = 60) {
    return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
  }
}
