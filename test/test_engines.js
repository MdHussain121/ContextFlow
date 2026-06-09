/**
 * ContextFlow Automated Test Suite
 * Validates local compression and hydration business logic.
 */

const { compressContext } = require('./modules/compression.js');
const { generateHydrationPrompt } = require('./modules/hydration.js');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    testsPassed++;
    console.log(`[PASS] ${message}`);
  } else {
    testsFailed++;
    console.error(`[FAIL] ${message}`);
  }
}

// Mock conversation data
const mockHistory = [
  { role: 'user', text: 'Hey there! I want to create a Chrome extension. Our objective is to build it by tomorrow.' },
  { role: 'assistant', text: 'I can help with that. To succeed, we must make it local-first. We decided to use standard HTML, CSS, and JS.' },
  { role: 'user', text: 'Great. Let\'s make sure we avoid any external databases or servers. That is a major constraint.' },
  { role: 'assistant', text: 'Understood. Let\'s draft a task list:\n- Create manifest.json\n- Write content script\n- Code popup UI' }
];

console.log('=== Running ContextFlow Engine Tests ===\n');

// Test 1: Minimal Compression Mode
console.log('Test 1: Minimal Compression Mode');
const minimalResult = compressContext(mockHistory, 'minimal');
assert(minimalResult.objectives.length > 0, 'Should extract objectives');
assert(minimalResult.activeTasks.length > 0, 'Should extract active tasks');
assert(minimalResult.decisions.length === 0, 'Should NOT include decisions in minimal mode');
assert(minimalResult.constraints.length === 0, 'Should NOT include constraints in minimal mode');

// Test 2: Balanced Compression Mode
console.log('\nTest 2: Balanced Compression Mode');
const balancedResult = compressContext(mockHistory, 'balanced');
assert(balancedResult.objectives.length > 0, 'Should extract objectives');
assert(balancedResult.activeTasks.length > 0, 'Should extract active tasks');
assert(balancedResult.decisions.length > 0, 'Should extract decisions');
assert(balancedResult.constraints.length > 0, 'Should extract constraints');

// Check heuristic keyword detection
assert(balancedResult.constraints.some(c => c.toLowerCase().includes('must') || c.toLowerCase().includes('constraint')), 'Should detect constraint keyword ("must", "constraint")');
assert(balancedResult.decisions.some(d => d.toLowerCase().includes('decided')), 'Should detect decision keyword ("decided")');

// Test 3: Full Fidelity Compression Mode
console.log('\nTest 3: Full Fidelity Compression Mode');
const fullResult = compressContext(mockHistory, 'full');
assert(fullResult.history.length === mockHistory.length, 'Should keep all messages chronologically');
assert(fullResult.objectives.length === 0, 'Should not have processed objectives list');

// Test 4: Hydration Output Format
console.log('\nTest 4: Hydration Engine Formatting');
const hydrationPrompt = generateHydrationPrompt(balancedResult, {
  title: 'My Extension Project',
  source: 'ChatGPT',
  includeSystemInstructions: true
});

assert(hydrationPrompt.includes('[SYSTEM CONTEXT]'), 'Should contain system context block');
assert(hydrationPrompt.includes('[PROJECT SUMMARY]'), 'Should contain project summary block');
assert(hydrationPrompt.includes('[OBJECTIVES]'), 'Should contain objectives block');
assert(hydrationPrompt.includes('[DECISIONS]'), 'Should contain decisions block');
assert(hydrationPrompt.includes('[CONSTRAINTS]'), 'Should contain constraints block');
assert(hydrationPrompt.includes('[ACTIVE TASKS]'), 'Should contain active tasks block');
assert(hydrationPrompt.includes('[CONTINUE FROM HERE]'), 'Should contain continue instructions');
assert(hydrationPrompt.includes('My Extension Project'), 'Should include the project title');

// Test 5: Hydration Output without System Instructions
console.log('\nTest 5: Hydration without System Instructions');
const noSystemPrompt = generateHydrationPrompt(balancedResult, {
  title: 'My Extension Project',
  source: 'ChatGPT',
  includeSystemInstructions: false
});
assert(!noSystemPrompt.includes('[SYSTEM CONTEXT]'), 'Should NOT contain system context block');
assert(noSystemPrompt.includes('[PROJECT SUMMARY]'), 'Should still contain project summary');

console.log(`\n=== Test Summary: ${testsPassed} passed, ${testsFailed} failed ===`);
if (testsFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
