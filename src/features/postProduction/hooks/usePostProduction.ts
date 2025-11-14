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
    range.setEnd(container, offset);

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

        const { startContainer, startOffset, endContainer, endOffset } = selectedRange;
        const start = findLineIdAndOffset(startContainer, startOffset);
        const end = findLineIdAndOffset(endContainer, endOffset);
        if (!start || !end) { 
            console.warn('[CF] 选区无法定位到行元素(data-line-id)；放弃。', { start, end });
            clearSelection(); 
            return; 
        }

        try {
            const rawSelText = (() => {
                try { return selectedRange.toString(); } catch { return ''; }
            })();
            console.group('[CF] handleClearFormatting 选区');
            console.log({
                collapsed: selectedRange.collapsed,
                start,
                end,
                textLen: rawSelText?.length ?? 0,
                textHead: rawSelText?.slice(0, 80)
            });
            console.groupEnd();
        } catch {}

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

        // Build list of affected lines with chapterId lookup
        const affected: { chapterId: string; lineId: string; text: string }[] = [];
        for (const ch of currentProject.chapters) {
            for (const ln of ch.scriptLines) {
                const k = orderMap.get(ln.id) ?? 0;
                if (k < (orderMap.get(first.lineId) ?? 0)) continue;
                if (k > (orderMap.get(last.lineId) ?? 0)) continue;
                affected.push({ chapterId: ch.id, lineId: ln.id, text: ln.text || '' });
            }
        }

        console.log('[CF] 受影响的行数/IDs:', affected.length, affected.map(a => a.lineId));

        const startLineId = first.lineId;
        const endLineId = last.lineId;
        const isMultiLine = startLineId !== endLineId;
        const updates: Array<Promise<void>> = [];

        const sfxRegex = /\[[^\]]+\]/g;            // strict: [名称]
        const bgmRegex = /(?:<\?-([^>]+)>|<([^<>]+)>)/g; // 支持内部 <?-名称> 以及用户直接输入的 <名称>
        const endRegex = /\/\//g;                   // strict: //
        // 兼容带音符或"?-"前缀的 BGM 写法，用于规范化映射
        const bgmAnyRegex = /<\s*(?:(?:\?-|[\u266A\u266B])-)?([^<>]+)\s*>/g;

        // 将原始行文本转成“展示等价文本”，并建立 原始<->展示 的 token 区间映射
        const buildMappings = (raw: string) => {
            let pos = 0;
            let normalized = '';
            type MapTok = { rawFrom: number; rawTo: number; normFrom: number; normTo: number };
            const tokens: MapTok[] = [];
            const patterns = [sfxRegex, bgmAnyRegex, endRegex] as const;
            const nextMatch = (from: number) => {
                let best: { re: RegExp; m: RegExpExecArray } | null = null;
                for (const base of patterns) {
                    const re = new RegExp(base.source, 'g');
                    re.lastIndex = from;
                    const m = re.exec(raw);
                    if (m && (best === null || m.index < best.m.index)) best = { re: base, m };
                }
                return best;
            };
            while (pos < raw.length) {
                const hit = nextMatch(pos);
                if (!hit || hit.m.index >= raw.length) { normalized += raw.slice(pos); break; }
                const startAt = hit.m.index;
                const endAt = startAt + hit.m[0].length;
                if (startAt > pos) normalized += raw.slice(pos, startAt);
                const normFrom = normalized.length;
                if (hit.re === bgmAnyRegex) {
                    const inner = hit.m[1] ?? '';
                    normalized += `<?-${inner}>`;
                } else {
                    normalized += hit.m[0];
                }
                const normTo = normalized.length;
                tokens.push({ rawFrom: startAt, rawTo: endAt, normFrom, normTo });
                pos = endAt;
            }
            return { normalized, tokens };
        };

        type DebugResult = { lineId: string; before: string; after: string; removed: string[] };
        const debugResults: DebugResult[] = [];

        for (const rec of affected) {
            const isFirst = rec.lineId === startLineId;
            const isLast = rec.lineId === endLineId;
            let selStart = isFirst ? first.offset : 0;
            let selEnd = isLast ? last.offset : rec.text.length;
            // 为了确保跨行批量清除稳定：当选择跨行时，首/尾两行按整行处理，避免偏移不一致导致漏删
            if (isMultiLine) {
                if (isFirst) selStart = 0;
                if (isLast) selEnd = rec.text.length;
            }
            const isCollapsed = first.lineId === last.lineId && first.offset === last.offset;
            if (!isCollapsed && selStart >= selEnd) continue;

            // compute removals by token overlap
            type Span = { from: number; to: number };
            const spans: Span[] = [];
            let m: RegExpExecArray | null;
            // 宽松匹配规则（局部使用，避免全局重复声明）
            const __sfxLooseRegex = /[\[\uFF3B\u3010\u3014][^\]\uFF3D\u3011\u3015]+[\]\uFF3D\u3011\u3015]/g; // [..]/［..］/【..】/〔..〕
            const __bgmLooseRegex = /<\s*(?:(?:\?-|[\u266A\u266B])\s*-\s*)?[^<>]*?\s*>/g; // <..> / <?-..> / <♪-..> 等，容忍空格
            const __endLooseRegex = /\/\/+\s*/g; // // 或更多斜杠并容忍空格

            const pushIfOverlap = (from: number, to: number) => {
                const overlap = Math.max(0, Math.min(to, selEnd) - Math.max(from, selStart));
                if (overlap > 0) spans.push({ from, to });
            };

            // SFX
            const sfxR = new RegExp(sfxRegex.source, 'g');
            while ((m = sfxR.exec(rec.text)) !== null) {
                if (isCollapsed) {
                    if (m.index <= selStart && (m.index + m[0].length) >= selStart) {
                        spans.push({ from: m.index, to: m.index + m[0].length });
                        break;
                    }
                } else {
                    pushIfOverlap(m.index, m.index + m[0].length);
                }
            }
            // BGM start
            const bgmR = new RegExp(bgmRegex.source, 'g');
            while ((m = bgmR.exec(rec.text)) !== null) {
                if (isCollapsed) {
                    if (m.index <= selStart && (m.index + m[0].length) >= selStart) {
                        spans.push({ from: m.index, to: m.index + m[0].length });
                        break;
                    }
                } else {
                    pushIfOverlap(m.index, m.index + m[0].length);
                }
            }
            // 兼容 <♫-名称>/<♪-名称> 形式
            const bgmR2 = /<\s*(?:[\u266A\u266B]-)[^<>]+>/g;
            while ((m = bgmR2.exec(rec.text)) !== null) {
                if (isCollapsed) {
                    if (m.index <= selStart && (m.index + m[0].length) >= selStart) {
                        spans.push({ from: m.index, to: m.index + m[0].length });
                        break;
                    }
                } else {
                    pushIfOverlap(m.index, m.index + m[0].length);
                }
            }
            // BGM end //
            const endR = new RegExp(endRegex.source, 'g');
            while ((m = endR.exec(rec.text)) !== null) {
                if (isCollapsed) {
                    if (m.index <= selStart && (m.index + m[0].length) >= selStart) {
                        spans.push({ from: m.index, to: m.index + m[0].length });
                        break;
                    }
                } else {
                    pushIfOverlap(m.index, m.index + m[0].length);
                }
            }
            
            // 如果传统方式未命中（可能因显示文本与原文偏移不一致），使用规范化映射再次判定
            if (spans.length === 0) {
                const map = buildMappings(rec.text);
                let normSelStart = selStart;
                let normSelEnd = selEnd;
                if (isMultiLine) {
                    if (isFirst) normSelStart = 0;
                    if (isLast) normSelEnd = map.normalized.length;
                }
                for (const t of map.tokens) {
                    const overlapped = isCollapsed
                        ? (t.normFrom <= normSelStart && t.normTo >= normSelStart)
                        : Math.max(0, Math.min(t.normTo, normSelEnd) - Math.max(t.normFrom, normSelStart)) > 0;
                    if (overlapped) {
                        spans.push({ from: t.rawFrom, to: t.rawTo });
                        if (isCollapsed) break;
                    }
                }
                if (spans.length === 0) continue;
            }
            else {
                // 即使已命中，也再用“规范化映射”补一遍，防止偏移差导致部分遗漏
                const map = buildMappings(rec.text);
                let normSelStart = selStart;
                let normSelEnd = selEnd;
                if (isMultiLine) {
                    if (isFirst) normSelStart = 0;
                    if (isLast) normSelEnd = map.normalized.length;
                }
                for (const t of map.tokens) {
                    const overlapped = isCollapsed
                        ? (t.normFrom <= normSelStart && t.normTo >= normSelStart)
                        : Math.max(0, Math.min(t.normTo, normSelEnd) - Math.max(t.normFrom, normSelStart)) > 0;
                    if (overlapped) spans.push({ from: t.rawFrom, to: t.rawTo });
                }
            }
            // 追加一轮更宽松的扫描，防止部分写法遗漏
            // BGM 宽松
            {
                const re = new RegExp(__bgmLooseRegex.source, 'g');
                let mm: RegExpExecArray | null;
                while ((mm = re.exec(rec.text)) !== null) {
                    if (isCollapsed) {
                        if (mm.index <= selStart && (mm.index + mm[0].length) >= selStart) {
                            spans.push({ from: mm.index, to: mm.index + mm[0].length });
                            break;
                        }
                    } else {
                        const from = mm.index, to = mm.index + mm[0].length;
                        const overlap = Math.max(0, Math.min(to, selEnd) - Math.max(from, selStart));
                        if (overlap > 0) spans.push({ from, to });
                    }
                }
            }
            // 结束标记 宽松
            {
                const re = new RegExp(__endLooseRegex.source, 'g');
                let mm: RegExpExecArray | null;
                while ((mm = re.exec(rec.text)) !== null) {
                    if (isCollapsed) {
                        if (mm.index <= selStart && (mm.index + mm[0].length) >= selStart) {
                            spans.push({ from: mm.index, to: mm.index + mm[0].length });
                            break;
                        }
                    } else {
                        const from = mm.index, to = mm.index + mm[0].length;
                        const overlap = Math.max(0, Math.min(to, selEnd) - Math.max(from, selStart));
                        if (overlap > 0) spans.push({ from, to });
                    }
                }
            }
            // SFX 宽松（全角括号等）
            {
                const re = new RegExp(__sfxLooseRegex.source, 'g');
                let mm: RegExpExecArray | null;
                while ((mm = re.exec(rec.text)) !== null) {
                    if (isCollapsed) {
                        if (mm.index <= selStart && (mm.index + mm[0].length) >= selStart) {
                            spans.push({ from: mm.index, to: mm.index + mm[0].length });
                            break;
                        }
                    } else {
                        const from = mm.index, to = mm.index + mm[0].length;
                        const overlap = Math.max(0, Math.min(to, selEnd) - Math.max(from, selStart));
                        if (overlap > 0) spans.push({ from, to });
                    }
                }
            }
            // merge overlapping spans
            spans.sort((a,b)=> a.from - b.from);
            const merged: Span[] = [];
            for (const s of spans) {
                const lastSpan = merged[merged.length - 1];
                if (!lastSpan || s.from > lastSpan.to) merged.push({ ...s });
                else lastSpan.to = Math.max(lastSpan.to, s.to);
            }
            // build new text by cutting merged spans
            let cur = 0; let out = '';
            const removedPieces: string[] = [];
            for (const s of merged) {
                out += rec.text.slice(cur, s.from);
                removedPieces.push(rec.text.slice(s.from, s.to));
                cur = s.to;
            }
            out += rec.text.slice(cur);
            const leftover = !!(out.match(sfxRegex) || out.match(__sfxLooseRegex) || out.match(bgmRegex) || out.match(__bgmLooseRegex) || out.match(endRegex) || out.match(__endLooseRegex));
            if (leftover) {
                console.warn(`[CF] 行 ${rec.lineId} 仍检测到残留标记`, { textAfter: out });
            }
            debugResults.push({ lineId: rec.lineId, before: rec.text, after: out, removed: removedPieces });
            updates.push(updateLineText(currentProject.id, rec.chapterId, rec.lineId, out));
        }

        // Remove any scene markers intersecting the selection
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
            if (m.type !== 'scene') return true; // 只清除场景
            if (!m.startLineId || !m.endLineId) return true;
            return !intersects({ lineId: m.startLineId, offset: m.startOffset ?? 0 }, { lineId: m.endLineId, offset: m.endOffset ?? 0 });
        });

        if (nextMarkers.length !== (currentProject.textMarkers || []).length) {
            updateProjectTextMarkers(currentProject.id, nextMarkers);
        }

        Promise.all(updates).finally(() => {
            try {
                const changed = debugResults.filter(r => r.before !== r.after).map(r => r.lineId);
                console.group('[CF] 清除格式完成');
                console.log('修改的行:', changed);
                for (const r of debugResults) {
                    if (r.before === r.after) continue;
                    console.groupCollapsed(`[CF] 行 ${r.lineId} 改动`);
                    console.log('删除片段:', r.removed);
                    console.log('前:', r.before);
                    console.log('后:', r.after);
                    console.groupEnd();
                }
                console.groupEnd();
                (window as any).__pp_lastCFDebug = { selection: { first, last }, affected: affected.map(a => a.lineId), results: debugResults };
            } catch {}
            clearSelection();
        });
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
        const bracketed = `<♫-${name}>`;
    
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
    
        const bracketedPlain = `<${name}>`;
        const newText = currentLineText.slice(0, offset) + bracketedPlain + currentLineText.slice(offset);
    
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


