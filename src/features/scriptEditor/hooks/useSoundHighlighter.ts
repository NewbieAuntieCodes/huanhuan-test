import { useMemo } from 'react';
import { SoundLibraryItem, IgnoredSoundKeyword } from '../../../types';

// Utility to escape HTML special characters
const escapeHtml = (text: string) => {
    // FIX: Add a fallback to an empty string to prevent runtime errors if `text` is undefined.
    return (text || '')
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
    observationList: string[],
    ignoredKeywords: IgnoredSoundKeyword[] = []
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
        if (!text || !combinedRegex) return escapeHtml(text);

        // Reset regex state for global regex
        combinedRegex.lastIndex = 0;

        let lastIndex = 0;
        const parts = [];
        let match;

        while ((match = combinedRegex.exec(text)) !== null) {
            const matchText = match[0];
            const matchIndex = match.index;

            // Add text before the match
            if (matchIndex > lastIndex) {
                parts.push(escapeHtml(text.substring(lastIndex, matchIndex)));
            }

            const isIgnored = ignoredKeywords.some(ik => ik.keyword === matchText && ik.index === matchIndex);

            // Add the highlighted match
            if (isIgnored) {
                parts.push(escapeHtml(matchText));
            } else if (matchText.startsWith('（') && matchText.endsWith('）')) {
                const title = matchText.slice(1, -1).replace('，', ', ');
                parts.push(`<span class="manual-sound-marker" title="音效标记: ${escapeHtml(title)}">${escapeHtml(matchText)}</span>`);
            } else {
                parts.push(`<span class="sound-keyword-highlight" data-keyword="${escapeHtml(matchText)}">${escapeHtml(matchText)}</span>`);
            }

            lastIndex = matchIndex + matchText.length;
        }

        // Add any remaining text after the last match
        if (lastIndex < text.length) {
            parts.push(escapeHtml(text.substring(lastIndex)));
        }

        return parts.join('');
    }, [text, combinedRegex, ignoredKeywords]);

    return highlightedHtml;
};