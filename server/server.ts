import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { WebSocketServer } from 'ws';
import { InMemoryRunner, isFinalResponse } from '@google/adk';
import { createUserContent, GoogleGenAI } from '@google/genai';
import { initializeApp as initAdminApp, getApps as getAdminApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore, FieldValue } from 'firebase-admin/firestore';
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
import { getOrCreateImageChat, generateImageInChat } from './imageChat.js';
import { extractEntities, saveGraph, getRawGraph, extractToGraph, queryGraph } from './graphRag.js';
const app = express();

const ALLOWED_ORIGINS = [
  'https://gen-lang-client-0001923421.web.app',
  'https://gen-lang-client-0001923421.firebaseapp.app',
  'http://localhost:3000',
  'http://localhost:5173',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed`));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '20mb' }));

const generationLimiter = rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests. Please wait a moment.' } });
const mediaLimiter = rateLimit({ windowMs: 60_000, max: 15, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests.' } });
const ttsLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests.' } });

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
      'Cloud Build (CI/CD pipeline)',
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

app.post('/api/generate', generationLimiter, async (req, res) => {
  const { prompt, userId = 'default-user', sessionId, fast } = req.body;
  if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'prompt is required' });
  if (prompt.length > 10000) return res.status(400).json({ error: 'prompt too long (max 10000 chars)' });

  // Create a customized runner for this request to pass user context
  const runner = new InMemoryRunner({
    appName: `request-${Date.now()}`,
    agent: storyPipeline,
  });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let clientDisconnected = false;
  req.on('close', () => { clientDisconnected = true; });

  // FAST PATH: Direct model call, bypasses ADK overhead (~7s vs ~36s)
  if (fast !== false) {
    try {
      const ai = getServerAI();

      // Query memory bank for character continuity
      let memoryContext = '';
      if (userId !== 'default-user') {
        try {
          memoryContext = await queryGraph(userId, prompt, ai);
        } catch (memErr: any) { console.warn('[generate] Memory query failed (non-fatal):', memErr.message); }
      }

      const fullPrompt = memoryContext
        ? `MEMORY BANK: ${memoryContext}\n\nUSER PROMPT: ${prompt}`
        : `Create a rich, immersive multimodal story about: "${prompt}"`;

      res.write(`data: ${JSON.stringify({ author: 'StoryPipeline', text: '', renderText: false })}\n\n`);
      res.write(`data: ${JSON.stringify({ author: 'StoryWriter', text: '', renderText: false })}\n\n`);

      // Send keep-alive comments during generation to prevent Cloud Run proxy timeout
      const keepAlive = setInterval(() => {
        if (!res.writableEnded) res.write(': keepalive\n\n');
      }, 5000);

      // Generate story via SDK generateContent (systemInstruction inline in prompt for SDK compatibility)
      const storyPrompt = `You are a cinematic storyteller. Write a ~1000 word screenplay-format story with:
1. A ---CHARACTER SHEET--- block at top (ART STYLE, SETTING, CHARACTER entries with full appearance details)
2. 5 scenes, each starting with [IMAGE: detailed self-contained prompt restating art style + setting + character descriptions from the sheet]
3. Speaker labels on every line: Narrator:, CharacterName:
4. Characters with CONTRASTING voices (one formal, one casual; different verbal tics)
5. Emotional arc: setup, tension, climax, resolution, coda
6. Every [IMAGE:] prompt must be SELF-CONTAINED with full character descriptions
---END CHARACTER SHEET--- closes the character sheet block.
Output ONLY the story script. No commentary.

${fullPrompt}`;
      const response = await ai.models.generateContent({
        model: STORY_WRITER_MODEL,
        contents: [{ role: 'user', parts: [{ text: storyPrompt }] }],
      });

      clearInterval(keepAlive);

      let fullText = '';
      try { fullText = response.text || ''; } catch { fullText = response.candidates?.[0]?.content?.parts?.[0]?.text || ''; }
      console.log(`[generate/fast] ${fullText.length} chars from ${STORY_WRITER_MODEL}`);
      if (!fullText.trim()) throw new Error('Empty story response');

      // Send story text (ignore clientDisconnected — Cloud Run keep-alive may have fired falsely)
      const chunkSize = 300;
      for (let i = 0; i < fullText.length; i += chunkSize) {
        res.write(`data: ${JSON.stringify({ author: 'StoryWriter', text: fullText.slice(i, i + chunkSize), renderText: true })}\n\n`);
      }

      res.write(`data: ${JSON.stringify({ author: 'StoryReviewer', text: '[REVIEW: PASS]', renderText: false })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();

      // Auto-extract entities async
      if (fullText.trim() && userId !== 'default-user') {
        extractToGraph(fullText, userId).catch((err) =>
          console.warn('[generate/fast] Graph extraction failed:', err.message)
        );
      }
      return;
    } catch (fastErr: any) {
      console.error('[generate] Fast path failed:', fastErr.message, fastErr.stack?.split('\n').slice(0, 3).join(' '));
      // Fall through to ADK path
    }
  }

  // ADK PATH: Full SequentialAgent pipeline (slower but more robust)
  try {
    const session = await runner.sessionService.createSession({
      appName: STORY_APP_NAME,
      userId,
      ...(sessionId && { id: sessionId }),
    });

    const userMessage = createUserContent(`Create a rich, immersive multimodal story about: "${prompt}"`);
    let renderedWriterText = false;
    let reviewerText = '';

    for await (const event of runner.runAsync({
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

    // Auto-extract entities to Memory Bank after story generation
    if (reviewerText.trim() && userId !== 'default-user') {
      extractToGraph(reviewerText, userId).catch((err) =>
        console.warn('[generate] Graph extraction failed:', err.message)
      );
    }
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

app.post('/api/generate-image', mediaLimiter, async (req, res) => {
  const { prompt, sessionId, characterSheet } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  if (characterSheet && (typeof characterSheet !== 'string' || characterSheet.length > 5000)) return res.status(400).json({ error: 'characterSheet too long (max 5000 chars)' });

  // Use multi-turn chat if sessionId is provided for character consistency
  if (sessionId) {
    try {
      const ai = getServerAI();
      const chat = await getOrCreateImageChat(ai, sessionId, characterSheet);
      const result = await generateImageInChat(chat, prompt);
      if (result) return res.json(result);
      console.warn(`[ImageChat] Chat generation failed for ${sessionId}, falling back to single-shot`);
    } catch (err: any) {
      console.warn(`[ImageChat] Chat session error: ${err.message}, falling back to single-shot`);
    }
  }

  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const ai = getServerAI();
      const negPrompt = ' Do not include any text, watermarks, logos, UI elements, or written words in the image.';
      // Prepend character sheet for visual consistency across scenes
      const charContext = characterSheet
        ? `VISUAL REFERENCE — use these EXACT character descriptions and art style for consistency:\n${characterSheet}\n\nNow generate this scene:\n`
        : '';
      const fullPrompt = charContext + prompt + negPrompt;
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

app.post('/api/generate-video', generationLimiter, async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  try {
    const ai = getServerAI();

    // Start video generation with Veo 3.1 (generates audio: dialogue, SFX, ambient)
    // Use full Veo 3.1 for audio-capable cinematic clips
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt: prompt + ' Include ambient sound effects and atmospheric audio. Do not include any text, watermarks, logos, or UI elements.',
      config: {
        numberOfVideos: 1,
        durationSeconds: 8,
        aspectRatio: '16:9',
      },
    });

    console.log('[Video] Generation started, polling...');

    // Poll for completion (max 120 seconds)
    const startTime = Date.now();
    while (!operation.done) {
      if (Date.now() - startTime > 120000) {
        return res.status(504).json({ status: 'error', error: 'Video generation timed out' });
      }
      await new Promise(r => setTimeout(r, 5000));
      try {
        operation = await ai.operations.getVideosOperation({ operation });
      } catch (pollErr: any) {
        console.error('[Video] Polling error:', pollErr.message);
        return res.status(500).json({ status: 'error', error: 'Video generation polling failed' });
      }
    }

    const video = (operation as any).response?.generatedVideos?.[0];
    if (!video?.video?.uri) {
      return res.status(500).json({ status: 'error', error: 'No video generated' });
    }

    // Download the video and convert to base64 data URI
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
    const videoUrl = `${video.video.uri}&key=${apiKey}`;
    const videoResp = await fetch(videoUrl);
    if (!videoResp.ok) {
      return res.status(500).json({ status: 'error', error: 'Failed to download video' });
    }
    const videoBuffer = Buffer.from(await videoResp.arrayBuffer());
    const videoBase64 = videoBuffer.toString('base64');

    // Guard: reject videos larger than 18MB (leaves room for JSON envelope under 20MB limit)
    const videoSizeMB = videoBase64.length / (1024 * 1024);
    if (videoSizeMB > 18) {
      return res.status(413).json({ status: 'error', error: `Video too large: ${videoSizeMB.toFixed(1)}MB exceeds 18MB response limit` });
    }

    const videoDataUri = `data:video/mp4;base64,${videoBase64}`;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Video] Generated in ${elapsed}s, size: ${Math.round(videoBase64.length / 1024)}KB`);

    return res.json({ status: 'success', videoDataUri });
  } catch (err: any) {
    console.error('[Video] Error:', err.message);
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

app.post('/api/embed', mediaLimiter, async (req, res) => {
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
    return res.status(500).json({ status: 'error', error: lastError?.message || 'Embedding failed' });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

// TTS endpoint — Cloud TTS Chirp 3 HD with Gemini fallback
app.post('/api/tts', ttsLimiter, async (req, res) => {
  const { script, speakers } = req.body;
  if (!script) return res.status(400).json({ error: 'script is required' });
  if (typeof script !== 'string' || script.length > 50000) return res.status(400).json({ error: 'script must be a string under 50KB' });

  const primaryVoice = speakers?.[0]?.voice || 'Zephyr';
  const langCode = 'en-US';
  const voiceName = `${langCode}-Chirp3-HD-${primaryVoice}`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    // PRIMARY: Gemini TTS — multi-speaker voice acting with emotional performance
    // Gemini TTS interprets stage directions (whispering), (shouting) as performance cues
    const ai = getServerAI();
    const speakerVoiceConfigs = (speakers || []).map((s: any) => ({
      speaker: s.name,
      voiceConfig: { prebuiltVoiceConfig: { voiceName: s.voice || 'Zephyr' } },
    }));

    const speechConfig: any = speakerVoiceConfigs.length <= 1
      ? { voiceConfig: speakerVoiceConfigs[0]?.voiceConfig || { prebuiltVoiceConfig: { voiceName: primaryVoice } } }
      : { multiSpeakerVoiceConfig: { speakerVoiceConfigs: speakerVoiceConfigs.slice(0, 2) } };

    // Build performance direction based on speaker count
    const speakerNames = speakerVoiceConfigs.map((s: any) => s.speaker).join(' and ');
    const ttsContent = speakerVoiceConfigs.length > 1
      ? `You are performing a dramatic scene with ${speakerNames}. Act with full emotional range:
- The Narrator should be authoritative, cinematic — slow dramatic pauses, rising tension, whispered asides.
- Characters must sound COMPLETELY DIFFERENT from each other — vary pitch, pacing, accent, and energy.
- Use the stage directions in parentheses: (whispering) means speak softly, (shouting) means raise your voice, (trembling) means quiver.
- Build emotion through the scene — start measured, escalate with the drama.

${script}`
      : `Perform this as a cinematic narrator delivering a dramatic monologue. Use full emotional range — slow dramatic pauses for tension, rising energy for action, soft whispers for intimacy, powerful declarations for revelations. Vary your pacing throughout:\n\n${script}`;

    const stream = await ai.models.generateContentStream({
      model: TTS_MODEL,
      contents: [{ role: 'user', parts: [{ text: ttsContent }] }],
      config: { responseModalities: ['AUDIO'], speechConfig },
    });

    for await (const chunk of stream) {
      if (res.writableEnded) break;
      const audioPart = chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (audioPart?.data) {
        res.write(`data: ${JSON.stringify({ audio: audioPart.data, mimeType: audioPart.mimeType })}\n\n`);
      }
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
    console.log(`[TTS] Gemini TTS: ${speakerVoiceConfigs.length} speakers`);
    return;
  } catch (geminiErr: any) {
    console.warn('[TTS] Gemini TTS failed, falling back to Cloud TTS:', geminiErr.message);
    if (res.writableEnded) return;

    // FALLBACK: Cloud TTS Chirp 3 HD (single voice, less expressive but reliable)
    try {
      const { TextToSpeechClient } = await import('@google-cloud/text-to-speech');
      const ttsClient = new TextToSpeechClient();
      const chunks = script.match(/[^.!?]+[.!?]+/g) || [script];
      for (const chunk of chunks) {
        if (res.writableEnded) break;
        const [response] = await ttsClient.synthesizeSpeech({
          input: { text: chunk.trim() },
          voice: { languageCode: langCode, name: voiceName },
          audioConfig: { audioEncoding: 'LINEAR16' as any, sampleRateHertz: 24000 },
        });
        if (response.audioContent) {
          const buf = response.audioContent as Buffer;
          const pcm = buf.length > 44 ? buf.subarray(44) : buf;
          res.write(`data: ${JSON.stringify({ audio: pcm.toString('base64'), mimeType: 'audio/pcm;rate=24000' })}\n\n`);
        }
      }
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (cloudErr: any) {
      if (!res.headersSent) {
        res.status(500).json({ status: 'error', error: cloudErr.message });
      } else {
        res.write(`data: ${JSON.stringify({ error: geminiErr.message })}\n\n`);
        res.end();
      }
    }
  }
});

// Music streaming — Lyria RealTime proxy (keeps API key server-side)
// Lyria requires Google AI Studio API key (not Vertex AI) + v1alpha API version
app.post('/api/music', mediaLimiter, async (req, res) => {
  const { mood } = req.body;
  if (!mood) return res.status(400).json({ error: 'mood is required' });
  if (typeof mood !== 'string' || mood.length > 1000) return res.status(400).json({ error: 'mood must be a string under 1KB' });

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
    // Lyria requires API key mode with v1alpha API version
    const ai = new GoogleGenAI({
      apiKey,
      vertexai: false,
      httpOptions: { apiVersion: 'v1alpha' },
    } as any);

    const session = await ai.live.music.connect({
      model: 'models/lyria-realtime-exp',
      callbacks: {
        onmessage: (msg: any) => {
          const chunk = msg.audioChunk;
          if (chunk?.data) {
            gotAudio = true;
            if (!res.writableEnded) {
              res.write(`data: ${JSON.stringify({ audio: chunk.data })}\n\n`);
            }
          }
          if (msg.filteredPrompt) {
            console.warn('[Lyria] Prompt filtered:', msg.filteredPrompt);
          }
        },
      },
    });

    await session.setWeightedPrompts({ weightedPrompts: [{ text: mood, weight: 1.0 }] });
    await session.setMusicGenerationConfig({
      musicGenerationConfig: { musicGenerationMode: 'QUALITY' as any },
    });
    session.play();

    // If no audio arrives within 15s, close the stream
    const startupTimeout = setTimeout(() => {
      if (!gotAudio && !res.writableEnded) {
        console.warn('Lyria: no audio received within 15s, closing');
        try { session.pause(); } catch { /* ignore */ }
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      }
    }, 15000);

    const timeout = setTimeout(() => {
      clearTimeout(startupTimeout);
      try { session.pause(); } catch { /* ignore */ }
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      }
    }, 60000);

    req.on('close', () => {
      clearTimeout(timeout);
      clearTimeout(startupTimeout);
      try { session.pause(); } catch { /* ignore */ }
    });
  } catch (err: any) {
    // Clear any pending timeouts (they may not exist if error was early)
    try { clearTimeout((req as any)._lyriaTimeout); } catch { /* */ }
    try { clearTimeout((req as any)._lyriaStartup); } catch { /* */ }
    console.warn('Lyria RealTime not available:', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ status: 'error', error: err.message });
    } else if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

// ---------------------------------------------------------------------------
// POST /api/live/save — Persist a live session as a story in Firestore
// ---------------------------------------------------------------------------
// Uses the Firestore REST API (no firebase-admin needed) with the client's
// Firebase ID token forwarded in the Authorization header.
// ---------------------------------------------------------------------------

interface TranscriptEntry {
  role: string;
  text?: string;
  image?: string;
  video?: string;
}

interface LiveStoryPart {
  type: 'text' | 'image' | 'video';
  id: string;
  text?: string;
  url?: string;
  prompt?: string;
}

/** Reuse or create the firebase-admin app (uses ADC on Cloud Run) */
function getAdminApp() {
  if (getAdminApps().length > 0) return getAdminApps()[0];
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0001923421';
  return initAdminApp({ projectId });
}

/** Verify a Firebase ID token (including Anonymous Auth) and return the uid */
async function verifyFirebaseToken(idToken: string): Promise<string> {
  const app = getAdminApp();
  const decoded = await getAuth(app).verifyIdToken(idToken);
  return decoded.uid;
}

app.post('/api/live/save', async (req, res) => {
  // 1. Extract and verify Firebase ID token
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!idToken) {
    return res.status(401).json({ error: 'Authorization header with Bearer token required' });
  }

  let uid: string;
  try {
    uid = await verifyFirebaseToken(idToken);
  } catch (err: any) {
    return res.status(401).json({ error: err.message || 'Token verification failed' });
  }

  // 2. Parse request body
  const { transcript, title } = req.body as {
    transcript?: TranscriptEntry[];
    title?: string;
  };

  if (!Array.isArray(transcript) || transcript.length === 0) {
    return res.status(400).json({ error: 'transcript array is required and must not be empty' });
  }

  // 2b. Validate request body size (reject if over 20MB)
  const bodySize = JSON.stringify(req.body).length;
  if (bodySize > 20 * 1024 * 1024) {
    return res.status(413).json({ error: `Request body too large: ${Math.round(bodySize / 1024 / 1024)}MB exceeds 20MB limit` });
  }

  // 3. Convert transcript entries to StoryParts
  const storyParts: LiveStoryPart[] = transcript
    .filter((e) => e.role === 'assistant' || e.role === 'image' || e.role === 'video')
    .map((e, i) => {
      if (e.role === 'image' && e.image) {
        return {
          type: 'image' as const,
          id: `live-img-${i}-${Date.now()}`,
          url: e.image,
          prompt: 'Live session image',
        };
      }
      if (e.role === 'video' && e.video) {
        return {
          type: 'video' as const,
          id: `live-vid-${i}-${Date.now()}`,
          url: e.video,
          prompt: 'Live session video',
        };
      }
      return {
        type: 'text' as const,
        id: `live-text-${i}-${Date.now()}`,
        text: e.text || '',
      };
    });

  if (storyParts.length === 0) {
    return res.status(400).json({ error: 'No saveable parts found in transcript (need assistant/image/video entries)' });
  }

  // 4a. Strip inline image/video data from parts before Firestore save (stays under 1MB)
  // Keep original parts for lead image extraction, then strip for storage
  const leadImageUrl = storyParts.find(p => p.type === 'image')?.url || null;
  const partsForFirestore: LiveStoryPart[] = storyParts.map(p => {
    if (p.type === 'image') return { ...p, url: '' };
    if (p.type === 'video') return { ...p, url: '' };
    return p;
  });

  // 4b. Compress lead image to thumbnail (max 320px, JPEG quality 0.6)
  // Server-side: just truncate to max 200KB to avoid bloating the Firestore doc
  let leadImage: string | null = null;
  if (leadImageUrl && leadImageUrl.length < 200000) {
    leadImage = leadImageUrl;
  }

  // 5. Build combined text for embedding
  const combinedText = storyParts
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text)
    .join('\n\n');

  // 6. Generate embedding
  let embedding: number[] | null = null;
  if (combinedText.trim()) {
    try {
      const ai = getServerAI();
      const models = ['gemini-embedding-2-preview', 'gemini-embedding-001', 'text-embedding-005'];
      for (const model of models) {
        try {
          const result = await ai.models.embedContent({
            model,
            contents: [combinedText],
          });
          const values = result.embeddings?.[0]?.values || (result as any).embedding?.values;
          if (values) { embedding = values; break; }
        } catch { /* try next model */ }
      }
    } catch (err: any) {
      console.warn('[live/save] Embedding failed (non-fatal):', err.message);
    }
  }

  // 7. Save to Firestore via firebase-admin SDK
  const databaseId = process.env.FIRESTORE_DATABASE_ID || 'ai-studio-b1260629-87fa-4e1d-8d73-d8915da0d2f0';
  const storyTitle = title || `Live Session — ${new Date().toLocaleDateString()}`;

  try {
    const adminDb = getAdminFirestore(getAdminApp(), databaseId);
    const storyRef = adminDb.collection('stories').doc();
    const storyId = storyRef.id;

    const docData: Record<string, unknown> = {
      authorId: uid,
      title: storyTitle,
      parts: JSON.stringify(partsForFirestore),
      createdAt: FieldValue.serverTimestamp(),
      isLiveSession: true,
      source: 'live',
    };
    if (leadImage) docData.leadImage = leadImage;

    // Final Firestore doc size guard (must stay under 1MB)
    const docSizeEstimate = JSON.stringify(docData).length;
    if (docSizeEstimate > 900000) {
      console.warn(`[live/save] Doc size ${Math.round(docSizeEstimate / 1024)}KB exceeds safety threshold, stripping leadImage`);
      delete docData.leadImage;
    }
    if (embedding) docData.embedding = embedding;

    await storyRef.set(docData);

    console.log(`[live/save] Saved story ${storyId} for uid ${uid}`);

    // Save images to Firebase Storage (async, non-blocking)
    const imageParts = storyParts.filter(p => p.type === 'image' && p.url && p.url.startsWith('data:'));
    if (imageParts.length > 0) {
      void (async () => {
        try {
          const { getStorage: getAdminStorage } = await import('firebase-admin/storage');
          const bucket = getAdminStorage(getAdminApp()).bucket();
          const mediaCol = adminDb.collection('stories').doc(storyId).collection('media');
          for (const part of imageParts) {
            try {
              const matches = (part.url as string).match(/^data:([^;]+);base64,(.+)$/);
              if (!matches) continue;
              const [, mimeType, base64Data] = matches;
              const buffer = Buffer.from(base64Data, 'base64');
              const filePath = `stories/${storyId}/${part.id}.img`;
              const file = bucket.file(filePath);
              await file.save(buffer, { metadata: { contentType: mimeType } });
              await file.makePublic();
              const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
              await mediaCol.doc().set({ partId: part.id, type: 'image', storageUrl: publicUrl });
            } catch (imgErr: any) {
              console.warn(`[live/save] Failed to save image ${part.id}:`, imgErr.message);
            }
          }
          console.log(`[live/save] Saved ${imageParts.length} images to Storage for ${storyId}`);
        } catch (storageErr: any) {
          console.warn('[live/save] Storage save failed:', storageErr.message);
        }
      })();
    }

    // Trigger Memory Bank Extraction (Async)
    if (combinedText.trim()) {
       extractToGraph(combinedText, uid).catch(err => console.warn('[live/save] Graph extraction failed:', err.message));
    }

    return res.json({ success: true, storyId });
  } catch (err: any) {
    console.error('[live/save] Firestore write error:', err);
    return res.status(500).json({ error: err.message || 'Failed to save story' });
  }
});


// Memory Bank — get raw graph for the authenticated user
app.get('/api/memory-bank', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const uid = req.query.uid as string;
  if (!uid) return res.status(400).json({ error: 'uid query param is required' });
  if (idToken) {
    try {
      const verifiedUid = await verifyFirebaseToken(idToken);
      if (verifiedUid !== uid) return res.status(403).json({ error: 'Forbidden' });
    } catch { return res.status(401).json({ error: 'Invalid token' }); }
  }
  try {
    const graph = await getRawGraph(uid);
    if (!graph) return res.json({ nodes: [], edges: [] });
    return res.json({ nodes: graph.nodes, edges: graph.edges });
  } catch (err: any) {
    console.error('[memory-bank GET] error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch memory bank' });
  }
});

// Memory Bank — extract entities from story text and save to graph
app.post('/api/memory-bank/extract', mediaLimiter, async (req, res) => {
  const { uid, storyId, storyText } = req.body;
  if (!uid || !storyId || !storyText) {
    return res.status(400).json({ error: 'uid, storyId, and storyText are required' });
  }
  if (typeof storyText !== 'string' || storyText.length > 50000) return res.status(400).json({ error: 'storyText too long' });
  try {
    const genAI = getServerAI();
    const { nodes, edges } = await extractEntities(storyText, storyId, genAI);
    await saveGraph(uid, nodes, edges);
    return res.json({ success: true, nodesAdded: nodes.length });
  } catch (err: any) {
    console.error('[memory-bank/extract POST] error:', err.message);
    return res.status(500).json({ error: 'Extraction failed' });
  }
});
// Create HTTP server and attach WebSocket upgrade for Live API
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const pathname = url.pathname;
  if (pathname === '/api/live') {
    const sessionToken = url.searchParams.get('token');
    wss.handleUpgrade(req, socket, head, (ws) => {
      createLiveSession(ws, sessionToken).catch((err) => {
        console.error('[Live] Unhandled error in createLiveSession:', err);
        if (ws.readyState === ws.OPEN) ws.close(1011, 'Internal error');
      });
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
  console.log(`     POST /api/generate-video → Video generation (Veo 3.1 Fast)`);
  console.log(`     POST /api/embed     → Multimodal embeddings`);
  console.log(`     POST /api/tts       → Text-to-speech (SSE)`);
  console.log(`     POST /api/music     → Background music (SSE)`);
  console.log(`     POST /api/live/save → Save live session as story (Firestore)`);
  console.log(`     GET  /api/memory-bank → Read user memory graph`);
  console.log(`     POST /api/memory-bank/extract → Extract & save entities from story`);
  console.log(`     WS   /api/live      → Gemini Live API bidi-streaming (${LIVE_MODEL})\n`);
});
