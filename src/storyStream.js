export function createStoryStreamState() {
  return {
    parts: [],
    buffer: '',
    nextPartIndex: 0,
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

const stripCharacterSheet = (text) => {
  // Remove the ---CHARACTER SHEET--- ... ---END CHARACTER SHEET--- block (internal metadata, not for display)
  const pattern = /---CHARACTER SHEET---[\s\S]*?---END CHARACTER SHEET---\s*/gi;
  return text.replace(pattern, '');
};

const stripReviewHeader = (text) => {
  // Remove the [REVIEW: PASS] or [REVIEW: FIXED (N issues)] header line
  const pattern = /^\s*\[REVIEW:\s*(?:PASS|FIXED\s*\([^)]*\))\]\s*\n?/i;
  return text.replace(pattern, '');
};

const processText = (state, sourceText, newParts) => {
  // Strip internal metadata before rendering
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

export function flushStoryChunk(state) {
  const newParts = [];
  if (state.buffer) {
    appendTextPart(state, newParts, state.buffer);
    state.buffer = '';
  }

  return { newParts, parts: state.parts };
}
