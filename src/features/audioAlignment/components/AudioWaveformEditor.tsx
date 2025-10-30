import React, { useState, useEffect, useRef, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.js';
import { XMarkIcon, UndoIcon, RedoIcon, PlusIcon, TrashIcon, MagnifyingGlassIcon, SaveIcon } from '../../../components/ui/icons';
import { db } from '../../../db';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

const WAVE_BG_COLOR = "#334155"; // slate-700
const WAVE_PROGRESS_COLOR = "#38bdf8"; // sky-400
const PLAYHEAD_COLOR = "#f1f5f9"; // slate-100
const REGION_COLOR = "rgba(14, 165, 233, 0.2)"; // sky-500 with opacity

interface AudioWaveformEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (sourceAudioId: string, markers: number[]) => void;
  sourceAudioInfo: { id: string; filename: string };
  currentLineId: string;
}

const AudioWaveformEditor: React.FC<AudioWaveformEditorProps> = ({ isOpen, onClose, onSave, sourceAudioInfo, currentLineId }) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [markers, setMarkers] = useState<number[]>([]);
  const [history, setHistory] = useState<number[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const pushToHistory = useCallback((newState: number[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newState);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  useEffect(() => {
    if (isOpen && waveformRef.current && timelineRef.current) {
      setIsLoading(true);
      setError(null);

      const ws = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: WAVE_BG_COLOR,
        progressColor: WAVE_PROGRESS_COLOR,
        cursorColor: PLAYHEAD_COLOR,
        barWidth: 2,
        barRadius: 2,
        height: 200,
        plugins: [
            TimelinePlugin.create({
                container: timelineRef.current,
                primaryColor: '#e2e8f0', // slate-200
                secondaryColor: '#94a3b8', // slate-400
                primaryFontColor: '#cbd5e1', // slate-300
                secondaryFontColor: '#94a3b8', // slate-400
            }),
        ],
      });
      wavesurferRef.current = ws;

      const loadAudioAndMarkers = async () => {
        try {
          const masterAudio = await db.masterAudios.get(sourceAudioInfo.id);
          if (!masterAudio) throw new Error("母带音频未找到。");
          await ws.loadBlob(masterAudio.data);
          
          const customMarkers = await db.audioMarkers.get(sourceAudioInfo.id);
          const initialMarkers = customMarkers ? customMarkers.markers : [];
          
          setMarkers(initialMarkers);
          setHistory([initialMarkers]);
          setHistoryIndex(0);
        } catch (e) {
          setError(e instanceof Error ? e.message : "加载音频失败。");
        } finally {
          setIsLoading(false);
        }
      };

      loadAudioAndMarkers();
      
      ws.on('click', (time) => {
        const newMarkers = [...markers, time].sort((a,b) => a-b);
        setMarkers(newMarkers);
        pushToHistory(newMarkers);
      });

      return () => {
        ws.destroy();
        wavesurferRef.current = null;
      };
    }
  }, [isOpen, sourceAudioInfo.id]);
  
  const handleRemoveMarker = (index: number, e: React.MouseEvent) => {
      e.stopPropagation();
      const newMarkers = markers.filter((_, i) => i !== index);
      setMarkers(newMarkers);
      pushToHistory(newMarkers);
  };
  
  const handleSave = () => {
    onSave(sourceAudioInfo.id, markers);
  };
  
  const handleUndo = () => {
      if(canUndo) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          setMarkers(history[newIndex]);
      }
  };

  const handleRedo = () => {
      if(canRedo) {
          const newIndex = historyIndex + 1;
          setHistoryIndex(newIndex);
          setMarkers(history[newIndex]);
      }
  };
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-85 flex items-center justify-center z-[110] p-4">
      <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col border border-slate-700">
        <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-700 flex-shrink-0">
          <div>
            <h2 className="text-2xl font-semibold text-slate-100">波形标记编辑器</h2>
            <p className="text-sm text-slate-400 truncate">{sourceAudioInfo.filename}</p>
          </div>
          <div className="flex items-center gap-x-3">
              <button onClick={handleUndo} disabled={!canUndo} className="p-2 text-slate-300 hover:text-white disabled:opacity-50"><UndoIcon /></button>
              <button onClick={handleRedo} disabled={!canRedo} className="p-2 text-slate-300 hover:text-white disabled:opacity-50"><RedoIcon /></button>
              <button onClick={handleSave} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-md"><SaveIcon className="w-4 h-4 mr-2" /> 保存并重新对轨</button>
              <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-white"><XMarkIcon /></button>
          </div>
        </div>

        <div className="flex-grow flex flex-col relative overflow-hidden">
            {isLoading && <div className="absolute inset-0 bg-slate-800/80 flex items-center justify-center z-20"><LoadingSpinner /></div>}
            {error && <div className="absolute inset-0 bg-slate-800/80 flex items-center justify-center text-red-400 z-20">{error}</div>}
            
            <div ref={timelineRef} className="h-5 flex-shrink-0"></div>
            <div className="relative flex-grow">
                 <div ref={waveformRef} className="h-full w-full cursor-pointer"></div>
                 {markers.map((time, index) => {
                     const leftPercent = (time / (wavesurferRef.current?.getDuration() || 1)) * 100;
                     return (
                         <div key={index} style={{ left: `${leftPercent}%` }} className="absolute top-0 bottom-0 w-0.5 bg-red-500/80 group">
                             <div className="absolute -top-1 -translate-x-1/2 w-2 h-2 bg-red-500 rounded-full"></div>
                             <div className="absolute -bottom-1 -translate-x-1/2 w-2 h-2 bg-red-500 rounded-full"></div>
                             <button 
                                onClick={(e) => handleRemoveMarker(index, e)} 
                                className="absolute top-1 -translate-x-1/2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                title="删除标记"
                             >
                                 <XMarkIcon className="w-3 h-3"/>
                             </button>
                         </div>
                     );
                 })}
            </div>
            <p className="text-xs text-slate-500 mt-2 text-center">点击波形添加标记点，点击标记点上的 <XMarkIcon className="w-2 h-2 inline-block" /> 删除标记。</p>
        </div>
      </div>
    </div>
  );
};

export default AudioWaveformEditor;