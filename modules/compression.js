/**
 * ContextFlow Compression Engine
 * Compresses conversational context locally based on rules and heuristics.
 */

function compressContext(chatHistory, mode = 'balanced') {
  if (!chatHistory || !Array.isArray(chatHistory) || chatHistory.length === 0) {
    return {
      objectives: [],
      decisions: [],
      constraints: [],
      activeTasks: [],
      history: []
    };
  }

  // Format of chatHistory: Array of { role: 'user'|'assistant', text: string }
  
  if (mode === 'full') {
    return {
      objectives: [],
      decisions: [],
      constraints: [],
      activeTasks: [],
      history: chatHistory // return all messages chronologically
    };
  }

  const allText = chatHistory.map(m => m.text || '').join('\n');
  
  // 1. Try to extract explicit markdown lists first
  const explicitObjectives = extractMarkdownList(allText, /###?\s*(?:Objectives|Goals|Aim)/i);
  const explicitDecisions = extractMarkdownList(allText, /###?\s*(?:Decisions|Choices|Decided)/i);
  const explicitConstraints = extractMarkdownList(allText, /###?\s*(?:Constraints|Limitations|Requirements)/i);
  const explicitTasks = extractMarkdownList(allText, /###?\s*(?:Active Tasks|Tasks|Todo|To-do)/i);

  // Heuristic extraction as fallback or supplement
  const heuristicObjectives = [];
  const heuristicDecisions = [];
  const heuristicConstraints = [];
  const heuristicTasks = [];

  // Parse by sentences/lines
  const lines = allText.split(/\r?\n/);
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue; // Skip headers

    // Clean bullet symbols and numbered lists for analysis
    const cleanLine = line.replace(/^[-*+]\s+(\[[\sxX]\])?\s*/, '').replace(/^\d+\.\s*/, '').trim();
    if (cleanLine.length < 5) continue;

    // Categorize using rules
    if (line.match(/^[-*+]\s+\[\s\]/) || cleanLine.match(/\b(?:todo|task|implement|create|fix|add|write)\b/i)) {
      if (heuristicTasks.length < 10) heuristicTasks.push(cleanLine);
    }
    if (cleanLine.match(/\b(?:objective|goal|aim|target|want to|intend to|would like to|purpose)\b/i)) {
      if (heuristicObjectives.length < 10) heuristicObjectives.push(cleanLine);
    }
    if (cleanLine.match(/\b(?:decided|chose|selected|agreed|decision|determined|opted to|use|using)\b/i)) {
      if (heuristicDecisions.length < 10) heuristicDecisions.push(cleanLine);
    }
    if (cleanLine.match(/\b(?:must|should|cannot|limit|restriction|constraint|avoid|don't|do not|required to|restrict)\b/i)) {
      if (heuristicConstraints.length < 10) heuristicConstraints.push(cleanLine);
    }
  }

  // Merge explicit and heuristic, prioritizing explicit
  const objectives = explicitObjectives.length > 0 ? explicitObjectives : deduplicate(heuristicObjectives).slice(0, 5);
  const decisions = explicitDecisions.length > 0 ? explicitDecisions : deduplicate(heuristicDecisions).slice(0, 5);
  const constraints = explicitConstraints.length > 0 ? explicitConstraints : deduplicate(heuristicConstraints).slice(0, 5);
  const activeTasks = explicitTasks.length > 0 ? explicitTasks : deduplicate(heuristicTasks).slice(0, 8);

  if (mode === 'minimal') {
    return {
      objectives,
      activeTasks,
      decisions: [],
      constraints: [],
      history: []
    };
  }

  // Mode is 'balanced'
  return {
    objectives,
    decisions,
    constraints,
    activeTasks,
    history: []
  };
}

function extractMarkdownList(text, headerRegex) {
  const lines = text.split(/\r?\n/);
  let inSection = false;
  const listItems = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      if (inSection) {
        break; // New section starts, exit
      }
      if (headerRegex.test(trimmed)) {
        inSection = true;
        continue;
      }
    }
    if (inSection) {
      if (trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.startsWith('+') || /^\d+\./.test(trimmed)) {
        const item = trimmed.replace(/^[-*+]\s+(\[[\sxX]\])?\s*/, '').replace(/^\d+\.\s*/, '').trim();
        if (item) listItems.push(item);
      } else if (trimmed === '' && listItems.length > 0) {
        // Empty line within section might end it if next is not list, let's keep scanning but be careful
      } else if (trimmed && !trimmed.startsWith('-') && !trimmed.startsWith('*') && !/^\d+\./.test(trimmed)) {
        // If not a list item and we already have some items, we finished the list
        if (listItems.length > 0) break;
      }
    }
  }
  return listItems;
}

function deduplicate(arr) {
  return [...new Set(arr)];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { compressContext };
}
