import { useState, useEffect, useMemo, useCallback } from 'react';
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
      // This prevents the app from being in a broken state and fixes the page jump bug.
      if (selectedChapterId && !currentProject.chapters.some(ch => ch.id === selectedChapterId)) {
        setSelectedChapterId(null);
      }
    }
  }, [currentProject, selectedChapterId, history, setSelectedChapterId]);

  const applyUndoableProjectUpdate = useCallback((updater: (prevProject: Project) => Project) => {
    const projectToUpdate = currentProject; // FIX: Use the up-to-date currentProject, not the stale one from history.
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
    const newChapter: Chapter = {
        id: `ch_${Date.now()}_${Math.random()}`,
        title: `新章节`,
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

    setSelectedChapterId(newChapter.id);
  }, [applyUndoableProjectUpdate, setSelectedChapterId]);

  const mergeChapters = useCallback((chapterIds: string[], targetChapterId: string) => {
    applyUndoableProjectUpdate(prevProject => {
      const targetChapter = prevProject.chapters.find(ch => ch.id === targetChapterId);
      if (!targetChapter) return prevProject;

      const chaptersToMerge = prevProject.chapters
        .filter(ch => chapterIds.includes(ch.id))
        .sort((a,b) => prevProject.chapters.findIndex(c => c.id === a.id) - prevProject.chapters.findIndex(c => c.id === b.id));

      let mergedRawContent = '';
      let mergedScriptLines: ScriptLine[] = [];
      chaptersToMerge.forEach(ch => {
        mergedRawContent += ch.rawContent + '\n\n';
        mergedScriptLines = mergedScriptLines.concat(ch.scriptLines);
      });
      
      const newChapters = prevProject.chapters
        .map(ch => ch.id === targetChapterId ? { ...ch, rawContent: mergedRawContent.trim(), scriptLines: mergedScriptLines } : ch)
        .filter(ch => !chapterIds.includes(ch.id) || ch.id === targetChapterId);

      return { ...prevProject, chapters: newChapters };
    });
    setSelectedChapterId(targetChapterId);
    setMultiSelectedChapterIds([]);
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
  };
};