import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  isActive: boolean;
  mode?: 'wave' | 'bars';
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isActive, mode = 'bars' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let offset = 0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      if (!isActive) {
         // Draw a flat line or subtle pulse when idle
         ctx.beginPath();
         ctx.moveTo(0, height / 2);
         ctx.lineTo(width, height / 2);
         ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
         ctx.lineWidth = 2;
         ctx.stroke();
         return;
      }

      ctx.fillStyle = '#a855f7'; // Purple-500
      
      if (mode === 'bars') {
        const barWidth = 6;
        const gap = 4;
        const numBars = Math.floor(width / (barWidth + gap));
        
        for (let i = 0; i < numBars; i++) {
          // Simulate frequency data
          const t = Date.now() * 0.005;
          const noise = Math.sin(t + i * 0.5) * Math.cos(t * 0.5 + i * 0.2);
          const barHeight = Math.abs(noise) * height * 0.8;
          
          const x = i * (barWidth + gap);
          const y = (height - barHeight) / 2;
          
          // Gradient
          const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
          gradient.addColorStop(0, '#c084fc');
          gradient.addColorStop(1, '#a855f7');
          ctx.fillStyle = gradient;

          ctx.fillRect(x, y, barWidth, barHeight);
        }
      } else {
        // Wave mode
        ctx.beginPath();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#c084fc';
        
        for (let x = 0; x < width; x++) {
           const t = Date.now() * 0.005;
           const y = height / 2 + Math.sin(x * 0.02 + t) * (height * 0.3) * Math.sin(t * 0.5);
           if (x === 0) ctx.moveTo(x, y);
           else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [isActive, mode]);

  return (
    <canvas 
      ref={canvasRef} 
      width={300} 
      height={60} 
      className="w-full h-[60px] rounded-lg bg-slate-800/50 backdrop-blur-sm"
    />
  );
};

export default AudioVisualizer;
