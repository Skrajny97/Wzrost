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
// and ends the same way. An option may lead to a further choice (the author:
// "z więcej niż jedną decyzją, po której kliknięciu dalej trzeba coś
// decydować"): its outcome of kind "choice" tells what happened and offers
// new options, and only the last option's outcome ends the event. A case
// gives the outcome of an option further on by its path ("lead/look"), and
// may tell a further choice its own way while its options stay.

import { simulateFight } from './combat.js';
import { companionCombatant } from './companions.js';
import { combatantView, playerCombatant } from './combatant.js';
import { encounterCombatants, fightingPlayer } from './hunt.js';
import { itemName, randomItem } from './items.js';
import { fightPotions } from './potions.js';
import { countList, knownHerbs, professionOpen, professionState } from './professions.js';
import { monsterXp } from './progression.js';
import { createRng } from './rng.js';
import { say, word } from './text.js';
import { weekChance, weekFactor, weekFighter } from './weeks.js';

// The chance an exploration of `minutes` that ended as planned brings an
// event: `chance` at fullChanceMinutes and a share of it below, so a very
// short exploration brings no more events an hour than one of
// fullChanceMinutes (the author's 338 A: very short explorations farmed
// them); above, more and more the longer it is, up to longChance at
// longChanceMinutes (478: "dłuższa wyprawa ma mieć większą szansę max
// 20%"), the same step at each doubling of the time: 10% at half an hour,
// 13.3% at an hour, 16.7% at two, 20% at four. An hour of a long
// exploration still brings fewer events than an hour of short ones.
export function eventChance(content, minutes = content.events.fullChanceMinutes) {
  const { chance, fullChanceMinutes, longChance, longChanceMinutes } = content.events;
  if (minutes <= fullChanceMinutes) return chance * (minutes / fullChanceMinutes);
  const step = Math.min(1, Math.log(minutes / fullChanceMinutes) / Math.log(longChanceMinutes / fullChanceMinutes));
  return chance + (longChance - chance) * step;
}

// The events that can come after an exploration of an inner region: those
// that name it among their `areas`, or any region when they name none (the
// author: "to obecne z ranną kobietą może się pojawiać tylko w Skraju
// Wiatrołomów, Lisich Jarach i Kruczych Wykrotach, bo tylko tam jest
// Błędnica"), not one of their `exceptAreas`, and from `minLevel` only in
// the regions of that level and higher (the author of the fern flower
// without Licho: "powinno moc sie tez wyswietlac wszędzie", "ale nie na
// startowych lvlach"). A draft, an event the author has not approved yet,
// comes only where `drafts` are on (the test version), and an event of the
// Osada (`settlement`: the merchant who pays in the Kompania Kupców'
// reputation) only where the Osada is open.
export const eventsIn = (areaId, drafts, content, settlement = false) =>
  content.events.list.filter(
    (event) =>
      (drafts || !event.draft) &&
      (settlement || !event.settlement) &&
      (!event.areas || event.areas.includes(areaId)) &&
      !event.exceptAreas?.includes(areaId) &&
      (content.areasById[areaId]?.minLevel ?? 0) >= (event.minLevel ?? 0),
  );

// The event an exploration brings, or null. `forced` (an event's id, from
// "Testuj zdarzenia" on the test version) brings that one without the draw,
// in any region, still only after an exploration that ended as planned.
export function eventFor({ hunt, seed, first = false, quick = false, forced = null, drafts = false, settlement = false }, content) {
  if (!content.events || first || quick || hunt.result !== 'success') return null;
  if (forced) {
    const event = content.eventsById[forced];
    return event && (drafts || !event.draft) && (settlement || !event.settlement) ? event : null;
  }
  const rng = createRng(`${seed}:event`);
  if (!rng.chance(eventChance(content, hunt.minutes))) return null;
  const open = eventsIn(hunt.areaId, drafts, content, settlement);
  return open.length ? rng.weighted(open, (event) => event.weight ?? 1) : null;
}

// An option's price in gold (`goldPerLevel` for each level of the
// character: the beggar's coins, the leshy's bread and coins), paid from the
// purse, the character's gold with the exploration's.
export const optionCost = (option, level) => (option.goldPerLevel ? Math.round(option.goldPerLevel * level) : 0);

// Why the character cannot take an option, or null: one of `classes` only
// (the exorcism, the Kleryk's and its evolutions'; the others see it greyed
// out, question 223 B), or a price above the purse.
export function optionLock(option, { classId, level, purse }, content) {
  if (option.classes && !option.classes.includes(classId)) {
    const classes = option.classes.map((id) => content.classesById[id].name).join(word(content, ' i '));
    return { code: 'class_only', text: word(content, 'tylko {classes}', { classes }) };
  }
  if (optionCost(option, level) > purse) return { code: 'not_enough_gold', text: word(content, 'za mało złota') };
  return null;
}

// What the options of a path cost together, at the character's level.
export const pathCost = (steps, level) => steps.reduce((sum, step) => sum + optionCost(step.option, level), 0);

// The choices made so far as the player reads them: each option and what it
// led to, its price so far as {cost}.
const stepsView = (steps, level) =>
  steps.map((step, index) => ({ label: step.option.label, text: step.outcome.text.replaceAll('{cost}', String(pathCost(steps.slice(0, index + 1), level))) }));

// An event as the player sees it: who, where, the text and the options. An
// event of any land (scene "land") stands in the land of the exploration's
// inner region (`area`), on its background (the author: "Tu byłoby używane tło
// danej krainy"). For the character (`who`: its class, level and purse) an
// option shows its price and why it is locked. Further on (`walk`, from
// eventChoices), the choices made so far come with their texts, and the
// options are those of the last one; what they cost is already out of the
// purse.
export const eventView = (event, area = null, who = null, content = null, walk = null) => {
  const level = who?.level ?? 1;
  const spent = walk && who ? pathCost(walk.steps, level) : 0;
  return {
    id: event.id,
    title: event.title,
    art: event.art,
    scene: event.scene === 'land' ? null : event.scene,
    ...(event.scene === 'land' && { land: area?.regionId ?? null }),
    figure: event.figure,
    text: event.text,
    ...(walk?.steps.length > 0 && { steps: stepsView(walk.steps, level) }),
    options: (walk?.options ?? event.options).map((option) => {
      const cost = who ? optionCost(option, who.level) : 0;
      const lock = who && content ? optionLock(option, { ...who, purse: who.purse - spent }, content) : null;
      return { id: option.id, label: option.label, ...(cost > 0 && { cost }), ...(lock && { locked: lock.text }) };
    }),
  };
};

// The case behind an event, drawn from the exploration's seed, or the one
// "Testuj zdarzenia" chose (`forced`); null for an event without cases.
export function eventCase(event, seed, forced = null) {
  if (!event.cases) return null;
  if (forced) return event.cases.find((candidate) => candidate.id === forced) ?? null;
  return createRng(`${seed}:event:case`).weighted(event.cases, (candidate) => candidate.weight);
}

// What an option leads to: its outcome in the case, or its own; either may
// be a list of outcomes, drawn from by weight. Further on, the case names
// the outcome by the option's path (`key`, "lead/look"). A case's further
// choice without options tells it its own way, with the option's options.
export function eventOutcome(option, chosen, key = option.id) {
  const own = option.outcome;
  const found = chosen?.outcomes[key] ?? own;
  if (!Array.isArray(found) && found?.kind === 'choice' && !found.options && own?.kind === 'choice') return { ...own, ...found };
  return found;
}

// A path of options chosen one after another (their ids): the case, each
// step's option and outcome, and the options it stands before now, or null
// once it has ended (its last outcome is not a further choice). Null for a
// path the event does not have. Each step's outcome of a list is drawn as
// at the event's end (resolveEvent), the same each time.
export function eventChoices(event, path, { seed, caseId = null, endingId = null, drafts = false }) {
  const chosen = eventCase(event, seed, caseId);
  let options = event.options;
  const steps = [];
  for (const id of path) {
    const option = options?.find((candidate) => candidate.id === id);
    if (!option) return null;
    const key = [...steps.map((step) => step.option.id), id].join('/');
    const found = eventOutcome(option, chosen, key);
    const outcome = Array.isArray(found) ? listOutcome(found, { endingId, drafts }, createRng(`${seed}:event:${key}`)) : found;
    steps.push({ option, outcome, key });
    options = outcome.kind === 'choice' ? outcome.options : null;
  }
  return { chosen, steps, options };
}

// Every outcome a case leads to (`chosen`, or none), further choices' too,
// each list with all its outcomes.
export function caseOutcomes(event, chosen) {
  const all = [];
  const walk = (options, prefix) => {
    for (const option of options) {
      const path = [...prefix, option.id];
      for (const outcome of [eventOutcome(option, chosen, path.join('/'))].flat()) {
        all.push(outcome);
        if (outcome?.kind === 'choice' && outcome.options) walk(outcome.options, path);
      }
    }
  };
  walk(event.options, []);
  return all;
}

// Every outcome of an event, in each of its cases.
export const eventOutcomes = (event) => (event.cases ? event.cases.flatMap((one) => caseOutcomes(event, one)) : caseOutcomes(event, null));

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

// Herbs the character's Zielarstwo knows, once it is open, or none.
function herbsKnown(character, content) {
  const profession = content.gathering && content.professionsById[content.gathering.profession];
  if (!profession || !professionOpen(profession, character.level, content)) return [];
  return knownHerbs(professionState(character.professions, content.gathering.profession).level, content);
}

// Resources lost, as "Drewno −12, Kamień −5".
const resourceLoss = (lost, content) =>
  Object.entries(lost)
    .map(([id, count]) => `${content.resourcesById[id].name} −${count}`)
    .join(', ');

// The exploration with the event's outcome for the option chosen, at the
// exploration's end, in the event's case (`caseId` from "Testuj zdarzenia",
// or drawn), with the outcome of a list that "Testuj zdarzenia" chose
// (`endingId`) or a drawn one, drafts only with `drafts`: the outcome's
// text, and what it brings. The option's price ({cost} in the texts) is paid
// from the purse, the character's gold (`purse`) with the exploration's,
// unless the outcome takes the gold another way (`free`); what the event
// takes from the purse is the exploration's `spent`.
//
// A reward is gold (`gold` times rewards.goldPerLevel at the character's
// level, ±25%), an item at the character's level of a rarity drawn from
// `itemRarities`, `herbs` for the bag (the Kwiat paproci), kept in the
// exploration's `herbs`, or `herbsKnown.count` herbs the character's
// Zielarstwo knows ({herbs}), and without Zielarstwo gold (`herbsKnown.gold`,
// told by its goldText), the XP of beating `xpFoes` at the character's level
// ({xp}), reputation with brotherhoods of the Osada (`reputation`), or today's
// rumor of an elite or a champion (`rumor`: the one the server passes, told
// with {area} and {creature}; noRumorText without one). It may also be a
// buff for the next explorations, as a potion for a time gives (`buff`, also
// a curse), or free stat points (`points`). A loss takes `goldShare` of the
// purse, at most `goldCapPerLevel` gold a level, or `resourcesShare` of the
// resources the exploration gathered, told by `lossText` ({gold},
// {resources}) when anything was lost. A faint loses `goldLoss` of the
// exploration's gold, told by `lossText` when anything was lost.
//
// A fight is against the foes at the character's level, with the
// character's HP of the exploration's end. In an ambush the foes all move first; a speed bonus
// makes the character quicker. Won, the fight pays as one of the
// exploration's reference fights does, the foes leave gold and, with
// itemChance, now and then an item, and `win` adds gold or an item of its
// rarities (told by its text, {item}); lost, the character faints (or, in a
// safe place, only gets away) as after a lost fight on the way. The week
// the exploration set out in (`hunt.week`, weeks.js) works in the fight as
// on the way: its share of the foes' XP and gold, of the chance of their
// item and of the character's stats; a reward with no fight gives just what
// its text names ("+15 reputacji u Kompanii Kupców").
export function resolveEvent(
  {
    hunt,
    event,
    optionId,
    caseId = null,
    endingId = null,
    drafts = false,
    character,
    equipped,
    name,
    seed,
    purse = 0,
    rumor = null,
    companions = [],
    potions = {},
    healBelow,
    buffs = {},
    trophies = {},
  },
  content,
) {
  // `optionId` is the option chosen, or the path of options to it when the
  // event led to further choices (eventChoices).
  const path = [optionId].flat();
  const before = eventChoices(event, path.slice(0, -1), { seed, caseId, endingId, drafts });
  const option = before.options.find((candidate) => candidate.id === path.at(-1));
  const chosen = before.chosen;
  const key = path.join('/');
  const t = hunt.minutes * 60000;
  const rng = createRng(`${seed}:event:${key}`);
  const found = eventOutcome(option, chosen, key);
  const outcome = Array.isArray(found) ? listOutcome(found, { endingId, drafts }, rng) : found;
  const area = content.areasById[hunt.areaId];
  // Every option of the path has its price, unless the outcome takes the
  // gold another way.
  const cost = outcome.free ? 0 : pathCost(before.steps, character.level) + optionCost(option, character.level);
  const spent = (hunt.spent ?? 0) + cost;
  const fill = (text, values = {}) => Object.entries({ cost, ...values }).reduce((done, [key, value]) => done.replaceAll(`{${key}}`, String(value)), text);
  const steps = stepsView(before.steps, character.level);
  const tell = (text) => ({ t, type: 'event', text: `${event.title}. ${[...steps.map((step) => `${step.label}: ${step.text}`), `${option.label}: ${text}`].join(' ')}` });
  const view = (text) => ({
    ...eventView(event, area),
    case: chosen?.id ?? null,
    ...(steps.length > 0 && { steps }),
    option: { id: option.id, label: option.label, text },
    fight: null,
    ...(cost > 0 && { cost }),
  });
  const goldOf = (times) => Math.round(content.balance.rewards.goldPerLevel * character.level * times * rng.float(0.75, 1.25));
  const itemOf = (rarities) => {
    const [rarityId] = rng.weighted(Object.entries(rarities), ([, weight]) => weight);
    return randomItem(character.level, rng, content, { ...lootRules(character, equipped, area, content), rarityId });
  };

  if (outcome.kind === 'none') {
    const text = fill(outcome.text);
    return { ...hunt, spent, entries: [...hunt.entries, tell(text)], event: view(text) };
  }

  if (outcome.kind === 'faint') {
    const lost = Math.min(hunt.gold, Math.max(hunt.gold > 0 ? 1 : 0, Math.round(hunt.gold * outcome.goldLoss)));
    const text = fill(lost > 0 ? `${outcome.text} ${outcome.lossText}` : outcome.text, { gold: lost });
    return { ...hunt, spent, gold: hunt.gold - lost, entries: [...hunt.entries, tell(text)], event: { ...view(text), loss: { gold: lost } } };
  }

  if (outcome.kind === 'loss') {
    const left = Math.max(0, purse + hunt.gold - spent);
    const cap = outcome.goldCapPerLevel ? outcome.goldCapPerLevel * character.level : Infinity;
    const gold = outcome.goldShare ? Math.min(left, Math.round(Math.min(left * outcome.goldShare, cap))) : 0;
    const resources = {};
    const lost = {};
    for (const [id, amount] of Object.entries(hunt.resources ?? {})) {
      const taken = Math.round(amount * (outcome.resourcesShare ?? 0));
      if (taken > 0) lost[id] = taken;
      if (amount - taken > 0) resources[id] = amount - taken;
    }
    const any = gold > 0 || Object.keys(lost).length > 0;
    const text = fill(any ? `${outcome.text} ${outcome.lossText}` : outcome.text, { gold, resources: resourceLoss(lost, content) });
    return {
      ...hunt,
      spent: spent + gold,
      ...(outcome.resourcesShare && { resources }),
      entries: [...hunt.entries, tell(text)],
      event: { ...view(text), loss: { gold, resources: lost } },
    };
  }

  if (outcome.kind === 'reward') {
    let gold = outcome.gold ? goldOf(outcome.gold) : 0;
    const items = [...hunt.items];
    const item = outcome.itemRarities ? itemOf(outcome.itemRarities) : null;
    if (item) items.push(item);
    const herbs = { ...hunt.herbs };
    const given = { ...outcome.herbs };
    let told = outcome.text;
    if (outcome.herbsKnown) {
      const known = herbsKnown(character, content);
      if (known.length > 0) {
        for (let i = 0; i < outcome.herbsKnown.count; i++) {
          const herb = rng.pick(known);
          given[herb.id] = (given[herb.id] ?? 0) + 1;
        }
      } else {
        gold += goldOf(outcome.herbsKnown.gold);
        told = outcome.herbsKnown.goldText;
      }
    }
    for (const [id, count] of Object.entries(given)) herbs[id] = (herbs[id] ?? 0) + count;
    const xp = outcome.xpFoes ? Math.round(outcome.xpFoes.reduce((sum, id) => sum + monsterXp(content.monstersById[id], character.level, content), 0) * (1 + content.balance.hunt.soloXpBonus)) : 0;
    const heard = outcome.rumor ? rumor : null;
    if (outcome.rumor && !heard) told = outcome.noRumorText;
    const text = fill(told, {
      gold,
      item: item ? itemName(item, content) : '',
      herbs: countList(given, content.herbsById),
      xp,
      area: heard ? content.areasById[heard.areaId].name : '',
      creature: heard ? content.monstersById[heard.monsterId].counted[0] : '',
    });
    const herbsGiven = Object.keys(given).length > 0;
    return {
      ...hunt,
      spent,
      gold: hunt.gold + gold,
      xp: hunt.xp + xp,
      items,
      ...(herbsGiven && { herbs }),
      entries: [...hunt.entries, tell(text)],
      event: {
        ...view(text),
        reward: {
          gold,
          item: item ? items.length - 1 : null,
          herbs: herbsGiven ? given : null,
          ...(xp > 0 && { xp }),
          ...(outcome.buff && { buff: outcome.buff }),
          ...(outcome.points && { points: outcome.points }),
          ...(outcome.reputation && { reputation: outcome.reputation }),
          ...(heard && { rumor: heard }),
        },
      },
    };
  }

  const texts = content.texts;
  // The companions who went on the exploration and are still standing fight
  // beside the character, each with the HP it ended the exploration with
  // (the author, 5.11.2026: "nie walczył w zdarzeniu to taki błąd"). With
  // them the foes grow as on the exploration; a character alone meets foes
  // with only a share of the late and end game's growth (438.3 A).
  const ended = new Map((hunt.companions ?? []).map((one) => [one.id, one]));
  const mates = companions.flatMap((companion, index) => {
    const end = ended.get(companion.id);
    if (!end || end.fainted || end.hpEnd <= 0) return [];
    return [{ id: companion.id, unit: companionCombatant(companion, { hp: end.hpEnd, area, id: `a${index + 1}` }, content) }];
  });
  const growth = mates.length > 0 ? {} : { growth: content.balance.monsters.soloGrowth };
  const enemies = encounterCombatants({ members: outcome.foes.map((monsterId) => ({ monsterId, level: character.level })) }, content, growth);
  // The potions the character still carries of those taken along, its
  // strengthening potions still working (in their number of the first
  // fights) and its trophies work in the event's fight as on the way (the
  // author, 5.11.2026: "niech towarzysze i mikstury działają też na walkach
  // ze zdarzeń").
  const left = Object.fromEntries(
    Object.entries(potions)
      .map(([id, count]) => [id, count - (hunt.potionsUsed?.[id] ?? 0)])
      .filter(([, count]) => count > 0),
  );
  const kit = fightPotions(left, healBelow ?? content.potionUse?.healBelow, content);
  const on = {};
  for (const [kind, window] of Object.entries(buffs)) {
    if (Number.isFinite(window.fights) ? hunt.fights.length < window.fights : t < window.ms) on[kind] = window.bonus;
  }
  const fighter = weekFighter(character, hunt.week);
  const player = playerCombatant({ character: fighter, equipped, hp: hunt.hpEnd, name, area }, content);
  const armed = fightingPlayer({ unit: player, character: fighter, equipped, name, area, hp: hunt.hpEnd, on, kit, trophies }, content);
  const ally = { ...armed, ...(outcome.speedBonus && { speed: armed.speed * (1 + outcome.speedBonus) }) };
  const allies = [ally, ...mates.map((mate) => mate.unit)];
  const fight = simulateFight({ allies, enemies, rng, content, record: true, trait: area.trait, ambush: outcome.ambush === true });
  const hpOf = (unit) => Math.max(0, fight.units.find((one) => one.id === unit.id).hp);
  // The potions drunk in it, and the fights of the strengthening ones.
  const potionsUsed = { ...(hunt.potionsUsed ?? {}) };
  for (const id of fight.drunk) potionsUsed[id] = (potionsUsed[id] ?? 0) + 1;
  const buffFights = { ...(hunt.buffFights ?? {}) };
  for (const kind of Object.keys(on)) buffFights[kind] = (buffFights[kind] ?? 0) + 1;
  const companionsAfter = hunt.companions?.map((one) => {
    const mate = mates.find((candidate) => candidate.id === one.id);
    return mate ? { ...one, hpEnd: hpOf(mate.unit), fainted: hpOf(mate.unit) <= 0 } : one;
  });
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
    allies: allies.map((unit) => combatantView(unit, enemies[0].level, content)),
    enemiesView: enemies.map((enemy) => combatantView(enemy, ally.level, content)),
    events: fight.events,
  };
  const enemyList = enemies.map((enemy) => word(content, '{name} (poz. {level})', { name: enemy.name, level: enemy.level })).join(', ');
  const lines = [outcome.start.replace('{enemies}', enemyList)];
  for (const mate of mates.filter((one) => hpOf(one.unit) <= 0)) lines.push(say(texts, 'companionDown', index, { name: mate.unit.name }));
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
      fightGold += rewards.goldPerLevel * enemy.level * foe.reward.gold * rng.float(0.5, 1.5) * enemy.groupFactor * weekFactor(hunt.week, 'gold');
      if (rng.chance(weekChance(outcome.itemChance ?? 0, hunt.week, 'items'))) summary.chests.push(items.push(randomItem(enemy.level, rng, content, loot)) - 1);
    }
    // What the win leaves besides: the offerings' silver, the leshy's gift.
    if (outcome.win?.gold) fightGold += goldOf(outcome.win.gold);
    const won = outcome.win?.itemRarities ? itemOf(outcome.win.itemRarities) : null;
    // Each companion who fought takes its share, as on the exploration.
    summary.xp = Math.round(fightXp * (1 + content.balance.hunt.soloXpBonus) * (1 - mates.length * content.settlement.companions.xpCost) * weekFactor(hunt.week, 'xp'));
    summary.gold = Math.round(fightGold);
    summary.recovered = Math.round((player.maxHp - hpNow) * player.recovery);
    hpNow += summary.recovered;
    lines.push(say(texts, 'victory', index), word(content, 'HP: {before} → {after}. +{xp} XP, +{gold} złota.', { before: hpBefore, after: summary.hpAfter, xp: summary.xp, gold: summary.gold }));
    summary.chests.forEach((itemIndex, i) => lines.push(say(content.events.texts, 'loot', i, { item: itemName(items[itemIndex], content) })));
    if (won) {
      summary.chests.push(items.push(won) - 1);
      lines.push(outcome.win.text.replace('{item}', itemName(won, content)));
    }
    if (summary.recovered > 0) lines.push(say(texts, 'recover', index, { hp: summary.recovered }));
  } else {
    result = fight.won === false && !area.safe ? 'fainted' : 'escaped';
    hpNow = fight.won === false ? Math.max(1, Math.round(player.maxHp * content.balance.hunt.hpAfterFaint)) : Math.max(1, hpNow);
    lines.push(say(texts, fight.won === null ? 'draw' : result === 'fainted' ? 'defeat' : 'escape', index, { target: name }));
    summary.hpAfter = hpNow;
  }

  const told = fill(outcome.text);
  return {
    ...hunt,
    spent,
    result,
    xp: hunt.xp + summary.xp,
    gold: hunt.gold + summary.gold,
    items,
    hpEnd: hpNow,
    potionsUsed,
    buffFights,
    ...(companionsAfter && { companions: companionsAfter }),
    fights: [...hunt.fights, summary],
    entries: [...hunt.entries, tell(told), { t, type: 'fight', fight: index, text: lines.join(' ') }],
    // The report opens on the event's fight.
    keyFight: { index },
    event: { ...view(told), fight: index },
  };
}
