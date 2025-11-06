/**
 * 音频数据操作层 (Audio Repository)
 *
 * 职责：
 * - 统一管理音频相关的数据库操作
 * - 处理 AudioBlob、MasterAudio、AudioMarkerSet
 * - 提供音频存储、检索、删除功能
 */

import { db } from '../db';
import { AudioBlob, MasterAudio, AudioMarkerSet } from '../types';

/**
 * 音频数据仓库
 */
export class AudioRepository {
  // ==================== AudioBlob 操作 ====================

  /**
   * 获取所有音频片段
   */
  async getAllBlobs(): Promise<AudioBlob[]> {
    try {
      return await db.audioBlobs.toArray();
    } catch (error) {
      console.error('❌ [AudioRepository] 获取所有音频片段失败:', error);
      throw new Error('获取音频片段列表失败');
    }
  }

  /**
   * 根据ID获取音频片段
   */
  async getBlobById(blobId: string): Promise<AudioBlob | undefined> {
    try {
      return await db.audioBlobs.get(blobId);
    } catch (error) {
      console.error(`❌ [AudioRepository] 获取音频片段 ${blobId} 失败:`, error);
      throw new Error(`获取音频片段失败: ${blobId}`);
    }
  }

  /**
   * 根据lineId获取音频片段
   */
  async getBlobByLineId(lineId: string): Promise<AudioBlob | undefined> {
    try {
      return await db.audioBlobs.where('lineId').equals(lineId).first();
    } catch (error) {
      console.error(`❌ [AudioRepository] 根据lineId获取音频片段失败:`, error);
      return undefined;
    }
  }

  /**
   * 根据sourceAudioId获取所有音频片段
   */
  async getBlobsBySourceAudioId(sourceAudioId: string): Promise<AudioBlob[]> {
    try {
      return await db.audioBlobs.where('sourceAudioId').equals(sourceAudioId).toArray();
    } catch (error) {
      console.error(`❌ [AudioRepository] 根据sourceAudioId获取音频片段失败:`, error);
      throw new Error(`获取音频片段失败: ${sourceAudioId}`);
    }
  }

  /**
   * 保存音频片段
   */
  async saveBlob(blob: AudioBlob): Promise<void> {
    try {
      await db.audioBlobs.put(blob);
      console.log('✅ [AudioRepository] 保存音频片段成功:', blob.id);
    } catch (error) {
      console.error(`❌ [AudioRepository] 保存音频片段 ${blob.id} 失败:`, error);
      throw new Error(`保存音频片段失败: ${blob.id}`);
    }
  }

  /**
   * 批量保存音频片段
   */
  async bulkSaveBlobs(blobs: AudioBlob[]): Promise<void> {
    try {
      await db.audioBlobs.bulkPut(blobs);
      console.log(`✅ [AudioRepository] 批量保存 ${blobs.length} 个音频片段成功`);
    } catch (error) {
      console.error('❌ [AudioRepository] 批量保存音频片段失败:', error);
      throw new Error('批量保存音频片段失败');
    }
  }

  /**
   * 删除音频片段
   */
  async deleteBlob(blobId: string): Promise<void> {
    try {
      await db.audioBlobs.delete(blobId);
      console.log('✅ [AudioRepository] 删除音频片段成功:', blobId);
    } catch (error) {
      console.error(`❌ [AudioRepository] 删除音频片段 ${blobId} 失败:`, error);
      throw new Error(`删除音频片段失败: ${blobId}`);
    }
  }

  /**
   * 批量删除音频片段
   */
  async bulkDeleteBlobs(blobIds: string[]): Promise<void> {
    try {
      if (blobIds.length === 0) return;
      await db.audioBlobs.bulkDelete(blobIds);
      console.log(`✅ [AudioRepository] 批量删除 ${blobIds.length} 个音频片段成功`);
    } catch (error) {
      console.error('❌ [AudioRepository] 批量删除音频片段失败:', error);
      throw new Error('批量删除音频片段失败');
    }
  }

  // ==================== MasterAudio 操作 ====================

  /**
   * 获取所有主音频
   */
  async getAllMasterAudios(): Promise<MasterAudio[]> {
    try {
      return await db.masterAudios.toArray();
    } catch (error) {
      console.error('❌ [AudioRepository] 获取所有主音频失败:', error);
      throw new Error('获取主音频列表失败');
    }
  }

  /**
   * 根据ID获取主音频
   */
  async getMasterAudioById(audioId: string): Promise<MasterAudio | undefined> {
    try {
      return await db.masterAudios.get(audioId);
    } catch (error) {
      console.error(`❌ [AudioRepository] 获取主音频 ${audioId} 失败:`, error);
      throw new Error(`获取主音频失败: ${audioId}`);
    }
  }

  /**
   * 根据项目ID获取主音频列表
   */
  async getMasterAudiosByProjectId(projectId: string): Promise<MasterAudio[]> {
    try {
      const allAudios = await db.masterAudios.toArray();
      return allAudios.filter(audio => audio.projectId === projectId);
    } catch (error) {
      console.error(`❌ [AudioRepository] 获取项目主音频失败:`, error);
      throw new Error(`获取项目主音频失败: ${projectId}`);
    }
  }

  /**
   * 保存主音频
   */
  async saveMasterAudio(audio: MasterAudio): Promise<void> {
    try {
      await db.masterAudios.put(audio);
      console.log('✅ [AudioRepository] 保存主音频成功:', audio.id);
    } catch (error) {
      console.error(`❌ [AudioRepository] 保存主音频 ${audio.id} 失败:`, error);
      throw new Error(`保存主音频失败: ${audio.id}`);
    }
  }

  /**
   * 删除主音频
   */
  async deleteMasterAudio(audioId: string): Promise<void> {
    try {
      await db.masterAudios.delete(audioId);
      console.log('✅ [AudioRepository] 删除主音频成功:', audioId);
    } catch (error) {
      console.error(`❌ [AudioRepository] 删除主音频 ${audioId} 失败:`, error);
      throw new Error(`删除主音频失败: ${audioId}`);
    }
  }

  /**
   * 根据项目ID删除所有主音频
   */
  async deleteMasterAudiosByProjectId(projectId: string): Promise<number> {
    try {
      const audios = await this.getMasterAudiosByProjectId(projectId);
      const audioIds = audios.map(a => a.id);

      if (audioIds.length === 0) return 0;

      await db.masterAudios.bulkDelete(audioIds);
      console.log(`✅ [AudioRepository] 删除项目 ${projectId} 的 ${audioIds.length} 个主音频成功`);
      return audioIds.length;
    } catch (error) {
      console.error(`❌ [AudioRepository] 删除项目主音频失败:`, error);
      throw new Error(`删除项目主音频失败: ${projectId}`);
    }
  }

  // ==================== AudioMarkerSet 操作 ====================

  /**
   * 获取音频标记集
   */
  async getMarkerSet(sourceAudioId: string): Promise<AudioMarkerSet | undefined> {
    try {
      return await db.audioMarkers.get(sourceAudioId);
    } catch (error) {
      console.error(`❌ [AudioRepository] 获取音频标记集失败:`, error);
      return undefined;
    }
  }

  /**
   * 保存音频标记集
   */
  async saveMarkerSet(markerSet: AudioMarkerSet): Promise<void> {
    try {
      await db.audioMarkers.put(markerSet);
      console.log('✅ [AudioRepository] 保存音频标记集成功:', markerSet.sourceAudioId);
    } catch (error) {
      console.error(`❌ [AudioRepository] 保存音频标记集失败:`, error);
      throw new Error(`保存音频标记集失败: ${markerSet.sourceAudioId}`);
    }
  }

  /**
   * 删除音频标记集
   */
  async deleteMarkerSet(sourceAudioId: string): Promise<void> {
    try {
      await db.audioMarkers.delete(sourceAudioId);
      console.log('✅ [AudioRepository] 删除音频标记集成功:', sourceAudioId);
    } catch (error) {
      console.error(`❌ [AudioRepository] 删除音频标记集失败:`, error);
      throw new Error(`删除音频标记集失败: ${sourceAudioId}`);
    }
  }

  // ==================== 复合操作 ====================

  /**
   * 删除主音频及其关联的所有片段和标记
   */
  async deleteMasterAudioWithRelated(audioId: string): Promise<void> {
    try {
      await db.transaction('rw', db.masterAudios, db.audioBlobs, db.audioMarkers, async () => {
        // 删除关联的音频片段
        const blobs = await this.getBlobsBySourceAudioId(audioId);
        if (blobs.length > 0) {
          await db.audioBlobs.bulkDelete(blobs.map(b => b.id));
        }

        // 删除音频标记
        await db.audioMarkers.delete(audioId);

        // 删除主音频
        await db.masterAudios.delete(audioId);
      });

      console.log(`✅ [AudioRepository] 删除主音频及其关联数据成功: ${audioId}`);
    } catch (error) {
      console.error(`❌ [AudioRepository] 删除主音频及其关联数据失败:`, error);
      throw error;
    }
  }

  /**
   * 清理孤立的音频片段（没有对应主音频的片段）
   */
  async cleanupOrphanedBlobs(): Promise<number> {
    try {
      const allBlobs = await this.getAllBlobs();
      const allMasterAudios = await this.getAllMasterAudios();
      const masterAudioIds = new Set(allMasterAudios.map(a => a.id));

      const orphanedBlobs = allBlobs.filter(
        blob => blob.sourceAudioId && !masterAudioIds.has(blob.sourceAudioId)
      );

      if (orphanedBlobs.length > 0) {
        await this.bulkDeleteBlobs(orphanedBlobs.map(b => b.id));
        console.log(`✅ [AudioRepository] 清理 ${orphanedBlobs.length} 个孤立音频片段`);
      }

      return orphanedBlobs.length;
    } catch (error) {
      console.error('❌ [AudioRepository] 清理孤立音频片段失败:', error);
      throw error;
    }
  }

  /**
   * 获取音频存储统计信息
   */
  async getStorageStats(): Promise<{
    totalBlobs: number;
    totalMasterAudios: number;
    totalMarkerSets: number;
    estimatedSizeInMB: number;
  }> {
    try {
      const [blobs, masterAudios, markerSets] = await Promise.all([
        this.getAllBlobs(),
        this.getAllMasterAudios(),
        db.audioMarkers.toArray(),
      ]);

      // 估算大小（单位：MB）
      let totalSize = 0;
      for (const blob of blobs) {
        totalSize += blob.data.size;
      }
      for (const audio of masterAudios) {
        totalSize += audio.data.size;
      }

      return {
        totalBlobs: blobs.length,
        totalMasterAudios: masterAudios.length,
        totalMarkerSets: markerSets.length,
        estimatedSizeInMB: totalSize / (1024 * 1024),
      };
    } catch (error) {
      console.error('❌ [AudioRepository] 获取存储统计失败:', error);
      throw error;
    }
  }
}

// 导出单例实例
export const audioRepository = new AudioRepository();
