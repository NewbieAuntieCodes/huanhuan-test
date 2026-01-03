import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Chapter } from '../../../../types';
import { PencilIcon, EllipsisVerticalIcon, PlusIcon } from '../../../../components/ui/icons';
import { useStore } from '../../../../store/useStore';

interface ChapterListItemProps {
  chapter: Chapter;
  chapterIndex: number;
  isSelectedForViewing: boolean;
  isMultiSelected: boolean;
  isAnyOperationLoading: boolean;
  onToggleMultiSelect: (event: React.MouseEvent<HTMLInputElement>) => void;
  onSelectForViewing: () => void;
  
  isEditingThisItem: boolean;
  editingTitleValue: string;
  onStartEditTitle: () => void; 
  onTitleInputChange: (newTitle: string) => void;
  onSaveTitle: () => void; 
  onCancelEditTitle: () => void;
  onInsertChapterAfter: () => void;
}

const formatChapterNumber = (index: number) => {
    if (index < 0) return '';
    const number = index + 1;
    return number < 1000 ? String(number).padStart(3, '0') : String(number);
};

const countChapterWords = (chapter: Chapter): number => {
  const baseText =
    (chapter.rawContent || '').trim().length > 0
      ? chapter.rawContent
      : (chapter.scriptLines || []).map((l) => l.text).join('\n');

  const withoutSpeakerTags = baseText.replace(
    /^[\s\u3000\uFEFF\u200B\u200C\u200D]*[【\[][^】\]\r\n]+[】\]]\s*[:：]?\s*/gm,
    '',
  );
  const withoutWhitespace = withoutSpeakerTags.replace(
    /[\s\u3000\uFEFF\u200B\u200C\u200D]+/g,
    '',
  );
  return Array.from(withoutWhitespace).length;
};

const ChapterListItem: React.FC<ChapterListItemProps> = ({
  chapter,
  chapterIndex,
  isSelectedForViewing,
  isMultiSelected,
  isAnyOperationLoading,
  onToggleMultiSelect,
  onSelectForViewing,
  isEditingThisItem,
  editingTitleValue,
  onStartEditTitle,
  onTitleInputChange,
  onSaveTitle,
  onCancelEditTitle,
  onInsertChapterAfter,
}) => {
  const titleInputRef = useRef<HTMLInputElement>(null);
  const aiProcessingChapterIds = useStore(state => state.aiProcessingChapterIds);
  const isProcessingThisChapter = aiProcessingChapterIds.includes(chapter.id);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isEditingThisItem && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingThisItem]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  const handleTitleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSaveTitle();
    } else if (e.key === 'Escape') {
      onCancelEditTitle();
    }
  };
  
  const handleTitleInputBlur = () => {
    setTimeout(() => {
      if (isEditingThisItem) { 
          onSaveTitle();
      }
    }, 150); 
  };

  const itemDisabled = isAnyOperationLoading || isProcessingThisChapter || isEditingThisItem;
  const displayTitle = `${formatChapterNumber(chapterIndex)} ${chapter.title}`;
  const wordCount = useMemo(
    () => countChapterWords(chapter),
    [chapter.rawContent, chapter.scriptLines],
  );
  const wordCountText = `${wordCount}字`;

  return (
    <div className={`flex items-center space-x-2 group ${isProcessingThisChapter ? 'opacity-60 cursor-not-allowed' : ''}`}>
      <input
        type="checkbox"
        id={`ch-select-${chapter.id}`}
        checked={isMultiSelected}
        onClick={onToggleMultiSelect}
        readOnly // Let onClick handle the logic
        disabled={itemDisabled}
        className="form-checkbox h-4 w-4 text-sky-500 bg-slate-700 border-slate-600 rounded focus:ring-sky-400 cursor-pointer disabled:opacity-50"
        aria-label={`Select chapter ${displayTitle}`}
      />
      {isEditingThisItem && !isProcessingThisChapter ? (
        <input
          ref={titleInputRef}
          type="text"
          value={editingTitleValue} 
          onChange={(e) => onTitleInputChange(e.target.value)}
          onBlur={handleTitleInputBlur}
          onKeyDown={handleTitleInputKeyDown}
          className="flex-grow px-3 py-2 rounded-md text-sm bg-slate-600 text-slate-100 border border-sky-500 focus:ring-1 focus:ring-sky-400 outline-none"
          aria-label={`Editing title for chapter ${chapter.title}`}
        />
      ) : (
        <div
          role="button"
          onClick={onSelectForViewing}
          aria-pressed={isSelectedForViewing}
          tabIndex={0}
          className={`flex-grow text-left px-3 py-2 rounded-md text-sm transition-colors disabled:opacity-50 flex justify-between items-center 
                      ${isProcessingThisChapter ? 'cursor-not-allowed' : 'cursor-pointer'}
                      ${isSelectedForViewing && !isProcessingThisChapter
                        ? 'bg-sky-500 text-white font-semibold'
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-sky-300'
                      }`}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectForViewing(); } }}
        >
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate block" title={displayTitle}>
              {displayTitle}
              {isProcessingThisChapter && <span className="ml-1 text-xs text-sky-200">(处理中...)</span>}
            </span>
            <span
              className={`flex-shrink-0 text-xs ${
                isSelectedForViewing && !isProcessingThisChapter
                  ? 'text-white/80'
                  : 'text-slate-400 group-hover:text-slate-200'
              }`}
              title={wordCountText}
            >
              {wordCountText}
            </span>
          </div>
          {!isProcessingThisChapter && (
            <div className="relative flex-shrink-0" ref={menuRef}>
              <button
                aria-label={`更多操作 for ${chapter.title}`}
                onClick={(e) => { 
                  e.stopPropagation();
                  setIsMenuOpen(prev => !prev);
                }}
                className="p-1 rounded-full text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-500/50 focus:opacity-100"
              >
                <EllipsisVerticalIcon className="w-4 h-4" />
              </button>
              {isMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-slate-900 border border-slate-700 rounded-md shadow-lg z-20">
                  <ul className="p-1 text-sm text-slate-200">
                    <li>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onInsertChapterAfter();
                          setIsMenuOpen(false);
                        }}
                        className="w-full text-left flex items-center px-3 py-1.5 hover:bg-slate-700 rounded"
                      >
                        <PlusIcon className="w-4 h-4 mr-2" />
                        在此后插入新章节
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onStartEditTitle();
                          setIsMenuOpen(false);
                        }}
                        className="w-full text-left flex items-center px-3 py-1.5 hover:bg-slate-700 rounded"
                      >
                        <PencilIcon className="w-4 h-4 mr-2" />
                        重命名
                      </button>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ChapterListItem;
