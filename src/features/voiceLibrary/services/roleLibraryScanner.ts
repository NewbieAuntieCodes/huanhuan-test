import * as mm from 'music-metadata-browser';
import { RoleLibraryRole, RoleLibrarySample } from '../../../types';

const isAudioFile = (name: string) => {
  const lower = name.toLowerCase();
  return lower.endsWith('.wav') || lower.endsWith('.mp3') || lower.endsWith('.m4a') || lower.endsWith('.flac');
};

const safeParseDuration = async (file: File): Promise<number> => {
  try {
    const metadata = await mm.parseBlob(file);
    return metadata.format.duration || 0;
  } catch {
    return 0;
  }
};

async function scanRoleDirectory(
  roleName: string,
  dirHandle: FileSystemDirectoryHandle,
  currentPath: string,
  samples: RoleLibrarySample[],
  onProgress?: (message: string) => void,
) {
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file' && isAudioFile(entry.name)) {
      const fileHandle = entry as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      const relativePath = `${currentPath}${file.name}`;
      onProgress?.(`解析: ${roleName}/${relativePath}`);
      const duration = await safeParseDuration(file);
      samples.push({
        roleName,
        relativePath,
        fileName: file.name,
        handle: fileHandle,
        duration,
        tags: [],
      });
    } else if (entry.kind === 'directory') {
      await scanRoleDirectory(
        roleName,
        entry as FileSystemDirectoryHandle,
        `${currentPath}${entry.name}/`,
        samples,
        onProgress,
      );
    }
  }
}

export async function scanRoleLibraryRoot(
  rootHandle: FileSystemDirectoryHandle,
  onProgress?: (message: string) => void,
): Promise<{ roles: RoleLibraryRole[]; samples: RoleLibrarySample[] }> {
  const roles: RoleLibraryRole[] = [];
  const samples: RoleLibrarySample[] = [];
  const now = Date.now();

  for await (const entry of rootHandle.values()) {
    if (entry.kind !== 'directory') continue;
    const roleDir = entry as FileSystemDirectoryHandle;
    const roleName = roleDir.name;
    roles.push({ name: roleName, handle: roleDir, updatedAt: now });
    onProgress?.(`扫描角色: ${roleName}`);
    await scanRoleDirectory(roleName, roleDir, '', samples, onProgress);
  }

  return { roles, samples };
}

