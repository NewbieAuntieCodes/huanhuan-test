import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../../../db';
import { Project } from '../../../types';
import { VoiceLibraryRowState } from './useVoiceLibraryData';

/**
 * Custom hook to manage Object URLs for audio files (both prompt and generated).
 * Handles creation, cleanup, and synchronization of audio URLs.
 */
export const useAudioUrlManager = (
    rows: VoiceLibraryRowState[],
    currentProject: Project | undefined
) => {
    const [generatedAudioUrls, setGeneratedAudioUrls] = useState<Record<string, string>>({});
    const [persistedPromptUrls, setPersistedPromptUrls] = useState<Record<string, string>>({});
    const objectUrlsRef = useRef<Record<string, string>>({});

    // Cleanup all object URLs on unmount
    useEffect(() => {
        const promptUrls = Object.values(objectUrlsRef.current);
        const genUrls = Object.values(generatedAudioUrls);

        return () => {
            promptUrls.forEach(URL.revokeObjectURL);
            genUrls.forEach(URL.revokeObjectURL);
        };
    }, [generatedAudioUrls]);

    // Sync generated audio URLs from database
    useEffect(() => {
        const syncAudioUrls = async () => {
            if (!currentProject) return;

            const newUrls: Record<string, string> = {};
            const urlsToRevoke: string[] = [];
            const currentRowIds = new Set(rows.map(r => r.id));
            const existingUrlKeys = new Set(Object.keys(generatedAudioUrls));

            // Create URLs for new rows, and revoke URLs whose blobs were removed
            for (const row of rows) {
                const existingUrl = generatedAudioUrls[row.id];
                const line = row.originalLineId ? currentProject.chapters
                        .flatMap(ch => ch.scriptLines)
                        .find(l => l.id === row.originalLineId) : undefined;

                if (row.originalLineId && !existingUrl && line?.audioBlobId) {
                    const audioBlob = await db.audioBlobs.get(line.audioBlobId);
                    if (audioBlob) {
                        newUrls[row.id] = URL.createObjectURL(audioBlob.data);
                    }
                }

                if (existingUrl && (!line || !line.audioBlobId)) {
                    urlsToRevoke.push(existingUrl);
                }
            }

            // Find URLs to revoke for rows that no longer exist
            existingUrlKeys.forEach(rowId => {
                if (!currentRowIds.has(rowId)) {
                    urlsToRevoke.push(generatedAudioUrls[rowId]);
                }
            });

            // Revoke old URLs
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

            // Add new URLs
            if (Object.keys(newUrls).length > 0) {
                setGeneratedAudioUrls(prev => ({ ...prev, ...newUrls }));
            }
        };

        syncAudioUrls();
    }, [rows, currentProject, generatedAudioUrls]);

    // Sync persisted prompt URLs from database (for reference audios)
    useEffect(() => {
        const syncPromptUrls = async () => {
            if (!currentProject) return;

            const next: Record<string, string> = {};
            const toRevoke: string[] = [];
            const existing = { ...persistedPromptUrls };

            for (const row of rows) {
                if (!row.originalLineId) continue;
                const id = `${currentProject.id}::${row.originalLineId}`;
                const record = await db.voiceLibraryPrompts.get(id);
                if (record) {
                    if (!persistedPromptUrls[row.id]) {
                        next[row.id] = URL.createObjectURL(record.data);
                    }
                } else if (persistedPromptUrls[row.id]) {
                    toRevoke.push(persistedPromptUrls[row.id]);
                }
            }

            // Revoke removed
            if (toRevoke.length > 0) {
                toRevoke.forEach(URL.revokeObjectURL);
                setPersistedPromptUrls(prev => {
                    const copy = { ...prev };
                    toRevoke.forEach(url => {
                        const key = Object.keys(copy).find(k => copy[k] === url);
                        if (key) delete copy[key];
                    });
                    return copy;
                });
            }

            if (Object.keys(next).length > 0) {
                setPersistedPromptUrls(prev => ({ ...prev, ...next }));
            }
        };

        syncPromptUrls();
    }, [rows, currentProject, persistedPromptUrls]);

    /**
     * Create an Object URL for a prompt audio file
     */
    const createPromptUrl = useCallback((rowId: string, file: File): string => {
        // Revoke old URL if exists
        if (objectUrlsRef.current[rowId]) {
            URL.revokeObjectURL(objectUrlsRef.current[rowId]);
        }

        const url = URL.createObjectURL(file);
        objectUrlsRef.current[rowId] = url;
        return url;
    }, []);

    /**
     * Revoke a prompt audio Object URL
     */
    const revokePromptUrl = useCallback((rowId: string) => {
        if (objectUrlsRef.current[rowId]) {
            URL.revokeObjectURL(objectUrlsRef.current[rowId]);
            delete objectUrlsRef.current[rowId];
        }
    }, []);

    /**
     * Revoke a generated audio Object URL
     */
    const revokeGeneratedUrl = useCallback((rowId: string) => {
        if (generatedAudioUrls[rowId]) {
            URL.revokeObjectURL(generatedAudioUrls[rowId]);
            setGeneratedAudioUrls(prev => {
                const next = { ...prev };
                delete next[rowId];
                return next;
            });
        }
    }, [generatedAudioUrls]);

    /**
     * Clean up all URLs for a specific row
     */
    const cleanupRowUrls = useCallback((rowId: string) => {
        revokePromptUrl(rowId);
        revokeGeneratedUrl(rowId);
    }, [revokePromptUrl, revokeGeneratedUrl]);

    return {
        generatedAudioUrls,
        persistedPromptUrls,
        objectUrlsRef,
        createPromptUrl,
        revokePromptUrl,
        revokeGeneratedUrl,
        cleanupRowUrls,
    };
};
