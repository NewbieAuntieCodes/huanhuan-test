import { Character, Chapter, ScriptLine } from '../types';

export const parseHtmlWorkbook = (
  htmlString: string,
  onAddCharacter: (character: Pick<Character, 'name' | 'color' | 'textColor' | 'description' | 'cvName' | 'isStyleLockedToCv' | 'status'>) => Character
): { newChapters: Chapter[]; charactersWithCvToUpdate: Map<string, string>; characterDescriptions: Map<string, string> } => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  const htmlToTextWithNewlines = (html: string): string => {
    const tempDiv = doc.createElement('div');
    const normalized = (html || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n');
    tempDiv.innerHTML = normalized;
    return tempDiv.textContent || '';
  };

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
    const normalized = charName.replace(/^[\[��]\s*|[\]��]\s*$/g, '').trim();
    if (/^(����|silence|mute)$/i.test(normalized)) {
      charName = '[����]';
      cvName = undefined;
    } else if (/^(\[?��Ч\]?|sfx|fx|��Ч����)$/i.test(normalized)) {
      // ͳһ��׼��ʾΪ [��Ч]
      charName = '[��Ч]';
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
    const isSilence = charName === '[����]';
    const isSfx = (charName === '��Ч' || charName === '[��Ч]');

    const newChar = onAddCharacter({
      name: charName,
      color: isNarrator ? 'bg-slate-500' : isSilence ? 'bg-slate-700' : isSfx ? 'bg-transparent' : availableColors[colorIndex],
      textColor: isNarrator ? 'text-slate-100' : isSilence ? 'text-slate-400' : isSfx ? 'text-red-500' : availableTextColors[colorIndex],
      description: isSilence ? '���ڱ������¼�Ƶ��԰���ʾ' : isSfx ? '���ڱ����Ч����������' : '',
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

  // ��ɫ˵���飨��ѡ��
  const descriptionHeading = elements.find(el => el.tagName === 'H2' && el.textContent?.trim() === '��Ҫ��ɫ����');
  if (descriptionHeading) {
    const descriptionContainer = descriptionHeading.nextElementSibling;
    if (descriptionContainer) {
      const descriptionParagraphs = descriptionContainer.querySelectorAll('p');
      descriptionParagraphs.forEach(p => {
        const strongTag = p.querySelector('strong');
        if (strongTag) {
          const nameMatch = strongTag.textContent?.trim().match(/��(.*?)��/);
          if (nameMatch && nameMatch[1]) {
            const charName = nameMatch[1];
            const pClone = p.cloneNode(true) as HTMLParagraphElement;
            const strongClone = pClone.querySelector('strong');
            if (strongClone) pClone.removeChild(strongClone);
            const description = pClone.textContent?.trim().replace(/^��/, '').trim();
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
    if (/^��?��ʶ���ɫ��?$/.test(s)) return true;
    if (/^[\u2026\.��������!?,����;����:��\s]+$/.test(s)) return true;
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
      // �½���������
      const lineElements = el.querySelectorAll('.line');
      const rawContentParts: string[] = [];

      for (const lineEl of lineElements) {
        const dialogueSpan = lineEl.querySelector('.dialogue-line');
        const sourceEl = (dialogueSpan || lineEl) as HTMLElement;
        const fullRaw = htmlToTextWithNewlines(sourceEl.innerHTML);
        const fullText = fullRaw.replace(/\uFEFF/g, '').replace(/\u00A0/g, ' ').replace(/\u200B/g, '').trim();
        rawContentParts.push(fullText);

        let text: string;
        let characterId: string;
        let soundType: string | undefined = undefined;
        const soundTypeRegex = /^\s*[\(��]([^��\)]+)[\)��]\s*/;

        const bracketMatch = fullText.match(/^\s*[\u3010\[](.+?)[\u3011\]]\s*([\s\S]*)/);
        
        if (bracketMatch) {
            const speakerTag = bracketMatch[1].trim();
            let textAfterTag = bracketMatch[2].trim();
            textAfterTag = textAfterTag.replace(/^[\u3011\]\s]+/, '').trim();
            const soundTypeMatch = textAfterTag.match(soundTypeRegex);
            if (soundTypeMatch) {
                soundType = soundTypeMatch[1].trim();
                text = textAfterTag.replace(soundTypeRegex, '').trim();
            } else {
                text = textAfterTag;
            }
            const character = getCharacter(speakerTag);
            characterId = character.id;
        } else {
            const soundTypeMatch = fullText.match(soundTypeRegex);
            if (soundTypeMatch) {
                soundType = soundTypeMatch[1].trim();
                text = fullText.replace(soundTypeRegex, '').trim();
            } else {
                text = fullText;
            }
            characterId = getCharacter('Narrator').id;
        }

        if (text && !isNoise(text)) {
          const scriptLine: ScriptLine = {
            id: `imported_line_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            text: text,
            characterId: characterId,
            soundType: soundType,
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
