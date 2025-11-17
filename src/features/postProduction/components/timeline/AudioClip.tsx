import React from 'react';

interface AudioClipProps {
  startTime: number;
  duration: number;
  pixelsPerSecond: number;
  lineText: string;
  characterName: string;
}

const AudioClip: React.FC<AudioClipProps> = React.memo(({ startTime, duration, pixelsPerSecond, lineText, characterName }) => {
  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${startTime * pixelsPerSecond}px`,
    width: `${Math.max(1, duration * pixelsPerSecond)}px`, // Ensure a minimum width for very short clips
    backgroundColor: '#38bdf8', // sky-400
    color: '#075985', // sky-900
    border: '1px solid #0ea5e9', // sky-500
    borderRadius: '4px',
    height: '60px',
    overflow: 'hidden',
    padding: '4px 6px',
    fontSize: '12px',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    cursor: 'pointer',
    userSelect: 'none',
  };

  return (
    <div style={style} title={`${characterName}: ${lineText}`}>
      <strong className="font-semibold truncate">{characterName}</strong>
      <p className="truncate opacity-80">{lineText}</p>
    </div>
  );
});

export default AudioClip;
