import { useState, useRef } from 'react';
import { generateImageViaADK, generateVideoViaADK, computeEmbeddingViaADK, generateStoryViaADK } from '../adkClient';
import { createStoryStreamState, appendStoryChunk, appendInlineImageChunk, flushStoryChunk, extractCharacterSheet } from '../storyStream.js';
import type { StoryPart } from '../types';

function buildVideoStylePrefix(charSheet: { artStyle: string; characters: { name: string; traits: Record<string, string> }[] }): string {
  const parts: string[] = [];
  if (charSheet.artStyle) {
    parts.push(`Art style: ${charSheet.artStyle}.`);
  }
  for (const char of charSheet.characters) {
    const traitStr = Object.entries(char.traits)
      .filter(([k]) => k.toLowerCase() !== 'voice')
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    if (traitStr) {
      parts.push(`${char.name}: ${traitStr}.`);
    }
  }
  return parts.join(' ');
}

interface UseStoryGenerationParams {
  showToast: (message: string, type?: 'success' | 'error') => void;
  adkAvailable: boolean;
  storyMode: 'image' | 'video';
  prompt: string;
  userId?: string;
  setStoryParts: React.Dispatch<React.SetStateAction<StoryPart[]>>;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  setEmbedding: React.Dispatch<React.SetStateAction<number[] | null>>;
  setIsAutoPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentPlayIndex: React.Dispatch<React.SetStateAction<number>>;
  activeAudio: any;
  setActiveAudio: React.Dispatch<React.SetStateAction<any>>;
  startAutoPlay: () => void;
}

export function useStoryGeneration({
  showToast,
  adkAvailable,
  storyMode,
  prompt,
  userId,
  setStoryParts,
  setCurrentPage,
  setEmbedding,
  setIsAutoPlaying,
  setCurrentPlayIndex,
  activeAudio,
  setActiveAudio,
  startAutoPlay,
}: UseStoryGenerationParams) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [preloadStage, setPreloadStage] = useState<string>('');
  const [preloadProgress, setPreloadProgress] = useState(0);
  const [agentActivity, setAgentActivity] = useState<string[]>([]);
  const [error, setError] = useState('');
  const rawTextRef = useRef('');

  const addAgentActivity = (msg: string) => {
    setAgentActivity(prev => [...prev.slice(-4), msg]);
  };

  const regenerateImage = async (id: string, imagePrompt: string, sessionId?: string, characterSheet?: string): Promise<string | undefined> => {
    setStoryParts(parts => parts.map(p => p.id === id ? { ...p, isLoading: true, error: undefined } : p));

    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (adkAvailable) {
          if (attempt === 0) addAgentActivity(`generate_image -> ${imagePrompt.substring(0, 40)}...`);
          const result = await generateImageViaADK(imagePrompt, sessionId, characterSheet);
          if (result.status === 'success' && result.imageDataUri) {
            setStoryParts(parts => parts.map(p => p.id === id ? { ...p, url: result.imageDataUri!, isLoading: false } : p));
            addAgentActivity('Image generated via Cloud Run');
            return result.imageDataUri;
          }
          if (attempt < maxRetries - 1) {
            addAgentActivity(`Image retry ${attempt + 2}/${maxRetries}...`);
            await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
            continue;
          }
          console.warn('ADK server image gen failed after retries:', result.error);
        }

        throw new Error("An active ADK server connection is required for image generation.");
      } catch (err: any) {
        if (attempt < maxRetries - 1 && (err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED') || err.message?.includes('500'))) {
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        console.error("Image generation error:", err);
        setStoryParts(parts => parts.map(p => p.id === id ? { ...p, isLoading: false, error: 'Image generation failed -- click Try Again' } : p));
      }
    }

    setStoryParts(parts => parts.map(p =>
      p.id === id ? { ...p, isLoading: false, error: 'Image generation failed -- click Try Again' } : p
    ));
    return undefined;
  };

  const generateStory = async () => {
    if (!prompt.trim()) return;
    if (isGenerating) return;
    if (!adkAvailable) { showToast('Server is still connecting...', 'error'); return; }

    setIsGenerating(true);
    setError('');
    setStoryParts([]);
    setCurrentPage(0);
    setEmbedding(null);
    setIsAutoPlaying(false);
    setCurrentPlayIndex(-1);
    setAgentActivity([]);
    rawTextRef.current = '';

    setPreloadStage('');
    setPreloadProgress(0);

    if (activeAudio) { activeAudio.pause(); setActiveAudio(null); }

    try {
      const streamState = createStoryStreamState();
      const pendingImageParts: { id: string; prompt: string }[] = [];

      const syncStoryParts = (newParts: StoryPart[]) => {
        if (streamState.parts.length > 0) {
          setStoryParts([...streamState.parts] as StoryPart[]);
        }
        newParts.forEach((part) => {
          if (part.type === 'image' && part.prompt && !part.url) {
            pendingImageParts.push({ id: part.id, prompt: part.prompt });
          }
        });
      };

      const applyStoryText = (text: string) => {
        if (!text) return;
        rawTextRef.current += text;
        const { newParts } = appendStoryChunk(streamState, text);
        if (newParts.length > 0) {
          syncStoryParts(newParts as StoryPart[]);
        }
      };

      const finalizeStoryText = () => {
        const { newParts } = flushStoryChunk(streamState);
        if (newParts.length > 0 || streamState.parts.length > 0) {
          syncStoryParts(newParts as StoryPart[]);
        }
      };

      if (adkAvailable) {
        addAgentActivity('StoryPipeline -> ADK session started');
        setPreloadStage('writing');
        setPreloadProgress(0);

        const seenAuthors = new Set<string>();
        let adkError = '';
        let legacyTextAuthor: string | null = null;

        await generateStoryViaADK(prompt, (event) => {
          if (event.error) {
            adkError = event.error;
            return;
          }

          if (event.replaceText) {
            streamState.parts = [];
            streamState.buffer = '';
            streamState.nextPartIndex = 0;
            setStoryParts([]);
            setCurrentPage(0);
          }

          if (event.author && !seenAuthors.has(event.author)) {
            seenAuthors.add(event.author);
            const phaseLabel =
              event.author === 'StoryWriter'
                ? 'drafting story...'
                : event.author === 'StoryReviewer'
                  ? 'reviewing consistency...'
                  : 'processing...';
            addAgentActivity(`${event.author} -> ${phaseLabel}`);
          }

          event.toolCalls?.forEach((toolCall) => {
            addAgentActivity(`${toolCall.name} -> requested by ADK`);
          });

          event.toolResponses?.forEach((toolResponse) => {
            addAgentActivity(`${toolResponse.name} completed`);
          });

          if (event.image) {
            const { newParts } = appendInlineImageChunk(streamState, event.image);
            if (newParts.length > 0) {
              syncStoryParts(newParts as StoryPart[]);
            }
            addAgentActivity('Image generated via Cloud Run');
          }

          if (event.renderText && event.text) {
            applyStoryText(event.text);
          } else if (!('renderText' in event) && event.text) {
            const candidateAuthor = event.author || 'legacy';
            if (!legacyTextAuthor) {
              legacyTextAuthor = candidateAuthor;
            }
            if (candidateAuthor === legacyTextAuthor) {
              applyStoryText(event.text);
            }
          }
        }, userId);

        if (adkError) {
          throw new Error(adkError);
        }
      } else {
        throw new Error("Story generation requires an active ADK server connection.");
      }

      finalizeStoryText();
      
      const charSheetMatch = rawTextRef.current.match(/---CHARACTER SHEET---\s*([\s\S]*?)\s*---END CHARACTER SHEET---/i);
      const characterSheetRaw = charSheetMatch ? charSheetMatch[1].trim() : undefined;
      const imageSessionId = `story-${Date.now()}`;

      if (streamState.parts.length === 0) throw new Error("No content generated.");

      if (pendingImageParts.length === 0) {
        setPreloadStage('dna');
        addAgentActivity('All images generated inline (interleaved output)');
      } else {
        setPreloadStage('visuals');
      }
      setPreloadProgress(0);

      const embeddingPromise = (async () => {
        try {
          if (!adkAvailable) return;
          addAgentActivity('compute_embedding -> multimodal fingerprint...');
          const embedResult = await computeEmbeddingViaADK(prompt);
          if (embedResult.status === 'success' && embedResult.embedding) {
            setEmbedding(embedResult.embedding);
            addAgentActivity(`Embedding computed (${embedResult.dimensions}D)`);
          }
        } catch (embedErr) {
          console.error("Failed to generate embedding:", embedErr);
        }
      })();

      if (storyMode === 'video') {
        const charSheet = extractCharacterSheet(rawTextRef.current);
        const videoStylePrefix = charSheet ? buildVideoStylePrefix(charSheet) : '';

        const batchSize = 2;
        for (let batchStart = 0; batchStart < pendingImageParts.length; batchStart += batchSize) {
          const batch = pendingImageParts.slice(batchStart, batchStart + batchSize);
          const batchPromises = batch.map(async (img, batchIdx) => {
            const i = batchStart + batchIdx;
            try {
              const enhancedPrompt = videoStylePrefix
                ? `${videoStylePrefix} ${img.prompt}. Maintain exact character appearances. Include ambient sounds and atmosphere.`
                : `${img.prompt}. Include ambient sounds and atmospheric audio.`;
              const result = await generateVideoViaADK(enhancedPrompt);
              if (result.status === 'success' && result.videoDataUri) {
                setStoryParts(parts => parts.map(p =>
                  p.id === img.id
                    ? { type: 'video' as const, url: result.videoDataUri!, id: p.id, prompt: img.prompt }
                    : p
                ));
                addAgentActivity(`Video ${i + 1}/${pendingImageParts.length} generated`);
              } else {
                await regenerateImage(img.id, img.prompt, imageSessionId, characterSheetRaw);
              }
            } catch (videoErr) {
              console.warn(`Video ${i + 1} failed, falling back to image:`, videoErr);
              await regenerateImage(img.id, img.prompt, imageSessionId, characterSheetRaw);
            }
            setPreloadProgress(Math.round(((i + 1) / pendingImageParts.length) * 100));
          });
          await Promise.allSettled(batchPromises);
        }
      } else {
        let completed = 0;
        let failed = 0;
        const batchSize = 2;
        for (let batchStart = 0; batchStart < pendingImageParts.length; batchStart += batchSize) {
          const batch = pendingImageParts.slice(batchStart, batchStart + batchSize);
          const results = await Promise.allSettled(
            batch.map(async (img) => {
              const result = await regenerateImage(img.id, img.prompt, imageSessionId, characterSheetRaw);
              completed++;
              setPreloadProgress(Math.round((completed / pendingImageParts.length) * 100));
              return result;
            })
          );
          results.forEach(r => {
            if (r.status === 'rejected' || (r.status === 'fulfilled' && !r.value)) failed++;
          });
        }
        if (failed > 0) {
          showToast(`${failed} image${failed > 1 ? 's' : ''} failed. Tap the image to retry.`, 'error');
        }
      }

      setPreloadStage('dna');
      await embeddingPromise;

      if (adkAvailable) addAgentActivity('Story generation complete');

      setPreloadStage('complete');

      setCurrentPage(0);
      setTimeout(() => {
        startAutoPlay();
      }, 500);

    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("Requested entity was not found") || err.message?.includes("PERMISSION_DENIED") || err.message?.includes("403")) {
        setError("API Key error: The provided key does not have permission for these models. Please ensure the Generative Language API is enabled and unrestricted.");
      } else {
        setError(err.message || "An error occurred during generation.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    isGenerating,
    preloadStage,
    preloadProgress,
    agentActivity,
    error,
    generateStory,
    regenerateImage,
    addAgentActivity,
  };
}
