import React, { useEffect } from 'react';
import { Chapter, Character, TextMarker } from '../../../types';
import { useMarkerRendering } from '../hooks/useMarkerRendering';
import { MusicalNoteIcon } from '../../../components/ui/icons';

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
}

export const DialogueContent: React.FC<DialogueContentProps> = ({
  chapters,
  allProjectChapters,
  onTextSelect,
  textMarkers,
  suspendLayout,
}) => {
    const { contentRef, sceneOverlays, bgmLabelOverlays } = useMarkerRendering(textMarkers, chapters, suspendLayout);
    
    const handleMouseUp = () => {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && contentRef.current?.contains(selection.anchorNode)) {
            const range = selection.getRangeAt(0);
            onTextSelect(range);
        } else {
            onTextSelect(null);
        }
    };
    
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

    return (
        <div className="relative p-4 h-full" ref={contentRef} onMouseUp={handleMouseUp}>
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
                return (
                    <div key={chapter.id} className="mb-8 relative">
                        <h4 className="text-lg font-bold text-slate-400 sticky top-0 bg-slate-900/80 backdrop-blur-sm py-2 z-10 border-b border-slate-700 -mx-4 px-4 mb-4">
                            {`${formatChapterNumber(projectChapterIndex)} ${chapter.title}`}
                        </h4>
                        <div className="space-y-3">
                            {chapter.scriptLines.map((line, index) => (
                                <div key={line.id} data-line-id={line.id} className="flex items-start gap-x-4">
                                    <div className="w-24 pt-1 text-right text-slate-500 select-none flex-shrink-0 font-mono text-xs">{index + 1}</div>
                                    <p className="flex-grow leading-relaxed whitespace-pre-wrap">{line.text}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};