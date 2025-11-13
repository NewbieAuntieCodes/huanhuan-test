import React, { useState, useCallback, useRef, useEffect } from 'react';
import { UploadIcon, CheckCircleIcon, XMarkIcon, TrashIcon, SparklesIcon, ScissorsIcon } from '../../../components/ui/icons';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';
import WaveformPlayer from './WaveformPlayer';
import GeneratedAudioPlayer from './GeneratedAudioPlayer';
import { VoiceLibraryRowState } from '../hooks/useVoiceLibraryData';
import { Character } from '../../../types';
import { isHexColor, getContrastingTextColor } from '../../../lib/colorUtils';

interface VoiceLibraryRowProps {
  row: VoiceLibraryRowState;
  character: Character | null;
  isBatchGenerating: boolean;
  onTextChange: (text: string) => void;
  onFileUpload: (file: File) => void;
  onRemove: () => void;
  onGenerateSingle: () => void;
  onDeleteGeneratedAudio: () => void;
  onDeletePromptAudio: () => void;
  onTrim: () => void;
  audioContext: AudioContext | null;
  activePlayerKey: string | null;
  setActivePlayerKey: (key: string | null) => void;
  onEmotionChange: (rowId: string, emotion: string) => void;
}

const VoiceLibraryRow: React.FC<VoiceLibraryRowProps> = ({ row, character, isBatchGenerating, onTextChange, onFileUpload, onRemove, onGenerateSingle, onDeleteGeneratedAudio, onDeletePromptAudio, onTrim, audioContext, activePlayerKey, setActivePlayerKey, onEmotionChange }) => {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileProcessing = useCallback((file: File | undefined) => {
    if (file && (file.type === "audio/wav" || file.type === "audio/mpeg" || file.name.endsWith('.wav') || file.name.endsWith('.mp3'))) {
      onFileUpload(file);
    } else {
      alert("文件类型无效。请上传 .wav 或 .mp3 文件。");
    }
  }, [onFileUpload]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileProcessing(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileProcessing(e.target.files?.[0]);
  };

  const [emotionText, setEmotionText] = useState(row.emotion || '');
  useEffect(() => {
    setEmotionText(row.emotion || '');
  }, [row.emotion]);

  const handleEmotionBlur = () => {
    if (emotionText !== (row.emotion || '')) {
        onEmotionChange(row.id, emotionText);
    }
  };

    const handleTextPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const pastedText = e.clipboardData.getData('text');
        // Regex to find (content) or （content）. It's non-greedy to handle multiple sets of parentheses correctly (it will find the first one).
        const emotionRegex = /(?:\(|（)([^()（）]+)(?:\)|）)/;
        const match = pastedText.match(emotionRegex);

        if (match && match[1]) {
            e.preventDefault(); // Prevent default paste behavior
            const emotion = match[1].trim();
            const cleanedText = pastedText.replace(match[0], '').trim();

            // Update emotion field state locally for the input
            setEmotionText(emotion);
            // And also trigger the full update since this is a one-time paste action
            onEmotionChange(row.id, emotion);

            // Update text field state and propagate change up
            onTextChange(cleanedText);
        }
        // If no match, do nothing and let the default paste behavior occur.
    };

  const getStatusDisplay = () => {
    switch(row.status) {
      case 'idle':
        if (!row.promptFilePath && row.promptAudioUrl) {
            return <span className="text-xs text-yellow-400 flex items-center"><LoadingSpinner/>上传中...</span>;
        }
        return <span className="text-xs text-slate-400">空闲</span>;
      case 'uploading':
        return <span className="text-xs text-yellow-400 flex items-center"><LoadingSpinner/>上传中...</span>;
      case 'generating':
        return <span className="text-xs text-sky-400 flex items-center"><LoadingSpinner/>生成中...</span>;
      case 'done':
        return <span className="text-xs text-green-400 flex items-center"><CheckCircleIcon className="w-4 h-4 mr-1"/>完成</span>;
      case 'error':
        return <span className="text-xs text-red-400 flex items-center" title={row.error || ''}><XMarkIcon className="w-4 h-4 mr-1"/>错误</span>;
    }
  }

  const dropzoneClasses = `w-full flex items-center justify-center p-2 border-2 border-dashed rounded-lg transition-colors min-h-[52px] text-sm
    ${isDraggingOver 
      ? 'border-sky-400 bg-slate-700' 
      : row.promptAudioUrl
        ? 'border-slate-700 bg-slate-800/50'
        : 'border-slate-600 hover:border-sky-500 bg-slate-800 hover:bg-slate-700'
    }`;
    
  const getCharacterStyle = () => {
    if (!character || character.name === 'Narrator') {
      return { style: {}, className: 'bg-slate-800 border-slate-600 text-slate-100' };
    }
    const bgIsHex = isHexColor(character.color);
    const textIsHex = isHexColor(character.textColor || '');
    const style: React.CSSProperties = {};
    let className = 'border-transparent';

    if (bgIsHex) {
      style.backgroundColor = character.color;
    } else {
      className += ` ${character.color}`;
    }

    if (textIsHex && character.textColor) {
      style.color = character.textColor;
    } else if (character.textColor) {
      className += ` ${character.textColor}`;
    }

    if (!character.textColor) {
      if (bgIsHex) {
        style.color = getContrastingTextColor(character.color);
      } else {
        const darkBgPatterns = ['-700', '-800', '-900', 'slate-600', 'gray-600'];
        const isDarkBg = character.color && darkBgPatterns.some(p => character.color.includes(p));
        className += isDarkBg ? ' text-slate-100' : ' text-slate-800';
      }
    }
    return { style, className };
  };
  const charStyle = getCharacterStyle();
  
  const canGenerate = !!row.promptFilePath && row.text.trim() !== '';
  const isThisRowGenerating = row.status === 'generating';


  return (
    <>
      <div className="bg-slate-800/50 rounded-lg p-3 flex flex-col gap-y-2">
        {row.promptFileName && (
          <p className="text-xs text-slate-400 truncate" title={row.promptFileName}>
            <span className="font-semibold">参考音频:</span> {row.promptFileName}
          </p>
        )}
        <div className="grid grid-cols-[1fr_120px_1fr_1fr_auto] items-start gap-x-4">
          {/* Column 1: Reference Audio */}
          <div 
              className={dropzoneClasses}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
          >
              <input ref={fileInputRef} type="file" className="sr-only" accept=".wav,.mp3" onChange={handleFileSelect}/>
              {row.status === 'uploading' && !row.promptAudioUrl ? (
                  <div className="flex items-center text-yellow-400 text-sm"><LoadingSpinner/>上传中...</div>
              ) : row.promptAudioUrl ? (
                  <WaveformPlayer 
                      audioUrl={row.promptAudioUrl} 
                      audioContext={audioContext}
                      isActive={activePlayerKey === `${row.id}-prompt`}
                      onActivate={() => setActivePlayerKey(`${row.id}-prompt`)}
                  >
                      <div className="flex items-center space-x-1 pl-1">
                          <button onClick={onTrim} className="p-1 text-slate-400 hover:text-white" title="裁剪参考音频">
                              <ScissorsIcon className="w-4 h-4" />
                          </button>
                          <button onClick={onDeletePromptAudio} className="p-1 text-slate-400 hover:text-red-400" title="删除参考音频">
                              <TrashIcon className="w-4 h-4" />
                          </button>
                      </div>
                  </WaveformPlayer>
              ) : (
                  <div className="flex items-center text-slate-400">
                      <UploadIcon className="w-4 h-4 mr-2"/>
                      <span>拖拽上传</span>
                  </div>
              )}
          </div>

          {/* Column 2: Emotion */}
          <div className="flex flex-col gap-1 text-center">
            <span className="uppercase tracking-[0.08em] text-[10px] text-slate-400">情绪</span>
            <input
              value={emotionText}
              onChange={(e) => setEmotionText(e.target.value)}
              onBlur={handleEmotionBlur}
              placeholder="例如：心疼"
              maxLength={40}
              className="h-9 px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500 text-center"
            />
          </div>
          
          {/* Column 3: Text */}
          <div className="h-full flex items-stretch relative group">
            <textarea
                value={row.text}
                onChange={e => onTextChange(e.target.value)}
                onPaste={handleTextPaste}
                rows={3}
                className={`w-full p-3 text-sm rounded-xl focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-sky-500 resize-y outline-none border border-slate-900 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)] ${charStyle.className}`}
                style={charStyle.style}
                placeholder="输入台词..."
            />
            <button
                onClick={onGenerateSingle}
                disabled={!canGenerate || isThisRowGenerating || isBatchGenerating}
                className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-black/40 text-white/90 backdrop-blur-sm hover:bg-sky-600 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed opacity-0 group-hover:opacity-100 focus:opacity-100"
                title="生成此行语音"
            >
                {isThisRowGenerating ? <LoadingSpinner/> : <SparklesIcon className="w-4 h-4" />}
                <span>{isThisRowGenerating ? '生成中' : '生成语音'}</span>
            </button>
          </div>

          {/* Column 4: Generated Result */}
          <div className="flex items-center justify-center h-full">
            {row.audioUrl ? (
                <GeneratedAudioPlayer 
                  audioUrl={row.audioUrl} 
                  onDelete={onDeleteGeneratedAudio}
                  audioContext={audioContext}
                  isActive={activePlayerKey === `${row.id}-generated`}
                  onActivate={() => setActivePlayerKey(`${row.id}-generated`)}
                />
            ) : (
                <div className="h-full w-full flex items-center justify-center bg-slate-800 rounded-md min-h-[52px]">
                    {getStatusDisplay()}
                </div>
            )}
          </div>

          {/* Column 5: Remove Button */}
          <div className="flex items-center h-full">
            <button onClick={onRemove} className="p-2 text-slate-500 hover:text-red-400 rounded-full">
                <TrashIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default VoiceLibraryRow;