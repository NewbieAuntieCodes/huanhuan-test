import React, { useRef } from 'react';
import {
  ChevronLeftIcon,
  UploadIcon,
  UserCircleIcon,
  ListBulletIcon,
  ArrowDownTrayIcon,
  SpeakerXMarkIcon,
  CogIcon,
  MicrophoneIcon,
  CheckCircleIcon,
  XMarkIcon,
} from '../../../components/ui/icons';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';
import { Character } from '../../../types';
import { WebSocketStatus } from '../../../store/slices/uiSlice';

interface AudioAlignmentHeaderProps {
  currentProjectName: string;
  webSocketStatus: WebSocketStatus;
  isRecordingMode: boolean;
  onToggleRecordingMode: () => void;
  cvFilter: string;
  onCvFilterChange: (value: string) => void;
  characterFilter: string;
  onCharacterFilterChange: (value: string) => void;
  projectCharacters: Character[];
  projectCvNames: string[];
  onOpenSilenceSettings: () => void;
  isCvMatchLoading: boolean;
  isCharacterMatchLoading: boolean;
  isChapterMatchLoading: boolean;
  onOpenExportModal: () => void;
  isExporting: boolean;
  onClearAudio: () => void;
  hasAudioInSelection: boolean;
  multiSelectCount: number;
  onGoBack: () => void;
  onFileSelectionForCvMatch: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFileSelectionForCharacterMatch: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFileSelectionForChapterMatch: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const StatusIndicator: React.FC<{ status: WebSocketStatus }> = ({ status }) => {
  switch (status) {
    case 'connected':
      return <span className="flex items-center text-xs text-green-400"><CheckCircleIcon className="w-4 h-4 mr-1"/>热键服务已连接</span>;
    case 'connecting':
      return <span className="flex items-center text-xs text-yellow-400"><LoadingSpinner/>连接中...</span>;
    case 'disconnected':
    default:
      return <span className="flex items-center text-xs text-red-400"><XMarkIcon className="w-4 h-4 mr-1"/>热键服务未连接</span>;
  }
};

const AudioAlignmentHeader: React.FC<AudioAlignmentHeaderProps> = ({
  currentProjectName,
  webSocketStatus,
  isRecordingMode,
  onToggleRecordingMode,
  cvFilter,
  onCvFilterChange,
  characterFilter,
  onCharacterFilterChange,
  projectCharacters,
  projectCvNames,
  onOpenSilenceSettings,
  isCvMatchLoading,
  isCharacterMatchLoading,
  isChapterMatchLoading,
  onOpenExportModal,
  isExporting,
  onClearAudio,
  hasAudioInSelection,
  multiSelectCount,
  onGoBack,
  onFileSelectionForCvMatch,
  onFileSelectionForCharacterMatch,
  onFileSelectionForChapterMatch,
}) => {
    const chapterMatchFileInputRef = useRef<HTMLInputElement>(null);
    const cvMatchFileInputRef = useRef<HTMLInputElement>(null);
    const characterMatchFileInputRef = useRef<HTMLInputElement>(null);

    const handleChapterMatchClick = () => chapterMatchFileInputRef.current?.click();
    const handleCvMatchClick = () => cvMatchFileInputRef.current?.click();
    const handleCharacterMatchClick = () => characterMatchFileInputRef.current?.click();

  return (
    <header className="flex items-center justify-between p-4 border-b border-slate-800 flex-shrink-0 flex-wrap gap-2">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold text-sky-400 truncate pr-4">
          音频对轨: <span className="text-slate-200">{currentProjectName}</span>
        </h1>
        <StatusIndicator status={webSocketStatus} />
      </div>
      <div className="flex items-center space-x-2 flex-wrap justify-end gap-2">
          <input
              type="file"
              multiple
              accept="audio/*"
              ref={chapterMatchFileInputRef}
              onChange={onFileSelectionForChapterMatch}
              className="hidden"
          />
          <input
              type="file"
              multiple
              accept="audio/*"
              ref={cvMatchFileInputRef}
              onChange={onFileSelectionForCvMatch}
              className="hidden"
          />
          <input
              type="file"
              multiple
              accept="audio/*"
              ref={characterMatchFileInputRef}
              onChange={onFileSelectionForCharacterMatch}
              className="hidden"
          />
          <button
              onClick={onToggleRecordingMode}
              className={`flex items-center text-sm px-3 py-1.5 rounded-md transition-colors ${
                  isRecordingMode
                  ? 'bg-red-600 text-white hover:bg-red-700 ring-2 ring-red-300'
                  : 'text-red-300 hover:text-red-100 bg-slate-700 hover:bg-slate-600'
              }`}
              aria-pressed={isRecordingMode}
              title="切换录制模式"
          >
              <MicrophoneIcon className="w-4 h-4 mr-1.5" />
              录制模式
          </button>
          {isRecordingMode && (
              <>
                  <div className="flex items-center bg-slate-700 rounded-md">
                      <label htmlFor="cv-filter" className="text-sm text-slate-400 pl-3 pr-2 whitespace-nowrap">CV:</label>
                      <select
                          id="cv-filter"
                          value={cvFilter}
                          onChange={(e) => onCvFilterChange(e.target.value)}
                          className="bg-slate-700 border-l border-slate-600 text-white text-sm rounded-r-md focus:ring-sky-500 focus:border-sky-500 p-1.5 max-w-[120px]"
                      >
                          <option value="">所有CV</option>
                          {projectCvNames.map(cv => <option key={cv} value={cv}>{cv}</option>)}
                      </select>
                  </div>
                  <div className="flex items-center bg-slate-700 rounded-md">
                      <label htmlFor="char-filter" className="text-sm text-slate-400 pl-3 pr-2 whitespace-nowrap">角色:</label>
                      <select
                          id="char-filter"
                          value={characterFilter}
                          onChange={(e) => onCharacterFilterChange(e.target.value)}
                          className="bg-slate-700 border-l border-slate-600 text-white text-sm rounded-r-md focus:ring-sky-500 focus:border-sky-500 p-1.5 max-w-[120px]"
                      >
                          <option value="">所有角色</option>
                          {projectCharacters
                              .filter(c => c.name !== '[静音]' && c.name !== '音效' && c.name !== 'Narrator')
                              .sort((a,b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
                              .map(char => <option key={char.id} value={char.id}>{char.name}</option>)}
                      </select>
                  </div>
              </>
          )}
          <button
              onClick={onOpenSilenceSettings}
              className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md"
              aria-label="间隔配置"
          >
              <CogIcon className="w-4 h-4 mr-1" />
              间隔配置
          </button>
          <button
              onClick={handleCvMatchClick}
              disabled={isCvMatchLoading}
              className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md disabled:opacity-50"
              aria-label="按CV匹配批量上传"
          >
              {isCvMatchLoading ? <LoadingSpinner /> : <UploadIcon className="w-4 h-4 mr-1" />}
              {isCvMatchLoading ? '匹配中...' : '按CV匹配'}
          </button>
          <button
              onClick={handleCharacterMatchClick}
              disabled={isCharacterMatchLoading}
              className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md disabled:opacity-50"
              aria-label="按角色匹配批量上传"
          >
              {isCharacterMatchLoading ? <LoadingSpinner /> : <UserCircleIcon className="w-4 h-4 mr-1" />}
              {isCharacterMatchLoading ? '匹配中...' : '按角色匹配'}
          </button>
          <button
              onClick={handleChapterMatchClick}
              disabled={isChapterMatchLoading}
              className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md disabled:opacity-50"
              aria-label="按章节匹配批量上传"
          >
              {isChapterMatchLoading ? <LoadingSpinner /> : <ListBulletIcon className="w-4 h-4 mr-1" />}
              {isChapterMatchLoading ? '匹配中...' : '按章节匹配'}
          </button>
          <button
              onClick={onOpenExportModal}
              disabled={isExporting}
              className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md disabled:opacity-50"
              aria-label="导出音频"
          >
              {isExporting ? <LoadingSpinner /> : <ArrowDownTrayIcon className="w-4 h-4 mr-1" />}
              {isExporting ? '导出中...' : '导出音频'}
          </button>
          <button
              onClick={onClearAudio}
              disabled={!hasAudioInSelection || isExporting}
              className="flex items-center text-sm text-red-400 hover:text-red-300 px-3 py-1.5 bg-red-900/50 hover:bg-red-800/50 rounded-md disabled:opacity-50"
              aria-label="清除本章所有音频"
          >
              <SpeakerXMarkIcon className="w-4 h-4 mr-1" />
              {multiSelectCount > 1 ? `清除所选音频 (${multiSelectCount})` : '清除本章音频'}
          </button>
          <button
              onClick={onGoBack}
              className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md"
              aria-label="Back"
          >
            <ChevronLeftIcon className="w-4 h-4 mr-1" /> 返回
          </button>
      </div>
    </header>
  );
};

export default AudioAlignmentHeader;
