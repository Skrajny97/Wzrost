// The computer's keys (477 A): 1 to 5 open the main tabs, as the menu down
// the left does (Postać, Walka, Profesje, Osada, Społeczność). Not while
// writing, not over an open window, and not with Ctrl, Alt, Shift or Cmd.
// Escape closes a window on its own (the browser's dialogs).

import { desktopLayout } from './layout-mode.js';

const TABS = ['#/postac', '#/walka', '#/profesje', '#/osada', '#/spolecznosc'];
const WRITING = ['INPUT', 'TEXTAREA', 'SELECT'];

document.addEventListener('keydown', (event) => {
  if (!desktopLayout() || event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const index = ['1', '2', '3', '4', '5'].indexOf(event.key);
  if (index < 0) return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || WRITING.includes(target.tagName))) return;
  if (document.getElementById('view-game')?.hidden || document.querySelector('dialog[open]')) return;
  const link = document.querySelector(`#nav-main a.nav-item[href="${TABS[index]}"]`);
  if (!link) return;
  event.preventDefault();
  link.click();
});
