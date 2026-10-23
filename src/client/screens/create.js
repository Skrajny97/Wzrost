// Creating the character: one of five classes and a name.

import { $, fill, h, icon } from '../dom.js';
import { CLASS_ICONS } from '../icons.js';
import { call, state } from '../state.js';
import { systemPanel } from '../ui.js';

const POSITION_NAMES = { front: 'przód', middle: 'środek', back: 'tył' };
const START_BADGES = { gentle: 'łagodniejszy start', hard: 'trudniejszy start' };

export function renderCreate(container, onCreated) {
  let selected = null;
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
        h('span', { class: 'class-icon' }, icon(CLASS_ICONS[cls.id] ?? 'person', { size: 26 })),
        h('span', { class: 'class-name', text: cls.name }),
        START_BADGES[cls.start] && h('span', { class: `badge badge--${cls.start}`, text: START_BADGES[cls.start] }),
      ),
      h('span', { class: 'class-meta', text: `${cls.role} · pozycja: ${POSITION_NAMES[cls.position]}` }),
      h('span', { class: 'class-description', text: cls.description }),
    ),
  );

  function select(classId) {
    selected = classId;
    for (const card of cards) card.setAttribute('aria-checked', String(card.dataset.classId === classId));
    error.hidden = true;
  }

  const form = h(
    'form',
    { class: 'form', novalidate: true },
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
    if (!selected) {
      error.textContent = 'Wybierz klasę postaci.';
      error.hidden = false;
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Tworzenie postaci…';
    try {
      await call('POST', '/api/character', { name: nameInput.value, classId: selected });
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
    systemPanel('Wykryto nową istotę na skraju puszczy. Wybierz ścieżkę klasy i podaj imię.'),
    form,
  );
  $('.hero-title', container).focus();
}
