# ContextFlow

Seamless context portability between AI assistants. Local-first, secure, and beautiful.

**ContextFlow** is a local-first Chrome extension that allows you to transfer ongoing conversation context, objectives, decisions, constraints, and active tasks from one AI (e.g., ChatGPT) to another (e.g., Claude) in under 10 seconds without losing state.

---

## Features

- **Context Capture**: Intelligent DOM scraper targeting active conversation content on ChatGPT, Claude, Gemini, Mistral, and DeepSeek.
- **Semantic Compression**: Automatically extracts Objectives, Decisions, Constraints, and Active Tasks from conversation history, reducing token footprint while preserving meaning.
- **Instant Hydration**: Generates standard markdown-formatted context prompts and injects them directly into the destination chatbot's input field.
- **Tab Reuse**: Reuses open chatbot tabs, switching focus automatically.
- **Secure & Local-First**: No servers, no remote APIs, no telemetry. Your chats stay on your machine.

---

## Installation & Setup

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** (top-left button).
5. Select the `ContextFlow` root directory containing `manifest.json`.

---

## Project Structure

```text
├── manifest.json         # Extension Manifest V3 configuration
├── background.js         # Service Worker managing messages and tabs
├── content/
│   ├── capture.js        # DOM scraping for conversation extraction
│   └── inject.js         # Input field detection and React-safe injection
├── modules/
│   ├── compression.js    # Rule-based context compression engine
│   └── hydration.js      # Prompt formatting engine
├── popup/
│   ├── popup.html        # Main extension UI (Neo-Brutalist design)
│   ├── popup.js          # Main UI controller
│   ├── popup.css         # UI Styling
│   └── mock_chat.html    # Sandbox environment for local testing
├── test/                 # Test suites for extension logic
└── icons/                # Extension action icons
```

---

## Local Testing

To test the extension locally without visiting live chatbot domains:
1. Navigate to the extension background page console (or set `testMode` to `true` in `chrome.storage.local`).
2. Open the popup and trigger a transfer. The extension will automatically route to the sandbox mock interface (`mock_chat.html`) inside the extension.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
