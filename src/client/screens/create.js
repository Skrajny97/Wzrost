// Creating the character: a look, one of five classes and a name.

import { portraitSprite } from '../art.js';
import { classArt } from '../class-art.js';
import { $, fill, h, icon } from '../dom.js';
import { CLASS_ICONS } from '../icons.js';
import { call, state } from '../state.js';
import { systemPanel } from '../ui.js';

const POSITION_NAMES = { front: 'przód', middle: 'środek', back: 'tył' };
const START_BADGES = { gentle: 'łagodniejszy start', hard: 'trudniejszy start' };

export function renderCreate(container, onCreated) {
  let selected = null;
  let look = null;
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const nameInput = h('input', {
    id: 'character-name',
    name: 'name',
    type: 'text',
    autocomplete: 'off',
    autocapitalize: 'words',
    spellcheck: 'false',
    maxlength: '20',
    required: true,
    'aria-describedby': 'character-name-hint',
  });
  const submit = h('button', { type: 'submit', class: 'button button--system', text: 'Rozpocznij' });

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
        h('span', { class: 'class-icon' }, classIcon(cls.id)),
        h('span', { class: 'class-name', text: cls.name }),
        START_BADGES[cls.start] && h('span', { class: `badge badge--${cls.start}`, text: START_BADGES[cls.start] }),
      ),
      h('span', { class: 'class-meta', text: `${cls.role} · pozycja: ${POSITION_NAMES[cls.position]}` }),
      h('span', { class: 'class-description', text: cls.description }),
    ),
  );

  // The class cards show the figure of the chosen look, the vector bust before.
  function classIcon(classId) {
    return (look && portraitSprite(classId, look, { bust: true })) ?? classArt(classId) ?? icon(CLASS_ICONS[classId] ?? 'person', { size: 26 });
  }

  function select(classId) {
    selected = classId;
    for (const card of cards) card.setAttribute('aria-checked', String(card.dataset.classId === classId));
    error.hidden = true;
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
        for (const card of cards) fill($('.class-icon', card), classIcon(card.dataset.classId));
        error.hidden = true;
      },
    }),
  );

  const form = h(
    'form',
    { class: 'form', novalidate: true },
    h(
      'div',
      { class: 'field' },
      h('span', { class: 'field-label', id: 'look-label', text: 'Wygląd' }),
      h('div', { class: 'segmented', role: 'group', 'aria-labelledby': 'look-label' }, looks),
    ),
    h(
      'div',
      { class: 'class-list', role: 'radiogroup', 'aria-label': 'Klasa postaci' },
      cards,
    ),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'character-name', text: 'Imię postaci' }),
      nameInput,
      h('p', { class: 'field-hint', id: 'character-name-hint', text: 'Od 2 do 20 liter. Może zawierać spacje, myślniki i apostrofy.' }),
    ),
    error,
    submit,
  );

  form.addEventListener('input', () => {
    error.hidden = true;
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!look || !selected) {
      error.textContent = look ? 'Wybierz klasę postaci.' : 'Wybierz wygląd postaci.';
      error.hidden = false;
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Tworzenie postaci…';
    try {
      await call('POST', '/api/character', { name: nameInput.value, classId: selected, appearance: look });
      onCreated();
    } catch (failure) {
      error.textContent = failure.message;
      error.hidden = false;
    } finally {
      submit.disabled = false;
      submit.textContent = 'Rozpocznij';
    }
  });

  fill(container,
    h(
      'header',
      { class: 'hero hero--small' },
      h('h1', { class: 'hero-title', tabindex: '-1', text: 'Nowa postać' }),
      h('p', { class: 'hero-tagline', text: 'Skraj Puszczy. Tu wszystko się zaczyna.' }),
    ),
    systemPanel('Wykryto nową istotę na skraju puszczy. Wybierz wygląd, ścieżkę klasy i podaj imię.'),
    form,
  );
  $('.hero-title', container).focus();
}
