import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { PlayIcon as Play, StopIcon as Square, SpinnerIcon as Loader2, QuillIcon as Sparkles, ArrowRightIcon as ArrowRight, CheckIcon as CheckCircle2, AlertIcon as AlertCircle, BookIcon as BookOpen, DownloadIcon as Download, BookmarkIcon as Save, LibraryIcon as Library, MusicIcon, MicrophoneIcon, MicOffIcon, LiveIcon, ChevronLeftIcon, ChevronRightIcon } from './components/Icons';
import { createLiveClient, type LiveCallbacks } from './liveClient';
import { auth, db } from './firebase';
import { signInAnonymously, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { collection, addDoc, getDocs, query, where, serverTimestamp, doc, getDocFromServer } from 'firebase/firestore';
import { checkADKServer, generateImageViaADK, computeEmbeddingViaADK, generateStoryViaADK, getADKServerURL } from './adkClient';
import { createStoryStreamState, appendStoryChunk, flushStoryChunk } from './storyStream.js';


type StoryPart = 
  | { type: 'text', text: string, id: string, audioUrl?: string, audioBase64?: string, isPlaying?: boolean, isLoadingAudio?: boolean }
  | { type: 'image', url: string, id: string, isLoading?: boolean, prompt?: string, error?: string };

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
  // Expanded voice pools — each voice has a distinct accent/tone so characters sound obviously different
  const FEMALE_VOICES = ['Kore', 'Aoede', 'Leda', 'Puck', 'Zephyr'];
  const MALE_VOICES = ['Fenrir', 'Charon', 'Enceladus', 'Puck', 'Kore'];
  const NEUTRAL_VOICES = ['Puck', 'Kore', 'Fenrir', 'Aoede', 'Charon'];
  if (gender === 'female') return FEMALE_VOICES.find(v => !used.has(v)) || FEMALE_VOICES[Math.floor(Math.random() * 3)];
  if (gender === 'male') return MALE_VOICES.find(v => !used.has(v)) || MALE_VOICES[Math.floor(Math.random() * 3)];
  return NEUTRAL_VOICES.find(v => !used.has(v)) || 'Puck';
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
    { kw: ['adventure', 'quest', 'journey', 'explore', 'discover'], prompt: 'adventurous orchestral music, soaring strings and triumphant horns' },
    { kw: ['comedy', 'funny', 'laugh', 'joke', 'silly'], prompt: 'lighthearted playful music, pizzicato strings and bouncy woodwinds' },
    { kw: ['horror', 'ghost', 'haunted', 'scream', 'nightmare'], prompt: 'tense horror ambient music, dissonant strings and eerie drones' },
    { kw: ['mystery', 'detective', 'clue', 'secret', 'puzzle'], prompt: 'suspenseful mystery music, muted piano and subtle tension building' },
    { kw: ['castle', 'kingdom', 'medieval', 'knight', 'throne'], prompt: 'medieval fantasy music, lute and recorder with regal brass' },
    { kw: ['fairy', 'dream', 'whimsy', 'wonder', 'sparkle'], prompt: 'whimsical fairy-tale music, celesta and gentle strings with magical chimes' },
  ];
  for (const m of moods) { if (m.kw.some(k => lower.includes(k))) return m.prompt; }
  return 'gentle cinematic ambient background music, soft strings and piano';
}

function getApiKey(): string | undefined {
  const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
  return typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : undefined;
}

const PROMPT_SUGGESTIONS = [
  { label: 'Cyberpunk Noir', prompt: 'A cyberpunk detective exploring a neon-lit underwater city, searching for a stolen AI consciousness' },
  { label: 'Fantasy Quest', prompt: 'A young alchemist discovers a living map that leads to the last dragon egg hidden in a floating mountain kingdom' },
  { label: 'Space Opera', prompt: 'Two rival starship captains must work together when they discover an ancient alien signal coming from inside a dying star' },
  { label: 'Folklore Retold', prompt: 'A modern retelling of a Japanese folktale where a spirit fox runs a late-night ramen shop in rainy Tokyo' },
];

const PIPELINE_STEPS = [
  { label: 'Live Voice', model: 'gemini-live-2.5-flash', desc: 'Bidi-streaming voice interaction' },
  { label: 'Story Writing', model: 'gemini-3.1-pro', desc: 'Cinematic scripts with character sheets' },
  { label: 'Quality Review', model: 'gemini-3.1-flash-lite', desc: 'Consistency & narrative polish' },
  { label: '1K Illustrations', model: 'gemini-3.1-flash-image', desc: 'Art-directed scene generation' },
  { label: 'Voice Casting', model: 'gemini-2.5-pro-tts', desc: 'Multi-speaker narration' },
  { label: 'Ambient Score', model: 'lyria-realtime', desc: 'Mood-reactive background music' },
  { label: 'Story DNA', model: 'gemini-embedding-2', desc: 'Semantic similarity fingerprints' },
];

export default function App() {
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
  const [reviewStatus, setReviewStatus] = useState<string>('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [musicSession, setMusicSession] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(0);

  // Ref to avoid stale closures in audio callbacks
  const storyPartsRef = useRef<StoryPart[]>([]);
  useEffect(() => { storyPartsRef.current = storyParts; }, [storyParts]);

  // Group story parts into "pages" — each page = one text block + its following image (if any)
  const storyPages = (() => {
    const pages: StoryPart[][] = [];
    let i = 0;
    while (i < storyParts.length) {
      const part = storyParts[i];
      if (part.type === 'text') {
        // Check if next part is an image — pair them on one page
        if (i + 1 < storyParts.length && storyParts[i + 1].type === 'image') {
          pages.push([part, storyParts[i + 1]]);
          i += 2;
        } else {
          pages.push([part]);
          i += 1;
        }
      } else {
        // Standalone image page
        pages.push([part]);
        i += 1;
      }
    }
    return pages;
  })();

  const totalPages = storyPages.length;
  const safeCurrentPage = Math.min(currentPage, Math.max(0, totalPages - 1));

  // Auto-advance to latest page while generating
  useEffect(() => {
    if (isGenerating && totalPages > 0) {
      setCurrentPage(totalPages - 1);
    }
  }, [totalPages, isGenerating]);

  // Keyboard navigation for pages
  useEffect(() => {
    if (totalPages === 0) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setCurrentPage(p => Math.min(p + 1, totalPages - 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCurrentPage(p => Math.max(p - 1, 0));
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [totalPages]);

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
  const [agentActivity, setAgentActivity] = useState<string[]>([]);

  // --- Live Mode State ---
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [isLiveConnecting, setIsLiveConnecting] = useState(false);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState<Array<{ role: string; text: string; image?: string }>>([]);
  const [liveToolStatus, setLiveToolStatus] = useState('');
  const liveClientRef = useRef<ReturnType<typeof createLiveClient> | null>(null);
  const liveTranscriptEndRef = useRef<HTMLDivElement>(null);

  const addAgentActivity = (msg: string) => {
    setAgentActivity(prev => [...prev.slice(-4), msg]);
  };

  // --- Live Mode Functions ---
  const startLiveMode = async () => {
    const adkUrl = getADKServerURL();
    if (!adkUrl) {
      showToast('ADK server not available for Live Mode', 'error');
      return;
    }

    setIsLiveConnecting(true);
    setLiveTranscript([]);
    setLiveToolStatus('');

    const callbacks: LiveCallbacks = {
      onConnected: () => {
        setIsLiveConnecting(false);
        setIsLiveConnected(true);
        setLiveTranscript(prev => [...prev, { role: 'system', text: 'Connected to OmniWeave Live. Start speaking to create your story...' }]);
      },
      onText: (text) => {
        setLiveTranscript(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && !last.image) {
            return [...prev.slice(0, -1), { ...last, text: last.text + text }];
          }
          return [...prev, { role: 'assistant', text }];
        });
        setLiveToolStatus('');
      },
      onAudio: () => { /* Audio playback handled by liveClient internally */ },
      onImage: (dataUri) => {
        setLiveTranscript(prev => [...prev, { role: 'image', text: '', image: dataUri }]);
        setLiveToolStatus('');
      },
      onToolCall: (toolName, message) => {
        setLiveToolStatus(`${toolName}: ${message}`);
      },
      onTurnComplete: () => {
        setLiveToolStatus('');
      },
      onError: (message) => {
        setLiveTranscript(prev => [...prev, { role: 'error', text: message }]);
        setLiveToolStatus('');
      },
      onDisconnected: () => {
        setIsLiveConnected(false);
        setIsLiveConnecting(false);
        setLiveTranscript(prev => [...prev, { role: 'system', text: 'Disconnected from Live session.' }]);
      },
    };

    try {
      const client = createLiveClient(adkUrl, callbacks);
      liveClientRef.current = client;
      await client.start();
      setIsLiveMode(true);
    } catch (err: any) {
      setIsLiveConnecting(false);
      showToast(err.message || 'Failed to start Live Mode', 'error');
    }
  };

  const stopLiveMode = () => {
    liveClientRef.current?.stop();
    liveClientRef.current = null;
    setIsLiveMode(false);
    setIsLiveConnected(false);
    setIsLiveConnecting(false);
    setIsMuted(false);
  };

  const toggleMute = () => {
    if (liveClientRef.current) {
      const muted = liveClientRef.current.toggleMute();
      setIsMuted(muted);
    }
  };

  const sendLiveText = (text: string) => {
    if (liveClientRef.current && text.trim()) {
      liveClientRef.current.sendText(text.trim());
      setLiveTranscript(prev => [...prev, { role: 'user', text: text.trim() }]);
    }
  };

  // Auto-scroll live transcript
  useEffect(() => {
    liveTranscriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [liveTranscript]);

  // --- Story Progress Bar ---
  const [scrollProgress, setScrollProgress] = useState(0);
  const showProgress = storyParts.length > 0 && !showLibrary;

  useEffect(() => {
    if (!showProgress) return;
    const onScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(docHeight > 0 ? Math.min(1, scrollTop / docHeight) : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [showProgress]);

  // --- Scroll-triggered Nav ---
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const onScroll = () => {
      if (navRef.current) {
        navRef.current.classList.toggle('scrolled', window.scrollY > 40);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // --- Pipeline Observer (IntersectionObserver) ---
  const pipelineRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = pipelineRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.querySelectorAll('.pipeline-step').forEach(step => step.classList.add('visible'));
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [storyParts.length, showLibrary]);

  useEffect(() => {
    (async () => {
      const result = await checkADKServer();
      setAdkAvailable(result.available);
      if (result.available) {
        console.log('🧵 ADK Agent Server connected:', getADKServerURL());
        console.log('   Agent:', result.agentInfo?.rootAgent?.name);
      }
    })();
  }, []);

  useEffect(() => {
    const fetchSimilar = async () => {
      if (!embedding || !user) {
        setSimilarStories([]);
        return;
      }
      try {
        const q = query(
          collection(db, 'stories'),
          where('authorId', '==', user.uid),
        );
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
  }, [embedding, prompt, user]);

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
      const q = query(collection(db, 'stories'), where('authorId', '==', user.uid));
      const querySnapshot = await getDocs(q);
      const stories = querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
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

      console.log('Saving story:', { fields: Object.keys(storyData), partsLen: storyData.parts.length, hasReview: !!storyData.review, hasEmbedding: !!storyData.embedding, embeddingLen: storyData.embedding?.length });
      const storyRef = await addDoc(collection(db, 'stories'), storyData);

      showToast("Story saved to your library!");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'stories');
      showToast("Save failed — check console for details");
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
      const parsedParts = JSON.parse(story.parts);
      setStoryParts(parsedParts);
      setCurrentPage(0);
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

  const regenerateImage = async (id: string, imagePrompt: string): Promise<string | undefined> => {
    setStoryParts(parts => parts.map(p => p.id === id ? { ...p, isLoading: true, error: undefined } : p));

    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (adkAvailable) {
          if (attempt === 0) addAgentActivity(`generate_image → ${imagePrompt.substring(0, 40)}...`);
          const result = await generateImageViaADK(imagePrompt);
          if (result.status === 'success' && result.imageDataUri) {
            setStoryParts(parts => parts.map(p => p.id === id ? { ...p, url: result.imageDataUri!, isLoading: false } : p));
            addAgentActivity(`✓ Image generated via Cloud Run`);
            return result.imageDataUri;
          }
          if (attempt < maxRetries - 1) {
            addAgentActivity(`⟳ Image retry ${attempt + 2}/${maxRetries}...`);
            await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
            continue;
          }
          console.warn('ADK server image gen failed after retries:', result.error);
        }

        const apiKey = getApiKey();
        if (!apiKey) {
          setStoryParts(parts => parts.map(p => p.id === id ? { ...p, isLoading: false, error: 'Image generation failed — click Try Again' } : p));
          return undefined;
        }
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
          return url;
        }
        if (attempt < maxRetries - 1) { await new Promise(r => setTimeout(r, 1500 * (attempt + 1))); continue; }
        setStoryParts(parts => parts.map(p => p.id === id ? { ...p, isLoading: false, error: 'Image generation failed — click Try Again' } : p));
      } catch (err: any) {
        if (attempt < maxRetries - 1 && (err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED') || err.message?.includes('500'))) {
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        console.error("Image generation error:", err);
        setStoryParts(parts => parts.map(p => p.id === id ? { ...p, isLoading: false, error: 'Image generation failed — click Try Again' } : p));
      }
    }

    return undefined;
  };

  const generateStory = async () => {
    if (!prompt.trim()) return;
    
    setIsGenerating(true);
    setError('');
    setStoryParts([]);
    setCurrentPage(0);
    setEmbedding(null);
    setIsAutoPlaying(false);
    setCurrentPlayIndex(-1);
    setAgentActivity([]);
    
    if (activeAudio) { activeAudio.pause(); setActiveAudio(null); }

    try {
      const streamState = createStoryStreamState();
      const pendingImageParts: { id: string; prompt: string }[] = [];

      const syncStoryParts = (newParts: StoryPart[]) => {
        if (streamState.parts.length > 0) {
          setStoryParts([...streamState.parts] as StoryPart[]);
        }

        newParts.forEach((part) => {
          if (part.type === 'image' && part.prompt) {
            pendingImageParts.push({ id: part.id, prompt: part.prompt });
          }
        });
      };

      const applyStoryText = (text: string) => {
        if (!text) return;
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
        addAgentActivity('StoryPipeline → ADK session started');

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
            addAgentActivity(`${event.author} → ${phaseLabel}`);
          }

          event.toolCalls?.forEach((toolCall) => {
            addAgentActivity(`${toolCall.name} → requested by ADK`);
          });

          event.toolResponses?.forEach((toolResponse) => {
            addAgentActivity(`✓ ${toolResponse.name} completed`);
          });

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
        });

        if (adkError) {
          throw new Error(adkError);
        }
      } else {
        const apiKey = getApiKey();
        if (!apiKey) throw new Error("API Key is missing. Set VITE_GEMINI_API_KEY or connect the ADK server.");

        const ai = new GoogleGenAI({ apiKey: apiKey as string });
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

        for await (const chunk of responseStream) {
          if (chunk.text) {
            applyStoryText(chunk.text);
          }
        }
      }

      finalizeStoryText();

      if (streamState.parts.length === 0) throw new Error("No content generated.");

      // Generate images 2 at a time to balance speed vs rate limits
      for (let i = 0; i < pendingImageParts.length; i += 2) {
        const batch = pendingImageParts.slice(i, i + 2);
        await Promise.allSettled(batch.map(img => regenerateImage(img.id, img.prompt)));
      }

      try {
        const firstImagePart = streamState.parts.find(p => p.type === 'image') as { type: 'image', url: string, prompt?: string } | undefined;
        
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
          const apiKey = getApiKey();
          if (!apiKey) throw new Error("API Key is missing. Set VITE_GEMINI_API_KEY or connect the ADK server.");
          const ai = new GoogleGenAI({ apiKey: apiKey as string });
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
          const currentParts = storyPartsRef.current;
          const nextTextPartIndex = currentParts.findIndex((p, idx) => idx > autoNextIndex && p.type === 'text');
          if (nextTextPartIndex !== -1) {
            const nextPart = currentParts[nextTextPartIndex];
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
          const currentParts = storyPartsRef.current;
          const nextTextPartIndex = currentParts.findIndex((p, idx) => idx > autoNextIndex && p.type === 'text');
          if (nextTextPartIndex !== -1) { const nextPart = currentParts[nextTextPartIndex]; if (nextPart.type === 'text') { setCurrentPlayIndex(nextTextPartIndex); playAudio(nextPart.id, nextPart.text, nextTextPartIndex); } }
          else { setIsAutoPlaying(false); setCurrentPlayIndex(-1); }
        }
      });
      streamer.init();
      setActiveAudio(streamer);
      setStoryParts(parts => parts.map(p => p.id === partId ? { ...p, isLoadingAudio: false, isPlaying: true } : p));

      let fullBinary = '';
      let usedBackendTTS = false;

      try {
        if (adkAvailable) {
          usedBackendTTS = true;
          const adkUrl = getADKServerURL();
          for (const chunk of apiChunks) {
            if (!streamer.isPlaying) break;
            const speakers = chunk.speakers.map(s => ({ name: s, voice: currentVoiceMap[s] || 'Zephyr' }));
            // For single-speaker, strip labels so TTS doesn't read "Narrator:" aloud
            const cleanedText = chunk.speakers.length <= 1
              ? chunk.text.replace(/^\s*(?:\*\*|\*)?[A-Z][a-zA-Z0-9_ ]+(?:\*\*|\*)?:\s*/gm, '')
              : chunk.text;
            const ttsPrompt = chunk.speakers.length > 1
              ? `Read this conversation aloud. Use VERY DISTINCT voices for each character — different pitch, accent, pacing, and energy. ${chunk.speakers.join(' and ')} should each sound like a completely different person. Perform it dramatically like a voice actor:\n\n${cleanedText}`
              : cleanedText;
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
            while (true) {
              const { done: streamDone, value } = await reader.read();
              if (streamDone) break;
              sseBuffer += decoder.decode(value, { stream: true });
              const sseLines = sseBuffer.split('\n');
              sseBuffer = sseLines.pop() || '';
              for (const sseLine of sseLines) {
                if (!sseLine.startsWith('data: ')) continue;
                try {
                  const evt = JSON.parse(sseLine.slice(6));
                  if (evt.done) break;
                  if (evt.error) throw new Error(evt.error);
                  if (evt.audio) { streamer.addChunk(evt.audio); fullBinary += atob(evt.audio); }
                } catch (e) { if (!(e instanceof SyntaxError)) throw e; }
              }
            }
          }
        }

        if (!usedBackendTTS) {
        const apiKey = getApiKey();
        if (!apiKey) throw new Error("Narration requires VITE_GEMINI_API_KEY or an ADK server connection.");
        const ai = new GoogleGenAI({ apiKey: apiKey as string });
        const streamPromises = apiChunks.map(chunk => {
          const speakerVoiceConfigs = chunk.speakers.map(speaker => ({
            speaker, voiceConfig: { prebuiltVoiceConfig: { voiceName: currentVoiceMap[speaker] || 'Zephyr' } }
          }));
          let speechConfig: any = {};
          if (speakerVoiceConfigs.length === 1) speechConfig = { voiceConfig: speakerVoiceConfigs[0].voiceConfig };
          else if (speakerVoiceConfigs.length >= 2) speechConfig = { multiSpeakerVoiceConfig: { speakerVoiceConfigs: speakerVoiceConfigs.slice(0, 2) } };
          const cleanedText = chunk.speakers.length <= 1
            ? chunk.text.replace(/^\s*(?:\*\*|\*)?[A-Z][a-zA-Z0-9_ ]+(?:\*\*|\*)?:\s*/gm, '')
            : chunk.text;
          const ttsPrompt = chunk.speakers.length > 1
            ? `Read this conversation aloud. Use VERY DISTINCT voices for each character — different pitch, accent, pacing, and energy. ${chunk.speakers.join(' and ')} should each sound like a completely different person. Perform it dramatically like a voice actor:\n\n${cleanedText}`
            : cleanedText;
          return ai.models.generateContentStream({
            model: "gemini-2.5-pro-preview-tts",
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
        }

        streamer.markFinished();
        
        if (fullBinary && streamer.isPlaying) {
          const fullBase64 = btoa(fullBinary);
          const wavUrl = createWavFile(fullBase64, 24000);
          setStoryParts(parts => parts.map(p => p.id === partId ? { ...p, audioUrl: wavUrl, audioBase64: fullBase64 } : p));
        }
        if (adkAvailable) addAgentActivity('✓ TTS narration complete');
      } catch (err) {
        console.error("Stream error:", err);
        streamer.stop();
        throw err;
      }
    } catch (err) {
      console.error("TTS Error:", err);
      if (err instanceof Error) {
        showToast(err.message, 'error');
      }
      setIsAutoPlaying(false);
      setStoryParts(parts => parts.map(p => p.id === partId ? { ...p, isLoadingAudio: false } : p));
    }
  };

  const startBackgroundMusic = async () => {
    if (!musicEnabled) return;
    try {
      const storyText = storyParts.filter(p => p.type === 'text').map(p => (p as any).text).join('\n');
      const moodPrompt = extractMoodPrompt(storyText);
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 48000 });
      const gainNode = audioCtx.createGain();
      // Low volume so music doesn't compete with voice narration
      gainNode.gain.value = 0.08;
      gainNode.connect(audioCtx.destination);

      // Track next start time to prevent overlapping buffers (gapless scheduling)
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
        // Route through backend — no browser API key needed
        const adkUrl = getADKServerURL();
        const musicAbort = new AbortController();
        const musicTimeout = setTimeout(() => musicAbort.abort(), 20000);
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
          return;
        }
        clearTimeout(musicTimeout);
        if (!res.ok || !res.body) {
          console.warn('Background music not available on this deployment');
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';
        const abortController = new AbortController();

        // Read SSE stream in background
        const readStream = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              sseBuffer += decoder.decode(value, { stream: true });
              const lines = sseBuffer.split('\n');
              sseBuffer = lines.pop() || '';
              for (const line of lines) {
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
        readStream();
        setMusicSession({ reader, abort: () => reader.cancel() });
        addAgentActivity('lyria-realtime → Background music streaming');
      } else {
        // Direct browser connection (requires API key)
        const apiKey = getApiKey();
        if (!apiKey) { showToast('Background music requires an ADK server or API key', 'error'); return; }
        const ai = new GoogleGenAI({ apiKey: apiKey as string, httpOptions: { apiVersion: 'v1alpha' } } as any);
        const session = await ai.live.music.connect({
          model: 'models/lyria-realtime-exp',
          callbacks: {
            onmessage: (msg: any) => {
              const chunk = msg.audioChunk;
              if (chunk?.data) playMusicChunk(chunk.data);
            },
          },
        });
        await session.setWeightedPrompts({ weightedPrompts: [{ text: moodPrompt, weight: 1.0 }] } as any);
        await (session as any).setMusicGenerationConfig({ musicGenerationConfig: { musicGenerationMode: 'QUALITY' } });
        (session as any).play();
        setMusicSession(session);
      }
    } catch (err) {
      console.warn('Lyria RealTime not available:', err);
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
    <div className="min-h-screen relative overflow-x-hidden" style={{ background: 'var(--frame-base)', color: 'var(--frame-text)' }}>

      {/* Story Progress Bar */}
      {showProgress && (
        <div className="story-progress" style={{ width: `${scrollProgress * 100}%` }} />
      )}

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`toast ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>
            {toast.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation — editorial, minimal */}
      <header ref={navRef} className="floating-nav">
        <a href="#" className="nav-brand">Omni<span>Weave</span></a>
        <div className="nav-links">
          <button onClick={loadLibrary} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Library className="w-3 h-3" /> Library
          </button>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.6rem', padding: '4px 10px',
            borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '6px',
            background: adkAvailable ? 'rgba(76,175,80,0.12)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${adkAvailable ? 'rgba(76,175,80,0.25)' : 'var(--frame-ghost)'}`,
            color: adkAvailable ? '#81c784' : 'var(--frame-dim)'
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: adkAvailable ? '#81c784' : 'var(--frame-dim)' }}></span>
            {adkAvailable ? '8 Models Active' : 'Direct Mode'}
          </div>
        </div>
      </header>

      <main className="pt-24 pb-32 px-4 md:px-6">
        {showLibrary ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ maxWidth: 1000, margin: '48px auto 0', padding: '0 clamp(24px, 4vw, 40px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 48 }}>
              <h2 className="section-title">Your <em style={{ fontStyle: 'italic', color: 'var(--vermillion)' }}>Library</em></h2>
              <button onClick={() => setShowLibrary(false)} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><ArrowRight className="w-4 h-4" /></span> Back</button>
            </div>
            {isLoadingStory ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '96px 0', gap: 16 }}>
                <div className="generating-dot" style={{ width: 12, height: 12 }}></div>
                <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--frame-dim)' }}>Retrieving story...</p>
              </div>
            ) : savedStories.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '96px 0', fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '1.1rem', color: 'var(--frame-dim)' }}>No stories yet. Create your first one.</div>
            ) : (
              <div className="library-grid">
                {savedStories.map((story) => (
                  <motion.div key={story.id} whileHover={{ y: -4 }} className="library-card" onClick={() => loadStory(story)}>
                    <div className="library-card-title">{story.title}</div>
                    <div className="library-card-meta">{new Date(story.createdAt?.seconds * 1000).toLocaleDateString()}</div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <>
            {/* HERO — cinematic title card */}
            <AnimatePresence>
              {storyParts.length === 0 && !isGenerating && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -40, filter: 'blur(20px)' }} transition={{ duration: 0.6 }}
                  className="hero-section">
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                    className="hero-overline">AI Cinematic Engine</motion.div>

                  <motion.h2 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    className="hero-title">
                    Every frame,<br/><em>composed.</em>
                  </motion.h2>

                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                    className="hero-subtitle">
                    Eight models orchestrated through two streaming protocols — live voice interaction, writing scripts, directing illustrations, casting voices, scoring scenes, and mapping narrative DNA.
                  </motion.p>

                  <motion.hr initial={{ width: 0 }} animate={{ width: 48 }} transition={{ delay: 0.6 }}
                    className="hero-rule" />

                  {/* Prompt Area — director's slate */}
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
                    className="prompt-area" style={{ width: '100%', maxWidth: 720 }}>
                    <div className="prompt-wrapper">
                      <div className="prompt-label">Scene Prompt</div>
                      <textarea id="prompt-input" value={prompt} onChange={(e) => setPrompt(e.target.value)}
                        className="prompt-textarea"
                        placeholder="A lonely lighthouse keeper discovers messages in bottles from the future..."
                        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generateStory(); }}
                      />
                      <div className="prompt-actions">
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--frame-dim)', letterSpacing: '0.06em' }}>Ctrl+Enter</span>
                        <div style={{ display: 'flex', gap: 10 }}>
                          {adkAvailable && (
                            <button onClick={startLiveMode} disabled={isLiveConnecting}
                              className="btn-live" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              {isLiveConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><span className="live-dot" /><LiveIcon className="w-3.5 h-3.5" /></>}
                              Live
                            </button>
                          )}
                          <button id="generate-btn" onClick={generateStory} disabled={!prompt.trim() || isGenerating}
                            className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            Compose <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {adkAvailable && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, gap: 24 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--frame-dim)', letterSpacing: '0.06em' }}>
                            LIVE — speak &amp; interact in real time
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--frame-dim)', letterSpacing: '0.06em' }}>
                            COMPOSE — full production pipeline
                          </span>
                        </div>
                      )}
                    </div>
                  </motion.div>

                  {/* Prompt Suggestions */}
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
                    style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 24, justifyContent: 'center', position: 'relative', zIndex: 1 }}>
                    {PROMPT_SUGGESTIONS.map((s) => (
                      <button key={s.label} onClick={() => setPrompt(s.prompt)}
                        className="btn-secondary" style={{ fontSize: '0.7rem', padding: '8px 16px' }}>
                        {s.label}
                      </button>
                    ))}
                  </motion.div>

                  {/* Pipeline — horizontal film strip with sprocket holes */}
                  <motion.div ref={pipelineRef} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1 }}
                    className="pipeline-container" style={{ marginTop: 64, width: '100%', maxWidth: 780 }}>
                    <div className="sprocket-row">
                      {PIPELINE_STEPS.map((step) => (
                        <div key={`top-${step.label}`} className="sprocket-hole" />
                      ))}
                    </div>
                    <div className="film-strip">
                      {PIPELINE_STEPS.map((step) => (
                        <div key={step.label} className="pipeline-step visible">
                          <div className="pipeline-step-label">{step.label}</div>
                          <div className="pipeline-step-model">{step.model}</div>
                          <div className="pipeline-step-desc">{step.desc}</div>
                        </div>
                      ))}
                    </div>
                    <div className="sprocket-row">
                      {PIPELINE_STEPS.map((step) => (
                        <div key={`bot-${step.label}`} className="sprocket-hole" />
                      ))}
                    </div>
                  </motion.div>

                  {error && (
                    <div className="error-banner" style={{ marginTop: 32 }}>
                      <span style={{ display: 'inline-flex', marginRight: 8, verticalAlign: 'middle' }}><AlertCircle className="w-4 h-4" /></span>{error}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Live Mode Panel */}
            <AnimatePresence>
              {isLiveMode && (
                <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
                  className="live-panel">
                  {/* Live Mode Header */}
                  <div className="live-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div className={isLiveConnected ? 'on-air-indicator' : ''} style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: isLiveConnected ? 'var(--vermillion)' : 'var(--frame-dim)',
                      }} />
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 400, letterSpacing: '-0.01em', color: 'var(--frame-text)' }}>
                        {isLiveConnected ? 'ON AIR' : 'Live Session'}
                      </span>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: '0.55rem', padding: '2px 8px',
                        background: 'var(--vermillion-dim)', border: '1px solid rgba(194,59,34,0.2)',
                        borderRadius: 'var(--radius-sm)', color: 'var(--vermillion)', letterSpacing: '0.08em',
                      }}>
                        BIDI-STREAMING
                      </span>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: '0.5rem', padding: '2px 8px',
                        background: 'var(--brass-dim)', border: '1px solid rgba(196,163,90,0.15)',
                        borderRadius: 'var(--radius-sm)', color: 'var(--brass)', letterSpacing: '0.06em',
                      }}>
                        gemini-live-2.5-flash
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button onClick={toggleMute}
                        className="btn-icon" style={{
                          width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          ...(isMuted ? { background: 'var(--vermillion-dim)', borderColor: 'rgba(194,59,34,0.3)' } : {}),
                        }}>
                        {isMuted ? <MicOffIcon className="w-4 h-4" /> : <MicrophoneIcon className="w-4 h-4" />}
                      </button>
                      <button onClick={stopLiveMode}
                        className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem' }}>
                        <Square className="w-3 h-3" /> End
                      </button>
                    </div>
                  </div>

                  {/* Audio Waveform Indicator */}
                  {isLiveConnected && !isMuted && (
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                      height: 32, marginBottom: 16,
                    }}>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                        <motion.div key={i}
                          animate={{ height: ['3px', `${8 + Math.random() * 16}px`, '3px'] }}
                          transition={{ repeat: Infinity, duration: 0.6 + Math.random() * 0.4, delay: i * 0.08 }}
                          style={{
                            width: 3, borderRadius: 2,
                            background: 'var(--vermillion)',
                            opacity: 0.6 + Math.random() * 0.4,
                          }}
                        />
                      ))}
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--frame-dim)',
                        marginLeft: 12, letterSpacing: '0.08em',
                      }}>
                        LISTENING
                      </span>
                    </div>
                  )}

                  {/* Transcript — light canvas inset */}
                  <div className="live-transcript-inset">
                    {liveTranscript.length === 0 && (
                      <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        height: 200, gap: 16, color: 'var(--canvas-dim)',
                      }}>
                        <MicrophoneIcon className="w-8 h-8" />
                        <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '0.95rem' }}>
                          Speak to begin your story...
                        </p>
                      </div>
                    )}

                    {liveTranscript.map((entry, i) => (
                      <div key={i} style={{
                        marginBottom: 16,
                        ...(entry.role === 'system' ? { textAlign: 'center' } : {}),
                        ...(entry.role === 'error' ? { color: '#ef4444' } : {}),
                      }}>
                        {entry.role === 'system' ? (
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--canvas-dim)',
                            letterSpacing: '0.06em', textTransform: 'uppercase',
                          }}>
                            {entry.text}
                          </span>
                        ) : entry.role === 'image' && entry.image ? (
                          <div className="image-frame" style={{ margin: '8px 0' }}>
                            <img src={entry.image} alt="" style={{ width: '100%', borderRadius: 'var(--radius-md)' }} />
                          </div>
                        ) : entry.role === 'error' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem' }}>
                            <AlertCircle className="w-3.5 h-3.5" /> {entry.text}
                          </div>
                        ) : (
                          <div>
                            <span style={{
                              fontFamily: 'var(--font-mono)', fontSize: '0.55rem',
                              color: entry.role === 'user' ? 'var(--brass)' : 'var(--vermillion)',
                              letterSpacing: '0.08em', textTransform: 'uppercase',
                              marginBottom: 4, display: 'block',
                            }}>
                              {entry.role === 'user' ? 'You' : 'OmniWeave'}
                            </span>
                            <div style={{
                              fontSize: '0.9rem', lineHeight: 1.7,
                              fontFamily: entry.role === 'user' ? 'var(--font-body)' : 'var(--font-display)',
                              color: 'var(--canvas-body)',
                            }}>
                              <ReactMarkdown>{entry.text}</ReactMarkdown>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {liveToolStatus && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 12px', background: 'var(--vermillion-dim)',
                        borderRadius: 'var(--radius-sm)', fontSize: '0.7rem',
                        fontFamily: 'var(--font-mono)', color: 'var(--vermillion)',
                      }}>
                        <Loader2 className="w-3 h-3 animate-spin" /> {liveToolStatus}
                      </div>
                    )}
                    <div ref={liveTranscriptEndRef} />
                  </div>

                  {/* Text Input Fallback */}
                  <div style={{
                    display: 'flex', gap: 8, marginTop: 16,
                  }}>
                    <input
                      type="text"
                      placeholder="Type a message (or just speak)..."
                      style={{
                        flex: 1, background: 'var(--frame-surface)', border: '1px solid var(--frame-ghost)',
                        borderRadius: 'var(--radius-md)', padding: '10px 16px', color: 'var(--frame-text)',
                        fontSize: '0.85rem', fontFamily: 'var(--font-body)', outline: 'none',
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                          sendLiveText(e.currentTarget.value);
                          e.currentTarget.value = '';
                        }
                      }}
                    />
                    <button onClick={(e) => {
                      const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                      if (input.value.trim()) {
                        sendLiveText(input.value);
                        input.value = '';
                      }
                    }}
                      className="btn-primary" style={{ padding: '10px 20px', fontSize: '0.8rem' }}>
                      Send
                    </button>
                  </div>

                  {/* Save Live Session */}
                  {liveTranscript.filter(e => e.role === 'assistant' || e.role === 'image').length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
                      <button onClick={() => {
                        // Convert live transcript to story parts
                        const parts: StoryPart[] = liveTranscript
                          .filter(e => e.role === 'assistant' || e.role === 'image')
                          .map((e, i) => {
                            if (e.role === 'image' && e.image) {
                              return { type: 'image' as const, url: e.image, id: `live-img-${i}` };
                            }
                            return { type: 'text' as const, text: e.text, id: `live-text-${i}` };
                          });
                        // Use first user message as title, or fallback
                        const firstUserMsg = liveTranscript.find(e => e.role === 'user');
                        const title = firstUserMsg?.text?.substring(0, 80) || 'Live Story Session';
                        setPrompt(title);
                        setStoryParts(parts);
                        stopLiveMode();
                        showToast('Live session saved — click Save to store in library');
                      }}
                        className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem' }}>
                        <Save className="w-3.5 h-3.5" /> Save as Story
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Loading State */}
            <AnimatePresence>
              {isGenerating && storyParts.length === 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="story-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh' }}>
                  <div style={{ position: 'relative', width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 40 }}>
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
                      style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(194,59,34,0.2)', borderTopColor: 'var(--vermillion)' }} />
                    <motion.div animate={{ rotate: -360 }} transition={{ repeat: Infinity, duration: 5, ease: 'linear' }}
                      style={{ position: 'absolute', inset: 10, borderRadius: '50%', border: '1px solid var(--brass-dim)', borderBottomColor: 'var(--brass)' }} />
                    <div className="generating-dot" />
                  </div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 300, color: 'var(--frame-text)', marginBottom: 8 }}>Composing your story</h3>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--frame-dim)', letterSpacing: '0.08em' }}>StoryWriter &rarr; StoryReviewer &rarr; Illustrations</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Agent Activity */}
            {adkAvailable && agentActivity.length > 0 && (isGenerating || storyParts.length > 0) && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                className="agent-activity" style={{ maxWidth: 720, margin: '0 auto 24px' }}>
                <div className="activity-line" style={{ marginBottom: 4 }}>
                  <span className="activity-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="on-air-indicator" style={{ width: 5, height: 5 }}></span>
                    Agent Pipeline
                  </span>
                </div>
                {agentActivity.slice(-6).map((msg, i) => (
                  <div key={i} className="activity-line" style={{ paddingLeft: 12 }}>{msg}</div>
                ))}
              </motion.div>
            )}

            {/* Story Controls */}
            {storyParts.length > 0 && !isGenerating && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="story-controls">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={downloadAsBook} className="btn-icon" style={{ width: 'auto', padding: '8px 14px', gap: 6, display: 'flex', alignItems: 'center', fontSize: '0.7rem' }}>
                    <BookOpen className="w-3.5 h-3.5" /> Export
                  </button>
                  <button onClick={exportAudiobook} className="btn-icon" style={{ width: 'auto', padding: '8px 14px', gap: 6, display: 'flex', alignItems: 'center', fontSize: '0.7rem' }}>
                    <Download className="w-3.5 h-3.5" /> Audiobook
                  </button>
                  <button onClick={saveToLibrary} disabled={isSaving} className="btn-icon" style={{ width: 'auto', padding: '8px 14px', gap: 6, display: 'flex', alignItems: 'center', fontSize: '0.7rem' }}>
                    {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
                  </button>
                  <button onClick={() => setMusicEnabled(e => !e)}
                    className="btn-icon" style={{
                      width: 'auto', padding: '8px 14px', gap: 6, display: 'flex', alignItems: 'center', fontSize: '0.7rem',
                      ...(musicEnabled ? { background: 'var(--vermillion-dim)', borderColor: 'rgba(194,59,34,0.2)', color: 'var(--vermillion)' } : {})
                    }}>
                    <MusicIcon className="w-3.5 h-3.5" /> {musicEnabled ? 'On' : 'Music'}
                  </button>
                </div>
                <button id="autoplay-btn" onClick={isAutoPlaying ? stopAutoPlay : startAutoPlay}
                  className={isAutoPlaying ? 'btn-secondary' : 'btn-primary'}
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isAutoPlaying ? (<><Square className="w-4 h-4 fill-current" /> Stop</>) : (<><Play className="w-4 h-4 fill-current" /> Play Full Story</>)}
                </button>
              </motion.div>
            )}

            {/* Story Content — book-style paginated view */}
            {storyParts.length > 0 && totalPages > 0 && (
            <div className="story-container">
              <div className="story-book">
                {/* Page navigation arrows */}
                <button className="page-nav page-nav-prev" onClick={() => setCurrentPage(p => Math.max(p - 1, 0))} disabled={safeCurrentPage === 0} aria-label="Previous page">
                  <ChevronLeftIcon className="w-5 h-5" />
                </button>
                <button className="page-nav page-nav-next" onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages - 1))} disabled={safeCurrentPage >= totalPages - 1} aria-label="Next page">
                  <ChevronRightIcon className="w-5 h-5" />
                </button>

                {/* The page itself */}
                <AnimatePresence mode="wait">
                <motion.div key={safeCurrentPage} className="story-page"
                  initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -60 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>

                  {storyPages[safeCurrentPage]?.map((part, pidx) => {
                    const globalIdx = storyParts.indexOf(part);
                    const imageIndex = part.type === 'image' ? storyParts.slice(0, globalIdx + 1).filter(p => p.type === 'image').length : 0;
                    return (
                      <div key={part.id}>
                        {part.type === 'image' ? (
                          <div className="image-frame image-letterbox" style={{ margin: pidx === 0 ? '0 -16px 1.5em' : '1.5em -16px 0' }}>
                            {part.isLoading ? (
                              <div className="image-loading"><span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: 'var(--canvas-dim)', display: 'inline-flex' }}><Loader2 className="w-6 h-6 animate-spin" /></span></div>
                            ) : part.error ? (
                              <div className="error-banner" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 32 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}><AlertCircle className="w-4 h-4" />{part.error}</div>
                                {part.prompt && (<button onClick={() => regenerateImage(part.id, part.prompt!)} className="btn-secondary" style={{ fontSize: '0.7rem' }}>Retry</button>)}
                              </div>
                            ) : !part.url ? (
                              <div style={{ aspectRatio: '16/9', background: 'var(--canvas-surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
                                <p style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', fontStyle: 'italic', color: 'var(--canvas-dim)', maxWidth: 400, textAlign: 'center' }}>"{part.prompt}"</p>
                                <button onClick={() => regenerateImage(part.id, part.prompt!)} className="btn-primary" style={{ fontSize: '0.7rem' }}>Generate</button>
                              </div>
                            ) : (
                              <>
                                <img src={part.url} alt="" className={`kenburns-${(globalIdx % 4) + 1}`} referrerPolicy="no-referrer" />
                                <div className="frame-number">FRM {String(imageIndex).padStart(3, '0')}</div>
                              </>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div className="story-text"><ReactMarkdown>{part.text}</ReactMarkdown></div>
                            <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                              <button id={`play-audio-${part.id}`} onClick={() => playAudio(part.id, part.text)} disabled={part.isLoadingAudio || isGenerating}
                                className={part.isPlaying ? 'btn-primary' : 'btn-icon'}
                                style={{ width: 'auto', padding: '8px 16px', gap: 8, display: 'flex', alignItems: 'center', fontSize: '0.7rem', borderRadius: 'var(--radius-md)' }}>
                                {part.isLoadingAudio ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : part.isPlaying ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                                {part.isLoadingAudio ? 'Generating...' : part.isPlaying ? 'Stop' : 'Listen'}
                              </button>
                              {part.isPlaying && (
                                <div className="waveform-container">
                                  {[1, 2, 3, 4, 5].map(i => (
                                    <motion.div key={i} animate={{ height: ['4px', '18px', '4px'] }}
                                      transition={{ repeat: Infinity, duration: 0.7, delay: i * 0.1 }}
                                      className="waveform-freq-bar" />
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Page number */}
                  <div className="page-number">{safeCurrentPage + 1} / {totalPages}</div>
                </motion.div>
                </AnimatePresence>

                {isGenerating && (
                  <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="generating-dot" />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--canvas-dim)' }}>Writing...</span>
                  </div>
                )}
              </div>

              {/* Page dots indicator */}
              {totalPages > 1 && (
                <div className="page-dots">
                  {storyPages.map((_, i) => (
                    <button key={i} className={`page-dot ${i === safeCurrentPage ? 'active' : ''}`}
                      onClick={() => setCurrentPage(i)} aria-label={`Go to page ${i + 1}`} />
                  ))}
                </div>
              )}
            </div>
            )}

            {/* Embedding Visualization */}
            {embedding && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                className="embedding-viz">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <span className="embedding-viz-title">Story Fingerprint</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--brass)' }}>{embedding.length}D embedding</span>
                </div>
                <div className="embedding-bars">
                  {embedding.slice(0, 128).map((val, i) => (
                    <div key={i} className="embedding-bar" style={{
                      backgroundColor: val > 0 ? 'var(--vermillion)' : 'var(--brass)',
                      height: `${Math.min(100, Math.abs(val) * 1500)}%`,
                      opacity: Math.min(0.8, Math.abs(val) * 15)
                    }} />
                  ))}
                </div>
              </motion.div>
            )}

            {/* Review & Save */}
            {storyParts.length > 0 && !isGenerating && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
                style={{ maxWidth: 720, margin: '64px auto 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32 }}>
                <div className="review-section" style={{ width: '100%' }}>
                  <div className="review-header">Your thoughts</div>
                  <textarea value={review} onChange={(e) => setReview(e.target.value)} placeholder="What did you think of this story?"
                    style={{
                      width: '100%', background: 'var(--frame-card)', border: '1px solid var(--frame-ghost)', borderRadius: 'var(--radius-md)',
                      padding: 16, color: 'var(--frame-text)', resize: 'none', minHeight: 80, fontSize: '0.85rem',
                      fontFamily: 'var(--font-body)', outline: 'none'
                    }}
                    maxLength={1000} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--frame-dim)' }}>{review.length}/1000</span>
                    <button onClick={saveToLibrary} disabled={isSaving}
                      className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem' }}>
                      {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
                    </button>
                  </div>
                </div>

                {similarStories.length > 0 && (
                  <div style={{ width: '100%' }}>
                    <div className="embedding-viz-title" style={{ marginBottom: 16 }}>Similar Stories</div>
                    <div className="library-grid" style={{ padding: 0 }}>
                      {similarStories.map((story, idx) => (
                        <motion.div key={story.id || idx} whileHover={{ y: -2 }} onClick={() => loadStory(story)}
                          className="library-card">
                          <div className="library-card-title" style={{ marginBottom: 6 }}>{story.title}</div>
                          <div className="library-card-meta" style={{ fontFamily: 'var(--font-mono)', color: 'var(--brass)', fontSize: '0.6rem' }}>{(story.similarity * 100).toFixed(0)}% match</div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                <button id="new-story-btn" onClick={() => { setStoryParts([]); setCurrentPage(0); setPrompt(''); setReview(''); setAgentActivity([]); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  New Story
                </button>
              </motion.div>
            )}
          </>
        )}
      </main>

      {/* Footer — minimal, editorial */}
      <footer>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 40, textAlign: 'left' }}>
          <div>
            <div className="embedding-viz-title" style={{ marginBottom: 12 }}>Architecture</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--frame-dim)', lineHeight: 2 }}>
              <div>OmniWeaveDirector <span style={{ color: 'var(--vermillion)' }}>root</span></div>
              <div style={{ paddingLeft: 12 }}>StoryPipeline <span style={{ color: 'var(--brass)', opacity: 0.5 }}>sequential</span></div>
              <div style={{ paddingLeft: 24 }}>StoryWriter</div>
              <div style={{ paddingLeft: 24 }}>StoryReviewer</div>
              <div style={{ paddingLeft: 12, opacity: 0.4 }}>4 FunctionTools</div>
            </div>
          </div>
          <div>
            <div className="embedding-viz-title" style={{ marginBottom: 12 }}>Models</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--frame-dim)', lineHeight: 2 }}>
              {['gemini-live-2.5-flash', 'gemini-3.1-pro', 'gemini-3-flash', 'gemini-3.1-flash-lite', 'gemini-3.1-flash-image', 'gemini-2.5-pro-tts', 'gemini-embedding-2', 'lyria-realtime'].map(m => (
                <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--vermillion)', opacity: 0.4 }} />{m}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="embedding-viz-title" style={{ marginBottom: 12 }}>Infrastructure</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--frame-dim)', lineHeight: 2 }}>
              {['Cloud Run', 'Firebase Hosting', 'Cloud Firestore', 'Firebase Auth', 'Artifact Registry', 'Cloud Build'].map(s => (
                <div key={s}>{s}</div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid var(--frame-ghost)', display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', fontFamily: 'var(--font-mono)', color: 'var(--frame-dim)' }}>
          <span>Google ADK for TypeScript + GenAI SDK</span>
          <span>Gemini Live Agent Challenge</span>
        </div>
      </footer>
    </div>
  );
}
