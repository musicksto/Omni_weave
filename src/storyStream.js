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

const processText = (state, sourceText, newParts) => {
  const imagePattern = /\[IMAGE:\s*(.*?)\s*\]/g;
  let lastIndex = 0;
  let match;

  while ((match = imagePattern.exec(sourceText)) !== null) {
    if (match.index > lastIndex) {
      appendTextPart(state, newParts, sourceText.slice(lastIndex, match.index));
    }

    appendImagePart(state, newParts, match[1]);
    lastIndex = imagePattern.lastIndex;
  }

  if (lastIndex < sourceText.length) {
    appendTextPart(state, newParts, sourceText.slice(lastIndex));
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
