import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import GlobalAudioPlayer from './components/GlobalAudioPlayer';
import ExportAudioModal from './components/ExportAudioModal';
import { exportAudioWithMarkers } from '../../lib/wavExporter';
import { db } from '../../db';
import { Character } from '../../types';
import { useAudioFileMatcher } from './hooks/useAudioFileMatcher';
import { useAsrAutoAligner } from './hooks/useAsrAutoAligner';
import ResizablePanels from '../../components/ui/ResizablePanels';
import { usePaginatedChapters } from '../scriptEditor/hooks/usePaginatedChapters';
import SilenceSettingsModal from './components/SilenceSettingsModal';
import { ChevronLeftIcon } from '../../components/ui/icons';
import AudioAlignmentHeader from './components/AudioAlignmentHeader';
import ChapterListPanel from './components/ChapterListPanel';
import ScriptLineList from './components/ScriptLineList';
import LocalWaveformDockPanel, { LocalCalibrationWindowLine } from './components/LocalWaveformDockPanel';
import { exportToReaperProject } from '../../services/reaperExporter';

const toSortedUnique = (arr: number[]) => {
  const out = (arr || []).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const dedup: number[] = [];
  for (const n of out) {
    if (dedup.length === 0 || Math.abs(dedup[dedup.length - 1] - n) > 1e-6) dedup.push(n);
  }
  return dedup;
};

const getBlobDurationSeconds = async (blob: Blob): Promise<number> => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  try {
    const decoded = await audioContext.decodeAudioData(await blob.arrayBuffer());
    return decoded.duration;
  } finally {
    if (audioContext.state !== 'closed') {
      await audioContext.close();
    }
  }
};

type LocalCalDockState = {
  sourceAudioInfo: { id: string; filename: string };
  windowLineIds: string[];
  windowLines: LocalCalibrationWindowLine[];
  initialSkipLineIds: string[];
  markerRange: { min: number; max: number };
  initialMarkers: number[];
};

const AudioAlignmentPage: React.FC = () => {
  const store = useStore(state => ({
    projects: state.projects,
    characters: state.characters,
    selectedProjectId: state.selectedProjectId,
    selectedChapterId: state.selectedChapterId,
    setSelectedChapterId: state.setSelectedChapterId,
    playingLineInfo: state.playingLineInfo,
    assignAudioToLine: state.assignAudioToLine,
    resegmentAndRealignAudioWindow: state.resegmentAndRealignAudioWindow,
    navigateTo: state.navigateTo,
    openConfirmModal: state.openConfirmModal,
    clearAudioFromChapters: state.clearAudioFromChapters,
    cvFilter: state.audioAlignmentCvFilter,
    setCvFilter: state.setAudioAlignmentCvFilter,
    characterFilter: state.audioAlignmentCharacterFilter,
    setCharacterFilter: state.setAudioAlignmentCharacterFilter,
    activeRecordingLineId: state.activeRecordingLineId,
    setActiveRecordingLineId: state.setActiveRecordingLineId,
    webSocketStatus: state.webSocketStatus,
    webSocketConnect: state.webSocketConnect,
    multiSelectedChapterIds: state.audioAlignmentMultiSelectedChapterIds,
    setMultiSelectedChapterIds: state.setAudioAlignmentMultiSelectedChapterIds,
    lufsSettings: state.lufsSettings,
    setLufsSettings: state.setLufsSettings,
    isRecordingMode: state.isRecordingMode,
    setRecordingMode: state.setRecordingMode,
  }));

  const {
    projects, characters, selectedProjectId, selectedChapterId, setSelectedChapterId,
    assignAudioToLine, resegmentAndRealignAudioWindow, navigateTo,
    openConfirmModal, clearAudioFromChapters, cvFilter, setCvFilter, characterFilter, setCharacterFilter,
    activeRecordingLineId, setActiveRecordingLineId, webSocketStatus, webSocketConnect,
    multiSelectedChapterIds, setMultiSelectedChapterIds, lufsSettings, setLufsSettings,
    isRecordingMode, setRecordingMode
  } = store;

  const lineRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingToReaper, setIsExportingToReaper] = useState(false);
  const [isSilenceSettingsModalOpen, setIsSilenceSettingsModalOpen] = useState(false);
  const [lastSelectedChapterForShiftClick, setLastSelectedChapterForShiftClick] = useState<string | null>(null);
  const [localCalDock, setLocalCalDock] = useState<LocalCalDockState | null>(null);
  const [isLocalCalPreparing, setIsLocalCalPreparing] = useState(false);
  const [isLocalCalSaving, setIsLocalCalSaving] = useState(false);
  const [localCalError, setLocalCalError] = useState<string | null>(null);
  const currentProject = projects.find(p => p.id === selectedProjectId);

  useEffect(() => {
    if (activeRecordingLineId) {
      const lineElement = lineRefs.current.get(activeRecordingLineId);
      if (lineElement) {
        lineElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeRecordingLineId]);

  useEffect(() => {
    setLocalCalDock(null);
    setLocalCalError(null);
  }, [selectedProjectId, selectedChapterId]);
  
  const {
    isSmartMatchLoading,
    handleFileSelectionForSmartMatch,
    isChapterMatchLoading,
    handleFileSelectionForChapterMatch,
    isReturnMatchLoading,
    handleFileSelectionForReturnMatch,
  } = useAudioFileMatcher({
    currentProject,
    characters,
    assignAudioToLine,
    multiSelectedChapterIds,
  });

  const {
    isAsrSupported,
    isAsrAlignLoading,
    handleFileSelectionForAsrAlign,
  } = useAsrAutoAligner({
    currentProject,
    selectedChapterId,
    characters,
    assignAudioToLine,
  });

  const { projectCharacters, projectCvNames } = useMemo<{ projectCharacters: Character[], projectCvNames: string[] }>(() => {
    if (!currentProject) {
        return { projectCharacters: [], projectCvNames: [] };
    }
    const projChars = characters.filter(c => !c.projectId || c.projectId === selectedProjectId);
    const cvs = projChars.reduce<string[]>((acc, c) => {
        if (c.cvName && !acc.includes(c.cvName)) {
            acc.push(c.cvName);
        }
        return acc;
    }, []).sort();
    return { projectCharacters: projChars, projectCvNames: cvs };
  }, [currentProject, characters, selectedProjectId]);

  const selectedChapter = currentProject?.chapters.find(c => c.id === selectedChapterId);
  const selectedChapterIndex = currentProject?.chapters.findIndex(c => c.id === selectedChapterId);

  const nonAudioCharacterIds = useMemo(() => {
    return characters
      .filter(c => c.name === '[静音]' || c.name === '音效' || c.name === '[音效]')
      .map(c => c.id);
  }, [characters]);

  const visibleScriptLines = useMemo(() => {
    if (!selectedChapter) return [];
    if (nonAudioCharacterIds.length === 0) return selectedChapter.scriptLines;
    return selectedChapter.scriptLines.filter(line => !nonAudioCharacterIds.includes(line.characterId || ''));
  }, [selectedChapter, nonAudioCharacterIds]);

  const openLocalCalibrationDock = useCallback(
    async (lineId: string, lineIndex: number, sourceAudioId: string, sourceAudioFilename: string) => {
      if (!currentProject || !selectedChapter) return;
      setLocalCalError(null);
      setIsLocalCalPreparing(true);

      try {
        const startIdx = Math.max(0, lineIndex - 2);
        const endIdx = Math.min(visibleScriptLines.length - 1, lineIndex + 2);
        const windowLinesRaw = visibleScriptLines.slice(startIdx, endIdx + 1);
        const windowLineIds = windowLinesRaw.map((l) => l.id);

        // Determine per-line audio status (in this source / missing / other source)
        const blobIds = windowLinesRaw.map((l) => l.audioBlobId).filter((id): id is string => !!id);
        const blobs = await db.audioBlobs.bulkGet(blobIds);
        const blobById = new Map<string, { sourceAudioId?: string }>();
        blobs.forEach((b, idx) => {
          const id = blobIds[idx];
          if (id && b) blobById.set(id, { sourceAudioId: b.sourceAudioId });
        });

        const windowLines: LocalCalibrationWindowLine[] = windowLinesRaw.map((l) => {
          const characterName =
            characters.find((c) => c.id === l.characterId)?.name || (l.characterId ? '未知角色' : '旁白');
          const blob = l.audioBlobId ? blobById.get(l.audioBlobId) : undefined;
          const blobSourceId = blob?.sourceAudioId;
          const status: LocalCalibrationWindowLine['status'] =
            !l.audioBlobId
              ? 'missing'
              : blobSourceId === sourceAudioId
                ? 'inSource'
                : blobSourceId
                  ? 'otherSource'
                  : 'missing';

          return { id: l.id, text: l.text, characterName, status, isCurrent: l.id === lineId };
        });

        const initialSkipLineIds = windowLines.filter((l) => l.status !== 'inSource').map((l) => l.id);

        // Load markers (fallback to segments if needed)
        const markerSet = await db.audioMarkers.get(sourceAudioId);
        let markers = toSortedUnique(markerSet?.markers || []);

        if (markers.length === 0) {
          // Best-effort fallback: reconstruct from existing slices
          const allSourceBlobs = await db.audioBlobs.where('sourceAudioId').equals(sourceAudioId).toArray();
          const lineIdToPosition = new Map<string, number>();
          let pos = 0;
          for (const ch of currentProject.chapters) {
            for (const ln of ch.scriptLines) {
              lineIdToPosition.set(ln.id, pos++);
            }
          }
          allSourceBlobs.sort((a, b) => {
            const pa = lineIdToPosition.get(a.lineId) ?? Number.POSITIVE_INFINITY;
            const pb = lineIdToPosition.get(b.lineId) ?? Number.POSITIVE_INFINITY;
            return pa - pb;
          });

          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          try {
            const rebuilt: number[] = [];
            let cumulative = 0;
            for (const b of allSourceBlobs) {
              const decoded = await audioContext.decodeAudioData(await b.data.arrayBuffer());
              cumulative += decoded.duration;
              rebuilt.push(cumulative);
            }
            if (rebuilt.length > 0) rebuilt.pop();
            markers = toSortedUnique(rebuilt);
          } finally {
            if (audioContext.state !== 'closed') await audioContext.close();
          }
        }

        const masterAudio = await db.masterAudios.get(sourceAudioId);
        if (!masterAudio) {
          throw new Error('母带音频未找到：该句音频不是从“母带分段”生成的，无法做局部校准。');
        }
        const fullDuration = await getBlobDurationSeconds(masterAudio.data);
        const cleanMarkers = toSortedUnique(markers.filter((t) => t > 0 && t < fullDuration));

        // Build segment index mapping from current assignments (sourceAudioId -> lineId set)
        const sourceBlobs = await db.audioBlobs.where('sourceAudioId').equals(sourceAudioId).toArray();
        const sourceLineIdSet = new Set(sourceBlobs.map((b) => b.lineId).filter(Boolean));
        const mappedLineIds: string[] = [];
        for (const ch of currentProject.chapters) {
          for (const ln of ch.scriptLines) {
            if (sourceLineIdSet.has(ln.id)) mappedLineIds.push(ln.id);
          }
        }
        const indexByLineId = new Map<string, number>();
        mappedLineIds.forEach((id, idx) => indexByLineId.set(id, idx));

        const segmentCount = cleanMarkers.length + 1;
        if (mappedLineIds.length !== segmentCount) {
          throw new Error(
            `该母带当前“分段数”(${segmentCount}) 与 “已分配行数”(${mappedLineIds.length})不一致，无法做局部校准。\n` +
              `建议：先对该母带做一次“自动对齐/全量校准”，让分段与已分配行重新一致。`,
          );
        }

        const segIndices = windowLineIds
          .filter((id) => sourceLineIdSet.has(id))
          .map((id) => indexByLineId.get(id))
          .filter((v): v is number => typeof v === 'number');

        if (segIndices.length === 0) {
          throw new Error('当前窗口内未找到属于该母带的音频片段，无法局部校准。');
        }

        const minSeg = Math.min(...segIndices);
        const maxSeg = Math.max(...segIndices);
        const boundaries = [0, ...cleanMarkers, fullDuration];
        const windowStart = boundaries[minSeg];
        const windowEnd = boundaries[maxSeg + 1];

        const EPS = 1e-3;
        if (!(windowEnd > windowStart + EPS)) {
          throw new Error('局部窗口时间范围无效（结束时间必须大于开始时间）。');
        }

        const initialMarkers = cleanMarkers.filter((t) => t > windowStart + EPS && t < windowEnd - EPS);

        setLocalCalDock({
          sourceAudioInfo: { id: sourceAudioId, filename: sourceAudioFilename },
          windowLineIds,
          windowLines,
          initialSkipLineIds,
          markerRange: { min: windowStart, max: windowEnd },
          initialMarkers,
        });
      } catch (e: unknown) {
        console.error('Open local calibration dock failed:', e);
        setLocalCalDock(null);
        const msg = e instanceof Error ? e.message : '打开局部校准失败';
        setLocalCalError(msg);
        alert(msg);
      } finally {
        setIsLocalCalPreparing(false);
      }
    },
    [characters, currentProject, selectedChapter, visibleScriptLines],
  );
   
  const {
      currentPage,
      totalPages,
      paginatedChapters,
      handlePageChange,
      allVisibleChaptersSelected,
      handleToggleSelectAllOnPage,
  } = usePaginatedChapters({
      chapters: currentProject?.chapters || [],
      projectId: currentProject?.id,
      initialSelectedChapterIdForViewing: selectedChapterId,
      onSelectChapterForViewing: setSelectedChapterId,
      multiSelectedChapterIds: multiSelectedChapterIds,
      setMultiSelectedChapterIdsContext: setMultiSelectedChapterIds,
      onPageChangeSideEffects: useCallback(() => setLastSelectedChapterForShiftClick(null), []),
      chaptersPerPage: 100,
  });

  const onGoBack = () => {
    selectedProjectId ? navigateTo("editor") : navigateTo("dashboard");
  }

  const handleExportToReaper = async () => {
    if (!currentProject) return;
    const chaptersToExport = multiSelectedChapterIds.length > 0
        ? currentProject.chapters.filter(c => multiSelectedChapterIds.includes(c.id))
        : (selectedChapter ? [selectedChapter] : []);

    if (chaptersToExport.length === 0) {
        alert('没有可导出的章节。');
        return;
    }

    const hasAudio = chaptersToExport.some(c => c.scriptLines.some(l => l.audioBlobId));
    if (!hasAudio) {
        alert('所选章节内没有已对轨的音频可供导出。');
        return;
    }
    
    setIsExportingToReaper(true);
    try {
        await exportToReaperProject(currentProject, chaptersToExport, characters);
    } catch (error) {
        console.error("导出到Reaper时出错:", error);
        alert(`导出到Reaper时出错: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
        setIsExportingToReaper(false);
    }
  };

  const handleExport = async (scope: 'current' | 'all') => {
    if (!currentProject) return;
    setIsExportModalOpen(false);
    setIsExporting(true);

    try {
        const chaptersToExport = scope === 'current'
            ? selectedChapter ? [selectedChapter] : []
            : currentProject.chapters;

        if (chaptersToExport.length === 0) {
            alert('没有可导出的章节。');
            return;
        }

        const linesWithAudio = [];
        for (const chapter of chaptersToExport) {
            for (const line of chapter.scriptLines) {
                if (line.audioBlobId) {
                    const audioBlobFromDb = await db.audioBlobs.get(line.audioBlobId);
                    if (audioBlobFromDb) {
                        linesWithAudio.push({
                            line,
                            audioBlob: audioBlobFromDb.data,
                        });
                    }
                }
            }
        }

        if (linesWithAudio.length === 0) {
            alert('所选范围内没有已对轨的音频可供导出。');
            return;
        }

        const waveBlob = await exportAudioWithMarkers(
            linesWithAudio,
            currentProject,
            characters,
            { enabled: lufsSettings.enabled, target: lufsSettings.target }
        );
        
        const url = URL.createObjectURL(waveBlob);
        const a = document.createElement('a');
        a.href = url;
        const fileNameScope = scope === 'current' && selectedChapter ? selectedChapter.title.replace(/[<>:"/\\|?*]+/g, '_') : 'AllChapters';
        a.download = `${currentProject.name}_${fileNameScope}_Marked.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } catch (error) {
        console.error("导出音频时出错:", error);
        alert(`导出音频时出错: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
        setIsExporting(false);
    }
  };

  const multiSelectCount = multiSelectedChapterIds.length;
  const handleReconnect = useCallback(() => {
    if (webSocketConnect) {
      webSocketConnect();
    }
  }, [webSocketConnect]);
  
  const hasAudioInSelection = useMemo(() => {
      if (!currentProject) return false;
      if (multiSelectCount > 0) {
          return currentProject.chapters
              .filter(c => multiSelectedChapterIds.includes(c.id))
              .some(c => c.scriptLines.some(l => l.audioBlobId));
      }
      return selectedChapter?.scriptLines.some(l => l.audioBlobId) || false;
  }, [selectedChapter, multiSelectedChapterIds, currentProject, multiSelectCount]);

  const handleClearAudio = () => {
      if (!currentProject) return;
      const idsToClear = multiSelectCount > 0 ? multiSelectedChapterIds : (selectedChapterId ? [selectedChapterId] : []);
      if (idsToClear.length === 0) return;

      const chaptersToClear = currentProject.chapters.filter(c => idsToClear.includes(c.id));
      const chapterTitles = chaptersToClear.map(c => `"${c.title}"`).join(', ');

      openConfirmModal(
        "清除音频确认",
        <>您确定要清除 {chaptersToClear.length > 1 ? `这 ${chaptersToClear.length} 个章节` : `章节`} <strong className="text-sky-300">{chapterTitles}</strong> 的所有已对轨音频吗？<br/>此操作无法撤销。</>,
        () => {
          clearAudioFromChapters(currentProject.id, idsToClear);
        },
        "全部清除",
        "取消"
      );
  };

  const handleLocalCalibrationSave = useCallback(
    async (args: { markers: number[]; skipLineIds: string[] }) => {
      if (!currentProject || !localCalDock) return;
      setIsLocalCalSaving(true);
      try {
        await resegmentAndRealignAudioWindow(
          currentProject.id,
          localCalDock.sourceAudioInfo.id,
          localCalDock.windowLineIds,
          args.skipLineIds,
          localCalDock.markerRange.min,
          localCalDock.markerRange.max,
          args.markers,
        );
        setLocalCalError(null);
        setLocalCalDock((prev) => {
          if (!prev) return prev;
          const nextSkip = new Set(args.skipLineIds);
          return {
            ...prev,
            initialSkipLineIds: args.skipLineIds,
            windowLines: prev.windowLines.map((l) => {
              if (l.status === 'otherSource') return l;
              return { ...l, status: nextSkip.has(l.id) ? 'missing' : 'inSource' };
            }),
          };
        });
      } finally {
        setIsLocalCalSaving(false);
      }
    },
    [currentProject, localCalDock, resegmentAndRealignAudioWindow],
  );

  const handleToggleMultiSelect = useCallback((chapterId: string, event: React.MouseEvent) => {
    if (!currentProject) return;

    if (event.shiftKey && lastSelectedChapterForShiftClick) {
        const allChapterIds = currentProject.chapters.map(ch => ch.id);
        const lastIndex = allChapterIds.indexOf(lastSelectedChapterForShiftClick);
        const currentIndex = allChapterIds.indexOf(chapterId);

        if (lastIndex !== -1 && currentIndex !== -1) {
            const start = Math.min(lastIndex, currentIndex);
            const end = Math.max(lastIndex, currentIndex);
            const idsToSelect = allChapterIds.slice(start, end + 1);
            
            setMultiSelectedChapterIds(
                Array.from(new Set([...multiSelectedChapterIds, ...idsToSelect]))
            );
            return;
        }
    }
    
    // FIX: The `setMultiSelectedChapterIds` function from the Zustand store does not support functional updates.
    // The new state is calculated from the `multiSelectedChapterIds` state variable before being passed to the setter.
    const newIds = multiSelectedChapterIds.includes(chapterId)
      ? multiSelectedChapterIds.filter(id => id !== chapterId)
      : [...multiSelectedChapterIds, chapterId];
    setMultiSelectedChapterIds(newIds);
    setLastSelectedChapterForShiftClick(chapterId);
}, [lastSelectedChapterForShiftClick, currentProject, setMultiSelectedChapterIds, multiSelectedChapterIds]);
  
  if (!currentProject) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center bg-slate-900 text-slate-100">
        <h1 className="text-2xl font-bold text-sky-400">音频对轨</h1>
        <p className="mt-4 text-slate-400">请先从项目面板选择一个项目。</p>
        <button
            onClick={onGoBack}
            className="mt-6 flex items-center text-sm text-sky-300 hover:text-sky-100 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-md"
        >
          <ChevronLeftIcon className="w-4 h-4 mr-1" /> 返回项目面板
        </button>
      </div>
    );
  }
  
  const hasAudioInProject = currentProject.chapters.some(c => c.scriptLines.some(l => l.audioBlobId));
  
  return (
    <div className="h-full flex flex-col bg-slate-900 text-slate-100">
        <AudioAlignmentHeader
            currentProjectName={currentProject.name}
            webSocketStatus={webSocketStatus}
            isRecordingMode={isRecordingMode}
            onToggleRecordingMode={() => setRecordingMode(!isRecordingMode)}
            cvFilter={cvFilter}
            onCvFilterChange={setCvFilter}
            characterFilter={characterFilter}
            onCharacterFilterChange={setCharacterFilter}
            projectCharacters={projectCharacters}
            projectCvNames={projectCvNames}
            onOpenSilenceSettings={() => setIsSilenceSettingsModalOpen(true)}
            lufsSettings={lufsSettings}
            onLufsSettingsChange={setLufsSettings}
            isSmartMatchLoading={isSmartMatchLoading}
            isChapterMatchLoading={isChapterMatchLoading}
            onOpenExportModal={() => setIsExportModalOpen(true)}
            isExporting={isExporting}
            isExportingToReaper={isExportingToReaper}
            onExportToReaper={handleExportToReaper}
            onClearAudio={handleClearAudio}
            hasAudioInSelection={hasAudioInSelection}
            multiSelectCount={multiSelectCount}
            onGoBack={onGoBack}
            onFileSelectionForSmartMatch={handleFileSelectionForSmartMatch}
            onFileSelectionForChapterMatch={handleFileSelectionForChapterMatch}
            isReturnMatchLoading={isReturnMatchLoading}
            onFileSelectionForReturnMatch={handleFileSelectionForReturnMatch}
            isAsrAlignSupported={isAsrSupported}
            isAsrAlignLoading={isAsrAlignLoading}
            onFileSelectionForAsrAlign={handleFileSelectionForAsrAlign}
            onReconnect={handleReconnect}
        />
        <div className="flex flex-grow overflow-hidden">
            <ResizablePanels
            leftPanel={
                <ChapterListPanel
                    currentProjectChapters={currentProject.chapters}
                    paginatedChapters={paginatedChapters}
                    multiSelectedChapterIds={multiSelectedChapterIds}
                    selectedChapterId={selectedChapterId}
                    handleToggleMultiSelect={handleToggleMultiSelect}
                    setSelectedChapterId={setSelectedChapterId}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    handlePageChange={handlePageChange}
                    allVisibleChaptersSelected={allVisibleChaptersSelected}
                    handleToggleSelectAllOnPage={handleToggleSelectAllOnPage}
                />
            }
            rightPanel={
                <main className="p-4 transition-all" style={{ paddingBottom: store.playingLineInfo ? '8rem' : '1rem' }}>
                  <div className="flex gap-4 items-start">
                    <div className="min-w-0 flex-1">
                      <ScriptLineList
                        selectedChapter={selectedChapter}
                        selectedChapterIndex={selectedChapterIndex!}
                        visibleScriptLines={visibleScriptLines}
                        characters={characters}
                        isRecordingMode={isRecordingMode}
                        cvFilter={cvFilter}
                        characterFilter={characterFilter}
                        activeRecordingLineId={activeRecordingLineId}
                        setActiveRecordingLineId={setActiveRecordingLineId}
                        onRequestCalibration={openLocalCalibrationDock}
                        lineRefs={lineRefs}
                        projectId={currentProject.id}
                      />
                    </div>
                    {localCalDock && (
                      <LocalWaveformDockPanel
                        isOpen={!!localCalDock}
                        isSaving={isLocalCalSaving}
                        isPreparing={isLocalCalPreparing}
                        errorMessage={localCalError}
                        sourceAudioInfo={localCalDock.sourceAudioInfo}
                        windowLines={localCalDock.windowLines}
                        initialSkipLineIds={localCalDock.initialSkipLineIds}
                        markerRange={localCalDock.markerRange}
                        initialMarkers={localCalDock.initialMarkers}
                        onClose={() => setLocalCalDock(null)}
                        onSave={handleLocalCalibrationSave}
                      />
                    )}
                  </div>
                </main>
            }
            initialLeftWidthPercent={25}
            />
        </div>
        <GlobalAudioPlayer />
        <ExportAudioModal
            isOpen={isExportModalOpen}
            onClose={() => setIsExportModalOpen(false)}
            onExport={handleExport}
            currentChapterIndex={selectedChapterIndex! > -1 ? selectedChapterIndex : null}
            currentChapterTitle={selectedChapter?.title || null}
            projectTitle={currentProject.name}
            hasAudioInProject={hasAudioInProject}
        />
      
       {currentProject && (
          <SilenceSettingsModal
              isOpen={isSilenceSettingsModalOpen}
              onClose={() => setIsSilenceSettingsModalOpen(false)}
              project={currentProject}
          />
       )}
    </div>
  );
};

export default AudioAlignmentPage;
