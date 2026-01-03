import React, { useEffect, useMemo, useState } from 'react';
import type { Character, Project } from '../../../../types';

interface BatchReassignCharacterModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  sourceCharacter: Character;
  characters: Character[];
  onConfirm: (args: {
    targetCharacterId: string;
    rangeStartChapterNumber: number;
    rangeEndChapterNumber: number;
    includeUnassigned: boolean;
  }) => void;
}

const clampInt = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const BatchReassignCharacterModal: React.FC<BatchReassignCharacterModalProps> = ({
  isOpen,
  onClose,
  project,
  sourceCharacter,
  characters,
  onConfirm,
}) => {
  const maxChapter = Math.max(1, project.chapters.length);

  const eligibleTargets = useMemo(
    () =>
      characters
        .filter((c) => c.status !== 'merged')
        .filter((c) => (!c.projectId || c.projectId === project.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN')),
    [characters, project.id],
  );

  const [targetCharacterId, setTargetCharacterId] = useState<string>('');
  const [startNum, setStartNum] = useState<number>(1);
  const [endNum, setEndNum] = useState<number>(1);
  const [includeUnassigned, setIncludeUnassigned] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    setStartNum(1);
    setEndNum(maxChapter);
    setIncludeUnassigned(false);

    const defaultTarget = eligibleTargets.find((c) => c.id !== sourceCharacter.id);
    setTargetCharacterId(defaultTarget?.id || '');
  }, [isOpen, maxChapter, eligibleTargets, sourceCharacter.id]);

  const previewCount = useMemo(() => {
    if (!isOpen) return 0;
    const s = clampInt(startNum, 1, maxChapter);
    const e = clampInt(endNum, 1, maxChapter);
    const from = Math.min(s, e) - 1;
    const to = Math.max(s, e) - 1;

    let count = 0;
    for (let idx = from; idx <= to; idx++) {
      const ch = project.chapters[idx];
      if (!ch) continue;
      for (const line of ch.scriptLines) {
        if (line.characterId === sourceCharacter.id) count++;
        else if (includeUnassigned && !line.characterId) count++;
      }
    }
    return count;
  }, [isOpen, startNum, endNum, maxChapter, project.chapters, sourceCharacter.id, includeUnassigned]);

  if (!isOpen) return null;

  const canConfirm = !!targetCharacterId && previewCount > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-lg border border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold mb-2 text-slate-100">批量替换角色</h2>
        <p className="text-sm text-slate-400 mb-5">
          将章节范围内的 <span className="text-sky-300">“{sourceCharacter.name}”</span> 一键替换为目标角色。
        </p>

        <div className="space-y-4">
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

          <div className="flex items-center gap-2">
            <input
              id="include-unassigned"
              type="checkbox"
              checked={includeUnassigned}
              onChange={(e) => setIncludeUnassigned(e.target.checked)}
              className="form-checkbox h-4 w-4 text-sky-500 bg-slate-700 border-slate-600 rounded"
            />
            <label htmlFor="include-unassigned" className="text-sm text-slate-300">
              同时处理“未分配角色”的行（慎用）
            </label>
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1">目标角色</label>
            <select
              value={targetCharacterId}
              onChange={(e) => setTargetCharacterId(e.target.value)}
              className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600 focus:ring-sky-500"
            >
              <option value="" disabled>
                请选择目标角色…
              </option>
              {eligibleTargets.map((c) => (
                <option key={c.id} value={c.id} disabled={c.id === sourceCharacter.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">预估将修改 {previewCount} 行。</p>
          </div>
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
            disabled={!canConfirm}
            onClick={() => {
              const s = clampInt(startNum, 1, maxChapter);
              const e = clampInt(endNum, 1, maxChapter);
              onConfirm({
                targetCharacterId,
                rangeStartChapterNumber: Math.min(s, e),
                rangeEndChapterNumber: Math.max(s, e),
                includeUnassigned,
              });
            }}
            className="px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            确认替换
          </button>
        </div>
      </div>
    </div>
  );
};

export default BatchReassignCharacterModal;

