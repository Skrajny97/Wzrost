// E-mail confirmation (src/server/email.js): the screen of a new account
// that waits for its link, the parchment that invites an older account to
// confirm for Punkty Systemu (the author: "Jeśli ktoś nie ma potwierdzonego
// maila, wyświetl Pergamin z zachętą"), and the row in the settings.

import { ApiError, request } from './api.js';
import { clear, h } from './dom.js';
import { t } from './i18n.js';
import { narratorIdle } from './narrator.js';
import { rod, roll, stopRoll } from './parchment.js';
import { playSound } from './sound.js';
import { state } from './state.js';
import { closeSheet, toast, withButton } from './ui.js';

// A new account plays once its e-mail is confirmed.
export const mustConfirm = (user) => Boolean(user?.emailRequired && !user.emailConfirmed);
// An older one plays on, and is invited.
const invited = (user) => Boolean(user && !user.emailConfirmed && !user.emailRequired);

const reward = () => state.content?.emailReward ?? 10;
const pointsText = () => t('{count} Punktów Systemu', { count: reward() });

// How a link from the mail went: the server sends the browser to
// /?email=<result>.
const EMAIL_NOTES = {
  confirmed: () => t('Adres e-mail potwierdzony. Za potwierdzenie: {points}.', { points: pointsText() }),
  already: () => t('Ten adres e-mail był już potwierdzony.'),
  expired: () => t('Ten link wygasł albo został już użyty. Wyślij nowy z gry.'),
};

// Reads the result once and removes it from the address.
export function takeEmailResult() {
  const params = new URLSearchParams(location.search);
  const result = params.get('email');
  if (result === null) return null;
  params.delete('email');
  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
  return (EMAIL_NOTES[result] ?? EMAIL_NOTES.expired)();
}

// The account as the server knows it now (the link may have been opened in
// another browser or app).
async function freshUser() {
  const { user } = await request('GET', '/api/me');
  state.user = user;
  return user;
}

// Sends a link, to a new address if one is given; returns the address.
async function sendLink(email) {
  const answer = await request('POST', '/api/auth/email', email === undefined ? {} : { email });
  state.user = { ...state.user, email: answer.email };
  playSound('system');
  return answer.email;
}

// The address field, filled with the account's e-mail when it has one.
const emailField = (id) =>
  h('input', {
    id,
    class: 'email-confirm-input',
    type: 'email',
    autocomplete: 'email',
    autocapitalize: 'none',
    spellcheck: 'false',
    maxlength: '254',
    value: state.user.email ?? '',
  });

// The screen of an account that waits for its link, in place of the game.
// `onConfirmed` opens the game; `onLogout` signs out.
export function renderConfirm(panel, { onConfirmed, onLogout, unsent = false }) {
  let checking = false;
  const text = h('p', { class: 'system-text', id: 'confirm-text' });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const showError = (message) => {
    error.textContent = message;
    error.hidden = !message;
  };
  const describe = () => {
    text.textContent = t('Ostatni krok: potwierdź adres e-mail. Na adres {email} został wysłany link, który otworzy konto. Za potwierdzenie dostaniesz {points}.', { email: state.user.email, points: pointsText() });
  };
  describe();
  if (unsent) showError(t('Nie udało się wysłać maila. Naciśnij „Wyślij link ponownie”.'));

  // Back from the mail app: the page looks whether the link was opened.
  const check = async (quiet) => {
    if (checking) return;
    checking = true;
    try {
      const user = await freshUser();
      if (!mustConfirm(user)) {
        document.removeEventListener('visibilitychange', onVisible);
        onConfirmed();
      } else if (!quiet) {
        showError(t('Adres e-mail nie jest jeszcze potwierdzony. Otwórz link z maila.'));
      }
    } catch (failure) {
      if (!quiet) showError(failure.message);
    } finally {
      checking = false;
    }
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible' && panel.isConnected && !panel.closest('[hidden]')) check(true);
  };
  document.addEventListener('visibilitychange', onVisible);

  const input = emailField('confirm-email');
  const change = h(
    'form',
    {
      class: 'form email-confirm-change',
      novalidate: true,
      hidden: true,
      onSubmit: (event) => {
        event.preventDefault();
        withButton(event.submitter ?? event.currentTarget.querySelector('button'), async () => {
          showError('');
          try {
            await sendLink(input.value);
            describe();
            change.hidden = true;
            toast(t('Link został wysłany na adres {email}.', { email: state.user.email }));
          } catch (failure) {
            showError(failure.message);
          }
        });
      },
    },
    h('div', { class: 'field' }, h('label', { for: 'confirm-email', text: t('Nowy adres e-mail') }), input),
    h('button', { type: 'submit', class: 'button button--system', text: t('Zapisz i wyślij link') }),
  );

  clear(panel);
  panel.append(
    h('div', { class: 'system-message' }, h('p', { class: 'system-label', text: '[ SYSTEM ]' }), text),
    h('p', { class: 'field-hint email-confirm-hint', text: t('Nie widzisz maila? Zajrzyj do folderu spam albo oferty. Link działa przez dobę.') }),
    error,
    h('button', { type: 'button', class: 'button button--system', text: t('Mam już potwierdzone'), onClick: (event) => withButton(event.currentTarget, () => check(false)) }),
    h('button', {
      type: 'button',
      class: 'button button--world',
      text: t('Wyślij link ponownie'),
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          showError('');
          try {
            await sendLink();
            toast(t('Link został wysłany na adres {email}.', { email: state.user.email }));
          } catch (failure) {
            showError(failure.message);
          }
        }),
    }),
    h('button', {
      type: 'button',
      class: 'button button--world',
      text: t('Zmień adres e-mail'),
      onClick: () => {
        change.hidden = !change.hidden;
        if (!change.hidden) input.focus();
      },
    }),
    change,
    h('button', {
      type: 'button',
      class: 'button button--world',
      text: t('Wyloguj się'),
      onClick: () => {
        document.removeEventListener('visibilitychange', onVisible);
        onLogout();
      },
    }),
  );
}

// The invitation: once a page load, while the account is not confirmed,
// when the narrator is done and no other dialog is open. "Później" keeps it
// away until the browser is closed.
const LATER_KEY = 'wzrost.email-later';
let invitedNow = false;
let open = null; // { dialog, sheet }

export function inviteToConfirm() {
  if (invitedNow || open || !invited(state.user) || !state.character || !narratorIdle() || document.querySelector('dialog[open]')) return;
  try {
    if (sessionStorage.getItem(LATER_KEY)) return;
  } catch {
    // Without storage it asks on every page load.
  }
  invitedNow = true;
  showInvite();
}

// The parchment itself, also from the row in the settings.
export function showInvite() {
  if (open) return;
  const dialog = h('dialog', { class: 'quests email-invite', 'aria-labelledby': 'email-invite-label' });
  const page = h('div', { class: 'narrator-page quests-page' });
  const sheet = h('div', { class: 'narrator-sheet' }, page);
  dialog.append(h('div', { class: 'narrator-scroll' }, rod(), sheet, rod()));
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeInvite(true);
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeInvite(true);
  });
  document.body.append(dialog);
  open = { dialog, sheet };
  drawAsk(page);
  dialog.showModal();
  playSound('open');
  roll(sheet, true);
}

function drawAsk(page) {
  const input = emailField('invite-email');
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  clear(page);
  page.append(
    h('p', { class: 'narrator-label quests-label', id: 'email-invite-label', text: 'System' }),
    h('p', { class: 'email-invite-text', text: t('Potwierdź adres e-mail swojego konta, a dostaniesz {points}.', { points: pointsText() }) }),
    h(
      'form',
      {
        class: 'email-invite-form',
        novalidate: true,
        onSubmit: (event) => {
          event.preventDefault();
          withButton(event.submitter ?? event.currentTarget.querySelector('button[type="submit"]'), async () => {
            error.hidden = true;
            try {
              const email = await sendLink(input.value);
              drawSent(page, email);
            } catch (failure) {
              error.textContent = failure instanceof ApiError ? failure.message : t('Nie udało się wysłać linku. Spróbuj ponownie.');
              error.hidden = false;
            }
          });
        },
      },
      h('label', { class: 'email-invite-label', for: 'invite-email', text: t('Adres e-mail') }),
      input,
      error,
      h(
        'div',
        { class: 'narrator-actions' },
        h('button', { type: 'button', class: 'narrator-skip', text: t('Później'), onClick: () => closeInvite(true) }),
        h('button', { type: 'submit', class: 'button narrator-next', text: t('Wyślij link') }),
      ),
    ),
  );
}

function drawSent(page, email) {
  clear(page);
  page.append(
    h('p', { class: 'narrator-label quests-label', id: 'email-invite-label', text: 'System' }),
    h('p', {
      class: 'email-invite-text',
      text: t('Link został wysłany na adres {email}. Otwórz go, a {points} trafi do postaci. Link działa przez dobę, a gdyby mail nie przyszedł, zajrzyj do folderu spam.', { email, points: pointsText() }),
    }),
    h('div', { class: 'narrator-actions' }, h('button', { type: 'button', class: 'button narrator-next', text: t('Zamknij'), onClick: () => closeInvite(false) })),
  );
}

// The parchment rolled up when the player leaves the game (app.js).
export const hideInvite = () => closeInvite(false);

async function closeInvite(later) {
  if (!open || open.closing) return;
  const current = open;
  current.closing = true;
  if (later) {
    try {
      sessionStorage.setItem(LATER_KEY, '1');
    } catch {
      // Without storage it asks again on the next page load.
    }
  }
  await roll(current.sheet, false);
  stopRoll(current.sheet);
  if (current.dialog.open) current.dialog.close();
  current.dialog.remove();
  open = null;
}

// The settings: the account's e-mail, and the invitation while it is not
// confirmed.
export function emailRow() {
  const { user } = state;
  return h(
    'div',
    { class: 'status-row status-row--email' },
    h('dt', { text: 'E-mail' }),
    h(
      'dd',
      {},
      user.email && h('span', { class: 'email-row-address', text: user.email }),
      user.emailConfirmed
        ? h('span', { class: 'status-ok', text: t('Potwierdzony') })
        : h('button', {
            type: 'button',
            class: 'button button--world button--small',
            text: t('Potwierdź'),
            onClick: () => {
              closeSheet();
              showInvite();
            },
          }),
    ),
  );
}
