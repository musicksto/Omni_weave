export const PROMPT_SUGGESTIONS = [
  { label: 'Cyberpunk Noir', prompt: 'A cyberpunk detective exploring a neon-lit underwater city, searching for a stolen AI consciousness' },
  { label: 'Fantasy Quest', prompt: 'A young alchemist discovers a living map that leads to the last dragon egg hidden in a floating mountain kingdom' },
  { label: 'Space Opera', prompt: 'Two rival starship captains must work together when they discover an ancient alien signal coming from inside a dying star' },
  { label: 'Folklore Retold', prompt: 'A modern retelling of a Japanese folktale where a spirit fox runs a late-night ramen shop in rainy Tokyo' },
] as const;

export const PIPELINE_STEPS = [
  { label: 'Live Voice', model: 'gemini-2.5-flash-audio', desc: 'Bidi-streaming voice interaction' },
  { label: 'Story Writing', model: 'gemini-2.5-flash', desc: 'Cinematic scripts with character sheets' },
  { label: 'Quality Review', model: 'gemini-2.5-flash-lite', desc: 'Consistency & narrative polish' },
  { label: '1K Illustrations', model: 'gemini-3.1-flash-image', desc: 'Art-directed scene generation' },
  { label: 'Voice Casting', model: 'chirp-3-hd', desc: '28-voice HD narration' },
  { label: 'Ambient Score', model: 'lyria-realtime', desc: 'Mood-reactive background music' },
  { label: 'Story DNA', model: 'gemini-embedding-2', desc: 'Semantic similarity fingerprints' },
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];
export type PromptSuggestion = (typeof PROMPT_SUGGESTIONS)[number];

/** UI timing constants */
export const TOAST_DURATION = 3000;
export const NAV_HINT_DURATION = 4000;
export const LIVE_RECONNECT_DELAY = 3000;
