import { motion } from 'motion/react';

interface EmbeddingVizProps {
  embedding: number[];
}

export default function EmbeddingViz({ embedding }: EmbeddingVizProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
      className="embedding-viz">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span className="embedding-viz-title">Story Fingerprint</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--brass)' }}>{embedding.length}D embedding</span>
      </div>
      <div className="embedding-bars">
        {embedding.slice(0, 128).map((val, i) => (
          <div key={i} className="embedding-bar" style={{
            backgroundColor: val > 0 ? 'var(--vermillion)' : 'var(--brass)',
            height: `${Math.min(100, Math.abs(val) * 1500)}%`,
            opacity: Math.min(0.8, Math.abs(val) * 15)
          }} />
        ))}
      </div>
    </motion.div>
  );
}
