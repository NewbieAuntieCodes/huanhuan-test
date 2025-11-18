import { SilenceSettings } from '../types';

export const alignmentSilenceSettings: SilenceSettings = {
  startPadding: 1.0,
  endPadding: 1.0,
  pairs: {
    'narration-to-narration': 1.2,
    'narration-to-dialogue': 1.2,
    'narration-to-sfx': 0.6,
    'dialogue-to-dialogue': 1.1,
    'dialogue-to-narration': 1.3,
    'dialogue-to-sfx': 0.7,
    'sfx-to-dialogue': 0.7,
    'sfx-to-narration': 0.7,
    'sfx-to-sfx': 0.7,
  },
};

export const defaultSilenceSettings: SilenceSettings = {
  startPadding: 0,
  endPadding: 0,
  pairs: {
    'narration-to-narration': 0,
    'narration-to-dialogue': 0,
    'narration-to-sfx': 0,
    'dialogue-to-dialogue': 0,
    'dialogue-to-narration': 0,
    'dialogue-to-sfx': 0,
    'sfx-to-dialogue': 0,
    'sfx-to-narration': 0,
    'sfx-to-sfx': 0,
  },
};