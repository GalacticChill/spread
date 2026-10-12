// Light haptic feedback where supported (Android Chrome; iOS Safari ignores vibrate).
// Can be turned off in Settings.

import { loadSettings } from './storage';

function buzz(pattern: number | number[]) {
  if (!loadSettings().haptics) return;
  try {
    if ('vibrate' in navigator) navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

export const haptics = {
  tap: () => buzz(8),
  tick: () => buzz(14),
  win: () => buzz([18, 60, 18, 60, 30]),
};
