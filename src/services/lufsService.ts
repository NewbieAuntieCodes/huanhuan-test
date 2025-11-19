import { db } from '../db';
import { SoundLibraryItem } from '../types';
import { estimateLufsFromAudioBuffer } from '../lib/lufsNormalizer';

const SOUND_LUFS_KEY_PREFIX = 'soundLufs:';

export async function getCachedSoundLufs(soundId: number): Promise<number | undefined> {
  const record = await db.misc.get(`${SOUND_LUFS_KEY_PREFIX}${soundId}`);
  return record?.value as number | undefined;
}

export async function setCachedSoundLufs(soundId: number, lufs: number): Promise<void> {
  await db.misc.put({ key: `${SOUND_LUFS_KEY_PREFIX}${soundId}`, value: lufs });
}

export async function ensureSoundLufsFromBuffer(
  soundId: number,
  buffer: AudioBuffer,
): Promise<number> {
  const existing = await getCachedSoundLufs(soundId);
  if (typeof existing === 'number') {
    return existing;
  }

  const lufs = estimateLufsFromAudioBuffer(buffer);
  await setCachedSoundLufs(soundId, lufs);
  return lufs;
}

export async function ensureSoundLufs(sound: SoundLibraryItem): Promise<number> {
  if (sound.id === undefined) {
    throw new Error('SoundLibraryItem is missing id for LUFS measurement');
  }

  const existing = await getCachedSoundLufs(sound.id);
  if (typeof existing === 'number') {
    return existing;
  }

  const AudioContextCtor =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  const audioContext = new AudioContextCtor();

  try {
    const file = await sound.handle.getFile();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = await audioContext.decodeAudioData(arrayBuffer);
    const lufs = estimateLufsFromAudioBuffer(buffer);
    await setCachedSoundLufs(sound.id, lufs);
    return lufs;
  } finally {
    if (audioContext.state !== 'closed') {
      audioContext.close().catch(() => {});
    }
  }
}

export function computeGainDbFromLufs(measuredLufs: number, targetLufs: number): number {
  if (!isFinite(measuredLufs)) return 0;
  return targetLufs - measuredLufs;
}

