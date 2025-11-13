import React from 'react';
import { PlayIcon, PauseIcon } from '../../../components/ui/icons';

const StopIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16" className={className}>
        <path d="M5 3.5h6A1.5 1.5 0 0 1 12.5 5v6a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 11V5A1.5 1.5 0 0 1 5 3.5z"/>
    </svg>
);

const LoopIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.092 1.21-.138 2.43-.138 3.662s.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.092-1.21.138-2.43.138-3.662z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

const TimelineHeader: React.FC = () => {
    return (
        <div className="flex-shrink-0 flex items-center gap-4 p-2 bg-slate-800 border-b border-slate-700">
            <div className="flex items-center space-x-1">
                <button title="播放" className="p-2 rounded hover:bg-slate-700 text-slate-300"><PlayIcon className="w-5 h-5" /></button>
                <button title="暂停" className="p-2 rounded hover:bg-slate-700 text-slate-300"><PauseIcon className="w-5 h-5" /></button>
                <button title="停止" className="p-2 rounded hover:bg-slate-700 text-slate-300"><StopIcon className="w-4 h-4" /></button>
                <button title="循环" className="p-2 rounded hover:bg-slate-700 text-slate-300"><LoopIcon className="w-5 h-5" /></button>
            </div>
            <div className="font-mono text-lg text-sky-300">
                00:00.000
            </div>
        </div>
    );
};

export default TimelineHeader;
