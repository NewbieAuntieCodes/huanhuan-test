import { db } from '../../../db';
import { Project } from '../../../types';
import { VoiceLibraryRowState } from '../hooks/useVoiceLibraryData';
import { TTS_SERVER_ORIGIN } from '../../../services/ttsService';

/**
 * Result of processing and assigning audio
 */
export interface AudioAssignmentResult {
    success: boolean;
    error?: string;
}

/**
 * Process generated audio from TTS server and assign it to a script line.
 *
 * @param row - The voice library row containing line information
 * @param audioPath - Path to the generated audio (relative or absolute URL)
 * @param project - Current project
 * @param projectId - Project ID
 * @param assignAudioToLine - Function to assign audio blob to a line
 * @returns Result indicating success or failure
 */
export const processAndAssignAudio = async (
    row: VoiceLibraryRowState,
    audioPath: string,
    project: Project,
    projectId: string,
    assignAudioToLine: (projectId: string, chapterId: string, lineId: string, audioBlob: Blob) => Promise<void>
): Promise<AudioAssignmentResult> => {
    if (!row.originalLineId) {
        return { success: false, error: '缺少原始台词ID' };
    }

    // Find the chapter containing this line
    const chapter = project.chapters.find(ch =>
        ch.scriptLines.some(l => l.id === row.originalLineId)
    );

    if (!chapter) {
        return { success: false, error: '找不到原始章节' };
    }

    // Construct full audio URL
    const fullAudioUrl = audioPath.startsWith('http')
        ? audioPath
        : `${TTS_SERVER_ORIGIN}/${audioPath.replace(/\\/g, '/').replace(/^\//, '')}`;

    try {
        // Fetch the generated audio
        const audioRes = await fetch(fullAudioUrl);
        if (!audioRes.ok) {
            throw new Error('下载生成的音频失败');
        }

        const audioBlob = await audioRes.blob();

        // Assign audio to the line
        await assignAudioToLine(projectId, chapter.id, row.originalLineId, audioBlob);

        return { success: true };
    } catch (e) {
        const errorMsg = e instanceof Error ? e.message : '保存音频失败';
        return { success: false, error: errorMsg };
    }
};

/**
 * Delete generated audio for a specific line from the database.
 *
 * @param row - The voice library row
 * @param project - Current project
 * @param projectId - Project ID
 * @param updateLineAudio - Function to update line audio reference
 * @returns Result indicating success or failure
 */
export const deleteGeneratedAudio = async (
    row: VoiceLibraryRowState,
    project: Project,
    projectId: string,
    updateLineAudio: (projectId: string, chapterId: string, lineId: string, audioBlobId: string | null) => Promise<void>
): Promise<AudioAssignmentResult> => {
    if (!row.originalLineId) {
        return { success: false, error: '缺少原始台词ID' };
    }

    // Find the chapter and line
    const chapter = project.chapters.find(ch =>
        ch.scriptLines.some(l => l.id === row.originalLineId)
    );

    const line = chapter?.scriptLines.find(l => l.id === row.originalLineId);

    if (!chapter || !line) {
        return { success: false, error: '找不到原始台词' };
    }

    try {
        // Delete audio blob if exists
        if (line.audioBlobId) {
            await db.audioBlobs.delete(line.audioBlobId);
            await updateLineAudio(projectId, chapter.id, line.id, null);
        }

        return { success: true };
    } catch (e) {
        const errorMsg = e instanceof Error ? e.message : '删除音频失败';
        return { success: false, error: errorMsg };
    }
};
