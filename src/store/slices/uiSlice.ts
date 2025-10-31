import { StateCreator } from 'zustand';
import { AppState } from '../useStore'; // Import AppState for cross-slice type reference
import { AppView, ScriptLine, Character } from '../../types';
import React from 'react';
import { db } from '../../db';

export type AiProvider = 'gemini' | 'openai' | 'moonshot' | 'deepseek';
export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected';

export interface ApiSettings {
  gemini: { apiKey: string; baseUrl?: string };
  openai: { apiKey: string; baseUrl: string; model: string };
  moonshot: { apiKey: string; baseUrl: string; model: string };
  deepseek: { apiKey: string; baseUrl: string; model: string };
}


export interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
}

const confirmModalInitState: ConfirmModalState = {
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
};

export interface UiSlice {
  currentView: AppView;
  isLoading: boolean;
  selectedProjectId: string | null;
  selectedChapterId: string | null;
  aiProcessingChapterIds: string[];
  playingLineInfo: { line: ScriptLine; character: Character | undefined } | null;
  confirmModal: ConfirmModalState;
  characterAndCvStyleModal: {
    isOpen: boolean;
    characterToEdit: Character | null;
  };
  waveformEditor: {
    isOpen: boolean;
    lineId: string;
    lineIndex: number;
    sourceAudioInfo: { id: string; filename: string; } | null;
  };
  isSettingsModalOpen: boolean;
  isShortcutSettingsModalOpen: boolean;
  apiSettings: ApiSettings;
  selectedAiProvider: AiProvider;
  characterShortcuts: Record<string, string>; // key: keyboard key, value: characterId
  audioAlignmentCvFilter: string;
  audioAlignmentCharacterFilter: string;
  activeRecordingLineId: string | null;
  webSocketStatus: WebSocketStatus;


  navigateTo: (view: AppView) => void;
  setIsLoading: (loading: boolean) => void;
  setSelectedProjectId: (id: string | null) => void;
  setSelectedChapterId: (id: string | null) => Promise<void>;
  addAiProcessingChapterId: (id: string) => void;
  removeAiProcessingChapterId: (id: string) => void;
  setPlayingLine: (line: ScriptLine, character: Character | undefined) => void;
  clearPlayingLine: () => void;
  openConfirmModal: (
    title: string,
    message: React.ReactNode,
    onConfirm: () => void,
    confirmText?: string,
    cancelText?: string,
    onCancel?: () => void
  ) => void;
  closeConfirmModal: () => void;
  openCharacterAndCvStyleModal: (character: Character | null) => void;
  closeCharacterAndCvStyleModal: () => void;
  openWaveformEditor: (lineId: string, lineIndex: number, sourceAudioId: string, sourceAudioFilename: string) => void;
  closeWaveformEditor: () => void;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
  openShortcutSettingsModal: () => void;
  closeShortcutSettingsModal: () => void;
  setApiSettings: (settings: ApiSettings) => Promise<void>;
  setSelectedAiProvider: (provider: AiProvider) => Promise<void>;
  setCharacterShortcuts: (shortcuts: Record<string, string>) => Promise<void>;
  setAudioAlignmentCvFilter: (filter: string) => void;
  setAudioAlignmentCharacterFilter: (filter: string) => void;
  setActiveRecordingLineId: (id: string | null) => void;
  setWebSocketStatus: (status: WebSocketStatus) => void;
  goToNextLine: () => Promise<void>;
}

export const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set, get) => ({
  currentView: "dashboard", // Initial default
  isLoading: false,
  selectedProjectId: null,
  selectedChapterId: null,
  aiProcessingChapterIds: [],
  playingLineInfo: null,
  confirmModal: confirmModalInitState,
  characterAndCvStyleModal: { isOpen: false, characterToEdit: null },
  waveformEditor: { isOpen: false, lineId: '', lineIndex: -1, sourceAudioInfo: null },
  isSettingsModalOpen: false,
  isShortcutSettingsModalOpen: false,
  apiSettings: {
    gemini: { apiKey: '' },
    openai: { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4-turbo' },
    moonshot: { apiKey: '', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
    deepseek: { apiKey: '', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  },
  selectedAiProvider: 'gemini',
  characterShortcuts: {},
  audioAlignmentCvFilter: '',
  audioAlignmentCharacterFilter: '',
  activeRecordingLineId: null,
  webSocketStatus: 'disconnected',

  navigateTo: (view) => set({ currentView: view }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setSelectedProjectId: (id) => {
    if (id) {
        const { projects } = get();
        const project = projects.find(p => p.id === id);
        // Restore last viewed chapter, or default to first chapter, or null if no chapters.
        const chapterIdToSet = project?.lastViewedChapterId || project?.chapters[0]?.id || null;
        set({ selectedProjectId: id, selectedChapterId: chapterIdToSet });
    } else {
        set({ selectedProjectId: null, selectedChapterId: null });
    }
  },
  setSelectedChapterId: async (id) => {
    const { selectedProjectId, projects } = get();
    // Update UI state immediately for responsiveness
    set({ selectedChapterId: id });

    if (selectedProjectId && id) {
        const projectToUpdate = projects.find(p => p.id === selectedProjectId);
        // Only update if the chapter has changed and project exists
        if (projectToUpdate && projectToUpdate.lastViewedChapterId !== id) {
            const updatedProject = { ...projectToUpdate, lastViewedChapterId: id };
            
            // Persist change to the database in the background
            await db.projects.put(updatedProject);
            
            // Update the project in the global state
            set(state => ({
                projects: state.projects.map(p => p.id === selectedProjectId ? updatedProject : p),
            }));
        }
    }
  },
  addAiProcessingChapterId: (id) =>
    set((state) => ({
      aiProcessingChapterIds: state.aiProcessingChapterIds.includes(id)
        ? state.aiProcessingChapterIds
        : [...state.aiProcessingChapterIds, id],
    })),
  removeAiProcessingChapterId: (id) =>
    set((state) => ({
      aiProcessingChapterIds: state.aiProcessingChapterIds.filter(
        (chapterId) => chapterId !== id
      ),
    })),
  setPlayingLine: (line, character) => set({ playingLineInfo: { line, character } }),
  clearPlayingLine: () => set({ playingLineInfo: null }),

  openConfirmModal: (title, message, onConfirm, confirmText, cancelText, onCancel) => {
    set({
      confirmModal: {
        isOpen: true,
        title,
        message,
        onConfirm,
        onCancel,
        confirmText,
        cancelText,
      }
    });
  },
  closeConfirmModal: () => set({ confirmModal: confirmModalInitState }),
  openCharacterAndCvStyleModal: (character) => set({ characterAndCvStyleModal: { isOpen: true, characterToEdit: character } }),
  closeCharacterAndCvStyleModal: () => set({ characterAndCvStyleModal: { isOpen: false, characterToEdit: null } }),
  openWaveformEditor: (lineId, lineIndex, sourceAudioId, sourceAudioFilename) => set({
    waveformEditor: {
      isOpen: true,
      lineId,
      lineIndex,
      sourceAudioInfo: { id: sourceAudioId, filename: sourceAudioFilename }
    }
  }),
  closeWaveformEditor: () => set({ waveformEditor: { isOpen: false, lineId: '', lineIndex: -1, sourceAudioInfo: null } }),
  openSettingsModal: () => set({ isSettingsModalOpen: true }),
  closeSettingsModal: () => set({ isSettingsModalOpen: false }),
  openShortcutSettingsModal: () => set({ isShortcutSettingsModalOpen: true }),
  closeShortcutSettingsModal: () => set({ isShortcutSettingsModalOpen: false }),
  setApiSettings: async (settings) => {
    await db.misc.put({ key: 'apiSettings', value: settings });
    set({ apiSettings: settings });
  },
  setSelectedAiProvider: async (provider) => {
    await db.misc.put({ key: 'selectedAiProvider', value: provider });
    set({ selectedAiProvider: provider });
  },
  setCharacterShortcuts: async (shortcuts) => {
    await db.misc.put({ key: 'characterShortcuts', value: shortcuts });
    set({ characterShortcuts: shortcuts });
  },
  setAudioAlignmentCvFilter: (filter) => set({ audioAlignmentCvFilter: filter }),
  setAudioAlignmentCharacterFilter: (filter) => set({ audioAlignmentCharacterFilter: filter }),
  setActiveRecordingLineId: (id) => set({ activeRecordingLineId: id }),
  setWebSocketStatus: (status) => set({ webSocketStatus: status }),
  goToNextLine: async () => {
    const {
        projects, selectedProjectId, selectedChapterId, characters, activeRecordingLineId,
        audioAlignmentCvFilter, audioAlignmentCharacterFilter, setSelectedChapterId,
    } = get();

    if (!selectedProjectId) return;
    const project = projects.find(p => p.id === selectedProjectId);
    if (!project) return;
    
    const nonAudioCharacterIds = characters
        .filter(c => c.name === '[静音]' || c.name === '音效')
        .map(c => c.id);

    const isLineMatch = (line: ScriptLine): boolean => {
        if (nonAudioCharacterIds.includes(line.characterId || '')) return false;
        
        const lineCharacter = characters.find(c => c.id === line.characterId);
        if (!lineCharacter) return false;

        const cvFilterActive = !!audioAlignmentCvFilter;
        const charFilterActive = !!audioAlignmentCharacterFilter;
        
        if (!cvFilterActive && !charFilterActive) return true;
        
        const cvMatch = !cvFilterActive || (lineCharacter.cvName === audioAlignmentCvFilter);
        const charMatch = !charFilterActive || (lineCharacter.id === audioAlignmentCharacterFilter);
        
        return cvMatch && charMatch;
    };

    let foundCurrent = !activeRecordingLineId;
    let nextLine: (ScriptLine & { chapterId: string }) | null = null;

    for (const chapter of project.chapters) {
        for (const line of chapter.scriptLines) {
            if (foundCurrent) {
                if (isLineMatch(line)) {
                    nextLine = { ...line, chapterId: chapter.id };
                    break;
                }
            } else if (line.id === activeRecordingLineId) {
                foundCurrent = true;
            }
        }
        if (nextLine) {
            break;
        }
    }
    
    if (!nextLine) {
        // Reached the end of the entire project for this filter. Do nothing.
        return; 
    }

    if (nextLine.chapterId !== selectedChapterId) {
        await setSelectedChapterId(nextLine.chapterId);
    }

    set({ activeRecordingLineId: nextLine.id });
  },
});