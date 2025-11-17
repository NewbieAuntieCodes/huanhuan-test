import React, { useState } from 'react';
import { ChevronDownIcon } from '../../../../components/ui/icons';

interface TrackGroupProps {
  name: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

const TrackGroup: React.FC<TrackGroupProps> = ({ name, children, defaultExpanded = true }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="border-t border-slate-700/50">
      <div 
        className="flex items-center h-8 bg-slate-800/70 cursor-pointer hover:bg-slate-700/50 sticky top-6 z-10"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <button className="p-2 text-slate-400">
          <ChevronDownIcon className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-0' : '-rotate-90'}`} />
        </button>
        <h3 className="font-semibold text-xs text-slate-300 uppercase tracking-wider">{name}</h3>
      </div>
      {isExpanded && (
        <div className="bg-slate-900/20">
          {children}
        </div>
      )}
    </div>
  );
};

export default TrackGroup;
