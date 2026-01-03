import React, { useEffect, useState } from 'react';

export type ChaptersPatchExportOption = 'all' | 'multi' | 'view';

interface ExportChaptersPatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (option: ChaptersPatchExportOption) => void;
  multiSelectCount: number;
  currentChapterIndex: number | null;
  currentChapterTitle: string | null;
  projectTitle: string;
}

const formatChapterNumber = (index: number | null) => {
  if (index === null || index < 0) return '';
  const number = index + 1;
  return number < 1000 ? String(number).padStart(3, '0') : String(number);
};

const ExportChaptersPatchModal: React.FC<ExportChaptersPatchModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  multiSelectCount,
  currentChapterIndex,
  currentChapterTitle,
  projectTitle,
}) => {
  const [selectedOption, setSelectedOption] = useState<ChaptersPatchExportOption>('all');

  const isMultiDisabled = multiSelectCount === 0;
  const isViewDisabled = !currentChapterTitle;

  useEffect(() => {
    if (isOpen) {
      if (!isMultiDisabled) setSelectedOption('multi');
      else if (!isViewDisabled) setSelectedOption('view');
      else setSelectedOption('all');
    }
  }, [isOpen, isMultiDisabled, isViewDisabled]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-md border border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-semibold mb-4 text-slate-100">同步导出（章节补丁）</h2>
        <p className="text-sm text-slate-400 mb-6">
          导出为 <strong className="text-sky-300">.json</strong>，用于把“画本结果（角色/颜色/描述/每行标注）”同步给同项目的其他人。
        </p>

        <div className="space-y-4">
          <label
            htmlFor="patch-export-all"
            className="flex items-center p-3 bg-slate-700 hover:bg-slate-600 rounded-md cursor-pointer transition-colors"
          >
            <input
              type="radio"
              id="patch-export-all"
              name="patch-export-option"
              value="all"
              checked={selectedOption === 'all'}
              onChange={() => setSelectedOption('all')}
              className="h-4 w-4 text-sky-500 bg-slate-800 border-slate-600 focus:ring-sky-400"
            />
            <div className="ml-3 text-sm">
              <span className="font-medium text-slate-200">导出整个项目章节</span>
              <p className="text-slate-400">"{projectTitle}"</p>
            </div>
          </label>

          <label
            htmlFor="patch-export-multi"
            className={`flex items-center p-3 rounded-md transition-colors ${
              isMultiDisabled
                ? 'bg-slate-700 opacity-50 cursor-not-allowed'
                : 'bg-slate-700 hover:bg-slate-600 cursor-pointer'
            }`}
          >
            <input
              type="radio"
              id="patch-export-multi"
              name="patch-export-option"
              value="multi"
              checked={selectedOption === 'multi'}
              onChange={() => !isMultiDisabled && setSelectedOption('multi')}
              disabled={isMultiDisabled}
              className="h-4 w-4 text-sky-500 bg-slate-800 border-slate-600 focus:ring-sky-400"
            />
            <div className="ml-3 text-sm">
              <span className={`font-medium ${isMultiDisabled ? 'text-slate-500' : 'text-slate-200'}`}>
                导出选中的章节
              </span>
              <p className={isMultiDisabled ? 'text-slate-500' : 'text-slate-400'}>
                {isMultiDisabled ? '(未选择章节)' : `(${multiSelectCount}个章节)`}
              </p>
            </div>
          </label>

          <label
            htmlFor="patch-export-view"
            className={`flex items-center p-3 rounded-md transition-colors ${
              isViewDisabled
                ? 'bg-slate-700 opacity-50 cursor-not-allowed'
                : 'bg-slate-700 hover:bg-slate-600 cursor-pointer'
            }`}
          >
            <input
              type="radio"
              id="patch-export-view"
              name="patch-export-option"
              value="view"
              checked={selectedOption === 'view'}
              onChange={() => !isViewDisabled && setSelectedOption('view')}
              disabled={isViewDisabled}
              className="h-4 w-4 text-sky-500 bg-slate-800 border-slate-600 focus:ring-sky-400"
            />
            <div className="ml-3 text-sm">
              <span className={`font-medium ${isViewDisabled ? 'text-slate-500' : 'text-slate-200'}`}>
                导出当前打开的章节
              </span>
              <p className={`truncate max-w-xs ${isViewDisabled ? 'text-slate-500' : 'text-slate-400'}`}>
                {isViewDisabled ? '(无打开的章节)' : `"${formatChapterNumber(currentChapterIndex)} ${currentChapterTitle}"`}
              </p>
            </div>
          </label>
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-600 hover:bg-slate-500 rounded-md"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selectedOption)}
            className="px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-md"
          >
            确认并导出
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportChaptersPatchModal;

