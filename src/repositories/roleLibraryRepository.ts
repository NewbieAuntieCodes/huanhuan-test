/**
 * 角色库数据操作层 (Role Library Repository)
 *
 * 职责：
 * - 管理角色库根目录句柄（用于重新扫描）
 * - 存储/检索角色（子文件夹）与样本音频（文件句柄 + 元信息）
 */

import { db } from '../db';
import { RoleLibraryRole, RoleLibrarySample } from '../types';

const ROOT_HANDLE_KEY = 'roleLibraryRootHandle';

class RoleLibraryRepository {
  async getRootHandle(): Promise<FileSystemDirectoryHandle | null> {
    const entry = await db.misc.get(ROOT_HANDLE_KEY);
    return entry?.value || null;
  }

  async saveRootHandle(handle: FileSystemDirectoryHandle): Promise<void> {
    await db.misc.put({ key: ROOT_HANDLE_KEY, value: handle });
  }

  async clearAll(): Promise<void> {
    await db.transaction('rw', db.roleLibraryRoles, db.roleLibrarySamples, async () => {
      await db.roleLibrarySamples.clear();
      await db.roleLibraryRoles.clear();
    });
  }

  async upsertRoles(roles: RoleLibraryRole[]): Promise<void> {
    if (roles.length === 0) return;
    await db.roleLibraryRoles.bulkPut(roles);
  }

  async addSamples(samples: RoleLibrarySample[]): Promise<void> {
    if (samples.length === 0) return;
    await db.roleLibrarySamples.bulkAdd(samples);
  }

  async getRoles(): Promise<RoleLibraryRole[]> {
    return db.roleLibraryRoles.orderBy('name').toArray();
  }

  async getSamplesByRole(roleName: string): Promise<RoleLibrarySample[]> {
    return db.roleLibrarySamples.where('roleName').equals(roleName).toArray();
  }
}

export const roleLibraryRepository = new RoleLibraryRepository();

