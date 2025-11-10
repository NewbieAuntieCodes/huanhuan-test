/**
 * 音效库数据操作层 (Sound Library Repository)
 *
 * 职责：
 * - 统一管理音效库相关的数据库操作
 * - 存储和检索文件夹句柄
 * - 存储、检索和删除音效文件信息
 */

import { db } from '../db';
import { SoundLibraryItem, SoundLibraryHandleMap } from '../types';

class SoundLibraryRepository {
  /**
   * 获取所有已关联的文件夹句柄
   */
  async getHandles(): Promise<SoundLibraryHandleMap> {
    const entry = await db.misc.get('soundLibraryHandles');
    return entry?.value || {};
  }

  /**
   * 保存一个文件夹句柄
   * @param category 分类key，如 'music'
   * @param handle FileSystemDirectoryHandle
   */
  async saveHandle(category: string, handle: FileSystemDirectoryHandle): Promise<void> {
    const handles = await this.getHandles();
    handles[category] = handle;
    await db.misc.put({ key: 'soundLibraryHandles', value: handles });
  }

  /**
   * 获取所有音效
   */
  async getSounds(): Promise<SoundLibraryItem[]> {
    return db.soundLibrary.toArray();
  }
  
  /**
   * 批量添加音效
   */
  async addSounds(sounds: SoundLibraryItem[]): Promise<void> {
    if (sounds.length === 0) return;
    await db.soundLibrary.bulkAdd(sounds);
  }

  /**
   * 清除音效
   * @param category 如果提供，则只清除该分类的音效；否则清除所有。
   */
  async clearSounds(category?: string): Promise<void> {
    if (category) {
      await db.soundLibrary.where('category').equals(category).delete();
    } else {
      await db.soundLibrary.clear();
    }
  }
}

export const soundLibraryRepository = new SoundLibraryRepository();