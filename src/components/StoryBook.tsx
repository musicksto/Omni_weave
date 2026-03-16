import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PlayIcon as Play, StopIcon as Square, SpinnerIcon as Loader2, AlertIcon as AlertCircle, ChevronLeftIcon, ChevronRightIcon, MusicIcon } from './Icons';
import DialogueRenderer from './DialogueRenderer';
import ImageFX from './ImageFX';
import type { StoryPart } from '../types';

interface StoryBookProps {
  storyPages: StoryPart[][];
  storyParts: StoryPart[];
  safeCurrentPage: number;
  totalPages: number;
  isGenerating: boolean;
  isAutoPlaying: boolean;
  musicEnabled: boolean;
  storyTitle?: string;
  onPageChange: (page: number) => void;
  onPlayAudio: (id: string, text: string) => void;
  onRegenerateImage: (id: string, prompt: string) => void;
  onToggleAutoPlay: () => void;
  onToggleMusic: () => void;
  onExportAudiobook?: () => void;
  onSave?: (isPublic?: boolean) => void;
  onDownloadBook?: () => void;
  isSaving?: boolean;
}

export default function StoryBook({
  storyPages,
  storyParts,
  safeCurrentPage,
  totalPages,
  isGenerating,
  isAutoPlaying,
  musicEnabled,
  onPageChange,
  onPlayAudio,
  onRegenerateImage,
  onToggleAutoPlay,
  onToggleMusic,
  onExportAudiobook,
  onSave,
  onDownloadBook,
  isSaving,
  storyTitle,
}: StoryBookProps) {
  const currentParts = storyPages[safeCurrentPage] || [];
  const isCoverPage = currentParts.some(p => p.id === '__cover__');
  const imagePart = isCoverPage ? undefined : currentParts.find(p => p.type === 'image' || p.type === 'video');
  const textPart = isCoverPage ? undefined : currentParts.find(p => p.type === 'text');
  // Find lead image for cover page
  const leadImagePart = storyParts.find((p): p is Extract<StoryPart, { type: 'image' }> => p.type === 'image' && 'url' in p && !!p.url);
  const globalImageIdx = imagePart ? storyParts.indexOf(imagePart) : -1;
  const imageNumber = imagePart && (imagePart.type === 'image' || imagePart.type === 'video')
    ? storyParts.slice(0, globalImageIdx + 1).filter(p => p.type === 'image' || p.type === 'video').length
    : 0;

  // Track frame dimensions for particle FX canvas
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameDims, setFrameDims] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      setFrameDims({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const fxContext = textPart?.type === 'text' ? textPart.text : (imagePart?.type === 'image' ? (imagePart.prompt || '') : '');
  const progress = totalPages > 1 ? ((safeCurrentPage) / (totalPages - 1)) * 100 : 100;

  // Caption visibility toggle
  const [captionVisible, setCaptionVisible] = useState(true);

  // First-time hint overlay — shows once, auto-dismisses
  const [showHint, setShowHint] = useState(() => {
    try { return !sessionStorage.getItem('omniweave-nav-hint-seen'); } catch { return true; }
  });
  const dismissHint = useCallback(() => {
    setShowHint(false);
    try { sessionStorage.setItem('omniweave-nav-hint-seen', '1'); } catch { /* */ }
  }, []);
  useEffect(() => {
    if (!showHint) return;
    const t = setTimeout(dismissHint, 4000);
    return () => clearTimeout(t);
  }, [showHint, dismissHint]);

  return (
    <div className="story-container">
      <div className="story-book cinematic-book">



        <AnimatePresence>
          {showHint && totalPages > 1 && (
            <motion.div
              className="story-nav-hint"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4 }}
              onClick={dismissHint}
            >
              <div className="story-nav-hint-inner">
                <ChevronLeftIcon size={16} />
                <span>Use arrows or swipe to navigate {totalPages} scenes</span>
                <ChevronRightIcon size={16} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>



        {isCoverPage && (
          <motion.div
            className="cover-page"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
          >
            {leadImagePart?.url && (
              <div className="cover-image-wrap">
                <img src={leadImagePart.url} alt={storyTitle || 'Story cover image'} className="cover-image" referrerPolicy="no-referrer" />
                <div className="cover-image-gradient" />
              </div>
            )}
            <div className="cover-content">
              <h1 className="cover-title">{storyTitle || 'A Tale Woven by OmniWeave'}</h1>
              <div className="cover-divider" />
              <p className="cover-badge">Powered by Gemini AI</p>
              <p className="cover-meta">OmniWeave Cinematic Stories</p>
            </div>
          </motion.div>
        )}



        {!isCoverPage && imagePart && (
          <div className="cinematic-frame" ref={frameRef}>
            {imagePart.type === 'video' ? (
              imagePart.url ? (
                <>
                  <video
                    key={imagePart.id}
                    src={imagePart.url}
                    autoPlay loop muted playsInline
                    className="cinematic-media cinematic-video"
                  />
                  <div className="cinematic-frame-number">
                    <span className="cinematic-video-badge">VEO</span> FRM {String(imageNumber).padStart(3, '0')}
                  </div>
                  <div className="cinematic-vignette" />
                </>
              ) : imagePart.error ? (
                <div className="cinematic-placeholder">
                  <AlertCircle className="w-5 h-5" />
                  <p>{imagePart.error}</p>
                </div>
              ) : (
                <div className="cinematic-placeholder cinematic-placeholder-gradient">
                  <div className="video-loading-indicator">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <div className="video-loading-text">
                      <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>Generating Video</p>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', opacity: 0.5, letterSpacing: '0.1em' }}>VEO 3.1 FAST</span>
                    </div>
                  </div>
                  {imagePart.prompt && (
                    <p style={{ maxWidth: 500, textAlign: 'center', fontSize: '0.75rem', opacity: 0.5, marginTop: 12 }}>
                      {imagePart.prompt.length > 120 ? imagePart.prompt.substring(0, 120) + '...' : imagePart.prompt}
                    </p>
                  )}
                </div>
              )
            ) : imagePart.type === 'image' ? (
              imagePart.isLoading ? (
                <div className="cinematic-placeholder">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <p>Illustrating scene...</p>
                </div>
              ) : imagePart.error ? (
                <div
                  className="cinematic-placeholder"
                  onClick={() => imagePart.prompt && onRegenerateImage(imagePart.id, imagePart.prompt!)}
                  style={{ cursor: imagePart.prompt ? 'pointer' : 'default' }}
                >
                  <AlertCircle className="w-5 h-5" />
                  <p>Image failed — tap to retry</p>
                  {imagePart.prompt && (
                    <button onClick={(e) => { e.stopPropagation(); onRegenerateImage(imagePart.id, imagePart.prompt!); }} className="btn-secondary" style={{ fontSize: '0.7rem' }}>
                      Retry
                    </button>
                  )}
                </div>
              ) : imagePart.url ? (
                <>
                  <img
                    src={imagePart.url}
                    alt={imagePart.prompt?.slice(0, 120) || `Scene ${imageNumber} illustration`}
                    className={`cinematic-media kenburns-${(globalImageIdx % 4) + 1}`}
                    referrerPolicy="no-referrer"
                  />
                  <div className="cinematic-frame-number">FRM {String(imageNumber).padStart(3, '0')}</div>
                  <div className="cinematic-vignette" />
                  {frameDims.w > 0 && <ImageFX contextText={fxContext} width={frameDims.w} height={frameDims.h} />}
                </>
              ) : (
                <div
                  className="cinematic-placeholder cinematic-placeholder-gradient"
                  onClick={() => imagePart.prompt && onRegenerateImage(imagePart.id, imagePart.prompt!)}
                  style={{ cursor: imagePart.prompt ? 'pointer' : 'default' }}
                >
                  <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.5 }}>
                    Image unavailable
                  </span>
                  {imagePart.prompt && (
                    <p style={{ maxWidth: 500, textAlign: 'center', fontSize: '0.8rem', marginTop: 8 }}>
                      Tap to generate
                    </p>
                  )}
                  {imagePart.prompt && (
                    <button onClick={(e) => { e.stopPropagation(); onRegenerateImage(imagePart.id, imagePart.prompt!); }} className="btn-secondary" style={{ fontSize: '0.7rem', marginTop: 8 }}>
                      Regenerate
                    </button>
                  )}
                </div>
              )
            ) : null}
          </div>
        )}



        {imagePart && textPart && (
          <button
            type="button"
            className="caption-toggle"
            onClick={() => setCaptionVisible(v => !v)}
            title={captionVisible ? 'Hide captions' : 'Show captions'}
          >
            {captionVisible ? (
              <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074L3.707 2.293zM10 12a2 2 0 01-1.904-2.611L11.39 12.78A2.002 2.002 0 0110 12zm4.02.414L12.98 11.374a4 4 0 00-4.354-4.354L7.586 5.98A6 6 0 0116 10c0 .876-.188 1.713-.526 2.466z"/><path d="M2.458 10C3.732 5.943 7.523 3 12 3c-.67 0-1.328.068-1.967.198L1.752 12.02A10.023 10.023 0 012.458 10zM4.02 12.414l1.04 1.04A6 6 0 014 10c0-.876.188-1.713.526-2.466z" opacity="0"/></svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/></svg>
            )}
            <span>{captionVisible ? 'Hide' : 'Show'}</span>
          </button>
        )}



        <AnimatePresence mode="wait">
          {captionVisible && !isCoverPage && (
            <motion.div
              key={safeCurrentPage}
              className={`cinematic-caption ${safeCurrentPage === 0 ? 'story-page-first' : ''} ${!imagePart ? 'cinematic-caption-full' : ''}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              {textPart && textPart.type === 'text' && (
                <DialogueRenderer text={textPart.text} />
              )}
            </motion.div>
          )}
        </AnimatePresence>



        <div className="media-player">


          <div className="media-progress-track" onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            onPageChange(Math.round(pct * (totalPages - 1)));
          }}>
            <div className="media-progress-fill" style={{ width: `${progress}%` }} />
            <div className="media-progress-thumb" style={{ left: `${progress}%` }} />
          </div>

          <div className="media-controls">


            <div className="media-controls-left">
              <button
                className="media-btn"
                onClick={() => onPageChange(Math.max(safeCurrentPage - 1, 0))}
                disabled={safeCurrentPage === 0}
                title="Previous scene"
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </button>

              <button
                className={`media-btn media-btn-play ${isAutoPlaying ? 'media-btn-active' : ''}`}
                onClick={onToggleAutoPlay}
                title={isAutoPlaying ? 'Pause' : 'Play'}
              >
                {isAutoPlaying
                  ? <Square className="w-4 h-4 fill-current" />
                  : <Play className="w-4 h-4 fill-current" />
                }
              </button>

              <button
                className="media-btn"
                onClick={() => onPageChange(Math.min(safeCurrentPage + 1, totalPages - 1))}
                disabled={safeCurrentPage >= totalPages - 1}
                title="Next scene"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>



            <div className="media-info">
              <span className="media-scene-count">
                {isCoverPage ? 'Cover' : `Scene ${safeCurrentPage} of ${totalPages - 1}`}
              </span>
              {isAutoPlaying && textPart?.type === 'text' && textPart.isLoadingAudio && (
                <span className="media-status">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading narration...
                </span>
              )}
              {isAutoPlaying && textPart?.type === 'text' && textPart.isPlaying && (
                <span className="media-status media-status-playing">
                  <span className="media-waveform">
                    {[1,2,3,4,5].map(i => (
                      <motion.span key={i}
                        animate={{ height: ['3px', '12px', '3px'] }}
                        transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.08 }}
                        className="media-wave-bar"
                      />
                    ))}
                  </span>
                  Narrating
                </span>
              )}
              {isGenerating && (
                <span className="media-status">
                  <span className="generating-dot" style={{ width: 6, height: 6 }} /> Writing...
                </span>
              )}
            </div>



            <div className="media-controls-right">
              <button
                className={`media-btn ${musicEnabled ? 'media-btn-active' : ''}`}
                onClick={onToggleMusic}
                title={musicEnabled ? 'Music On' : 'Music Off'}
              >
                <MusicIcon className="w-4 h-4" />
              </button>

              {textPart?.type === 'text' && !isAutoPlaying && (
                <button
                  className="media-btn"
                  onClick={() => onPlayAudio(textPart.id, textPart.text)}
                  disabled={textPart.isLoadingAudio || isGenerating}
                  title="Listen to this scene"
                >
                  {textPart.isLoadingAudio
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : textPart.isPlaying
                      ? <Square className="w-4 h-4 fill-current" />
                      : <Play className="w-4 h-4 fill-current" />
                  }
                </button>
              )}

              {onDownloadBook && (
                <button className="media-btn" onClick={onDownloadBook} title="Export as HTML book">
                  <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 16, height: 16 }}>
                    <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                    <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                  </svg>
                </button>
              )}
              {onSave && (
                <button className="media-btn" onClick={() => onSave(true)} disabled={isSaving} title="Save to Public Gallery">
                  <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 16, height: 16 }}>
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 012 2v1a2 2 0 01-2 2 2 2 0 00-2 2v.5a6 6 0 01-6.668-5.473z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
              {onSave && (
                <button className="media-btn" onClick={() => onSave(false)} disabled={isSaving} title="Save as Private">
                  <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 16, height: 16 }}>
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>



      {totalPages > 1 && (
        <div className="page-dots">
          {storyPages.map((_, i) => (
            <button
              key={i}
              className={`page-dot ${i === safeCurrentPage ? 'active' : ''}`}
              onClick={() => onPageChange(i)}
              aria-label={`Go to scene ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
