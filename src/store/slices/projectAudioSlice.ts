import { StateCreator } from 'zustand';
import { AppState } from '../useStore';
import { Project, Chapter, AudioBlob, ScriptLine, Character, SilenceSettings, MasterAudio } from '../../types';
import { db } from '../../db';
import { bufferToWav } from '../../lib/wavEncoder';

export interface ProjectAudioSlice {
  updateLineAudio: (projectId: string, chapterId: string, lineId: string, audioBlobId: string | null) => Promise<void>;
  assignAudioToLine: (projectId: string, chapterId: string, lineId: string, audioBlob: Blob, sourceAudioId?: string, sourceAudioFilename?: string) => Promise<void>;
  clearAudioFromChapters: (projectId: string, chapterIds: string[]) => Promise<void>;
  resegmentAndRealignAudio: (projectId: string, sourceAudioId: string, markers: number[]) => Promise<void>;
  resegmentAndRealignAudioWindow: (
    projectId: string,
    sourceAudioId: string,
    windowLineIds: string[],
    skipLineIds: string[],
    windowStartTime: number,
    windowEndTime: number,
    windowMarkers: number[],
  ) => Promise<void>;
}

export const createProjectAudioSlice: StateCreator<AppState, [], [], ProjectAudioSlice> = (set, get) => ({
    updateLineAudio: async (projectId, chapterId, lineId, audioBlobId) => {
        const project = get().projects.find(p => p.id === projectId);
        if (!project) return;
        
        const updatedProject = {
          ...project,
          chapters: project.chapters.map(ch => {
            if (ch.id === chapterId) {
              return {
                ...ch,
                scriptLines: ch.scriptLines.map(line => {
                  if (line.id === lineId) {
                    // Set to undefined if null is passed, to avoid storing null in DB
                    return { ...line, audioBlobId: audioBlobId || undefined };
                  }
                  return line;
                })
              };
            }
            return ch;
          }),
          lastModified: Date.now(),
        };
        
        await db.projects.put(updatedProject);
        set(state => ({
          projects: state.projects.map(p => p.id === projectId ? updatedProject : p)
            .sort((a,b) => b.lastModified - a.lastModified),
        }));
      },
      assignAudioToLine: async (projectId, chapterId, lineId, audioBlob, sourceAudioId, sourceAudioFilename) => {
        const newId = `audio_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const audioBlobEntry: AudioBlob = { 
            id: newId, 
            lineId, 
            data: audioBlob,
            sourceAudioId: sourceAudioId || newId, // If no source, it's its own source
            sourceAudioFilename: sourceAudioFilename || 'Untitled.wav',
        };
        
        await db.audioBlobs.put(audioBlobEntry);
        await get().updateLineAudio(projectId, chapterId, lineId, newId);
      },
      clearAudioFromChapters: async (projectId, chapterIds) => {
        const state = get();
        const project = state.projects.find(p => p.id === projectId);
        if (!project) return;
    
        const chaptersToClear = project.chapters.filter(ch => chapterIds.includes(ch.id));
        if (chaptersToClear.length === 0) return;
    
        const blobIdsToDelete = chaptersToClear
            .flatMap(ch => ch.scriptLines)
            .map(line => line.audioBlobId)
            .filter((id): id is string => !!id);
    
        if (blobIdsToDelete.length === 0) {
            return;
        }
        
        const updatedProject = {
          ...project,
          chapters: project.chapters.map(ch => {
            if (chapterIds.includes(ch.id)) {
              return {
                ...ch,
                scriptLines: ch.scriptLines.map(line => ({ ...line, audioBlobId: undefined }))
              };
            }
            return ch;
          }),
          lastModified: Date.now(),
        };
        
        await db.transaction('rw', db.projects, db.audioBlobs, async () => {
            await db.projects.put(updatedProject);
            if (blobIdsToDelete.length > 0) {
                await db.audioBlobs.bulkDelete(blobIdsToDelete);
            }
        });
        
        set(state => ({
          projects: state.projects.map(p => p.id === projectId ? updatedProject : p)
            .sort((a,b) => b.lastModified - a.lastModified),
        }));
      },
      resegmentAndRealignAudio: async (projectId, sourceAudioId, markers) => {
        get().clearPlayingLine();
        get().setIsLoading(true);
    
        try {
            await db.audioMarkers.put({ sourceAudioId, markers });
    
            const masterAudio = await db.masterAudios.get(sourceAudioId);
            if (!masterAudio) throw new Error("母带音频未找到。");
    
            const project = get().projects.find(p => p.id === projectId);
            if (!project) throw new Error("项目未找到。");
    
            const affectedLines: { line: ScriptLine, chapterId: string }[] = [];
            const oldBlobIds = new Set<string>();
    
            // Find currently affected lines in script order
            for (const chapter of project.chapters) {
                for (const line of chapter.scriptLines) {
                    if (line.audioBlobId) {
                        const blobInfo = await db.audioBlobs.get(line.audioBlobId);
                        if (blobInfo && blobInfo.sourceAudioId === sourceAudioId) {
                            affectedLines.push({ line, chapterId: chapter.id });
                            oldBlobIds.add(line.audioBlobId);
                        }
                    }
                }
            }
            
            // Resegment audio
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const mainAudioBuffer = await audioContext.decodeAudioData(await masterAudio.data.arrayBuffer());
            
            const newBlobs: AudioBlob[] = [];
            const fullDuration = mainAudioBuffer.duration;
            const allMarkers = [0, ...markers.sort((a, b) => a - b), fullDuration];
    
            for (let i = 0; i < allMarkers.length - 1; i++) {
                const startTime = allMarkers[i];
                const endTime = allMarkers[i+1];
                const duration = endTime - startTime;
                if (duration <= 0) continue;
    
                const startSample = Math.floor(startTime * mainAudioBuffer.sampleRate);
                const endSample = Math.floor(endTime * mainAudioBuffer.sampleRate);
                
                const segmentBuffer = audioContext.createBuffer(mainAudioBuffer.numberOfChannels, endSample - startSample, mainAudioBuffer.sampleRate);
                for (let ch = 0; ch < mainAudioBuffer.numberOfChannels; ch++) {
                    segmentBuffer.copyToChannel(mainAudioBuffer.getChannelData(ch).subarray(startSample, endSample), ch);
                }
    
                const segmentBlob = bufferToWav(segmentBuffer);
                const newBlobId = `audio_reseg_${Date.now()}_${i}`;
                newBlobs.push({
                    id: newBlobId,
                    lineId: '', // Will be assigned below
                    data: segmentBlob,
                    sourceAudioId: sourceAudioId,
                    sourceAudioFilename: masterAudio.id.replace(`${projectId}_`, ''),
                });
            }
            audioContext.close();
    
            // Realign: Find all lines that need audio, including new ones.
            let linesToRealign = [...affectedLines];
    
            // If new segments > old lines, find the next available lines to fill.
            if (newBlobs.length > affectedLines.length && affectedLines.length > 0) {
                const linesToAddCount = newBlobs.length - affectedLines.length;
                const lastAffected = affectedLines[affectedLines.length - 1];
                
                const allLinesWithChapter = project.chapters.flatMap(ch => ch.scriptLines.map(line => ({ line, chapterId: ch.id })));
                const lastAffectedIndexInAll = allLinesWithChapter.findIndex(item => item.line.id === lastAffected.line.id);
    
                if (lastAffectedIndexInAll !== -1) {
                    const nonAudioCharacterIds = get().characters
                        .filter(c => c.name === '[静音]' || c.name === '音效' || c.name === '[音效]')
                        .map(c => c.id);
    
                    const potentialNextLines = allLinesWithChapter
                        .slice(lastAffectedIndexInAll + 1)
                        .filter(({ line }) => !line.audioBlobId && !nonAudioCharacterIds.includes(line.characterId || ''))
                        .slice(0, linesToAddCount);
                    
                    linesToRealign.push(...potentialNextLines);
                }
            }
    
            let updatedProject = { ...project, lastModified: Date.now() };
            const newBlobAssignments = new Map<string, string>();
    
            linesToRealign.forEach((lineInfo, index) => {
                const newBlob = newBlobs[index];
                if (newBlob) {
                    newBlob.lineId = lineInfo.line.id;
                    newBlobAssignments.set(lineInfo.line.id, newBlob.id);
                }
            });
    
            updatedProject.chapters = updatedProject.chapters.map(ch => ({
                ...ch,
                scriptLines: ch.scriptLines.map(line => {
                    if (newBlobAssignments.has(line.id)) {
                        return { ...line, audioBlobId: newBlobAssignments.get(line.id) };
                    }
                    // If the line previously had an audio from this source but no longer gets one
                    if (oldBlobIds.has(line.audioBlobId || '')) {
                        return { ...line, audioBlobId: undefined };
                    }
                    return line;
                })
            }));
            
            // Persist changes
            await db.transaction('rw', db.projects, db.audioBlobs, async () => {
                // Delete all old blobs from this source first
                await db.audioBlobs.bulkDelete(Array.from(oldBlobIds));
                
                // Put all the new blobs
                const blobsToPut = newBlobs.filter(b => b.lineId); // Only put blobs that were assigned to a line
                if (blobsToPut.length > 0) {
                    await db.audioBlobs.bulkPut(blobsToPut);
                }
                
                await db.projects.put(updatedProject);
            });
            
            set({ projects: get().projects.map(p => p.id === projectId ? updatedProject : p) });
    
        } catch (e) {
            console.error("Failed to resegment and realign audio:", e);
            alert(`校准失败: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            get().setIsLoading(false);
        }
      },

      resegmentAndRealignAudioWindow: async (
        projectId,
        sourceAudioId,
        windowLineIds,
        skipLineIds,
        windowStartTime,
        windowEndTime,
        windowMarkers,
      ) => {
        get().clearPlayingLine();
        get().setIsLoading(true);

        try {
          const project = get().projects.find((p) => p.id === projectId);
          if (!project) throw new Error('项目未找到。');

          const masterAudio = await db.masterAudios.get(sourceAudioId);
          if (!masterAudio) throw new Error('母带音频未找到。');

          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

          const toSortedUnique = (arr: number[]) => {
            const out = (arr || []).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
            const dedup: number[] = [];
            for (const n of out) {
              if (dedup.length === 0 || Math.abs(dedup[dedup.length - 1] - n) > 1e-6) dedup.push(n);
            }
            return dedup;
          };

          const normalizeFilename = (id: string) => {
            const prefix = `${projectId}_`;
            return id.startsWith(prefix) ? id.slice(prefix.length) : id;
          };

          try {
            const mainAudioBuffer = await audioContext.decodeAudioData(await masterAudio.data.arrayBuffer());
            const fullDuration = mainAudioBuffer.duration;

            const EPS = 1e-3;
            const startTime = Math.max(0, Math.min(fullDuration, windowStartTime));
            const endTime = Math.max(0, Math.min(fullDuration, windowEndTime));
            if (!(endTime > startTime + EPS)) {
              throw new Error('局部窗口时间范围无效（结束时间必须大于开始时间）。');
            }

            // Load existing markers (or empty)
            const markerSet = await db.audioMarkers.get(sourceAudioId);
            const existingMarkers = toSortedUnique((markerSet?.markers || []).filter((t) => t > 0 && t < fullDuration));

            // Replace markers inside (startTime, endTime) with the edited windowMarkers
            const keepBefore = existingMarkers.filter((t) => t <= startTime + EPS);
            const keepAfter = existingMarkers.filter((t) => t >= endTime - EPS);
            const nextWindowMarkers = toSortedUnique(
              (windowMarkers || []).filter((t) => t > startTime + EPS && t < endTime - EPS && t > 0 && t < fullDuration),
            );

            const newMarkers = [...keepBefore, ...nextWindowMarkers, ...keepAfter].sort((a, b) => a - b);

            // Build a set of lines that currently belong to this source audio
            const sourceBlobs = await db.audioBlobs.where('sourceAudioId').equals(sourceAudioId).toArray();
            const blobByLineId = new Map<string, AudioBlob>();
            for (const b of sourceBlobs) {
              if (b?.lineId) blobByLineId.set(b.lineId, b);
            }

            const windowSet = new Set(windowLineIds || []);
            const skipSet = new Set(skipLineIds || []);

            // Build new mapping: all lines with this source audio in script order, except that within window we follow windowLineIds+skipSet
            const newMappedLineIds: string[] = [];
            for (const ch of project.chapters) {
              for (const line of ch.scriptLines) {
                const isInWindow = windowSet.has(line.id);
                if (isInWindow) {
                  if (!skipSet.has(line.id)) newMappedLineIds.push(line.id);
                } else if (blobByLineId.has(line.id)) {
                  newMappedLineIds.push(line.id);
                }
              }
            }

            const segmentCount = newMarkers.length + 1;
            if (newMappedLineIds.length !== segmentCount) {
              throw new Error(
                `分段数与未跳过行数不匹配：\n` +
                  `分段=${segmentCount}（标记=${newMarkers.length}）\n` +
                  `目标行=${newMappedLineIds.length}\n\n` +
                  `请通过“添加/删除标记”或“勾选×跳过”让两者一致（例如：想把一段拆成两句 → 先取消跳过第二句，再加一条标记）。`,
              );
            }

            // Determine which window lines will receive audio (and their segment time ranges)
            const boundaries = [0, ...newMarkers, fullDuration];
            const indexByLineId = new Map<string, number>();
            newMappedLineIds.forEach((id, idx) => indexByLineId.set(id, idx));

            const windowTargetLineIds = (windowLineIds || []).filter((id) => windowSet.has(id) && !skipSet.has(id));

            // Build new blobs for window target lines
            const newBlobs: AudioBlob[] = [];
            const newBlobIdByLineId = new Map<string, string>();
            for (let i = 0; i < windowTargetLineIds.length; i++) {
              const lineId = windowTargetLineIds[i];
              const segIndex = indexByLineId.get(lineId);
              if (segIndex === undefined) continue;
              const segStart = Math.max(0, Math.min(fullDuration, boundaries[segIndex]));
              const segEnd = Math.max(segStart, Math.min(fullDuration, boundaries[segIndex + 1]));
              if (segEnd <= segStart + EPS) continue;

              const startSample = Math.floor(segStart * mainAudioBuffer.sampleRate);
              const endSample = Math.floor(segEnd * mainAudioBuffer.sampleRate);
              if (endSample <= startSample) continue;

              const segmentBuffer = audioContext.createBuffer(
                mainAudioBuffer.numberOfChannels,
                endSample - startSample,
                mainAudioBuffer.sampleRate,
              );
              for (let ch = 0; ch < mainAudioBuffer.numberOfChannels; ch++) {
                segmentBuffer.copyToChannel(
                  mainAudioBuffer.getChannelData(ch).subarray(startSample, endSample),
                  ch,
                );
              }

              const segmentBlob = bufferToWav(segmentBuffer);
              const newBlobId = `audio_reseg_local_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`;
              newBlobIdByLineId.set(lineId, newBlobId);
              newBlobs.push({
                id: newBlobId,
                lineId,
                data: segmentBlob,
                sourceAudioId,
                sourceAudioFilename: normalizeFilename(masterAudio.id),
              });
            }

            // Delete old blobs for window lines that belong to this source (we will overwrite/clear them)
            const oldBlobIdsToDelete: string[] = [];
            for (const lineId of windowLineIds || []) {
              const b = blobByLineId.get(lineId);
              if (b?.id) oldBlobIdsToDelete.push(b.id);
            }

            // Update project lines within window
            const updatedProject: Project = {
              ...project,
              lastModified: Date.now(),
              chapters: project.chapters.map((ch) => ({
                ...ch,
                scriptLines: ch.scriptLines.map((line) => {
                  if (!windowSet.has(line.id)) return line;

                  if (skipSet.has(line.id)) {
                    // Only clear if the current audio belongs to this source
                    return blobByLineId.has(line.id) ? { ...line, audioBlobId: undefined } : line;
                  }

                  const nextBlobId = newBlobIdByLineId.get(line.id);
                  if (!nextBlobId) return line;
                  return { ...line, audioBlobId: nextBlobId };
                }),
              })),
            };

            await db.transaction('rw', db.projects, db.audioBlobs, db.audioMarkers, async () => {
              if (oldBlobIdsToDelete.length > 0) {
                await db.audioBlobs.bulkDelete(oldBlobIdsToDelete);
              }
              if (newBlobs.length > 0) {
                await db.audioBlobs.bulkPut(newBlobs);
              }
              await db.projects.put(updatedProject);
              await db.audioMarkers.put({ sourceAudioId, markers: newMarkers });
            });

            set({
              projects: get()
                .projects.map((p) => (p.id === projectId ? updatedProject : p))
                .sort((a, b) => b.lastModified - a.lastModified),
            });
          } finally {
            if (audioContext.state !== 'closed') {
              await audioContext.close();
            }
          }
        } catch (e) {
          console.error('Failed to resegment and realign audio (window):', e);
          alert(`局部校准失败: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
          get().setIsLoading(false);
        }
      },
});
