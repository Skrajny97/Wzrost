// Gifts for the Osada's residents and presents from friends (818.1 and
// 818.2; src/server/resident-gifts.js): on a resident's place, under their
// greeting, "Podaruj" opens a sheet with what they like among the
// character's goods, each with the relation it gives, or with the gold of
// the gift for those who like gold; once a narrator's day, greyed with the
// reason when today's gift is given or there is nothing to give. A friend's
// present of the week waits above it, gold-edged, with "Odbierz". All the
// words come from the data (gifts.texts in data/settlement.json).

import { h } from './dom.js';
import { formatNumber } from './format.js';
import { t } from './i18n.js';
import { call, state } from './state.js';
import { closeSheet, openSheet, toast, withButton } from './ui.js';
import { stackArt } from './screens/market.js';

const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));

// A gift or a present in words: gold as gold, Punkty Czasu by their name,
// goods by theirs, with the count when more than one.
function giftLabel(gift, words) {
  if (gift.kind === 'gold') return filled(words.goldAmount, { gold: formatNumber(gift.count) });
  const name = gift.kind === 'time-points' ? words.timePoints : gift.name;
  return gift.count > 1 ? `${name} ×${formatNumber(gift.count)}` : name;
}

// Today's gift to the resident (a piece's `key`, none for gold): the sheet
// closes, the place redraws and a toast says what went and the relation.
const giveButton = (resident, key, words, apply, { text = words.give, className = 'button button--world button--small' } = {}) =>
  h('button', {
    type: 'button',
    class: className,
    text,
    onClick: (event) =>
      withButton(event.currentTarget, async () => {
        const answer = await call('POST', '/api/settlement/residents/gift', { resident: resident.id, ...(key && { key }) });
        closeSheet();
        apply(answer);
        toast(filled(words.done, { gift: giftLabel(answer.given, words), relation: answer.given.relation }));
      }),
  });

// What the resident likes among the character's goods, a row for each
// stack with its picture, how many there are and the relation one gives.
function goodsSheet(resident, words, apply) {
  const { gift } = resident;
  openSheet(
    h('h2', { class: 'sheet-title', text: words.title }),
    h('p', { class: 'sheet-text', text: `${filled(words.likes, { name: resident.name, likes: words.kinds[gift.kind] })} ${filled(words.rule, { relation: gift.relation })}` }),
    h(
      'ul',
      { class: 'settlement-goods' },
      gift.goods.map((good) =>
        h(
          'li',
          { class: 'settlement-good' },
          h('p', { class: 'settlement-good-name' }, h('span', { class: 'potion-pick-art' }, stackArt(good)), h('strong', { text: `${good.name} × ${formatNumber(good.count)}` })),
          h('p', { class: 'muted', text: filled(words.relation, { relation: good.relation }) }),
          giveButton(resident, good.key, words, apply),
        ),
      ),
    ),
  );
}

// The gift of gold: how much and the relation it gives.
function goldSheet(resident, words, apply) {
  const { gift } = resident;
  openSheet(
    h('h2', { class: 'sheet-title', text: words.title }),
    h('p', { class: 'sheet-text', text: `${filled(words.likesGold, { name: resident.name })} ${filled(words.gold, { gold: formatNumber(gift.gold), relation: gift.relation })}` }),
    h(
      'div',
      { class: 'sheet-actions' },
      h('button', { type: 'button', class: 'button button--world', text: t('Anuluj'), onClick: closeSheet }),
      giveButton(resident, null, words, apply, { text: filled(words.giveGold, { gold: formatNumber(gift.gold) }), className: 'button button--system' }),
    ),
  );
}

// The gifts' part of a resident's card (screens/settlement.js): the
// friend's present with "Odbierz", "Podaruj", and under it what they like
// or why there is no gift now. `words` are the data's gifts.texts, `apply`
// takes the server's answer.
export function residentGifts(resident, words, apply) {
  const { gift, present } = resident;
  if (!gift || !words) return null;
  const gold = gift.kind === 'gold';
  const short = gold ? state.character.gold < gift.gold : gift.goods.length === 0;
  const likes = gold ? filled(words.likesGold, { name: resident.name }) : filled(words.likes, { name: resident.name, likes: words.kinds[gift.kind] });
  const reason = gift.given ? words.given : short ? `${likes} ${gold ? words.noGold : words.nothing}` : likes;
  return h(
    'div',
    { class: 'settlement-gift' },
    present &&
      h(
        'div',
        { class: 'settlement-gift-present' },
        h('p', { text: filled(words.present, { name: resident.name, gift: giftLabel(present, words) }) }),
        h('button', {
          type: 'button',
          class: 'button button--world',
          text: words.claim,
          onClick: (event) =>
            withButton(event.currentTarget, async () => {
              const answer = await call('POST', '/api/settlement/residents/present', { resident: resident.id });
              apply(answer);
              toast(filled(words.claimed, { gift: giftLabel(answer.present, words) }));
            }),
        }),
      ),
    h('button', {
      type: 'button',
      class: 'button button--world',
      text: words.give,
      disabled: gift.given || short,
      onClick: () => (gold ? goldSheet : goodsSheet)(resident, words, apply),
    }),
    h('p', { class: 'muted', text: reason }),
  );
}
