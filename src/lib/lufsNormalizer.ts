import { bufferToWav } from './wavEncoder';

/**
 * Normalizes the perceived loudness of an AudioBuffer to a target level.
 * This is an approximation using RMS power, not a true EBU R 128 LUFS calculation,
 * but it's effective for client-side loudness consistency.
 *
 * @param audioBuffer The original AudioBuffer to process.
 * @param targetLoudnessDb The target loudness in dBFS (e.g., -18).
 * @returns A Promise that resolves to a new, normalized AudioBuffer.
 */
export async function normalizeAudioBuffer(
  audioBuffer: AudioBuffer,
  targetLoudnessDb: number,
): Promise<AudioBuffer> {
  // Use an OfflineAudioContext to process the audio without playing it.
  // Using the original buffer's properties ensures format consistency.
  const offlineContext = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );

  // Calculate the Root Mean Square (RMS) power of the original buffer.
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

  // If the audio is silent, no processing is needed.
  if (rms === 0) {
    return audioBuffer;
  }

  // Convert RMS power to dBFS (decibels relative to full scale).
  const currentDb = 20 * Math.log10(rms);

  // Calculate the gain required to reach the target loudness.
  const gainDb = targetLoudnessDb - currentDb;
  const gainLinear = Math.pow(10, gainDb / 20);

  // Create an audio graph to apply the gain.
  const source = offlineContext.createBufferSource();
  source.buffer = audioBuffer;

  const gainNode = offlineContext.createGain();
  gainNode.gain.value = gainLinear;

  source.connect(gainNode);
  gainNode.connect(offlineContext.destination);
  source.start(0);

  const processedBuffer = await offlineContext.startRendering();

  // Manually clip the processed audio to prevent distortion if the gain pushed it beyond [-1.0, 1.0].
  for (let i = 0; i < processedBuffer.numberOfChannels; i++) {
    const data = processedBuffer.getChannelData(i);
    for (let j = 0; j < data.length; j++) {
      data[j] = Math.max(-1, Math.min(1, data[j]));
    }
  }

  return processedBuffer;
}
