import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  UploadIcon,
  CheckCircleIcon,
  XMarkIcon,
  TrashIcon,
  SparklesIcon,
  ScissorsIcon,
} from '../../../components/ui/icons';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';
import WaveformPlayer from './WaveformPlayer';
import GeneratedAudioPlayer from './GeneratedAudioPlayer';
import { VoiceLibraryRowState } from '../hooks/useVoiceLibraryData';
import { Character } from '../../../types';
import { isHexColor, getContrastingTextColor } from '../../../lib/colorUtils';
import ReferenceRoleCell from './ReferenceRoleCell';

interface VoiceLibraryRowProps {
  row: VoiceLibraryRowState;
  character: Character | null;
  referenceRoleNames: string[];
  selectedReferenceRole: string;
  isReferenceRoleDisabled: boolean;
  onReferenceRoleChange: (roleName: string) => void;
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

const VoiceLibraryRow: React.FC<VoiceLibraryRowProps> = ({
  row,
  character,
  referenceRoleNames,
  selectedReferenceRole,
  isReferenceRoleDisabled,
  onReferenceRoleChange,
  isBatchGenerating,
  onTextChange,
  onFileUpload,
  onRemove,
  onGenerateSingle,
  onDeleteGeneratedAudio,
  onDeletePromptAudio,
  onTrim,
  audioContext,
  activePlayerKey,
  setActivePlayerKey,
  onEmotionChange,
}) => {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleFileProcessing = useCallback(
    (file: File | undefined) => {
      if (
        file &&
        (file.type === 'audio/wav' ||
          file.type === 'audio/mpeg' ||
          file.name.toLowerCase().endsWith('.wav') ||
          file.name.toLowerCase().endsWith('.mp3'))
      ) {
        onFileUpload(file);
      } else if (file) {
        alert('文件格式无效，请上传 .wav 或 .mp3 文件。');
      }
    },
    [onFileUpload],
  );

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
    // 提取形如 (情绪) 或 【情绪】 的情绪标记，并从文本中移除
    const emotionRegex = /(?:\(|【)([^()【】]+)(?:\)|】)/;
    const match = pastedText.match(emotionRegex);

    if (match && match[1]) {
      e.preventDefault();
      const emotion = match[1].trim();
      const cleanedText = pastedText.replace(match[0], '').trim();

      setEmotionText(emotion);
      onEmotionChange(row.id, emotion);
      onTextChange(cleanedText);
    }
    // 如果不匹配，则使用默认粘贴行为（在 onPaste 里不拦截）。
  };

  const getStatusDisplay = () => {
    switch (row.status) {
      case 'idle':
        if (!row.promptFilePath && row.promptAudioUrl) {
          return (
            <span className="text-xs text-yellow-400 flex items-center">
              <LoadingSpinner />
              上传中...
            </span>
          );
        }
        return <span className="text-xs text-slate-400">待生成</span>;
      case 'uploading':
        return (
          <span className="text-xs text-yellow-400 flex items-center">
            <LoadingSpinner />
            上传中...
          </span>
        );
      case 'generating':
        return (
          <span className="text-xs text-sky-400 flex items-center">
            <LoadingSpinner />
            生成中...
          </span>
        );
      case 'done':
        return (
          <span className="text-xs text-green-400 flex items-center">
            <CheckCircleIcon className="w-4 h-4 mr-1" />
            完成
          </span>
        );
      case 'error':
        return (
          <span className="text-xs text-red-400 flex items-center" title={row.error || ''}>
            <XMarkIcon className="w-4 h-4 mr-1" />
            出错
          </span>
        );
      default:
        return null;
    }
  };

  const dropzoneClasses =
    'w-full flex items-center justify-center p-2 border-2 border-dashed rounded-lg transition-colors min-h-[52px] text-sm ' +
    (isDraggingOver
      ? 'border-sky-400 bg-slate-700'
      : row.promptAudioUrl
      ? 'border-slate-700 bg-slate-800/50'
      : 'border-slate-600 hover:border-sky-500 bg-slate-800 hover:bg-slate-700');

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
    } else if (character.color) {
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
      } else if (character.color) {
        const darkBgPatterns = ['-700', '-800', '-900', 'slate-600', 'gray-600'];
        const isDarkBg = darkBgPatterns.some((p) => character.color && character.color.includes(p));
        className += isDarkBg ? ' text-slate-100' : ' text-slate-800';
      }
    }

    return { style, className };
  };

  const charStyle = getCharacterStyle();
  const canGenerate = !!row.promptFilePath && row.text.trim() !== '';
  const isThisRowGenerating = row.status === 'generating';

  // 旁白行（Narrator 或无角色）文本框高度上限更低
  const isNarrationRow = !character || character.name === 'Narrator';
  const maxNarrationHeightPx = 120; // 约等于 5 行高度

  const adjustTextAreaHeight = () => {
    const el = textAreaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const scrollHeight = el.scrollHeight;
    if (isNarrationRow && scrollHeight > maxNarrationHeightPx) {
      el.style.height = `${maxNarrationHeightPx}px`;
      el.style.overflowY = 'auto';
    } else {
      el.style.height = `${scrollHeight}px`;
      el.style.overflowY = 'hidden';
    }
  };

  useEffect(() => {
    adjustTextAreaHeight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.text, isNarrationRow]);

  return (
    <>
      <div className="bg-slate-800/50 rounded-lg p-3 flex flex-col gap-y-2">
        {row.promptFileName && (
          <p className="text-xs text-slate-400 truncate" title={row.promptFileName}>
            <span className="font-semibold">参考音频:</span> {row.promptFileName}
          </p>
        )}
        <div className="grid grid-cols-[160px_1fr_120px_1fr_1fr_auto] items-start gap-x-4">
          {/* Column 1: Reference Role */}
          <ReferenceRoleCell
            roleNames={referenceRoleNames}
            value={selectedReferenceRole}
            disabled={isReferenceRoleDisabled}
            onChange={onReferenceRoleChange}
          />

          {/* Column 2: Reference Audio */}
          <div
            className={dropzoneClasses}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              accept=".wav,.mp3"
              onChange={handleFileSelect}
            />
            {row.status === 'uploading' && !row.promptAudioUrl ? (
              <div className="flex items-center text-yellow-400 text-sm">
                <LoadingSpinner />
                上传中...
              </div>
            ) : row.promptAudioUrl ? (
              <WaveformPlayer
                audioUrl={row.promptAudioUrl}
                audioContext={audioContext}
                isActive={activePlayerKey === `${row.id}-prompt`}
                onActivate={() => setActivePlayerKey(`${row.id}-prompt`)}
              >
                <div className="flex items-center space-x-1 pl-1">
                  <button
                    onClick={onTrim}
                    className="p-1 text-slate-400 hover:text-white"
                    title="裁剪参考音频"
                  >
                    <ScissorsIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={onDeletePromptAudio}
                    className="p-1 text-slate-400 hover:text-red-400"
                    title="删除参考音频"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </WaveformPlayer>
            ) : (
              <div className="flex items-center text-slate-400">
                <UploadIcon className="w-4 h-4 mr-2" />
                <span>拖拽上传</span>
              </div>
            )}
          </div>

          {/* Column 3: Emotion（只显示输入框，标题在表头） */}
          <div className="flex items-start justify-start px-1 pt-1">
            <input
              value={emotionText}
              onChange={(e) => setEmotionText(e.target.value)}
              onBlur={handleEmotionBlur}
              placeholder="例如：小紧张"
              maxLength={40}
              className="w-full h-9 px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500 text-center"
            />
          </div>

          {/* Column 4: Text */}
          <div className="h-full flex items-stretch">
            <textarea
              ref={textAreaRef}
              value={row.text}
              onChange={(e) => {
                onTextChange(e.target.value);
                requestAnimationFrame(adjustTextAreaHeight);
              }}
              onPaste={(e) => {
                handleTextPaste(e);
                requestAnimationFrame(adjustTextAreaHeight);
              }}
              rows={1}
              className={`w-full p-3 text-sm rounded-xl focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-sky-500 outline-none border border-slate-900 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)] ${charStyle.className}`}
              style={charStyle.style}
              placeholder="输入台词文本..."
            />
          </div>

          {/* Column 5: Generated Result + Generate Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={onGenerateSingle}
              disabled={!canGenerate || isThisRowGenerating || isBatchGenerating}
              className="flex items-center justify-center gap-1.5 text-xs px-3 h-9 rounded-lg bg-black/40 text-white/90 backdrop-blur-sm hover:bg-sky-600 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed min-w-[94px]"
              title="生成当前语音"
            >
              {isThisRowGenerating ? <LoadingSpinner /> : <SparklesIcon className="w-4 h-4" />}
              <span>{isThisRowGenerating ? '生成中' : '生成语音'}</span>
            </button>

            <div className="flex-1 flex items-center justify-center">
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
          </div>

          {/* Column 6: Remove Button */}
          <div className="flex items-center h-full">
            <button
              onClick={onRemove}
              className="p-2 text-slate-500 hover:text-red-400 rounded-full"
              title="删除该行"
            >
              <TrashIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default VoiceLibraryRow;
