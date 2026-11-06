// Class evolutions (evolutions.js in the engine; DECISIONS.md, "Ewolucje:
// budowa" and "Druga ewolucja klas"): the cards of the two evolutions to
// choose from at class level 50 (in the Ewolucja tab), the choice for good,
// the ceremony with the evolution's music and after it the free reset of the
// stat points, once; at class level 100 the card of the one form the
// evolution grows into, taken the same way, with the ceremony. On the test
// version "Testuj ewolucję" (in the settings) opens every evolution of the
// class, or the second form of the one the character has, at any level and
// can undo the test.

import { placeArt, portraitSprite } from './art.js';
import { h } from './dom.js';
import { formatNumber } from './format.js';
import { t } from './i18n.js';
import { motionOn } from './motion.js';
import { setMusicPlace } from './music.js';
import { narratorIdle } from './narrator.js';
import { playSound } from './sound.js';
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
  const words = texts();
  const { classId, appearance, skin } = state.character ?? {};
  const portrait = classId && portraitSprite(classId, appearance, { skin, evolution: evolution.id });
  // A second form is taken, not chosen: its button says so.
  const label = evolution.stage > 1 ? words.take : words.choose;
  return h(
    'article',
    { class: 'card evolution-card', 'aria-label': evolution.name },
    portrait && h('div', { class: 'evolution-portrait' }, portrait),
    h('h3', { class: 'evolution-name', text: evolution.name }),
    evolution.description && h('p', { class: 'evolution-description', text: evolution.description }),
    evolution.pathName && h('p', { class: 'muted', text: t('Ścieżka: {path}', { path: evolution.pathName }) }),
    evolution.fromName && h('p', { class: 'muted', text: filled(words.fromEvolution, { name: evolution.fromName }) }),
    h('p', { class: 'evolution-growth' }, h('strong', { text: `${words.growth}: ` }), evolution.growth.map((entry) => `${entry.name} +${entry.value}`).join(', ')),
    traitLine(evolution.trait),
    h('h4', { class: 'evolution-subtitle', text: t('{skills} (na {level}. poziomie)', { skills: words.skills, level: evolution.skillLevel }) }),
    h(
      'ul',
      { class: 'evolution-skills' },
      evolution.skills.map((skill) =>
        h(
          'li',
          {},
          h('strong', { text: skill.name }),
          skill.from && h('span', { class: 'muted', text: t(' · z: {name}', { name: skill.from }) }),
          h('p', { class: 'skill-effect', text: skill.effect }),
        ),
      ),
    ),
    onChoose && h('button', { type: 'button', class: 'button button--system', disabled: busy, text: `${label}: ${evolution.name}`, onClick: (event) => onChoose(event.currentTarget, evolution) }),
  );
}

// The choice for good, asked once more; the ceremony follows. A second form
// is asked about in its own words. `test`: the test version's try.
export async function chooseEvolution(button, evolution, { test = false } = {}) {
  const words = texts();
  const next = evolution.stage > 1;
  const sure = await confirmAction({
    title: filled(words.ceremony, { name: evolution.name }),
    text: filled(next ? words.nextConfirm : words.confirm, { name: evolution.name }),
    confirmLabel: next ? words.accept : t('Wybieram'),
  });
  if (!sure) return;
  // The form the character has before: its first evolution, or the class.
  const from = state.character?.evolution?.current?.id ?? null;
  await withButton(button, async () => {
    const result = await call('POST', '/api/evolution', { evolutionId: evolution.id, test });
    ceremony(result.evolution, { from });
  });
}

// The transformation (the author: "efekt i transformację z jasnym światłem i
// zmianą postaci po wybraniu danej drogi", and on the test film "super
// animacja ewolucji, dodaj jeszcze efekt dźwiękowy"): the form the character
// had stands in the System's spring, light gathers on it, a white flash, and
// the new form stands in its place. Its sound (`evolution-transform` in
// data/sounds.json) rises with the light. The scene stays behind the
// ceremony's sheet and goes with it. A tap skips to the end; with the game's
// animations off there is no scene. Returns the scene and a promise kept
// when the change is over.
const TRANSFORM_MS = 3600;
// The recordings swell to their loudest about 0.85 s in, met by the flash.
const TRANSFORM_SOUND_MS = 1250;

function transformation(fromId, toId) {
  const { classId, appearance, skin } = state.character ?? {};
  const form = (id) => classId && portraitSprite(classId, appearance, { skin, evolution: id ?? undefined });
  const before = form(fromId);
  const after = form(toId);
  if (!motionOn() || !before || !after) return null;
  // Each form with a white copy over it: the light whitens it by the copy.
  const layer = (img, which) => {
    const white = img.cloneNode();
    white.classList.add('evo-transform__white');
    return h('div', { class: `evo-transform__form evo-transform__form--${which}` }, img, white);
  };
  const motes = Array.from({ length: 22 }, () => {
    const x = Math.random();
    const y = 0.15 + Math.random() * 0.7;
    return h('span', {
      class: 'evo-transform__mote',
      style: { left: `${(x * 100).toFixed(1)}%`, top: `${(y * 100).toFixed(1)}%`, animationDelay: `${(Math.random() * 0.4).toFixed(2)}s` },
      vars: { '--tx': `${Math.round((0.5 - x) * innerWidth)}px`, '--ty': `${Math.round((0.42 - y) * innerHeight)}px` },
    });
  });
  const sparks = Array.from({ length: 16 }, (_, index) => {
    const angle = (index / 16) * Math.PI * 2 + Math.random() * 0.3;
    const reach = 90 + Math.random() * 90;
    return h('span', { class: 'evo-transform__spark', vars: { '--bx': `${Math.round(Math.cos(angle) * reach)}px`, '--by': `${Math.round(Math.sin(angle) * reach - 40)}px` } });
  });
  const spring = placeArt('system-spring');
  const scene = h(
    'div',
    { class: 'evo-transform', 'aria-hidden': 'true' },
    spring && h('div', { class: 'evo-transform__spring', style: { backgroundImage: `url(${spring})` } }),
    h('div', { class: 'evo-transform__rays' }),
    h('div', { class: 'evo-transform__figure' }, layer(before, 'before'), layer(after, 'after')),
    h('div', { class: 'evo-transform__motes' }, motes, sparks),
    h('div', { class: 'evo-transform__flash' }),
  );
  document.body.append(scene);
  const sound = setTimeout(() => playSound('evolution-transform'), TRANSFORM_SOUND_MS);
  const done = new Promise((resolve) => {
    const end = () => {
      clearTimeout(timer);
      scene.classList.add('evo-transform--done');
      resolve();
    };
    const timer = setTimeout(end, TRANSFORM_MS);
    scene.addEventListener('pointerdown', end, { once: true });
  });
  return { scene, done, stop: () => (clearTimeout(sound), scene.remove()) };
}

// The ceremony: the change in light, then the System's words over the
// evolution's music, which gives way to the tab's own once the sheet closes.
// `from`: the form the character had (its first evolution's id, or null).
export async function ceremony(evolution, { from = null } = {}) {
  const words = texts();
  setMusicPlace(['evolution']);
  const change = transformation(from, evolution.id);
  if (change) await change.done;
  const dialog = openSheet(
    h(
      'div',
      { class: 'evolution-ceremony' },
      h('p', { class: 'system-label', text: '[ SYSTEM ]' }),
      h('h2', { class: 'sheet-title evolution-ceremony-title', text: filled(words.ceremony, { name: evolution.name }) }),
      h('p', { class: 'sheet-text', text: filled(words.ceremonyLine, { name: evolution.name }) }),
      traitLine(evolution.trait),
      h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--system', onClick: closeSheet, text: t('Dalej') })),
    ),
  );
  // Over the new form, the sheet dims the page less.
  if (change) dialog.classList.add('sheet--transform');
  afterSheet(() => {
    dialog.classList.remove('sheet--transform');
    change?.stop();
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
  const words = texts();
  const decide = (reset) => (event) =>
    withButton(event.currentTarget, async () => {
      try {
        const result = await call('POST', '/api/evolution/points', { reset });
        if (result.reset) toast(words.resetDone);
      } finally {
        // Refused (the character set out from another device, say), the
        // window waits for the character as read again.
        closeSheet();
      }
    });
  openDecision(
    h('p', { class: 'system-label', text: '[ SYSTEM ]' }),
    h('h2', { class: 'sheet-title', text: words.resetTitle }),
    h('p', { class: 'sheet-text', text: words.resetText }),
    h(
      'p',
      { class: 'sheet-text evolution-reset-pool' },
      filled(offer.bonus > 0 ? words.resetPoolBonus : words.resetPool, {
        points: formatNumber(offer.total),
        character: formatNumber(offer.character),
        class: formatNumber(offer.class),
        bonus: formatNumber(offer.bonus),
      }),
    ),
    h('p', { class: 'sheet-text evolution-reset-warning', text: words.resetWarning }),
    h(
      'div',
      { class: 'evolution-reset-choice' },
      h('span', { class: 'evolution-recommended', text: words.recommended }),
      h('button', { type: 'button', class: 'button button--system', text: words.reset, onClick: decide(true) }),
      h('button', { type: 'button', class: 'button button--world', text: words.keep, onClick: decide(false) }),
    ),
  );
}

// The character at an evolution's class level at once (the author: "nie
// chce mi się przeklikiwać tego"): the first's, a test evolution undone
// first, or the second's (`second`), the first evolution kept.
function testLevelButton({ second = false } = {}) {
  const words = texts();
  const level = String(second ? (state.character.evolution?.nextLevel ?? '') : (unlockInfo('evolution')?.classLevel ?? ''));
  return h('button', {
    type: 'button',
    class: 'button button--system',
    text: filled(words.testLevel, { level }),
    onClick: (event) =>
      withButton(event.currentTarget, async () => {
        await call('POST', `/api/evolution/test-level${second ? `?level=${level}` : ''}`);
        closeSheet();
        toast(filled(words.testLevelDone, { level }));
      }),
  });
}

// "Testuj ewolucję" on the test version: every evolution of the class to
// try, or the second form of the one the character has, the way back from
// the one tried, and the class level of an evolution at once.
export async function openEvolutionTests() {
  const words = texts();
  const character = state.character;
  const current = character.evolution?.current;
  const { evolutions } = await call('GET', '/api/evolution/test');
  const undo =
    character.evolutionUndo &&
    h('button', {
      type: 'button',
      class: 'button button--system',
      text: words.undo,
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          await call('POST', '/api/evolution/undo');
          closeSheet();
          toast(words.undone);
        }),
    });
  const said = !current ? words.testText : evolutions.length > 0 ? words.testNext : filled(words.testDone, { name: character.className });
  openSheet(
    h('h2', { class: 'sheet-title', text: words.test }),
    character.evolutionUndo && h('p', { class: 'sheet-text', text: t('Ewolucja z testu: {name}.', { name: character.className }) }),
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
