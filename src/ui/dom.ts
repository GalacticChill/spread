// Tiny helpers for building DOM and SVG elements without a framework.

type Attrs = Record<string, string | number | boolean | undefined | ((e: Event) => void)>;
type Child = Node | string | null | undefined | false;

function apply(el: Element, attrs: Attrs, children: Child[]) {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (typeof value === 'function') el.addEventListener(key.replace(/^on/, ''), value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const c of children) if (c) el.append(c);
}

/** Create an HTML element: h('button', { class: 'x', onclick: fn }, 'Label'). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  apply(el, attrs, children);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Create an SVG element. */
export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  apply(el, attrs, children);
  return el;
}

/** Inline line icons (24×24, stroked with currentColor). */
const ICONS = {
  back: 'M15 5l-7 7 7 7',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  restart: 'M4 12a8 8 0 108-8 8 8 0 00-6 2.7M4 4v5h5',
  help: 'M9.5 9a2.5 2.5 0 115 .5c0 1.5-2.5 2-2.5 3.5M12 17.5v.01',
  lock: 'M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13',
} as const;

export function icon(name: keyof typeof ICONS): SVGSVGElement {
  return s(
    'svg',
    { viewBox: '0 0 24 24', class: 'icon', 'aria-hidden': 'true' },
    s('path', { d: ICONS[name], fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
  );
}

/** A row of three stars, `earned` of them filled. */
export function starRow(earned: number, size = 16): SVGSVGElement {
  const points = '12 2.5 14.9 8.6 21.5 9.3 16.6 13.8 18 20.4 12 17 6 20.4 7.4 13.8 2.5 9.3 9.1 8.6';
  const svg = s('svg', { viewBox: '0 0 76 24', width: (size * 76) / 24, height: size, class: 'stars', role: 'img', 'aria-label': `${earned} of 3 stars` });
  for (let i = 0; i < 3; i++) {
    svg.append(s('polygon', { points, transform: `translate(${i * 26} 0)`, class: i < earned ? 'star on' : 'star' }));
  }
  return svg;
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
