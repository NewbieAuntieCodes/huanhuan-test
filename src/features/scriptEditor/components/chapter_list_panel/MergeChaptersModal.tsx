import React, { useState, useEffect } from 'react';
import { Chapter } from '../../../../types';

interface MergeChaptersModalProps {
  isOpen: boolean;
  onClose: () => void;
  chaptersToMerge: Chapter[];
  allChapters: Chapter[];
  onConfirmMerge: (targetChapterId: string) => void;
}

const formatChapterNumber = (index: number) => {
  if (index < 0) return '';
  const number = index + 1;
  return number < 1000 ? String(number).padStart(3, '0') : String(number);
};

const MergeChaptersModal: React.FC<MergeChaptersModalProps> = ({
  isOpen,
  onClose,
  chaptersToMerge,
  allChapters,
  onConfirmMerge,
}) => {
  const [targetChapterId, setTargetChapterId] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    if (chaptersToMerge.length > 0) {
      // 默认选中已选择列表中的第一个章节作为目标
      setTargetChapterId(chaptersToMerge[0].id);
    } else if (allChapters.length > 0) {
      // 兜底：没有已选章节时，使用第一个章节
      setTargetChapterId(allChapters[0].id);
    } else {
      setTargetChapterId('');
    }
  }, [isOpen, chaptersToMerge, allChapters]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetChapterId) {
      alert('请选择一个目标章节');
      return;
    }
    onConfirmMerge(targetChapterId);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[70] p-4 overflow-y-auto">
      <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-lg my-auto">
        <h2 className="text-2xl font-semibold mb-4 text-slate-100">合并章节</h2>
        <p className="text-sm text-slate-300 mb-1">已选择 <strong className="text-sky-300">{chaptersToMerge.length}</strong> 个章节将被合并</p>
        <ul className="mb-4 space-y-1 text-sm max-h-40 overflow-y-auto pr-2 bg-slate-700 p-2 rounded-md">
          {chaptersToMerge.map(ch => {
            const chapterIndex = allChapters.findIndex(c => c.id === ch.id);
            const displayTitle = `${formatChapterNumber(chapterIndex)} ${ch.title}`;
            return (
              <li key={ch.id} className="px-2 py-1 rounded truncate" title={displayTitle}>
                {displayTitle}
              </li>
            );
          })}
        </ul>

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label htmlFor="targetChapter" className="block text-sm font-medium text-slate-300 mb-1">
              选择合并到的目标章节：
            </label>
            <select
              id="targetChapter"
              value={targetChapterId}
              onChange={(e) => setTargetChapterId(e.target.value)}
              className="w-full p-3 bg-slate-700 text-slate-100 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500 outline-none"
            >
              {allChapters.map((c) => {
                const chapterIndex = allChapters.findIndex(x => x.id === c.id);
                const displayTitle = `${formatChapterNumber(chapterIndex)} ${c.title}`;
                return (
                  <option key={c.id} value={c.id}>
                    {displayTitle}
                  </option>
                );
              })}
            </select>
          </div>
          <p className="text-xs text-slate-400 mb-6">
            提示：所选章节的内容将合并到目标章节中，其余被合并的章节会从列表中移除。
          </p>
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!targetChapterId}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              确认合并
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MergeChaptersModal;

