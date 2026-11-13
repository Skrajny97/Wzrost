// The Arena's card matches (900 A, 915 B): how often the attacker wins
// against the same deck defending, played by the server as on the Arena
// (rules.smart, its hero's skill: rivalSkill in src/engine/cards.js), with
// each bonus of the defence (`boost` of newMatch). The attacker lays the
// cards that hit hardest and take least each round (the engine's autoTurn,
// no hero skill), as in tools/cards-sim.mjs. Equal decks: the starter deck
// and each of Szczęsny's tiers, against themselves, the defender's hero of
// each class, unevolved and at its third evolution. With --no-hero
// neither side has a hero card: the real attacker uses its own hero's skill,
// which autoTurn never does, so the match without heroes on either side
// stands for two equal sides better.
//   node tools/card-arena-sim.mjs [matches per pair, 100 by default] [bonuses, "0,0.1,0.2,0.3"] [--no-hero]

import { autoTurn, buildContent, cardArenaRules, hostTiers, newMatch, playTurn, starterDeck, turnBlock } from '../src/engine/index.js';
import { loadData } from './validate-data.mjs';

const content = buildContent(loadData());
const args = process.argv.slice(2).filter((arg) => arg !== '--no-hero');
const heroes = !process.argv.includes('--no-hero');
const matches = Number(args[0] ?? 100);
const bonuses = (args[1] ?? '0,0.1,0.2,0.3').split(',').map(Number);
const rules = cardArenaRules(content);
const classes = content.classes.map((one) => one.id);

const decks = { startowa: starterDeck(content).map((id) => ({ id, level: 1 })) };
for (const tier of hostTiers(content)) decks[tier.name] = tier.cards.map((card) => ({ id: card.monster, level: card.level }));

function play(cards, hero, boost, seed) {
  let match = newMatch({ seed, me: { cards }, foe: { cards, hero, smart: rules.smart, boost } }, content);
  while (!match.result) {
    const turn = autoTurn(match, content);
    const block = turnBlock(match, turn, content);
    if (block) throw new Error(`${block.code}: ${JSON.stringify(turn)}`);
    match = playTurn(match, turn, content);
  }
  return match.result;
}

const percent = (value) => `${Math.round(value * 100)}%`;
console.log(`Atakujący wygrywa (remisy w nawiasie), ${matches} partii na parę; obrońca z premią do Ataku i Życia:`);
for (const boost of bonuses) {
  let all = 0;
  let allWon = 0;
  const lines = [];
  for (const [name, cards] of Object.entries(decks)) {
    const row = [];
    for (const stage of heroes ? [0, 3] : [0]) {
      for (const classId of heroes ? classes : ['none']) {
        let won = 0;
        let drawn = 0;
        for (let index = 0; index < matches; index += 1) {
          const result = play(cards, heroes ? { classId, stage } : null, boost, `arena:${name}:${classId}:${stage}:${index}`);
          if (result === 'won') won += 1;
          if (result === 'drawn') drawn += 1;
        }
        all += matches;
        allWon += won;
        row.push(`${classId}${stage ? '+' : ''} ${percent(won / matches)} (${percent(drawn / matches)})`);
      }
    }
    lines.push(`  ${name}: ${row.join(', ')}`);
  }
  console.log(`+${Math.round(boost * 100)}%: razem ${percent(allWon / all)}`);
  for (const line of lines) console.log(line);
}
