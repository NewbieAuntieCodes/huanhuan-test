import React from 'react';
import { Character } from '../../../types';
import { MatchStatus } from '../hooks/useAudioAlignmentAssistant';
import { StatusIcon } from './StatusIcon';

interface CharacterStatusGridProps {
    characters: Character[];
    onToggleCharacter: (charId: string) => void;
    finalMatchStatus: MatchStatus | null;
    directoryName: string | null;
    selectedChapterId: string | null;
}

const CharacterStatusGrid: React.FC<CharacterStatusGridProps> = ({
    characters,
    onToggleCharacter,
    finalMatchStatus,
    directoryName,
    selectedChapterId
}) => {
    if (!directoryName) {
        return <div className="text-center py-10 text-slate-500">请先关联或扫描本地音频文件夹。</div>;
    }
    
    if (!selectedChapterId) {
        return <div className="text-center py-10 text-slate-500">请选择一个章节查看角色状态。</div>;
    }
    
    if (characters.length === 0) {
        return <div className="text-center py-10 text-slate-500">此章节没有已分配的角色。</div>;
    }

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {characters.map(char => (
                <div key={char.id} onClick={() => onToggleCharacter(char.id)} className="p-3 bg-slate-800 rounded-md flex justify-between items-center cursor-pointer hover:bg-slate-700 transition-colors">
                    <div className="flex flex-col">
                        <span className="font-semibold">{char.name}</span>
                        {char.cvName && <span className="text-xs text-slate-400">{char.cvName}</span>}
                    </div>
                    <StatusIcon status={finalMatchStatus?.characters[char.id]} />
                </div>
            ))}
        </div>
    );
};

export default CharacterStatusGrid;
