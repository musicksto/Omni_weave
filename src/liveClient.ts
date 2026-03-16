export interface LiveCallbacks {
  onConnected: () => void;
  onText: (text: string) => void;
  onAudio: (base64: string, mimeType: string) => void;
  onImage: (dataUri: string) => void;
  onVideo: (videoUrl: string) => void;
  onToolCall: (toolName: string, message: string) => void;
  onTurnComplete: () => void;
  onUserSpeech?: (text: string) => void;
  onSessionToken?: (token: string) => void;
  onError: (message: string) => void;
  onDisconnected: () => void;
}

interface LiveClientState {
  ws: WebSocket | null;
  audioCtx: AudioContext | null;
  micCtx: AudioContext | null;
  mediaStream: MediaStream | null;
  scriptProcessor: ScriptProcessorNode | null;
  pingInterval: ReturnType<typeof setInterval> | null;
  nextPlayTime: number;
  isConnected: boolean;
  isMuted: boolean;
  sessionToken: string | null;
}

const SAMPLE_RATE_IN = 16000;
const SAMPLE_RATE_OUT = 24000;

function createState(): LiveClientState {
  return {
    ws: null,
    audioCtx: null,
    micCtx: null,
    mediaStream: null,
    scriptProcessor: null,
    pingInterval: null,
    nextPlayTime: 0,
    isConnected: false,
    isMuted: false,
    sessionToken: null,
  };
}

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

  function getWsUrl(token?: any): string {
    const url = serverUrl.replace(/^http/, 'ws');
    const base = `${url}/api/live`;
    
    let tokenStr: string | null = null;
    if (typeof token === 'string') {
      tokenStr = token;
    } else if (token && typeof token === 'object') {
      tokenStr = token.handle || token.token || JSON.stringify(token);
      console.warn('[LiveClient] Received object token, extracted/stringified to:', tokenStr);
    }

    return (tokenStr && tokenStr !== '[object Object]') 
      ? `${base}?token=${encodeURIComponent(tokenStr)}` 
      : base;
  }

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

  function handleMessage(event: MessageEvent): void {
    try {
      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case 'connected':
          state.isConnected = true;
          callbacks.onConnected();
          break;

        case 'session_token':
          if (msg.token) {
            state.sessionToken = msg.token;
            callbacks.onSessionToken?.(msg.token);
          }
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

        case 'user_speech':
          if (msg.text) callbacks.onUserSpeech?.(msg.text);
          break;

        case 'interrupted':
          if (state.audioCtx) {
            state.audioCtx.close().catch(() => {});
            state.audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE_OUT });
            state.nextPlayTime = 0;
          }
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
    async start(token?: string): Promise<void> {
      if (!state.audioCtx || state.audioCtx.state === 'closed') {
        state.audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE_OUT });
      }
      state.nextPlayTime = 0;

      const wsUrl = getWsUrl(token || state.sessionToken || undefined);
      console.info('[LiveClient] Connecting to', wsUrl.replace(/\?.*/, ''));
      state.ws = new WebSocket(wsUrl);

      state.ws.onmessage = handleMessage;

      state.ws.onerror = () => {
        callbacks.onError('WebSocket connection failed');
      };

      state.ws.onclose = () => {
        state.isConnected = false;
        callbacks.onDisconnected();
      };

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (state.ws && state.ws.readyState !== WebSocket.CLOSED) {
            state.ws.close();
            state.ws = null;
          }
          reject(new Error('WebSocket connection timeout'));
        }, 10000);
        state.ws!.onopen = () => {
          clearTimeout(timeout);
          state.pingInterval = setInterval(() => {
            if (state.ws && state.ws.readyState === WebSocket.OPEN) {
              state.ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, 15000);
          resolve();
        };
      });

      try {
        state.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: { ideal: SAMPLE_RATE_IN },
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
      } catch (micErr: any) {
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
          state.ws.close(1000, 'Microphone denied');
        }
        state.ws = null;
        callbacks.onError(micErr.name === 'NotAllowedError'
          ? 'Microphone access denied. Please allow microphone access and try again.'
          : `Microphone error: ${micErr.message || 'Unknown error'}`);
        throw micErr;
      }

      state.micCtx = new AudioContext({ sampleRate: SAMPLE_RATE_IN });
      const source = state.micCtx.createMediaStreamSource(state.mediaStream);

      state.scriptProcessor = state.micCtx.createScriptProcessor(1024, 1, 1);
      state.scriptProcessor.onaudioprocess = (e) => {
        if (state.isMuted || !state.ws || state.ws.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const pcmSamples = downsample(inputData, state.micCtx!.sampleRate, SAMPLE_RATE_IN);
        const base64 = float32ToBase64PCM(pcmSamples);

        state.ws.send(JSON.stringify({ type: 'audio', data: base64 }));
      };

      source.connect(state.scriptProcessor);
      state.scriptProcessor.connect(state.micCtx.destination);
    },

    stop(): void {
      if (state.pingInterval) {
        clearInterval(state.pingInterval);
        state.pingInterval = null;
      }
      if (state.mediaStream) {
        state.mediaStream.getTracks().forEach((t) => t.stop());
        state.mediaStream = null;
      }

      if (state.scriptProcessor) {
        state.scriptProcessor.disconnect();
        state.scriptProcessor = null;
      }

      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({ type: 'end_audio' }));
        state.ws.close(1000, 'User stopped');
      }
      state.ws = null;
      state.isConnected = false;

      if (state.micCtx) {
        state.micCtx.close().catch(() => {});
        state.micCtx = null;
      }
      if (state.audioCtx) {
        state.audioCtx.close().catch(() => {});
        state.audioCtx = null;
      }
    },

    sendText(text: string): void {
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({ type: 'text', text }));
      }
    },

    toggleMute(): boolean {
      state.isMuted = !state.isMuted;
      return state.isMuted;
    },

    get isConnected(): boolean {
      return state.isConnected;
    },

    get isMuted(): boolean {
      return state.isMuted;
    },
  };
}
