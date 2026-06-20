/**
 * ContextFlow Capture Script
 * Runs in the context of the active chatbot tab to extract the conversation history.
 */
(function() {
  const DEFAULT_REGISTRY = {
    chatgpt: {
      turnSelector: '[data-testid^="conversation-turn"]',
      userIndicatorSelector: '[data-testid="user-turn"], .user-turn, img[alt="User"]',
      textSelector: '.markdown, div.text-base, div.w-full'
    },
    claude: {
      messageSelector: '[data-testid="user-message"], [data-testid="assistant-message"], .font-claude-message, .user-message, div.grid.grid-cols-1.gap-4',
      userIndicatorSelector: '[data-testid="user-message"], .user-message'
    },
    gemini: {
      messageSelector: 'user-query, .query-content, message-content, .query-text, div[class*="query-content"], div[class*="message-content"], div[class*="message_content"], div[class*="user-query"]',
      userIndicatorSelector: 'user-query, .query-content, .query-text, .user-query, [class*="query-content"], [class*="query-text"], [class*="user-query"]'
    },
    mistral: {
      messageSelector: 'div[class*="message-user"], div[class*="message-assistant"], div[class*="message_user"], div[class*="message_assistant"], div[class*="message-content"], div[class*="message_content"]',
      userIndicatorSelector: '[class*="message-user"], [class*="message_user"], [class*="user"], [class*="Human"], [class*="sent"], [class*="self-end"]'
    },
    deepseek: {
      messageSelector: 'div[class*="message"][class*="user"], div[class*="message"][class*="assistant"], div[class*="turn"], .ds-markdown',
      userIndicatorSelector: '[class*="user"], [class*="right"], [class*="question"], [class*="sent"], [class*="self-end"]'
    }
  };

  function getSelectorRegistry() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['selectorRegistry'], (data) => {
          const custom = data.selectorRegistry || {};
          const merged = {};
          for (const key in DEFAULT_REGISTRY) {
            merged[key] = {
              ...DEFAULT_REGISTRY[key],
              ...(custom[key] || {})
            };
          }
          resolve(merged);
        });
      } else {
        resolve(DEFAULT_REGISTRY);
      }
    });
  }

  return getSelectorRegistry().then(registry => {
    const url = window.location.href;
    const path = window.location.pathname;
    let platform = 'unknown';
    let title = document.title || 'Untitled Conversation';
    let messages = [];

    // Ignore auth/login/share screens
    if (path.includes('/login') || path.includes('/auth') || path.includes('/signup') || path.includes('/signin') || path.includes('/share')) {
      return { platform, title, messages: [] };
    }

    // Determine platform
    if (url.includes('chatgpt.com') || url.includes('bot=chatgpt')) {
      platform = 'chatgpt';
      messages = captureChatGPT(registry.chatgpt);
    } else if (url.includes('claude.ai') || url.includes('bot=claude')) {
      platform = 'claude';
      messages = captureClaude(registry.claude);
    } else if (url.includes('gemini.google.com') || url.includes('bot=gemini')) {
      platform = 'gemini';
      messages = captureGemini(registry.gemini);
    } else if (url.includes('chat.mistral.ai') || url.includes('bot=mistral')) {
      platform = 'mistral';
      messages = captureMistral(registry.mistral);
    } else if (url.includes('chat.deepseek.com') || url.includes('bot=deepseek')) {
      platform = 'deepseek';
      messages = captureDeepSeek(registry.deepseek);
    }

    // Fallback if specific capture failed or returned empty
    if (messages.length === 0) {
      messages = captureFallback();
    }

    return {
      platform,
      title,
      messages
    };
  });

  function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    
    // If element is not inline and has no offset size, verify by bounding client rect
    if (style.display !== 'inline' && el.offsetWidth === 0 && el.offsetHeight === 0) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
    }
    return true;
  }

  function filterTopLevelElements(elements) {
    const set = new Set(elements);
    return Array.from(elements).filter(el => {
      // Traverse up parent node chain to check if any ancestor is in the set
      let parent = el.parentNode || (el.shadowRoot ? el.shadowRoot.host : null);
      while (parent) {
        if (set.has(parent)) {
          return false;
        }
        parent = parent.parentNode || parent.host || null;
      }
      return true;
    });
  }

  function cleanMessageText(element) {
    if (!element) return '';
    try {
      const clone = element.cloneNode(true);
      // Remove utility buttons, menus, icons, avatars, tooltips
      const selectorsToRemove = [
        'button', 'svg', '.sr-only', '[role="tooltip"]', 
        '[class*="actions"]', '[class*="button"]', '[class*="avatar"]',
        '.copy-button', '.feedback-button', '.regenerate-button', 'style', 'script'
      ];
      selectorsToRemove.forEach(sel => {
        clone.querySelectorAll(sel).forEach(node => node.remove());
      });
      // Use textContent instead of attaching to live DOM
      // Walk text nodes to preserve line breaks from block elements
      const text = extractTextWithBreaks(clone).trim();
      return text.replace(/\n{3,}/g, '\n\n');
    } catch (e) {
      const text = element.textContent ? element.textContent.trim() : '';
      return text.replace(/\n{3,}/g, '\n\n');
    }
  }

  function extractTextWithBreaks(node) {
    let text = '';
    const blockTags = new Set(['DIV', 'P', 'BR', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'BLOCKQUOTE', 'TR']);
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.tagName === 'BR') {
          text += '\n';
        } else {
          const childText = extractTextWithBreaks(child);
          if (blockTags.has(child.tagName) && childText) {
            text += '\n' + childText + '\n';
          } else {
            text += childText;
          }
        }
      }
    }
    return text;
  }

  // --- ChatGPT Extractor ---
  function captureChatGPT(config) {
    const list = [];
    const turns = document.querySelectorAll(config.turnSelector);
    if (turns.length === 0) return list;

    turns.forEach(turn => {
      if (!isElementVisible(turn)) return; // Skip hidden/cached turns
      
      const isUser = turn.querySelector(config.userIndicatorSelector) || turn.classList.contains('user-turn') || turn.innerHTML.includes('user-avatar');
      const textEl = turn.querySelector(config.textSelector);
      if (textEl) {
        const text = cleanMessageText(textEl);
        if (text) {
          list.push({
            role: isUser ? 'user' : 'assistant',
            text: text
          });
        }
      }
    });
    return list;
  }

  // --- Claude Extractor ---
  function captureClaude(config) {
    const list = [];
    const messageElements = document.querySelectorAll(config.messageSelector);
    const uniqueElements = filterTopLevelElements(messageElements);

    uniqueElements.forEach(el => {
      if (!isElementVisible(el)) return; // Skip hidden/cached messages
      
      let role = 'assistant';
      if ((el.matches && el.matches(config.userIndicatorSelector)) || (el.querySelector && el.querySelector(config.userIndicatorSelector)) || el.classList.contains('user-message')) {
        role = 'user';
      } else {
        // Try heuristic class check
        if (el.className && typeof el.className === 'string' && el.className.includes('user')) role = 'user';
      }

      const text = cleanMessageText(el);
      if (text && text.length > 2 && text !== 'Copy code') {
        list.push({ role, text });
      }
    });

    return list;
  }

  // --- Gemini Extractor ---
  function captureGemini(config) {
    const list = [];
    const elements = document.querySelectorAll(config.messageSelector);
    const uniqueElements = filterTopLevelElements(elements);

    uniqueElements.forEach(el => {
      if (!isElementVisible(el)) return; // Skip hidden/cached messages
      
      let role = 'assistant';
      const className = typeof el.className === 'string' ? el.className : '';
      
      if ((el.matches && el.matches(config.userIndicatorSelector)) || (el.querySelector && el.querySelector(config.userIndicatorSelector)) || className.includes('user-query') || el.classList.contains('query-content')) {
        role = 'user';
      }
      const text = cleanMessageText(el);
      if (text) {
        list.push({ role, text });
      }
    });
    return list;
  }

  // --- Mistral Extractor ---
  function captureMistral(config) {
    const list = [];
    const bubbles = document.querySelectorAll(config.messageSelector);
    const uniqueElements = filterTopLevelElements(bubbles);

    uniqueElements.forEach(el => {
      if (!isElementVisible(el)) return; // Skip hidden/cached messages
      
      let role = 'assistant';
      const className = typeof el.className === 'string' ? el.className : '';
      const style = window.getComputedStyle(el);
      
      const isRightAligned = style.textAlign === 'right' || 
                             style.justifyContent === 'flex-end' || 
                             (el.matches && el.matches(config.userIndicatorSelector)) ||
                             (el.querySelector && el.querySelector(config.userIndicatorSelector)) ||
                             className.includes('user') || 
                             className.includes('Human') || 
                             className.includes('sent') || 
                             className.includes('self-end');
      if (isRightAligned) {
        role = 'user';
      }
      const text = cleanMessageText(el);
      if (text) {
        list.push({ role, text });
      }
    });
    return list;
  }

  // --- DeepSeek Extractor ---
  function captureDeepSeek(config) {
    const list = [];
    const turns = document.querySelectorAll(config.messageSelector);
    const uniqueElements = filterTopLevelElements(turns);

    uniqueElements.forEach(el => {
      if (!isElementVisible(el)) return; // Skip hidden/cached messages
      
      let role = 'assistant';
      const className = typeof el.className === 'string' ? el.className : '';
      const style = window.getComputedStyle(el);
      
      const isRightAligned = style.textAlign === 'right' || 
                             style.justifyContent === 'flex-end' || 
                             (el.matches && el.matches(config.userIndicatorSelector)) ||
                             (el.querySelector && el.querySelector(config.userIndicatorSelector)) ||
                             className.includes('user') || 
                             className.includes('right') || 
                             className.includes('question') ||
                             className.includes('sent') ||
                             className.includes('self-end');
      if (isRightAligned) {
        role = 'user';
      }
      const text = cleanMessageText(el);
      if (text) {
        list.push({ role, text });
      }
    });
    return list;
  }

  // --- Robust Fallback Extractor ---
  function captureFallback() {
    const list = [];
    // Find all message-like elements
    const elements = document.querySelectorAll('p, pre, li, div.text-base, div[class*="message"], div[class*="chat"], div[class*="bubble"], div[class*="markdown"]');
    const uniqueElements = filterTopLevelElements(elements);

    uniqueElements.forEach(el => {
      if (!isElementVisible(el)) return; // Skip hidden elements
      
      // Avoid scraping sidebars, menus, headers, or buttons
      if (el.closest('nav') || el.closest('header') || el.closest('footer') || 
          el.closest('[class*="sidebar"]') || el.closest('[class*="navigation"]') || 
          el.closest('#sidebar') || el.closest('[role="navigation"]') ||
          el.closest('button') || el.closest('a') || el.closest('[role="menu"]')) {
        return;
      }

      const text = el.innerText.trim();
      if (!text || text.length < 10) return;
      if (text.includes('Terms of Service') || text.includes('Privacy Policy') || text.startsWith('Sign in') || text.includes('ChatGPT') || text.includes('Claude') || text.includes('Mistral')) {
        return; // Noise
      }

      // Check alignment or background colors or classes to infer role
      const style = window.getComputedStyle(el);
      const className = typeof el.className === 'string' ? el.className : '';
      const isRightAligned = style.textAlign === 'right' || 
                             style.justifyContent === 'flex-end' ||
                             className.includes('user') ||
                             className.includes('human') ||
                             className.includes('prompt') ||
                             className.includes('query') ||
                             className.includes('sent');
      
      const role = isRightAligned ? 'user' : 'assistant';
      list.push({ role, text });
    });

    return list;
  }
})();
