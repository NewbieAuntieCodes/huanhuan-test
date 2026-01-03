export function normalizeCharacterNameKey(name: string): string {
  return (name || '')
    .normalize('NFKC')
    // Remove zero-width characters that often sneak in via copy/paste.
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Collapse all whitespace (including full-width spaces after NFKC) to a single ASCII space.
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function sanitizeCharacterDisplayName(name: string): string {
  return (name || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

