// FIX: Import the 'React' namespace to correctly type 'React.ChangeEvent'.
import React from 'react';
import { useStore } from '../../../store/useStore';
import { Character, ParsedFileInfo, AudioAssistantState } from '../../../types';
import { db } from '../../../db';

// --- Helper Functions ---

const chineseToArabic = (numStr: string): number | null => {
    // This is a simplified version. For full support, a more complex library would be needed.
    const map: { [key: string]: number } = { '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '百': 100, '千': 1000 };
    if (/^\d+$/.test(numStr)) return parseInt(numStr, 10);
    if(map[numStr] !== undefined) return map[numStr];
    // Basic support for 十, e.g., "十一" -> 11, "二十" -> 20
    if (numStr.startsWith('十')) return 10 + (map[numStr[1]] || 0);
    if (numStr.endsWith('十')) return map[numStr[0]] * 10;
    return null;
};

const getChapterNumber = (title: string): number | null => {
    if (!title) return null;
    const match = title.match(/(?:Chapter|第)\s*([一二三四五六七八九十百千万零\d]+)/i);
    if (match?.[1]) {
        const numPart = match[1];
        if (/^\d+$/.test(numPart)) return parseInt(numPart, 10);
        return chineseToArabic(numPart);
    }
    const numericMatch = title.match(/^\s*(\d+)\s*$/);
    return numericMatch ? parseInt(numericMatch[1], 10) : null;
};

export interface MatchStatus {
    characters: Record<string, boolean>;
    chapters: Record<string, boolean>;
    ranges: Record<string, boolean>;
}

export const useAudioAlignmentAssistant = () => {
    const { projects, characters, selectedProjectId, navigateTo } = useStore();
    const [directoryName, setDirectoryName] = React.useState<string | null>(null);
    const [isLoading, setIsLoading] = React.useState(false);
    const [scannedFiles, setScannedFiles] = React.useState<ParsedFileInfo[]>([]);
    const [manualOverrides, setManualOverrides] = React.useState<Record<string, boolean>>({});

    const [selectedRangeIndex, setSelectedRangeIndex] = React.useState<number | null>(null);
    const [selectedChapterId, setSelectedChapterId] = React.useState<string | null>(null);
    
    // --- File System Access API state and refs ---
    const isApiSupported = 'showDirectoryPicker' in window;
    const [directoryHandle, setDirectoryHandle] = React.useState<FileSystemDirectoryHandle | null>(null);
    
    const currentProject = React.useMemo(() => projects.find(p => p.id === selectedProjectId), [projects, selectedProjectId]);
    
    const { allCvNames, projectCharacters } = React.useMemo<{ allCvNames: string[], projectCharacters: Character[] }>(() => {
        if (!currentProject) return { allCvNames: [], projectCharacters: [] };
        const projChars = characters.filter(c => (c.projectId === currentProject.id || !c.projectId) && c.status !== 'merged');
        const cvs = projChars.reduce<string[]>((acc, c) => {
            if (c.cvName && !acc.includes(c.cvName)) {
                acc.push(c.cvName);
            }
            return acc;
        }, []).sort();
        return { allCvNames: cvs, projectCharacters: projChars };
    }, [currentProject, characters]);
    
    const scanDirectory = React.useCallback(async (handle: FileSystemDirectoryHandle, resetState: boolean) => {
        setIsLoading(true);
        if (resetState) {
            setScannedFiles([]);
            setManualOverrides({});
        }
    
        const parsedFiles: ParsedFileInfo[] = [];
    
        async function processDirectory(dirHandle: FileSystemDirectoryHandle) {
            for await (const entry of dirHandle.values()) {
                if (entry.kind === 'file') {
                    // FIX: Cast entry to FileSystemFileHandle to access getFile method.
                    const file = await (entry as FileSystemFileHandle).getFile();
                    if (file.name.endsWith('.mp3') || file.name.endsWith('.wav')) {
                        const name = file.name.replace(/\.(mp3|wav)$/i, '');
                        const parts = name.split(/[_]/);
                        if (parts.length < 1) continue;
        
                        const chapterPart = parts[0];
                        const chapterNumbers: number[] = [];
                        if (chapterPart.includes('-')) {
                            const [start, end] = chapterPart.split('-').map(Number);
                            if (!isNaN(start) && !isNaN(end)) {
                                for (let i = start; i <= end; i++) chapterNumbers.push(i);
                            }
                        } else if (!isNaN(Number(chapterPart))) {
                            chapterNumbers.push(Number(chapterPart));
                        }
        
                        if (chapterNumbers.length === 0) continue;
        
                        let cvName: string | null = null;
                        let characterName: string | null = null;
        
                        if (parts.length > 1) {
                            const potentialIdentifier = parts.slice(1).join('_');
                            if (allCvNames.includes(potentialIdentifier)) {
                                cvName = potentialIdentifier;
                            } else {
                                characterName = potentialIdentifier;
                            }
                        }
        
                        if (characterName === 'pb' || cvName === 'pb') {
                           cvName = 'pb';
                           characterName = 'Narrator';
                        }
        
                        parsedFiles.push({ chapters: chapterNumbers, characterName, cvName });
                    }
                } else if (entry.kind === 'directory') {
                    // Recursive call for subdirectories
                    // FIX: Cast entry to FileSystemDirectoryHandle for recursive call.
                    await processDirectory(entry as FileSystemDirectoryHandle);
                }
            }
        }
    
        try {
            await processDirectory(handle);
            setDirectoryName(handle.name);
            setScannedFiles(parsedFiles);
// FIX: The 'err' variable is of type 'unknown'. Use 'instanceof Error' to safely access the 'message' property.
        } catch (err: unknown) {
            // FIX: Safely access error message from 'unknown' type.
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error("Error scanning directory:", errorMessage);
            alert(`扫描文件夹时出错: ${errorMessage}`);
        } finally {
            setIsLoading(false);
        }
    }, [allCvNames]);

    React.useEffect(() => {
        if (currentProject) {
            const loadState = async () => {
                setIsLoading(true);
                try {
                    if (isApiSupported) {
                        const handleEntry = await db.directoryHandles.get(currentProject.id);
                        if (handleEntry) {
                            const handle = handleEntry.handle;
                            // FIX: Add type guard to ensure handle is a directory handle before using its specific methods.
                            if (handle.kind === 'directory') {
                                const permission = await handle.queryPermission({ mode: 'read' });
                                setDirectoryHandle(handle);
                                if (permission === 'granted') {
                                    await scanDirectory(handle, true);
                                    return;
                                } else {
                                    setDirectoryName(handle.name);
                                }
                            }
                        }
                    }

                    const savedState = await db.assistantState.get(currentProject.id);
                    if (savedState) {
                        setDirectoryName(savedState.directoryName);
                        setScannedFiles(savedState.scannedFiles);
                        setManualOverrides(savedState.manualOverrides);
                    }
// FIX: Add type annotation for the catch block parameter and use String() for safe logging.
                } catch (err: unknown) {
                    console.error("Failed to load assistant state from DB:", String(err));
                } finally {
                    setIsLoading(false);
                }
            };
            loadState();
        }
    }, [currentProject, isApiSupported, scanDirectory]);

    React.useEffect(() => {
        if (currentProject && (directoryName || scannedFiles.length > 0)) {
            const saveState = async () => {
                const stateToSave: AudioAssistantState = {
                    projectId: currentProject.id,
                    directoryName,
                    scannedFiles,
                    manualOverrides,
                };
                await db.assistantState.put(stateToSave);
            };
            saveState().catch(err => console.error("Failed to save assistant state to DB:", err));
        }
    }, [directoryName, scannedFiles, manualOverrides, currentProject]);

    const handleSelectDirectory = async () => {
        if (!currentProject) return;
        try {
            const handle = await (window as any).showDirectoryPicker();
            if ((await (handle as any).requestPermission({ mode: 'read' })) !== 'granted') {
                alert("需要文件夹读取权限才能继续。");
                return;
            }
            await db.directoryHandles.put({ projectId: currentProject.id, handle });
            setDirectoryHandle(handle);
            await scanDirectory(handle, true);
// FIX: The 'err' variable is of type 'unknown' in a catch block. Add an 'instanceof Error' check to safely access the 'name' property.
        } catch (err: unknown) {
            // FIX: Add 'instanceof Error' guard to safely access 'name' property on 'unknown' type.
            if (err instanceof Error && err.name === 'AbortError') {
                // User cancelled, do nothing.
            } else {
                console.error("Error picking directory:", String(err));
            }
        }
    };
    
// FIX: Add a try-catch block to handle potential errors from `requestPermission`, such as user cancellation, which can throw an AbortError. This prevents unhandled promise rejections.
    const handleRescan = async () => {
        if (directoryHandle) {
            try {
                if ((await (directoryHandle as any).requestPermission({ mode: 'read' })) === 'granted') {
                    await scanDirectory(directoryHandle, true);
                } else {
                    alert("重新扫描时需要文件夹读取权限。");
                }
            } catch (err: unknown) {
                if (err instanceof Error && err.name === 'AbortError') {
                    // User cancelled, do nothing.
                } else {
                    console.error("Error rescanning directory:", String(err));
                    alert(`重新扫描时出错: ${err instanceof Error ? err.message : String(err)}`);
                }
            }
        }
    };

    const handleDirectoryInputChange_Fallback = React.useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        setIsLoading(true);
        setScannedFiles([]);
        setManualOverrides({});
        
        try {
            const firstFilePath = files[0].webkitRelativePath;
            const dirName = firstFilePath.split('/')[0];
            const parsedFiles: ParsedFileInfo[] = [];
            
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (!file) continue;
                if (file.name.endsWith('.mp3') || file.name.endsWith('.wav')) {
                    const name = file.name.replace(/\.(mp3|wav)$/i, '');
                    const parts = name.split(/[_]/);
                    if (parts.length < 1) continue;
    
                    const chapterPart = parts[0];
                    const chapterNumbers: number[] = [];
                    if (chapterPart.includes('-')) {
                        const [start, end] = chapterPart.split('-').map(Number);
                        if (!isNaN(start) && !isNaN(end)) {
                            for (let i = start; i <= end; i++) chapterNumbers.push(i);
                        }
                    } else if (!isNaN(Number(chapterPart))) {
                        chapterNumbers.push(Number(chapterPart));
                    }
    
                    if (chapterNumbers.length === 0) continue;
    
                    let cvName: string | null = null;
                    let characterName: string | null = null;
    
                    if (parts.length > 1) {
                        const potentialIdentifier = parts.slice(1).join('_');
                        if (allCvNames.includes(potentialIdentifier)) {
                            cvName = potentialIdentifier;
                        } else {
                            characterName = potentialIdentifier;
                        }
                    }
    
                    if (characterName === 'pb' || cvName === 'pb') {
                       cvName = 'pb';
                       characterName = 'Narrator';
                    }
    
                    parsedFiles.push({ chapters: chapterNumbers, characterName, cvName });
                }
            }
            setDirectoryName(dirName);
            setScannedFiles(parsedFiles);

// FIX: The 'err' variable is of type 'unknown'. Use 'instanceof Error' to safely access the 'message' property.
        } catch (err: unknown) {
            // FIX: Safely access error message from 'unknown' type.
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error("Error processing directory files:", errorMessage);
            alert(`Error processing files: ${errorMessage}`);
            setDirectoryName(null);
            setScannedFiles([]);
            setManualOverrides({});
        } finally {
            setIsLoading(false);
            if (event.target) event.target.value = '';
        }
    }, [allCvNames]);
    
    const chapterRanges = React.useMemo<{ label: string; start: number; end: number; }[]>(() => {
        if (!currentProject) return [];
        const ranges = [];
        const rangeSize = 100;
        const totalChapters = currentProject.chapters.length;
        if (totalChapters === 0) return [];

        let currentStart = 1;
        
        while (currentStart <= totalChapters) {
            const end = Math.min(currentStart + rangeSize - 1, totalChapters);
            ranges.push({
                label: `${currentStart}-${end}`,
                start: currentStart -1,
                end: end - 1,
            });
            currentStart += rangeSize;
        }

        return ranges;
    }, [currentProject]);

    const finalMatchStatus = React.useMemo<MatchStatus | null>(() => {
        if (scannedFiles.length === 0 || !currentProject) return null;

        const finalStatus: MatchStatus = { characters: {}, chapters: {}, ranges: {} };

        const fileCoverage = new Map<number, ParsedFileInfo[]>();
        scannedFiles.forEach(file => {
            file.chapters.forEach(chNum => {
                if (!fileCoverage.has(chNum)) fileCoverage.set(chNum, []);
                fileCoverage.get(chNum)!.push(file);
            });
        });

        currentProject.chapters.forEach(chapter => {
            const chapterNum = getChapterNumber(chapter.title);
            if (chapterNum === null) {
                finalStatus.chapters[chapter.id] = true;
                return;
            }
            const charIdsInChapter = new Set(chapter.scriptLines.map(l => l.characterId).filter((id): id is string => !!id));
            if (charIdsInChapter.size === 0) {
                finalStatus.chapters[chapter.id] = true;
                return;
            }

            const isChapterComplete = Array.from(charIdsInChapter).every((charId: string) => {
                const character = projectCharacters.find(c => c.id === charId);
                if (!character) return true;
                if (manualOverrides[charId] !== undefined) return manualOverrides[charId];
                
                const relevantFiles = fileCoverage.get(chapterNum) || [];
                
                return relevantFiles.some(file => 
                    (file.characterName && (file.characterName === character.name || file.characterName === character.cvName)) ||
                    (file.cvName && file.cvName === character.cvName)
                );
            });
            finalStatus.chapters[chapter.id] = isChapterComplete;
        });
        
        chapterRanges.forEach(range => {
            const chaptersInRange = currentProject.chapters.slice(range.start, range.end + 1);
            finalStatus.ranges[range.label] = chaptersInRange.every(ch => finalStatus.chapters[ch.id]);
        });

        if (selectedChapterId) {
            const chapter = currentProject.chapters.find(c => c.id === selectedChapterId);
            const chapterNum = chapter ? getChapterNumber(chapter.title) : null;

            if (chapter && chapterNum !== null) {
                const relevantFiles = fileCoverage.get(chapterNum) || [];
                const charIdsInChapter = new Set(chapter.scriptLines.map(l => l.characterId).filter((id): id is string => !!id));

                charIdsInChapter.forEach((charId: string) => {
                    const character = projectCharacters.find(c => c.id === charId);
                    if (!character) return; // continue equivalent
                    
                    if (manualOverrides[charId] !== undefined) {
                        finalStatus.characters[charId] = manualOverrides[charId];
                        return; // continue equivalent
                    }

                    const isCharFound = relevantFiles.some(file => 
                        (file.characterName && (file.characterName === character.name || file.characterName === character.cvName)) ||
                        (file.cvName && file.cvName === character.cvName)
                    );
                    finalStatus.characters[charId] = isCharFound;
                });
            }
        }
        
        return finalStatus;
    }, [scannedFiles, currentProject, projectCharacters, manualOverrides, chapterRanges, selectedChapterId]);

    const handleToggleCharacter = (charId: string) => {
        setManualOverrides(prev => ({
            ...prev,
            [charId]: !(finalMatchStatus?.characters[charId] ?? false)
        }));
    };

    const chaptersInSelectedRange = React.useMemo(() => {
        if (selectedRangeIndex === null || !currentProject) return [];
        const range = chapterRanges[selectedRangeIndex];
        return currentProject.chapters.slice(range.start, range.end + 1);
    }, [selectedRangeIndex, chapterRanges, currentProject]);

    const charactersInSelectedChapter = React.useMemo(() => {
        if (!selectedChapterId || !currentProject) return [];
        const chapter = currentProject.chapters.find(c => c.id === selectedChapterId);
        if (!chapter) return [];
        const charIds = new Set(chapter.scriptLines.map(l => l.characterId));
        return projectCharacters.filter(c => charIds.has(c.id)).sort((a,b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
    }, [selectedChapterId, currentProject, projectCharacters]);

    return {
        isLoading,
        currentProject,
        directoryName,
        isApiSupported,
        directoryHandle,
        chapterRanges,
        selectedRangeIndex,
        chaptersInSelectedRange,
        selectedChapterId,
        charactersInSelectedChapter,
        finalMatchStatus,
        handleSelectDirectory,
        handleRescan,
        handleScanDirectoryClick_Fallback: () => {}, // Placeholder, actual logic in header
        handleDirectoryInputChange_Fallback,
        setSelectedRangeIndex,
        setSelectedChapterId,
        handleToggleCharacter,
        navigateTo,
    };
};
