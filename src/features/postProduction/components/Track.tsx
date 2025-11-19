import React from 'react';
import AudioClip from './timeline/AudioClip';
import { TimelineClip } from './timeline/Timeline';
import { useStore } from '../../../store/useStore';
import NumberInput from '../../../components/ui/NumberInput';
import Switch from '../../../components/ui/Switch';

interface TrackProps {
  name: string;
  clips: TimelineClip[];
  pixelsPerSecond: number;
  trackType: 'narration' | 'dialogue' | 'os' | 'telephone' | 'system' | 'other' | 'music' | 'sfx' | 'ambience';
}

const getClipTypeFromTrackType = (trackType: TrackProps['trackType']): 'dialogue' | 'sfx' | 'bgm' => {
  if (trackType === 'music' || trackType === 'ambience') return 'bgm';
  if (trackType === 'sfx') return 'sfx';
  return 'dialogue';
};

const Track: React.FC<TrackProps> = ({ name, clips, pixelsPerSecond, trackType }) => {
  const clipType = getClipTypeFromTrackType(trackType);
  const { postProductionLufsSettings, setPostProductionLufsSettings } = useStore((state) => ({
    postProductionLufsSettings: state.postProductionLufsSettings,
    setPostProductionLufsSettings: state.setPostProductionLufsSettings,
  }));

  const getLufsKeyForTrack = (): keyof typeof postProductionLufsSettings | null => {
    if (trackType === 'music') return 'music';
    if (trackType === 'ambience') return 'ambience';
    if (trackType === 'sfx') return 'sfx';
    // All dialogue-related tracks share the same voice LUFS setting.
    if (
      trackType === 'narration' ||
      trackType === 'dialogue' ||
      trackType === 'os' ||
      trackType === 'telephone' ||
      trackType === 'system' ||
      trackType === 'other'
    ) {
      return 'voice';
    }
    return null;
  };

  const lufsKey = getLufsKeyForTrack();
  const lufsConfig = lufsKey ? postProductionLufsSettings[lufsKey] : null;

  const handleLufsTargetChange = (value: number) => {
    if (!lufsKey || !lufsConfig) return;
    void setPostProductionLufsSettings({
      [lufsKey]: { ...lufsConfig, target: value },
    });
  };

  const handleLufsEnabledChange = (enabled: boolean) => {
    if (!lufsKey || !lufsConfig) return;
    void setPostProductionLufsSettings({
      [lufsKey]: { ...lufsConfig, enabled },
    });
  };

  return (
    <div className="flex border-b border-slate-800 min-h-[80px]">
      {/* Track Header */}
      <div className="w-48 flex-shrink-0 bg-slate-800 border-r border-slate-700/50 p-2 flex items-center justify-between gap-2 sticky left-0 z-10">
        <span className="text-xs text-slate-300 truncate" title={name}>{name}</span>
        {lufsConfig && (
          <div
            className="flex items-center gap-x-1 bg-slate-700 rounded-md px-1 py-0.5 h-7"
            title="LUFS 响度标准化（默认关闭，可按轨道启用）"
          >
            <span className="text-[10px] text-slate-400 pl-1 font-sans font-semibold">LUFS</span>
            <div className="w-16">
              <NumberInput
                value={lufsConfig.target}
                onChange={handleLufsTargetChange}
                step={0.5}
                min={-60}
                max={0}
                precision={1}
              />
            </div>
            <Switch
              checked={lufsConfig.enabled}
              onChange={handleLufsEnabledChange}
              label={lufsConfig.enabled ? '响度标准化已开启' : '响度标准化未开启'}
            />
          </div>
        )}
      </div>
      {/* Track Lane with clips */}
      <div className="relative flex-grow h-[80px]">
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
