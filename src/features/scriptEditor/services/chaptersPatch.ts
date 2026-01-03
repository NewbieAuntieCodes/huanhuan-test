import type { Chapter, Character, IgnoredSoundKeyword, PinnedSound, Project } from '../../../types';
import { normalizeCharacterNameKey } from '../../../lib/characterName';

export const CHAPTERS_PATCH_SCHEMA_VERSION = 1 as const;

export type ChaptersPatchExportScope = 'all' | 'multi' | 'view';

export interface ChaptersPatchCharacterV1 {
  name: string;
  color: string;
  textColor?: string;
  cvName?: string;
  description?: string;
  isStyleLockedToCv?: boolean;
}

export interface ChaptersPatchScriptLineV1 {
  id: string;
  text: string;
  originalText?: string;
  characterName?: string | null;
  soundType?: string;
  emotion?: string;
  isTextModifiedManual?: boolean;
  isMarkedForReturn?: boolean;
  feedback?: string;
  postSilence?: number;
  ignoredSoundKeywords?: IgnoredSoundKeyword[];
  pinnedSounds?: PinnedSound[];
}

export interface ChaptersPatchChapterV1 {
  id: string;
  title: string;
  rawContent: string;
  scriptLines: ChaptersPatchScriptLineV1[];
}

export interface ChaptersPatchV1 {
  kind: 'chaptersPatch';
  schemaVersion: typeof CHAPTERS_PATCH_SCHEMA_VERSION;
  createdAt: number;
  source: {
    projectId: string;
    projectName: string;
  };
  projectMeta?: {
    cvStyles?: Project['cvStyles'];
    customSoundTypes?: Project['customSoundTypes'];
  };
  characters: ChaptersPatchCharacterV1[];
  chapters: ChaptersPatchChapterV1[];
}

const safeRawContent = (chapter: Chapter): string => {
  const trimmed = (chapter.rawContent || '').trim();
  if (trimmed) return chapter.rawContent;
  return (chapter.scriptLines || []).map((l) => l.text).join('\n');
};

export function buildChaptersPatch(args: {
  project: Project;
  chapters: Chapter[];
  characters: Character[];
}): ChaptersPatchV1 {
  const { project, chapters, characters } = args;

  const characterById = new Map<string, Character>();
  characters.forEach((c) => characterById.set(c.id, c));

  const usedCharacterNames = new Set<string>();

  const patchChapters: ChaptersPatchChapterV1[] = chapters.map((chapter) => {
    const patchLines: ChaptersPatchScriptLineV1[] = (chapter.scriptLines || []).map((line) => {
      const characterName = line.characterId ? characterById.get(line.characterId)?.name || null : null;
      if (characterName) usedCharacterNames.add(characterName);

      return {
        id: line.id,
        text: line.text,
        originalText: line.originalText,
        characterName,
        soundType: line.soundType,
        emotion: line.emotion,
        isTextModifiedManual: line.isTextModifiedManual,
        isMarkedForReturn: line.isMarkedForReturn,
        feedback: line.feedback,
        postSilence: line.postSilence,
        ignoredSoundKeywords: line.ignoredSoundKeywords,
        pinnedSounds: line.pinnedSounds,
      };
    });

    return {
      id: chapter.id,
      title: chapter.title,
      rawContent: safeRawContent(chapter),
      scriptLines: patchLines,
    };
  });

  const patchCharacters: ChaptersPatchCharacterV1[] = [];
  const added = new Set<string>();
  for (const name of usedCharacterNames) {
    const key = normalizeCharacterNameKey(name);
    if (added.has(key)) continue;
    const char = characters.find((c) => normalizeCharacterNameKey(c.name) === key);
    if (!char) continue;
    patchCharacters.push({
      name: char.name,
      color: char.color,
      textColor: char.textColor,
      cvName: char.cvName,
      description: char.description,
      isStyleLockedToCv: char.isStyleLockedToCv,
    });
    added.add(key);
  }

  return {
    kind: 'chaptersPatch',
    schemaVersion: CHAPTERS_PATCH_SCHEMA_VERSION,
    createdAt: Date.now(),
    source: { projectId: project.id, projectName: project.name },
    projectMeta: {
      cvStyles: project.cvStyles,
      customSoundTypes: project.customSoundTypes,
    },
    characters: patchCharacters,
    chapters: patchChapters,
  };
}

export function parseChaptersPatchJson(text: string): ChaptersPatchV1 {
  const raw = JSON.parse(text) as unknown;
  if (!raw || typeof raw !== 'object') {
    throw new Error('无效文件：不是 JSON 对象');
  }

  const patch = raw as Partial<ChaptersPatchV1>;
  if (patch.kind !== 'chaptersPatch') throw new Error('无效文件：kind 不匹配');
  if (patch.schemaVersion !== CHAPTERS_PATCH_SCHEMA_VERSION) {
    throw new Error(`不支持的版本：schemaVersion=${String(patch.schemaVersion)}`);
  }
  if (!patch.source?.projectId) throw new Error('无效文件：缺少 source.projectId');
  if (!Array.isArray(patch.chapters)) throw new Error('无效文件：chapters 不是数组');
  if (!Array.isArray(patch.characters)) throw new Error('无效文件：characters 不是数组');

  return patch as ChaptersPatchV1;
}

export function sanitizeFilename(name: string, maxLength: number = 180): string {
  const sanitized = name
    .replace(/[\r\n]/g, ' ')
    .replace(/[<>:"/\\|?*]+/g, '_')
    .replace(/_+/g, '_')
    .trim();

  if (sanitized.length > maxLength) return sanitized.slice(0, maxLength).trim();
  return sanitized || 'export';
}

export function formatDateForFilename(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${mi}`;
}
