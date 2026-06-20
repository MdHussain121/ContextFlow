/**
 * ContextFlow Service Worker
 * Manages tab creation, reuse, and message routing.
 */

let lastActiveTabId = null;

// Restore lastActiveTabId from session storage on SW restart
chrome.storage.session.get(['lastActiveTabId'], (data) => {
  if (data.lastActiveTabId) {
    lastActiveTabId = data.lastActiveTabId;
  }
});

function isChatbotUrl(url) {
  if (!url) return false;
  const domains = ['chatgpt.com', 'claude.ai', 'gemini.google.com', 'chat.mistral.ai', 'chat.deepseek.com'];
  return domains.some(domain => url.includes(domain));
}

function isTestUrl(url) {
  return url && (url.includes('mock_chat.html') || url.includes('bot='));
}

// Track tab activation to support testing popup context retrieval
function persistActiveTab(tabId) {
  lastActiveTabId = tabId;
  chrome.storage.session.set({ lastActiveTabId: tabId });
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    if (isChatbotUrl(tab.url) || isTestUrl(tab.url)) {
      persistActiveTab(tab.id);
    }
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && (isChatbotUrl(tab.url) || isTestUrl(tab.url))) {
    persistActiveTab(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.get(['pendingInjections'], (data) => {
    const pendingInjections = data.pendingInjections || {};
    const tabKey = tabId.toString();
    if (pendingInjections[tabKey]) {
      delete pendingInjections[tabKey];
      chrome.storage.local.set({ pendingInjections });
    }
  });
});

chrome.runtime.onInstalled.addListener(() => {
  // Initialize default options if not set
  chrome.storage.local.get(['options'], (data) => {
    if (!data.options) {
      chrome.storage.local.set({
        options: {
          includeSystemInstructions: true,
          reuseTabs: true,
          compressionMode: 'balanced'
        },
        pendingInjections: {}
      });
    }
  });
});

// Listen for messages from the popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openChatbot') {
    const { url, domainKey, reuseTabs, prompt } = message;

    chrome.storage.local.get(['testMode'], (data) => {
      const isTest = !!data.testMode;
      let targetUrl = url;
      if (isTest) {
        if (domainKey === 'chatgpt') targetUrl = 'https://chatgpt.com/mock_chat.html?bot=chatgpt';
        else if (domainKey === 'claude') targetUrl = 'https://claude.ai/mock_chat.html?bot=claude';
        else if (domainKey === 'gemini') targetUrl = 'https://gemini.google.com/mock_chat.html?bot=gemini';
        else if (domainKey === 'mistral') targetUrl = 'https://chat.mistral.ai/mock_chat.html?bot=mistral';
        else if (domainKey === 'deepseek') targetUrl = 'https://chat.deepseek.com/mock_chat.html?bot=deepseek';
      }
      
      const createTab = (url, callback) => {
        if (isTest) {
          chrome.tabs.create({ url: 'about:blank' }, (tab) => {
            if (chrome.runtime.lastError || !tab) {
              console.error('[ContextFlow] Tab creation failed:', chrome.runtime.lastError ? chrome.runtime.lastError.message : 'no tab');
              if (callback) callback(null);
              return;
            }
            chrome.tabs.update(tab.id, { url }, () => {
              if (callback) callback(tab);
            });
          });
        } else {
          chrome.tabs.create({ url }, (tab) => {
            if (chrome.runtime.lastError || !tab) {
              console.error('[ContextFlow] Tab creation failed:', chrome.runtime.lastError ? chrome.runtime.lastError.message : 'no tab');
              if (callback) callback(null);
              return;
            }
            if (callback) callback(tab);
          });
        }
      };

      if (reuseTabs) {
        // Check if we have an open tab for this chatbot
        const matchPattern = isTest ? `mock_chat.html?bot=${domainKey}` : getMatchPattern(domainKey);
        chrome.tabs.query({}, (tabs) => {
          const existingTab = tabs.find(tab => tab.url && tab.url.includes(matchPattern));
          
          if (existingTab) {
            savePromptForTab(existingTab.id, prompt, () => {
              // Highlight and focus the tab
              chrome.tabs.update(existingTab.id, { active: true }, () => {
                chrome.windows.update(existingTab.windowId, { focused: true }, () => {
                  // Attempt to trigger injection instantly without reloading
                  chrome.tabs.sendMessage(existingTab.id, { action: 'triggerInjection' }, (res) => {
                    if (chrome.runtime.lastError || !res || !res.success) {
                      // Fallback: Script not loaded or tab in different state, reload tab
                      chrome.tabs.reload(existingTab.id);
                    }
                  });
                });
              });
              sendResponse({ success: true, tabReused: true });
            });
          } else {
            // Create new tab
            createTab(targetUrl, (newTab) => {
              if (newTab) {
                savePromptForTab(newTab.id, prompt, () => {
                  sendResponse({ success: true, tabReused: false });
                });
              } else {
                sendResponse({ success: false, error: 'Tab creation failed' });
              }
            });
          }
        });
      } else {
        // Always create new tab
        createTab(targetUrl, (newTab) => {
          if (newTab) {
            savePromptForTab(newTab.id, prompt, () => {
              sendResponse({ success: true, tabReused: false });
            });
          } else {
            sendResponse({ success: false, error: 'Tab creation failed' });
          }
        });
      }
    });

    return true; // Keep response channel open for async
  }

  if (message.action === 'getLastActiveTab') {
    // Read from session storage first in case in-memory cache was lost
    const resolveTab = (tabId) => {
      if (tabId) {
        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError || !tab) {
            sendResponse({ tab: null });
          } else {
            sendResponse({ tab });
          }
        });
      } else {
        sendResponse({ tab: null });
      }
    };

    if (lastActiveTabId) {
      resolveTab(lastActiveTabId);
    } else {
      chrome.storage.session.get(['lastActiveTabId'], (data) => {
        if (data.lastActiveTabId) {
          lastActiveTabId = data.lastActiveTabId;
        }
        resolveTab(lastActiveTabId);
      });
    }
    return true; // Keep response channel open for async
  }

  if (message.action === 'getTabPrompt') {
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId) {
      chrome.storage.local.get(['pendingInjections'], (data) => {
        const pendingInjections = data.pendingInjections || {};
        const prompt = pendingInjections[tabId.toString()];
        sendResponse({ prompt });
      });
      return true; // Keep channel open for async
    } else {
      sendResponse({ prompt: null });
    }
  }

  if (message.action === 'clearTabPrompt') {
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId) {
      chrome.storage.local.get(['pendingInjections'], (data) => {
        const pendingInjections = data.pendingInjections || {};
        if (pendingInjections[tabId.toString()]) {
          delete pendingInjections[tabId.toString()];
          chrome.storage.local.set({ pendingInjections }, () => {
            sendResponse && sendResponse({ success: true });
          });
        } else {
          sendResponse && sendResponse({ success: false });
        }
      });
      return true;
    }
  }
});

function getMatchPattern(domainKey) {
  switch (domainKey) {
    case 'chatgpt': return 'chatgpt.com';
    case 'claude': return 'claude.ai';
    case 'gemini': return 'gemini.google.com';
    case 'mistral': return 'chat.mistral.ai';
    case 'deepseek': return 'chat.deepseek.com';
    default: return domainKey;
  }
}

function savePromptForTab(tabId, promptText, callback) {
  chrome.storage.local.get(['pendingInjections'], (data) => {
    const pendingInjections = data.pendingInjections || {};
    pendingInjections[tabId.toString()] = promptText;
    chrome.storage.local.set({ pendingInjections }, callback);
  });
}
