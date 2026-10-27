import { h, icon } from './dom.js?v=__BUILD__';

// Raccourci tactile : glisser une ligne à droite (vu) ou à gauche (ignorer). Les boutons de la ligne restent la voie principale.
export const SWIPE_RATIO = 0.4; // part de la largeur à dépasser pour valider au relâchement
export const LOCK_PX = 8; // déplacement avant de décider si le geste est horizontal ou un défilement
export const EDGE_PX = 24; // marge près des bords de l'écran, réservée aux gestes du système (retour arrière)

// dx > 0 : vers la droite. `allowed` indique les sens actifs pour cette ligne. Renvoie 'right', 'left' ou null.
export function swipeAction(dx, width, allowed = {}) {
  if (!width || Math.abs(dx) / width < SWIPE_RATIO) return null;
  if (dx > 0 && allowed.right) return 'right';
  if (dx < 0 && allowed.left) return 'left';
  return null;
}

// Fond affiché derrière la ligne pendant le geste (masqué aux lecteurs d'écran : les boutons de la ligne font la même chose).
// right / left : { icon, label, run } ou null quand le sens est désactivé.
export function swipeBackground({ right, left }) {
  const side = (cls, spec) => h('span', { class: `swipe-side ${cls}` }, spec ? [icon(spec.icon), spec.label] : null);
  return h('div', { class: 'swipe-bg', 'aria-hidden': 'true' }, side('swipe-r', right), side('swipe-l', left));
}

export function attachSwipe(row, fg, bg, { right = null, left = null }) {
  if (!right && !left) return;
  const allowed = { right: Boolean(right), left: Boolean(left) };
  let start = null; // { id, x, y, locked, armed }
  let lastSwipe = 0;

  const reset = (animate) => {
    fg.classList.toggle('settle', animate);
    fg.style.transform = '';
    bg.classList.remove('right', 'left', 'armed');
  };

  fg.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || (e.button !== undefined && e.button > 0)) return;
    if (e.clientX < EDGE_PX || e.clientX > window.innerWidth - EDGE_PX) return;
    start = { id: e.pointerId, x: e.clientX, y: e.clientY, locked: false, armed: false };
    fg.classList.remove('settle');
  });

  fg.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!start.locked) {
      if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        start = null; // défilement vertical : le navigateur reprend la main
        return;
      }
      start.locked = true;
      fg.setPointerCapture(e.pointerId);
    }
    const side = dx > 0 ? 'right' : 'left';
    const live = allowed[side] ? dx : dx / 4; // sens désactivé : simple résistance
    fg.style.transform = `translateX(${live}px)`;
    bg.classList.toggle('right', dx > 0 && allowed.right);
    bg.classList.toggle('left', dx < 0 && allowed.left);
    const armed = Boolean(swipeAction(dx, row.clientWidth, allowed));
    bg.classList.toggle('armed', armed);
    if (armed && !start.armed) navigator.vibrate?.(8);
    start.armed = armed;
  });

  const finish = (e, cancelled) => {
    if (!start || e.pointerId !== start.id) return;
    const { locked } = start;
    const dx = e.clientX - start.x;
    start = null;
    if (!locked) return;
    lastSwipe = Date.now();
    const action = cancelled ? null : swipeAction(dx, row.clientWidth, allowed);
    reset(!action);
    if (action === 'right') right.run();
    else if (action === 'left') left.run();
  };
  fg.addEventListener('pointerup', (e) => finish(e, false));
  fg.addEventListener('pointercancel', (e) => finish(e, true));

  // Le doigt qui se lève au-dessus d'un bouton ne doit pas l'activer (ouverture de la fiche, case à cocher)
  fg.addEventListener('click', (e) => {
    if (Date.now() - lastSwipe < 400) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
}
