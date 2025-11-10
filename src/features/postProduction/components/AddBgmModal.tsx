import React, { useState, useEffect, useRef } from 'react';
import { SoundLibraryItem } from '../../../types';
import { MagnifyingGlassIcon, MusicalNoteIcon, PlayIcon, PauseIcon } from '../../../components/ui/icons';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

interface AddBgmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (bgmName: string, color?: string) => void;
  existingBgmNames: string[];
  soundLibrary: SoundLibraryItem[];
}

const formatDuration = (seconds: number) => {
  if (isNaN(seconds)) return '0:00';
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
};

const AddBgmModal: React.FC<AddBgmModalProps> = ({ isOpen, onClose, onSave, existingBgmNames, soundLibrary }) => {
  const [bgmName, setBgmName] = useState('');
  const [useCustomColor, setUseCustomColor] = useState(false);
  const [colorHex, setColorHex] = useState<string>('#fff9cc');
  const [alpha, setAlpha] = useState<number>(0.46);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SoundLibraryItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [previewAudio, setPreviewAudio] = useState<{ url: string; id: number } | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  
  // Search logic with debounce
  useEffect(() => {
    if (!searchTerm) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const handler = setTimeout(() => {
        const musicAndAmbience = soundLibrary.filter(
            s => s.category === 'music' || s.category === 'ambience'
        );
        const results = musicAndAmbience.filter(sound =>
            sound.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
        setSearchResults(results);
        setIsSearching(false);
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm, soundLibrary]);

  // Audio preview playback logic
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (previewAudio) {
      audio.src = previewAudio.url;
      audio.play().catch(e => console.error("Audio play failed", e));
    } else {
      audio.pause();
      audio.removeAttribute('src');
    }

    const handleEnded = () => setPreviewAudio(null);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handleEnded);

    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handleEnded);
    };
  }, [previewAudio]);

  // Cleanup blob URL when component unmounts or preview changes
  useEffect(() => {
    let urlToRevoke: string | null = null;
    if(previewAudio) {
        urlToRevoke = previewAudio.url;
    }
    return () => {
      if (urlToRevoke) {
        URL.revokeObjectURL(urlToRevoke);
      }
    };
  }, [previewAudio]);


  const handlePreview = async (sound: SoundLibraryItem) => {
    if (!sound.id) return;
    if (previewAudio?.id === sound.id) {
        setPreviewAudio(null);
        return;
    }
    try {
      const file = await sound.handle.getFile();
      const url = URL.createObjectURL(file);
      setPreviewAudio({ url, id: sound.id });
    } catch (e) {
      console.error("Error getting file for preview:", e);
      alert("无法预览该文件。");
    }
  };

  useEffect(() => {
    if (isOpen) {
      setBgmName('');
      setUseCustomColor(false);
      setColorHex('#fff9cc');
      setAlpha(0.46);
      setSearchTerm('');
      setSearchResults([]);
      setPreviewAudio(null);
    }
  }, [isOpen]);

  const hexToRgba = (hex: string, a: number) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return undefined;
    const r = parseInt(m[1], 16);
    const g = parseInt(m[2], 16);
    const b = parseInt(m[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  };

  const handleSave = () => {
    const name = bgmName.trim();
    if (!name) {
      alert('请输入背景音乐（BGM）名称或标识');
      return;
    }
    const color = useCustomColor ? hexToRgba(colorHex, alpha) : undefined;
    onSave(name, color);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <audio ref={audioRef} />
      <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <h2 className="text-xl font-semibold mb-4 text-slate-100 flex-shrink-0">添加背景音乐 (BGM)</h2>
        
        <div className="space-y-4 flex-grow overflow-y-auto pr-2 -mr-2">
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <MagnifyingGlassIcon className="h-5 w-5 text-slate-400" />
                </div>
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="输入关键词搜索音效库中的音乐..."
                    className="w-full p-2 pl-10 bg-slate-700 text-slate-100 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500"
                />
            </div>

            <div className="min-h-[12rem] bg-slate-900/50 rounded-md p-2 flex flex-col">
                {isSearching ? (
                    <div className="flex-grow flex items-center justify-center"><LoadingSpinner/></div>
                ) : searchResults.length > 0 ? (
                    <ul className="space-y-1 overflow-y-auto">
                        {searchResults.map(sound => (
                            <li key={sound.id} className="group flex items-center justify-between p-2 rounded-md hover:bg-slate-700 transition-colors">
                                <div className="flex items-center cursor-pointer flex-grow min-w-0" onClick={() => setBgmName(sound.name)}>
                                    <MusicalNoteIcon className="w-4 h-4 mr-3 text-sky-400 flex-shrink-0" />
                                    <span className="text-sm truncate" title={sound.name}>{sound.name}</span>
                                </div>
                                <div className="flex items-center space-x-2 flex-shrink-0 ml-4">
                                    <span className="text-xs text-slate-400 font-mono">{formatDuration(sound.duration)}</span>
                                    <button onClick={() => handlePreview(sound)} className="p-1.5 rounded-full bg-slate-600 group-hover:bg-sky-600 text-white">
                                        {previewAudio?.id === sound.id ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : searchTerm ? (
                    <div className="flex-grow flex items-center justify-center text-sm text-slate-500">在“音乐”或“环境音”中未找到匹配项。</div>
                ) : (
                     <div className="flex-grow flex items-center justify-center text-sm text-slate-500">在上方搜索框中输入关键词来查找音乐。</div>
                )}
            </div>

            <div>
              <label htmlFor="bgm-name" className="block text-sm font-medium text-slate-300 mb-2">BGM 名称或标识</label>
              <input
                type="text"
                id="bgm-name"
                value={bgmName}
                onChange={(e) => setBgmName(e.target.value)}
                placeholder="例如：配乐-追逐段 或 happy_theme.mp3"
                className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500"
              />
            </div>

            {existingBgmNames.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-slate-300 mb-2">可选：已有 BGM 名称</h3>
                <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                  {existingBgmNames.map(name => (
                    <button
                      key={name}
                      onClick={() => setBgmName(name)}
                      className={`px-3 py-1 text-xs rounded-full transition-colors ${bgmName === name ? 'bg-sky-600 text-white' : 'bg-slate-600 hover:bg-slate-500 text-slate-200'}`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={useCustomColor} onChange={(e) => setUseCustomColor(e.target.checked)} />
                使用自定义颜色
              </label>
              {useCustomColor && (
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">颜色</span>
                    <input type="color" value={colorHex} onChange={e => setColorHex(e.target.value)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">透明度</span>
                    <input type="range" min={0.2} max={0.8} step={0.01} value={alpha} onChange={e => setAlpha(parseFloat(e.target.value))} />
                    <span className="text-xs text-slate-400">{Math.round(alpha*100)}%</span>
                  </div>
                  <div className="w-16 h-6 rounded" style={{ background: `linear-gradient(90deg, ${hexToRgba(colorHex, 0)} 0%, ${hexToRgba(colorHex, alpha)} 100%)`, border: '1px solid #334155' }} />
                </div>
              )}
            </div>
        </div>

        <div className="flex justify-end space-x-3 mt-6 flex-shrink-0">
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