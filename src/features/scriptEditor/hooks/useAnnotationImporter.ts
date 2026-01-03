import { useState, useCallback } from 'react';
import { Project, Character, ScriptLine } from '../../../types';
import useStore from '../../../store/useStore';
import { normalizeCharacterNameKey, sanitizeCharacterDisplayName } from '../../../lib/characterName';

interface UseAnnotationImporterProps {
  currentProject: Project | null;
  onAddCharacter: (
    character: Pick<
      Character,
      'name' | 'color' | 'textColor' | 'cvName' | 'description' | 'isStyleLockedToCv'
    >
  ) => Character;
  applyUndoableProjectUpdate: (updater: (prevProject: Project) => Project) => void;
  selectedChapterId: string | null;
  multiSelectedChapterIds: string[];
  setMultiSelectedChapterIdsAfterProcessing: (ids: string[]) => void;
}

export const useAnnotationImporter = ({
  currentProject,
  onAddCharacter,
  applyUndoableProjectUpdate,
  selectedChapterId,
  multiSelectedChapterIds,
  setMultiSelectedChapterIdsAfterProcessing,
}: UseAnnotationImporterProps) => {
  const [isLoadingImportAnnotation, setIsLoadingImportAnnotation] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const handleOpenImportModalTrigger = useCallback(() => {
    setIsImportModalOpen(true);
  }, []);

  const handleImportPreAnnotatedScript = useCallback(
    async (annotatedText: string): Promise<Map<string, string>> => {
      const chapterIds =
        multiSelectedChapterIds.length > 0
          ? multiSelectedChapterIds
          : selectedChapterId
          ? [selectedChapterId]
          : [];
      if (!currentProject || chapterIds.length === 0) return new Map();

      setIsLoadingImportAnnotation(true);
      const charactersWithCvToUpdate = new Map<string, string>();

      try {
        // 先把 AI 返回的文本解析成「台词内容 -> { 角色名, CV }」的映射。
        const annotationMap = new Map<string, { charName: string; cvName?: string }>();

        // 1) 兼容旧格式：▽角色▼※台词§
        const markerRegex = /▽(.*?)▼※([\s\S]*?)§/g;
        let match: RegExpExecArray | null;
        while ((match = markerRegex.exec(annotatedText)) !== null) {
          const speakerTag = match[1].trim();
          const dialogueContent = match[2];

          let charName = speakerTag;
          let cvName: string | undefined = undefined;

          const parts = speakerTag.split(/[-ㄜ每〞]/);
          if (parts.length > 1) {
            const potentialCv = parts[0].trim();
            const potentialCharName = parts.slice(1).join('-').trim();
            if (potentialCv && potentialCharName) {
              cvName = potentialCv;
              charName = potentialCharName;
            }
          }
          annotationMap.set(dialogueContent, { charName, cvName });
        }

        // 2) 新兼容：AI 直接输出【CV-角色】“台词” / 【角色】“台词”，台词不一定另起一行
        const bracketQuoteRegex =
          /[【\[]([^【\]\]\r\n]+)[】\]]\s*(?:[:：])?\s*(?:“([\s\S]*?)”|"([\s\S]*?)")/g;
        while ((match = bracketQuoteRegex.exec(annotatedText)) !== null) {
          const speakerTag = match[1].trim();
          const dialogueContent = match[2] ?? match[3] ?? '';
          if (!dialogueContent) continue;

          let charName = speakerTag;
          let cvName: string | undefined = undefined;

          const parts = speakerTag.split(/[-ㄜ每〞]/);
          if (parts.length > 1) {
            const potentialCv = parts[0].trim();
            const potentialCharName = parts.slice(1).join('-').trim();
            if (potentialCv && potentialCharName) {
              cvName = potentialCv;
              charName = potentialCharName;
            }
          }

          if (!annotationMap.has(dialogueContent)) {
            annotationMap.set(dialogueContent, { charName, cvName });
          }
        }

        const newCharacterMap = new Map<string, Character>();

        applyUndoableProjectUpdate(prevProject => {
          return {
            ...prevProject,
            chapters: prevProject.chapters.map(ch => {
              if (!chapterIds.includes(ch.id)) return ch;

              const updatedScriptLines = ch.scriptLines.map(line => {
                // 先尝试旧格式：行内包含 ※台词§
                let dialogueContent: string | null = null;
                const markerMatch = line.text.match(/※([\s\S]*)§/);
                if (markerMatch) {
                  dialogueContent = markerMatch[1];
                } else {
                  // 没有 ※§ 时，退回到原始对话文本或引号内文本
                  if (line.originalText && line.originalText.trim()) {
                    dialogueContent = line.originalText;
                  } else {
                    const quoteMatch = line.text.match(/“([\s\S]*?)”|"([\s\S]*?)"/);
                    if (quoteMatch) {
                      dialogueContent = quoteMatch[1] ?? quoteMatch[2] ?? null;
                    }
                  }
                }

                if (!dialogueContent) return line;

                const annotation = annotationMap.get(dialogueContent);
                if (!annotation) return line;

                const { charName, cvName } = annotation;
                const displayName = sanitizeCharacterDisplayName(charName);
                const key = normalizeCharacterNameKey(displayName);

                let character = newCharacterMap.get(key);
                if (!character) {
                  const existingInStore = useStore
                    .getState()
                    .characters.find(
                      c =>
                        normalizeCharacterNameKey(c.name) === key &&
                        (!c.projectId || c.projectId === prevProject.id) &&
                        c.status !== 'merged'
                    );
                  if (existingInStore) {
                    character = existingInStore;
                  }
                }

                if (!character) {
                  const availableColors = [
                    'bg-red-500',
                    'bg-blue-500',
                    'bg-green-500',
                    'bg-yellow-400',
                    'bg-purple-600',
                    'bg-pink-500',
                    'bg-indigo-500',
                    'bg-teal-500',
                  ];
                  const availableTextColors = [
                    'text-red-100',
                    'text-blue-100',
                    'text-green-100',
                    'text-yellow-800',
                    'text-purple-100',
                    'text-pink-100',
                    'text-indigo-100',
                    'text-teal-100',
                  ];
                  const colorIndex = newCharacterMap.size % availableColors.length;

                  character = onAddCharacter({
                    name: displayName,
                    color: availableColors[colorIndex],
                    textColor: availableTextColors[colorIndex],
                    cvName: cvName,
                    description: '',
                    isStyleLockedToCv: false,
                  });
                  newCharacterMap.set(key, character);
                }

                if (cvName && (!character.cvName || character.cvName.toLowerCase() !== cvName.toLowerCase())) {
                  charactersWithCvToUpdate.set(character.id, cvName);
                }

                return { ...line, characterId: character.id };
              });

              return { ...ch, scriptLines: updatedScriptLines };
            }),
          };
        });

        setIsImportModalOpen(false);
        return charactersWithCvToUpdate;
      } catch (error: unknown) {
        console.error('Annotation import failed:', error);
        alert(
          `Annotation import failed: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
        return new Map();
      } finally {
        setIsLoadingImportAnnotation(false);
      }
    },
    [
      currentProject,
      selectedChapterId,
      multiSelectedChapterIds,
      onAddCharacter,
      applyUndoableProjectUpdate,
    ]
  );

  return {
    isLoadingImportAnnotation,
    isImportModalOpen,
    setIsImportModalOpen,
    handleOpenImportModalTrigger,
    handleImportPreAnnotatedScript,
  };
};
