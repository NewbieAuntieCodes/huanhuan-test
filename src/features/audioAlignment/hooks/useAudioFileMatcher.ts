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
    const parts = nameWithoutExt.split('_');
    const chapterIdentifier = parts[0];

    const sourceAudioId = `${currentProject.id}_${file.name}`;

    try {
        // 1. Find target lines based on matchType
        const targetCharacterIds = new Set<string>();
        if (matchType === 'cv') {
            characters.filter(c => c.cvName === identifier && c.status !== 'merged').forEach(c => targetCharacterIds.add(c.id));
        } else if (matchType === 'character') {
            characters.filter(c => c.name === identifier && c.status !== 'merged').forEach(c => targetCharacterIds.add(c.id));
        }
        
        const chapterMatchers = parseChapterIdentifier(chapterIdentifier);
        const targetChapters = currentProject.chapters.filter((_, index) => chapterMatchers.includes(index + 1));
        
        const targetLines = targetChapters.flatMap(chapter => 
            chapter.scriptLines
                .filter(line => !nonAudioCharacterIds.includes(line.characterId || ''))
                .filter(line => matchType === 'chapter' || (line.characterId && targetCharacterIds.has(line.characterId)))
                .map(line => ({ line, chapterId: chapter.id }))
        );

        if (targetLines.length === 0) {
            console.warn(`No target lines found for ${matchType} '${identifier}' in chapters '${chapterIdentifier}'`);
            return { matched: 0, missed: 0 };
        }
        
        // 2. Parse markers from audio
        let metadata;
        try {
            metadata = await mm.parseBlob(file);
        } catch (e) {
            console.error(`Metadata parsing failed for ${file.name}:`, e);
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
                console.warn(`File ${file.name} has no chapter markers.`);
                return { matched: 0, missed: targetLines.length };
            }
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

    } catch (error) {
        console.error(`Error processing master audio file ${file.name}:`, error);
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
      } else if (parts.length === 2) {
          identifier = parts[1]; // cvName or characterName
      }
      
      if (!identifier) {
        console.warn(`Skipping file with incorrect format: ${file.name}`);
        continue;
      }

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