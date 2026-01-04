import React, { useCallback, useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.js';
import { db } from '../../../db';

const WAVE_BG_COLOR = '#334155';
const WAVE_PROGRESS_COLOR = '#38bdf8';
const PLAYHEAD_COLOR = '#f1f5f9';

const formatTime = (t: number) => {
  if (!isFinite(t)) return '0:00.000';
  const sign = t < 0 ? '-' : '';
  t = Math.max(0, Math.abs(t));
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60)
    .toString()
    .padStart(2, '0');
  const ms = Math.floor((t * 1000) % 1000)
    .toString()
    .padStart(3, '0');
  return `${sign}${m}:${s}.${ms}`;
};

const toSortedUnique = (arr: number[]) => {
  const out = (arr || []).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const dedup: number[] = [];
  for (const n of out) {
    if (dedup.length === 0 || Math.abs(dedup[dedup.length - 1] - n) > 1e-6) dedup.push(n);
  }
  return dedup;
};

interface UseWaveSurferLocalProps {
  isOpen: boolean;
  sourceAudioInfo: { id: string; filename: string };
  initialMarkers: number[];
  markerRange: { min: number; max: number } | null;
  refs: {
    waveformRef: React.RefObject<HTMLDivElement>;
    timelineRef: React.RefObject<HTMLDivElement>;
    scrollRef: React.RefObject<HTMLDivElement>;
    contentRef: React.RefObject<HTMLDivElement>;
  };
}

export const useWaveSurferLocal = ({ isOpen, sourceAudioInfo, initialMarkers, markerRange, refs }: UseWaveSurferLocalProps) => {
  const { waveformRef, timelineRef, scrollRef, contentRef } = refs;
  const wavesurferRef = useRef<WaveSurfer | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const [wavesurferState, setWavesurferState] = useState({
    isPlaying: false,
    duration: 0,
    pxPerSec: 0,
    zoomLevel: 1,
    isReady: false,
  });

  const [historyState, setHistoryState] = useState<{
    history: number[][];
    index: number;
    canUndo: boolean;
    canRedo: boolean;
  }>({ history: [], index: -1, canUndo: false, canRedo: false });

  const [markerState, setMarkerState] = useState<{
    markers: number[];
    selectedMarkerIndex: number | null;
    isDraggingMarker: boolean;
    mousePosition: { x: number; time: number } | null;
  }>({
    markers: [],
    selectedMarkerIndex: null,
    isDraggingMarker: false,
    mousePosition: null,
  });

  const pushToHistory = useCallback((newState: number[]) => {
    setHistoryState((prev) => {
      const nextHistory = prev.history.slice(0, prev.index + 1);
      nextHistory.push(newState);
      const newIndex = nextHistory.length - 1;
      return { history: nextHistory, index: newIndex, canUndo: newIndex > 0, canRedo: false };
    });
    setMarkerState((prev) => ({ ...prev, markers: newState }));
  }, []);

  // Apply initial markers when opened / updated
  useEffect(() => {
    if (!isOpen) return;
    const next = toSortedUnique(initialMarkers || []);
    setMarkerState((prev) => ({ ...prev, markers: next, selectedMarkerIndex: null }));
    setHistoryState({ history: [next], index: 0, canUndo: false, canRedo: false });
  }, [isOpen, initialMarkers]);

  // WaveSurfer instance lifecycle
  useEffect(() => {
    if (!(isOpen && waveformRef.current && timelineRef.current)) return;
    setIsLoading(true);
    setError(null);

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      latencyHint: 'interactive',
      sampleRate: 48000,
    });
    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: WAVE_BG_COLOR,
      progressColor: WAVE_PROGRESS_COLOR,
      cursorColor: PLAYHEAD_COLOR,
      barWidth: 2,
      barRadius: 2,
      height: 160,
      interact: true,
      fillParent: true,
      minPxPerSec: 1,
      audioRate: 1,
      backend: 'WebAudio',
      normalize: false,
      // @ts-ignore
      audioContext: audioContext,
      plugins: [TimelinePlugin.create({ container: timelineRef.current! })],
    });
    wavesurferRef.current = ws;

    const loadAudio = async () => {
      try {
        const masterAudio = await db.masterAudios.get(sourceAudioInfo.id);
        if (!masterAudio) throw new Error('母带音频未找到');
        void ws.loadBlob(masterAudio.data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : '加载音频失败');
      } finally {
        setIsLoading(false);
      }
    };
    void loadAudio();

    ws.on('play', () => setWavesurferState((prev) => ({ ...prev, isPlaying: true })));
    ws.on('pause', () => setWavesurferState((prev) => ({ ...prev, isPlaying: false })));
    ws.on('finish', () => setWavesurferState((prev) => ({ ...prev, isPlaying: false })));
    ws.on('ready', () => {
      setWavesurferState((prev) => ({ ...prev, duration: ws.getDuration(), isReady: true }));
      setIsLoading(false);
    });
    ws.on('click', (relativePos: number) => {
      ws.seekTo(relativePos);
      if (!markerState.isDraggingMarker) setMarkerState((prev) => ({ ...prev, selectedMarkerIndex: null }));
    });

    return () => {
      ws.destroy();
      if (audioContext.state !== 'closed') void audioContext.close();
      wavesurferRef.current = null;
      setWavesurferState((prev) => ({ ...prev, isReady: false, duration: 0, pxPerSec: 0 }));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sourceAudioInfo.id]);

  // Zoom logic (same as the global editor)
  useEffect(() => {
    if (!wavesurferRef.current || !scrollRef.current || wavesurferState.duration <= 0) return;
    const containerWidth = scrollRef.current.clientWidth || 1;
    const basePxPerSec = containerWidth / wavesurferState.duration;
    const computedPxPerSec = basePxPerSec * wavesurferState.zoomLevel;
    setWavesurferState((prev) => ({ ...prev, pxPerSec: computedPxPerSec }));
  }, [wavesurferState.duration, wavesurferState.zoomLevel, scrollRef]);

  useEffect(() => {
    if (wavesurferRef.current && wavesurferState.isReady && wavesurferState.pxPerSec > 0) {
      try {
        wavesurferRef.current.zoom(wavesurferState.pxPerSec);
      } catch (err) {
        console.error('Zoom error:', err);
      }
    }
  }, [wavesurferState.pxPerSec, wavesurferState.isReady]);

  const clampMarkerTime = useCallback(
    (t: number) => {
      if (!markerRange) return Math.max(0, Math.min(wavesurferState.duration, t));
      const EPS = 1e-3;
      return Math.max(markerRange.min + EPS, Math.min(markerRange.max - EPS, t));
    },
    [markerRange, wavesurferState.duration],
  );

  // Auto zoom+scroll to the window range
  useEffect(() => {
    if (!isOpen) return;
    if (!markerRange) return;
    if (!wavesurferState.isReady || wavesurferState.duration <= 0) return;
    const rangeDur = Math.max(0.01, markerRange.max - markerRange.min);
    const fitZoom = Math.max(0.2, Math.min(50, wavesurferState.duration / rangeDur));
    setWavesurferState((prev) => ({ ...prev, zoomLevel: fitZoom }));
  }, [isOpen, markerRange, wavesurferState.isReady, wavesurferState.duration]);

  useEffect(() => {
    if (!isOpen) return;
    if (!markerRange) return;
    if (!scrollRef.current) return;
    if (wavesurferState.pxPerSec <= 0) return;
    requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      scrollRef.current.scrollLeft = Math.max(0, markerRange.min * wavesurferState.pxPerSec - 40);
    });
  }, [isOpen, markerRange, wavesurferState.pxPerSec]);

  // Interaction handlers
  const handlePlayPause = useCallback(() => wavesurferRef.current?.playPause(), []);

  const handleAddMarker = useCallback(() => {
    if (!wavesurferRef.current) return;
    const t = wavesurferRef.current.getCurrentTime();
    const next = clampMarkerTime(t);
    if (markerRange) {
      const EPS = 1e-3;
      if (!(next > markerRange.min + EPS && next < markerRange.max - EPS)) return;
    }
    pushToHistory(toSortedUnique([...markerState.markers, next]));
  }, [clampMarkerTime, markerRange, markerState.markers, pushToHistory]);

  const handleRemoveMarker = useCallback(() => {
    if (markerState.selectedMarkerIndex === null) return;
    pushToHistory(markerState.markers.filter((_, i) => i !== markerState.selectedMarkerIndex));
    setMarkerState((prev) => ({ ...prev, selectedMarkerIndex: null }));
  }, [markerState.markers, markerState.selectedMarkerIndex, pushToHistory]);

  const handleUndo = useCallback(() => {
    if (!historyState.canUndo) return;
    const newIndex = historyState.index - 1;
    setHistoryState((prev) => ({ ...prev, index: newIndex, canUndo: newIndex > 0, canRedo: true }));
    setMarkerState((prev) => ({ ...prev, markers: historyState.history[newIndex] }));
  }, [historyState.canUndo, historyState.index, historyState.history]);

  const handleRedo = useCallback(() => {
    if (!historyState.canRedo) return;
    const newIndex = historyState.index + 1;
    setHistoryState((prev) => ({ ...prev, index: newIndex, canUndo: true, canRedo: newIndex < prev.history.length - 1 }));
    setMarkerState((prev) => ({ ...prev, markers: historyState.history[newIndex] }));
  }, [historyState.canRedo, historyState.index, historyState.history]);

  const handleZoomChange = useCallback((level: number) => setWavesurferState((prev) => ({ ...prev, zoomLevel: level })), []);

  // Mouse and Keyboard interactions
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayPause();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        handleAddMarker();
      } else if ((e.code === 'Delete' || e.code === 'Backspace') && markerState.selectedMarkerIndex !== null) {
        e.preventDefault();
        handleRemoveMarker();
      }
    };
    const scrollContainer = scrollRef.current;
    const handleWheel = (e: WheelEvent) => {
      if (!contentRef.current || wavesurferState.pxPerSec <= 0 || !scrollContainer) return;
      e.preventDefault();
      const rect = scrollContainer.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseTime = (scrollContainer.scrollLeft + mouseX) / wavesurferState.pxPerSec;
      const newZoomLevel = Math.max(0.1, Math.min(50, wavesurferState.zoomLevel * (e.deltaY > 0 ? 0.8 : 1.25)));
      setWavesurferState((prev) => ({ ...prev, zoomLevel: newZoomLevel }));
      requestAnimationFrame(() => {
        const newPxPerSec = (scrollContainer.clientWidth / wavesurferState.duration) * newZoomLevel;
        scrollContainer.scrollLeft = Math.max(0, mouseTime * newPxPerSec - mouseX);
      });
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 1 && scrollContainer) {
        e.preventDefault();
        setIsPanning(true);
        const startX = e.clientX;
        const startScrollLeft = scrollContainer.scrollLeft;
        const handleMouseMove = (me: MouseEvent) => {
          scrollContainer.scrollLeft = startScrollLeft + (startX - me.clientX);
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

    window.addEventListener('keydown', handleKeyDown);
    if (scrollContainer) {
      scrollContainer.addEventListener('wheel', handleWheel, { passive: false });
      scrollContainer.addEventListener('mousedown', handleMouseDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (scrollContainer) {
        scrollContainer.removeEventListener('wheel', handleWheel);
        scrollContainer.removeEventListener('mousedown', handleMouseDown);
      }
    };
  }, [
    isOpen,
    handlePlayPause,
    handleAddMarker,
    handleRemoveMarker,
    markerState.selectedMarkerIndex,
    scrollRef,
    contentRef,
    wavesurferState.pxPerSec,
    wavesurferState.zoomLevel,
    wavesurferState.duration,
  ]);

  // Marker drag logic
  const handleMarkerMouseDown = useCallback(
    (e: React.MouseEvent, index: number) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();

      let hasMoved = false;
      let currentMarkers = [...markerState.markers];

      const handleMouseMove = (me: MouseEvent) => {
        if (!hasMoved) {
          hasMoved = true;
          setMarkerState((prev) => ({ ...prev, isDraggingMarker: true, selectedMarkerIndex: index }));
        }
        if (contentRef.current && wavesurferState.pxPerSec > 0) {
          const rect = contentRef.current.getBoundingClientRect();
          const offset = scrollRef.current?.scrollLeft || 0;
          const x = me.clientX - rect.left + offset;
          const rawTime = x / wavesurferState.pxPerSec;
          const newTime = clampMarkerTime(Math.max(0, Math.min(wavesurferState.duration, rawTime)));

          currentMarkers = [...markerState.markers];
          currentMarkers[index] = newTime;
          currentMarkers = toSortedUnique(currentMarkers);
          setMarkerState((prev) => ({ ...prev, markers: currentMarkers }));
        }
      };

      const handleMouseUp = () => {
        if (hasMoved) {
          pushToHistory(currentMarkers);
        } else {
          setMarkerState((prev) => ({ ...prev, selectedMarkerIndex: prev.selectedMarkerIndex === index ? null : index }));
        }
        setMarkerState((prev) => ({ ...prev, isDraggingMarker: false }));
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [clampMarkerTime, contentRef, markerState.markers, pushToHistory, scrollRef, wavesurferState.duration, wavesurferState.pxPerSec],
  );

  const handleContainerClick = useCallback(() => {
    setMarkerState((prev) => ({ ...prev, selectedMarkerIndex: null }));
  }, []);

  const handleContentMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (contentRef.current && wavesurferState.pxPerSec > 0) {
        const rect = contentRef.current.getBoundingClientRect();
        const offset = scrollRef.current?.scrollLeft || 0;
        const x = e.clientX - rect.left + offset;
        const time = x / wavesurferState.pxPerSec;
        if (time >= 0 && time <= wavesurferState.duration) {
          setMarkerState((prev) => ({ ...prev, mousePosition: { x, time } }));
        }
      }
    },
    [contentRef, scrollRef, wavesurferState.pxPerSec, wavesurferState.duration],
  );

  const handleContentMouseLeave = useCallback(() => {
    setMarkerState((prev) => ({ ...prev, mousePosition: null }));
  }, []);

  return {
    isLoading,
    error,
    isPanning,
    wavesurferState,
    historyState,
    markerState: { ...markerState, formatTime },
    interactionHandlers: {
      handlePlayPause,
      handleAddMarker,
      handleRemoveMarker,
      handleUndo,
      handleRedo,
      handleZoomChange,
      handleMarkerMouseDown,
      handleContainerClick,
      handleContentMouseMove,
      handleContentMouseLeave,
    },
  };
};

