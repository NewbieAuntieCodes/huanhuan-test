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
  const audioContextRef = useRef<AudioContext | null>(null);
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

  // 1. Load Timeline Data (similar to export logic but simplified for UI)
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
            sfx: [], // Placeholder for future SFX track
            bgm: [], // Placeholder for future BGM track
            other: []
        };

        let currentTime = silenceSettings.startPadding || 0;
        
        try {
            for (const chapter of currentProject.chapters) {
                for (const line of chapter.scriptLines) {
                    let clipDuration = 0;
                    let blob: Blob | undefined = undefined;

                    if (line.audioBlobId) {
                        const record = await db.audioBlobs.get(line.audioBlobId);
                        if (record) {
                            blob = record.data;
                            // For UI performance, we might want to cache durations in DB. 
                            // For now, decode to get accurate duration (expensive but correct).
                            // Optimization: In a real app, store 'duration' in scriptLines or audioBlobs table.
                            const buffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
                            clipDuration = buffer.duration;
                        }
                    }
                    
                    // Estimate duration if no audio (e.g. 0.2s per char) to keep visual flow? 
                    // Or just skip? Let's skip non-audio lines for the audio timeline to be accurate.
                    if (clipDuration > 0 && blob) {
                         const character = characters.find(c => c.id === line.characterId);
                         const type = getLineType(line, characters);
                         
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
                         else if (line.soundType && line.soundType !== '清除') newTracks.other.push(clip); // Group others
                         else newTracks.dialogue.push(clip);
                         
                         currentTime += clipDuration;
                    }

                    // Apply silence padding
                    // Note: This logic is simplified; it should match export logic exactly for WYSIWYG.
                    // Assuming sequential processing here.
                    // Check next line type for pairing logic (omitted for brevity/performance in this fix, using constant or per-line setting)
                     let silenceDuration = 0;
                     if (line.postSilence !== undefined && line.postSilence !== null) {
                         silenceDuration = line.postSilence;
                     } else {
                        // Simplified fallback: use default pairing or end padding if last
                        silenceDuration = 0.5; // Just a visual placeholder if strict calc is too heavy
                     }
                     currentTime += silenceDuration;
                }
            }
            
            setTracks(newTracks);
            setTotalDuration(currentTime + (silenceSettings.endPadding || 0));
        } catch (e) {
            console.error("Failed to load timeline", e);
        } finally {
            setIsLoading(false);
            audioContext.close();
        }
    };

    loadTimeline();
  }, [currentProject, characters]); // Re-run when project changes

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
          const scheduleAheadTime = 0.1; // seconds
          const lookahead = 25; // ms

          const schedule = () => {
              const currentTime = ctx.currentTime;
              const relativePlayTime = currentTime - startTime + timelineCurrentTime;

              // Find clips that should start soon
              allClips.forEach(clip => {
                  if (clip.startTime >= relativePlayTime && clip.startTime < relativePlayTime + scheduleAheadTime) {
                      if (!scheduledClipsRef.current.has(clip.id) && clip.audioBlob) {
                           scheduleClip(ctx, clip, startTime - timelineCurrentTime);
                           scheduledClipsRef.current.add(clip.id);
                      }
                  }
                  // Handle seek/mid-playback start: if clip overlaps current time
                  if (clip.startTime < relativePlayTime && clip.startTime + clip.duration > relativePlayTime) {
                      if (!scheduledClipsRef.current.has(clip.id) && clip.audioBlob) {
                          // Calculate offset
                          const offset = relativePlayTime - clip.startTime;
                          scheduleClip(ctx, clip, startTime - timelineCurrentTime, offset);
                          scheduledClipsRef.current.add(clip.id);
                      }
                  }
              });
          };

          const scheduleClip = async (context: AudioContext, clip: TimelineClip, timeOffset: number, startOffset = 0) => {
              if (!clip.audioBlob) return;
              try {
                const buffer = await context.decodeAudioData(await clip.audioBlob.arrayBuffer());
                const source = context.createBufferSource();
                source.buffer = buffer;
                source.connect(context.destination);
                
                // When to start playing in context time
                // clip.startTime is absolute timeline time. 
                // context.currentTime is absolute context time.
                // playbackStartRef stores the sync point.
                // Target Context Time = Clip Start Time - Timeline Start Time + Context Start Time
                const playTime = clip.startTime + timeOffset;
                
                if (playTime < context.currentTime) {
                    // If we are late (or seeking into middle), play immediately with offset
                    // But startOffset logic handles 'seeking into middle' more accurately if passed
                     const lateBy = context.currentTime - playTime;
                     const playOffset = startOffset > 0 ? startOffset : lateBy; // Use provided offset or catch up
                     source.start(context.currentTime, playOffset, clip.duration - playOffset);
                } else {
                     source.start(playTime, 0, clip.duration);
                }

                activeSourcesRef.current.add(source);
                source.onended = () => activeSourcesRef.current.delete(source);
              } catch (e) {
                  console.error("Error playing clip", clip.name, e);
              }
          };

          schedulerTimerRef.current = window.setInterval(schedule, lookahead);

          // UI Update loop
          const updateUI = () => {
              const currentCtxTime = ctx.currentTime;
              if (playbackStartRef.current) {
                  const newTime = (currentCtxTime - playbackStartRef.current.contextTime) + playbackStartRef.current.timelineTime;
                  setTimelineCurrentTime(newTime);
                  if (newTime >= totalDuration && totalDuration > 0) {
                      stopPlayback();
                      return;
                  }
              }
              animationFrameRef.current = requestAnimationFrame(updateUI);
          };
          animationFrameRef.current = requestAnimationFrame(updateUI);

      } else {
          stopPlayback();
      }
      
      return () => stopPlayback();
  }, [timelineIsPlaying, tracks, totalDuration, setTimelineCurrentTime, stopPlayback]); // Dependencies simplified

  // Pixels per second calculation
  // Zoom level: 0.1 (zoomed out) to 5 (zoomed in)
  // Base scale: 100px per second at zoom 1?
  const pixelsPerSecond = timelineZoom * 200; 

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200 select-none">
      <TimelineHeader />
      
      <div className="flex-grow overflow-auto relative bg-slate-950">
         {isLoading && (
             <div className="absolute inset-0 flex items-center justify-center z-50 bg-slate-900/50">
                 <LoadingSpinner />
                 <span className="ml-2 text-sm">加载时间轴...</span>
             </div>
         )}
         
         <div className="min-w-full relative" style={{ width: Math.max(1000, totalDuration * pixelsPerSecond + 500) + 'px' }}>
             <TimeRuler duration={totalDuration + 10} pixelsPerSecond={pixelsPerSecond} />
             
             <div className="relative">
                 <Playhead pixelsPerSecond={pixelsPerSecond} leftOffset={TRACK_HEADER_WIDTH} />
                 
                 <div className="pl-[192px]"> {/* Offset for Track Headers (w-48 = 192px) */}
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
    </div>
  );
};

// Constants must match CSS classes in Track.tsx/TrackGroup.tsx
const TRACK_HEADER_WIDTH = 192; 

export default Timeline;