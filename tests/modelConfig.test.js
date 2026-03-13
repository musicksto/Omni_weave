import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const agentSource = fs.readFileSync(
  new URL('../server/agent.ts', import.meta.url),
  'utf8'
);

const appSource = fs.readFileSync(
  new URL('../src/App.tsx', import.meta.url),
  'utf8'
);

test('server agent models use the requested latest model ids', () => {
  assert.match(agentSource, /ROOT_AGENT_MODEL = 'gemini-3-flash-preview'/);
  assert.match(agentSource, /STORY_WRITER_MODEL = 'gemini-3\.1-pro-preview'/);
  assert.match(agentSource, /STORY_REVIEWER_MODEL = 'gemini-3\.1-flash-lite-preview'/);
  assert.match(agentSource, /TTS_MODEL = 'gemini-2\.5-pro-preview-tts'/);
});

test('frontend visible model labels match the requested latest ids', () => {
  // Client-side API calls use full preview model IDs
  assert.match(appSource, /gemini-3\.1-pro-preview/);
  assert.match(appSource, /gemini-3\.1-flash-image-preview/);
  assert.match(appSource, /gemini-2\.5-pro-preview-tts/);
  assert.match(appSource, /gemini-embedding-2-preview/);
  // Display labels in PIPELINE_STEPS (shortened for UI)
  assert.match(appSource, /'gemini-3\.1-pro'/);
  assert.match(appSource, /'gemini-3\.1-flash-lite'/);
  assert.match(appSource, /'gemini-2\.5-pro-tts'/);
});
