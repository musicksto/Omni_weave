const HEALTH_CHECK_TIMEOUT = 5000;
const IMAGE_GEN_TIMEOUT = 90000;
const VIDEO_GEN_TIMEOUT = 180000;
const EMBED_TIMEOUT = 15000;
const STORY_GEN_TIMEOUT = 120000;

const ADK_SERVER_URL = (import.meta as any).env?.VITE_ADK_SERVER_URL || '';

export interface ADKStoryEvent {
  author?: string;
  text?: string;
  image?: string;
  toolCalls?: { name: string; args: any }[];
  toolResponses?: { name: string; response: any }[];
  isFinal?: boolean;
  done?: boolean;
  error?: string;
  renderText?: boolean;
  replaceText?: boolean;
}

export async function checkADKServer(): Promise<{ available: boolean; agentInfo?: any }> {
  if (!ADK_SERVER_URL) return { available: false };
  try {
    const res = await fetch(`${ADK_SERVER_URL}/api/agent-info`, {
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT)
    });
    if (!res.ok) return { available: false };
    const agentInfo = await res.json();
    return { available: true, agentInfo };
  } catch {
    return { available: false };
  }
}

export async function generateImageViaADK(prompt: string, sessionId?: string, characterSheet?: string): Promise<{
  status: string;
  imageDataUri?: string;
  error?: string;
}> {
  const res = await fetch(`${ADK_SERVER_URL}/api/generate-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, sessionId, characterSheet }),
    signal: AbortSignal.timeout(IMAGE_GEN_TIMEOUT),
  });
  return res.json();
}

export async function generateVideoViaADK(prompt: string): Promise<{
  status: string;
  videoDataUri?: string;
  error?: string;
}> {
  const serverUrl = getADKServerURL();
  if (!serverUrl) return { status: 'error', error: 'ADK server not configured' };

  const res = await fetch(`${serverUrl}/api/generate-video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
    signal: AbortSignal.timeout(VIDEO_GEN_TIMEOUT),
  });
  return res.json();
}

export async function computeEmbeddingViaADK(
  text: string,
  imageBase64?: string,
  imageMimeType?: string
): Promise<{
  status: string;
  embedding?: number[];
  dimensions?: number;
  error?: string;
}> {
  const res = await fetch(`${ADK_SERVER_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, imageBase64, imageMimeType }),
    signal: AbortSignal.timeout(EMBED_TIMEOUT),
  });
  return res.json();
}

export async function generateStoryViaADK(
  prompt: string,
  onEvent: (event: ADKStoryEvent) => void,
  userId?: string
): Promise<void> {
  const res = await fetch(`${ADK_SERVER_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, userId }),
    signal: AbortSignal.timeout(STORY_GEN_TIMEOUT),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || 'ADK story generation failed');
  }

  if (!res.body) throw new Error('No response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6));
          onEvent(event);
        } catch (e) {
        }
      }
    }
  }
}

export function getADKServerURL(): string {
  return ADK_SERVER_URL;
}
