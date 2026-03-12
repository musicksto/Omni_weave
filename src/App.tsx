import { useState, useEffect } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { PlayIcon as Play, StopIcon as Square, SpinnerIcon as Loader2, QuillIcon as Sparkles, ArrowRightIcon as ArrowRight, CheckIcon as CheckCircle2, AlertIcon as AlertCircle, BookIcon as BookOpen, DownloadIcon as Download, BookmarkIcon as Save, LibraryIcon as Library, MusicIcon } from './components/Icons';
import { auth, db } from './firebase';
import { signInAnonymously, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { collection, addDoc, getDocs, query, where, orderBy, serverTimestamp, doc, setDoc, getDocFromServer, getDoc } from 'firebase/firestore';
import { checkADKServer, generateImageViaADK, computeEmbeddingViaADK, isADKEnabled, getADKServerURL } from './adkClient';


type StoryPart = 
  | { type: 'text', text: string, id: string, audioUrl?: string, audioBase64?: string, isPlaying?: boolean, isLoadingAudio?: boolean }
  | { type: 'image', url: string, id: string, isLoading?: boolean, prompt?: string, error?: string };

async function hashText(text: string) {
  const msgBuffer = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function createWavFile(pcmBase64: string, sampleRate: number = 24000): string {
  const binary = atob(pcmBase64);
  const pcmLength = binary.length;
  const wavBuffer = new ArrayBuffer(44 + pcmLength);
  const view = new DataView(wavBuffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcmLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, pcmLength, true);

  const pcmBytes = new Uint8Array(wavBuffer, 44);
  for (let i = 0; i < pcmLength; i++) {
    pcmBytes[i] = binary.charCodeAt(i);
  }

  let wavBinary = '';
  const wavBytes = new Uint8Array(wavBuffer);
  for (let i = 0; i < wavBytes.byteLength; i++) {
    wavBinary += String.fromCharCode(wavBytes[i]);
  }
  return `data:audio/wav;base64,${btoa(wavBinary)}`;
}

class AudioStreamer {
  audioContext: AudioContext | null = null;
  nextStartTime: number = 0;
  isPlaying: boolean = false;
  isStreamFinished: boolean = false;
  onEndedCallback: (() => void) | null = null;
  checkInterval: any = null;
  
  constructor(onEnded: () => void) {
    this.onEndedCallback = onEnded;
  }

  init() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    this.nextStartTime = this.audioContext.currentTime;
    this.isPlaying = true;
    
    this.checkInterval = setInterval(() => {
      if (this.audioContext && this.isPlaying && this.isStreamFinished) {
        if (this.audioContext.currentTime >= this.nextStartTime && this.nextStartTime > 0) {
          this.stop();
          if (this.onEndedCallback) this.onEndedCallback();
        }
      }
    }, 100);
  }

  addChunk(base64PCM: string) {
    if (!this.audioContext || !this.isPlaying) return;
    
    const binary = atob(base64PCM);
    const length = binary.length / 2;
    const audioBuffer = this.audioContext.createBuffer(1, length, 24000);
    const channelData = audioBuffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const low = binary.charCodeAt(i * 2);
      const high = binary.charCodeAt(i * 2 + 1);
      let sample = (high << 8) | low;
      if (sample >= 0x8000) sample -= 0x10000;
      channelData[i] = sample / 0x8000;
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    const startTime = Math.max(this.nextStartTime, this.audioContext.currentTime);
    source.start(startTime);
    this.nextStartTime = startTime + audioBuffer.duration;
  }
  
  markFinished() {
    this.isStreamFinished = true;
  }

  pause() {
    this.stop();
  }

  stop() {
    this.isPlaying = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function cosineSimilarity(a: number[], b: number[]) {
  if (!a || !b || a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Voice assignment
const FEMALE_NAMES = new Set([
  'elara', 'luna', 'mira', 'aria', 'elena', 'aurora', 'selene', 'freya', 'nyx',
  'cassandra', 'isolde', 'lyra', 'ophelia', 'persephone', 'andromeda', 'calypso',
  'artemis', 'athena', 'gaia', 'hera', 'iris', 'juno', 'minerva', 'venus',
  'alice', 'bella', 'clara', 'diana', 'emma', 'fiona', 'grace', 'hannah',
  'ivy', 'julia', 'kate', 'lily', 'maya', 'nora', 'olivia', 'rose',
  'sarah', 'tessa', 'uma', 'vera', 'willow', 'xena', 'yara', 'zara',
  'anya', 'suki', 'mei', 'yuki', 'sakura', 'amara', 'kira', 'lena',
]);

const MALE_NAMES = new Set([
  'kai', 'marcus', 'orion', 'felix', 'atlas', 'cyrus', 'dorian', 'ezra',
  'griffin', 'hector', 'ivan', 'jasper', 'kael', 'leon', 'miles', 'nero',
  'oscar', 'phoenix', 'quinn', 'raven', 'silas', 'thane', 'ulric', 'victor',
  'wyatt', 'xander', 'york', 'zane', 'arthur', 'balthazar', 'cedric',
  'dante', 'edgar', 'faust', 'gideon', 'harold', 'isaiah', 'james',
  'karl', 'liam', 'magnus', 'noah', 'oliver', 'peter', 'rex',
  'stefan', 'thomas', 'uriel', 'vance', 'william', 'xavier',
]);

const FEMALE_SUFFIXES = ['ella', 'ina', 'ette', 'lyn', 'anne', 'ene', 'issa', 'ita', 'ia'];
const MALE_SUFFIXES = ['us', 'or', 'ix', 'ius', 'os', 'ard', 'ric', 'mund'];

function guessGender(name: string): 'female' | 'male' | 'unknown' {
  const lower = name.toLowerCase().trim();
  if (lower === 'narrator') return 'unknown';
  if (FEMALE_NAMES.has(lower)) return 'female';
  if (MALE_NAMES.has(lower)) return 'male';
  for (const suffix of FEMALE_SUFFIXES) { if (lower.endsWith(suffix)) return 'female'; }
  for (const suffix of MALE_SUFFIXES) { if (lower.endsWith(suffix)) return 'male'; }
  if (lower.endsWith('a')) return 'female';
  return 'unknown';
}

function assignVoice(name: string, existing: Record<string, string>): string {
  if (name === 'Narrator') return 'Zephyr';
  const gender = guessGender(name);
  const used = new Set(Object.values(existing));
  const FEMALE_VOICES = ['Kore', 'Aoede'];
  const MALE_VOICES = ['Fenrir', 'Charon'];
  if (gender === 'female') return FEMALE_VOICES.find(v => !used.has(v)) || FEMALE_VOICES[0];
  if (gender === 'male') return MALE_VOICES.find(v => !used.has(v)) || MALE_VOICES[0];
  return 'Puck';
}

// Mood extraction for background music
function extractMoodPrompt(storyText: string): string {
  const lower = storyText.toLowerCase();
  const moods = [
    { kw: ['battle', 'war', 'fight', 'sword', 'army'], prompt: 'epic orchestral fantasy battle music, dramatic brass and percussion' },
    { kw: ['dark', 'shadow', 'evil', 'death', 'fear'], prompt: 'dark atmospheric ambient music, mysterious and foreboding, low strings' },
    { kw: ['love', 'heart', 'kiss', 'romance', 'tender'], prompt: 'romantic gentle piano and strings, warm emotional melody' },
    { kw: ['space', 'star', 'galaxy', 'planet', 'cosmos'], prompt: 'ethereal space ambient music, synthesizer pads, cosmic atmosphere' },
    { kw: ['ocean', 'sea', 'water', 'wave', 'underwater'], prompt: 'calm oceanic ambient music, flowing water sounds, gentle piano' },
    { kw: ['forest', 'tree', 'nature', 'garden', 'wild'], prompt: 'enchanted forest ambient music, gentle flute and harp, nature sounds' },
    { kw: ['city', 'neon', 'cyberpunk', 'tech', 'robot'], prompt: 'synthwave cyberpunk ambient music, electronic pads and bass' },
    { kw: ['magic', 'spell', 'wizard', 'enchant', 'mystic'], prompt: 'mystical fantasy ambient music, ethereal vocals and chimes' },
  ];
  for (const m of moods) { if (m.kw.some(k => lower.includes(k))) return m.prompt; }
  return 'gentle cinematic ambient background music, soft strings and piano';
}

function getApiKey(): string | undefined {
  return (import.meta as any).env?.VITE_GEMINI_API_KEY
    || (import.meta as any).env?.GEMINI_API_KEY
    || process.env.GEMINI_API_KEY;
}

const PROMPT_SUGGESTIONS = [
  { label: 'Cyberpunk Noir', prompt: 'A cyberpunk detective exploring a neon-lit underwater city, searching for a stolen AI consciousness', icon: '🌊' },
  { label: 'Fantasy Quest', prompt: 'A young alchemist discovers a living map that leads to the last dragon egg hidden in a floating mountain kingdom', icon: '🐉' },
  { label: 'Space Opera', prompt: 'Two rival starship captains must work together when they discover an ancient alien signal coming from inside a dying star', icon: '🚀' },
  { label: 'Folklore Retold', prompt: 'A modern retelling of a Japanese folktale where a spirit fox runs a late-night ramen shop in rainy Tokyo', icon: '🦊' },
];

const FEATURE_CARDS = [
  { title: 'Cinematic Text', desc: 'Streams scripts with speaker labels, image markers, and real-time interleaving', model: 'gemini-3.1-pro', color: '#8b2e16' },
  { title: 'AI Illustrations', desc: '1K resolution, 16:9 images with Ken Burns cinematic pan/zoom animation', model: 'gemini-3.1-flash-image', color: '#d97706' },
  { title: 'Character Voices', desc: 'Gender-aware casting — female, male, and narrator voices assigned by name', model: 'gemini-2.5-flash-tts', color: '#059669' },
  { title: 'Ambient Score', desc: 'Mood-aware background music that shifts with the story atmosphere', model: 'lyria-realtime-exp', color: '#ec4899' },
  { title: 'Story DNA', desc: 'Multimodal embeddings match stories by semantic similarity, not keywords', model: 'gemini-embedding-2', color: '#7c3aed' },
];

export default function App() {
  const [hasKey, setHasKey] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [storyParts, setStoryParts] = useState<StoryPart[]>([]);
  const [embedding, setEmbedding] = useState<number[] | null>(null);
  const [similarStories, setSimilarStories] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [activeAudio, setActiveAudio] = useState<any | null>(null);

  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [currentPlayIndex, setCurrentPlayIndex] = useState<number>(-1);
  const [review, setReview] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [musicSession, setMusicSession] = useState<any>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Firebase & Library State
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingStory, setIsLoadingStory] = useState(false);
  const [savedStories, setSavedStories] = useState<any[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);

  const [adkAvailable, setAdkAvailable] = useState(false);
  const [adkInfo, setAdkInfo] = useState<any>(null);
  const [agentActivity, setAgentActivity] = useState<string[]>([]);

  const addAgentActivity = (msg: string) => {
    setAgentActivity(prev => [...prev.slice(-4), msg]);
  };

  useEffect(() => {
    (async () => {
      const result = await checkADKServer();
      setAdkAvailable(result.available);
      if (result.agentInfo) setAdkInfo(result.agentInfo);
      if (result.available) {
        console.log('🧵 ADK Agent Server connected:', getADKServerURL());
        console.log('   Agent:', result.agentInfo?.rootAgent?.name);
      }
    })();
  }, []);

  useEffect(() => {
    const fetchSimilar = async () => {
      if (!embedding) {
        setSimilarStories([]);
        return;
      }
      try {
        const q = query(collection(db, 'stories'));
        const querySnapshot = await getDocs(q);
        const stories = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        
        const similarities = stories
          .filter(s => s.embedding && s.title !== prompt)
          .map(s => ({
            ...s,
            similarity: cosineSimilarity(embedding, s.embedding)
          }))
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 3);
          
        setSimilarStories(similarities);
      } catch (error) {
        console.error("Error fetching similar stories", error);
      }
    };
    fetchSimilar();
  }, [embedding, prompt]);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        try { await signInAnonymously(auth); } catch (e) { console.error('Anonymous auth failed:', e); }
        return;
      }
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const loadLibrary = async () => {
    if (!user) return;
    try {
      const q = query(collection(db, 'stories'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const stories = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSavedStories(stories);
      setShowLibrary(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'stories');
    }
  };

  const saveToLibrary = async () => {
    if (!user || storyParts.length === 0) { if (!user) showToast('Connecting... try again in a moment'); return; }
    setIsSaving(true);
    try {
      const partsToSave = storyParts.map(part => {
        if (part.type === 'image') return { ...part, url: '', isLoading: false };
        if (part.type === 'text') return { ...part, audioUrl: undefined, audioBase64: undefined, isPlaying: false, isLoadingAudio: false };
        return part;
      });

      const storyData: any = {
        authorId: user.uid,
        title: prompt || 'Untitled Story',
        parts: JSON.stringify(partsToSave),
        createdAt: serverTimestamp()
      };
      if (review.trim()) storyData.review = review.trim();
      if (embedding) storyData.embedding = embedding;

      const storyRef = await addDoc(collection(db, 'stories'), storyData);

      const imageParts = storyParts.filter(p => p.type === 'image' && p.url);
      for (const part of imageParts) {
        if (part.type === 'image' && part.url) {
          await addDoc(collection(db, 'stories', storyRef.id, 'images'), {
            storyId: storyRef.id,
            partId: part.id,
            base64Data: part.url,
            createdAt: serverTimestamp()
          });
        }
      }
      showToast("Story saved to your library!");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'stories');
    } finally {
      setIsSaving(false);
    }
  };

  const loadStory = async (story: any) => {
    setIsLoadingStory(true);
    setPrompt(story.title);
    setReview(story.review || '');
    setEmbedding(story.embedding || null);
    try {
      let parsedParts = JSON.parse(story.parts);
      const imagesSnapshot = await getDocs(collection(db, 'stories', story.id, 'images'));
      const imagesMap = new Map();
      imagesSnapshot.forEach(doc => {
        const data = doc.data();
        imagesMap.set(data.partId, data.base64Data);
      });

      parsedParts = parsedParts.map((part: any) => {
        if (part.type === 'image' && imagesMap.has(part.id)) return { ...part, url: imagesMap.get(part.id) };
        return part;
      });

      setStoryParts(parsedParts);
      setShowLibrary(false);
    } catch (e) {
      console.error("Failed to load story parts", e);
    } finally {
      setIsLoadingStory(false);
    }
  };

  const downloadAsBook = () => {
    if (storyParts.length === 0) return;
    let htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${prompt || 'OmniWeave Story'}</title><style>body{font-family:'Georgia',serif;line-height:1.8;max-width:800px;margin:0 auto;padding:40px;color:#333;background:#fdfbf7}h1{text-align:center;font-size:2.5em;margin-bottom:1em;color:#111}.part-text{margin-bottom:1.5em;font-size:1.2em}.part-image{text-align:center;margin:2em 0}.part-image img{max-width:100%;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1)}strong{color:#000}</style></head><body><h1>${prompt || 'A Tale Woven by OmniWeave'}</h1>`;
    storyParts.forEach(part => {
      if (part.type === 'text') {
        let textHtml = part.text.replace(/\\n/g, '<br/>').replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
        htmlContent += `<div class="part-text">${textHtml}</div>`;
      } else if (part.type === 'image' && part.url) {
        htmlContent += `<div class="part-image"><img src="${part.url}" alt="Story Illustration" /></div>`;
      }
    });
    htmlContent += `</body></html>`;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(prompt || 'story').substring(0, 30).replace(/[^a-z0-9]/gi, '_').toLowerCase()}_book.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportAudiobook = () => {
    const audioParts = storyParts.filter(p => p.type === 'text' && (p as any).audioBase64);
    if (audioParts.length === 0) { showToast('Play the story first to generate audio'); return; }

    // Decode all base64 PCM chunks
    const pcmChunks = audioParts.map(p => {
      const raw = atob((p as any).audioBase64);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      return bytes;
    });
    const totalLength = pcmChunks.reduce((sum, c) => sum + c.length, 0);

    // Build WAV header (24kHz, 16-bit, mono)
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

  useEffect(() => {
    setHasKey(!!getApiKey() || adkAvailable);
  }, [adkAvailable]);

  const regenerateImage = async (id: string, imagePrompt: string) => {
    setStoryParts(parts => parts.map(p => p.id === id ? { ...p, isLoading: true, error: undefined } : p));
    
    try {
      // Route through ADK server when available (keeps API key server-side)
      if (adkAvailable) {
        addAgentActivity(`generate_image → ${imagePrompt.substring(0, 40)}...`);
        const result = await generateImageViaADK(imagePrompt);
        if (result.status === 'success' && result.imageDataUri) {
          setStoryParts(parts => parts.map(p => p.id === id ? { ...p, url: result.imageDataUri!, isLoading: false } : p));
          addAgentActivity(`✓ Image generated via Cloud Run`);
          return;
        }
        // Fall through to direct call if server fails
        console.warn('ADK server image gen failed, falling back to direct:', result.error);
      }

      // Fallback: direct client-side Gemini call
      const apiKey = getApiKey();
      if (!apiKey) throw new Error("API Key is missing.");
      const ai = new GoogleGenAI({ apiKey: apiKey as string });
      const imageResponse = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: imagePrompt,
        config: { imageConfig: { aspectRatio: "16:9", imageSize: "1K" } }
      });
      
      const part = imageResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      if (part?.inlineData) {
        const url = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        setStoryParts(parts => parts.map(p => p.id === id ? { ...p, url, isLoading: false } : p));
      } else {
        setStoryParts(parts => parts.map(p => p.id === id ? { ...p, isLoading: false, error: 'Failed to generate image' } : p));
      }
    } catch (err) {
      console.error("Image generation error:", err);
      setStoryParts(parts => parts.map(p => p.id === id ? { ...p, isLoading: false, error: 'Failed to generate image' } : p));
    }
  };

  const generateStory = async () => {
    if (!prompt.trim()) return;
    
    setIsGenerating(true);
    setError('');
    setStoryParts([]);
    setEmbedding(null);
    setIsAutoPlaying(false);
    setCurrentPlayIndex(-1);
    setAgentActivity([]);
    
    if (activeAudio) { activeAudio.pause(); setActiveAudio(null); }

    try {
      const apiKey = getApiKey();
      if (!apiKey) throw new Error("API Key is missing. Please select an API Key.");
      const ai = new GoogleGenAI({ apiKey: apiKey as string });
      
      if (adkAvailable) addAgentActivity('OmniWeaveDirector → generating story...');
      
      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-3.1-pro-preview',
        contents: `Create a rich, immersive story or presentation about: "${prompt}"`,
        config: {
          systemInstruction: `You are OmniWeave, a master cinematic director and storyteller.

CRITICAL INSTRUCTIONS FOR IMAGERY (CONSISTENCY):
1. Choose a specific visual art style for the story (e.g., '3D Pixar style', 'Dark fantasy digital painting', 'Cinematic 35mm photography').
2. Interleave exactly 3 to 4 image prompts using the format: [IMAGE: <prompt>]
3. In EVERY SINGLE [IMAGE: ...] prompt, you MUST explicitly restate the chosen visual art style and fully describe the physical appearance of any characters in the scene (age, hair color, clothing). Do not rely on previous prompts for context. Each image prompt must be completely self-contained to ensure visual consistency.

CRITICAL INSTRUCTIONS FOR VOICES (CHARACTER MATCHING):
1. Format your text strictly as a script.
2. EVERY single block of text MUST begin with a speaker label followed by a colon (e.g., "Narrator:", "Elara:", "King Arthur:").
3. Use "Narrator:" for all descriptive and action text.
4. Use the character's specific name for their dialogue (e.g., "Elara: I must find the sword!").
5. Immediately after an [IMAGE: ...] prompt, the very next line of text MUST begin with a speaker label.

GROUNDING: Base your story on internally consistent world-building. Character names, settings, and visual descriptions must remain consistent throughout the entire story.`,
        }
      });

      if (adkAvailable) addAgentActivity('StoryWriter → streaming content...');

      let currentParts: StoryPart[] = [];
      let partIndex = 0;
      let buffer = '';

      const appendText = (text: string) => {
        if (!text) return;
        const lastPart = currentParts[currentParts.length - 1];
        if (lastPart && lastPart.type === 'text') {
          currentParts[currentParts.length - 1] = { ...lastPart, text: lastPart.text + text };
        } else {
          currentParts.push({ type: 'text', text, id: `txt-${partIndex++}` });
        }
        setStoryParts([...currentParts]);
      };

      const appendImagePlaceholder = (imagePrompt: string) => {
        const id = `img-${partIndex++}`;
        const newPart: StoryPart = { type: 'image', url: '', id, isLoading: true, prompt: imagePrompt };
        currentParts.push(newPart);
        setStoryParts([...currentParts]);
        regenerateImage(id, imagePrompt);
      };

      for await (const chunk of responseStream) {
        const text = chunk.text;
        if (!text) continue;
        
        buffer += text;
        
        let safeLength = buffer.length;
        const lastOpenBracket = buffer.lastIndexOf('[');
        if (lastOpenBracket !== -1) {
          const closingBracket = buffer.indexOf(']', lastOpenBracket);
          if (closingBracket === -1) safeLength = lastOpenBracket;
        }
        
        const processable = buffer.substring(0, safeLength);
        buffer = buffer.substring(safeLength);
        
        if (processable) {
          const regex = /\[IMAGE:\s*(.*?)\s*\]/g;
          let match;
          let lastIndex = 0;
          
          while ((match = regex.exec(processable)) !== null) {
            if (match.index > lastIndex) appendText(processable.substring(lastIndex, match.index));
            appendImagePlaceholder(match[1]);
            lastIndex = regex.lastIndex;
          }
          
          if (lastIndex < processable.length) appendText(processable.substring(lastIndex));
        }
      }
      
      if (buffer) {
        const regex = /\[IMAGE:\s*(.*?)\s*\]/g;
        let match;
        let lastIndex = 0;
        while ((match = regex.exec(buffer)) !== null) {
          if (match.index > lastIndex) appendText(buffer.substring(lastIndex, match.index));
          appendImagePlaceholder(match[1]);
          lastIndex = regex.lastIndex;
        }
        if (lastIndex < buffer.length) appendText(buffer.substring(lastIndex));
      }
      
      if (currentParts.length === 0) throw new Error("No content generated.");

      if (adkAvailable) addAgentActivity('StoryReviewer → validating consistency...');

      const newParts = currentParts;

      try {
        const firstImagePart = newParts.find(p => p.type === 'image') as { type: 'image', url: string, prompt?: string } | undefined;
        
        if (adkAvailable) {
          addAgentActivity('compute_embedding → multimodal fingerprint...');
          // Extract base64 from the first image if available
          let imgBase64: string | undefined;
          let imgMime: string | undefined;
          if (firstImagePart?.url) {
            const [prefix, base64Data] = firstImagePart.url.split(',');
            imgMime = prefix.split(':')[1]?.split(';')[0];
            imgBase64 = base64Data;
          }
          const embedResult = await computeEmbeddingViaADK(prompt, imgBase64, imgMime);
          if (embedResult.status === 'success' && embedResult.embedding) {
            setEmbedding(embedResult.embedding);
            addAgentActivity(`✓ Embedding computed via Cloud Run (${embedResult.dimensions}D)`);
          }
        } else {
          // Direct embedding
          const embedContents: any[] = [prompt];
          if (firstImagePart?.url) {
            const [prefix, base64Data] = firstImagePart.url.split(',');
            const mimeType = prefix.split(':')[1]?.split(';')[0];
            embedContents.push({ inlineData: { data: base64Data, mimeType } });
          } else if (firstImagePart?.prompt) {
            embedContents.push(firstImagePart.prompt);
          }
          const embedResult = await ai.models.embedContent({ model: 'gemini-embedding-2-preview', contents: embedContents });
          const values = embedResult.embeddings?.[0]?.values || (embedResult as any).embedding?.values;
          if (values) setEmbedding(values);
        }
      } catch (embedErr) {
        console.error("Failed to generate embedding:", embedErr);
      }

      if (adkAvailable) addAgentActivity('✓ Story generation complete');

    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("Requested entity was not found") || err.message?.includes("PERMISSION_DENIED") || err.message?.includes("403")) {
        setHasKey(false);
        setError("API Key error: The provided key does not have permission for these models. Please ensure the Generative Language API is enabled and unrestricted.");
      } else {
        setError(err.message || "An error occurred during generation.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const playAudio = async (partId: string, text: string, autoNextIndex?: number) => {
    const part = storyParts.find(p => p.id === partId);
    if (part?.type === 'text' && part.isPlaying && activeAudio) {
      activeAudio.pause();
      setActiveAudio(null);
      setIsAutoPlaying(false);
      setStoryParts(parts => parts.map(p => p.id === partId ? { ...p, isPlaying: false } : p));
      return;
    }

    if (activeAudio) {
      activeAudio.pause();
      setStoryParts(parts => parts.map(p => p.type === 'text' ? { ...p, isPlaying: false } : p));
    }

    if (part?.type === 'text' && part.audioUrl) {
      const audio = new Audio(part.audioUrl);
      setActiveAudio(audio);
      audio.onended = () => {
        setStoryParts(parts => parts.map(p => p.id === partId ? { ...p, isPlaying: false } : p));
        setActiveAudio(null);
        if (autoNextIndex !== undefined) {
          const nextTextPartIndex = storyParts.findIndex((p, idx) => idx > autoNextIndex && p.type === 'text');
          if (nextTextPartIndex !== -1) {
            const nextPart = storyParts[nextTextPartIndex];
            if (nextPart.type === 'text') { setCurrentPlayIndex(nextTextPartIndex); playAudio(nextPart.id, nextPart.text, nextTextPartIndex); }
          } else { setIsAutoPlaying(false); setCurrentPlayIndex(-1); }
        }
      };
      setStoryParts(parts => parts.map(p => p.id === partId ? { ...p, isPlaying: true } : p));
      await audio.play();
      return;
    }

    setStoryParts(parts => parts.map(p => p.id === partId ? { ...p, isLoadingAudio: true } : p));
    
    try {
      // Check Firebase audio cache first
      const textHash = await hashText(text);
      const cacheRef = doc(db, 'audio_cache', textHash);
      try {
        const cacheSnap = await getDoc(cacheRef);
        if (cacheSnap.exists()) {
          const cachedBase64 = cacheSnap.data().base64Data;
          const wavUrl = createWavFile(cachedBase64, 24000);
          setStoryParts(parts => parts.map(p => p.id === partId ? { ...p, isLoadingAudio: false, audioUrl: wavUrl, audioBase64: cachedBase64, isPlaying: true } : p));
          const audio = new Audio(wavUrl);
          setActiveAudio(audio);
          audio.onended = () => {
            setStoryParts(parts => parts.map(p => p.id === partId ? { ...p, isPlaying: false } : p));
            setActiveAudio(null);
            if (autoNextIndex !== undefined) {
              const nextTextPartIndex = storyParts.findIndex((p, idx) => idx > autoNextIndex && p.type === 'text');
              if (nextTextPartIndex !== -1) { const nextPart = storyParts[nextTextPartIndex]; if (nextPart.type === 'text') { setCurrentPlayIndex(nextTextPartIndex); playAudio(nextPart.id, nextPart.text, nextTextPartIndex); } }
              else { setIsAutoPlaying(false); setCurrentPlayIndex(-1); }
            }
          };
          await audio.play();
          return;
        }
      } catch (e) { console.error("Cache check failed", e); }

      const apiKey = getApiKey();
      if (!apiKey) throw new Error("API Key is missing.");
      const ai = new GoogleGenAI({ apiKey: apiKey as string });

      if (adkAvailable) addAgentActivity('generate_speech → TTS streaming...');

      // Build voice map — gender-aware assignment
      const currentVoiceMap: Record<string, string> = { 'Narrator': 'Zephyr' };
      const fullText = storyParts.filter(p => p.type === 'text').map(p => (p as any).text).join('\n');
      const speakerRegex = /^\s*(?:\*\*|\*)?([A-Z][a-zA-Z0-9_ ]+)(?:\*\*|\*)?:/gm;
      let match;
      while ((match = speakerRegex.exec(fullText)) !== null) {
        const speaker = match[1].trim();
        if (!currentVoiceMap[speaker]) {
          currentVoiceMap[speaker] = assignVoice(speaker, currentVoiceMap);
        }
      }

      // Chunk text for multi-speaker TTS
      const lines = text.split('\n');
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
          const nextTextPartIndex = storyParts.findIndex((p, idx) => idx > autoNextIndex && p.type === 'text');
          if (nextTextPartIndex !== -1) { const nextPart = storyParts[nextTextPartIndex]; if (nextPart.type === 'text') { setCurrentPlayIndex(nextTextPartIndex); playAudio(nextPart.id, nextPart.text, nextTextPartIndex); } }
          else { setIsAutoPlaying(false); setCurrentPlayIndex(-1); }
        }
      });
      streamer.init();
      setActiveAudio(streamer);
      setStoryParts(parts => parts.map(p => p.id === partId ? { ...p, isLoadingAudio: false, isPlaying: true } : p));

      let fullBinary = '';
      
      try {
        const streamPromises = apiChunks.map(chunk => {
          const speakerVoiceConfigs = chunk.speakers.map(speaker => ({
            speaker, voiceConfig: { prebuiltVoiceConfig: { voiceName: currentVoiceMap[speaker] || 'Zephyr' } }
          }));
          let speechConfig: any = {};
          if (speakerVoiceConfigs.length === 1) speechConfig = { voiceConfig: speakerVoiceConfigs[0].voiceConfig };
          else if (speakerVoiceConfigs.length >= 2) speechConfig = { multiSpeakerVoiceConfig: { speakerVoiceConfigs: speakerVoiceConfigs.slice(0, 2) } };
          const ttsPrompt = chunk.speakers.length > 1 
            ? `TTS the following conversation between ${chunk.speakers.join(' and ')}:\n\n${chunk.text}`
            : `Read the following script:\n\n${chunk.text}`;
          return ai.models.generateContentStream({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: ttsPrompt }] }],
            config: { responseModalities: [Modality.AUDIO], speechConfig },
          });
        });

        for (const streamPromise of streamPromises) {
          if (!streamer.isPlaying) break;
          const responseStream = await streamPromise;
          for await (const responseChunk of responseStream) {
            if (!streamer.isPlaying) break;
            const base64Audio = responseChunk.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (base64Audio) { streamer.addChunk(base64Audio); fullBinary += atob(base64Audio); }
          }
        }
        
        streamer.markFinished();
        
        if (fullBinary && streamer.isPlaying) {
          const fullBase64 = btoa(fullBinary);
          const wavUrl = createWavFile(fullBase64, 24000);
          setStoryParts(parts => parts.map(p => p.id === partId ? { ...p, audioUrl: wavUrl, audioBase64: fullBase64 } : p));
          if (fullBase64.length < 900000) {
            await setDoc(cacheRef, { base64Data: fullBase64, createdAt: serverTimestamp() }).catch(e => console.error("Failed to cache audio", e));
          }
        }
        if (adkAvailable) addAgentActivity('✓ TTS narration complete');
      } catch (err) {
        console.error("Stream error:", err);
        streamer.stop();
        throw err;
      }
    } catch (err) {
      console.error("TTS Error:", err);
      setIsAutoPlaying(false);
      setStoryParts(parts => parts.map(p => p.id === partId ? { ...p, isLoadingAudio: false } : p));
    }
  };

  const startBackgroundMusic = async () => {
    if (!musicEnabled) return;
    try {
      const apiKey = getApiKey();
      if (!apiKey) return;
      const ai = new GoogleGenAI({ apiKey: apiKey as string });

      // Extract mood from story text
      const storyText = storyParts.filter(p => p.type === 'text').map(p => (p as any).text).join('\n');
      const moodPrompt = extractMoodPrompt(storyText);

      const session = await (ai as any).live.music.connect({
        model: 'models/lyria-realtime-exp',
        callbacks: {
          onAudioData: (data: { data: string }) => {
            // Stream music through WebAudio at low volume
            try {
              const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 48000 });
              const raw = atob(data.data);
              const bytes = new Uint8Array(raw.length);
              for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
              const float32 = new Float32Array(bytes.length / 2);
              const dv = new DataView(bytes.buffer);
              for (let i = 0; i < float32.length; i++) float32[i] = dv.getInt16(i * 2, true) / 32768;
              const buffer = ctx.createBuffer(1, float32.length, 48000);
              buffer.getChannelData(0).set(float32);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              const gainNode = ctx.createGain();
              gainNode.gain.value = 0.15;
              source.connect(gainNode).connect(ctx.destination);
              source.start();
            } catch { /* silent fallback */ }
          },
        },
      });

      await session.setWeightedPrompts([{ text: moodPrompt, weight: 1.0 }]);
      await session.play();
      setMusicSession(session);
      if (adkAvailable) addAgentActivity('lyria-realtime → Background music streaming');
    } catch (err) {
      console.warn('Lyria RealTime not available:', err);
      // Silently degrade — Lyria may not be enabled for this API key
    }
  };

  const stopBackgroundMusic = async () => {
    if (musicSession) {
      try { await musicSession.pause(); } catch { /* ignore */ }
      setMusicSession(null);
    }
  };

  const startAutoPlay = () => {
    const firstTextPartIndex = storyParts.findIndex(p => p.type === 'text');
    if (firstTextPartIndex !== -1) {
      const firstPart = storyParts[firstTextPartIndex];
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
    if (activeAudio) { activeAudio.pause(); setActiveAudio(null); setStoryParts(parts => parts.map(p => p.type === 'text' ? { ...p, isPlaying: false } : p)); }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f0] text-[#2c2c2c] relative overflow-x-hidden selection:bg-[#8b2e16]/30">
      <div className="atmosphere"></div>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className={`fixed top-20 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 ${
              toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
            }`}>
            {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      <header className="fixed top-0 left-0 right-0 z-50 glass-panel border-x-0 border-t-0 rounded-none px-4 md:px-6 py-3 md:py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 md:gap-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#8b2e16] to-[#5A5A40] flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-[#f5f5f0]" />
          </div>
          <h1 className="text-xl font-serif tracking-tight">OmniWeave</h1>
        </div>
        <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pb-1 md:pb-0 justify-start md:justify-end w-full md:w-auto">
          <button onClick={loadLibrary} className="text-xs font-medium text-[#2c2c2c]/80 hover:text-[#2c2c2c] flex items-center gap-1 bg-black/5 px-3 py-1.5 rounded-full transition-colors mr-4"><Library className="w-3.5 h-3.5" /> Library</button>
          {/* ADK Server Status Badge */}
          <div className={`text-[10px] md:text-xs font-mono px-2.5 md:px-3 py-1 md:py-1.5 rounded-full border flex items-center gap-1 whitespace-nowrap ${
            adkAvailable 
              ? 'text-emerald-700 bg-emerald-50 border-emerald-200' 
              : 'text-[#8b2e16]/80 bg-[#fdfbf7]/60 border-black/5'
          }`}>
            <CheckCircle2 className="w-3 h-3" />
            {adkAvailable ? 'ADK Agent Connected' : 'Direct Mode'}
          </div>
          <div className="text-[10px] md:text-xs font-mono text-[#8b2e16]/80 bg-[#fdfbf7]/60 px-2.5 md:px-3 py-1 md:py-1.5 rounded-full border border-black/5 flex items-center gap-1 whitespace-nowrap">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" /> 7 Gemini Models
          </div>
          <div className="text-[10px] md:text-xs font-mono text-[#8b2e16]/80 bg-[#fdfbf7]/60 px-2.5 md:px-3 py-1 md:py-1.5 rounded-full border border-black/5 flex items-center gap-1 whitespace-nowrap">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Multi-Cast TTS
          </div>
        </div>
      </header>

      <main className="pt-28 md:pt-32 pb-32 px-4 md:px-6 max-w-4xl mx-auto">
        {showLibrary ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-20">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-4xl font-serif font-light tracking-tight">Story <span className="italic text-[#8b2e16]">Library</span></h2>
              <button onClick={() => setShowLibrary(false)} className="text-sm text-[#2c2c2c]/70 hover:text-[#2c2c2c] flex items-center gap-2"><ArrowRight className="w-4 h-4 rotate-180" /> Back to Weaving</button>
            </div>
            {isLoadingStory ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-8 h-8 border-2 border-[#8b2e16] border-t-transparent rounded-full animate-spin"></div>
                <p className="text-[#2c2c2c]/70 font-serif italic">Loading story and images...</p>
              </div>
            ) : savedStories.length === 0 ? (
              <div className="text-center py-20 text-[#2c2c2c]/60 font-serif italic">No stories yet. Be the first to weave one.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {savedStories.map((story) => (
                  <div key={story.id} className="glass-panel p-6 rounded-2xl flex flex-col gap-4 hover:border-[#8b2e16]/30 transition-colors cursor-pointer" onClick={() => loadStory(story)}>
                    <h3 className="text-xl font-serif font-medium text-[#1a1a1a] line-clamp-2">{story.title}</h3>
                    <div className="text-xs text-[#2c2c2c]/60 font-mono">{new Date(story.createdAt?.seconds * 1000).toLocaleDateString()}</div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <>
            <AnimatePresence>
              {storyParts.length === 0 && !isGenerating && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20, filter: 'blur(10px)' }} className="mt-20">
                  <h2 className="text-4xl md:text-7xl font-serif font-light tracking-tight mb-6 leading-[1.1]">
                    What story shall we <br/><span className="italic text-[#8b2e16]">weave today?</span>
                  </h2>
                  
                  <div className="glass-panel p-2 rounded-2xl flex flex-col gap-2 transition-all focus-within:border-[#8b2e16]/30 focus-within:shadow-[0_0_30px_rgba(139,46,22,0.1)]">
                    <textarea id="prompt-input" value={prompt} onChange={(e) => setPrompt(e.target.value)}
                      placeholder="A cyberpunk detective exploring a neon-lit underwater city..."
                      className="w-full bg-transparent border-none outline-none resize-none p-3 md:p-4 text-base md:text-lg text-[#2c2c2c] placeholder:text-[#2c2c2c]/20 min-h-[120px]"
                      onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generateStory(); }}
                    />
                    <div className="flex justify-end md:justify-between items-center px-2 md:px-4 pb-2">
                      <span className="hidden md:inline text-xs text-[#2c2c2c]/60 font-mono">Press Cmd+Enter to generate</span>
                      <button id="generate-btn" onClick={generateStory} disabled={!prompt.trim() || isGenerating}
                        className="w-full md:w-auto px-6 py-3 md:py-2.5 bg-[#8b2e16] text-[#fdfbf7] font-medium rounded-xl hover:bg-[#8b2e16]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                        Generate <Sparkles className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  {/* Prompt Suggestions */}
                  <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
                    {PROMPT_SUGGESTIONS.map((s) => (
                      <button key={s.label} onClick={() => setPrompt(s.prompt)}
                        className="text-left p-3 rounded-xl bg-black/[0.03] hover:bg-black/[0.07] border border-black/5 hover:border-[#8b2e16]/20 transition-all group">
                        <span className="text-lg mb-1 block">{s.icon}</span>
                        <span className="text-xs font-medium text-[#2c2c2c]/80 group-hover:text-[#8b2e16] transition-colors">{s.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {FEATURE_CARDS.map((f) => (
                      <div key={f.title} className="p-4 rounded-xl bg-black/[0.02] border border-black/5 flex gap-3 items-start">
                        <div className="w-2 h-2 rounded-full mt-2 shrink-0" style={{ backgroundColor: f.color }} />
                        <div>
                          <h4 className="text-sm font-semibold text-[#1a1a1a]">{f.title}</h4>
                          <p className="text-xs text-[#2c2c2c]/60 mt-0.5 leading-relaxed">{f.desc}</p>
                          <span className="text-[10px] font-mono text-[#2c2c2c]/40 mt-1 inline-block">{f.model}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {error && (
                    <div className="mt-6 p-4 bg-red-900/10 border border-red-900/20 rounded-xl text-red-800 text-sm flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 shrink-0" /><p>{error}</p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {isGenerating && storyParts.length === 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-32">
                  <div className="relative w-24 h-24 flex items-center justify-center mb-8">
                    <div className="absolute inset-0 border-t-2 border-[#8b2e16] rounded-full animate-spin"></div>
                    <div className="absolute inset-2 border-r-2 border-[#5a5a40] rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
                    <Sparkles className="w-8 h-8 text-[#8b2e16] animate-pulse" />
                  </div>
                  <h3 className="text-2xl font-serif italic text-[#2c2c2c] mb-2">Weaving your story...</h3>
                  <p className="text-sm text-[#2c2c2c]/60 font-mono">Generating interleaved text and 1K images</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Agent Activity Log (shows when ADK is connected) */}
            {adkAvailable && agentActivity.length > 0 && (isGenerating || storyParts.length > 0) && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-6 p-3 rounded-xl bg-[#EEEDFE]/50 border border-[#534AB7]/10">
                <div className="text-[10px] font-mono text-[#534AB7] font-medium mb-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#534AB7] animate-pulse"></span>
                  ADK Agent Pipeline
                </div>
                {agentActivity.map((msg, i) => (
                  <div key={i} className="text-[11px] font-mono text-[#534AB7]/70 pl-3">{msg}</div>
                ))}
              </motion.div>
            )}

            {storyParts.length > 0 && !isGenerating && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                  <button onClick={downloadAsBook} className="px-4 py-2.5 rounded-xl font-medium flex items-center gap-2 bg-black/10 hover:bg-black/20 text-[#2c2c2c] transition-colors whitespace-nowrap text-sm"><BookOpen className="w-4 h-4" /> Download Book</button>
                  <button onClick={exportAudiobook} className="px-4 py-2.5 rounded-xl font-medium flex items-center gap-2 bg-black/10 hover:bg-black/20 text-[#2c2c2c] transition-colors whitespace-nowrap text-sm"><Download className="w-4 h-4" /> Audiobook</button>
                  <button onClick={saveToLibrary} disabled={isSaving} className="px-4 py-2.5 rounded-xl font-medium flex items-center gap-2 bg-black/10 hover:bg-black/20 text-[#2c2c2c] transition-colors whitespace-nowrap text-sm disabled:opacity-50">
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setMusicEnabled(e => !e)}
                    className={`px-4 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all whitespace-nowrap text-sm ${
                      musicEnabled ? 'bg-[#7c3aed]/20 text-[#7c3aed] border border-[#7c3aed]/30' : 'bg-black/10 hover:bg-black/20 text-[#2c2c2c]'
                    }`}>
                    <MusicIcon className="w-4 h-4" /> {musicEnabled ? 'Music On' : 'Music'}
                  </button>
                  <button id="autoplay-btn" onClick={isAutoPlaying ? stopAutoPlay : startAutoPlay}
                    className={`px-6 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all whitespace-nowrap ${
                      isAutoPlaying
                        ? 'bg-[#8b2e16]/20 text-[#8b2e16] border border-[#8b2e16]/30 hover:bg-[#8b2e16]/30'
                        : 'bg-[#8b2e16] text-[#f5f5f0] shadow-[0_0_20px_rgba(139,46,22,0.15)] hover:bg-[#8b2e16]/90'
                    }`}>
                    {isAutoPlaying ? (<><Square className="w-4 h-4 fill-current" /> Stop Presentation</>) : (<><Play className="w-4 h-4 fill-current" /> Play Full Story</>)}
                  </button>
                </div>
              </motion.div>
            )}

            <div className="space-y-16">
              {storyParts.map((part, idx) => (
                <motion.div key={part.id} initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>
                  {part.type === 'image' ? (
                    <div className="relative group rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.08)] border border-black/5">
                      {part.isLoading ? (
                        <div className="aspect-video bg-black/5 flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#2c2c2c]/50 animate-spin" /></div>
                      ) : part.error ? (
                        <div className="aspect-video bg-[#8b2e16]/10 flex flex-col items-center justify-center text-[#8b2e16] gap-3">
                          <div className="flex items-center"><AlertCircle className="w-6 h-6 mr-2" />{part.error}</div>
                          {part.prompt && (<button onClick={() => regenerateImage(part.id, part.prompt!)} className="px-4 py-2 bg-[#8b2e16]/20 hover:bg-[#8b2e16]/30 rounded-lg text-sm transition-colors">Try Again</button>)}
                        </div>
                      ) : !part.url ? (
                        <div className="aspect-video bg-black/5 flex flex-col items-center justify-center text-[#2c2c2c]/50 p-6 text-center gap-4">
                          <p className="text-sm italic max-w-md">"{part.prompt}"</p>
                          <button onClick={() => regenerateImage(part.id, part.prompt!)} className="px-6 py-2.5 bg-[#8b2e16] hover:bg-[#8b2e16]/90 text-[#f5f5f0] rounded-xl text-sm font-medium transition-colors">Generate Image</button>
                        </div>
                      ) : (
                        <>
                          <img src={part.url} alt={`Story illustration ${idx}`} className={`w-full h-auto object-cover kenburns-${(idx % 4) + 1}`} referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="relative pl-8 md:pl-12">
                      <div className="absolute left-0 top-2 bottom-2 w-px bg-gradient-to-b from-[#8b2e16]/50 to-transparent"></div>
                      <div className="story-text markdown-body"><ReactMarkdown>{part.text}</ReactMarkdown></div>
                      <div className="mt-6 flex items-center gap-3 md:gap-4">
                        <button id={`play-audio-${part.id}`} onClick={() => playAudio(part.id, part.text)} disabled={part.isLoadingAudio || isGenerating}
                          className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-full text-xs md:text-sm font-medium transition-all ${
                            part.isPlaying ? 'bg-[#8b2e16] text-[#f5f5f0] shadow-[0_0_20px_rgba(139,46,22,0.25)]' : 'bg-black/5 text-[#2c2c2c]/80 hover:bg-black/10 hover:text-[#2c2c2c] border border-black/10'
                          }`}>
                          {part.isLoadingAudio ? <Loader2 className="w-4 h-4 animate-spin" /> : part.isPlaying ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                          <span className="hidden sm:inline">{part.isLoadingAudio ? 'Generating Audio...' : part.isPlaying ? 'Stop Narration' : 'Play Narration'}</span>
                          <span className="sm:hidden">{part.isLoadingAudio ? '...' : part.isPlaying ? 'Stop' : 'Play'}</span>
                        </button>
                        {part.isPlaying && (
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4].map(i => (<motion.div key={i} animate={{ height: ['8px', '24px', '8px'] }} transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }} className="w-1 bg-[#8b2e16] rounded-full" />))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
              
              {isGenerating && storyParts.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center py-12">
                  <div className="flex items-center gap-3 text-[#8b2e16]/80">
                    <div className="w-5 h-5 border-2 border-[#8b2e16]/30 border-t-[#8b2e16] rounded-full animate-spin"></div>
                    <span className="font-serif italic text-sm">Weaving more of the story...</span>
                  </div>
                </motion.div>
              )}
            </div>

            {embedding && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                className="mt-16 p-6 md:p-8 glass-panel border-black/10 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#8b2e16] via-[#5a5a40] to-[#8b2e16]"></div>
                <h3 className="text-sm font-mono text-[#2c2c2c]/80 mb-6 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#8b2e16]" />
                  Multimodal Story Fingerprint {adkAvailable && <span className="text-[10px] text-[#534AB7] bg-[#EEEDFE] px-2 py-0.5 rounded-full">via Cloud Run</span>}
                </h3>
                <div className="flex w-full h-16 md:h-24 rounded-xl overflow-hidden bg-black/5 border border-black/5">
                  {embedding.slice(0, 128).map((val, i) => (
                    <div key={i} className="flex-1 h-full" style={{ backgroundColor: val > 0 ? '#f97316' : '#3b82f6', opacity: Math.min(1, Math.abs(val) * 20) }} title={`Dim ${i}: ${val.toFixed(4)}`} />
                  ))}
                </div>
                <div className="mt-4 flex justify-between items-center text-xs text-[#2c2c2c]/60 font-mono">
                  <span>gemini-embedding-2-preview</span>
                  <span>{embedding.length} Dimensions</span>
                </div>
              </motion.div>
            )}

            {storyParts.length > 0 && !isGenerating && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="mt-16 flex flex-col items-center gap-8">
                <div className="w-full max-w-2xl glass-panel p-6 rounded-2xl border-black/10">
                  <h3 className="text-xl font-serif text-[#1a1a1a] mb-4 flex items-center gap-2"><Sparkles className="w-5 h-5 text-[#8b2e16]" />Review your Story</h3>
                  <textarea value={review} onChange={(e) => setReview(e.target.value)} placeholder="What did you think of this story? Add your thoughts before saving..."
                    className="w-full bg-[#fdfbf7]/80 border border-black/10 rounded-xl p-4 text-[#2c2c2c] placeholder:text-[#2c2c2c]/40 resize-none min-h-[100px] focus:outline-none focus:border-[#8b2e16]/50 transition-colors" maxLength={1000} />
                  <div className="flex justify-between items-center mt-4">
                    <span className="text-xs text-[#2c2c2c]/60 font-mono">{review.length}/1000</span>
                    <button onClick={saveToLibrary} disabled={isSaving} className="px-6 py-2.5 bg-[#8b2e16] hover:bg-[#8b2e16]/90 text-[#f5f5f0] rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2">
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Story & Review
                    </button>
                  </div>
                </div>

                {similarStories.length > 0 && (
                  <div className="w-full max-w-4xl mt-8">
                    <h3 className="text-xl font-serif text-[#1a1a1a] mb-6 flex items-center gap-2"><Sparkles className="w-5 h-5 text-[#8b2e16]" />More Like This</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {similarStories.map((story, idx) => (
                        <div key={story.id || idx} onClick={() => loadStory(story)} className="glass-panel p-4 rounded-xl border-black/10 cursor-pointer hover:bg-black/5 transition-colors group">
                          <h4 className="font-medium text-[#1a1a1a] line-clamp-2 mb-2 group-hover:text-[#8b2e16] transition-colors">{story.title}</h4>
                          <div className="flex justify-between items-center text-xs text-[#2c2c2c]/50">
                            <span>{new Date(story.createdAt?.toDate?.() || Date.now()).toLocaleDateString()}</span>
                            <span className="text-[#8b2e16]/80 font-mono">{(story.similarity * 100).toFixed(1)}% Match</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button id="new-story-btn" onClick={() => { setStoryParts([]); setPrompt(''); setReview(''); setAgentActivity([]); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="px-8 py-3 bg-transparent border border-black/20 text-[#2c2c2c]/80 hover:text-[#2c2c2c] hover:border-black/40 rounded-full transition-all flex items-center gap-2">
                  <BookOpen className="w-4 h-4" /> Start a New Story
                </button>
              </motion.div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-black/5 bg-[#fdfbf7]/80 backdrop-blur-sm py-8 px-4 md:px-6 mt-16">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-xs text-[#2c2c2c]/60">
            <div>
              <h4 className="font-semibold text-[#2c2c2c]/80 mb-3 text-sm">Multi-Agent Architecture</h4>
              <div className="font-mono space-y-1">
                <div>OmniWeaveDirector <span className="text-[#8b2e16]/60">(LlmAgent)</span></div>
                <div className="pl-3">StoryPipeline <span className="text-[#5a5a40]/60">(SequentialAgent)</span></div>
                <div className="pl-6">StoryWriter <span className="text-[#2c2c2c]/40">(LlmAgent)</span></div>
                <div className="pl-6">StoryReviewer <span className="text-[#2c2c2c]/40">(LlmAgent)</span></div>
                <div className="pl-3 mt-1">4 FunctionTools</div>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-[#2c2c2c]/80 mb-3 text-sm">Gemini Models (7)</h4>
              <div className="font-mono space-y-1">
                <div><span className="inline-block w-2 h-2 rounded-full bg-[#8b2e16] mr-1.5" />gemini-3.1-pro-preview</div>
                <div><span className="inline-block w-2 h-2 rounded-full bg-[#2563eb] mr-1.5" />gemini-3-flash-preview</div>
                <div><span className="inline-block w-2 h-2 rounded-full bg-[#0891b2] mr-1.5" />gemini-3.1-flash-lite</div>
                <div><span className="inline-block w-2 h-2 rounded-full bg-[#d97706] mr-1.5" />gemini-3.1-flash-image</div>
                <div><span className="inline-block w-2 h-2 rounded-full bg-[#059669] mr-1.5" />gemini-2.5-flash-tts</div>
                <div><span className="inline-block w-2 h-2 rounded-full bg-[#7c3aed] mr-1.5" />gemini-embedding-2</div>
                <div><span className="inline-block w-2 h-2 rounded-full bg-[#ec4899] mr-1.5" />lyria-realtime-exp</div>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-[#2c2c2c]/80 mb-3 text-sm">Google Cloud Services (6)</h4>
              <div className="font-mono space-y-1">
                <div>Cloud Run &middot; ADK server</div>
                <div>Firebase Hosting &middot; Frontend</div>
                <div>Cloud Firestore &middot; Data</div>
                <div>Firebase Auth &middot; Anonymous</div>
                <div>Artifact Registry &middot; Images</div>
                <div>Cloud Build &middot; CI/CD</div>
              </div>
            </div>
          </div>
          <div className="mt-8 pt-4 border-t border-black/5 flex flex-col md:flex-row justify-between items-center gap-2 text-[10px] font-mono text-[#2c2c2c]/40">
            <span>Built with Google ADK for TypeScript + Google GenAI SDK</span>
            <span>#GeminiLiveAgentChallenge &middot; Creative Storyteller</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
