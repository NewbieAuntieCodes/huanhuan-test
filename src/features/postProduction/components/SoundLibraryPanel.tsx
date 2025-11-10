import React, { useState } from 'react';
import { FolderOpenIcon, MagnifyingGlassIcon } from '../../../components/ui/icons';

const SoundLibraryPanel: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [soundFiles, setSoundFiles] = useState([
        { id: 1, name: 'suspense_bgm_01.wav', duration: 125.3 },
        { id: 2, name: 'happy_theme.mp3', duration: 88.1 },
        { id: 3, name: 'door_creak.wav', duration: 3.5 },
        { id: 4, name: 'city_ambience.mp3', duration: 300.0 },
        { id: 5, name: 'footsteps_wood.wav', duration: 8.2 },
    ]);

    const handleConnectFolder = async () => {
        alert('此功能正在开发中。\n在未来，点击这里会打开文件夹选择窗口，让您关联本地的音效库。');
        // try {
        //     const dirHandle = await window.showDirectoryPicker();
        //     // Process directory handle
        // } catch (err) {
        //     console.error("Error picking directory:", err);
        // }
    };

    const filteredFiles = soundFiles.filter(file => 
        file.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatDuration = (seconds: number) => {
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min}:${sec.toString().padStart(2, '0')}`;
    };

    return (
        <div className="h-full flex flex-col bg-slate-800 text-slate-100 p-3">
            <h2 className="text-lg font-semibold text-slate-300 mb-2 flex-shrink-0">音效库</h2>
            
            <div className="mb-3 flex-shrink-0 space-y-2">
                <button 
                    onClick={handleConnectFolder}
                    className="w-full flex items-center justify-center text-sm text-sky-300 hover:text-sky-100 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-md"
                >
                    <FolderOpenIcon className="w-4 h-4 mr-2" />
                    关联本地文件夹
                </button>
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

            <div className="flex-grow overflow-y-auto space-y-1 pr-1 -mr-2">
                {filteredFiles.length > 0 ? (
                    filteredFiles.map(file => (
                        <div key={file.id} className="p-2 bg-slate-700/50 hover:bg-sky-800/50 rounded-md cursor-pointer flex justify-between items-center text-sm">
                            <span className="truncate pr-2">{file.name}</span>
                            <span className="text-xs text-slate-400 font-mono flex-shrink-0">{formatDuration(file.duration)}</span>
                        </div>
                    ))
                ) : (
                    <div className="h-full flex items-center justify-center text-center text-slate-500 text-sm">
                        <p>音效库为空或未找到匹配项。</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SoundLibraryPanel;