// "Zainstaluj jako aplikację". Chrome, Edge and Samsung Internet on Android
// offer their own install dialog, which the button opens. Safari on iPhone
// has none, so there (and wherever the dialog is not ready yet) the button
// shows how to add the game to the home screen by hand. Once the game runs
// as an installed app, the button is gone.

import { h, icon } from './dom.js';
import { openSheet, toast } from './ui.js';

let prompt = null; // the browser's install dialog, kept until the button asks for it

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  prompt = event;
});

window.addEventListener('appinstalled', () => {
  prompt = null;
  for (const element of document.querySelectorAll('.install-block, .install-button')) element.remove();
  toast('Zainstalowano. Grę otworzysz ikoną Insight na ekranie głównym.');
});

export function runsAsApp() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    navigator.standalone === true
  );
}

export const onIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const inAppBrowser = () => /FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\/|TikTok|Snapchat/i.test(navigator.userAgent);

// The button, or null when the game already runs as an app.
export function installButton() {
  if (runsAsApp()) return null;
  return h(
    'button',
    { type: 'button', class: 'button button--world install-button', onClick: install },
    icon('install', { size: 22 }),
    'Zainstaluj jako aplikację',
  );
}

// The button with a line on what it gives, for the start screen.
export function installBlock() {
  const button = installButton();
  return (
    button &&
    h('div', { class: 'install-block' }, button, h('p', { class: 'install-hint', text: 'Gra otworzy się z ikony na ekranie głównym, na pełnym ekranie.' }))
  );
}

async function install() {
  if (!prompt) {
    showGuide();
    return;
  }
  const dialog = prompt;
  prompt = null; // the browser's dialog opens only once
  try {
    await dialog.prompt();
    const { outcome } = await dialog.userChoice;
    if (outcome === 'accepted') toast('Instalacja rozpoczęta. Ikona Insight pojawi się na ekranie głównym.');
  } catch {
    showGuide();
  }
}

function showGuide() {
  const steps = onIphone()
    ? [
        // In the newer Safari "Udostępnij" sits in the page menu: the little
        // lines by the address (a tester looked for "…" in vain).
        'Otwórz grę w Safari i stuknij „Udostępnij”: kwadrat ze strzałką w górę. Jeśli go nie widać, najpierw stuknij kreseczki obok adresu strony (czasem są to trzy kropki „…”).',
        'Przewiń listę i wybierz „Do ekranu początkowego” albo „Dodaj do ekranu początkowego”.',
        'Stuknij „Dodaj”. Na ekranie pojawi się ikona Insight.',
      ]
    : [
        'Otwórz menu przeglądarki: trzy kropki ⋮ w rogu ekranu, a w Samsung Internet trzy kreski ≡ na dole.',
        'Wybierz „Zainstaluj aplikację” albo „Dodaj do ekranu głównego”.',
        'Potwierdź. Na ekranie pojawi się ikona Insight.',
      ];
  openSheet(
    h('h2', { class: 'sheet-title', text: 'Zainstaluj grę' }),
    h('p', { class: 'sheet-text', text: 'Gra otworzy się z ikony na ekranie głównym, na pełnym ekranie, bez paska przeglądarki.' }),
    inAppBrowser() &&
      h('p', { class: 'sheet-text install-warning', text: 'Gra jest otwarta w innej aplikacji. Najpierw wybierz w jej menu „Otwórz w przeglądarce”.' }),
    h(
      'ol',
      { class: 'install-steps' },
      steps.map((step) => h('li', { text: step })),
    ),
    h('p', { class: 'sheet-text install-note', text: 'Jeśli gra jest już zainstalowana, otwórz ją ikoną Insight na ekranie głównym.' }),
  );
}
