import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface PreloadScreenProps {
  preloadStage: string;
  preloadProgress: number;
  storyMode: 'image' | 'video';
}

const FUN_FACTS = [
  'The StoryWriter crafts 5 scenes with a full character sheet for visual consistency',
  'Each image prompt restates the complete character description — the image model has zero memory',
  'Cloud TTS Chirp 3 HD uses 28 distinct voices matched by gender and character type',
  'The Memory Bank builds a knowledge graph of characters, locations, and relationships across stories',
  'Lyria generates mood-reactive ambient music that matches the story atmosphere',
  'Story embeddings create a 3072-dimensional fingerprint — like DNA for narratives',
  'The cinematic player uses Ken Burns animations with 4 motion variants per scene',
  'Live Mode uses context window compression for unlimited voice storytelling sessions',
  'Particle effects (rain, sparks, fireflies) are auto-detected from story keywords',
  'Each story generates ~1000 words across 5 scenes with an emotional arc',
];

const STAGE_MESSAGES: Record<string, string[]> = {
  writing: [
    'Crafting the narrative arc...',
    'Building character voices...',
    'Weaving scene descriptions...',
    'Reviewing script consistency...',
  ],
  visuals: [
    'Painting the world into existence...',
    'Bringing characters to life...',
    'Rendering cinematic compositions...',
    'Applying art direction...',
  ],
  dna: [
    'Computing story fingerprint...',
    'Encoding narrative DNA...',
  ],
};

export default function PreloadScreen({ preloadStage, preloadProgress, storyMode }: PreloadScreenProps) {
  const [factIndex, setFactIndex] = useState(() => Math.floor(Math.random() * FUN_FACTS.length));
  const [msgIndex, setMsgIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setFactIndex(i => (i + 1) % FUN_FACTS.length), 6000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setMsgIndex(i => i + 1), 4000);
    return () => clearInterval(t);
  }, [preloadStage]);

  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const steps = [
    { key: 'writing', label: 'Writing Script', detail: 'StoryWriter + StoryReviewer', icon: 'pen' },
    { key: 'visuals', label: storyMode === 'video' ? 'Generating Videos' : 'Generating Illustrations', detail: storyMode === 'video' ? 'Veo 3.1 Fast' : 'Gemini 3.1 Flash Image', icon: storyMode === 'video' ? 'film' : 'brush' },
    { key: 'dna', label: 'Computing Story DNA', detail: 'Multimodal embedding', icon: 'dna' },
  ];
  const stageOrder = ['writing', 'visuals', 'dna', 'complete'];
  const currentStageIdx = stageOrder.indexOf(preloadStage);
  const overallProgress = currentStageIdx >= 0
    ? Math.round(((currentStageIdx + (preloadProgress / 100)) / 3) * 100)
    : 0;

  const stageMessages = STAGE_MESSAGES[preloadStage] || [];
  const currentMsg = stageMessages[msgIndex % stageMessages.length] || '';

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="preload-screen">

      <div className="preload-orbit">
        <motion.div className="preload-ring preload-ring-outer"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 8, ease: 'linear' }} />
        <motion.div className="preload-ring preload-ring-inner"
          animate={{ rotate: -360 }}
          transition={{ repeat: Infinity, duration: 5, ease: 'linear' }} />
        <div className="preload-ring-center">
          <span className="preload-pct">{overallProgress}</span>
          <span className="preload-pct-sign">%</span>
        </div>
      </div>

      <h3 className="preload-title">Producing your story</h3>

      <AnimatePresence mode="wait">
        <motion.p key={currentMsg} className="preload-flavor"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}>
          {currentMsg}
        </motion.p>
      </AnimatePresence>

      <div className="preload-overall-bar">
        <motion.div className="preload-overall-fill"
          animate={{ width: `${overallProgress}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }} />
      </div>

      <div className="preload-steps">
        {steps.map(step => {
          const isActive = preloadStage === step.key;
          const isDone = stageOrder.indexOf(preloadStage) > stageOrder.indexOf(step.key);
          return (
            <div key={step.key} className={`preload-step ${isActive ? 'preload-step-active' : ''} ${isDone ? 'preload-step-done' : ''}`}>
              <div className={`preload-step-icon ${isDone ? 'preload-step-icon-done' : isActive ? 'preload-step-icon-active' : 'preload-step-icon-pending'}`}>
                {isDone ? (
                  <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 12, height: 12 }}><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>
                ) : isActive ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid transparent', borderTopColor: 'currentColor' }} />
                ) : (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--frame-ghost)' }} />
                )}
              </div>
              <div className="preload-step-info">
                <div className="preload-step-label">{step.label}</div>
                <div className="preload-step-detail">
                  {step.detail}
                  {isActive && preloadProgress > 0 && ` — ${preloadProgress}%`}
                </div>
                {isActive && preloadProgress > 0 && (
                  <div className="preload-progress">
                    <motion.div className="preload-progress-fill"
                      animate={{ width: `${preloadProgress}%` }}
                      transition={{ duration: 0.3, ease: 'easeOut' }} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="preload-fun-fact">
        <AnimatePresence mode="wait">
          <motion.p key={factIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 0.6, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4 }}>
            <span className="preload-fact-label">Did you know?</span>
            {FUN_FACTS[factIndex]}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="preload-elapsed">{formatTime(elapsed)}</div>
    </motion.div>
  );
}
