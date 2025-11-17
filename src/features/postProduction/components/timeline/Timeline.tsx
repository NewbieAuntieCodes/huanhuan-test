import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useStore } from '../../../../store/useStore';
import { db } from '../../../../db';
import { LineType, ScriptLine, Character, SilencePairing } from '../../../../types';
import LoadingSpinner from '../../../../components/ui/LoadingSpinner';
import DialogueTrack from './DialogueTrack';
import TimeRuler from './TimeRuler';
import { defaultSilenceSettings } from '../../../../lib/defaultSilenceSettings';
import Playhead from './Playhead';
import TimelineHeader from '../TimelineHeader';
import * as mm from 'music-metadata-browser';

export interface TimelineClip {
    id: string;
    startTime: number;
    duration: number;
    line: ScriptLine;
    character?: Character;
    audioBlobId: string;
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
      characters,
      timelineIsPlaying,
      setTimelineIsPlaying,
      timelineCurrentTime,
      setTimelineCurrentTime,
      timelineZoom,
    } = useStore();
    
    const [timelineClips, setTimelineClips] = useState<TimelineClip[]>([]);
    const [totalDuration, setTotalDuration] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    
    const audioContextRef = useRef<AudioContext | null>(null);
    const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const scheduledClipsRef = useRef<Set<string>>(new Set());
    const schedulerTimerRef = useRef<number>();
    const animationFrameRef = useRef<number>();
    const playbackStartRef = useRef<{ contextTime: number, timelineTime: number } | null>(null);

    const BASE_PIXELS_PER_SECOND = 100;
    const pixelsPerSecond = BASE_PIXELS_PER_SECOND * timelineZoom;

    const currentProject = useMemo(() => projects.find(p => p.id === selectedProjectId), [projects, selectedProjectId]);
    const characterMap = useMemo(() => new Map(characters.map(c => [c.id, c])), [characters]);

    useEffect(() => {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        return () => {
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close().catch(console.error);
            }
        };
    }, []);

    useEffect(() => {
        if (!currentProject) {
            setIsLoading(false);
            setTimelineClips([]);
            setTotalDuration(0);
            return;
        }

        const calculateTimeline = async () => {
            setIsLoading(true);
            setTimelineCurrentTime(0);
            setTimelineIsPlaying(false);

            let currentTime = 0;
            const silenceSettings = currentProject.silenceSettings || defaultSilenceSettings;
            currentTime += silenceSettings.startPadding > 0 ? silenceSettings.startPadding : 0;
            
            const allLinesWithAudio = currentProject.chapters.flatMap(ch => ch.scriptLines).filter(line => line.audioBlobId);
            
            const validItems = (await Promise.all(
                allLinesWithAudio.map(async (line) => {
                    const audioBlobData = await db.audioBlobs.get(line.audioBlobId!);
                    if (audioBlobData) {
                        try {
                            const metadata = await mm.parseBlob(audioBlobData.data);
                            const duration = metadata.format.duration;
                            if (duration && duration > 0) {
                                return { line, audioBlobId: line.audioBlobId!, duration };
                            }
                        } catch (e) {
                            console.error(`Failed to parse metadata for line ${line.id}:`, e);
                        }
                    }
                    return null;
                })
            )).filter((item): item is NonNullable<typeof item> => item !== null);
            
            const clips: TimelineClip[] = [];
            for (let i = 0; i < validItems.length; i++) {
                const item = validItems[i];
                clips.push({
                    id: item.line.id,
                    startTime: currentTime,
                    duration: item.duration,
                    line: item.line,
                    character: item.line.characterId ? characterMap.get(item.line.characterId) : undefined,
                    audioBlobId: item.audioBlobId,
                });
                currentTime += item.duration;
                let silenceDuration = 0;
                if (item.line.postSilence !== undefined && item.line.postSilence !== null) {
                    silenceDuration = item.line.postSilence;
                } else {
                    if (i === validItems.length - 1) {
                        silenceDuration = silenceSettings.endPadding;
                    } else {
                        const nextLine = validItems[i+1].line;
                        const currentLineType = getLineType(item.line, characters);
                        const nextLineType = getLineType(nextLine, characters);
                        const pairKey = `${currentLineType}-to-${nextLineType}` as SilencePairing;
                        silenceDuration = silenceSettings.pairs[pairKey] ?? 1.0;
                    }
                }
                currentTime += silenceDuration > 0 ? silenceDuration : 0;
            }

            scheduledClipsRef.current.clear();
            setTimelineClips(clips);
            setTotalDuration(currentTime);
            setIsLoading(false);
        };

        calculateTimeline();
    }, [currentProject, characters, characterMap, setTimelineCurrentTime, setTimelineIsPlaying]);

    useEffect(() => {
        const audioContext = audioContextRef.current;
        if (!audioContext) return;
        
        const cleanup = () => {
            clearInterval(schedulerTimerRef.current);
            schedulerTimerRef.current = undefined;
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = undefined;
            }
            activeSourcesRef.current.forEach(source => {
                try { 
                    source.onended = null;
                    source.stop(); 
                    source.disconnect();
                } catch (e) { /* Ignore errors if already stopped */ }
            });
            activeSourcesRef.current.clear();
            playbackStartRef.current = null;
        };
        
        if (timelineIsPlaying) {
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }
            scheduledClipsRef.current.clear();
            playbackStartRef.current = {
                contextTime: audioContext.currentTime,
                timelineTime: timelineCurrentTime,
            };
            const scheduleWindow = 0.5;
            const scheduleInterval = 250;

            const scheduler = () => {
                if (!playbackStartRef.current) return;
                
                const audioCtxTime = audioContext.currentTime;
                const elapsed = audioCtxTime - playbackStartRef.current.contextTime;
                const currentTime = playbackStartRef.current.timelineTime + elapsed;
                const scheduleAheadTime = currentTime + scheduleWindow;

                for (const clip of timelineClips) {
                    const isAlreadyScheduled = scheduledClipsRef.current.has(clip.id);
                    const shouldBePlaying = clip.startTime <= currentTime && clip.startTime + clip.duration > currentTime;
                    const willBePlayingSoon = clip.startTime > currentTime && clip.startTime < scheduleAheadTime;

                    if ((shouldBePlaying || willBePlayingSoon) && !isAlreadyScheduled) {
                        scheduledClipsRef.current.add(clip.id);

                        (async () => {
                            try {
                                const audioBlobData = await db.audioBlobs.get(clip.audioBlobId);
                                if (!audioBlobData) return;
                                const arrayBuffer = await audioBlobData.data.arrayBuffer();
                                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                                
                                if (!timelineIsPlaying || !playbackStartRef.current) return;
                                
                                const source = audioContext.createBufferSource();
                                source.buffer = audioBuffer;
                                source.connect(audioContext.destination);

                                const startDelay = clip.startTime - playbackStartRef.current.timelineTime;
                                const playAt = playbackStartRef.current.contextTime + startDelay;
                                
                                let offset = 0;
                                let actualPlayTime = playAt;
                                
                                if (playAt < audioContext.currentTime) {
                                    offset = audioContext.currentTime - playAt;
                                    actualPlayTime = audioContext.currentTime;
                                }
                                
                                source.start(actualPlayTime, offset);
                                
                                activeSourcesRef.current.add(source);
                                source.onended = () => {
                                    activeSourcesRef.current.delete(source);
                                };
                            } catch (e) {
                                console.error(`Error scheduling clip ${clip.id}:`, e);
                                scheduledClipsRef.current.delete(clip.id);
                            }
                        })();
                    }
                }
            };
            scheduler();
            schedulerTimerRef.current = window.setInterval(scheduler, scheduleInterval);
            
            const rafLoop = () => {
                if (playbackStartRef.current) {
                    const elapsed = audioContext.currentTime - playbackStartRef.current.contextTime;
                    const newTime = playbackStartRef.current.timelineTime + elapsed;
                    if (newTime >= totalDuration) {
                        setTimelineCurrentTime(totalDuration);
                        setTimelineIsPlaying(false);
                    } else {
                        setTimelineCurrentTime(newTime);
                        animationFrameRef.current = requestAnimationFrame(rafLoop);
                    }
                }
            };
            animationFrameRef.current = requestAnimationFrame(rafLoop);
        }

        return cleanup;
    }, [timelineIsPlaying, timelineClips, totalDuration, setTimelineIsPlaying, setTimelineCurrentTime]);

    const handleSeek = (event: React.MouseEvent<HTMLDivElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const time = Math.max(0, Math.min(x / pixelsPerSecond, totalDuration));
        
        setTimelineCurrentTime(time);
        
        if (timelineIsPlaying) {
            const audioContext = audioContextRef.current;
            if (!audioContext) return;
            
            activeSourcesRef.current.forEach(source => { try { source.stop(); } catch (e) {} });
            activeSourcesRef.current.clear();
            scheduledClipsRef.current.clear();
            playbackStartRef.current = { contextTime: audioContext.currentTime, timelineTime: time };
        }
    };

    if (isLoading) {
        return (
            <div className="h-full flex flex-col">
                <TimelineHeader />
                <div className="flex-grow flex items-center justify-center">
                    <LoadingSpinner />
                    <p className="ml-2 text-slate-300">正在计算时间轴...</p>
                </div>
            </div>
        );
    }
    
    if (timelineClips.length === 0) {
        return (
            <div className="h-full flex flex-col">
                <TimelineHeader />
                <div className="flex-grow flex items-center justify-center">
                    <p className="text-center text-slate-500 text-sm p-4">没有已对轨的音频可供显示。</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-slate-900">
            <TimelineHeader />
            <div className="w-full h-full overflow-auto relative">
                <div style={{ width: `${totalDuration * pixelsPerSecond}px`, minWidth: '100%' }} onMouseDown={handleSeek}>
                    <TimeRuler duration={totalDuration} pixelsPerSecond={pixelsPerSecond} />
                    <div className="p-2 relative">
                        <DialogueTrack clips={timelineClips} pixelsPerSecond={pixelsPerSecond} />
                    </div>
                </div>
                <Playhead pixelsPerSecond={pixelsPerSecond} />
            </div>
        </div>
    );
};

export default Timeline;