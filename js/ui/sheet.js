import { $, withFocusRestore } from './dom.js?v=__BUILD__';

let dialog;
let body;
let current = null;

export function setupSheet() {
  dialog = $('sheet');
  body = $('sheet-body');

  $('sheet-close').addEventListener('click', closeSheet);
  // Clic sur le fond (la boîte de dialogue elle-même): fermeture
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeSheet();
  });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('sheet-open');
    dialog.style.transform = '';
    const done = current;
    current = null;
    done?.onClose?.();
    // Le déclencheur a pu être reconstruit pendant que la feuille était ouverte: on le retrouve par sa clé
    const opener = done?.opener?.isConnected ? done.opener : (done?.openerKey ? document.querySelector(`[data-fk="${CSS.escape(done.openerKey)}"]`) : null);
    opener?.focus({ preventScroll: true });
  });

  // Geste de glissement vers le bas pour fermer (la croix et la touche Échap restent disponibles)
  let startY = null;
  const grips = [$('sheet-handle'), dialog.querySelector('.sheet-head')];
  for (const el of grips) {
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      startY = e.clientY;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (startY == null) return;
      const dy = Math.max(0, e.clientY - startY);
      dialog.style.transform = `translateY(${dy}px)`;
    });
    const end = (e) => {
      if (startY == null) return;
      const dy = e.clientY - startY;
      startY = null;
      dialog.style.transform = '';
      if (dy > 110) closeSheet();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', () => {
      startY = null;
      dialog.style.transform = '';
    });
  }
}

export function openSheet({ title, render, onClose, kind = 'sheet', opener = document.activeElement }) {
  const keepOpener = dialog.open && current ? current.opener : opener;
  const openerKey = dialog.open && current ? current.openerKey : opener?.dataset?.fk;
  current = { title, render, onClose, kind, opener: keepOpener, openerKey };
  $('sheet-title').textContent = title;
  body.replaceChildren();
  render(body);
  body.scrollTop = 0;
  if (!dialog.open) {
    document.body.classList.add('sheet-open');
    dialog.showModal();
  }
}

export function refreshSheet() {
  if (!current || !dialog.open) return;
  withFocusRestore(() => {
    const top = body.scrollTop;
    body.replaceChildren();
    current.render(body);
    body.scrollTop = top;
  });
}

export function closeSheet() {
  if (dialog?.open) dialog.close();
}

export const sheetKind = () => (dialog?.open ? current?.kind : null);
