import { RoleLibrarySample } from '../../../types';

const tokenizeEmotion = (emotionRaw: string): string[] => {
  const normalized = (emotionRaw || '')
    .trim()
    .replace(/[()（）【】[\]{}<>“”"']/g, ' ')
    .replace(/[，,;；/|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return [];
  return normalized.split(' ').map((t) => t.trim()).filter(Boolean);
};

export function pickBestRoleSample(
  samples: RoleLibrarySample[],
  emotion?: string,
): RoleLibrarySample | null {
  if (!samples || samples.length === 0) return null;

  const tokens = tokenizeEmotion(emotion || '');
  if (tokens.length === 0) return samples[0];

  const lowerTokens = tokens.map((t) => t.toLowerCase());
  const scored = samples
    .map((s) => {
      const haystack = `${s.relativePath} ${s.fileName}`.toLowerCase();
      const score = lowerTokens.reduce((acc, t) => acc + (haystack.includes(t) ? 1 : 0), 0);
      return { s, score };
    })
    .sort((a, b) => b.score - a.score);

  if (scored[0].score > 0) return scored[0].s;
  return samples[0];
}

