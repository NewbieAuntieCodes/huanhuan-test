import React from 'react';

interface TrackProps {
    name: string;
    type: 'music' | 'sfx' | 'ambience' | 'dialogue';
    isReadOnly?: boolean;
}

const Track: React.FC<TrackProps> = ({ name, type, isReadOnly = false }) => {
    const trackColor = {
        dialogue: 'border-slate-600',
        music: 'border-green-600',
        ambience: 'border-blue-600',
        sfx: 'border-yellow-600',
    }[type];

    return (
        <div className={`flex items-stretch min-h-[80px] bg-slate-800 rounded-lg border-l-4 ${trackColor}`}>
            {/* Track Controls */}
            <div className="w-48 flex-shrink-0 p-2 flex flex-col justify-between border-r border-slate-700">
                <div>
                    <h3 className="font-semibold text-sm text-slate-200 truncate" title={name}>{name}</h3>
                </div>
                <div className="flex items-center space-x-1">
                    <button className="px-2 py-0.5 text-xs rounded bg-slate-700 hover:bg-slate-600" title="静音">M</button>
                    <button className="px-2 py-0.5 text-xs rounded bg-slate-700 hover:bg-slate-600" title="独奏">S</button>
                </div>
            </div>
            
            {/* Timeline Area */}
            <div className="flex-grow p-2 relative">
                <div className="absolute inset-0 bg-grid-slate-700/40 [mask-image:linear-gradient(to_right,white,white)]"></div>
                {isReadOnly && (
                     <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500 bg-slate-800/50 backdrop-blur-sm">
                        对白参考轨 (不可编辑)
                    </div>
                )}
            </div>
        </div>
    );
};

export default Track;
