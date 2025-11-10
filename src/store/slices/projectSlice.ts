import { StateCreator } from 'zustand';
import { AppState } from '../useStore';
import { Project, Collaborator, Chapter, AudioBlob, ScriptLine, Character, SilenceSettings, MasterAudio, TextMarker } from '../../types';
import { db } from '../../db';
import { bufferToWav } from '../../lib/wavEncoder';
// FIX: Import `defaultSilenceSettings` to resolve reference error.
import { defaultSilenceSettings } from '../../lib/defaultSilenceSettings';

const defaultCharConfigs = [
  { name: '[静音]', color: 'bg-slate-700', textColor: 'text-slate-400', description: '用于标记无需录制的旁白提示' },
  { name: 'Narrator', color: 'bg-slate-600', textColor: 'text-slate-100', description: '默认旁白角色' },
  { name: '待识别角色', color: 'bg-orange-400', textColor: 'text-black', description: '由系统自动识别但尚未分配的角色' },
  { name: '音效', color: 'bg-transparent', textColor: 'text-red-500', description: '用于标记音效的文字描述' },
];

export interface ProjectSlice {
  projects: Project[];
  addProject: (newProject: Project) => Promise<void>;
  updateProject: (updatedProject: Project) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  addCollaboratorToProject: (projectId: string, username: string, role: 'reader' | 'editor') => Promise<void>;
  appendChaptersToProject: (projectId: string, newChapters: Chapter[]) => Promise<void>;
  addCustomSoundType: (projectId: string, soundType: string) => Promise<void>;
  deleteCustomSoundType: (projectId: string, soundType: string) => Promise<void>;
  batchAddChapters: (projectId: string, count: number) => Promise<void>;
  toggleLineReturnMark: (projectId: string, chapterId: string, lineId: string) => Promise<void>;
  updateLineFeedback: (projectId: string, chapterId: string, lineId: string, feedback: string) => Promise<void>;
  updateProjectSilenceSettings: (projectId: string, settings: SilenceSettings) => Promise<void>;
  updateLinePostSilence: (projectId: string, chapterId: string, lineId: string, silence?: number) => Promise<void>;
  updateProjectTextMarkers: (projectId: string, markers: TextMarker[]) => Promise<void>;
}

export const createProjectSlice: StateCreator<AppState, [], [], ProjectSlice> = (set, get, _api) => ({
  projects: [],
  addProject: async (newProject) => {
    const projectWithExtras = { 
      ...newProject, 
      cvStyles: {
        'pb': { bgColor: 'bg-slate-700', textColor: 'text-slate-300' } // Add default style for 'pb'
      },
      customSoundTypes: [],
      silenceSettings: defaultSilenceSettings,
    };
    
    // Create project-specific default characters
    const defaultCharsForProject: Character[] = defaultCharConfigs.map(config => ({
      id: Date.now().toString() + `_char_default_${newProject.id}_` + Math.random(),
      name: config.name,
      projectId: newProject.id, // Link to this new project
      color: config.color,
      textColor: config.textColor,
      description: config.description,
      cvName: config.name === 'Narrator' ? 'pb' : '', // Set default CV for Narrator
      isStyleLockedToCv: false,
      status: 'active',
    }));

    await db.transaction('rw', db.projects, db.characters, async () => {
      await db.projects.add(projectWithExtras);
      await db.characters.bulkAdd(defaultCharsForProject);
    });

    set(state => {
      const updatedProjects = [projectWithExtras, ...state.projects].sort((a,b) => b.lastModified - a.lastModified);
      const updatedCharacters = [...state.characters, ...defaultCharsForProject];
      return { projects: updatedProjects, characters: updatedCharacters };
    });
  },
  updateProject: async (updatedProject) => {
    const projectWithTimestamp = { ...updatedProject, lastModified: Date.now() };
    await db.projects.put(projectWithTimestamp);
    set(state => {
      const updatedProjects = state.projects
        .map(p => p.id === updatedProject.id ? projectWithTimestamp : p)
        .sort((a,b) => b.lastModified - a.lastModified);
      return { projects: updatedProjects };
    });
  },
  deleteProject: async (projectId) => {
    const state = get();

    // Identify characters associated with the project being deleted
    const characterIdsToDelete = state.characters
      .filter(char => char.projectId === projectId)
      .map(char => char.id);
    
    // Identify all audio blobs associated with the project's script lines
    const projectToDelete = state.projects.find(p => p.id === projectId);
    const audioBlobIdsToDelete: string[] = [];
    if (projectToDelete) {
      projectToDelete.chapters.forEach(chapter => {
        chapter.scriptLines.forEach(line => {
          if (line.audioBlobId) {
            audioBlobIdsToDelete.push(line.audioBlobId);
          }
        });
      });
    }

    // Perform an atomic transaction to delete the project and all its associated data
    await db.transaction('rw', db.projects, db.characters, db.audioBlobs, async () => {
      await db.projects.delete(projectId);
      if (characterIdsToDelete.length > 0) {
        await db.characters.bulkDelete(characterIdsToDelete);
      }
      if (audioBlobIdsToDelete.length > 0) {
        await db.audioBlobs.bulkDelete(audioBlobIdsToDelete);
      }
    });

    // Update the Zustand state after the database operations are complete
    set(currentState => {
      const updatedProjects = currentState.projects.filter(p => p.id !== projectId);
      const updatedCharacters = currentState.characters.filter(char => !characterIdsToDelete.includes(char.id));
      
      let newSelectedProjectId = currentState.selectedProjectId;
      if (currentState.selectedProjectId === projectId) {
        newSelectedProjectId = null;
      }

      return { 
        projects: updatedProjects, 
        characters: updatedCharacters,
        selectedProjectId: newSelectedProjectId 
      };
    });
  },
  addCollaboratorToProject: async (projectId, username, role) => {
    const state = get();
    const project = state.projects.find(p => p.id === projectId);
    if (!project) {
        console.error(`Project with ID ${projectId} not found for adding collaborator.`);
        return;
    }

    const existingCollaborators = project.collaborators || [];
    if (existingCollaborators.some(c => c.username.toLowerCase() === username.toLowerCase())) {
        alert(`协作者 "${username}" 已存在于此项目中。`);
        return;
    }
    const newCollaborator: Collaborator = {
        id: Date.now().toString() + "_collab_" + Math.random(),
        username,
        role
    };
    const updatedCollaborators = [...existingCollaborators, newCollaborator];
    const lastModified = Date.now();

    await db.projects.update(projectId, { collaborators: updatedCollaborators, lastModified });
    set(state => ({
        projects: state.projects.map(p => p.id === projectId ? { ...p, collaborators: updatedCollaborators, lastModified } : p)
            .sort((a,b) => b.lastModified - a.lastModified)
    }));
  },
  appendChaptersToProject: async (projectId, newChapters) => {
    const state = get();
    const project = state.projects.find(p => p.id === projectId);
    if (!project) return;
    
    const updatedChapters = [...project.chapters, ...newChapters];
    const lastModified = Date.now();

    await db.projects.update(projectId, { chapters: updatedChapters, lastModified });
    set(state => ({
      projects: state.projects.map(p => {
        if (p.id === projectId) {
          return { ...p, chapters: updatedChapters, lastModified };
        }
        return p;
      }).sort((a, b) => b.lastModified - a.lastModified),
    }));
  },
  addCustomSoundType: async (projectId, soundType) => {
    const state = get();
    const project = state.projects.find(p => p.id === projectId);
    if (!project) return;

    const trimmedSoundType = soundType.trim();
    if (!trimmedSoundType || (project.customSoundTypes || []).includes(trimmedSoundType)) {
      return;
    }

    const updatedProject = {
      ...project,
      customSoundTypes: [...(project.customSoundTypes || []), trimmedSoundType],
      lastModified: Date.now(),
    };

    await db.projects.put(updatedProject);
    set({
      projects: state.projects.map(p => p.id === projectId ? updatedProject : p)
        .sort((a,b) => b.lastModified - a.lastModified),
    });
  },
  deleteCustomSoundType: async (projectId, soundTypeToDelete) => {
    const state = get();
    const project = state.projects.find(p => p.id === projectId);
    if (!project) return;

    const updatedProject = {
      ...project,
      customSoundTypes: (project.customSoundTypes || []).filter(st => st !== soundTypeToDelete),
      chapters: project.chapters.map(ch => ({
        ...ch,
        scriptLines: ch.scriptLines.map(line => 
          line.soundType === soundTypeToDelete ? { ...line, soundType: '' } : line
        )
      })),
      lastModified: Date.now(),
    };

    await db.projects.put(updatedProject);
    set({
      projects: state.projects.map(p => p.id === projectId ? updatedProject : p)
        .sort((a,b) => b.lastModified - a.lastModified),
    });
  },
  batchAddChapters: async (projectId, count) => {
    const state = get();
    const project = state.projects.find(p => p.id === projectId);
    if (!project) return;

    let lastChapterTitle = '';
    if (project.chapters.length > 0) {
        lastChapterTitle = project.chapters[project.chapters.length - 1].title;
    }

    const titleRegex = /^(.*?)(\d+)(.*?)$/;
    const match = lastChapterTitle.match(titleRegex);

    let baseName = `第`;
    let startNumber = project.chapters.length + 1;
    let suffix = `章`;

    if (match) {
        baseName = match[1];
        startNumber = parseInt(match[2], 10) + 1;
        suffix = match[3];
    } else if (lastChapterTitle) {
        baseName = `${lastChapterTitle}-`;
        startNumber = 1;
        suffix = '';
    }
    
    const newChapters: Chapter[] = [];
    for (let i = 0; i < count; i++) {
        const newChapter: Chapter = {
            id: `ch_${Date.now()}_${i}_${Math.random()}`,
            title: `${baseName}${startNumber + i}${suffix}`,
            rawContent: '',
            scriptLines: [],
        };
        newChapters.push(newChapter);
    }
    
    const updatedProject = {
        ...project,
        chapters: [...project.chapters, ...newChapters],
        lastModified: Date.now(),
    };

    await db.projects.put(updatedProject);
    set({
        projects: state.projects.map(p => p.id === projectId ? updatedProject : p)
    });
  },
  toggleLineReturnMark: async (projectId, chapterId, lineId) => {
    const project = get().projects.find(p => p.id === projectId);
    if (!project) return;
    
    const updatedProject = {
      ...project,
      chapters: project.chapters.map(ch => {
        if (ch.id === chapterId) {
          return {
            ...ch,
            scriptLines: ch.scriptLines.map(line => {
              if (line.id === lineId) {
                return { ...line, isMarkedForReturn: !line.isMarkedForReturn };
              }
              return line;
            })
          };
        }
        return ch;
      }),
      lastModified: Date.now(),
    };
    
    await db.projects.put(updatedProject);
    set(state => ({
      projects: state.projects.map(p => p.id === projectId ? updatedProject : p)
    }));
  },
  updateLineFeedback: async (projectId, chapterId, lineId, feedback) => {
    const project = get().projects.find(p => p.id === projectId);
    if (!project) return;
    
    const updatedProject = {
      ...project,
      chapters: project.chapters.map(ch => {
        if (ch.id === chapterId) {
          return {
            ...ch,
            scriptLines: ch.scriptLines.map(line => {
              if (line.id === lineId) {
                return { ...line, feedback: feedback };
              }
              return line;
            })
          };
        }
        return ch;
      }),
      lastModified: Date.now(),
    };
    
    await db.projects.put(updatedProject);
    set(state => ({
      projects: state.projects.map(p => p.id === projectId ? updatedProject : p)
    }));
  },
  updateProjectSilenceSettings: async (projectId, settings) => {
    const project = get().projects.find(p => p.id === projectId);
    if (!project) return;

    const updatedProject = { ...project, silenceSettings: settings, lastModified: Date.now() };
    await db.projects.put(updatedProject);
    set(state => ({
        projects: state.projects.map(p => p.id === projectId ? updatedProject : p),
    }));
  },
  updateLinePostSilence: async (projectId, chapterId, lineId, silence) => {
    const project = get().projects.find(p => p.id === projectId);
    if (!project) return;

    const updatedProject = {
        ...project,
        chapters: project.chapters.map(ch => {
            if (ch.id === chapterId) {
                return {
                    ...ch,
                    scriptLines: ch.scriptLines.map(line => {
                        if (line.id === lineId) {
                            return { ...line, postSilence: silence === undefined ? undefined : Number(silence) };
                        }
                        return line;
                    })
                };
            }
            return ch;
        }),
        lastModified: Date.now(),
    };
    await db.projects.put(updatedProject);
    set(state => ({
        projects: state.projects.map(p => p.id === projectId ? updatedProject : p),
    }));
  },
  updateProjectTextMarkers: async (projectId, markers) => {
    const project = get().projects.find(p => p.id === projectId);
    if (!project) return;

    const updatedProject = {
      ...project,
      textMarkers: markers,
      lastModified: Date.now(),
    };

    // 优化：只更新变更字段，避免写入整条大型项目对象
    await db.projects.update(projectId, { textMarkers: markers, lastModified: updatedProject.lastModified });
    set(state => ({
      projects: state.projects.map(p => (p.id === projectId ? updatedProject : p)),
    }));
  },
});
