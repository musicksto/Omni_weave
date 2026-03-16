const FEMALE_VOICES_YOUNG = ['Leda', 'Aoede', 'Laomedeia'];
const FEMALE_VOICES_ADULT = ['Kore', 'Erinome', 'Despina'];
const FEMALE_VOICES_MATURE = ['Gacrux', 'Pulcherrima', 'Vindemiatrix'];
const FEMALE_VOICES_SOFT = ['Achernar', 'Sulafat', 'Callirrhoe'];

const MALE_VOICES_YOUNG = ['Puck', 'Fenrir', 'Sadachbia'];
const MALE_VOICES_ADULT = ['Charon', 'Orus', 'Iapetus'];
const MALE_VOICES_MATURE = ['Algenib', 'Rasalgethi', 'Schedar'];
const MALE_VOICES_DEEP = ['Alnilam', 'Sadaltager', 'Umbriel'];

const NARRATOR_VOICE = 'Zephyr';

const FEMALE_NAMES = new Set([
  'elara', 'luna', 'mira', 'aria', 'elena', 'aurora', 'selene', 'freya', 'nyx',
  'cassandra', 'isolde', 'lyra', 'ophelia', 'persephone', 'andromeda', 'calypso',
  'artemis', 'athena', 'gaia', 'hera', 'iris', 'juno', 'minerva', 'venus',
  'alice', 'bella', 'clara', 'diana', 'emma', 'fiona', 'grace', 'hannah',
  'ivy', 'julia', 'kate', 'lily', 'maya', 'nora', 'olivia', 'rose',
  'sarah', 'tessa', 'uma', 'vera', 'willow', 'xena', 'yara', 'zara',
  'anya', 'suki', 'mei', 'yuki', 'sakura', 'amara', 'kira', 'lena',
  'naomi', 'lira', 'aura', 'keiko', 'haruka', 'rei', 'asuka', 'nyx',
]);

const MALE_NAMES = new Set([
  'kai', 'marcus', 'orion', 'felix', 'atlas', 'cyrus', 'dorian', 'ezra',
  'griffin', 'hector', 'ivan', 'jasper', 'kael', 'leon', 'miles', 'nero',
  'oscar', 'phoenix', 'quinn', 'raven', 'silas', 'thane', 'ulric', 'victor',
  'wyatt', 'xander', 'york', 'zane', 'arthur', 'balthazar', 'cedric',
  'dante', 'edgar', 'faust', 'gideon', 'harold', 'isaiah', 'james',
  'karl', 'liam', 'magnus', 'noah', 'oliver', 'peter', 'rex',
  'stefan', 'thomas', 'uriel', 'vance', 'william', 'xavier',
  'kenji', 'gin', 'riku', 'hiro', 'takeshi', 'akira', 'elian',
]);

const FEMALE_SUFFIXES = ['ella', 'ina', 'ette', 'lyn', 'anne', 'ene', 'issa', 'ita', 'ia'];
const MALE_SUFFIXES = ['us', 'or', 'ix', 'ius', 'os', 'ard', 'ric', 'mund'];

const YOUNG_KEYWORDS = ['young', 'child', 'kid', 'teen', 'boy', 'girl', 'youthful', 'student', 'apprentice', 'little'];
const MATURE_KEYWORDS = ['old', 'elder', 'ancient', 'aged', 'wise', 'veteran', 'grandmother', 'grandfather', 'grizzled', 'weathered', 'gray hair', 'white hair'];
const TOUGH_KEYWORDS = ['gruff', 'scarred', 'muscular', 'warrior', 'soldier', 'captain', 'commander', 'rough', 'deep voice', 'battle'];
const SOFT_KEYWORDS = ['gentle', 'soft', 'quiet', 'shy', 'timid', 'kind', 'nurturing', 'healer', 'spirit', 'ethereal', 'mystical'];

export function guessGender(name: string): 'female' | 'male' | 'unknown' {
  const lower = name.toLowerCase().trim();
  if (lower === 'narrator') return 'unknown';
  if (FEMALE_NAMES.has(lower)) return 'female';
  if (MALE_NAMES.has(lower)) return 'male';
  for (const suffix of FEMALE_SUFFIXES) { if (lower.endsWith(suffix)) return 'female'; }
  for (const suffix of MALE_SUFFIXES) { if (lower.endsWith(suffix)) return 'male'; }
  if (lower.endsWith('a')) return 'female';
  return 'unknown';
}

function guessCharacterType(storyText: string, name: string): 'young' | 'adult' | 'mature' | 'tough' | 'soft' {
  const lower = storyText.toLowerCase();
  const nameIdx = lower.indexOf(name.toLowerCase());
  if (nameIdx === -1) return 'adult';

  const context = lower.substring(Math.max(0, nameIdx - 150), nameIdx + 300);

  if (YOUNG_KEYWORDS.some(k => context.includes(k))) return 'young';
  if (MATURE_KEYWORDS.some(k => context.includes(k))) return 'mature';
  if (TOUGH_KEYWORDS.some(k => context.includes(k))) return 'tough';
  if (SOFT_KEYWORDS.some(k => context.includes(k))) return 'soft';

  const ageMatch = context.match(/(?:age|aged?)\s*[:.]?\s*(\d+)/);
  if (ageMatch) {
    const age = parseInt(ageMatch[1]);
    if (age < 18) return 'young';
    if (age > 55) return 'mature';
  }

  return 'adult';
}

export function assignVoice(name: string, existing: Record<string, string>, storyText?: string): string {
  if (name === 'Narrator') return NARRATOR_VOICE;

  const gender = guessGender(name);
  const charType = storyText ? guessCharacterType(storyText, name) : 'adult';
  const used = new Set(Object.values(existing));

  let voicePool: string[];

  if (gender === 'female') {
    voicePool = charType === 'young' ? FEMALE_VOICES_YOUNG
      : charType === 'mature' ? FEMALE_VOICES_MATURE
      : charType === 'soft' ? FEMALE_VOICES_SOFT
      : FEMALE_VOICES_ADULT;
  } else if (gender === 'male') {
    voicePool = charType === 'young' ? MALE_VOICES_YOUNG
      : charType === 'mature' ? MALE_VOICES_MATURE
      : charType === 'tough' ? MALE_VOICES_DEEP
      : MALE_VOICES_ADULT;
  } else {
    const usedCount = Object.keys(existing).length;
    voicePool = usedCount % 2 === 0 ? MALE_VOICES_ADULT : FEMALE_VOICES_ADULT;
  }

  const pick = voicePool.find(v => !used.has(v));
  if (pick) return pick;

  const allGender = gender === 'female'
    ? [...FEMALE_VOICES_YOUNG, ...FEMALE_VOICES_ADULT, ...FEMALE_VOICES_MATURE, ...FEMALE_VOICES_SOFT]
    : gender === 'male'
      ? [...MALE_VOICES_YOUNG, ...MALE_VOICES_ADULT, ...MALE_VOICES_MATURE, ...MALE_VOICES_DEEP]
      : [...MALE_VOICES_ADULT, ...FEMALE_VOICES_ADULT];

  return allGender.find(v => !used.has(v)) || voicePool[0];
}
