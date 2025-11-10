import React, { useEffect, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { ChevronLeftIcon, MusicalNoteIcon, SpeakerWaveIcon, FilmIcon } from '../../components/ui/icons';
import { TextMarker } from '../../types';
import ResizablePanels from '../../components/ui/ResizablePanels';
import SoundLibraryPanel from './components/SoundLibraryPanel';
import TimelineHeader from './components/TimelineHeader';
import AddSceneModal from './components/AddSceneModal';
import AddBgmModal from './components/AddBgmModal';
import EditMarkerModal from './components/EditMarkerModal';
import { DialogueContent } from './components/DialogueContent';
import { usePostProduction } from './hooks/usePostProduction';

const PostProductionPage: React.FC = () => {
    const { navigateTo, characters, soundLibrary } = useStore((state) => ({
        navigateTo: state.navigateTo,
        characters: state.characters,
        soundLibrary: state.soundLibrary,
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

    useEffect(() => {
        (window as any).__openEditMarker = openEditModal;
        return () => {
            delete (window as any).__openEditMarker;
        };
    }, [openEditModal]);

    const existingSceneNames = useMemo(() => {
        const names = new Set(textMarkers.filter((m) => m.type === 'scene').map((m) => m.name).filter((n): n is string => !!n));
        return Array.from(names).sort();
    }, [textMarkers]);
    
    const existingBgmNames = useMemo(() => {
        const names = new Set(textMarkers.filter((m) => m.type === 'bgm').map((m) => m.name).filter((n): n is string => !!n));
        return Array.from(names).sort();
    }, [textMarkers]);

    const handleAddSfx = () => {
        alert('音效功能稍后提供');
        const selection = window.getSelection();
        if (selection) selection.removeAllRanges();
    };

    if (!currentProject) {
        return (
            <div className="p-6 h-full flex flex-col items-center justify-center bg-slate-900 text-slate-100">
                <h1 className="text-2xl font-bold text-sky-400">后期制作</h1>
                <p className="mt-4 text-slate-400">请先创建项目或选择一个项目</p>
                <button onClick={() => navigateTo('dashboard')} className="mt-6 flex items-center text-sm text-sky-300 hover:text-sky-100 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-md">
                    <ChevronLeftIcon className="w-4 h-4 mr-1" /> 返回项目页
                </button>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-slate-900 text-slate-100">
            <header className="flex items-center justify-between p-3 border-b border-slate-800 flex-shrink-0">
                <h1 className="text-xl font-bold text-sky-400 truncate">
                    后期制作: <span className="text-slate-200">{currentProject.name}</span>
                </h1>
                <button onClick={() => navigateTo('editor')} className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md">
                    <ChevronLeftIcon className="w-4 h-4 mr-1" /> 返回编辑页
                </button>
            </header>
            <div className="flex-grow flex flex-col overflow-hidden">
                <TimelineHeader />
                <div className="flex-grow overflow-hidden">
                    <ResizablePanels
                        leftPanel={<SoundLibraryPanel />}
                        rightPanel={
                            <div className="h-full flex flex-col">
                                <div className="flex-shrink-0 p-2 border-b border-slate-700 flex items-center gap-2">
                                    <button onClick={openBgmModal} disabled={!selectedRange} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-sky-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed" title="为选中文本添加背景音乐范围">
                                        <MusicalNoteIcon className="w-5 h-5" /> 添加背景音乐
                                    </button>
                                    <button onClick={handleAddSfx} disabled={!selectedRange} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-amber-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed" title="为选中文本添加音效范围">
                                        <SpeakerWaveIcon className="w-5 h-5" /> 添加音效
                                    </button>
                                    <button onClick={openSceneModal} disabled={!selectedRange} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-purple-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed" title="为选中文本添加场景">
                                        <FilmIcon className="w-5 h-5" /> 创建场景
                                    </button>
                                    {selectedRange && <span className="text-xs text-green-400">已选择文本</span>}
                                </div>
                                <div className="flex-grow overflow-y-auto">
                                    <DialogueContent
                                        chapters={currentProject.chapters}
                                        allProjectChapters={currentProject.chapters}
                                        characters={characters}
                                        onTextSelect={handleTextSelect}
                                        textMarkers={textMarkers}
                                        suspendLayout={suspendLayout}
                                    />
                                </div>
                            </div>
                        }
                        initialLeftWidthPercent={30}
                    />
                </div>
            </div>
            <AddSceneModal isOpen={isSceneModalOpen} onClose={closeSceneModal} onSave={handleSaveScene} existingSceneNames={existingSceneNames} />
            <AddBgmModal isOpen={isBgmModalOpen} onClose={closeBgmModal} onSave={handleSaveBgm} existingBgmNames={existingBgmNames} soundLibrary={soundLibrary} />
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
        </div>
    );
};

export default PostProductionPage;