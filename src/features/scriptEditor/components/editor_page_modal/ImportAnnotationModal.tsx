import React, { useState, useEffect } from 'react';
import { InformationCircleIcon, ClipboardIcon, CheckCircleIcon } from '../../../../components/ui/icons';

interface ImportAnnotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (annotatedText: string) => void;
  isLoading: boolean;
  chapterContentToCopy: string;
}

const ImportAnnotationModal: React.FC<ImportAnnotationModalProps> = ({ isOpen, onClose, onSubmit, isLoading, chapterContentToCopy }) => {
  const [annotatedText, setAnnotatedText] = useState('');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

  useEffect(() => {
    if (isOpen) {
      setAnnotatedText(''); // Clear text area when modal opens
      setCopyStatus('idle');
    }
  }, [isOpen]);

  const aiPrompt = `为了帮助小助手们更精准地标注角色，请将每个对话行详细标注成【角色】“台词内容”或者【CV-角色】“台词内容”的格式，并请勿误判非对话行。

**重要提醒：请不要合并同一个角色在原文中的每一段话到同一个标注里，并且请原样保留引号（“”）内的所有字符，包括逗号、句号或其他标点符号，切勿修改或删减引号内部内容。**

比如原始文本是
“风雪交加”，
“他抬起头，微笑着。”

填写后应该是
“风雪交加”，
“他抬起头，微笑着。”

精准的标注示例
“风雪交加”，
“他抬起头，微笑着。”

你的数据是
[你的章节原文]`;  const handleCopyClick = () => {
    const fullPrompt = aiPrompt.replace('[你的章节原文]', chapterContentToCopy || '');
    if (!chapterContentToCopy) {
      alert("没有要复制的章节内容。请在编辑器中选择一个章节。");
      return;
    }
    navigator.clipboard.writeText(fullPrompt).then(() => {
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
      alert('复制失败，请手动复制。');
    });
  };

  // FIX: Define the handleSubmit function to call the onSubmit prop.
  const handleSubmit = () => {
    onSubmit(annotatedText);
  };

  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-2xl">
        <h2 className="text-2xl font-semibold mb-4 text-slate-100">导入 AI 辅助标注文本</h2>
        
        <div className="mb-4 text-sm text-slate-300 space-y-4">
          <p>
            使用外部 AI (如 ChatGPT, Kimi 等) 为章节对话快速分配角色。
          </p>

          <div className="bg-slate-700 p-3 rounded-md">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold text-base text-sky-300">第一步：让 AI 处理你的文本</h3>
              <button
                onClick={handleCopyClick}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-md disabled:opacity-50 transition-colors"
                title="复制完整提示词"
                disabled={!chapterContentToCopy}
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
              点击上方按钮，将包含章节原文的完整提示词复制到剪贴板，然后发送给 AI。
            </p>
            <div className="relative">
              <pre className="mt-1 p-2 bg-slate-900 rounded text-xs overflow-x-auto text-sky-200 select-all">
                {aiPrompt}
              </pre>
            </div>
          </div>
          
          <div className="bg-slate-700 p-3 rounded-md">
            <h3 className="font-semibold text-base text-sky-300 mb-2">第二步：粘贴 AI 返回的结果</h3>
            <p className="text-xs text-slate-300">
              将 AI 生成的已标注文本，完整粘贴到下方的输入框中。
            </p>
            <div className="flex items-start text-xs text-slate-400 mt-2">
                <InformationCircleIcon className="w-4 h-4 mr-1.5 flex-shrink-0 mt-0.5" />
                <span>只会更新内容完全匹配的对话行。旁白和不匹配的行将被忽略。</span>
            </div>
          </div>
        </div>

        <textarea
          value={annotatedText}
          onChange={(e) => setAnnotatedText(e.target.value)}
          className="w-full h-56 p-3 bg-slate-900 text-slate-100 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
          placeholder="在此处粘贴 AI 生成的标注文本..."
          disabled={isLoading}
          aria-label="Paste annotated script here"
        />
        <div className="flex justify-end space-x-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-600 hover:bg-slate-500 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading || !annotatedText.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50"
          >
            {isLoading ? '处理中...' : '处理导入'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportAnnotationModal;
