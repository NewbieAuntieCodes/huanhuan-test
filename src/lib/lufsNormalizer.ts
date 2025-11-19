/**
 * Estimates perceived loudness of an AudioBuffer using an RMS-based
 * approximation. This is not a full EBU R 128 implementation but is
 * sufficient for client-side consistency and gain calculation.
 *
 * Returns a value in dBFS that can be treated as an approximate LUFS.
 */
export function estimateLufsFromAudioBuffer(audioBuffer: AudioBuffer): number {
  let rms = 0;
  for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
    const data = audioBuffer.getChannelData(i);
    let channelRms = 0;
    for (let j = 0; j < data.length; j++) {
      channelRms += data[j] * data[j];
    }
    rms += channelRms / data.length;
  }
  rms = Math.sqrt(rms / audioBuffer.numberOfChannels);

  if (rms === 0) {
    return Number.NEGATIVE_INFINITY;
  }

  return 20 * Math.log10(rms);
}

/**
 * Normalizes the perceived loudness of an AudioBuffer to a target level.
 * This uses the same RMS approximation as estimateLufsFromAudioBuffer.
 *
 * @param audioBuffer The original AudioBuffer to process.
 * @param targetLoudnessDb The target loudness in dBFS (e.g., -18).
 * @returns A Promise that resolves to a new, normalized AudioBuffer.
 */
export async function normalizeAudioBuffer(
  audioBuffer: AudioBuffer,
  targetLoudnessDb: number,
): Promise<AudioBuffer> {
  const currentDb = estimateLufsFromAudioBuffer(audioBuffer);

  if (!isFinite(currentDb)) {
    return audioBuffer;
  }

  const offlineContext = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate,
  );

  const gainDb = targetLoudnessDb - currentDb;
  const gainLinear = Math.pow(10, gainDb / 20);

  const source = offlineContext.createBufferSource();
  source.buffer = audioBuffer;

  const gainNode = offlineContext.createGain();
  gainNode.gain.value = gainLinear;

  source.connect(gainNode);
  gainNode.connect(offlineContext.destination);
  source.start(0);

  const processedBuffer = await offlineContext.startRendering();

  for (let i = 0; i < processedBuffer.numberOfChannels; i++) {
    const data = processedBuffer.getChannelData(i);
    for (let j = 0; j < data.length; j++) {
      data[j] = Math.max(-1, Math.min(1, data[j]));
    }
  }

  return processedBuffer;
}
