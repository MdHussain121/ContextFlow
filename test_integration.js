/**
 * ContextFlow Automated Chrome Integration Tests
 * Uses Playwright to verify extension capture, settings, UI rendering, and injection.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function runTests() {
  console.log('=== Starting ContextFlow Extension Chrome Integration Tests ===\n');

  const extensionPath = path.resolve(__dirname);
  const userDataDir = path.join(__dirname, 'scratch', 'test_profile');

  // Clean test profile directory to prevent service worker caching/pollution
  if (fs.existsSync(userDataDir)) {
    console.log('Cleaning existing test profile directory...');
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }

  // Launch Chrome headfully with the extension loaded
  const browserContext = await chromium.launchPersistentContext(userDataDir, {
    headless: false, // Required for extensions
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  // Redirect console logs and uncaught errors from browser pages to Node console
  browserContext.on('page', page => {
    page.on('console', msg => console.log(`[BROWSER CONSOLE - ${new URL(page.url()).pathname}]`, msg.text()));
    page.on('pageerror', err => console.error(`[BROWSER ERROR - ${new URL(page.url()).pathname}]`, err.message));
  });

  try {
    // 1. Retrieve the extension ID
    let [worker] = browserContext.serviceWorkers();
    if (!worker) {
      console.log('Waiting for extension service worker to register...');
      worker = await browserContext.waitForEvent('serviceworker');
    }
    const extensionId = worker.url().split('/')[2];
    console.log(`Extension loaded successfully. ID: ${extensionId}\n`);

    // Read the mock chat HTML template
    const mockChatHtml = fs.readFileSync(path.join(__dirname, 'popup', 'mock_chat.html'), 'utf8');

    // 2. Setup mock routing for chatbot domains using robust RegExps
    await browserContext.route(/.*chatgpt\.com.*/, async route => {
      await route.fulfill({
        contentType: 'text/html',
        body: mockChatHtml
      });
    });

    await browserContext.route(/.*gemini\.google\.com.*/, async route => {
      await route.fulfill({
        contentType: 'text/html',
        body: mockChatHtml
      });
    });

    await browserContext.route(/.*chat\.mistral\.ai.*/, async route => {
      await route.fulfill({
        contentType: 'text/html',
        body: mockChatHtml
      });
    });

    // Give service worker time to initialize and bind tab listeners
    console.log('Waiting 2 seconds for service worker stabilization...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // --- CASE 1: Capture ChatGPT & Inject into Gemini ---
    console.log('[TEST 1] Testing Capture from ChatGPT...');
    const chatgptPage = await browserContext.newPage();
    await chatgptPage.goto('https://chatgpt.com/mock_chat.html?bot=chatgpt');
    await chatgptPage.waitForLoadState('domcontentloaded');

    console.log('Opening ContextFlow Popup...');
    const popupPage = await browserContext.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await popupPage.waitForLoadState('domcontentloaded');

    // Enable testMode in extension storage to route all new tabs locally
    console.log('Enabling extension testMode...');
    await popupPage.evaluate(() => {
      return new Promise((resolve) => {
        chrome.storage.local.set({ testMode: true }, resolve);
      });
    });

    // Reload popup to apply testMode and re-detect active tab
    await popupPage.reload();
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(2000);

    const statusText = await popupPage.innerText('#buffer-status-text');
    const statsText = await popupPage.innerText('#stats-text');
    console.log(`Popup Status: "${statusText}"`);
    console.log(`Popup Stats: "${statsText}"`);

    if (statusText === 'BUFFER HYDRATED' && statsText.includes('Turns: 1')) {
      console.log('✓ Capture from ChatGPT succeeded!');
    } else {
      throw new Error(`Capture failed! Status: ${statusText}, Stats: ${statsText}`);
    }

    console.log('\n[TEST 2] Testing Injection into Gemini...');
    // In popup, click "Open in Gemini"
    const geminiCard = popupPage.locator('.sync-card:not(.disabled)', { hasText: 'Gemini' });
    await geminiCard.click();

    // The popup should close and open a new tab for Gemini (routed to local mock page)
    console.log('Waiting for Gemini page tab to open...');
    const geminiPage = await browserContext.waitForEvent('page');
    await geminiPage.waitForLoadState('domcontentloaded');

    // Check if the prompt was successfully injected into Gemini contenteditable
    console.log('Verifying injection in Gemini input box...');
    const geminiInput = geminiPage.locator('rich-textarea div[contenteditable="true"]:not(.ql-clipboard)');
    await geminiPage.waitForTimeout(2000); // Give injection script time to run

    const injectedText = await geminiInput.evaluate(el => el.innerText);
    console.log(`Injected text in Gemini starts with: "${injectedText.substring(0, 50)}..."`);

    if (injectedText.includes('[PROJECT SUMMARY]') && injectedText.includes('Mock ChatGPT Chat')) {
      console.log('✓ Injection into Gemini succeeded!');
    } else {
      throw new Error('Injection failed! Gemini prompt area is empty or wrong.');
    }

    // --- CASE 2: Capture Gemini & Inject into Mistral ---
    console.log('\n[TEST 3] Testing Capture from Gemini...');
    // Re-open popup on top of the Gemini tab
    const popupPage2 = await browserContext.newPage();
    await popupPage2.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await popupPage2.waitForLoadState('domcontentloaded');
    await popupPage2.waitForTimeout(2000);

    const statusText2 = await popupPage2.innerText('#buffer-status-text');
    const statsText2 = await popupPage2.innerText('#stats-text');
    console.log(`Popup Status: "${statusText2}"`);
    console.log(`Popup Stats: "${statsText2}"`);

    if (statusText2 === 'BUFFER HYDRATED' && statsText2.includes('Turns: 1')) {
      console.log('✓ Capture from Gemini succeeded!');
    } else {
      throw new Error(`Capture from Gemini failed! Status: ${statusText2}, Stats: ${statsText2}`);
    }

    console.log('\n[TEST 4] Testing Injection into Mistral...');
    const mistralCard = popupPage2.locator('.sync-card:not(.disabled)', { hasText: 'Mistral' });
    await mistralCard.click();

    console.log('Waiting for Mistral page tab to open...');
    const mistralPage = await browserContext.waitForEvent('page');
    await mistralPage.waitForLoadState('domcontentloaded');

    console.log('Verifying injection in Mistral textarea...');
    const mistralInput = mistralPage.locator('textarea[placeholder*="Mistral"]');
    await mistralPage.waitForTimeout(2000);

    const injectedTextMistral = await mistralInput.inputValue();
    console.log(`Injected text in Mistral starts with: "${injectedTextMistral.substring(0, 50)}..."`);

    if (injectedTextMistral.includes('[PROJECT SUMMARY]') && injectedTextMistral.includes('Mock Gemini Chat')) {
      console.log('✓ Injection into Mistral succeeded!');
    } else {
      throw new Error('Injection failed! Mistral textarea is empty or wrong.');
    }

    console.log('\n=== All Chrome Integration Tests PASSED successfully! ===');
  } catch (err) {
    console.error('\n❌ Test execution failed with error:', err.message);
    process.exit(1);
  } finally {
    await browserContext.close();
  }
}

runTests();
