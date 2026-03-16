import 'dotenv/config';
import { LlmAgent, SequentialAgent, FunctionTool } from '@google/adk';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'url';
import path from 'path';
import { queryGraph } from './graphRag.js';
import { getOrCreateImageChat, generateImageInChat } from './imageChat.js';

export const ROOT_AGENT_MODEL = 'gemini-3-flash-preview';
export const STORY_WRITER_MODEL = 'gemini-2.5-flash';
export const STORY_REVIEWER_MODEL = 'gemini-2.5-flash-lite';
export const TTS_MODEL = 'gemini-2.5-pro-preview-tts';
export const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

const useVertexAI =
  (process.env.GOOGLE_GENAI_USE_VERTEXAI || '').toUpperCase() === 'TRUE';

const normalizedApiKey =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_GENAI_API_KEY ||
  process.env.GOOGLE_API_KEY;

if (normalizedApiKey) {
  process.env.GEMINI_API_KEY ??= normalizedApiKey;
  process.env.GOOGLE_GENAI_API_KEY ??= normalizedApiKey;
}

export const getAI = () => {
  if (useVertexAI) {
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    const location = process.env.GOOGLE_CLOUD_LOCATION || 'global';
    if (!project) {
      throw new Error(
        'GOOGLE_CLOUD_PROJECT must be set when using Vertex AI mode'
      );
    }
    return new GoogleGenAI({ vertexai: true, project, location });
  }

  const key =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error(
      'GEMINI_API_KEY, GOOGLE_GENAI_API_KEY, or GOOGLE_API_KEY not set'
    );
  }
  return new GoogleGenAI({ apiKey: key });
};

const IMAGE_NEGATIVE_PROMPT =
  ' Do not include any text, watermarks, logos, UI elements, or written words in the image.';

let mcpClient: Client | null = null;
async function getMcpClient() {
  if (mcpClient) return mcpClient;
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const serverPath = path.join(__dirname, 'mediaMcpServer.ts');
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', serverPath]
  });
  const client = new Client({ name: 'OmniWeaveClient', version: '1.0.0' }, { capabilities: {} });
  try {
    await client.connect(transport);
    mcpClient = client;
  } catch (err) {
    // Don't cache failed client — allow retry on next call
    console.error('[MCP] Failed to connect:', err);
    throw err;
  }
  return mcpClient;
}

export const generateVideoTool = new FunctionTool({
  name: 'generate_video',
  description:
    'Generates a short animated video from a detailed text prompt using Veo 3.1 via MCP. ' +
    'Returns a Google Cloud Storage URI. Use this when the story needs an immersive animated sequence instead of a static image.',
  parameters: z.object({
    prompt: z.string().describe('A detailed prompt describing the video scene, lighting, camera movement, and characters.')
  }),
  execute: async ({ prompt }) => {
    try {
      const client = await getMcpClient();
      const result = await client.callTool({
        name: 'generate_video',
        arguments: { prompt }
      });
      if (result.isError) {
        return { status: 'error', error: (((result as any).content as any[])?.[0])?.text };
      }
      return JSON.parse((((result as any).content as any[])?.[0])?.text || '{}');
    } catch (err: any) {
      return { status: 'error', error: err.message || 'Video generation failed' };
    }
  }
});

export const generateImageTool = new FunctionTool({
  name: 'generate_image',
  description:
    'Generates a premium cinematic image from a detailed text prompt using Gemini 3.1 Flash Image Preview. ' +
    'Returns a base64 data URI. Use this whenever the story needs a visual illustration. ' +
    'Prompts must be self-contained, describing lighting, composition, and character details.',
  parameters: z.object({
    prompt: z.string().describe(
      'A detailed visual prompt describing the scene, art style, lighting, and characters. ' +
      'Must be fully self-contained — restate the art style and character descriptions every time.'
    ),
    aspectRatio: z
      .enum(['16:9', '9:16', '1:1', '4:3', '3:4'])
      .default('16:9')
      .describe('The orientation of the generated image. 16:9 is default for cinematic stories.'),
    seed: z
      .number()
      .optional()
      .describe('Seed for reproducible image generation. Use this to maintain character consistency across calls.'),
  }),
  execute: async ({ prompt, aspectRatio, seed }) => {
    try {
      const ai = getAI();
      const fullPrompt = prompt + IMAGE_NEGATIVE_PROMPT;
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: fullPrompt,
        config: {
          imageConfig: { aspectRatio: '16:9', imageSize: '1K' },
        },
      });

      const part = response.candidates?.[0]?.content?.parts?.find(
        (p: any) => p.inlineData
      );
      if (part?.inlineData) {
        return {
          status: 'success',
          imageDataUri: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
          mimeType: part.inlineData.mimeType,
        };
      }
      return { status: 'error', error: 'No image data returned from model' };
    } catch (err: any) {
      return { status: 'error', error: err.message || 'Image generation failed' };
    }
  },
});

export const generateSpeechTool = new FunctionTool({
  name: 'generate_speech',
  description:
    'Generates high-fidelity multi-voice narration audio from a script using Gemini 2.5 Flash TTS (Chirp 3 HD). ' +
    'Input is a script with speaker labels. Returns base64 PCM audio.',
  parameters: z.object({
    script: z
      .string()
      .describe('The script text with speaker labels to be narrated. Max 2 speakers per call.'),
    speaker1: z
      .string()
      .describe('Name of the first speaker (e.g., "Narrator")'),
    voice1: z
      .enum(['Zephyr', 'Kore', 'Fenrir', 'Puck', 'Charon', 'Aoide', 'Medea', 'Hecate'])
      .describe('Voice preset for speaker 1. Choose based on character gender and persona.'),
    speaker2: z
      .string()
      .optional()
      .describe('Optional name of the second speaker'),
    voice2: z
      .enum(['Zephyr', 'Kore', 'Fenrir', 'Puck', 'Charon', 'Aoide', 'Medea', 'Hecate'])
      .optional()
      .describe('Optional voice preset for speaker 2'),
  }),
  execute: async ({ script, speaker1, voice1, speaker2, voice2 }) => {
    try {
      const ai = getAI();

      const speakerVoiceConfigs: any[] = [
        { speaker: speaker1, voiceConfig: { prebuiltVoiceConfig: { voiceName: voice1 } } },
      ];
      if (speaker2 && voice2) {
        speakerVoiceConfigs.push({
          speaker: speaker2,
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voice2 } },
        });
      }

      const speechConfig: any =
        speakerVoiceConfigs.length === 1
          ? { voiceConfig: speakerVoiceConfigs[0].voiceConfig }
          : { multiSpeakerVoiceConfig: { speakerVoiceConfigs: speakerVoiceConfigs.slice(0, 2) } };

      const response = await ai.models.generateContent({
        model: TTS_MODEL,
        contents: [{ role: 'user', parts: [{ text: script }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig,
        },
      });

      const audioPart = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (audioPart?.data) {
        return { status: 'success', audioBase64: audioPart.data, mimeType: audioPart.mimeType };
      }
      return { status: 'error', error: 'No audio data returned' };
    } catch (err: any) {
      return { status: 'error', error: err.message || 'TTS generation failed' };
    }
  },
});

export const computeEmbeddingTool = new FunctionTool({
  name: 'compute_embedding',
  description:
    'Computes a multimodal embedding vector for a story using Gemini Embedding 2 Preview. ' +
    'The embedding can be used for similarity search across the user\'s story library.',
  parameters: z.object({
    text: z.string().describe('The story title or prompt text to embed'),
    imageBase64: z
      .string()
      .optional()
      .describe('Optional base64 image data (without data URI prefix) to include in the embedding'),
    imageMimeType: z
      .string()
      .optional()
      .describe('MIME type of the image (e.g., image/png)'),
  }),
  execute: async ({ text, imageBase64, imageMimeType }) => {
    try {
      const ai = getAI();
      const contents: any[] = [text];

      if (imageBase64 && imageMimeType) {
        contents.push({ inlineData: { data: imageBase64, mimeType: imageMimeType } });
      }

      const result = await ai.models.embedContent({
        model: 'gemini-embedding-2-preview',
        contents,
      });

      const values =
        result.embeddings?.[0]?.values || (result as any).embedding?.values;
      if (values) {
        return { status: 'success', dimensions: values.length, embedding: values.slice(0, 10) };
      }
      return { status: 'error', error: 'No embedding returned' };
    } catch (err: any) {
      return { status: 'error', error: err.message || 'Embedding failed' };
    }
  },
});

export const generateMusicTool = new FunctionTool({
  name: 'generate_music',
  description:
    'Returns a Lyria RealTime streaming configuration for ambient background music. ' +
    'NOTE: This tool does NOT generate audio directly — it returns a mood prompt and model reference. ' +
    'Actual audio streaming happens client-side via the /api/music SSE endpoint or browser WebSocket. ' +
    'Use this to signal that atmospheric music should complement the story narration.',
  parameters: z.object({
    mood: z.string().describe(
      'A music mood/style prompt (e.g., "gentle orchestral with soft strings", "epic cinematic battle drums", "enchanted forest ambient harp")'
    ),
  }),
  execute: async ({ mood }) => {
    try {
      return {
        status: 'success',
        model: 'lyria-realtime-exp',
        prompt: mood,
        note: 'Background music is streamed client-side via Lyria RealTime WebSocket for low-latency playback.',
      };
    } catch (err: any) {
      return { status: 'error', error: err.message || 'Music generation failed' };
    }
  },
});


export const memoryBankTool = new FunctionTool({
  name: 'queryMemoryBank',
  description:
    'Look up character and location continuity from previous stories. ' +
    'Use this at story start to retrieve known characters, traits, and locations.',
  parameters: z.object({
    query: z.string().describe('The story prompt or character name to look up'),
    uid: z.string().describe('The unique user ID to search for'),
  }),
  execute: async ({ query, uid }) => {
    try {
      const ai = getAI();
      const context = await queryGraph(uid, query, ai);
      if (!context) return { status: 'empty', context: '' };
      return { status: 'success', context };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Memory bank query failed';
      return { status: 'error', error: msg, context: '' };
    }
  },
});
/**
 * Standalone tool executor functions for the Live API.
 * These mirror the FunctionTool execute logic but are directly callable.
 */
async function execGenerateImage(args: any) {
  try {
    const ai = getAI();

    // Use multi-turn chat if sessionId is provided for character consistency
    if (args.sessionId) {
      try {
        const chat = await getOrCreateImageChat(ai, args.sessionId, args.characterSheet);
        const result = await generateImageInChat(chat, args.prompt);
        if (result) return result;
        console.warn(`[ImageChat] Tool generation failed for ${args.sessionId}, falling back to single-shot`);
      } catch (err: any) {
        console.warn(`[ImageChat] Tool session error: ${err.message}, falling back to single-shot`);
      }
    }

    // Prepend character sheet for visual consistency if available
    const charContext = args.characterSheet
      ? `VISUAL REFERENCE — use these EXACT descriptions:\n${args.characterSheet}\n\nGenerate:\n`
      : '';
    const fullPrompt = charContext + (args.prompt || '') + IMAGE_NEGATIVE_PROMPT;
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: fullPrompt,
      config: { imageConfig: { aspectRatio: '16:9', imageSize: '1K' } },
    });
    const part = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (part?.inlineData) {
      return { status: 'success', imageDataUri: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` };
    }
    return { status: 'error', error: 'No image data returned' };
  } catch (err: any) {
    return { status: 'error', error: err.message || 'Image generation failed' };
  }
}

async function execGenerateMusic(args: any) {
  return { status: 'success', model: 'lyria-realtime-exp', prompt: args.mood || '' };
}

async function execGenerateVideo(args: any) {
  try {
    const client = await getMcpClient();
    const result = await client.callTool({
      name: 'generate_video',
      arguments: { prompt: args.prompt }
    });
    if (result.isError) {
      return { status: 'error', error: (((result as any).content as any[])?.[0])?.text };
    }
    return JSON.parse((((result as any).content as any[])?.[0])?.text || '{}');
  } catch (err: any) {
    return { status: 'error', error: err.message || 'Video generation failed' };
  }
}

async function execQueryMemoryBank(args: any) {
  try {
    const ai = getAI();
    // uid comes from injected sessionId context or defaults to 'default-user'
    const uid = args.uid || args.sessionId || 'default-user';
    const context = await queryGraph(uid, args.query || '', ai);
    return { status: 'success', context: context || 'No previous story context found.' };
  } catch (err: any) {
    return { status: 'error', error: err.message };
  }
}

async function execComputeEmbedding(args: any) {
  try {
    const ai = getAI();
    const contents: any[] = [args.text];
    if (args.imageBase64 && args.imageMimeType) {
      contents.push({ inlineData: { data: args.imageBase64, mimeType: args.imageMimeType } });
    }
    const result = await ai.models.embedContent({
      model: 'gemini-embedding-2-preview',
      contents,
    });
    const values = result.embeddings?.[0]?.values || (result as any).embedding?.values;
    return { status: 'success', dimensions: values?.length, embedding: values?.slice(0, 10) };
  } catch (err: any) {
    return { status: 'error', error: err.message };
  }
}

export const liveToolExecutors: Record<string, (args: any) => Promise<any>> = {
  generate_image: execGenerateImage,
  generate_music: execGenerateMusic,
  generate_video: execGenerateVideo,
  queryMemoryBank: execQueryMemoryBank,
  compute_embedding: execComputeEmbedding,
};

/** Tool declarations for the Live API config */
const imageDecl = {
  name: 'generate_image',
  description: 'Generates a cinematic 16:9 image from a detailed text prompt. Include art style, character appearance, lighting, composition, camera angle. Example: "Makoto Shinkai hyperdetailed anime, rainy Tokyo alley, neon reflections, a fox spirit with silver hair stands behind a ramen cart." Returns a base64 data URI.',
  behavior: 'NON_BLOCKING' as any,
  parameters: {
    type: Type.OBJECT,
    properties: { prompt: { type: Type.STRING, description: 'Detailed visual scene prompt' } } as Record<string, any>,
    required: ['prompt'],
  },
};

const musicDecl = {
  name: 'generate_music',
  description: 'Starts ambient background music with a mood/style prompt via Lyria RealTime.',
  parameters: {
    type: Type.OBJECT,
    properties: { mood: { type: Type.STRING, description: 'Music mood/style prompt' } } as Record<string, any>,
    required: ['mood'],
  },
};

const videoDecl = {
  name: 'generate_video',
  description: 'Generates a short animated video from a detailed text prompt using Veo 3.1 via MCP.',
  parameters: {
    type: Type.OBJECT,
    properties: { prompt: { type: Type.STRING, description: 'Detailed prompt for video scene, lighting, camera motion.' } } as Record<string, any>,
    required: ['prompt'],
  },
};

const memoryDecl = {
  name: 'queryMemoryBank',
  description: 'Look up character and location continuity from previous stories. Use this to establish consistent world-building.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'Story prompt or character/place name to look up' },
    } as Record<string, any>,
    required: ['query'],
  },
};

const embeddingDecl = {
  name: 'compute_embedding',
  description: 'Computes a multimodal embedding vector for the story DNA. Use this after a story turn is complete.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      text: { type: Type.STRING, description: 'Story summary text' },
      imageBase64: { type: Type.STRING, description: 'Base64 image data' },
      imageMimeType: { type: Type.STRING, description: 'MIME type' }
    } as Record<string, any>,
    required: ['text'],
  },
};

export const liveToolDeclarations: any[] = [
  { functionDeclarations: [imageDecl, musicDecl, videoDecl, memoryDecl, embeddingDecl] },
];

const storyWriterAgent = new LlmAgent({
  name: 'StoryWriter',
  model: STORY_WRITER_MODEL,
  description: 'Writes rich, cinematic story scripts with character sheets and image placement markers.',
  instruction: `You are OmniWeave's Story Writer — a cinematic storyteller who produces screenplay-format stories with integrated image prompts.

## INPUT
A user prompt describing a story concept. May include "MEMORY BANK:" context with returning characters — if present, reuse their EXACT physical descriptions.

## OUTPUT FORMAT

### 1. CHARACTER SHEET (top of output)
\`\`\`
---CHARACTER SHEET---
ART STYLE: [one specific style, e.g. "Makoto Shinkai hyperdetailed anime" or "cinematic 35mm noir photography"]
SETTING: [location, architecture, color palette, time of day, weather, atmosphere]
CHARACTER: [Name] ([age], [gender])
  Age/Build: [specific]
  Hair: [color, length, style]
  Eyes: [color]
  Outfit: [detailed clothing with colors]
  Features: [unique marks — scars, tattoos, glasses, etc.]
  Voice: [speaking style — formal, gruff, cheerful, etc.]
[Repeat for 2-3 characters max]
---END CHARACTER SHEET---
\`\`\`

### 2. STORY (5 scenes, ~1000 words total)

Each scene follows this EXACT pattern:
\`\`\`
[IMAGE: {art style from sheet}. {setting details from sheet}. {camera angle}. {character descriptions copied verbatim from sheet}. {scene-specific action and mood}.]

Narrator: [cinematic description — sensory, atmospheric, italic-worthy prose]

CharacterA: [dialogue in their unique voice]

CharacterB: [dialogue in contrasting voice]
\`\`\`

## CRITICAL RULES
- **5 scenes, 5 [IMAGE:] markers** — one image per scene, no exceptions
- **Speaker labels on EVERY line**: "Narrator:", "CharacterName:" — no unlabeled text
- **Characters have CONTRASTING voices**: one formal, one casual; one verbose, one terse; different verbal tics
- **Image prompts are SELF-CONTAINED**: every [IMAGE:] MUST copy-paste the EXACT hair color/style, eye color, outfit colors, and distinguishing features from the CHARACTER SHEET word-for-word. An image generator with zero memory must produce visually identical characters across all 5 scenes. Never paraphrase — use the same adjectives every time
- **Setting continuity**: same world, same color palette, same weather across all 5 images. New locations described relative to the established setting
- **Emotional arc**: setup → tension → climax → resolution → coda

## EXAMPLE IMAGE PROMPT
[IMAGE: Makoto Shinkai hyperdetailed anime, rainy night Tokyo. Narrow neon-lit alley in Shinjuku, wet cobblestones reflecting cyan and pink signs, paper lanterns glowing amber, steam rising from grates. Wide shot. Gin, an ageless fox spirit with silver-white shoulder-length hair in a loose ponytail, piercing amber eyes, wearing an indigo samue with black apron, subtle red markings at eye corners, stands behind a wooden ramen cart. Kenji, late-20s salaryman with messy rain-plastered black hair, dark brown eyes with heavy bags, wrinkled tan trench coat over grey suit, loosened red tie, slumps onto a stool looking exhausted.]

Output ONLY the CHARACTER SHEET + story script. No tool calls, no commentary.`,
  outputKey: 'story_script',
});

const storyReviewerAgent = new LlmAgent({
  name: 'StoryReviewer',
  model: STORY_REVIEWER_MODEL,
  description: 'Reviews and polishes the story script for quality, consistency, and character sheet adherence.',
  instruction: `You are OmniWeave's Story Reviewer. Read {story_script} and fix any issues.

CHECKLIST (fix silently, don't explain):
1. ---CHARACTER SHEET--- exists with ART STYLE, SETTING, CHARACTER entries? If missing, add it.
2. Every text line has a speaker label (Narrator:, Name:)? Fix unlabeled lines.
3. Exactly 5 [IMAGE:] markers, one per scene? Add missing ones using CHARACTER SHEET details.
4. Every [IMAGE:] restates the EXACT art style + setting + character descriptions from the sheet? Fix mismatches.
5. Character appearances are IDENTICAL across all [IMAGE:] prompts? Fix any drift.
6. Characters have distinct, contrasting speaking styles? Adjust if they sound the same.

OUTPUT:
Line 1: [REVIEW: PASS] or [REVIEW: FIXED (N issues)]
Then the complete final script with CHARACTER SHEET + all scenes.

Output ONLY the review line + final script. No commentary.`,
  outputKey: 'final_script',
});

export const storyPipeline = new SequentialAgent({
  name: 'StoryPipeline',
  description: 'Sequential pipeline: writes a story, then reviews and polishes it.',
  subAgents: [storyWriterAgent, storyReviewerAgent],
});

export const rootAgent = new LlmAgent({
  name: 'OmniWeaveDirector',
  model: ROOT_AGENT_MODEL,
  description:
    'The OmniWeave Creative Director. Orchestrates story writing, image generation, ' +
    'multi-voice narration, and embedding computation for a complete multimodal experience.',
  instruction: `You are the OmniWeave Creative Director — an AI agent that orchestrates the creation of rich, multimodal stories.

Your capabilities:
- queryMemoryBank: Retrieve character and location continuity from the user's previous stories
- generate_image: Create cinematic 16:9 illustrations via Gemini 3.1 Flash Image
- generate_speech: Produce multi-voice narration via Gemini 2.5 Flash TTS
- compute_embedding: Generate multimodal fingerprints for story similarity search
- generate_music: Trigger ambient background music via Lyria RealTime

When a user gives you a story prompt:
1. MANDATORY: ALWAYS start by calling queryMemoryBank with the user's prompt to find existing characters, locations, or world-building details from their previous stories.
2. When delegating to the StoryPipeline, prepend the memory context to the user prompt like this:
   "MEMORY BANK: [paste memory context here]\n\nUSER PROMPT: [original prompt]"
   This ensures the StoryWriter receives character continuity data directly.
3. If queryMemoryBank returns empty, skip the prefix and pass the user prompt directly.
4. Treat the StoryPipeline output as the canonical story script.
5. Use other tools (image, speech, music) only when the caller explicitly needs server-side production steps.
6. Return the final reviewed script with [IMAGE:] markers unchanged.

You are the conductor of a multimodal orchestra — text, image, video, and voice working in harmony.`,
  tools: [generateImageTool, generateSpeechTool, computeEmbeddingTool, generateMusicTool, generateVideoTool, memoryBankTool],
  subAgents: [storyPipeline],
});
