import { useState, useEffect, useMemo } from 'react';
import { useStore } from '../../../store/useStore';
import { Chapter } from '../../../types';

export interface VoiceLibraryRowState {
  id: string;
  promptFilePath: string | null;
  promptAudioUrl: string | null;
  promptFileName: string | null;
  text: string;
  status: 'idle' | 'uploading' | 'generating' | 'done' | 'error';
  audioUrl: string | null;
  error: string | null;
  originalLineId?: string;
}

interface UseVoiceLibraryDataProps {
    selectedCharacterId: string;
    chapterFilter: string;
}

export const useVoiceLibraryData = ({ selectedCharacterId, chapterFilter }: UseVoiceLibraryDataProps) => {
    const { projects, characters, selectedProjectId } = useStore(state => ({
        projects: state.projects,
        characters: state.characters,
        selectedProjectId: state.selectedProjectId,
    }));
    
    const [rows, setRows] = useState<VoiceLibraryRowState[]>([]);

    const currentProject = useMemo(() => projects.find(p => p.id === selectedProjectId), [projects, selectedProjectId]);

    const charactersInProject = useMemo(() => {
        if (!selectedProjectId) {
            return characters.filter(c => !c.projectId && c.status !== 'merged' && c.name !== '[静音]' && c.name !== '音效' && c.name !== 'Narrator');
        }
        return characters.filter(c =>
            (c.projectId === selectedProjectId || !c.projectId) &&
            c.status !== 'merged' && 
            c.name !== '[静音]' && 
            c.name !== '音效' &&
            c.name !== 'Narrator'
        );
    }, [characters, selectedProjectId]);
    
    useEffect(() => {
        if (!currentProject) {
            setRows([]);
            return;
        }
        const chapterMatchesFilter = (chapter: Chapter, index: number): boolean => {
            const filter = chapterFilter.trim();
            if (!filter) return false;
            
            const chapterNum = index + 1; // Use 1-based index

            const rangeMatch = filter.match(/^(\d+)-(\d+)$/);
            if (rangeMatch) {
                const start = parseInt(rangeMatch[1], 10);
                const end = parseInt(rangeMatch[2], 10);
                return chapterNum >= start && chapterNum <= end;
            }
            
            const singleNumMatch = filter.match(/^\d+$/);
            if (singleNumMatch) {
                return chapterNum === parseInt(filter, 10);
            }

            return chapter.title.includes(filter);
        };
        
        const nonAudioCharacterIds = characters
            .filter(c => c.name === '[静音]' || c.name === '音效')
            .map(c => c.id);

        const scriptLines = currentProject.chapters.flatMap((chapter, index) => {
             if (chapterMatchesFilter(chapter, index)) {
                let linesInChapter = chapter.scriptLines;
                
                linesInChapter = linesInChapter.filter(line => !nonAudioCharacterIds.includes(line.characterId || ''));

                if (selectedCharacterId) {
                    return linesInChapter.filter(line => line.characterId === selectedCharacterId);
                }
                return linesInChapter;
            }
            return [];
        });

        setRows(scriptLines.map(line => ({
            id: `row_${line.id}_${Math.random()}`,
            promptFilePath: null, promptAudioUrl: null, promptFileName: null,
            text: line.text, status: 'idle', audioUrl: null, error: null,
            originalLineId: line.id,
        })));
    }, [selectedCharacterId, chapterFilter, currentProject, characters]);


    return {
        rows,
        setRows,
        currentProject,
        charactersInProject
    };
};
