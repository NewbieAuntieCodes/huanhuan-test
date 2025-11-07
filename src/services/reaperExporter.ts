import JSZip from 'jszip';
import { db } from '../db';
import { Project, Chapter, Character, ScriptLine, LineType, SilencePairing } from '../types';
import { defaultSilenceSettings } from '../lib/defaultSilenceSettings';

// --- Helper Functions ---

const sanitizeFilename = (name: string): string => {
    return name.replace(/[<>:"/\\|?*]+/g, '_');
};

const getLineType = (line: ScriptLine | undefined, characters: Character[]): LineType => {
    if (!line || !line.characterId) return 'narration';
    const character = characters.find(c => c.id === line.characterId);
    if (!character || character.name === 'Narrator' || character.name === '[静音]') return 'narration';
    if (character.name === '音效') return 'sfx';
    return 'dialogue';
};

const generateRppTrackItems = (
    items: TimelineItem[],
    audioFilesMap: Map<string, { blob: Blob, newName: string }>,
    fileCounter: { count: number }
): string => {
    return items.map(item => {
        const fileNumber = (++fileCounter.count).toString().padStart(4, '0');
        const newName = `${fileNumber}.wav`;
        audioFilesMap.set(item.line.id, { blob: item.audioBlob, newName });

        return `
    <ITEM
      POSITION ${item.startTime.toFixed(6)}
      LENGTH ${item.duration.toFixed(6)}
      SOURCE WAVE "Audio/${newName}"
    >`;
    }).join('\n');
};

const generateRppContent = (
    projectName: string,
    sampleRate: number,
    trackItems: Record<string, string>
): string => {
    return `
<REAPER_PROJECT 0.1 "6.83/js-web-exporter" 1680000000
  SAMPLERATE ${sampleRate}
  <TRACK
    NAME "旁白 (Narration)"
    ${trackItems.narration || ''}
  >
  <TRACK
    NAME "角色对白 (Dialogue)"
    ${trackItems.dialogue || ''}
  >
  <TRACK
    NAME "心音 (OS)"
    ${trackItems.os || ''}
  >
  <TRACK
    NAME "电话音 (Telephone)"
    ${trackItems.telephone || ''}
  >
  <TRACK
    NAME "系统音 (System)"
    ${trackItems.system || ''}
  >
  <TRACK
    NAME "其他 (Others)"
    ${trackItems.other || ''}
  >
>
    `.trim();
};

interface TimelineItem {
    line: ScriptLine;
    character: Character | undefined;
    audioBlob: Blob;
    startTime: number;
    duration: number;
}

// --- Main Export Function ---

export const exportToReaperProject = async (
    project: Project,
    chaptersToExport: Chapter[],
    allCharacters: Character[]
): Promise<void> => {
    const { silenceSettings = defaultSilenceSettings } = project;
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    try {
        // 1. Collect all lines with audio
        const linesWithAudioInfo: { line: ScriptLine, chapter: Chapter }[] = [];
        for (const chapter of chaptersToExport) {
            for (const line of chapter.scriptLines) {
                if (line.audioBlobId) {
                    linesWithAudioInfo.push({ line, chapter });
                }
            }
        }

        if (linesWithAudioInfo.length === 0) {
            throw new Error("所选章节内没有已对轨的音频。");
        }

        // 2. Build Timeline
        const timelineItems: TimelineItem[] = [];
        let currentTime = silenceSettings.startPadding > 0 ? silenceSettings.startPadding : 0;

        for (let i = 0; i < linesWithAudioInfo.length; i++) {
            const { line } = linesWithAudioInfo[i];
            const audioBlobRecord = await db.audioBlobs.get(line.audioBlobId!);
            if (!audioBlobRecord) continue;

            const buffer = await audioContext.decodeAudioData(await audioBlobRecord.data.arrayBuffer());
            const duration = buffer.duration;

            timelineItems.push({
                line,
                character: allCharacters.find(c => c.id === line.characterId),
                audioBlob: audioBlobRecord.data,
                startTime: currentTime,
                duration,
            });

            // Calculate silence for the next item
            let silenceDuration = 0;
            if (line.postSilence !== undefined && line.postSilence !== null) {
                silenceDuration = line.postSilence;
            } else {
                if (i === linesWithAudioInfo.length - 1) {
                    silenceDuration = silenceSettings.endPadding;
                } else {
                    const nextLineInfo = linesWithAudioInfo[i + 1];
                    const currentLineType = getLineType(line, allCharacters);
                    const nextLineType = getLineType(nextLineInfo.line, allCharacters);
                    const pairKey = `${currentLineType}-to-${nextLineType}` as SilencePairing;
                    silenceDuration = silenceSettings.pairs[pairKey] ?? 1.0;
                }
            }
            currentTime += duration + (silenceDuration > 0 ? silenceDuration : 0);
        }

        // 3. Categorize into tracks
        const tracks: Record<string, TimelineItem[]> = {
            narration: [], dialogue: [], os: [], telephone: [], system: [], other: []
        };
        const otherSoundTypes = new Set(project.customSoundTypes || []);
        
        timelineItems.forEach(item => {
            if (item.character?.name === 'Narrator') {
                tracks.narration.push(item);
            } else if (item.line.soundType === 'OS') {
                tracks.os.push(item);
            } else if (item.line.soundType === '电话音') {
                tracks.telephone.push(item);
            } else if (item.line.soundType === '系统音') {
                tracks.system.push(item);
            } else if (item.line.soundType && otherSoundTypes.has(item.line.soundType)) {
                tracks.other.push(item);
            } else {
                tracks.dialogue.push(item);
            }
        });

        // 4. Generate RPP content
        const audioFilesMap = new Map<string, { blob: Blob, newName: string }>();
        const fileCounter = { count: 0 };
        const trackItemsStrings: Record<string, string> = {};
        Object.keys(tracks).forEach(key => {
            trackItemsStrings[key] = generateRppTrackItems(tracks[key], audioFilesMap, fileCounter);
        });

        const rppContent = generateRppContent(project.name, audioContext.sampleRate, trackItemsStrings);

        // 5. Create ZIP file
        const zip = new JSZip();
        zip.file(`${sanitizeFilename(project.name)}.RPP`, rppContent);
        const audioFolder = zip.folder('Audio');
        if (audioFolder) {
            audioFilesMap.forEach(fileInfo => {
                audioFolder.file(fileInfo.newName, fileInfo.blob);
            });
        }
        
        const zipBlob = await zip.generateAsync({ type: 'blob' });

        // 6. Trigger download
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sanitizeFilename(project.name)}_Reaper.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } finally {
        await audioContext.close();
    }
};