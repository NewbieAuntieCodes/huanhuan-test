
import React from 'react';
import AudioClip from './timeline/AudioClip';
import { TimelineClip } from './timeline/Timeline';

interface TrackProps {
  name: string;
  clips: TimelineClip[];
  pixelsPerSecond: number;
}

const getClipTypeFromTrackType = (trackType: string): 'dialogue' | 'sfx' | 'bgm' => {
    if (trackType.includes('music') || trackType.includes('bgm')) return 'bgm';
    if (trackType.includes('sfx') || trackType.includes('音效')) return 'sfx';
    return 'dialogue';
};

const Track: React.FC<TrackProps> = ({ name, clips, pixelsPerSecond }) => {
  const clipType = getClipTypeFromTrackType(name.toLowerCase());

  return (
    <div className="flex border-b border-slate-800 h-[80px] box-border">
      {/* Track Header - Sticky to left. Width matches TRACK_HEADER_WIDTH in Timeline.tsx */}
      <div 
        className="flex-shrink-0 bg-slate-800 border-r border-slate-700/50 p-2 flex items-center sticky left-0 z-10 shadow-[1px_0_5px_rgba(0,0,0,0.3)]"
        style={{ width: '192px' }}
      >
        <span className="text-xs text-slate-300 truncate font-medium" title={name}>{name}</span>
      </div>
      
      {/* Track Lane */}
      <div className="relative flex-grow h-full bg-slate-900/30">
        {clips.map(clip => (
          <AudioClip
            key={clip.id}
            startTime={clip.startTime}
            duration={clip.duration}
            pixelsPerSecond={pixelsPerSecond}
            lineText={clip.name || clip.line.text}
            characterName={clip.character?.name || clip.name || '音效'}
            type={clipType}
          />
        ))}
      </div>
    </div>
  );
};

export default Track;
