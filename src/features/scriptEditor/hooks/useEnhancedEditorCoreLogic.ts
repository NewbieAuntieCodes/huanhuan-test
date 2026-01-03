import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Project, ScriptLine, CharacterFilterMode, Chapter } from '../../../types';
import { internalParseScriptToChapters } from '../../../lib/scriptParser';
import { useStore } from '../../../store/useStore';

interface UseEnhancedEditorCoreLogicProps {
  projectId: string;
  projects: Project[];
  onProjectUpdate: (project: Project) => void;
}

export const useEnhancedEditorCoreLogic = ({
  projectId,
  projects,
  onProjectUpdate,
}: UseEnhancedEditorCoreLogicProps) => {
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  const { selectedChapterId, setSelectedChapterId } = useStore(state => ({
    selectedChapterId: state.selectedChapterId,
    setSelectedChapterId: state.setSelectedChapterId,
  }));
  const [multiSelectedChapterIds, setMultiSelectedChapterIds] = useState<string[]>([]);
  const [selectedLineForPlayback, setSelectedLineForPlayback] = useState<ScriptLine | null>(null);
  const [focusedScriptLineId, setFocusedScriptLineId] = useState<string | null>(null);
  const [characterFilterMode, setCharacterFilterMode] = useState<CharacterFilterMode>('all');
  const [cvFilter, setCvFilter] = useState<string | null>(null);
  const [history, setHistory] = useState<Project[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const pendingNewChapterIdRef = useRef<string | null>(null);

  const currentProject = useMemo(() => projects.find(p => p.id === projectId), [projects, projectId]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  useEffect(() => {
    if (currentProject) {
      setIsLoadingProject(false);
      
      const isProjectSwitch = history.length === 0 || history[history.length - 1].id !== currentProject.id;
      if (isProjectSwitch) {
        setHistory([currentProject]);
        setHistoryIndex(0);
        setCvFilter(null); // Reset filter on project change
        // NOTE: Initial chapter selection is now fully handled by the `setSelectedProjectId` action in the store,
        // which correctly restores the last viewed chapter or the first chapter.
      }
      
      // If the selected chapter ID is no longer valid (e.g., deleted), clear it.
      // 防抖：如果是刚拆章产生的新 ID，等待下一次项目刷新再决定，避免误清空。
      if (selectedChapterId && !currentProject.chapters.some(ch => ch.id === selectedChapterId)) {
        const latest = history.length > 0 ? history[history.length - 1] : null;
        const existsInLatest = latest?.chapters?.some(ch => ch.id === selectedChapterId);
        const isPendingNewChapter = pendingNewChapterIdRef.current === selectedChapterId;
        if (!existsInLatest && !isPendingNewChapter) {
          console.info('[Editor] clearing selectedChapterId because not found in currentProject', {
            selectedChapterId,
            chapters: currentProject.chapters.length,
            projectHasPending: currentProject.chapters.some(ch => ch.id === pendingNewChapterIdRef.current),
          });
          setSelectedChapterId(null);
        }
      } else if (pendingNewChapterIdRef.current && currentProject.chapters.some(ch => ch.id === pendingNewChapterIdRef.current)) {
        // 新章节已反映到 props，清理 pending 状态
        console.info('[Editor] pending new chapter now present, clearing pending flag', { pendingId: pendingNewChapterIdRef.current });
        pendingNewChapterIdRef.current = null;
      }
    }
  }, [currentProject, selectedChapterId, history, setSelectedChapterId]);

  const applyUndoableProjectUpdate = useCallback((updater: (prevProject: Project) => Project) => {
    // FIX: Use the up-to-date currentProject from the hook's scope, not a stale one from history.
    const projectToUpdate = currentProject;
    if (!projectToUpdate) return;

    const newProject = updater(projectToUpdate);
    const newHistory = history.slice(0, historyIndex + 1);
    setHistory([...newHistory, newProject]);
    setHistoryIndex(newHistory.length);
    onProjectUpdate(newProject);
  }, [history, historyIndex, onProjectUpdate, currentProject]); // Add currentProject dependency

  const undo = useCallback(() => {
    if (canUndo) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      onProjectUpdate(history[newIndex]);
    }
  }, [canUndo, history, historyIndex, onProjectUpdate]);

  const redo = useCallback(() => {
    if (canRedo) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      onProjectUpdate(history[newIndex]);
    }
  }, [canRedo, history, historyIndex, onProjectUpdate]);
  
  const parseProjectChaptersAndUpdateHistory = useCallback(() => {
    if (!currentProject || !currentProject.rawFullScript) return;
    const newChapters = internalParseScriptToChapters(currentProject.rawFullScript, currentProject.name);
    applyUndoableProjectUpdate(prev => ({ ...prev, chapters: newChapters }));
  }, [currentProject, applyUndoableProjectUpdate]);

  const updateChapterTitleInHistory = useCallback((chapterId: string, newTitle: string) => {
    applyUndoableProjectUpdate(prev => ({
      ...prev,
      chapters: prev.chapters.map(ch => ch.id === chapterId ? { ...ch, title: newTitle } : ch)
    }));
  }, [applyUndoableProjectUpdate]);

  const undoableUpdateChapterRawContent = useCallback((chapterId: string, newRawContent: string) => {
    applyUndoableProjectUpdate(prev => ({
        ...prev,
        chapters: prev.chapters.map(ch =>
            ch.id === chapterId ? { ...ch, rawContent: newRawContent, scriptLines: [] } : ch
        )
    }));
  }, [applyUndoableProjectUpdate]);

  const insertChapterAfter = useCallback((afterChapterId: string) => {
    // ����� CV ɸѡ��ȷ���²����½������ɼ�
    setCvFilter(null);
    const newChapter: Chapter = {
        id: `ch_${Date.now()}_${Math.random()}`,
        title: `���½�`,
        rawContent: '',
        scriptLines: [],
    };
    
    applyUndoableProjectUpdate(prevProject => {
      const afterIndex = prevProject.chapters.findIndex(c => c.id === afterChapterId);
      if (afterIndex === -1) {
        return {
          ...prevProject,
          chapters: [...prevProject.chapters, newChapter],
        };
      }

      const newChapters = [...prevProject.chapters];
      newChapters.splice(afterIndex + 1, 0, newChapter);

      return {
        ...prevProject,
        chapters: newChapters,
      };
    });

    // ѡ���²�����½ڡ�Ϊ��������Ŀ�첽�������ǰ������Чѡ�С��߼���գ����������ӳ١�
    setTimeout(() => setSelectedChapterId(newChapter.id), 50);
    // �����ǰӦ���� CV ���ˣ��½��½�ͨ��û���лᱻ���˵���
    // ѡ���½��Ѿ��ᱻǿ�Ʊ�������Ϊ�˸�ֱ�ۣ�����ͬʱ���һ�� CV ���ˡ�
    setCvFilter(null);
  }, [applyUndoableProjectUpdate, setSelectedChapterId, setCvFilter]);

  const mergeChapters = useCallback((chapterIds: string[], targetChapterId: string) => {
    applyUndoableProjectUpdate(prevProject => {
      const targetChapter = prevProject.chapters.find(ch => ch.id === targetChapterId);
      if (!targetChapter) return prevProject;

      const chaptersToMerge = prevProject.chapters
        .filter(ch => chapterIds.includes(ch.id))
        .sort((a,b) => prevProject.chapters.findIndex(c => c.id === a.id) - prevProject.chapters.findIndex(c => c.id === b.id));

      // Fallback: ����½ڵ� rawContent Ϊ�գ�����̨���ı�ƴ�ӣ����⡰������û�仯��������
      const getSafeRawContent = (ch: Chapter): string => {
        const trimmed = (ch.rawContent || '').trim();
        if (trimmed.length > 0) return trimmed;
        return (ch.scriptLines || []).map(l => l.text).join('\n');
      };

      let mergedRawContentParts: string[] = [];
      let mergedScriptLines: ScriptLine[] = [];
      chaptersToMerge.forEach(ch => {
        mergedRawContentParts.push(getSafeRawContent(ch));
        mergedScriptLines = mergedScriptLines.concat(ch.scriptLines);
      });

      const mergedRawContent = mergedRawContentParts.join('\n\n').trim();
      
      const newChapters = prevProject.chapters
        .map(ch => ch.id === targetChapterId ? { ...ch, rawContent: mergedRawContent, scriptLines: mergedScriptLines } : ch)
        .filter(ch => !chapterIds.includes(ch.id) || ch.id === targetChapterId);

      return { ...prevProject, chapters: newChapters };
    });
    setSelectedChapterId(targetChapterId);
    setMultiSelectedChapterIds([]);
  }, [applyUndoableProjectUpdate, setSelectedChapterId, setMultiSelectedChapterIds]);

  const splitChapterAtLine = useCallback((chapterId: string, lineId: string) => {
    const newChapterId = `ch_${Date.now()}_${Math.random()}`;
    let didSplit = false;

    console.info('[splitChapterAtLine] start', { chapterId, lineId, newChapterId });

    applyUndoableProjectUpdate(prevProject => {
      // 优先使用当前选中章节；如果不包含该行，再全局查找一次，避免因状态不同步导致拆分失败。
      let chapterIndex = prevProject.chapters.findIndex(ch => ch.id === chapterId && ch.scriptLines.some(l => l.id === lineId));
      if (chapterIndex === -1) {
        chapterIndex = prevProject.chapters.findIndex(ch => ch.scriptLines.some(l => l.id === lineId));
      }
      if (chapterIndex === -1) {
        console.warn('[splitChapterAtLine] abort: no chapter contains lineId', { chapterId, lineId });
        return prevProject;
      }

      const chapter = prevProject.chapters[chapterIndex];
      const lineIndex = chapter.scriptLines.findIndex(l => l.id === lineId);
      if (lineIndex === -1) {
        console.warn('[splitChapterAtLine] abort: lineId not found in chapter', { chapterId: chapter.id, lineId });
        return prevProject;
      }

      // 如果拆分点在第一条或最后一条，仍允许拆分：前半/后半允许为空。
      const beforeLines = chapter.scriptLines.slice(0, lineIndex);
      const afterLines = chapter.scriptLines.slice(lineIndex);
      const beforeRaw = beforeLines.map(l => l.text).join('\n');
      const afterRaw = afterLines.map(l => l.text).join('\n');

      const newChapter: Chapter = {
        id: newChapterId,
        title: `${chapter.title || '新章节'}（下）`,
        rawContent: afterRaw,
        scriptLines: afterLines,
      };

      const updatedCurrent: Chapter = {
        ...chapter,
        rawContent: beforeRaw,
        scriptLines: beforeLines,
      };

      const newChapters = [...prevProject.chapters];
      newChapters[chapterIndex] = updatedCurrent;
      newChapters.splice(chapterIndex + 1, 0, newChapter);

      didSplit = true;
      console.info('[splitChapterAtLine] split done', {
        chapterId: chapter.id,
        lineId,
        newChapterId,
        beforeCount: beforeLines.length,
        afterCount: afterLines.length,
        chapterIndex,
      });
      return { ...prevProject, chapters: newChapters };
    });

    // 只有真正拆分成功才切换选中章节
    if (didSplit) {
      pendingNewChapterIdRef.current = newChapterId;
      console.info('[splitChapterAtLine] selecting new chapter', { newChapterId });
      setTimeout(() => setSelectedChapterId(newChapterId), 50);
      setMultiSelectedChapterIds([]);
    }
  }, [applyUndoableProjectUpdate, setSelectedChapterId, setMultiSelectedChapterIds]);

  return {
    currentProject,
    isLoadingProject,
    selectedChapterId,
    setSelectedChapterId,
    multiSelectedChapterIds,
    setMultiSelectedChapterIds,
    selectedLineForPlayback,
    setSelectedLineForPlayback,
    focusedScriptLineId,
    setFocusedScriptLineId,
    characterFilterMode,
    setCharacterFilterMode,
    cvFilter,
    setCvFilter,
    applyUndoableProjectUpdate,
    parseProjectChaptersAndUpdateHistory,
    updateChapterTitleInHistory,
    undoableUpdateChapterRawContent,
    undo,
    redo,
    canUndo,
    canRedo,
    insertChapterAfter,
    mergeChapters,
    splitChapterAtLine,
  };
};
