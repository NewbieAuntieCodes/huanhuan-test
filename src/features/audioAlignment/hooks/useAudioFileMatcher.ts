// FIX: Changed React import from a named import to a default import to correctly resolve the React namespace for types like React.ChangeEvent.
import React, { useState, useCallback, useMemo } from 'react';
import { Project, Character, Chapter, ScriptLine, MasterAudio } from '../../../types';
import * as mm from 'music-metadata-browser';
import { bufferToWav } from '../../../lib/wavEncoder';
import { db } from '../../../db';
// FIX: Import `Buffer` to resolve "Cannot find name 'Buffer'" error.
import { Buffer } from 'buffer';

interface UseAudioFileMatcherProps {
  currentProject: Project | undefined;
  characters: Character[];
  assignAudioToLine: (projectId: string, chapterId: string, lineId: string, audioBlob: Blob, sourceAudioId?: string, sourceAudioFilename?: string) => Promise<void>;
}

const parseChapterIdentifier = (identifier: string): number[] => {
    if (identifier.includes('-')) {
        const parts = identifier.split('-').map(p => parseInt(p, 10));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            const [start, end] = parts;
            const range = [];
            for (let i = start; i <= end; i++) {
                range.push(i);
            }
            return range;
        }
    }
    const num = parseInt(identifier, 10);
    if (!isNaN(num)) {
        return [num];
    }
    return [];
};

// 解析Adobe Audition XMP格式的CuePoint标记
const parseXmpCuePoints = (metadata: any, audioDuration: number): { startTime: number; endTime: number }[] | null => {
    try {
        // 从 native 标签中查找所有 PRIV 帧
        let privTags: any[] = [];

        // 检查所有可能的 ID3 版本
        const id3Versions = ['ID3v2.3', 'ID3v2.4', 'ID3v2.2', 'ID3v2'];

        for (const version of id3Versions) {
            const nativeTags = metadata.native?.[version];
            if (Array.isArray(nativeTags)) {
                // 如果是数组，查找 id === 'PRIV' 的元素
                const privFrames = nativeTags.filter((tag: any) => tag?.id === 'PRIV');
                privTags.push(...privFrames);
            } else if (nativeTags?.PRIV) {
                // 如果是对象，直接获取 PRIV
                const privData = Array.isArray(nativeTags.PRIV) ? nativeTags.PRIV : [nativeTags.PRIV];
                privTags.push(...privData);
            }
        }

        if (privTags.length === 0) {
            console.log('未找到PRIV标签');
            return null;
        }

        console.log(`找到 ${privTags.length} 个PRIV标签`);

        // 查找XMP私有标签
        const xmpTag = privTags.find((tag: any) => {
            // 检查多种可能的XMP标识
            if (tag?.value?.owner_identifier === 'XMP') return true;
            if (tag?.owner_identifier === 'XMP') return true;
            if (typeof tag === 'string' && tag.includes('xmpmeta')) return true;
            if (tag?.description && tag.description.includes('xmpmeta')) return true;
            // 检查tag.value是否为字符串且包含XMP
            if (typeof tag?.value === 'string' && tag.value.includes('xmpmeta')) return true;
            // 检查data字段
            if (tag?.value?.data && typeof tag.value.data === 'string' && tag.value.data.includes('xmpmeta')) return true;
            return false;
        });

        if (!xmpTag) {
            console.log('未找到XMP标签');
            return null;
        }

        console.log('找到XMP标签:', xmpTag);

        // 获取XMP字符串 - 尝试多种可能的数据位置
        let xmpString = '';
        if (typeof xmpTag === 'string') {
            xmpString = xmpTag;
        } else if (typeof xmpTag.value === 'string') {
            xmpString = xmpTag.value;
        } else if (xmpTag.value?.data) {
            if (typeof xmpTag.value.data === 'string') {
                xmpString = xmpTag.value.data;
            } else if (xmpTag.value.data instanceof Uint8Array || xmpTag.value.data instanceof Buffer) {
                // 将字节数组转换为字符串
                xmpString = new TextDecoder('utf-8').decode(xmpTag.value.data);
            }
        } else if (xmpTag.description) {
            xmpString = xmpTag.description;
        }

        if (!xmpString) {
            console.log('XMP标签中没有数据');
            return null;
        }

        console.log(`XMP字符串长度: ${xmpString.length}`);
        console.log('XMP字符串片段:', xmpString.substring(0, 200));

        // 简单的正则表达式解析XMP中的CuePoint标记
        // 匹配 xmpDM:startTime="数字"
        const startTimeRegex = /xmpDM:startTime="(\d+)"/g;
        const frameRateRegex = /xmpDM:frameRate="f(\d+)"/;

        // 提取采样率
        const frameRateMatch = xmpString.match(frameRateRegex);
        const sampleRate = frameRateMatch ? parseInt(frameRateMatch[1], 10) : 48000; // 默认48kHz

        // 提取所有startTime
        const startTimes: number[] = [];
        let match;
        while ((match = startTimeRegex.exec(xmpString)) !== null) {
            startTimes.push(parseInt(match[1], 10));
        }

        if (startTimes.length === 0) {
            return null;
        }

        // 排序
        startTimes.sort((a, b) => a - b);

        // 如果第一个标记不是从 0 开始，添加一个起始标记
        if (startTimes.length > 0 && startTimes[0] > 0) {
            startTimes.unshift(0);
            console.log('添加起始标记（时间 0）');
        }

        // 创建时间段：从每个marker到下一个marker（或音频结束）
        const segments: { startTime: number; endTime: number }[] = [];
        for (let i = 0; i < startTimes.length; i++) {
            const startTime = startTimes[i] / sampleRate;
            const endTime = i < startTimes.length - 1
                ? startTimes[i + 1] / sampleRate
                : audioDuration;

            segments.push({ startTime, endTime });
        }

        console.log(`从XMP中解析到 ${segments.length} 个音频段落（包含起始段）`);
        return segments;

    } catch (error) {
        console.error('解析XMP CuePoint标记失败:', error);
        return null;
    }
};

export const useAudioFileMatcher = ({
  currentProject,
  characters,
  assignAudioToLine,
}: UseAudioFileMatcherProps) => {
  const [isCvMatchLoading, setIsCvMatchLoading] = useState(false);
  const [isCharacterMatchLoading, setIsCharacterMatchLoading] = useState(false);
  const [isChapterMatchLoading, setIsChapterMatchLoading] = useState(false);

  const nonAudioCharacterIds = useMemo(() => {
    return characters
      .filter(c => c.name === '[静音]' || c.name === '音效')
      .map(c => c.id);
  }, [characters]);

  const processMasterAudioFile = useCallback(async (
    file: File, 
    identifier: string,
    matchType: 'cv' | 'character' | 'chapter',
    setIsLoading: (loading: boolean) => void
  ) => {
    if (!currentProject) return { matched: 0, missed: 0 };
    
    const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.'));
    
    // More flexible chapter identifier extraction.
    // It will find the first sequence of digits in the filename.
    const chapterMatch = nameWithoutExt.match(/\d+/);
    const chapterIdentifier = chapterMatch ? chapterMatch[0] : null;

    if (!chapterIdentifier) {
        console.warn(`跳过格式不正确的文件: ${file.name}。无法从中提取章节编号。`);
        return { matched: 0, missed: 0 };
    }

    const sourceAudioId = `${currentProject.id}_${file.name}`;

    try {
        // 1. Find target lines based on matchType
        const targetCharacterIds = new Set<string>();
        if (matchType === 'cv') {
            const matchedChars = characters.filter(c => c.cvName === identifier && c.status !== 'merged');
            matchedChars.forEach(c => targetCharacterIds.add(c.id));
            console.log(`CV匹配 "${identifier}": 找到 ${matchedChars.length} 个角色`, matchedChars.map(c => c.name));
            if (matchedChars.length === 0) {
                const allCvs = [...new Set(characters.filter(c => c.cvName).map(c => c.cvName))];
                console.warn(`未找到CV名称为 "${identifier}" 的角色。可用的CV名称:`, allCvs);
            }
        } else if (matchType === 'character') {
            const matchedChars = characters.filter(c => c.name === identifier && c.status !== 'merged');
            matchedChars.forEach(c => targetCharacterIds.add(c.id));
            console.log(`角色匹配 "${identifier}": 找到 ${matchedChars.length} 个角色`);
            if (matchedChars.length === 0) {
                const allCharNames = characters.filter(c => c.status !== 'merged').map(c => c.name);
                console.warn(`未找到名为 "${identifier}" 的角色。可用的角色名称:`, allCharNames);
            }
        }

        const chapterMatchers = parseChapterIdentifier(chapterIdentifier);
        const targetChapters = currentProject.chapters.filter((_, index) => chapterMatchers.includes(index + 1));
        console.log(`章节匹配 "${chapterIdentifier}": 找到 ${targetChapters.length} 个章节`, chapterMatchers);

        const targetLines = targetChapters.flatMap(chapter =>
            chapter.scriptLines
                .filter(line => !nonAudioCharacterIds.includes(line.characterId || ''))
                .filter(line => matchType === 'chapter' || (line.characterId && targetCharacterIds.has(line.characterId)))
                .map(line => ({ line, chapterId: chapter.id }))
        );

        if (targetLines.length === 0) {
            console.warn(`文件 ${file.name}: 未找到目标行。匹配类型=${matchType}, 标识符="${identifier}", 章节="${chapterIdentifier}"`);
            return { matched: 0, missed: 0 };
        }

        console.log(`找到 ${targetLines.length} 行待匹配`);
        
        // 2. Parse markers from audio
        let metadata;
        try {
            metadata = await mm.parseBlob(file);
        // FIX: The 'e' object in a catch block is of type 'unknown'. Added a type guard to safely access its properties before attempting to read a message from it.
        } catch (e) {
            // FIX: Safely access error message. Do not access 'e.name' directly on an 'unknown' type.
            const message = e instanceof Error ? e.message : String(e);
            console.error(`Metadata parsing failed for ${file.name}:`, message);
            return { matched: 0, missed: targetLines.length };
        }

        let audioSegments: { startTime: number; endTime: number }[] = [];
        const chapters = metadata.common.chapters || [];
        if (chapters.length > 0) {
            audioSegments = chapters.map(ch => ({ startTime: ch.startTime / 1000, endTime: ch.endTime / 1000 }));
        } else {
            const duration = metadata.format.duration || 0;
            const xmpSegments = parseXmpCuePoints(metadata, duration);
            if (xmpSegments) {
                audioSegments = xmpSegments;
            } else {
                console.error(`❌ 文件 ${file.name} 没有找到音频标记`);
                console.log(`📝 该文件需要 ${targetLines.length} 个标记来匹配对应的文本行`);
                console.log(`💡 解决方法：在Adobe Audition中打开音频文件，添加CuePoint标记后重新导出`);
                alert(`❌ 文件 ${file.name} 缺少音频标记\n\n需要标记数量: ${targetLines.length}\n找到标记数量: 0\n\n请在Adobe Audition等软件中为音频添加标记点（CuePoint），然后重新尝试。`);
                return { matched: 0, missed: targetLines.length };
            }
        }

        // 检查标记数量是否匹配
        console.log(`📊 标记数量: ${audioSegments.length}, 目标行数: ${targetLines.length}`);
        if (audioSegments.length < targetLines.length) {
            console.warn(`⚠️ 警告：音频标记数量 (${audioSegments.length}) 少于目标行数 (${targetLines.length})`);
            console.warn(`⚠️ 部分文本行将无法匹配音频`);
        } else if (audioSegments.length > targetLines.length) {
            console.warn(`⚠️ 警告：音频标记数量 (${audioSegments.length}) 多于目标行数 (${targetLines.length})`);
            console.warn(`⚠️ 部分音频段落将被忽略`);
        }

        // 3. Store master audio
        const masterAudioEntry: MasterAudio = { id: sourceAudioId, projectId: currentProject.id, data: file };
        await db.masterAudios.put(masterAudioEntry);

        // 4. Decode, split, and assign
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const mainAudioBuffer = await audioContext.decodeAudioData(await file.arrayBuffer());

        let matchedCount = 0;
        const limit = Math.min(targetLines.length, audioSegments.length);

        for (let i = 0; i < limit; i++) {
            const segment = audioSegments[i];
            const lineInfo = targetLines[i];
            
            const duration = segment.endTime - segment.startTime;
            if (duration <= 0) continue;

            const startSample = Math.floor(segment.startTime * mainAudioBuffer.sampleRate);
            const endSample = Math.floor(segment.endTime * mainAudioBuffer.sampleRate);
            
            const segmentBuffer = audioContext.createBuffer(mainAudioBuffer.numberOfChannels, endSample - startSample, mainAudioBuffer.sampleRate);
            for (let ch = 0; ch < mainAudioBuffer.numberOfChannels; ch++) {
                segmentBuffer.copyToChannel(mainAudioBuffer.getChannelData(ch).subarray(startSample, endSample), ch);
            }

            const segmentBlob = bufferToWav(segmentBuffer);
            await assignAudioToLine(currentProject.id, lineInfo.chapterId, lineInfo.line.id, segmentBlob, sourceAudioId, file.name);
            matchedCount++;
        }
        
        audioContext.close();
        return { matched: matchedCount, missed: targetLines.length - matchedCount };

    // FIX: The 'error' object in a catch block is of type 'unknown'. Added a type guard to safely access its properties before attempting to read a message from it.
    } catch (error) {
        // FIX: Safely access error message. Do not access 'error.name' directly on an 'unknown' type.
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error processing master audio file ${file.name}:`, message);
        return { matched: 0, missed: 0 };
    }
  }, [currentProject, characters, nonAudioCharacterIds, assignAudioToLine]);


  const handleFileSelection = useCallback(async (
    event: React.ChangeEvent<HTMLInputElement>,
    matchType: 'cv' | 'character' | 'chapter',
    setIsLoading: (loading: boolean) => void
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !currentProject) return;

    setIsLoading(true);
    let totalMatched = 0, totalMissed = 0;

    for (const file of Array.from(files)) {
      const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.'));
      const parts = nameWithoutExt.split('_');

      let identifier: string | null = null;
      if (matchType === 'chapter') {
          identifier = parts[0];
      } else if (parts.length >= 2) {
          // FIX: Changed from 'parts.length === 2' to 'parts.length >= 2' to support filenames with more than 2 parts
          // This allows files like "405-434_凌玄逆_v2.mp3" to work correctly
          identifier = parts[1]; // cvName or characterName
      }

      if (!identifier) {
        console.warn(`跳过格式不正确的文件: ${file.name}。期望格式: "章节编号_${matchType === 'cv' ? 'CV名称' : '角色名称'}.mp3"`);
        continue;
      }

      console.log(`处理文件: ${file.name}, 匹配类型: ${matchType}, 识别符: ${identifier}`);
      const result = await processMasterAudioFile(file, identifier, matchType, setIsLoading);
      totalMatched += result.matched;
      totalMissed += result.missed;
    }

    setIsLoading(false);
    alert(`匹配完成。\n成功匹配: ${totalMatched} 条音轨\n未匹配/失败: ${totalMissed}`);
    if (event.target) event.target.value = '';
  }, [currentProject, processMasterAudioFile]);

  const handleFileSelectionForCvMatch = (e: React.ChangeEvent<HTMLInputElement>) => handleFileSelection(e, 'cv', setIsCvMatchLoading);
  const handleFileSelectionForCharacterMatch = (e: React.ChangeEvent<HTMLInputElement>) => handleFileSelection(e, 'character', setIsCharacterMatchLoading);
  const handleFileSelectionForChapterMatch = (e: React.ChangeEvent<HTMLInputElement>) => handleFileSelection(e, 'chapter', setIsChapterMatchLoading);

  return {
    isCvMatchLoading,
    handleFileSelectionForCvMatch,
    isCharacterMatchLoading,
    handleFileSelectionForCharacterMatch,
    isChapterMatchLoading,
    handleFileSelectionForChapterMatch,
  };
};