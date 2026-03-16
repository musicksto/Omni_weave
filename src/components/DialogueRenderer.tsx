import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';

const CHARACTER_COLORS = [
  '#c23b22',
  '#2a9d8f',
  '#264653',
  '#7b2d8e',
  '#52734d',
  '#e76f51',
  '#546a76',
  '#722f37',
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getCharacterColor(name: string): string {
  return CHARACTER_COLORS[hashName(name) % CHARACTER_COLORS.length];
}

interface DialogueSegment {
  speaker: string;
  text: string;
  isNarrator: boolean;
}

function parseDialogue(text: string): DialogueSegment[] {
  const segments: DialogueSegment[] = [];
  const pattern = /(?:^|\n)\s*(?:\*\*)?([A-Z][A-Za-z0-9_ ]{1,20})(?:\*\*)?:\s*/g;

  const matches: { speaker: string; index: number; fullMatchEnd: number }[] = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    matches.push({
      speaker: match[1].trim(),
      index: match.index,
      fullMatchEnd: match.index + match[0].length,
    });
  }

  if (matches.length === 0) {
    return [{ speaker: '', text: text.trim(), isNarrator: false }];
  }

  if (matches[0].index > 0) {
    const preamble = text.slice(0, matches[0].index).trim();
    if (preamble) {
      segments.push({ speaker: '', text: preamble, isNarrator: false });
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const textStart = matches[i].fullMatchEnd;
    const textEnd = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const segmentText = text.slice(textStart, textEnd).trim();
    const speaker = matches[i].speaker;

    if (segmentText) {
      segments.push({
        speaker,
        text: segmentText,
        isNarrator: speaker.toLowerCase() === 'narrator',
      });
    }
  }

  return segments;
}

function fixMarkdownBold(text: string): string {
  return text
    .replace(/\*{4,}/g, ' — ')
    .replace(/\*\*\s+(.+?)\s+\*\*/g, '**$1**');
}

interface DialogueRendererProps {
  text: string;
}

export default function DialogueRenderer({ text }: DialogueRendererProps) {
  const segments = useMemo(() => parseDialogue(text), [text]);

  if (segments.length === 1 && !segments[0].speaker) {
    return (
      <div className="story-text">
        <ReactMarkdown>{fixMarkdownBold(segments[0].text)}</ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="dialogue-container">
      {segments.map((seg, i) => {
        if (!seg.speaker) {
          return (
            <div key={i} className="story-text">
              <ReactMarkdown>{fixMarkdownBold(seg.text)}</ReactMarkdown>
            </div>
          );
        }

        const color = seg.isNarrator ? undefined : getCharacterColor(seg.speaker);

        return (
          <div
            key={i}
            className={`dialogue-segment ${seg.isNarrator ? 'dialogue-narrator' : 'dialogue-character'}`}
          >
            <div
              className={`dialogue-badge ${seg.isNarrator ? 'dialogue-badge-narrator' : ''}`}
              style={!seg.isNarrator ? { backgroundColor: color, color: 'white' } : undefined}
            >
              {seg.speaker}
            </div>
            <div
              className={`dialogue-text ${seg.isNarrator ? 'dialogue-text-narrator' : 'dialogue-text-character'}`}
              style={!seg.isNarrator ? { borderLeftColor: color } : undefined}
            >
              <ReactMarkdown>{fixMarkdownBold(seg.text)}</ReactMarkdown>
            </div>
          </div>
        );
      })}
    </div>
  );
}
