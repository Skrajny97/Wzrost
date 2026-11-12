// Passwords (the author's 838 A, 12.11.2026; src/server/password.js):
// "Zmień hasło" in the Ustawienia, "Nie pamiętam hasła" under the login
// form, and the window for a new password that the link from the mail
// opens (/?reset=<token>, taken from the address at once).

import { request } from './api.js';
import { h } from './dom.js';
import { t } from './i18n.js';
import { playSound } from './sound.js';
import { state } from './state.js';
import { closeSheet, openSheet, toast } from './ui.js';

const MAX_PASSWORD = 128;

// A password field with "Pokaż", as on the login screen.
function passwordField(id, label, autocomplete, hint = null) {
  const input = h('input', { id, type: 'password', autocomplete, maxlength: String(MAX_PASSWORD), required: true, ...(hint && { 'aria-describedby': `${id}-hint` }) });
  const toggle = h('button', {
    type: 'button',
    class: 'password-toggle',
    'aria-controls': id,
    'aria-label': t('Pokaż hasło'),
    text: t('Pokaż'),
    onClick: () => {
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      toggle.textContent = visible ? t('Ukryj') : t('Pokaż');
      toggle.setAttribute('aria-label', visible ? t('Ukryj hasło') : t('Pokaż hasło'));
    },
  });
  return {
    input,
    element: h('div', { class: 'field' }, h('label', { for: id, text: label }), h('div', { class: 'password' }, input, toggle), hint && h('p', { class: 'field-hint', id: `${id}-hint`, text: hint })),
  };
}

// A form in a sheet: its fields, the error under them and the button,
// which shows `busy` while the answer comes.
function sheetForm(fields, { label, busy, submit }) {
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const button = h('button', { type: 'submit', class: 'button button--system', text: label });
  const form = h('form', { class: 'form password-form', novalidate: true }, fields, error, button);
  form.addEventListener('input', () => {
    error.hidden = true;
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    button.disabled = true;
    button.textContent = busy;
    try {
      await submit();
    } catch (failure) {
      error.textContent = failure.message;
      error.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  });
  return form;
}

const passwordHint = () => t('Od 8 do 128 znaków.');

// "Zmień hasło": the password now and a new one; the account's other
// devices are logged out, this one stays.
export function openChangePassword() {
  const current = passwordField('password-current', t('Obecne hasło'), 'current-password');
  const next = passwordField('password-new', t('Nowe hasło'), 'new-password', passwordHint());
  openSheet(
    h('h2', { class: 'sheet-title', text: t('Zmień hasło') }),
    h('p', { class: 'sheet-text', text: t('Po zmianie hasła inne telefony i komputery zostaną wylogowane. To urządzenie zostanie zalogowane.') }),
    sheetForm([current.element, next.element], {
      label: t('Zmień hasło'),
      busy: t('Zmieniam…'),
      submit: async () => {
        const answer = await request('POST', '/api/auth/password', { current: current.input.value, password: next.input.value });
        playSound('system');
        closeSheet();
        toast(answer.text);
      },
    }),
  );
  current.input.focus();
}

// The row in the Ustawienia, for an account with a password (one made
// with Google signs in without one).
export function passwordRow({ onOpen } = {}) {
  if (!state.user?.password) return null;
  return h(
    'div',
    { class: 'status-row status-row--password' },
    h('dt', { text: t('Hasło') }),
    h('dd', {}, h('button', { type: 'button', class: 'button button--world button--small', text: t('Zmień'), onClick: () => (onOpen ?? openChangePassword)() })),
  );
}

// "Nie pamiętam hasła": the login or the address of the account; the link
// goes to the account's confirmed address, and the answer is the same
// whatever was given.
export function openForgotPassword(prefill = '') {
  const input = h('input', {
    id: 'forgot-identifier',
    type: 'text',
    inputmode: 'email',
    autocomplete: 'username',
    autocapitalize: 'none',
    autocorrect: 'off',
    spellcheck: 'false',
    maxlength: '254',
    required: true,
    value: prefill,
  });
  const done = (text) =>
    openSheet(
      h('h2', { class: 'sheet-title', text: t('Nie pamiętam hasła') }),
      h('p', { class: 'sheet-text', text }),
      h('button', { type: 'button', class: 'button button--system', text: t('Rozumiem'), onClick: closeSheet }),
    );
  openSheet(
    h('h2', { class: 'sheet-title', text: t('Nie pamiętam hasła') }),
    h('p', { class: 'sheet-text', text: t('Podaj login albo adres e-mail konta. Link do ustawienia nowego hasła wyślemy na potwierdzony adres e-mail tego konta. Link działa przez godzinę.') }),
    sheetForm([h('div', { class: 'field' }, h('label', { for: 'forgot-identifier', text: t('Login lub e-mail') }), input)], {
      label: t('Wyślij link'),
      busy: t('Wysyłam…'),
      submit: async () => {
        const answer = await request('POST', '/api/auth/forgot', { identifier: input.value });
        playSound('system');
        done(answer.text);
      },
    }),
  );
  input.focus();
}

// The link's token, once, taken from the address so it stays in no
// history entry and goes nowhere with the page.
export function takeResetToken() {
  const params = new URLSearchParams(location.search);
  const token = params.get('reset');
  if (token === null) return null;
  params.delete('reset');
  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
  return token;
}

// The window the link opens: a new password; `onDone` gets the answer's
// words once it is set (every device of the account is logged out).
export function openResetPassword(token, onDone) {
  const next = passwordField('password-reset', t('Nowe hasło'), 'new-password', passwordHint());
  openSheet(
    h('h2', { class: 'sheet-title', text: t('Nowe hasło') }),
    h('p', { class: 'sheet-text', text: t('Ustaw nowe hasło do konta. Po zapisie wszystkie urządzenia zostaną wylogowane, a zalogujesz się już nowym hasłem.') }),
    sheetForm([next.element], {
      label: t('Ustaw hasło'),
      busy: t('Zapisuję…'),
      submit: async () => {
        const answer = await request('POST', '/api/auth/reset', { token, password: next.input.value });
        playSound('system');
        closeSheet();
        onDone(answer.text);
      },
    }),
  );
  next.input.focus();
}
