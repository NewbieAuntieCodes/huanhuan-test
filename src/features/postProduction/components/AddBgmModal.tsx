import React, { useState, useEffect } from 'react';

interface AddBgmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (bgmName: string) => void;
}

const AddBgmModal: React.FC<AddBgmModalProps> = ({ isOpen, onClose, onSave }) => {
  const [bgmName, setBgmName] = useState('');

  useEffect(() => {
    if (isOpen) {
      setBgmName('');
    }
  }, [isOpen]);

  const handleSave = () => {
    const name = bgmName.trim();
    if (!name) {
      alert('请输入背景音乐（BGM）名称或标识');
      return;
    }
    onSave(name);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4 text-slate-100">添加BGM</h2>
        <div className="space-y-3">
          <input
            type="text"
            value={bgmName}
            onChange={(e) => setBgmName(e.target.value)}
            placeholder="例如：激昂的战斗音乐"
            className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500"
            autoFocus
          />
          <p className="text-xs text-slate-400">保存后会在当前位置插入“&lt;BGM&gt;”，并以蓝色高亮显示。</p>
        </div>
        <div className="flex justify-end space-x-3 mt-6">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-md">
            取消
          </button>
          <button type="button" onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-md">
            确认
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddBgmModal;
