import React from 'react';

interface AudioClipProps {
  startTime: number;
  duration: number;
  pixelsPerSecond: number;
  lineText: string;
  characterName: string;
  type: 'dialogue' | 'sfx' | 'bgm';
}

const AudioClip: React.FC<AudioClipProps> = React.memo(({ startTime, duration, pixelsPerSecond, lineText, characterName, type }) => {
  const getClipColors = () => {
    switch (type) {
      case 'sfx':
        return { bg: '#10b981', border: '#059669', text: '#d1fae5' }; // emerald-500, 600, 100
      case 'bgm':
        return { bg: '#8b5cf6', border: '#7c3aed', text: '#ede9fe' }; // violet-500, 600, 100
      case 'dialogue':
      default:
        return { bg: '#38bdf8', border: '#0ea5e9', text: '#075985' }; // sky-400, 500, 900
    }
  };

  const colors = getClipColors();

  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${startTime * pixelsPerSecond}px`,
    width: `${Math.max(1, duration * pixelsPerSecond)}px`,
    backgroundColor: colors.bg,
    color: colors.text,
    border: `1px solid ${colors.border}`,
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
    <div style={style} title={`${characterName}: ${lineText}`} onMouseDown={(e) => e.stopPropagation()}>
      <strong className="font-semibold truncate">{characterName}</strong>
      <p className="truncate opacity-80">{lineText}</p>
    </div>
  );
});

export default AudioClip;
