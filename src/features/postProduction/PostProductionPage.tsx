import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { ChevronLeftIcon, MusicalNoteIcon, SpeakerWaveIcon, FilmIcon } from '../../components/ui/icons';
import { Chapter, Character, ScriptLine, TextMarker } from '../../types';
import ResizablePanels from '../../components/ui/ResizablePanels';
import SoundLibraryPanel from './components/SoundLibraryPanel';
import TimelineHeader from './components/TimelineHeader';
import AddSceneModal from './components/AddSceneModal';

const formatChapterNumber = (index: number) => {
    if (index < 0) return '';
    const number = index + 1;
    return number < 1000 ? String(number).padStart(3, '0') : String(number);
};

// Generates a consistent color from a string for scene highlighting
const generateColorForString = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
        hash = hash & hash; // Convert to 32bit integer
    }
    // Generate a pastel color
    const hue = hash % 360;
    const saturation = 75;
    const lightness = 80;
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};


interface DialogueContentProps {
    chapters: Chapter[];
    allProjectChapters: Chapter[];
    characters: Character[];
    onTextSelect: (range: Range | null) => void;
    textMarkers: TextMarker[];
}

const DialogueContent: React.FC<DialogueContentProps> = ({ chapters, allProjectChapters, characters, onTextSelect, textMarkers }) => {
    const contentRef = useRef<HTMLDivElement>(null);
    const sceneMarkers = textMarkers.filter(m => m.type === 'scene');

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
        const contentEl = contentRef.current;
        if (!contentEl) return;

        // Cleanup function to unwrap previously created marks
        const unwrapMarks = () => {
            contentEl.querySelectorAll('mark.scene-highlight').forEach(mark => {
                const parent = mark.parentNode;
                if(parent) {
                    while (mark.firstChild) {
                        parent.insertBefore(mark.firstChild, mark);
                    }
                    parent.removeChild(mark);
                }
            });
            // Re-normalize text nodes that may have been split
            contentEl.normalize();
        };
        
        unwrapMarks();

        // Helper to find the correct text node and offset within a line element
        const findTextNodeAndOffset = (element: Element, targetOffset: number): { node: Node; offset: number } | null => {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
            let accumulatedOffset = 0;
            let currentNode: Node | null;
            while (currentNode = walker.nextNode()) {
                const nodeLength = currentNode.textContent?.length || 0;
                if (accumulatedOffset + nodeLength >= targetOffset) {
                    return { node: currentNode, offset: targetOffset - accumulatedOffset };
                }
                accumulatedOffset += nodeLength;
            }
            return null; // Should not happen if offset is valid
        };
        
        sceneMarkers.forEach(marker => {
            if (!marker.name || marker.startOffset === undefined || marker.endOffset === undefined) return;

            const startEl = contentEl.querySelector(`[data-line-id="${marker.startLineId}"] p`);
            const endEl = contentEl.querySelector(`[data-line-id="${marker.endLineId}"] p`);

            if (!startEl || !endEl) return;

            const startPos = findTextNodeAndOffset(startEl, marker.startOffset);
            const endPos = findTextNodeAndOffset(endEl, marker.endOffset);

            if (startPos && endPos) {
                try {
                    const range = document.createRange();
                    range.setStart(startPos.node, startPos.offset);
                    range.setEnd(endPos.node, endPos.offset);

                    const mark = document.createElement('mark');
                    mark.className = 'scene-highlight rounded px-1';
                    mark.style.backgroundColor = `${generateColorForString(marker.name)}40`; // Add alpha
                    mark.title = marker.name;

                    range.surroundContents(mark);
                } catch (e) {
                    console.error("Could not highlight range for marker:", marker.id, e);
                }
            }
        });
    }, [sceneMarkers, chapters]); // Rerun when markers or chapters change

    return (
        <div className="p-4" ref={contentRef} onMouseUp={handleMouseUp}>
            {chapters.map((chapter) => {
                const projectChapterIndex = allProjectChapters.findIndex(c => c.id === chapter.id);
                return (
                    <div key={chapter.id} className="mb-8">
                        <h4 className="text-lg font-bold text-slate-400 sticky top-0 bg-slate-900/80 backdrop-blur-sm py-2 z-10 border-b border-slate-700 -mx-4 px-4 mb-4">
                            {`${formatChapterNumber(projectChapterIndex)} ${chapter.title}`}
                        </h4>
                        <div className="space-y-3">
                            {chapter.scriptLines.map((line, index) => (
                                <div key={line.id} data-line-id={line.id} className="flex items-start gap-x-4">
                                    <div className="w-24 pt-1 text-right text-slate-500 select-none flex-shrink-0 font-mono text-xs">
                                        {index + 1}
                                    </div>
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

const PostProductionPage: React.FC = () => {
    const { selectedProjectId, projects, characters, navigateTo, updateProjectTextMarkers } = useStore(state => ({
        selectedProjectId: state.selectedProjectId,
        projects: state.projects,
        characters: state.characters,
        navigateTo: state.navigateTo,
        updateProjectTextMarkers: state.updateProjectTextMarkers,
    }));
    
    const [selectedRange, setSelectedRange] = useState<Range | null>(null);
    const [isSceneModalOpen, setIsSceneModalOpen] = useState(false);

    const currentProject = projects.find(p => p.id === selectedProjectId);

    const textMarkers = useMemo(() => currentProject?.textMarkers || [], [currentProject]);
    
    const existingSceneNames = useMemo(() => {
        const names = new Set(textMarkers.filter(m => m.type === 'scene').map(m => m.name).filter((n): n is string => !!n));
        return Array.from(names).sort();
    }, [textMarkers]);

    const handleTextSelect = useCallback((range: Range | null) => {
        setSelectedRange(range);
    }, []);

    const handleAddBgm = () => {
        alert('添加背景音乐功能正在开发中。');
        setSelectedRange(null);
        window.getSelection()?.removeAllRanges();
    };

    const handleAddSfx = () => {
        alert('添加音效功能正在开发中。');
        setSelectedRange(null);
        window.getSelection()?.removeAllRanges();
    };

    const handleAddScene = () => {
        if (selectedRange) {
            setIsSceneModalOpen(true);
        }
    };

    const findLineIdAndOffset = (container: Node, offset: number): { lineId: string; offset: number } | null => {
        // Find the parent <p> tag which contains the actual text content
        const pElement = (container.nodeType === Node.ELEMENT_NODE ? container as Element : container.parentElement)?.closest('p');
        const lineElement = pElement?.closest('[data-line-id]');
    
        if (!pElement || !lineElement) return null;
        
        const lineId = lineElement.getAttribute('data-line-id')!;
      
        // Create a range that starts at the beginning of the <p> tag
        const range = document.createRange();
        range.selectNodeContents(pElement);
        
        // And ends at the selection's boundary
        range.setEnd(container, offset);
        
        // The length of the stringified range is the offset from the start of the <p> tag's text content
        return { lineId, offset: range.toString().length };
    };

    const handleSaveScene = (sceneName: string) => {
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
            alert("无法确定选中文本的起始或结束位置。请尝试重新选择。");
        }

        setIsSceneModalOpen(false);
        setSelectedRange(null);
        window.getSelection()?.removeAllRanges();
    };


    if (!currentProject) {
        return (
            <div className="p-6 h-full flex flex-col items-center justify-center bg-slate-900 text-slate-100">
                <h1 className="text-2xl font-bold text-sky-400">后期制作</h1>
                <p className="mt-4 text-slate-400">请先从项目面板选择一个项目。</p>
                <button
                    onClick={() => navigateTo('dashboard')}
                    className="mt-6 flex items-center text-sm text-sky-300 hover:text-sky-100 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-md"
                >
                    <ChevronLeftIcon className="w-4 h-4 mr-1" /> 返回项目面板
                </button>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-slate-900 text-slate-100">
            <header className="flex items-center justify-between p-3 border-b border-slate-800 flex-shrink-0">
                <h1 className="text-xl font-bold text-sky-400 truncate">
                    后期制作: <span className="text-slate-200">{currentProject.name}</span>
                </h1>
                <button
                    onClick={() => navigateTo('editor')}
                    className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md"
                >
                    <ChevronLeftIcon className="w-4 h-4 mr-1" /> 返回编辑器
                </button>
            </header>
            <div className="flex-grow flex flex-col overflow-hidden">
                <TimelineHeader />
                <div className="flex-grow overflow-hidden">
                    <ResizablePanels
                        leftPanel={<SoundLibraryPanel />}
                        rightPanel={
                            <div className="h-full flex flex-col">
                                <div className="flex-shrink-0 p-2 border-b border-slate-700 flex items-center gap-2">
                                    <button
                                        onClick={handleAddBgm}
                                        disabled={!selectedRange}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-sky-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="为选中文本添加背景音乐标记"
                                    >
                                        <MusicalNoteIcon className="w-5 h-5" />
                                        添加背景音乐
                                    </button>
                                    <button
                                        onClick={handleAddSfx}
                                        disabled={!selectedRange}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-amber-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="为选中文本添加音效标记"
                                    >
                                        <SpeakerWaveIcon className="w-5 h-5" />
                                        添加音效
                                    </button>
                                    <button
                                        onClick={handleAddScene}
                                        disabled={!selectedRange}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-purple-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="为选中文本创建场景"
                                    >
                                        <FilmIcon className="w-5 h-5" />
                                        创建场景
                                    </button>
                                    {selectedRange && <span className="text-xs text-green-400 animate-pulse">已选择文本</span>}
                                </div>
                                <div className="flex-grow overflow-y-auto">
                                    <DialogueContent
                                        chapters={currentProject.chapters}
                                        allProjectChapters={currentProject.chapters}
                                        characters={characters}
                                        onTextSelect={handleTextSelect}
                                        textMarkers={textMarkers}
                                    />
                                </div>
                            </div>
                        }
                        initialLeftWidthPercent={30}
                    />
                </div>
            </div>
             <AddSceneModal 
                isOpen={isSceneModalOpen}
                onClose={() => setIsSceneModalOpen(false)}
                onSave={handleSaveScene}
                existingSceneNames={existingSceneNames}
            />
        </div>
    );
};

export default PostProductionPage;