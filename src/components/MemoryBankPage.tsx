import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import type { MemoryGraph } from '../types';

interface MemoryBankPageProps {
  memoryGraph: MemoryGraph | null;
  isLoading: boolean;
  onBack: () => void;
  onRefresh: () => void;
}

export default function MemoryBankPage({ memoryGraph, isLoading, onBack, onRefresh }: MemoryBankPageProps) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const nodes = memoryGraph?.nodes || [];
  const edges = memoryGraph?.edges || [];

  useEffect(() => { setSelectedNode(null); }, [memoryGraph]);
  const characters = nodes.filter(n => n.type === 'character');
  const locations = nodes.filter(n => n.type === 'location');

  const graphNodes = nodes.slice(0, 20);
  const centerX = 200;
  const centerY = 200;
  const radius = 150;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="memory-bank-page"
      style={{ maxWidth: 1000, margin: '0 auto', padding: '72px clamp(24px, 4vw, 40px) 40px', overflow: 'auto' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 48 }}>
        <h2 className="section-title">
          Memory <em style={{ fontStyle: 'italic', color: 'var(--vermillion)' }}>Bank</em>
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onRefresh} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.7rem' }}>
            Refresh
          </button>
          <button onClick={onBack} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.7rem' }}>
            Back
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '96px 0', gap: 16 }}>
          <div className="generating-dot" style={{ width: 12, height: 12 }}></div>
          <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--frame-dim)' }}>
            Loading memory graph...
          </p>
        </div>
      ) : nodes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '96px 0', fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '1.1rem', color: 'var(--frame-dim)' }}>
          No entities yet. Generate and save stories to build your memory bank.
        </div>
      ) : (
        <>
          <div className="memory-stats-bar">
            <div className="memory-stat">
              <span className="memory-stat-value">{characters.length}</span>
              <span className="memory-stat-label">Characters</span>
            </div>
            <div className="memory-stat">
              <span className="memory-stat-value">{locations.length}</span>
              <span className="memory-stat-label">Locations</span>
            </div>
            <div className="memory-stat">
              <span className="memory-stat-value">{edges.length}</span>
              <span className="memory-stat-label">Connections</span>
            </div>
            <div className="memory-stat">
              <span className="memory-stat-value">{new Set(nodes.flatMap(n => n.storyIds)).size}</span>
              <span className="memory-stat-label">Stories</span>
            </div>
          </div>

          {graphNodes.length > 1 && (
            <div className="memory-graph-container">
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--frame-dim)', marginBottom: 16 }}>
                Entity Graph
                {nodes.length > 20 && <span style={{ opacity: 0.5 }}> (showing 20 of {nodes.length})</span>}
              </div>
              <svg viewBox="0 0 400 400" className="memory-graph-svg">
                {edges.map((edge, i) => {
                  const fromIdx = graphNodes.findIndex(n => n.name === edge.from);
                  const toIdx = graphNodes.findIndex(n => n.name === edge.to);
                  if (fromIdx === -1 || toIdx === -1) return null;
                  const fromAngle = (fromIdx / graphNodes.length) * Math.PI * 2 - Math.PI / 2;
                  const toAngle = (toIdx / graphNodes.length) * Math.PI * 2 - Math.PI / 2;
                  const x1 = centerX + radius * Math.cos(fromAngle);
                  const y1 = centerY + radius * Math.sin(fromAngle);
                  const x2 = centerX + radius * Math.cos(toAngle);
                  const y2 = centerY + radius * Math.sin(toAngle);
                  const isConnected = selectedNode === null || edge.from === selectedNode || edge.to === selectedNode;
                  return (
                    <line key={`edge-${i}`} x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke={isConnected && selectedNode ? 'var(--vermillion)' : 'var(--frame-ghost)'}
                      strokeWidth={isConnected && selectedNode ? 1.5 : 1}
                      className={selectedNode ? (isConnected ? 'memory-graph-edge-highlighted' : 'memory-graph-edge-dimmed') : ''}
                    />
                  );
                })}
                {graphNodes.map((node, i) => {
                  const angle = (i / graphNodes.length) * Math.PI * 2 - Math.PI / 2;
                  const x = centerX + radius * Math.cos(angle);
                  const y = centerY + radius * Math.sin(angle);
                  const color = node.type === 'character' ? 'var(--vermillion)' : 'var(--brass)';
                  const isSelected = selectedNode === node.name;
                  return (
                    <g key={`node-${i}`} onClick={() => {
                      const next = isSelected ? null : node.name;
                      setSelectedNode(next);
                      if (next && cardRefs.current[next]) {
                        cardRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                      }
                    }} className="memory-graph-node-clickable">
                      <circle cx={x} cy={y} r={isSelected ? 10 : 8} fill={color}
                        opacity={isSelected ? 1 : 0.8}
                        className={isSelected ? 'memory-graph-node-selected' : ''}
                      />
                      <text x={x} y={y + 22} textAnchor="middle"
                        style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', fill: isSelected ? 'var(--frame-text)' : 'var(--frame-dim)', pointerEvents: 'none' }}>
                        {node.name.length > 12 ? node.name.slice(0, 12) + '...' : node.name}
                      </text>
                    </g>
                  );
                })}
              </svg>
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--frame-dim)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--vermillion)', opacity: 0.8, display: 'inline-block' }} /> Characters
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--frame-dim)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brass)', opacity: 0.8, display: 'inline-block' }} /> Locations
                </span>
              </div>
            </div>
          )}

          <div style={{ marginTop: 32 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--frame-dim)', marginBottom: 16 }}>
              Entities ({nodes.length})
            </div>
            <div className="memory-entity-grid">
              {nodes.map((node, i) => (
                <motion.div key={i} whileHover={{ y: -2 }}
                  ref={(el) => { cardRefs.current[node.name] = el; }}
                  className={`memory-entity-card${selectedNode === node.name ? ' card-selected' : ''}`}
                  onClick={() => setSelectedNode(selectedNode === node.name ? null : node.name)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="memory-entity-header">
                    <span className={`memory-entity-type memory-entity-type-${node.type}`}>
                      {node.type}
                    </span>
                    <span className="memory-entity-stories">
                      {node.storyIds.length} {node.storyIds.length === 1 ? 'story' : 'stories'}
                    </span>
                  </div>
                  <div className="memory-entity-name">{node.name}</div>
                  {node.traits.length > 0 && (
                    <div className="memory-entity-traits">
                      {node.traits.map((trait, ti) => (
                        <span key={ti} className="memory-entity-trait">{trait}</span>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>

          {edges.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--frame-dim)', marginBottom: 16 }}>
                Relationships ({edges.length})
              </div>
              <div className="memory-edge-list">
                {edges.map((edge, i) => (
                  <div key={i} className="memory-edge-row">
                    <span className="memory-edge-from">{edge.from}</span>
                    <span className="memory-edge-relation">{edge.relation}</span>
                    <span className="memory-edge-to">{edge.to}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
