// Powiadomienia na telefon (src/server/push.js sends them): the end of an
// exploration, of a build, and a full store. The switch in the settings asks
// the phone for permission, subscribes the game's service worker (sw.js) to
// the browser's push service and hands the subscription to the server.
// Safari on iPhone has push only for a game added to the home screen, so
// there the row says how to get it.

import { request } from './api.js';
import { h } from './dom.js';
import { onIphone, runsAsApp } from './install.js';
import { toast } from './ui.js';

const BLOCKED = 'Powiadomienia gry są zablokowane. Zezwól na nie w ustawieniach telefonu albo przeglądarki i spróbuj ponownie.';
const FAILED = 'Nie udało się włączyć powiadomień. Spróbuj ponownie za chwilę.';
// What the server says of a test notification (push.js on the server).
const TESTED = {
  sent: 'Wysłane. Powiadomienie powinno przyjść za kilka sekund. Jeśli nie przyjdzie, sprawdź w ustawieniach telefonu powiadomienia gry albo przeglądarki, w której ją otwierasz.',
  gone: 'Usługa powiadomień nie zna już tego telefonu. Włącz powiadomienia ponownie.',
  unknown: 'Serwer nie zna tego telefonu. Wyłącz powiadomienia i włącz je ponownie.',
  wait: 'Próbne powiadomienie można wysłać raz na pół minuty.',
};

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const fromBase64Url = (text) => Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (char) => char.charCodeAt(0));
const toBase64Url = (bytes) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');

// The phone's subscription, if it has one. A phone that takes the
// permission back drops its subscription too.
async function subscription() {
  if (!supported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

// A subscription made with another key of the server's no longer works.
const madeWith = (current, key) => {
  const own = current.options?.applicationServerKey;
  return !own || toBase64Url(new Uint8Array(own)) === key;
};

// The service worker, once active: it registers when the page has loaded.
// Without one (a private window in some browsers) nothing comes.
function activeWorker() {
  return Promise.race([navigator.serviceWorker.ready, new Promise((resolve) => setTimeout(() => resolve(null), 5000))]);
}

async function enable() {
  // Asked first, while the tap still counts: phones show the question only
  // right after one.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied' ? BLOCKED : 'Bez zgody telefonu powiadomienia nie przyjdą.');
  const registration = await activeWorker();
  if (!registration) throw new Error(FAILED);
  const { key } = await request('GET', '/api/push/key');
  let current = await registration.pushManager.getSubscription();
  if (current && !madeWith(current, key)) {
    await current.unsubscribe();
    current = null;
  }
  try {
    current ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(key) });
  } catch {
    throw new Error(FAILED);
  }
  await request('POST', '/api/push/subscribe', current.toJSON());
}

async function disable() {
  const current = await subscription();
  if (!current) return;
  await request('POST', '/api/push/unsubscribe', { endpoint: current.endpoint }).catch(() => {});
  await current.unsubscribe();
}

// After signing in: a phone with notifications on hands its subscription to
// the account signed in now, made anew if the server's key changed. The
// notifications already shown go away: the game is in front now.
export async function syncPush() {
  clearNotifications();
  const current = await subscription().catch(() => null);
  if (!current) return;
  try {
    const { key } = await request('GET', '/api/push/key');
    if (!madeWith(current, key)) {
      await current.unsubscribe();
      await enable();
      return;
    }
    await request('POST', '/api/push/subscribe', current.toJSON());
  } catch {
    // The next start tries again.
  }
}

// A test notification for this phone, sent by the server at once, so the
// player sees whether the whole way to the phone works. The server learns
// the phone again first, in case it has forgotten it; a phone the push
// service no longer knows is switched off here too, to be switched on anew.
async function sendTest() {
  const current = await subscription();
  if (!current) return TESTED.unknown;
  await request('POST', '/api/push/subscribe', current.toJSON());
  const { result, status } = await request('POST', '/api/push/test', { endpoint: current.endpoint });
  if (result === 'gone') await current.unsubscribe().catch(() => {});
  if (result === 'failed') return `Usługa powiadomień telefonu nie przyjęła wiadomości (kod ${status}). Spróbuj ponownie za chwilę.`;
  return TESTED[result] ?? FAILED;
}

// Before signing out or deleting the account: the phone stops getting the
// account's news.
export async function stopPush() {
  await disable().catch(() => {});
}

function clearNotifications() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker
    .getRegistration()
    .then((registration) => registration?.getNotifications?.())
    .then((shown) => {
      for (const notification of shown ?? []) notification.close();
    })
    .catch(() => {});
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') clearNotifications();
});

// A tap on a notification while the game is open: the service worker asks
// for the notification's place.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    const { type, hash } = event.data ?? {};
    if (type === 'open' && typeof hash === 'string' && hash.startsWith('#/')) location.hash = hash;
  });
}

// The settings row: the switch, with a line under it only when there are no
// notifications here or the phone blocks them, and while they are on, the
// test notification.
export function pushRow() {
  const hint = h('small', { class: 'status-hint' });
  const test = h('button', { type: 'button', class: 'link-button push-test', text: 'Wyślij próbne powiadomienie' });
  test.hidden = true;
  const row = (value) =>
    h('div', { class: 'status-row status-row--push' }, h('dt', {}, h('span', { id: 'push-label', text: 'Powiadomienia' }), hint, test), h('dd', {}, value));
  if (!supported()) {
    hint.textContent =
      onIphone() && !runsAsApp()
        ? 'Na iPhonie przychodzą do gry dodanej do ekranu początkowego. Dodaj ją przyciskiem „Zainstaluj jako aplikację” i otwórz z ikony Insight.'
        : 'Ta przeglądarka ich nie obsługuje. Otwórz grę w Chrome albo w Safari.';
    return row(h('span', { class: 'status-muted', text: 'Niedostępne' }));
  }
  const button = h('button', { type: 'button', class: 'toggle', role: 'switch', 'aria-labelledby': 'push-label', 'aria-checked': false, disabled: true, text: '…' });
  let busy = false;
  const show = async () => {
    const on = Boolean(await subscription().catch(() => null));
    button.setAttribute('aria-checked', String(on));
    button.textContent = on ? 'Włączone' : 'Wyłączone';
    button.disabled = busy;
    test.hidden = !on;
    test.disabled = busy;
    hint.textContent = !on && Notification.permission === 'denied' ? BLOCKED : '';
    hint.hidden = !hint.textContent;
  };
  test.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    test.disabled = true;
    try {
      toast(await sendTest());
    } catch (error) {
      toast(error.message || FAILED);
    } finally {
      busy = false;
      await show();
    }
  });
  button.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    const on = button.getAttribute('aria-checked') === 'true';
    try {
      if (on) {
        await disable();
        toast('Powiadomienia wyłączone.');
      } else {
        await enable();
        toast('Powiadomienia włączone. Przyjdą, gdy gra będzie w tle albo zamknięta.');
      }
    } catch (error) {
      toast(error.message || FAILED);
    } finally {
      busy = false;
      await show();
    }
  });
  hint.hidden = true;
  show();
  return row(button);
}
