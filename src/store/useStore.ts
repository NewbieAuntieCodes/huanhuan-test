import { create } from 'zustand';
// Fix: Import from types.ts to break circular dependency
import { AppView, CVStylesMap, PresetColor, SoundLibraryItem, IgnoredSoundKeyword } from '../types';
import { Project, Character, MergeHistoryEntry } from '../types';

// Import slice creators and their state/action types
import { createUiSlice, UiSlice, LufsSettings, defaultPostProductionLufsSettings } from './slices/uiSlice';
import { createProjectSlice, ProjectSlice } from './slices/projectSlice';
import { createProjectAudioSlice, ProjectAudioSlice } from './slices/projectAudioSlice';
import { createCharacterSlice, CharacterSlice } from './slices/characterSlice';
import { createMergeSlice, MergeSlice } from './slices/mergeSlice';
import { db } from '../db'; // Import the Dexie database instance
import { defaultCvPresetColors, defaultCharacterPresetColors } from '../lib/colorPresets';
import { soundLibraryRepository } from '../repositories/soundLibraryRepository';
import { miscRepository } from '../repositories';
import { normalizeCharacterNameKey } from '../lib/characterName';

// Define the combined state shape by extending all slice types
export interface AppState extends UiSlice, ProjectSlice, ProjectAudioSlice, CharacterSlice, MergeSlice {
  cvColorPresets: PresetColor[];
  characterColorPresets: PresetColor[];
  soundLibrary: SoundLibraryItem[];
  loadInitialData: () => Promise<void>;
  updateCvColorPresets: (presets: PresetColor[]) => Promise<void>;
  updateCharacterColorPresets: (presets: PresetColor[]) => Promise<void>;
  refreshSoundLibrary: () => Promise<void>;
  addIgnoredSoundKeyword: (projectId: string, chapterId: string, lineId: string, keyword: IgnoredSoundKeyword) => Promise<void>;
  updateLineEmotion: (projectId: string, chapterId: string, lineId: string, emotion: string) => Promise<void>;
}

const defaultCharConfigs = [
  { name: '[静音]', color: 'bg-slate-700', textColor: 'text-slate-400', description: '用于标记无需录制的旁白提示' },
  { name: 'Narrator', color: 'bg-slate-600', textColor: 'text-slate-100', description: '默认旁白角色' },
  { name: '待识别角色', color: 'bg-orange-400', textColor: 'text-black', description: '由系统自动识别但尚未分配的角色' },
  { name: '[音效]', color: 'bg-transparent', textColor: 'text-red-500', description: '用于标记音效的文字描述' },
];

export const useStore = create<AppState>((set, get, api) => ({
  // Spread slice creators, passing set, get, and api
  ...createUiSlice(set, get, api),
  ...createProjectSlice(set, get, api),
  ...createProjectAudioSlice(set, get, api),
  ...createCharacterSlice(set, get, api),
  ...createMergeSlice(set, get, api),

  // State for global color presets
  cvColorPresets: [],
  characterColorPresets: [],
  soundLibrary: [],

  // Global actions
  refreshSoundLibrary: async () => {
    try {
      const sounds = await soundLibraryRepository.getSounds();
      set({ soundLibrary: sounds });
    } catch (error) {
      console.error("Failed to load sound library:", error);
      set({ soundLibrary: [] });
    }
  },
  loadInitialData: async () => {
    try {
      const [
        projectsFromDb,
        charactersFromDb,
        miscData,
        lufsSettingsItem,
        postProductionLufsSettingsItem,
      ] = await db.transaction('r', db.projects, db.characters, db.misc, async () => {
        return Promise.all([
          db.projects.orderBy('lastModified').reverse().toArray(),
          db.characters.toArray(),
          miscRepository.getBulkConfig(),
          db.misc.get('lufsSettings'),
          db.misc.get('postProductionLufsSettings'),
        ]);
      });

      const {
        mergeHistory,
        cvColorPresets: cvColorPresetsFromDb,
        characterColorPresets: characterColorPresetsFromDb,
        apiSettings,
        selectedAiProvider,
        characterShortcuts,
        soundObservationList,
      } = miscData;

      const projects = projectsFromDb.map(p => ({ ...p, cvStyles: p.cvStyles || {} }));
      const lufsSettings = lufsSettingsItem?.value || { enabled: false, target: -18 };
      const postProductionLufsSettings =
        postProductionLufsSettingsItem?.value || defaultPostProductionLufsSettings;
      
      let cvColorPresets = cvColorPresetsFromDb;
      if (!cvColorPresets || !Array.isArray(cvColorPresets) || cvColorPresets.length === 0) {
        cvColorPresets = defaultCvPresetColors;
        await db.misc.put({ key: 'cvColorPresets', value: cvColorPresets });
      }

      let characterColorPresets = characterColorPresetsFromDb;
      if (!characterColorPresets || !Array.isArray(characterColorPresets) || characterColorPresets.length === 0) {
        characterColorPresets = defaultCharacterPresetColors;
        await db.misc.put({ key: 'characterColorPresets', value: characterColorPresets });
      }
      
      const processedCharacters = charactersFromDb.map((char: Character) => ({
        ...char,
        isStyleLockedToCv: char.isStyleLockedToCv || false,
        status: char.status || 'active',
      }));

      // One-time fix: ensure the special SFX role has transparent bg + red text and is locked
      const isSfxName = (name?: string) => {
        if (!name) return false;
        const n = normalizeCharacterNameKey(name);
        // 兼容旧数据与新显示格式
        return n === '音效' || n === '[音效]' || n === 'sfx';
      };
      const fixedCharacters: Character[] = processedCharacters.map((c) => {
        if (isSfxName(c.name)) {
          const desired = {
            color: 'bg-transparent',
            textColor: 'text-red-500',
            cvName: '',
            isStyleLockedToCv: true,
          } as Partial<Character>;
          const needsUpdate =
            c.color !== desired.color ||
            c.textColor !== desired.textColor ||
            (c.cvName || '') !== desired.cvName ||
            c.isStyleLockedToCv !== true;
          if (needsUpdate) {
            return { ...c, ...desired } as Character;
          }
        }
        return c;
      });

      // Persist SFX fixes back to DB if any
      const sfxUpdates = fixedCharacters.filter((c, idx) => c !== processedCharacters[idx]);
      if (sfxUpdates.length > 0) {
        await db.characters.bulkPut(sfxUpdates);
      }

      // Invariant: script lines should never be "unassigned".
      // Any missing/invalid characterId is normalized to the project-scoped "待识别角色".
      const UNKNOWN_ROLE_NAME = '待识别角色';
      const normalizedCharacters: Character[] = [...fixedCharacters];
      const unknownsToCreate: Character[] = [];
      const unknownIdByProject = new Map<string, string>();

      for (const project of projects) {
        const existingUnknown = normalizedCharacters.find(
          (c) =>
            c.projectId === project.id &&
            normalizeCharacterNameKey(c.name) === normalizeCharacterNameKey(UNKNOWN_ROLE_NAME) &&
            c.status !== 'merged',
        );
        if (existingUnknown) {
          unknownIdByProject.set(project.id, existingUnknown.id);
          continue;
        }

        const created: Character = {
          id: `${Date.now()}_char_unknown_${project.id}_${Math.random().toString(36).slice(2, 8)}`,
          name: UNKNOWN_ROLE_NAME,
          projectId: project.id,
          color: 'bg-orange-400',
          textColor: 'text-black',
          cvName: '',
          description: '由系统自动识别但尚未分配的角色',
          isStyleLockedToCv: false,
          status: 'active',
        };
        normalizedCharacters.push(created);
        unknownsToCreate.push(created);
        unknownIdByProject.set(project.id, created.id);
      }

      const fixedProjects: Project[] = projects.map((project) => {
        const unknownId = unknownIdByProject.get(project.id);
        if (!unknownId) return project;

        const validIds = new Set(
          normalizedCharacters
            .filter((c) => c.status !== 'merged')
            .filter((c) => !c.projectId || c.projectId === project.id)
            .map((c) => c.id),
        );

        let changed = false;
        const nextChapters = project.chapters.map((ch) => {
          let chapterChanged = false;
          const nextLines = ch.scriptLines.map((line) => {
            const cid = line.characterId || '';
            if (!cid || !validIds.has(cid)) {
              chapterChanged = true;
              changed = true;
              return { ...line, characterId: unknownId };
            }
            return line;
          });
          return chapterChanged ? { ...ch, scriptLines: nextLines } : ch;
        });

        return changed ? { ...project, chapters: nextChapters } : project;
      });

      const projectsToFixInDb = fixedProjects.filter((p, idx) => p !== projects[idx]);
      if (unknownsToCreate.length > 0 || projectsToFixInDb.length > 0) {
        await db.transaction('rw', db.characters, db.projects, async () => {
          if (unknownsToCreate.length > 0) {
            await db.characters.bulkPut(unknownsToCreate);
          }
          if (projectsToFixInDb.length > 0) {
            await db.projects.bulkPut(projectsToFixInDb);
          }
        });
      }

      let initialView: AppView = "dashboard";
      if (projects.length === 0) {
        initialView = "upload";
      }
      
      const soundsFromDb = await soundLibraryRepository.getSounds();

      set({
        projects: fixedProjects,
        characters: normalizedCharacters,
        mergeHistory,
        cvColorPresets,
        characterColorPresets,
        apiSettings,
        selectedAiProvider,
        characterShortcuts,
        lufsSettings,
        soundObservationList,
        postProductionLufsSettings,
        currentView: initialView,
        aiProcessingChapterIds: [], // Reset on load
        selectedProjectId: get().selectedProjectId || null,
        isLoading: false,
        soundLibrary: soundsFromDb,
      });
    } catch (error) {
      console.error("Failed to load data from Dexie database:", error);
      set({
        projects: [],
        characters: [],
        mergeHistory: [],
        cvColorPresets: defaultCvPresetColors,
        characterColorPresets: defaultCharacterPresetColors,
        currentView: "upload",
        isLoading: false,
        soundLibrary: [],
        soundObservationList: [],
      });
    }
  },
  updateCvColorPresets: async (presets: PresetColor[]) => {
    const state = get();
    const oldPresets = state.cvColorPresets;

    if (oldPresets.length !== presets.length) {
      await db.misc.put({ key: 'cvColorPresets', value: presets });
      set({ cvColorPresets: presets });
      console.warn("CV color presets length changed unexpectedly. Propagation skipped.");
      return;
    }

    const changes = new Map<string, { newBg: string; newText: string }>();
    for (let i = 0; i < presets.length; i++) {
      const oldP = oldPresets[i];
      const newP = presets[i];
      if (oldP.bgColorClass !== newP.bgColorClass || oldP.textColorClass !== newP.textColorClass) {
        changes.set(`${oldP.bgColorClass}|${oldP.textColorClass}`, {
          newBg: newP.bgColorClass,
          newText: newP.textColorClass,
        });
      }
    }

    if (changes.size === 0) {
      await db.misc.put({ key: 'cvColorPresets', value: presets });
      set({ cvColorPresets: presets });
      return;
    }

    const characterUpdates = new Map<string, Character>();
    const projectsToUpdateInDb: Project[] = [];

    const updatedProjects = state.projects.map(project => {
      if (!project.cvStyles) return project;

      let projectStylesChanged = false;
      const newCvStyles = { ...project.cvStyles };

      for (const cvName in newCvStyles) {
        const currentStyle = newCvStyles[cvName];
        const changeKey = `${currentStyle.bgColor}|${currentStyle.textColor}`;
        
        if (changes.has(changeKey)) {
          const change = changes.get(changeKey)!;
          newCvStyles[cvName] = {
            bgColor: change.newBg,
            textColor: change.newText,
          };
          projectStylesChanged = true;

          state.characters.forEach(char => {
            if (char.projectId === project.id && char.cvName === cvName && !char.isStyleLockedToCv) {
              const updatedChar = {
                ...char,
                color: change.newBg,
                textColor: change.newText,
              };
              characterUpdates.set(char.id, updatedChar);
            }
          });
        }
      }

      if (projectStylesChanged) {
        const updatedProject = { ...project, cvStyles: newCvStyles, lastModified: Date.now() };
        projectsToUpdateInDb.push(updatedProject);
        return updatedProject;
      }
      return project;
    });
    
    const finalUpdatedCharacters = state.characters.map(char => characterUpdates.get(char.id) || char);
    const charactersToUpdateInDb = Array.from(characterUpdates.values());

    await db.transaction('rw', db.misc, db.projects, db.characters, async () => {
        await db.misc.put({ key: 'cvColorPresets', value: presets });
        if (projectsToUpdateInDb.length > 0) {
            await db.projects.bulkPut(projectsToUpdateInDb);
        }
        if (charactersToUpdateInDb.length > 0) {
            await db.characters.bulkPut(charactersToUpdateInDb);
        }
    });

    set({
      cvColorPresets: presets,
      projects: updatedProjects,
      characters: finalUpdatedCharacters,
    });
  },
  updateCharacterColorPresets: async (presets: PresetColor[]) => {
    await db.misc.put({ key: 'characterColorPresets', value: presets });
    set({ characterColorPresets: presets });
  },
}));

export default useStore;
