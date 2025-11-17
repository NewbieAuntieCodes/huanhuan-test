import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useStore } from '../../../../store/useStore';
import { db } from '../../../../db';
import { LineType, ScriptLine, Character, SilencePairing } from '../../../../types';
import LoadingSpinner from '../../../../components/ui/LoadingSpinner';
import DialogueTrack from './DialogueTrack';
import TimeRuler from './TimeRuler';
import { defaultSilenceSettings } from '../../../../lib/defaultSilenceSettings';
import Playhead from './Playhead';
import TimelineHeader from '../TimelineHeader';

export interface TimelineClip {
    id: string;
    startTime: number;
    duration: number;
    line: ScriptLine;
    character?: Character;
    audioBuffer: AudioBuffer;
}

const getLineType = (line: ScriptLine | undefined, characters: Character[]): LineType => {
    if (!line || !line.characterId) return 'narration';
    const character = characters.find(c => c.id === line.characterId);
    if (!character || character.name === 'Narrator' || character.name === '[静音]') return 'narration';
    if (character.name === '音效' || character.name === '[音效]') return 'sfx';
    return 'dialogue';
};

const PIXELS_PER_SECOND = 100;

const Timeline: React.FC = () => {
    const {
      selectedProjectId,
      projects,
      characters,
      timelineIsPlaying,
      setTimelineIsPlaying,
      timelineCurrentTime,
      setTimelineCurrentTime,
    } = useStore();
    
    const [timelineClips, setTimelineClips] = useState<TimelineClip[]>([]);
    const [totalDuration, setTotalDuration] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    
    const audioContextRef = useRef<AudioContext | null>(null);
    const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const animationFrameRef = useRef<number>();
    const playbackStartRef = useRef<{ contextTime: number, timelineTime: number } | null>(null);

    const currentProject = useMemo(() => projects.find(p => p.id === selectedProjectId), [projects, selectedProjectId]);
    const characterMap = useMemo(() => new Map(characters.map(c => [c.id, c])), [characters]);

    useEffect(() => {
        // Initialize and clean up the AudioContext
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        return () => {
            audioContextRef.current?.close();
        };
    }, []);

    useEffect(() => {
        if (!currentProject || !audioContextRef.current) {
            setIsLoading(false);
            setTimelineClips([]);
            return;
        }
        const audioContext = audioContextRef.current; // Use the persistent context

        const calculateTimeline = async () => {
            setIsLoading(true);
            const clips: TimelineClip[] = [];
            let currentTime = 0;
            const silenceSettings = currentProject.silenceSettings || defaultSilenceSettings;

            currentTime += silenceSettings.startPadding > 0 ? silenceSettings.startPadding : 0;
            
            const allLinesWithAudio = currentProject.chapters.flatMap(ch => ch.scriptLines).filter(line => line.audioBlobId);
            
            // Using Promise.all for parallel decoding
            const decodedItems = await Promise.all(
                allLinesWithAudio.map(async (line) => {
                    const audioBlobData = await db.audioBlobs.get(line.audioBlobId!);
                    if (audioBlobData) {
                        try {
                            const audioBuffer = await audioContext.decodeAudioData(await audioBlobData.data.arrayBuffer());
                            return { line, audioBuffer };
                        } catch (e) {
                            console.error(`Failed to decode audio for line ${line.id}:`, e);
                            return null;
                        }
                    }
                    return null;
                })
            );

            const validItems = decodedItems.filter((item): item is { line: ScriptLine, audioBuffer: AudioBuffer } => item !== null);

            for (let i = 0; i < validItems.length; i++) {
                const { line, audioBuffer } = validItems[i];
                const duration = audioBuffer.duration;

                clips.push({
                    id: line.id,
                    startTime: currentTime,
                    duration: duration,
                    line: line,
                    character: line.characterId ? characterMap.get(line.characterId) : undefined,
                    audioBuffer: audioBuffer,
                });

                currentTime += duration;

                let silenceDuration = 0;
                if (line.postSilence !== undefined && line.postSilence !== null) {
                    silenceDuration = line.postSilence;
                } else {
                    if (i === validItems.length - 1) {
                        silenceDuration = silenceSettings.endPadding;
                    } else {
                        const nextLine = validItems[i+1].line;
                        const currentLineType = getLineType(line, characters);
                        const nextLineType = getLineType(nextLine, characters);
                        const pairKey = `${currentLineType}-to-${nextLineType}` as SilencePairing;
                        silenceDuration = silenceSettings.pairs[pairKey] ?? 1.0;
                    }
                }
                currentTime += silenceDuration > 0 ? silenceDuration : 0;
            }

            setTimelineClips(clips);
            setTotalDuration(currentTime);
            setIsLoading(false);
        };

        calculateTimeline();
    }, [currentProject, characters, characterMap]);

    // --- Playback Engine ---
    useEffect(() => {
        const audioContext = audioContextRef.current;
        if (!audioContext) return;

        const stopPlayback = () => {
            activeSourcesRef.current.forEach(source => {
                try { 
                    source.stop(); 
                    source.disconnect(); // Also disconnect to be tidy
                } catch (e) {
                    // Ignore errors if already stopped
                }
            });
            activeSourcesRef.current.clear();
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = undefined;
            }
            playbackStartRef.current = null;
        };

        const startPlayback = (startTime: number) => {
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }
            
            stopPlayback();
            playbackStartRef.current = { contextTime: audioContext.currentTime, timelineTime: startTime };
            
            const newSources = timelineClips
                .filter(clip => clip.startTime + clip.duration > startTime)
                .map(clip => {
                    const source = audioContext.createBufferSource();
                    source.buffer = clip.audioBuffer;
                    source.connect(audioContext.destination);

                    const whenToStart = playbackStartRef.current!.contextTime + Math.max(0, clip.startTime - startTime);
                    const offset = startTime > clip.startTime ? startTime - clip.startTime : 0;
                    
                    source.start(whenToStart, offset);
                    
                    // Cleanup when source ends
                    source.onended = () => {
                        activeSourcesRef.current.delete(source);
                    };

                    return source;
                });
            
            activeSourcesRef.current = new Set(newSources);

            const rafLoop = () => {
                if (playbackStartRef.current) {
                    const elapsed = audioContext.currentTime - playbackStartRef.current.contextTime;
                    const newTime = playbackStartRef.current.timelineTime + elapsed;

                    if (newTime >= totalDuration) {
                        setTimelineCurrentTime(totalDuration);
                        setTimelineIsPlaying(false); // This will trigger the stop logic in the next render
                    } else {
                        setTimelineCurrentTime(newTime);
                        animationFrameRef.current = requestAnimationFrame(rafLoop);
                    }
                }
            };
            animationFrameRef.current = requestAnimationFrame(rafLoop);
        };

        if (timelineIsPlaying) {
            startPlayback(timelineCurrentTime);
        } else {
            stopPlayback();
        }

        // Cleanup on unmount or when dependencies change
        return () => stopPlayback();
    }, [timelineIsPlaying, timelineClips, totalDuration, timelineCurrentTime, setTimelineIsPlaying, setTimelineCurrentTime]);

    const handleSeek = (event: React.MouseEvent<HTMLDivElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const time = Math.max(0, x / PIXELS_PER_SECOND);
        setTimelineCurrentTime(time);
    };

    if (isLoading) {
        return (
            <div className="h-full flex flex-col">
                <TimelineHeader />
                <div className="flex-grow flex items-center justify-center">
                    <LoadingSpinner />
                    <p className="ml-2 text-slate-300">正在计算并预加载时间轴音频...</p>
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
        <div className="h-full flex flex-col bg-slate-800">
            <TimelineHeader />
            <div className="w-full h-full overflow-auto relative">
                <div style={{ width: `${totalDuration * PIXELS_PER_SECOND}px`, minWidth: '100%' }} onMouseDown={handleSeek}>
                    <TimeRuler duration={totalDuration} pixelsPerSecond={PIXELS_PER_SECOND} />
                    <div className="p-2 relative">
                        <DialogueTrack clips={timelineClips} pixelsPerSecond={PIXELS_PER_SECOND} />
                    </div>
                </div>
                <Playhead pixelsPerSecond={PIXELS_PER_SECOND} />
            </div>
        </div>
    );
};

export default Timeline;