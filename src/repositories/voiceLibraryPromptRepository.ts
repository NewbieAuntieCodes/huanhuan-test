import { db } from '../db';
import { VoiceLibraryPrompt } from '../types';

export const composePromptId = (projectId: string, originalLineId: string) => `${projectId}::${originalLineId}`;

export class VoiceLibraryPromptRepository {
  async get(projectId: string, originalLineId: string): Promise<VoiceLibraryPrompt | undefined> {
    try {
      const id = composePromptId(projectId, originalLineId);
      return await db.voiceLibraryPrompts.get(id);
    } catch (error) {
      console.error('[VoiceLibraryPromptRepository] Failed to get prompt:', error);
      return undefined;
    }
  }

  async save(prompt: Omit<VoiceLibraryPrompt, 'createdAt'>): Promise<void> {
    try {
      const record: VoiceLibraryPrompt = { ...prompt, createdAt: Date.now() };
      await db.voiceLibraryPrompts.put(record);
    } catch (error) {
      console.error('[VoiceLibraryPromptRepository] Failed to save prompt:', error);
      throw error;
    }
  }

  async delete(projectId: string, originalLineId: string): Promise<void> {
    try {
      const id = composePromptId(projectId, originalLineId);
      await db.voiceLibraryPrompts.delete(id);
    } catch (error) {
      console.error('[VoiceLibraryPromptRepository] Failed to delete prompt:', error);
      throw error;
    }
  }
}

export const voiceLibraryPromptRepository = new VoiceLibraryPromptRepository();

