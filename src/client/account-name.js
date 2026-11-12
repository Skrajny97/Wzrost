// The account's name for the chat (832 A, src/server/names.js): its row in
// the Ustawienia with the window to choose it, and the chat's one hint of
// where to set it. The chat shows it before the name of the character that
// writes, "Wędrowiec (Radomira)" (screens/community.js); it changes at most
// once in accounts.days days (data/chat.json), and the server says when.

import { h } from './dom.js';
import { language } from './i18n.js';
import { call, serverNow, state } from './state.js';
import { closeSheet, openSheet, toast, withButton } from './ui.js';

const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
const words = () => state.content.chat.accounts;

// "12.12.2026, 01:13" in Polish, "12/12/2026, 01:13" in English, as the
// server writes the day of the next change.
const dateText = (at) =>
  new Intl.DateTimeFormat(language() === 'en' ? 'en-GB' : 'pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(at));

// Whether the name may change now (the first choice always may).
const changeable = () => !(state.user.accountNameFrom > serverNow());

// The new name as the server answered it, kept on the account.
function chosen(answer) {
  state.user = { ...state.user, ...answer, accountNameHint: false };
}

// The window: what the name is for, the field and "Zapisz", or, before the
// next change may come, its day.
export function openAccountName({ onDone = null } = {}) {
  const texts = words();
  const example = filled(texts.lead, { example: state.user.accountName ?? texts.example, name: state.character?.name ?? '' });
  const head = [h('h2', { class: 'sheet-title', text: texts.title }), h('p', { class: 'sheet-text', text: example })];
  if (!changeable()) {
    openSheet(...head, h('p', { class: 'sheet-text', text: filled(texts.next, { date: dateText(state.user.accountNameFrom) }) }));
    return;
  }
  const input = h('input', { id: 'account-name', type: 'text', maxlength: '20', autocomplete: 'off', spellcheck: 'false', required: true, value: state.user.accountName ?? '' });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const submit = h('button', { type: 'submit', class: 'button button--system', text: texts.button });
  openSheet(
    ...head,
    h(
      'form',
      {
        class: 'stack',
        onSubmit: (event) => {
          event.preventDefault();
          error.hidden = true;
          withButton(submit, async () => {
            try {
              const answer = await call('POST', '/api/account/name', { name: input.value });
              chosen(answer);
              closeSheet();
              toast(filled(texts.done, { name: answer.accountName }));
              onDone?.();
            } catch (failure) {
              error.textContent = failure.message;
              error.hidden = false;
            }
          });
        },
      },
      h('div', { class: 'field' }, h('label', { for: 'account-name', text: texts.label }), input),
      h('p', { class: 'account-name-rules', text: `${texts.rules} ${filled(texts.every, { days: texts.days })}` }),
      error,
      h('div', { class: 'sheet-actions' }, submit),
    ),
  );
}

// "Nazwa konta" in the Ustawienia, under "Konto": the name or "brak", and
// "Ustaw" or "Zmień" (the window says from when, before the next change).
export function accountNameRow() {
  const texts = words();
  if (!texts) return null;
  const name = state.user.accountName;
  const value = h('span', { class: name ? 'status-name' : 'status-name status-name--none', text: name ?? texts.none });
  const button = h('button', {
    type: 'button',
    class: 'button button--world button--small status-rename',
    text: name ? texts.change : texts.set,
    onClick: () =>
      openAccountName({
        onDone: () => {
          value.textContent = state.user.accountName;
          value.className = 'status-name';
          button.textContent = texts.change;
        },
      }),
  });
  return h('div', { class: 'status-row status-row--name' }, h('dt', { text: texts.title }), h('dd', {}, value, button));
}

// The chat's one hint while the account has no name (accountNameHint):
// what the name is, "Ustaw teraz" and "Rozumiem"; either puts it away for
// good. `gone` runs once it is put away, `named` once a name is chosen.
export function accountNameHint(gone, named = null) {
  const texts = words();
  if (!texts || !state.user?.accountNameHint || state.user.accountName) return null;
  const seen = async () => {
    state.user = { ...state.user, accountNameHint: false };
    gone();
    await call('POST', '/api/account/name/hint').catch(() => {});
  };
  return h(
    'section',
    { class: 'card chat-account-hint', 'aria-label': texts.title },
    h('p', { text: filled(texts.hint, { example: texts.example, name: state.character?.name ?? '' }) }),
    h(
      'div',
      { class: 'chat-account-hint-actions' },
      h('button', { type: 'button', class: 'button button--world button--small', text: texts.hintSeen, onClick: (event) => withButton(event.currentTarget, seen) }),
      h('button', {
        type: 'button',
        class: 'button button--system button--small',
        text: texts.hintSet,
        onClick: (event) =>
          withButton(event.currentTarget, async () => {
            await seen();
            openAccountName({ onDone: named });
          }),
      }),
    ),
  );
}
