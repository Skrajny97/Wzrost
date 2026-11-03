// The computer's keys (477 A): 1 to 6 open the main tabs in the order of
// the menu down the left (Postać, Walka, Obóz, Profesje, Osada,
// Społeczność; the camp joined the menu, 508 A). Not while writing, not over
// an open window, and not with Ctrl, Alt, Shift or Cmd. Escape closes a
// window on its own (the browser's dialogs).

import { desktopLayout } from './layout-mode.js';

const TABS = ['#/postac', '#/walka', '#/oboz', '#/profesje', '#/osada', '#/spolecznosc'];
const WRITING = ['INPUT', 'TEXTAREA', 'SELECT'];

document.addEventListener('keydown', (event) => {
  if (!desktopLayout() || event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const index = ['1', '2', '3', '4', '5', '6'].indexOf(event.key);
  if (index < 0) return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || WRITING.includes(target.tagName))) return;
  if (document.getElementById('view-game')?.hidden || document.querySelector('dialog[open]')) return;
  // The tab itself, not a shortcut under it with the same address.
  const link = document.querySelector(`#nav-main > a.nav-item[href="${TABS[index]}"]`);
  if (!link) return;
  event.preventDefault();
  link.click();
});
