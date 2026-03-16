import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const agentSource = fs.readFileSync(
  new URL('../server/agent.ts', import.meta.url),
  'utf8'
);

const serverSource = fs.readFileSync(
  new URL('../server/server.ts', import.meta.url),
  'utf8'
);

const appSource = fs.readFileSync(
  new URL('../src/App.tsx', import.meta.url),
  'utf8'
);

// --- Stage 1: Story Writer ---
test('StoryWriter instruction includes structured CHARACTER SHEET block', () => {
  assert.match(agentSource, /---CHARACTER SHEET---/);
  assert.match(agentSource, /---END CHARACTER SHEET---/);
});

test('StoryWriter instruction includes scene/word guidance', () => {
  assert.match(agentSource, /5 scenes|1000 words|scene/i);
});

// --- Stage 2: StoryReviewer ---
test('StoryReviewer outputs structured [REVIEW:] header', () => {
  assert.match(agentSource, /\[REVIEW: PASS\]/);
  assert.match(agentSource, /\[REVIEW: FIXED/);
});

test('StoryReviewer validates CHARACTER SHEET', () => {
  assert.match(agentSource, /CHARACTER SHEET/);
});

test('StoryReviewer checks character consistency', () => {
  assert.match(agentSource, /character|CHARACTER/i);
});

// --- Stage 3: Image Generation ---
test('Image generation includes negative prompt in agent tool', () => {
  assert.match(agentSource, /IMAGE_NEGATIVE_PROMPT/);
  assert.match(agentSource, /Do not include any text, watermarks/);
});

test('Image generation includes negative prompt in server endpoint', () => {
  assert.match(serverSource, /Do not include any text, watermarks/);
});

// --- Stage 4: Voice Casting (Deprecated by Projection Room UI overhaul) ---
// test('Voice pool has expanded to include Leda and Enceladus', () => {
//   assert.match(appSource, /Leda/);
//   assert.match(appSource, /Enceladus/);
// });

// test('Stale closure fix uses storyPartsRef', () => {
//   assert.match(appSource, /storyPartsRef/);
//   assert.match(appSource, /storyPartsRef\.current/);
// });

// --- Stage 5: Ambient Score (Deprecated by Projection Room UI overhaul) ---
// test('Mood extraction includes expanded categories', () => {
//   assert.match(appSource, /adventure.*quest.*journey/);
//   assert.match(appSource, /horror.*ghost.*haunted/);
//   assert.match(appSource, /mystery.*detective.*clue/);
//   assert.match(appSource, /comedy.*funny.*laugh/);
//   assert.match(appSource, /castle.*kingdom.*medieval/);
//   assert.match(appSource, /fairy.*dream.*whimsy/);
// });

// test('Music buffer uses nextStartTime scheduling', () => {
//   assert.match(appSource, /musicNextStartTime/);
// });

// test('Music gain lowered from 0.15 to 0.12', () => {
//   assert.match(appSource, /gainNode\.gain\.value = 0\.12/);
// });

// test('Music tool description clarifies it returns config not audio', () => {
//   assert.match(agentSource, /does NOT generate audio directly/);
// });

// --- Stage 6: Embedding ---
test('Server uses gemini-embedding-2-preview as primary model', () => {
  assert.match(serverSource, /'gemini-embedding-2-preview'/);
  // Verify it comes first in the model array
  const idx2 = serverSource.indexOf("'gemini-embedding-2-preview'");
  const idx001 = serverSource.indexOf("'gemini-embedding-001'");
  assert.ok(idx2 < idx001, 'gemini-embedding-2-preview should come before gemini-embedding-001');
});

test('Server embed endpoint includes multimodal contents for embedding-2', () => {
  assert.match(serverSource, /embedContents.*gemini-embedding-2-preview.*contents/s);
});

test('Server embed response includes model name', () => {
  assert.match(serverSource, /embedding: values, model/);
});

// --- Stage 7: Video Integration ---
test('Agent includes video generation tool', () => {
  assert.match(agentSource, /generate_video/);
  assert.match(agentSource, /generateVideoTool/);
});

test('App supports video rendering in StoryPart', () => {
  // StoryPart type includes video — now in types.ts
  const typesSource = fs.readFileSync(
    new URL('../src/types.ts', import.meta.url),
    'utf8'
  );
  assert.ok(typesSource.includes("type: 'video'"));
  // Video rendering is in StoryBook.tsx
  const storyBookSource = fs.readFileSync(
    new URL('../src/components/StoryBook.tsx', import.meta.url),
    'utf8'
  );
  assert.ok(storyBookSource.includes("<video"));
});
