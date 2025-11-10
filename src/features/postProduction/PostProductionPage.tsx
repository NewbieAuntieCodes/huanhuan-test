import React from 'react';
import { useStore } from '../../store/useStore';
import ResizablePanels from '../../components/ui/ResizablePanels';
import { ChevronLeftIcon } from '../../components/ui/icons';
import SoundLibraryPanel from './components/SoundLibraryPanel';
import TimelineHeader from './components/TimelineHeader';
import Track from './components/Track';

const PostProductionPage: React.FC = () => {
    const { selectedProjectId, projects, navigateTo } = useStore(state => ({
        selectedProjectId: state.selectedProjectId,
        projects: state.projects,
        navigateTo: state.navigateTo,
    }));

    const currentProject = projects.find(p => p.id === selectedProjectId);

    if (!currentProject) {
        return (
            <div className="p-6 h-full flex flex-col items-center justify-center bg-slate-900 text-slate-100">
                <h1 className="text-2xl font-bold text-sky-400">后期制作</h1>
                <p className="mt-4 text-slate-400">请先从项目面板选择一个项目。</p>
                <button
                    onClick={() => navigateTo('dashboard')}
                    className="mt-6 flex items-center text-sm text-sky-300 hover:text-sky-100 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-md"
                >
                    <ChevronLeftIcon className="w-4 h-4 mr-1" /> 返回项目面板
                </button>
            </div>
        );
    }

    const mainContent = (
        <div className="h-full flex flex-col bg-slate-900 text-slate-100">
            <header className="flex items-center justify-between p-3 border-b border-slate-800 flex-shrink-0">
                <h1 className="text-xl font-bold text-sky-400 truncate">
                    后期制作: <span className="text-slate-200">{currentProject.name}</span>
                </h1>
                <button
                    onClick={() => navigateTo('editor')}
                    className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md"
                >
                    <ChevronLeftIcon className="w-4 h-4 mr-1" /> 返回编辑器
                </button>
            </header>
            <div className="flex-grow flex flex-col overflow-hidden">
                <TimelineHeader />
                <div className="flex-grow overflow-y-auto p-2 space-y-1">
                    <Track name="对白 (参考)" type="dialogue" isReadOnly />
                    <Track name="音乐" type="music" />
                    <Track name="环境音" type="ambience" />
                    <Track name="音效" type="sfx" />
                    {/* 用户未来可以添加更多轨道 */}
                </div>
            </div>
        </div>
    );

    const soundLibraryPanel = <SoundLibraryPanel />;

    return (
        <ResizablePanels
            leftPanel={soundLibraryPanel}
            rightPanel={mainContent}
            initialLeftWidthPercent={20}
        />
    );
};

export default PostProductionPage;
