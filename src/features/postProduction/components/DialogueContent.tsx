import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { Chapter, Character, TextMarker, SoundLibraryItem } from '../../../types';
import { useMarkerRendering } from '../hooks/useMarkerRendering';
import { MusicalNoteIcon, ChevronDownIcon } from '../../../components/ui/icons';
import { useSoundHighlighter } from '../../scriptEditor/hooks/useSoundHighlighter';
import SoundKeywordPopover from '../../scriptEditor/components/script_editor_panel/SoundKeywordPopover';
import ChapterPagination from '../../scriptEditor/components/chapter_list_panel/ChapterPagination';

const formatChapterNumber = (index: number) => {
  if (index < 0) return '';
  const number = index + 1;
  return number < 1000 ? String(number).padStart(3, '0') : String(number);
};

interface DialogueContentProps {
  chapters: Chapter[];
  allProjectChapters: Chapter[];
  characters: Character[];
  onTextSelect: (range: Range | null) => void;
  textMarkers: TextMarker[];
  suspendLayout?: boolean;
  soundLibrary: SoundLibraryItem[];
  soundObservationList: string[];
  expandedChapterId: string | null;
  setExpandedChapterId: (id: string | null) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onContextMenuRequest: (event: React.MouseEvent, range: Range) => void;
}

const HighlightedLine: React.FC<{ text: string; soundLibrary: SoundLibraryItem[]; soundObservationList: string[] }> = ({ text, soundLibrary, soundObservationList }) => {
    const highlightedHtml = useSoundHighlighter(text, soundLibrary, soundObservationList);
    const pRef = useRef<HTMLParagraphElement>(null);
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
        const el = pRef.current;
        if (!el) return;

        const preventInput = (e: InputEvent) => {
            e.preventDefault();
        };

        el.addEventListener('beforeinput', preventInput);
        return () => {
            el.removeEventListener('beforeinput', preventInput);
        };
    }, []);
    
    useLayoutEffect(() => {
        const el = pRef.current;
        if (!el) return;
        // If the user is interacting with the element, don't update its content
        // from props. This preserves the caret position.
        if (isFocused) return;
        
        // If the content is stale, sync it.
        if (el.innerHTML !== highlightedHtml) {
            el.innerHTML = highlightedHtml;
        }
    }, [highlightedHtml, isFocused]);
    
    return <p 
        ref={pRef}
        className="flex-grow leading-relaxed whitespace-pre-wrap outline-none" 
        contentEditable="true"
        suppressContentEditableWarning={true}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
    />;
};

export const DialogueContent: React.FC<DialogueContentProps> = ({
  chapters,
  allProjectChapters,
  characters,
  onTextSelect,
  textMarkers,
  suspendLayout,
  soundLibrary,
  soundObservationList,
  expandedChapterId,
  setExpandedChapterId,
  currentPage,
  totalPages,
  onPageChange,
  onContextMenuRequest,
}) => {
    const { contentRef, sceneOverlays, bgmLabelOverlays } = useMarkerRendering(textMarkers, chapters, suspendLayout, expandedChapterId);
    const [popoverState, setPopoverState] = useState<{ visible: boolean; keyword: string; top: number; left: number } | null>(null);
    const hidePopoverTimeout = useRef<number | null>(null);
    
    const handleMouseUp = () => {
        const selection = window.getSelection();
        if (selection && contentRef.current?.contains(selection.anchorNode)) {
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                onTextSelect(range);
            }
        } else {
            onTextSelect(null);
        }
    };

    const handleMouseOver = (e: React.MouseEvent) => {
        if (hidePopoverTimeout.current) clearTimeout(hidePopoverTimeout.current);
        const target = e.target as HTMLElement;
        if (target.classList.contains('sound-keyword-highlight')) {
            const keyword = target.dataset.keyword;
            if (keyword) {
                const rect = target.getBoundingClientRect();
                setPopoverState({ visible: true, keyword, top: rect.bottom, left: rect.left });
            }
        }
    };
    
    const handleMouseOut = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('sound-keyword-highlight')) {
            hidePopoverTimeout.current = window.setTimeout(() => {
                setPopoverState(null);
            }, 200);
        }
    };
    
    const handlePopoverEnter = () => {
        if (hidePopoverTimeout.current) clearTimeout(hidePopoverTimeout.current);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        
        let range: Range | null = null;
        
        // Standard method
        if ((document as any).caretPositionFromPoint) {
            const pos = (document as any).caretPositionFromPoint(e.clientX, e.clientY);
            if(pos){
                range = document.createRange();
                range.setStart(pos.offsetNode, pos.offset);
                range.collapse(true);
            }
        // Non-standard fallback for some WebKit browsers
        } else if ((document as any).caretRangeFromPoint) {
            range = (document as any).caretRangeFromPoint(e.clientX, e.clientY);
        }
        
        if (range && contentRef.current?.contains(range.startContainer)) {
             range.collapse(true);
             onContextMenuRequest(e, range);
        }
    };

    useEffect(() => {
        if (expandedChapterId) {
            const el = contentRef.current?.querySelector(`[data-chapter-id="${expandedChapterId}"]`);
            if (el) {
                setTimeout(() => {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            }
        }
    }, [expandedChapterId]);


    useEffect(() => {
        const el = contentRef.current;
        if (!el) return;
        const onClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const mark = target.closest('mark.bgm-highlight');
            if (mark) {
                const id = (mark as HTMLElement).dataset.markerId;
                if (id) {
                    const found = textMarkers.find((m) => m.id === id);
                    if (found) (window as any).__openEditMarker?.(found);
                }
            }
        };
        el.addEventListener('click', onClick);
        return () => el.removeEventListener('click', onClick);
    }, [textMarkers]);

    const bracketIfNeeded = (text: string) => {
        const t = (text || '').trim();
        if (!t) return '[]';
        if (t.startsWith('[') && t.endsWith(']')) return t; // 幂等
        return `[${t}]`;
    };

    return (
        <div 
            className="relative p-4 h-full flex flex-col" 
            onMouseUp={handleMouseUp}
            onMouseOver={handleMouseOver}
            onMouseOut={handleMouseOut}
            onContextMenu={handleContextMenu}
        >
            <div 
                className="relative flex-grow overflow-y-auto"
                ref={contentRef}
            >
                {/* Scene Brackets */}
                <div className="absolute inset-0 pointer-events-none z-10">
                    {sceneOverlays.map((overlay) => (
                        <div
                            key={overlay.id}
                            className="scene-bracket"
                            style={{ top: overlay.top, height: overlay.height, right: '40px', color: overlay.lineColor, pointerEvents: 'auto' }}
                        >
                            <div className="scene-bracket-line"></div>
                            <div
                                className="scene-bracket-label"
                                style={{ backgroundColor: overlay.bgColor }}
                                onClick={() => {
                                    const m = textMarkers.find((tm) => tm.id === overlay.id);
                                    if (m) (window as any).__openEditMarker?.(m);
                                }}
                            >
                                {overlay.name}
                            </div>
                        </div>
                    ))}
                </div>

                {/* BGM Labels */}
                <div className="absolute inset-0 pointer-events-none z-20">
                    {bgmLabelOverlays.map((overlay) => (
                        <div
                            key={overlay.id}
                            className="bgm-label"
                            style={{
                                top: overlay.top,
                                left: overlay.left,
                                backgroundColor: overlay.bgColor,
                                color: overlay.textColor,
                                pointerEvents: 'auto',
                            }}
                            onClick={() => {
                                const marker = textMarkers.find((m) => m.id === overlay.id);
                                if (marker) (window as any).__openEditMarker?.(marker);
                            }}
                            title={`BGM: ${overlay.name}`}
                        >
                            <MusicalNoteIcon className="w-3 h-3 mr-1 flex-shrink-0 mt-0.5" />
                            <div className="flex flex-col">
                                {overlay.displayNameParts.map((part, index) => (
                                    <span key={index} className="truncate w-full">
                                        {part}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {chapters.map((chapter) => {
                    const projectChapterIndex = allProjectChapters.findIndex((c) => c.id === chapter.id);
                    const isExpanded = chapter.id === expandedChapterId;
                    return (
                        <div key={chapter.id} data-chapter-id={chapter.id} className="mb-4 relative">
                            <h4 
                                className="text-lg font-bold text-slate-400 sticky top-0 bg-slate-900/80 backdrop-blur-sm py-2 z-10 border-b border-slate-700 -mx-4 px-4 mb-4 flex items-center justify-between cursor-pointer"
                                onClick={() => setExpandedChapterId(isExpanded ? null : chapter.id)}
                            >
                                <span>{`${formatChapterNumber(projectChapterIndex)} ${chapter.title}`}</span>
                                <ChevronDownIcon className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </h4>
                            {isExpanded && (
                                <div className="space-y-3">
                                    {chapter.scriptLines.map((line, index) => {
                                        const char = characters.find(c => c.id === line.characterId);
                                        const nameForCheck = (char?.name || '').replace(/[\[\]()]/g, '').toLowerCase();
                                        const isSfx = nameForCheck === '音效' || nameForCheck === 'sfx';
                                        const display = isSfx ? bracketIfNeeded(line.text) : line.text;
                                        return (
                                            <div key={line.id} data-line-id={line.id} className="flex items-start gap-x-4">
                                                <div className="w-24 pt-1 text-right text-slate-500 select-none flex-shrink-0 font-mono text-xs">{index + 1}</div>
                                                {isSfx ? (
                                                    <p className="flex-grow leading-relaxed whitespace-pre-wrap text-red-500">{display}</p>
                                                ) : (
                                                    <HighlightedLine text={display} soundLibrary={soundLibrary} soundObservationList={soundObservationList} />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
             {popoverState?.visible && (
                <SoundKeywordPopover
                    keyword={popoverState.keyword}
                    top={popoverState.top}
                    left={popoverState.left}
                    onClose={() => setPopoverState(null)}
                    onMouseEnter={handlePopoverEnter}
                    onMouseLeave={() => setPopoverState(null)}
                    soundLibrary={soundLibrary}
                />
            )}
            <div className="flex-shrink-0 mt-4">
              <ChapterPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={onPageChange}
                  isAnyOperationLoading={false}
                  isEditingTitle={false}
              />
            </div>
        </div>
    );
};
