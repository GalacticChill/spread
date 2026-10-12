// Registry of game modes and their levels. Later modes get added here.

import type { Level, ModeId } from '../core/level';
import spreadLevels from '../levels/spread.json';

export interface ModeInfo {
  id: ModeId;
  title: string;
  tagline: string;
  /** Short rules, one line each, for the first-time rules card. */
  rules: string[];
  levels: Level[];
}

export const MODES: ModeInfo[] = [
  {
    id: 'spread',
    title: 'Spread',
    tagline: 'Light every node.',
    rules: [
      'Tap a node to light it.',
      'Tick: the light spreads to every neighbor.',
      'Each tap and each tick is one move.',
      'Light the whole graph in as few moves as you can. Match par for three stars.',
    ],
    levels: spreadLevels as Level[],
  },
];

/** How many modes the finished app will have; the rest show as "coming soon". */
export const PLANNED_MODES = 6;

export function getMode(id: string): ModeInfo | undefined {
  return MODES.find((m) => m.id === id);
}
