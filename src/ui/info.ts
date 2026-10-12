// About and Settings screens.

import { h } from './dom';
import { MODES } from './modes';
import { topBar } from './screens';
import { loadSettings, resetProgress, saveSettings, type AppSettings } from './storage';

export function aboutScreen(): HTMLElement {
  return h(
    'main',
    { class: 'screen about' },
    topBar('#/', 'About'),
    h(
      'div',
      { class: 'prose' },
      h('p', { class: 'lead' }, 'Spread is a set of small puzzles about how things move through networks. Each mode is a real problem from graph theory.'),
      h(
        'ul',
        { class: 'about-list' },
        ...MODES.map((m) =>
          h(
            'li',
            {},
            h('div', { class: 'about-head' }, h('span', { class: 'about-mode' }, m.title), h('span', { class: 'about-problem' }, m.about.problem)),
            h('p', {}, m.about.sentence),
            h('p', { class: 'about-source' }, m.about.source),
          ),
        ),
      ),
      h('p', { class: 'fine' }, 'Every par and goal is computed by an exact solver, so three stars always means a best-possible play. Works offline once loaded.'),
    ),
  );
}

export function settingsScreen(): HTMLElement {
  let settings = loadSettings();
  const apply = (next: AppSettings) => {
    settings = next;
    saveSettings(settings);
    document.documentElement.classList.toggle('reduce-motion', settings.reduceMotion);
  };

  const toggle = (label: string, detail: string, checked: boolean, onChange: (on: boolean) => void) => {
    const input = h('input', { type: 'checkbox', role: 'switch', checked, onchange: () => onChange(input.checked) });
    return h('label', { class: 'setting-row' }, h('span', { class: 'setting-text' }, h('span', {}, label), h('small', {}, detail)), input);
  };

  const status = h('p', { class: 'hint', 'aria-live': 'polite' });
  const reset = h(
    'button',
    {
      class: 'btn danger',
      onclick: () =>
        confirmDialog('Reset all progress?', 'This clears every star and best score, and shows the rules cards again. Saved sandbox graphs are kept.', 'Reset', () => {
          resetProgress();
          status.textContent = 'Progress reset.';
        }),
    },
    'Reset progress',
  );

  return h(
    'main',
    { class: 'screen settings-screen' },
    topBar('#/', 'Settings'),
    h(
      'div',
      { class: 'setting-list' },
      toggle('Haptics', 'Light vibration on taps and ticks, where supported.', settings.haptics, (on) => apply({ ...settings, haptics: on })),
      toggle(
        'Reduce motion',
        'Turn off ripples and other animations. Your system setting is always respected too.',
        settings.reduceMotion,
        (on) => apply({ ...settings, reduceMotion: on }),
      ),
    ),
    h('div', { class: 'danger-zone' }, reset, status),
  );
}

/** A small confirm card with Cancel and a destructive action. */
export function confirmDialog(title: string, text: string, action: string, onConfirm: () => void) {
  const close = () => overlay.remove();
  const overlay = h(
    'div',
    { class: 'overlay', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title },
    h(
      'div',
      { class: 'card' },
      h('h2', {}, title),
      h('p', { class: 'score' }, text),
      h(
        'div',
        { class: 'btn-row' },
        h('button', { class: 'btn', onclick: close }, 'Cancel'),
        h(
          'button',
          {
            class: 'btn danger',
            onclick: () => {
              onConfirm();
              close();
            },
          },
          action,
        ),
      ),
    ),
  );
  document.body.append(overlay);
  (overlay.querySelector('.btn') as HTMLElement).focus();
}
