export interface Collaborator {
  id: string;
  username: string;
  role: 'reader' | 'editor';
}

export interface Character {
  id: string;
  name: string;
  projectId?: string; // To scope characters to a project
  color: string; // Character background: Tailwind color class (e.g., 'bg-blue-500') or hex code (e.g., '#3b82f6')
  textColor?: string; // Character text color: Tailwind color class or hex code
  cvName?: string;
  description?: string;
  cvBackgroundColor?: string; // CV background: Tailwind CSS class or hex code
  cvTextColor?: string;     // CV text color: Tailwind CSS class or hex code
  aiVoicePreset?: string; // Future use
  isStyleLockedToCv?: boolean; // If true, this character's style is individually locked and should not be changed by a CV-level "Unify Styles" action.
  status?: 'active' | 'merged'; // For soft deletion/merging
  mergedIntoCharacterId?: string; // If status is 'merged'
}

export interface ScriptLine {
  id: string;
  text: string;
  originalText?: string; // To track if AI annotation changed it
  characterId?: string;
  audioBlobId?: string; // Path to AI-generated audio
  isAiAudioLoading: boolean;
  isAiAudioSynced: boolean; // True if current text matches generated/assigned audio
  isTextModifiedManual: boolean; // True if user manually edited text after initial load/AI annotation
  soundType?: string; // Off-screen / Off-stage sound type (e.g., 'OS', '电话音')
  isMarkedForReturn?: boolean;
  feedback?: string;
  postSilence?: number; // Override for silence after this line, in seconds
}

export interface Chapter {
  id: string;
  title: string;
  rawContent: string; // Full raw text of the chapter
  scriptLines: ScriptLine[];
}

export type ProjectStatus = "in-progress" | "completed";
export type MainCategory = string; // Changed from "male" | "female" | "custom"

export type LineType = 'narration' | 'dialogue' | 'sfx';

export type SilencePairing = `${LineType}-to-${LineType}`;

export interface SilenceSettings {
  startPadding: number;
  endPadding: number;
  pairs: Record<SilencePairing, number>;
}

export interface PostProductionTimeline {
  tracks: PostProductionTrack[];
  // Other global settings
}

export interface Project {
  id: string;
  name: string; // Book name
  rawFullScript?: string; // Full raw text of the uploaded script
  chapters: Chapter[];
  status: ProjectStatus;
  mainCategory: MainCategory;
  subCategory: string; // Can be predefined or custom
  collaborators?: Collaborator[];
  lastModified: number; // Timestamp for sorting
  cvStyles?: CVStylesMap;
  customSoundTypes?: string[];
  lastViewedChapterId?: string;
  silenceSettings?: SilenceSettings;
  postProductionTimeline?: PostProductionTimeline;
  textMarkers?: TextMarker[];
}

// For Gemini service response parsing
export interface AiAnnotatedLine {
  line_text: string;
  suggested_character_name: string;
}

// For storing audio data
export interface AudioBlob {
  id: string;
  lineId: string;
  data: Blob;
  sourceAudioId?: string; // ID linking to the master audio file
  sourceAudioFilename?: string; // Original filename of the master audio
}

export interface MasterAudio {
    id: string; // same as sourceAudioId
    projectId: string;
    data: Blob;
}

export interface AudioMarkerSet {
    sourceAudioId: string; // Primary Key
    markers: number[]; // Array of timestamps in seconds
}

// Voice Library: stored prompt (reference) audio for TTS
export interface VoiceLibraryPrompt {
  id: string; // composed key: `${projectId}::${originalLineId}`
  projectId: string;
  originalLineId: string; // the script line this prompt belongs to
  fileName: string | null; // original file name
  serverPath: string | null; // path returned by TTS server for reuse when generating
  data: Blob; // the uploaded prompt audio data
  createdAt: number;
}


// For Editor Page UI State
export type CharacterFilterMode = 'currentChapter' | 'all';

// For Character Merge History
export interface ProjectLineReassignment {
  lineId: string;
  originalCharacterId: string; // The characterId before merge (one of the sourceCharacterIds)
}
export interface MergeHistoryEntry {
  id: string; // Unique ID for this merge event
  mergedAt: number; // Timestamp of the merge
  sourceCharacters: Character[]; // Full data of characters that were merged (and removed/marked)
  targetCharacterId: string; // ID of the character that received the lines
  projectLineReassignments: Record<string, ProjectLineReassignment[]>; // Key: projectId, Value: list of line reassignments
}

// Fix: Moved from App.tsx to break circular dependencies
export type AppView = "upload" | "dashboard" | "editor" | "audioAlignment" | "cvManagement" | "voiceLibrary" | "audioAlignmentAssistant" | "postProduction";

export interface CVStyle {
  bgColor: string;
  textColor: string;
}
export type CVStylesMap = Record<string, CVStyle>;

// Definition for editable color presets
export interface PresetColor {
  name: string;
  bgColorClass: string;
  textColorClass: string;
}

export interface ParsedFileInfo {
  chapters: number[];
  characterName: string | null;
  cvName: string | null;
}

export interface AudioAssistantState {
  projectId: string;
  directoryName: string | null;
  scannedFiles: ParsedFileInfo[];
  manualOverrides: Record<string, boolean>;
}

export interface DirectoryHandleEntry {
  projectId: string;
  handle: FileSystemDirectoryHandle;
}

// Post Production Types
export interface SoundLibraryItem {
    id?: number;
    name: string;
    // Using handle implies File System Access API. We'll manage this carefully.
    handle: any; // FileSystemFileHandle is not universally available in all envs.
    tags: string[];
    duration: number;
}

export interface AudioClip {
    id: string;
    soundLibraryId: number;
    startTime: number; // in seconds on the timeline
    duration: number;
    // Optional properties for trimming within the clip
    trimStartTime?: number;
    trimEndTime?: number;
    volume: number;
}

export interface PostProductionTrack {
    id: string;
    name: string;
    type: 'music' | 'sfx' | 'ambience' | 'dialogue'; // dialogue is read-only
    clips: AudioClip[];
    isMuted: boolean;
    isSolo: boolean;
    volume: number; // 0-1
}

// FIX: Added TextMarker type to resolve import error in PostProductionPage.
export interface TextMarker {
  id: string;
  type: 'bgm' | 'sfx' | 'scene';
  name?: string;
  startLineId: string;
  startOffset?: number;
  endLineId: string;
  endOffset?: number;
}