export function createStoryStreamState() {
  return {
    parts: [],
    buffer: '',
    nextPartIndex: 0,
    charSheetBuffer: '',
    insideCharSheet: false,
  };
}

const appendTextPart = (state, newParts, text) => {
  if (!text) {
    return;
  }

  const lastPart = state.parts[state.parts.length - 1];
  if (lastPart?.type === 'text') {
    lastPart.text += text;
    return;
  }

  const part = {
    type: 'text',
    text,
    id: `txt-${state.nextPartIndex++}`,
  };
  state.parts.push(part);
  newParts.push(part);
};

const appendImagePart = (state, newParts, prompt) => {
  const part = {
    type: 'image',
    url: '',
    id: `img-${state.nextPartIndex++}`,
    isLoading: true,
    prompt,
  };
  state.parts.push(part);
  newParts.push(part);
};

const appendInlineImage = (state, newParts, dataUri) => {
  const part = {
    type: 'image',
    url: dataUri,
    id: `img-${state.nextPartIndex++}`,
    isLoading: false,
  };
  state.parts.push(part);
  newParts.push(part);
};

const appendVideoPart = (state, newParts, prompt) => {
  const part = {
    type: 'video',
    url: '',
    id: `vid-${state.nextPartIndex++}`,
    prompt,
  };
  state.parts.push(part);
  newParts.push(part);
};

export function extractCharacterSheet(text) {
  const pattern = /---CHARACTER SHEET---\s*([\s\S]*?)\s*---END CHARACTER SHEET---/i;
  const match = text.match(pattern);
  if (!match) return null;

  const content = match[1];
  const result = { artStyle: '', characters: [] };

  const artMatch = content.match(/ART STYLE:\s*(.+)/i);
  if (artMatch) result.artStyle = artMatch[1].trim();

  const charPattern = /CHARACTER:\s*(.+?)(?:\n|$)([\s\S]*?)(?=CHARACTER:|$)/gi;
  let charMatch;
  while ((charMatch = charPattern.exec(content)) !== null) {
    const name = charMatch[1].trim();
    const details = charMatch[2];
    const char = { name, traits: {} };

    const traitPattern = /^\s*[-*]?\s*(\w[\w\s/]*?):\s*(.+)/gm;
    let traitMatch;
    while ((traitMatch = traitPattern.exec(details)) !== null) {
      char.traits[traitMatch[1].trim()] = traitMatch[2].trim();
    }

    result.characters.push(char);
  }

  return result.characters.length > 0 ? result : null;
}

const stripCharacterSheet = (text) => {
  const pattern = /---CHARACTER SHEET---[\s\S]*?---END CHARACTER SHEET---\s*/gi;
  return text.replace(pattern, '');
};

const stripReviewHeader = (text) => {
  const pattern = /^\s*\[REVIEW:\s*(?:PASS|FIXED\s*\([^)]*\))\]\s*\n?/i;
  return text.replace(pattern, '');
};

const processText = (state, sourceText, newParts) => {
  let cleanText = stripCharacterSheet(sourceText);
  cleanText = stripReviewHeader(cleanText);

  const mediaPattern = /\[(IMAGE|VIDEO):\s*(.*?)\s*\]/gi;
  let lastIndex = 0;
  let match;

  while ((match = mediaPattern.exec(cleanText)) !== null) {
    if (match.index > lastIndex) {
      appendTextPart(state, newParts, cleanText.slice(lastIndex, match.index));
    }

    const type = match[1].toUpperCase();
    const prompt = match[2];

    if (type === 'VIDEO') {
      appendVideoPart(state, newParts, prompt);
    } else {
      appendImagePart(state, newParts, prompt);
    }
    
    lastIndex = mediaPattern.lastIndex;
  }

  if (lastIndex < cleanText.length) {
    appendTextPart(state, newParts, cleanText.slice(lastIndex));
  }
};

export function appendStoryChunk(state, text) {
  const newParts = [];
  state.buffer += text;

  if (state.insideCharSheet) {
    const endIdx = state.buffer.indexOf('---END CHARACTER SHEET---');
    if (endIdx === -1) {
      return { newParts, parts: state.parts };
    }
    const afterEnd = endIdx + '---END CHARACTER SHEET---'.length;
    state.buffer = state.buffer.slice(afterEnd);
    state.insideCharSheet = false;
  }

  const sheetStartIdx = state.buffer.indexOf('---CHARACTER SHEET---');
  if (sheetStartIdx !== -1) {
    const endIdx = state.buffer.indexOf('---END CHARACTER SHEET---', sheetStartIdx);
    if (endIdx === -1) {
      const beforeSheet = state.buffer.slice(0, sheetStartIdx);
      state.buffer = state.buffer.slice(sheetStartIdx);
      state.insideCharSheet = true;
      if (beforeSheet) {
        processText(state, beforeSheet, newParts);
      }
      return { newParts, parts: state.parts };
    }
    const afterEnd = endIdx + '---END CHARACTER SHEET---'.length;
    state.buffer = state.buffer.slice(0, sheetStartIdx) + state.buffer.slice(afterEnd);
  }

  let safeLength = state.buffer.length;
  const lastOpenBracket = state.buffer.lastIndexOf('[');
  if (lastOpenBracket !== -1) {
    const closingBracket = state.buffer.indexOf(']', lastOpenBracket);
    if (closingBracket === -1) {
      safeLength = lastOpenBracket;
    }
  }

  const processableText = state.buffer.slice(0, safeLength);
  state.buffer = state.buffer.slice(safeLength);

  if (processableText) {
    processText(state, processableText, newParts);
  }

  return { newParts, parts: state.parts };
}

export function appendInlineImageChunk(state, dataUri) {
  const newParts = [];
  appendInlineImage(state, newParts, dataUri);
  return { newParts, parts: state.parts };
}

export function flushStoryChunk(state) {
  const newParts = [];
  if (state.buffer) {
    processText(state, state.buffer, newParts);
    state.buffer = '';
  }

  return { newParts, parts: state.parts };
}
