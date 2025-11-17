import React from 'react';
import AudioClip from './timeline/AudioClip';
import { TimelineClip } from './timeline/Timeline';

interface TrackProps {
  name: string;
  clips: TimelineClip[];
  pixelsPerSecond: number;
}

const Track: React.FC<TrackProps> = ({ name, clips, pixelsPerSecond }) => {
  return (
    <div className="flex border-b border-slate-800 min-h-[80px]">
      {/* Track Header */}
      <div className="w-48 flex-shrink-0 bg-slate-800/30 border-r border-slate-700/50 p-2 flex items-center sticky left-0 z-10">
        <span className="text-xs text-slate-300 truncate" title={name}>{name}</span>
      </div>
      {/* Track Lane with clips */}
      <div className="relative flex-grow h-[80px]">
        {clips.map(clip => (
          <AudioClip
            key={clip.id}
            startTime={clip.startTime}
            duration={clip.duration}
            pixelsPerSecond={pixelsPerSecond}
            lineText={clip.line.text}
            characterName={clip.character?.name || '旁白'}
          />
        ))}
      </div>
    </div>
  );
};

export default Track;
