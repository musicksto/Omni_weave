import 'dotenv/config';
import { LlmAgent, SequentialAgent, FunctionTool } from '@google/adk';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'url';
import path from 'path';

export const ROOT_AGENT_MODEL = 'gemini-3-flash-preview';
export const STORY_WRITER_MODEL = 'gemini-3.1-pro-preview';
export const STORY_REVIEWER_MODEL = 'gemini-3.1-flash-lite-preview';
export const TTS_MODEL = 'gemini-2.5-pro-preview-tts';
export const LIVE_MODEL = 'gemini-live-2.5-flash-preview';

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
  mcpClient = new Client({ name: 'OmniWeaveClient', version: '1.0.0' }, { capabilities: {} });
  await mcpClient.connect(transport);
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
    'Generates a high-quality 16:9 image from a detailed text prompt using Gemini 3.1 Flash Image Preview. ' +
    'Returns a base64-encoded data URI. Use this whenever the story needs a visual illustration. ' +
    'A negative prompt is automatically appended to suppress text overlays and watermarks.',
  parameters: z.object({
    prompt: z.string().describe(
      'A detailed visual prompt describing the scene, art style, lighting, and characters. ' +
      'Must be fully self-contained — restate the art style and character descriptions every time.'
    ),
  }),
  execute: async ({ prompt }) => {
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
    'Generates multi-voice narration audio from a script using Gemini 2.5 Flash TTS. ' +
    'Input is a script with speaker labels (e.g., "Narrator: ...", "Elara: ..."). ' +
    'Returns base64 PCM audio. Use this after the story text is finalized.',
  parameters: z.object({
    script: z
      .string()
      .describe('The script text with speaker labels to be narrated. Max 2 speakers per call.'),
    speaker1: z
      .string()
      .describe('Name of the first speaker (e.g., "Narrator")'),
    voice1: z
      .string()
      .describe('Voice preset for speaker 1. Options: Zephyr, Kore, Fenrir, Puck, Charon'),
    speaker2: z
      .string()
      .optional()
      .describe('Optional name of the second speaker'),
    voice2: z
      .string()
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

/**
 * Standalone tool executor functions for the Live API.
 * These mirror the FunctionTool execute logic but are directly callable.
 */
async function execGenerateImage(args: any) {
  try {
    const ai = getAI();
    const fullPrompt = (args.prompt || '') + IMAGE_NEGATIVE_PROMPT;
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

export const liveToolExecutors: Record<string, (args: any) => Promise<any>> = {
  generate_image: execGenerateImage,
  generate_music: execGenerateMusic,
  generate_video: execGenerateVideo,
};

/** Tool declarations for the Live API config */
const imageDecl = {
  name: 'generate_image',
  description: 'Generates a cinematic 16:9 image from a detailed text prompt. Returns a base64 data URI.',
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

export const liveToolDeclarations: any[] = [
  { functionDeclarations: [imageDecl, musicDecl, videoDecl] },
];

const storyWriterAgent = new LlmAgent({
  name: 'StoryWriter',
  model: STORY_WRITER_MODEL,
  description: 'Writes rich, cinematic story scripts with character sheets and image placement markers.',
  instruction: `You are OmniWeave's Story Writer — a master cinematic storyteller.

Given a user prompt, write an immersive story or presentation of 800–1200 words.

CRITICAL RULES:
1. Start by choosing ONE specific visual art style (e.g., "3D Pixar-style animation", "cinematic 35mm photography", "Studio Ghibli watercolor").
2. Output a structured CHARACTER SHEET at the very top of your script using this exact format:

---CHARACTER SHEET---
ART STYLE: [your chosen art style]
CHARACTER: [Name]
  Age/Build: [description]
  Hair: [exact color, length, style]
  Eyes: [exact color]
  Outfit: [clothing, accessories, colors]
  Features: [scars, freckles, glasses, etc.]
[Repeat for each character]
---END CHARACTER SHEET---

3. Format all story text as a script with speaker labels: "Narrator:", "CharacterName:", etc.
   - Give each character a DISTINCT speaking style: different vocabulary, sentence length, verbal tics, or accent hints (e.g., formal vs casual, short punchy vs flowery, with catchphrases or stutters).
   - The Narrator should have a cinematic, dramatic tone. Other characters should contrast strongly with each other.
4. Place exactly 3–4 image markers using: [IMAGE: <prompt>]
5. EVERY [IMAGE:] prompt MUST:
   - Restate the art style word-for-word from the CHARACTER SHEET
   - Describe each visible character with the IDENTICAL physical details from the CHARACTER SHEET (same hair color, same eye color, same outfit, same features every time)
   - Include the scene composition, lighting, and mood
   - Be fully self-contained so an image generator with no memory can produce a consistent character
6. After every [IMAGE:...] block, the next line MUST begin with a speaker label.
7. Make the story vivid, emotional, and engaging.

EXAMPLE of consistent image prompts:
- [IMAGE: 3D Pixar-style animation, warm golden lighting. A 10-year-old girl named Elara with long curly red hair, bright green eyes, wearing a navy blue peacoat and yellow rain boots, kneeling by a pond...]
- [IMAGE: 3D Pixar-style animation, moonlit silver lighting. The same 10-year-old girl Elara with long curly red hair, bright green eyes, wearing a navy blue peacoat and yellow rain boots, running through a forest...]

Output ONLY the story script text (including the CHARACTER SHEET block). Do not call any tools — the director agent handles that.`,
  outputKey: 'story_script',
});

const storyReviewerAgent = new LlmAgent({
  name: 'StoryReviewer',
  model: STORY_REVIEWER_MODEL,
  description: 'Reviews and polishes the story script for quality, consistency, and character sheet adherence.',
  instruction: `You are OmniWeave's Story Reviewer.

Read the story script from {story_script} and perform these checks:

1. CHARACTER SHEET VALIDATION: Verify a ---CHARACTER SHEET--- block exists at the top. If missing, infer one from the text and add it.
2. SPEAKER LABELS: Every text block has a speaker label (Narrator:, CharacterName:, etc.).
3. IMAGE MARKERS: There are 3–4 [IMAGE:...] markers with fully self-contained visual prompts.
4. ART STYLE CONSISTENCY: Art style is IDENTICAL in every [IMAGE:] prompt (same wording as CHARACTER SHEET).
5. CHARACTER CONSISTENCY: Every [IMAGE:] prompt that shows a character MUST describe them with the EXACT SAME physical details from the CHARACTER SHEET — same hair color, eye color, outfit, and features. If any image prompt changes a character's appearance, FIX IT.
6. CONTINUITY: Character names, locations, and key details mentioned in narration match across all sections.
7. NARRATIVE QUALITY: The story is coherent, vivid, and emotionally engaging (800–1200 words).

OUTPUT FORMAT:
First line must be one of:
  [REVIEW: PASS] — if the script needed no changes
  [REVIEW: FIXED (N issues)] — if you corrected N issues
Then output the final polished script (including the CHARACTER SHEET block).

Output ONLY the review header line followed by the final script.`,
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
- generate_image: Create cinematic 16:9 illustrations via Gemini 3.1 Flash Image
- generate_speech: Produce multi-voice narration via Gemini 2.5 Flash TTS
- compute_embedding: Generate multimodal fingerprints for story similarity search
- generate_music: Trigger ambient background music via Lyria RealTime

When a user gives you a story prompt:
1. Delegate story drafting and review to the StoryPipeline sub-agent.
2. Treat the StoryPipeline output as the canonical story script.
3. Do not write a separate competing script yourself.
4. Use tools only when the caller explicitly needs server-side multimodal production steps.
5. Return the final reviewed script with [IMAGE:] markers unchanged when asked for story output.

You are the conductor of a multimodal orchestra — text, image, video, and voice working in harmony.`,
  tools: [generateImageTool, generateSpeechTool, computeEmbeddingTool, generateMusicTool, generateVideoTool],
  subAgents: [storyPipeline],
});
