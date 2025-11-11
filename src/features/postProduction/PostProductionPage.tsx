import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { ChevronLeftIcon } from '../../components/ui/icons';
import ResizablePanels from '../../components/ui/ResizablePanels';
import { DialogueContent } from './components/DialogueContent';
import TimelineHeader from './components/TimelineHeader';
import SoundLibraryPanel from './components/SoundLibraryPanel';
import AddSceneModal from './components/AddSceneModal';
import AddBgmModal from './components/AddBgmModal';
import EditMarkerModal from './components/EditMarkerModal';
import SoundAssistantSettingsModal from './components/SoundAssistantSettingsModal';
import { usePostProduction } from './hooks/usePostProduction';

const PostProductionPage: React.FC = () => {
    const { navigateTo, soundLibrary, soundObservationList, characters } = useStore(state => ({
        navigateTo: state.navigateTo,
        soundLibrary: state.soundLibrary,
        soundObservationList: state.soundObservationList,
        characters: state.characters,
    }));

    const {
        currentProject,
        textMarkers,
        selectedRange,
        isSceneModalOpen,
        isBgmModalOpen,
        editingMarker,
        suspendLayout,
        handleTextSelect,
        openSceneModal,
        closeSceneModal,
        openBgmModal,
        closeBgmModal,
        openEditModal,
        closeEditModal,
        handleSaveScene,
        handleSaveBgm,
        handleDeleteMarker,
        handleRenameMarker,
        handleUpdateRangeFromSelection,
        handleUpdateColor,
    } = usePostProduction();

    const [isSoundAssistantSettingsOpen, setIsSoundAssistantSettingsOpen] = useState(false);

    useEffect(() => {
        (window as any).__openEditMarker = openEditModal;
        return () => { delete (window as any).__openEditMarker; };
    }, [openEditModal]);

    if (!currentProject) {
        return (
            <div className="p-6 h-full flex flex-col items-center justify-center bg-slate-900 text-slate-100">
                <h1 className="text-2xl font-bold text-sky-400">后期制作</h1>
                <p className="mt-4 text-slate-400">请先从项目面板选择一个项目。</p>
                 <button onClick={() => navigateTo('dashboard')} className="mt-6 flex items-center text-sm text-sky-300 hover:text-sky-100 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-md">
                   <ChevronLeftIcon className="w-4 h-4 mr-1" /> 返回项目面板
                 </button>
            </div>
        );
    }
    
    const existingSceneNames = useMemo(() => Array.from(new Set(textMarkers.filter(m => m.type === 'scene' && m.name).map(m => m.name!))), [textMarkers]);
    const existingBgmNames = useMemo(() => Array.from(new Set(textMarkers.filter(m => m.type === 'bgm' && m.name).map(m => m.name!))), [textMarkers]);
    const projectCharacters = useMemo(() => characters.filter(c => !c.projectId || c.projectId === currentProject.id), [characters, currentProject.id]);

    return (
        <div className="h-full flex flex-col bg-slate-900 text-slate-100">
            <header className="flex items-center justify-between p-3 border-b border-slate-800 flex-shrink-0">
                <h1 className="text-xl font-bold text-sky-400 truncate pr-4">
                    后期制作: <span className="text-slate-200">{currentProject.name}</span>
                </h1>
                <div className="flex items-center space-x-3">
                    <button onClick={openSceneModal} disabled={!selectedRange} className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50">添加场景</button>
                    <button onClick={openBgmModal} disabled={!selectedRange} className="px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 rounded-md disabled:opacity-50">添加 BGM</button>
                    <button onClick={() => setIsSoundAssistantSettingsOpen(true)} className="px-3 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 rounded-md">音效助手设置</button>
                    <button onClick={() => navigateTo('editor')} className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md">
                        <ChevronLeftIcon className="w-4 h-4 mr-1" /> 返回
                    </button>
                </div>
            </header>

            <div className="flex-grow flex overflow-hidden">
                <ResizablePanels
                    leftPanel={
                        <ResizablePanels
                            leftPanel={<SoundLibraryPanel />}
                            rightPanel={<DialogueContent 
                                chapters={currentProject.chapters} 
                                allProjectChapters={currentProject.chapters} 
                                characters={projectCharacters}
                                onTextSelect={handleTextSelect}
                                textMarkers={textMarkers}
                                suspendLayout={suspendLayout}
                                soundLibrary={soundLibrary}
                                soundObservationList={soundObservationList}
                            />}
                            initialLeftWidthPercent={30}
                        />
                    }
                    rightPanel={
                        <div className="h-full flex flex-col">
                            <TimelineHeader />
                            <div className="flex-grow overflow-y-auto bg-slate-850 p-2">
                                <p className="text-center text-slate-500 text-sm">时间轴功能待开发</p>
                            </div>
                        </div>
                    }
                    initialLeftWidthPercent={70}
                />
            </div>
            
            <AddSceneModal 
                isOpen={isSceneModalOpen} 
                onClose={closeSceneModal}
                onSave={handleSaveScene}
                existingSceneNames={existingSceneNames}
            />
            <AddBgmModal
                isOpen={isBgmModalOpen}
                onClose={closeBgmModal}
                onSave={handleSaveBgm}
                existingBgmNames={existingBgmNames}
                soundLibrary={soundLibrary}
            />
            <EditMarkerModal
                isOpen={!!editingMarker}
                marker={editingMarker}
                onClose={closeEditModal}
                onDelete={handleDeleteMarker}
                onRename={handleRenameMarker}
                onUpdateRangeFromSelection={handleUpdateRangeFromSelection}
                onUpdateColor={handleUpdateColor}
                soundLibrary={soundLibrary}
            />
            <SoundAssistantSettingsModal
                isOpen={isSoundAssistantSettingsOpen}
                onClose={() => setIsSoundAssistantSettingsOpen(false)}
            />
        </div>
    );
};

export default PostProductionPage;