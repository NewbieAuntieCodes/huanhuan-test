import React from 'react';
import { Chapter } from '../../../types';
import { MatchStatus } from '../hooks/useAudioAlignmentAssistant';
import { StatusIcon } from './StatusIcon';

interface ChapterListPanelProps {
    chapters: Chapter[];
    allChapters: Chapter[];
    selectedChapterId: string | null;
    onSelectChapter: (id: string) => void;
    finalMatchStatus: MatchStatus | null;
    rangeIsSelected: boolean;
}

const formatChapterNumber = (index: number) => {
    if (index < 0) return '';
    const number = index + 1;
    return number < 1000 ? String(number).padStart(3, '0') : String(number);
};

const ChapterListPanel: React.FC<ChapterListPanelProps> = ({
    chapters,
    allChapters,
    selectedChapterId,
    onSelectChapter,
    finalMatchStatus,
    rangeIsSelected
}) => {
    return (
        <aside className="w-64 bg-slate-800 p-3 flex-shrink-0 overflow-y-auto border-r border-slate-700">
            <h2 className="text-lg font-semibold text-slate-300 mb-3">章节列表</h2>
            {!rangeIsSelected ? (
                <p className="text-sm text-slate-500">请选择一个目录。</p>
            ) : (
                 <ul className="space-y-1">
                    {chapters.map(chapter => {
                        const chapterIndex = allChapters.findIndex(c => c.id === chapter.id);
                        const displayTitle = `${formatChapterNumber(chapterIndex)} ${chapter.title}`;
                        return (
                        <li key={chapter.id}>
                            <button onClick={() => onSelectChapter(chapter.id)} className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between ${selectedChapterId === chapter.id ? 'bg-sky-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-200'}`}>
                                <span className="truncate" title={displayTitle}>{displayTitle}</span>
                                <StatusIcon status={finalMatchStatus?.chapters[chapter.id]} />
                            </button>
                        </li>
                    )})}
                </ul>
            )}
        </aside>
    );
};

export default ChapterListPanel;
