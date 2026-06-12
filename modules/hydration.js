/**
 * ContextFlow Hydration Engine
 * Formats captured and compressed context into a destination-ready prompt.
 */

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

  // Calculate rough token estimate for context size awareness
  let totalChars = 0;
  if (history && history.length > 0) {
    history.forEach(msg => { totalChars += (msg.text || '').length; });
  }
  [objectives, decisions, constraints, activeTasks].forEach(arr => {
    if (arr) arr.forEach(item => { totalChars += item.length; });
  });
  const estimatedTokens = Math.round(totalChars / 4);
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
  module.exports = { generateHydrationPrompt };
}
