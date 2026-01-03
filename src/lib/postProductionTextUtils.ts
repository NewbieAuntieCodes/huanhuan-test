export const stripPostProductionMarkers = (text: string): string => {
  if (!text) return '';

  let result = text;

  // Remove SFX markers such as [门铃声]. Keep full-width brackets (e.g., 【】) for story text.
  const sfxRegex = /[\[\uFF3B][^\]\uFF3D]+[\]\uFF3D]/g;
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
