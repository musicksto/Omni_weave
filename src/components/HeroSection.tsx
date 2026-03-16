import { RefObject } from 'react';
import { motion } from 'motion/react';
import { SpinnerIcon as Loader2, ArrowRightIcon as ArrowRight, AlertIcon as AlertCircle, LiveIcon } from './Icons';

interface PipelineStep {
  label: string;
  model: string;
  desc: string;
}

interface PromptSuggestion {
  label: string;
  prompt: string;
}

interface HeroSectionProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  isGenerating: boolean;
  isLiveConnecting: boolean;
  adkServerConfigured: boolean;
  adkAvailable: boolean;
  pipelineRef: RefObject<HTMLDivElement>;
  onGenerate: () => void;
  onStartLive: () => void;
  error: string;
  promptSuggestions: PromptSuggestion[];
  pipelineSteps: PipelineStep[];
  storyMode: 'image' | 'video';
  onStoryModeChange: (mode: 'image' | 'video') => void;
}

export default function HeroSection({
  prompt,
  onPromptChange,
  isGenerating,
  isLiveConnecting,
  adkServerConfigured,
  adkAvailable,
  pipelineRef,
  onGenerate,
  onStartLive,
  error,
  promptSuggestions,
  pipelineSteps,
  storyMode,
  onStoryModeChange,
}: HeroSectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -40, filter: 'blur(20px)' }}
      transition={{ duration: 0.6 }}
      className="hero-section"
    >
      <div className="atmosphere" />

      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="hero-title"
      >
        Every frame, <br /><em>composed.</em>
      </motion.h2>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="hero-subtitle"
      >
        Type a prompt or speak live. OmniWeave orchestrates 9 Gemini models to write, illustrate, narrate, and score your story.
      </motion.p>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 }}
        className="story-mode-toggle"
      >
        <button
          className={`story-mode-btn ${storyMode === 'image' ? 'story-mode-active' : ''}`}
          onClick={() => onStoryModeChange('image')}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.69l-2.22-2.219a.75.75 0 00-1.06 0l-1.91 1.909-4.72-4.719a.75.75 0 00-1.06 0L2.5 11.06z" clipRule="evenodd" />
          </svg>
          Image Story
        </button>
        <button
          className={`story-mode-btn ${storyMode === 'video' ? 'story-mode-active' : ''}`}
          onClick={() => onStoryModeChange('video')}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M3.25 4A2.25 2.25 0 001 6.25v7.5A2.25 2.25 0 003.25 16h7.5A2.25 2.25 0 0013 13.75v-7.5A2.25 2.25 0 0010.75 4h-7.5zM19 4.75a.75.75 0 00-1.28-.53l-3 3a.75.75 0 00-.22.53v4.5c0 .199.079.39.22.53l3 3a.75.75 0 001.28-.53V4.75z" />
          </svg>
          Video Story
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="prompt-area prompt-area-container"
      >
        <div className="prompt-wrapper">
          <textarea
            id="prompt-input"
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            className="prompt-textarea"
            placeholder="Describe a world and we'll bring it to life..."
            rows={2}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && adkAvailable) onGenerate(); }}
          />
          <div className="prompt-actions">
            <span className="prompt-shortcut">Ctrl+Enter</span>
            <div className="hero-btn-layout">
              {adkServerConfigured && (
                <button
                  onClick={() => onStartLive()}
                  disabled={isLiveConnecting || isGenerating}
                  className="btn-live btn-hero-main btn-live-hero"
                  title={adkAvailable ? 'Start Live voice session' : 'ADK server connecting...'}
                >
                  <div className="btn-shine" />
                  {isLiveConnecting
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : (
                      <>
                        <span className={adkAvailable ? 'live-dot' : 'live-dot-dim'} />
                        <LiveIcon className="w-4 h-4" />
                      </>
                    )
                  }
                  <div className="btn-hero-text">
                    <div className="btn-hero-overline">Director Session</div>
                    <div className="btn-hero-title">Enter Live Mode <span className="btn-hero-shortcut">(L)</span></div>
                  </div>
                </button>
              )}
              <button
                id="generate-btn"
                onClick={onGenerate}
                disabled={!prompt.trim() || isGenerating || !adkAvailable}
                className="btn-primary hero-btn-main"
                style={{
                  flex: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 10, height: 54, fontSize: '0.9rem'
                }}
              >
                {!adkAvailable
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</>
                  : isGenerating
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Composing...</>
                    : <>Compose Script <ArrowRight className="w-4 h-4" /></>
                }
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55 }}
        className="suggestions-wrapper"
      >
        {promptSuggestions.map((s) => (
          <button
            key={s.label}
            onClick={() => onPromptChange(s.prompt)}
            className="btn-secondary btn-suggestion"
          >
            {s.label}
          </button>
        ))}
        <p className="how-it-works-hint">
          Type any idea &rarr; 5 illustrated scenes &rarr; multi-voice narration &rarr; ambient music &rarr; ~30s
        </p>
      </motion.div>

      <div ref={pipelineRef} style={{ display: 'none' }} />

      {error && (
        <div className="error-banner" style={{ marginTop: 16 }}>
          <span style={{ display: 'inline-flex', marginRight: 8, verticalAlign: 'middle' }}>
            <AlertCircle className="w-4 h-4" />
          </span>
          {error}
        </div>
      )}
    </motion.div>
  );
}
