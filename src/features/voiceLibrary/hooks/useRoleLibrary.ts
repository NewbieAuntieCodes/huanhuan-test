import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { roleLibraryRepository } from '../../../repositories/roleLibraryRepository';
import { RoleLibraryRole, RoleLibrarySample } from '../../../types';
import { scanRoleLibraryRoot } from '../services/roleLibraryScanner';
import { pickBestRoleSample } from '../utils/roleSampleMatching';

type ScanStatus = 'idle' | 'scanning' | 'error';

const ensureDirectoryReadable = async (handle: FileSystemDirectoryHandle): Promise<boolean> => {
  try {
    // @ts-expect-error: File System Access API types vary across TS/lib versions
    const perm = await handle.queryPermission?.({ mode: 'read' });
    if (perm === 'granted') return true;
    // @ts-expect-error: File System Access API types vary across TS/lib versions
    const requested = await handle.requestPermission?.({ mode: 'read' });
    return requested === 'granted';
  } catch {
    // If permission APIs are missing, best-effort assume readable (Electron / permissive env)
    return true;
  }
};

export const useRoleLibrary = () => {
  const [roles, setRoles] = useState<RoleLibraryRole[]>([]);
  const [rootHandleName, setRootHandleName] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [scanMessage, setScanMessage] = useState<string>('');

  const samplesCacheRef = useRef<Map<string, Promise<RoleLibrarySample[]>>>(new Map());

  const refreshRolesFromDb = useCallback(async () => {
    const list = await roleLibraryRepository.getRoles();
    setRoles(list);

    const root = await roleLibraryRepository.getRootHandle();
    setRootHandleName(root?.name || null);
  }, []);

  useEffect(() => {
    void refreshRolesFromDb();
  }, [refreshRolesFromDb]);

  const linkRootFolder = useCallback(async () => {
    // @ts-expect-error: showDirectoryPicker is not in all TS lib dom versions
    const handle: FileSystemDirectoryHandle = await window.showDirectoryPicker();
    const ok = await ensureDirectoryReadable(handle);
    if (!ok) {
      alert('未获得读取该文件夹的权限。');
      return;
    }

    await roleLibraryRepository.saveRootHandle(handle);
    setRootHandleName(handle.name);
    await refreshRolesFromDb();
  }, [refreshRolesFromDb]);

  const rescan = useCallback(async () => {
    const root = await roleLibraryRepository.getRootHandle();
    if (!root) {
      alert('请先关联角色库根目录。');
      return;
    }

    const ok = await ensureDirectoryReadable(root);
    if (!ok) {
      alert('未获得读取角色库根目录的权限。');
      return;
    }

    setScanStatus('scanning');
    setScanMessage('准备扫描...');

    try {
      const { roles: scannedRoles, samples } = await scanRoleLibraryRoot(root, setScanMessage);

      await roleLibraryRepository.clearAll();
      await roleLibraryRepository.upsertRoles(scannedRoles);
      await roleLibraryRepository.addSamples(samples);

      samplesCacheRef.current.clear();
      await refreshRolesFromDb();
      setScanStatus('idle');
      setScanMessage(`完成：${scannedRoles.length} 个角色，${samples.length} 条音频`);
    } catch (e) {
      console.error('[RoleLibrary] scan failed', e);
      setScanStatus('error');
      setScanMessage(e instanceof Error ? e.message : '扫描失败');
    }
  }, [refreshRolesFromDb]);

  const getSamplesByRole = useCallback(async (roleName: string) => {
    const cacheKey = roleName;
    if (!samplesCacheRef.current.has(cacheKey)) {
      samplesCacheRef.current.set(cacheKey, roleLibraryRepository.getSamplesByRole(roleName));
    }
    return samplesCacheRef.current.get(cacheKey)!;
  }, []);

  const pickSampleForRole = useCallback(
    async (roleName: string, emotion?: string) => {
      const samples = await getSamplesByRole(roleName);
      return pickBestRoleSample(samples, emotion);
    },
    [getSamplesByRole],
  );

  const roleNames = useMemo(() => roles.map((r) => r.name), [roles]);

  return {
    roleNames,
    roles,
    rootHandleName,
    scanStatus,
    scanMessage,
    linkRootFolder,
    rescan,
    getSamplesByRole,
    pickSampleForRole,
  };
};

