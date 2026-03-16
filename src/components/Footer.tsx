import { useState } from 'react';

export default function Footer() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <footer>
      <div
        className="footer-summary"
        onClick={() => setIsExpanded(prev => !prev)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsExpanded(prev => !prev); } }}
        role="button"
        tabIndex={0}
      >
        <span>Google ADK for TypeScript + 9 Gemini Models + Cloud TTS</span>
        <span className="footer-divider">|</span>
        <span>Gemini Live Agent Challenge</span>
        <span className={`footer-chevron ${isExpanded ? 'expanded' : ''}`}>&#9662;</span>
      </div>

      {isExpanded && (
        <div className="footer-details">
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
                {['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3-flash-preview', 'gemini-3.1-flash-image', 'veo-3.1', 'gemini-2.5-pro-tts', 'native-audio', 'gemini-embedding-2', 'lyria-realtime', 'Chirp 3 HD'].map(m => (
                  <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--vermillion)', opacity: 0.4 }} />{m}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="embedding-viz-title" style={{ marginBottom: 12 }}>Infrastructure</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--frame-dim)', lineHeight: 2 }}>
                {['Cloud Run', 'Firebase Hosting', 'Cloud Firestore', 'Firebase Storage', 'Firebase Auth', 'Cloud TTS', 'Artifact Registry', 'Cloud Build'].map(s => (
                  <div key={s}>{s}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
}
