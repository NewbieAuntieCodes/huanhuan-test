import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { ApiSettings, AiProvider } from '../../store/slices/uiSlice';
import { XMarkIcon } from '../ui/icons';

const providers: { key: AiProvider; name: string }[] = [
    { key: 'gemini', name: 'Gemini' },
    { key: 'openai', name: 'GPT' },
    { key: 'moonshot', name: 'Moonshot' },
    { key: 'deepseek', name: 'DeepSeek' },
];

const SettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const { apiSettings: initialApiSettings, setApiSettings } = useStore();
    const [settings, setSettings] = useState<ApiSettings>(initialApiSettings);
    const [activeTab, setActiveTab] = useState<AiProvider>('gemini');

    useEffect(() => {
        if (isOpen) {
            setSettings(initialApiSettings);
        }
    }, [isOpen, initialApiSettings]);

    if (!isOpen) return null;

    const handleSave = () => {
        setApiSettings(settings);
        onClose();
    };

    // FIX: The original `handleChange` had a typing issue where `field: keyof ApiSettings[AiProvider]`
    // resolved to an intersection of keys ('apiKey' | 'baseUrl'), causing an error when 'model' was passed.
    // Making the function generic ensures `field` is correctly typed against the specific provider's settings.
    const handleChange = <P extends AiProvider>(provider: P, field: keyof ApiSettings[P], value: string) => {
        setSettings(prev => ({
            ...prev,
            [provider]: {
                ...prev[provider],
                [field]: value,
            },
        }));
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[100] p-4" onClick={onClose}>
            <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-2xl border border-slate-700 flex flex-col h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 flex-shrink-0">
                    <h2 className="text-xl font-semibold text-slate-100">设置</h2>
                    <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-white"><XMarkIcon /></button>
                </div>

                <div className="flex-grow flex gap-6 overflow-hidden">
                    <div className="w-1/4 border-r border-slate-700 pr-4">
                        <nav className="flex flex-col space-y-1">
                            {providers.map(p => (
                                <button
                                    key={p.key}
                                    onClick={() => setActiveTab(p.key)}
                                    className={`w-full text-left px-3 py-2 text-sm rounded-md ${activeTab === p.key ? 'bg-sky-600 text-white' : 'hover:bg-slate-700'}`}
                                >
                                    {p.name}
                                </button>
                            ))}
                        </nav>
                    </div>

                    <div className="w-3/4 overflow-y-auto pr-2">
                        {activeTab === 'gemini' && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-medium text-sky-400">Gemini Settings</h3>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">API Key</label>
                                    <input
                                        type="password"
                                        value={settings.gemini.apiKey}
                                        onChange={e => handleChange('gemini', 'apiKey', e.target.value)}
                                        className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600"
                                    />
                                </div>
                            </div>
                        )}
                        {activeTab === 'openai' && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-medium text-sky-400">OpenAI (GPT) Settings</h3>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">API Key</label>
                                    <input
                                        type="password"
                                        value={settings.openai.apiKey}
                                        onChange={e => handleChange('openai', 'apiKey', e.target.value)}
                                        className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Base URL (Optional)</label>
                                    <input
                                        type="text"
                                        value={settings.openai.baseUrl}
                                        onChange={e => handleChange('openai', 'baseUrl', e.target.value)}
                                        className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Model</label>
                                    <input
                                        type="text"
                                        value={settings.openai.model}
                                        onChange={e => handleChange('openai', 'model', e.target.value)}
                                        className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600"
                                    />
                                </div>
                            </div>
                        )}
                         {activeTab === 'moonshot' && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-medium text-sky-400">Moonshot (Kimi) Settings</h3>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">API Key</label>
                                    <input
                                        type="password"
                                        value={settings.moonshot.apiKey}
                                        onChange={e => handleChange('moonshot', 'apiKey', e.target.value)}
                                        className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Base URL (Optional)</label>
                                    <input
                                        type="text"
                                        value={settings.moonshot.baseUrl}
                                        onChange={e => handleChange('moonshot', 'baseUrl', e.target.value)}
                                        className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Model</label>
                                    <input
                                        type="text"
                                        value={settings.moonshot.model}
                                        onChange={e => handleChange('moonshot', 'model', e.target.value)}
                                        className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600"
                                    />
                                </div>
                            </div>
                        )}
                         {activeTab === 'deepseek' && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-medium text-sky-400">DeepSeek Settings</h3>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">API Key</label>
                                    <input
                                        type="password"
                                        value={settings.deepseek.apiKey}
                                        onChange={e => handleChange('deepseek', 'apiKey', e.target.value)}
                                        className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Base URL (Optional)</label>
                                    <input
                                        type="text"
                                        value={settings.deepseek.baseUrl}
                                        onChange={e => handleChange('deepseek', 'baseUrl', e.target.value)}
                                        className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Model</label>
                                    <input
                                        type="text"
                                        value={settings.deepseek.model}
                                        onChange={e => handleChange('deepseek', 'model', e.target.value)}
                                        className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
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

export default SettingsModal;