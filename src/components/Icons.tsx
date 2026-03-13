import React from 'react';

export const QuillIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
    <line x1="16" y1="8" x2="2" y2="22" />
    <line x1="17.5" y1="15" x2="9" y2="6.5" />
    <path d="M11 13.5l-2 2" />
    <path d="M13.5 11l2-2" />
  </svg>
);

export const PlayIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" strokeDasharray="4 4" />
    <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
    <circle cx="12" cy="12" r="11" strokeOpacity="0.3" />
  </svg>
);

export const StopIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" strokeDasharray="4 4" />
    <rect x="9" y="9" width="6" height="6" fill="currentColor" />
    <circle cx="12" cy="12" r="11" strokeOpacity="0.3" />
  </svg>
);

export const SpinnerIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    <circle cx="12" cy="12" r="3" />
    <circle cx="12" cy="12" r="8" strokeDasharray="2 4" strokeOpacity="0.5" />
  </svg>
);

export const ArrowRightIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 12h17M14 5l7 7-7 7M16 12H3" />
    <circle cx="20" cy="12" r="2" fill="currentColor"/>
    <path d="M3 12h17" strokeDasharray="2 2" strokeOpacity="0.5" />
  </svg>
);

export const CheckIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" strokeDasharray="2 2" />
    <path d="M8 12l3 3 5-6" strokeWidth="2" />
    <circle cx="12" cy="12" r="11" strokeOpacity="0.3" />
  </svg>
);

export const AlertIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polygon points="12 2 22 20 2 20 12 2" strokeDasharray="4 4" />
    <line x1="12" y1="8" x2="12" y2="14" />
    <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2" />
    <polygon points="12 1 23 21 1 21 12 1" strokeOpacity="0.3" />
  </svg>
);

export const BookIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    <path d="M12 2v20" strokeDasharray="2 2" />
    <path d="M8 6h2M8 10h2M14 6h2M14 10h2" />
    <path d="M8 14h2M14 14h2" strokeOpacity="0.5" />
  </svg>
);

export const DownloadIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 3v14M8 13l4 4 4-4" />
    <path d="M4 21h16" strokeDasharray="4 4" />
    <path d="M12 3v14" strokeDasharray="2 2" strokeOpacity="0.5" />
  </svg>
);

export const BookmarkIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M5 3v18l7-4 7 4V3H5z" />
    <path d="M9 7h6M9 11h4" />
    <path d="M9 15h2" strokeOpacity="0.5" />
  </svg>
);

export const LibraryIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 4v16M8 4v16M12 4v16M16 4v16M20 4v16" strokeDasharray="2 2" />
    <path d="M2 20h20M2 4h20" />
    <path d="M4 8h16M4 12h16M4 16h16" strokeOpacity="0.2" />
  </svg>
);

export const MusicIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
    <path d="M9 9l12-2" strokeDasharray="2 2" strokeOpacity="0.5" />
  </svg>
);

export const MicrophoneIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="9" y="1" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <line x1="12" y1="17" x2="12" y2="22" />
    <line x1="8" y1="22" x2="16" y2="22" />
    <circle cx="12" cy="7" r="1" fill="currentColor" opacity="0.4" />
  </svg>
);

export const MicOffIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="9" y="1" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <line x1="12" y1="17" x2="12" y2="22" />
    <line x1="8" y1="22" x2="16" y2="22" />
    <line x1="2" y1="2" x2="22" y2="22" strokeWidth="2" />
  </svg>
);

export const LiveIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="3" fill="currentColor" />
    <path d="M16.24 7.76a6 6 0 0 1 0 8.49" />
    <path d="M7.76 16.24a6 6 0 0 1 0-8.49" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    <path d="M4.93 19.07a10 10 0 0 1 0-14.14" />
  </svg>
);

export const ChevronLeftIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

export const ChevronRightIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M9 18l6-6-6-6" />
  </svg>
);

