import { useState, useEffect, useCallback, useMemo } from 'react';
import { useStore } from '../../../store/useStore';
import { exportMarkedWav, exportCharacterClips } from '../services/voiceLibraryExporter';
import { useTtsApi } from './useTtsApi';
import { useVoiceLibraryData, VoiceLibraryRowState } from './useVoiceLibraryData';
import { useAudioUrlManager } from './useAudioUrlManager';
import { processAndAssignAudio, deleteGeneratedAudio } from '../utils/audioAssignment';

export type { VoiceLibraryRowState }; // Re-export for other components

// --- Main Hook ---
export const useVoiceLibrary = () => {
    const { selectedProjectId, assignAudioToLine, updateLineAudio, selectedChapterId, characters } = useStore(state => ({
        selectedProjectId: state.selectedProjectId,
        assignAudioToLine: state.assignAudioToLine,
        updateLineAudio: state.updateLineAudio,
        selectedChapterId: state.selectedChapterId,
        characters: state.characters, // needed for exporter
    }));

    const [isExporting, setIsExporting] = useState(false);
    const [selectedCharacterId, setSelectedCharacterId] = useState<string>('');
    const [chapterFilter, setChapterFilter] = useState('');

    // Using hooks for different responsibilities
    const { isGenerating, serverHealth, checkServerHealth, uploadTtsPrompt, generateTtsBatch } = useTtsApi();
    const { rows, setRows, currentProject, charactersInProject } = useVoiceLibraryData({
        selectedCharacterId,
        chapterFilter
    });
    const { generatedAudioUrls, createPromptUrl, revokePromptUrl, cleanupRowUrls } = useAudioUrlManager(
        rows,
        currentProject
    );

    const selectedCharacter = useMemo(
        () => charactersInProject.find(c => c.id === selectedCharacterId),
        [charactersInProject, selectedCharacterId]
    );

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

    // --- Business Logic Handlers ---

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
                text: r.text
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
                text: row.text,
            };
            const results = await generateTtsBatch([ttsItem]);
            const item = results[0];

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
    
    const handleDeleteGeneratedAudio = useCallback(async (rowId: string) => {
        const row = rows.find(r => r.id === rowId);
        if (!row || !selectedProjectId || !currentProject) return;

        await deleteGeneratedAudio(row, currentProject, selectedProjectId, updateLineAudio);
    }, [rows, selectedProjectId, currentProject, updateLineAudio]);

    const handleDeletePromptAudio = useCallback((rowId: string) => {
        revokePromptUrl(rowId);
        updateRow(rowId, {
            promptFilePath: null,
            promptAudioUrl: null,
            promptFileName: null,
            status: 'idle',
            error: null
        });
    }, [updateRow, revokePromptUrl]);

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
