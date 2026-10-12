// Entry point: hash router between screens. Hash routes (#/spread/3) work on
// GitHub Pages and offline without any server-side rewrites.

import './style.css';
import { gameScreen } from './ui/game';
import { aboutScreen, settingsScreen } from './ui/info';
import { getMode } from './ui/modes';
import { homeScreen, levelSelectScreen, showRules } from './ui/screens';
import { sandboxPlayScreen, sandboxScreen } from './ui/sandbox';
import { hasSeenRules, loadSettings } from './ui/storage';

const app = document.getElementById('app')!;
let cleanup: (() => void) | undefined;

function route() {
  cleanup?.();
  cleanup = undefined;
  document.querySelectorAll('.overlay').forEach((o) => o.remove());

  const [modeId, levelNum] = location.hash.replace(/^#\/?/, '').split('/');
  const mode = modeId ? getMode(modeId) : undefined;
  let screen: HTMLElement;

  if (modeId === 'about' || modeId === 'settings') {
    app.replaceChildren(modeId === 'about' ? aboutScreen() : settingsScreen());
    document.title = `${modeId === 'about' ? 'About' : 'Settings'} · Spread`;
    window.scrollTo(0, 0);
    return;
  }

  if (modeId === 'sandbox') {
    document.title = 'Sandbox · Spread';
    const view = levelNum === 'play' ? sandboxPlayScreen() : sandboxScreen();
    // Nothing to play (e.g. after a reload): back to the editor.
    if (!view) {
      location.replace('#/sandbox');
      return;
    }
    app.replaceChildren(view.el);
    cleanup = view.destroy;
    window.scrollTo(0, 0);
    return;
  }

  if (!mode) {
    screen = homeScreen();
  } else if (!levelNum) {
    screen = levelSelectScreen(mode);
  } else {
    const index = Number(levelNum) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= mode.levels.length) {
      location.replace(`#/${mode.id}`);
      return;
    }
    const game = gameScreen(mode, index);
    screen = game.el;
    cleanup = game.destroy;
  }

  document.title = mode ? (levelNum ? `${mode.title} ${levelNum} · Spread` : `${mode.title} · Spread`) : 'Spread';
  app.replaceChildren(screen);
  window.scrollTo(0, 0);
  // First time a mode is opened, show its rules card.
  if (mode && !hasSeenRules(mode.id)) showRules(mode);
}

// The "Reduce motion" setting works through a class on <html> (see style.css and dom.ts).
document.documentElement.classList.toggle('reduce-motion', loadSettings().reduceMotion);

window.addEventListener('hashchange', route);
route();
