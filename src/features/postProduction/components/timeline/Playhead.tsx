import React from 'react';
import { useStore } from '../../../../store/useStore';

interface PlayheadProps {
  pixelsPerSecond: number;
}

const Playhead: React.FC<PlayheadProps> = ({ pixelsPerSecond }) => {
  const currentTime = useStore(state => state.timelineCurrentTime);
  const left = currentTime * pixelsPerSecond;

  return (
    <div
      className="absolute top-0 bottom-0 w-px bg-red-500 z-30 pointer-events-none"
      style={{ left: `${left}px` }}
      aria-hidden="true"
    >
      <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-900" />
    </div>
  );
};

export default Playhead;