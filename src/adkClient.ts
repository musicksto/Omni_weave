/**
 * OmniWeave ADK Client
 *
 * Routes Gemini API calls through the ADK agent server on Cloud Run
 * when available, with graceful fallback to direct client-side calls.
 */

const ADK_SERVER_URL = (import.meta as any).env?.VITE_ADK_SERVER_URL || '';

export interface ADKStoryEvent {
  author?: string;
  text?: string;
  toolCalls?: { name: string; args: any }[];
  toolResponses?: { name: string; response: any }[];
  isFinal?: boolean;
  done?: boolean;
  error?: string;
  renderText?: boolean;
  replaceText?: boolean;
}

/** Check if the ADK server is available */
export async function checkADKServer(): Promise<{ available: boolean; agentInfo?: any }> {
  if (!ADK_SERVER_URL) return { available: false };
  try {
    const res = await fetch(`${ADK_SERVER_URL}/api/agent-info`, { 
      signal: AbortSignal.timeout(5000) 
    });
    if (!res.ok) return { available: false };
    const agentInfo = await res.json();
    return { available: true, agentInfo };
  } catch {
    return { available: false };
  }
}

/** Generate an image via the ADK server */
export async function generateImageViaADK(prompt: string): Promise<{
  status: string;
  imageDataUri?: string;
  error?: string;
}> {
  const res = await fetch(`${ADK_SERVER_URL}/api/generate-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  return res.json();
}

/** Compute embedding via the ADK server */
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
  });
  return res.json();
}

/**
 * Stream a full story generation via the ADK multi-agent pipeline.
 * Uses SSE (Server-Sent Events) for real-time streaming.
 */
export async function generateStoryViaADK(
  prompt: string,
  onEvent: (event: ADKStoryEvent) => void
): Promise<void> {
  const res = await fetch(`${ADK_SERVER_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
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
        } catch {
          // Skip malformed events
        }
      }
    }
  }
}

/** Get ADK server URL for display */
export function getADKServerURL(): string {
  return ADK_SERVER_URL;
}
