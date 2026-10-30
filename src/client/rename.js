// A character whose name the filter blocks (src/engine/names.js) takes a
// new one before anything else: the window cannot be closed and comes back
// until the name is changed (the author: "wymusić zmianę nazwy przy
// kolejnym wejściu do gry z komunikatem niepomijalnym").

import { h } from './dom.js';
import { call, state } from './state.js';
import { closeSheet, openDecision, toast, withButton } from './ui.js';

export function offerRename() {
  const t = state.content?.chat?.names;
  if (!t || !state.character?.nameBlocked || document.querySelector('dialog[open]')) return;
  const input = h('input', { id: 'rename-name', type: 'text', maxlength: '20', autocomplete: 'off', spellcheck: 'false', required: true });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const submit = h('button', { type: 'submit', class: 'button button--system', text: t.button });
  const form = h(
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
  openDecision(h('p', { class: 'system-label', text: '[ SYSTEM ]' }), h('p', { class: 'sheet-text rename-warning', text: t.blocked }), form);
}
