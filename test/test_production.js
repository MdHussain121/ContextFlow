/**
 * ContextFlow Real Production Integration Tests
 * Runs headfully on real domains (no mocks) and guides the user to log in if needed.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function runRealTests() {
  console.log('=== Starting ContextFlow Extension REAL Production Tests ===');
  console.log('This test will open real chatbot domains headfully on your machine.');
  console.log('If you are not logged in, please log in in the opened browser window within 60 seconds.\n');

  const extensionPath = path.resolve(__dirname, '..');
  // We use a persistent profile directory so your login sessions can be stored and reused
  const userDataDir = path.join(__dirname, 'scratch', 'production_test_profile');

  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  // Launch Chrome headfully with the extension loaded
  const browserContext = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  // Redirect console logs and errors from browser pages to Node console
  browserContext.on('page', page => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[ContextFlow')) {
        console.log(`[BROWSER CONSOLE] ${text}`);
      }
    });
    page.on('pageerror', err => console.error('[BROWSER ERROR]', err.message));
  });

  try {
    let [worker] = browserContext.serviceWorkers();
    if (!worker) {
      worker = await browserContext.waitForEvent('serviceworker');
    }
    const extensionId = worker.url().split('/')[2];
    console.log(`Extension loaded successfully. ID: ${extensionId}\n`);

    // --- TEST 1: ChatGPT ---
    console.log('[TEST 1] Testing ChatGPT (Real)...');
    const chatgptPage = await browserContext.newPage();
    await chatgptPage.goto('https://chatgpt.com/');
    
    console.log('Waiting for ChatGPT input box...');
    const chatgptInput = await chatgptPage.waitForSelector('#prompt-textarea', { timeout: 60000 });
    console.log('ChatGPT input found. Typing a test message...');
    await chatgptInput.fill('Hello from ContextFlow production test! Tell me in 1 sentence, what is the capital of Spain?');
    await chatgptPage.waitForTimeout(500);
    await chatgptInput.press('Enter');
    
    console.log('Waiting for assistant response...');
    // Wait for the response turn to appear
    await chatgptPage.waitForSelector('[data-testid="conversation-turn"]:nth-child(2) .markdown, div.markdown', { timeout: 60000 });
    console.log('Response received. Waiting 3 seconds for text to settle...');
    await chatgptPage.waitForTimeout(3000);

    // Open popup to capture
    console.log('Opening ContextFlow Popup to capture ChatGPT conversation...');
    const popupPage = await browserContext.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(3000); // Wait for scrape and UI update

    const statusText = await popupPage.innerText('#buffer-status-text');
    const statsText = await popupPage.innerText('#stats-text');
    console.log(`Popup Status: "${statusText}"`);
    console.log(`Popup Stats: "${statsText}"`);

    if (statusText === 'BUFFER HYDRATED') {
      console.log('✓ ChatGPT Capture Succeeded!');
    } else {
      throw new Error(`ChatGPT Capture failed! Status: ${statusText}`);
    }

    console.log('Selecting Full Context compression mode...');
    await popupPage.selectOption('#opt-compression', 'full');

    // --- TEST 2: Gemini ---
    console.log('\n[TEST 2] Testing Gemini (Real)...');
    // Open Gemini card in popup
    const geminiCard = popupPage.locator('.sync-card:not(.disabled)', { hasText: 'Gemini' });
    await geminiCard.click();

    console.log('Waiting for Gemini page tab to open...');
    const geminiPage = await browserContext.waitForEvent('page');
    console.log('Gemini page opened. Please log in if prompted. Waiting up to 60 seconds...');
    
    // Wait for input field (up to 60 seconds)
    const geminiInput = await geminiPage.waitForSelector('rich-textarea div[contenteditable="true"]', { timeout: 60000 });
    console.log('Gemini chat interface loaded!');
    
    console.log('Verifying injection in Gemini...');
    await geminiPage.waitForTimeout(3000); // Let inject.js run
    const geminiInjectedText = await geminiInput.evaluate(el => el.innerText);
    console.log(`Gemini Input Text length: ${geminiInjectedText.length}`);
    if (geminiInjectedText.includes('[PROJECT SUMMARY]') && geminiInjectedText.includes('ChatGPT')) {
      console.log('✓ Gemini Injection Succeeded!');
    } else {
      throw new Error('Gemini Injection failed! Input field is empty or incorrect.');
    }

    // Capture from Gemini
    console.log('Submitting prompt to Gemini to test capture...');
    await geminiInput.focus();
    await geminiInput.press('Enter');
    
    console.log('Waiting for Gemini response...');
    await geminiPage.waitForSelector('message-content, div.message-content', { timeout: 60000 });
    console.log('Gemini response received. Waiting 3 seconds for text to settle...');
    await geminiPage.waitForTimeout(3000);

    console.log('Opening ContextFlow Popup to capture Gemini conversation...');
    const popupPage2 = await browserContext.newPage();
    await popupPage2.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await popupPage2.waitForLoadState('domcontentloaded');
    await popupPage2.waitForTimeout(3000);

    const statusText2 = await popupPage2.innerText('#buffer-status-text');
    const statsText2 = await popupPage2.innerText('#stats-text');
    console.log(`Popup Status: "${statusText2}"`);
    console.log(`Popup Stats: "${statsText2}"`);
    
    if (statusText2 === 'BUFFER HYDRATED') {
      console.log('✓ Gemini Capture Succeeded!');
    } else {
      throw new Error('Gemini Capture failed!');
    }

    console.log('Selecting Full Context compression mode...');
    await popupPage2.selectOption('#opt-compression', 'full');

    // --- TEST 3: Mistral ---
    console.log('\n[TEST 3] Testing Mistral (Real)...');
    const mistralCard = popupPage2.locator('.sync-card:not(.disabled)', { hasText: 'Mistral' });
    await mistralCard.click();

    console.log('Waiting for Mistral page tab to open...');
    const mistralPage = await browserContext.waitForEvent('page');
    console.log('Mistral page opened. Please log in if prompted. Waiting up to 60 seconds...');
    
    const mistralInput = await mistralPage.waitForSelector('textarea[autofocus=""], textarea[placeholder*="message" i], textarea[placeholder*="Ask" i], textarea', { timeout: 60000 });
    console.log('Mistral chat interface loaded!');
    
    console.log('Verifying injection in Mistral...');
    await mistralPage.waitForTimeout(3000);
    const mistralInjectedText = await mistralInput.inputValue();
    console.log(`Mistral Input Text length: ${mistralInjectedText.length}`);
    if (mistralInjectedText.includes('[PROJECT SUMMARY]') && mistralInjectedText.includes('Gemini')) {
      console.log('✓ Mistral Injection Succeeded!');
    } else {
      throw new Error('Mistral Injection failed! Text area is empty or incorrect.');
    }

    console.log('\n=== All Real Production Tests PASSED successfully! ===');
  } catch (err) {
    console.error('\n❌ Real test execution failed with error:', err.message);
    try {
      const pages = browserContext.pages();
      console.log(`Attempting to capture screenshots of ${pages.length} open pages...`);
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        const title = await p.title().catch(() => 'Untitled');
        const url = p.url();
        const filename = `error_page_${i}_${Date.now()}.png`;
        const screenshotPath = path.join(__dirname, 'scratch', filename);
        await p.screenshot({ path: screenshotPath });
        console.log(`[SCREENSHOT] Saved screenshot of page ${i} ("${title}", URL: ${url}) to ${screenshotPath}`);
      }
    } catch (e) {
      console.error('Failed to capture error screenshots:', e.message);
    }
  } finally {
    console.log('\nClosing browser context in 15 seconds...');
    await new Promise(resolve => setTimeout(resolve, 15000));
    await browserContext.close();
  }
}

runRealTests();
