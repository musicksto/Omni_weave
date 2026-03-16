import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface CharacterData {
  name: string;
  traits: Record<string, string>;
}

interface CharacterSheetData {
  artStyle: string;
  characters: CharacterData[];
}

interface CharacterSheetProps {
  data: CharacterSheetData;
}

export default function CharacterSheet({ data }: CharacterSheetProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!data || data.characters.length === 0) return null;

  return (
    <div className="character-sheet">
      <button
        className="character-sheet-toggle"
        onClick={() => setIsExpanded(prev => !prev)}
      >
        <span className="character-sheet-label">Production Notes</span>
        <span className="character-sheet-count">
          {data.characters.length} {data.characters.length === 1 ? 'character' : 'characters'}
        </span>
        <span className={`character-sheet-chevron ${isExpanded ? 'expanded' : ''}`}>
          &#9662;
        </span>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="character-sheet-content">
              {data.artStyle && (
                <div className="character-sheet-art-style">
                  {data.artStyle}
                </div>
              )}
              <div className="character-sheet-grid">
                {data.characters.map((char, i) => {
                  const voiceTrait = Object.entries(char.traits).find(([k]) => k.toLowerCase() === 'voice');
                  const otherTraits = Object.entries(char.traits).filter(([k]) => k.toLowerCase() !== 'voice');
                  return (
                    <div key={i} className="character-card">
                      <div className="character-card-name">{char.name}</div>
                      {voiceTrait && (
                        <div className="character-voice-badge">{voiceTrait[0]}: {voiceTrait[1]}</div>
                      )}
                      <div className="character-card-traits">
                        {otherTraits.map(([key, value]) => (
                          <div key={key} className="character-trait">
                            <span className="character-trait-key">{key}</span>
                            <span className="character-trait-value">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
