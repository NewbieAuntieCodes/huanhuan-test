import React from 'react';
import { useStore } from '../../store/useStore';
import { ChevronLeftIcon } from '../../components/ui/icons';
import { useAudioAlignmentAssistant } from './hooks/useAudioAlignmentAssistant';
import AssistantHeader from './components/AssistantHeader';
import RangeListPanel from './components/RangeListPanel';
import ChapterListPanel from './components/ChapterListPanel';
import CharacterStatusGrid from './components/CharacterStatusGrid';

const AudioAlignmentAssistantPage: React.FC = () => {
    const {
        isLoading,
        currentProject,
        directoryName,
        isApiSupported,
        directoryHandle,
        chapterRanges,
        selectedRangeIndex,
        chaptersInSelectedRange,
        selectedChapterId,
        charactersInSelectedChapter,
        finalMatchStatus,
        handleSelectDirectory,
        handleRescan,
        handleScanDirectoryClick_Fallback,
        handleDirectoryInputChange_Fallback,
        setSelectedRangeIndex,
        setSelectedChapterId,
        handleToggleCharacter,
        navigateTo,
    } = useAudioAlignmentAssistant();

    if (!currentProject) {
        return (
            <div className="p-6 h-full flex flex-col items-center justify-center bg-slate-900 text-slate-100">
                <h1 className="text-2xl font-bold text-sky-400">对轨助手</h1>
                <p className="mt-4 text-slate-400">请先从项目面板选择一个项目。</p>
                 <button onClick={() => navigateTo('dashboard')} className="mt-6 flex items-center text-sm text-sky-300 hover:text-sky-100 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-md">
                   <ChevronLeftIcon className="w-4 h-4 mr-1" /> 返回项目面板
                 </button>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-slate-900 text-slate-100">
            <AssistantHeader
                projectName={currentProject.name}
                directoryName={directoryName}
                isLoading={isLoading}
                isApiSupported={isApiSupported}
                directoryHandle={directoryHandle}
                onSelectDirectory={handleSelectDirectory}
                onRescan={handleRescan}
                onScanDirectoryFallback={handleScanDirectoryClick_Fallback}
                onDirectoryInputChangeFallback={handleDirectoryInputChange_Fallback}
                onNavigateBack={() => navigateTo('editor')}
            />

            <div className="flex-grow flex overflow-hidden">
                <RangeListPanel
                    chapterRanges={chapterRanges}
                    selectedRangeIndex={selectedRangeIndex}
                    onSelectRange={setSelectedRangeIndex}
                    finalMatchStatus={finalMatchStatus}
                />
                
                <ChapterListPanel
                    chapters={chaptersInSelectedRange}
                    allChapters={currentProject.chapters}
                    selectedChapterId={selectedChapterId}
                    onSelectChapter={setSelectedChapterId}
                    finalMatchStatus={finalMatchStatus}
                    rangeIsSelected={selectedRangeIndex !== null}
                />

                <main className="flex-grow p-4 overflow-y-auto">
                     <h2 className="text-lg font-semibold text-slate-300 mb-3">角色状态</h2>
                    <CharacterStatusGrid
                        characters={charactersInSelectedChapter}
                        onToggleCharacter={handleToggleCharacter}
                        finalMatchStatus={finalMatchStatus}
                        directoryName={directoryName}
                        selectedChapterId={selectedChapterId}
                    />
                </main>
            </div>
        </div>
    );
};

export default AudioAlignmentAssistantPage;
