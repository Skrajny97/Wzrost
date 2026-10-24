// Shared pieces of the interface: System messages, bottom sheets, a toast and
// confirmation questions.

import { $, append, clear, h, icon } from './dom.js';
import { motionOn, setMotion } from './motion.js';
import { narratorVoiceOn, playSound, setNarratorVoice } from './sound.js';

// A message from the System: the cold, ice-blue panel with the [ SYSTEM ] header.
export function systemPanel(...lines) {
  return h(
    'section',
    { class: 'system-panel', 'aria-label': 'Komunikat Systemu' },
    h('div', { class: 'system-message' }, h('p', { class: 'system-label', text: '[ SYSTEM ]' }), lines.map(systemLine)),
  );
}

const systemLine = (line) => (line instanceof Node ? line : h('p', { class: 'system-text', text: line }));

// A place the narrator can point at (narrator.js).
export function guided(element, guide) {
  element.dataset.guide = guide;
  return element;
}

export function pageHeading(title, subtitle) {
  return h(
    'div',
    { class: 'page-heading' },
    h('h1', { class: 'page-title', tabindex: '-1', text: title }),
    subtitle && h('p', { class: 'page-subtitle', text: subtitle }),
  );
}

export function lockLabel(text) {
  return h('span', { class: 'lock-label' }, icon('lock', { size: 14 }), text);
}

// Bottom sheet built on <dialog>: focus stays inside and Escape closes it.
const sheet = () => $('#sheet');

export function openSheet(...children) {
  const dialog = sheet();
  clear(dialog);
  append(dialog, [
    h(
      'div',
      { class: 'sheet-body' },
      h('button', { type: 'button', class: 'sheet-close', 'aria-label': 'Zamknij', onClick: closeSheet }, icon('close')),
      children,
    ),
  ]);
  if (!dialog.open) {
    dialog.showModal();
    playSound('open');
  }
  return dialog;
}

export function closeSheet() {
  const dialog = sheet();
  if (dialog.open) dialog.close();
}

export function initSheet() {
  const dialog = sheet();
  // A tap on the dimmed backdrop (outside the sheet body) closes it.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeSheet();
  });
  dialog.addEventListener('close', () => clear(dialog));
}

// Asks before something that cannot be undone. Resolves to true or false.
export function confirmAction({ title, text, confirmLabel, danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (value) => {
      if (answered) return;
      answered = true;
      closeSheet();
      resolve(value);
    };
    const dialog = openSheet(
      h('h2', { class: 'sheet-title', text: title }),
      h('p', { class: 'sheet-text', text }),
      h(
        'div',
        { class: 'sheet-actions' },
        h('button', { type: 'button', class: 'button button--world', onClick: () => answer(false), text: 'Anuluj' }),
        h('button', {
          type: 'button',
          class: danger ? 'button button--danger' : 'button button--system',
          onClick: () => answer(true),
          text: confirmLabel,
        }),
      ),
    );
    dialog.addEventListener('close', () => answer(false), { once: true });
  });
}

let toastTimer = null;

export function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    element.hidden = true;
  }, 4500);
}

// Runs an action from a button: disables it meanwhile and shows errors as a toast.
export async function withButton(button, action) {
  if (button.disabled) return;
  button.disabled = true;
  try {
    await action();
  } catch (error) {
    toast(error.message);
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}

export function meter({ label, value, max, kind }) {
  const fill = h('div', { class: 'meter-fill' });
  const text = h('span', { class: 'meter-value' });
  const element = h(
    'div',
    { class: `meter meter--${kind}` },
    h('div', { class: 'meter-label' }, h('span', { text: label }), text),
    h('div', { class: 'meter-track' }, fill),
  );
  // Long numbers (XP later on) are shown as a percentage, so the bar stays readable.
  const set = (current, total) => {
    const share = total > 0 ? Math.max(0, Math.min(1, current / total)) : 0;
    const exact = `${current} / ${total}`;
    text.textContent = exact.length > 15 ? `${Math.floor(share * 100)}%` : exact;
    element.title = exact;
    fill.style.width = `${share * 100}%`;
  };
  set(value, max);
  return { element, set };
}

// "Głos narratora": the switch on the creation screen and in the settings.
export const voiceSwitch = (labelId) => switchButton(labelId, narratorVoiceOn, setNarratorVoice, ['Włączony', 'Wyłączony']);

// "Animacje" in the settings (motion.js).
export const motionSwitch = (labelId) => switchButton(labelId, motionOn, setMotion, ['Włączone', 'Wyłączone']);

function switchButton(labelId, read, write, [onText, offText]) {
  const button = h('button', { type: 'button', class: 'toggle', role: 'switch', 'aria-labelledby': labelId });
  const show = () => {
    button.setAttribute('aria-checked', String(read()));
    button.textContent = read() ? onText : offText;
  };
  button.addEventListener('click', () => {
    write(!read());
    show();
  });
  show();
  return button;
}
