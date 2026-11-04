// Shared pieces of the interface: System messages, bottom sheets, a toast and
// confirmation questions.

import { $, append, clear, h, icon } from './dom.js';
import { motionOn, setMotion } from './motion.js';
import { narratorVoiceOn, playSound, setNarratorVoice } from './sound.js';
import { state } from './state.js';

// A message from the System: the cold, ice-blue panel with the [ SYSTEM ] header.
export function systemPanel(...lines) {
  return h(
    'section',
    { class: 'system-panel', 'aria-label': 'Komunikat Systemu' },
    h('div', { class: 'system-message' }, h('p', { class: 'system-label', text: '[ SYSTEM ]' }), lines.map(systemLine)),
  );
}

const systemLine = (line) => (line instanceof Node ? line : h('p', { class: 'system-text', text: line }));

// A long explanation folded (the author: 315 A): its first words in sight,
// the rest under "Jak to działa?"; `rest` may hold elements. `system` gives
// the System's look, for inside its panel.
export function howItWorks(lead, rest, { system = false } = {}) {
  const line = (part) => (part instanceof Node ? part : h('p', { class: system ? 'system-text' : 'muted', text: part }));
  return h(
    'div',
    { class: 'how' },
    lead && line(lead),
    h('details', { class: `how-more${system ? ' how-more--system' : ''}` }, h('summary', { class: 'how-toggle', text: 'Jak to działa?' }), [rest].flat().map(line)),
  );
}

// A part of a screen that folds under its title (the author, 4.11.2026: „W
// gildii [...] zeby dalo sie zwijać chociazby tablica prób i pewnie inne
// opcje”): its title with ▾ or ▴, under it `line`, a few words of what lies
// inside, and `dot` when something there waits to be done. It opens as the
// player left it last on this device (`key`), else as `open` says; `force`
// opens it whatever was left, while something in it must be done. `card`
// gives the title a card's heading (with `id` for its label).
const FOLD_KEY = 'insight-fold-';
export function foldPart({ key, title, line = null, open = true, force = false, dot = false, card = false, id = null, className = '' }, ...children) {
  let left = null;
  try {
    left = localStorage.getItem(FOLD_KEY + key);
  } catch {
    // As `open` says, then.
  }
  const fold = h('details', { class: `fold-part${className ? ` ${className}` : ''}`, open: force || (left === null ? open : left === '1') });
  const summary = h(
    'summary',
    {
      class: 'fold-part-summary',
      // Only the player's own taps are kept, not an opening forced by `force`.
      onClick: () => {
        try {
          localStorage.setItem(FOLD_KEY + key, fold.open ? '0' : '1');
        } catch {
          // Kept while the page is open.
        }
      },
    },
    h(
      'span',
      { class: 'fold-part-head' },
      card ? h('h2', { class: 'card-title', id, text: title }) : h('span', { class: 'fold-part-title', id, text: title }),
      h('span', { class: 'fold-part-marker', 'aria-hidden': 'true' }),
      dot && h('span', { class: 'fold-part-dot', role: 'img', 'aria-label': 'do zrobienia' }),
    ),
    line && h('span', { class: 'fold-part-line', text: line }),
  );
  fold.append(summary, ...children.flat().filter(Boolean));
  return fold;
}

// A text's first sentence and the rest, for howItWorks.
export function splitLead(text) {
  const cut = text.indexOf('. ');
  return cut < 0 ? [text, null] : [text.slice(0, cut + 1), text.slice(cut + 2)];
}

// A System message's way to where it points (the author: 314 A), as a
// button under its words.
export const systemLink = (href, text) => h('a', { class: 'button button--system button--small system-action', href, text });

// The tag of a character's guild in square brackets beside its name, or
// nothing (the author: "koło nicka na czacie ogólnym i wszędzie powinien
// wyśiwetlać sie tez skrót nazwy Gildii [....] w kwadratowym nawiasie").
// The best guild of last week has its tag in gold (380 C), its words under
// a pointer.
export function guildTag(tag) {
  if (!tag) return null;
  const champion = tag === state.championTag;
  return h('span', { class: champion ? 'guild-tag guild-tag--champion' : 'guild-tag', title: champion ? state.content?.guildFame?.champion : null, text: `[${tag}]` });
}

// A character's name in its frame's colour, with a soft glow (the Sklep
// Systemu's "Kolor imienia jak ramka"), wherever its guild's tag goes with
// it; without a colour, as it was.
export function framedName(element, color) {
  if (color) {
    element.classList.add('name--framed');
    element.style.setProperty('--name-color', color);
  }
  return element;
}

// A place the narrator can point at (narrator.js).
export function guided(element, guide) {
  element.dataset.guide = guide;
  return element;
}

export function pageHeading(title, subtitle, { tag = null, nameColor = null } = {}) {
  return h(
    'div',
    { class: 'page-heading' },
    h('h1', { class: 'page-title', tabindex: '-1' }, nameColor ? framedName(h('span', { text: title }), nameColor) : title, tag && [' ', guildTag(tag)]),
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
  delete dialog.dataset.locked;
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

// A sheet that waits for an answer: no close button, and neither Escape nor
// a tap beside it closes it, only its own buttons.
export function openDecision(...children) {
  const dialog = openSheet(...children);
  dialog.dataset.locked = 'true';
  $('.sheet-close', dialog)?.remove();
  return dialog;
}

export function closeSheet() {
  const dialog = sheet();
  if (dialog.open) dialog.close();
}

// Calls `then` once the sheet on show closes; the close of the one before
// it, still on its way, does not count.
export function afterSheet(then) {
  const dialog = sheet();
  const closed = () => {
    if (dialog.open) return;
    dialog.removeEventListener('close', closed);
    then();
  };
  dialog.addEventListener('close', closed);
}

export function initSheet() {
  const dialog = sheet();
  // A tap on the dimmed backdrop (outside the sheet body) closes it, unless
  // the sheet waits for an answer (openDecision).
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog && !dialog.dataset.locked) closeSheet();
  });
  dialog.addEventListener('cancel', (event) => {
    if (dialog.dataset.locked) event.preventDefault();
  });
  dialog.addEventListener('close', () => {
    delete dialog.dataset.locked;
    clear(dialog);
  });
}

// Asks before something that cannot be undone. Resolves to true or false.
// With `typed`, the confirm button waits until that word is typed in, as the
// account's login before deleting the account. `cancelLabel` names the way
// back when "Anuluj" is the thing asked about.
export function confirmAction({ title, text, confirmLabel, cancelLabel = 'Anuluj', danger = false, typed = null }) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (value) => {
      if (answered) return;
      answered = true;
      closeSheet();
      resolve(value);
    };
    const confirm = h('button', {
      type: 'button',
      class: danger ? 'button button--danger' : 'button button--system',
      disabled: Boolean(typed),
      onClick: () => answer(true),
      text: confirmLabel,
    });
    const input =
      typed &&
      h('input', {
        id: 'confirm-typed',
        type: 'text',
        autocomplete: 'off',
        autocapitalize: 'none',
        autocorrect: 'off',
        spellcheck: 'false',
        onInput: (event) => {
          confirm.disabled = event.currentTarget.value.trim().toLowerCase() !== typed.toLowerCase();
        },
      });
    const dialog = openSheet(
      h('h2', { class: 'sheet-title', text: title }),
      h('p', { class: 'sheet-text', text }),
      input && h('div', { class: 'field' }, h('label', { for: 'confirm-typed', text: `Wpisz „${typed}”, żeby potwierdzić.` }), input),
      h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--world', onClick: () => answer(false), text: cancelLabel }), confirm),
    );
    dialog.addEventListener('close', () => answer(false), { once: true });
  });
}

let toastTimer = null;

// A toast shows over an open sheet too (the author: a refusal "pokazuje się
// pod okienkiem"): as a popover it sits in the top layer, and showing it
// anew puts it above a sheet opened in the meantime.
export function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  // Under the top bar's first row, over the HP and XP bars, so it hides
  // neither the levels, the gold and the buttons beside them nor the bag's
  // rows (players, through the author: "zasłaniające informacje o lvl,
  // złocie"). Without the top bar in sight it keeps to the top (styles.css).
  const row = document.querySelector('#topbar .topbar-row');
  const bottom = row?.getBoundingClientRect().bottom ?? 0;
  element.style.top = bottom > 0 ? `${Math.round(bottom + 4)}px` : '';
  element.hidden = false;
  if (element.showPopover) {
    if (element.matches(':popover-open')) element.hidePopover();
    element.showPopover();
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (element.hidePopover && element.matches(':popover-open')) element.hidePopover();
    element.hidden = true;
  }, 4500);
}

// Runs an action from a button: disables it meanwhile and shows errors as a toast.
// The skin tones as dots to choose from (data/skins.json), `current` marked.
// A tap marks another once `pick` resolves true (its id and the dot).
export function skinSwatches(current, pick) {
  const tones = state.content.skins.tones;
  const dots = tones.map((tone) =>
    h('button', {
      type: 'button',
      class: 'skin-swatch',
      role: 'radio',
      'aria-checked': String(tone.id === current),
      'aria-label': tone.name,
      title: tone.name,
      dataset: { skin: tone.id },
      onClick: async (event) => {
        const dot = event.currentTarget;
        if (dot.getAttribute('aria-checked') === 'true' || !(await pick(tone.id, dot))) return;
        for (const other of dots) other.setAttribute('aria-checked', String(other.dataset.skin === tone.id));
      },
    }),
  );
  for (const [index, dot] of dots.entries()) dot.style.backgroundColor = tones[index].swatch;
  return dots;
}

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
