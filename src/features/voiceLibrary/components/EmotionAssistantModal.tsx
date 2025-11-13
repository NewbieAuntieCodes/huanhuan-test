import React, { useState } from 'react';
import { InformationCircleIcon, ClipboardIcon, CheckCircleIcon } from '../../../components/ui/icons';

interface EmotionAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  lineText: string;
}

const EmotionAssistantModal: React.FC<EmotionAssistantModalProps> = ({ isOpen, onClose, lineText }) => {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

  if (!isOpen) return null;

  const promptTemplate = `请为以下台词文本识别情绪，并以 (情绪)“台词” 的格式返回，注意括号必须为英文半角 ()。

例如，对于台词：“卿卿，别哭了，妈给你做主。”
如果识别出的情绪是“心疼”，你应该返回：
(心疼)“卿卿，别哭了，妈给你做主。”

这是你需要处理的文本：
“${lineText}”`;

  const handleCopyClick = () => {
    if (!lineText) {
      alert("台词文本为空，无法生成提示。");
      return;
    }
    navigator.clipboard.writeText(promptTemplate).then(() => {
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
      alert('复制失败，请手动复制。');
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-2xl border border-slate-700">
        <h2 className="text-2xl font-semibold mb-4 text-slate-100">AI 情绪辅助</h2>
        
        <div className="mb-4 text-sm text-slate-300 space-y-4">
          <p>
            使用外部 AI (如 ChatGPT, Kimi 等) 为台词文本快速生成情绪标签。
          </p>

          <div className="bg-slate-700 p-3 rounded-md">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold text-base text-sky-300">第一步：复制提示并发送给 AI</h3>
              <button
                onClick={handleCopyClick}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-md disabled:opacity-50 transition-colors"
                title="复制包含当前台词的完整提示词"
                disabled={!lineText}
              >
                {copyStatus === 'copied' ? (
                  <>
                    <CheckCircleIcon className="w-4 h-4" />
                    <span>已复制</span>
                  </>
                ) : (
                  <>
                    <ClipboardIcon className="w-4 h-4" />
                    <span>复制提示</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-xs mb-2 text-slate-300">
              点击上方按钮，将提示词复制到剪贴板，然后发送给 AI。
            </p>
          </div>
          
          <div className="bg-slate-700 p-3 rounded-md">
            <h3 className="font-semibold text-base text-sky-300 mb-2">第二步：粘贴 AI 返回的结果</h3>
            <p className="text-xs text-slate-300">
              将 AI 生成的已标注文本，<strong className="text-yellow-300">完整粘贴回【台词文本】输入框中</strong>。
            </p>
            <div className="flex items-start text-xs text-slate-400 mt-2">
                <InformationCircleIcon className="w-4 h-4 mr-1.5 flex-shrink-0 mt-0.5" />
                <span>系统会自动提取括号内的情绪并填入“情绪”框，同时清理台词文本。</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-600 hover:bg-slate-500 rounded-md"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmotionAssistantModal;
