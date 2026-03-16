export type StoryPart =
  | { type: 'text'; text: string; id: string; audioUrl?: string; audioBase64?: string; isPlaying?: boolean; isLoadingAudio?: boolean }
  | { type: 'image'; url: string; id: string; isLoading?: boolean; prompt?: string; error?: string }
  | { type: 'video'; url: string; id: string; prompt?: string; error?: string };

export type GraphNode = {
  type: 'character' | 'location';
  name: string;
  traits: string[];
  storyIds: string[];
};

export type GraphEdge = { from: string; to: string; relation: string };

export type MemoryGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

export type TranscriptEntry = {
  role: string;
  text: string;
  image?: string;
  video?: string;
};

export interface SavedStory {
  id: string;
  title?: string;
  parts?: string;
  leadImage?: string;
  embedding?: number[];
  createdAt?: { seconds: number };
  authorId?: string;
  isPublic?: boolean;
  authorName?: string;
  [key: string]: any;
}
