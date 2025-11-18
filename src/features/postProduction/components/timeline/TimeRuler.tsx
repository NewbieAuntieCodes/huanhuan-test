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
  // Ensure the ruler is at least as wide as the viewport or content
  const totalWidth = duration * pixelsPerSecond;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const dpr = window.devicePixelRatio || 1;
    // Use client dimensions or props to determine size
    canvas.width = totalWidth * dpr;
    canvas.height = 24 * dpr; // Fixed height 24px

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, totalWidth, 24);
    
    ctx.fillStyle = '#0f172a'; // slate-900
    ctx.fillRect(0, 0, totalWidth, 24);

    ctx.fillStyle = '#94a3b8'; // slate-400
    ctx.strokeStyle = '#475569'; // slate-600 for lines
    ctx.font = '10px monospace';
    ctx.textBaseline = 'top';
    
    // Dynamic interval based on zoom
    let tickInterval = 1; 
    let subTickInterval = 0.1;
    
    if (pixelsPerSecond < 20) {
        tickInterval = 10; subTickInterval = 1;
    } else if (pixelsPerSecond < 50) {
        tickInterval = 5; subTickInterval = 1;
    }

    for (let time = 0; time <= duration; time += subTickInterval) {
        const x = Math.floor(time * pixelsPerSecond) + 0.5;
        
        ctx.beginPath();
        ctx.moveTo(x, 24);

        // Avoid float precision issues with epsilon
        const isMajor = Math.abs(time % tickInterval) < 0.001;
        const isMedium = Math.abs(time % (tickInterval/2)) < 0.001;

        if (isMajor) { 
            ctx.lineTo(x, 10);
            ctx.fillText(formatTime(time), x + 4, 2);
            ctx.strokeStyle = '#94a3b8'; // lighter for major
        } else if (isMedium) {
            ctx.lineTo(x, 15);
            ctx.strokeStyle = '#475569';
        } else { 
            ctx.lineTo(x, 18);
            ctx.strokeStyle = '#334155';
        }
        ctx.stroke();
    }
  }, [duration, pixelsPerSecond, totalWidth]);

  return (
    <div className="h-6 flex-shrink-0 bg-slate-900 overflow-hidden">
      <canvas ref={canvasRef} style={{ width: `${totalWidth}px`, height: '24px' }} />
    </div>
  );
};

export default TimeRuler;
