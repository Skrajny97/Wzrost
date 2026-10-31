// A character whose name the filter blocks (src/engine/names.js) takes a
// new one before anything else: the window cannot be closed and comes back
// until the name is changed (the author: "wymusić zmianę nazwy przy
// kolejnym wejściu do gry z komunikatem niepomijalnym").

import { h } from './dom.js';
import { call, state } from './state.js';
import { closeSheet, openDecision, openSheet, toast, withButton } from './ui.js';

// The field for the new name and the button under it, which sends it and
// then closes the window with a word of the new name.
function nameForm(t) {
  const input = h('input', { id: 'rename-name', type: 'text', maxlength: '20', autocomplete: 'off', spellcheck: 'false', required: true });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const submit = h('button', { type: 'submit', class: 'button button--system', text: t.button });
  return h(
    'form',
    {
      class: 'stack',
      onSubmit: (event) => {
        event.preventDefault();
        error.hidden = true;
        withButton(submit, async () => {
          try {
            const { character } = await call('POST', '/api/character/name', { name: input.value });
            closeSheet();
            toast(t.done.replace('{name}', character.name));
          } catch (failure) {
            error.textContent = failure.message;
            error.hidden = false;
          }
        });
      },
    },
    h('div', { class: 'field' }, h('label', { for: 'rename-name', text: t.label }), input),
    error,
    h('div', { class: 'sheet-actions' }, submit),
  );
}

// The one change of the name the Ustawienia offer every character (the
// author: "jednorazowo, po czym opcja się blokuje").
export function openNameChange() {
  const t = state.content.chat.names;
  openSheet(h('h2', { class: 'sheet-title', text: t.change }), h('p', { class: 'sheet-text', text: t.once }), nameForm(t));
}

// The System's word after it gave the character a new name itself, once.
export function offerNameNotice() {
  const t = state.content?.chat?.names;
  const notice = state.character?.nameNotice;
  if (!t || !notice || state.character.nameBlocked || document.querySelector('dialog[open]')) return;
  const ok = h('button', {
    type: 'button',
    class: 'button button--system',
    text: t.seen,
    onClick: (event) =>
      withButton(event.currentTarget, async () => {
        await call('POST', '/api/character/name/seen');
        closeSheet();
      }),
  });
  openDecision(h('p', { class: 'system-label', text: '[ SYSTEM ]' }), h('p', { class: 'sheet-text', text: notice }), h('div', { class: 'sheet-actions' }, ok));
}

export function offerRename() {
  const t = state.content?.chat?.names;
  if (!t || !state.character?.nameBlocked || document.querySelector('dialog[open]')) return;
  openDecision(h('p', { class: 'system-label', text: '[ SYSTEM ]' }), h('p', { class: 'sheet-text rename-warning', text: t.blocked }), nameForm(t));
}
