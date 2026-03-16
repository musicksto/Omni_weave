import { useState } from 'react';
import { signInAnonymously } from 'firebase/auth';
import { auth } from '../firebase';
import { getADKServerURL } from '../adkClient';
import type { MemoryGraph } from '../types';
import type { User as FirebaseUser } from 'firebase/auth';

interface UseMemoryBankParams {
  user: FirebaseUser | null;
  setUser: React.Dispatch<React.SetStateAction<FirebaseUser | null>>;
  setIsAuthReady: React.Dispatch<React.SetStateAction<boolean>>;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

export function useMemoryBank({ user, setUser, setIsAuthReady, showToast }: UseMemoryBankParams) {
  const [memoryGraph, setMemoryGraph] = useState<MemoryGraph | null>(null);
  const [isLoadingMemory, setIsLoadingMemory] = useState(false);
  const [showMemoryBank, setShowMemoryBank] = useState(false);

  const fetchMemoryBank = async () => {
    let currentUser = user;
    if (!currentUser) {
      try {
        const cred = await signInAnonymously(auth);
        currentUser = cred.user;
        setUser(currentUser);
        setIsAuthReady(true);
      } catch {
        showToast('Could not connect. Please try again.', 'error');
        return;
      }
    }
    try {
      const adkUrl = getADKServerURL();
      if (!adkUrl) return;
      const resp = await fetch(`${adkUrl}/api/memory-bank?uid=${currentUser.uid}`);
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.nodes && data.nodes.length > 0) {
        setMemoryGraph({ nodes: data.nodes, edges: data.edges || [] });
      }
    } catch (err) {
      console.warn('[MemoryBank] fetch error:', err);
      showToast('Could not load Memory Bank', 'error');
    }
  };

  const openMemoryBank = async () => {
    setIsLoadingMemory(true);
    setShowMemoryBank(true);
    await fetchMemoryBank();
    setIsLoadingMemory(false);
  };

  const extractToMemoryBank = async (storyId: string, storyText: string) => {
    if (!user || !storyText.trim()) return;
    try {
      const adkUrl = getADKServerURL();
      if (!adkUrl) return;
      await fetch(`${adkUrl}/api/memory-bank/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid, storyId, storyText }),
      });
      await fetchMemoryBank();
    } catch (err) {
      console.warn('[MemoryBank] extract error:', err);
    }
  };

  return {
    memoryGraph,
    isLoadingMemory,
    showMemoryBank,
    setShowMemoryBank,
    fetchMemoryBank,
    openMemoryBank,
    extractToMemoryBank,
  };
}
