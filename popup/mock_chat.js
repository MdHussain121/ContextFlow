const urlParams = new URLSearchParams(window.location.search);
const bot = urlParams.get('bot') || 'chatgpt';
document.getElementById('bot-title').innerText = `Mock ${bot.toUpperCase()} Chat`;

const historyContainer = document.getElementById('chat-history');
const inputContainer = document.getElementById('input-area');

if (bot === 'chatgpt') {
  // ChatGPT elements
  // Turn 1: User
  const turn1 = document.createElement('div');
  turn1.setAttribute('data-testid', 'conversation-turn-1');
  turn1.className = 'user-turn';
  turn1.innerHTML = `
    <div data-testid="user-turn">User</div>
    <div class="markdown">Mock ChatGPT Chat user message</div>
  `;
  historyContainer.appendChild(turn1);

  // Turn 2: Assistant
  const turn2 = document.createElement('div');
  turn2.setAttribute('data-testid', 'conversation-turn-2');
  turn2.innerHTML = `
    <div class="markdown">ChatGPT response</div>
  `;
  historyContainer.appendChild(turn2);

  // Input field
  const textarea = document.createElement('textarea');
  textarea.id = 'prompt-textarea';
  textarea.placeholder = 'Message ChatGPT...';
  inputContainer.appendChild(textarea);

} else if (bot === 'gemini') {
  // Gemini elements
  // User query
  const userQ = document.createElement('user-query');
  userQ.className = 'query-content';
  userQ.innerText = 'Mock Gemini Chat user query';
  historyContainer.appendChild(userQ);

  // Assistant message
  const assistantM = document.createElement('message-content');
  assistantM.className = 'message-content';
  assistantM.innerText = 'Gemini response';
  historyContainer.appendChild(assistantM);

  // Input field
  const richTextarea = document.createElement('rich-textarea');
  const editableDiv = document.createElement('div');
  editableDiv.setAttribute('contenteditable', 'true');
  editableDiv.setAttribute('role', 'combobox');
  richTextarea.appendChild(editableDiv);
  inputContainer.appendChild(richTextarea);

} else if (bot === 'mistral') {
  // Mistral elements
  // User message
  const userMsg = document.createElement('div');
  userMsg.className = 'message-user';
  userMsg.innerText = 'Mock Mistral Chat user query';
  historyContainer.appendChild(userMsg);

  // Assistant message
  const assistantMsg = document.createElement('div');
  assistantMsg.className = 'message-assistant';
  assistantMsg.innerText = 'Mistral response';
  historyContainer.appendChild(assistantMsg);

  // Input field
  const textarea = document.createElement('textarea');
  textarea.placeholder = 'Ask Mistral anything...';
  inputContainer.appendChild(textarea);
} else if (bot === 'claude') {
  // Claude elements
  // User message
  const userMsg = document.createElement('div');
  userMsg.setAttribute('data-testid', 'user-message');
  userMsg.className = 'user-message';
  userMsg.innerText = 'Mock Claude Chat user query';
  historyContainer.appendChild(userMsg);

  // Assistant message
  const assistantMsg = document.createElement('div');
  assistantMsg.setAttribute('data-testid', 'assistant-message');
  assistantMsg.className = 'font-claude-message';
  assistantMsg.innerText = 'Claude response';
  historyContainer.appendChild(assistantMsg);

  // Input field
  const inputDiv = document.createElement('div');
  inputDiv.setAttribute('contenteditable', 'true');
  inputDiv.className = 'ProseMirror';
  inputDiv.style.minHeight = '80px';
  inputDiv.style.border = '1px solid #bbb';
  inputDiv.style.padding = '10px';
  inputContainer.appendChild(inputDiv);
} else if (bot === 'deepseek') {
  // DeepSeek elements
  // User message (right aligned)
  const userMsg = document.createElement('div');
  userMsg.className = 'message turn user';
  userMsg.style.textAlign = 'right';
  userMsg.innerHTML = `<div class="ds-markdown">Mock DeepSeek Chat user query</div>`;
  historyContainer.appendChild(userMsg);

  // Assistant message
  const assistantMsg = document.createElement('div');
  assistantMsg.className = 'message turn assistant';
  assistantMsg.innerHTML = `<div class="ds-markdown">DeepSeek response</div>`;
  historyContainer.appendChild(assistantMsg);

  // Input field
  const textarea = document.createElement('textarea');
  textarea.id = 'chat-input';
  textarea.placeholder = 'Ask DeepSeek anything...';
  inputContainer.appendChild(textarea);
}

// Programmatically load inject.js if page is loaded under the chrome-extension protocol (during tests)
if (window.location.protocol === 'chrome-extension:') {
  const injectScript = document.createElement('script');
  injectScript.src = '../content/inject.js';
  document.body.appendChild(injectScript);
}
