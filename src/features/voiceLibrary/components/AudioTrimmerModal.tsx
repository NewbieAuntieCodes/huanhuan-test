import React, { useState, useEffect, useRef, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import { XMarkIcon, SaveIcon } from '../../../components/ui/icons';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';
import { bufferToWav } from '../../../lib/wavEncoder';

interface AudioTrimmerModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioUrl: string;
  onConfirmTrim: (newAudioBlob: Blob) => void;
}

const AudioTrimmerModal: React.FC<AudioTrimmerModalProps> = ({ isOpen, onClose, audioUrl, onConfirmTrim }) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<{ start: number, end: number } | null>(null);

  useEffect(() => {
    if (isOpen && waveformRef.current) {
      setIsLoading(true);
      setError(null);
      setSelectedRegion(null);

      const ws = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: '#64748b',
        progressColor: '#38bdf8',
        height: 128,
        barWidth: 2,
        barRadius: 2,
      });
      wavesurferRef.current = ws;

      const regions = ws.registerPlugin(RegionsPlugin.create());
      
      regions.enableDragSelection({
        color: 'rgba(2, 132, 199, 0.2)', // sky-600 with opacity
      });

      const handleRegionUpdate = (region: any) => {
        // Only allow one region
        const regionsArray = regions.getRegions();
        if (regionsArray.length > 1) {
            regionsArray[0].remove();
        }
        setSelectedRegion({ start: region.start, end: region.end });
      };

      regions.on('region-updated', handleRegionUpdate);
      regions.on('region-created', handleRegionUpdate);

      const loadAudio = async () => {
        try {
          const response = await fetch(audioUrl);
          if (!response.ok) throw new Error('Failed to fetch audio file.');
          const arrayBuffer = await response.arrayBuffer();
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          audioBufferRef.current = await audioContext.decodeAudioData(arrayBuffer);
          await ws.load(audioUrl);
          setIsLoading(false);
        } catch (err) {
          setError('无法加载或解码音频文件。');
          setIsLoading(false);
        }
      };

      loadAudio();

      return () => {
        ws.destroy();
        wavesurferRef.current = null;
        audioBufferRef.current = null;
      };
    }
  }, [isOpen, audioUrl]);

  const handleConfirm = useCallback(async () => {
    if (!selectedRegion || !audioBufferRef.current) return;

    setIsProcessing(true);
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const originalBuffer = audioBufferRef.current;
      const { start, end } = selectedRegion;

      const startSample = Math.floor(start * originalBuffer.sampleRate);
      const endSample = Math.floor(end * originalBuffer.sampleRate);
      const numSamples = endSample - startSample;

      if (numSamples <= 0) {
        throw new Error("选区无效。");
      }

      const newBuffer = audioContext.createBuffer(
        originalBuffer.numberOfChannels,
        numSamples,
        originalBuffer.sampleRate
      );

      for (let i = 0; i < originalBuffer.numberOfChannels; i++) {
        const channelData = originalBuffer.getChannelData(i).subarray(startSample, endSample);
        newBuffer.copyToChannel(channelData, i);
      }
      
      const wavBlob = bufferToWav(newBuffer);
      onConfirmTrim(wavBlob);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : '处理音频时发生错误。');
    } finally {
      setIsProcessing(false);
    }
  }, [selectedRegion, onConfirmTrim]);
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[100] p-4">
      <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-slate-700">
        <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-700 flex-shrink-0">
          <h2 className="text-2xl font-semibold text-slate-100">裁剪参考音频</h2>
          <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-white"><XMarkIcon /></button>
        </div>

        <div className="flex-grow flex flex-col relative overflow-hidden">
          {isLoading && <div className="absolute inset-0 bg-slate-800/80 flex items-center justify-center z-30"><LoadingSpinner /></div>}
          {error && <div className="absolute inset-0 bg-slate-800/80 flex items-center justify-center text-red-400 z-30">{error}</div>}
          
          <div ref={waveformRef} className="w-full h-32 mb-4" />
          <p className="text-sm text-slate-400 text-center">在波形图上拖拽以选择您想使用的音频片段。</p>
          {selectedRegion && (
            <p className="text-sm text-sky-300 text-center mt-2">
              选区: {selectedRegion.start.toFixed(2)}s - {selectedRegion.end.toFixed(2)}s (时长: {(selectedRegion.end - selectedRegion.start).toFixed(2)}s)
            </p>
          )}
        </div>

        <div className="flex justify-end pt-4 mt-4 border-t border-slate-700 flex-shrink-0 space-x-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-md">
            取消
          </button>
          <button 
            onClick={handleConfirm} 
            disabled={!selectedRegion || isLoading || isProcessing}
            className="px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-md flex items-center disabled:opacity-50"
          >
            {isProcessing ? <LoadingSpinner /> : <SaveIcon className="w-4 h-4 mr-2" />}
            {isProcessing ? '处理中...' : '确认并裁剪'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AudioTrimmerModal;
