import React, { useState, useEffect } from 'react';
import { useStore } from '../../../store/useStore';
import { XMarkIcon, PlusIcon, TrashIcon } from '../../../components/ui/icons';

const SoundAssistantSettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const { soundObservationList, setSoundObservationList } = useStore();
    const [list, setList] = useState<string[]>([]);
    const [newItem, setNewItem] = useState('');

    useEffect(() => {
        if (isOpen) {
            setList(soundObservationList);
        }
    }, [isOpen, soundObservationList]);

    if (!isOpen) return null;

    const handleSave = () => {
        setSoundObservationList(list);
        onClose();
    };

    const handleAddItem = () => {
        const item = newItem.trim();
        if (item && !list.includes(item)) {
            setList([...list, item]);
            setNewItem('');
        }
    };
    
    const handleRemoveItem = (itemToRemove: string) => {
        setList(list.filter(item => item !== itemToRemove));
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[100] p-4" onClick={onClose}>
            <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-lg border border-slate-700 flex flex-col h-[70vh]" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 flex-shrink-0">
                    <h2 className="text-xl font-semibold text-slate-100">音效助手设置</h2>
                    <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-white"><XMarkIcon /></button>
                </div>
                
                <p className="text-sm text-slate-400 mb-4">在此处添加关键词，编辑器将在台词中高亮这些词语，以提示您可能需要添加音效。</p>

                <div className="flex items-center gap-2 mb-4">
                    <input 
                        type="text"
                        value={newItem}
                        onChange={e => setNewItem(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddItem(); }}
                        placeholder="添加新关键词..."
                        className="flex-grow p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600"
                    />
                    <button onClick={handleAddItem} className="p-2 bg-sky-600 hover:bg-sky-700 rounded-md text-white">
                        <PlusIcon className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-grow overflow-y-auto pr-2 -mr-2 bg-slate-900/50 rounded-md p-2">
                    {list.length === 0 ? (
                        <p className="text-center text-slate-500 py-4">暂无关键词</p>
                    ) : (
                        <ul className="space-y-1">
                            {list.map(item => (
                                <li key={item} className="flex justify-between items-center p-2 bg-slate-700 rounded-md text-sm">
                                    <span className="text-slate-200">{item}</span>
                                    <button onClick={() => handleRemoveItem(item)} className="p-1 text-slate-400 hover:text-red-400">
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="flex justify-end space-x-3 mt-6 flex-shrink-0">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-md">
                        取消
                    </button>
                    <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-md">
                        保存
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SoundAssistantSettingsModal;
