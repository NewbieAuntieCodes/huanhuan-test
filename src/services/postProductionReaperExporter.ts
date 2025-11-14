import JSZip from 'jszip';
import { db } from '../db';
import { Project, Chapter, Character, ScriptLine, LineType, SilencePairing, SoundLibraryItem } from '../types';
import { defaultSilenceSettings } from '../lib/defaultSilenceSettings';
import { bufferToWav } from '../lib/wavEncoder';

// --- Helper Functions ---

const sanitizeForRpp = (str: string): string => {
    return str.replace(/"/g, "'").replace(/[\r\n]/g, ' ');
}

const sanitizeFilename = (name: string, maxLength: number = 200): string => {
    const sanitized = name.replace(/[\r\n]/g, ' ').replace(/[<>:"/\\|?*]+/g, '_').replace(/_+/g, '_');
    const trimmed = sanitized.replace(/^[_ ]+|[_ ]+$/g, '');
    if (trimmed.length > maxLength) {
        return trimmed.substring(0, maxLength).trim() + '...';
    }
    return trimmed;
};

const getLineType = (line: ScriptLine | undefined, characters: Character[]): LineType => {
    if (!line || !line.characterId) return 'narration';
    const character = characters.find(c => c.id === line.characterId);
    if (!character || character.name === 'Narrator' || character.name === '[静音]') return 'narration';
    if (character.name === '音效' || character.name === '[音效]') return 'sfx';
    return 'dialogue';
};

interface TimelineItem {
    line: ScriptLine;
    character: Character | undefined;
    audioBlob: Blob;
    duration: number;
    chapterIndex: number;
    lineIndexInChapter: number;
    mainTimelineStartTime: number;
    sourceStartTime: number;
    generatedItemName: string;
    audioBuffer: AudioBuffer;
}

const generateDialogueRppTrackItems = (items: TimelineItem[], sourceFileName: string): string => {
    return items.map(item => `
    <ITEM
      POSITION ${item.mainTimelineStartTime.toFixed(6)}
      LENGTH ${item.duration.toFixed(6)}
      NAME "${sanitizeForRpp(item.generatedItemName)}"
      SOFFS ${item.sourceStartTime.toFixed(6)}
      <SOURCE WAVE
        FILE "${sanitizeForRpp(sourceFileName)}"
      >
    >
    `).join('');
};

const generateSfxRppTrackItems = (clips: any[]): string => {
    return clips.map(clip => `
    <ITEM
      POSITION ${clip.startTime.toFixed(6)}
      LENGTH ${clip.duration.toFixed(6)}
      NAME "${sanitizeForRpp(clip.name)}"
      <SOURCE WAVE
        FILE "${sanitizeForRpp(clip.filePath)}"
      >
    >
    `).join('');
};

const generateBgmRppTrackItems = (clips: any[]): string => {
    return clips.map(clip => {
        const itemLength = clip.duration;
        const sourceDuration = clip.sourceDuration;
        const loopCount = Math.ceil(itemLength / sourceDuration);
        let itemsRpp = '';
        for (let i = 0; i < loopCount; i++) {
            const pos = clip.startTime + (i * sourceDuration);
            const len = Math.min(sourceDuration, itemLength - (i * sourceDuration));
            if (len <= 0) continue;
            itemsRpp += `
    <ITEM
      POSITION ${pos.toFixed(6)}
      LENGTH ${len.toFixed(6)}
      NAME "${sanitizeForRpp(clip.name)}"
      SOFFS 0
      <SOURCE WAVE
        FILE "${sanitizeForRpp(clip.filePath)}"
      >
    >`;
        }
        return itemsRpp;
    }).join('');
};

const generateRppContent = (
    projectName: string,
    sampleRate: number,
    dialogueTrackItems: Record<string, string>,
    sfxTrackItems: string,
    bgmTrackItems: string
): string => {
    const trackOrder = ['narration', 'dialogue', 'os', 'telephone', 'system', 'other'];
    const dialogueTrackNames: Record<string, string> = {
        narration: '旁白 (Narration)', dialogue: '角色对白 (Dialogue)', os: '心音 (OS)',
        telephone: '电话音 (Telephone)', system: '系统音 (System)', other: '其他 (Others)'
    };

    const dialogueTracksRpp = trackOrder.map(key => {
        if (dialogueTrackItems[key] && dialogueTrackItems[key].trim() !== '') {
            return `  <TRACK\n    NAME "${dialogueTrackNames[key]}"${dialogueTrackItems[key]}\n  >`;
        }
        return '';
    }).filter(Boolean).join('\n');

    const sfxTrackRpp = sfxTrackItems.trim() ? `  <TRACK\n    NAME "音效 (SFX)"${sfxTrackItems}\n  >` : '';
    const bgmTrackRpp = bgmTrackItems.trim() ? `  <TRACK\n    NAME "背景音乐 (BGM)"${bgmTrackItems}\n  >` : '';

    return `
<REAPER_PROJECT 0.1 "7.0/js-web-exporter" 1700000000
  SAMPLERATE ${sampleRate}
${dialogueTracksRpp}
${sfxTrackRpp}
${bgmTrackRpp}
>
    `.trim();
};

// --- Main Export Function ---

export const exportPostProductionToReaper = async (
    project: Project,
    chaptersToExport: Chapter[],
    allCharacters: Character[],
    soundLibrary: SoundLibraryItem[]
): Promise<void> => {
    const { silenceSettings = defaultSilenceSettings } = project;
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const zip = new JSZip();

    try {
        // Step 1: Process dialogue (same as original exporter)
        const chapterNumberMap = new Map<string, number>();
        project.chapters.forEach((ch, idx) => chapterNumberMap.set(ch.id, idx + 1));

        const baseItemsPromises = chaptersToExport.flatMap(chapter => 
            chapter.scriptLines.map(async (line, lineIndexInChapter) => {
                if (!line.audioBlobId) return null;
                const audioBlobRecord = await db.audioBlobs.get(line.audioBlobId);
                if (!audioBlobRecord) return null;

                const buffer = await audioContext.decodeAudioData(await audioBlobRecord.data.arrayBuffer());
                return { line, audioBlob: audioBlobRecord.data, duration: buffer.duration, audioBuffer: buffer, character: allCharacters.find(c => c.id === line.characterId), chapterIndex: chapterNumberMap.get(chapter.id) || 0, lineIndexInChapter };
            })
        );
        const baseItemsUnsorted = (await Promise.all(baseItemsPromises)).filter((item): item is NonNullable<typeof item> => item !== null);

        if (baseItemsUnsorted.length === 0) throw new Error("所选章节内没有已对轨的音频。");

        baseItemsUnsorted.sort((a, b) => a.chapterIndex !== b.chapterIndex ? a.chapterIndex - b.chapterIndex : a.lineIndexInChapter - b.lineIndexInChapter);
        
        let mainTimelineTime = silenceSettings.startPadding > 0 ? silenceSettings.startPadding : 0;
        let sourceTimelineTime = 0;
        const finalTimelineItems: TimelineItem[] = [];

        for (const [index, item] of baseItemsUnsorted.entries()) {
            const chapterNumStr = item.chapterIndex.toString().padStart(3, '0');
            const characterName = sanitizeFilename(item.character?.name || '未知', 20);
            const lineNumStr = (index + 1).toString().padStart(4, '0');
            const abridgedText = sanitizeFilename(item.line.text, 30);
            const generatedItemName = `Ch${chapterNumStr}_${lineNumStr}_${characterName}_${abridgedText}`;

            finalTimelineItems.push({ ...item, mainTimelineStartTime: mainTimelineTime, sourceStartTime: sourceTimelineTime, generatedItemName });

            sourceTimelineTime += item.duration;

            let silenceDuration = 0;
            if (item.line.postSilence !== undefined && item.line.postSilence !== null) {
                silenceDuration = item.line.postSilence;
            } else {
                if (index === baseItemsUnsorted.length - 1) {
                    silenceDuration = silenceSettings.endPadding;
                } else {
                    const nextItem = baseItemsUnsorted[index + 1];
                    const currentLineType = getLineType(item.line, allCharacters);
                    const nextLineType = getLineType(nextItem.line, allCharacters);
                    const pairKey = `${currentLineType}-to-${nextLineType}` as SilencePairing;
                    silenceDuration = silenceSettings.pairs[pairKey] ?? 1.0;
                }
            }
            mainTimelineTime += item.duration + (silenceDuration > 0 ? silenceDuration : 0);
        }
        
        const totalSamples = finalTimelineItems.reduce((sum, item) => sum + item.audioBuffer.length, 0);
        if (totalSamples === 0) throw new Error("无法解码任何对话音频数据。");
        
        const offlineCtx = new OfflineAudioContext(1, totalSamples, audioContext.sampleRate);
        finalTimelineItems.forEach(item => {
            const source = offlineCtx.createBufferSource();
            source.buffer = item.audioBuffer;
            source.connect(offlineCtx.destination);
            source.start(item.sourceStartTime);
        });

        const singleConcatenatedBuffer = await offlineCtx.startRendering();
        const singleWavBlob = bufferToWav(singleConcatenatedBuffer);
        const singleAudioFilename = `${sanitizeFilename(project.name)}_Audio.wav`;
        zip.file(singleAudioFilename, singleWavBlob);
        
        const dialogueTracks: Record<string, TimelineItem[]> = { narration: [], dialogue: [], os: [], telephone: [], system: [], other: [] };
        const otherSoundTypes = new Set(project.customSoundTypes || []);

        finalTimelineItems.forEach(item => {
            const soundType = item.line.soundType;
            if (item.character?.name === 'Narrator') dialogueTracks.narration.push(item);
            else if (soundType === 'OS') dialogueTracks.os.push(item);
            else if (soundType === '电话音') dialogueTracks.telephone.push(item);
            else if (soundType === '系统音') dialogueTracks.system.push(item);
            else if (soundType && otherSoundTypes.has(soundType)) dialogueTracks.other.push(item);
            else dialogueTracks.dialogue.push(item);
        });
        
        const dialogueTrackItemsStrings: Record<string, string> = {};
        Object.keys(dialogueTracks).forEach(key => {
            if(dialogueTracks[key].length > 0) {
                dialogueTrackItemsStrings[key] = generateDialogueRppTrackItems(dialogueTracks[key], singleAudioFilename);
            }
        });

        // Step 2: SFX and BGM Processing
        const sfxClips: any[] = [];
        const bgmClips: any[] = [];
        const usedSoundFiles = new Map<number, { blob: Blob, path: string }>();
        const lineStartTimes = new Map<string, number>(finalTimelineItems.map(item => [item.line.id, item.mainTimelineStartTime]));
        const lineDurations = new Map<string, number>(finalTimelineItems.map(item => [item.line.id, item.duration]));
        const sfxRegex = /\[音效-([^\]]+)\]/g;
        // 兼容 <名称>、<♫-名称>、<BGM-名称>
        const bgmStartRegex = /<\s*(?:(?:BGM|[\u266A\u266B])\s*-\s*)?([^>]+)>/g;
        let activeBgm: { name: string, startTime: number } | null = null;
        
        const allLinesChronological = project.chapters.flatMap(ch => ch.scriptLines);
        for (const line of allLinesChronological) {
            const lineStartTime = lineStartTimes.get(line.id);
            if (lineStartTime === undefined) continue;
            
            const lineDuration = lineDurations.get(line.id) || 0;
            const text = line.text;

            let sfxMatch;
            while ((sfxMatch = sfxRegex.exec(text)) !== null) {
                const sfxName = sfxMatch[1];
                const sound = soundLibrary.find(s => s.name.toLowerCase().includes(sfxName.toLowerCase()));
                if (sound?.id) {
                    if (!usedSoundFiles.has(sound.id)) {
                        const file = await sound.handle.getFile();
                        usedSoundFiles.set(sound.id, { blob: file, path: `sfx/${sanitizeFilename(sound.name)}` });
                    }
                    sfxClips.push({
                        startTime: lineStartTime + (sfxMatch.index / text.length) * lineDuration,
                        duration: sound.duration,
                        name: `SFX: ${sfxName}`,
                        filePath: usedSoundFiles.get(sound.id)!.path
                    });
                }
            }

            if (activeBgm && text.includes('//')) {
                const endTime = lineStartTime + (text.indexOf('//') / text.length) * lineDuration;
                const sound = soundLibrary.find(s => s.name.toLowerCase().includes(activeBgm!.name.toLowerCase()));
                if (sound?.id) {
                    if (!usedSoundFiles.has(sound.id)) {
                        const file = await sound.handle.getFile();
                        usedSoundFiles.set(sound.id, { blob: file, path: `bgm/${sanitizeFilename(sound.name)}` });
                    }
                    bgmClips.push({
                        startTime: activeBgm.startTime,
                        duration: endTime - activeBgm.startTime,
                        name: `BGM: ${activeBgm.name}`,
                        filePath: usedSoundFiles.get(sound.id)!.path,
                        sourceDuration: sound.duration,
                    });
                }
                activeBgm = null;
            }
            
            let bgmMatch;
            while ((bgmMatch = bgmStartRegex.exec(text)) !== null) {
                if (activeBgm) continue;
                activeBgm = { name: bgmMatch[1], startTime: lineStartTime + (bgmMatch.index / text.length) * lineDuration };
            }
        }

        if (activeBgm) {
            const sound = soundLibrary.find(s => s.name.toLowerCase().includes(activeBgm!.name.toLowerCase()));
            if (sound?.id) {
                if (!usedSoundFiles.has(sound.id)) {
                    const file = await sound.handle.getFile();
                    usedSoundFiles.set(sound.id, { blob: file, path: `bgm/${sanitizeFilename(sound.name)}` });
                }
                bgmClips.push({
                    startTime: activeBgm.startTime,
                    duration: mainTimelineTime - activeBgm.startTime,
                    name: `BGM: ${activeBgm.name}`,
                    filePath: usedSoundFiles.get(sound.id)!.path,
                    sourceDuration: sound.duration,
                });
            }
        }
        
        // Step 3: Generate RPP content with all tracks
        const sfxTrackItems = generateSfxRppTrackItems(sfxClips);
        const bgmTrackItems = generateBgmRppTrackItems(bgmClips);
        const rppContent = generateRppContent(project.name, audioContext.sampleRate, dialogueTrackItemsStrings, sfxTrackItems, bgmTrackItems);

        // Step 4: Create ZIP
        const newReadme = `你好！感谢使用 AI 有声内容创作工具。

此 Reaper 工程文件已包含对白、音效(SFX)和背景音乐(BGM)轨道。

**重要：如何使用这个 Reaper 工程文件**

1.  **解压文件**：请将这个 .zip 压缩包的 **全部内容** 解压到一个新的文件夹中。
    *切勿* 直接在压缩包查看器中双击 .RPP 文件，这会导致 Reaper 找不到音频文件。

2.  **打开工程**：进入你刚刚解压的文件夹，然后双击 .RPP 文件。

Reaper 现在应该能正确加载所有音轨和对应的音频片段了。

---
**工作流说明**

- **对白轨道**：所有对白音频被合并在一个长文件中，但在 Reaper 中显示为独立片段，方便对轨和独立处理。
- **音效(SFX)和背景音乐(BGM)轨道**：这些音轨上的音频片段引用的是独立的音频文件，存放在 'sfx/' 和 'bgm/' 文件夹中。这使您可以轻松替换或调整单个音效/BGM。

为了让你在 Reaper 中能清晰地识别每一段音频，我们保留了详细的片段命名：
**对白片段名称格式**：\`Ch[章节号]_[行号]_[角色名]_[台词片段]\`
**例如**：\`Ch001_003_白瑶_你好啊\`

我们相信这个新方案能为您提供更专业、更高效的后期制作体验。

祝创作顺利！
`;
        zip.file("【重要】如何使用.txt", newReadme);
        zip.file(`${sanitizeFilename(project.name)}.RPP`, rppContent);

        for (const fileInfo of usedSoundFiles.values()) {
            zip.file(fileInfo.path, fileInfo.blob);
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });

        // Step 5: Trigger download
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sanitizeFilename(project.name)}_Reaper_Full.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } finally {
        if (audioContext.state !== 'closed') {
          await audioContext.close();
        }
    }
};
