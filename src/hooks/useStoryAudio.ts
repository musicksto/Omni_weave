import { useState, useRef } from 'react';
import type { StoryPart } from '../types';
import { createWavFile, AudioStreamer } from '../utils/audio';
import { assignVoice } from '../utils/voiceAssignment';
import { extractMoodPrompt } from '../utils/moodExtraction';
import { getADKServerURL } from '../adkClient';

interface UseStoryAudioParams {
  storyParts: StoryPart[];
  storyPartsRef: React.MutableRefObject<StoryPart[]>;
  setStoryParts: React.Dispatch<React.SetStateAction<StoryPart[]>>;
  adkAvailable: boolean;
  addAgentActivity: (msg: string) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
  prompt: string;
  onPartPlaying?: (partId: string) => void;
}

export function useStoryAudio({
  storyParts,
  storyPartsRef,
  setStoryParts,
  adkAvailable,
  addAgentActivity,
  showToast,
  prompt,
  onPartPlaying,
}: UseStoryAudioParams) {
  const onPartPlayingRef = useRef(onPartPlaying);
  onPartPlayingRef.current = onPartPlaying;

  const [activeAudio, setActiveAudio] = useState<HTMLAudioElement | AudioStreamer | null>(null);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [currentPlayIndex, setCurrentPlayIndex] = useState<number>(-1);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [musicSession, setMusicSession] = useState<any>(null);

  const activeAudioRef = useRef<HTMLAudioElement | AudioStreamer | null>(null);
  activeAudioRef.current = activeAudio;

  const playAudio = async (partId: string, text: string, autoNextIndex?: number) => {
    const part = storyPartsRef.current.find(p => p.id === partId);
    if (part?.type === 'text' && part.isPlaying && activeAudioRef.current) {
      activeAudioRef.current.pause();
      setActiveAudio(null);
      setIsAutoPlaying(false);
      setStoryParts(parts => parts.map(p => p.id === partId ? { ...p, isPlaying: false } : p));
      return;
    }

    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      setStoryParts(parts => parts.map(p => p.type === 'text' ? { ...p, isPlaying: false } : p));
    }

    if (part?.type === 'text' && part.audioUrl) {
      const audio = new Audio(part.audioUrl);
      audio.volume = 1.0;
      setActiveAudio(audio);
      audio.onended = () => {
        setStoryParts(parts => parts.map(p => p.id === partId ? { ...p, isPlaying: false } : p));
        setActiveAudio(null);
        if (autoNextIndex !== undefined) {
          const currentParts = storyPartsRef.current;
          const nextTextPartIndex = currentParts.findIndex((p, idx) => idx > autoNextIndex && p.type === 'text');
          if (nextTextPartIndex !== -1) {
            const nextPart = currentParts[nextTextPartIndex];
            if (nextPart.type === 'text') { setCurrentPlayIndex(nextTextPartIndex); playAudio(nextPart.id, nextPart.text, nextTextPartIndex); }
          } else { setIsAutoPlaying(false); setCurrentPlayIndex(-1); }
        }
      };
      setStoryParts(parts => parts.map(p => p.id === partId ? { ...p, isPlaying: true } : p));
      onPartPlayingRef.current?.(partId);
      try {
        await audio.play();
      } catch (playErr) {
        console.warn('Cached audio playback failed:', playErr);
        showToast('Audio playback failed. Try again.', 'error');
        setStoryParts(parts => parts.map(p => p.id === partId ? { ...p, isPlaying: false } : p));
        setActiveAudio(null);
        setIsAutoPlaying(false);
      }
      return;
    }

    setStoryParts(parts => parts.map(p => p.id === partId ? { ...p, isLoadingAudio: true } : p));

    try {
      if (adkAvailable) addAgentActivity('generate_speech -> TTS streaming...');

      const currentVoiceMap: Record<string, string> = { 'Narrator': 'Zephyr' };
      const fullText = storyPartsRef.current
        .filter(p => p.type === 'text')
        .map(p => (p as any).text.replace(/---CHARACTER SHEET---[\s\S]*?---END CHARACTER SHEET---\s*/gi, ''))
        .join('\n');
      const speakerRegex = /^\s*(?:\*\*|\*)?([A-Z][a-zA-Z0-9_ ]+)(?:\*\*|\*)?:/gm;
      let speakerMatch;
      while ((speakerMatch = speakerRegex.exec(fullText)) !== null) {
        const speaker = speakerMatch[1].trim();
        if (!currentVoiceMap[speaker]) {
          currentVoiceMap[speaker] = assignVoice(speaker, currentVoiceMap, fullText);
        }
      }

      const cleanedForTTS = text
        .replace(/---CHARACTER SHEET---[\s\S]*?---END CHARACTER SHEET---\s*/gi, '')
        .replace(/^\s*\[REVIEW:\s*(?:PASS|FIXED\s*\([^)]*\))\]\s*\n?/i, '');
      const lines = cleanedForTTS.split('\n');
      const apiChunks: { text: string, speakers: string[] }[] = [];
      let currentChunkLines: string[] = [];
      let currentSpeakers = new Set<string>();
      let currentSpeaker = 'Narrator';

      for (const line of lines) {
        const lineMatch = /^\s*(?:\*\*|\*)?([A-Z][a-zA-Z0-9_ ]+)(?:\*\*|\*)?:/.exec(line);
        let cleanLine = line;
        if (lineMatch) {
          currentSpeaker = lineMatch[1].trim();
          cleanLine = line.replace(/^\s*(?:\*\*|\*)?([A-Z][a-zA-Z0-9_ ]+)(?:\*\*|\*)?:/, `${currentSpeaker}:`);
        }

        if (!currentSpeakers.has(currentSpeaker) && currentSpeakers.size >= 2) {
          apiChunks.push({ text: currentChunkLines.join('\n'), speakers: Array.from(currentSpeakers) });
          currentChunkLines = [cleanLine];
          currentSpeakers = new Set([currentSpeaker]);
        } else {
          currentChunkLines.push(cleanLine);
          currentSpeakers.add(currentSpeaker);
        }
      }
      if (currentChunkLines.length > 0) apiChunks.push({ text: currentChunkLines.join('\n'), speakers: Array.from(currentSpeakers) });

      if (apiChunks.length === 0) apiChunks.push({ text: `Narrator:\n${text}`, speakers: ['Narrator'] });
      else if (apiChunks[0].speakers.length === 0) { apiChunks[0].speakers = ['Narrator']; apiChunks[0].text = `Narrator:\n${apiChunks[0].text}`; }

      const streamer = new AudioStreamer(() => {
        setStoryParts(parts => parts.map(p => p.id === partId ? { ...p, isPlaying: false } : p));
        setActiveAudio(null);
        if (autoNextIndex !== undefined) {
          const currentParts = storyPartsRef.current;
          const nextTextPartIndex = currentParts.findIndex((p, idx) => idx > autoNextIndex && p.type === 'text');
          if (nextTextPartIndex !== -1) { const nextPart = currentParts[nextTextPartIndex]; if (nextPart.type === 'text') { setCurrentPlayIndex(nextTextPartIndex); playAudio(nextPart.id, nextPart.text, nextTextPartIndex); } }
          else { setIsAutoPlaying(false); setCurrentPlayIndex(-1); }
        }
      });
      await streamer.init();
      setActiveAudio(streamer);
      setStoryParts(parts => parts.map(p => p.id === partId ? { ...p, isLoadingAudio: false, isPlaying: true } : p));
      onPartPlayingRef.current?.(partId);

      let fullBinary = '';
      let usedBackendTTS = false;

      try {
        if (adkAvailable) {
          usedBackendTTS = true;
          const adkUrl = getADKServerURL();
          for (const chunk of apiChunks) {
            if (!streamer.isPlaying) break;
            try {
              const speakers = chunk.speakers.map(s => ({ name: s, voice: currentVoiceMap[s] || 'Zephyr' }));
              let cleanedText = chunk.text
                .replace(/\*\*(.*?)\*\*/g, '$1')
                .replace(/\*(.*?)\*/g, '$1')
                .replace(/\[IMAGE:.*?\]/g, '')
                .replace(/\[VIDEO:.*?\]/g, '')
                .replace(/---.*?---/g, '')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
              if (!cleanedText) continue;
              const ttsPrompt = cleanedText;
              const res = await fetch(`${adkUrl}/api/tts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ script: ttsPrompt, speakers }),
              });
              if (!res.ok) throw new Error(`TTS backend error: ${res.status}`);
              if (!res.body) throw new Error('No TTS response body');
              const reader = res.body.getReader();
              const decoder = new TextDecoder();
              let sseBuffer = '';
              let chunkDone = false;
              while (!chunkDone) {
                const { done: streamDone, value } = await reader.read();
                if (streamDone) break;
                sseBuffer += decoder.decode(value, { stream: true });
                const sseLines = sseBuffer.split('\n');
                sseBuffer = sseLines.pop() || '';
                for (const sseLine of sseLines) {
                  if (!sseLine.startsWith('data: ')) continue;
                  try {
                    const evt = JSON.parse(sseLine.slice(6));
                    if (evt.done) { chunkDone = true; break; }
                    if (evt.error) throw new Error(evt.error);
                    if (evt.audio && typeof evt.audio === 'string' && evt.audio.length > 0) { streamer.addChunk(evt.audio); fullBinary += atob(evt.audio); }
                  } catch (e) { if (!(e instanceof SyntaxError)) throw e; }
                }
              }
            } catch (chunkErr) {
              console.warn('TTS chunk failed, continuing to next:', chunkErr);
            }
          }
        }

        if (!usedBackendTTS) {
          throw new Error("Narration requires an active ADK server connection.");
        }

        streamer.markFinished();

        if (fullBinary && streamer.isPlaying) {
          const fullBase64 = btoa(fullBinary);
          const wavUrl = createWavFile(fullBase64, 24000);
          setStoryParts(parts => parts.map(p => p.id === partId ? { ...p, audioUrl: wavUrl, audioBase64: fullBase64 } : p));
        }
        if (adkAvailable) addAgentActivity('TTS narration complete');
      } catch (streamErr) {
        console.error("Stream error:", streamErr);
        streamer.stop();
        throw streamErr;
      }
    } catch (ttsErr) {
      console.error("TTS Error:", ttsErr);
      if (ttsErr instanceof Error) {
        showToast(ttsErr.message, 'error');
      }
      setIsAutoPlaying(false);
      setStoryParts(parts => parts.map(p => p.id === partId ? { ...p, isLoadingAudio: false, isPlaying: false } : p));
    }
  };

  const startBackgroundMusic = async () => {
    if (!musicEnabled) return;
    try {
      const storyText = storyPartsRef.current
        .filter(p => p.type === 'text')
        .map(p => (p as any).text.replace(/---CHARACTER SHEET---[\s\S]*?---END CHARACTER SHEET---\s*/gi, ''))
        .join('\n');
      const moodPrompt = extractMoodPrompt(storyText);
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 48000 });
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume().catch(() => {});
      }
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 0.08;
      gainNode.connect(audioCtx.destination);

      let musicNextStartTime = audioCtx.currentTime;

      const playMusicChunk = (base64: string) => {
        try {
          const raw = atob(base64);
          const bytes = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
          const float32 = new Float32Array(bytes.length / 2);
          const dv = new DataView(bytes.buffer);
          for (let i = 0; i < float32.length; i++) float32[i] = dv.getInt16(i * 2, true) / 32768;
          const buffer = audioCtx.createBuffer(1, float32.length, 48000);
          buffer.getChannelData(0).set(float32);
          const source = audioCtx.createBufferSource();
          source.buffer = buffer;
          source.connect(gainNode);
          const startTime = Math.max(musicNextStartTime, audioCtx.currentTime);
          source.start(startTime);
          musicNextStartTime = startTime + buffer.duration;
        } catch { /* silent */ }
      };

      if (adkAvailable) {
        const adkUrl = getADKServerURL();
        const musicAbort = new AbortController();
        const musicTimeout = setTimeout(() => musicAbort.abort(), 10000);
        let res: Response;
        try {
          res = await fetch(`${adkUrl}/api/music`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mood: moodPrompt }),
            signal: musicAbort.signal,
          });
        } catch {
          clearTimeout(musicTimeout);
          console.warn('Background music not available (timeout or network)');
          audioCtx.close().catch(() => {});
          return;
        }
        clearTimeout(musicTimeout);
        if (!res.ok || !res.body) {
          console.warn('Background music not available on this deployment');
          audioCtx.close().catch(() => {});
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';

        const readStream = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              sseBuffer += decoder.decode(value, { stream: true });
              const sseLines = sseBuffer.split('\n');
              sseBuffer = sseLines.pop() || '';
              for (const line of sseLines) {
                if (!line.startsWith('data: ')) continue;
                try {
                  const evt = JSON.parse(line.slice(6));
                  if (evt.done || evt.error) return;
                  if (evt.audio) playMusicChunk(evt.audio);
                } catch { /* skip parse errors */ }
              }
            }
          } catch { /* stream closed */ }
        };
        const loopMusic = async () => {
          await readStream();
          if (!audioCtx || audioCtx.state === 'closed') return;
          try {
            const loopRes = await fetch(`${adkUrl}/api/music`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mood: moodPrompt }),
            });
            if (!loopRes.ok || !loopRes.body) return;
            const loopReader = loopRes.body.getReader();
            let loopBuf = '';
            const readLoop = async () => {
              while (true) {
                const { done, value } = await loopReader.read();
                if (done) break;
                loopBuf += decoder.decode(value, { stream: true });
                const lines = loopBuf.split('\n');
                loopBuf = lines.pop() || '';
                for (const ln of lines) {
                  if (!ln.startsWith('data: ')) continue;
                  try {
                    const evt = JSON.parse(ln.slice(6));
                    if (evt.done || evt.error) return;
                    if (evt.audio) playMusicChunk(evt.audio);
                  } catch { /* skip */ }
                }
              }
            };
            await readLoop();
            void loopMusic();
          } catch { /* loop ended */ }
        };
        void loopMusic().catch(() => {});
        setMusicSession({ reader, abort: () => { reader.cancel(); audioCtx.close().catch(() => {}); } });
        addAgentActivity('lyria-realtime -> Background music streaming');
      } else {
        showToast('Background music requires an active ADK server connection.', 'error');
        return;
      }
    } catch (musicErr) {
      console.warn('Lyria RealTime not available:', musicErr);
    }
  };

  const stopBackgroundMusic = async () => {
    if (musicSession) {
      try {
        if (musicSession.abort) musicSession.abort();
        else if (musicSession.pause) await musicSession.pause();
      } catch { /* ignore */ }
      setMusicSession(null);
    }
  };

  const startAutoPlay = () => {
    const isNarration = (p: StoryPart) =>
      p.type === 'text' && p.text.replace(/---CHARACTER SHEET---[\s\S]*?---END CHARACTER SHEET---/gi, '')
        .replace(/\[REVIEW:\s*(?:PASS|FIXED[^\]]*)\]/gi, '').trim().length >= 20;
    const currentParts = storyPartsRef.current;
    const firstTextPartIndex = currentParts.findIndex(p => isNarration(p));
    if (firstTextPartIndex !== -1) {
      const firstPart = currentParts[firstTextPartIndex];
      if (firstPart.type === 'text') {
        setIsAutoPlaying(true);
        setCurrentPlayIndex(firstTextPartIndex);
        playAudio(firstPart.id, firstPart.text, firstTextPartIndex);
        startBackgroundMusic();
      }
    }
  };

  const stopAutoPlay = () => {
    setIsAutoPlaying(false);
    setCurrentPlayIndex(-1);
    stopBackgroundMusic();
    if (activeAudioRef.current) { activeAudioRef.current.pause(); setActiveAudio(null); setStoryParts(parts => parts.map(p => p.type === 'text' ? { ...p, isPlaying: false } : p)); }
  };

  const exportAudiobook = () => {
    const audioParts = storyParts.filter(p => p.type === 'text' && (p as any).audioBase64);
    if (audioParts.length === 0) { showToast('Play the story first to generate audio'); return; }

    const pcmChunks = audioParts.map(p => {
      const raw = atob((p as any).audioBase64);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      return bytes;
    });
    const totalLength = pcmChunks.reduce((sum, c) => sum + c.length, 0);

    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    const writeStr = (offset: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + totalLength, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
    view.setUint16(32, numChannels * (bitsPerSample / 8), true);
    view.setUint16(34, bitsPerSample, true);
    writeStr(36, 'data');
    view.setUint32(40, totalLength, true);

    const wavBytes = new Uint8Array(44 + totalLength);
    wavBytes.set(new Uint8Array(header), 0);
    let offset = 44;
    for (const chunk of pcmChunks) { wavBytes.set(chunk, offset); offset += chunk.length; }

    const blob = new Blob([wavBytes], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(prompt || 'story').substring(0, 30).replace(/[^a-z0-9]/gi, '_').toLowerCase()}_audiobook.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Audiobook exported!');
  };

  return {
    activeAudio,
    setActiveAudio,
    isAutoPlaying,
    setIsAutoPlaying,
    currentPlayIndex,
    setCurrentPlayIndex,
    musicEnabled,
    setMusicEnabled,
    playAudio,
    startAutoPlay,
    stopAutoPlay,
    exportAudiobook,
  };
}
