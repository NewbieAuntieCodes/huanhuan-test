// FIX: Added React import to provide the React namespace for Dispatch and SetStateAction types.
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Chapter } from '../../../types';

interface UsePaginatedChaptersProps {
  chapters: Chapter[];
  projectId?: string;
  initialSelectedChapterIdForViewing: string | null;
  onSelectChapterForViewing: (id: string | null) => void;
  multiSelectedChapterIds: string[];
  // FIX: Added React import to provide the React namespace for Dispatch and SetStateAction types.
  setMultiSelectedChapterIdsContext: React.Dispatch<React.SetStateAction<string[]>>;
  onPageChangeSideEffects: () => void;
  chaptersPerPage?: number;
}

export const usePaginatedChapters = ({
  chapters,
  projectId,
  initialSelectedChapterIdForViewing,
  onSelectChapterForViewing,
  multiSelectedChapterIds,
  setMultiSelectedChapterIdsContext,
  onPageChangeSideEffects,
  chaptersPerPage = 100,
}: UsePaginatedChaptersProps) => {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(chapters.length / chaptersPerPage));

  // This effect handles jumping to the correct page ONLY when the user actively selects a new chapter.
  // It no longer depends on `chapters`, preventing jumps when the chapter data is refreshed.
  // 当用户切换选中的章节，或章节列表结构发生变化时，确保跳转到包含该章节的页面。
  // 通过对比当前页是否已包含选中章节来避免不必要的跳页。
  useEffect(() => {
    if (!initialSelectedChapterIdForViewing) return;
    const idx = chapters.findIndex(c => c.id === initialSelectedChapterIdForViewing);
    if (idx === -1) return; // 选中的章节尚未在可见列表中（例如数据仍在刷新中）

    const pageNumber = Math.floor(idx / chaptersPerPage) + 1;
    if (pageNumber !== currentPage) {
      setCurrentPage(pageNumber);
    }
  }, [initialSelectedChapterIdForViewing, chapters, chaptersPerPage]);
  
  // This effect now handles resetting the page when the project changes,
  // and correcting the page number if it becomes invalid (e.g., due to filtering).
  useEffect(() => {
    // On project change, reset to page 1
    setCurrentPage(1);
    // This effect should re-run when the projectId changes.
    // The component using this hook will re-mount or receive a new projectId prop,
    // which effectively resets the state including currentPage.
    // The dependency on projectId ensures this logic is tied to project switches.
  }, [projectId]);

  // This effect corrects the current page if it becomes out of bounds, for example after filtering.
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);


  const paginatedChapters = useMemo(() => {
    const startIndex = (currentPage - 1) * chaptersPerPage;
    const endIndex = startIndex + chaptersPerPage;
    return chapters.slice(startIndex, endIndex);
  }, [chapters, currentPage, chaptersPerPage]);

  const handlePageChange = useCallback((newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      onPageChangeSideEffects();
    }
  }, [totalPages, onPageChangeSideEffects]);
  
  const allVisibleChaptersSelected = useMemo(() => {
    if (paginatedChapters.length === 0) return false;
    // FIX: Ensure multiSelectedChapterIds is an array before calling .includes
    if (!Array.isArray(multiSelectedChapterIds)) return false;
    return paginatedChapters.every(ch => multiSelectedChapterIds.includes(ch.id));
  }, [paginatedChapters, multiSelectedChapterIds]);

  const handleToggleSelectAllOnPage = useCallback(() => {
    const visibleChapterIds = paginatedChapters.map(ch => ch.id);
    if (allVisibleChaptersSelected) {
      setMultiSelectedChapterIdsContext(prev => prev.filter(id => !visibleChapterIds.includes(id)));
    } else {
      setMultiSelectedChapterIdsContext(prev => [...new Set([...prev, ...visibleChapterIds])]);
    }
  }, [allVisibleChaptersSelected, paginatedChapters, setMultiSelectedChapterIdsContext]);

  return {
    currentPage,
    setCurrentPage,
    totalPages,
    paginatedChapters,
    handlePageChange,
    allVisibleChaptersSelected,
    handleToggleSelectAllOnPage,
  };
};
