import React, { useRef, useEffect } from 'react';

interface TimeRulerProps {
  duration: number;
  pixelsPerSecond: number;
}

const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || seconds < 0) return '00:00.000';
    const totalMs = Math.floor(seconds * 1000);
    const minutes = Math.floor(totalMs / 60000);
    const remainingMs = totalMs % 60000;
    const secs = Math.floor(remainingMs / 1000);
    const ms = remainingMs % 1000;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};


const TimeRuler: React.FC<TimeRulerProps> = ({ duration, pixelsPerSecond }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const totalWidth = duration * pixelsPerSecond;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);
    
    ctx.fillStyle = '#0f172a'; // slate-900
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.fillStyle = '#94a3b8'; // slate-400
    ctx.strokeStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.textBaseline = 'top';
    
    const tickInterval = 1; // 1 second for major ticks
    const subTickInterval = 0.1; // 100ms for minor ticks

    for (let time = 0; time <= duration; time += subTickInterval) {
        const x = Math.floor(time * pixelsPerSecond) + 0.5; // Use integer positions for crisp lines
        
        ctx.beginPath();
        ctx.moveTo(x, rect.height);

        if (Math.round(time * 10) % Math.round(tickInterval * 10) === 0) { // Major tick every second
            ctx.lineTo(x, 10);
            ctx.fillText(formatTime(time), x + 4, 2);
        } else if (Math.round(time * 10) % 5 === 0) { // Medium tick every 0.5s
            ctx.lineTo(x, 15);
        } else { // Minor tick every 0.1s
            ctx.lineTo(x, 20);
        }
        ctx.stroke();
    }
  }, [duration, pixelsPerSecond, totalWidth]);

  return (
    <div className="h-6 flex-shrink-0 bg-slate-900 overflow-hidden w-full">
      <canvas ref={canvasRef} style={{ width: `${totalWidth}px`, height: '24px' }} />
    </div>
  );
};

export default TimeRuler;