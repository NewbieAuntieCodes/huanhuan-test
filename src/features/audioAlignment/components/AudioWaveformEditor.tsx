import React, { useState, useEffect, useRef, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.js';
import { XMarkIcon, UndoIcon, RedoIcon, TrashIcon, SaveIcon, PlayIcon, PauseIcon, PlusIcon } from '../../../components/ui/icons';
import { db } from '../../../db';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';
import { useStore } from '../../../store/useStore';

const WAVE_BG_COLOR = '#334155';
const WAVE_PROGRESS_COLOR = '#38bdf8';
const PLAYHEAD_COLOR = '#f1f5f9';

interface AudioWaveformEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (sourceAudioId: string, markers: number[]) => void;
  sourceAudioInfo: { id: string; filename: string };
  currentLineId: string;
  currentLineIndex: number;
}

const formatTime = (t: number) => {
  if (!isFinite(t)) return '0:00.000';
  const sign = t < 0 ? '-' : '';
  t = Math.max(0, Math.abs(t));
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60).toString().padStart(2, '0');
  const ms = Math.floor((t * 1000) % 1000).toString().padStart(3, '0');
  return `${sign}${m}:${s}.${ms}`;
};

const AudioWaveformEditor: React.FC<AudioWaveformEditorProps> = ({ isOpen, onClose, onSave, sourceAudioInfo, currentLineId, currentLineIndex }) => {
  const { projects, selectedProjectId } = useStore(state => ({ projects: state.projects, selectedProjectId: state.selectedProjectId }));

  const timelineRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);

  const [markers, setMarkers] = useState<number[]>([]);
  const [history, setHistory] = useState<number[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedMarkerIndex, setSelectedMarkerIndex] = useState<number | null>(null);
  const [isDraggingMarker, setIsDraggingMarker] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [localLineIndex, setLocalLineIndex] = useState<number>(-1);
  const [isWavesurferReady, setIsWavesurferReady] = useState(false);
  const [mousePosition, setMousePosition] = useState<{ x: number; time: number } | null>(null);

  // 缩放相关
  const [duration, setDuration] = useState(0);
  const [pxPerSec, setPxPerSec] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1); // 缩放级别，1 = 适应容器宽度

  // 计算当前行在该音频中的局部索引（仅使用同一 sourceAudio 的行）
  useEffect(() => {
    const calculateLocalIndex = async () => {
      const currentProject = projects.find(p => p.id === selectedProjectId);
      if (!currentProject) return;

      // 保持脚本顺序，先收集所有有音频的行及其 blobId
      const lineWithBlobIds: { lineId: string; blobId: string }[] = [];
      for (const chapter of currentProject.chapters) {
        for (const line of chapter.scriptLines) {
          if (line.audioBlobId) {
            lineWithBlobIds.push({ lineId: line.id, blobId: line.audioBlobId });
          }
        }
      }

      if (lineWithBlobIds.length === 0) {
        setLocalLineIndex(-1);
        return;
      }

      // 一次性批量读取，减少 IndexedDB 开销
      const blobs = await db.audioBlobs.bulkGet(lineWithBlobIds.map(l => l.blobId));
      const validLineIds = new Set(
        blobs
          .map((b, i) => (b && b.sourceAudioId === sourceAudioInfo.id ? lineWithBlobIds[i].lineId : null))
          .filter((v): v is string => !!v)
      );

      const orderedLines = lineWithBlobIds
        .filter(l => validLineIds.has(l.lineId))
        .map(l => ({ lineId: l.lineId }));

      setLocalLineIndex(orderedLines.findIndex(item => item.lineId === currentLineId));
    };
    if (currentLineId && sourceAudioInfo.id) calculateLocalIndex();
  }, [currentLineId, sourceAudioInfo.id, projects, selectedProjectId, currentLineIndex]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  const pushToHistory = useCallback((newState: number[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newState);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  useEffect(() => {
    if (!(isOpen && waveformRef.current && timelineRef.current)) return;
    setIsLoading(true);
    setError(null);

    // 创建低延迟的 AudioContext
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      latencyHint: 'interactive', // 使用低延迟模式
      sampleRate: 48000, // 使用较高的采样率
    });

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: WAVE_BG_COLOR,
      progressColor: WAVE_PROGRESS_COLOR,
      cursorColor: PLAYHEAD_COLOR,
      barWidth: 2,
      barRadius: 2,
      height: 200,
      interact: true,
      fillParent: true,
      minPxPerSec: 1,
      // 优化音频同步
      audioRate: 1,
      backend: 'WebAudio',
      normalize: false, // 禁用标准化以减少处理延迟
      audioContext: audioContext, // 使用自定义的低延迟 AudioContext
      plugins: [
        TimelinePlugin.create({
          container: timelineRef.current!,
          primaryColor: '#e2e8f0',
          secondaryColor: '#94a3b8',
          primaryFontColor: '#cbd5e1',
          secondaryFontColor: '#94a3b8',
        })
      ]
    });
    wavesurferRef.current = ws;

    const loadAudioAndMarkers = async () => {
      try {
        const masterAudio = await db.masterAudios.get(sourceAudioInfo.id);
        if (!masterAudio) throw new Error('母带音频未找到');
        void ws.loadBlob(masterAudio.data);

        const customMarkers = await db.audioMarkers.get(sourceAudioInfo.id);
        let initialMarkers: number[] = [];
        if (customMarkers && customMarkers.markers.length > 0) {
          initialMarkers = customMarkers.markers;
        } else {
          const currentProject = projects.find(p => p.id === selectedProjectId);
          if (!currentProject) throw new Error('当前项目未找到');
          // 收集脚本顺序的所有音频行并批量读取，再筛选同一母带音频
          const lineWithBlobIds: { lineId: string; audioBlobId: string }[] = [];
          for (const chapter of currentProject.chapters) {
            for (const line of chapter.scriptLines) {
              if (line.audioBlobId) lineWithBlobIds.push({ lineId: line.id, audioBlobId: line.audioBlobId });
            }
          }
          const blobs = await db.audioBlobs.bulkGet(lineWithBlobIds.map(l => l.audioBlobId));
          const orderedLines = lineWithBlobIds.filter((l, i) => blobs[i]?.sourceAudioId === sourceAudioInfo.id);
          if (orderedLines.length > 1) {
            // 使用 <audio> 读取 metadata 获取时长，比 decodeAudioData 更快更省资源
            const getDuration = (blob: Blob) => new Promise<number>((resolve) => {
              try {
                const url = URL.createObjectURL(blob);
                const audioEl = new Audio();
                const cleanup = () => { URL.revokeObjectURL(url); };
                audioEl.preload = 'metadata';
                audioEl.src = url;
                const onLoaded = () => { const d = isFinite(audioEl.duration) ? audioEl.duration : 0; cleanup(); resolve(d || 0); };
                const onError = () => { cleanup(); resolve(0); };
                audioEl.addEventListener('loadedmetadata', onLoaded, { once: true });
                audioEl.addEventListener('error', onError, { once: true });
              } catch {
                resolve(0);
              }
            });

            const blobsToMeasure = await db.audioBlobs.bulkGet(orderedLines.map(l => l.audioBlobId));
            const durations: number[] = await Promise.all(
              blobsToMeasure.map(b => (b ? getDuration(b.data) : Promise.resolve(0)))
            );
            initialMarkers = [];
            let cumulativeTime = 0;
            for (let i = 0; i < durations.length - 1; i++) {
              cumulativeTime += durations[i];
              initialMarkers.push(cumulativeTime);
            }
          }
        }
        setMarkers(initialMarkers);
        setHistory([initialMarkers]);
        setHistoryIndex(0);
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载音频失败');
        setIsLoading(false);
      }
    };

    loadAudioAndMarkers();

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('finish', () => setIsPlaying(false));
    ws.on('ready', () => {
      setDuration(ws.getDuration());
      setIsWavesurferReady(true);
      setIsLoading(false);
    });
    ws.on('click', (relativePos: number) => {
      ws.seekTo(relativePos);
      if (!isDraggingMarker) setSelectedMarkerIndex(null);
    });

    return () => {
      ws.destroy();
      // 关闭 audioContext 以释放资源
      if (audioContext.state !== 'closed') {
        audioContext.close();
      }
      wavesurferRef.current = null;
      setIsWavesurferReady(false);
      setDuration(0);
      setPxPerSec(0);
    };
  }, [isOpen, sourceAudioInfo.id, projects, selectedProjectId]);

  // 计算缩放倍率：根据 zoomLevel 和容器宽度
  useEffect(() => {
    if (!wavesurferRef.current || !scrollRef.current || duration <= 0) return;

    const containerWidth = scrollRef.current.clientWidth || 1;
    // 基础 pxPerSec：让整个音频适配容器宽度
    const basePxPerSec = containerWidth / duration;
    // 应用缩放级别
    const computedPxPerSec = basePxPerSec * zoomLevel;
    setPxPerSec(computedPxPerSec);
  }, [duration, zoomLevel]);

  // 应用缩放倍率到 WaveSurfer
  useEffect(() => {
    if (wavesurferRef.current && isWavesurferReady && pxPerSec > 0) {
      try {
        wavesurferRef.current.zoom(pxPerSec);
      } catch (err) {
        console.error('Zoom error:', err);
      }
    }
  }, [pxPerSec, isWavesurferReady]);

  // 键盘快捷键
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (wavesurferRef.current) wavesurferRef.current.playPause();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        if (wavesurferRef.current) {
          const currentTime = wavesurferRef.current.getCurrentTime();
          const newMarkers = [...markers, currentTime].sort((a, b) => a - b);
          setMarkers(newMarkers);
          pushToHistory(newMarkers);
        }
      } else if ((e.code === 'Delete' || e.code === 'Backspace') && selectedMarkerIndex !== null) {
        e.preventDefault();
        handleRemoveMarker(selectedMarkerIndex);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, markers, selectedMarkerIndex, pushToHistory]);

  // 鼠标滚轮缩放功能（以鼠标位置为中心）
  useEffect(() => {
    if (!isOpen || !scrollRef.current) return;

    const scrollContainer = scrollRef.current;

    const handleWheel = (e: WheelEvent) => {
      // 检查鼠标是否在波形区域
      if (!contentRef.current || pxPerSec <= 0) return;

      e.preventDefault();

      // 获取鼠标相对于容器的位置
      const rect = scrollContainer.getBoundingClientRect();
      const mouseXRelativeToViewport = e.clientX - rect.left;

      // 计算鼠标当前指向的时间点
      const currentScrollLeft = scrollContainer.scrollLeft;
      const mouseTimeBeforeZoom = (currentScrollLeft + mouseXRelativeToViewport) / pxPerSec;

      // 计算新的缩放级别（增大缩放幅度）
      const zoomDelta = e.deltaY > 0 ? 0.8 : 1.25; // 向下滚动缩小，向上滚动放大
      const newZoomLevel = Math.max(0.1, Math.min(50, zoomLevel * zoomDelta));

      setZoomLevel(newZoomLevel);

      // 在下一帧更新滚动位置，确保 pxPerSec 已更新
      requestAnimationFrame(() => {
        if (!scrollRef.current || !contentRef.current) return;

        // 重新计算 pxPerSec
        const containerWidth = scrollRef.current.clientWidth || 1;
        const basePxPerSec = containerWidth / duration;
        const newPxPerSec = basePxPerSec * newZoomLevel;

        // 计算新的滚动位置，使鼠标指向的时间点保持在相同的视觉位置
        const newScrollLeft = mouseTimeBeforeZoom * newPxPerSec - mouseXRelativeToViewport;
        scrollRef.current.scrollLeft = Math.max(0, newScrollLeft);
      });
    };

    scrollContainer.addEventListener('wheel', handleWheel, { passive: false });
    return () => scrollContainer.removeEventListener('wheel', handleWheel);
  }, [isOpen, pxPerSec, zoomLevel, duration]);

  // 鼠标中键拖动功能（模仿 Audition）
  useEffect(() => {
    if (!isOpen || !scrollRef.current) return;

    const scrollContainer = scrollRef.current;

    const handleMouseDown = (e: MouseEvent) => {
      // 检测中键按下
      if (e.button === 1) {
        e.preventDefault();
        setIsPanning(true);

        const startX = e.clientX;
        const startScrollLeft = scrollContainer.scrollLeft;

        const handleMouseMove = (me: MouseEvent) => {
          const dx = startX - me.clientX; // 注意方向：鼠标向左移动，内容向右滚动
          scrollContainer.scrollLeft = startScrollLeft + dx;
        };

        const handleMouseUp = () => {
          setIsPanning(false);
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
      }
    };

    scrollContainer.addEventListener('mousedown', handleMouseDown);
    return () => scrollContainer.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen]);

  const handleRemoveMarker = (index: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const newMarkers = markers.filter((_, i) => i !== index);
    setMarkers(newMarkers);
    pushToHistory(newMarkers);
    setSelectedMarkerIndex(null);
  };

  const handleSave = () => onSave(sourceAudioInfo.id, markers);
  const handleUndo = () => { if (canUndo) { const i = historyIndex - 1; setHistoryIndex(i); setMarkers(history[i]); } };
  const handleRedo = () => { if (canRedo) { const i = historyIndex + 1; setHistoryIndex(i); setMarkers(history[i]); } };
  const handlePlayPause = () => { if (wavesurferRef.current) wavesurferRef.current.playPause(); };
  const handleAddMarker = () => { if (wavesurferRef.current) { const t = wavesurferRef.current.getCurrentTime(); const ms = [...markers, t].sort((a, b) => a - b); setMarkers(ms); pushToHistory(ms); } };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-85 flex items-center justify-center z-[110] p-4">
      <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col border border-slate-700">
        <div className="flex justify-between items-center mb-3 pb-3 border-b border-slate-700 flex-shrink-0">
          <div>
            <h2 className="text-2xl font-semibold text-slate-100">波形标记编辑器</h2>
            <p className="text-sm text-slate-400 truncate">{sourceAudioInfo.filename}</p>
          </div>
          <div className="flex items-center gap-x-3">
            <button onClick={handlePlayPause} disabled={isLoading} className="p-2 text-slate-300 hover:text-white disabled:opacity-50" title="播放/暂停 (空格)">{isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}</button>
            <div className="w-px h-6 bg-slate-600"></div>
            <button onClick={handleAddMarker} disabled={isLoading} className="p-2 text-green-300 hover:text-green-100 disabled:opacity-30" title="在当前位置添加标记 (M)"><PlusIcon className="w-5 h-5" /></button>
            <button onClick={() => selectedMarkerIndex !== null && handleRemoveMarker(selectedMarkerIndex)} disabled={selectedMarkerIndex === null} className="p-2 text-red-300 hover:text-red-100 disabled:opacity-30 disabled:cursor-not-allowed" title="删除选中标记 (Delete/Backspace)"><TrashIcon className="w-5 h-5" /></button>
            <button onClick={handleUndo} disabled={!canUndo} className="p-2 text-slate-300 hover:text-white disabled:opacity-50" title="撤销"><UndoIcon /></button>
            <button onClick={handleRedo} disabled={!canRedo} className="p-2 text-slate-300 hover:text-white disabled:opacity-50" title="重做"><RedoIcon /></button>
            <div className="w-px h-6 bg-slate-600"></div>
            <button onClick={handleSave} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-md"><SaveIcon className="w-4 h-4 mr-2" /> 保存并重新对齐</button>
            <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-white" title="关闭"><XMarkIcon /></button>
          </div>
        </div>

        <div className="flex-grow flex flex-col relative overflow-hidden">
          {isLoading && <div className="absolute inset-0 bg-slate-800/80 flex items-center justify-center z-20"><LoadingSpinner /></div>}
          {error && <div className="absolute inset-0 bg-slate-800/80 flex items-center justify-center text-red-400 z-20">{error}</div>}

          {/* 缩放滑块 - 模仿 Audition 位置 */}
          <div className="flex items-center gap-x-3 px-4 py-1.5 bg-slate-900/50 border-b border-slate-700 flex-shrink-0">
            <span className="text-xs text-slate-400 whitespace-nowrap">缩放:</span>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.log(zoomLevel) / Math.log(50) * 100}
              onChange={(e) => {
                const value = parseFloat(e.target.value);
                // 使用对数刻度：0-100 映射到 0.1-50
                const newZoomLevel = Math.pow(50, value / 100);
                setZoomLevel(newZoomLevel);
              }}
              className="flex-grow h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer slider"
              style={{
                background: `linear-gradient(to right, #38bdf8 0%, #38bdf8 ${Math.log(zoomLevel) / Math.log(50) * 100}%, #475569 ${Math.log(zoomLevel) / Math.log(50) * 100}%, #475569 100%)`
              }}
            />
            <span className="text-xs text-slate-300 font-mono whitespace-nowrap w-12 text-right">
              {zoomLevel.toFixed(1)}x
            </span>
            <button
              onClick={() => setZoomLevel(1)}
              className="text-xs px-2 py-1 text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded transition-colors"
              title="重置缩放"
            >
              重置
            </button>
          </div>

          <div ref={timelineRef} className="h-5 flex-shrink-0"></div>

          {/* 细节视图：保持放大倍率，水平滑动可浏览 */}
          <div className="relative flex-grow" onClick={(e) => { if (!isDraggingMarker && e.target === e.currentTarget) setSelectedMarkerIndex(null); }}>
            <div
              ref={scrollRef}
              className={`absolute inset-0 overflow-x-auto overflow-y-hidden ${isPanning ? 'cursor-grabbing' : 'cursor-default'}`}
            >
              <div
                ref={contentRef}
                className="relative h-full"
                style={{ width: `${Math.max(0, duration * pxPerSec)}px` }}
                onMouseMove={(e) => {
                  if (contentRef.current && pxPerSec > 0) {
                    const rect = contentRef.current.getBoundingClientRect();
                    const offset = (scrollRef.current?.scrollLeft || 0);
                    const x = e.clientX - rect.left + offset;
                    const time = x / pxPerSec;
                    if (time >= 0 && time <= duration) {
                      setMousePosition({ x, time });
                    }
                  }
                }}
                onMouseLeave={() => setMousePosition(null)}
              >
                <div ref={waveformRef} className="absolute inset-0 z-0" />

                {/* Mouse cursor helper line */}
                {mousePosition && !isDraggingMarker && (
                  <div
                    className="absolute top-0 bottom-0 pointer-events-none z-20"
                    style={{ left: `${mousePosition.x}px` }}
                  >
                    <div className="w-px h-full bg-cyan-400 opacity-50" />
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-cyan-400 rounded-full" />
                    <div className="absolute top-4 left-2 text-xs px-2 py-0.5 rounded whitespace-nowrap bg-cyan-500 text-white shadow-lg">
                      {formatTime(mousePosition.time)}
                    </div>
                  </div>
                )}

                {markers.map((time, index) => {
                  const leftPx = Math.max(0, (time || 0) * (pxPerSec || 1));
                  const isStartMarker = localLineIndex > 0 && index === localLineIndex - 1;
                  const isEndMarker = index === localLineIndex;
                  const isHighlighted = isStartMarker || isEndMarker;
                  const isSelected = selectedMarkerIndex === index;

                  // Determine line and marker head styles - 保持原本颜色
                  let lineColor = '#64748b';
                  let markerColor = '#64748b';

                  if (isHighlighted) {
                    lineColor = isStartMarker ? '#3b82f6' : '#eab308';
                    markerColor = isStartMarker ? '#3b82f6' : '#eab308';
                  }

                  return (
                    <div
                      key={index}
                      style={{
                        left: `${leftPx}px`,
                      }}
                      className={`absolute top-0 bottom-0 z-20 group`}
                    >
                      {/* Vertical line - 高亮线用实线，其他用虚线 */}
                      <div
                        style={{
                          borderLeft: isHighlighted ? `2px solid ${lineColor}` : `1px dashed ${lineColor}`,
                        }}
                        className="absolute top-0 bottom-0 w-0 pointer-events-none"
                      />
                      {/* Top marker head - circle button - this is clickable and draggable */}
                      {/* 外层：扩大可点击区域 */}
                      <div
                        className="absolute top-0 left-1/2 -translate-x-1/2 cursor-grab active:cursor-grabbing"
                        style={{
                          width: '24px',
                          height: '24px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        onMouseDown={(e) => {
                          if (e.button === 0) {
                            e.stopPropagation();
                            e.preventDefault();

                            // 记录起始位置
                            const startX = e.clientX;
                            const startY = e.clientY;
                            setDragStartPos({ x: startX, y: startY });

                            let hasMoved = false;
                            let currentMarkers = [...markers];

                            const handleMouseMove = (me: MouseEvent) => {
                              const dx = Math.abs(me.clientX - startX);
                              const dy = Math.abs(me.clientY - startY);

                              // 移动超过 5px 才算拖动
                              if (dx > 5 || dy > 5) {
                                if (!hasMoved) {
                                  hasMoved = true;
                                  setIsDraggingMarker(true);
                                  setSelectedMarkerIndex(index);
                                }
                              }

                              if (hasMoved && contentRef.current && pxPerSec > 0) {
                                const rect = contentRef.current.getBoundingClientRect();
                                const offset = (scrollRef.current?.scrollLeft || 0);
                                const x = me.clientX - rect.left + offset;
                                const newTime = Math.max(0, Math.min(duration, x / pxPerSec));

                                currentMarkers = [...markers];
                                currentMarkers[index] = newTime;
                                currentMarkers.sort((a, b) => a - b);
                                setMarkers(currentMarkers);
                              }
                            };

                            const handleMouseUp = () => {
                              setDragStartPos(null);

                              if (hasMoved) {
                                // 拖动完成，保存到历史
                                setIsDraggingMarker(false);
                                pushToHistory(currentMarkers);
                              } else {
                                // 没有移动，就是点击选中
                                setSelectedMarkerIndex(prev => prev === index ? null : index);
                              }

                              document.removeEventListener('mousemove', handleMouseMove);
                              document.removeEventListener('mouseup', handleMouseUp);
                            };

                            document.addEventListener('mousemove', handleMouseMove);
                            document.addEventListener('mouseup', handleMouseUp);
                          }
                        }}
                        title={`标记 ${index + 1} - 时间: ${formatTime(time)}\n点击选择，拖动移动`}
                      >
                        {/* 内层：实际的圆形标记 */}
                        <div
                          className={`transition-all ${
                            isSelected
                              ? 'w-4 h-4'
                              : isHighlighted
                                ? 'w-3.5 h-3.5 animate-pulse'
                                : 'w-3.5 h-3.5 group-hover:w-4 group-hover:h-4'
                          }`}
                          style={{
                            backgroundColor: markerColor,
                            borderRadius: '50%',
                            // 灰色标记不要边框，高亮和选中的有边框
                            border: isSelected ? '3px solid white' : (isHighlighted ? '2px solid white' : 'none'),
                            boxShadow: isSelected ? '0 0 12px 4px rgba(255,255,255,0.6)' : (isHighlighted ? '0 2px 4px rgba(0,0,0,0.3)' : 'none'),
                          }}
                        />
                      </div>
                      {/* Time label for selected or highlighted marker */}
                      {(isSelected || isHighlighted) && (
                        <div className={`absolute top-7 left-2 text-xs px-2 py-0.5 rounded whitespace-nowrap pointer-events-none shadow-lg ${
                          isHighlighted
                            ? (isStartMarker ? 'bg-blue-500 text-white' : 'bg-yellow-500 text-white')
                            : 'bg-slate-500 text-white'
                        }`}>
                          {formatTime(time)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-500 mt-2 text-center space-y-1 bg-slate-900/50 p-2 rounded">
            <p className="flex items-center justify-center gap-x-4 flex-wrap">
              <span className="font-semibold text-slate-300">快捷键:</span>
              <span>空格：播放/暂停</span>
              <span className="text-slate-400">|</span>
              <span>M键 / + 按钮：添加标记</span>
              <span className="text-slate-400">|</span>
              <span>Delete / Backspace：删除选中标记</span>
            </p>
            <p className="flex items-center justify-center gap-x-4 flex-wrap">
              <span className="font-semibold text-slate-300">操作:</span>
              <span>点击标记头选择</span>
              <span className="text-slate-400">|</span>
              <span>拖拽标记头移动位置</span>
              <span className="text-slate-400">|</span>
              <span>鼠标滚轮缩放波形</span>
              <span className="text-slate-400">|</span>
              <span>按住鼠标中键拖动页面</span>
            </p>
            <p className="flex items-center justify-center gap-x-4 flex-wrap">
              <span className="font-semibold text-slate-300">标记颜色:</span>
              <span className="flex items-center"><span className="inline-block mr-1 w-3 h-3 rounded-full bg-blue-500 border-2 border-white"></span>蓝色 = 当前行开始</span>
              <span className="flex items-center"><span className="inline-block mr-1 w-3 h-3 rounded-full bg-yellow-500 border-2 border-white"></span>黄色 = 当前行结束</span>
              <span className="flex items-center"><span className="inline-block mr-1 w-3 h-3 rounded-full bg-slate-400 border-2 border-white"></span>灰色 = 其他标记</span>
              <span className="flex items-center"><span className="inline-block mr-1 w-3 h-3 rounded-full bg-slate-500 border-2 border-white shadow-[0_0_8px_2px_rgba(255,255,255,0.6)]"></span>白色光晕 = 已选中</span>
              <span className="flex items-center"><span className="inline-block mr-1 w-px h-4 bg-cyan-400"></span>青色 = 鼠标定位线</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioWaveformEditor;
