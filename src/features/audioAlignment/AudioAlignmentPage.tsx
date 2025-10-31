import React, { useState, useRef, useMemo, useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { ChevronLeftIcon, BookOpenIcon, UploadIcon, UserCircleIcon, ListBulletIcon, ArrowDownTrayIcon, SpeakerXMarkIcon, CogIcon } from '../../components/ui/icons';
import AudioScriptLine from './components/AudioScriptLine';
import GlobalAudioPlayer from './components/GlobalAudioPlayer';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import ExportAudioModal from './components/ExportAudioModal';
import { exportAudioWithMarkers } from '../../lib/wavExporter';
import { db } from '../../db';
import { ScriptLine, Chapter, Character } from '../../types';
import { useAudioFileMatcher } from './hooks/useAudioFileMatcher';
import ResizablePanels from '../../components/ui/ResizablePanels';
import { usePaginatedChapters } from '../scriptEditor/hooks/usePaginatedChapters';
import ChapterPagination from '../scriptEditor/components/chapter_list_panel/ChapterPagination';
import SilenceSettingsModal from './components/SilenceSettingsModal';
import AudioWaveformEditor from './components/AudioWaveformEditor';

const formatChapterNumber = (index: number) => {
  if (index < 0) return '';
  const number = index + 1;
  return number < 1000 ? String(number).padStart(3, '0') : String(number);
};


const AudioAlignmentPage: React.FC = () => {
  const { 
    projects, 
    characters, 
    selectedProjectId, 
    selectedChapterId, 
    setSelectedChapterId,
    playingLineInfo,
    assignAudioToLine,
    resegmentAndRealignAudio,
    navigateTo,
    openConfirmModal,
    clearAudioFromChapter,
    waveformEditorState,
    openWaveformEditor,
    closeWaveformEditor,
  } = useStore(state => ({
    projects: state.projects,
    characters: state.characters,
    selectedProjectId: state.selectedProjectId,
    selectedChapterId: state.selectedChapterId,
    setSelectedChapterId: state.setSelectedChapterId,
    playingLineInfo: state.playingLineInfo,
    assignAudioToLine: state.assignAudioToLine,
    resegmentAndRealignAudio: state.resegmentAndRealignAudio,
    navigateTo: state.navigateTo,
    openConfirmModal: state.openConfirmModal,
    clearAudioFromChapter: state.clearAudioFromChapter,
    waveformEditorState: state.waveformEditor,
    openWaveformEditor: state.openWaveformEditor,
    closeWaveformEditor: state.closeWaveformEditor,
  }));

  const cvMatchFileInputRef = useRef<HTMLInputElement>(null);
  const characterMatchFileInputRef = useRef<HTMLInputElement>(null);
  const chapterMatchFileInputRef = useRef<HTMLInputElement>(null);

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSilenceSettingsModalOpen, setIsSilenceSettingsModalOpen] = useState(false);
  
  const currentProject = projects.find(p => p.id === selectedProjectId);
  
  const {
    isCvMatchLoading,
    handleFileSelectionForCvMatch,
    isCharacterMatchLoading,
    handleFileSelectionForCharacterMatch,
    isChapterMatchLoading,
    handleFileSelectionForChapterMatch,
  } = useAudioFileMatcher({
    currentProject,
    characters,
    assignAudioToLine,
  });


  const selectedChapter = currentProject?.chapters.find(c => c.id === selectedChapterId);
  const selectedChapterIndex = currentProject?.chapters.findIndex(c => c.id === selectedChapterId);

  const nonAudioCharacterIds = useMemo(() => {
    return characters
      .filter(c => c.name === '[静音]' || c.name === '音效')
      .map(c => c.id);
  }, [characters]);

  const visibleScriptLines = useMemo(() => {
    if (!selectedChapter) return [];
    if (nonAudioCharacterIds.length === 0) return selectedChapter.scriptLines;
    return selectedChapter.scriptLines.filter(line => !nonAudioCharacterIds.includes(line.characterId || ''));
  }, [selectedChapter, nonAudioCharacterIds]);
  
  const {
      currentPage,
      totalPages,
      paginatedChapters,
      handlePageChange,
  } = usePaginatedChapters({
      chapters: currentProject?.chapters || [],
      projectId: currentProject?.id,
      initialSelectedChapterIdForViewing: selectedChapterId,
      onSelectChapterForViewing: setSelectedChapterId,
      multiSelectedChapterIds: [], // Not used here
      setMultiSelectedChapterIdsContext: () => {}, // Not used here
      onPageChangeSideEffects: () => {},
      chaptersPerPage: 50,
  });


  const onGoBack = () => {
    selectedProjectId ? navigateTo("editor") : navigateTo("dashboard");
  }

  const handleCvMatchClick = () => {
    cvMatchFileInputRef.current?.click();
  };
  
  const handleCharacterMatchClick = () => {
    characterMatchFileInputRef.current?.click();
  };
  
  const handleChapterMatchClick = () => {
    chapterMatchFileInputRef.current?.click();
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

        // FIX: Pass the `characters` array to `exportAudioWithMarkers` to match its updated signature.
        const waveBlob = await exportAudioWithMarkers(linesWithAudio, currentProject, characters);
        
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

  const handleClearChapterAudio = () => {
    if (currentProject && selectedChapter) {
        openConfirmModal(
          "清除章节音频确认",
          <>您确定要清除章节 <strong className="text-sky-300">{selectedChapter.title}</strong> 的所有已对轨音频吗？<br/>此操作无法撤销。</>,
          () => {
            clearAudioFromChapter(currentProject.id, selectedChapter.id);
          },
          "全部清除",
          "取消"
        );
    }
  };

  const handleCalibrationSave = async (sourceAudioId: string, markers: number[]) => {
    if (currentProject) {
        await resegmentAndRealignAudio(currentProject.id, sourceAudioId, markers);
    }
    closeWaveformEditor();
  };


  const hasAudioInChapter = useMemo(() => {
    return selectedChapter?.scriptLines.some(l => l.audioBlobId) || false;
  }, [selectedChapter]);

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
  
  const ChapterList = (
    <div className="p-3 h-full flex flex-col bg-slate-800 text-slate-100">
      <h2 className="text-lg font-semibold text-slate-300 mb-3">章节列表 ({currentProject.chapters.length})</h2>
      
      <div className="flex-grow overflow-y-auto space-y-1 pr-1 -mr-1">
          {paginatedChapters.map(chapter => {
              const chapterIndex = currentProject.chapters.findIndex(c => c.id === chapter.id);
              const displayTitle = `${formatChapterNumber(chapterIndex)} ${chapter.title}`;
              return (
              <li key={chapter.id} className="list-none">
                  <button
                      onClick={() => setSelectedChapterId(chapter.id)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                          selectedChapterId === chapter.id
                          ? 'bg-sky-600 text-white font-semibold'
                          : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                      }`}
                  >
                     {displayTitle}
                  </button>
              </li>
          )})}
      </div>

      <ChapterPagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          isAnyOperationLoading={false}
          isEditingTitle={false}
      />
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-slate-900 text-slate-100">
      <header className="flex items-center justify-between p-4 border-b border-slate-800 flex-shrink-0">
        <h1 className="text-2xl font-bold text-sky-400 truncate pr-4">
          音频对轨: <span className="text-slate-200">{currentProject.name}</span>
        </h1>
        <div className="flex items-center space-x-2">
            <input 
                type="file" 
                multiple 
                accept="audio/*" 
                ref={chapterMatchFileInputRef} 
                onChange={handleFileSelectionForChapterMatch}
                className="hidden"
            />
            <input 
                type="file" 
                multiple 
                accept="audio/*" 
                ref={cvMatchFileInputRef} 
                onChange={handleFileSelectionForCvMatch}
                className="hidden"
            />
            <input 
                type="file" 
                multiple 
                accept="audio/*" 
                ref={characterMatchFileInputRef} 
                onChange={handleFileSelectionForCharacterMatch}
                className="hidden"
            />
            <button
                onClick={() => setIsSilenceSettingsModalOpen(true)}
                className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md"
                aria-label="间隔配置"
            >
                <CogIcon className="w-4 h-4 mr-1" />
                间隔配置
            </button>
            <button
                onClick={handleCvMatchClick}
                disabled={isCvMatchLoading}
                className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md disabled:opacity-50"
                aria-label="按CV匹配批量上传"
            >
                {isCvMatchLoading ? <LoadingSpinner /> : <UploadIcon className="w-4 h-4 mr-1" />}
                {isCvMatchLoading ? '匹配中...' : '按CV匹配'}
            </button>
            <button
                onClick={handleCharacterMatchClick}
                disabled={isCharacterMatchLoading}
                className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md disabled:opacity-50"
                aria-label="按角色匹配批量上传"
            >
                {isCharacterMatchLoading ? <LoadingSpinner /> : <UserCircleIcon className="w-4 h-4 mr-1" />}
                {isCharacterMatchLoading ? '匹配中...' : '按角色匹配'}
            </button>
            <button
                onClick={handleChapterMatchClick}
                disabled={isChapterMatchLoading}
                className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md disabled:opacity-50"
                aria-label="按章节匹配批量上传"
            >
                {isChapterMatchLoading ? <LoadingSpinner /> : <ListBulletIcon className="w-4 h-4 mr-1" />}
                {isChapterMatchLoading ? '匹配中...' : '按章节匹配'}
            </button>
            <button
                onClick={() => setIsExportModalOpen(true)}
                disabled={isExporting}
                className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md disabled:opacity-50"
                aria-label="导出音频"
            >
                {isExporting ? <LoadingSpinner /> : <ArrowDownTrayIcon className="w-4 h-4 mr-1" />}
                {isExporting ? '导出中...' : '导出音频'}
            </button>
            <button
                onClick={handleClearChapterAudio}
                disabled={!selectedChapter || !hasAudioInChapter || isExporting}
                className="flex items-center text-sm text-red-400 hover:text-red-300 px-3 py-1.5 bg-red-900/50 hover:bg-red-800/50 rounded-md disabled:opacity-50"
                aria-label="清除本章所有音频"
            >
                <SpeakerXMarkIcon className="w-4 h-4 mr-1" />
                清除本章音频
            </button>
            <button
                onClick={onGoBack}
                className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md"
                aria-label="Back"
            >
              <ChevronLeftIcon className="w-4 h-4 mr-1" /> 返回
            </button>
        </div>
      </header>
      <div className="flex flex-grow overflow-hidden">
        <ResizablePanels
          leftPanel={ChapterList}
          rightPanel={
             <main 
                className="flex-grow p-4 overflow-y-auto transition-all" 
                style={{ paddingBottom: playingLineInfo ? '8rem' : '1rem' }}
            >
                {selectedChapter ? (
                    <div>
                        <h3 className="text-xl font-bold text-sky-300 mb-4">{`${formatChapterNumber(selectedChapterIndex!)} ${selectedChapter.title}`}</h3>
                        <div className="space-y-3">
                            {visibleScriptLines.map((line, index) => (
                                <AudioScriptLine
                                    key={line.id}
                                    line={line}
                                    index={index}
                                    nextLine={visibleScriptLines[index+1]}
                                    chapterId={selectedChapter.id}
                                    projectId={currentProject.id}
                                    character={characters.find(c => c.id === line.characterId)}
                                    onRequestCalibration={openWaveformEditor}
                                />
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center text-slate-500">
                        <BookOpenIcon className="w-16 h-16 mb-4"/>
                        <p className="text-lg">请从左侧选择一个章节开始对轨。</p>
                    </div>
                )}
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
       {waveformEditorState.isOpen && waveformEditorState.sourceAudioInfo && (
          <AudioWaveformEditor
            isOpen={waveformEditorState.isOpen}
            onClose={closeWaveformEditor}
            sourceAudioInfo={waveformEditorState.sourceAudioInfo}
            currentLineId={waveformEditorState.lineId}
            currentLineIndex={waveformEditorState.lineIndex}
            onSave={handleCalibrationSave}
          />
       )}
    </div>
  );
};

export default AudioAlignmentPage;