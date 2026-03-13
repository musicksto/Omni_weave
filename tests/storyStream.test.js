import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createStoryStreamState,
  appendStoryChunk,
  flushStoryChunk,
} from '../src/storyStream.js';

test('appendStoryChunk preserves incomplete image markers across chunks', () => {
  const state = createStoryStreamState();

  const firstPass = appendStoryChunk(state, 'Narrator: Hello [IMAGE: glowing');
  assert.equal(firstPass.newParts.length, 1);
  assert.equal(firstPass.newParts[0].type, 'text');
  assert.equal(firstPass.newParts[0].text, 'Narrator: Hello ');

  const secondPass = appendStoryChunk(state, ' forest]\nNarrator: Goodbye');
  assert.equal(secondPass.newParts.length, 2);
  assert.equal(secondPass.newParts[0].type, 'image');
  assert.equal(secondPass.newParts[0].prompt, 'glowing forest');
  assert.equal(secondPass.newParts[1].type, 'text');
  assert.equal(secondPass.newParts[1].text, '\nNarrator: Goodbye');

  assert.deepEqual(
    state.parts.map((part) => part.type),
    ['text', 'image', 'text'],
  );
});

test('flushStoryChunk emits an incomplete trailing marker as literal text', () => {
  const state = createStoryStreamState();

  appendStoryChunk(state, 'Narrator: Opening [IMAGE: dangling');
  const finalPass = flushStoryChunk(state);

  assert.equal(finalPass.newParts.length, 0);
  assert.equal(state.parts.length, 1);
  assert.equal(state.parts[0].type, 'text');
  assert.equal(state.parts[0].text, 'Narrator: Opening [IMAGE: dangling');
  assert.equal(state.buffer, '');
});

test('appendStoryChunk handles [VIDEO: prompt]', () => {
  const state = createStoryStreamState();
  const chunk = appendStoryChunk(state, 'A wild scene [VIDEO: dog chasing cat] unfolds');
  
  assert.equal(chunk.newParts.length, 3);
  assert.equal(chunk.newParts[0].type, 'text');
  assert.equal(chunk.newParts[0].text, 'A wild scene ');
  assert.equal(chunk.newParts[1].type, 'video');
  assert.equal(chunk.newParts[1].prompt, 'dog chasing cat');
  assert.equal(chunk.newParts[2].type, 'text');
  assert.equal(chunk.newParts[2].text, ' unfolds');
});

test('appendStoryChunk handles both IMAGE and VIDEO together', () => {
  const state = createStoryStreamState();
  const chunk = appendStoryChunk(state, '[IMAGE: intro][VIDEO: action]');
  
  assert.equal(chunk.newParts.length, 2);
  assert.equal(chunk.newParts[0].type, 'image');
  assert.equal(chunk.newParts[0].prompt, 'intro');
  assert.equal(chunk.newParts[1].type, 'video');
  assert.equal(chunk.newParts[1].prompt, 'action');
});
