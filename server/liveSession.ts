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
  type: 'audio' | 'text' | 'end_audio' | 'ping';
  /** Base64-encoded PCM audio (16kHz, 16-bit, mono) */
  data?: string;
  /** Text message for non-voice input */
  text?: string;
}

/** Message types sent TO the browser client */
interface ServerOutMessage {
  type: 'audio' | 'text' | 'image' | 'video' | 'tool_call' | 'turn_complete' | 'error' | 'connected' | 'session_token' | 'interrupted' | 'user_speech' | 'pong';
  data?: string;
  text?: string;
  token?: string;
  mimeType?: string;
  toolName?: string;
  toolResult?: any;
}

function sendToClient(ws: WebSocket, msg: ServerOutMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

/**
 * Filter out model thinking/reasoning/planning from text output.
 * With responseModalities: [AUDIO], the text stream often contains
 * the model's inner monologue rather than actual narration.
 */
function isModelThinkingLine(line: string): boolean {
  return /^I'm (?:focusing|building|placing|thinking|planning|creating|working|starting|crafting|developing|imagining|solidifying|introducing|refining)/i.test(line)
    || /^I've (?:introduced|established|created|built|set|started|finished|completed)/i.test(line)
    || /^(?:My (?:strategy|goal|plan|focus|approach)|The (?:goal|plan|key|focus) (?:is|has))/i.test(line)
    || /^(?:Let me|Now I|I'll (?:use|try|start|continue))/i.test(line);
}

function filterModelThinking(text: string): string {
  // Aggressive filter for model's inner monologue / planning / reasoning
  const thinkingPatterns = [
    /^I'm (?:focusing|building|placing|back|concentrating|thinking|considering|planning|setting|establishing|creating|working|going|trying|aiming|starting|continuing|picking|crafting|developing|imagining|visualizing|designing|solidifying|introducing|refining|now |about to )/i,
    /^I (?:see|need|want|should|will|must|can|have|am|think|feel|believe|notice|observe|decide|chose|aim|plan|intend|envision|imagine|visualize) /i,
    /^I've (?:introduced|established|created|built|set|started|continued|finished|completed|just|now|successfully)/i,
    /^(?:My (?:strategy|goal|plan|focus|approach|intent|idea|vision|aim|visual prompt|musical choice)|The (?:goal|idea|plan|key|next step|focus|musical|score) (?:now |here |is |has |will |should ))/i,
    /^(?:Let me|Now I|I'll (?:use|try|start|continue|add|make|build|create|focus|now|keep|introduce)|OK,? (?:so |now |let)|Alright,? (?:so |now |let)|Right,? (?:so |now ))/i,
    /^(?:For this|In this|Here I|This (?:is where|will|should|needs)|Next,? I)/i,
    /^(?:Audio Worklet|Note:|TODO:|FYI:|Playful jazz|The score)/i,
    /generate_image|function call|tool call/i,
  ];

  // Process line by line — remove thinking lines, keep narration
  const lines = text.split('\n');
  const filtered = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return true; // Keep blank lines

    // Remove **Bold Headers** (planning markers)
    if (/^\*\*[A-Z]/.test(trimmed)) return false;

    // Remove lines matching thinking patterns
    return !thinkingPatterns.some(p => p.test(trimmed));
  });

  return filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export async function createLiveSession(clientWs: WebSocket, sessionToken?: string | null): Promise<void> {
  console.log('[Live] New client connected, establishing Gemini Live session...');
  const liveSessionId = `live-${Date.now()}`;

  // Conversation history for "Save as Story" bridge — capped at 100 entries to prevent memory exhaustion
  const MAX_HISTORY = 100;
  const conversationHistory: Array<{ role: string; content: string; image?: string }> = [];
  const addToHistory = (entry: { role: string; content: string; image?: string }) => {
    if (conversationHistory.length >= MAX_HISTORY) {
      conversationHistory.splice(0, conversationHistory.length - MAX_HISTORY + 1);
    }
    conversationHistory.push(entry);
  };

  try {
    // Live API requires API key mode (not Vertex AI)
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Live API requires GOOGLE_API_KEY (API key mode, not Vertex AI)');
    }
    const ai = new GoogleGenAI({ apiKey, vertexai: false } as any);

    // Use let + deferred greeting to avoid TDZ — onopen fires before await returns
    let sessionRef: any = null;

    const session = await ai.live.connect({
      model: LIVE_MODEL,
      callbacks: {
        onopen: () => {
          console.log('[Live] Gemini Live session established');
          sendToClient(clientWs, { type: 'connected' });
          // Defer greeting — sessionRef is assigned after await returns
          if (!sessionToken) {
            setTimeout(() => {
              try {
                if (sessionRef) {
                  console.log('[Live] Sending greeting...');
                  sessionRef.sendClientContent({
                    turns: [{
                      role: 'user',
                      parts: [{ text: '__GREETING__' }],
                    }],
                    turnComplete: true,
                  });
                }
              } catch (err: any) {
                console.error('[Live] Greeting failed:', err.message);
              }
            }, 500);
          } else {
            console.log('[Live] Resumed session — skipping greeting');
          }
        },
        onmessage: (msg) => {
          // Handle server content (text + audio)
          if (msg.serverContent) {
            const parts = msg.serverContent.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.text) {
                  // With native audio, part.text is the model's inner monologue.
                  // outputTranscription provides the actual spoken words (handled below).
                  // Only forward part.text if it passes the thinking filter AND
                  // no outputTranscription is configured (fallback for non-native-audio).
                  const cleanText = filterModelThinking(part.text);
                  if (cleanText) {
                    // Add to history but DON'T forward to client —
                    // outputTranscription is the clean spoken text source
                    addToHistory({ role: 'assistant', content: cleanText });
                  }
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

          // Handle session resumption update
          if (msg.sessionResumptionUpdate) {
            const newToken = typeof msg.sessionResumptionUpdate.newHandle === 'string' 
              ? msg.sessionResumptionUpdate.newHandle 
              : JSON.stringify(msg.sessionResumptionUpdate.newHandle);
            
            console.log('[Live] Received session resumption token:', newToken);
            sendToClient(clientWs, { 
              type: 'session_token', 
              token: newToken 
            });
          }

          // Handle interruption — user spoke during model response
          if (msg.serverContent?.interrupted) {
            sendToClient(clientWs, { type: 'interrupted' });
          }

          // Handle GoAway — server is about to terminate, trigger graceful reconnect
          if (msg.goAway) {
            console.log('[Live] GoAway received, timeLeft:', msg.goAway.timeLeft);
            sendToClient(clientWs, { type: 'error', text: 'Session refreshing...' });
          }

          // Handle input/output transcription for cleaner saved stories
          if (msg.serverContent?.inputTranscription?.text) {
            const userText = msg.serverContent.inputTranscription.text.trim();
            if (userText) {
              addToHistory({ role: 'user', content: userText });
              sendToClient(clientWs, { type: 'user_speech', text: userText });
            }
          }
          if (msg.serverContent?.outputTranscription?.text) {
            const aiText = msg.serverContent.outputTranscription.text;
            if (aiText) {
              sendToClient(clientWs, { type: 'text', text: aiText });
              const trimmed = aiText.trim();
              if (trimmed && !isModelThinkingLine(trimmed)) {
                addToHistory({ role: 'assistant', content: trimmed });
              }
            }
          }

          // Handle tool calls — execute server-side and send response back
          if (msg.toolCall?.functionCalls) {
            handleToolCalls(session, clientWs, msg.toolCall.functionCalls, conversationHistory, addToHistory, liveSessionId)
              .catch(err => console.error('[Live] Tool call handler error:', err));
          }
        },
        onerror: (e) => {
          console.error('[Live] Gemini Live error:', e);
          sendToClient(clientWs, { type: 'error', text: 'Live API connection error' });
        },
        onclose: (e) => {
          console.log('[Live] Gemini Live session closed');
          if (clientWs.readyState === clientWs.OPEN) {
            clientWs.close(1000, 'Gemini session ended');
          }
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
        sessionResumption: sessionToken ? { handle: sessionToken } : {},
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        contextWindowCompression: {
          triggerTokens: '100000',
          slidingWindow: { targetTokens: '80000' },
        },
        realtimeInputConfig: {
          automaticActivityDetection: {
            startOfSpeechSensitivity: 'START_SENSITIVITY_LOW' as any,
            endOfSpeechSensitivity: 'END_SENSITIVITY_LOW' as any,
            silenceDurationMs: 700,
            prefixPaddingMs: 20,
          },
        },
        systemInstruction: {
          parts: [{
            text: `You are OmniWeave — a cinematic storyteller performing a live story for the listener.

## CRITICAL: USE YOUR TOOLS
You MUST call generate_image at these moments:
- When a new scene begins or the setting changes
- When a character is introduced for the first time
- When a dramatic or climactic moment occurs
- When the user asks you to show, visualize, or illustrate anything
Do NOT describe a scene without also generating an image for it. Always call generate_image with a detailed visual prompt.

## GREETING
When you receive "__GREETING__", say: "Welcome to OmniWeave. I'm your creative director. Describe a world, and I'll bring it to life with voice, images, and music. What story shall we create?"

## STORYTELLING
- Speak as a dramatic narrator — vary pace, pitch, and emotion
- Create vivid characters with DISTINCT voices and accents
- Tell rich, detailed scenes of 4-8 sentences with sensory detail (sounds, smells, textures)
- Build dramatic tension — quiet moments before action, crescendos of emotion
- NEVER output your thinking, planning, reasoning, or meta-commentary
- NEVER say "I'm focusing on", "I'm imagining", "I'm creating" — only output the STORY NARRATION that the listener should hear
- Do NOT describe what you are ABOUT to do — just DO it

## TOOL USAGE
- generate_image: Call for EVERY new scene or major moment. Prompts must be detailed: art style, character appearance, lighting, composition, mood
- generate_music: Call when mood shifts significantly
- queryMemoryBank: Call with query about characters/places to maintain continuity

## INTERACTION
- Stay in character as the narrator
- Adapt immediately if the listener redirects the story`,
          }],
        },
        tools: liveToolDeclarations,
      },
    });

    // Now that connect() has returned, assign the ref for the deferred greeting
    sessionRef = session;

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
              addToHistory({ role: 'user', content: msg.text });
              session.sendClientContent({
                turns: [{ role: 'user', parts: [{ text: msg.text }] }],
                turnComplete: true,
              });
            }
            break;

          case 'end_audio':
            session.sendRealtimeInput({ audioStreamEnd: true });
            break;

          case 'ping':
            sendToClient(clientWs, { type: 'pong' });
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
  conversationHistory: Array<{ role: string; content: string; image?: string }>,
  addToHistory: (entry: { role: string; content: string; image?: string }) => void,
  sessionId?: string
): Promise<void> {
  const responses = await Promise.all(
    functionCalls.map(async (call) => {
      const toolName = call.name!;
      const args = call.args || {};
      
      // Inject sessionId for character consistency in tools
      if (sessionId) (args as any).sessionId = sessionId;

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
          addToHistory({ role: 'tool', content: `[Image: ${args.prompt}]`, image: result.imageDataUri });
        }
        
        // If it's a video, send the URL to the client for display
        if (toolName === 'generate_video' && result.videoUrl) {
          sendToClient(clientWs, { type: 'video', data: result.videoUrl });
          addToHistory({ role: 'tool', content: `[Video: ${args.prompt}]` });
        }

        return { name: toolName, response: result };
      } catch (err: any) {
        return { name: toolName, response: { status: 'error', error: err.message } };
      }
    })
  );

  // Send all tool responses back to Gemini (skip if client already disconnected)
  if (clientWs.readyState !== clientWs.OPEN) return;
  try {
    session.sendToolResponse({
      functionResponses: responses.map((r, i) => ({
        name: r.name,
        id: functionCalls[i]?.id || r.name,
        response: r.response,
      })),
    });
  } catch (err) {
    console.error('[Live] Failed to send tool responses:', err);
  }
}
