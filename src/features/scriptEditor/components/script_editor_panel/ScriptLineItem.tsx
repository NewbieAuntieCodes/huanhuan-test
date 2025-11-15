import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { ScriptLine, Character } from '../../../../types';
import { UserCircleIcon, ChevronDownIcon, XMarkIcon, ArrowUpIcon, ArrowDownIcon } from '../../../../components/ui/icons';
import { isHexColor, getContrastingTextColor } from '../../../../lib/colorUtils';
import { tailwindToHex } from '../../../../lib/tailwindColorMap';
import CharacterSelectorDropdown from './CharacterSelectorDropdown';
import { useEditorContext } from '../../contexts/EditorContext';

interface ScriptLineItemProps {
  line: ScriptLine;
  characters: Character[];
  characterIdsInChapter: Set<string>;
  onUpdateText: (lineId: string, newText: string) => void;
  onAssignCharacter: (lineId: string, characterId: string) => void;
  onMergeLines: (lineId: string) => void;
  onDelete: (lineId: string) => void;
  cvStyles: Record<string, { bgColor: string, textColor: string }>;
  isFocusedForSplit?: boolean; 
  onUpdateSoundType: (lineId: string, soundType: string) => void;
  onFocusChange: (lineId: string | null) => void; 
  shortcutActiveLineId: string | null;
  onActivateShortcutMode: (lineId: string | null) => void;
  customSoundTypes: string[];
  onAddCustomSoundType: (soundType: string) => void;
  onDeleteCustomSoundType: (soundType: string) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveLineUp?: () => void;
  onMoveLineDown?: () => void;
  onSplitAt?: (lineId: string, splitIndex: number, currentText: string) => void;
}

// Helper to convert innerHTML from contentEditable to plain text with newlines
const htmlToTextWithNewlines = (html: string): string => {
  const tempDiv = document.createElement('div');
  const normalized = (html || '')
    .replace(new RegExp('<br\\s*/?>', 'gi'), '\n')
    .replace(new RegExp('</p>', 'gi'), '\n')
    .replace(new RegExp('</div>', 'gi'), '\n');
  tempDiv.innerHTML = normalized;
  return tempDiv.textContent || tempDiv.innerText || '';
};



// ===== Display helpers for original [音效] shown as normal text (no brackets) =====
// ===== 标记解析/合并：用于隐藏编辑器中的标记但在保存时保留 =====
type Token = { kind: 'plain' | 'marker'; text: string };

function buildMarkerTokens(raw: string): Token[] {
  const sfxLoose = /[\[\uFF3B\u3010\u3014][^\]\uFF3D\u3011\u3015]+[\]\uFF3D\u3011\u3015]/g; // [..] 及全角括号
  const bgmLoose = /<\s*(?:(?:\?-|[\u266A\u266B])\s*-\s*)?[^<>]*?\s*>/g; // <...> 或 <?-...>
  const endLoose = /\/\/+\s*/g; // // 或 ///

  const patterns = [sfxLoose, bgmLoose, endLoose] as const;
  const findNext = (from: number) => {
    let best: { re: RegExp; m: RegExpExecArray } | null = null;
    for (const base of patterns) {
      const re = new RegExp(base.source, 'g');
      re.lastIndex = from;
      const m = re.exec(raw);
      if (m && (!best || m.index < best.m.index)) best = { re: base, m };
    }
    return best;
  };
  const out: Token[] = [];
  let pos = 0;
  while (pos < raw.length) {
    const hit = findNext(pos);
    if (!hit) { out.push({ kind: 'plain', text: raw.slice(pos) }); break; }
    const i = hit.m.index, j = i + hit.m[0].length;
    if (i > pos) out.push({ kind: 'plain', text: raw.slice(pos, i) });
    out.push({ kind: 'marker', text: raw.slice(i, j) });
    pos = j;
  }
  if (raw.length === 0) out.push({ kind: 'plain', text: '' });
  return out;
}

function sanitizeForDisplay(raw: string): string {
  const tokens = buildMarkerTokens(raw);
  return tokens.filter(t => t.kind === 'plain').map(t => t.text).join('');
}

function mergeEditedWithMarkers(original: string, newPlain: string): string {
  const tokens = buildMarkerTokens(original);
  const plainIdx: number[] = [];
  for (let i = 0; i < tokens.length; i++) if (tokens[i].kind === 'plain') plainIdx.push(i);
  if (plainIdx.length === 0) return original;
  if (plainIdx.length === 1) { tokens[plainIdx[0]].text = newPlain; return tokens.map(t=>t.text).join(''); }

  const origLens = plainIdx.map(i => tokens[i].text.length);
  let cursor = 0;
  for (let k = 0; k < plainIdx.length; k++) {
    const i = plainIdx[k];
    if (k === plainIdx.length - 1) {
      tokens[i].text = newPlain.slice(cursor);
    } else {
      const take = Math.max(0, Math.min(origLens[k], newPlain.length - cursor));
      tokens[i].text = newPlain.slice(cursor, cursor + take);
      cursor += take;
    }
  }
  return tokens.map(t => t.text).join('');
}

// ===== Display helpers for original [音效] shown as normal text (no brackets) =====
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/\"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isSfxBracketMarker(text: string): boolean {
  if (!text || text.length < 2) return false;
  const first = text[0];
  const last = text[text.length - 1];
  const fc = first.codePointAt(0) ?? 0;
  const lc = last.codePointAt(0) ?? 0;
  const openCodes = new Set<number>([['['.codePointAt(0)], 0xFF3B, 0x3010, 0x3014].filter(Boolean) as number[]);
  const closeCodes = new Set<number>([[']'.codePointAt(0)], 0xFF3D, 0x3011, 0x3015].filter(Boolean) as number[]);
  return openCodes.has(fc) && closeCodes.has(lc);
}

function extractSfxLabel(text: string): string {
  return text.length >= 2 ? text.slice(1, -1).trim() : text;
}

function tokensToDisplayHtml(original: string): string {
  const tokens = buildMarkerTokens(original || '');
  const parts: string[] = [];
  for (const t of tokens) {
    if (t.kind === 'plain') {
      parts.push(escapeHtml(t.text).replace(/\r?\n/g, '<br>'));
    } else {
      if (isSfxBracketMarker(t.text)) {
        const label = extractSfxLabel(t.text);
        parts.push(`<span class="sfx-orig" contenteditable="false" data-label="${escapeAttr(label)}"></span>`);
      }
    }
  }
  return parts.join('');
}

function ensureSfxDisplayStyle() {
  if (typeof document === 'undefined') return;
  const id = 'sfx-orig-style';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `.sfx-orig::before{content:attr(data-label)}`;
  document.head.appendChild(style);
}
const ScriptLineItem: React.FC<ScriptLineItemProps> = ({
  line,
  characters,
  characterIdsInChapter,
  onUpdateText,
  onAssignCharacter,
  onMergeLines,
  onDelete,
  cvStyles,
  onUpdateSoundType,
  onFocusChange,
  shortcutActiveLineId,
  onActivateShortcutMode,
  customSoundTypes,
  onAddCustomSoundType,
  onDeleteCustomSoundType,
  canMoveUp = true,
  canMoveDown = true,
  onMoveLineUp,
  onMoveLineDown,
  onSplitAt,
}) => {
  const { openCvModal } = useEditorContext();
  const character = characters.find(c => c.id === line.characterId);
  const isCharacterMissing = line.characterId && !character;
  const isSilentLine = character && character.name === '[静音]';

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const contentEditableRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  useEffect(() => { ensureSfxDisplayStyle(); }, []);

    const plainHtml = useMemo(() => {
    return tokensToDisplayHtml(line.text || '');
  }, [line.text]);

  const [isSoundTypeDropdownOpen, setIsSoundTypeDropdownOpen] = useState(false);
  const soundTypeDropdownRef = useRef<HTMLDivElement>(null);
  
  const defaultSoundOptions = ['清除', 'OS', '电话音', '系统音', '广播'];
  const soundOptions = [...defaultSoundOptions, ...customSoundTypes, '自定义'];


  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsDropdownOpen(false);
      if (soundTypeDropdownRef.current && !soundTypeDropdownRef.current.contains(event.target as Node)) setIsSoundTypeDropdownOpen(false);
    };
    if (isDropdownOpen || isSoundTypeDropdownOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen, isSoundTypeDropdownOpen]);

  const getCharacterSelectStyle = () => {
    if (isSilentLine) return { className: 'bg-slate-700/60 text-slate-500' };
    if (isCharacterMissing) return { className: 'bg-orange-400 text-orange-900' };
    if (!character) return { className: 'bg-slate-600 text-slate-100' };
    const bgIsHex = isHexColor(character.color);
    const textIsHex = isHexColor(character.textColor || '');
    return {
      style: { ...(bgIsHex && { backgroundColor: character.color }), ...(textIsHex && { color: character.textColor }) },
      className: `${bgIsHex ? '' : character.color || 'bg-slate-600'} ${textIsHex ? '' : character.textColor || 'text-slate-100'}`,
    };
  };
  const charSelectAppliedStyle = getCharacterSelectStyle();

  const getCvButtonStyle = () => {
    if (!character) return { className: 'bg-black bg-opacity-25 hover:bg-opacity-40 text-slate-200' };
    const cvName = character.cvName;
    let cvBgToUse = cvName && cvStyles[cvName] ? cvStyles[cvName].bgColor : (cvName ? 'bg-slate-700' : '');
    let cvTextToUse = cvName && cvStyles[cvName] ? cvStyles[cvName].textColor : (cvName ? 'text-slate-300' : '');
    const bgIsHex = isHexColor(cvBgToUse);
    const textIsHex = isHexColor(cvTextToUse);
    const defaultBgClass = 'bg-black bg-opacity-25 hover:bg-opacity-40';
    const defaultTextClass = 'text-slate-200';
    let finalBgClass = !bgIsHex ? (cvBgToUse || defaultBgClass) : '';
    let finalTextClass = !textIsHex ? (cvTextToUse || '') : '';
    let cvTextStyle = textIsHex ? { color: cvTextToUse } : {};
    if (bgIsHex && (!cvTextToUse || !textIsHex)) {
        cvTextStyle = { color: getContrastingTextColor(cvBgToUse) };
        finalTextClass = '';
    } else if (!cvTextToUse && !textIsHex && !cvName) {
        finalTextClass = defaultTextClass;
    } else if (!cvTextToUse && !textIsHex && cvName && !cvStyles[cvName]){
     finalTextClass = defaultTextClass;
    }
    return { style: { ...(bgIsHex && { backgroundColor: cvBgToUse }), ...cvTextStyle }, className: `${finalBgClass} ${finalTextClass}` };
  };
  const cvButtonAppliedStyle = getCvButtonStyle();
  const cvButtonText = character?.cvName ? character.cvName : '添加CV';

  const handleDivFocus = () => {
    setIsEditing(true);
    onFocusChange(line.id);
  };
  const handleDivBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    setIsEditing(false);
    onFocusChange(null);
    const newDisplayPlain = htmlToTextWithNewlines(e.currentTarget.innerHTML).replace(/\u200B/g, ''); // Remove zero-width spaces
    if (newDisplayPlain.trim() === '') onDelete(line.id);
    else {
      const merged = mergeEditedWithMarkers(line.text || '', newDisplayPlain);
      if (merged !== line.text) onUpdateText(line.id, merged);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // 在同一文本框内分段：用 <br> 软换行，不拆分为两条记录
    if (e.key === 'Enter') {
      e.preventDefault();
      
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;

      const range = sel.getRangeAt(0);
      range.deleteContents();

      const br = document.createElement('br');
      range.insertNode(br);

      // Add a zero-width space to give the cursor a concrete position
      // and prevent the view from jumping.
      const zeroWidthSpace = document.createTextNode('\u200B');
      range.setStartAfter(br);
      range.collapse(true);
      range.insertNode(zeroWidthSpace);
      
      // Position the selection after the zero-width space
      range.setStartAfter(zeroWidthSpace);
      range.collapse(true);

      sel.removeAllRanges();
      sel.addRange(range);
    }
  };

  // Prevent re-renders from wiping user-typed text while editing
  useLayoutEffect(() => {
    const el = contentEditableRef.current;
    if (!el) return;
    if (isEditing) return;
    if (el.innerHTML !== plainHtml) {
      el.innerHTML = plainHtml;
    }
  }, [plainHtml, isEditing, line.id]);
  
  const isNarrator = !character || character.name === 'Narrator';
  let contentEditableStyle: React.CSSProperties = {};
  let contentEditableClasses = 'flex-grow p-2 rounded-md min-h-[40px] focus:ring-1 focus:ring-sky-500 outline-none whitespace-pre-wrap caret-slate-100';
  
  if (isSilentLine) {
    contentEditableClasses += ' bg-slate-800 text-slate-500 italic';
  } else if (isNarrator) {
    contentEditableClasses += ' bg-slate-700 text-slate-100';
  } else if (character) {
    const charBg = character.color;
    const charText = character.textColor;
    if (isHexColor(charBg)) {
      contentEditableStyle.backgroundColor = charBg;
    } else {
      contentEditableClasses += ` ${charBg || 'bg-slate-700'}`;
    }
    
    if (charText) {
      if (isHexColor(charText)) {
        contentEditableStyle.color = charText;
      } else {
        contentEditableStyle.color = tailwindToHex[charText] || '#F1F5F9';
      }
    } else {
      const bgColorAsHex = isHexColor(charBg) ? charBg : (tailwindToHex[charBg] || '#334155');
      contentEditableStyle.color = getContrastingTextColor(bgColorAsHex);
    }
    // Set caret color to contrast with background
    contentEditableStyle.caretColor = getContrastingTextColor(isHexColor(charBg) ? charBg : tailwindToHex[charBg] || '#334155');

  } else {
    contentEditableClasses += ' bg-slate-700 text-slate-100';
  }

  const handleToggleOS = () => onUpdateSoundType(line.id, line.soundType === 'OS' ? '' : 'OS');
  const isLit = !!line.soundType && line.soundType !== '清除';

  const handleAddCustom = () => {
    const newSoundType = prompt("请输入新的音效类型:", "");
    if (newSoundType && newSoundType.trim() !== '') onAddCustomSoundType(newSoundType.trim());
    setIsSoundTypeDropdownOpen(false);
  };

  const isShortcutActive = shortcutActiveLineId === line.id;

  return (
    <div className={`p-3 mb-2 rounded-lg border flex items-center gap-3 transition-all duration-150 ${isSilentLine ? 'border-slate-800 opacity-70' : 'border-slate-700'} hover:border-slate-600 ${line.isAiAudioLoading ? 'opacity-70' : ''} ${isShortcutActive ? 'ring-2 ring-amber-400' : ''}`}>
      <div className="flex-shrink-0 w-48 space-y-1">
        <div className="flex items-center space-x-1 w-full">
          {character && !isSilentLine ? (
            <button onClick={() => openCvModal(character)} title={character.cvName ? `CV: ${character.cvName} (编辑CV与角色样式)` : `为角色 ${character.name} 添加CV并编辑样式`} className={`flex-shrink-0 flex items-center justify-center text-xs px-1.5 py-2 h-9 rounded truncate w-20 ${cvButtonAppliedStyle.className}`} style={cvButtonAppliedStyle.style} aria-label={`编辑角色 ${character.name} 的CV与样式`}>
              <UserCircleIcon className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />
              <span className="truncate">{cvButtonText}</span>
            </button>
          ) : <div className="w-20 h-9 flex-shrink-0"></div> }
          <div className="relative flex-grow min-w-[80px]" ref={dropdownRef}>
            <div className={`relative flex rounded-md border h-9 overflow-hidden ${isShortcutActive ? 'ring-2 ring-sky-400' : 'border-slate-600'}`}>
              <button onClick={() => onActivateShortcutMode(line.id)} title="点击激活快捷键模式" className={`flex-grow p-2 text-sm text-left outline-none focus:z-10 flex items-center min-w-0 ${charSelectAppliedStyle.className}`} style={charSelectAppliedStyle.style}>
                <span className="truncate">{isCharacterMissing ? '待识别角色' : (character ? (character.name === '音效' ? '[音效]' : character.name) : '分配角色...')}</span>
              </button>
              <button onClick={() => setIsDropdownOpen(prev => !prev)} title="打开角色选择菜单" className={`flex-shrink-0 px-1 outline-none focus:z-10 border-l border-black/20 ${charSelectAppliedStyle.className}`} style={charSelectAppliedStyle.style} aria-haspopup="listbox" aria-expanded={isDropdownOpen}>
                <ChevronDownIcon className="w-4 h-4 text-current opacity-70" />
              </button>
            </div>
            {isDropdownOpen && <CharacterSelectorDropdown characters={characters} characterIdsInChapter={characterIdsInChapter} currentLineCharacterId={line.characterId} onSelectCharacter={(charId) => { onAssignCharacter(line.id, charId); setIsDropdownOpen(false); }} onMergeLines={() => { onMergeLines(line.id); setIsDropdownOpen(false); }} onClose={() => setIsDropdownOpen(false)} />}
          </div>
        </div>
      </div>
      <div 
        className="relative flex-grow"
      >
        <div
            ref={contentEditableRef}
            contentEditable
            suppressContentEditableWarning
            onFocus={handleDivFocus}
            onBlur={handleDivBlur}
            onKeyDown={handleKeyDown}
            className={contentEditableClasses}
            style={contentEditableStyle}
            aria-label={`脚本行文本: ${line.text.substring(0,50)}... ${character ? `角色: ${character.name}` : '未分配角色'}`}
        />
      </div>
      <div className="flex-shrink-0 flex items-center gap-1.5">
        <div className="relative" ref={soundTypeDropdownRef}>
          <div className="flex w-20 h-9 rounded-md border border-slate-600 overflow-hidden">
            <button
              onClick={handleToggleOS}
              className={`flex-grow h-full flex items-center justify-center px-2 text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:z-10 ${isLit ? 'bg-orange-500 text-white font-semibold' : 'bg-slate-700 hover:bg-slate-600 text-slate-200'}`}
            >
              <span className="truncate">{line.soundType || 'OS'}</span>
            </button>
            <button
              onClick={() => setIsSoundTypeDropdownOpen(prev => !prev)}
              className={`flex-shrink-0 h-full flex items-center justify-center px-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:z-10 border-l ${isLit ? 'bg-orange-500 hover:bg-orange-600 text-white border-orange-600' : 'bg-slate-700 hover:bg-slate-600 text-slate-300 border-slate-600'}`}
              aria-label="选择音效"
            >
              <ChevronDownIcon className="w-3.5 h-3.5" />
            </button>
          </div>
          {isSoundTypeDropdownOpen && (
            <div className="absolute z-20 mt-1 w-full bg-slate-800 rounded-md shadow-lg border border-slate-600 max-h-60 overflow-y-auto">
              <ul className="py-1">
                {soundOptions.map(option => {
                  const isCustom = !defaultSoundOptions.includes(option) && option !== '自定义';
                  const isSelected = (line.soundType === option || ((!line.soundType || line.soundType === '') && option === '旁白'));
                  const handleOptionClick = () => {
                    if (option === '自定义') handleAddCustom();
                    else { onUpdateSoundType(line.id, option === '旁白' ? '' : option); setIsSoundTypeDropdownOpen(false); }
                  };
                  const handleDeleteClick = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    if (window.confirm(`确定要删除自定义音效 "${option}" 并停止使用吗？`)) onDeleteCustomSoundType(option);
                  };
                  return (
                    <li key={option} onClick={handleOptionClick} className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer group ${isSelected ? 'bg-sky-600 text-white' : 'text-slate-200 hover:bg-slate-700'}`}>
                      <span>{option}</span>
                      {isCustom && (
                        <button onClick={handleDeleteClick} className="p-1 -mr-2 rounded-full text-slate-500 group-hover:text-red-400 hover:bg-slate-600" title={`删除 "${option}"`}>
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
        <div className="flex flex-col">
          <button
            onClick={onMoveLineUp}
            disabled={!canMoveUp}
            className="p-0.5 text-slate-400 hover:text-sky-300 disabled:text-slate-600 disabled:cursor-not-allowed"
            title="上移此行"
          >
            <ArrowUpIcon className="w-5 h-5" />
          </button>
          <button
            onClick={onMoveLineDown}
            disabled={!canMoveDown}
            className="p-0.5 text-slate-400 hover:text-sky-300 disabled:text-slate-600 disabled:cursor-not-allowed"
            title="下移此行"
          >
            <ArrowDownIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScriptLineItem;