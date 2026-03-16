const MOODS = [
  { kw: ['battle', 'war', 'fight', 'sword', 'army'], prompt: 'epic orchestral fantasy battle music, dramatic brass and percussion' },
  { kw: ['dark', 'shadow', 'evil', 'death', 'fear'], prompt: 'dark atmospheric ambient music, mysterious and foreboding, low strings' },
  { kw: ['love', 'heart', 'kiss', 'romance', 'tender'], prompt: 'romantic gentle piano and strings, warm emotional melody' },
  { kw: ['space', 'star', 'galaxy', 'planet', 'cosmos'], prompt: 'ethereal space ambient music, synthesizer pads, cosmic atmosphere' },
  { kw: ['ocean', 'sea', 'water', 'wave', 'underwater'], prompt: 'calm oceanic ambient music, flowing water sounds, gentle piano' },
  { kw: ['forest', 'tree', 'nature', 'garden', 'wild'], prompt: 'enchanted forest ambient music, gentle flute and harp, nature sounds' },
  { kw: ['city', 'neon', 'cyberpunk', 'tech', 'robot'], prompt: 'synthwave cyberpunk ambient music, electronic pads and bass' },
  { kw: ['magic', 'spell', 'wizard', 'enchant', 'mystic'], prompt: 'mystical fantasy ambient music, ethereal vocals and chimes' },
  { kw: ['adventure', 'quest', 'journey', 'explore', 'discover'], prompt: 'adventurous orchestral music, soaring strings and triumphant horns' },
  { kw: ['comedy', 'funny', 'laugh', 'joke', 'silly'], prompt: 'lighthearted playful music, pizzicato strings and bouncy woodwinds' },
  { kw: ['horror', 'ghost', 'haunted', 'scream', 'nightmare'], prompt: 'tense horror ambient music, dissonant strings and eerie drones' },
  { kw: ['mystery', 'detective', 'clue', 'secret', 'puzzle'], prompt: 'suspenseful mystery music, muted piano and subtle tension building' },
  { kw: ['castle', 'kingdom', 'medieval', 'knight', 'throne'], prompt: 'medieval fantasy music, lute and recorder with regal brass' },
  { kw: ['fairy', 'dream', 'whimsy', 'wonder', 'sparkle'], prompt: 'whimsical fairy-tale music, celesta and gentle strings with magical chimes' },
] as const;

export function extractMoodPrompt(storyText: string): string {
  const lower = storyText.toLowerCase();
  for (const m of MOODS) {
    if (m.kw.some(k => lower.includes(k))) return m.prompt;
  }
  return 'gentle cinematic ambient background music, soft strings and piano';
}
