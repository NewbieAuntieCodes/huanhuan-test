import React, { useState, useEffect, useRef } from 'react';
import { useEditorContext } from '../../contexts/EditorContext';
import { SoundLibraryItem } from '../../../../types';
import { PlayIcon, PauseIcon } from '../../../../components/ui/icons';
import LoadingSpinner from '../../../../components/ui/LoadingSpinner';

interface SoundKeywordPopoverProps {
    keyword: string;
    top: number;
    left: number;
    onClose: () => void;
}

const formatDuration = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
};

const SoundKeywordPopover: React.FC<SoundKeywordPopoverProps> = ({ keyword, top, left, onClose }) => {
    const { soundLibrary } = useEditorContext();
    const [playingSoundId, setPlayingSoundId] = useState<number | null>(null);
    const [loadingSoundId, setLoadingSoundId] = useState<number | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);

    const matchingSounds = React.useMemo(() => {
        const lowerKeyword = keyword.toLowerCase();
        return soundLibrary.filter(sound =>
            sound.name.toLowerCase().includes(lowerKeyword)
        ).slice(0, 10); // Limit to 10 results
    }, [keyword, soundLibrary]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        
        const handleEnded = () => setPlayingSoundId(null);
        audio.addEventListener('ended', handleEnded);
        audio.addEventListener('pause', handleEnded);
        
        return () => {
            audio.removeEventListener('ended', handleEnded);
            audio.removeEventListener('pause', handleEnded);
            audio.pause();
            if (audio.src) URL.revokeObjectURL(audio.src);
        };
    }, []);

    const handlePreview = async (sound: SoundLibraryItem) => {
        const audio = audioRef.current;
        if (!audio || !sound.id) return;

        if (playingSoundId === sound.id) {
            audio.pause();
            setPlayingSoundId(null);
            return;
        }

        if (audio.src) {
            URL.revokeObjectURL(audio.src);
        }

        setLoadingSoundId(sound.id);
        try {
            const file = await sound.handle.getFile();
            const url = URL.createObjectURL(file);
            audio.src = url;
            await audio.play();
            setPlayingSoundId(sound.id);
        } catch (e) {
            console.error("Error previewing sound:", e);
        } finally {
            setLoadingSoundId(null);
        }
    };
    
    // Position adjustment logic
    const [position, setPosition] = useState({ top, left });
    useEffect(() => {
        if (popoverRef.current) {
            const rect = popoverRef.current.getBoundingClientRect();
            let newLeft = left;
            if (newLeft + rect.width > window.innerWidth) {
                newLeft = window.innerWidth - rect.width - 10;
            }
            setPosition({ top: top + 10, left: newLeft });
        }
    }, [top, left]);

    return (
        <div
            ref={popoverRef}
            className="fixed z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-3 w-80 max-h-80 flex flex-col"
            style={{ top: position.top, left: position.left }}
            onMouseLeave={onClose}
        >
            <audio ref={audioRef} />
            <h4 className="text-sm font-semibold text-sky-300 mb-2 border-b border-slate-700 pb-2">
                音效库匹配: <span className="text-white">{keyword}</span>
            </h4>
            {matchingSounds.length === 0 ? (
                <div className="flex-grow flex items-center justify-center text-sm text-slate-400">
                    无匹配音效
                </div>
            ) : (
                <ul className="space-y-1 overflow-y-auto">
                    {matchingSounds.map(sound => (
                        <li key={sound.id} className="group flex items-center justify-between p-1.5 rounded-md hover:bg-slate-700">
                            <div className="flex items-center min-w-0">
                                <span className="text-sm truncate" title={sound.name}>{sound.name}</span>
                            </div>
                            <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                                <span className="text-xs text-slate-400 font-mono">{formatDuration(sound.duration)}</span>
                                <button onClick={() => handlePreview(sound)} className="p-1.5 rounded-full bg-slate-600 hover:bg-sky-600 text-white">
                                    {loadingSoundId === sound.id ? <LoadingSpinner /> : (playingSoundId === sound.id ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />)}
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default SoundKeywordPopover;