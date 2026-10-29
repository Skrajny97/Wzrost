// Events at the end of an exploration (data/events.json): someone met on
// the way back, a short text and a few options, and what follows, told in
// the report (the author: "zdarzenia na koniec wyprawy: wyświetla się nagle
// jakiś NPC który coś proponuje i jest parę opcji do wyboru jeszcze przed
// pokazaniem się Raportu z wyprawy (który będzie uwzględniał zdarzenie)").
// An exploration that ended as planned brings one in a tenth of cases
// (events.chance), each event of the list as likely as the others (the
// author: "niech trafiają się w 10% przypadków… każde będzie miało równe
// prawdopodobieństwo"), but not the very first (the tutorial's) and not a
// Szybkie Polowanie. An event may hide what is really going on: its cases
// (the wounded woman is a bait or truly hurt), drawn once, and each option
// leads to the outcome it has in that case (the author: "pomoc rannej
// kobiecie powinno móc czasem zrobić tak, że nie ma bandytów a ona
// odwdzięcza się złotem albo jakimś rzadkim przedmiotem"), or to one of a
// few, drawn by weight when it is chosen (the author: "Błędnica może się
// pojawić po zadaniu dodatkowych pytań albo umrzeć urażona"). Whether an
// event comes, which, its case and an option's outcome all come from the
// exploration's seed, so the same exploration always brings the same event
// and ends the same way.

import { simulateFight } from './combat.js';
import { combatantView, playerCombatant } from './combatant.js';
import { encounterCombatants } from './hunt.js';
import { itemName, randomItem } from './items.js';
import { monsterXp } from './progression.js';
import { createRng } from './rng.js';
import { say } from './text.js';

// The chance an exploration that ended as planned brings an event.
export const eventChance = (content) => content.events.chance;

// The events that can come after an exploration of an inner region: those
// that name it among their `areas`, or any region when they name none (the
// author: "to obecne z ranną kobietą może się pojawiać tylko w Skraju
// Wiatrołomów, Lisich Jarach i Kruczych Wykrotach, bo tylko tam jest
// Błędnica"). A draft, an event the author has not approved yet, comes only
// where `drafts` are on (the test version).
export const eventsIn = (areaId, drafts, content) =>
  content.events.list.filter((event) => (drafts || !event.draft) && (!event.areas || event.areas.includes(areaId)));

// The event an exploration brings, or null. `forced` (an event's id, from
// "Testuj zdarzenia" on the test version) brings that one without the draw,
// in any region, still only after an exploration that ended as planned.
export function eventFor({ hunt, seed, first = false, quick = false, forced = null, drafts = false }, content) {
  if (!content.events || first || quick || hunt.result !== 'success') return null;
  if (forced) return content.eventsById[forced] && (drafts || !content.eventsById[forced].draft) ? content.eventsById[forced] : null;
  const rng = createRng(`${seed}:event`);
  if (!rng.chance(eventChance(content))) return null;
  const open = eventsIn(hunt.areaId, drafts, content);
  return open.length ? rng.weighted(open, (event) => event.weight ?? 1) : null;
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

// The case behind an event, drawn from the exploration's seed, or the one
// "Testuj zdarzenia" chose (`forced`); null for an event without cases.
export function eventCase(event, seed, forced = null) {
  if (!event.cases) return null;
  if (forced) return event.cases.find((candidate) => candidate.id === forced) ?? null;
  return createRng(`${seed}:event:case`).weighted(event.cases, (candidate) => candidate.weight);
}

// What an option leads to: its outcome in the case, or its own; either may
// be a list of outcomes, drawn from by weight.
export const eventOutcome = (option, chosen) => chosen?.outcomes[option.id] ?? option.outcome;

// One outcome of a list: the one "Testuj zdarzenia" chose (`endingId`), or
// one drawn by weight. A draft, an outcome the author has not approved yet,
// is there only where `drafts` are on (the test version).
function listOutcome(list, { endingId, drafts }, rng) {
  const open = list.filter((one) => drafts || !one.draft);
  return open.find((one) => one.id === endingId) ?? rng.weighted(open, (one) => one.weight);
}

// What an item found on an event may be, as for the exploration's finds.
function lootRules(character, equipped, area, content) {
  const { otherClass } = content.balance.items;
  const otherClassShare = character.level >= otherClass.fromLevel ? otherClass.share : 0;
  return { filled: new Set(equipped.map((item) => item.slot)), classId: character.classId, maxClassLevel: area.maxLevel, area, otherClassShare };
}

// The exploration with the event's outcome for the option chosen, at the
// exploration's end, in the event's case (`caseId` from "Testuj zdarzenia",
// or drawn), with the outcome of a list that "Testuj zdarzenia" chose
// (`endingId`) or a drawn one, drafts only with `drafts`: the outcome's
// text, and what it brings. A reward is gold
// (`gold` times rewards.goldPerLevel at the character's level, ±25%), an
// item at the character's level of a rarity drawn from `itemRarities` or
// `herbs` for the bag (the Kwiat paproci), kept in the exploration's `herbs`. A
// fight is against the foes at the character's level (the events' people, or
// a creature, as the Błędnica), with the character's HP of the exploration's
// end. In an ambush the foes all move first; a speed bonus makes the
// character quicker. Won, the fight pays as one of the exploration's
// reference fights does, and the foes leave gold and, with itemChance, now
// and then an item; lost, the character faints (or, in a safe place, only
// gets away) as after a lost fight on the way.
export function resolveEvent({ hunt, event, optionId, caseId = null, endingId = null, drafts = false, character, equipped, name, seed }, content) {
  const option = event.options.find((candidate) => candidate.id === optionId);
  const chosen = eventCase(event, seed, caseId);
  const t = hunt.minutes * 60000;
  const rng = createRng(`${seed}:event:${option.id}`);
  const found = eventOutcome(option, chosen);
  const outcome = Array.isArray(found) ? listOutcome(found, { endingId, drafts }, rng) : found;
  const area = content.areasById[hunt.areaId];
  const tell = (text) => ({ t, type: 'event', text: `${event.title}. ${option.label}: ${text}` });
  const view = (text) => ({ ...eventView(event), case: chosen?.id ?? null, option: { id: option.id, label: option.label, text }, fight: null });

  if (outcome.kind === 'none') return { ...hunt, entries: [...hunt.entries, tell(outcome.text)], event: view(outcome.text) };

  if (outcome.kind === 'reward') {
    const gold = outcome.gold ? Math.round(content.balance.rewards.goldPerLevel * character.level * outcome.gold * rng.float(0.75, 1.25)) : 0;
    const items = [...hunt.items];
    let item = null;
    if (outcome.itemRarities) {
      const [rarityId] = rng.weighted(Object.entries(outcome.itemRarities), ([, weight]) => weight);
      item = randomItem(character.level, rng, content, { ...lootRules(character, equipped, area, content), rarityId });
      items.push(item);
    }
    const herbs = { ...hunt.herbs };
    for (const [id, count] of Object.entries(outcome.herbs ?? {})) herbs[id] = (herbs[id] ?? 0) + count;
    const text = outcome.text.replace('{gold}', String(gold)).replace('{item}', item ? itemName(item, content) : '');
    return {
      ...hunt,
      gold: hunt.gold + gold,
      items,
      ...(outcome.herbs && { herbs }),
      entries: [...hunt.entries, tell(text)],
      event: { ...view(text), reward: { gold, item: item ? items.length - 1 : null, herbs: outcome.herbs ?? null } },
    };
  }

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
    const { rewards } = content.balance;
    const loot = lootRules(character, equipped, area, content);
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
    entries: [...hunt.entries, tell(outcome.text), { t, type: 'fight', fight: index, text: lines.join(' ') }],
    // The report opens on the event's fight.
    keyFight: { index },
    event: { ...view(outcome.text), fight: index },
  };
}
