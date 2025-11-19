import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import ScriptLineItem from './ScriptLineItem';
import LoadingSpinner from '../../../../components/ui/LoadingSpinner';
import {
  SplitIcon,
  UndoIcon,
  RedoIcon,
  PencilIcon,
  SaveIcon,
  ScissorsIcon,
  KeyboardIcon,
} from '../../../../components/ui/icons';
import { useEditorContext } from '../../contexts/EditorContext';
import { useScriptLineEditor } from '../../hooks/useScriptLineEditor';

const formatChapterNumber = (index: number) => {
  if (index < 0) return '';
  const number = index + 1;
  return number < 1000 ? String(number).padStart(3, '0') : String(number);
};

const ScriptEditorPanel: React.FC = () => {
  const {
    currentProject,
    characters,
    cvStyles,
    undoableUpdateChapterTitle,
    undoableUpdateChapterRawContent,
    undoableProjectUpdate,
    undo,
    redo,
    canUndo,
    canRedo,
    selectedChapterId,
    focusedScriptLineId,
    setFocusedScriptLineId,
    shortcutActiveLineId,
    setShortcutActiveLineId,
    openShortcutSettingsModal,
    isLoadingAiAnnotation,
    isLoadingManualParse,
    openCvModal,
    addCustomSoundType,
    deleteCustomSoundType,
    splitChapterAtLine,
  } = useEditorContext();

  const [isEditingHeaderTitle, setIsEditingHeaderTitle] = useState(false);
  const [headerTitleInput, setHeaderTitleInput] = useState('');
  const headerTitleInputRef = useRef<HTMLInputElement>(null);
  const [editableRawContent, setEditableRawContent] = useState('');
  const [isRawContentDirty, setIsRawContentDirty] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const selectedChapter =
    currentProject?.chapters.find((ch) => ch.id === selectedChapterId) || null;
  const selectedChapterIndex =
    selectedChapter && currentProject
      ? currentProject.chapters.findIndex((ch) => ch.id === selectedChapter.id)
      : -1;

  useEffect(() => {
    if (selectedChapter) {
      setHeaderTitleInput(selectedChapter.title);
      setIsEditingHeaderTitle(false);
      setEditableRawContent(selectedChapter.rawContent);
      setIsRawContentDirty(false);
    } else {
      setHeaderTitleInput('');
      setEditableRawContent('');
      setIsRawContentDirty(false);
      setIsEditingHeaderTitle(false);
    }
  }, [selectedChapter]);

  useEffect(() => {
    if (isEditingHeaderTitle && headerTitleInputRef.current) {
      headerTitleInputRef.current.focus();
      headerTitleInputRef.current.select();
    }
  }, [isEditingHeaderTitle]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [selectedChapterId]);

  const {
    handleUpdateScriptLineText,
    handleAssignCharacterToLine,
    handleSplitScriptLine,
    handleMergeAdjacentLines,
    handleDeleteScriptLine,
    handleUpdateSoundType,
    handleMoveScriptLine,
    handleUpdateScriptLineEmotion,
  } = useScriptLineEditor(
    currentProject,
    characters,
    undoableProjectUpdate,
    selectedChapterId,
  );

  const canSplitFocusedLine = !!focusedScriptLineId;

  const handleMoveLineUp = useCallback(
    (lineId: string) => {
      if (!selectedChapter) return;
      handleMoveScriptLine(selectedChapter.id, lineId, -1);
    },
    [handleMoveScriptLine, selectedChapter],
  );

  const handleMoveLineDown = useCallback(
    (lineId: string) => {
      if (!selectedChapter) return;
      handleMoveScriptLine(selectedChapter.id, lineId, 1);
    },
    [handleMoveScriptLine, selectedChapter],
  );

  const characterIdsInChapter = useMemo(() => {
    if (!selectedChapter) return new Set<string>();
    return new Set(
      selectedChapter.scriptLines
        .map((line) => line.characterId)
        .filter((id): id is string => !!id),
    );
  }, [selectedChapter]);

  const handleSplitClick = () => {
    if (selectedChapter && focusedScriptLineId) {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      let el: Node | null = range.startContainer;
      let contentEditableEl: HTMLElement | null = null;
      while (el) {
        if (
          el.nodeType === Node.ELEMENT_NODE &&
          (el as HTMLElement).isContentEditable
        ) {
          contentEditableEl = el as HTMLElement;
          break;
        }
        el = el.parentElement;
      }
      if (contentEditableEl) {
        const currentText = contentEditableEl.innerText;
        const preCaretRange = document.createRange();
        preCaretRange.selectNodeContents(contentEditableEl);
        preCaretRange.setEnd(range.startContainer, range.startOffset);
        const splitIndex = preCaretRange.toString().length;
        handleSplitScriptLine(
          selectedChapter.id,
          focusedScriptLineId,
          splitIndex,
          currentText,
        );
      }
    }
  };

  const handleSplitMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    handleSplitClick();
  };

  const handleSplitChapterClick = () => {
    if (selectedChapter && focusedScriptLineId) {
      splitChapterAtLine(selectedChapter.id, focusedScriptLineId);
    }
  };

  const handleSplitChapterMouseDown = (
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    e.preventDefault();
    handleSplitChapterClick();
  };

  const isCurrentlyLoadingLines =
    selectedChapter &&
    (isLoadingAiAnnotation || isLoadingManualParse) &&
    selectedChapter.scriptLines.length === 0;

  const handleHeaderTitleClick = () => {
    if (!selectedChapter) return;
    setHeaderTitleInput(selectedChapter.title);
    setIsEditingHeaderTitle(true);
  };

  const saveHeaderTitle = () => {
    if (!selectedChapter) return;
    const trimmedTitle = headerTitleInput.trim();
    if (trimmedTitle) {
      undoableUpdateChapterTitle(selectedChapter.id, trimmedTitle);
    } else {
      setHeaderTitleInput(selectedChapter.title);
      alert('章节标题不能为空。');
    }
    setIsEditingHeaderTitle(false);
  };

  const handleHeaderTitleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveHeaderTitle();
    } else if (e.key === 'Escape') {
      if (selectedChapter) setHeaderTitleInput(selectedChapter.title);
      setIsEditingHeaderTitle(false);
    }
  };

  const handleRawContentChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    setEditableRawContent(e.target.value);
    if (!isRawContentDirty) setIsRawContentDirty(true);
  };

  const handleSaveRawContent = () => {
    if (selectedChapter && isRawContentDirty) {
      undoableUpdateChapterRawContent(selectedChapter.id, editableRawContent);
      setIsRawContentDirty(false);
    }
  };

  const hasScriptLines =
    !!selectedChapter && selectedChapter.scriptLines.length > 0;
  const displayTitle =
    selectedChapter && selectedChapterIndex >= 0
      ? `${formatChapterNumber(selectedChapterIndex)} ${selectedChapter.title}`
      : '';

  if (!selectedChapter || selectedChapterIndex < 0) {
    return (
      <div className="p-6 h-full flex items-center justify-center text-slate-400 bg-slate-800">
        <p>选择一个章节开始编辑或查看其内容。</p>
      </div>
    );
  }

  return (
    <div className="p-4 h-full flex flex-col bg-slate-800 text-slate-100">
      <div className="sticky top-0 bg-slate-800 py-2 z-10 border-b border-slate-700 flex justify-between items-center pr-2">
        {isEditingHeaderTitle ? (
          <input
            ref={headerTitleInputRef}
            type="text"
            value={headerTitleInput}
            onChange={(e) => setHeaderTitleInput(e.target.value)}
            onBlur={saveHeaderTitle}
            onKeyDown={handleHeaderTitleKeyDown}
            className="text-xl font-semibold text-sky-300 bg-slate-700 border border-sky-500 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-sky-400 flex-grow mr-2"
            aria-label={`编辑章节标题: ${selectedChapter.title}`}
          />
        ) : (
          <div
            className="flex items-center group cursor-pointer flex-grow min-w-0 mr-2"
            onClick={handleHeaderTitleClick}
            title="点击编辑标题"
          >
            <h3
              className="text-xl font-semibold text-sky-300 truncate"
              title={displayTitle}
            >
              {displayTitle}
            </h3>
            <PencilIcon className="w-4 h-4 text-slate-400 ml-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </div>
        )}
        <div className="flex items-center space-x-2 flex-shrink-0">
          <button
            onClick={openShortcutSettingsModal}
            disabled={isEditingHeaderTitle}
            title="快捷键设置"
            className="flex items-center px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <KeyboardIcon className="w-4 h-4 mr-1.5" />
            快捷键
          </button>
          <button
            onClick={undo}
            disabled={!canUndo || isEditingHeaderTitle}
            title="撤销上一步操作"
            className="flex items-center px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <UndoIcon className="w-4 h-4 mr-1.5" />
            撤销
          </button>
          <button
            onClick={redo}
            disabled={!canRedo || isEditingHeaderTitle}
            title="重做上一步操作"
            className="flex items-center px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RedoIcon className="w-4 h-4 mr-1.5" />
            重做
          </button>
          <button
            onMouseDown={handleSplitMouseDown}
            disabled={!canSplitFocusedLine || isEditingHeaderTitle}
            title={
              canSplitFocusedLine
                ? '在光标位置拆成两句'
                : '先在要拆分的句子中放置光标'
            }
            className="flex items-center px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SplitIcon className="w-4 h-4 mr-1.5" />
            拆句
          </button>
          <button
            onMouseDown={handleSplitChapterMouseDown}
            disabled={!canSplitFocusedLine || isEditingHeaderTitle}
            title={
              canSplitFocusedLine
                ? '从当前句开始拆成新章节'
                : '先选择要作为新章节开头的句子'
            }
            className="flex items-center px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ScissorsIcon className="w-4 h-4 mr-1.5" />
            拆章节
          </button>
        </div>
      </div>
      <div
        ref={scrollContainerRef}
        className="flex-grow overflow-y-auto pt-3 pr-1"
      >
        {isCurrentlyLoadingLines ? (
          <div className="flex flex-col items-center justify-center h-64">
            <LoadingSpinner />
            <p className="mt-2 text-slate-400">
              {isLoadingAiAnnotation
                ? 'AI 正在生成带角色标注的台本...'
                : '正在解析章节文本...'}
            </p>
          </div>
        ) : hasScriptLines ? (
          selectedChapter.scriptLines.map((line, index) => (
            <ScriptLineItem
              key={line.id}
              line={line}
              chapterId={selectedChapter.id}
              characters={characters}
              characterIdsInChapter={characterIdsInChapter}
              onUpdateText={(lineId, newText) =>
                handleUpdateScriptLineText(selectedChapter.id, lineId, newText)
              }
              onAssignCharacter={(lineId, charId) =>
                handleAssignCharacterToLine(selectedChapter.id, lineId, charId)
              }
              onMergeLines={(lineId) =>
                handleMergeAdjacentLines(selectedChapter.id, lineId)
              }
              onDelete={(lineId) =>
                handleDeleteScriptLine(selectedChapter.id, lineId)
              }
              cvStyles={cvStyles}
              isFocusedForSplit={focusedScriptLineId === line.id}
              onUpdateSoundType={(lineId, soundType) =>
                handleUpdateSoundType(selectedChapter.id, lineId, soundType)
              }
              onFocusChange={setFocusedScriptLineId}
              shortcutActiveLineId={shortcutActiveLineId}
              onActivateShortcutMode={setShortcutActiveLineId}
              customSoundTypes={currentProject?.customSoundTypes || []}
              onAddCustomSoundType={addCustomSoundType}
              onDeleteCustomSoundType={deleteCustomSoundType}
              canMoveUp={index > 0}
              canMoveDown={index < selectedChapter.scriptLines.length - 1}
              onMoveLineUp={() => handleMoveLineUp(line.id)}
              onMoveLineDown={() => handleMoveLineDown(line.id)}
              onOpenCvModal={openCvModal}
              onUpdateEmotion={(lineId, emotion) =>
                handleUpdateScriptLineEmotion(selectedChapter.id, lineId, emotion)
              }
            />
          ))
        ) : (
          <div className="text-slate-400 space-y-3 p-3 h-full flex flex-col">
            <p>
              {selectedChapter.rawContent.trim() === ''
                ? '这个章节还没有任何原始文本。'
                : '还没有生成剧本行。'}
              {selectedChapter.rawContent.trim() !== '' &&
                ' 可以使用上方的 “AI 标注章节” 或 “手动解析章节” 按钮生成台本行。'}
            </p>
            <div className="mt-4 p-3 bg-slate-700 rounded-md flex flex-col flex-grow">
              <div className="flex justify-between items-center mb-2 flex-shrink-0">
                <h4 className="text-sm font-semibold text-slate-300">
                  {hasScriptLines ? '原始章节内容预览' : '原始章节内容编辑'}
                </h4>
                {!hasScriptLines && (
                  <button
                    onClick={handleSaveRawContent}
                    disabled={!isRawContentDirty}
                    className="flex items-center px-2.5 py-1 text-xs bg-sky-600 hover:bg-sky-700 text-white rounded-md disabled:opacity-50"
                    title={
                      isRawContentDirty ? '保存对原始内容的修改' : '没有修改需要保存'
                    }
                  >
                    <SaveIcon className="w-3.5 h-3.5 mr-1" />
                    保存原文
                  </button>
                )}
              </div>
              {hasScriptLines ? (
                <pre className="text-xs text-slate-300 whitespace-pre-wrap overflow-y-auto flex-grow bg-slate-800 p-4 rounded-md">
                  {selectedChapter.rawContent}
                </pre>
              ) : (
                <textarea
                  value={editableRawContent}
                  onChange={handleRawContentChange}
                  className="text-xs text-slate-300 whitespace-pre-wrap overflow-y-auto flex-grow bg-slate-800 p-4 rounded-md w-full h-full resize-none border border-slate-600 focus:ring-1 focus:ring-sky-500 focus:border-sky-500 outline-none"
                  aria-label="原始章节内容编辑"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScriptEditorPanel;
