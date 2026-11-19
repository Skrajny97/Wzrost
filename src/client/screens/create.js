// Creating the character: a look, one of five classes and a name, and
// whether the narrator who comes next reads aloud. Each class tells how many
// characters of it the game has, so a player sees which class is rare.

import { portraitSprite } from '../art.js';
import { classArt } from '../class-art.js';
import { $, fill, h, icon } from '../dom.js';
import { countOf } from '../format.js';
import { t } from '../i18n.js';
import { CLASS_ICONS } from '../icons.js';
import { call, state } from '../state.js';
import { skinSwatches, systemPanel, toast, voiceSwitch } from '../ui.js';

const POSITION_NAMES = { front: 'przód', middle: 'środek', back: 'tył' };
const START_BADGES = { gentle: 'łagodniejszy start', hard: 'trudniejszy start' };

// What is still missing in the form, beside "Rozpocznij" (894.7 A,
// 13.11.2026): "Brakuje: wyglądu, klasy i imienia."
const MISSING_WORDS = { look: 'wyglądu', class: 'klasy', name: 'imienia' };

function missingText(missing) {
  const words = missing.map((id) => t(MISSING_WORDS[id]));
  return t('Brakuje: {what}.', { what: words.length > 1 ? `${words.slice(0, -1).join(', ')}${t(' i ')}${words.at(-1)}` : words[0] });
}

// The part of the form still to fill, in the middle of the screen and
// framed for a moment; the name's field takes the focus (the keyboard
// opens).
function showMissing(element) {
  if (!element) return;
  element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  element.classList.remove('create-missing');
  void element.offsetWidth;
  element.classList.add('create-missing');
  setTimeout(() => element.classList.remove('create-missing'), 2400);
  if (element instanceof HTMLInputElement) setTimeout(() => element.focus({ preventScroll: true }), 450);
}

const inGame = (count) => (count > 0 ? t('W grze: {count} tej klasy', { count: countOf(count, 'postać', 'postacie', 'postaci') }) : t('Nikt jeszcze nie gra tą klasą.'));

// `counts`: the game's characters of each class (GET /api/characters).
export function renderCreate(container, onCreated, counts = null) {
  let selected = null;
  let look = null;
  let skin = state.content.skins.default;
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const nameInput = h('input', {
    id: 'character-name',
    name: 'name',
    type: 'text',
    autocomplete: 'off',
    autocapitalize: 'words',
    // iPhone's keyboard would otherwise "correct" a name into another word.
    autocorrect: 'off',
    spellcheck: 'false',
    maxlength: '20',
    required: true,
    'aria-describedby': 'character-name-hint',
  });
  const submit = h('button', { type: 'submit', class: 'button button--system', text: t('Rozpocznij') });

  const cards = state.content.classes.map((cls) =>
    h(
      'button',
      {
        type: 'button',
        class: 'class-card',
        role: 'radio',
        'aria-checked': 'false',
        dataset: { classId: cls.id },
        onClick: () => select(cls.id),
      },
      h(
        'span',
        { class: 'class-card-head' },
        h('span', { class: 'class-icons' }, classIcons(cls.id)),
        h('span', { class: 'class-name', text: cls.name }),
        START_BADGES[cls.start] && h('span', { class: `badge badge--${cls.start}`, text: t(START_BADGES[cls.start]) }),
      ),
      h('span', { class: 'class-meta', text: t('{role} · pozycja: {position}', { role: cls.role, position: t(POSITION_NAMES[cls.position]) }) }),
      h('span', { class: 'class-description', text: cls.description }),
      counts && h('span', { class: 'class-count', text: inGame(counts[cls.id] ?? 0) }),
    ),
  );

  // The class cards show the figure in the chosen look, and both looks side
  // by side before the choice; the vector bust only without portraits.
  function classIcons(classId) {
    const looks = look ? [look] : state.content.appearances.map((appearance) => appearance.id);
    const busts = looks.map((id) => portraitSprite(classId, id, { bust: true, skin })).filter(Boolean);
    const art = busts.length > 0 ? busts : [classArt(classId) ?? icon(CLASS_ICONS[classId] ?? 'person', { size: 26 })];
    return art.map((picture) => h('span', { class: 'class-icon' }, picture));
  }

  function select(classId) {
    selected = classId;
    for (const card of cards) card.setAttribute('aria-checked', String(card.dataset.classId === classId));
    error.hidden = true;
    updateBar();
  }

  const looks = state.content.appearances.map((appearance) =>
    h('button', {
      type: 'button',
      class: 'segmented-option',
      'aria-pressed': 'false',
      dataset: { look: appearance.id },
      text: appearance.name,
      onClick: () => {
        look = appearance.id;
        for (const button of looks) button.setAttribute('aria-pressed', String(button.dataset.look === look));
        for (const card of cards) fill($('.class-icons', card), classIcons(card.dataset.classId));
        error.hidden = true;
        updateBar();
      },
    }),
  );

  // The skin tone: a dot of each tone; the class cards show the busts in it.
  const tones = skinSwatches(skin, (id) => {
    skin = id;
    for (const card of cards) fill($('.class-icons', card), classIcons(card.dataset.classId));
    return true;
  });

  // "Rozpocznij" held at the bottom of the screen (894.7 A, 13.11.2026),
  // beside what is still missing (a tap goes there) or what was chosen.
  const status = h('button', { type: 'button', class: 'create-status' });
  const lookField = h('div', { class: 'segmented', role: 'group', 'aria-labelledby': 'look-label' }, looks);
  const classList = h('div', { class: 'class-list', role: 'radiogroup', 'aria-label': t('Klasa postaci') }, cards);
  const fields = { look: lookField, class: classList, name: nameInput };
  let firstMissing = null;
  status.addEventListener('click', () => firstMissing && showMissing(fields[firstMissing]));
  function updateBar() {
    const name = nameInput.value.trim();
    const missing = [!look && 'look', !selected && 'class', !name && 'name'].filter(Boolean);
    firstMissing = missing[0] ?? null;
    status.classList.toggle('create-status--ready', missing.length === 0);
    if (missing.length > 0) {
      status.textContent = missingText(missing);
      return;
    }
    const className = state.content.classes.find((cls) => cls.id === selected)?.name ?? '';
    const lookName = state.content.appearances.find((one) => one.id === look)?.name ?? '';
    status.textContent = `${className} · ${lookName} · ${name}`;
  }

  const form = h(
    'form',
    { class: 'form', novalidate: true },
    h(
      'div',
      { class: 'field' },
      h('span', { class: 'field-label', id: 'look-label', text: t('Wygląd') }),
      lookField,
    ),
    h(
      'div',
      { class: 'field' },
      h('span', { class: 'field-label', id: 'skin-label', text: t('Kolor skóry') }),
      h('div', { class: 'skin-swatches', role: 'radiogroup', 'aria-labelledby': 'skin-label' }, tones),
    ),
    classList,
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'character-name', text: t('Imię postaci') }),
      nameInput,
      h('p', { class: 'field-hint', id: 'character-name-hint', text: t('Od 2 do 20 znaków, na początku litera. Mogą być cyfry, spacje, myślniki, apostrofy i podkreślniki.') }),
    ),
    h(
      'div',
      { class: 'field field--switch' },
      h('span', { class: 'field-label', id: 'create-voice-label', text: t('Głos narratora') }),
      voiceSwitch('create-voice-label'),
      h('p', { class: 'field-hint', text: t('Narrator czyta wprowadzenie na głos. Zmienisz to też w ustawieniach.') }),
    ),
    error,
    h('div', { class: 'create-bar' }, status, submit),
  );
  updateBar();

  form.addEventListener('input', () => {
    error.hidden = true;
    updateBar();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!look || !selected) {
      error.textContent = look ? t('Wybierz klasę postaci.') : t('Wybierz wygląd postaci.');
      error.hidden = false;
      // The screen goes to the choice still missing.
      showMissing(look ? classList : lookField);
      return;
    }
    submit.disabled = true;
    submit.textContent = t('Tworzenie postaci…');
    try {
      const { character } = await call('POST', '/api/character', { name: nameInput.value, classId: selected, appearance: look, skin });
      onCreated();
      // "Pomijaj objaśnienia narratora" on the account: the server skipped
      // the introduction as "Pomiń wprowadzenie" does (tutorial.js), and the
      // game says so in the same words.
      if (character.tutorial?.includes('ending')) toast(state.content.tutorial.skippedText);
    } catch (failure) {
      error.textContent = failure.message;
      error.hidden = false;
      // The words of the refusal (a name taken, too short) stand above the
      // bar, maybe out of sight: the screen goes to them, by the name.
      error.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } finally {
      submit.disabled = false;
      submit.textContent = t('Rozpocznij');
    }
  });

  fill(container,
    h(
      'header',
      { class: 'hero hero--small' },
      h('h1', { class: 'hero-title', tabindex: '-1', text: t('Nowa postać') }),
      h('p', { class: 'hero-tagline', text: t('Skraj Puszczy. Tu wszystko się zaczyna.') }),
    ),
    systemPanel(t('Wykryto nową istotę na skraju puszczy. Wybierz wygląd, ścieżkę klasy i podaj imię.')),
    form,
  );
  $('.hero-title', container).focus();
}
