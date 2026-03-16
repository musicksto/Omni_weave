import React, { memo } from 'react';

export type IconProps = {
  className?: string;
  size?: number | string;
  strokeWidth?: number;
  style?: React.CSSProperties;
};

type IconBaseProps = IconProps & {
  children: React.ReactNode;
  viewBox?: string;
};

const IconBase = memo(
  ({
    className = '',
    size = 24,
    strokeWidth = 1.5,
    style,
    viewBox = '0 0 24 24',
    children,
  }: IconBaseProps) => (
    <svg
      viewBox={viewBox}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
);

IconBase.displayName = 'IconBase';

export const QuillIcon = memo(({ ...props }: IconProps) => (
  <IconBase {...props}>
    <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
    <line x1="16" y1="8" x2="2" y2="22" />
    <line x1="17.5" y1="15" x2="9" y2="6.5" />
  </IconBase>
));
QuillIcon.displayName = 'QuillIcon';

export const PlayIcon = memo(({ ...props }: IconProps) => (
  <IconBase {...props}>
    <circle cx="12" cy="12" r="10" />
    <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
  </IconBase>
));
PlayIcon.displayName = 'PlayIcon';

export const StopIcon = memo(({ ...props }: IconProps) => (
  <IconBase {...props}>
    <circle cx="12" cy="12" r="10" />
    <rect x="9" y="9" width="6" height="6" rx="0.5" fill="currentColor" stroke="none" />
  </IconBase>
));
StopIcon.displayName = 'StopIcon';

export const SpinnerIcon = memo(({ ...props }: IconProps) => (
  <IconBase {...props}>
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    <circle cx="12" cy="12" r="3" />
  </IconBase>
));
SpinnerIcon.displayName = 'SpinnerIcon';

export const ArrowRightIcon = memo(({ ...props }: IconProps) => (
  <IconBase {...props}>
    <path d="M5 12h14M13 5l7 7-7 7" />
  </IconBase>
));
ArrowRightIcon.displayName = 'ArrowRightIcon';

export const CheckIcon = memo(({ ...props }: IconProps) => (
  <IconBase {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="M8 12l3 3 5-6" strokeWidth="2" />
  </IconBase>
));
CheckIcon.displayName = 'CheckIcon';

export const AlertIcon = memo(({ ...props }: IconProps) => (
  <IconBase {...props}>
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2" />
  </IconBase>
));
AlertIcon.displayName = 'AlertIcon';

export const BookIcon = memo(({ ...props }: IconProps) => (
  <IconBase {...props}>
    <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    <path d="M8 7h8M8 11h6M8 15h4" />
  </IconBase>
));
BookIcon.displayName = 'BookIcon';

export const DownloadIcon = memo(({ ...props }: IconProps) => (
  <IconBase {...props}>
    <path d="M12 3v14M8 13l4 4 4-4" />
    <path d="M4 21h16" />
  </IconBase>
));
DownloadIcon.displayName = 'DownloadIcon';

export const BookmarkIcon = memo(({ ...props }: IconProps) => (
  <IconBase {...props}>
    <path d="M5 3v18l7-4 7 4V3H5z" />
    <path d="M9 7h6M9 11h4" />
  </IconBase>
));
BookmarkIcon.displayName = 'BookmarkIcon';

/* Library — three books standing upright on a shelf */
export const LibraryIcon = memo(({ ...props }: IconProps) => (
  <IconBase {...props}>
    <rect x="4" y="3" width="4" height="17" rx="1" />
    <rect x="10" y="5" width="4" height="15" rx="1" />
    <rect x="16" y="2" width="4" height="18" rx="1" />
    <path d="M3 21h18" />
  </IconBase>
));
LibraryIcon.displayName = 'LibraryIcon';

export const MusicIcon = memo(({ ...props }: IconProps) => (
  <IconBase {...props}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </IconBase>
));
MusicIcon.displayName = 'MusicIcon';

export const MicrophoneIcon = memo(({ ...props }: IconProps) => (
  <IconBase {...props}>
    <rect x="9" y="1" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0014 0" />
    <line x1="12" y1="17" x2="12" y2="22" />
    <line x1="8" y1="22" x2="16" y2="22" />
  </IconBase>
));
MicrophoneIcon.displayName = 'MicrophoneIcon';

export const MicOffIcon = memo(({ ...props }: IconProps) => (
  <IconBase {...props}>
    <rect x="9" y="1" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0014 0" />
    <line x1="12" y1="17" x2="12" y2="22" />
    <line x1="8" y1="22" x2="16" y2="22" />
    <line x1="2" y1="2" x2="22" y2="22" strokeWidth="2" />
  </IconBase>
));
MicOffIcon.displayName = 'MicOffIcon';

export const LiveIcon = memo(({ ...props }: IconProps) => (
  <IconBase {...props}>
    <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    <path d="M16.24 7.76a6 6 0 010 8.49" />
    <path d="M7.76 16.24a6 6 0 010-8.49" />
    <path d="M19.07 4.93a10 10 0 010 14.14" />
    <path d="M4.93 19.07a10 10 0 010-14.14" />
  </IconBase>
));
LiveIcon.displayName = 'LiveIcon';

export const ChevronLeftIcon = memo(({ ...props }: IconProps) => (
  <IconBase {...props} strokeWidth={props.strokeWidth ?? 2}>
    <path d="M15 18l-6-6 6-6" />
  </IconBase>
));
ChevronLeftIcon.displayName = 'ChevronLeftIcon';

export const ChevronRightIcon = memo(({ ...props }: IconProps) => (
  <IconBase {...props} strokeWidth={props.strokeWidth ?? 2}>
    <path d="M9 18l6-6-6-6" />
  </IconBase>
));
ChevronRightIcon.displayName = 'ChevronRightIcon';

/* Memory — brain with neural connections */
export const BrainIcon = memo(({ ...props }: IconProps) => (
  <IconBase {...props}>
    <path d="M12 2C9 2 7 4 7 6.5c0 1-.4 2-1.2 2.7C4.5 10.4 4 12 4 13.5 4 16 5.5 18 8 19l4 3 4-3c2.5-1 4-3 4-5.5 0-1.5-.5-3.1-1.8-4.3C17.4 8.5 17 7.5 17 6.5 17 4 15 2 12 2z" />
    <path d="M12 2v20" strokeOpacity="0.3" />
    <circle cx="9" cy="9" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="9" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="14" r="1" fill="currentColor" stroke="none" />
    <path d="M9 9l3 5M15 9l-3 5" strokeOpacity="0.5" />
  </IconBase>
));
BrainIcon.displayName = 'BrainIcon';