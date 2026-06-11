/**
 * ContextFlow Capture Script
 * Runs in the context of the active chatbot tab to extract the conversation history.
 */
(function() {
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
    messages = captureChatGPT();
  } else if (url.includes('claude.ai') || url.includes('bot=claude')) {
    platform = 'claude';
    messages = captureClaude();
  } else if (url.includes('gemini.google.com') || url.includes('bot=gemini')) {
    platform = 'gemini';
    messages = captureGemini();
  } else if (url.includes('chat.mistral.ai') || url.includes('bot=mistral')) {
    platform = 'mistral';
    messages = captureMistral();
  } else if (url.includes('chat.deepseek.com') || url.includes('bot=deepseek')) {
    platform = 'deepseek';
    messages = captureDeepSeek();
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
      return extractTextWithBreaks(clone).trim();
    } catch (e) {
      return element.textContent ? element.textContent.trim() : '';
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
  // Selectors last verified: June 2026
  function captureChatGPT() {
    const list = [];
    const turns = document.querySelectorAll('[data-testid^="conversation-turn"]');
    if (turns.length === 0) return list;

    turns.forEach(turn => {
      if (!isElementVisible(turn)) return; // Skip hidden/cached turns
      
      const isUser = turn.querySelector('[data-testid="user-turn"]') || turn.classList.contains('user-turn') || turn.innerHTML.includes('user-avatar') || turn.querySelector('img[alt="User"]');
      const textEl = turn.querySelector('.markdown, div.text-base, div.w-full');
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
  // Selectors last verified: June 2026
  function captureClaude() {
    const list = [];
    // Claude uses data-testid="user-message" and class .font-claude-message or data-testid="assistant-message"
    const messageElements = document.querySelectorAll('[data-testid="user-message"], [data-testid="assistant-message"], .font-claude-message, .user-message, div.grid.grid-cols-1.gap-4');
    
    const uniqueElements = filterTopLevelElements(messageElements);

    uniqueElements.forEach(el => {
      if (!isElementVisible(el)) return; // Skip hidden/cached messages
      
      let role = 'assistant';
      if (el.getAttribute('data-testid') === 'user-message' || el.classList.contains('user-message')) {
        role = 'user';
      } else if (el.getAttribute('data-testid') === 'assistant-message' || el.classList.contains('font-claude-message')) {
        role = 'assistant';
      } else {
        // Try heuristic class check
        if (el.className.includes('user')) role = 'user';
      }

      const text = cleanMessageText(el);
      if (text && text.length > 2 && text !== 'Copy code') {
        list.push({ role, text });
      }
    });

    return list;
  }

  // --- Gemini Extractor ---
  // Selectors last verified: June 2026
  function captureGemini() {
    const list = [];
    // User queries are in user-query or query-content, model responses in message-content
    const elements = document.querySelectorAll('user-query, .query-content, message-content, .query-text, div[class*="query-content"], div[class*="message-content"], div[class*="message_content"], div[class*="user-query"]');
    
    const uniqueElements = filterTopLevelElements(elements);

    uniqueElements.forEach(el => {
      const visible = isElementVisible(el);
      const tagName = el.tagName.toLowerCase();

      if (!visible) return; // Skip hidden/cached messages
      
      let role = 'assistant';
      const className = typeof el.className === 'string' ? el.className : '';
      
      if (tagName === 'user-query' || 
          className.includes('query-content') || 
          className.includes('query-text') || 
          className.includes('user-query') ||
          el.classList.contains('query-content') ||
          el.classList.contains('query-text')) {
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
  // Selectors last verified: June 2026
  function captureMistral() {
    const list = [];
    // Mistral chat bubbles are usually divs with classes containing user/assistant
    const bubbles = document.querySelectorAll('div[class*="message-user"], div[class*="message-assistant"], div[class*="message_user"], div[class*="message_assistant"], div[class*="message-content"], div[class*="message_content"]');
    
    const uniqueElements = filterTopLevelElements(bubbles);

    uniqueElements.forEach(el => {
      if (!isElementVisible(el)) return; // Skip hidden/cached messages
      
      let role = 'assistant';
      const className = typeof el.className === 'string' ? el.className : '';
      const style = window.getComputedStyle(el);
      
      const isRightAligned = style.textAlign === 'right' || 
                             style.justifyContent === 'flex-end' || 
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
  // Selectors last verified: June 2026
  function captureDeepSeek() {
    const list = [];
    const turns = document.querySelectorAll('div[class*="message"][class*="user"], div[class*="message"][class*="assistant"], div[class*="turn"], .ds-markdown');
    
    const uniqueElements = filterTopLevelElements(turns);

    uniqueElements.forEach(el => {
      if (!isElementVisible(el)) return; // Skip hidden/cached messages
      
      let role = 'assistant';
      const className = typeof el.className === 'string' ? el.className : '';
      const style = window.getComputedStyle(el);
      
      const isRightAligned = style.textAlign === 'right' || 
                             style.justifyContent === 'flex-end' || 
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
