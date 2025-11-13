import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { ScriptLine, Character } from '../../../../types';
import { UserCircleIcon, ChevronDownIcon, XMarkIcon, ArrowUpIcon, ArrowDownIcon } from '../../../../components/ui/icons';
import { isHexColor, getContrastingTextColor } from '../../../../lib/colorUtils';
import { tailwindToHex } from '../../../../lib/tailwindColorMap';
import CharacterSelectorDropdown from './CharacterSelectorDropdown';
import { useEditorContext } from '../../contexts/EditorContext';
import { useSoundHighlighter } from '../../hooks/useSoundHighlighter';
import SoundKeywordPopover from './SoundKeywordPopover';

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
}

// Helper to convert innerHTML from contentEditable to plain text with newlines
const htmlToTextWithNewlines = (html: string): string => {
    let tempDiv = document.createElement('div');
    tempDiv.innerHTML = html
        .replace(/<br\s*\/?>/gi, '\n') // Convert <br> to newline
        .replace(/<\/p>/gi, '\n')     // Convert </p> to newline
        .replace(/<\/div>/gi, '\n');   // Convert </div> to newline

    // Strip remaining tags and decode entities
    return tempDiv.textContent || tempDiv.innerText || '';
};


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
}) => {
  const { openCvModal, soundLibrary, soundObservationList } = useEditorContext();
  const character = characters.find(c => c.id === line.characterId);
  const isCharacterMissing = line.characterId && !character;
  const isSilentLine = character && character.name === '[静音]';

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const contentEditableRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [popoverState, setPopoverState] = useState<{
    visible: boolean;
    keyword: string;
    top: number;
    left: number;
  } | null>(null);
  const hidePopoverTimeout = useRef<number | null>(null);

  const highlightedHtml = useSoundHighlighter(line.text, soundLibrary, soundObservationList);

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
    const newText = htmlToTextWithNewlines(e.currentTarget.innerHTML);
    if (newText.trim() === '') onDelete(line.id);
    else if (newText !== line.text) onUpdateText(line.id, newText);
  };

  // Prevent re-renders from wiping user-typed text while editing
  useLayoutEffect(() => {
    const el = contentEditableRef.current;
    if (!el) return;
    if (isEditing) return;
    if (el.innerHTML !== highlightedHtml) {
      el.innerHTML = highlightedHtml;
    }
  }, [highlightedHtml, isEditing, line.id]);
  
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
  
  const handleMouseOver = (e: React.MouseEvent) => {
    if (hidePopoverTimeout.current) clearTimeout(hidePopoverTimeout.current);
    const target = e.target as HTMLElement;
    if (target.classList.contains('sound-keyword-highlight')) {
        const keyword = target.dataset.keyword;
        if (keyword) {
            const rect = target.getBoundingClientRect();
            setPopoverState({ visible: true, keyword, top: rect.bottom + window.scrollY, left: rect.left + window.scrollX });
        }
    }
  };

  const handleMouseOut = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('sound-keyword-highlight')) {
        hidePopoverTimeout.current = window.setTimeout(() => {
            setPopoverState(null);
        }, 200);
    }
  };
  
  const handlePopoverEnter = () => {
    if (hidePopoverTimeout.current) clearTimeout(hidePopoverTimeout.current);
  };

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
        onMouseOver={handleMouseOver} 
        onMouseOut={handleMouseOut}
      >
        <div
            ref={contentEditableRef}
            contentEditable
            suppressContentEditableWarning
            onFocus={handleDivFocus}
            onBlur={handleDivBlur}
            className={contentEditableClasses}
            style={contentEditableStyle}
            aria-label={`脚本行文本: ${line.text.substring(0,50)}... ${character ? `角色: ${character.name}` : '未分配角色'}`}
        />
      </div>
      {popoverState?.visible && (
        <SoundKeywordPopover
            keyword={popoverState.keyword}
            top={popoverState.top}
            left={popoverState.left}
            onClose={() => setPopoverState(null)}
            onMouseEnter={handlePopoverEnter}
            onMouseLeave={() => setPopoverState(null)}
            soundLibrary={soundLibrary}
        />
      )}
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