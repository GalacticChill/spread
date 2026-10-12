// Saved progress in localStorage. Every access is wrapped in try/catch so the game
// still works (just without saving) in private windows or when storage is blocked.

import type { ModeId } from '../core/level';

export interface LevelProgress {
  best: number;
  stars: number;
}

const PROGRESS_KEY = 'spread:progress:v1';
const RULES_KEY = 'spread:rules-seen:v1';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: progress just won't persist */
  }
}

export function allProgress(): Record<string, LevelProgress> {
  return read<Record<string, LevelProgress>>(PROGRESS_KEY, {});
}

export function progressFor(levelId: string): LevelProgress | undefined {
  return allProgress()[levelId];
}

/** Save a finished game; keeps the best (lowest) score. Returns true if it's a new best. */
export function recordResult(levelId: string, moves: number, stars: number): boolean {
  const all = allProgress();
  const prev = all[levelId];
  if (prev && prev.best <= moves) return false;
  all[levelId] = { best: moves, stars: Math.max(stars, prev?.stars ?? 0) };
  write(PROGRESS_KEY, all);
  return true;
}

export function hasSeenRules(mode: ModeId): boolean {
  return read<string[]>(RULES_KEY, []).includes(mode);
}

export function markRulesSeen(mode: ModeId) {
  const seen = read<string[]>(RULES_KEY, []);
  if (!seen.includes(mode)) write(RULES_KEY, [...seen, mode]);
}
