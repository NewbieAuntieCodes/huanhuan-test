import React, { useState, useCallback, useMemo } from 'react';
import { FolderOpenIcon, MagnifyingGlassIcon, ArrowPathIcon, PlayIcon, PauseIcon } from '../../../components/ui/icons';
import { soundLibraryRepository } from '../../../repositories/soundLibraryRepository';
import { SoundLibraryItem, SoundLibraryHandleMap } from '../../../types';
import * as mm from 'music-metadata-browser';
import { useStore } from '../../../store/useStore';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';
// FIX: Import 'db' to resolve 'Cannot find name 'db''.
import { db } from '../../../db';

const CATEGORIES = [
    { key: 'music1', name: '音乐1' },
    { key: 'music2', name: '音乐2' },
    { key: 'ambience1', name: '环境音1' },
    { key: 'ambience2', name: '环境音2' },
    { key: 'footsteps', name: '脚步声' },
    { key: 'fabric', name: '布料' },
    { key: 'doors_windows', name: '门窗' },
    { key: 'transportation', name: '交通' },
    { key: 'horror', name: '恐怖音效' },
    { key: 'suspense', name: '悬疑音效' },
    { key: 'fighting', name: '打斗音效' },
    { key: 'firearms', name: '热武器音效' },
    { key: 'variety', name: '综艺音效' },
    { key: 'fantasy', name: '玄幻音效' },
    { key: 'sci_fi', name: '科幻音效' },
    { key: 'animals', name: '动物' },
    { key: 'other_sfx', name: '其它音效' },
];

const SoundLibraryPanel: React.FC = () => {
    const { openConfirmModal, soundLibrary, refreshSoundLibrary } = useStore(state => ({
      openConfirmModal: state.openConfirmModal,
      soundLibrary: state.soundLibrary,
      refreshSoundLibrary: state.refreshSoundLibrary,
    }));
    
    const [handles, setHandles] = useState<SoundLibraryHandleMap>({});
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [activeTab, setActiveTab] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');

    React.useEffect(() => {
        const loadHandles = async () => {
            const storedHandles = await soundLibraryRepository.getHandles();
            setHandles(storedHandles);
        };
        loadHandles();
    }, []);

    const scanDirectory = useCallback(async (categoryKey: string, handle: FileSystemDirectoryHandle, mode: 'full' | 'incremental') => {
        setIsLoading(true);
        setLoadingMessage(`扫描 "${handle.name}"... (${mode === 'full' ? '全量' : '增量'})`);

        try {
            if (mode === 'full') {
                // 全量扫描：清空后添加
                await soundLibraryRepository.clearSounds(categoryKey);
                const newSounds: SoundLibraryItem[] = [];

                async function processDirectory(dirHandle: FileSystemDirectoryHandle, currentPath: string) {
                    for await (const entry of dirHandle.values()) {
                        if (entry.kind === 'file' && (entry.name.endsWith('.mp3') || entry.name.endsWith('.wav'))) {
                            try {
                                const file = await (entry as FileSystemFileHandle).getFile();
                                const metadata = await mm.parseBlob(file);
                                newSounds.push({
                                    name: currentPath + file.name,
                                    handle: entry as FileSystemFileHandle,
                                    tags: [],
                                    duration: metadata.format.duration || 0,
                                    category: categoryKey,
                                });
                            } catch (e) {
                                console.warn(`无法解析文件元数据: ${currentPath + entry.name}`, e);
                            }
                        } else if (entry.kind === 'directory') {
                            // FIX: Cast entry to FileSystemDirectoryHandle for recursive call.
                            await processDirectory(entry as FileSystemDirectoryHandle, currentPath + entry.name + '/');
                        }
                    }
                }

                await processDirectory(handle, '');

                if (newSounds.length > 0) {
                    await soundLibraryRepository.addSounds(newSounds);
                }
            } else {
                // 增量扫描
                const existingSounds = await soundLibraryRepository.getSoundsByCategory(categoryKey);
                const existingSoundMap = new Map(existingSounds.map(s => [s.name, s]));
                const newSounds: SoundLibraryItem[] = [];
                const foundFileNames = new Set<string>();

                async function processDirectory(dirHandle: FileSystemDirectoryHandle, currentPath: string) {
                    for await (const entry of dirHandle.values()) {
                        const fullPath = currentPath + entry.name;
                        if (entry.kind === 'file' && (entry.name.endsWith('.mp3') || entry.name.endsWith('.wav'))) {
                            foundFileNames.add(fullPath);
                            if (!existingSoundMap.has(fullPath)) {
                                // 文件是新增的
                                try {
                                    const file = await (entry as FileSystemFileHandle).getFile();
                                    const metadata = await mm.parseBlob(file);
                                    newSounds.push({
                                        name: fullPath,
                                        handle: entry as FileSystemFileHandle,
                                        tags: [],
                                        duration: metadata.format.duration || 0,
                                        category: categoryKey,
                                    });
                                } catch (e) {
                                    console.warn(`无法解析新文件元数据: ${fullPath}`, e);
                                }
                            }
                        } else if (entry.kind === 'directory') {
                            await processDirectory(entry as FileSystemDirectoryHandle, fullPath + '/');
                        }
                    }
                }

                await processDirectory(handle, '');


                const soundsToDelete = existingSounds.filter(s => !foundFileNames.has(s.name));
                const idsToDelete = soundsToDelete.map(s => s.id).filter((id): id is number => id !== undefined);

                await db.transaction('rw', db.soundLibrary, async () => {
                    if (newSounds.length > 0) {
                        await soundLibraryRepository.addSounds(newSounds);
                    }
                    if (idsToDelete.length > 0) {
                        await soundLibraryRepository.bulkDeleteByIds(idsToDelete);
                    }
                });
            }
        } catch (err) {
            console.error(`扫描文件夹失败: ${handle.name}`, err);
            alert(`无法访问文件夹 "${handle.name}"。请重新关联。`);
        }
        
        await refreshSoundLibrary();
        setIsLoading(false);
        setLoadingMessage('');
    }, [refreshSoundLibrary]);

    const handleLinkFolder = async (categoryKey: string) => {
        try {
            const handle = await (window as any).showDirectoryPicker();
            // FIX: Argument of type 'FileSystemHandle' is not assignable to parameter of type 'FileSystemDirectoryHandle'.
            if (handle.kind === 'directory') {
                await soundLibraryRepository.saveHandle(categoryKey, handle);
                setHandles(prev => ({ ...prev, [categoryKey]: handle }));
                await scanDirectory(categoryKey, handle, 'full'); // 首次关联或更换文件夹时执行全量扫描
            }
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                // User cancelled, do nothing.
            } else {
                console.error("选择文件夹时出错:", err);
            }
        }
    };

    const handleRefreshAll = () => {
        openConfirmModal(
            '刷新所有音效库',
            '此操作将对所有已关联的文件夹执行全量扫描，清空并重新加载所有音频文件。确定要继续吗？',
            async () => {
                for (const categoryKey in handles) {
                    // FIX: Argument of type 'FileSystemHandle' is not assignable to parameter of type 'FileSystemDirectoryHandle'.
                    const handle = handles[categoryKey];
                    if (handle.kind === 'directory') {
                        await scanDirectory(categoryKey, handle, 'full');
                    }
                }
            },
            '全部刷新',
            '取消'
        );
    };

    const filteredSounds = useMemo(() => {
        return soundLibrary.filter(sound => {
            const matchesTab = activeTab === 'all' || sound.category === activeTab;
            const matchesSearch = searchTerm === '' || sound.name.toLowerCase().includes(searchTerm.toLowerCase());
            return matchesTab && matchesSearch;
        });
    }, [soundLibrary, activeTab, searchTerm]);

    const formatDuration = (seconds: number) => {
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min}:${sec.toString().padStart(2, '0')}`;
    };

    const linkedCategories = useMemo(() => CATEGORIES.filter(cat => handles[cat.key]), [handles]);

    return (
        <div className="h-full flex flex-col bg-slate-800 text-slate-100 p-3 relative">
            {isLoading && (
                <div className="absolute inset-0 bg-slate-900/70 z-20 flex flex-col items-center justify-center">
                    <LoadingSpinner />
                    <p className="mt-2 text-sm text-sky-300">{loadingMessage}</p>
                </div>
            )}
            <div className="flex justify-between items-center mb-2 flex-shrink-0">
                <h2 className="text-lg font-semibold text-slate-300">音效库</h2>
                <button
                    onClick={handleRefreshAll}
                    disabled={Object.keys(handles).length === 0}
                    className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md disabled:opacity-50"
                >
                    <ArrowPathIcon className="w-4 h-4 mr-2" />
                    全部刷新
                </button>
            </div>
            
            <div className="mb-3 flex-shrink-0 space-y-2 border-b border-slate-700 pb-3">
                <p className="text-sm font-medium text-slate-400">关联文件夹</p>
                <div className="grid grid-cols-2 gap-2">
                    {CATEGORIES.map(({ key, name }) => (
                        <div key={key} className="p-2 bg-slate-700 rounded-md text-sm">
                            <div className="font-semibold mb-1.5">{name}</div>
                            {handles[key] ? (
                                <div className="flex items-center justify-between">
                                    <p className="text-xs text-slate-400 truncate pr-2" title={handles[key]?.name}>已关联: {handles[key]?.name}</p>
                                    <div className="flex items-center space-x-2 flex-shrink-0">
                                      <button onClick={() => handleLinkFolder(key)} className="text-xs text-sky-400 hover:underline">更换</button>
                                      <button onClick={() => { if (handles[key]?.kind === 'directory') scanDirectory(key, handles[key]!, 'incremental') }} className="text-xs text-sky-400 hover:underline">更新</button>
                                    </div>
                                </div>
                            ) : (
                                <button onClick={() => handleLinkFolder(key)} className="w-full text-xs text-center py-1 bg-slate-600 hover:bg-sky-600 rounded">关联文件夹</button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex-shrink-0 flex flex-col gap-y-2">
                 <div className="flex border-b border-slate-700">
                    <button onClick={() => setActiveTab('all')} className={`px-3 py-1.5 text-sm ${activeTab === 'all' ? 'border-b-2 border-sky-400 text-sky-300' : 'text-slate-400'}`}>全部</button>
                    {linkedCategories.map(({ key, name }) => (
                        <button key={key} onClick={() => setActiveTab(key)} className={`px-3 py-1.5 text-sm ${activeTab === key ? 'border-b-2 border-sky-400 text-sky-300' : 'text-slate-400'}`}>{name}</button>
                    ))}
                </div>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <MagnifyingGlassIcon className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="搜索音效..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full p-1.5 pl-9 bg-slate-700 text-slate-100 rounded-md border border-slate-600 focus:ring-sky-500 focus:border-sky-500 text-sm"
                    />
                </div>
            </div>

            <div className="flex-grow overflow-y-auto space-y-1 pr-1 -mr-2 mt-2">
                {filteredSounds.length > 0 ? (
                    filteredSounds.map(sound => (
                        <div key={`${sound.category}-${sound.name}`} className="p-2 bg-slate-700/50 hover:bg-sky-800/50 rounded-md cursor-pointer flex justify-between items-center text-sm">
                            <span className="truncate pr-2">{sound.name}</span>
                            <span className="text-xs text-slate-400 font-mono flex-shrink-0">{formatDuration(sound.duration)}</span>
                        </div>
                    ))
                ) : (
                    <div className="h-full flex items-center justify-center text-center text-slate-500 text-sm">
                        <p>{soundLibrary.length === 0 ? '请先关联本地文件夹' : '未找到匹配的音效'}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SoundLibraryPanel;