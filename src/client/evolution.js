// Class evolutions (evolutions.js in the engine; DECISIONS.md, "Ewolucje:
// budowa"): the cards of the two evolutions to choose from at class level 50
// (in Umiejętności), the choice for good, and the ceremony with the
// evolution's music. On the test version "Testuj ewolucję" (in the settings)
// opens every evolution of the class at any level and can undo the test.

import { h } from './dom.js';
import { setMusicPlace } from './music.js';
import { call, state } from './state.js';
import { afterSheet, closeSheet, confirmAction, openSheet, toast, withButton } from './ui.js';

const texts = () => state.content.evolutionTexts;
const filled = (template, vars) => template.replace(/\{(\w+)\}/g, (whole, key) => String(vars[key] ?? whole));

const traitLine = (trait) => h('p', { class: 'evolution-trait' }, h('strong', { text: `${texts().trait}: ${trait.name}. ` }), trait.text);

// An evolution's card: its name and path, growth, trait and skills with
// their numbers at the top level, and a button to choose it.
export function evolutionCard(evolution, { onChoose = null, busy = false } = {}) {
  const t = texts();
  return h(
    'article',
    { class: 'card evolution-card', 'aria-label': evolution.name },
    h('h3', { class: 'evolution-name', text: evolution.name }),
    evolution.pathName && h('p', { class: 'muted', text: `Ścieżka: ${evolution.pathName}` }),
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
    onChoose && h('button', { type: 'button', class: 'button button--system', disabled: busy, text: `${t.choose}: ${evolution.name}`, onClick: (event) => onChoose(event.currentTarget, evolution) }),
  );
}

// The choice for good, asked once more; the ceremony follows. `test`: the
// test version's try.
export async function chooseEvolution(button, evolution, { test = false } = {}) {
  const sure = await confirmAction({ title: filled(texts().ceremony, { name: evolution.name }), text: filled(texts().confirm, { name: evolution.name }), confirmLabel: 'Wybieram' });
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
  afterSheet(() => setMusicPlace(/^#\/postac\/(umiejetnosci|ewolucja)/.test(location.hash) ? ['skills'] : []));
}

// "Testuj ewolucję" on the test version: every evolution of the class to
// try, or the way back from the one tried.
export async function openEvolutionTests() {
  const t = texts();
  const character = state.character;
  if (character.evolutionUndo) {
    openSheet(
      h('h2', { class: 'sheet-title', text: t.test }),
      h('p', { class: 'sheet-text', text: `Ewolucja z testu: ${character.className}.` }),
      h(
        'div',
        { class: 'sheet-actions' },
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
        }),
      ),
    );
    return;
  }
  if (character.evolution?.current) {
    openSheet(h('h2', { class: 'sheet-title', text: t.test }), h('p', { class: 'sheet-text', text: `Postać przeszła już ewolucję: ${character.className}.` }));
    return;
  }
  const { evolutions } = await call('GET', '/api/evolution/test');
  openSheet(
    h('h2', { class: 'sheet-title', text: t.test }),
    h('p', { class: 'muted', text: t.testText }),
    evolutions.map((evolution) => evolutionCard(evolution, { onChoose: (button, chosen) => chooseEvolution(button, chosen, { test: true }) })),
  );
}
