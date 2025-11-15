import { useState, useCallback, useMemo, useEffect } from 'react';
import { useStore } from '../../../store/useStore';
import { TextMarker, PinnedSound, IgnoredSoundKeyword } from '../../../types';

// Helper to find lineId and offset from a Range endpoint
const findLineIdAndOffset = (container: Node, offset: number): { lineId: string; offset: number } | null => {
    const lineElement = (
      container.nodeType === Node.ELEMENT_NODE ? (container as Element) : (container.parentElement as Element | null)
    )?.closest('[data-line-id]');

    if (!lineElement) return null;
    const lineId = lineElement.getAttribute('data-line-id')!;
    
    const pElement = lineElement.querySelector('p');
    if (!pElement) return null;

    // Create a range from the start of the paragraph to the cursor position
    const range = document.createRange();
    range.selectNodeContents(pElement);
    try {
        range.setEnd(container, offset);
    } catch (e) {
        // This can fail if the container/offset is invalid, e.g., in a different DOM tree.
        // We can ignore it and the length will be the full content, which is a safe fallback.
    }

    // The length of the range's content is the offset from the start of the paragraph
    const calculatedOffset = range.toString().length;

    return { lineId, offset: calculatedOffset };
};


export const usePostProduction = () => {
    const {
        selectedProjectId,
        projects,
        updateProjectTextMarkers,
        updateLineText,
        updateProject,
        addIgnoredSoundKeyword,
    } = useStore((state) => ({
        selectedProjectId: state.selectedProjectId,
        projects: state.projects,
        updateProjectTextMarkers: state.updateProjectTextMarkers,
        updateLineText: state.updateLineText,
        updateProject: state.updateProject,
        addIgnoredSoundKeyword: state.addIgnoredSoundKeyword,
    }));

    const [selectedRange, setSelectedRange] = useState<Range | null>(null);
    const [isSceneModalOpen, setIsSceneModalOpen] = useState(false);
    const [isBgmModalOpen, setIsBgmModalOpen] = useState(false);
    const [isSfxModalOpen, setIsSfxModalOpen] = useState(false);
    const [editingMarker, setEditingMarker] = useState<TextMarker | null>(null);

    const currentProject = useMemo(() => projects.find((p) => p.id === selectedProjectId), [projects, selectedProjectId]);
    const textMarkers = useMemo(() => currentProject?.textMarkers || [], [currentProject]);

    // 暴露全局桥接（供分行操作直接提交完整 Project）
    useEffect(() => {
        (window as any).__pp_updateProject = updateProject;
        return () => { try { delete (window as any).__pp_updateProject; } catch {} };
    }, [updateProject]);

    const handleTextSelect = useCallback((range: Range | null) => {
        setSelectedRange(range);
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedRange(null);
        window.getSelection()?.removeAllRanges();
    }, []);

    const handleClearFormatting = useCallback(() => {
        if (!selectedRange || !currentProject) return;
        
        // Define robust regexes once.
        const sfxRegex = /[\[\uFF3B\u3010\u3014][^\]\uFF3D\u3011\u3015]+[\]\uFF3D\u3011\u3015]/g; // [..] and full-width variants
        const bgmRegex = /<\s*(?:(?:\?-|[\u266A\u266B])\s*-\s*)?([^<>]*?)\s*>/g; // <..> or <?-..> or <♫-..> etc. with spaces
        const endRegex = /\/\/+\s*/g; // // or /// with optional space

        const { startContainer, startOffset, endContainer, endOffset } = selectedRange;
        const start = findLineIdAndOffset(startContainer, startOffset);
        const end = findLineIdAndOffset(endContainer, endOffset);
        if (!start || !end) { 
            console.warn('[CF] 选区无法定位到行元素(data-line-id)；放弃。', { start, end });
            clearSelection(); 
            return; 
        }

        // Normalize order (start <= end)
        const getLineOrderMap = () => {
            const map = new Map<string, number>();
            currentProject.chapters.forEach((ch, chIdx) => ch.scriptLines.forEach((ln, lnIdx) => map.set(ln.id, chIdx * 1e6 + lnIdx)));
            return map;
        };
        const orderMap = getLineOrderMap();
        const startKey = orderMap.get(start.lineId) ?? 0;
        const endKey = orderMap.get(end.lineId) ?? 0;
        const first = startKey <= endKey ? start : end;
        const last  = startKey <= endKey ? end   : start;

        // Build list of affected lines
        const affected: { chapterId: string; lineId: string; text: string }[] = [];
        for (const ch of currentProject.chapters) {
            for (const ln of ch.scriptLines) {
                const k = orderMap.get(ln.id) ?? 0;
                if (k < (orderMap.get(first.lineId) ?? 0)) continue;
                if (k > (orderMap.get(last.lineId) ?? 0)) continue;
                affected.push({ chapterId: ch.id, lineId: ln.id, text: ln.text || '' });
            }
        }

        const updates: Array<Promise<void>> = [];

        for (const rec of affected) {
            // FIX: Replace undefined 'startLineId' and 'endLineId' with 'first.lineId' and 'last.lineId' from the correctly defined scope.
            const isFirst = rec.lineId === first.lineId;
            const isLast = rec.lineId === last.lineId;
            const isMultiLine = first.lineId !== last.lineId;
            const isCollapsed = first.lineId === last.lineId && first.offset === last.offset;

            let selStart = isFirst ? first.offset : 0;
            let selEnd = isLast ? last.offset : rec.text.length;
            
            if (isMultiLine) {
                selStart = 0;
                selEnd = rec.text.length;
            }
            if (!isCollapsed && selStart >= selEnd) continue;

            type Span = { from: number; to: number };
            const spans: Span[] = [];

            const findOverlappingSpans = (regex: RegExp) => {
                let match;
                while ((match = regex.exec(rec.text)) !== null) {
                    const from = match.index;
                    const to = from + match[0].length;
                    
                    if (isCollapsed) {
                        if (from <= selStart && to >= selStart) {
                            spans.push({ from, to });
                            break; // Found the containing marker, no need to check others in this line
                        }
                    } else {
                        const overlap = Math.max(0, Math.min(to, selEnd) - Math.max(from, selStart));
                        if (overlap > 0) {
                            spans.push({ from, to });
                        }
                    }
                }
            };
            
            findOverlappingSpans(sfxRegex);
            findOverlappingSpans(bgmRegex);
            findOverlappingSpans(endRegex);

            if (spans.length === 0) continue;

            spans.sort((a, b) => a.from - b.from);
            const mergedSpans: Span[] = [];
            for (const s of spans) {
                const lastSpan = mergedSpans[mergedSpans.length - 1];
                if (!lastSpan || s.from > lastSpan.to) {
                    mergedSpans.push({ ...s });
                } else {
                    lastSpan.to = Math.max(lastSpan.to, s.to);
                }
            }

            let newText = '';
            let lastIndex = 0;
            for (const span of mergedSpans) {
                newText += rec.text.slice(lastIndex, span.from);
                lastIndex = span.to;
            }
            newText += rec.text.slice(lastIndex);
            
            updates.push(updateLineText(currentProject.id, rec.chapterId, rec.lineId, newText));
        }

        const intersects = (mStart: { lineId: string; offset?: number }, mEnd: { lineId: string; offset?: number }) => {
            const keyOf = (id: string, off: number) => (orderMap.get(id) ?? 0) * 1e4 + off;
            const selA = keyOf(first.lineId, first.offset);
            const selB = keyOf(last.lineId, last.offset);
            const a = keyOf(mStart.lineId, mStart.offset ?? 0);
            const b = keyOf(mEnd.lineId, mEnd.offset ?? 0);
            const minSel = Math.min(selA, selB), maxSel = Math.max(selA, selB);
            const minM = Math.min(a, b), maxM = Math.max(a, b);
            return !(maxM <= minSel || minM >= maxSel);
        };

        const nextMarkers = (currentProject.textMarkers || []).filter(m => {
            if (m.type !== 'scene') return true;
            if (!m.startLineId || !m.endLineId) return true;
            return !intersects({ lineId: m.startLineId, offset: m.startOffset ?? 0 }, { lineId: m.endLineId, offset: m.endOffset ?? 0 });
        });

        if (nextMarkers.length !== (currentProject.textMarkers || []).length) {
            updateProjectTextMarkers(currentProject.id, nextMarkers);
        }

        Promise.all(updates).finally(clearSelection);
    }, [selectedRange, currentProject, updateLineText, updateProjectTextMarkers, clearSelection]);

    const handleSaveScene = useCallback((sceneName: string) => {
        if (!selectedRange || !currentProject) return;
        const { startContainer, startOffset, endContainer, endOffset } = selectedRange;
        const startResult = findLineIdAndOffset(startContainer, startOffset);
        const endResult = findLineIdAndOffset(endContainer, endOffset);

        if (startResult && endResult) {
            const newMarker: TextMarker = {
                id: `scene_${Date.now()}`,
                type: 'scene',
                name: sceneName,
                startLineId: startResult.lineId,
                startOffset: startResult.offset,
                endLineId: endResult.lineId,
                endOffset: endResult.offset,
            };
            updateProjectTextMarkers(currentProject.id, [...textMarkers, newMarker]);
        } else {
            alert('无法确定所选文本的起止位置，请重新选择');
        }
        setIsSceneModalOpen(false);
        clearSelection();
    }, [selectedRange, currentProject, textMarkers, updateProjectTextMarkers, clearSelection]);

    const handleSaveBgm = useCallback((bgmName: string) => {
        if (!selectedRange || !currentProject) return;
        const name = bgmName.trim();
        if (!name) {
          alert('请输入背景音乐（BGM）名称或标识');
          return;
        }
        
        // Use a format that is easily distinguishable and parsable
        const bracketed = `<${name}>`;
    
        const { startContainer, startOffset } = selectedRange;
        const startResult = findLineIdAndOffset(startContainer, startOffset);
    
        if (!startResult) {
            alert('无法确定插入位置，请重新在文本中点击');
            return;
        }
    
        const { lineId, offset } = startResult;
        let targetChapterId: string | null = null;
        let currentLineText: string | null = null;
        for (const ch of currentProject.chapters) {
            const line = ch.scriptLines.find(l => l.id === lineId);
            if (line) {
                targetChapterId = ch.id;
                currentLineText = line.text || '';
                break;
            }
        }
        if (!targetChapterId || currentLineText === null) {
            alert('找不到目标文本行，请重试');
            return;
        }
    
        const newText = currentLineText.slice(0, offset) + bracketed + currentLineText.slice(offset);
    
        updateLineText(currentProject.id, targetChapterId, lineId, newText);
        setIsBgmModalOpen(false);
        clearSelection();
    }, [selectedRange, currentProject, updateLineText, clearSelection]);

    const handleSaveSfx = useCallback((rawSfxText: string) => {
        if (!selectedRange || !currentProject) return;
        const sfx = rawSfxText.trim();
        if (!sfx) return;
        const bracketed = sfx.startsWith('[') && sfx.endsWith(']') ? sfx : `[${sfx}]`;

        const { startContainer, startOffset, endContainer, endOffset, collapsed } = selectedRange;
        const startResult = findLineIdAndOffset(startContainer, startOffset);
        const endResult = findLineIdAndOffset(endContainer, endOffset);

        if (!startResult) {
            alert('无法确定插入位置，请重新在文本中点击或选择');
            return;
        }

        // Find target line and chapter
        const { lineId: startLineId, offset: startPos } = startResult;
        let targetChapterId: string | null = null;
        let currentLineText: string | null = null;
        for (const ch of currentProject.chapters) {
            const line = ch.scriptLines.find(l => l.id === startLineId);
            if (line) {
                targetChapterId = ch.id;
                currentLineText = line.text || '';
                break;
            }
        }
        if (!targetChapterId || currentLineText === null) {
            alert('找不到目标文本行，请重试');
            return;
        }

        let newText = currentLineText;
        if (!collapsed && endResult && endResult.lineId === startLineId) {
            const a = Math.min(startPos, endResult.offset);
            const b = Math.max(startPos, endResult.offset);
            newText = currentLineText.slice(0, a) + bracketed + currentLineText.slice(b);
        } else {
            // 插入到光标处
            const pos = startPos;
            newText = currentLineText.slice(0, pos) + bracketed + currentLineText.slice(pos);
        }

        updateLineText(currentProject.id, targetChapterId, startLineId, newText);
        setIsSfxModalOpen(false);
        clearSelection();
    }, [selectedRange, currentProject, updateLineText, clearSelection]);

    const handleDeleteMarker = useCallback((id: string) => {
        if (!currentProject) return;
        const next = textMarkers.filter((m) => m.id !== id);
        updateProjectTextMarkers(currentProject.id, next);
        setEditingMarker(null);
    }, [currentProject, textMarkers, updateProjectTextMarkers]);

    const handleRenameMarker = useCallback((id: string, newName: string) => {
        if (!currentProject) return;
        const next = textMarkers.map((m) => (m.id === id ? { ...m, name: newName } : m));
        updateProjectTextMarkers(currentProject.id, next);
        setEditingMarker((prev) => (prev ? { ...prev, name: newName } : prev));
    }, [currentProject, textMarkers, updateProjectTextMarkers]);

    const handleUpdateRangeFromSelection = useCallback((id: string) => {
        if (!selectedRange || !currentProject) return;
        const { startContainer, startOffset, endContainer, endOffset } = selectedRange;
        const startResult = findLineIdAndOffset(startContainer, startOffset);
        const endResult = findLineIdAndOffset(endContainer, endOffset);
        if (startResult && endResult) {
            const next = textMarkers.map((m) =>
                m.id === id
                    ? { ...m, startLineId: startResult.lineId, startOffset: startResult.offset, endLineId: endResult.lineId, endOffset: endResult.offset }
                    : m
            );
            updateProjectTextMarkers(currentProject.id, next);
        } else {
            alert('当前选区无法解析，请重新框选');
        }
    }, [selectedRange, currentProject, textMarkers, updateProjectTextMarkers]);

    const handleUpdateColor = useCallback((id: string, color?: string) => {
        if (!currentProject) return;
        const next = textMarkers.map((m) => (m.id === id ? { ...m, color } : m));
        updateProjectTextMarkers(currentProject.id, next);
        (window as any).__applyMarkerColor?.(id, color);
        setEditingMarker((prev) => (prev ? ({ ...prev, color } as TextMarker) : prev));
    }, [currentProject, textMarkers, updateProjectTextMarkers]);
    
    const handlePinSound = useCallback((lineId: string, chapterId: string, charIndex: number, keyword: string, soundId: number | null, soundName: string | null) => {
        if (!currentProject) return;
    
        const updatedProject = {
            ...currentProject,
            chapters: currentProject.chapters.map(ch => {
                if (ch.id !== chapterId) return ch;
                return {
                    ...ch,
                    scriptLines: ch.scriptLines.map(line => {
                        if (line.id === lineId) {
                            const existingPinned = line.pinnedSounds || [];
                            // Remove any existing pin for this keyword instance
                            const filtered = existingPinned.filter(p => !(p.keyword === keyword && p.index === charIndex));
                            
                            if (soundId !== null && soundName !== null) {
                                const newPin: PinnedSound = { keyword, index: charIndex, soundId, soundName };
                                return {
                                    ...line,
                                    pinnedSounds: [...filtered, newPin]
                                };
                            } else { // unpinning
                                return {
                                    ...line,
                                    pinnedSounds: filtered.length > 0 ? filtered : undefined // remove array if empty
                                };
                            }
                        }
                        return line;
                    })
                };
            })
        };
        updateProject(updatedProject);
    }, [currentProject, updateProject]);

    return {
        currentProject,
        textMarkers,
        selectedRange,
        isSceneModalOpen,
        isBgmModalOpen,
        isSfxModalOpen,
        editingMarker,
        suspendLayout: isSceneModalOpen || isBgmModalOpen || !!editingMarker,
        handleTextSelect,
        openSceneModal: () => { if(selectedRange) setIsSceneModalOpen(true); },
        closeSceneModal: () => setIsSceneModalOpen(false),
        openBgmModal: () => { if(selectedRange) setIsBgmModalOpen(true); },
        closeBgmModal: () => setIsBgmModalOpen(false),
        openSfxModal: () => { if(selectedRange) setIsSfxModalOpen(true); },
        closeSfxModal: () => setIsSfxModalOpen(false),
        openEditModal: setEditingMarker,
        closeEditModal: () => setEditingMarker(null),
        handleSaveScene,
        handleSaveBgm,
        handleSaveSfx,
        handleDeleteMarker,
        handleRenameMarker,
        handleUpdateRangeFromSelection,
        handleUpdateColor,
        handlePinSound,
        handleClearFormatting,
        updateLineText,
    };
};

// 暴露一个仅供调试的全局函数：读取最近一次清除格式的计算结果
// 使用：在控制台运行 window.__pp_lastCFDebug 查看
