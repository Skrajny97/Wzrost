// Talia Systemu's balance (data/cards.json, src/engine/cards.js): how often
// a player who lays the cards that hit hardest and take least each round
// (the engine's autoTurn, no hero skill) wins with each deck against each of
// Szczęsny's tiers and each resident of the Osada (904 B, between the tiers:
// src/engine/card-residents.js), how many rounds a match takes, and how many
// end at the rounds' limit. The decks: the starter and each tier's own, as
// the player's; the rivals in the order of their strength, each resident
// after the tier it beats.
//   node tools/cards-sim.mjs [matches per pair, 100 by default]
// The cards of the starter, the tiers and the residents are listed first,
// with their type, rarity, level, Atak and Życie.

import { autoTurn, buildContent, cardView, hostTiers, newMatch, playTurn, residentTables, starterDeck, turnBlock } from '../src/engine/index.js';
import { loadData } from './validate-data.mjs';

const content = buildContent(loadData());
const matches = Number(process.argv[2] ?? 100);
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

const show = (id, level) => {
  const card = cardView(id, level, content);
  return `${card.name} (${card.typeName}, ${card.rarityName}, ${level}) ${card.attack}/${card.life}`;
};
const residentName = (id) => content.settlement.residents.find((resident) => resident.id === id)?.name ?? id;
console.log(`Talia startowa: ${starterDeck(content).map((id) => show(id, 1)).join(' | ')}`);
// The rivals from the weakest: each tier, then the residents after it.
const rivals = [];
hostTiers(content).forEach((tier, index) => {
  rivals.push({ name: `${ROMAN[index]} ${tier.name}`, cards: tier.cards, smart: tier.smart });
  for (const table of residentTables(content).filter((one) => one.after === index + 1)) {
    rivals.push({ name: `${residentName(table.id)} (${table.name})`, cards: table.cards, smart: table.smart });
  }
});
for (const rival of rivals) console.log(`${rival.name}: ${rival.cards.map((card) => show(card.monster, card.level)).join(' | ')}`);
console.log('');

const decks = { startowa: starterDeck(content).map((id) => ({ id, level: 1 })) };
for (const tier of hostTiers(content)) decks[tier.name] = tier.cards.map((card) => ({ id: card.monster, level: card.level }));

function play(cards, rival, seed) {
  let match = newMatch({ seed, me: { cards }, foe: { cards: rival.cards.map((card) => ({ id: card.monster, level: card.level })), smart: rival.smart } }, content);
  while (!match.result) {
    const turn = autoTurn(match, content);
    const block = turnBlock(match, turn, content);
    if (block) throw new Error(`${block.code}: ${JSON.stringify(turn)}`);
    match = playTurn(match, turn, content);
  }
  return match;
}

for (const [name, cards] of Object.entries(decks)) {
  const row = rivals.map((rival) => {
    let won = 0;
    let drawn = 0;
    let rounds = 0;
    let cap = 0;
    for (let index = 0; index < matches; index += 1) {
      const match = play(cards, rival, `sym:${index}`);
      if (match.result === 'won') won += 1;
      if (match.result === 'drawn') drawn += 1;
      if (match.end === 'cap') cap += 1;
      rounds += match.round;
    }
    return `${rival.name}: ${Math.round((100 * won) / matches)}% wygranych, ${Math.round((100 * drawn) / matches)}% remisów, ${(rounds / matches).toFixed(1)} rund${cap ? `, ${cap} do limitu` : ''}`;
  });
  console.log(`Talia ${name}:\n  ${row.join('\n  ')}`);
}
