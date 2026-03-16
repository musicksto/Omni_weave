import { useState } from 'react';
import { signInAnonymously, User as FirebaseUser } from 'firebase/auth';
import { collection, addDoc, getDocs, deleteDoc, doc, query, where, orderBy, limit as fbLimit, serverTimestamp } from 'firebase/firestore';
import { ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';
import type { StoryPart, SavedStory } from '../types';

interface SaveResult {
  success: boolean;
  error?: string;
  storyId?: string;
  fullText?: string;
}

export async function saveStoryAction(
  prevState: SaveResult | null,
  formData: {
    user: FirebaseUser | null;
    storyParts: StoryPart[];
    prompt: string;
    embedding: number[] | null;
    isPublic?: boolean;
  }
) {
  const { user, storyParts, prompt, embedding, isPublic = true } = formData;
  if (!user || storyParts.length === 0) {
    return { success: false, error: 'User not authenticated or no story parts to save' };
  }

  try {
    const partsToSave = storyParts.map(part => {
      if (part.type === 'image') return { ...part, url: '', isLoading: false };
      if (part.type === 'video') return { ...part, url: '' };
      if (part.type === 'text') return { ...part, audioUrl: undefined, audioBase64: undefined, isPlaying: false, isLoadingAudio: false };
      return part;
    });

    let leadImage = '';
    const firstImage = storyParts.find(p => p.type === 'image' || p.type === 'video');
    if (firstImage?.type === 'image' && firstImage.url) {
      try {
        const img = new Image();
        img.src = firstImage.url;
        await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; });
        const canvas = document.createElement('canvas');
        const maxDim = 320;
        const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          leadImage = canvas.toDataURL('image/jpeg', 0.6);
        }
      } catch { /* skip thumbnail on error */ }
    }

    const storyData: Record<string, unknown> = {
      authorId: user.uid,
      authorName: user.displayName || (user.isAnonymous ? 'Anonymous' : user.email || 'Unknown'),
      title: prompt || 'Untitled Story',
      parts: JSON.stringify(partsToSave),
      isPublic,
      createdAt: serverTimestamp()
    };
    if (embedding) storyData.embedding = embedding;
    if (leadImage && leadImage.length < 200000) storyData.leadImage = leadImage;

    const storyRef = await addDoc(collection(db, 'stories'), storyData);

    const mediaCol = collection(db, 'stories', storyRef.id, 'media');
    for (const part of storyParts) {
      if (part.type === 'image' && part.url && part.url.length > 0) {
        try {
          const imgRef = storageRef(storage, `stories/${storyRef.id}/${part.id}.img`);
          await uploadString(imgRef, part.url, 'data_url');
          const downloadUrl = await getDownloadURL(imgRef);
          await addDoc(mediaCol, { partId: part.id, type: 'image', storageUrl: downloadUrl });
        } catch (err: any) {
          console.warn('Failed to save image for', part.id, err.message);
        }
      }
      if (part.type === 'video' && part.url && part.url.length > 0) {
        try {
          const vidRef = storageRef(storage, `stories/${storyRef.id}/${part.id}.mp4`);
          await uploadString(vidRef, part.url, 'data_url');
          const downloadUrl = await getDownloadURL(vidRef);
          await addDoc(mediaCol, { partId: part.id, type: 'video', storageUrl: downloadUrl });
        } catch (err: any) {
          console.warn('Failed to save video for', part.id, err.message);
        }
      }
      if (part.type === 'text' && (part as any).audioBase64) {
        try {
          const audioRef = storageRef(storage, `stories/${storyRef.id}/${part.id}.audio`);
          await uploadString(audioRef, (part as any).audioBase64, 'base64');
          const downloadUrl = await getDownloadURL(audioRef);
          await addDoc(mediaCol, { partId: part.id, type: 'audio', storageUrl: downloadUrl });
        } catch (err: any) {
          console.warn('Failed to save audio for', part.id, err.message);
        }
      }
    }

    const fullText = storyParts
      .filter((p: any) => p.type === 'text')
      .map((p: any) => p.text)
      .join('\n\n');

    return { 
      success: true, 
      storyId: storyRef.id, 
      fullText 
    };
  } catch (error: any) {
    console.error('[saveStoryAction] Error:', error);
    return { success: false, error: error.message || 'Failed to save story' };
  }
}

interface UseStoryPersistenceParams {
  user: FirebaseUser | null;
  setUser: React.Dispatch<React.SetStateAction<FirebaseUser | null>>;
  setIsAuthReady: React.Dispatch<React.SetStateAction<boolean>>;
  showToast: (message: string, type?: 'success' | 'error') => void;
  storyParts: StoryPart[];
  prompt: string;
  embedding: number[] | null;
  adkAvailable: boolean;
  regenerateImage: (id: string, imagePrompt: string) => Promise<string | undefined>;
  setStoryParts: React.Dispatch<React.SetStateAction<StoryPart[]>>;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  setPrompt: React.Dispatch<React.SetStateAction<string>>;
  setEmbedding: React.Dispatch<React.SetStateAction<number[] | null>>;
  extractToMemoryBank: (storyId: string, storyText: string) => Promise<void>;
}

export function useStoryPersistence({
  user,
  setUser,
  setIsAuthReady,
  showToast,
  storyParts,
  prompt,
  embedding,
  adkAvailable,
  regenerateImage,
  setStoryParts,
  setCurrentPage,
  setPrompt,
  setEmbedding,
  extractToMemoryBank,
}: UseStoryPersistenceParams) {
  const [isLoadingStory, setIsLoadingStory] = useState(false);
  const [savedStories, setSavedStories] = useState<SavedStory[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);

  const loadLibrary = async () => {
    let currentUser = user;
    if (!currentUser) {
      showToast('Connecting to your library...', 'success');
      try {
        const cred = await signInAnonymously(auth);
        currentUser = cred.user;
        setUser(currentUser);
        setIsAuthReady(true);
      } catch (authErr) {
        console.error('Library auth retry failed:', authErr);
        showToast('Could not connect. Please check your connection and try again.', 'error');
        return;
      }
    }
    try {
      const q = query(collection(db, 'stories'), orderBy('createdAt', 'desc'), fbLimit(50));
      const querySnapshot = await getDocs(q);
      const stories = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as SavedStory));
      setSavedStories(stories);
      setShowLibrary(true);
    } catch (loadError) {
      handleFirestoreError(loadError, OperationType.LIST, 'stories', user);
    }
  };

  const saveToLibrary = async () => {
    if (storyParts.length === 0) return;
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
    
    const result = await saveStoryAction(null, { user: currentUser, storyParts, prompt, embedding });
    if (result.success) {
      showToast("Story saved with all media!");
      if (result.fullText) {
        void extractToMemoryBank(result.storyId!, result.fullText);
      }
    } else {
      showToast(result.error || "Save failed", 'error');
    }
  };

  const loadStory = async (story: SavedStory) => {
    setIsLoadingStory(true);
    setPrompt(story.title);
    setEmbedding(story.embedding || null);
    try {
      const parsedParts = JSON.parse(story.parts) as StoryPart[];

      try {
        const mediaCol = collection(db, 'stories', story.id, 'media');
        const mediaSnap = await getDocs(mediaCol);
        const mediaMap = new Map<string, { type: string; data?: string; storageUrl?: string }>();
        mediaSnap.docs.forEach(d => {
          const m = d.data();
          if (m.partId && (m.data || m.storageUrl)) mediaMap.set(`${m.partId}_${m.type}`, m as any);
        });

        const restoredParts = parsedParts.map(part => {
          if (part.type === 'image') {
            const media = mediaMap.get(`${part.id}_image`);
            if (media) {
              const url = media.storageUrl || media.data;
              if (url) return { ...part, url };
            }
          }
          if (part.type === 'video') {
            const media = mediaMap.get(`${part.id}_video`);
            if (media?.storageUrl) return { ...part, url: media.storageUrl };
          }
          if (part.type === 'text') {
            const media = mediaMap.get(`${part.id}_audio`);
            if (media && media.data) {
              const wavUrl = `data:audio/wav;base64,${media.data}`;
              return { ...part, audioBase64: media.data, audioUrl: wavUrl };
            }
            if (media && media.storageUrl) {
              return { ...part, audioUrl: media.storageUrl };
            }
          }
          return part;
        });
        setStoryParts(restoredParts);

        const isOwnStory = story.authorId === user?.uid;
        if (adkAvailable && isOwnStory) {
          const missingImages = restoredParts.filter(
            p => p.type === 'image' && !p.url && p.prompt
          );
          if (missingImages.length > 0 && mediaSnap.docs.length === 0) {
            showToast(`Restoring ${missingImages.length} images from an older save...`);
            for (let i = 0; i < missingImages.length; i += 2) {
              const batch = missingImages.slice(i, i + 2);
              const results = await Promise.allSettled(
                batch.map(img => regenerateImage(img.id, (img as any).prompt))
              );
              for (let j = 0; j < batch.length; j++) {
                const result = results[j];
                if (result.status === 'fulfilled' && result.value) {
                  try {
                    const imgRef = storageRef(storage, `stories/${story.id}/${batch[j].id}.img`);
                    await uploadString(imgRef, result.value, 'data_url');
                    const downloadUrl = await getDownloadURL(imgRef);
                    await addDoc(collection(db, 'stories', story.id, 'media'), {
                      partId: batch[j].id,
                      type: 'image',
                      storageUrl: downloadUrl,
                    });
                  } catch { /* ignore save error */ }
                }
              }
            }
            showToast('Images restored and saved!');
          }
        }
      } catch (mediaErr) {
        console.warn('Could not load media, using text only:', mediaErr);
        setStoryParts(parsedParts);
      }

      setCurrentPage(0);
      setShowLibrary(false);
    } catch (e) {
      console.error("Failed to load story parts", e);
    } finally {
      setIsLoadingStory(false);
    }
  };

  const deleteStory = async (storyId: string) => {
    try {
      await deleteDoc(doc(db, 'stories', storyId));
      setSavedStories(prev => prev.filter(s => s.id !== storyId));
      showToast('Story deleted');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'stories', user);
    }
  };

  const downloadAsBook = () => {
    if (storyParts.length === 0) return;
    const title = prompt || 'OmniWeave Story';
    const heading = prompt || 'A Tale Woven by OmniWeave';
    const leadImg = storyParts.find((p): p is Extract<StoryPart, { type: 'image' }> => p.type === 'image' && 'url' in p && !!p.url);
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const pages: { text?: string; imageUrl?: string; videoUrl?: string; pageNum: number }[] = [];
    let pageNum = 1;
    for (let i = 0; i < storyParts.length; i++) {
      const part = storyParts[i];
      const next = i + 1 < storyParts.length ? storyParts[i + 1] : null;
      if (part.type === 'text') {
        const cleaned = (part.text || '')
          .replace(/---CHARACTER SHEET---[\s\S]*?---END CHARACTER SHEET---/gi, '')
          .replace(/\[REVIEW:\s*(?:PASS|FIXED[^\]]*)\]/gi, '')
          .trim();
        if (cleaned.length < 20) continue;
        const page: { text?: string; imageUrl?: string; videoUrl?: string; pageNum: number } = { text: cleaned, pageNum };
        if (next && next.type === 'image' && next.url) { page.imageUrl = next.url; i++; }
        else if (next && next.type === 'video' && next.url) { page.videoUrl = next.url; i++; }
        pages.push(page);
        pageNum++;
      } else if ((part.type === 'image' || part.type === 'video') && part.url) {
        if (next && next.type === 'text') {
          const cleaned = next.text.replace(/---CHARACTER SHEET---[\s\S]*?---END CHARACTER SHEET---/gi, '').replace(/\[REVIEW:\s*(?:PASS|FIXED[^\]]*)\]/gi, '').trim();
          pages.push({ text: cleaned, imageUrl: part.type === 'image' ? part.url : undefined, videoUrl: part.type === 'video' ? part.url : undefined, pageNum });
          i++;
        } else {
          pages.push({ imageUrl: part.type === 'image' ? part.url : undefined, videoUrl: part.type === 'video' ? part.url : undefined, pageNum });
        }
        pageNum++;
      }
    }

    const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    let pagesHtml = '';
    pagesHtml += `<div class="page cover-page">
      ${leadImg?.url ? `<div class="cover-img-wrap"><img src="${leadImg.url}" alt="${escapeHtml(heading)} — cover illustration" class="cover-img"/><div class="cover-gradient"></div></div>` : ''}
      <div class="cover-content">
        <h1>${escapeHtml(heading)}</h1>
        <div class="divider"></div>
        <p class="badge">Powered by Gemini AI</p>
        <p class="meta">OmniWeave Cinematic Stories</p>
        <p class="date">${today}</p>
      </div>
    </div>`;

    pages.forEach(p => {
      const rawText = escapeHtml(p.text || '');
      const paragraphs = rawText.split(/\n\n+/).filter(s => s.trim());
      const textHtml = paragraphs.map(para =>
        `<p>${para
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/^(Narrator|[A-Z][a-zA-Z]+):\s*/gm, '<span class="speaker">$1:</span> ')
          .replace(/\n/g, '<br/>')}</p>`
      ).join('\n');
      const sceneAlt = (p.text || '').substring(0, 100).replace(/["\n]/g, ' ').trim();
      pagesHtml += `<section class="page" aria-label="Scene ${p.pageNum}">
        <h2 class="page-badge">Scene ${p.pageNum}</h2>
        ${p.imageUrl ? `<div class="img-wrap"><img src="${p.imageUrl}" alt="Scene ${p.pageNum}: ${escapeHtml(sceneAlt)}" loading="lazy"/></div>` : ''}
        ${p.videoUrl ? `<div class="img-wrap"><video src="${p.videoUrl}" controls autoplay loop muted playsinline></video></div>` : ''}
        ${textHtml ? `<div class="text-block"><div class="accent-bar"></div><div class="text-content">${textHtml}</div></div>` : ''}
      </section>`;
    });

    const htmlContent = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;500&display=swap">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#1a1714;color:#c8baa8}
.page{min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:2rem;position:relative;background:#faf7f2;page-break-after:always}
.cover-page{background:#0d0b09;justify-content:center;overflow:hidden}
.cover-img-wrap{position:absolute;inset:0}.cover-img{width:100%;height:100%;object-fit:cover;filter:brightness(0.35) blur(3px)}.cover-gradient{position:absolute;inset:0;background:linear-gradient(180deg,rgba(13,11,9,0.5),rgba(13,11,9,0.9))}
.cover-content{position:relative;z-index:2;text-align:center;max-width:600px;padding:2rem}
.cover-content h1{font-family:'Cormorant Garamond',serif;font-size:clamp(2rem,5vw,3rem);font-weight:600;color:#faf7f2;line-height:1.2;margin-bottom:1rem;text-shadow:0 2px 20px rgba(0,0,0,0.5)}
.divider{width:120px;height:3px;margin:0 auto 1.2rem;background:linear-gradient(90deg,transparent,#c4a35a,transparent)}
.badge{font-size:0.7rem;letter-spacing:0.15em;text-transform:uppercase;color:#c4a35a;padding:0.3em 1em;border:1px solid rgba(196,163,90,0.3);border-radius:20px;display:inline-block;margin-bottom:0.5rem}
.meta{font-size:0.75rem;color:#6b5e52;margin-top:0.8rem}.date{font-size:0.65rem;color:#6b5e52;margin-top:0.4rem}
.page-badge{background:#c4a35a;color:#fff;font-size:0.7rem;font-weight:500;padding:0.25em 1em;border-radius:20px;margin-bottom:1rem;border:none;font-family:'Inter',sans-serif}
.img-wrap{width:100%;max-width:700px;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);margin-bottom:1.5rem}
.img-wrap img,.img-wrap video{width:100%;display:block}
.text-block{display:flex;gap:12px;max-width:700px;width:100%;background:#fff;border-radius:12px;padding:1.5rem;box-shadow:0 2px 10px rgba(0,0,0,0.05)}
.accent-bar{width:4px;min-height:100%;background:#c4a35a;border-radius:2px;flex-shrink:0}
.text-content{font-family:'Cormorant Garamond',serif;font-size:1.15rem;line-height:1.8;color:#2a2520}
.text-content p{margin-bottom:0.8em}.text-content p:last-child{margin-bottom:0}
.speaker{font-weight:600;color:#c23b22}
strong{color:#111}em{font-style:italic}
@media(max-width:600px){.page{padding:1rem}.text-block{padding:1rem}.text-content{font-size:1rem}}
@media print{.page{min-height:auto;page-break-inside:avoid}}
</style></head><body>${pagesHtml}</body></html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(prompt || 'story').substring(0, 30).replace(/[^a-z0-9]/gi, '_').toLowerCase()}_book.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return {
    isLoadingStory,
    savedStories,
    showLibrary,
    setShowLibrary,
    loadLibrary,
    saveToLibrary,
    loadStory,
    deleteStory,
    downloadAsBook,
  };
}
