// Saved progress in localStorage. Every access is wrapped in try/catch so the game
// still works (just without saving) in private windows or when storage is blocked.

import type { ModeId } from '../core/level';
import type { SandboxDoc } from '../core/sandbox';

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

/**
 * Save a finished game, keeping the best score (lowest moves in Spread, most nodes
 * saved in Containment). Returns true if it's a new best.
 */
export function recordResult(levelId: string, score: number, stars: number, lowerIsBetter: boolean): boolean {
  const all = allProgress();
  const prev = all[levelId];
  if (prev && (lowerIsBetter ? prev.best <= score : prev.best >= score)) return false;
  all[levelId] = { best: score, stars: Math.max(stars, prev?.stars ?? 0) };
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

// ---------- Sandbox ----------

const SANDBOX_CURRENT_KEY = 'spread:sandbox:current:v1';
const SANDBOX_SAVED_KEY = 'spread:sandbox:saved:v1';

export interface SavedGraph {
  name: string;
  savedAt: number;
  doc: SandboxDoc;
}

/** The graph being edited, kept across visits. */
export function loadSandboxCurrent(): SandboxDoc | null {
  return read<SandboxDoc | null>(SANDBOX_CURRENT_KEY, null);
}

export function saveSandboxCurrent(doc: SandboxDoc) {
  write(SANDBOX_CURRENT_KEY, doc);
}

export function savedGraphs(): SavedGraph[] {
  return read<SavedGraph[]>(SANDBOX_SAVED_KEY, []);
}

/** Save under a name (replacing a save with the same name). */
export function saveGraph(name: string, doc: SandboxDoc) {
  const list = savedGraphs().filter((g) => g.name !== name);
  write(SANDBOX_SAVED_KEY, [{ name, savedAt: Date.now(), doc }, ...list]);
}

export function deleteSavedGraph(name: string) {
  write(SANDBOX_SAVED_KEY, savedGraphs().filter((g) => g.name !== name));
}
