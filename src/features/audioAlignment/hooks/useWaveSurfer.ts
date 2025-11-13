

import React, { useState, useEffect, useRef, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.js';
import { useStore } from '../../../store/useStore';
import { db } from '../../../db';

const WAVE_BG_COLOR = '#334155';
const WAVE_PROGRESS_COLOR = '#38bdf8';
const PLAYHEAD_COLOR = '#f1f5f9';

const formatTime = (t: number) => {
  if (!isFinite(t)) return '0:00.000';
  const sign = t < 0 ? '-' : '';
  t = Math.max(0, Math.abs(t));
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60).toString().padStart(2, '0');
  const ms = Math.floor((t * 1000) % 1000).toString().padStart(3, '0');
  return `${sign}${m}:${s}.${ms}`;
};

/**
 * Generate initial markers from existing audio segments
 * by calculating cumulative durations of audio blobs that use this source audio
 */
const generateInitialMarkersFromSegments = async (sourceAudioId: string, projects: any[], selectedProjectId: string | null): Promise<number[]> => {
  try {
    // Find all audio blobs that use this source audio
    const allBlobs = await db.audioBlobs.toArray();
    const relevantBlobs = allBlobs.filter(blob => blob.sourceAudioId === sourceAudioId);

    if (relevantBlobs.length === 0) {
      return [];
    }

    // Get the project to determine the correct order of lines
    const currentProject = projects.find(p => p.id === selectedProjectId);
    if (!currentProject) {
      return [];
    }

    // Build a map of lineId to their position in the project
    const lineIdToPosition = new Map<string, number>();
    let position = 0;
    for (const chapter of currentProject.chapters) {
      for (const line of chapter.scriptLines) {
        lineIdToPosition.set(line.id, position++);
      }
    }

    // Sort blobs by their line position in the project
    relevantBlobs.sort((a, b) => {
      const posA = lineIdToPosition.get(a.lineId) ?? Infinity;
      const posB = lineIdToPosition.get(b.lineId) ?? Infinity;
      return posA - posB;
    });

    // Create an audio context to decode audio durations
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    try {
      const markers: number[] = [];
      let cumulativeTime = 0;

      // Decode each blob and calculate cumulative timestamps
      for (const blob of relevantBlobs) {
        const arrayBuffer = await blob.data.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const duration = audioBuffer.duration;

        // Add marker at the end of this segment (which is the start of the next)
        cumulativeTime += duration;
        markers.push(cumulativeTime);
      }

      // Remove the last marker since it would be at the end of the audio
      if (markers.length > 0) {
        markers.pop();
      }

      return markers;
    } finally {
      if (audioContext.state !== 'closed') {
        await audioContext.close();
      }
    }
  } catch (error) {
    console.error('Failed to generate initial markers:', error);
    return [];
  }
};

interface UseWaveSurferProps {
  isOpen: boolean;
  sourceAudioInfo: { id: string; filename: string };
  currentLineId: string;
  onSave: (sourceAudioId: string, markers: number[]) => void;
  refs: {
    waveformRef: React.RefObject<HTMLDivElement>;
    timelineRef: React.RefObject<HTMLDivElement>;
    scrollRef: React.RefObject<HTMLDivElement>;
    contentRef: React.RefObject<HTMLDivElement>;
  };
}

export const useWaveSurfer = ({
  isOpen,
  sourceAudioInfo,
  currentLineId,
  onSave,
  refs,
}: UseWaveSurferProps) => {
  const { waveformRef, timelineRef, scrollRef, contentRef } = refs;
  const { projects, selectedProjectId } = useStore(state => ({
    projects: state.projects,
    selectedProjectId: state.selectedProjectId,
  }));

  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  // State slices
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
    localLineIndex: number;
    mousePosition: { x: number; time: number } | null;
  }>({
    markers: [],
    selectedMarkerIndex: null,
    isDraggingMarker: false,
    localLineIndex: -1,
    mousePosition: null,
  });

  const pushToHistory = useCallback((newState: number[]) => {
    setHistoryState(prev => {
      const newHistory = prev.history.slice(0, prev.index + 1);
      newHistory.push(newState);
      const newIndex = newHistory.length - 1;
      return {
        history: newHistory,
        index: newIndex,
        canUndo: newIndex > 0,
        canRedo: false,
      };
    });
    setMarkerState(prev => ({ ...prev, markers: newState }));
  }, []);

  // Calculate local line index
  useEffect(() => {
    if (!currentLineId || !sourceAudioInfo.id) return;
    const calculateLocalIndex = async () => {
      const currentProject = projects.find(p => p.id === selectedProjectId);
      if (!currentProject) return;
      const lineWithBlobIds = currentProject.chapters.flatMap(ch => ch.scriptLines.map(line => ({ lineId: line.id, blobId: line.audioBlobId }))).filter(l => l.blobId);
      const blobs = await db.audioBlobs.bulkGet(lineWithBlobIds.map(l => l.blobId!));
      const validLineIds = new Set(blobs.map((b, i) => b?.sourceAudioId === sourceAudioInfo.id ? lineWithBlobIds[i].lineId : null).filter((v): v is string => !!v));
      const orderedLines = lineWithBlobIds.filter(l => validLineIds.has(l.lineId));
      setMarkerState(prev => ({ ...prev, localLineIndex: orderedLines.findIndex(item => item.lineId === currentLineId)}));
    };
    calculateLocalIndex();
  }, [currentLineId, sourceAudioInfo.id, projects, selectedProjectId]);

  // WaveSurfer instance lifecycle
  useEffect(() => {
    if (!(isOpen && waveformRef.current && timelineRef.current)) return;
    setIsLoading(true);
    setError(null);

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ latencyHint: 'interactive', sampleRate: 48000 });
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
      audioRate: 1,
      backend: 'WebAudio',
      normalize: false,
      // FIX: The type definitions for wavesurfer.js may be outdated and don't include the `audioContext` property, causing a type error. Ignoring the error as this is a valid option.
      // @ts-ignore
      audioContext: audioContext,
      plugins: [
        // FIX: Styling options like `primaryColor` are deprecated in modern versions of the wavesurfer.js timeline plugin.
        // Styling is now handled via CSS. Removing these properties aligns with the modern API.
        TimelinePlugin.create({ container: timelineRef.current! })
      ]
    });
    wavesurferRef.current = ws;

    const loadAudioAndMarkers = async () => {
        try {
            const masterAudio = await db.masterAudios.get(sourceAudioInfo.id);
            if (!masterAudio) throw new Error('母带音频未找到');
            void ws.loadBlob(masterAudio.data);

            const customMarkers = await db.audioMarkers.get(sourceAudioInfo.id);
            if (customMarkers?.markers?.length > 0) {
                setMarkerState(prev => ({...prev, markers: customMarkers.markers}));
                setHistoryState({ history: [customMarkers.markers], index: 0, canUndo: false, canRedo: false });
            } else {
              // Generate initial markers from existing audio segments
              const initialMarkers = await generateInitialMarkersFromSegments(sourceAudioInfo.id, projects, selectedProjectId);
              setMarkerState(prev => ({...prev, markers: initialMarkers}));
              setHistoryState({ history: [initialMarkers], index: 0, canUndo: false, canRedo: false });
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : '加载音频失败');
        } finally {
            setIsLoading(false);
        }
    };
    loadAudioAndMarkers();

    ws.on('play', () => setWavesurferState(prev => ({ ...prev, isPlaying: true })));
    ws.on('pause', () => setWavesurferState(prev => ({ ...prev, isPlaying: false })));
    ws.on('finish', () => setWavesurferState(prev => ({ ...prev, isPlaying: false })));
    ws.on('ready', () => {
      setWavesurferState(prev => ({ ...prev, duration: ws.getDuration(), isReady: true }));
      setIsLoading(false);
    });
    ws.on('click', (relativePos: number) => {
        ws.seekTo(relativePos);
        if (!markerState.isDraggingMarker) setMarkerState(prev => ({ ...prev, selectedMarkerIndex: null }));
    });

    return () => {
      ws.destroy();
      if (audioContext.state !== 'closed') audioContext.close();
      wavesurferRef.current = null;
      setWavesurferState(prev => ({ ...prev, isReady: false, duration: 0, pxPerSec: 0 }));
    };
  }, [isOpen, sourceAudioInfo.id]);
  
  // Zoom logic
  useEffect(() => {
    if (!wavesurferRef.current || !scrollRef.current || wavesurferState.duration <= 0) return;
    const containerWidth = scrollRef.current.clientWidth || 1;
    const basePxPerSec = containerWidth / wavesurferState.duration;
    const computedPxPerSec = basePxPerSec * wavesurferState.zoomLevel;
    setWavesurferState(prev => ({...prev, pxPerSec: computedPxPerSec }));
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

  // Interaction handlers
  const handlePlayPause = useCallback(() => wavesurferRef.current?.playPause(), []);
  const handleAddMarker = useCallback(() => {
    if (wavesurferRef.current) {
        const t = wavesurferRef.current.getCurrentTime();
        pushToHistory([...markerState.markers, t].sort((a, b) => a - b));
    }
  }, [markerState.markers, pushToHistory]);
  const handleRemoveMarker = useCallback(() => {
    if (markerState.selectedMarkerIndex !== null) {
        pushToHistory(markerState.markers.filter((_, i) => i !== markerState.selectedMarkerIndex));
        setMarkerState(prev => ({...prev, selectedMarkerIndex: null}));
    }
  }, [markerState.markers, markerState.selectedMarkerIndex, pushToHistory]);
  const handleUndo = useCallback(() => {
    if (historyState.canUndo) {
        const newIndex = historyState.index - 1;
        setHistoryState(prev => ({ ...prev, index: newIndex, canUndo: newIndex > 0, canRedo: true }));
        setMarkerState(prev => ({...prev, markers: historyState.history[newIndex]}));
    }
  }, [historyState.canUndo, historyState.index, historyState.history]);
  const handleRedo = useCallback(() => {
    if (historyState.canRedo) {
        const newIndex = historyState.index + 1;
        setHistoryState(prev => ({ ...prev, index: newIndex, canUndo: true, canRedo: newIndex < prev.history.length - 1 }));
        setMarkerState(prev => ({...prev, markers: historyState.history[newIndex]}));
    }
  }, [historyState.canRedo, historyState.index, historyState.history]);
  const handleSave = useCallback(() => onSave(sourceAudioInfo.id, markerState.markers), [onSave, sourceAudioInfo.id, markerState.markers]);
  const handleZoomChange = useCallback((level: number) => setWavesurferState(prev => ({...prev, zoomLevel: level})), []);
  
  // Mouse and Keyboard interactions
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === 'Space') { e.preventDefault(); handlePlayPause(); }
        else if (e.code === 'KeyM') { e.preventDefault(); handleAddMarker(); }
        else if ((e.code === 'Delete' || e.code === 'Backspace') && markerState.selectedMarkerIndex !== null) { e.preventDefault(); handleRemoveMarker(); }
    };
    const scrollContainer = scrollRef.current;
    const handleWheel = (e: WheelEvent) => {
        if (!contentRef.current || wavesurferState.pxPerSec <= 0) return;
        e.preventDefault();
        const rect = scrollContainer!.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseTime = (scrollContainer!.scrollLeft + mouseX) / wavesurferState.pxPerSec;
        const newZoomLevel = Math.max(0.1, Math.min(50, wavesurferState.zoomLevel * (e.deltaY > 0 ? 0.8 : 1.25)));
        setWavesurferState(prev => ({ ...prev, zoomLevel: newZoomLevel }));
        requestAnimationFrame(() => {
            const newPxPerSec = (scrollContainer!.clientWidth / wavesurferState.duration) * newZoomLevel;
            scrollContainer!.scrollLeft = Math.max(0, mouseTime * newPxPerSec - mouseX);
        });
    };
    const handleMouseDown = (e: MouseEvent) => {
        if (e.button === 1) {
            e.preventDefault();
            setIsPanning(true);
            const startX = e.clientX;
            const startScrollLeft = scrollContainer!.scrollLeft;
            const handleMouseMove = (me: MouseEvent) => { scrollContainer!.scrollLeft = startScrollLeft + (startX - me.clientX); };
            const handleMouseUp = () => { setIsPanning(false); document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
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
  }, [isOpen, handlePlayPause, handleAddMarker, handleRemoveMarker, markerState.selectedMarkerIndex, scrollRef, contentRef, wavesurferState.pxPerSec, wavesurferState.zoomLevel, wavesurferState.duration]);

  // Marker drag logic
  const handleMarkerMouseDown = useCallback((e: React.MouseEvent, index: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    let hasMoved = false;
    let currentMarkers = [...markerState.markers];
    
    const handleMouseMove = (me: MouseEvent) => {
        if (!hasMoved) {
            hasMoved = true;
            setMarkerState(prev => ({...prev, isDraggingMarker: true, selectedMarkerIndex: index}));
        }
        if (contentRef.current && wavesurferState.pxPerSec > 0) {
            const rect = contentRef.current.getBoundingClientRect();
            const offset = scrollRef.current?.scrollLeft || 0;
            const x = me.clientX - rect.left + offset;
            const newTime = Math.max(0, Math.min(wavesurferState.duration, x / wavesurferState.pxPerSec));
            currentMarkers = [...markerState.markers];
            currentMarkers[index] = newTime;
            currentMarkers.sort((a, b) => a - b);
            setMarkerState(prev => ({...prev, markers: currentMarkers}));
        }
    };

    const handleMouseUp = () => {
        if (hasMoved) {
            pushToHistory(currentMarkers);
        } else {
            setMarkerState(prev => ({...prev, selectedMarkerIndex: prev.selectedMarkerIndex === index ? null : index}));
        }
        setMarkerState(prev => ({...prev, isDraggingMarker: false}));
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [markerState.markers, contentRef, scrollRef, wavesurferState.pxPerSec, wavesurferState.duration, pushToHistory]);

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (!markerState.isDraggingMarker && e.target === e.currentTarget) {
        setMarkerState(prev => ({...prev, selectedMarkerIndex: null}));
    }
  }, [markerState.isDraggingMarker]);
  
  const handleContentMouseMove = useCallback((e: React.MouseEvent) => {
    if (contentRef.current && wavesurferState.pxPerSec > 0) {
        const rect = contentRef.current.getBoundingClientRect();
        const offset = scrollRef.current?.scrollLeft || 0;
        const x = e.clientX - rect.left + offset;
        const time = x / wavesurferState.pxPerSec;
        if (time >= 0 && time <= wavesurferState.duration) {
            setMarkerState(prev => ({...prev, mousePosition: { x, time }}));
        }
    }
  }, [contentRef, scrollRef, wavesurferState.pxPerSec, wavesurferState.duration]);

  const handleContentMouseLeave = useCallback(() => {
    setMarkerState(prev => ({...prev, mousePosition: null}));
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
      handleSave,
      handleZoomChange,
      handleMarkerMouseDown,
      handleContainerClick,
      handleContentMouseMove,
      handleContentMouseLeave,
    },
  };
};