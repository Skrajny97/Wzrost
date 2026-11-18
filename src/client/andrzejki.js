// Andrzejki: Wieczór wróżb (1082 C, 1083 C, 1084 A and B; the server's
// andrzejki.js): on the Walka screen, under the week's line, the card of
// tonight's evening, the wax on 29 November and the three cups on the 30th,
// with its picture: a tap pours the wax (its shape's shadow then falls on
// the wall) or lifts a cup (the wax figurine under it shows), and the omen,
// its premium for a day and its small reward follow. Each omen still
// running has a slim line of its own under the week's, with the hour it
// ends. The words come with the content, in the page's language.

import { goldArt, omenSprite, timePointsArt } from './art.js';
import { h, icon } from './dom.js';
import { formatNumber, timeFormat } from './format.js';
import { t } from './i18n.js';
import { call, setCharacter, state } from './state.js';
import { toast, withButton } from './ui.js';

const words = () => state.content?.winter?.andrzejki?.texts ?? null;

// The fortune just told on this page (the answer of POST /api/andrzejki):
// its reward shows on the card until the next evening.
let told = null;

// The lines under the week's: each omen still running, its premium and the
// hour it ends; nothing when none runs.
export function omenLines(character = state.character) {
  const texts = words();
  const active = character?.andrzejki?.active ?? [];
  if (!texts || active.length === 0) return null;
  return active.map((omen) =>
    h(
      'p',
      { class: 'omen-line' },
      h('span', { class: 'omen-line-art' }, omenSprite(omen.id)),
      h(
        'span',
        { class: 'omen-line-text' },
        h('strong', { class: 'omen-line-name', text: texts.active.replace('{omen}', omen.name) }),
        ` · ${omen.short} · ${t('do {time}', { time: timeFormat.format(new Date(omen.until)) })}`,
      ),
    ),
  );
}

// A reward's lines: Punkty Czasu, gold, packs of cards.
function rewardLine(texts, reward) {
  const parts = [
    reward.timePoints > 0 && [timePointsArt(16), ` ${formatNumber(reward.timePoints)}`],
    reward.gold > 0 && [goldArt(16), ` ${formatNumber(reward.gold)}`],
    reward.packs > 0 && [h('img', { class: 'omen-pack', src: '/art/cards/pack.png', alt: '', width: 16, height: 16 }), ` ${t('Pakiet kart')} ×${formatNumber(reward.packs)}`],
  ].filter(Boolean);
  const [before, after] = texts.reward.split('{reward}');
  return h('p', { class: 'omen-reward' }, before, parts.flatMap((part, index) => (index > 0 ? [', ', ...part] : part)), after);
}

// Tonight's fortune told: the shape's shadow on the wall over the wax's
// picture, or the figurine on the table where the cup stood; then the omen
// and what it gives.
function result(evening, texts, fresh) {
  const omen = evening.told;
  return [
    h('p', { class: 'andrzejki-result', text: (evening.kind === 'wax' ? texts.waxResult : texts.cupsResult).replace('{omen}', omen.name) }),
    h('p', { class: 'andrzejki-omen', text: texts.omen.replace('{omen}', omen.name).replace('{effect}', omen.effect).replace('{hours}', String(state.character.andrzejki.hours)) }),
    fresh && rewardLine(texts, fresh.reward),
    h('p', { class: 'muted andrzejki-next', text: evening.kind === 'wax' ? texts.toldWax : texts.toldCups }),
  ];
}

// The picture of the evening, with the omen over it once told: the shadow
// of the shape on the wall and the shape in the bowl (wax), or the
// figurine where the cup chosen stood (`cup`).
function scene(evening) {
  const omen = evening.told;
  return h(
    'div',
    { class: `andrzejki-scene andrzejki-scene--${evening.kind}${omen ? ' andrzejki-scene--told' : ''}` },
    h('img', { class: 'andrzejki-scene-art', src: `/art/andrzejki/${evening.kind}.png`, alt: '', width: 128, height: 96, draggable: 'false' }),
    omen && evening.kind === 'wax' && h('span', { class: 'andrzejki-shadow', 'aria-hidden': 'true' }, omenSprite(omen.id)),
    omen && evening.kind === 'wax' && h('span', { class: 'andrzejki-figure andrzejki-figure--bowl', 'aria-hidden': 'true' }, omenSprite(omen.id)),
    omen && evening.kind === 'cups' && h('span', { class: `andrzejki-figure andrzejki-figure--cup${omen.cup ?? 2}`, 'aria-hidden': 'true' }, omenSprite(omen.id)),
  );
}

// The card of tonight's evening, or nothing outside the evenings.
export function andrzejkiCard(character = state.character) {
  const texts = words();
  const evening = character?.andrzejki?.evening;
  if (!texts || !evening) return null;
  const fresh = told && told.key === evening.key ? told : null;
  const tell = async (button, cup = null) =>
    withButton(button, async () => {
      const answer = await call('POST', '/api/andrzejki', cup === null ? {} : { cup });
      told = { key: evening.key, reward: answer.fortune.reward };
      // The screen drew the answer before the reward was known: once more
      // with it.
      setCharacter(state.character);
      if (answer.fortune.both) toast(texts.bothGot);
    });
  const kindName = evening.kind === 'wax' ? texts.wax : texts.cups;
  return h(
    'section',
    { class: 'card andrzejki-card', 'aria-labelledby': 'andrzejki-title' },
    h('h2', { class: 'card-title', id: 'andrzejki-title' }, icon('star', { size: 22 }), texts.title, h('span', { class: 'andrzejki-kind', text: ` · ${kindName}` })),
    scene(evening),
    evening.told
      ? result(evening, texts, fresh)
      : [
          h('p', { class: 'andrzejki-about', text: evening.kind === 'wax' ? texts.waxAbout : texts.cupsAbout }),
          evening.kind === 'wax'
            ? h('button', { type: 'button', class: 'button button--world', text: texts.waxButton, onClick: (event) => tell(event.currentTarget) })
            : h(
                'div',
                { class: 'andrzejki-cup-buttons' },
                Array.from({ length: evening.cups }, (_, index) =>
                  h('button', { type: 'button', class: 'button button--world button--small', text: texts.cup.replace('{number}', String(index + 1)), onClick: (event) => tell(event.currentTarget, index + 1) }),
                ),
              ),
          !character.andrzejki.both && h('p', { class: 'muted andrzejki-both', text: texts.both }),
        ],
  );
}
