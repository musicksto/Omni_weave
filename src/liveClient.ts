/**
 * OmniWeave Live Client — Browser-side Gemini Live API interface
 *
 * Handles WebSocket connection, microphone capture (16kHz PCM),
 * audio playback via Web Audio API, and message routing.
 */

export interface LiveCallbacks {
  onConnected: () => void;
  onText: (text: string) => void;
  onAudio: (base64: string, mimeType: string) => void;
  onImage: (dataUri: string) => void;
  onVideo: (videoUrl: string) => void;
  onToolCall: (toolName: string, message: string) => void;
  onTurnComplete: () => void;
  onError: (message: string) => void;
  onDisconnected: () => void;
}

interface LiveClientState {
  ws: WebSocket | null;
  audioCtx: AudioContext | null;
  mediaStream: MediaStream | null;
  scriptProcessor: ScriptProcessorNode | null;
  nextPlayTime: number;
  isConnected: boolean;
  isMuted: boolean;
}

const SAMPLE_RATE_IN = 16000;  // Mic capture rate
const SAMPLE_RATE_OUT = 24000; // Gemini output rate

function createState(): LiveClientState {
  return {
    ws: null,
    audioCtx: null,
    mediaStream: null,
    scriptProcessor: null,
    nextPlayTime: 0,
    isConnected: false,
    isMuted: false,
  };
}

/** Convert Float32 audio samples to 16-bit PCM base64 */
function float32ToBase64PCM(samples: Float32Array): string {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Decode base64 PCM (16-bit LE) to Float32Array */
function base64PCMToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const samples = new Float32Array(bytes.length / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = view.getInt16(i * 2, true) / 0x8000;
  }
  return samples;
}

/** Downsample audio from source rate to target rate */
function downsample(samples: Float32Array, sourceRate: number, targetRate: number): Float32Array {
  if (sourceRate === targetRate) return samples;
  const ratio = sourceRate / targetRate;
  const newLength = Math.floor(samples.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    result[i] = samples[Math.floor(i * ratio)];
  }
  return result;
}

export function createLiveClient(serverUrl: string, callbacks: LiveCallbacks) {
  const state = createState();

  function getWsUrl(): string {
    const url = serverUrl.replace(/^http/, 'ws');
    return `${url}/api/live`;
  }

  /** Play received PCM audio through speakers with gapless scheduling */
  function playAudio(base64: string): void {
    if (!state.audioCtx) return;
    const samples = base64PCMToFloat32(base64);
    const audioBuffer = state.audioCtx.createBuffer(1, samples.length, SAMPLE_RATE_OUT);
    audioBuffer.getChannelData(0).set(samples);

    const source = state.audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(state.audioCtx.destination);

    const now = state.audioCtx.currentTime;
    const startTime = Math.max(now, state.nextPlayTime);
    source.start(startTime);
    state.nextPlayTime = startTime + audioBuffer.duration;
  }

  /** Handle incoming WebSocket messages */
  function handleMessage(event: MessageEvent): void {
    try {
      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case 'connected':
          state.isConnected = true;
          callbacks.onConnected();
          break;

        case 'text':
          if (msg.text) callbacks.onText(msg.text);
          break;

        case 'audio':
          if (msg.data) {
            playAudio(msg.data);
            callbacks.onAudio(msg.data, msg.mimeType || 'audio/pcm');
          }
          break;

        case 'image':
          if (msg.data) callbacks.onImage(msg.data);
          break;

        case 'video':
          if (msg.data) callbacks.onVideo(msg.data);
          break;

        case 'tool_call':
          callbacks.onToolCall(msg.toolName || '', msg.text || '');
          break;

        case 'turn_complete':
          callbacks.onTurnComplete();
          break;

        case 'error':
          callbacks.onError(msg.text || 'Unknown error');
          break;

        default:
          console.warn('[LiveClient] Unknown message type:', msg.type);
      }
    } catch (err) {
      console.error('[LiveClient] Failed to parse message:', err);
    }
  }

  return {
    /** Start a live session: connect WebSocket + capture microphone */
    async start(): Promise<void> {
      // Initialize AudioContext
      state.audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE_OUT });
      state.nextPlayTime = 0;

      // Connect WebSocket
      const wsUrl = getWsUrl();
      console.log('[LiveClient] Connecting to', wsUrl);
      state.ws = new WebSocket(wsUrl);

      state.ws.onmessage = handleMessage;

      state.ws.onerror = () => {
        callbacks.onError('WebSocket connection failed');
      };

      state.ws.onclose = () => {
        state.isConnected = false;
        callbacks.onDisconnected();
      };

      // Wait for WebSocket to open
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('WebSocket connection timeout')), 10000);
        state.ws!.onopen = () => {
          clearTimeout(timeout);
          resolve();
        };
      });

      // Start microphone capture
      state.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: { ideal: SAMPLE_RATE_IN },
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      const micCtx = new AudioContext({ sampleRate: SAMPLE_RATE_IN });
      const source = micCtx.createMediaStreamSource(state.mediaStream);

      // ScriptProcessorNode for PCM capture (4096 buffer = ~256ms at 16kHz)
      state.scriptProcessor = micCtx.createScriptProcessor(4096, 1, 1);
      state.scriptProcessor.onaudioprocess = (e) => {
        if (state.isMuted || !state.ws || state.ws.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        // Downsample if browser's actual sample rate differs from requested
        const pcmSamples = downsample(inputData, micCtx.sampleRate, SAMPLE_RATE_IN);
        const base64 = float32ToBase64PCM(pcmSamples);

        state.ws.send(JSON.stringify({ type: 'audio', data: base64 }));
      };

      source.connect(state.scriptProcessor);
      state.scriptProcessor.connect(micCtx.destination); // Required for processing to work
    },

    /** Stop the live session */
    stop(): void {
      // Stop microphone
      if (state.mediaStream) {
        state.mediaStream.getTracks().forEach((t) => t.stop());
        state.mediaStream = null;
      }

      if (state.scriptProcessor) {
        state.scriptProcessor.disconnect();
        state.scriptProcessor = null;
      }

      // Close WebSocket
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({ type: 'end_audio' }));
        state.ws.close(1000, 'User stopped');
      }
      state.ws = null;
      state.isConnected = false;

      // Close audio context
      if (state.audioCtx) {
        state.audioCtx.close().catch(() => {});
        state.audioCtx = null;
      }
    },

    /** Send a text message (non-voice input fallback) */
    sendText(text: string): void {
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({ type: 'text', text }));
      }
    },

    /** Toggle microphone mute */
    toggleMute(): boolean {
      state.isMuted = !state.isMuted;
      return state.isMuted;
    },

    /** Check if connected */
    get isConnected(): boolean {
      return state.isConnected;
    },

    /** Check if muted */
    get isMuted(): boolean {
      return state.isMuted;
    },
  };
}
