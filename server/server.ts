import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { InMemoryRunner, isFinalResponse } from '@google/adk';
import { createUserContent, GoogleGenAI } from '@google/genai';
import {
  ROOT_AGENT_MODEL,
  STORY_REVIEWER_MODEL,
  STORY_WRITER_MODEL,
  TTS_MODEL,
  LIVE_MODEL,
  rootAgent,
  storyPipeline,
} from './agent.js';
import { createLiveSession } from './liveSession.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '50mb' }));

const PORT = parseInt(process.env.PORT || '8080', 10);
const APP_NAME = 'omniweave';
const STORY_APP_NAME = 'omniweave-story-pipeline';

// Deterministic story generation runner used by the live app.
const storyRunner = new InMemoryRunner({
  appName: STORY_APP_NAME,
  agent: storyPipeline,
});

// Health check
app.get('/', (_req, res) => {
  res.json({
    service: 'OmniWeave ADK Agent Server',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    agent: rootAgent.name,
    framework: 'Google ADK for TypeScript (@google/adk)',
    googleCloudServices: [
      'Cloud Run (this server)',
      'Cloud Firestore (story persistence)',
      'Firebase Authentication (user auth)',
      'Firebase Hosting (frontend)',
      'Artifact Registry (container images)',
    ],
    geminiModels: [
      `${ROOT_AGENT_MODEL} (director orchestration)`,
      `${STORY_WRITER_MODEL} (story writing)`,
      `${STORY_REVIEWER_MODEL} (story review)`,
      'gemini-3.1-flash-image-preview (1K image generation)',
      `${TTS_MODEL} (multi-voice narration)`,
      'gemini-embedding-2-preview (multimodal embeddings)',
      'lyria-realtime-exp (ambient background music)',
      `${LIVE_MODEL} (Live API bidi-streaming voice conversation)`,
    ],
  });
});

// Agent architecture info
app.get('/api/agent-info', (_req, res) => {
  res.json({
    rootAgent: {
      name: rootAgent.name,
      description: rootAgent.description,
      model: ROOT_AGENT_MODEL,
      type: 'LlmAgent',
    },
    tools: [
      { name: 'generate_image', model: 'gemini-3.1-flash-image-preview', description: '1K resolution 16:9 image generation' },
      { name: 'generate_speech', model: TTS_MODEL, description: 'Multi-speaker voice narration with streaming audio' },
      { name: 'compute_embedding', model: 'gemini-embedding-2-preview', description: 'Multimodal story fingerprints for similarity search' },
      { name: 'generate_music', model: 'lyria-realtime-exp', description: 'Ambient background music via Lyria RealTime streaming' },
    ],
    subAgents: [
      {
        name: 'StoryPipeline',
        type: 'SequentialAgent',
        description: 'Write → Review pipeline for story quality',
        subAgents: [
          { name: 'StoryWriter', type: 'LlmAgent', model: STORY_WRITER_MODEL, description: 'Writes cinematic scripts with [IMAGE:] markers' },
          { name: 'StoryReviewer', type: 'LlmAgent', model: STORY_REVIEWER_MODEL, description: 'Validates speaker labels, image consistency, narrative quality' },
        ],
      },
    ],
    architecture: {
      framework: '@google/adk (Agent Development Kit for TypeScript)',
      pattern: 'Root agent with SequentialAgent sub-pipeline, FunctionTool integrations, and Live API bidi-streaming',
      agentCount: 3,
      toolCount: 4,
      modelCount: 8,
    },
    runtimeGeneration: {
      endpoint: '/api/generate',
      agent: 'StoryPipeline',
      description: 'Streams story generation through StoryWriter → StoryReviewer for deterministic live output',
    },
    liveMode: {
      endpoint: 'ws:///api/live',
      model: LIVE_MODEL,
      description: 'Gemini Live API bidirectional streaming — voice-in, multimodal-out conversational storytelling with real-time tool execution (image generation, music)',
      protocol: 'WebSocket',
    },
    hackathon: {
      category: 'Creative Storyteller',
      challenge: 'Gemini Live Agent Challenge',
      requirement: 'Multimodal interleaved output (text + images + audio) with Live API bidi-streaming',
    },
  });
});

app.post('/api/generate', async (req, res) => {
  const { prompt, userId = 'default-user', sessionId } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const session = await storyRunner.sessionService.createSession({
      appName: STORY_APP_NAME,
      userId,
      ...(sessionId && { id: sessionId }),
    });

    const userMessage = createUserContent(`Create a rich, immersive multimodal story about: "${prompt}"`);
    let renderedWriterText = false;
    let reviewerText = '';

    for await (const event of storyRunner.runAsync({
      userId,
      sessionId: session.id,
      newMessage: userMessage,
    })) {
      const author = event.author || 'StoryPipeline';
      const eventData: any = { author, isFinal: isFinalResponse(event) };

      const textParts = event.content?.parts?.filter((p: any) => p.text);
      if (textParts?.length) eventData.text = textParts.map((p: any) => p.text).join('');

      if (event.errorCode) eventData.errorCode = event.errorCode;
      if (event.errorMessage) eventData.errorMessage = event.errorMessage;
      if (event.actions?.stateDelta && Object.keys(event.actions.stateDelta).length > 0) {
        eventData.stateDelta = event.actions.stateDelta;
      }

      const toolCalls = event.content?.parts?.filter((p: any) => p.functionCall);
      if (toolCalls?.length) eventData.toolCalls = toolCalls.map((p: any) => ({ name: p.functionCall.name, args: p.functionCall.args }));

      const toolResponses = event.content?.parts?.filter((p: any) => p.functionResponse);
      if (toolResponses?.length) eventData.toolResponses = toolResponses.map((p: any) => ({ name: p.functionResponse.name, response: p.functionResponse.response }));

      if (eventData.text && author === 'StoryWriter') {
        eventData.renderText = true;
        renderedWriterText = true;
      }

      if (eventData.text && author === 'StoryReviewer') {
        reviewerText += eventData.text;
        eventData.renderText = false;
      }

      res.write(`data: ${JSON.stringify(eventData)}\n\n`);
    }

    if (!renderedWriterText && reviewerText.trim()) {
      res.write(`data: ${JSON.stringify({
        author: 'StoryReviewer',
        text: reviewerText,
        renderText: true,
        replaceText: true,
        isFinal: true,
      })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: any) {
    console.error('Generation error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message || 'Generation failed' })}\n\n`);
    res.end();
  }
});

// REST endpoints (image, embed, TTS) use API key mode for reliability.
// Only the ADK runner uses Vertex AI mode (via env vars automatically).
const getServerAI = () => {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
  if (apiKey) {
    // Explicitly disable Vertex AI — env var GOOGLE_GENAI_USE_VERTEXAI overrides constructor otherwise
    return new GoogleGenAI({ apiKey, vertexai: false } as any);
  }
  // Fallback to Vertex AI if no API key
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'global';
  if (!project) throw new Error('No API key or GOOGLE_CLOUD_PROJECT configured');
  return new GoogleGenAI({ vertexai: true, project, location });
};

app.post('/api/generate-image', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const ai = getServerAI();
      const negPrompt = ' Do not include any text, watermarks, logos, UI elements, or written words in the image.';
      const fullPrompt = prompt + negPrompt;
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: fullPrompt,
        config: { imageConfig: { aspectRatio: '16:9', imageSize: '1K' } },
      });

      const part = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
      if (part?.inlineData) {
        return res.json({ status: 'success', imageDataUri: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` });
      }
      if (attempt < maxRetries - 1) { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); continue; }
      return res.status(500).json({ status: 'error', error: 'No image data returned' });
    } catch (err: any) {
      if (attempt < maxRetries - 1 && (err.message?.includes('RESOURCE_EXHAUSTED') || err.message?.includes('429'))) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      return res.status(500).json({ status: 'error', error: err.message });
    }
  }
});

app.post('/api/embed', async (req, res) => {
  const { text, imageBase64, imageMimeType } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  try {
    const ai = getServerAI();
    // Build multimodal contents array — include image when provided
    const contents: any[] = [text];
    if (imageBase64 && imageMimeType) {
      contents.push({ inlineData: { data: imageBase64, mimeType: imageMimeType } });
    }

    // Use gemini-embedding-2-preview first (matches agent.ts), fallback chain
    const models = ['gemini-embedding-2-preview', 'gemini-embedding-001', 'text-embedding-005'];
    let lastError: any;
    for (const model of models) {
      try {
        // Use full multimodal contents for embedding-2, text-only for older models
        const embedContents = model === 'gemini-embedding-2-preview' ? contents : [text];
        const result = await ai.models.embedContent({ model, contents: embedContents });
        const values = result.embeddings?.[0]?.values || (result as any).embedding?.values;
        if (values) return res.json({ status: 'success', dimensions: values.length, embedding: values, model });
      } catch (e: any) {
        lastError = e;
      }
    }
    res.status(500).json({ status: 'error', error: lastError?.message || 'Embedding failed' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// TTS endpoint — routes browser TTS through Vertex AI backend
app.post('/api/tts', async (req, res) => {
  const { script, speakers } = req.body;
  if (!script) return res.status(400).json({ error: 'script is required' });

  try {
    const ai = getServerAI();
    const speakerVoiceConfigs = (speakers || []).map((s: any) => ({
      speaker: s.name,
      voiceConfig: { prebuiltVoiceConfig: { voiceName: s.voice || 'Zephyr' } },
    }));

    const speechConfig: any = speakerVoiceConfigs.length <= 1
      ? { voiceConfig: speakerVoiceConfigs[0]?.voiceConfig || { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } }
      : { multiSpeakerVoiceConfig: { speakerVoiceConfigs: speakerVoiceConfigs.slice(0, 2) } };

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = await ai.models.generateContentStream({
      model: TTS_MODEL,
      contents: [{ role: 'user', parts: [{ text: script }] }],
      config: { responseModalities: ['AUDIO'], speechConfig },
    });

    for await (const chunk of stream) {
      const audioPart = chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (audioPart?.data) {
        res.write(`data: ${JSON.stringify({ audio: audioPart.data, mimeType: audioPart.mimeType })}\n\n`);
      }
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).json({ status: 'error', error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

// Music streaming — Lyria RealTime proxy (keeps API key server-side)
// Lyria requires Google AI Studio API key (not Vertex AI)
app.post('/api/music', async (req, res) => {
  const { mood } = req.body;
  if (!mood) return res.status(400).json({ error: 'mood is required' });

  // Lyria only works with API key mode, not Vertex AI
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    return res.status(501).json({ status: 'error', error: 'Lyria requires a Google AI Studio API key (set GOOGLE_API_KEY)' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    let gotAudio = false;
    // Lyria requires API key mode — explicitly disable Vertex AI
    const ai = new GoogleGenAI({ apiKey, vertexai: false } as any);
    const session = await (ai as any).live.music.connect({
      model: 'models/lyria-realtime-exp',
      callbacks: {
        onAudioData: (data: { data: string }) => {
          gotAudio = true;
          if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ audio: data.data })}\n\n`);
          }
        },
      },
    });

    await session.setWeightedPrompts([{ text: mood, weight: 1.0 }]);
    await session.play();

    // If no audio arrives within 15s, close the stream
    const startupTimeout = setTimeout(() => {
      if (!gotAudio && !res.writableEnded) {
        console.warn('Lyria: no audio received within 15s, closing');
        try { session.pause(); } catch { /* ignore */ }
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      }
    }, 15000);

    const timeout = setTimeout(async () => {
      clearTimeout(startupTimeout);
      try { await session.pause(); } catch { /* ignore */ }
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      }
    }, 60000);

    req.on('close', async () => {
      clearTimeout(timeout);
      try { await session.pause(); } catch { /* ignore */ }
    });
  } catch (err: any) {
    console.warn('Lyria RealTime not available:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ status: 'error', error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

// Create HTTP server and attach WebSocket upgrade for Live API
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url!, `http://${req.headers.host}`).pathname;
  if (pathname === '/api/live') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      createLiveSession(ws);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🧵 OmniWeave ADK Agent Server`);
  console.log(`   Port:      ${PORT}`);
  console.log(`   Agent:     ${rootAgent.name}`);
  console.log(`   Framework: Google ADK for TypeScript`);
  console.log(`   Endpoints:`);
  console.log(`     GET  /              → Health + deployment proof`);
  console.log(`     GET  /api/agent-info → Multi-agent architecture`);
  console.log(`     POST /api/generate  → Story generation (SSE)`);
  console.log(`     POST /api/generate-image → Image generation`);
  console.log(`     POST /api/embed     → Multimodal embeddings`);
  console.log(`     POST /api/tts       → Text-to-speech (SSE)`);
  console.log(`     POST /api/music     → Background music (SSE)`);
  console.log(`     WS   /api/live      → Gemini Live API bidi-streaming (${LIVE_MODEL})\n`);
});
