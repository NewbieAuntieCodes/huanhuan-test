import { StateCreator } from 'zustand';
import { AppState } from '../useStore';
import { Character, Project } from '../../types';
import { db } from '../../db';
import { characterRepository, projectRepository } from '../../repositories';

export interface CharacterSlice {
  characters: Character[];
  addCharacter: (characterToAdd: Pick<Character, 'name' | 'color' | 'textColor' | 'cvName' | 'description' | 'isStyleLockedToCv'>, projectId: string) => Character;
  editCharacter: (characterBeingEdited: Character, updatedCvName?: string, updatedCvBgColor?: string, updatedCvTextColor?: string) => Promise<void>;
  deleteCharacter: (characterId: string) => Promise<void>;
  deleteCharacters: (characterIds: string[]) => Promise<void>;
  toggleCharacterStyleLock: (characterId: string) => Promise<void>;
  bulkUpdateCharacterStylesForCV: (cvName: string, newBgColor: string, newTextColor: string) => Promise<void>;
}

export const createCharacterSlice: StateCreator<AppState, [], [], CharacterSlice> = (set, get, _api) => ({
  characters: [],
  addCharacter: (characterToAdd, projectId) => {
    const state = get();
    const nameLc = characterToAdd.name.toLowerCase();

    // 1) 优先复用同项目下已存在的同名角色（避免重复并保留样式/描述）
    const existingInProject = state.characters.find(c =>
      c.name.toLowerCase() === nameLc && c.projectId === projectId && c.status !== 'merged'
    );
    if (existingInProject) return existingInProject;

    // 2) 若只存在“全局角色”（projectId 为空），复制其样式/描述作为本项目的默认值
    const globalTemplate = state.characters.find(c =>
      c.name.toLowerCase() === nameLc && !c.projectId && c.status !== 'merged'
    );

    // 3) 根据项目的 CV 样式进行覆盖（若提供了 cvName 且角色未锁定样式）
    const project = state.projects.find(p => p.id === projectId);
    const cvNameTrimmed = (characterToAdd.cvName || '').trim();
    const projectCvStyle = project?.cvStyles && cvNameTrimmed ? project.cvStyles[cvNameTrimmed] : undefined;

    const isLocked = characterToAdd.isStyleLockedToCv ?? false;

    const colorFromCv = projectCvStyle && !isLocked ? projectCvStyle.bgColor : undefined;
    const textFromCv = projectCvStyle && !isLocked ? projectCvStyle.textColor : undefined;

    const finalCharacter: Character = {
      id: `${Date.now()}_char_${Math.random().toString(36).substr(2, 9)}`,
      name: characterToAdd.name,
      projectId: projectId,
      color: colorFromCv || characterToAdd.color || globalTemplate?.color || 'bg-slate-600',
      textColor: textFromCv || characterToAdd.textColor || globalTemplate?.textColor || 'text-slate-100',
      cvName: cvNameTrimmed || globalTemplate?.cvName || '',
      description: (characterToAdd.description ?? globalTemplate?.description ?? ''),
      isStyleLockedToCv: isLocked,
      status: 'active',
    };

    // Save to database asynchronously
    characterRepository.create({
      name: finalCharacter.name,
      projectId: finalCharacter.projectId!,
      color: finalCharacter.color,
      textColor: finalCharacter.textColor,
      cvName: finalCharacter.cvName,
      description: finalCharacter.description,
      isStyleLockedToCv: finalCharacter.isStyleLockedToCv,
    }).catch(err => console.error("Failed to add character:", err));

    // Update state optimistically
    set(s => ({ characters: [...s.characters, finalCharacter] }));

    return finalCharacter;
  },
  editCharacter: async (characterBeingEdited, updatedCvNameFromModalProp, updatedCvBgColorFromModalProp, updatedCvTextColorFromModalProp) => {
    const projectId = characterBeingEdited.projectId || get().selectedProjectId;
    if (!projectId) {
      console.error("Cannot edit character/CV: No project context.");
      alert("错误：无法在没有选定项目的情况下编辑角色。");
      return;
    }
  
    // Prepare data for DB update based on the state right before the async call.
    const { projects } = get();
    const projectToUpdateForDb = projects.find(p => p.id === projectId);
    if (!projectToUpdateForDb) {
      console.error(`Project with ID ${projectId} not found when preparing DB update.`);
      return;
    }
  
    const trimmedCvName = (updatedCvNameFromModalProp || '').trim();
    let newProjectCvStylesForDb = { ...(projectToUpdateForDb.cvStyles || {}) };
    if (trimmedCvName && updatedCvBgColorFromModalProp && updatedCvTextColorFromModalProp) {
        newProjectCvStylesForDb[trimmedCvName] = { bgColor: updatedCvBgColorFromModalProp, textColor: updatedCvTextColorFromModalProp };
    }
    const updatedProjectForDb = { ...projectToUpdateForDb, cvStyles: newProjectCvStylesForDb };
  
    const finalCharacterDataForDb = { ...characterBeingEdited, cvName: trimmedCvName };
    if (!finalCharacterDataForDb.isStyleLockedToCv && trimmedCvName && newProjectCvStylesForDb[trimmedCvName]) {
        finalCharacterDataForDb.color = newProjectCvStylesForDb[trimmedCvName].bgColor;
        finalCharacterDataForDb.textColor = newProjectCvStylesForDb[trimmedCvName].textColor;
    }
  
    // Perform DB operations using repositories
    await db.transaction('rw', db.projects, db.characters, async () => {
        await projectRepository.update(updatedProjectForDb);
        await characterRepository.update(finalCharacterDataForDb);
    });
    
    // Update state using a functional update to prevent race conditions from stale state.
    set((state) => {
      const projectToUpdate = state.projects.find(p => p.id === projectId);
      if (!projectToUpdate) {
        console.warn(`Project with ID ${projectId} not found in state during update, skipping.`);
        return state;
      }
  
      const trimmedCvName = (updatedCvNameFromModalProp || '').trim();
      let newProjectCvStyles = { ...(projectToUpdate.cvStyles || {}) };
      if (trimmedCvName && updatedCvBgColorFromModalProp && updatedCvTextColorFromModalProp) {
          newProjectCvStyles[trimmedCvName] = { bgColor: updatedCvBgColorFromModalProp, textColor: updatedCvTextColorFromModalProp };
      }
      const updatedProject = { ...projectToUpdate, cvStyles: newProjectCvStyles };
  
      const finalCharacterData = { ...characterBeingEdited, cvName: trimmedCvName };
      if (!finalCharacterData.isStyleLockedToCv && trimmedCvName && newProjectCvStyles[trimmedCvName]) {
          finalCharacterData.color = newProjectCvStyles[trimmedCvName].bgColor;
          finalCharacterData.textColor = newProjectCvStyles[trimmedCvName].textColor;
      }
  
      return {
        projects: state.projects.map(p => p.id === projectId ? updatedProject : p),
        characters: state.characters.map(c => c.id === finalCharacterData.id ? finalCharacterData : c),
      };
    });
  },
  deleteCharacter: async (characterId) => {
    const state = get();
    const charToDelete = state.characters.find(c => c.id === characterId);
    let updatedCharacters = state.characters;
    let updatedProjects = state.projects;
    let needsProjectUpdate = false;

    // Prevent deleting certain default characters even if project-scoped
    const PROTECTED_NAMES = ['[静音]', '[音效]', '音效', '待识别角色'];
    if (charToDelete && PROTECTED_NAMES.includes(charToDelete.name)) {
       alert(`无法删除默认的功能性角色: ${charToDelete.name}`);
       return;
    }

    if (charToDelete && charToDelete.status === 'merged') {
        updatedCharacters = state.characters.filter(char => char.id !== characterId);
    } else {
        updatedCharacters = state.characters.filter(char => char.id !== characterId);
        updatedProjects = state.projects.map(proj => {
            // Only modify projects that this character belongs to
            if (charToDelete && proj.id === charToDelete.projectId) {
                needsProjectUpdate = true;
                return {
                    ...proj,
                    chapters: proj.chapters.map(ch => ({
                        ...ch,
                        scriptLines: ch.scriptLines.map(line =>
                            line.characterId === characterId ? { ...line, characterId: undefined } : line
                        )
                    }))
                };
            }
            return proj;
        });
    }

    await db.transaction('rw', db.characters, db.projects, async () => {
        await characterRepository.delete(characterId);
        if (needsProjectUpdate) {
            const projectsToUpdate = updatedProjects.filter(p => {
                const charProject = charToDelete ? charToDelete.projectId : null;
                return p.id === charProject;
            });
            await projectRepository.bulkUpdate(projectsToUpdate);
        }
    });

    set({ characters: updatedCharacters, projects: updatedProjects });
  },
  deleteCharacters: async (characterIds) => {
    const state = get();
    
    const charsToDelete = state.characters.filter(c => characterIds.includes(c.id));
    
    // Prevent deleting certain default characters even if project-scoped
    const PROTECTED_NAMES = ['[静音]', '[音效]', '音效', '待识别角色'];
    const protectedCharsFound = charsToDelete.filter(c => PROTECTED_NAMES.includes(c.name));

    if (protectedCharsFound.length > 0) {
        alert(`无法批量删除默认的功能性角色: ${protectedCharsFound.map(c => c.name).join(', ')}`);
        return;
    }
    
    const updatedCharacters = state.characters.filter(char => !characterIds.includes(char.id));

    let projectsHadChanges = false;
    const projectIdsAffected = new Set(charsToDelete.map(c => c.projectId));

    const updatedProjects = state.projects.map(proj => {
        if (projectIdsAffected.has(proj.id)) {
            projectsHadChanges = true;
            return {
                ...proj,
                chapters: proj.chapters.map(ch => ({
                    ...ch,
                    scriptLines: ch.scriptLines.map(line => 
                        line.characterId && characterIds.includes(line.characterId) ? { ...line, characterId: undefined } : line
                    )
                })),
                lastModified: Date.now()
            };
        }
        return proj;
    });

    await db.transaction('rw', db.characters, db.projects, async () => {
        await characterRepository.bulkDelete(characterIds);
        if (projectsHadChanges) {
            const projectsToUpdate = updatedProjects.filter(p => projectIdsAffected.has(p.id));
            await projectRepository.bulkUpdate(projectsToUpdate);
        }
    });

    set({ characters: updatedCharacters, projects: updatedProjects });
  },
  toggleCharacterStyleLock: async (characterId) => {
    const { characters, projects } = get();
    const characterToUpdate = characters.find(c => c.id === characterId);
    if (!characterToUpdate) return;
    
    // Can't toggle lock for global characters, though this is now less likely to happen
    if (!characterToUpdate.projectId) return;

    const project = projects.find(p => p.id === characterToUpdate.projectId);
    const projectCvStyles = project?.cvStyles || {};

    const newLockState = !characterToUpdate.isStyleLockedToCv;
    const updatedChar = { ...characterToUpdate, isStyleLockedToCv: newLockState };

    if (!newLockState && updatedChar.cvName && projectCvStyles[updatedChar.cvName]) {
        updatedChar.color = projectCvStyles[updatedChar.cvName].bgColor;
        updatedChar.textColor = projectCvStyles[updatedChar.cvName].textColor;
    }
    
    await characterRepository.update(updatedChar);

    set({ characters: characters.map(c => c.id === characterId ? updatedChar : c) });
  },
  bulkUpdateCharacterStylesForCV: async (cvName, newBgColor, newTextColor) => {
    const { projects, characters, selectedProjectId } = get();
    if (!selectedProjectId) return;
    const projectToUpdate = projects.find(p => p.id === selectedProjectId);
    if (!projectToUpdate) return;

    const newProjectCvStyles = { ...(projectToUpdate.cvStyles || {}) };
    newProjectCvStyles[cvName] = { bgColor: newBgColor, textColor: newTextColor };
    const updatedProject = { ...projectToUpdate, cvStyles: newProjectCvStyles };

    const charactersToUpdateInDb: Character[] = [];
    const updatedCharacters = characters.map(char => {
        // Only update characters belonging to the current project
        if (char.projectId === selectedProjectId && char.cvName === cvName && !char.isStyleLockedToCv) {
            const updated = { ...char, color: newBgColor, textColor: newTextColor };
            charactersToUpdateInDb.push(updated);
            return updated;
        }
        return char;
    });

    await db.transaction('rw', db.projects, db.characters, async () => {
        await projectRepository.update(updatedProject);
        if (charactersToUpdateInDb.length > 0) {
            await characterRepository.bulkUpdate(charactersToUpdateInDb);
        }
    });

    set({
        projects: projects.map(p => p.id === selectedProjectId ? updatedProject : p),
        characters: updatedCharacters
    });
  },
});
