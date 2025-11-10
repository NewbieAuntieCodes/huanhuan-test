import { useMemo } from 'react';
import { SoundLibraryItem } from '../../../types';

// Utility to escape HTML special characters
const escapeHtml = (text: string) => {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

// Utility to create keywords from filenames
const createKeywordsFromFilename = (filename: string): string[] => {
    const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;
    // Split by common delimiters and filter out empty strings
    return nameWithoutExt.split(/[_ \-()]/)
        .map(s => s.trim())
        .filter(s => s && !/^\d+$/.test(s)); // Filter out numeric-only parts
};

export const useSoundHighlighter = (
    text: string,
    soundLibrary: SoundLibraryItem[],
    observationList: string[]
): string => {
    const combinedRegex = useMemo(() => {
        // Keywords from sound library
        const soundKeywords = new Set<string>();
        soundLibrary.forEach(item => {
            createKeywordsFromFilename(item.name).forEach(kw => soundKeywords.add(kw));
        });

        // Combine all keywords
        const allKeywords = new Set([...soundKeywords, ...observationList]);
        
        // Filter out very short or meaningless keywords
        const filteredKeywords = Array.from(allKeywords).filter(kw => kw.length > 1);

        if (filteredKeywords.length === 0) {
            // Only match manual markers if no keywords exist
            return new RegExp(`（([^，]+)，([^）]+)）`, 'g');
        }

        // Escape keywords for regex and sort by length descending to match longest first
        const sortedKeywords = filteredKeywords.sort((a, b) => b.length - a.length);
        const escapedKeywords = sortedKeywords.map(kw => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        
        const keywordsPattern = `(${escapedKeywords.join('|')})`;
        const manualMarkerPattern = `（([^，]+)，([^）]+)）`;

        return new RegExp(`${keywordsPattern}|${manualMarkerPattern}`, 'g');
    }, [soundLibrary, observationList]);

    const highlightedHtml = useMemo(() => {
        if (!text) return '';

        // Simple split and map approach
        const parts = text.split(combinedRegex);
        const matches = text.match(combinedRegex);

        let resultHtml = '';
        parts.forEach((part, index) => {
            resultHtml += escapeHtml(part);
            if (matches && matches[index]) {
                const match = matches[index];
                if (match.startsWith('（') && match.endsWith('）')) {
                    const title = match.slice(1, -1).replace('，', ', ');
                    resultHtml += `<span class="manual-sound-marker" title="音效标记: ${escapeHtml(title)}">${escapeHtml(match)}</span>`;
                } else {
                    resultHtml += `<span class="sound-keyword-highlight" data-keyword="${escapeHtml(match)}">${escapeHtml(match)}</span>`;
                }
            }
        });
        
        return resultHtml;
    }, [text, combinedRegex]);

    return highlightedHtml;
};
