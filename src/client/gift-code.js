// A gift code (data/gift-codes.json; DECISIONS.md, "Kod podarunkowy"): its
// row in the settings opens a sheet with a field for the code. A code taken
// gives its rewards at once, and the toast says what came.

import { h } from './dom.js';
import { playSound } from './sound.js';
import { call, state } from './state.js';
import { closeSheet, openSheet, toast, withButton } from './ui.js';

const texts = () => state.content.giftTexts;

export function giftCodeRow() {
  const t = texts();
  if (!t || !state.character) return null;
  return h(
    'div',
    { class: 'status-row' },
    h('dt', { text: t.title }),
    h('dd', {}, h('button', { type: 'button', class: 'button button--world button--small gift-code-open', text: t.open, onClick: openGiftCode })),
  );
}

function openGiftCode() {
  const t = texts();
  const input = h('input', {
    type: 'text',
    name: 'gift-code',
    maxlength: '40',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    enterkeyhint: 'done',
    placeholder: t.placeholder,
    'aria-label': t.title,
  });
  const redeem = h('button', { type: 'submit', class: 'button button--system gift-code-redeem', text: t.redeem });
  const take = async () => {
    const result = await call('POST', '/api/gift-code', { code: input.value });
    closeSheet();
    playSound('chest');
    toast(result.gift.text);
  };
  openSheet(
    h('h2', { class: 'sheet-title', text: t.title }),
    h('p', { class: 'sheet-text', text: t.intro }),
    h(
      'form',
      {
        class: 'field gift-code-form',
        onSubmit: (event) => {
          event.preventDefault();
          if (input.value.trim()) withButton(redeem, take);
        },
      },
      input,
      redeem,
    ),
  );
}
