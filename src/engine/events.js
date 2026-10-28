// Events at the end of an exploration (data/events.json): someone met on
// the way back, a short text and a few options, and what follows, told in
// the report (the author: "zdarzenia na koniec wyprawy: wyświetla się nagle
// jakiś NPC który coś proponuje i jest parę opcji do wyboru jeszcze przed
// pokazaniem się Raportu z wyprawy (który będzie uwzględniał zdarzenie)").
// An exploration that ended as planned may bring one, more often the longer
// it was, but not the very first (the tutorial's) and not a Szybkie
// Polowanie. Whether it does, and which, comes from the exploration's seed,
// and an option's outcome from the seed and the option, so the same
// exploration always brings the same event and ends the same way.

import { simulateFight } from './combat.js';
import { combatantView, playerCombatant } from './combatant.js';
import { encounterCombatants } from './hunt.js';
import { itemName, randomItem } from './items.js';
import { monsterXp } from './progression.js';
import { createRng } from './rng.js';
import { say } from './text.js';

// The chance an exploration of `minutes` brings an event.
export const eventChance = (minutes, content) => Math.min(content.events.maxChance, content.events.chancePerMinute * minutes);

// The event an exploration brings, or null. `forced` (an event's id, from
// "Testuj zdarzenia" on the test version) brings that one without the draw,
// still only after an exploration that ended as planned.
export function eventFor({ hunt, seed, first = false, quick = false, forced = null }, content) {
  if (!content.events || first || quick || hunt.result !== 'success') return null;
  if (forced) return content.eventsById[forced] ?? null;
  const rng = createRng(`${seed}:event`);
  if (!rng.chance(eventChance(hunt.minutes, content))) return null;
  return rng.weighted(content.events.list, (event) => event.weight ?? 1);
}

// An event as the player first sees it: who, where, the text and the options.
export const eventView = (event) => ({
  id: event.id,
  title: event.title,
  art: event.art,
  scene: event.scene,
  figure: event.figure,
  text: event.text,
  options: event.options.map((option) => ({ id: option.id, label: option.label })),
});

// The exploration with the event's outcome for the option chosen, at the
// exploration's end: the option's text, and for a fight the foes at the
// character's level, against the character with its HP of the exploration's
// end. In an ambush the foes all move first; a speed bonus makes the
// character quicker. Won, the fight pays as one of the exploration's
// reference fights does, and the foes, being people, leave gold and now and
// then an item (itemChance each); lost, the character faints (or, in a safe
// place, only gets away) as after a lost fight on the way.
export function resolveEvent({ hunt, event, optionId, character, equipped, name, seed }, content) {
  const option = event.options.find((candidate) => candidate.id === optionId);
  const { outcome } = option;
  const t = hunt.minutes * 60000;
  const told = { t, type: 'event', text: `${event.title}. ${option.label}: ${option.text}` };
  const view = { ...eventView(event), option: { id: option.id, label: option.label, text: option.text }, fight: null };
  if (outcome.kind !== 'fight') return { ...hunt, entries: [...hunt.entries, told], event: view };

  const rng = createRng(`${seed}:event:${option.id}`);
  const area = content.areasById[hunt.areaId];
  const texts = content.texts;
  const enemies = encounterCombatants({ members: outcome.foes.map((monsterId) => ({ monsterId, level: character.level })) }, content);
  const player = playerCombatant({ character, equipped, hp: hunt.hpEnd, name, area }, content);
  const ally = { ...player, hp: hunt.hpEnd, ...(outcome.speedBonus && { speed: player.speed * (1 + outcome.speedBonus) }) };
  const fight = simulateFight({ allies: [ally], enemies, rng, content, record: true, trait: area.trait, ambush: outcome.ambush === true });
  const index = hunt.fights.length;
  const hpBefore = hunt.hpEnd;
  let hpNow = fight.units.find((unit) => unit.id === ally.id).hp;
  const summary = {
    index,
    t,
    elite: false,
    champion: false,
    tough: false,
    event: true,
    enemies: enemies.map((enemy) => ({ name: enemy.name, level: enemy.level, monsterId: enemy.monsterId })),
    won: fight.won,
    hpBefore,
    hpAfter: hpNow,
    xp: 0,
    gold: 0,
    materials: {},
    chests: [],
    recovered: 0,
    allies: [combatantView(ally, enemies[0].level, content)],
    enemiesView: enemies.map((enemy) => combatantView(enemy, ally.level, content)),
    events: fight.events,
  };
  const enemyList = enemies.map((enemy) => `${enemy.name} (poz. ${enemy.level})`).join(', ');
  const lines = [outcome.start.replace('{enemies}', enemyList)];
  const items = [...hunt.items];
  let { result } = hunt;

  if (fight.won === true) {
    const { rewards, items: itemRules } = content.balance;
    const otherClassShare = character.level >= itemRules.otherClass.fromLevel ? itemRules.otherClass.share : 0;
    const loot = { filled: new Set(equipped.map((item) => item.slot)), classId: character.classId, maxClassLevel: area.maxLevel, area, otherClassShare };
    let fightXp = 0;
    let fightGold = 0;
    for (const enemy of enemies) {
      const foe = content.monstersById[enemy.monsterId];
      fightXp += monsterXp(foe, enemy.level, content) * enemy.groupFactor;
      fightGold += rewards.goldPerLevel * enemy.level * foe.reward.gold * rng.float(0.5, 1.5) * enemy.groupFactor;
      if (rng.chance(outcome.itemChance ?? 0)) summary.chests.push(items.push(randomItem(enemy.level, rng, content, loot)) - 1);
    }
    summary.xp = Math.round(fightXp * (1 + content.balance.hunt.soloXpBonus));
    summary.gold = Math.round(fightGold);
    summary.recovered = Math.round((player.maxHp - hpNow) * player.recovery);
    hpNow += summary.recovered;
    lines.push(say(texts, 'victory', index), `HP: ${hpBefore} → ${summary.hpAfter}. +${summary.xp} XP, +${summary.gold} złota.`);
    summary.chests.forEach((itemIndex, i) => lines.push(say(content.events.texts, 'loot', i, { item: itemName(items[itemIndex], content) })));
    if (summary.recovered > 0) lines.push(say(texts, 'recover', index, { hp: summary.recovered }));
  } else {
    result = fight.won === false && !area.safe ? 'fainted' : 'escaped';
    hpNow = fight.won === false ? Math.max(1, Math.round(player.maxHp * content.balance.hunt.hpAfterFaint)) : Math.max(1, hpNow);
    lines.push(say(texts, fight.won === null ? 'draw' : result === 'fainted' ? 'defeat' : 'escape', index, { target: name }));
    summary.hpAfter = hpNow;
  }

  return {
    ...hunt,
    result,
    xp: hunt.xp + summary.xp,
    gold: hunt.gold + summary.gold,
    items,
    hpEnd: hpNow,
    fights: [...hunt.fights, summary],
    entries: [...hunt.entries, told, { t, type: 'fight', fight: index, text: lines.join(' ') }],
    // The report opens on the event's fight.
    keyFight: { index },
    event: { ...view, fight: index },
  };
}
