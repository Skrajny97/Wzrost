// "Dołącz zrzut ekranu" in "Zgłoś błąd" (the author: "daj opcje dołączania
// screena w zgłoś błąd"): one picture from the phone's gallery, made smaller
// here before it goes, to at most 1600 px on its longer side and about
// 700 KB as a JPEG (the server takes at most 1 MB, src/server/bugs.js). Its
// preview is the <canvas> it was drawn on: the page's CSP lets no blob:
// address into an <img>. Only the author sees it (screens/author.js).

import { fill, h } from './dom.js';
import { t } from './i18n.js';
import { toast } from './ui.js';

const LONGEST = 1600;
const MOST_BYTES = 700 * 1024;
// Each try a little smaller: the quality first, then the size.
const TRIES = [
  [1, 0.8],
  [1, 0.65],
  [1, 0.5],
  [0.75, 0.5],
  [0.5, 0.5],
  [0.35, 0.5],
];
const PICK = 'Dołącz zrzut ekranu';
const CANNOT_OPEN = 'Tego pliku nie da się otworzyć jako obrazka. Wybierz zrzut ekranu.';
const TOO_BIG = 'Ten obrazek jest za duży nawet po zmniejszeniu. Wybierz inny.';

// On white: a JPEG has no transparency.
function draw(bitmap, scale) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const jpeg = (canvas, quality) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

// The picture as a JPEG small enough, with the canvas it was drawn on, or
// what is wrong with it, for the player.
async function shrinkScreenshot(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { problem: t(CANNOT_OPEN) };
  }
  try {
    const fit = Math.min(1, LONGEST / Math.max(bitmap.width, bitmap.height));
    let canvas = null;
    let drawn = 0;
    for (const [size, quality] of TRIES) {
      if (size !== drawn) {
        canvas = draw(bitmap, fit * size);
        drawn = size;
      }
      const blob = await jpeg(canvas, quality);
      if (blob && blob.size <= MOST_BYTES) return { blob, canvas };
    }
    return { problem: t(TOO_BIG) };
  } catch {
    // The browser gave up on drawing it (a phone short of memory).
    return { problem: t(CANNOT_OPEN) };
  } finally {
    bitmap.close?.();
  }
}

// The form's part: "Dołącz zrzut ekranu", then the picture with "Usuń
// zrzut". `image()` waits for a picture still being made smaller and gives
// it, or null. A browser that cannot open pictures gets no part.
export function screenshotPicker() {
  if (typeof createImageBitmap !== 'function') return { element: null, image: async () => null };
  let picked = null;
  let preparing = Promise.resolve();
  const input = h('input', {
    type: 'file',
    accept: 'image/*',
    class: 'visually-hidden',
    tabindex: '-1',
    'aria-hidden': 'true',
    onChange: () => {
      const file = input.files?.[0];
      // The same file can be picked again after "Usuń zrzut".
      input.value = '';
      if (file) preparing = prepare(file);
    },
  });
  const pick = h('button', { type: 'button', class: 'button button--world button--small', text: t(PICK), onClick: () => input.click() });
  const area = h('div', { class: 'bug-shot-area' }, pick);

  async function prepare(file) {
    pick.disabled = true;
    pick.textContent = t('Wczytywanie zrzutu…');
    const shrunk = await shrinkScreenshot(file);
    pick.disabled = false;
    pick.textContent = t(PICK);
    if (shrunk.problem) {
      toast(shrunk.problem);
      return;
    }
    picked = shrunk;
    picked.canvas.className = 'bug-shot-preview';
    picked.canvas.setAttribute('role', 'img');
    picked.canvas.setAttribute('aria-label', t('Dołączony zrzut ekranu'));
    const remove = h('button', {
      type: 'button',
      class: 'button button--danger button--small',
      text: t('Usuń zrzut'),
      onClick: () => {
        picked = null;
        fill(area, pick);
        pick.focus();
      },
    });
    fill(area, picked.canvas, remove);
    remove.focus();
  }

  const element = h(
    'div',
    { class: 'bug-shot', role: 'group', 'aria-labelledby': 'bug-shot-label' },
    h('span', { class: 'field-label', id: 'bug-shot-label', text: t('Zrzut ekranu') }),
    area,
    h('p', { class: 'bug-shot-note', text: t('Nieobowiązkowy. Zobaczy go tylko autor gry.') }),
    input,
  );
  return {
    element,
    image: async () => {
      await preparing;
      return picked?.blob ?? null;
    },
  };
}
