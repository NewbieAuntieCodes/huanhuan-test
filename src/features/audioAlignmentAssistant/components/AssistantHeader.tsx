import React, { useRef, useEffect } from 'react';
import { FolderOpenIcon, ChevronLeftIcon, ArrowPathIcon } from '../../../components/ui/icons';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

interface AssistantHeaderProps {
    projectName: string;
    directoryName: string | null;
    isLoading: boolean;
    isApiSupported: boolean;
    directoryHandle: FileSystemDirectoryHandle | null;
    onSelectDirectory: () => void;
    onRescan: () => void;
    onScanDirectoryFallback: () => void;
    onDirectoryInputChangeFallback: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onNavigateBack: () => void;
}

const AssistantHeader: React.FC<AssistantHeaderProps> = ({
    projectName,
    directoryName,
    isLoading,
    isApiSupported,
    directoryHandle,
    onSelectDirectory,
    onRescan,
    onScanDirectoryFallback,
    onDirectoryInputChangeFallback,
    onNavigateBack
}) => {
    const directoryInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (directoryInputRef.current) {
            directoryInputRef.current.setAttribute('webkitdirectory', '');
        }
    }, []);

    const handleScanFallbackClick = () => {
        directoryInputRef.current?.click();
    };

    return (
        <header className="flex items-center justify-between p-4 border-b border-slate-800 flex-shrink-0">
            <div className="flex flex-col">
                <h1 className="text-2xl font-bold text-sky-400">对轨助手: <span className="text-slate-200">{projectName}</span></h1>
                {directoryName && <p className="text-xs text-slate-400 mt-1">当前文件夹: {directoryName}</p>}
            </div>
            <div className="flex items-center space-x-3">
                {isApiSupported ? (
                    <>
                        <button onClick={onSelectDirectory} disabled={isLoading} className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md disabled:opacity-50">
                            {isLoading && !directoryHandle ? <LoadingSpinner/> : <FolderOpenIcon className="w-4 h-4 mr-2" />}
                            {directoryHandle ? "更换文件夹" : "关联音频文件夹"}
                        </button>
                        {directoryHandle && (
                            <button onClick={onRescan} disabled={isLoading} className="flex items-center text-sm text-green-300 hover:text-green-100 px-3 py-1.5 bg-green-800/50 hover:bg-green-700/50 rounded-md disabled:opacity-50">
                                {isLoading ? <LoadingSpinner/> : <ArrowPathIcon className="w-4 h-4 mr-2" />}
                                重新扫描
                            </button>
                        )}
                    </>
                ) : (
                    <>
                        <input
                            type="file"
                            ref={directoryInputRef}
                            onChange={onDirectoryInputChangeFallback}
                            multiple
                            style={{ display: 'none' }}
                        />
                        <button onClick={handleScanFallbackClick} disabled={isLoading} className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md disabled:opacity-50">
                            {isLoading ? <LoadingSpinner/> : <FolderOpenIcon className="w-4 h-4 mr-2" />}
                            {isLoading ? "扫描中..." : "扫描本地文件夹"}
                        </button>
                    </>
                )}
                <button onClick={onNavigateBack} className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md">
                    <ChevronLeftIcon className="w-4 h-4 mr-1" /> 返回
                </button>
            </div>
        </header>
    );
};

export default AssistantHeader;
