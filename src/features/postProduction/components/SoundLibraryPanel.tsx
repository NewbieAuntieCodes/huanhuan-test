import React from 'react';
import { FolderOpenIcon } from '../../../components/ui/icons';

const SoundLibraryPanel: React.FC = () => {
    return (
        <div className="h-full flex flex-col bg-slate-800 text-slate-100 p-3">
            <h2 className="text-lg font-semibold text-slate-300 mb-4 flex-shrink-0">音效库</h2>
            
            <div className="mb-4 flex-shrink-0">
                <button 
                    className="w-full flex items-center justify-center text-sm text-sky-300 hover:text-sky-100 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-md disabled:opacity-50"
                    title="此功能将在下一阶段实现"
                    disabled
                >
                    <FolderOpenIcon className="w-4 h-4 mr-2" />
                    关联本地文件夹
                </button>
            </div>

            <div className="flex-grow overflow-y-auto flex items-center justify-center text-center text-slate-500 text-sm">
                <p>尚未关联音效库</p>
            </div>
        </div>
    );
};

export default SoundLibraryPanel;
