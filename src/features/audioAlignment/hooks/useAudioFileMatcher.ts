// FIX: Changed React import from a named import to a default import to correctly resolve the React namespace for types like React.ChangeEvent.
import React, { useState, useCallback, useMemo } from 'react';
import { Project, Character, Chapter, ScriptLine } from '../../../types';
import mm from 'music-metadata-browser';
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
      const files = event.target.files;
      if (!files || files.length === 0 || !currentProject) return;
  
      setIsCvMatchLoading(true);
      
      let totalMatchedCount = 0;
      let totalMissedCount = 0;
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      for (const file of Array.from(files)) {
          const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.'));
          const parts = nameWithoutExt.split('_');
  
          if (parts.length !== 2) { // Expecting chapter_cv
              console.warn(`Skipping file with invalid name format: ${file.name}`);
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

              // 2. Parse MP3 markers
              const metadata = await mm.parseBlob(file);
              const markers = metadata.native?.['ID3v2.3']?.CHAP ?? metadata.native?.['ID3v2.4']?.CHAP ?? metadata.native?.ID3v2?.CHAP;

              if (!markers || markers.length === 0) {
                  totalMissedCount += targetLines.length;
                  console.warn(`File ${file.name} has no chapter markers.`);
                  continue;
              }
              
              const audioSegments = markers.map(m => ({
                  startTime: m.value.startTime / 1000,
                  endTime: m.value.endTime / 1000,
              }));

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
      const files = event.target.files;
      if (!files || files.length === 0 || !currentProject) return;

      setIsCharacterMatchLoading(true);
      
      const fileGroups = new Map<string, { file: File; sequence: number }[]>();

      for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.'));
          const parts = nameWithoutExt.split('_');

          if (parts.length === 4) { // Expecting chapter_cv_char_seq
              const sequence = parseInt(parts[3], 10);
              if (!isNaN(sequence)) {
                  const baseName = `${parts[0]}_${parts[1]}_${parts[2]}`; // chapter_cv_char
                  if (!fileGroups.has(baseName)) {
                      fileGroups.set(baseName, []);
                  }
                  fileGroups.get(baseName)!.push({ file: file, sequence });
              }
          } else if (parts.length === 3) { // Expecting chapter_char_seq
              const sequence = parseInt(parts[2], 10);
              if (!isNaN(sequence)) {
                  const baseName = `${parts[0]}_${parts[1]}`; // chapter_char
                  const key = `NO_CV::${baseName}`; // Marker for no CV in filename
                  if (!fileGroups.has(key)) {
                      fileGroups.set(key, []);
                  }
                  fileGroups.get(key)!.push({ file: file, sequence });
              }
          }
      }

      let matchedCount = 0;
      let missedCount = 0;
      
      for (const [groupKey, filesForGroup] of fileGroups.entries()) {
          let chapterIdentifier: string;
          let characterName: string;
          let cvName: string | undefined;

          if (groupKey.startsWith('NO_CV::')) {
              const baseName = groupKey.replace('NO_CV::', '');
              const parts = baseName.split('_');
              chapterIdentifier = parts[0];
              characterName = parts[1];
              cvName = undefined;
          } else {
              const parts = groupKey.split('_');
              chapterIdentifier = parts[0];
              cvName = parts[1];
              characterName = parts[2];
          }

          if (!chapterIdentifier || !characterName) {
              missedCount += filesForGroup.length;
              continue;
          }
          
          const targetCharacters: Character[] = characters.filter(c => {
              const nameMatch = c.name === characterName;
              const cvMatch = cvName ? c.cvName === cvName : true; // If no cvName, match any CV for that character name.
              return nameMatch && cvMatch && c.status !== 'merged';
          });
          
          if (targetCharacters.length === 0) {
              missedCount += filesForGroup.length;
              continue;
          }
          
          const targetCharacterIds = new Set(targetCharacters.map(c => c.id));
          const chapterMatchers = parseChapterIdentifier(chapterIdentifier);
          if (chapterMatchers.length === 0) {
              missedCount += filesForGroup.length;
              continue;
          }
          
          const targetChapters = currentProject.chapters.filter((chapter, index) => {
              const chapterNumber = index + 1;
              return chapterMatchers.includes(chapterNumber);
          });
          
          if (targetChapters.length === 0) {
              missedCount += filesForGroup.length;
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
          
          const sortedFiles = filesForGroup.sort((a, b) => a.sequence - b.sequence);
          
          const limit = Math.min(targetLines.length, sortedFiles.length);
          for (let i = 0; i < limit; i++) {
              const { line, chapterId } = targetLines[i];
              const { file } = sortedFiles[i];
              await assignAudioToLine(currentProject.id, chapterId, line.id, file);
              matchedCount++;
          }
          missedCount += sortedFiles.length - limit;
      }
      
      setIsCharacterMatchLoading(false);
      alert(`按角色匹配完成。\n成功匹配: ${matchedCount} 个文件\n未匹配: ${missedCount} 个文件`);

      if (event.target) {
          event.target.value = '';
      }
  }, [currentProject, characters, assignAudioToLine, nonAudioCharacterIds]);

  const handleFileSelectionForChapterMatch = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !currentProject) return;

    setIsChapterMatchLoading(true);

    const chapterFileGroups = new Map<string, { file: File; sequence: number }[]>();

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.'));
        const parts = nameWithoutExt.split('_');

        if (parts.length === 2) { // Expecting chapter_seq
            const chapterIdentifier = parts[0];
            const sequence = parseInt(parts[1], 10);

            if (chapterIdentifier && !isNaN(sequence)) {
                if (!chapterFileGroups.has(chapterIdentifier)) {
                    chapterFileGroups.set(chapterIdentifier, []);
                }
                chapterFileGroups.get(chapterIdentifier)!.push({ file: file, sequence });
            }
        }
    }

    let matchedCount = 0;
    let missedCount = 0;

    for (const [chapterIdentifier, filesForGroup] of chapterFileGroups.entries()) {
        const chapterMatchers = parseChapterIdentifier(chapterIdentifier);
        if (chapterMatchers.length === 0) {
            missedCount += filesForGroup.length;
            continue;
        }

        const targetChapters = currentProject.chapters.filter((chapter, index) => {
            const chapterNumber = index + 1;
            return chapterMatchers.includes(chapterNumber);
        });

        if (targetChapters.length === 0) {
            missedCount += filesForGroup.length;
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
        
        const sortedFiles = filesForGroup.sort((a, b) => a.sequence - b.sequence);
        
        const limit = Math.min(targetLines.length, sortedFiles.length);
        for (let i = 0; i < limit; i++) {
            const { line, chapterId } = targetLines[i];
            const { file } = sortedFiles[i];
            await assignAudioToLine(currentProject.id, chapterId, line.id, file);
            matchedCount++;
        }
        missedCount += sortedFiles.length - limit;
    }

    setIsChapterMatchLoading(false);
    alert(`按章节匹配完成。\n成功匹配: ${matchedCount} 个文件\n未匹配: ${missedCount} 个文件`);

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