
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useStore } from '../../../../store/useStore';
import { db } from '../../../../db';
import { ScriptLine, Character, LineType, SilencePairing, SoundLibraryItem } from '../../../../types';
import { defaultSilenceSettings } from '../../../../lib/defaultSilenceSettings';
import TimelineHeader from '../TimelineHeader';
import TimeRuler from './TimeRuler';
import TrackGroup from './TrackGroup';
import Track from '../Track';
import Playhead from './Playhead';
import LoadingSpinner from '../../../../components/ui/LoadingSpinner';

// Export TimelineClip for use in Track.tsx
export interface TimelineClip {
  id: string;
  startTime: number;
  duration: number;
  name: string;
  line: ScriptLine;
  character?: Character;
  audioBlob?: Blob;
}

const getLineType = (line: ScriptLine | undefined, characters: Character[]): LineType => {
    if (!line || !line.characterId) return 'narration';
    const character = characters.find(c => c.id === line.characterId);
    if (!character || character.name === 'Narrator' || character.name === '[静音]') return 'narration';
    if (character.name === '音效' || character.name === '[音效]') return 'sfx';
    return 'dialogue';
};

// 轨道头宽度常量 (Tailwind w-48 = 12rem = 192px)
const TRACK_HEADER_WIDTH = 192;

const Timeline: React.FC = () => {
  const {
    selectedProjectId,
    projects,
    timelineIsPlaying,
    setTimelineIsPlaying,
    timelineCurrentTime,
    setTimelineCurrentTime,
    timelineZoom,
    characters,
    soundLibrary, // 获取音效库，用于查找 pinnedSounds 对应的文件
    setTimelineZoom
  } = useStore();

  const currentProject = useMemo(() => projects.find(p => p.id === selectedProjectId), [projects, selectedProjectId]);

  // Refs for audio playback engine
  const audioContextRef = useRef<AudioContext | undefined>(undefined);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const scheduledClipsRef = useRef<Set<string>>(new Set());
  const schedulerTimerRef = useRef<number | undefined>(undefined);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const playbackStartRef = useRef<{ contextTime: number, timelineTime: number } | null>(null);
  
  // State for rendered tracks
  const [isLoading, setIsLoading] = useState(false);
  const [tracks, setTracks] = useState<Record<string, TimelineClip[]>>({
      narration: [],
      dialogue: [],
      os: [],
      sfx: [],
      bgm: [],
      other: []
  });
  const [totalDuration, setTotalDuration] = useState(0);

  // 1. Load Timeline Data
  useEffect(() => {
    if (!currentProject) return;

    const loadTimeline = async () => {
        setIsLoading(true);
        // Create a temporary context for decoding durations
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const silenceSettings = currentProject.silenceSettings || defaultSilenceSettings;
        
        const newTracks: Record<string, TimelineClip[]> = {
            narration: [],
            dialogue: [],
            os: [],
            sfx: [],
            bgm: [],
            other: []
        };

        // 创建 soundLibrary 的查找表，提高性能
        const soundMap = new Map<number, SoundLibraryItem>();
        soundLibrary.forEach(item => {
            if (item.id !== undefined) soundMap.set(item.id, item);
        });

        let currentTime = silenceSettings.startPadding || 0;
        
        // Iterate chapters and lines
        for (const chapter of currentProject.chapters) {
            for (const line of chapter.scriptLines) {
                try {
                    let clipDuration = 0;
                    let blob: Blob | undefined = undefined;

                    // 1. 处理对白/旁白音频
                    if (line.audioBlobId) {
                        const record = await db.audioBlobs.get(line.audioBlobId);
                        if (record) {
                            blob = record.data;
                            try {
                                const buffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
                                clipDuration = buffer.duration;
                            } catch (decodeError) {
                                console.warn(`无法解码音频 (Line ID: ${line.id}):`, decodeError);
                            }
                        }
                    }

                    // 如果没有音频，根据字数估算时长，以便占位和计算后续时间
                    if (clipDuration === 0) {
                        // 假设每字 0.25 秒，最少 0.5 秒
                        clipDuration = Math.max(0.5, (line.text.length) * 0.25);
                    }
                    
                    // 添加对白 Clip (即使没有音频Blob，也可能需要显示占位符，这里暂时只添加有音频的)
                    if (blob) { 
                         const character = characters.find(c => c.id === line.characterId);
                         const clip: TimelineClip = {
                             id: line.id,
                             startTime: currentTime,
                             duration: clipDuration,
                             name: line.text,
                             line,
                             character,
                             audioBlob: blob
                         };

                         if (character?.name === 'Narrator') newTracks.narration.push(clip);
                         else if (line.soundType === 'OS') newTracks.os.push(clip);
                         else if (line.soundType && line.soundType !== '清除') newTracks.other.push(clip);
                         else newTracks.dialogue.push(clip);
                    } else {
                        // TODO: 可以选择添加一个 "Missing Audio" 的视觉占位符
                    }

                    // 2. 处理钉住的 BGM 和 SFX (pinnedSounds)
                    if (line.pinnedSounds && line.pinnedSounds.length > 0) {
                        for (const pin of line.pinnedSounds) {
                            const soundItem = soundMap.get(pin.soundId);
                            if (soundItem) {
                                try {
                                    const file = await soundItem.handle.getFile();
                                    // 获取音效时长 (优先使用 metadata 中的 duration，如果没有则解码)
                                    let soundDuration = soundItem.duration;
                                    if (!soundDuration || soundDuration === 0) {
                                        const buffer = await audioContext.decodeAudioData(await file.arrayBuffer());
                                        soundDuration = buffer.duration;
                                    }

                                    // 计算插入时间点
                                    // 根据 pin.index 在文本中的百分比，计算在当前行音频中的相对时间
                                    const textLen = Math.max(1, line.text.length);
                                    const relativePos = Math.min(1, Math.max(0, pin.index / textLen));
                                    const startTimeOffset = relativePos * clipDuration;
                                    const absoluteStartTime = currentTime + startTimeOffset;

                                    const soundClip: TimelineClip = {
                                        id: `${line.id}_pin_${pin.soundId}_${pin.index}`, // 唯一ID
                                        startTime: absoluteStartTime,
                                        duration: soundDuration,
                                        name: soundItem.name,
                                        line: line,
                                        audioBlob: file
                                    };

                                    // 判断是 BGM 还是 SFX
                                    // 简单的启发式：如果关键词包含 < > 或者是 music 分类
                                    const isBgm = pin.keyword.startsWith('<') || soundItem.category.includes('music') || soundItem.category.includes('ambience');
                                    
                                    if (isBgm) {
                                        newTracks.bgm.push(soundClip);
                                    } else {
                                        newTracks.sfx.push(soundClip);
                                    }

                                } catch (err) {
                                    console.error("加载钉住的音效失败:", err);
                                }
                            }
                        }
                    }
                         
                    currentTime += clipDuration;

                    // Apply silence padding
                    let silenceDuration = 0;
                    if (line.postSilence !== undefined && line.postSilence !== null) {
                         silenceDuration = line.postSilence;
                    } else {
                        // 默认间隔
                        silenceDuration = 0.2; 
                    }
                    currentTime += silenceDuration;

                } catch (lineError) {
                    console.error(`处理行数据时出错 (Line ID: ${line.id}):`, lineError);
                }
            }
        }
        
        setTracks(newTracks);
        setTotalDuration(currentTime + (silenceSettings.endPadding || 0));
        setIsLoading(false);

        if (audioContext.state !== 'closed') {
            audioContext.close().catch(() => {});
        }
    };

    loadTimeline();
  }, [currentProject, characters, soundLibrary]); // Add soundLibrary to dependency

  // 2. Playback Logic
  const stopPlayback = useCallback(() => {
     if (audioContextRef.current) {
         try { audioContextRef.current.suspend(); } catch {}
     }
     activeSourcesRef.current.forEach(source => {
         try { source.stop(); } catch {}
     });
     activeSourcesRef.current.clear();
     scheduledClipsRef.current.clear();
     
     if (schedulerTimerRef.current) window.clearInterval(schedulerTimerRef.current);
     if (animationFrameRef.current) window.cancelAnimationFrame(animationFrameRef.current);
     
     setTimelineIsPlaying(false);
  }, [setTimelineIsPlaying]);

  useEffect(() => {
      if (timelineIsPlaying) {
          if (!audioContextRef.current) {
              audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
          }
          const ctx = audioContextRef.current;
          if (ctx.state === 'suspended') {
              ctx.resume().catch(e => console.error("AudioContext resume failed", e));
          }
          
          const startTime = ctx.currentTime;
          playbackStartRef.current = { contextTime: startTime, timelineTime: timelineCurrentTime };
          
          // Flatten clips for scheduling
          const allClips = Object.values(tracks).flat().sort((a, b) => a.startTime - b.startTime);

          // Scheduler loop
          const scheduleAheadTime = 0.2; // seconds lookahead
          const timerInterval = 50; // ms check interval

          const schedule = () => {
              const currentCtxTime = ctx.currentTime;
              
              if (!playbackStartRef.current) return;
              
              const elapsed = currentCtxTime - playbackStartRef.current.contextTime;
              const timelinePlayhead = playbackStartRef.current.timelineTime + elapsed;
              const lookaheadTime = timelinePlayhead + scheduleAheadTime;

              allClips.forEach(clip => {
                  // 1. Check if clip hasn't been scheduled yet
                  if (scheduledClipsRef.current.has(clip.id)) return;

                  // 2. Check validity
                  if (!clip.audioBlob) return;

                  // 3. Check intersection with lookahead window
                  const clipEnd = clip.startTime + clip.duration;
                  
                  const isStartingSoon = clip.startTime >= timelinePlayhead && clip.startTime < lookaheadTime;
                  const isCurrentlyPlaying = clip.startTime < timelinePlayhead && clipEnd > timelinePlayhead;

                  if (isStartingSoon || isCurrentlyPlaying) {
                       let startOffset = 0; 
                       let delay = 0;       

                       if (isCurrentlyPlaying) {
                           startOffset = timelinePlayhead - clip.startTime;
                           delay = 0; 
                       } else {
                           startOffset = 0;
                           delay = clip.startTime - timelinePlayhead;
                       }
                       
                       scheduleClip(ctx, clip, delay, startOffset);
                       scheduledClipsRef.current.add(clip.id);
                  }
              });
              
              // Auto-stop at end
              if (timelinePlayhead > totalDuration && totalDuration > 0) {
                  stopPlayback();
                  // Reset to start if reached end
                  setTimelineCurrentTime(0);
              }
          };

          const scheduleClip = async (context: AudioContext, clip: TimelineClip, delay: number, startOffset = 0) => {
              if (!clip.audioBlob) return;
              try {
                const buffer = await context.decodeAudioData(await clip.audioBlob.arrayBuffer());
                
                const source = context.createBufferSource();
                source.buffer = buffer;
                source.connect(context.destination);
                
                const playAt = context.currentTime + Math.max(0, delay);
                
                const playDuration = Math.max(0, clip.duration - startOffset);
                if (playDuration > 0) {
                    source.start(playAt, startOffset, playDuration);
                    activeSourcesRef.current.add(source);
                    source.onended = () => activeSourcesRef.current.delete(source);
                }
              } catch (e) {
                  console.error("Error scheduling clip", clip.name, e);
              }
          };

          schedulerTimerRef.current = window.setInterval(schedule, timerInterval);

          // UI Update loop (visuals only)
          const updateUI = () => {
              if (!ctx || !playbackStartRef.current) return;
              const currentCtxTime = ctx.currentTime;
              const newTime = (currentCtxTime - playbackStartRef.current.contextTime) + playbackStartRef.current.timelineTime;
              setTimelineCurrentTime(newTime);
              animationFrameRef.current = requestAnimationFrame(updateUI);
          };
          animationFrameRef.current = requestAnimationFrame(updateUI);

      } else {
          stopPlayback();
      }
      
      return () => stopPlayback();
  }, [timelineIsPlaying, tracks, totalDuration, setTimelineCurrentTime, stopPlayback]); // removed timelineCurrentTime from dep array to avoid restart loop, handled by ref

  // Pixels per second calculation
  const pixelsPerSecond = timelineZoom * 200; 
  // Ensure visible width covers total duration plus some padding
  const timelineWidth = Math.max(2000, (totalDuration + 5) * pixelsPerSecond);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200 select-none overflow-hidden">
      <TimelineHeader />
      
      {isLoading && (
         <div className="absolute inset-0 flex items-center justify-center z-50 bg-slate-900/50">
             <LoadingSpinner />
             <span className="ml-2 text-sm">正在生成时间轴...</span>
         </div>
      )}

      <div className="flex-grow overflow-auto relative flex flex-col">
         {/* Ruler Container: Fixed Header Left + Scrollable Ruler Right */}
         <div className="flex flex-shrink-0 sticky top-0 z-20 bg-slate-900 border-b border-slate-800">
            <div style={{ width: `${TRACK_HEADER_WIDTH}px` }} className="flex-shrink-0 bg-slate-800 border-r border-slate-700/50 p-2 text-xs font-bold text-slate-400 flex items-end pb-1">
                轨道列表
            </div>
            <div className="flex-grow relative overflow-hidden" style={{ width: timelineWidth }}>
                <TimeRuler duration={totalDuration + 10} pixelsPerSecond={pixelsPerSecond} />
                {/* Render Playhead Top Part in Ruler */}
                <div 
                    className="absolute top-0 bottom-0 w-px bg-red-500 z-30 pointer-events-none"
                    style={{ left: `${timelineCurrentTime * pixelsPerSecond}px` }}
                >
                     <div className="absolute top-0 -left-1.5 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-red-500" />
                </div>
            </div>
         </div>

         {/* Tracks Container */}
         <div className="flex-grow relative min-w-full">
             <div className="relative min-w-fit">
                 {/* Playhead Line across tracks */}
                 <Playhead pixelsPerSecond={pixelsPerSecond} leftOffset={TRACK_HEADER_WIDTH} />

                 <TrackGroup name="对白 (Dialogue)">
                     <Track name="旁白 (Narrator)" clips={tracks.narration} pixelsPerSecond={pixelsPerSecond} />
                     <Track name="角色 (Characters)" clips={tracks.dialogue} pixelsPerSecond={pixelsPerSecond} />
                     <Track name="心音 (OS)" clips={tracks.os} pixelsPerSecond={pixelsPerSecond} />
                     <Track name="其他 (Other)" clips={tracks.other} pixelsPerSecond={pixelsPerSecond} />
                 </TrackGroup>
                 <TrackGroup name="音效 (SFX)">
                     <Track name="音效" clips={tracks.sfx} pixelsPerSecond={pixelsPerSecond} />
                 </TrackGroup>
                 <TrackGroup name="音乐 (BGM)">
                     <Track name="背景音乐" clips={tracks.bgm} pixelsPerSecond={pixelsPerSecond} />
                 </TrackGroup>
             </div>
         </div>
      </div>
    </div>
  );
};

export default Timeline;
