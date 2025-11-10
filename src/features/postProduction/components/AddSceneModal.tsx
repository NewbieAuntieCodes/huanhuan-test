import React, { useState, useEffect } from 'react';

interface AddSceneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (sceneName: string) => void;
  existingSceneNames: string[];
}

const AddSceneModal: React.FC<AddSceneModalProps> = ({ isOpen, onClose, onSave, existingSceneNames }) => {
  const [sceneName, setSceneName] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSceneName(''); // Reset on open
    }
  }, [isOpen]);

  const handleSave = () => {
    if (sceneName.trim()) {
      onSave(sceneName.trim());
    } else {
      alert("请输入场景名称。");
    }
  };
  
  const handleSelectExisting = (name: string) => {
      setSceneName(name);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4 text-slate-100">创建或指定场景</h2>
        <div className="mb-4">
          <label htmlFor="scene-name" className="block text-sm font-medium text-slate-300 mb-2">场景名称</label>
          <input
            type="text"
            id="scene-name"
            value={sceneName}
            onChange={(e) => setSceneName(e.target.value)}
            placeholder="例如：场景1 或 开头回忆"
            className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500"
            autoFocus
          />
        </div>

        {existingSceneNames.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-slate-300 mb-2">或选择现有场景</h3>
            <div className="flex flex-wrap gap-2">
              {existingSceneNames.map(name => (
                <button
                  key={name}
                  onClick={() => handleSelectExisting(name)}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${sceneName === name ? 'bg-sky-600 text-white' : 'bg-slate-600 hover:bg-slate-500 text-slate-200'}`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

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

export default AddSceneModal;
