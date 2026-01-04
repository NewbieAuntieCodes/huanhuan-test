import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';
import { useWaveSurferLocal } from '../hooks/useWaveSurferLocal';
import { WaveformZoomControl } from './WaveformZoomControl';
import { WaveformMarkers } from './WaveformMarkers';
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

export type LocalCalibrationLineStatus = 'inSource' | 'missing' | 'otherSource';

export interface LocalCalibrationWindowLine {
  id: string;
  text: string;
  characterName: string;
  status: LocalCalibrationLineStatus;
  isCurrent: boolean;
}

interface LocalWaveformDockPanelProps {
  isOpen: boolean;
  isSaving: boolean;
  isPreparing: boolean;
  errorMessage: string | null;
  sourceAudioInfo: { id: string; filename: string } | null;
  windowLines: LocalCalibrationWindowLine[];
  initialSkipLineIds: string[];
  markerRange: { min: number; max: number } | null;
  initialMarkers: number[];
  onClose: () => void;
  onSave: (args: { markers: number[]; skipLineIds: string[] }) => Promise<void> | void;
}

const clampText = (text: string, maxLen: number) => {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
};

const LocalWaveformDockPanel: React.FC<LocalWaveformDockPanelProps> = ({
  isOpen,
  isSaving,
  isPreparing,
  errorMessage,
  sourceAudioInfo,
  windowLines,
  initialSkipLineIds,
  markerRange,
  initialMarkers,
  onClose,
  onSave,
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);

  const [skipSet, setSkipSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) return;
    setSkipSet(new Set(initialSkipLineIds || []));
  }, [isOpen, initialSkipLineIds]);

  const {
    isLoading: isWaveLoading,
    error: waveError,
    isPanning,
    wavesurferState,
    historyState,
    markerState,
    interactionHandlers,
  } = useWaveSurferLocal({
    isOpen: isOpen && !!sourceAudioInfo,
    sourceAudioInfo: sourceAudioInfo || { id: '', filename: '' },
    initialMarkers,
    markerRange,
    refs: {
      waveformRef,
      timelineRef,
      scrollRef,
      contentRef,
    },
  });

  const windowSegmentCount = markerState.markers.length + 1;

  const lockedLineIds = useMemo(() => {
    return new Set(windowLines.filter((l) => l.status === 'otherSource').map((l) => l.id));
  }, [windowLines]);

  const orderedAssignableLineIds = useMemo(() => {
    return windowLines
      .filter((l) => !lockedLineIds.has(l.id))
      .filter((l) => !skipSet.has(l.id))
      .map((l) => l.id);
  }, [windowLines, lockedLineIds, skipSet]);

  const currentLineId = useMemo(() => windowLines.find((l) => l.isCurrent)?.id || null, [windowLines]);

  const localLineIndex = useMemo(() => {
    if (!currentLineId) return -1;
    return orderedAssignableLineIds.indexOf(currentLineId);
  }, [currentLineId, orderedAssignableLineIds]);

  const isCountMatch = orderedAssignableLineIds.length === windowSegmentCount;

  const toggleSkip = useCallback(
    (lineId: string) => {
      if (lockedLineIds.has(lineId)) return;
      setSkipSet((prev) => {
        const next = new Set(prev);
        if (next.has(lineId)) next.delete(lineId);
        else next.add(lineId);
        return next;
      });
    },
    [lockedLineIds],
  );

  const handleSave = useCallback(async () => {
    if (!isOpen || !sourceAudioInfo) return;
    if (isSaving) return;
    if (!isCountMatch) return;
    await onSave({ markers: markerState.markers, skipLineIds: Array.from(skipSet) });
  }, [isCountMatch, isOpen, isSaving, markerState.markers, onSave, skipSet, sourceAudioInfo]);

  if (!isOpen) return null;

  return (
    <aside className="w-[520px] flex-shrink-0 sticky top-4 self-start">
      <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-lg overflow-hidden flex flex-col max-h-[calc(100vh-7rem)]">
        <div className="px-4 py-3 border-b border-slate-700 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-slate-100">局部校准（当前±2句）</h3>
              <span className="text-xs text-slate-400 bg-slate-900/40 border border-slate-700 rounded px-2 py-0.5">
                只影响窗口内
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate">
              {sourceAudioInfo ? sourceAudioInfo.filename : '未选择音频'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleSave}
              disabled={isSaving || isPreparing || isWaveLoading || !isCountMatch}
              className="flex items-center px-3 py-1.5 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-md disabled:opacity-50"
              title={isCountMatch ? '保存局部校准' : '需满足：窗口片段数 = 未跳过行数'}
            >
              {isSaving ? (
                <LoadingSpinner />
              ) : (
                <>
                  <SaveIcon className="w-4 h-4 mr-1.5" /> 保存
                </>
              )}
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-white" title="关闭">
              <XMarkIcon />
            </button>
          </div>
        </div>

        {(errorMessage || waveError) && (
          <div className="px-4 py-2 text-sm text-red-300 bg-red-900/20 border-b border-red-900/30">
            {errorMessage || waveError}
          </div>
        )}

        <div className="px-4 py-3 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400">
              <span className="text-slate-200 font-semibold">窗口片段</span>：{windowSegmentCount}（标记 {markerState.markers.length}
              ）{' '}
              <span className="text-slate-500">|</span>{' '}
              <span className="text-slate-200 font-semibold">未跳过行</span>：{orderedAssignableLineIds.length}
            </div>
            {!isCountMatch && <div className="text-xs text-amber-300">需相等才能保存</div>}
          </div>

          <div className="mt-2 space-y-1">
            {windowLines.map((l) => {
              const isLocked = l.status === 'otherSource';
              const isSkipped = skipSet.has(l.id) || isLocked;
              const isCurrent = l.isCurrent;
              return (
                <div
                  key={l.id}
                  className={`flex items-center gap-2 px-2 py-1 rounded border ${
                    isCurrent ? 'border-sky-500/60 bg-sky-900/20' : 'border-slate-700 bg-slate-900/20'
                  }`}
                >
                  <label className={`flex items-center gap-2 select-none ${isLocked ? 'opacity-60' : ''}`}>
                    <input
                      type="checkbox"
                      checked={isSkipped}
                      onChange={() => toggleSkip(l.id)}
                      disabled={isLocked}
                      className="h-4 w-4 text-red-400 bg-slate-900 border-slate-600 rounded focus:ring-red-400 disabled:cursor-not-allowed"
                      aria-label={`跳过：${l.characterName}`}
                    />
                    <span className={`text-xs font-semibold ${isSkipped ? 'text-red-300' : 'text-slate-300'}`}>
                      × 跳过
                    </span>
                  </label>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-slate-400 truncate">
                      {l.characterName}
                      {isLocked ? '（已有其他音频）' : l.status === 'missing' ? '（未录到/未分配）' : ''}
                      {isCurrent ? ' · 当前' : ''}
                    </div>
                    <div className={`text-sm truncate ${isSkipped ? 'text-slate-500 line-through' : 'text-slate-100'}`}>
                      {clampText(l.text, 80)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            默认：未录到/非本音频的行自动打 ×。想把一段拆成多句：先取消需要的 ×，再用「+ / M」加标记。
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="px-4 py-2 border-b border-slate-700 flex items-center gap-2">
            <button
              onClick={interactionHandlers.handlePlayPause}
              disabled={isWaveLoading || isPreparing}
              className="p-2 text-slate-300 hover:text-white disabled:opacity-50"
              title="播放/暂停 (空格)"
            >
              {wavesurferState.isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
            </button>
            <div className="w-px h-6 bg-slate-700" />
            <button
              onClick={interactionHandlers.handleAddMarker}
              disabled={isWaveLoading || isPreparing}
              className="p-2 text-green-300 hover:text-green-100 disabled:opacity-30"
              title="添加标记 (M)"
            >
              <PlusIcon className="w-5 h-5" />
            </button>
            <button
              onClick={interactionHandlers.handleRemoveMarker}
              disabled={markerState.selectedMarkerIndex === null}
              className="p-2 text-red-300 hover:text-red-100 disabled:opacity-30 disabled:cursor-not-allowed"
              title="删除选中标记 (Delete/Backspace)"
            >
              <TrashIcon className="w-5 h-5" />
            </button>
            <button
              onClick={interactionHandlers.handleUndo}
              disabled={!historyState.canUndo}
              className="p-2 text-slate-300 hover:text-white disabled:opacity-50"
              title="撤销"
            >
              <UndoIcon />
            </button>
            <button
              onClick={interactionHandlers.handleRedo}
              disabled={!historyState.canRedo}
              className="p-2 text-slate-300 hover:text-white disabled:opacity-50"
              title="重做"
            >
              <RedoIcon />
            </button>
          </div>

          <WaveformZoomControl
            zoomLevel={wavesurferState.zoomLevel}
            onZoomChange={interactionHandlers.handleZoomChange}
            onResetZoom={() => interactionHandlers.handleZoomChange(1)}
          />

          <div ref={timelineRef} className="h-5 flex-shrink-0" />

          <div className="relative flex-grow" onClick={interactionHandlers.handleContainerClick}>
            {(isWaveLoading || isPreparing) && (
              <div className="absolute inset-0 bg-slate-800/80 flex items-center justify-center z-30">
                <LoadingSpinner />
              </div>
            )}

            <div
              ref={scrollRef}
              className={`absolute inset-0 overflow-x-auto overflow-y-hidden ${isPanning ? 'cursor-grabbing' : 'cursor-default'}`}
            >
              <div
                ref={contentRef}
                className="relative h-full"
                style={{ width: `${Math.max(0, wavesurferState.duration * wavesurferState.pxPerSec)}px` }}
                onMouseMove={interactionHandlers.handleContentMouseMove}
                onMouseLeave={interactionHandlers.handleContentMouseLeave}
              >
                <div ref={waveformRef} className="absolute inset-0 z-0" />

                {markerRange && wavesurferState.pxPerSec > 0 && (
                  <>
                    <div
                      className="absolute top-0 bottom-0 z-10 pointer-events-none"
                      style={{ left: `${markerRange.min * wavesurferState.pxPerSec}px` }}
                      title={`窗口开始：${markerState.formatTime(markerRange.min)}`}
                    >
                      <div className="w-[2px] h-full bg-fuchsia-400 opacity-80" />
                    </div>
                    <div
                      className="absolute top-0 bottom-0 z-10 pointer-events-none"
                      style={{ left: `${markerRange.max * wavesurferState.pxPerSec}px` }}
                      title={`窗口结束：${markerState.formatTime(markerRange.max)}`}
                    >
                      <div className="w-[2px] h-full bg-fuchsia-400 opacity-80" />
                    </div>
                  </>
                )}

                <WaveformMarkers
                  markers={markerState.markers}
                  pxPerSec={wavesurferState.pxPerSec}
                  duration={wavesurferState.duration}
                  localLineIndex={localLineIndex}
                  selectedMarkerIndex={markerState.selectedMarkerIndex}
                  mousePosition={markerState.mousePosition}
                  isDraggingMarker={markerState.isDraggingMarker}
                  onMarkerMouseDown={interactionHandlers.handleMarkerMouseDown}
                  formatTime={markerState.formatTime}
                />
              </div>
            </div>
          </div>

          <div className="px-4 py-2 text-[11px] text-slate-500 bg-slate-900/40 border-t border-slate-700">
            快捷键：空格播放/暂停，M 添加标记，Delete 删除选中标记；滚轮缩放，中键拖动平移。
          </div>
        </div>
      </div>
    </aside>
  );
};

export default LocalWaveformDockPanel;

