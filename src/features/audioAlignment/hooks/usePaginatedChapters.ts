import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Chapter } from '../../../types';

interface UsePaginatedChaptersProps {
  chapters: Chapter[];
  projectId?: string;
  initialSelectedChapterIdForViewing: string | null;
  onSelectChapterForViewing: (id: string | null) => void;
  multiSelectedChapterIds: string[];
  // FIX: The setter from Zustand does not accept a function, so the type is simplified.
  setMultiSelectedChapterIdsContext: (ids: string[]) => void;
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
  useEffect(() => {
    if (initialSelectedChapterIdForViewing) {
      const chapterIndex = chapters.findIndex(c => c.id === initialSelectedChapterIdForViewing);
      if (chapterIndex !== -1) {
        const pageNumber = Math.floor(chapterIndex / chaptersPerPage) + 1;
        if (pageNumber !== currentPage) {
          setCurrentPage(pageNumber);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelectedChapterIdForViewing]);
  
  // This effect now handles resetting the page when the project changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [projectId]);

  // This effect corrects the current page if it becomes out of bounds.
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
      const newIds = multiSelectedChapterIds.filter(id => !visibleChapterIds.includes(id));
      setMultiSelectedChapterIdsContext(newIds);
    } else {
      const newIds = [...new Set([...multiSelectedChapterIds, ...visibleChapterIds])];
      setMultiSelectedChapterIdsContext(newIds);
    }
  }, [allVisibleChaptersSelected, paginatedChapters, multiSelectedChapterIds, setMultiSelectedChapterIdsContext]);

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
