// Home, level select, and rules card screens.

import { h, icon, s, starRow } from './dom';
import { MODES, PLANNED_MODES, type ModeInfo } from './modes';
import { allProgress, markRulesSeen } from './storage';

export function homeScreen(): HTMLElement {
  const progress = allProgress();
  const list = h('ul', { class: 'mode-list' });
  for (const mode of MODES) {
    const earned = mode.levels.reduce((sum, l) => sum + (progress[l.id]?.stars ?? 0), 0);
    list.append(
      h(
        'li',
        {},
        h(
          'a',
          { class: 'mode-card', href: `#/${mode.id}` },
          h('span', { class: 'mode-title' }, mode.title),
          h('span', { class: 'mode-tagline' }, mode.tagline),
          h('span', { class: 'mode-progress' }, `★ ${earned} / ${mode.levels.length * 3}`),
        ),
      ),
    );
  }
  const upcoming = PLANNED_MODES - MODES.length;
  if (upcoming > 0) list.append(h('li', { class: 'soon' }, `${upcoming} more modes coming soon`));
  const sandbox = h(
    'a',
    { class: 'mode-card sandbox-card', href: '#/sandbox' },
    h('span', { class: 'mode-title' }, 'Sandbox'),
    h('span', { class: 'mode-tagline' }, 'Build your own graph, then play or solve it.'),
  );
  const corner = h(
    'nav',
    { class: 'home-corner', 'aria-label': 'More' },
    h('a', { class: 'icon-btn', href: '#/about', 'aria-label': 'About' }, icon('info')),
    h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': 'Settings' }, icon('sliders')),
  );
  return h('main', { class: 'screen home' }, corner, h('header', { class: 'home-head' }, logo(), h('h1', {}, 'Spread')), list, sandbox);
}

/** Small abstract mark: a hub lighting its neighbors. */
function logo(): SVGSVGElement {
  const pts: [number, number][] = [
    [32, 32],
    [32, 8],
    [54, 44],
    [10, 44],
  ];
  const svg = s('svg', { viewBox: '0 0 64 56', class: 'logo', 'aria-hidden': 'true' });
  for (const [x, y] of pts.slice(1)) svg.append(s('line', { x1: 32, y1: 32, x2: x, y2: y, class: 'logo-edge' }));
  pts.forEach(([x, y], i) => svg.append(s('circle', { cx: x, cy: y, r: 6, class: i < 3 ? 'logo-node on' : 'logo-node' })));
  return svg;
}

export function levelSelectScreen(mode: ModeInfo): HTMLElement {
  const progress = allProgress();
  const grid = h('ol', { class: 'level-grid' });
  mode.levels.forEach((level, i) => {
    const p = progress[level.id];
    // A level unlocks once the previous one has been completed.
    const unlocked = i === 0 || !!progress[mode.levels[i - 1].id];
    const content = [h('span', { class: 'level-num' }, String(i + 1)), unlocked ? starRow(p?.stars ?? 0, 12) : icon('lock')];
    grid.append(
      h(
        'li',
        {},
        unlocked
          ? h('a', { class: `level-tile${p ? ' done' : ''}`, href: `#/${mode.id}/${i + 1}`, 'aria-label': `Level ${i + 1}` }, ...content)
          : h('div', { class: 'level-tile locked', 'aria-label': `Level ${i + 1}, locked` }, ...content),
      ),
    );
  });
  const help = h('button', { class: 'icon-btn', 'aria-label': 'Rules', onclick: () => showRules(mode) }, icon('help'));
  return h('main', { class: 'screen levels' }, topBar('#/', mode.title, help), grid);
}

export function topBar(backHref: string, title: string | Node, right?: Node): HTMLElement {
  return h(
    'header',
    { class: 'top-bar' },
    h('a', { class: 'icon-btn', href: backHref, 'aria-label': 'Back' }, icon('back')),
    h('div', { class: 'top-title' }, title),
    right ?? h('span', { class: 'icon-btn-spacer' }),
  );
}

/** The short rules card. Marks the mode's rules as seen when dismissed. */
export function showRules(mode: ModeInfo, onClose?: () => void) {
  const close = () => {
    markRulesSeen(mode.id);
    overlay.classList.add('leaving');
    setTimeout(() => overlay.remove(), 180);
    onClose?.();
  };
  const overlay = h(
    'div',
    { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${mode.title} rules` },
    h('div', { class: 'card rules-card' }, h('h2', {}, mode.title), h('ol', { class: 'rules' }, ...mode.rules.map((r) => h('li', {}, r))), h('button', { class: 'btn primary', onclick: close }, 'Play')),
  );
  document.body.append(overlay);
  (overlay.querySelector('button') as HTMLButtonElement).focus();
}
