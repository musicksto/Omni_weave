import { useState, useEffect, useRef, useMemo, useActionState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckIcon as CheckCircle2, AlertIcon as AlertCircle, LibraryIcon as Library, BrainIcon } from './components/Icons';
import { auth, db } from './firebase';
import { signInAnonymously, signInWithPopup, signOut, GoogleAuthProvider, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import { checkADKServer, getADKServerURL } from './adkClient';
import { TOAST_DURATION } from './constants';

import type { StoryPart } from './types';
import { PROMPT_SUGGESTIONS, PIPELINE_STEPS } from './constants';

import { useLiveMode } from './hooks/useLiveMode';
import { useScrollEffects } from './hooks/useScrollEffects';
import { useStoryAudio } from './hooks/useStoryAudio';
import { useStoryGeneration } from './hooks/useStoryGeneration';
import { useStoryPersistence, saveStoryAction } from './hooks/useStoryPersistence';
import { useMemoryBank } from './hooks/useMemoryBank';

import HeroSection from './components/HeroSection';
import LiveModePanel from './components/LiveModePanel';
import StoryBook from './components/StoryBook';
import LibraryView from './components/LibraryView';
import Footer from './components/Footer';
import AgentActivityLog from './components/AgentActivityLog';
import MemoryBankPage from './components/MemoryBankPage';
import BackToHeroButton from './components/BackToHeroButton';
import PreloadScreen from './components/PreloadScreen';

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [storyParts, setStoryParts] = useState<StoryPart[]>([]);
  const [embedding, setEmbedding] = useState<number[] | null>(null);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [storyMode, setStoryMode] = useState<'image' | 'video'>('image');
  const [currentPage, setCurrentPage] = useState(0);

  const storyPartsRef = useRef<StoryPart[]>([]);
  useEffect(() => { storyPartsRef.current = storyParts; }, [storyParts]);

  const storyPages = useMemo(() => {
    const isEmptyText = (p: StoryPart) => {
      if (p.type !== 'text') return false;
      const cleaned = (p.text || '')
        .replace(/---CHARACTER SHEET---[\s\S]*?---END CHARACTER SHEET---/gi, '')
        .replace(/\[REVIEW:\s*(?:PASS|FIXED[^\]]*)\]/gi, '')
        .trim();
      return cleaned.length < 20;
    };
    const parts = storyParts.filter(p => !isEmptyText(p));
    const pages: StoryPart[][] = [];
    if (parts.length > 0) {
      pages.push([{ id: '__cover__', type: 'text', text: '__COVER__' } as StoryPart]);
    }
    let i = 0;
    while (i < parts.length) {
      const part = parts[i];
      const next = i + 1 < parts.length ? parts[i + 1] : null;
      if (part.type === 'text') {
        if (next && (next.type === 'image' || next.type === 'video')) {
          pages.push([part, next]);
          i += 2;
        } else {
          pages.push([part]);
          i += 1;
        }
      } else if (part.type === 'image' || part.type === 'video') {
        if (next && next.type === 'text') {
          pages.push([next, part]);
          i += 2;
        } else {
          pages.push([part]);
          i += 1;
        }
      } else {
        pages.push([part]);
        i += 1;
      }
    }
    return pages;
  }, [storyParts]);

  const totalPages = storyPages.length;
  const safeCurrentPage = Math.min(currentPage, Math.max(0, totalPages - 1));

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), TOAST_DURATION);
  };

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const [adkAvailable, setAdkAvailable] = useState(false);
  const [adkServerConfigured, setAdkServerConfigured] = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      showToast('Signed in with Google');
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        showToast(err.message || 'Sign-in failed', 'error');
      }
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      await signInAnonymously(auth);
      showToast('Signed out');
    } catch (err: any) {
      showToast(err.message || 'Sign-out failed', 'error');
    }
  };

  const {
    isLiveMode, isLiveConnecting, isLiveConnected, isMuted,
    liveTranscript, liveToolStatus, liveTranscriptEndRef,
    startLiveMode, stopLiveMode, toggleMute, sendLiveText,
  } = useLiveMode({ showToast });

  const addAgentActivityRef = useRef<(msg: string) => void>(() => {});

  const {
    activeAudio, setActiveAudio,
    isAutoPlaying, setIsAutoPlaying,
    currentPlayIndex, setCurrentPlayIndex,
    musicEnabled, setMusicEnabled,
    playAudio, startAutoPlay, stopAutoPlay, exportAudiobook,
  } = useStoryAudio({
    storyParts, storyPartsRef, setStoryParts,
    adkAvailable, addAgentActivity: (msg: string) => addAgentActivityRef.current(msg), showToast, prompt,
    onPartPlaying: (partId: string) => {
      const pageIdx = storyPages.findIndex(page => page.some(p => p.id === partId));
      if (pageIdx !== -1) setCurrentPage(pageIdx);
    },
  });

  const {
    isGenerating, preloadStage, preloadProgress, agentActivity, error,
    generateStory, regenerateImage, addAgentActivity,
  } = useStoryGeneration({
    showToast, adkAvailable, storyMode, prompt,
    userId: user?.uid,
    setStoryParts, setCurrentPage, setEmbedding,
    setIsAutoPlaying, setCurrentPlayIndex,
    activeAudio, setActiveAudio, startAutoPlay,
  });

  addAgentActivityRef.current = addAgentActivity;

  const {
    memoryGraph, isLoadingMemory, showMemoryBank, setShowMemoryBank,
    openMemoryBank, extractToMemoryBank,
  } = useMemoryBank({ user, setUser, setIsAuthReady, showToast });

  const {
    isLoadingStory, savedStories,
    showLibrary, setShowLibrary,
    loadLibrary, loadStory, deleteStory, downloadAsBook,
  } = useStoryPersistence({
    user, setUser, setIsAuthReady, showToast,
    storyParts, prompt, embedding, adkAvailable, regenerateImage,
    setStoryParts, setCurrentPage, setPrompt, setEmbedding,
    extractToMemoryBank,
  });

  const [saveState, saveAction, isSaving] = useActionState(saveStoryAction, null);

  useEffect(() => {
    if (saveState?.success) {
      showToast("Story saved with all media!");
      if (saveState.fullText && saveState.storyId && user && !user.isAnonymous) {
        void extractToMemoryBank(saveState.storyId, saveState.fullText);
      }
    } else if (saveState?.error) {
      showToast(saveState.error, 'error');
    }
  }, [saveState]);

  useEffect(() => {
    if (preloadStage === 'complete' && storyPartsRef.current.length > 0) {
      const isPublic = !user || user.isAnonymous;
      saveAction({ user, storyParts: storyPartsRef.current, prompt, embedding, isPublic });
    }
  }, [preloadStage]);

  const resetToHome = () => {
    stopAutoPlay();
    stopLiveMode();
    setStoryParts([]);
    setCurrentPage(0);
    setPrompt('');
    setShowLibrary(false);
    setShowMemoryBank(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const showProgress = storyParts.length > 0 && !showLibrary && !showMemoryBank;
  const { scrollProgress, navRef, pipelineRef } = useScrollEffects({
    showProgress,
    storyPartsLength: storyParts.length,
    showLibrary,
  });

  useEffect(() => {
    if (isGenerating && totalPages > 0) {
      setCurrentPage(totalPages - 1);
    }
  }, [totalPages, isGenerating]);

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

  useEffect(() => {
    const shouldLock = (storyParts.length > 0 && !isGenerating && !showLibrary && !showMemoryBank) || isLiveMode;
    document.body.style.overflow = shouldLock ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [storyParts.length, isGenerating, isLiveMode, showLibrary, showMemoryBank]);

  useEffect(() => {
    const serverUrl = getADKServerURL();
    if (serverUrl) setAdkServerConfigured(true);
    (async () => {
      const result = await checkADKServer();
      setAdkAvailable(result.available);
      if (result.available && result.agentInfo?.rootAgent?.name) {
        console.info(`[OmniWeave] ADK connected — ${result.agentInfo.rootAgent.name}`);
      }
    })();
  }, []);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (connError) {
        if (connError instanceof Error && connError.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        try { await signInAnonymously(auth); } catch (e) {
          console.error('Anonymous auth failed:', e);
          showToast('Authentication failed. Some features may not work.', 'error');
        }
        return;
      }
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="app-root">

      {showProgress && (
        <motion.div 
          className="story-progress" 
          animate={{ width: `${scrollProgress}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      )}

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`toast ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>
            {toast.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      <header ref={navRef} className="floating-nav">
        <a 
          href="/" 
          className="nav-brand" 
          onClick={(e) => { e.preventDefault(); resetToHome(); }}
        >
          Omni<span>Weave</span>
        </a>
        <div className="nav-links">
          <button onClick={() => { setShowMemoryBank(false); stopAutoPlay(); stopLiveMode(); loadLibrary(); }} className={`flex items-center gap-2 nav-link-auth ${isAuthReady ? 'ready' : ''}`}>
            <Library size={18} strokeWidth={2} /> Library
          </button>
          <button onClick={() => { setShowLibrary(false); stopAutoPlay(); stopLiveMode(); openMemoryBank(); }} className={`flex items-center gap-2 nav-link-auth ${isAuthReady ? 'ready' : ''}`}>
            <BrainIcon size={18} strokeWidth={2} /> Memory
          </button>
          {user && !user.isAnonymous ? (
            <button onClick={handleSignOut} className="nav-user-btn" title={`Signed in as ${user.displayName || user.email}`}>
              {user.photoURL ? (
                <img src={user.photoURL} alt="" className="nav-user-avatar" referrerPolicy="no-referrer" />
              ) : (
                <span className="nav-user-initial">{(user.displayName || user.email || 'U')[0].toUpperCase()}</span>
              )}
            </button>
          ) : (
            <button onClick={handleGoogleSignIn} className="nav-signin-btn">
              Sign In
            </button>
          )}
          <div className={`model-status-badge ${adkAvailable ? 'active' : ''}`}>
            <span className="indicator"></span>
            {adkAvailable ? '10 Models Active' : 'Connecting...'}
          </div>
        </div>
      </header>

      <AnimatePresence>
        {storyParts.length > 0 && !isGenerating && !showLibrary && !showMemoryBank && (
          <BackToHeroButton onClick={resetToHome} />
        )}
      </AnimatePresence>

      <main className={`pt-16 px-4 md:px-6 ${storyParts.length > 0 && !isGenerating ? '' : 'pb-32'}`}>
        {showMemoryBank ? (
          <MemoryBankPage
            memoryGraph={memoryGraph}
            isLoading={isLoadingMemory}
            onBack={() => setShowMemoryBank(false)}
            onRefresh={openMemoryBank}
          />
        ) : showLibrary ? (
          <LibraryView
            isLoadingStory={isLoadingStory}
            savedStories={savedStories}
            user={user}
            onBack={() => setShowLibrary(false)}
            onLoadStory={loadStory}
            onDeleteStory={deleteStory}
          />
        ) : (
          <>
            <AnimatePresence>
              {storyParts.length === 0 && !isGenerating && (
                <HeroSection
                  prompt={prompt}
                  onPromptChange={setPrompt}
                  isGenerating={isGenerating}
                  isLiveConnecting={isLiveConnecting}
                  adkServerConfigured={adkServerConfigured}
                  adkAvailable={adkAvailable}
                  pipelineRef={pipelineRef}
                  onGenerate={generateStory}
                  onStartLive={startLiveMode}
                  error={error}
                  promptSuggestions={[...PROMPT_SUGGESTIONS]}
                  pipelineSteps={[...PIPELINE_STEPS]}
                  storyMode={storyMode}
                  onStoryModeChange={setStoryMode}
                />
              )}
            </AnimatePresence>

            {storyParts.length === 0 && !isGenerating && !isLiveMode && <Footer />}

            <AnimatePresence>
              {isLiveMode && (
                <LiveModePanel
                  isLiveConnected={isLiveConnected}
                  isMuted={isMuted}
                  liveTranscript={liveTranscript}
                  liveToolStatus={liveToolStatus}
                  liveTranscriptEndRef={liveTranscriptEndRef}
                  onToggleMute={toggleMute}
                  onStop={stopLiveMode}
                  onSendText={sendLiveText}
                  onSaveAsStory={async () => {
                    if (!user) { showToast('Sign in required to save'); return; }
                    if (liveTranscript.length === 0) { showToast('Nothing to save yet'); return; }
                    
                    const cleanTranscript = liveTranscript.filter(e => {
                      if (e.role !== 'assistant') return true;
                      const t = e.text.trim();
                      if (!t) return false;
                      if (/^I'm (?:focusing|building|placing|back|concentrating|thinking|considering|planning|setting|establishing|creating|working|going|trying|aiming|starting|continuing|picking|crafting|developing|imagining|visualizing|designing|solidifying|introducing|refining|now |about to )/i.test(t)) return false;
                      if (/^I've (?:introduced|established|created|built|set|started|continued|finished|completed|just|now|successfully)/i.test(t)) return false;
                      if (/^(?:My (?:strategy|goal|plan|focus|approach|visual prompt|musical choice)|The (?:goal|idea|plan|key|next step|focus|musical|score) (?:now |here |is |has ))/i.test(t)) return false;
                      if (/^(?:Audio Worklet|Note:|TODO:|FYI:|Playful jazz|The score)/i.test(t)) return false;
                      if (/generate_image|function call|tool call/i.test(t)) return false;
                      return true;
                    });

                    const parts: StoryPart[] = cleanTranscript
                      .filter(e => e.role === 'assistant' || e.role === 'image' || e.role === 'video')
                      .map((e, i) => {
                        if (e.role === 'image' && e.image) {
                          return { type: 'image' as const, url: e.image, id: `live-img-${i}` };
                        }
                        if (e.role === 'video' && e.video) {
                          return { type: 'video' as const, url: e.video, id: `live-vid-${i}` };
                        }
                        return { type: 'text' as const, text: e.text, id: `live-text-${i}` };
                      });

                    const firstUserMsg = liveTranscript.find(e => e.role === 'user');
                    const storyTitle = firstUserMsg?.text?.substring(0, 80) || 'Live Story Session';

                    const adkUrl = getADKServerURL();
                    if (!adkUrl) {
                      setPrompt(storyTitle);
                      setStoryParts(parts);
                      stopLiveMode();
                      showToast('Live session loaded -- click Save to store in library');
                      return;
                    }
                    
                    saveAction({ user, storyParts: parts, prompt: storyTitle, embedding: null });
                  }}
                />
              )}
            </AnimatePresence>

            <AnimatePresence>
              {isGenerating && (
                <PreloadScreen
                  preloadStage={preloadStage}
                  preloadProgress={preloadProgress}
                  storyMode={storyMode}
                />
              )}
            </AnimatePresence>

            {adkAvailable && agentActivity.length > 0 && isGenerating && (
              <AgentActivityLog agentActivity={agentActivity} isGenerating={isGenerating} />
            )}

            {storyParts.length > 0 && totalPages > 0 && !isGenerating && (
              <StoryBook
                storyPages={storyPages}
                storyParts={storyParts}
                safeCurrentPage={safeCurrentPage}
                totalPages={totalPages}
                isGenerating={isGenerating}
                isAutoPlaying={isAutoPlaying}
                musicEnabled={musicEnabled}
                storyTitle={prompt}
                onPageChange={setCurrentPage}
                onPlayAudio={playAudio}
                onRegenerateImage={regenerateImage}
                onToggleAutoPlay={isAutoPlaying ? stopAutoPlay : startAutoPlay}
                onToggleMusic={() => setMusicEnabled(e => !e)}
                onExportAudiobook={exportAudiobook}
                 onSave={(isPublic?: boolean) => saveAction({ user, storyParts, prompt, embedding, isPublic: isPublic ?? true })}
                onDownloadBook={downloadAsBook}
                isSaving={isSaving}
              />
            )}

          </>
        )}
      </main>

    </div>
  );
}
