// FIX: Changed React import from a named import to a default import to correctly resolve the React namespace for types like React.ChangeEvent.
import React, { useState, useCallback, useMemo } from 'react';
import { Project, Character, Chapter, ScriptLine } from '../../../types';
import * as mm from 'music-metadata-browser';
import { bufferToWav } from '../../../lib/wavEncoder';

interface UseAudioFileMatcherProps {
  currentProject: Project | undefined;
  characters: Character[];
  assignAudioToLine: (projectId: string, chapterId: string, lineId: string, audioBlob: Blob) => Promise<void>;
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

  const handleFileSelectionForCvMatch = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
      console.log('🔵 handleFileSelectionForCvMatch 被调用');
      const files = event.target.files;
      console.log('📁 选择的文件数量:', files?.length);

      if (!files || files.length === 0 || !currentProject) {
          console.log('⚠️ 没有文件或没有项目');
          return;
      }

      console.log('🚀 开始处理文件...');

      // 检查 Buffer 是否可用
      if (typeof window.Buffer === 'undefined') {
          console.error('❌ Buffer 未定义！这可能导致 music-metadata-browser 无法工作');
          alert('错误：Buffer 未加载。请刷新页面重试。');
          return;
      } else {
          console.log('✅ Buffer 已加载');
      }

      setIsCvMatchLoading(true);

      let totalMatchedCount = 0;
      let totalMissedCount = 0;
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      console.log('🎵 AudioContext 创建成功');

      for (const file of Array.from(files)) {
          console.log('📄 处理文件:', file.name, '大小:', file.size, 'bytes');
          const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.'));
          const parts = nameWithoutExt.split('_');
          console.log('📝 文件名部分:', parts);

          if (parts.length !== 2) { // Expecting chapter_cv
              console.warn(`⚠️ 跳过：文件名格式不正确: ${file.name} (期望格式: 章节_CV名.mp3)`);
              continue;
          }

          const chapterIdentifier = parts[0];
          const cvName = parts[1];
          
          try {
              // 1. Find target script lines for this CV and chapter range
              const targetCharacterIds = new Set(
                  characters.filter(c => c.cvName === cvName && c.status !== 'merged').map(c => c.id)
              );

              if (targetCharacterIds.size === 0) {
                  console.warn(`No characters found for CV: ${cvName}`);
                  continue;
              }

              const chapterMatchers = parseChapterIdentifier(chapterIdentifier);
              const targetChapters = currentProject.chapters.filter((chapter, index) => {
                  const chapterNumber = index + 1;
                  return chapterMatchers.includes(chapterNumber);
              });

              if (targetChapters.length === 0) {
                  console.warn(`No chapters found for identifier: ${chapterIdentifier}`);
                  continue;
              }

              const targetLines: { line: ScriptLine; chapterId: string }[] = [];
              for (const chapter of targetChapters) {
                  for (const line of chapter.scriptLines) {
                      if (line.characterId && targetCharacterIds.has(line.characterId) && !nonAudioCharacterIds.includes(line.characterId)) {
                          targetLines.push({ line, chapterId: chapter.id });
                      }
                  }
              }
              
              if (targetLines.length === 0) {
                  console.warn(`No lines found for CV ${cvName} in chapters ${chapterIdentifier}`);
                  continue;
              }

              // 2. Parse MP3 markers - 支持ID3v2 CHAP和Adobe XMP CuePoint
              console.log('🔍 开始解析 MP3 元数据...');
              let metadata;
              try {
                  metadata = await mm.parseBlob(file);
                  console.log('✅ 元数据解析成功');
              } catch (parseError) {
                  console.error('❌ 解析元数据失败:', parseError);
                  console.error('这可能是由于浏览器环境的兼容性问题');
                  console.error('建议：1) 使用其他浏览器  2) 使用按角色匹配上传已分段的音频文件');

                  // 显示友好的错误提示
                  alert(`无法解析 MP3 文件 "${file.name}" 的元数据。\n\n可能的原因：\n- 当前环境不支持此功能\n- MP3 文件格式问题\n\n建议：\n- 使用"按角色匹配"功能上传已分段的音频文件\n- 或在本地环境运行`);

                  totalMissedCount += targetLines.length;
                  continue;
              }

              // 调试：打印完整的 metadata 结构
              console.log('完整元数据:', metadata);
              console.log('metadata.common:', metadata.common);
              console.log('metadata.native:', metadata.native);
              console.log('metadata.common.chapters:', metadata.common.chapters);

              // 详细查看 native 标签
              if (metadata.native) {
                  Object.keys(metadata.native).forEach(key => {
                      console.log(`metadata.native['${key}']:`, metadata.native[key]);
                  });
              }

              let audioSegments: { startTime: number; endTime: number }[] = [];

              // 首先尝试从 metadata.common.chapters 读取（music-metadata-browser 会自动解析 CHAP/CTOC）
              const chapters = metadata.common.chapters || [];

              if (chapters.length > 0) {
                  // 使用解析好的章节信息
                  audioSegments = chapters.map(chapter => ({
                      startTime: chapter.startTime / 1000,  // 已经是毫秒，转换为秒
                      endTime: chapter.endTime / 1000,
                  }));
                  console.log(`从章节信息中解析到 ${audioSegments.length} 个章节标记`);
              } else {
                  // 尝试解析Adobe Audition XMP CuePoint标记
                  const audioDuration = metadata.format.duration || 0;
                  const xmpSegments = parseXmpCuePoints(metadata, audioDuration);

                  if (xmpSegments && xmpSegments.length > 0) {
                      audioSegments = xmpSegments;
                  } else {
                      totalMissedCount += targetLines.length;
                      console.warn(`File ${file.name} has no chapter markers (neither CHAP nor XMP CuePoint).`);
                      continue;
                  }
              }

              // 3. Decode audio and split into blobs
              const mainAudioBuffer = await audioContext.decodeAudioData(await file.arrayBuffer());

              const limit = Math.min(targetLines.length, audioSegments.length);
              
              for (let i = 0; i < limit; i++) {
                  const segment = audioSegments[i];
                  const lineInfo = targetLines[i];
                  
                  const { startTime, endTime } = segment;
                  const duration = endTime - startTime;
                  if (duration <= 0) continue;

                  const startSample = Math.floor(startTime * mainAudioBuffer.sampleRate);
                  const endSample = Math.floor(endTime * mainAudioBuffer.sampleRate);
                  const numSamples = endSample - startSample;
                  
                  const segmentBuffer = audioContext.createBuffer(
                      mainAudioBuffer.numberOfChannels,
                      numSamples,
                      mainAudioBuffer.sampleRate
                  );

                  for (let channel = 0; channel < mainAudioBuffer.numberOfChannels; channel++) {
                      const channelData = mainAudioBuffer.getChannelData(channel);
                      const segmentData = channelData.subarray(startSample, endSample);
                      segmentBuffer.copyToChannel(segmentData, channel);
                  }

                  const segmentBlob = bufferToWav(segmentBuffer);

                  // 4. Assign split blob to line
                  await assignAudioToLine(currentProject.id, lineInfo.chapterId, lineInfo.line.id, segmentBlob);
                  totalMatchedCount++;
              }
              totalMissedCount += Math.abs(targetLines.length - audioSegments.length);

          } catch (error) {
              console.error(`Error processing file ${file.name}:`, error);
          }
      }

      await audioContext.close();
      setIsCvMatchLoading(false);
      alert(`按CV匹配完成。\n成功匹配: ${totalMatchedCount} 条音轨\n未匹配/失败: ${totalMissedCount}`);
  
      if (event.target) {
          event.target.value = '';
      }
  }, [currentProject, characters, assignAudioToLine, nonAudioCharacterIds]);
  
  const handleFileSelectionForCharacterMatch = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
      console.log('🔵 handleFileSelectionForCharacterMatch 被调用');
      const files = event.target.files;
      console.log('📁 选择的文件数量:', files?.length);

      if (!files || files.length === 0 || !currentProject) {
          console.log('⚠️ 没有文件或没有项目');
          return;
      }

      console.log('🚀 开始处理文件...');
      if (typeof window.Buffer === 'undefined') {
          console.error('❌ Buffer 未定义！');
          alert('错误：Buffer 未加载。请刷新页面重试。');
          return;
      }

      setIsCharacterMatchLoading(true);

      let totalMatchedCount = 0;
      let totalMissedCount = 0;
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      console.log('🎵 AudioContext 创建成功');

      for (const file of Array.from(files)) {
          console.log('📄 处理文件:', file.name, '大小:', file.size, 'bytes');
          const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.'));
          const parts = nameWithoutExt.split('_');
          console.log('📝 文件名部分:', parts);

          if (parts.length !== 2) { // Expecting chapter_characterName
              console.warn(`⚠️ 跳过：文件名格式不正确: ${file.name} (期望格式: 章节_角色名.mp3)`);
              continue;
          }

          const chapterIdentifier = parts[0];
          const characterName = parts[1];
          
          try {
              // 1. Find target script lines for this character and chapter range
              const targetCharacterIds = new Set(
                  characters.filter(c => c.name === characterName && c.status !== 'merged').map(c => c.id)
              );

              if (targetCharacterIds.size === 0) {
                  console.warn(`No characters found for name: ${characterName}`);
                  continue;
              }

              const chapterMatchers = parseChapterIdentifier(chapterIdentifier);
              const targetChapters = currentProject.chapters.filter((chapter, index) => {
                  const chapterNumber = index + 1;
                  return chapterMatchers.includes(chapterNumber);
              });

              if (targetChapters.length === 0) {
                  console.warn(`No chapters found for identifier: ${chapterIdentifier}`);
                  continue;
              }

              const targetLines: { line: ScriptLine; chapterId: string }[] = [];
              for (const chapter of targetChapters) {
                  for (const line of chapter.scriptLines) {
                      if (line.characterId && targetCharacterIds.has(line.characterId) && !nonAudioCharacterIds.includes(line.characterId)) {
                          targetLines.push({ line, chapterId: chapter.id });
                      }
                  }
              }
              
              if (targetLines.length === 0) {
                  console.warn(`No lines found for character ${characterName} in chapters ${chapterIdentifier}`);
                  continue;
              }

              // 2. Parse audio markers
              console.log('🔍 开始解析音频元数据...');
              let metadata;
              try {
                  metadata = await mm.parseBlob(file);
                  console.log('✅ 元数据解析成功');
              } catch (parseError) {
                  console.error('❌ 解析元数据失败:', parseError);
                  alert(`无法解析音频文件 "${file.name}" 的元数据。`);
                  totalMissedCount += targetLines.length;
                  continue;
              }

              let audioSegments: { startTime: number; endTime: number }[] = [];
              const chapters = metadata.common.chapters || [];

              if (chapters.length > 0) {
                  audioSegments = chapters.map(chapter => ({
                      startTime: chapter.startTime / 1000,
                      endTime: chapter.endTime / 1000,
                  }));
                  console.log(`从章节信息中解析到 ${audioSegments.length} 个章节标记`);
              } else {
                  const audioDuration = metadata.format.duration || 0;
                  const xmpSegments = parseXmpCuePoints(metadata, audioDuration);
                  if (xmpSegments && xmpSegments.length > 0) {
                      audioSegments = xmpSegments;
                  } else {
                      totalMissedCount += targetLines.length;
                      console.warn(`File ${file.name} has no chapter markers (neither CHAP nor XMP CuePoint).`);
                      continue;
                  }
              }

              // 3. Decode audio and split into blobs
              const mainAudioBuffer = await audioContext.decodeAudioData(await file.arrayBuffer());
              const limit = Math.min(targetLines.length, audioSegments.length);
              
              for (let i = 0; i < limit; i++) {
                  const segment = audioSegments[i];
                  const lineInfo = targetLines[i];
                  
                  const { startTime, endTime } = segment;
                  const duration = endTime - startTime;
                  if (duration <= 0) continue;

                  const startSample = Math.floor(startTime * mainAudioBuffer.sampleRate);
                  const endSample = Math.floor(endTime * mainAudioBuffer.sampleRate);
                  const numSamples = endSample - startSample;
                  
                  const segmentBuffer = audioContext.createBuffer(
                      mainAudioBuffer.numberOfChannels,
                      numSamples,
                      mainAudioBuffer.sampleRate
                  );

                  for (let channel = 0; channel < mainAudioBuffer.numberOfChannels; channel++) {
                      const channelData = mainAudioBuffer.getChannelData(channel);
                      const segmentData = channelData.subarray(startSample, endSample);
                      segmentBuffer.copyToChannel(segmentData, channel);
                  }

                  const segmentBlob = bufferToWav(segmentBuffer);

                  // 4. Assign split blob to line
                  await assignAudioToLine(currentProject.id, lineInfo.chapterId, lineInfo.line.id, segmentBlob);
                  totalMatchedCount++;
              }
              totalMissedCount += Math.abs(targetLines.length - audioSegments.length);

          } catch (error) {
              console.error(`Error processing file ${file.name}:`, error);
          }
      }

      await audioContext.close();
      setIsCharacterMatchLoading(false);
      alert(`按角色匹配完成。\n成功匹配: ${totalMatchedCount} 条音轨\n未匹配/失败: ${totalMissedCount}`);
  
      if (event.target) {
          event.target.value = '';
      }
  }, [currentProject, characters, assignAudioToLine, nonAudioCharacterIds]);

  const handleFileSelectionForChapterMatch = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !currentProject) return;

    setIsChapterMatchLoading(true);

    let totalMatchedCount = 0;
    let totalMissedCount = 0;
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    for (const file of Array.from(files)) {
        const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.'));
        const chapterIdentifier = nameWithoutExt;

        try {
            // 1. Find target script lines for this chapter range
            const chapterMatchers = parseChapterIdentifier(chapterIdentifier);
            const targetChapters = currentProject.chapters.filter((chapter, index) => {
                const chapterNumber = index + 1;
                return chapterMatchers.includes(chapterNumber);
            });

            if (targetChapters.length === 0) {
                console.warn(`No chapters found for identifier: ${chapterIdentifier}`);
                continue;
            }

            const targetLines: { line: ScriptLine; chapterId: string }[] = [];
            for (const chapter of targetChapters) {
                for (const line of chapter.scriptLines) {
                    if (!nonAudioCharacterIds.includes(line.characterId || '')) {
                        targetLines.push({ line, chapterId: chapter.id });
                    }
                }
            }
            
            if (targetLines.length === 0) {
                console.warn(`No lines found in chapters ${chapterIdentifier}`);
                continue;
            }

            // 2. Parse audio markers
            let metadata;
            try {
                metadata = await mm.parseBlob(file);
            } catch (parseError) {
                console.error(`Failed to parse metadata for ${file.name}:`, parseError);
                totalMissedCount += targetLines.length;
                continue;
            }

            let audioSegments: { startTime: number; endTime: number }[] = [];
            const chapters = metadata.common.chapters || [];

            if (chapters.length > 0) {
                audioSegments = chapters.map(chapter => ({
                    startTime: chapter.startTime / 1000,
                    endTime: chapter.endTime / 1000,
                }));
            } else {
                const audioDuration = metadata.format.duration || 0;
                const xmpSegments = parseXmpCuePoints(metadata, audioDuration);
                if (xmpSegments && xmpSegments.length > 0) {
                    audioSegments = xmpSegments;
                } else {
                    totalMissedCount += targetLines.length;
                    console.warn(`File ${file.name} has no chapter markers.`);
                    continue;
                }
            }

            // 3. Decode audio and split into blobs
            const mainAudioBuffer = await audioContext.decodeAudioData(await file.arrayBuffer());
            const limit = Math.min(targetLines.length, audioSegments.length);
            
            for (let i = 0; i < limit; i++) {
                const segment = audioSegments[i];
                const lineInfo = targetLines[i];
                
                const { startTime, endTime } = segment;
                const duration = endTime - startTime;
                if (duration <= 0) continue;

                const startSample = Math.floor(startTime * mainAudioBuffer.sampleRate);
                const endSample = Math.floor(endTime * mainAudioBuffer.sampleRate);
                const numSamples = endSample - startSample;
                
                const segmentBuffer = audioContext.createBuffer(
                    mainAudioBuffer.numberOfChannels,
                    numSamples,
                    mainAudioBuffer.sampleRate
                );

                for (let channel = 0; channel < mainAudioBuffer.numberOfChannels; channel++) {
                    const channelData = mainAudioBuffer.getChannelData(channel);
                    const segmentData = channelData.subarray(startSample, endSample);
                    segmentBuffer.copyToChannel(segmentData, channel);
                }

                const segmentBlob = bufferToWav(segmentBuffer);

                // 4. Assign split blob to line
                await assignAudioToLine(currentProject.id, lineInfo.chapterId, lineInfo.line.id, segmentBlob);
                totalMatchedCount++;
            }
            totalMissedCount += Math.abs(targetLines.length - audioSegments.length);

        } catch (error) {
            console.error(`Error processing file ${file.name}:`, error);
        }
    }

    await audioContext.close();
    setIsChapterMatchLoading(false);
    alert(`按章节匹配完成。\n成功匹配: ${totalMatchedCount} 条音轨\n未匹配/失败: ${totalMissedCount}`);

    if (event.target) {
        event.target.value = '';
    }
  }, [currentProject, assignAudioToLine, nonAudioCharacterIds]);

  return {
    isCvMatchLoading,
    handleFileSelectionForCvMatch,
    isCharacterMatchLoading,
    handleFileSelectionForCharacterMatch,
    isChapterMatchLoading,
    handleFileSelectionForChapterMatch,
  };
};
