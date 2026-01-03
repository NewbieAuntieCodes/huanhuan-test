import React, { useEffect, useMemo, useState } from 'react';
import type { Project } from '../../../../types';

interface FixUnassignedToUnknownModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  unknownRoleName: string;
  isLineUnassignedOrInvalid: (chapterIndex: number, lineId: string) => boolean;
  onConfirm: (args: { rangeStartChapterNumber: number; rangeEndChapterNumber: number }) => void;
}

const clampInt = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const FixUnassignedToUnknownModal: React.FC<FixUnassignedToUnknownModalProps> = ({
  isOpen,
  onClose,
  project,
  unknownRoleName,
  isLineUnassignedOrInvalid,
  onConfirm,
}) => {
  const maxChapter = Math.max(1, project.chapters.length);
  const [startNum, setStartNum] = useState<number>(1);
  const [endNum, setEndNum] = useState<number>(1);

  useEffect(() => {
    if (!isOpen) return;
    setStartNum(1);
    setEndNum(maxChapter);
  }, [isOpen, maxChapter]);

  const previewCount = useMemo(() => {
    if (!isOpen) return 0;
    const s = clampInt(startNum, 1, maxChapter);
    const e = clampInt(endNum, 1, maxChapter);
    const from = Math.min(s, e) - 1;
    const to = Math.max(s, e) - 1;
    let count = 0;
    for (let chIdx = from; chIdx <= to; chIdx++) {
      const ch = project.chapters[chIdx];
      if (!ch) continue;
      for (const line of ch.scriptLines) {
        if (isLineUnassignedOrInvalid(chIdx, line.id)) count++;
      }
    }
    return count;
  }, [isOpen, startNum, endNum, maxChapter, project.chapters, isLineUnassignedOrInvalid]);

  if (!isOpen) return null;

  const canConfirm = previewCount > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-lg border border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold mb-2 text-slate-100">修复未分配角色</h2>
        <p className="text-sm text-slate-400 mb-5">
          将章节范围内 <span className="text-sky-300">“未分配/无效角色”</span> 的行统一设置为{' '}
          <span className="text-sky-300">“{unknownRoleName}”</span>。
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-slate-300 mb-1">起始章节（按顺序编号）</label>
            <input
              type="number"
              min={1}
              max={maxChapter}
              value={startNum}
              onChange={(e) => setStartNum(parseInt(e.target.value, 10) || 1)}
              className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600 focus:ring-sky-500"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">结束章节（按顺序编号）</label>
            <input
              type="number"
              min={1}
              max={maxChapter}
              value={endNum}
              onChange={(e) => setEndNum(parseInt(e.target.value, 10) || 1)}
              className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600 focus:ring-sky-500"
            />
          </div>
        </div>

        <p className="text-xs text-slate-500 mt-2">预估将修复 {previewCount} 行。</p>

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
            disabled={!canConfirm}
            onClick={() => {
              const s = clampInt(startNum, 1, maxChapter);
              const e = clampInt(endNum, 1, maxChapter);
              onConfirm({ rangeStartChapterNumber: Math.min(s, e), rangeEndChapterNumber: Math.max(s, e) });
            }}
            className="px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            确认修复
          </button>
        </div>
      </div>
    </div>
  );
};

export default FixUnassignedToUnknownModal;

