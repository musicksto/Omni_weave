import { RefObject } from 'react';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { StopIcon as Square, SpinnerIcon as Loader2, AlertIcon as AlertCircle, BookmarkIcon as Save, MicrophoneIcon, MicOffIcon } from './Icons';

interface TranscriptEntry {
  role: string;
  text: string;
  image?: string;
  video?: string;
}

interface LiveModePanelProps {
  isLiveConnected: boolean;
  isMuted: boolean;
  liveTranscript: TranscriptEntry[];
  liveToolStatus: string;
  liveTranscriptEndRef: RefObject<HTMLDivElement>;
  onToggleMute: () => void;
  onStop: () => void;
  onSendText: (text: string) => void;
  onSaveAsStory: () => void;
}

export default function LiveModePanel({
  isLiveConnected,
  isMuted,
  liveTranscript,
  liveToolStatus,
  liveTranscriptEndRef,
  onToggleMute,
  onStop,
  onSendText,
  onSaveAsStory,
}: LiveModePanelProps) {
  const hasContent = liveTranscript.filter(e => e.role === 'assistant' || e.role === 'image').length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="live-panel"
    >
      <div className="live-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            className={isLiveConnected ? 'blink-dot' : ''}
            style={{
              width: 10, height: 10, borderRadius: '50%', display: 'inline-block',
              background: isLiveConnected ? 'var(--vermillion)' : 'var(--frame-dim)',
            }}
          />
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
            NATIVE AUDIO
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={onToggleMute}
            className={`btn-icon${isLiveConnected && !isMuted ? ' mic-active' : ''}`}
            style={{
              width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              ...(isMuted ? { background: 'var(--vermillion-dim)', borderColor: 'rgba(194,59,34,0.3)' } : {}),
            }}
          >
            {isMuted ? <MicOffIcon className="w-4 h-4" /> : <MicrophoneIcon className="w-4 h-4" />}
          </button>
          <button
            onClick={onStop}
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem' }}
          >
            <Square className="w-3 h-3" /> End
          </button>
        </div>
      </div>

      {isLiveConnected && !isMuted && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, height: 32, marginBottom: 16 }}>
          {([
            ['3px','8px','3px'],
            ['3px','14px','3px'],
            ['3px','20px','3px'],
            ['3px','24px','3px'],
            ['3px','18px','3px'],
            ['3px','12px','3px'],
            ['3px','16px','3px'],
            ['3px','10px','3px'],
          ] as [string,string,string][]).map((heights, idx) => (
            <motion.div
              key={idx}
              animate={{ height: heights }}
              transition={{ repeat: Infinity, duration: 0.5 + idx * 0.05, delay: idx * 0.08 }}
              style={{ width: 3, borderRadius: 2, background: 'var(--vermillion)', opacity: 0.75 }}
            />
          ))}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--frame-dim)', marginLeft: 12, letterSpacing: '0.08em' }}>
            LISTENING
          </span>
        </div>
      )}

      {isLiveConnected && !liveToolStatus && liveTranscript.length > 0 &&
       liveTranscript[liveTranscript.length - 1]?.role === 'assistant' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, height: 24, marginBottom: 12 }}>
          {([
            ['2px','6px','2px'],
            ['2px','10px','2px'],
            ['2px','14px','2px'],
            ['2px','10px','2px'],
            ['2px','6px','2px'],
          ] as [string,string,string][]).map((heights, idx) => (
            <motion.div
              key={`ai-${idx}`}
              animate={{ height: heights }}
              transition={{ repeat: Infinity, duration: 0.6 + idx * 0.04, delay: idx * 0.06 }}
              style={{ width: 2, borderRadius: 1, background: 'var(--brass)', opacity: 0.6 }}
            />
          ))}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--frame-dim)', marginLeft: 10, letterSpacing: '0.08em' }}>
            SPEAKING
          </span>
        </div>
      )}

      <div className="live-transcript-inset">
        {liveTranscript.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 16, color: 'var(--canvas-dim)' }}>
            <MicrophoneIcon className="w-12 h-12" />
            <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '1.2rem', margin: 0, color: 'var(--frame-text)' }}>
              Ready to Create
            </p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', margin: 0, color: 'var(--canvas-dim)', textAlign: 'center' }}>
              Speak your story into existence, or type below
            </p>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <span className="listening-dot" />
              <span className="listening-dot" />
              <span className="listening-dot" />
            </div>
          </div>
        )}

        {liveTranscript.map((entry, i) => (
          <div key={i} style={{
            marginBottom: entry.role === 'user' || entry.role === 'assistant' ? 0 : 16,
            ...(entry.role === 'system' ? { textAlign: 'center' } : {}),
            ...(entry.role === 'error' ? { color: '#ef4444' } : {}),
          }}>
            {entry.role === 'system' ? (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--canvas-dim)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {entry.text}
              </span>
            ) : entry.role === 'image' && entry.image ? (
              <div className="image-frame" style={{ margin: '8px 0' }}>
                <img src={entry.image} alt="" style={{ width: '100%', borderRadius: 'var(--radius-md)' }} />
              </div>
            ) : entry.role === 'video' && entry.video ? (
              <div className="video-frame" style={{ margin: '8px 0' }}>
                <video
                  src={entry.video}
                  autoPlay
                  loop
                  muted
                  playsInline
                  poster=""
                  style={{ width: '100%', borderRadius: 'var(--radius-md)' }}
                />
              </div>
            ) : entry.role === 'error' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem' }}>
                <AlertCircle className="w-3.5 h-3.5" /> {entry.text}
              </div>
            ) : (
              <div className={entry.role === 'user' ? 'live-transcript-user' : 'live-transcript-assistant'}>
                <span className={`live-transcript-speaker ${entry.role === 'user' ? 'live-transcript-speaker-user' : 'live-transcript-speaker-ai'}`}>
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

      {isMuted && <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <input
          type="text"
          placeholder="Type a message..."
          style={{
            flex: 1, background: 'var(--frame-surface)', border: '1px solid var(--frame-ghost)',
            borderRadius: 'var(--radius-md)', padding: '10px 16px', color: 'var(--frame-text)',
            fontSize: '0.85rem', fontFamily: 'var(--font-body)', outline: 'none',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.currentTarget.value.trim()) {
              onSendText(e.currentTarget.value);
              e.currentTarget.value = '';
            }
          }}
        />
        <button
          onClick={(e) => {
            const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
            if (input.value.trim()) {
              onSendText(input.value);
              input.value = '';
            }
          }}
          className="btn-primary"
          style={{ padding: '10px 20px', fontSize: '0.8rem' }}
        >
          Send
        </button>
      </div>}

      {hasContent && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
          <button
            onClick={onSaveAsStory}
            className="btn-secondary btn-save-story"
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', border: '1px solid var(--brass)', color: 'var(--brass)' }}
          >
            <Save className="w-3.5 h-3.5" /> Save as Story
          </button>
        </div>
      )}
    </motion.div>
  );
}
