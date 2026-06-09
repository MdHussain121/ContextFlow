/**
 * ContextFlow Popup Controller
 * Manages UI rendering, tab detection, context capture, and hydration triggers.
 */

// Supported Chatbot configurations
const CHATBOTS = [
  {
    key: 'chatgpt',
    name: 'ChatGPT',
    url: 'https://chatgpt.com/',
    domain: 'chatgpt.com',
    icon: '<div class="sync-card-icon" style="font-family: var(--font-heading); font-weight:800; font-size:16px; border:2px solid black; padding: 2px 4px; border-radius:4px; background:#000; color:#fff;">AI</div>'
  },
  {
    key: 'claude',
    name: 'Claude',
    url: 'https://claude.ai/new',
    domain: 'claude.ai',
    icon: '<div class="sync-card-icon" style="font-family: var(--font-heading); font-weight:800; font-size:16px; border:2px solid black; padding: 2px 4px; border-radius:4px;">AI</div>'
  },
  {
    key: 'gemini',
    name: 'Gemini',
    url: 'https://gemini.google.com/app',
    domain: 'gemini.google.com',
    icon: '<span style="font-size: 20px; font-weight:800;">✦</span>'
  },
  {
    key: 'mistral',
    name: 'Mistral',
    url: 'https://chat.mistral.ai/',
    domain: 'chat.mistral.ai',
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="3" fill="none" style="transform:translateY(1px);"><path d="M3 6h4v12H3zm7 0h4v12h-4zm7 0h4v12h-4z"/></svg>'
  },
  {
    key: 'deepseek',
    name: 'DeepSeek',
    url: 'https://chat.deepseek.com/',
    domain: 'chat.deepseek.com',
    icon: '<div class="sync-card-icon" style="font-family: var(--font-heading); font-weight:800; font-size:16px; border:2px solid black; padding: 2px 4px; border-radius:4px; background:var(--warning-color);">DS</div>'
  }
];

let activeTabInfo = {
  id: null,
  url: '',
  domain: '',
  chatbotKey: '' // 'chatgpt', 'claude', etc., or empty
};

let capturedContext = null;

document.addEventListener('DOMContentLoaded', () => {
  initOptions();
  detectActiveTab();
  setupEventListeners();
});

// --- Settings and Preferences ---
function initOptions() {
  chrome.storage.local.get(['options'], (data) => {
    if (data.options) {
      document.getElementById('opt-system').checked = !!data.options.includeSystemInstructions;
      document.getElementById('opt-reuse').checked = !!data.options.reuseTabs;
    }
  });
}

function saveOptions() {
  const options = {
    compressHistory: false,
    includeSystemInstructions: document.getElementById('opt-system').checked,
    reuseTabs: document.getElementById('opt-reuse').checked,
    compressionMode: 'full'
  };
  chrome.storage.local.set({ options });
}

function setupEventListeners() {
  document.getElementById('opt-system').addEventListener('change', saveOptions);
  document.getElementById('opt-reuse').addEventListener('change', saveOptions);

  document.getElementById('hydrate-btn').addEventListener('click', () => {
    if (capturedContext && capturedContext.messages.length > 0) {
      // Copy to clipboard as standard behavior when hydrating active input
      const options = getActiveOptions();
      const compressed = compressContext(capturedContext.messages, options.compressionMode);
      const prompt = generateHydrationPrompt(compressed, {
        title: capturedContext.title,
        source: getChatbotName(activeTabInfo.chatbotKey),
        includeSystemInstructions: options.includeSystemInstructions
      });
      
      navigator.clipboard.writeText(prompt).then(() => {
        const btn = document.getElementById('hydrate-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '⚡ COPIED TO CLIPBOARD!';
        btn.style.backgroundColor = 'var(--warning-color)';
        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.style.backgroundColor = 'var(--success-color)';
        }, 1500);
      });
    }
  });
}

function getActiveOptions() {
  return {
    compressHistory: false,
    includeSystemInstructions: document.getElementById('opt-system').checked,
    reuseTabs: document.getElementById('opt-reuse').checked,
    compressionMode: 'full'
  };
}

// --- Active Tab Detection & Scrape ---
function detectActiveTab() {
  console.log('[ContextFlow Popup] detectActiveTab initiated');
  // Try querying background for the last active tab first (crucial for automated testing)
  chrome.runtime.sendMessage({ action: 'getLastActiveTab' }, (response) => {
    console.log('[ContextFlow Popup] getLastActiveTab response:', response);
    if (response && response.tab) {
      console.log('[ContextFlow Popup] Using last active tab from background:', response.tab.id, response.tab.url);
      processTab(response.tab);
    } else {
      console.log('[ContextFlow Popup] Last active tab not found in background, running standard fallback...');
      // Standard query fallback
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        console.log('[ContextFlow Popup] Active tabs query returned:', tabs);
        if (tabs.length === 0) return;
        const tab = tabs[0];
        
        if (tab.url && tab.url.startsWith('chrome-extension://')) {
          console.log('[ContextFlow Popup] Active tab is extension popup, querying all tabs in current window...');
          chrome.tabs.query({ currentWindow: true }, (allTabs) => {
            console.log('[ContextFlow Popup] All tabs in current window:', allTabs.map(t => ({ id: t.id, url: t.url, title: t.title, active: t.active })));
            const chatbotTab = allTabs.find(t => {
              if (!t.url) return false;
              const matches = CHATBOTS.some(bot => t.url.includes(bot.domain));
              console.log(`[ContextFlow Popup] Checking tab: ${t.url} - matches chatbot: ${matches}`);
              return matches;
            });
            
            if (chatbotTab) {
              console.log('[ContextFlow Popup] Found chatbot tab fallback:', chatbotTab.id, chatbotTab.url);
              processTab(chatbotTab);
            } else {
              const otherTab = allTabs.find(t => t.url && !t.url.startsWith('chrome-extension://'));
              console.log('[ContextFlow Popup] Fallback to other non-extension tab:', otherTab ? otherTab.url : 'none');
              processTab(otherTab || tab);
            }
          });
        } else {
          processTab(tab);
        }
      });
    }
  });
}

function processTab(tab) {
  activeTabInfo.id = tab.id;
  activeTabInfo.url = tab.url || '';
  
  try {
    if (activeTabInfo.url.includes('mock_chat.html')) {
      const urlParts = activeTabInfo.url.split('?');
      const params = new URLSearchParams(urlParts[1] || '');
      activeTabInfo.domain = `mock_${params.get('bot') || 'chat'}`;
    } else {
      const urlObj = new URL(activeTabInfo.url);
      activeTabInfo.domain = urlObj.hostname.replace('www.', '');
    }
  } catch(e) {
    activeTabInfo.domain = 'external_page';
  }

  // Match domain to supported chatbots (support both live domain and mock query parameters)
  const matchedBot = activeTabInfo.url ? CHATBOTS.find(bot => activeTabInfo.url.includes(bot.domain) || activeTabInfo.url.includes(`bot=${bot.key}`)) : null;
  if (matchedBot) {
    activeTabInfo.chatbotKey = matchedBot.key;
    document.getElementById('active-tab-domain').innerText = activeTabInfo.domain;
  } else {
    activeTabInfo.chatbotKey = '';
    document.getElementById('active-tab-domain').innerText = activeTabInfo.domain || 'unknown';
  }

  renderSyncGrid();
  
  if (activeTabInfo.chatbotKey) {
    // It is a supported chatbot page, let's extract context
    extractContextFromTab();
  } else {
    updateUIStatusNoBuffer();
  }
}

function extractContextFromTab() {
  // Update status to searching
  document.getElementById('buffer-status-text').innerText = 'HYDRATING BUFFER...';
  document.getElementById('status-dot').className = 'status-dot warning';

  console.log(`[ContextFlow Popup] Requesting capture.js execution on tabId: ${activeTabInfo.id}, url: ${activeTabInfo.url}`);

  chrome.scripting.executeScript({
    target: { tabId: activeTabInfo.id },
    files: ['content/capture.js']
  }, (results) => {
    if (chrome.runtime.lastError) {
      console.error('[ContextFlow Popup] Script execution error:', chrome.runtime.lastError.message);
      updateUIStatusNoBuffer();
      return;
    }

    if (!results || !results[0] || !results[0].result) {
      console.warn('[ContextFlow Popup] No script execution results returned.');
      updateUIStatusNoBuffer();
      return;
    }

    const captureResult = results[0].result;
    console.log(`[ContextFlow Popup] Capture script returned platform: ${captureResult.platform}, messages: ${captureResult.messages ? captureResult.messages.length : 0}`);
    
    if (captureResult.messages && captureResult.messages.length > 0) {
      capturedContext = captureResult;
      updateUIStatusHydrated(captureResult);
    } else {
      updateUIStatusNoBuffer();
    }
  });
}

// --- UI Rendering ---
function renderSyncGrid() {
  const gridContainer = document.getElementById('sync-grid');
  gridContainer.innerHTML = '';

  CHATBOTS.forEach(bot => {
    const isCurrent = (bot.key === activeTabInfo.chatbotKey);
    
    // Create card element
    const card = document.createElement('div');
    card.className = `sync-card ${isCurrent ? 'disabled' : ''}`;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', isCurrent ? '-1' : '0');
    
    card.innerHTML = `
      <div class="sync-card-icon">${bot.icon}</div>
      <div class="sync-card-text">
        Open in<br><strong>${bot.name}</strong>
      </div>
    `;

    if (!isCurrent) {
      card.addEventListener('click', () => triggerTransfer(bot));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          triggerTransfer(bot);
        }
      });
    }

    gridContainer.appendChild(card);
  });
}

function updateUIStatusHydrated(context) {
  const msgCount = context.messages.length;
  const turns = Math.ceil(msgCount / 2);
  
  // Estimate tokens based on words (approx 1.3 tokens per word)
  let wordCount = 0;
  context.messages.forEach(msg => {
    const text = msg.text || '';
    wordCount += text.trim().split(/\s+/).filter(w => w.length > 0).length;
  });
  const tokens = Math.round(wordCount * 1.3);
  
  // Format token output (e.g. 2.4k)
  const tokenString = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens;

  // Set texts
  document.getElementById('buffer-status-text').innerText = 'BUFFER HYDRATED';
  document.getElementById('stats-text').innerText = `Turns: ${turns} Messages | Tokens: ~${tokenString}`;
  document.getElementById('status-dot').className = 'status-dot hydrated';

  // Progress bar logic (18% for 2.4k tokens -> 100% capacity is around 13k tokens)
  const percentage = Math.min(100, Math.max(5, Math.round((tokens / 13000) * 100)));
  document.getElementById('progress-fill').style.width = `${percentage}%`;
  document.getElementById('progress-percentage').innerText = `${percentage}%`;

  // Enable buttons
  document.getElementById('hydrate-btn').disabled = false;
}

function updateUIStatusNoBuffer() {
  document.getElementById('buffer-status-text').innerText = 'NO BUFFER';
  document.getElementById('stats-text').innerText = 'Turns: 0 Messages | Tokens: ~0';
  document.getElementById('status-dot').className = 'status-dot';
  document.getElementById('progress-fill').style.width = '0%';
  document.getElementById('progress-percentage').innerText = '0%';
  document.getElementById('hydrate-btn').disabled = true;
}

// --- Context Transfer Actions ---
function triggerTransfer(targetBot) {
  if (!capturedContext || capturedContext.messages.length === 0) return;

  const options = getActiveOptions();
  
  // 1. Compress context
  const compressed = compressContext(capturedContext.messages, options.compressionMode);

  // 2. Generate Prompt
  const prompt = generateHydrationPrompt(compressed, {
    title: capturedContext.title,
    source: getChatbotName(activeTabInfo.chatbotKey),
    includeSystemInstructions: options.includeSystemInstructions
  });

  // Helper function to initiate tab transition
  const initiateTransfer = () => {
    chrome.runtime.sendMessage({
      action: 'openChatbot',
      url: targetBot.url,
      domainKey: targetBot.key,
      reuseTabs: options.reuseTabs,
      prompt: prompt
    }, (response) => {
      // Close popup
      window.close();
    });
  };

  // 3. Write to clipboard and initiate transfer
  navigator.clipboard.writeText(prompt)
    .then(initiateTransfer)
    .catch((err) => {
      console.warn('Clipboard fallback write failed, proceeding with direct injection:', err);
      initiateTransfer();
    });
}

function getChatbotName(key) {
  const bot = CHATBOTS.find(b => b.key === key);
  return bot ? bot.name : 'Another Assistant';
}
