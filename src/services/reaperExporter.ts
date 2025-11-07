import JSZip from 'jszip';
import { db } from '../db';
import { Project, Chapter, Character, ScriptLine, LineType, SilencePairing } from '../types';
import { defaultSilenceSettings } from '../lib/defaultSilenceSettings';

// --- Helper Functions ---

const sanitizeForRpp = (str: string): string => {
    return str.replace(/"/g, "'").replace(/[\r\n]/g, ' ');
}

const sanitizeFilename = (name: string, maxLength: number = 200): string => {
    // Replace invalid characters with underscores and collapse multiple underscores
    const sanitized = name.replace(/[\r\n]/g, ' ').replace(/[<>:"/\\|?*]+/g, '_').replace(/_+/g, '_');
    // Trim leading/trailing underscores and spaces
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
    if (character.name === '音效') return 'sfx';
    return 'dialogue';
};

interface TimelineItem {
    line: ScriptLine;
    character: Character | undefined;
    audioBlob: Blob;
    startTime: number;
    duration: number;
    generatedFileName: string;
}

const generateRppTrackItems = (items: TimelineItem[]): string => {
    return items.map(item => `
    <ITEM
      POSITION ${item.startTime.toFixed(6)}
      LENGTH ${item.duration.toFixed(6)}
      NAME "${sanitizeForRpp(item.generatedFileName.replace('.wav', ''))}"
      <SOURCE WAVE
        FILE "${sanitizeForRpp(item.generatedFileName)}"
      >
    >
    `).join('');
};


const generateRppContent = (
    projectName: string,
    sampleRate: number,
    trackItems: Record<string, string>
): string => {
    return `
<REAPER_PROJECT 0.1 "7.0/js-web-exporter" 1700000000
  SAMPLERATE ${sampleRate}
  <TRACK
    NAME "旁白 (Narration)"${trackItems.narration || ''}
  >
  <TRACK
    NAME "角色对白 (Dialogue)"${trackItems.dialogue || ''}
  >
  <TRACK
    NAME "心音 (OS)"${trackItems.os || ''}
  >
  <TRACK
    NAME "电话音 (Telephone)"${trackItems.telephone || ''}
  >
  <TRACK
    NAME "系统音 (System)"${trackItems.system || ''}
  >
  <TRACK
    NAME "其他 (Others)"${trackItems.other || ''}
  >
>
    `.trim();
};

// --- Main Export Function ---

export const exportToReaperProject = async (
    project: Project,
    chaptersToExport: Chapter[],
    allCharacters: Character[]
): Promise<void> => {
    const { silenceSettings = defaultSilenceSettings } = project;
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    try {
        // 1. Collect all lines with audio blobs
        const itemsToProcess: { line: ScriptLine; chapter: Chapter; audioBlob: Blob }[] = [];
        for (const chapter of chaptersToExport) {
            for (const line of chapter.scriptLines) {
                if (line.audioBlobId) {
                    const audioBlobRecord = await db.audioBlobs.get(line.audioBlobId);
                    if (audioBlobRecord) {
                        itemsToProcess.push({ line, chapter, audioBlob: audioBlobRecord.data });
                    }
                }
            }
        }

        if (itemsToProcess.length === 0) {
            throw new Error("所选章节内没有已对轨的音频。");
        }

        // 2. Build timeline items with durations and descriptive filenames
        const timelineItems: TimelineItem[] = [];
        const audioFilesMap = new Map<string, { blob: Blob; newName: string }>();
        const chapterNumberMap = new Map<string, number>();
        project.chapters.forEach((ch, idx) => chapterNumberMap.set(ch.id, idx + 1));
        const chapterLineCounters = new Map<string, number>();

        for (const item of itemsToProcess) {
            const { line, chapter, audioBlob } = item;
            const buffer = await audioContext.decodeAudioData(await audioBlob.arrayBuffer());
            const duration = buffer.duration;

            const lineCounterInChapter = (chapterLineCounters.get(chapter.id) || 0) + 1;
            chapterLineCounters.set(chapter.id, lineCounterInChapter);

            const character = allCharacters.find(c => c.id === line.characterId);
            const chapterNumStr = (chapterNumberMap.get(chapter.id) || 0).toString().padStart(3, '0');
            const characterName = sanitizeFilename(character?.name || '未知角色', 20);
            const lineNumStr = lineCounterInChapter.toString().padStart(3, '0');
            const abridgedText = sanitizeFilename(line.text, 30);
            const newName = `Ch${chapterNumStr}_${lineNumStr}_${characterName}_${abridgedText}.wav`;

            timelineItems.push({
                line,
                character,
                audioBlob,
                startTime: 0, // Placeholder, will be calculated next
                duration,
                generatedFileName: newName,
            });
            audioFilesMap.set(line.id, { blob: audioBlob, newName });
        }

        // 3. Calculate correct start times for each item based on duration and silence
        let currentTime = silenceSettings.startPadding > 0 ? silenceSettings.startPadding : 0;
        for (let i = 0; i < timelineItems.length; i++) {
            const item = timelineItems[i];
            item.startTime = currentTime;

            let silenceDuration = 0;
            if (item.line.postSilence !== undefined && item.line.postSilence !== null) {
                silenceDuration = item.line.postSilence;
            } else {
                if (i === timelineItems.length - 1) {
                    silenceDuration = silenceSettings.endPadding;
                } else {
                    const nextItem = timelineItems[i + 1];
                    const currentLineType = getLineType(item.line, allCharacters);
                    const nextLineType = getLineType(nextItem.line, allCharacters);
                    const pairKey = `${currentLineType}-to-${nextLineType}` as SilencePairing;
                    silenceDuration = silenceSettings.pairs[pairKey] ?? 1.0;
                }
            }
            currentTime += item.duration + (silenceDuration > 0 ? silenceDuration : 0);
        }
        
        // 4. Categorize items into tracks
        const tracks: Record<string, TimelineItem[]> = { narration: [], dialogue: [], os: [], telephone: [], system: [], other: [] };
        const otherSoundTypes = new Set(project.customSoundTypes || []);
        
        timelineItems.forEach(item => {
            if (item.character?.name === 'Narrator') tracks.narration.push(item);
            else if (item.line.soundType === 'OS') tracks.os.push(item);
            else if (item.line.soundType === '电话音') tracks.telephone.push(item);
            else if (item.line.soundType === '系统音') tracks.system.push(item);
            else if (item.line.soundType && otherSoundTypes.has(item.line.soundType)) tracks.other.push(item);
            else tracks.dialogue.push(item);
        });

        // 5. Generate RPP content strings for each track
        const trackItemsStrings: Record<string, string> = {};
        Object.keys(tracks).forEach(key => {
            trackItemsStrings[key] = generateRppTrackItems(tracks[key]);
        });
        const rppContent = generateRppContent(project.name, audioContext.sampleRate, trackItemsStrings);

        // 6. Create ZIP file with RPP, audio files, and a README
        const zip = new JSZip();
        const readmeContent = `你好！感谢使用 AI 有声内容创作工具。

**重要：如何使用这个 Reaper 工程文件**

1.  **解压文件**：请将这个 .zip 压缩包的 **全部内容** 解压到一个新的文件夹中。
    *切勿* 直接在压缩包查看器中双击 .RPP 文件，这会导致 Reaper 找不到音频文件。

2.  **打开工程**：进入你刚刚解压的文件夹，然后双击 .RPP 文件。

Reaper 现在应该能正确加载所有音轨和对应的音频片段了。

---
**常见问题：为什么导入Reaper后音频是空的/显示“OFFLINE”？**

这几乎总是因为您没有先解压ZIP文件。当您直接从ZIP压缩包里打开.RPP文件时，操作系统只会临时解压这一个文件，但音频文件并没有被一起解压出来，所以Reaper自然就找不到了。

**正确的做法永远是：先完整解压，再打开工程。**

---
**关于音频文件的说明**

你可能会注意到，我们没有采纳“将一个角色的所有台词合并成一个文件”的建议。这是因为，在专业的音频后期流程中，**保持每一句台词的独立性至关重要**。

这样做的好处是：
- **精准对轨**：你可以精确调整每一句台词的时间，与其他角色的对话无缝衔接。
- **独立处理**：可以对单句台词进行独立的音量、效果（如混响）和声像调整。
- **方便修改**：如果某一句需要重录或替换，只需替换单个小文件，而不是重新处理整个大文件。

为了让你在 Reaper 中能清晰地识别每一段音频，我们改进了命名规则：

**文件名格式**：\`Ch[章节号]_[行号]_[角色名]_[台词片段].wav\`
**例如**：\`Ch001_003_白瑶_你好啊.wav\`

这个名字清晰地告诉你这是第一章、第三个音频片段、角色是“白瑶”，内容是“你好啊”。并且，现在Reaper的轨道上也会直接显示这个名字。

我们相信这个方案能为你提供更专业、更高效的后期制作体验。

祝创作顺利！
`;
        zip.file("【重要】如何使用.txt", readmeContent);
        zip.file(`${sanitizeFilename(project.name)}.RPP`, rppContent);
        
        // Add audio files to the root of the zip
        audioFilesMap.forEach(fileInfo => {
            zip.file(fileInfo.newName, fileInfo.blob);
        });
        
        const zipBlob = await zip.generateAsync({ type: 'blob' });

        // 7. Trigger download
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
