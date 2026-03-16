import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface AgentActivityLogProps {
  agentActivity: string[];
  isGenerating?: boolean;
}

function parseActivityEntry(msg: string) {
  const arrowIdx = msg.indexOf('->');
  if (arrowIdx === -1) {
    return { agent: '', action: msg, isComplete: msg.includes('complete') || msg.includes('Complete') };
  }
  const agent = msg.slice(0, arrowIdx).trim();
  const action = msg.slice(arrowIdx + 2).trim();
  const isComplete = false;
  const isTool = agent.startsWith('generate_') || agent.startsWith('compute_') || agent === 'lyria-realtime';
  return { agent, action, isComplete, isTool };
}

export default function AgentActivityLog({ agentActivity, isGenerating }: AgentActivityLogProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const entries = agentActivity.slice(-6);
  const latestEntry = entries[entries.length - 1];
  const parsed = latestEntry ? parseActivityEntry(latestEntry) : null;

  return (
    <div className="agent-activity-container" style={{ maxWidth: 720, margin: '0 auto 24px' }}>
      <button
        className="agent-activity-header"
        onClick={() => setIsExpanded(prev => !prev)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`activity-dot ${isGenerating ? 'activity-dot-active' : 'activity-dot-done'}`} />
          <span className="activity-header-label">Agent Pipeline</span>
          {!isExpanded && parsed && (
            <span className="activity-header-latest">
              {parsed.agent ? `${parsed.agent}: ` : ''}{parsed.action.length > 40 ? parsed.action.slice(0, 40) + '...' : parsed.action}
            </span>
          )}
        </div>
        <span className={`activity-chevron ${isExpanded ? 'expanded' : ''}`}>&#9662;</span>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="agent-activity-entries">
              {entries.map((msg, i) => {
                const entry = parseActivityEntry(msg);
                const isLast = i === entries.length - 1;
                return (
                  <div key={i} className={`activity-entry ${isLast && isGenerating ? 'activity-entry-active' : ''}`}>
                    <span className={`activity-entry-dot ${entry.isComplete ? 'dot-complete' : isLast && isGenerating ? 'dot-active' : 'dot-done'}`} />
                    {entry.agent && (
                      <span className={`activity-entry-badge ${entry.isTool ? 'badge-tool' : 'badge-agent'}`}>
                        {entry.agent}
                      </span>
                    )}
                    <span className="activity-entry-text">
                      {entry.action.length > 60 ? entry.action.slice(0, 60) + '...' : entry.action}
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
