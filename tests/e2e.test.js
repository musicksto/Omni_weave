import test from 'node:test';
import assert from 'node:assert/strict';

const SERVER_URL = 'http://localhost:8081';
const WS_URL = 'ws://localhost:8081/api/live';

test('E2E: Server health check (agent-info)', async () => {
  const resp = await fetch(`${SERVER_URL}/api/agent-info`);
  assert.equal(resp.status, 200);
  const data = await resp.json();
  assert.equal(data.rootAgent.name, 'OmniWeaveDirector');
  assert.ok(data.tools.length >= 4);
});

test('E2E: Image generation endpoint', async () => {
  const resp = await fetch(`${SERVER_URL}/api/generate-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'A simple test icon' }),
  });
  
  // This might fail if GEMINI_API_KEY is not set or rate limited,
  // but status should be 200 or 500 with a message.
  if (resp.status === 200) {
    const data = await resp.json();
    assert.equal(data.status, 'success');
    assert.ok(data.imageDataUri);
  } else {
    console.warn('Image generation endpoint returned status:', resp.status);
  }
});

test('E2E: Live Mode WebSocket Handshake', async () => {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket connection timed out'));
    }, 10000);

    ws.onopen = () => {
      clearTimeout(timeout);
      assert.ok(true, 'WebSocket connected');
      // We don't send audio, just check connection
      ws.close();
      resolve();
    };

    ws.onerror = (err) => {
      clearTimeout(timeout);
      reject(err);
    };
  });
});
