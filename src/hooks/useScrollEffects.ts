import { useState, useEffect, useRef } from 'react';

interface UseScrollEffectsParams {
  showProgress: boolean;
  storyPartsLength: number;
  showLibrary: boolean;
}

export function useScrollEffects({ showProgress, storyPartsLength, showLibrary }: UseScrollEffectsParams) {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    if (!showProgress) return;
    const onScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(docHeight > 0 ? Math.min(1, scrollTop / docHeight) : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [showProgress]);

  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const onScroll = () => {
      if (navRef.current) {
        navRef.current.classList.toggle('scrolled', window.scrollY > 40);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const pipelineRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = pipelineRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.querySelectorAll('.pipeline-step').forEach(step => step.classList.add('visible'));
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [storyPartsLength, showLibrary]);

  return { scrollProgress, navRef, pipelineRef };
}
