/**
 * ContextFlow Hydration Engine
 * Formats captured and compressed context into a destination-ready prompt.
 */

function estimateTokens(text) {
  if (!text) return 0;
  // Robust heuristic: max of wordCount * 1.3 (standard English text) and charCount / 4 (markdown/code/symbols)
  const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  const chars = text.length;
  return Math.round(Math.max(words * 1.3, chars / 4));
}

function generateHydrationPrompt(compressedData, metadata = {}) {
  const { objectives, decisions, constraints, activeTasks, history } = compressedData;
  const title = metadata.title || 'Untitled Conversation';
  const source = metadata.source || 'Another Assistant';
  const includeSystemInstructions = metadata.includeSystemInstructions !== false;

  let prompt = '';

  if (includeSystemInstructions) {
    prompt += `[SYSTEM CONTEXT]\n`;
    prompt += `This conversation is being transferred from ${source} using ContextFlow. The goal is to continue the work session seamlessly without losing state, decisions, constraints, or momentum. Please absorb the context below and await the user's next instruction.\n\n`;
  }

  prompt += `[PROJECT SUMMARY]\n`;
  prompt += `Active project/topic: "${title}"\n`;
  prompt += `Context captured: ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC\n`;

  // Calculate rough token estimate for context size awareness using unified helper
  let totalText = '';
  if (history && history.length > 0) {
    history.forEach(msg => { totalText += (msg.text || '') + ' '; });
  }
  [objectives, decisions, constraints, activeTasks].forEach(arr => {
    if (arr) arr.forEach(item => { totalText += item + ' '; });
  });
  const estimatedTokens = estimateTokens(totalText);
  prompt += `Context size: ~${estimatedTokens} tokens\n\n`;

  if (objectives && objectives.length > 0) {
    prompt += `[OBJECTIVES]\n`;
    objectives.forEach(item => {
      prompt += `- ${item}\n`;
    });
    prompt += `\n`;
  }

  if (decisions && decisions.length > 0) {
    prompt += `[DECISIONS]\n`;
    decisions.forEach(item => {
      prompt += `- ${item}\n`;
    });
    prompt += `\n`;
  }

  if (constraints && constraints.length > 0) {
    prompt += `[CONSTRAINTS]\n`;
    constraints.forEach(item => {
      prompt += `- ${item}\n`;
    });
    prompt += `\n`;
  }

  if (activeTasks && activeTasks.length > 0) {
    prompt += `[ACTIVE TASKS]\n`;
    activeTasks.forEach(item => {
      prompt += `- [ ] ${item}\n`;
    });
    prompt += `\n`;
  }

  if (history && history.length > 0) {
    prompt += `[CONVERSATION HISTORY (CHRONOLOGICAL)]\n`;
    history.forEach(msg => {
      const roleName = msg.role === 'user' ? 'USER' : 'ASSISTANT';
      prompt += `${roleName}: ${msg.text}\n\n`;
    });
  }

  prompt += `[CONTINUE FROM HERE]\n`;
  prompt += `I am ready to continue our session. Please acknowledge this context, summarize your understanding of the current state and objectives briefly, and ask me for my next instruction.`;

  return prompt.trim();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateHydrationPrompt, estimateTokens };
}
