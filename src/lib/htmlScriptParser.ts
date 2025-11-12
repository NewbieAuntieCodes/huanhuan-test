import { Character, Chapter, ScriptLine } from '../types';

export const parseHtmlWorkbook = (
  htmlString: string,
  onAddCharacter: (character: Pick<Character, 'name' | 'color' | 'textColor' | 'description' | 'cvName' | 'isStyleLockedToCv' | 'status'>) => Character
): { newChapters: Chapter[]; charactersWithCvToUpdate: Map<string, string>; characterDescriptions: Map<string, string> } => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  const newChapters: Chapter[] = [];
  let currentChapter: Chapter | null = null;
  const tempCharacterMap = new Map<string, Character>();
  const charactersWithCvToUpdate = new Map<string, string>();
  const characterDescriptions = new Map<string, string>();

  const splitSpeaker = (speakerTag: string) => {
    let charName = speakerTag;
    let cvName: string | undefined = undefined;
    const parts = speakerTag.split(/[-\u2013\u2014\u2212\uFF0D]/);
    if (parts.length > 1) {
      const potentialCv = parts[0].trim();
      const potentialCharName = parts.slice(1).join('-').trim();
      if (potentialCv && potentialCharName) {
        cvName = potentialCv;
        charName = potentialCharName;
      }
    }
    return { charName, cvName };
  };

  const getCharacter = (speakerTag: string): Character => {
    let { charName, cvName } = splitSpeaker(speakerTag);
    // Normalize reserved roles
    const normalized = charName.replace(/^[\[【]\s*|[\]】]\s*$/g, '').trim();
    if (/^(静音|silence|mute)$/i.test(normalized)) {
      charName = '[静音]';
      cvName = undefined;
    } else if (/^(音效|sfx|fx|音效描述)$/i.test(normalized)) {
      charName = '音效';
      cvName = undefined;
    }
    const lowerName = charName.toLowerCase();
    if (tempCharacterMap.has(lowerName)) {
      const existingChar = tempCharacterMap.get(lowerName)!;
      if (cvName && (!existingChar.cvName || existingChar.cvName.toLowerCase() !== cvName.toLowerCase())) {
        charactersWithCvToUpdate.set(existingChar.id, cvName);
      }
      return existingChar;
    }

    const availableColors = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-400', 'bg-purple-600', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500'];
    const availableTextColors = ['text-red-100', 'text-blue-100', 'text-green-100', 'text-yellow-800', 'text-purple-100', 'text-pink-100', 'text-indigo-100', 'text-teal-100'];
    const colorIndex = tempCharacterMap.size % availableColors.length;

    const isNarrator = charName.toLowerCase() === 'narrator';
    const isSilence = charName === '[静音]';
    const isSfx = charName === '音效';

    const newChar = onAddCharacter({
      name: charName,
      color: isNarrator ? 'bg-slate-500' : isSilence ? 'bg-slate-700' : isSfx ? 'bg-transparent' : availableColors[colorIndex],
      textColor: isNarrator ? 'text-slate-100' : isSilence ? 'text-slate-400' : isSfx ? 'text-red-500' : availableTextColors[colorIndex],
      description: isSilence ? '用于标记无需录制的旁白提示' : isSfx ? '用于标记音效的文字描述' : '',
      cvName: isSilence || isSfx ? '' : cvName,
      isStyleLockedToCv: isSilence || isSfx ? true : false,
      status: 'active'
    });

    if (cvName) {
      charactersWithCvToUpdate.set(newChar.id, cvName);
    }

    tempCharacterMap.set(lowerName, newChar);
    return newChar;
  };

  const saveCurrentChapter = () => {
    if (currentChapter && currentChapter.scriptLines.length > 0) {
      newChapters.push(currentChapter);
    }
    currentChapter = null;
  };

  const elements = Array.from(doc.body.children);

  // 角色说明块（可选）
  const descriptionHeading = elements.find(el => el.tagName === 'H2' && el.textContent?.trim() === '��Ҫ��ɫ����');
  if (descriptionHeading) {
    const descriptionContainer = descriptionHeading.nextElementSibling;
    if (descriptionContainer) {
      const descriptionParagraphs = descriptionContainer.querySelectorAll('p');
      descriptionParagraphs.forEach(p => {
        const strongTag = p.querySelector('strong');
        if (strongTag) {
          const nameMatch = strongTag.textContent?.trim().match(/\u201C(.*?)\u201D/);
          if (nameMatch && nameMatch[1]) {
            const charName = nameMatch[1];
            const pClone = p.cloneNode(true) as HTMLParagraphElement;
            const strongClone = pClone.querySelector('strong');
            if (strongClone) pClone.removeChild(strongClone);
            const description = pClone.textContent?.trim().replace(/^\u201C/, '').trim();
            if (charName && description) {
              characterDescriptions.set(charName, description);
            }
          }
        }
      });
    }
  }

  const isNoise = (t: string) => {
    const s = (t || '').trim();
    if (!s) return true;
    if (/^【?待识别角色】?$/.test(s)) return true;
    if (/^[\u2026\.。·！？!?,，、;；：:…\s]+$/.test(s)) return true;
    return false;
  };

  for (const el of elements) {
    if (el === descriptionHeading || el === descriptionHeading?.nextElementSibling) {
      continue;
    }

    if (el.tagName === 'H2') {
      saveCurrentChapter();
      currentChapter = {
        id: `imported_html_ch_${Date.now()}_${newChapters.length}`,
        title: el.textContent?.trim() || 'Untitled Chapter',
        rawContent: '',
        scriptLines: [],
      };
    } else if (el.tagName === 'DIV' && currentChapter) {
      // 章节内容容器
      const lineElements = el.querySelectorAll('.line');
      const rawContentParts: string[] = [];

      for (const lineEl of lineElements) {
        const dialogueSpan = lineEl.querySelector('.dialogue-line');
        let text = '';
        let characterId: string;

        if (dialogueSpan) {
          const fullRaw = dialogueSpan.textContent || '';
          const fullText = fullRaw.replace(/\uFEFF/g, '').replace(/\u00A0/g, ' ').replace(/\u200B/g, '').trim();
          rawContentParts.push(fullText);

          // 仅支持方括号记名格式：【CV-角色】或【角色】 + 台词文本（台词中的引号不参与说话人解析）
          const bracketMatch = fullText.match(/^\s*[\u3010\[](.+?)[\u3011\]]\s*([\s\S]*)/);
          if (bracketMatch) {
            const speakerTag = bracketMatch[1].trim();
            text = bracketMatch[2].trim();
            const character = getCharacter(speakerTag);
            characterId = character.id;
          } else {
            text = fullText;
            characterId = getCharacter('Narrator').id;
          }

        } else {
          const fullRaw = lineEl.textContent || '';
          const fullText = fullRaw.replace(/\uFEFF/g, '').replace(/\u00A0/g, ' ').replace(/\u200B/g, '').trim();
          rawContentParts.push(fullText);
          // 即使没有特定 span，也尝试用方括号格式解析
          const bracketMatch = fullText.match(/^\s*[\u3010\[](.+?)[\u3011\]]\s*([\s\S]*)/);
          if (bracketMatch) {
            const speakerTag = bracketMatch[1].trim();
            text = bracketMatch[2].trim();
            const character = getCharacter(speakerTag);
            characterId = character.id;
          } else {
            text = fullText;
            characterId = getCharacter('Narrator').id;
          }
        }

        if (text && !isNoise(text)) {
          const scriptLine: ScriptLine = {
            id: `imported_line_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            text: text,
            characterId: characterId,
            isAiAudioLoading: false,
            isAiAudioSynced: false,
            isTextModifiedManual: false,
          };
          currentChapter.scriptLines.push(scriptLine);
        }
      }
      currentChapter.rawContent = rawContentParts.join('\n');
    }
  }

  saveCurrentChapter();

  return { newChapters, charactersWithCvToUpdate, characterDescriptions };
};
