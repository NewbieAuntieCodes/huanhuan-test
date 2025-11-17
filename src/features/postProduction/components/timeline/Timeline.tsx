import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../../../../store/useStore';
import { db } from '../../../../db';
import { LineType, ScriptLine, Character, SilencePairing } from '../../../../types';
import LoadingSpinner from '../../../../components/ui/LoadingSpinner';
import DialogueTrack from './DialogueTrack';
import TimeRuler from './TimeRuler';
import { defaultSilenceSettings } from '../../../../lib/defaultSilenceSettings';

export interface TimelineClip {
    id: string;
    startTime: number;
    duration: number;
    line: ScriptLine;
    character?: Character;
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
    const { selectedProjectId, projects, characters } = useStore();
    const [timelineClips, setTimelineClips] = useState<TimelineClip[]>([]);
    const [totalDuration, setTotalDuration] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    const currentProject = useMemo(() => projects.find(p => p.id === selectedProjectId), [projects, selectedProjectId]);
    const characterMap = useMemo(() => new Map(characters.map(c => [c.id, c])), [characters]);

    useEffect(() => {
        if (!currentProject) {
            setIsLoading(false);
            setTimelineClips([]);
            return;
        }

        const calculateTimeline = async () => {
            setIsLoading(true);
            const clips: TimelineClip[] = [];
            let currentTime = 0;
            const silenceSettings = currentProject.silenceSettings || defaultSilenceSettings;

            currentTime += silenceSettings.startPadding > 0 ? silenceSettings.startPadding : 0;
            
            const allLinesWithAudio = currentProject.chapters.flatMap(ch => ch.scriptLines).filter(line => line.audioBlobId);
            
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

            try {
                for (let i = 0; i < allLinesWithAudio.length; i++) {
                    const line = allLinesWithAudio[i];
                    const audioBlobData = await db.audioBlobs.get(line.audioBlobId!);
                    if (audioBlobData) {
                        const audioBuffer = await audioContext.decodeAudioData(await audioBlobData.data.arrayBuffer());
                        const duration = audioBuffer.duration;

                        clips.push({
                            id: line.id,
                            startTime: currentTime,
                            duration: duration,
                            line: line,
                            character: line.characterId ? characterMap.get(line.characterId) : undefined,
                        });

                        currentTime += duration;

                        // Add silence
                        let silenceDuration = 0;
                        if (line.postSilence !== undefined && line.postSilence !== null) {
                            silenceDuration = line.postSilence;
                        } else {
                            if (i === allLinesWithAudio.length - 1) {
                                silenceDuration = silenceSettings.endPadding;
                            } else {
                                const nextLine = allLinesWithAudio[i+1];
                                const currentLineType = getLineType(line, characters);
                                const nextLineType = getLineType(nextLine, characters);
                                const pairKey = `${currentLineType}-to-${nextLineType}` as SilencePairing;
                                silenceDuration = silenceSettings.pairs[pairKey] ?? 1.0;
                            }
                        }
                        currentTime += silenceDuration > 0 ? silenceDuration : 0;
                    }
                }
            } finally {
                if(audioContext.state !== 'closed') {
                    await audioContext.close();
                }
            }

            setTimelineClips(clips);
            setTotalDuration(currentTime);
            setIsLoading(false);
        };

        calculateTimeline();
    }, [currentProject, characters, characterMap]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <LoadingSpinner />
                <p className="ml-2 text-slate-300">正在计算时间轴...</p>
            </div>
        );
    }
    
    if (timelineClips.length === 0) {
        return <p className="text-center text-slate-500 text-sm p-4">没有已对轨的音频可供显示。</p>;
    }

    return (
        <div className="w-full h-full overflow-auto relative">
             <TimeRuler duration={totalDuration} pixelsPerSecond={PIXELS_PER_SECOND} />
            <div style={{ width: `${totalDuration * PIXELS_PER_SECOND}px`, minWidth: '100%' }} className="p-2">
                <DialogueTrack clips={timelineClips} pixelsPerSecond={PIXELS_PER_SECOND} />
            </div>
        </div>
    );
};

export default Timeline;
