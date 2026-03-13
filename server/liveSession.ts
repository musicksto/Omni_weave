/**
 * OmniWeave Live Session — Gemini Live API WebSocket Proxy
 *
 * Bridges browser WebSocket ↔ Gemini Live API for real-time
 * voice-in / multimodal-out conversational storytelling.
 */

import type { WebSocket } from 'ws';
import { GoogleGenAI, Modality, type FunctionCall } from '@google/genai';
import { LIVE_MODEL, liveToolExecutors, liveToolDeclarations } from './agent.js';

/** Message types sent FROM the browser client */
interface ClientMessage {
  type: 'audio' | 'text' | 'end_audio';
  /** Base64-encoded PCM audio (16kHz, 16-bit, mono) */
  data?: string;
  /** Text message for non-voice input */
  text?: string;
}

/** Message types sent TO the browser client */
interface ServerOutMessage {
  type: 'audio' | 'text' | 'image' | 'video' | 'tool_call' | 'turn_complete' | 'error' | 'connected';
  data?: string;
  text?: string;
  mimeType?: string;
  toolName?: string;
  toolResult?: any;
}

function sendToClient(ws: WebSocket, msg: ServerOutMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export async function createLiveSession(clientWs: WebSocket): Promise<void> {
  console.log('[Live] New client connected, establishing Gemini Live session...');

  // Conversation history for "Save as Story" bridge
  const conversationHistory: Array<{ role: string; content: string; image?: string }> = [];

  try {
    // Live API requires API key mode (not Vertex AI)
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Live API requires GOOGLE_API_KEY (API key mode, not Vertex AI)');
    }
    const ai = new GoogleGenAI({ apiKey, vertexai: false } as any);

    const session = await ai.live.connect({
      model: LIVE_MODEL,
      callbacks: {
        onopen: () => {
          console.log('[Live] Gemini Live session established');
          sendToClient(clientWs, { type: 'connected' });
        },
        onmessage: (msg) => {
          // Handle server content (text + audio)
          if (msg.serverContent) {
            const parts = msg.serverContent.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.text) {
                  sendToClient(clientWs, { type: 'text', text: part.text });
                  conversationHistory.push({ role: 'assistant', content: part.text });
                }
                if (part.inlineData?.data) {
                  // Audio response from Gemini
                  sendToClient(clientWs, {
                    type: 'audio',
                    data: part.inlineData.data,
                    mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000',
                  });
                }
              }
            }
            if (msg.serverContent.turnComplete) {
              sendToClient(clientWs, { type: 'turn_complete' });
            }
          }

          // Handle tool calls — execute server-side and send response back
          if (msg.toolCall?.functionCalls) {
            handleToolCalls(session, clientWs, msg.toolCall.functionCalls, conversationHistory);
          }
        },
        onerror: (e) => {
          console.error('[Live] Gemini Live error:', e);
          sendToClient(clientWs, { type: 'error', text: 'Live API connection error' });
        },
        onclose: () => {
          console.log('[Live] Gemini Live session closed');
          if (clientWs.readyState === clientWs.OPEN) {
            clientWs.close(1000, 'Gemini session ended');
          }
        },
      },
      config: {
        responseModalities: [Modality.AUDIO, Modality.TEXT],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
        systemInstruction: {
          parts: [{
            text: `You are OmniWeave — an immersive cinematic storyteller.

When the user describes a story idea, create vivid, emotional narratives with:
- Rich character descriptions and dialogue
- Atmospheric scene-setting
- Dramatic pacing

You can generate images using the generate_image tool to illustrate key scenes.
When generating an image, create a detailed visual prompt that describes the art style,
characters, lighting, and composition.

You can start background music using the generate_music tool with a mood description.

Speak naturally and expressively. Use different vocal tones for different characters.
Keep responses conversational but cinematic — like a world-class narrator performing a story.

If the user asks to save the story, summarize what was created so far.`,
          }],
        },
        tools: liveToolDeclarations,
      },
    });

    // Handle messages FROM the browser client
    clientWs.on('message', (raw) => {
      try {
        const msg: ClientMessage = JSON.parse(raw.toString());

        switch (msg.type) {
          case 'audio':
            if (msg.data) {
              // Forward raw PCM audio to Gemini Live
              session.sendRealtimeInput({
                audio: { data: msg.data, mimeType: 'audio/pcm;rate=16000' },
              });
            }
            break;

          case 'text':
            if (msg.text) {
              conversationHistory.push({ role: 'user', content: msg.text });
              session.sendClientContent({
                turns: [{ role: 'user', parts: [{ text: msg.text }] }],
                turnComplete: true,
              });
            }
            break;

          case 'end_audio':
            session.sendRealtimeInput({ audioStreamEnd: true });
            break;

          default:
            console.warn('[Live] Unknown client message type:', (msg as any).type);
        }
      } catch (err) {
        console.error('[Live] Failed to parse client message:', err);
      }
    });

    clientWs.on('close', () => {
      console.log('[Live] Client disconnected, closing Gemini session');
      try { session.close(); } catch { /* already closed */ }
    });

    clientWs.on('error', (err) => {
      console.error('[Live] Client WebSocket error:', err);
      try { session.close(); } catch { /* already closed */ }
    });

  } catch (err: any) {
    console.error('[Live] Failed to create Gemini Live session:', err);
    sendToClient(clientWs, { type: 'error', text: err.message || 'Failed to connect to Live API' });
    clientWs.close(1011, 'Live API connection failed');
  }
}

/** Execute tool calls server-side and send responses back to Gemini + client */
async function handleToolCalls(
  session: any,
  clientWs: WebSocket,
  functionCalls: FunctionCall[],
  conversationHistory: Array<{ role: string; content: string; image?: string }>
): Promise<void> {
  const responses = await Promise.all(
    functionCalls.map(async (call) => {
      const toolName = call.name!;
      const args = call.args || {};

      console.log(`[Live] Executing tool: ${toolName}`, args);
      sendToClient(clientWs, { type: 'tool_call', toolName, text: `Generating ${toolName}...` });

      const executor = liveToolExecutors[toolName];
      if (!executor) {
        return { name: toolName, response: { status: 'error', error: `Unknown tool: ${toolName}` } };
      }

      try {
        const result = await executor(args);

        // If it's an image, send it to the client for display
        if (toolName === 'generate_image' && result.imageDataUri) {
          sendToClient(clientWs, { type: 'image', data: result.imageDataUri });
          conversationHistory.push({ role: 'tool', content: `[Image: ${args.prompt}]`, image: result.imageDataUri });
        }
        
        // If it's a video, send the URL to the client for display
        if (toolName === 'generate_video' && result.videoUrl) {
          sendToClient(clientWs, { type: 'video', data: result.videoUrl });
          conversationHistory.push({ role: 'tool', content: `[Video: ${args.prompt}]` });
        }

        return { name: toolName, response: result };
      } catch (err: any) {
        return { name: toolName, response: { status: 'error', error: err.message } };
      }
    })
  );

  // Send all tool responses back to Gemini
  try {
    session.sendToolResponse({
      functionResponses: responses.map((r) => ({
        name: r.name,
        id: functionCalls.find((c) => c.name === r.name)?.id || r.name,
        response: r.response,
      })),
    });
  } catch (err) {
    console.error('[Live] Failed to send tool responses:', err);
  }
}
