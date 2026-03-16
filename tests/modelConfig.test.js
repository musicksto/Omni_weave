import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const agentSource = fs.readFileSync(
  new URL('../server/agent.ts', import.meta.url),
  'utf8'
);

const constantsSource = fs.readFileSync(
  new URL('../src/constants.ts', import.meta.url),
  'utf8'
);

test('server agent models use the requested latest model ids', () => {
  assert.match(agentSource, /ROOT_AGENT_MODEL = 'gemini-3-flash-preview'/);
  assert.match(agentSource, /STORY_WRITER_MODEL = 'gemini-2\.5-flash'/);
  assert.match(agentSource, /STORY_REVIEWER_MODEL = 'gemini-2\.5-flash-lite'/);
  assert.match(agentSource, /TTS_MODEL = 'gemini-2\.5-pro-preview-tts'/);
});

test('frontend visible model labels match the requested latest ids', () => {
  // Display labels in PIPELINE_STEPS — now in constants.ts
  assert.match(constantsSource, /gemini-2\.5-flash/);
  assert.match(constantsSource, /chirp-3-hd/);
  assert.match(constantsSource, /gemini-embedding/);
  assert.match(constantsSource, /lyria-realtime/);
});
