export const $ = (id) => document.getElementById(id);

const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'style') {
      // Via l'API CSS plutôt que setAttribute : la CSP interdit les attributs style écrits dans le HTML
      for (const rule of String(value).split(';')) {
        const i = rule.indexOf(':');
        if (i > 0) el.style.setProperty(rule.slice(0, i).trim(), rule.slice(i + 1).trim());
      }
    } else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'value' || key === 'checked' || key === 'disabled' || key === 'selected') el[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  el.append(...children.flat(Infinity).filter((c) => c != null && c !== false));
  return el;
}

export function icon(name, cls = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', `icon${cls ? ` ${cls}` : ''}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

export const today = () => new Date().toLocaleDateString('en-CA');
export { formatDuration as hours } from '../duration.js?v=__BUILD__';
export const formatShort = (day) => day.split('-').reverse().join('/');
export const formatDay = (day) =>
  new Date(`${day}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

// Reconstruit une zone du DOM sans faire perdre le focus clavier à l'élément actif (repéré par data-fk).
export function withFocusRestore(render) {
  const key = document.activeElement?.dataset?.fk;
  render();
  if (key) document.querySelector(`[data-fk="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
}
