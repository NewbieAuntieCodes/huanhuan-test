import React from 'react';
import { MatchStatus } from '../hooks/useAudioAlignmentAssistant';
import { StatusIcon } from './StatusIcon';

interface Range {
    label: string;
    start: number;
    end: number;
}

interface RangeListPanelProps {
    chapterRanges: Range[];
    selectedRangeIndex: number | null;
    onSelectRange: (index: number) => void;
    finalMatchStatus: MatchStatus | null;
}

const RangeListPanel: React.FC<RangeListPanelProps> = ({
    chapterRanges,
    selectedRangeIndex,
    onSelectRange,
    finalMatchStatus
}) => {
    return (
        <aside className="w-48 bg-slate-800 p-3 flex-shrink-0 overflow-y-auto border-r border-slate-700">
            <h2 className="text-lg font-semibold text-slate-300 mb-3">目录</h2>
            <ul className="space-y-1">
                {chapterRanges.map((range, index) => (
                    <li key={range.label}>
                        <button onClick={() => onSelectRange(index)} className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between ${selectedRangeIndex === index ? 'bg-sky-600 text-white font-semibold' : 'bg-slate-700 hover:bg-slate-600 text-slate-200'}`}>
                            <span>{range.label}</span>
                            <StatusIcon status={finalMatchStatus?.ranges[range.label]} />
                        </button>
                    </li>
                ))}
            </ul>
        </aside>
    );
};

export default RangeListPanel;
