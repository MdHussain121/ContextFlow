/**
 * ContextFlow Matrix Test Suite
 * Validates all possible combinations of source/target chatbot platforms, compression modes, and options.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// Load logic engines
const { compressContext } = require('../modules/compression.js');
const { generateHydrationPrompt } = require('../modules/hydration.js');

const PLATFORMS = ['chatgpt', 'claude', 'gemini', 'mistral', 'deepseek'];
const MODES = ['minimal', 'balanced', 'full'];
const OPTIONS = [
  { includeSystemInstructions: true },
  { includeSystemInstructions: false }
];

// Load content scripts as strings for evaluation
const captureScript = fs.readFileSync(path.join(__dirname, '..', 'content', 'capture.js'), 'utf8');
const injectScript = fs.readFileSync(path.join(__dirname, '..', 'content', 'inject.js'), 'utf8');

async function runMatrixTests() {
  console.log('=== Starting ContextFlow Matrix Test Suite ===');
  console.log(`Platforms: ${PLATFORMS.join(', ')}`);
  console.log(`Modes: ${MODES.join(', ')}`);
  console.log(`Options: includeSystemInstructions (true/false)`);
  console.log('Total Combinations to Test: ' + (PLATFORMS.length * PLATFORMS.length * MODES.length * OPTIONS.length) + '\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  context.on('page', page => {
    page.on('console', msg => console.log(`[BROWSER CONSOLE]`, msg.text()));
    page.on('pageerror', err => console.error(`[BROWSER ERROR]`, err.message));
  });

  const dummyHtml = '<html><body><div id="test-root"></div></body></html>';
  await context.route(/.*chatgpt\.com.*/, route => route.fulfill({ contentType: 'text/html', body: dummyHtml }));
  await context.route(/.*claude\.ai.*/, route => route.fulfill({ contentType: 'text/html', body: dummyHtml }));
  await context.route(/.*gemini\.google\.com.*/, route => route.fulfill({ contentType: 'text/html', body: dummyHtml }));
  await context.route(/.*chat\.mistral\.ai.*/, route => route.fulfill({ contentType: 'text/html', body: dummyHtml }));
  await context.route(/.*chat\.deepseek\.com.*/, route => route.fulfill({ contentType: 'text/html', body: dummyHtml }));

  const page = await context.newPage();

  const DOMAINS = {
    chatgpt: 'chatgpt.com',
    claude: 'claude.ai',
    gemini: 'gemini.google.com',
    mistral: 'chat.mistral.ai',
    deepseek: 'chat.deepseek.com'
  };

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition, message) {
    if (condition) {
      passedTests++;
    } else {
      failedTests++;
      console.error(`[FAIL] ${message}`);
    }
  }

  try {
    for (const source of PLATFORMS) {
      console.log(`\n--- Testing Source: ${source.toUpperCase()} ---`);
      
      const srcDomain = DOMAINS[source];
      await page.goto(`https://${srcDomain}/mock_chat.html?bot=${source}`);

      // 1. Setup mock source DOM on page
      await page.evaluate((src) => {
        const root = document.getElementById('test-root') || document.body;
        if (src === 'chatgpt') {
          root.innerHTML = `
            <div data-testid="conversation-turn-1" class="user-turn">
              <div data-testid="user-turn">User</div>
              <div class="markdown">I want to learn Rust today. My objective is to build a project. We must avoid C++ memory unsafety.</div>
            </div>
            <div data-testid="conversation-turn-2">
              <div class="markdown">I decided that is a great choice! Rust prevents bugs. Here is a task: - Read the book</div>
            </div>
          `;
        } else if (src === 'claude') {
          root.innerHTML = `
            <div data-testid="user-message" class="user-message">I want to learn Rust today. My objective is to build a project. We must avoid C++ memory unsafety.</div>
            <div data-testid="assistant-message" class="font-claude-message">I decided that is a great choice! Rust prevents bugs. Here is a task: - Read the book</div>
          `;
        } else if (src === 'gemini') {
          root.innerHTML = `
            <user-query class="query-content">I want to learn Rust today. My objective is to build a project. We must avoid C++ memory unsafety.</user-query>
            <message-content class="message-content">I decided that is a great choice! Rust prevents bugs. Here is a task: - Read the book</message-content>
          `;
        } else if (src === 'mistral') {
          root.innerHTML = `
            <div class="message-user" style="text-align: right;">I want to learn Rust today. My objective is to build a project. We must avoid C++ memory unsafety.</div>
            <div class="message-assistant">I decided that is a great choice! Rust prevents bugs. Here is a task: - Read the book</div>
          `;
        } else if (src === 'deepseek') {
          root.innerHTML = `
            <div class="message user self-end" style="text-align: right;">I want to learn Rust today. My objective is to build a project. We must avoid C++ memory unsafety.</div>
            <div class="message assistant">I decided that is a great choice! Rust prevents bugs. Here is a task: - Read the book</div>
          `;
        }
      }, source);

      // 2. Execute Capture Script
      const captureResult = await page.evaluate(captureScript);
      
      assert(captureResult.platform === source, `[Capture ${source}] Should identify platform correctly`);
      assert(captureResult.messages.length === 2, `[Capture ${source}] Should extract exactly 2 turns`);
      assert(captureResult.messages[0].role === 'user', `[Capture ${source}] Turn 1 should be user`);
      assert(captureResult.messages[0].text.includes('Rust'), `[Capture ${source}] Turn 1 text should match`);
      assert(captureResult.messages[1].role === 'assistant', `[Capture ${source}] Turn 2 should be assistant`);

      // Skip the rest of combinations for this source if capture failed to prevent spamming fails
      if (captureResult.messages.length !== 2) {
        console.error(`Skipping target testing for source ${source} due to capture failure.`);
        continue;
      }

      // 3. Loop through all combinations of target, compression mode, and options
      for (const target of PLATFORMS) {
        for (const mode of MODES) {
          for (const opt of OPTIONS) {
            // Compress and Hydrate locally in Node
            const compressed = compressContext(captureResult.messages, mode);
            const prompt = generateHydrationPrompt(compressed, {
              title: 'Rust Learning Project',
              source: source,
              includeSystemInstructions: opt.includeSystemInstructions
            });

            // Validate compression outcomes
            if (mode === 'minimal') {
              assert(compressed.objectives.length > 0, `[Compress minimal] Should have objectives`);
              assert(compressed.decisions.length === 0, `[Compress minimal] Should NOT have decisions`);
            } else if (mode === 'balanced') {
              assert(compressed.objectives.length > 0, `[Compress balanced] Should have objectives`);
              assert(compressed.decisions.length > 0, `[Compress balanced] Should have decisions`);
              assert(compressed.constraints.length > 0, `[Compress balanced] Should have constraints`);
            } else if (mode === 'full') {
              assert(compressed.history.length === 2, `[Compress full] Should preserve all history`);
            }

            // Navigate to target domain
            const trgDomain = DOMAINS[target];
            await page.goto(`https://${trgDomain}/mock_chat.html?bot=${target}`);

            // Setup mock target input DOM on page
            await page.evaluate((trg) => {
              const root = document.getElementById('test-root') || document.body;
              if (trg === 'chatgpt') {
                root.innerHTML = '<textarea id="prompt-textarea"></textarea>';
              } else if (trg === 'claude') {
                root.innerHTML = '<div class="ProseMirror" contenteditable="true"></div>';
              } else if (trg === 'gemini') {
                root.innerHTML = '<rich-textarea><div contenteditable="true" role="combobox"></div></rich-textarea>';
              } else if (trg === 'mistral') {
                root.innerHTML = '<textarea placeholder="Ask Mistral anything..."></textarea>';
              } else if (trg === 'deepseek') {
                root.innerHTML = '<textarea id="chat-input"></textarea>';
              }
            }, target);

            // Mock chrome storage and runtime for inject.js mapping
            await page.evaluate(({ trg, promptText }) => {
              // Setup chrome extension mock storage
              window.chrome = {
                storage: {
                  local: {
                    get: (keys, callback) => {
                      callback({
                        pendingInjections: {
                          [trg]: promptText
                        }
                      });
                    },
                    set: (data, callback) => {
                      if (callback) callback();
                    }
                  }
                },
                runtime: {
                  sendMessage: (msg, callback) => {
                    if (msg && msg.action === 'getTabPrompt') {
                      if (callback) callback({ prompt: promptText });
                    } else if (msg && msg.action === 'clearTabPrompt') {
                      if (callback) callback({ success: true });
                    }
                  },
                  onMessage: {
                    addListener: () => {}
                  }
                }
              };
            }, { trg: target, promptText: prompt });

            // Run injection script
            await page.evaluate(injectScript);
            await page.waitForTimeout(650); // Give the 500ms inject.js setTimeout time to resolve

            // Check if injected successfully
            const injectedVal = await page.evaluate((trg) => {
              if (trg === 'chatgpt') {
                return document.querySelector('#prompt-textarea').value;
              } else if (trg === 'claude') {
                return document.querySelector('.ProseMirror').innerText;
              } else if (trg === 'gemini') {
                return document.querySelector('rich-textarea div[contenteditable="true"]').innerText;
              } else if (trg === 'mistral') {
                return document.querySelector('textarea[placeholder*="Mistral"]').value;
              } else if (trg === 'deepseek') {
                return document.querySelector('#chat-input').value;
              }
              return '';
            }, target);

            const hasSystemText = prompt.includes('[SYSTEM CONTEXT]');
            assert(injectedVal.length > 0, `[Injection ${source} -> ${target} (${mode}, system=${opt.includeSystemInstructions})] Injected value should not be empty`);
            assert(injectedVal.includes('Rust Learning Project'), `[Injection ${source} -> ${target}] Should contain project title`);
            assert(injectedVal.includes('[PROJECT SUMMARY]'), `[Injection ${source} -> ${target}] Should contain summary block`);
            assert(injectedVal.includes('[CONTINUE FROM HERE]'), `[Injection ${source} -> ${target}] Should contain continue instruction`);
            assert(injectedVal.includes('[SYSTEM CONTEXT]') === hasSystemText, `[Injection ${source} -> ${target}] System context block presence should match preference`);
          }
        }
      }
    }

    console.log(`\n=== Matrix Test Summary: ${passedTests} checks passed, ${failedTests} checks failed ===`);
    if (failedTests > 0) {
      process.exit(1);
    } else {
      console.log('✓ All platform combination tests passed flawlessly!');
      process.exit(0);
    }

  } catch (err) {
    console.error('❌ Matrix test execution encountered fatal error:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runMatrixTests();
