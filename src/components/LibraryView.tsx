import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRightIcon as ArrowRight } from './Icons';
import type { SavedStory } from '../types';
import type { User as FirebaseUser } from 'firebase/auth';

function formatStoryDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface LibraryViewProps {
  isLoadingStory: boolean;
  savedStories: SavedStory[];
  user: FirebaseUser | null;
  onBack: () => void;
  onLoadStory: (story: SavedStory) => void;
  onDeleteStory?: (storyId: string) => void;
}

function LibraryCard({ story, onLoad, showDelete, onDelete }: {
  story: SavedStory;
  onLoad: (s: SavedStory) => void;
  showDelete?: boolean;
  onDelete?: (id: string) => void;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="library-card"
      onClick={() => onLoad(story)}
    >
      {showDelete && onDelete && (
        <button
          type="button"
          className="library-card-delete"
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm('Delete this story?')) onDelete(story.id);
          }}
          title="Delete story"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
          </svg>
        </button>
      )}
      {story.leadImage ? (
        <div className={`library-card-thumbnail${imgLoaded ? '' : ' library-card-thumb-shimmer'}`}>
          <img
            src={story.leadImage}
            alt=""
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgLoaded(true)}
            style={{ opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.3s' }}
          />
        </div>
      ) : (
        <div className="library-card-placeholder">
          <span className="library-card-initial">
            {(story.title || 'S')[0].toUpperCase()}
          </span>
        </div>
      )}
      <div className="library-card-body">
        <div className="library-card-title">{story.title}</div>
        <div className="library-card-meta-row">
          {story.createdAt && <span>{formatStoryDate(story.createdAt.seconds)}</span>}
          {story.authorName && story.authorName !== 'Anonymous' && <span>by {story.authorName}</span>}
          {showDelete && <span className={`library-visibility-badge ${story.isPublic !== false ? 'public' : 'private'}`}>{story.isPublic !== false ? 'Public' : 'Private'}</span>}
        </div>
      </div>
    </motion.div>
  );
}

export default function LibraryView({ isLoadingStory, savedStories, user, onBack, onLoadStory, onDeleteStory }: LibraryViewProps) {
  const [tab, setTab] = useState<'public' | 'mine'>('public');

  const displayedStories = tab === 'mine'
    ? savedStories.filter(s => s.authorId === user?.uid)
    : savedStories.filter(s => s.isPublic !== false);

  const emptyMessage = tab === 'mine'
    ? 'No stories yet. Create your first one.'
    : 'No stories in the gallery yet.';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ maxWidth: 1000, margin: '0 auto', padding: '72px clamp(24px, 4vw, 40px) 40px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 className="section-title">
          Story <em style={{ fontStyle: 'italic', color: 'var(--vermillion)' }}>Library</em>
        </h2>
        <button onClick={onBack} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}>
            <ArrowRight className="w-4 h-4" />
          </span>
          Back
        </button>
      </div>

      <div className="library-tabs">
        <button
          type="button"
          className={`library-tab ${tab === 'public' ? 'active' : ''}`}
          onClick={() => setTab('public')}
        >
          Public Gallery
        </button>
        <button
          type="button"
          className={`library-tab ${tab === 'mine' ? 'active' : ''}`}
          onClick={() => setTab('mine')}
        >
          My Stories
        </button>
      </div>

      {isLoadingStory ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '96px 0', gap: 16 }}>
          <div className="generating-dot" style={{ width: 12, height: 12 }}></div>
          <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--frame-dim)' }}>
            Retrieving stories...
          </p>
        </div>
      ) : displayedStories.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '96px 0', fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '1.1rem', color: 'var(--frame-dim)' }}>
          {emptyMessage}
        </div>
      ) : (
        <div className="library-grid">
          {displayedStories.map((story) => (
            <LibraryCard
              key={story.id}
              story={story}
              onLoad={onLoadStory}
              showDelete={tab === 'mine'}
              onDelete={onDeleteStory}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}
