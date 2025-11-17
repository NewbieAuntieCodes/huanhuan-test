import React, { useState, useEffect } from 'react';
import { ClipboardIcon, CheckCircleIcon } from '../../../components/ui/icons';
import { VoiceLibraryRowState } from '../hooks/useVoiceLibraryData';
import { Character } from '../../../types';

interface BatchEmotionAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: VoiceLibraryRowState[];
  characters: Character[];
  onApply: (updates: { rowId: string, emotion: string }[]) => void;
}

const BatchEmotionAssistantModal: React.FC<BatchEmotionAssistantModalProps> = ({ isOpen, onClose, rows, characters, onApply }) => {
  const [step, setStep] = useState(1);
  const [prompt, setPrompt] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

  useEffect(() => {
    if (isOpen) {
      // Generate prompt when modal opens
      const characterMap = new Map(characters.map(c => [c.id, c]));
      const functionalCharacterNames = ['[静音]', '音效', '[音效]'];

      const linesForPrompt = rows
        .map(row => {
          const character = row.characterId ? characterMap.get(row.characterId) : null;

            if (character) {
// FIX: Removed redundant optional chaining. The 'if (character)' guard already ensures 'character' is not null. Also handles potential but unlikely type issue.
            const charName = character.name;
            // Skip functional characters
            if (charName && functionalCharacterNames.includes(charName)) {
                return null;
            }
            
            // If it's the narrator, include the text as is.
            if (charName === 'Narrator') {
                return row.text;
            }
            
            // It's a dialogue line, format it with tags.
            const emotionTag = row.emotion ? `(${row.emotion})` : '';
            return `【${charName}】${emotionTag}“${row.text}”`;
          }
          // If no character or no name, assume it's narration and include it.
          return row.text;
        })
        .filter(Boolean); // This removes the nulls for functional characters
      
      const fullPrompt = `请为以下台词列表，识别或优化每一句【角色名】后的对话情绪，并以【角色名】(情绪)“台词” 的格式返回。

- 【首要原则】请优先使用最核心的**单个**情绪词。只有在单个词无法准确表达复合情感时，才使用逗号分隔的多个词。
- **【重要规则】**：请只返回带有【角色名】的对话行，**不要**在你的回复中包含任何旁白内容。旁白仅供你理解上下文使用。
- 如果某行已经有情绪标签，请根据上下文判断是否需要优化，如果不需要则保留原样。
- 请确保返回的格式与示例完全一致，包括角色名、英文半角括号()、情绪和中文引号“”。

例如，对于文本：
---
他叹了口气。
【白瑶】“天又下雨了。”
---
如果识别出的情绪是“伤感”，你应该只返回：
---
【白瑶】(伤感)“天又下雨了。”
---

这是你需要处理的文本（包含旁白以供参考）：
---
${linesForPrompt.join('\n')}
---`;
      setPrompt(fullPrompt);

    } else {
      // Reset state on close
      setStep(1);
      setPrompt('');
      setPastedText('');
      setCopyStatus('idle');
    }
  }, [isOpen, rows, characters]);

  const handleCopyClick = () => {
    if (!prompt) return;
    navigator.clipboard.writeText(prompt).then(() => {
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    }).catch(err => {
      alert('复制失败，请手动复制。');
    });
  };

  const handleApply = () => {
    const updates: { rowId: string, emotion: string }[] = [];
    
    // 1. Parse AI response into a structured list
    const aiLines: { charName: string; emotion: string; dialogue: string; used: boolean }[] = [];
    const lineRegex = /【(.*?)】\s*(?:[\(（]([^）\)]+)[\)）])?\s*[“"]([\s\S]+?)[”"]/g;
    let match;
    while ((match = lineRegex.exec(pastedText)) !== null) {
      const charName = match[1].trim();
      const emotion = match[2] ? match[2].trim() : '';
      const dialogue = match[3].trim();
      if (emotion) { // Only process lines where AI provided an emotion
          aiLines.push({ charName, emotion, dialogue, used: false });
      }
    }

    // 2. Create a "to-do" list from the visible rows on the page
    const characterMap = new Map(characters.map(c => [c.id, c]));
    const todoRows = rows
      .map(row => ({ ...row, character: row.characterId ? characterMap.get(row.characterId) : null}))
      .filter(row => row.character && row.character.name !== 'Narrator' && row.character.name !== '[音效]' && row.character.name !== '[静音]');
    
    // Helper for loose text comparison (ignores punctuation and whitespace)
    const normalizeText = (text: string) => text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()\[\]'’"”‘“？?，。！、\s]/g, "");

    // 3. Match todo rows to AI lines using the hybrid strategy
    for (const row of todoRows) {
        if (!row.character) continue;

        // Find the first UNUSED AI line that matches both character name and normalized text
        const matchIndex = aiLines.findIndex(aiLine => 
            !aiLine.used && 
            aiLine.charName === row.character?.name &&
            normalizeText(aiLine.dialogue) === normalizeText(row.text)
        );

        if (matchIndex !== -1) {
            updates.push({ rowId: row.id, emotion: aiLines[matchIndex].emotion });
            aiLines[matchIndex].used = true; // Mark as used
        }
    }
    
    if (updates.length > 0) {
      onApply(updates);
    } else {
      console.warn("未找到任何可应用的匹配项。请检查AI返回的文本格式是否正确，以及台词内容是否与原文大致相符。");
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-3xl h-[90vh] flex flex-col border border-slate-700">
        <h2 className="text-2xl font-semibold mb-4 text-slate-100 flex-shrink-0">批量情绪辅助</h2>
        
        {step === 1 && (
          <div className="flex-grow flex flex-col overflow-hidden">
            <h3 className="font-semibold text-base text-sky-300 mb-2">第一步：复制提示并发送给 AI</h3>
            <p className="text-sm text-slate-300 mb-2">点击下方按钮复制已为您准备好的提示词，然后将其发送给任意 AI 工具（如 Kimi, ChatGPT）。</p>
            <textarea
              readOnly
              value={prompt}
              className="w-full flex-grow p-3 bg-slate-900 text-slate-300 rounded-md border border-slate-600 resize-none text-sm"
            />
            <div className="flex justify-end space-x-3 mt-4 flex-shrink-0">
                <button onClick={handleCopyClick} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-md">
                    {copyStatus === 'copied' ? <><CheckCircleIcon className="w-4 h-4" />已复制</> : <><ClipboardIcon className="w-4 h-4" />复制提示</>}
                </button>
                <button onClick={() => setStep(2)} className="px-4 py-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-md">
                    下一步
                </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex-grow flex flex-col overflow-hidden">
            <h3 className="font-semibold text-base text-sky-300 mb-2">第二步：粘贴 AI 返回的结果</h3>
            <p className="text-sm text-slate-300 mb-2">将 AI 生成的已标注文本，完整粘贴到下方的输入框中。系统将自动匹配台词并填入情绪。</p>
            <textarea
              value={pastedText}
              onChange={e => setPastedText(e.target.value)}
              placeholder="在此处粘贴 AI 生成的标注文本..."
              className="w-full flex-grow p-3 bg-slate-900 text-slate-100 rounded-md border border-slate-600 resize-y text-sm"
            />
             <div className="flex justify-between items-center mt-4 flex-shrink-0">
                <button onClick={() => setStep(1)} className="px-4 py-2 text-sm text-slate-300 bg-slate-600 hover:bg-slate-500 rounded-md">
                    返回上一步
                </button>
                <div className="flex space-x-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-md">取消</button>
                    <button onClick={handleApply} disabled={!pastedText.trim()} className="px-4 py-2 text-sm text-white bg-sky-600 hover:bg-sky-700 rounded-md disabled:opacity-50">
                        应用情绪
                    </button>
                </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BatchEmotionAssistantModal;