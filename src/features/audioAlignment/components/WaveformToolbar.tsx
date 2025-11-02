import React from 'react';
import {
  XMarkIcon,
  UndoIcon,
  RedoIcon,
  TrashIcon,
  SaveIcon,
  PlayIcon,
  PauseIcon,
  PlusIcon,
} from '../../../components/ui/icons';

interface WaveformToolbarProps {
  isLoading: boolean;
  isPlaying: boolean;
  canUndo: boolean;
  canRedo: boolean;
  selectedMarkerIndex: number | null;
  onPlayPause: () => void;
  onAddMarker: () => void;
  onRemoveMarker: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onClose: () => void;
  sourceAudioFilename: string;
}

export const WaveformToolbar: React.FC<WaveformToolbarProps> = ({
  isLoading,
  isPlaying,
  canUndo,
  canRedo,
  selectedMarkerIndex,
  onPlayPause,
  onAddMarker,
  onRemoveMarker,
  onUndo,
  onRedo,
  onSave,
  onClose,
  sourceAudioFilename,
}) => {
  return (
    <div className="flex justify-between items-center mb-3 pb-3 border-b border-slate-700 flex-shrink-0">
      <div>
        <h2 className="text-2xl font-semibold text-slate-100">波形标记编辑器</h2>
        <p className="text-sm text-slate-400 truncate">{sourceAudioFilename}</p>
      </div>
      <div className="flex items-center gap-x-3">
        <button
          onClick={onPlayPause}
          disabled={isLoading}
          className="p-2 text-slate-300 hover:text-white disabled:opacity-50"
          title="播放/暂停 (空格)"
        >
          {isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
        </button>
        <div className="w-px h-6 bg-slate-600"></div>
        <button
          onClick={onAddMarker}
          disabled={isLoading}
          className="p-2 text-green-300 hover:text-green-100 disabled:opacity-30"
          title="在当前位置添加标记 (M)"
        >
          <PlusIcon className="w-5 h-5" />
        </button>
        <button
          onClick={onRemoveMarker}
          disabled={selectedMarkerIndex === null}
          className="p-2 text-red-300 hover:text-red-100 disabled:opacity-30 disabled:cursor-not-allowed"
          title="删除选中标记 (Delete/Backspace)"
        >
          <TrashIcon className="w-5 h-5" />
        </button>
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="p-2 text-slate-300 hover:text-white disabled:opacity-50"
          title="撤销"
        >
          <UndoIcon />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="p-2 text-slate-300 hover:text-white disabled:opacity-50"
          title="重做"
        >
          <RedoIcon />
        </button>
        <div className="w-px h-6 bg-slate-600"></div>
        <button
          onClick={onSave}
          className="flex items-center px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-md"
        >
          <SaveIcon className="w-4 h-4 mr-2" /> 保存并重新对齐
        </button>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-300 hover:text-white"
          title="关闭"
        >
          <XMarkIcon />
        </button>
      </div>
    </div>
  );
};
