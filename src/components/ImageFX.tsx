import { useEffect, useRef } from 'react';

type FXType = 'dust' | 'rain' | 'sparks' | 'fireflies' | 'snow' | 'embers' | 'bubbles' | 'stars';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  life: number;
  maxLife: number;
  color: string;
}

const FX_CONFIGS: Record<FXType, {
  count: number;
  color: string[];
  sizeRange: [number, number];
  speed: [number, number];
  direction: 'down' | 'up' | 'random';
  glow: boolean;
}> = {
  dust: { count: 30, color: ['#c8baa8', '#d4c5a9'], sizeRange: [1, 3], speed: [0.1, 0.4], direction: 'up', glow: false },
  rain: { count: 80, color: ['#8ab4f8', '#a0c4ff'], sizeRange: [1, 2], speed: [4, 8], direction: 'down', glow: false },
  sparks: { count: 25, color: ['#ff6b35', '#ffaa00', '#ff4500'], sizeRange: [1, 3], speed: [0.5, 2], direction: 'up', glow: true },
  fireflies: { count: 15, color: ['#a0ff80', '#d4ff00', '#80ff60'], sizeRange: [2, 4], speed: [0.2, 0.5], direction: 'random', glow: true },
  snow: { count: 40, color: ['#ffffff', '#e8e8ff'], sizeRange: [2, 4], speed: [0.5, 1.5], direction: 'down', glow: false },
  embers: { count: 20, color: ['#ff4500', '#ff6600', '#cc3300'], sizeRange: [1, 3], speed: [0.3, 1], direction: 'up', glow: true },
  bubbles: { count: 20, color: ['#80d0ff', '#a0e0ff', '#60c0ff'], sizeRange: [2, 5], speed: [0.3, 0.8], direction: 'up', glow: true },
  stars: { count: 35, color: ['#ffffff', '#ffe4b5', '#add8e6'], sizeRange: [1, 2], speed: [0, 0.05], direction: 'random', glow: true },
};

const MOOD_FX_MAP: { kw: string[]; fx: FXType }[] = [
  { kw: ['battle', 'war', 'fight', 'sword', 'fire', 'dragon', 'flame', 'burn', 'explosion'], fx: 'embers' },
  { kw: ['rain', 'storm', 'thunder', 'dark', 'noir', 'wet', 'downpour'], fx: 'rain' },
  { kw: ['snow', 'ice', 'frost', 'winter', 'cold', 'frozen', 'blizzard'], fx: 'snow' },
  { kw: ['forest', 'garden', 'tree', 'nature', 'meadow', 'fairy', 'enchant'], fx: 'fireflies' },
  { kw: ['space', 'star', 'galaxy', 'cosmos', 'nebula', 'planet', 'constellation'], fx: 'stars' },
  { kw: ['ocean', 'sea', 'underwater', 'water', 'dive', 'coral', 'deep'], fx: 'bubbles' },
  { kw: ['forge', 'lava', 'volcano', 'furnace', 'spark', 'metal', 'anvil', 'weld'], fx: 'sparks' },
  { kw: ['ancient', 'ruin', 'dust', 'cave', 'tomb', 'temple', 'old', 'desert', 'sand'], fx: 'dust' },
];

function detectFX(text: string): FXType {
  const lower = text.toLowerCase();
  for (const m of MOOD_FX_MAP) {
    if (m.kw.some(k => lower.includes(k))) return m.fx;
  }
  return 'dust';
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

interface ImageFXProps {
  contextText: string;
  width: number;
  height: number;
}

export default function ImageFX({ contextText, width, height }: ImageFXProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const fxType = detectFX(contextText);
    const config = FX_CONFIGS[fxType];

    const particles: Particle[] = [];
    for (let i = 0; i < config.count; i++) {
      const color = config.color[Math.floor(Math.random() * config.color.length)];
      const maxLife = rand(100, 300);
      particles.push({
        x: rand(0, width),
        y: rand(0, height),
        vx: config.direction === 'random' ? rand(-0.3, 0.3) : rand(-0.1, 0.1),
        vy: config.direction === 'down' ? rand(config.speed[0], config.speed[1])
          : config.direction === 'up' ? -rand(config.speed[0], config.speed[1])
          : rand(-0.2, 0.2),
        size: rand(config.sizeRange[0], config.sizeRange[1]),
        opacity: rand(0.2, 0.7),
        life: rand(0, maxLife),
        maxLife,
        color,
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      for (const p of particles) {
        p.x += p.vx + (config.direction === 'random' ? Math.sin(p.life * 0.02) * 0.3 : 0);
        p.y += p.vy;
        p.life++;

        const lifeFrac = p.life / p.maxLife;
        const fadeOpacity = lifeFrac < 0.1 ? lifeFrac * 10
          : lifeFrac > 0.8 ? (1 - lifeFrac) * 5
          : 1;
        const alpha = p.opacity * fadeOpacity;

        if (p.y < -10 || p.y > height + 10 || p.x < -10 || p.x > width + 10 || p.life >= p.maxLife) {
          p.life = 0;
          p.maxLife = rand(100, 300);
          if (config.direction === 'down') { p.y = -5; p.x = rand(0, width); }
          else if (config.direction === 'up') { p.y = height + 5; p.x = rand(0, width); }
          else { p.x = rand(0, width); p.y = rand(0, height); }
        }

        ctx.globalAlpha = alpha;

        if (config.glow) {
          ctx.shadowBlur = p.size * 4;
          ctx.shadowColor = p.color;
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.fillStyle = p.color;
        ctx.beginPath();

        if (fxType === 'rain') {
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - 0.5, p.y + p.size * 4);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * 0.5;
          ctx.stroke();
        } else {
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [contextText, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 2,
      }}
    />
  );
}
