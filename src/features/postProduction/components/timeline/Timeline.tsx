import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useStore } from '../../../../store/useStore';
import { db } from '../../../../db';
import { ScriptLine, Character, LineType, SilencePairing } from '../../../../types';
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

        let currentTime = silenceSettings.startPadding || 0;
        
        try {
            for (const chapter of currentProject.chapters) {
                for (const line of chapter.scriptLines) {
                    // 关键修复：如果没有音频Blob，直接跳过，不增加时间，不产生空隙
                    if (!line.audioBlobId) {
                        continue;
                    }

                    let clipDuration = 0;
                    let blob: Blob | undefined = undefined;

                    const record = await db.audioBlobs.get(line.audioBlobId);
                    if (record) {
                        blob = record.data;
                        // Decode to get accurate duration
                        const buffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
                        clipDuration = buffer.duration;
                    }
                    
                    if (clipDuration > 0 && blob) {
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
                         
                         currentTime += clipDuration;

                         // Apply silence padding only after a VALID clip
                         let silenceDuration = 0;
                         if (line.postSilence !== undefined && line.postSilence !== null) {
                             silenceDuration = line.postSilence;
                         } else {
                            // 简化逻辑：默认间隔。
                            // 真正的应用可能需要像导出器一样根据前后角色类型计算间隔。
                            silenceDuration = 0.2; 
                         }
                         currentTime += silenceDuration;
                    }
                }
            }
            
            setTracks(newTracks);
            setTotalDuration(currentTime + (silenceSettings.endPadding || 0));
        } catch (e) {
            console.error("Failed to load timeline", e);
        } finally {
            setIsLoading(false);
            if (audioContext.state !== 'closed') audioContext.close();
        }
    };

    loadTimeline();
  }, [currentProject, characters]);

  // 2. Playback Logic
  const stopPlayback = useCallback(() => {
     if (audioContextRef.current) {
         audioContextRef.current.suspend();
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
          if (ctx.state === 'suspended') ctx.resume();
          
          const startTime = ctx.currentTime;
          playbackStartRef.current = { contextTime: startTime, timelineTime: timelineCurrentTime };
          
          const allClips = Object.values(tracks).flat().sort((a, b) => a.startTime - b.startTime);

          // Scheduler loop
          const scheduleAheadTime = 0.2; // seconds lookahead
          const timerInterval = 50; // ms check interval

          const schedule = () => {
              const currentTime = ctx.currentTime;
              // Current logical time in timeline
              const timelinePlayhead = (currentTime - startTime) + timelineCurrentTime;
              const lookaheadTime = timelinePlayhead + scheduleAheadTime;

              allClips.forEach(clip => {
                  // Check if clip is within the scheduling window
                  const isStartingSoon = clip.startTime >= timelinePlayhead && clip.startTime < lookaheadTime;
                  const isCurrentlyPlaying = clip.startTime < timelinePlayhead && (clip.startTime + clip.duration) > timelinePlayhead;

                  if ((isStartingSoon || isCurrentlyPlaying) && !scheduledClipsRef.current.has(clip.id) && clip.audioBlob) {
                       let startOffset = 0;
                       // If we are jumping into the middle of a clip
                       if (isCurrentlyPlaying) {
                           startOffset = timelinePlayhead - clip.startTime;
                       }
                       
                       scheduleClip(ctx, clip, startTime - timelineCurrentTime, startOffset);
                       scheduledClipsRef.current.add(clip.id);
                  }
              });
              
              // Auto-stop at end
              if (timelinePlayhead > totalDuration && totalDuration > 0) {
                  stopPlayback();
              }
          };

          const scheduleClip = async (context: AudioContext, clip: TimelineClip, timeOffset: number, startOffset = 0) => {
              if (!clip.audioBlob) return;
              try {
                const buffer = await context.decodeAudioData(await clip.audioBlob.arrayBuffer());
                const source = context.createBufferSource();
                source.buffer = buffer;
                source.connect(context.destination);
                
                // Exact start time in AudioContext coordinate system
                // clip.startTime (Timeline Abs) + timeOffset (Context Start - Timeline Start)
                const whenToPlay = clip.startTime + timeOffset;
                
                // Handle playback
                if (startOffset > 0) {
                    // Playing from middle
                    // We play "now" (or slightly immediate) but offset into the buffer
                    // We assume context.currentTime is roughly whenToPlay + startOffset
                    source.start(context.currentTime, startOffset, clip.duration - startOffset);
                } else {
                    // Scheduled for future or immediate start
                    source.start(Math.max(context.currentTime, whenToPlay), 0, clip.duration);
                }

                activeSourcesRef.current.add(source);
                source.onended = () => activeSourcesRef.current.delete(source);
              } catch (e) {
                  console.error("Error playing clip", clip.name, e);
              }
          };

          schedulerTimerRef.current = window.setInterval(schedule, timerInterval);

          // UI Update loop
          const updateUI = () => {
              if (!ctx) return;
              const currentCtxTime = ctx.currentTime;
              if (playbackStartRef.current) {
                  const newTime = (currentCtxTime - playbackStartRef.current.contextTime) + playbackStartRef.current.timelineTime;
                  setTimelineCurrentTime(newTime);
              }
              animationFrameRef.current = requestAnimationFrame(updateUI);
          };
          animationFrameRef.current = requestAnimationFrame(updateUI);

      } else {
          stopPlayback();
      }
      
      return () => stopPlayback();
  }, [timelineIsPlaying, tracks, totalDuration, setTimelineCurrentTime, stopPlayback]);

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
             <span className="ml-2 text-sm">加载时间轴...</span>
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
