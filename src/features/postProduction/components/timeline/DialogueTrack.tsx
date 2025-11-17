import React from 'react';
import AudioClip from './AudioClip';
import { TimelineClip } from './Timeline';

interface DialogueTrackProps {
  clips: TimelineClip[];
  pixelsPerSecond: number;
}

const DialogueTrack: React.FC<DialogueTrackProps> = ({ clips, pixelsPerSecond }) => {
  return (
    <div className="relative h-[80px] bg-slate-700/50 rounded-md my-1 p-2 box-border">
      <div className="absolute top-2 left-2 text-xs font-bold text-slate-300 bg-slate-800 px-2 py-1 rounded-sm z-10">
        对白
      </div>
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
  );
};

export default DialogueTrack;