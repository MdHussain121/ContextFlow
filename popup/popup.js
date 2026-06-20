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
      const compressionSelect = document.getElementById('opt-compression');
      if (compressionSelect && data.options.compressionMode) {
        compressionSelect.value = data.options.compressionMode;
      }
    }
  });
}

function saveOptions() {
  const options = {
    includeSystemInstructions: document.getElementById('opt-system').checked,
    reuseTabs: document.getElementById('opt-reuse').checked,
    compressionMode: document.getElementById('opt-compression').value
  };
  chrome.storage.local.set({ options });
}

function setupEventListeners() {
  document.getElementById('opt-system').addEventListener('change', saveOptions);
  document.getElementById('opt-reuse').addEventListener('change', saveOptions);
  document.getElementById('opt-compression').addEventListener('change', saveOptions);

  document.getElementById('hydrate-btn').addEventListener('click', () => {
    if (capturedContext && capturedContext.messages.length > 0) {
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
        
        const tabId = activeTabInfo.id;
        if (tabId && activeTabInfo.chatbotKey) {
          chrome.storage.local.get(['pendingInjections'], (data) => {
            const pendingInjections = data.pendingInjections || {};
            pendingInjections[tabId.toString()] = prompt;
            chrome.storage.local.set({ pendingInjections }, () => {
              chrome.tabs.sendMessage(tabId, { action: 'triggerInjection' }, (res) => {
                if (chrome.runtime.lastError || !res || !res.success) {
                  showToast('Clipboard fallback activated! Paste manually (Ctrl+V)', '#FFD54A');
                  setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.style.backgroundColor = 'var(--success-color)';
                  }, 1500);
                } else {
                  btn.innerHTML = '🚀 HYDRATED ACTIVE INPUT!';
                  btn.style.backgroundColor = 'var(--success-color)';
                  showToast('⚡ Input Hydrated Successfully!', '#7ED957');
                  setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.style.backgroundColor = 'var(--success-color)';
                  }, 1500);
                }
              });
            });
          });
        } else {
          setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.backgroundColor = 'var(--success-color)';
          }, 1500);
        }
      }).catch((err) => {
        console.error('Clipboard write failed:', err);
      });
    }
  });
}

function getActiveOptions() {
  return {
    includeSystemInstructions: document.getElementById('opt-system').checked,
    reuseTabs: document.getElementById('opt-reuse').checked,
    compressionMode: document.getElementById('opt-compression').value
  };
}

// --- Active Tab Detection & Scrape ---
function detectActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) return;
    const activeTab = tabs[0];

    const resolveTab = (tab) => {
      if (tab.url && tab.url.startsWith('chrome-extension://')) {
        chrome.tabs.query({ currentWindow: true }, (allTabs) => {
          const chatbotTab = allTabs.find(t => {
            if (!t.url) return false;
            return CHATBOTS.some(bot => t.url.includes(bot.domain) || t.url.includes(`bot=${bot.key}`)) || t.url.includes('mock_chat.html');
          });
          
          if (chatbotTab) {
            processTab(chatbotTab);
          } else {
            const otherTab = allTabs.find(t => t.url && !t.url.startsWith('chrome-extension://'));
            processTab(otherTab || tab);
          }
        });
      } else {
        processTab(tab);
      }
    };

    chrome.storage.local.get(['testMode'], (data) => {
      const isTestMode = !!data.testMode;
      if (isTestMode) {
        chrome.runtime.sendMessage({ action: 'getLastActiveTab' }, (response) => {
          if (response && response.tab) {
            processTab(response.tab);
          } else {
            resolveTab(activeTab);
          }
        });
      } else {
        resolveTab(activeTab);
      }
    });
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

  chrome.scripting.executeScript({
    target: { tabId: activeTabInfo.id },
    files: ['content/capture.js']
  }, (results) => {
    if (chrome.runtime.lastError) {
      console.error('[ContextFlow Popup] Script execution error:', chrome.runtime.lastError.message);
      updateUIStatusNoBuffer('ACCESS DENIED');
      return;
    }

    if (!results || !results[0] || !results[0].result) {
      console.warn('[ContextFlow Popup] No script execution results returned.');
      updateUIStatusNoBuffer('NO MESSAGES FOUND');
      return;
    }

    const captureResult = results[0].result;
    
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
    
    if (isCurrent) {
      return; // Skip rendering the button for the currently active chatbot
    }
    
    // Create card element
    const card = document.createElement('div');
    card.className = 'sync-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    
    // Check if context is empty
    const isBufferEmpty = !capturedContext || !capturedContext.messages || capturedContext.messages.length === 0;
    if (isBufferEmpty) {
      card.classList.add('disabled');
    }
    
    card.innerHTML = `
      <div class="sync-card-icon">${bot.icon}</div>
      <div class="sync-card-text">
        Open in<br><strong>${bot.name}</strong>
      </div>
    `;

    card.addEventListener('click', () => triggerTransfer(bot));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        triggerTransfer(bot);
      }
    });

    gridContainer.appendChild(card);
  });
}

function updateUIStatusHydrated(context) {
  const msgCount = context.messages.length;
  const turns = Math.ceil(msgCount / 2);
  
  // Estimate tokens using the unified helper from hydration.js
  let totalText = '';
  context.messages.forEach(msg => {
    totalText += (msg.text || '') + ' ';
  });
  const tokens = estimateTokens(totalText);
  
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
  
  // Re-render sync grid to enable cards
  renderSyncGrid();
}

function updateUIStatusNoBuffer(reason) {
  const statusText = reason || 'NO BUFFER';
  document.getElementById('buffer-status-text').innerText = statusText;
  document.getElementById('stats-text').innerText = reason ? 'Try refreshing the chatbot page' : 'Navigate to a chatbot to capture context';
  document.getElementById('status-dot').className = 'status-dot';
  document.getElementById('progress-fill').style.width = '0%';
  document.getElementById('progress-percentage').innerText = '0%';
  document.getElementById('hydrate-btn').disabled = true;
  
  // Re-render sync grid to disable cards
  renderSyncGrid();
}

// --- Context Transfer Actions ---
function triggerTransfer(targetBot) {
  if (!capturedContext || capturedContext.messages.length === 0) {
    showToast('No captured context to transfer!', '#FF6B6B');
    return;
  }

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

function showToast(message, bgColor) {
  const toast = document.createElement('div');
  toast.style.position = 'fixed';
  toast.style.bottom = '12px';
  toast.style.left = '50%';
  toast.style.transform = 'translate(-50%, 100px)';
  toast.style.backgroundColor = bgColor || 'var(--warning-color)';
  toast.style.color = '#000000';
  toast.style.border = '2px solid #000000';
  toast.style.borderRadius = '4px';
  toast.style.padding = '8px 16px';
  toast.style.fontFamily = 'var(--font-label)';
  toast.style.fontWeight = '600';
  toast.style.fontSize = '12px';
  toast.style.boxShadow = '3px 3px 0px #000000';
  toast.style.zIndex = '9999';
  toast.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
  toast.style.opacity = '0';
  toast.innerText = message;
  toast.style.width = 'max-content';

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.transform = 'translate(-50%, 0)';
    toast.style.opacity = '1';
  }, 50);

  setTimeout(() => {
    toast.style.transform = 'translate(-50%, 100px)';
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 2500);
}
