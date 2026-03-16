import { useState, useEffect, useRef, useCallback } from 'react';
import { createLiveClient, type LiveCallbacks } from '../liveClient';
import { getADKServerURL, generateImageViaADK } from '../adkClient';
import type { TranscriptEntry } from '../types';

interface UseLiveModeParams {
  showToast: (message: string, type?: 'success' | 'error') => void;
}

function isModelThinking(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const thinkingPatterns = [
    /^I'm (?:focusing|building|placing|back|concentrating|thinking|considering|planning|setting|establishing|creating|working|going|trying|aiming|starting|continuing|picking|crafting|developing|imagining|visualizing|designing|solidifying|introducing|refining|now |about to )/i,
    /^I (?:see|need|want|should|will|must|have|am|think|feel|believe|notice|observe|decide|chose|aim|plan|intend|envision|imagine|visualize) (?:this|that|it|her|him|them|the|a|an|my|our) /i,
    /^I've (?:introduced|established|created|built|set|started|continued|finished|completed|just|now|successfully)/i,
    /^(?:My (?:strategy|goal|plan|focus|approach|visual prompt|musical choice)|The (?:goal|idea|plan|key|next step|focus|musical|score) (?:now |here |is |has ))/i,
    /^(?:Audio Worklet|Note:|TODO:|FYI:)/i,
    /generate_image|function call|tool call/i,
  ];

  return thinkingPatterns.some(p => p.test(trimmed));
}

export function useLiveMode({ showToast }: UseLiveModeParams) {
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [isLiveConnecting, setIsLiveConnecting] = useState(false);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState<TranscriptEntry[]>([]);
  const [liveToolStatus, setLiveToolStatus] = useState('');
  const liveClientRef = useRef<ReturnType<typeof createLiveClient> | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const liveTranscriptEndRef = useRef<HTMLDivElement>(null);
  const turnCountRef = useRef(0);
  const isGeneratingImageRef = useRef(false);
  const lastImageTurnRef = useRef(0);
  const pendingTextRef = useRef('');
  const styleContextRef = useRef('');
  const thinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startThinking = () => {
    if (thinkingTimerRef.current) clearTimeout(thinkingTimerRef.current);
    setLiveToolStatus('Composing your story...');
    thinkingTimerRef.current = setTimeout(() => {
      setLiveToolStatus('Weaving narrative and visuals...');
      thinkingTimerRef.current = setTimeout(() => {
        setLiveToolStatus('Almost ready...');
      }, 8000);
    }, 5000);
  };

  const stopThinking = () => {
    if (thinkingTimerRef.current) {
      clearTimeout(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
  };

  const stopLiveMode = useCallback(() => {
    liveClientRef.current?.stop();
    liveClientRef.current = null;
    sessionTokenRef.current = null;
    setIsLiveMode(false);
    setIsLiveConnected(false);
    setIsLiveConnecting(false);
    setIsMuted(false);
  }, []);

  const startLiveMode = useCallback(async (token?: string | null) => {
    const adkUrl = getADKServerURL();
    if (!adkUrl) {
      showToast('ADK server not available for Live Mode', 'error');
      return;
    }

    setIsLiveConnecting(true);
    if (!token) {
      setLiveTranscript([]);
    }
    setLiveToolStatus('');

    const callbacks: LiveCallbacks = {
      onConnected: () => {
        setIsLiveConnecting(false);
        setIsLiveConnected(true);
        if (!token) {
          setLiveTranscript(prev => [...prev, { role: 'system', text: 'Connected to OmniWeave Live. Start speaking to create your story...' }]);
        } else {
          setLiveTranscript(prev => [...prev, { role: 'system', text: 'Session resumed.' }]);
        }
      },
      onText: (text) => {
        if (isModelThinking(text)) return;
        stopThinking();
        setLiveToolStatus('');

        pendingTextRef.current += text;
        setLiveTranscript(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && !last.image && !last.video) {
            return [...prev.slice(0, -1), { ...last, text: last.text + text }];
          }
          return [...prev, { role: 'assistant', text }];
        });
        setLiveToolStatus('');
      },
      onAudio: () => { stopThinking(); setLiveToolStatus(''); },
      onUserSpeech: () => {
        startThinking();
      },
      onImage: (dataUri) => {
        setLiveTranscript(prev => [...prev, { role: 'image', text: '', image: dataUri }]);
        setLiveToolStatus('');
      },
      onVideo: (videoUrl) => {
        setLiveTranscript(prev => [...prev, { role: 'video', text: '', video: videoUrl }]);
        setLiveToolStatus('');
      },
      onToolCall: (toolName, message) => {
        setLiveToolStatus(`${toolName}: ${message}`);
      },
      onSessionToken: (newToken) => {
        sessionTokenRef.current = newToken;
      },
      onTurnComplete: () => {
        setLiveToolStatus('');
        turnCountRef.current += 1;
        const turnText = pendingTextRef.current.trim();
        pendingTextRef.current = '';

        if (turnCountRef.current <= 2 && turnText.length > 30) {
          styleContextRef.current = turnText.slice(0, 600);
        }

        const turnsSinceLastImage = turnCountRef.current - lastImageTurnRef.current;
        if (
          turnText.length > 50 &&
          !isModelThinking(turnText) &&
          turnCountRef.current > 1 &&
          turnsSinceLastImage >= 3 &&
          !isGeneratingImageRef.current
        ) {
          isGeneratingImageRef.current = true;
          lastImageTurnRef.current = turnCountRef.current;
          const stylePrefix = styleContextRef.current
            ? `Maintain consistent art style and character appearances from this context: ${styleContextRef.current.slice(0, 300)}. `
            : '';
          const imagePrompt = `${stylePrefix}Cinematic 16:9 illustration. ${turnText.slice(0, 500)}`;
          setLiveToolStatus('generate_image: Illustrating scene...');
          generateImageViaADK(imagePrompt).then(result => {
            if (result.imageDataUri) {
              setLiveTranscript(prev => [...prev, { role: 'image', text: '', image: result.imageDataUri }]);
            }
            setLiveToolStatus('');
            isGeneratingImageRef.current = false;
          }).catch(() => {
            setLiveToolStatus('');
            isGeneratingImageRef.current = false;
          });
        }
      },
      onError: (message) => {
        setLiveTranscript(prev => [...prev, { role: 'error', text: message }]);
        setLiveToolStatus('');
      },
      onDisconnected: () => {
        setIsLiveConnected(false);
        setIsLiveConnecting(false);
        liveClientRef.current?.stop();
        liveClientRef.current = null;
        if (sessionTokenRef.current) {
          setLiveTranscript(prev => [...prev, { role: 'system', text: 'Connection lost. Attempting to resume...' }]);
          setTimeout(() => {
            startLiveMode(sessionTokenRef.current);
          }, 3000);
        } else {
          setLiveTranscript(prev => [...prev, { role: 'system', text: 'Disconnected from Live session.' }]);
        }
      },
    };

    try {
      const client = createLiveClient(adkUrl, callbacks);
      liveClientRef.current = client;
      await client.start(token || undefined);
      setIsLiveMode(true);
    } catch (err: any) {
      setIsLiveConnecting(false);
      setIsLiveMode(false);
      showToast(err.message || 'Failed to start Live Mode', 'error');
    }
  }, [showToast]);

  const toggleMute = useCallback(() => {
    if (liveClientRef.current) {
      const muted = liveClientRef.current.toggleMute();
      setIsMuted(muted);
    }
  }, []);

  const sendLiveText = useCallback((text: string) => {
    if (liveClientRef.current && text.trim()) {
      liveClientRef.current.sendText(text.trim());
      setLiveTranscript(prev => [...prev, { role: 'user', text: text.trim() }]);
      startThinking();
    }
  }, []);

  useEffect(() => {
    return () => {
      liveClientRef.current?.stop();
      liveClientRef.current = null;
      stopThinking();
    };
  }, []);

  useEffect(() => {
    liveTranscriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [liveTranscript]);

  useEffect(() => {
    const handleLiveKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === 'l' || e.key === 'L') {
        if (isLiveMode) {
          stopLiveMode();
        } else {
          startLiveMode();
        }
      }
    };
    window.addEventListener('keydown', handleLiveKey);
    return () => window.removeEventListener('keydown', handleLiveKey);
  }, [isLiveMode, startLiveMode, stopLiveMode]);

  return {
    isLiveMode,
    isLiveConnecting,
    isLiveConnected,
    isMuted,
    liveTranscript,
    liveToolStatus,
    liveTranscriptEndRef,
    startLiveMode,
    stopLiveMode,
    toggleMute,
    sendLiveText,
  };
}
