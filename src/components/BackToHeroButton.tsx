import { motion } from 'motion/react';

interface BackToHeroButtonProps {
  onClick: () => void;
}

export default function BackToHeroButton({ onClick }: BackToHeroButtonProps) {
  return (
    <motion.button
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="back-to-hero"
      onClick={onClick}
      title="Start a new story"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
        <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>New Story</span>
    </motion.button>
  );
}
