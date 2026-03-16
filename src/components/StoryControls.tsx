import { motion } from 'motion/react';
import { SpinnerIcon as Loader2, BookIcon as BookOpen, DownloadIcon as Download, BookmarkIcon as Save } from './Icons';

interface StoryControlsProps {
  isSaving: boolean;
  onDownloadBook: () => void;
  onExportAudiobook: () => void;
  onSave: () => void;
}

export default function StoryControls({
  isSaving,
  onDownloadBook,
  onExportAudiobook,
  onSave,
}: StoryControlsProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="story-controls">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={onDownloadBook} className="btn-icon" style={{ width: 'auto', padding: '8px 14px', gap: 6, display: 'flex', alignItems: 'center', fontSize: '0.7rem' }}>
          <BookOpen className="w-3.5 h-3.5" /> Export
        </button>
        <button onClick={onExportAudiobook} className="btn-icon" style={{ width: 'auto', padding: '8px 14px', gap: 6, display: 'flex', alignItems: 'center', fontSize: '0.7rem' }}>
          <Download className="w-3.5 h-3.5" /> Audiobook
        </button>
        <button onClick={onSave} disabled={isSaving} className="btn-icon" style={{ width: 'auto', padding: '8px 14px', gap: 6, display: 'flex', alignItems: 'center', fontSize: '0.7rem' }}>
          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
        </button>
      </div>
    </motion.div>
  );
}
