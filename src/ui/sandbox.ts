// Sandbox screen: build a graph, pick a mode, solve it (in a Web Worker), play it.

import type { Level, ModeId } from '../core/level';
import {
  GENERATORS,
  MODE_IDS,
  addEdge,
  addNode,
  deleteEdge,
  deleteNode,
  docToLevel,
  emptyDoc,
  generate,
  markMeaning,
  markNode,
  moveNode,
  parseImport,
  playProblem,
  replaceGraph,
  serialize,
  type SandboxDoc,
  type SandboxSettings,
  type SolveResult,
} from '../core/sandbox';
import { graphStats } from '../core/stats';
import { h, icon } from './dom';
import { GraphEditor, type Tool } from './editor';
import { gameScreen } from './game';
import { getMode, type ModeInfo } from './modes';
import { showRules, topBar } from './screens';
import { Cancelled, SolverClient } from './solverClient';
import { deleteSavedGraph, hasSeenRules, loadSandboxCurrent, saveGraph, saveSandboxCurrent, savedGraphs } from './storage';

/** The level waiting to be played at #/sandbox/play (set by the Play button). */
let pendingPlay: Level | null = null;

/** Which settings each mode uses, with labels and limits. */
const MODE_SETTINGS: Partial<Record<ModeId, { key: keyof SandboxSettings; label: string; min: number; max: number }[]>> = {
  containment: [{ key: 'k', label: 'Shields', min: 1, max: 5 }],
  rival: [{ key: 'budget', label: 'Taps', min: 1, max: 6 }],
  origin: [{ key: 'ticks', label: 'Ticks', min: 1, max: 8 }],
  wiring: [
    { key: 'ticks', label: 'Ticks', min: 1, max: 8 },
    { key: 'budget', label: 'Links', min: 1, max: 12 },
  ],
};

const MARK_STYLE: Record<ModeId, string> = { spread: '', threshold: '', containment: 'fire', rival: 'blue', origin: 'source', wiring: 'seed' };

export function sandboxScreen(): { el: HTMLElement; destroy: () => void } {
  let doc: SandboxDoc = loadSandboxCurrent() ?? emptyDoc();
  let history: SandboxDoc[] = [];
  let tool: Tool = 'draw';
  let solve: { state: 'idle' } | { state: 'solving'; purpose: 'solve' | 'play' } | { state: 'done'; result: SolveResult } | { state: 'message'; text: string } = { state: 'idle' };
  const client = new SolverClient();

  const editor = new GraphEditor({
    addNode: (x, y) => apply(addNode(doc, x, y)),
    addEdge: (a, b) => apply(addEdge(doc, a, b)),
    addLinkedNode: (from, x, y) => {
      const withNode = addNode(doc, x, y);
      if (withNode === doc) return;
      apply(addEdge(withNode, from, withNode.graph.nodes.length - 1));
    },
    moveStart: () => history.push(doc),
    move: (i, x, y) => {
      doc = moveNode(doc, i, x, y);
      changed();
    },
    deleteNode: (i) => apply(deleteNode(doc, i)),
    deleteEdge: (i) => apply(deleteEdge(doc, i)),
    mark: (i) => apply(markNode(doc, i)),
  });

  // ----- Controls -----
  const toolButtons = new Map<Tool, HTMLButtonElement>();
  const toolBtn = (t: Tool, label: string) => {
    const b = h('button', {
      class: 'seg',
      onclick: () => {
        tool = t;
        editor.tool = t;
        update();
      },
    }, label);
    toolButtons.set(t, b);
    return b;
  };
  const undoBtn = h('button', { class: 'icon-btn', 'aria-label': 'Undo', onclick: undo }, icon('undo'));
  const tools = h('div', { class: 'toolbar' }, h('div', { class: 'segmented' }, toolBtn('draw', 'Draw'), toolBtn('move', 'Move'), toolBtn('erase', 'Erase'), toolBtn('mark', 'Mark')), undoBtn);
  const toolHint = h('p', { class: 'hint tool-hint' });
  const statsEl = h('p', { class: 'graph-stats' });

  const modeSelect = h('select', { class: 'select', 'aria-label': 'Mode', onchange: () => setMode(modeSelect.value as ModeId) });
  for (const id of MODE_IDS) modeSelect.append(h('option', { value: id }, getMode(id)!.title));
  const settingsEl = h('div', { class: 'settings' });
  const modeRow = h('div', { class: 'mode-row' }, modeSelect, settingsEl);

  const solveLine = h('div', { class: 'solve-line' });
  const actions = h(
    'div',
    { class: 'btn-row sandbox-actions' },
    h('button', { class: 'btn', onclick: openGenerate }, 'Generate'),
    h('button', { class: 'btn', onclick: () => runSolver('solve') }, 'Solve'),
    h('button', { class: 'btn primary', onclick: () => runSolver('play') }, 'Play'),
  );

  const fileBtn = h('button', { class: 'icon-btn', 'aria-label': 'Save, open, import, export', onclick: openFile }, icon('more'));
  const el = h(
    'main',
    { class: 'screen sandbox' },
    topBar('#/', 'Sandbox', fileBtn),
    tools,
    toolHint,
    h('div', { class: 'board-wrap' }, editor.el),
    statsEl,
    modeRow,
    solveLine,
    actions,
  );

  // ----- State changes -----
  function apply(next: SandboxDoc) {
    if (next === doc) return;
    history.push(doc);
    if (history.length > 200) history.shift();
    doc = next;
    changed();
  }

  /** Any edit invalidates a previous solve and is saved right away. */
  function changed() {
    if (solve.state === 'solving') client.cancel();
    solve = { state: 'idle' };
    saveSandboxCurrent(doc);
    update();
  }

  function undo() {
    const prev = history.pop();
    if (!prev) return;
    doc = prev;
    changed();
  }

  function setMode(mode: ModeId) {
    const marks = markMeaning(mode)?.single ? doc.marks.slice(0, 1) : doc.marks;
    apply({ ...doc, mode, marks });
    if (!markMeaning(mode) && tool === 'mark') {
      tool = 'draw';
      editor.tool = 'draw';
    }
    update();
  }

  function setSetting(key: keyof SandboxSettings, value: number | boolean) {
    apply({ ...doc, settings: { ...doc.settings, [key]: value } });
  }

  // ----- Solving and playing (in the worker) -----
  async function runSolver(purpose: 'solve' | 'play') {
    const problem = playProblem(doc);
    if (problem) {
      solve = { state: 'message', text: problem };
      update();
      return;
    }
    solve = { state: 'solving', purpose };
    update();
    let result: SolveResult;
    try {
      result = await client.solve(doc);
    } catch (err) {
      solve = { state: 'message', text: err instanceof Cancelled ? 'Cancelled.' : `Solver error: ${(err as Error).message}` };
      update();
      return;
    }
    if (purpose === 'solve') {
      solve = { state: 'done', result };
      update();
      return;
    }
    // Play: use the optimum as par/goal; if it couldn't be solved, play without one.
    if (doc.mode === 'wiring' && result.ok && result.target! > doc.settings.budget) {
      solve = { state: 'message', text: `This needs at least ${result.target} new links: raise Links to play.` };
      update();
      return;
    }
    pendingPlay = docToLevel(doc, result.ok ? result.target : NaN);
    location.hash = '#/sandbox/play';
  }

  // ----- Rendering -----
  function update() {
    const meaning = markMeaning(doc.mode);
    const result = solve.state === 'done' ? solve.result : null;
    editor.render({
      graph: doc.graph,
      marks: doc.marks,
      markStyle: MARK_STYLE[doc.mode],
      showThresholds: doc.mode === 'threshold',
      hintNodes: result?.nodes ?? [],
      hintEdges: result?.edges ?? [],
      hintLabels: result?.labels ?? {},
    });

    for (const [t, b] of toolButtons) b.classList.toggle('active', t === tool);
    const markBtn = toolButtons.get('mark')!;
    markBtn.hidden = !meaning;
    markBtn.textContent = meaning?.tool ?? 'Mark';
    undoBtn.disabled = history.length === 0;
    toolHint.textContent = {
      draw: doc.graph.nodes.length ? 'Tap empty space to add a node. Drag from a node to link it.' : 'Tap to add nodes, or use Generate.',
      move: 'Drag nodes to move them.',
      erase: 'Tap a node or a link to delete it.',
      mark: meaning?.hint ?? '',
    }[tool];

    const st = graphStats(doc.graph);
    const degrees = st.degrees.length > 16 ? `${st.degrees.slice(0, 16).join(' ')} …` : st.degrees.join(' ');
    const summary =
      st.nodes === 0
        ? 'Empty graph'
        : `${st.nodes} node${st.nodes === 1 ? '' : 's'} · ${st.edges} edge${st.edges === 1 ? '' : 's'} · ` +
          (st.connected ? `connected · diameter ${st.diameter}` : `${st.components} components · diameter ∞`);
    statsEl.replaceChildren(
      h('span', {}, summary),
      ...(st.nodes ? [h('span', { class: 'degrees' }, `Degrees: ${degrees}`)] : []),
    );

    modeSelect.value = doc.mode;
    settingsEl.replaceChildren(
      ...(MODE_SETTINGS[doc.mode] ?? []).map(({ key, label, min, max }) =>
        h(
          'label',
          { class: 'setting' },
          label,
          h('input', {
            type: 'number',
            inputmode: 'numeric',
            min,
            max,
            value: doc.settings[key] as number,
            onchange: (e) => {
              const v = Math.round(Number((e.target as HTMLInputElement).value));
              setSetting(key, Math.min(max, Math.max(min, Number.isFinite(v) ? v : min)));
            },
          }),
        ),
      ),
      ...(doc.mode === 'origin'
        ? [
            h(
              'label',
              { class: 'setting check' },
              h('input', { type: 'checkbox', checked: doc.settings.timed, onchange: (e) => setSetting('timed', (e.target as HTMLInputElement).checked) }),
              'Timed',
            ),
          ]
        : []),
    );

    if (solve.state === 'solving') {
      solveLine.replaceChildren(
        h('span', { class: 'spinner', 'aria-hidden': 'true' }),
        h('span', {}, solve.purpose === 'play' ? 'Working out the par…' : 'Solving…'),
        h('button', { class: 'btn small', onclick: () => client.cancel() }, 'Cancel'),
      );
    } else if (solve.state === 'done') {
      solveLine.replaceChildren(h('span', { class: solve.result.ok ? '' : 'warn' }, solve.result.summary));
    } else if (solve.state === 'message') {
      solveLine.replaceChildren(h('span', { class: 'warn' }, solve.text));
    } else {
      solveLine.replaceChildren();
    }
  }

  // ----- Dialogs -----
  let genChoice = GENERATORS[0].id;
  const genValues: Record<string, Record<string, number>> = Object.fromEntries(
    GENERATORS.map((g) => [g.id, Object.fromEntries(g.params.map((q) => [q.key, q.value]))]),
  );

  function openGenerate() {
    const body = h('div', { class: 'dialog-body' });
    const render = () => {
      const spec = GENERATORS.find((g) => g.id === genChoice)!;
      const select = h('select', {
        class: 'select',
        'aria-label': 'Graph family',
        onchange: () => {
          genChoice = select.value;
          render();
        },
      });
      for (const g of GENERATORS) select.append(h('option', { value: g.id, selected: g.id === genChoice }, g.name));
      const inputs = spec.params.map((q) =>
        h(
          'label',
          { class: 'setting' },
          q.label,
          h('input', {
            type: 'number',
            min: q.min,
            max: q.max,
            step: q.step ?? 1,
            value: genValues[spec.id][q.key],
            onchange: (e) => {
              const v = Number((e.target as HTMLInputElement).value);
              genValues[spec.id][q.key] = Math.min(q.max, Math.max(q.min, Number.isFinite(v) ? v : q.value));
            },
          }),
        ),
      );
      body.replaceChildren(
        select,
        h('div', { class: 'settings' }, ...inputs),
        h(
          'div',
          { class: 'btn-row' },
          h('button', { class: 'btn', onclick: close }, 'Cancel'),
          h(
            'button',
            {
              class: 'btn primary',
              onclick: () => {
                // Read values straight from the inputs too, in case "change" hasn't fired yet.
                inputs.forEach((label, i) => {
                  const q = spec.params[i];
                  const v = Number(label.querySelector('input')!.value);
                  genValues[spec.id][q.key] = Math.min(q.max, Math.max(q.min, Number.isFinite(v) ? v : q.value));
                });
                apply(replaceGraph(doc, generate(spec, genValues[spec.id])));
                close();
              },
            },
            'Generate',
          ),
        ),
      );
    };
    const close = openDialog('Generate a graph', body);
    render();
  }

  function openFile() {
    const body = h('div', { class: 'dialog-body' });
    const close = openDialog('Your graphs', body);
    const showMain = () => {
      const name = h('input', { class: 'text-input', type: 'text', placeholder: 'Name', value: `Graph ${savedGraphs().length + 1}`, 'aria-label': 'Name' });
      const list = savedGraphs();
      body.replaceChildren(
        h(
          'div',
          { class: 'save-row' },
          name,
          h(
            'button',
            {
              class: 'btn',
              onclick: () => {
                const n = name.value.trim() || 'Untitled';
                saveGraph(n, doc);
                showMain();
              },
            },
            'Save',
          ),
        ),
        list.length
          ? h(
              'ul',
              { class: 'saved-list' },
              ...list.map((g) =>
                h(
                  'li',
                  {},
                  h('span', { class: 'saved-name' }, g.name, h('small', {}, `${g.doc.graph.nodes.length} nodes · ${getMode(g.doc.mode)?.title ?? ''}`)),
                  h('button', {
                    class: 'btn small',
                    onclick: () => {
                      apply(g.doc);
                      close();
                    },
                  }, 'Open'),
                  h('button', {
                    class: 'icon-btn',
                    'aria-label': `Delete ${g.name}`,
                    onclick: () => {
                      deleteSavedGraph(g.name);
                      showMain();
                    },
                  }, icon('trash')),
                ),
              ),
            )
          : h('p', { class: 'hint' }, 'No saved graphs yet.'),
        h(
          'div',
          { class: 'btn-row' },
          h('button', { class: 'btn', onclick: showExport }, 'Export'),
          h('button', { class: 'btn', onclick: showImport }, 'Import'),
          h('button', {
            class: 'btn',
            onclick: () => {
              apply({ ...emptyDoc(), mode: doc.mode, settings: doc.settings });
              close();
            },
          }, 'New'),
        ),
      );
    };
    const showExport = () => {
      const text = h('textarea', { class: 'json', readonly: true, rows: 6, 'aria-label': 'Graph JSON' });
      text.value = serialize(doc);
      const status = h('p', { class: 'hint' }, 'Copy this JSON to share or back up your graph.');
      body.replaceChildren(
        text,
        status,
        h(
          'div',
          { class: 'btn-row' },
          h('button', { class: 'btn', onclick: showMain }, 'Back'),
          h(
            'button',
            {
              class: 'btn primary',
              onclick: async () => {
                try {
                  await navigator.clipboard.writeText(text.value);
                  status.textContent = 'Copied to the clipboard.';
                } catch {
                  text.select();
                  status.textContent = 'Couldn’t copy automatically: the text is selected, copy it by hand.';
                }
              },
            },
            'Copy',
          ),
        ),
      );
      text.select();
    };
    const showImport = () => {
      const text = h('textarea', { class: 'json', rows: 6, placeholder: 'Paste graph JSON here', 'aria-label': 'Graph JSON to import' });
      const status = h('p', { class: 'hint' }, 'Paste JSON exported from the sandbox, a level, or { "nodes": [...], "edges": [...] }.');
      body.replaceChildren(
        text,
        status,
        h(
          'div',
          { class: 'btn-row' },
          h('button', { class: 'btn', onclick: showMain }, 'Back'),
          h(
            'button',
            {
              class: 'btn primary',
              onclick: () => {
                try {
                  apply(parseImport(text.value));
                  close();
                } catch (err) {
                  status.textContent = (err as Error).message;
                  status.classList.add('warn');
                }
              },
            },
            'Import',
          ),
        ),
      );
      text.focus();
    };
    showMain();
  }

  // Desktop shortcut: Ctrl/Cmd+Z undoes edits.
  const onKey = (e: KeyboardEvent) => {
    if (document.querySelector('.overlay')) return;
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      e.preventDefault();
      undo();
    }
  };
  window.addEventListener('keydown', onKey);

  update();
  return {
    el,
    destroy: () => {
      client.destroy();
      editor.destroy();
      window.removeEventListener('keydown', onKey);
    },
  };
}

/** A simple modal card. Returns a function that closes it. */
function openDialog(title: string, body: HTMLElement): () => void {
  const close = () => {
    overlay.remove();
    window.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
  const overlay = h(
    'div',
    { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'card dialog' }, h('h2', {}, title), body),
  );
  overlay.addEventListener('pointerdown', (e) => e.target === overlay && close());
  window.addEventListener('keydown', onKey);
  document.body.append(overlay);
  return close;
}

/** #/sandbox/play: the shared game screen on the sandbox graph. */
export function sandboxPlayScreen(): { el: HTMLElement; destroy: () => void } | null {
  if (!pendingPlay) return null;
  const base = getMode(pendingPlay.mode)!;
  const mode: ModeInfo = { ...base, levels: [pendingPlay], backHref: '#/sandbox', sandbox: true };
  // First time playing this mode at all: show its rules card once the screen is up.
  if (!hasSeenRules(base.id)) setTimeout(() => showRules(base), 0);
  return gameScreen(mode, 0);
}
