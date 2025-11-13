import { useMemo } from 'react';
import { SoundLibraryItem, IgnoredSoundKeyword } from '../../../types';

// Escape HTML special characters
const escapeHtml = (text: string) => {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// Create keywords from filenames
const createKeywordsFromFilename = (filename: string): string[] => {
  const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;
  return nameWithoutExt
    .split(/[_ \-()]/)
    .map((s) => s.trim())
    .filter((s) => s && !/^\d+$/.test(s));
};

export const useSoundHighlighter = (
  text: string,
  soundLibrary: SoundLibraryItem[],
  observationList: string[],
  ignoredKeywords: IgnoredSoundKeyword[] = []
): string => {
  const combinedRegex = useMemo(() => {
    // Build keyword set
    const soundKeywords = new Set<string>();
    soundLibrary.forEach((item) => {
      createKeywordsFromFilename(item.name).forEach((kw) => soundKeywords.add(kw));
    });
    const allKeywords = new Set<string>([...soundKeywords, ...observationList]);

    // Filter short/meaningless keywords
    const filteredKeywords = Array.from(allKeywords).filter((kw) => kw.length > 1);

    // Patterns
    const legacyMarker = `��([^��]+)��([^��]+)��`; // legacy mojibake-safe markers
    const bracketSfx = `\\[[^\\[\\]]+\\]`; // [任意内容]

    if (filteredKeywords.length === 0) {
      return new RegExp(`${bracketSfx}|${legacyMarker}`, 'g');
    }

    // Escape keywords and sort by length (longest-first)
    const sortedKeywords = filteredKeywords.sort((a, b) => b.length - a.length);
    const escapedKeywords = sortedKeywords.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const keywordsPattern = `(${escapedKeywords.join('|')})`;

    return new RegExp(`${keywordsPattern}|${bracketSfx}|${legacyMarker}`, 'g');
  }, [soundLibrary, observationList]);

  const highlightedHtml = useMemo(() => {
    if (!text || !combinedRegex) return escapeHtml(text);

    combinedRegex.lastIndex = 0; // reset global regex

    let lastIndex = 0;
    const parts: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = combinedRegex.exec(text)) !== null) {
      const matchText = match[0];
      const matchIndex = match.index;

      if (matchIndex > lastIndex) {
        parts.push(escapeHtml(text.substring(lastIndex, matchIndex)));
      }

      const isIgnored = ignoredKeywords.some((ik) => ik.keyword === matchText && ik.index === matchIndex);

      if (isIgnored) {
        parts.push(escapeHtml(matchText));
      } else if (matchText.startsWith('��') && matchText.endsWith('��')) {
        const title = matchText.slice(1, -1).replace('��', ', ');
        parts.push(`<span class=\"manual-sound-marker\" title=\"音效标记: ${escapeHtml(title)}\">${escapeHtml(matchText)}</span>`);
      } else if (matchText.startsWith('[') && matchText.endsWith(']')) {
        const inner = matchText.slice(1, -1);
        parts.push(`<span class=\"sound-keyword-highlight\" data-keyword=\"${escapeHtml(inner)}\" data-index=\"${match.index}\">${escapeHtml(matchText)}</span>`);
      } else {
        parts.push(`<span class=\"sound-keyword-highlight\" data-keyword=\"${escapeHtml(matchText)}\" data-index=\"${match.index}\">${escapeHtml(matchText)}</span>`);
      }

      lastIndex = matchIndex + matchText.length;
    }

    if (lastIndex < text.length) {
      parts.push(escapeHtml(text.substring(lastIndex)));
    }

    return parts.join('');
  }, [text, combinedRegex, ignoredKeywords]);

  return highlightedHtml;
};