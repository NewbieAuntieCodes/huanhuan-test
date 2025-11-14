import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { TextMarker, Chapter } from '../../../types';

// Palette definitions (can be moved to a constants file)
const BGM_PALETTE = [
    'hsla(52, 98%, 96%, 0.46)',
    'hsla(332, 98%, 96%, 0.46)',
    'hsla(168, 96%, 95%, 0.46)',
    'hsla(202, 97%, 95%, 0.46)',
    'hsla(265, 96%, 96%, 0.46)',
    'hsla(24,  98%, 95%, 0.46)',
];
const getBgmColor = (ordinal: number): string => BGM_PALETTE[(ordinal - 1) % BGM_PALETTE.length];

export type BgmLabelOverlay = {
    id: string;
    name: string;
    displayNameParts: string[];
    top: number;
    left: number;
    bgColor: string;
    textColor: string;
};


export const useMarkerRendering = (
    textMarkers: TextMarker[],
    chapters: Chapter[],
    suspendLayout?: boolean,
    expandedChapterId?: string | null
) => {
    const contentRef = useRef<HTMLDivElement>(null);
    const lastMarkersRef = useRef<TextMarker[]>([]);
    const [bgmLabelOverlays, setBgmLabelOverlays] = useState<BgmLabelOverlay[]>([]);

    const bgmMarkers = useMemo(() => [], []); // No more BGM markers

    const lineIdToChapterIndex = useMemo(() => {
        const map = new Map<string, number>();
        chapters.forEach((ch, chIdx) => ch.scriptLines.forEach((ln) => map.set(ln.id, chIdx)));
        return map;
    }, [chapters]);

    const lineIdToLineOrder = useMemo(() => {
        const map = new Map<string, number>();
        chapters.forEach((ch) => ch.scriptLines.forEach((ln, lnIdx) => map.set(ln.id, lnIdx)));
        return map;
    }, [chapters]);

    const markerOrdinalMap = useMemo(() => {
        const map = new Map<string, number>();
        const chapterGrouped: Record<number, { id: string; startOrder: number }[]> = {};
        bgmMarkers.forEach((m) => {
            const chIdx = lineIdToChapterIndex.get(m.startLineId) ?? 0;
            const order = (lineIdToLineOrder.get(m.startLineId) ?? 0) * 1e6 + (m.startOffset ?? 0);
            (chapterGrouped[chIdx] || (chapterGrouped[chIdx] = [])).push({ id: m.id, startOrder: order });
        });
        Object.values(chapterGrouped).forEach(list => list.sort((a, b) => a.startOrder - b.startOrder).forEach((item, idx) => map.set(item.id, idx + 1)));
        return map;
    }, [bgmMarkers, lineIdToChapterIndex, lineIdToLineOrder]);


    const recomputeBgmLabelOverlays = useCallback(() => {
        const contentEl = contentRef.current;
        if (!contentEl || suspendLayout) return;

        const scrollableContainer = contentEl;
        if (!scrollableContainer) return;
        
        const containerRect = scrollableContainer.getBoundingClientRect();
        const newOverlays: BgmLabelOverlay[] = [];

        bgmMarkers.forEach(marker => {
            const markEl = contentEl.querySelector(`mark[data-marker-id="${marker.id}"]`);
            if (markEl) {
                const clientRects = markEl.getClientRects();
                if (clientRects.length > 0) {
                    const firstLineRect = clientRects[0];
                    const top = firstLineRect.top - containerRect.top + scrollableContainer.scrollTop;
                    
                    const baseColor = marker.color || getBgmColor(markerOrdinalMap.get(marker.id) ?? 1);
                    const bgColor = baseColor.replace(/, ?([\d\.]+)\)$/, ', 0.85)');
                    const displayNameParts = (marker.name || 'BGM').replace(/_/g, '-').split('-');
                    
                    newOverlays.push({
                        id: marker.id,
                        name: marker.name || 'BGM',
                        displayNameParts,
                        top: Math.max(0, top),
                        left: 8, // Position in the left gutter
                        bgColor,
                        textColor: '#1e293b'
                    });
                }
            }
        });

        setBgmLabelOverlays(newOverlays);
    }, [bgmMarkers, markerOrdinalMap, suspendLayout]);

    const recalculateBgmHighlights = useCallback(() => {
        const contentEl = contentRef.current;
        if (!contentEl || suspendLayout) return;

        // Clean up previous highlights
        contentEl.querySelectorAll('mark.bgm-highlight').forEach((mark) => {
            const parent = mark.parentNode;
            if (parent) {
                while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
                parent.removeChild(mark);
            }
        });
        contentEl.normalize();

        bgmMarkers.forEach((marker) => {
            if (marker.startOffset === undefined || marker.endOffset === undefined) return;
            const lineBlocks = Array.from(contentEl.querySelectorAll('[data-line-id]')) as HTMLElement[];
            const sIdx = lineBlocks.findIndex(el => el.dataset.lineId === marker.startLineId);
            const eIdx = lineBlocks.findIndex(el => el.dataset.lineId === marker.endLineId);
            if (sIdx === -1 || eIdx === -1) return;

            const findNode = (p: Element, offset: number) => {
              const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
              let accumulated = 0;
              let node;
              while (node = walker.nextNode()) {
                const len = node.textContent?.length || 0;
                if (accumulated + len >= offset) return { node, offset: offset - accumulated };
                accumulated += len;
              }
              return { node: p.lastChild || p, offset: (p.lastChild as Text)?.length || 0 };
            };

            for (let i = sIdx; i <= eIdx; i++) {
                const p = lineBlocks[i].querySelector('p');
                if (!p || !p.firstChild) continue;
                try {
                    const range = document.createRange();
                    if (i === sIdx) range.setStart(findNode(p, marker.startOffset).node, findNode(p, marker.startOffset).offset);
                    else range.setStart(p.firstChild, 0);
                    if (i === eIdx) range.setEnd(findNode(p, marker.endOffset).node, findNode(p, marker.endOffset).offset);
                    else range.setEndAfter(p.lastChild);

                    const mark = document.createElement('mark');
                    mark.className = 'bgm-highlight';
                    mark.dataset.markerId = marker.id;
                    mark.style.backgroundColor = marker.color || getBgmColor(markerOrdinalMap.get(marker.id) ?? 1);
                    mark.style.borderRadius = '3px';
                    mark.title = marker.name || 'BGM';
                    range.surroundContents(mark);
                } catch (e) {
                    console.error('BGM highlight error:', e);
                }
            }
        });

    }, [bgmMarkers, suspendLayout, markerOrdinalMap]);

    useEffect(() => {
        if (!suspendLayout) {
            // A timeout gives React time to render the newly expanded content
            setTimeout(() => {
                recalculateBgmHighlights();
                recomputeBgmLabelOverlays();
            }, 50);
        }
        lastMarkersRef.current = textMarkers;
    }, [textMarkers, suspendLayout, recalculateBgmHighlights, recomputeBgmLabelOverlays, expandedChapterId]);
    
    useEffect(() => {
        if (suspendLayout) return;
        
        const scrollableParent = contentRef.current;
        if (!scrollableParent) return;

        let timeoutId: number;
        const handle = () => {
          clearTimeout(timeoutId);
          timeoutId = window.setTimeout(() => {
            recomputeBgmLabelOverlays();
          }, 120);
        };

        window.addEventListener('resize', handle);
        scrollableParent.addEventListener('scroll', handle);

        return () => {
          window.removeEventListener('resize', handle);
          scrollableParent.removeEventListener('scroll', handle);
          clearTimeout(timeoutId);
        };
    }, [recomputeBgmLabelOverlays, suspendLayout]);


    return {
        contentRef,
        bgmLabelOverlays,
    };
};