export const stripPostProductionMarkers = (text: string): string => {
  if (!text) return '';

  let result = text;

  // Remove SFX markers such as [门铃声] and their full-width variants.
  const sfxRegex = /[\[\uFF3B\u3010\u3014][^\]\uFF3D\u3011\u3015]+[\]\uFF3D\u3011\u3015]/g;
  result = result.replace(sfxRegex, '');

  // Remove BGM markers like <BGM名称> (optionally with leading ♪-/♫- style prefixes).
  const bgmRegex = /<\s*(?:(?:\?-|[\u266A\u266B])\s*-\s*)?([^<>]*?)\s*>/g;
  result = result.replace(bgmRegex, '');

  // Remove BGM end markers like //, ///, etc.
  const endRegex = /\/\/+\s*/g;
  result = result.replace(endRegex, '');

  // Remove legacy mojibake markers such as ??xxx??yyy?? if they exist.
  const legacyRegex = /\?\?[^?]+\?\?[^?]+\?\?/g;
  result = result.replace(legacyRegex, '');

  // Normalize excessive whitespace that may be left after removals.
  result = result.replace(/\s{2,}/g, ' ').trim();

  return result;
};

export const escapeHtml = (text: string): string => {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

