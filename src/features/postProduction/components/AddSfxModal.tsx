import React, { useEffect, useState } from 'react';

interface AddSfxModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (sfxText: string) => void;
}

const AddSfxModal: React.FC<AddSfxModalProps> = ({ isOpen, onClose, onSave }) => {
  const [sfx, setSfx] = useState('');

  useEffect(() => {
    if (isOpen) setSfx('');
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    const val = sfx.trim();
    if (!val) {
      alert('请输入音效内容，例如：捅天花板');
      return;
    }
    onSave(val);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4 text-slate-100">添加音效</h2>
        <div className="space-y-3">
          <input
            type="text"
            value={sfx}
            onChange={(e) => setSfx(e.target.value)}
            placeholder="例如：捅天花板"
            className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500"
          />
          <p className="text-xs text-slate-400">保存后会在当前位置插入“[音效]”，并以红色高亮显示。</p>
        </div>
        <div className="flex justify-end space-x-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-md">取消</button>
          <button onClick={handleConfirm} className="px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-md">确认</button>
        </div>
      </div>
    </div>
  );
};

export default AddSfxModal;

