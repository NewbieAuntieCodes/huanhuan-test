import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useStore } from '../../../store/useStore';
import { db } from '../../../db';
import { TTS_SERVER_ORIGIN } from '../../../services/ttsService';
import { exportMarkedWav, exportCharacterClips } from '../services/voiceLibraryExporter';
import { useTtsApi } from './useTtsApi';
import { useVoiceLibraryData, VoiceLibraryRowState } from './useVoiceLibraryData';

export type { VoiceLibraryRowState }; // Re-export for other components

// --- Main Hook ---
export const useVoiceLibrary = () => {
    const { selectedProjectId, assignAudioToLine, selectedChapterId, characters } = useStore(state => ({
        selectedProjectId: state.selectedProjectId,
        assignAudioToLine: state.assignAudioToLine,
        selectedChapterId: state.selectedChapterId,
        characters: state.characters, // needed for exporter
    }));

    const [isExporting, setIsExporting] = useState(false);
    const [selectedCharacterId, setSelectedCharacterId] = useState<string>('');
    const [chapterFilter, setChapterFilter] = useState('');
    const [generatedAudioUrls, setGeneratedAudioUrls] = useState<Record<string, string>>({});
    
    const objectUrlsRef = useRef<Record<string, string>>({});
    const syncedChapterIdRef = useRef<string | null>(null);

    // Using new hooks
    const { isGenerating, serverHealth, checkServerHealth, uploadTtsPrompt, generateTtsBatch } = useTtsApi();
    const { rows, setRows, currentProject, charactersInProject } = useVoiceLibraryData({
        selectedCharacterId,
        chapterFilter
    });

    const selectedCharacter = useMemo(() => charactersInProject.find(c => c.id === selectedCharacterId), [charactersInProject, selectedCharacterId]);

    // Effect to sync chapter selection from other pages
    useEffect(() => {
        if (currentProject && selectedChapterId && selectedChapterId !== syncedChapterIdRef.current) {
            const chapterIndex = currentProject.chapters.findIndex(c => c.id === selectedChapterId);
            if (chapterIndex !== -1) {
                const chapterNum = chapterIndex + 1;
                setChapterFilter(String(chapterNum));
                syncedChapterIdRef.current = selectedChapterId;
            }
        }
    }, [selectedChapterId, currentProject]);

    const updateRow = useCallback((id: string, updates: Partial<VoiceLibraryRowState>) => {
        setRows(prevRows => prevRows.map(row => row.id === id ? { ...row, ...updates } : row));
    }, [setRows]);

    // Check server health on mount
    useEffect(() => { checkServerHealth(); }, [checkServerHealth]);

    // --- Audio URL management ---
    // Cleanup object URLs on unmount
    useEffect(() => {
        const promptUrls = Object.values(objectUrlsRef.current);
        const genUrls = Object.values(generatedAudioUrls);
        return () => {
            promptUrls.forEach(URL.revokeObjectURL);
            genUrls.forEach(URL.revokeObjectURL);
        };
    }, [generatedAudioUrls]);

    // Effect to create/revoke Object URLs for generated audio from DB
    useEffect(() => {
        const syncAudioUrls = async () => {
            if (!currentProject) return;
            const newUrls: Record<string, string> = {};
            const urlsToRevoke: string[] = [];
            const currentRowIds = new Set(rows.map(r => r.id));
            const existingUrlKeys = new Set(Object.keys(generatedAudioUrls));

            // Create URLs for new/updated rows
            for (const row of rows) {
                if (row.originalLineId && !generatedAudioUrls[row.id]) {
                    const line = currentProject.chapters
                        .flatMap(ch => ch.scriptLines)
                        .find(l => l.id === row.originalLineId);
                    
                    if (line?.audioBlobId) {
                        const audioBlob = await db.audioBlobs.get(line.audioBlobId);
                        if (audioBlob) newUrls[row.id] = URL.createObjectURL(audioBlob.data);
                    }
                }
            }

            // Find URLs to revoke for rows that no longer exist
            existingUrlKeys.forEach(rowId => {
                if (!currentRowIds.has(rowId)) {
                    urlsToRevoke.push(generatedAudioUrls[rowId]);
                }
            });

            if (urlsToRevoke.length > 0) {
                urlsToRevoke.forEach(URL.revokeObjectURL);
                setGeneratedAudioUrls(prev => {
                    const next = { ...prev };
                    urlsToRevoke.forEach(url => {
                        const key = Object.keys(next).find(k => next[k] === url);
                        if (key) delete next[key];
                    });
                    return next;
                });
            }

            if (Object.keys(newUrls).length > 0) {
                setGeneratedAudioUrls(prev => ({ ...prev, ...newUrls }));
            }
        };
        syncAudioUrls();
    }, [rows, currentProject, generatedAudioUrls]);


    // --- Core Logic (Orchestration) ---
    const processAndAssignAudio = async (row: VoiceLibraryRowState, audioPath: string) => {
        if (!row.originalLineId || !selectedProjectId || !currentProject) return;
        
        const chapter = currentProject.chapters.find(ch => ch.scriptLines.some(l => l.id === row.originalLineId));
        if (!chapter) {
            updateRow(row.id, { status: 'error', error: '找不到原始章节' });
            return;
        }

        const fullAudioUrl = audioPath.startsWith('http') ? audioPath : `${TTS_SERVER_ORIGIN}/${audioPath.replace(/\\/g, '/').replace(/^\//, '')}`;
        
        try {
            const audioRes = await fetch(fullAudioUrl);
            if (!audioRes.ok) throw new Error('下载生成的音频失败');
            await assignAudioToLine(selectedProjectId, chapter.id, row.originalLineId, await audioRes.blob());
            updateRow(row.id, { status: 'done' });
        } catch (e) {
            updateRow(row.id, { status: 'error', error: e instanceof Error ? e.message : '保存音频失败' });
        }
    };

    const handleBatchGenerate = useCallback(async () => {
        const rowsToProcess = rows.filter(r => r.text.trim() && r.promptFilePath && r.originalLineId);
        if (rowsToProcess.length === 0) {
            alert('没有可生成的行 (确保已上传参考音频并填写了台词)。');
            return;
        }
        
        rowsToProcess.forEach(r => updateRow(r.id, { status: 'generating', error: null }));

        try {
            const ttsItems = rowsToProcess.map(r => ({
                promptAudio: r.promptFilePath,
                text: r.text
            }));
            const results = await generateTtsBatch(ttsItems);
            for (let i = 0; i < results.length; i++) {
                const item = results[i];
                const row = rowsToProcess[i];
                if (item.ok && item.audioUrl) {
                    await processAndAssignAudio(row, item.audioUrl);
                } else {
                    updateRow(row.id, { status: 'error', error: String(item.error || '生成失败') });
                }
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : '未知错误';
            rowsToProcess.forEach(r => updateRow(r.id, { status: 'error', error: errorMsg }));
        }
    }, [rows, updateRow, generateTtsBatch, processAndAssignAudio]);
    
    const handleGenerateSingle = useCallback(async (rowId: string) => {
        const row = rows.find(r => r.id === rowId);
        if (!row?.text.trim() || !row.promptFilePath) {
            alert('请确保已上传参考音频并填写了台词。');
            return;
        }
        if (!row.originalLineId) {
            alert('手动添加的行无法自动同步，请使用批量生成。');
            return;
        }

        updateRow(rowId, { status: 'generating', error: null });
        try {
            const ttsItem = {
                promptAudio: row.promptFilePath,
                text: row.text,
            };
            const results = await generateTtsBatch([ttsItem]);
            const item = results[0];
            if (item.ok && item.audioUrl) {
                await processAndAssignAudio(row, item.audioUrl);
            } else {
                updateRow(rowId, { status: 'error', error: String(item.error || '生成失败') });
            }
        } catch (err) {
            updateRow(rowId, { status: 'error', error: err instanceof Error ? err.message : '未知错误' });
        }
    }, [rows, updateRow, generateTtsBatch, processAndAssignAudio]);

    const handleUpload = useCallback(async (rowId: string, file: File) => {
        if (objectUrlsRef.current[rowId]) URL.revokeObjectURL(objectUrlsRef.current[rowId]);
        
        objectUrlsRef.current[rowId] = URL.createObjectURL(file);
        updateRow(rowId, { status: 'uploading', error: null, promptAudioUrl: objectUrlsRef.current[rowId], promptFileName: file.name });
        
        try {
            const filePath = await uploadTtsPrompt(file);
            updateRow(rowId, { promptFilePath: filePath, status: 'idle' });
        } catch (err) {
            updateRow(rowId, { status: 'error', error: err instanceof Error ? err.message : '未知上传错误', promptFilePath: null });
        }
    }, [updateRow, uploadTtsPrompt]);
    
    const handleDeleteGeneratedAudio = useCallback(async (rowId: string) => {
        const row = rows.find(r => r.id === rowId);
        if (!row?.originalLineId || !selectedProjectId || !currentProject) return;

        const chapter = currentProject.chapters.find(ch => ch.scriptLines.some(l => l.id === row.originalLineId));
        const line = chapter?.scriptLines.find(l => l.id === row.originalLineId);

        if (chapter && line?.audioBlobId) {
            await db.audioBlobs.delete(line.audioBlobId);
            await useStore.getState().updateLineAudio(selectedProjectId, chapter.id, line.id, null);
        }
    }, [rows, selectedProjectId, currentProject]);

    const handleDeletePromptAudio = useCallback((rowId: string) => {
        if (objectUrlsRef.current[rowId]) {
            URL.revokeObjectURL(objectUrlsRef.current[rowId]);
            delete objectUrlsRef.current[rowId];
        }
        updateRow(rowId, { promptFilePath: null, promptAudioUrl: null, promptFileName: null, status: 'idle', error: null });
    }, [updateRow]);

    const addEmptyRow = () => setRows(prev => [...prev, {
        id: `row_manual_${Date.now()}`, promptFilePath: null, promptAudioUrl: null, promptFileName: null,
        text: '', status: 'idle', audioUrl: null, error: null,
    }]);
    
    const removeRow = (id: string) => {
        if (objectUrlsRef.current[id]) {
            URL.revokeObjectURL(objectUrlsRef.current[id]);
            delete objectUrlsRef.current[id];
        }
        if (generatedAudioUrls[id]) {
            URL.revokeObjectURL(generatedAudioUrls[id]);
            setGeneratedAudioUrls(prev => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
        }
        setRows(prev => prev.filter(row => row.id !== id));
    };

    const handleTextChange = (id: string, text: string) => updateRow(id, { text });

    const handleExport = async () => {
        if (!currentProject || !selectedCharacter) return;
        setIsExporting(true);
        try {
            await exportMarkedWav(rows, currentProject, selectedCharacter, generatedAudioUrls, characters); // Pass all characters
        } catch (error) {
            alert(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportCharacterClips = async () => {
        if (!currentProject) return;
        setIsExporting(true);
        try {
            await exportCharacterClips(rows, currentProject, characters, generatedAudioUrls, selectedCharacter);
        } catch (error) {
            alert(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
        } finally {
            setIsExporting(false);
        }
    };
    
    return {
        rows,
        currentProject,
        charactersInProject,
        selectedCharacter,
        isGenerating,
        isExporting,
        serverHealth,
        chapterFilter,
        setChapterFilter,
        selectedCharacterId,
        handleSelectCharacter: setSelectedCharacterId,
        checkServerHealth,
        handleBatchGenerate,
        handleGenerateSingle,
        handleUpload,
        handleTextChange,
        removeRow,
        addEmptyRow,
        handleDeleteGeneratedAudio,
        handleDeletePromptAudio,
        handleExport,
        handleExportCharacterClips,
        generatedAudioUrls,
    };
};
