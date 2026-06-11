/**
 * ContextFlow Inject Script
 * Runs on supported chatbot domains to inject the pending hydration prompt.
 */
(function() {
  const url = window.location.href;
  let domainKey = '';

  if (url.includes('chatgpt.com') || url.includes('bot=chatgpt')) domainKey = 'chatgpt';
  else if (url.includes('claude.ai') || url.includes('bot=claude')) domainKey = 'claude';
  else if (url.includes('gemini.google.com') || url.includes('bot=gemini')) domainKey = 'gemini';
  else if (url.includes('chat.mistral.ai') || url.includes('bot=mistral')) domainKey = 'mistral';
  else if (url.includes('chat.deepseek.com') || url.includes('bot=deepseek')) domainKey = 'deepseek';

  if (!domainKey) return;

  console.log(`[ContextFlow Inject] Script loaded on ${url}. Identified domainKey: ${domainKey}`);

  // Check storage for pending hydration prompt
  chrome.storage.local.get(['pendingInjections'], (data) => {
    const pendingInjections = data.pendingInjections || {};
    const prompt = pendingInjections[domainKey];
    
    console.log(`[ContextFlow Inject] Storage checked. Prompt present for ${domainKey}: ${!!prompt}`);
    if (prompt) {
      // Find the input field and attempt injection
      attemptInjection(prompt, domainKey, 0);
    }
  });

  function attemptInjection(prompt, domain, attempts) {
    console.log(`[ContextFlow Inject] Attempt ${attempts}/60 to locate input field for ${domain}`);
    if (attempts > 60) {
      // 30 seconds timeout - clear storage since it timed out
      console.warn(`[ContextFlow Inject] Injection timed out for ${domain}`);
      clearPendingInjection(domain);
      showToast('Context ready on clipboard! (Injection timed out)', '#FFD54A');
      return;
    }

    const inputField = findInputField(domain);
    console.log(`[ContextFlow Inject] Input field search result for ${domain}:`, inputField ? 'Found!' : 'Not found');

    if (!inputField && attempts % 10 === 0) {
      console.log(`[ContextFlow Inject] Current HTML body snippet: ${document.body ? document.body.innerHTML.substring(0, 1000) : 'No body'}`);
    }

    if (inputField) {
      setTimeout(() => {
        console.log(`[ContextFlow Inject] Invoking injectText for ${domain}...`);
        const injected = injectText(inputField, prompt);
        console.log(`[ContextFlow Inject] injectText result for ${domain}: ${injected}`);
        if (injected) {
          clearPendingInjection(domain); // Clear from storage ONLY after successful injection
          showToast('⚡ Context Hydrated Successfully!', '#7ED957');
          // Clear clipboard for security
          try {
            navigator.clipboard.writeText('').catch(() => {});
          } catch (e) { /* Clipboard API may not be available */ }
        } else {
          showToast('Clipboard fallback activated! Paste manually (Ctrl+V)', '#FFD54A');
        }
      }, 500); // Small delay to let DOM settle
    } else {
      // Retry in 500ms
      setTimeout(() => {
        attemptInjection(prompt, domain, attempts + 1);
      }, 500);
    }
  }

  function clearPendingInjection(domain) {
    chrome.storage.local.get(['pendingInjections'], (data) => {
      const pendingInjections = data.pendingInjections || {};
      if (pendingInjections[domain]) {
        delete pendingInjections[domain];
        chrome.storage.local.set({ pendingInjections });
      }
    });
  }

  function findInputField(domain) {
    // Platform-specific selectors (targeting main prompt text box only)
    if (domain === 'chatgpt') {
      return document.querySelector('#prompt-textarea');
    }
    if (domain === 'claude') {
      return document.querySelector('div[contenteditable="true"].ProseMirror, [data-testid="user-message-input"] div[contenteditable="true"]');
    }
    if (domain === 'gemini') {
      const richTextarea = document.querySelector('rich-textarea');
      if (richTextarea && richTextarea.shadowRoot) {
        const input = richTextarea.shadowRoot.querySelector('div[contenteditable="true"]');
        if (input) return input;
      }
      return document.querySelector('div[contenteditable="true"][role="combobox"]') ||
             document.querySelector('rich-textarea div[contenteditable="true"]');
    }
    if (domain === 'mistral') {
      return document.querySelector('textarea[autofocus=""], textarea[placeholder*="message" i], textarea[placeholder*="Ask" i]');
    }
    if (domain === 'deepseek') {
      return document.querySelector('#chat-input');
    }

    // Generic fallbacks (prioritize main text inputs)
    let fallback = document.querySelector('div[contenteditable="true"][role="combobox"]') ||
                   document.querySelector('textarea[placeholder*="message" i]') ||
                   document.querySelector('div[contenteditable="true"]') ||
                   document.querySelector('textarea');
    
    if (!fallback) {
      // Deep traversal to find any visible contenteditable or textarea
      let found = null;
      function traverse(node, depth) {
        if (found || depth > 20) return;  // Max 20 levels deep
        if (!node) return;
        if (node.nodeType === Node.ELEMENT_NODE) {
          if ((node.getAttribute('contenteditable') === 'true' && node.getAttribute('role') === 'combobox') ||
              node.tagName === 'TEXTAREA') {
            found = node;
            return;
          }
        }
        if (node.shadowRoot) {
          traverse(node.shadowRoot, depth + 1);
        }
        const children = node.childNodes;
        if (children) {
          for (let i = 0; i < children.length; i++) {
            traverse(children[i], depth + 1);
          }
        }
      }
      traverse(document, 0);
      return found;
    }
    return fallback;
  }

  function injectText(element, text) {
    // Focus and click to trigger activation in React/Angular/Vue
    element.focus();
    element.click();
    
    const isContentEditable = element.getAttribute('contenteditable') === 'true' || 
                              element.tagName === 'DIV' || 
                              element.classList.contains('ProseMirror');

    // Helper to dispatch framework-compatible input events
    const dispatchEvents = (el, val) => {
      el.dispatchEvent(new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        data: val,
        inputType: 'insertText'
      }));
      el.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        data: val,
        inputType: 'insertText'
      }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    if (isContentEditable) {
      try {
        // Only clear existing content if we have text to inject
        if (text && text.length > 0) {
          element.innerHTML = '';
        }
        
        // Setup text selection for document.execCommand
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
        
        // Force beforeinput trigger
        element.dispatchEvent(new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          data: text,
          inputType: 'insertText'
        }));
        
        // Note: execCommand('insertText') is deprecated but still widely supported.
        // Fallback to direct textNode insertion if it fails.
        const execSuccess = document.execCommand('insertText', false, text);
        console.log(`[ContextFlow Inject] execCommand result: ${execSuccess}, current innerText length: ${element.innerText.trim().length}`);
        
        if (!execSuccess || element.innerText.trim().length === 0) {
          console.log('[ContextFlow Inject] execCommand failed or empty, falling back to direct textNode insertion');
          element.innerHTML = '';
          const textNode = document.createTextNode(text);
          element.appendChild(textNode);
        }
        
        // Dispatch framework events
        dispatchEvents(element, text);
        
        return true;
      } catch (e) {
        console.error('[ContextFlow Inject] Error during contenteditable injection:', e);
        element.innerHTML = '';
        const textNode = document.createTextNode(text);
        element.appendChild(textNode);
        dispatchEvents(element, text);
        return true;
      }
    } else {
      // Textarea or standard input (utilize React value setter bypass hack)
      try {
        const prototype = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
        if (descriptor && descriptor.set) {
          descriptor.set.call(element, text);
        } else {
          element.value = text;
        }
        dispatchEvents(element, text);
        element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Process' }));
        return true;
      } catch (e) {
        console.warn('[ContextFlow Inject] React value setter bypass failed, falling back to direct assignment');
        element.value = text;
        dispatchEvents(element, text);
        return true;
      }
    }
  }

  function showToast(message, bgColor) {
    // Create Neo-Brutalist Toast
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '24px';
    toast.style.right = '24px';
    toast.style.backgroundColor = bgColor;
    toast.style.color = '#000000';
    toast.style.border = '3px solid #000000';
    toast.style.borderRadius = '8px';
    toast.style.padding = '12px 20px';
    toast.style.fontFamily = '"IBM Plex Mono", Courier, monospace';
    toast.style.fontWeight = '600';
    toast.style.fontSize = '14px';
    toast.style.boxShadow = '4px 4px 0px #000000';
    toast.style.zIndex = '999999';
    toast.style.transition = 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    toast.style.transform = 'translateY(100px)';
    toast.style.opacity = '0';
    toast.innerText = message;

    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => {
      toast.style.transform = 'translateY(0)';
      toast.style.opacity = '1';
    }, 100);

    // Animate out
    setTimeout(() => {
      toast.style.transform = 'translateY(100px)';
      toast.style.opacity = '0';
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 4000);
  }

  // Prevent duplicate listeners on re-injection
  if (!window.__contextFlowListenerRegistered) {
    window.__contextFlowListenerRegistered = true;
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'triggerInjection') {
        chrome.storage.local.get(['pendingInjections'], (data) => {
          const pendingInjections = data.pendingInjections || {};
          const prompt = pendingInjections[domainKey];
          if (prompt) {
            attemptInjection(prompt, domainKey, 0);
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false });
          }
        });
        return true; // Keep channel open
      }
    });
  }
})();
