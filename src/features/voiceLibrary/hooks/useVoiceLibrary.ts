import { useState, useEffect, useCallback, useMemo } from 'react';
import { useStore } from '../../../store/useStore';
import { exportMarkedWav, exportCharacterClips } from '../services/voiceLibraryExporter';
import { useTtsApi } from './useTtsApi';
import { useVoiceLibraryData, VoiceLibraryRowState } from './useVoiceLibraryData';
import { useAudioUrlManager } from './useAudioUrlManager';
import { voiceLibraryPromptRepository } from '../../../repositories/voiceLibraryPromptRepository';
import { processAndAssignAudio, deleteGeneratedAudio } from '../utils/audioAssignment';
import { Project } from '../../../types';

export type { VoiceLibraryRowState }; // Re-export for other components

// --- Main Hook ---
export const useVoiceLibrary = () => {
    const { 
        selectedProjectId, 
        assignAudioToLine, 
        updateLineAudio, 
        selectedChapterId, 
        characters,
        updateLineEmotion,
        updateProject,
    } = useStore(state => ({
        selectedProjectId: state.selectedProjectId,
        assignAudioToLine: state.assignAudioToLine,
        updateLineAudio: state.updateLineAudio,
        selectedChapterId: state.selectedChapterId,
        characters: state.characters, // needed for exporter
        updateLineEmotion: state.updateLineEmotion,
        updateProject: state.updateProject,
    }));

    const [isExporting, setIsExporting] = useState(false);
    const [selectedCharacterId, setSelectedCharacterId] = useState<string>('');
    const [chapterFilter, setChapterFilter] = useState('');
    const [trimmingRowId, setTrimmingRowId] = useState<string | null>(null);

    // Using hooks for different responsibilities
    const { isGenerating, serverHealth, checkServerHealth, uploadTtsPrompt, generateTtsBatch } = useTtsApi();
    const { rows, setRows, currentProject, charactersInProject } = useVoiceLibraryData({
        selectedCharacterId,
        chapterFilter
    });
    const { generatedAudioUrls, persistedPromptUrls, createPromptUrl, revokePromptUrl, cleanupRowUrls } = useAudioUrlManager(
        rows,
        currentProject
    );

    const selectedCharacter = useMemo(
        () => charactersInProject.find(c => c.id === selectedCharacterId),
        [charactersInProject, selectedCharacterId]
    );
    
    const trimmingRow = useMemo(() => {
        if (!trimmingRowId) return null;
        const row = rows.find(r => r.id === trimmingRowId);
        if (!row) return null;
        // Ensure we have a URL to trim
        const url = row.promptAudioUrl || (persistedPromptUrls ? persistedPromptUrls[row.id] : null);
        if (!url) return null;
        return { ...row, urlToTrim: url };
    }, [rows, trimmingRowId, persistedPromptUrls]);

    // Sync chapter selection from other pages
    useEffect(() => {
        if (currentProject && selectedChapterId) {
            const chapterIndex = currentProject.chapters.findIndex(c => c.id === selectedChapterId);
            if (chapterIndex !== -1) {
                const chapterNum = chapterIndex + 1;
                setChapterFilter(prev => prev === String(chapterNum) ? prev : String(chapterNum));
            }
        }
    }, [selectedChapterId, currentProject]);

    const updateRow = useCallback((id: string, updates: Partial<VoiceLibraryRowState>) => {
        setRows(prevRows => prevRows.map(row => row.id === id ? { ...row, ...updates } : row));
    }, [setRows]);

    // Check server health on mount
    useEffect(() => {
        checkServerHealth();
    }, [checkServerHealth]);

    // Persist prompt blobs and sync serverPath when available
    useEffect(() => {
        const persist = async () => {
            if (!currentProject) return;
            for (const row of rows) {
                if (!row.originalLineId) continue;
                const rec = await voiceLibraryPromptRepository.get(currentProject.id, row.originalLineId);

                // If we have an object URL but no record, store it
                if (!rec && row.promptAudioUrl) {
                    try {
                        const blob = await fetch(row.promptAudioUrl).then(r => r.blob());
                        await voiceLibraryPromptRepository.save({
                            id: `${currentProject.id}::${row.originalLineId}`,
                            projectId: currentProject.id,
                            originalLineId: row.originalLineId,
                            fileName: row.promptFileName || null,
                            serverPath: row.promptFilePath || null,
                            data: blob,
                        });
                    } catch {}
                }

                // If record exists but serverPath changed/added, update
                if (rec && row.promptFilePath && rec.serverPath !== row.promptFilePath) {
                    await voiceLibraryPromptRepository.save({
                        id: rec.id,
                        projectId: rec.projectId,
                        originalLineId: rec.originalLineId,
                        fileName: rec.fileName,
                        serverPath: row.promptFilePath,
                        data: rec.data,
                    });
                }
            }
        };
        persist();
    }, [rows, currentProject]);

    // Restore promptFilePath and fileName from IndexedDB if missing
    useEffect(() => {
        const restore = async () => {
            if (!currentProject) return;
            for (const row of rows) {
                if (row.originalLineId && !row.promptFilePath) {
                    const rec = await voiceLibraryPromptRepository.get(currentProject.id, row.originalLineId);
                    if (rec) {
                        updateRow(row.id, { promptFilePath: rec.serverPath, promptFileName: rec.fileName });
                    }
                }
            }
        };
        restore();
    }, [rows, currentProject, updateRow]);

    // --- Business Logic Handlers ---
    
    const handleUpload = useCallback(async (rowId: string, file: File) => {
        const promptUrl = createPromptUrl(rowId, file);

        updateRow(rowId, {
            status: 'uploading',
            error: null,
            promptAudioUrl: promptUrl,
            promptFileName: file.name
        });

        try {
            const filePath = await uploadTtsPrompt(file);
            updateRow(rowId, { promptFilePath: filePath, status: 'idle' });
        } catch (err) {
            updateRow(rowId, {
                status: 'error',
                error: err instanceof Error ? err.message : '未知上传错误',
                promptFilePath: null
            });
        }
    }, [updateRow, uploadTtsPrompt, createPromptUrl]);

    const handleBatchGenerate = useCallback(async () => {
        const rowsToProcess = rows.filter(r => r.text.trim() && r.promptFilePath && r.originalLineId);
        if (rowsToProcess.length === 0) {
            alert('没有可生成的行 (确保已上传参考音频并填写了台词)。');
            return;
        }

        if (!selectedProjectId || !currentProject) return;

        rowsToProcess.forEach(r => updateRow(r.id, { status: 'generating', error: null }));

        try {
            const ttsItems = rowsToProcess.map(r => ({
                promptAudio: r.promptFilePath!,
                text: `(${r.emotion || 'normal'}) ${r.text}`
            }));
            const results = await generateTtsBatch(ttsItems);

            for (let i = 0; i < results.length; i++) {
                const item = results[i];
                const row = rowsToProcess[i];

                if (item.ok && item.audioUrl) {
                    const result = await processAndAssignAudio(
                        row,
                        item.audioUrl,
                        currentProject,
                        selectedProjectId,
                        assignAudioToLine
                    );

                    if (result.success) {
                        updateRow(row.id, { status: 'done' });
                    } else {
                        updateRow(row.id, { status: 'error', error: result.error || '保存失败' });
                    }
                } else {
                    updateRow(row.id, { status: 'error', error: String(item.error || '生成失败') });
                }
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : '未知错误';
            rowsToProcess.forEach(r => updateRow(r.id, { status: 'error', error: errorMsg }));
        }
    }, [rows, updateRow, generateTtsBatch, selectedProjectId, currentProject, assignAudioToLine]);
    
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

        if (!selectedProjectId || !currentProject) return;

        updateRow(rowId, { status: 'generating', error: null });

        try {
            const ttsItem = {
                promptAudio: row.promptFilePath,
                text: `(${row.emotion || 'normal'}) ${row.text}`,
            };
            const results = await generateTtsBatch([ttsItem]);
            const item = results[0];

            if (!item) {
                throw new Error('TTS服务未返回有效结果。');
            }

            if (item.ok && item.audioUrl) {
                const result = await processAndAssignAudio(
                    row,
                    item.audioUrl,
                    currentProject,
                    selectedProjectId,
                    assignAudioToLine
                );

                if (result.success) {
                    updateRow(rowId, { status: 'done' });
                } else {
                    updateRow(rowId, { status: 'error', error: result.error || '生成失败' });
                }
            } else {
                updateRow(rowId, { status: 'error', error: String(item.error || '生成失败') });
            }
        } catch (err) {
            updateRow(rowId, { status: 'error', error: err instanceof Error ? err.message : '未知错误' });
        }
    }, [rows, updateRow, generateTtsBatch, selectedProjectId, currentProject, assignAudioToLine]);
    
    const handleDeleteGeneratedAudio = useCallback(async (rowId: string) => {
        const row = rows.find(r => r.id === rowId);
        if (!row || !selectedProjectId || !currentProject) return;

        await deleteGeneratedAudio(row, currentProject, selectedProjectId, updateLineAudio);
        // Reset to idle so user can regenerate immediately
        updateRow(rowId, { status: 'idle', error: null });
    }, [rows, selectedProjectId, currentProject, updateLineAudio, updateRow]);

    const handleDeletePromptAudio = useCallback(async (rowId: string) => {
        revokePromptUrl(rowId);
        // Also remove persisted prompt from database
        if (currentProject) {
            const row = rows.find(r => r.id === rowId);
            if (row?.originalLineId) {
                await voiceLibraryPromptRepository.delete(currentProject.id, row.originalLineId);
            }
        }
        updateRow(rowId, {
            promptFilePath: null,
            promptAudioUrl: null,
            promptFileName: null,
            status: 'idle',
            error: null
        });
    }, [rows, currentProject, updateRow, revokePromptUrl]);

    const addEmptyRow = useCallback(() => {
        setRows(prev => [...prev, {
            id: `row_manual_${Date.now()}`,
            promptFilePath: null,
            promptAudioUrl: null,
            promptFileName: null,
            text: '',
            status: 'idle',
            audioUrl: null,
            error: null,
        }]);
    }, [setRows]);

    const removeRow = useCallback((id: string) => {
        cleanupRowUrls(id);
        setRows(prev => prev.filter(row => row.id !== id));
    }, [cleanupRowUrls, setRows]);

    const handleTextChange = useCallback((id: string, text: string) => {
        updateRow(id, { text });
    }, [updateRow]);

    const handleEmotionChange = useCallback((rowId: string, emotion: string) => {
        updateRow(rowId, { emotion });

        const row = rows.find(r => r.id === rowId);
        if (!row || !row.originalLineId || !currentProject) return;

        const chapter = currentProject.chapters.find(ch => ch.scriptLines.some(l => l.id === row.originalLineId));
        if (!chapter) return;

        updateLineEmotion(currentProject.id, chapter.id, row.originalLineId, emotion);
    }, [rows, currentProject, updateRow, updateLineEmotion]);

    const handleApplyBatchEmotions = useCallback((updates: { rowId: string, emotion: string }[]) => {
        if (!currentProject) return;
    
        const updateMap = new Map(updates.map(u => [u.rowId, u.emotion]));
    
        setRows(prevRows =>
            prevRows.map(row => {
                if (updateMap.has(row.id)) {
                    return { ...row, emotion: updateMap.get(row.id)! };
                }
                return row;
            })
        );
    
        const lineToEmotionMap = new Map<string, string>();
        updates.forEach(u => {
            const row = rows.find(r => r.id === u.rowId);
            if(row && row.originalLineId) {
                lineToEmotionMap.set(row.originalLineId, u.emotion);
            }
        });
    
        if (lineToEmotionMap.size === 0) return;
    
        const updatedProject = {
            ...currentProject,
            chapters: currentProject.chapters.map(ch => ({
                ...ch,
                scriptLines: ch.scriptLines.map(line => 
                    lineToEmotionMap.has(line.id)
                        ? { ...line, emotion: lineToEmotionMap.get(line.id) }
                        : line
                )
            }))
        };
        
        updateProject(updatedProject);
    
    }, [rows, currentProject, setRows, updateProject]);

    const handleExport = useCallback(async () => {
        if (!currentProject || !selectedCharacter) return;

        setIsExporting(true);
        try {
            await exportMarkedWav(rows, currentProject, selectedCharacter, generatedAudioUrls, characters);
        } catch (error) {
            alert(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
        } finally {
            setIsExporting(false);
        }
    }, [currentProject, selectedCharacter, rows, generatedAudioUrls, characters]);

    const handleExportCharacterClips = useCallback(async () => {
        if (!currentProject) return;

        setIsExporting(true);
        try {
            await exportCharacterClips(rows, currentProject, characters, generatedAudioUrls, selectedCharacter);
        } catch (error) {
            alert(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
        } finally {
            setIsExporting(false);
        }
    }, [currentProject, rows, characters, generatedAudioUrls, selectedCharacter]);

    const handleTrimRequest = useCallback((rowId: string) => {
        setTrimmingRowId(rowId);
    }, []);

    const handleCloseTrimmer = useCallback(() => {
        setTrimmingRowId(null);
    }, []);

    const handleConfirmTrim = useCallback(async (newAudioBlob: Blob) => {
        if (!trimmingRowId) return;
        const row = rows.find(r => r.id === trimmingRowId);
        if (!row) return;

        const originalFileName = row.promptFileName || "trimmed_audio.wav";
        const newFileName = originalFileName.replace(/(\.[\w\d_-]+)$/i, '_trimmed$1');
        
        const trimmedFile = new File([newAudioBlob], newFileName, { type: newAudioBlob.type });

        await handleUpload(trimmingRowId, trimmedFile);
        
        handleCloseTrimmer();
    }, [trimmingRowId, rows, handleUpload, handleCloseTrimmer]);
    
    const handleSelectCharacter = useCallback((charId: string) => {
        setSelectedCharacterId(charId);
    }, []);

    return {
        rows,
        currentProject,
        charactersInProject,
        allCharacters: characters,
        selectedCharacter,
        isGenerating,
        isExporting,
        serverHealth,
        chapterFilter,
        setChapterFilter,
        selectedCharacterId,
        handleSelectCharacter,
        checkServerHealth,
        handleBatchGenerate,
        handleGenerateSingle,
        handleUpload,
        handleTextChange,
        handleEmotionChange,
        handleApplyBatchEmotions,
        removeRow,
        addEmptyRow,
        handleDeleteGeneratedAudio,
        handleDeletePromptAudio,
        handleExport,
        handleExportCharacterClips,
        generatedAudioUrls,
        persistedPromptUrls,
        trimmingRow,
        handleTrimRequest,
        handleCloseTrimmer,
        handleConfirmTrim,
    };
};