import { Character, Chapter, ScriptLine } from '../types';

export const parseImportedScriptToChapters = (
  rawText: string,
  onAddCharacter: (character: Pick<Character, 'name' | 'color' | 'textColor' | 'description' | 'cvName' | 'isStyleLockedToCv' | 'status'>) => Character
): { newChapters: Chapter[]; charactersWithCvToUpdate: Map<string, string>; characterDescriptions: Map<string, string> } => {
  if (!rawText || !rawText.trim()) return { newChapters: [], charactersWithCvToUpdate: new Map(), characterDescriptions: new Map() };

  const lines = rawText.split(/\r?\n/);
  const newChapters: Chapter[] = [];
  let currentChapterContent: ScriptLine[] = [];
  let currentChapterTitle = "未命名章节 1";
  let chapterCounter = 1;

  const chapterTitleLineRegex = /^(?:##\d+\s*\.\s*)?(Chapter\s+\d+|Part\s+\d+|第\s*[一二三四五六七八九十百千万零\d]+\s*[章章节回卷篇部]|楔子|序章|引子|尾声|Prologue|Epilogue|前言|后记)/i;
  
  const tempCharacterMap = new Map<string, Character>();
  const charactersWithCvToUpdate = new Map<string, string>(); // Map of characterId -> cvName

  const isNoise = (t: string) => {
    const s = (t || '').trim();
    if (!s) return true;
    if (/^【?待识别角色】?$/.test(s)) return true;
    if (/^[\u2026\.。·！？!?,，、;；：:…\s]+$/.test(s)) return true;
    return false;
  };

  const getCharacter = (nameAndCv: string): Character => {
    let charName = nameAndCv.trim();
    let cvName: string | undefined = undefined;

    // Split "CVName-CharacterName" format. Handles various hyphen types.
    const parts = nameAndCv.split(/[-\u2013\u2014\u2212\uFF0D]/);
    if (parts.length > 1) {
      const potentialCv = parts[0].trim();
      const potentialCharName = parts.slice(1).join('-').trim();
      if (potentialCv && potentialCharName) {
        cvName = potentialCv;
        charName = potentialCharName;
      }
    }

    // Normalize reserved special roles
    const normalized = charName.replace(/^[\[【]\s*|[\]】]\s*$/g, '').trim();
    if (/^(静音|silence|mute)$/i.test(normalized)) {
      charName = '[静音]';
      cvName = undefined; // 静音不跟随CV
    } else if (/^(\[?音效\]?|sfx|fx|音效描述)$/i.test(normalized)) {
      charName = '[音效]';
      cvName = undefined; // 音效不跟随CV
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

    // Defaults for reserved roles
    const isNarrator = charName.toLowerCase() === 'narrator';
    const isSilence = charName === '[静音]';
    const isSfx = (charName === '音效' || charName === '[音效]');

    const newChar = onAddCharacter({
      name: charName,
      color: isNarrator ? 'bg-slate-500' : isSilence ? 'bg-slate-700' : isSfx ? 'bg-transparent' : availableColors[colorIndex],
      textColor: isNarrator ? 'text-slate-100' : isSilence ? 'text-slate-400' : isSfx ? 'text-red-500' : availableTextColors[colorIndex],
      description: isSilence ? '用于标记无需录制的旁白提示' : isSfx ? '用于标记音效的文字描述' : '',
      cvName: isSilence || isSfx ? '' : cvName, // reserved roles do not follow CV
      isStyleLockedToCv: isSilence || isSfx ? true : false,
      status: 'active'
    });
    
    if (cvName && (!newChar.cvName || newChar.cvName.toLowerCase() !== cvName.toLowerCase())) {
        charactersWithCvToUpdate.set(newChar.id, cvName);
    }

    tempCharacterMap.set(lowerName, newChar);
    return newChar;
  };

  const saveCurrentChapter = () => {
    if (currentChapterContent.length > 0) {
      const allCharacters = Array.from(tempCharacterMap.values());
      const rawContent = currentChapterContent.map(line => {
        const character = allCharacters.find(c => c.id === line.characterId);
        if (character && character.name.toLowerCase() !== 'narrator') {
            return `【${character.name}】${line.text}`;
        }
        return line.text;
      }).join('\n');

      newChapters.push({
        id: `imported_ch_${Date.now()}_${chapterCounter}`,
        title: currentChapterTitle,
        rawContent: rawContent,
        scriptLines: currentChapterContent,
      });

      currentChapterContent = [];
      chapterCounter++;
      currentChapterTitle = `未命名章节 ${chapterCounter}`;
    }
  };

  for (const line of lines) {
    const trimmedLine = (line || '').replace(/\uFEFF/g, '').replace(/\u00A0/g, ' ').replace(/\u200B/g, '').trim();
    if (!trimmedLine || isNoise(trimmedLine)) continue;

    if (chapterTitleLineRegex.test(trimmedLine)) {
      saveCurrentChapter();
      currentChapterTitle = trimmedLine;
      continue;
    }

    const bracketMatch = trimmedLine.match(/^\s*[\u3010\[](.+?)[\u3011\]]\s*([\s\S]*)/);
    let character: Character;
    let text: string;
    let soundType: string | undefined = undefined;
    const soundTypeRegex = /^\s*[\(（]([^）\)]+)[\)）]\s*/;

    if (bracketMatch) {
      const charName = bracketMatch[1].trim();
      let textAfterTag = bracketMatch[2].trim();
      const soundTypeMatch = textAfterTag.match(soundTypeRegex);
      if (soundTypeMatch) {
        soundType = soundTypeMatch[1].trim();
        text = textAfterTag.replace(soundTypeRegex, '').trim();
      } else {
        text = textAfterTag;
      }
      character = getCharacter(charName);
    } else {
      const soundTypeMatch = trimmedLine.match(soundTypeRegex);
      if (soundTypeMatch) {
        soundType = soundTypeMatch[1].trim();
        text = trimmedLine.replace(soundTypeRegex, '').trim();
      } else {
        text = trimmedLine;
      }
      character = getCharacter('Narrator');
    }

    if (isNoise(text)) continue;

    const scriptLine: ScriptLine = {
      id: `imported_line_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text: text,
      characterId: character.id,
      soundType: soundType,
      isAiAudioLoading: false,
      isAiAudioSynced: false,
      isTextModifiedManual: false,
    };
    currentChapterContent.push(scriptLine);
  }

  saveCurrentChapter();

  return { newChapters, charactersWithCvToUpdate, characterDescriptions: new Map() };
};
