// Registry of game modes and their levels. Later modes get added here.

import type { Level, ModeId } from '../core/level';
import containmentLevels from '../levels/containment.json';
import spreadLevels from '../levels/spread.json';
import originLevels from '../levels/origin.json';
import rivalLevels from '../levels/rival.json';
import thresholdLevels from '../levels/threshold.json';
import wiringLevels from '../levels/wiring.json';

export interface ModeInfo {
  id: ModeId;
  title: string;
  tagline: string;
  /** Short rules, one line each, for the first-time rules card. */
  rules: string[];
  /** For the About screen: the real problem behind the mode, in one plain sentence. */
  about: { problem: string; source: string; sentence: string };
  levels: Level[];
  /** Where Back goes (default: this mode's level list). */
  backHref?: string;
  /** Playing a sandbox graph: no saved progress, "Edit graph" instead of "Next level". */
  sandbox?: boolean;
}

export const MODES: ModeInfo[] = [
  {
    id: 'spread',
    about: { problem: 'Graph burning', source: 'Bonato, Janssen & Roshanbin, 2014', sentence: 'How quickly can a spreading fire consume a network if you may light one new node each round?' },
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
  {
    id: 'containment',
    about: { problem: 'The firefighter problem', source: 'Hartnell, 1995', sentence: 'A fire spreads every turn and you can protect a few nodes in its path: how many can you save?' },
    title: 'Containment',
    tagline: 'Hold the line.',
    rules: [
      'Orange starts on the ringed nodes. Protected nodes are gray with a bar.',
      'Each turn, tap nodes to protect them, up to your Shields. Protected nodes never catch.',
      'Tick: orange spreads to every unprotected neighbor.',
      'When orange can’t spread anymore, the game ends. Save as many nodes as you can.',
    ],
    levels: containmentLevels as Level[],
  },
  {
    id: 'threshold',
    about: { problem: 'Bootstrap percolation and target set selection', source: 'Chalupa, Leath & Reich, 1979', sentence: 'A node joins only once enough of its neighbors have, so the trick is choosing the few nodes that tip everything else.' },
    title: 'Threshold',
    tagline: 'Some nodes need convincing.',
    rules: [
      'Like Spread: tap to light a node, Tick to spread. Each is one move.',
      'Each node shows a number. On a tick it lights only if at least that many of its neighbors are orange.',
      'Light the whole graph in as few moves as you can. Match par for three stars.',
    ],
    levels: thresholdLevels as Level[],
  },
  {
    id: 'rival',
    about: { problem: 'Competitive diffusion', source: 'Alon, Feldman, Procaccia & Tennenholtz, 2010', sentence: 'Two influences spread through the same network at once, and nodes they reach at the same moment stay neutral.' },
    title: 'Rival',
    tagline: 'Outgrow the blue.',
    rules: [
      'Blue (marked with a diamond) starts on the ringed nodes and spreads on every tick.',
      'You have a few taps: each turns an uncolored node orange. Use them any time between ticks.',
      'Tick: orange and blue both spread. A node reached by both at once turns gray (with a bar).',
      'Colored nodes never change. Finish with as many orange nodes as you can.',
    ],
    levels: rivalLevels as Level[],
  },
  {
    id: 'origin',
    about: { problem: 'Source identification', source: 'Shah & Zaman, 2011', sentence: 'Given a snapshot of who has been reached, work out where the spread started.' },
    title: 'Origin',
    tagline: 'Find where it started.',
    rules: [
      'You see the result of a spread: the orange nodes after a number of ticks.',
      'Tap the hidden sources (you’re told how many), then Check.',
      'Any sources that would produce exactly this pattern count.',
      'A wrong guess rings the nodes it gets wrong. Guesses are limited.',
    ],
    levels: originLevels as Level[],
  },
  {
    id: 'wiring',
    about: { problem: 'Network design', source: 'adding links to bound distances', sentence: 'Add as few new links as possible so that every node is within a few hops of the source.' },
    title: 'Wiring',
    tagline: 'Build the shortcut.',
    rules: [
      'Drag from node to node to add a link. Tap a link you added to remove it.',
      'Tick runs a test spread from the ringed node.',
      'Reach every node within the tick limit, using as few new links as possible.',
    ],
    levels: wiringLevels as Level[],
  },
];

/** How many modes the finished app will have; the rest show as "coming soon". */
export const PLANNED_MODES = 6;

export function getMode(id: string): ModeInfo | undefined {
  return MODES.find((m) => m.id === id);
}
