import React, { useEffect, useRef } from 'react';

interface CanvasRevealEffectProps {
  animationSpeed?: number;
  containerClassName?: string;
  colors?: number[][];
  opacities?: number[];
  dotSize?: number;
}

export function CanvasRevealEffect({
  animationSpeed = 5,
  containerClassName = '',
  colors = [[124, 58, 237]], // Primary color
  opacities = [1, 0.8, 1, 0.8, 0.5],
  dotSize = 2
}: CanvasRevealEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mousePosition = useRef({ x: 0, y: 0 });
  const dots = useRef<Array<{x: number; y: number; vx: number; vy: number}>>([]);
  const animationFrameId = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };

    const createDots = () => {
      dots.current = [];
      const numberOfDots = Math.floor((canvas.width * canvas.height) / 3000);
      
      for (let i = 0; i < numberOfDots; i++) {
        dots.current.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * animationSpeed,
          vy: (Math.random() - 0.5) * animationSpeed
        });
      }
    };

    const animate = () => {
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      dots.current.forEach((dot, i) => {
        dot.x += dot.vx;
        dot.y += dot.vy;

        if (dot.x < 0) dot.x = canvas.width;
        if (dot.x > canvas.width) dot.x = 0;
        if (dot.y < 0) dot.y = canvas.height;
        if (dot.y > canvas.height) dot.y = 0;

        const color = colors[i % colors.length];
        const opacity = opacities[i % opacities.length];

        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dotSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${opacity})`;
        ctx.fill();
      });

      animationFrameId.current = requestAnimationFrame(animate);
    };

    resizeCanvas();
    createDots();
    animate();

    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [animationSpeed, colors, opacities, dotSize]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 h-full w-full ${containerClassName}`}
    />
  );
}