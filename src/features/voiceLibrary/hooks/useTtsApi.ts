import { useState, useCallback } from 'react';
import { 
    checkTtsServerHealth as checkHealthService, 
    uploadTtsPrompt as uploadPromptService, 
    generateTtsBatch as generateBatchService,
    TtsBatchItem 
} from '../../../services/ttsService';

type ServerHealth = 'checking' | 'ok' | 'error' | 'unknown';

export const useTtsApi = () => {
    const [isGenerating, setIsGenerating] = useState(false);
    const [serverHealth, setServerHealth] = useState<ServerHealth>('unknown');

    const checkServerHealth = useCallback(async () => {
        setServerHealth('checking');
        const isOk = await checkHealthService();
        setServerHealth(isOk ? 'ok' : 'error');
    }, []);

    const uploadTtsPrompt = useCallback(async (file: File): Promise<string> => {
        // This function doesn't need its own loading state as it's part of a row's state
        return await uploadPromptService(file);
    }, []);

    const generateTtsBatch = useCallback(async (items: TtsBatchItem[]) => {
        setIsGenerating(true);
        try {
            const results = await generateBatchService(items);
            return results;
        } finally {
            setIsGenerating(false);
        }
    }, []);

    return {
        isGenerating,
        serverHealth,
        checkServerHealth,
        uploadTtsPrompt,
        generateTtsBatch,
    };
};
