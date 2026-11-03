// Class evolutions (evolutions.js in the engine; DECISIONS.md, "Ewolucje:
// budowa" and "Druga ewolucja klas"): the cards of the two evolutions to
// choose from at class level 50 (in the Ewolucja tab), the choice for good,
// the ceremony with the evolution's music and after it the free reset of the
// stat points, once; at class level 100 the card of the one form the
// evolution grows into, taken the same way, with the ceremony. On the test
// version "Testuj ewolucję" (in the settings) opens every evolution of the
// class, or the second form of the one the character has, at any level and
// can undo the test.

import { portraitSprite } from './art.js';
import { h } from './dom.js';
import { formatNumber } from './format.js';
import { setMusicPlace } from './music.js';
import { narratorIdle } from './narrator.js';
import { call, state, unlockInfo } from './state.js';
import { afterSheet, closeSheet, confirmAction, openDecision, openSheet, toast, withButton } from './ui.js';

const texts = () => state.content.evolutionTexts;
const filled = (template, vars) => template.replace(/\{(\w+)\}/g, (whole, key) => String(vars[key] ?? whole));

const traitLine = (trait) => h('p', { class: 'evolution-trait' }, h('strong', { text: `${texts().trait}: ${trait.name}. ` }), trait.text);

// An evolution's card: its name and path, growth, trait and skills with
// their numbers at the top level, and a button to choose it. Beside the
// words stands the character as the evolution draws it, in its own look and
// skin tone (the author: "wizerunek nowej postaci z aktualnie nałożonym
// odcieniem skóry i płcią").
export function evolutionCard(evolution, { onChoose = null, busy = false } = {}) {
  const t = texts();
  const { classId, appearance, skin } = state.character ?? {};
  const portrait = classId && portraitSprite(classId, appearance, { skin, evolution: evolution.id });
  // A second form is taken, not chosen: its button says so.
  const label = evolution.stage > 1 ? t.take : t.choose;
  return h(
    'article',
    { class: 'card evolution-card', 'aria-label': evolution.name },
    portrait && h('div', { class: 'evolution-portrait' }, portrait),
    h('h3', { class: 'evolution-name', text: evolution.name }),
    evolution.description && h('p', { class: 'evolution-description', text: evolution.description }),
    evolution.pathName && h('p', { class: 'muted', text: `Ścieżka: ${evolution.pathName}` }),
    evolution.fromName && h('p', { class: 'muted', text: filled(t.fromEvolution, { name: evolution.fromName }) }),
    h('p', { class: 'evolution-growth' }, h('strong', { text: `${t.growth}: ` }), evolution.growth.map((entry) => `${entry.name} +${entry.value}`).join(', ')),
    traitLine(evolution.trait),
    h('h4', { class: 'evolution-subtitle', text: `${t.skills} (na ${evolution.skillLevel}. poziomie)` }),
    h(
      'ul',
      { class: 'evolution-skills' },
      evolution.skills.map((skill) =>
        h('li', {}, h('strong', { text: skill.name }), skill.from && h('span', { class: 'muted', text: ` · z: ${skill.from}` }), h('p', { class: 'skill-effect', text: skill.effect })),
      ),
    ),
    onChoose && h('button', { type: 'button', class: 'button button--system', disabled: busy, text: `${label}: ${evolution.name}`, onClick: (event) => onChoose(event.currentTarget, evolution) }),
  );
}

// The choice for good, asked once more; the ceremony follows. A second form
// is asked about in its own words. `test`: the test version's try.
export async function chooseEvolution(button, evolution, { test = false } = {}) {
  const t = texts();
  const next = evolution.stage > 1;
  const sure = await confirmAction({
    title: filled(t.ceremony, { name: evolution.name }),
    text: filled(next ? t.nextConfirm : t.confirm, { name: evolution.name }),
    confirmLabel: next ? t.accept : 'Wybieram',
  });
  if (!sure) return;
  await withButton(button, async () => {
    const result = await call('POST', '/api/evolution', { evolutionId: evolution.id, test });
    ceremony(result.evolution);
  });
}

// The ceremony: the System's words over the evolution's music, which gives
// way to the tab's own once the sheet closes.
export function ceremony(evolution) {
  const t = texts();
  setMusicPlace(['evolution']);
  openSheet(
    h(
      'div',
      { class: 'evolution-ceremony' },
      h('p', { class: 'system-label', text: '[ SYSTEM ]' }),
      h('h2', { class: 'sheet-title evolution-ceremony-title', text: filled(t.ceremony, { name: evolution.name }) }),
      h('p', { class: 'sheet-text', text: filled(t.ceremonyLine, { name: evolution.name }) }),
      traitLine(evolution.trait),
      h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--system', onClick: closeSheet, text: 'Dalej' })),
    ),
  );
  afterSheet(() => {
    setMusicPlace(/^#\/postac\/(umiejetnosci|ewolucja)/.test(location.hash) ? ['skills'] : []);
    offerPointsReset();
  });
}

// After an evolution the stat points can be reset once, for free (the
// author: "ostrzeż, że to darmowe jednorazowo"; "Musi od razu zdecydować o
// wyzerowaniu przy wyświetleniu tego okienka (niech bedzie napis "zalecane"
// przy "Zeruj")"). The window waits for the answer; closed without one, it
// comes back (the app asks every second), while the character is at home.
export function offerPointsReset() {
  const offer = state.character?.evolutionReset;
  if (!offer || state.character.activity || !narratorIdle() || document.querySelector('dialog[open]')) return;
  const t = texts();
  const decide = (reset) => (event) =>
    withButton(event.currentTarget, async () => {
      try {
        const result = await call('POST', '/api/evolution/points', { reset });
        if (result.reset) toast(t.resetDone);
      } finally {
        // Refused (the character set out from another device, say), the
        // window waits for the character as read again.
        closeSheet();
      }
    });
  openDecision(
    h('p', { class: 'system-label', text: '[ SYSTEM ]' }),
    h('h2', { class: 'sheet-title', text: t.resetTitle }),
    h('p', { class: 'sheet-text', text: t.resetText }),
    h(
      'p',
      { class: 'sheet-text evolution-reset-pool' },
      filled(offer.bonus > 0 ? t.resetPoolBonus : t.resetPool, {
        points: formatNumber(offer.total),
        character: formatNumber(offer.character),
        class: formatNumber(offer.class),
        bonus: formatNumber(offer.bonus),
      }),
    ),
    h('p', { class: 'sheet-text evolution-reset-warning', text: t.resetWarning }),
    h(
      'div',
      { class: 'evolution-reset-choice' },
      h('span', { class: 'evolution-recommended', text: t.recommended }),
      h('button', { type: 'button', class: 'button button--system', text: t.reset, onClick: decide(true) }),
      h('button', { type: 'button', class: 'button button--world', text: t.keep, onClick: decide(false) }),
    ),
  );
}

// The character at an evolution's class level at once (the author: "nie
// chce mi się przeklikiwać tego"): the first's, a test evolution undone
// first, or the second's (`second`), the first evolution kept.
function testLevelButton({ second = false } = {}) {
  const t = texts();
  const level = String(second ? (state.character.evolution?.nextLevel ?? '') : (unlockInfo('evolution')?.classLevel ?? ''));
  return h('button', {
    type: 'button',
    class: 'button button--system',
    text: filled(t.testLevel, { level }),
    onClick: (event) =>
      withButton(event.currentTarget, async () => {
        await call('POST', `/api/evolution/test-level${second ? `?level=${level}` : ''}`);
        closeSheet();
        toast(filled(t.testLevelDone, { level }));
      }),
  });
}

// "Testuj ewolucję" on the test version: every evolution of the class to
// try, or the second form of the one the character has, the way back from
// the one tried, and the class level of an evolution at once.
export async function openEvolutionTests() {
  const t = texts();
  const character = state.character;
  const current = character.evolution?.current;
  const { evolutions } = await call('GET', '/api/evolution/test');
  const undo =
    character.evolutionUndo &&
    h('button', {
      type: 'button',
      class: 'button button--system',
      text: t.undo,
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          await call('POST', '/api/evolution/undo');
          closeSheet();
          toast(t.undone);
        }),
    });
  const said = !current ? t.testText : evolutions.length > 0 ? t.testNext : filled(t.testDone, { name: character.className });
  openSheet(
    h('h2', { class: 'sheet-title', text: t.test }),
    character.evolutionUndo && h('p', { class: 'sheet-text', text: `Ewolucja z testu: ${character.className}.` }),
    h('p', { class: 'muted', text: said }),
    h(
      'div',
      { class: 'sheet-actions' },
      undo,
      (!current || character.evolutionUndo) && testLevelButton(),
      current?.stage === 1 && testLevelButton({ second: true }),
    ),
    evolutions.map((evolution) => evolutionCard(evolution, { onChoose: (button, chosen) => chooseEvolution(button, chosen, { test: true }) })),
  );
}
