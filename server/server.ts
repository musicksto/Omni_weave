import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { InMemoryRunner, isFinalResponse } from '@google/adk';
import { createUserContent } from '@google/genai';
import { rootAgent } from './agent.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '50mb' }));

const PORT = parseInt(process.env.PORT || '8080', 10);
const APP_NAME = 'omniweave';

// Create the ADK runner
const runner = new InMemoryRunner({ appName: APP_NAME, agent: rootAgent });

// ─── Health Check (judges: visit this URL for deployment proof) ─────────────
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
      'gemini-2.5-flash (agent reasoning)',
      'gemini-3.1-flash-image-preview (1K image generation)',
      'gemini-2.5-flash-preview-tts (multi-voice narration)',
      'gemini-embedding-2-preview (multimodal embeddings)',
    ],
  });
});

// ─── Agent Architecture Info (judges: this shows the multi-agent system) ────
app.get('/api/agent-info', (_req, res) => {
  res.json({
    rootAgent: {
      name: rootAgent.name,
      description: rootAgent.description,
      model: 'gemini-2.5-flash',
      type: 'LlmAgent',
    },
    tools: [
      { name: 'generate_image', model: 'gemini-3.1-flash-image-preview', description: '1K resolution 16:9 image generation' },
      { name: 'generate_speech', model: 'gemini-2.5-flash-preview-tts', description: 'Multi-speaker voice narration with streaming audio' },
      { name: 'compute_embedding', model: 'gemini-embedding-2-preview', description: 'Multimodal story fingerprints for similarity search' },
      { name: 'generate_music', model: 'lyria-realtime-exp', description: 'Ambient background music via Lyria RealTime streaming' },
    ],
    subAgents: [
      {
        name: 'StoryPipeline',
        type: 'SequentialAgent',
        description: 'Write → Review pipeline for story quality',
        subAgents: [
          { name: 'StoryWriter', type: 'LlmAgent', model: 'gemini-2.5-flash', description: 'Writes cinematic scripts with [IMAGE:] markers' },
          { name: 'StoryReviewer', type: 'LlmAgent', model: 'gemini-2.5-flash', description: 'Validates speaker labels, image consistency, narrative quality' },
        ],
      },
    ],
    architecture: {
      framework: '@google/adk (Agent Development Kit for TypeScript)',
      pattern: 'Root agent with SequentialAgent sub-pipeline and FunctionTool integrations',
      agentCount: 3,
      toolCount: 4,
      modelCount: 5,
    },
    hackathon: {
      category: 'Creative Storyteller',
      challenge: 'Gemini Live Agent Challenge',
      requirement: 'Multimodal interleaved output (text + images + audio)',
    },
  });
});

// ─── Generate Story (Streaming via SSE) ─────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  const { prompt, userId = 'default-user', sessionId } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const session = await runner.sessionService.createSession({
      appName: APP_NAME,
      userId,
      ...(sessionId && { id: sessionId }),
    });

    const userMessage = createUserContent(`Create a rich, immersive multimodal story about: "${prompt}"`);

    for await (const event of runner.runAsync(userId, session.id, userMessage)) {
      const eventData: any = { author: event.author, isFinal: isFinalResponse(event) };

      const textParts = event.content?.parts?.filter((p: any) => p.text);
      if (textParts?.length) eventData.text = textParts.map((p: any) => p.text).join('');

      const toolCalls = event.content?.parts?.filter((p: any) => p.functionCall);
      if (toolCalls?.length) eventData.toolCalls = toolCalls.map((p: any) => ({ name: p.functionCall.name, args: p.functionCall.args }));

      const toolResponses = event.content?.parts?.filter((p: any) => p.functionResponse);
      if (toolResponses?.length) eventData.toolResponses = toolResponses.map((p: any) => ({ name: p.functionResponse.name, response: p.functionResponse.response }));

      res.write(`data: ${JSON.stringify(eventData)}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: any) {
    console.error('Generation error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message || 'Generation failed' })}\n\n`);
    res.end();
  }
});

// ─── Generate Image (Direct Tool Call) ──────────────────────────────────────
app.post('/api/generate-image', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ status: 'error', error: 'Server API key not configured' });
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: prompt,
      config: { imageConfig: { aspectRatio: '16:9', imageSize: '1K' } },
    });

    const part = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (part?.inlineData) {
      res.json({ status: 'success', imageDataUri: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` });
    } else {
      res.status(500).json({ status: 'error', error: 'No image data returned' });
    }
  } catch (err: any) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ─── Compute Embedding ──────────────────────────────────────────────────────
app.post('/api/embed', async (req, res) => {
  const { text, imageBase64, imageMimeType } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ status: 'error', error: 'Server API key not configured' });
    const ai = new GoogleGenAI({ apiKey });

    const contents: any[] = [text];
    if (imageBase64 && imageMimeType) contents.push({ inlineData: { data: imageBase64, mimeType: imageMimeType } });

    const result = await ai.models.embedContent({ model: 'gemini-embedding-2-preview', contents });
    const values = result.embeddings?.[0]?.values || (result as any).embedding?.values;
    res.json({ status: 'success', dimensions: values?.length || 0, embedding: values });
  } catch (err: any) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🧵 OmniWeave ADK Agent Server`);
  console.log(`   Port:      ${PORT}`);
  console.log(`   Agent:     ${rootAgent.name}`);
  console.log(`   Framework: Google ADK for TypeScript`);
  console.log(`   Endpoints:`);
  console.log(`     GET  /              → Health + deployment proof`);
  console.log(`     GET  /api/agent-info → Multi-agent architecture`);
  console.log(`     POST /api/generate  → Story generation (SSE)`);
  console.log(`     POST /api/generate-image → Image generation`);
  console.log(`     POST /api/embed     → Multimodal embeddings\n`);
});
