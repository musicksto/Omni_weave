import 'dotenv/config';
import { LlmAgent, SequentialAgent, FunctionTool } from '@google/adk';
import { GoogleGenAI, Modality } from '@google/genai';
import { z } from 'zod';

const getAI = () => {
  const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY not set');
  return new GoogleGenAI({ apiKey: key });
};

const generateImageTool = new FunctionTool({
  name: 'generate_image',
  description:
    'Generates a high-quality 16:9 image from a detailed text prompt using Gemini 3.1 Flash Image Preview. ' +
    'Returns a base64-encoded data URI. Use this whenever the story needs a visual illustration.',
  parameters: z.object({
    prompt: z.string().describe(
      'A detailed visual prompt describing the scene, art style, lighting, and characters. ' +
      'Must be fully self-contained — restate the art style and character descriptions every time.'
    ),
  }),
  execute: async ({ prompt }) => {
    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: prompt,
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

const generateSpeechTool = new FunctionTool({
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
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: script }] }],
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

const computeEmbeddingTool = new FunctionTool({
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

const generateMusicTool = new FunctionTool({
  name: 'generate_music',
  description:
    'Generates ambient background music using Lyria RealTime. ' +
    'Takes a mood/style prompt and returns a streaming music session configuration. ' +
    'Use this to add atmospheric music that complements the story narration.',
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

const storyWriterAgent = new LlmAgent({
  name: 'StoryWriter',
  model: 'gemini-2.5-flash',
  description: 'Writes rich, cinematic story scripts with image placement markers.',
  instruction: `You are OmniWeave's Story Writer — a master cinematic storyteller.

Given a user prompt, write an immersive story or presentation.

CRITICAL RULES:
1. Choose a specific visual art style (e.g., "3D Pixar style", "cinematic 35mm photography").
2. Format all text as a script with speaker labels: "Narrator:", "CharacterName:", etc.
3. Place exactly 3–4 image markers using: [IMAGE: <fully self-contained prompt restating art style and character appearances>]
4. After every [IMAGE:...] block, the next line MUST begin with a speaker label.
5. Make the story vivid, emotional, and engaging.

Output ONLY the story script text. Do not call any tools — the director agent handles that.`,
  outputKey: 'story_script',
});

const storyReviewerAgent = new LlmAgent({
  name: 'StoryReviewer',
  model: 'gemini-2.5-flash',
  description: 'Reviews and polishes the story script for quality and consistency.',
  instruction: `You are OmniWeave's Story Reviewer.

Read the story script from {story_script} and check:
1. Every text block has a speaker label (Narrator:, CharacterName:, etc.)
2. There are 3–4 [IMAGE:...] markers with fully self-contained visual prompts
3. The narrative is coherent, vivid, and emotionally engaging
4. Art style is consistent across all image prompts

If the script is good, output it unchanged. If it needs fixes, output the corrected version.
Output ONLY the final polished script.`,
  outputKey: 'final_script',
});

const storyPipeline = new SequentialAgent({
  name: 'StoryPipeline',
  description: 'Sequential pipeline: writes a story, then reviews and polishes it.',
  subAgents: [storyWriterAgent, storyReviewerAgent],
});

export const rootAgent = new LlmAgent({
  name: 'OmniWeaveDirector',
  model: 'gemini-2.5-flash',
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
1. First, acknowledge the prompt and describe what you'll create.
2. Write a rich story script yourself with [IMAGE:...] markers.
3. For each [IMAGE:...] marker, call generate_image with the full prompt.
4. Summarize the generated story and images for the user.

You are the conductor of a multimodal orchestra — text, image, and voice working in harmony.`,
  tools: [generateImageTool, generateSpeechTool, computeEmbeddingTool, generateMusicTool],
  subAgents: [storyPipeline],
});
