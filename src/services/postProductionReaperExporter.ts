import JSZip from 'jszip';
import { db } from '../db';
import {
  Project,
  Chapter,
  Character,
  ScriptLine,
  LineType,
  SilencePairing,
  SoundLibraryItem,
  TextMarker,
  PostProductionLufsSettings,
} from '../types';
import { defaultSilenceSettings } from '../lib/defaultSilenceSettings';
import { bufferToWav } from '../lib/wavEncoder';
import { estimateLufsFromAudioBuffer } from '../lib/lufsNormalizer';
import { ensureSoundLufsFromBuffer, computeGainDbFromLufs } from './lufsService';

// --- Helper Functions ---

const sanitizeForRpp = (str: string): string => {
  return str.replace(/"/g, "'").replace(/[\r\n]/g, ' ');
};

const sanitizeFilename = (name: string, maxLength: number = 200): string => {
  const sanitized = name
    .replace(/[\r\n]/g, ' ')
    .replace(/[<>:"/\\|?*]+/g, '_')
    .replace(/_+/g, '_');
  const trimmed = sanitized.replace(/^[_ ]+|[_ ]+$/g, '');
  if (trimmed.length > maxLength) {
    return trimmed.substring(0, maxLength).trim() + '...';
  }
  return trimmed;
};

const getLineType = (line: ScriptLine | undefined, characters: Character[]): LineType => {
  if (!line || !line.characterId) return 'narration';
  const character = characters.find((c) => c.id === line.characterId);
  if (!character || character.name === 'Narrator' || character.name === '[旁白]') {
    return 'narration';
  }
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
  gainLinear?: number;
}

interface FxClip {
  startTime: number;
  duration: number;
  name: string;
  filePath: string;
  gainLinear?: number;
}

interface BgmClip extends FxClip {
  sourceDuration: number;
}

const dialogueItemToRpp = (item: TimelineItem, sourceFileName: string): string => {
  const volLine =
    typeof item.gainLinear === 'number' && isFinite(item.gainLinear) && item.gainLinear !== 1
      ? `      VOLPAN ${item.gainLinear.toFixed(6)} 0 1 -1\n`
      : '';

  return `
    <ITEM
      POSITION ${item.mainTimelineStartTime.toFixed(6)}
      LENGTH ${item.duration.toFixed(6)}
      NAME "${sanitizeForRpp(item.generatedItemName)}"
${volLine}      SOFFS ${item.sourceStartTime.toFixed(6)}
      <SOURCE WAVE
        FILE "${sanitizeForRpp(sourceFileName)}"
      >
    >
  `;
};

const generateDialogueRppTrackItems = (items: TimelineItem[], sourceFileName: string): string =>
  items.map((item) => dialogueItemToRpp(item, sourceFileName)).join('');

const sfxClipToRpp = (clip: FxClip): string => {
  const volLine =
    typeof clip.gainLinear === 'number' && isFinite(clip.gainLinear) && clip.gainLinear !== 1
      ? `      VOLPAN ${clip.gainLinear.toFixed(6)} 0 1 -1\n`
      : '';

  return `
    <ITEM
      POSITION ${clip.startTime.toFixed(6)}
      LENGTH ${clip.duration.toFixed(6)}
      NAME "${sanitizeForRpp(clip.name)}"
${volLine}      <SOURCE WAVE
        FILE "${sanitizeForRpp(clip.filePath)}"
      >
    >
  `;
};

const generateSfxRppTrackItems = (clips: FxClip[]): string =>
  clips.map((clip) => sfxClipToRpp(clip)).join('');

const generateBgmRppTrackItems = (clips: BgmClip[]): string =>
  clips
    .map((clip) => {
      const itemLength = clip.duration;
      const sourceDuration = clip.sourceDuration;
      const loopCount = Math.ceil(itemLength / sourceDuration);
      let itemsRpp = '';

      const volLine =
        typeof clip.gainLinear === 'number' &&
        isFinite(clip.gainLinear) &&
        clip.gainLinear !== 1
          ? `      VOLPAN ${clip.gainLinear.toFixed(6)} 0 1 -1\n`
          : '';

      for (let i = 0; i < loopCount; i++) {
        const pos = clip.startTime + i * sourceDuration;
        const len = Math.min(sourceDuration, itemLength - i * sourceDuration);
        if (len <= 0) continue;

        itemsRpp += `
    <ITEM
      POSITION ${pos.toFixed(6)}
      LENGTH ${len.toFixed(6)}
      NAME "${sanitizeForRpp(clip.name)}"
      SOFFS 0
${volLine}      <SOURCE WAVE
        FILE "${sanitizeForRpp(clip.filePath)}"
      >
    >`;
      }

      return itemsRpp;
    })
    .join('');

// Track names for sound library categories (fallback to category key if missing)
const SOUND_CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  music1: '音乐1',
  music2: '音乐2',
  ambience1: '环境音1',
  ambience2: '环境音2',
  footsteps: '脚步',
  fabric: '衣物',
  doors_windows: '门窗',
  transportation: '交通',
  horror: '惊悚',
  suspense: '悬疑',
  fighting: '打斗',
  firearms: '枪械爆炸',
  variety: '综艺',
  fantasy: '奇幻',
  sci_fi: '科幻',
  animals: '动物',
  other_sfx: '其他音效',
};

const getCategoryTrackName = (category: string | undefined): string => {
  if (!category) return '音效';
  return SOUND_CATEGORY_DISPLAY_NAMES[category] || category;
};

const generateRppContent = (
  projectName: string,
  sampleRate: number,
  dialogueTrackItemsByName: Record<string, string>,
  sfxTrackItemsByName: Record<string, string>,
  bgmTrackItemsByName: Record<string, string>,
): string => {
  const getDialogueOrder = (trackName: string): number => {
    if (trackName === '旁白 PB') return 0;
    if (trackName.startsWith('对白 - ')) {
      const label = trackName.slice('对白 - '.length).trim();
      const special = ['OS', '电话', '系统', '旁白', '旁白OS', '系统提示', '内心独白'];
      if (special.includes(label)) return 1;
      return 2;
    }
    return 3;
  };

  const dialogueNames = Object.keys(dialogueTrackItemsByName);
  dialogueNames.sort(
    (a, b) => getDialogueOrder(a) - getDialogueOrder(b) || a.localeCompare(b, 'zh-CN'),
  );

  const dialogueTracksRpp = dialogueNames
    .map((trackName) => {
      const items = dialogueTrackItemsByName[trackName];
      if (!items || items.trim() === '') return '';
      return `  <TRACK\n    NAME "${sanitizeForRpp(trackName)}"${items}\n  >`;
    })
    .filter(Boolean)
    .join('\n');

  const buildFxTracks = (trackItemsByName: Record<string, string>): string => {
    const names = Object.keys(trackItemsByName).filter(
      (name) => trackItemsByName[name] && trackItemsByName[name].trim() !== '',
    );
    names.sort((a, b) => a.localeCompare(b, 'zh-CN'));
    return names
      .map(
        (name) =>
          `  <TRACK\n    NAME "${sanitizeForRpp(name)}"${trackItemsByName[name]}\n  >`,
      )
      .join('\n');
  };

  const sfxTracksRpp = buildFxTracks(sfxTrackItemsByName);
  const bgmTracksRpp = buildFxTracks(bgmTrackItemsByName);

  return `
<REAPER_PROJECT 0.1 "7.0/js-web-exporter" 1700000000
  SAMPLERATE ${sampleRate}
${dialogueTracksRpp}
${sfxTracksRpp}
${bgmTracksRpp}
>
  `.trim();
};

// --- Scene mapping helper ---

const buildLineIdToSceneName = (project: Project): Map<string, string> => {
  const sceneMarkers: TextMarker[] =
    (project.textMarkers || []).filter((m) => m.type === 'scene') || [];
  const lineLocation = new Map<string, { chapterIndex: number; lineIndex: number }>();

  project.chapters.forEach((ch, chIdx) => {
    ch.scriptLines.forEach((ln, lnIdx) => {
      lineLocation.set(ln.id, { chapterIndex: chIdx, lineIndex: lnIdx });
    });
  });

  const scenesByChapterIndex = new Map<number, { lineIndex: number; name: string }[]>();

  sceneMarkers.forEach((marker) => {
    if (!marker.name) return;
    const loc = lineLocation.get(marker.startLineId);
    if (!loc) return;
    const list = scenesByChapterIndex.get(loc.chapterIndex) || [];
    list.push({ lineIndex: loc.lineIndex, name: marker.name });
    scenesByChapterIndex.set(loc.chapterIndex, list);
  });

  const lineIdToSceneName = new Map<string, string>();

  project.chapters.forEach((ch, chIdx) => {
    const scenes = scenesByChapterIndex.get(chIdx);
    if (!scenes || scenes.length === 0) return;
    scenes.sort((a, b) => a.lineIndex - b.lineIndex);

    let currentSceneName: string | undefined = undefined;
    let scenePtr = 0;

    ch.scriptLines.forEach((line, lnIdx) => {
      while (scenePtr < scenes.length && scenes[scenePtr].lineIndex === lnIdx) {
        currentSceneName = scenes[scenePtr].name;
        scenePtr++;
      }
      if (currentSceneName) {
        lineIdToSceneName.set(line.id, currentSceneName);
      }
    });
  });

  return lineIdToSceneName;
};

// --- Main Export Function ---

export const exportPostProductionToReaper = async (
  project: Project,
  chaptersToExport: Chapter[],
  allCharacters: Character[],
  soundLibrary: SoundLibraryItem[],
  lufsSettings: PostProductionLufsSettings,
): Promise<void> => {
  const { silenceSettings: projectSilenceSettings } = project;
  const silenceSettings = projectSilenceSettings || defaultSilenceSettings;

  const audioContext = new AudioContext();
  const zip = new JSZip();

  try {
    // Step 1: Build dialogue timeline and single WAV
    const chapterNumberMap = new Map<string, number>();
    project.chapters.forEach((ch, idx) => chapterNumberMap.set(ch.id, idx + 1));

    const baseItemsPromises = chaptersToExport.flatMap((chapter) =>
      chapter.scriptLines.map(async (line, lineIndexInChapter) => {
        if (!line.audioBlobId) return null;
        const audioBlobRecord = await db.audioBlobs.get(line.audioBlobId);
        if (!audioBlobRecord) return null;

        const buffer = await audioContext.decodeAudioData(
          await audioBlobRecord.data.arrayBuffer(),
        );
        return {
          line,
          audioBlob: audioBlobRecord.data,
          duration: buffer.duration,
          audioBuffer: buffer,
          character: allCharacters.find((c) => c.id === line.characterId),
          chapterIndex: chapterNumberMap.get(chapter.id) || 0,
          lineIndexInChapter,
        } as Omit<
          TimelineItem,
          'mainTimelineStartTime' | 'sourceStartTime' | 'generatedItemName' | 'gainLinear'
        >;
      }),
    );

    const baseItemsUnsorted = (await Promise.all(baseItemsPromises)).filter(
      (item): item is NonNullable<typeof item> => item !== null,
    );

    if (baseItemsUnsorted.length === 0) {
      throw new Error('当前项目中没有可导出的对白音频。');
    }

    baseItemsUnsorted.sort((a, b) =>
      a.chapterIndex !== b.chapterIndex
        ? a.chapterIndex - b.chapterIndex
        : a.lineIndexInChapter - b.lineIndexInChapter,
    );

    let mainTimelineTime =
      silenceSettings.startPadding && silenceSettings.startPadding > 0
        ? silenceSettings.startPadding
        : 0;
    let sourceTimelineTime = 0;
    const finalTimelineItems: TimelineItem[] = [];

    for (const [index, item] of baseItemsUnsorted.entries()) {
      const chapterNumStr = item.chapterIndex.toString().padStart(3, '0');
      const characterName = sanitizeFilename(item.character?.name || '未知', 20);
      const lineNumStr = (index + 1).toString().padStart(4, '0');
      const abridgedText = sanitizeFilename(item.line.text || '', 30);
      const generatedItemName = `Ch${chapterNumStr}_${lineNumStr}_${characterName}_${abridgedText}`;

      finalTimelineItems.push({
        ...item,
        mainTimelineStartTime: mainTimelineTime,
        sourceStartTime: sourceTimelineTime,
        generatedItemName,
      });

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

    const totalSamples = finalTimelineItems.reduce(
      (sum, item) => sum + item.audioBuffer.length,
      0,
    );
    if (totalSamples === 0) {
      throw new Error('对白音频总长度为 0，无法导出。');
    }

    // 双声道导出
    const offlineCtx = new OfflineAudioContext(2, totalSamples, audioContext.sampleRate);
    finalTimelineItems.forEach((item) => {
      const source = offlineCtx.createBufferSource();
      source.buffer = item.audioBuffer;
      source.connect(offlineCtx.destination);
      source.start(item.sourceStartTime);
    });

    const singleConcatenatedBuffer = await offlineCtx.startRendering();
    const singleWavBlob = bufferToWav(singleConcatenatedBuffer);
    const singleAudioFilename = `${sanitizeFilename(project.name)}_Audio.wav`;
    zip.file(singleAudioFilename, singleWavBlob);

    // Optional LUFS normalization for voice (对白/旁白)
    if (lufsSettings.voice.enabled) {
      for (const item of finalTimelineItems) {
        const measuredLufs = estimateLufsFromAudioBuffer(item.audioBuffer);
        const gainDb = computeGainDbFromLufs(measuredLufs, lufsSettings.voice.target);
        const gainLinear = Math.pow(10, gainDb / 20);
        item.gainLinear = gainLinear;
      }
    }

    // Step 1b: Build scene mapping for dialogue
    const lineIdToSceneName = buildLineIdToSceneName(project);

    // Dialogue tracks grouped by final Reaper track name
    const dialogueTracksByName = new Map<string, TimelineItem[]>();
    const addDialogueItem = (trackName: string, item: TimelineItem) => {
      const existing = dialogueTracksByName.get(trackName);
      if (existing) {
        existing.push(item);
      } else {
        dialogueTracksByName.set(trackName, [item]);
      }
    };

    finalTimelineItems.forEach((item) => {
      const characterName = item.character?.name;
      const soundTypeRaw = item.line.soundType || '';
      const soundType = soundTypeRaw.trim();

      if (characterName === 'Narrator') {
        addDialogueItem('旁白 PB', item);
        return;
      }

      if (soundType) {
        const trackName = `对白 - ${soundType}`;
        addDialogueItem(trackName, item);
        return;
      }

      const sceneName = lineIdToSceneName.get(item.line.id) || '默认场景';
      const trackName = `对白 - ${sceneName}`;
      addDialogueItem(trackName, item);
    });

    const dialogueTrackItemsStrings: Record<string, string> = {};
    dialogueTracksByName.forEach((items, trackName) => {
      if (!items || items.length === 0) return;
      dialogueTrackItemsStrings[trackName] = generateDialogueRppTrackItems(
        items,
        singleAudioFilename,
      );
    });

    // Step 2: SFX and BGM Processing
    const sfxClipsByTrack = new Map<string, FxClip[]>();
    const bgmClipsByTrack = new Map<string, BgmClip[]>();
    const usedSoundFiles = new Map<number, { blob: Blob; path: string }>();

    const lineStartTimes = new Map<string, number>(
      finalTimelineItems.map((item) => [item.line.id, item.mainTimelineStartTime]),
    );
    const lineDurations = new Map<string, number>(
      finalTimelineItems.map((item) => [item.line.id, item.duration]),
    );

    const soundLibraryById = new Map<number, SoundLibraryItem>();
    for (const s of soundLibrary) {
      if (typeof s.id === 'number') {
        soundLibraryById.set(s.id, s);
      }
    }

    const soundLufsById = new Map<number, number>();

    const ensureWavForSound = async (
      sound: SoundLibraryItem,
    ): Promise<{ path: string; duration: number }> => {
      if (sound.id === undefined) {
        throw new Error('SoundLibraryItem 缺少 id，无法导出到 Reaper');
      }
      const existing = usedSoundFiles.get(sound.id);
      if (existing) {
        return { path: existing.path, duration: sound.duration };
      }

      const file = await sound.handle.getFile();
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await audioContext.decodeAudioData(arrayBuffer);
      const wavBlob = bufferToWav(decoded);

      if (lufsSettings.music.enabled || lufsSettings.ambience.enabled || lufsSettings.sfx.enabled) {
        try {
          const lufs = await ensureSoundLufsFromBuffer(sound.id, decoded);
          soundLufsById.set(sound.id, lufs);
        } catch (error) {
          console.error('Failed to analyze LUFS for sound during Reaper export:', error);
        }
      }

      const baseName = sanitizeFilename(sound.name).replace(/\.[^.]+$/, '');
      const wavName = `${baseName || 'sound'}_${sound.id}.wav`;

      usedSoundFiles.set(sound.id, { blob: wavBlob, path: wavName });
      return { path: wavName, duration: sound.duration || decoded.duration };
    };

    // 2a. 从钉住的 SFX 生成音效片段（[] 里的音效）
    for (const chapter of project.chapters) {
      for (const line of chapter.scriptLines) {
        const pins = line.pinnedSounds;
        if (!pins || pins.length === 0) continue;

        const lineStartTime = lineStartTimes.get(line.id);
        if (lineStartTime === undefined) continue;

        const lineDuration = lineDurations.get(line.id) || 0.0001;
        const text = line.text || '';
        const textLength = text.length || 1;

        for (const pin of pins) {
          if (pin.soundId === undefined || pin.soundId === null) continue;
          const sound = soundLibraryById.get(pin.soundId);
          if (!sound) continue;

          const isBgmKeyword = pin.keyword.startsWith('<') && pin.keyword.endsWith('>');
          // BGM 钉住只用来选音乐，不直接生成片段；这里只处理 SFX。
          if (isBgmKeyword) continue;

          const { path, duration } = await ensureWavForSound(sound);
          const timeOffset = (pin.index / textLength) * lineDuration;
          const startTime = lineStartTime + timeOffset;

          const labelName = `SFX: ${pin.keyword.replace(/^\[|\]$/g, '')}`;
          const trackName = getCategoryTrackName(sound.category);

          let gainLinear: number | undefined;
          if (sound.id !== undefined) {
            const measuredLufs = soundLufsById.get(sound.id);
            if (typeof measuredLufs === 'number') {
              const category = (sound.category || '').toLowerCase();
              const isAmbienceCategory = category.includes('ambience');
              if (!isAmbienceCategory && lufsSettings.sfx.enabled) {
                const gainDb = computeGainDbFromLufs(measuredLufs, lufsSettings.sfx.target);
                gainLinear = Math.pow(10, gainDb / 20);
              }
            }
          }

          const existing = sfxClipsByTrack.get(trackName) || [];
          existing.push({
            startTime,
            duration,
            name: labelName,
            filePath: path,
            gainLinear,
          });
          sfxClipsByTrack.set(trackName, existing);
        }
      }
    }

    // 2b. 从 BGM 文本范围 (<BGM> ... //) 生成 BGM 片段
    const lineById = new Map<string, ScriptLine>();
    for (const chapter of project.chapters) {
      for (const line of chapter.scriptLines) {
        lineById.set(line.id, line);
      }
    }

    const bgmMarkers = (project.textMarkers || []).filter(
      (m) => m.type === 'bgm' && m.startLineId && m.endLineId,
    );

    const findBgmSoundForMarker = (marker: TextMarker): SoundLibraryItem | undefined => {
      const name = (marker.name || '').trim();
      if (!name) return undefined;
      const expectedKeyword = `<${name}>`;

      // 1) 优先从钉住的 BGM 里找对应的声音
      for (const chapter of project.chapters) {
        for (const line of chapter.scriptLines) {
          const pins = line.pinnedSounds || [];
          const match = pins.find(
            (p) => p.keyword === expectedKeyword && p.soundId !== undefined && p.soundId !== null,
          );
          if (match && match.soundId !== undefined && match.soundId !== null) {
            const snd = soundLibraryById.get(match.soundId);
            if (snd) return snd;
          }
        }
      }

      // 2) 回退：按名称在音乐/环境库里模糊匹配
      const lowerName = name.toLowerCase();
      const musicCandidates = soundLibrary.filter((s) => {
        const cat = (s.category || '').toLowerCase();
        const isMusicLike = cat.includes('music') || cat.includes('ambience');
        return isMusicLike && s.name.toLowerCase().includes(lowerName);
      });
      if (musicCandidates.length > 0) {
        return musicCandidates[0];
      }

      return undefined;
    };

    for (const marker of bgmMarkers) {
      const startLine = lineById.get(marker.startLineId);
      const endLine = lineById.get(marker.endLineId);
      if (!startLine || !endLine) continue;

      const startLineTime = lineStartTimes.get(marker.startLineId);
      const endLineTime = lineStartTimes.get(marker.endLineId);
      const startLineDur = lineDurations.get(marker.startLineId) || 0;
      const endLineDur = lineDurations.get(marker.endLineId) || 0;

      if (startLineTime === undefined || endLineTime === undefined) continue;

      const startText = startLine.text || '';
      const endText = endLine.text || '';
      const startTextLen = startText.length || 1;
      const endTextLen = endText.length || 1;

      const startOffset = marker.startOffset ?? 0;
      const endOffset = marker.endOffset ?? 0;

      const startRel = Math.max(0, Math.min(1, startOffset / startTextLen));
      const endRel = Math.max(0, Math.min(1, endOffset / endTextLen));

      const startTime = startLineTime + startRel * startLineDur;
      const endTime = endLineTime + endRel * endLineDur;

      if (!isFinite(startTime) || !isFinite(endTime)) continue;
      const rangeDuration = endTime - startTime;
      if (rangeDuration <= 0.05) continue;

      const sound = findBgmSoundForMarker(marker);
      if (!sound) {
        // 没有绑定具体音乐，就跳过；将来如有需要，也可以插入占位 item
        continue;
      }

      const { path, duration: sourceDuration } = await ensureWavForSound(sound);

      let gainLinear: number | undefined;
      if (sound.id !== undefined) {
        const measuredLufs = soundLufsById.get(sound.id);
        if (typeof measuredLufs === 'number') {
          const category = (sound.category || '').toLowerCase();
          const isAmbienceCategory = category.includes('ambience');
          if (isAmbienceCategory && lufsSettings.ambience.enabled) {
            const gainDb = computeGainDbFromLufs(measuredLufs, lufsSettings.ambience.target);
            gainLinear = Math.pow(10, gainDb / 20);
          } else if (!isAmbienceCategory && lufsSettings.music.enabled) {
            const gainDb = computeGainDbFromLufs(measuredLufs, lufsSettings.music.target);
            gainLinear = Math.pow(10, gainDb / 20);
          }
        }
      }

      const trackName = getCategoryTrackName(sound.category);
      const existing = bgmClipsByTrack.get(trackName) || [];
      existing.push({
        startTime,
        duration: rangeDuration,
        name: `BGM: ${marker.name || sound.name}`,
        filePath: path,
        sourceDuration,
        gainLinear,
      });
      bgmClipsByTrack.set(trackName, existing);
    }

    // Step 3: Generate RPP content with all tracks
    const sfxTrackItemsByName: Record<string, string> = {};
    sfxClipsByTrack.forEach((clips, trackName) => {
      if (!clips || clips.length === 0) return;
      sfxTrackItemsByName[trackName] = generateSfxRppTrackItems(clips);
    });

    const bgmTrackItemsByName: Record<string, string> = {};
    bgmClipsByTrack.forEach((clips, trackName) => {
      if (!clips || clips.length === 0) return;
      bgmTrackItemsByName[trackName] = generateBgmRppTrackItems(clips);
    });

    // Add all converted SFX/BGM WAV files into the ZIP
    usedSoundFiles.forEach(({ blob, path }) => {
      zip.file(path, blob);
    });

    const rppContent = generateRppContent(
      project.name,
      audioContext.sampleRate,
      dialogueTrackItemsStrings,
      sfxTrackItemsByName,
      bgmTrackItemsByName,
    );

    // Step 4: Create ZIP
    const readme = `本 ZIP 由 AI 后期制作页面自动导出为 Reaper 工程。

包含内容:
- *.wav: 所有对白、环境音、音效、音乐素材
- *.rpp: Reaper 工程文件

使用建议:
1. 将整个 .zip 解压到一个独立文件夹
2. 使用 Reaper 打开 project.rpp
3. 如果素材路径发生变化，可在 Reaper 中批量重定位媒体文件`;

    zip.file('project.rpp', rppContent);
    zip.file('README.txt', readme);

    const blob = await zip.generateAsync({ type: 'blob' });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFilename(project.name)}_ReaperExport.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    audioContext.close().catch(() => {});
  }
};

