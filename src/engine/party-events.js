// @ts-check
// Zdarzenia drużynowe (data/party-events.json; the author's 844 A, 845 A,
// 846 A, 847 B and the events 848.1–848.5, 12.11.2026): a Drużyna's trip
// that ended as planned brings at most one event for the whole trip, as
// often as an exploration brings one (events.js: eventChance), each as
// likely as the others, drawn from the trip's seed, so the claim of every
// member's report finds the same one (the author, 12.11.2026: „wygenerujmy
// specjalne drużynowe zdarzenia”). Only the trip's leader chooses, at the
// claim of its own report; the others choose nothing. Nobody's choice in
// autoHours hours settles it with its `auto` option, the most careful one.
// What comes of the choice is drawn once for the whole party (a list of
// outcomes by weight), and each who went gets the whole of it at its own
// level, shared with nobody (847 B): gold, XP, herbs, potions, materials and
// gems, reputation with the Osada's brotherhoods, a loss of HP, or one fight
// of them all against the event's foes at the trip leader's level. A boon is
// the party's, for its next trip (parties.js on the server). The server
// keeps the event and its result and writes each member's report of it
// (src/server/party-events.js).

import { simulateFight } from './combat.js';
import { combatantView, playerCombatant } from './combatant.js';
import { materialPiece, materialsText, rarityUpChances } from './crafting.js';
import { eventChance } from './events.js';
import { encounterCombatants } from './hunt.js';
import { countList, knownHerbs, professionOpen, professionState } from './professions.js';
import { monsterXp } from './progression.js';
import { createRng } from './rng.js';
import { say, word } from './text.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {Record<string, any>} PartyEvent An event of data/party-events.json. */
/** @typedef {Record<string, any>} PartyOutcome What an option of a party event leads to. */
/** @typedef {Record<string, any>} Area An inner region (content.areas). */
/** @typedef {Record<string, any>} PartyResult A resolved party event (resolvePartyEvent). */
/** @typedef {Record<string, any>} FightView The party's fight as its reports show it (partyFight). */
/** @typedef {{ id: number, name: string, hpEnd: number, character: Record<string, any>, equipped: Record<string, any>[] }} PartyMember One who went, as the event is resolved: its character and gear now, its HP at the trip's end. */
/** @typedef {{ gold: number, xp: number, part?: string, herbs?: Record<string, number>, herbsGold?: boolean, potions?: Record<string, number>, materials?: Record<string, number>, minerals?: Record<string, number>, reputation?: Record<string, number>, hpLoss?: number, faint?: boolean }} Share What one member gets of a result. */
/** @typedef {import('./rng.js').Rng} Rng */

// Where a person would stand on the land's background: the party events
// have no figure of their own, but the event sheet places one anyway.
const FIGURE = Object.freeze({ left: 50, bottom: 0, height: 60 });

// A text of party-events.json with its {name} gaps filled; a gap it was not
// given stays as written.
/**
 * @param {string} text
 * @param {Record<string, string | number>} values
 * @returns {string}
 */
const fill = (text, values) => text.replace(/\{(\w+)\}/g, (whole, /** @type {string} */ name) => (Object.hasOwn(values, name) ? String(values[name]) : whole));

// The event a trip brings, or null: only one that ended as planned, by the
// chance of an exploration of its length, the drafts (events the author has
// not approved yet) only where `drafts` are on (the test version). `seed`:
// the trip's, the same in every member's exploration.
/**
 * @param {{ hunt: Record<string, any>, seed: string, drafts?: boolean }} trip
 * @param {Content} content
 * @returns {PartyEvent | null}
 */
export function partyEventFor({ hunt, seed, drafts = false }, content) {
  if (!content.partyEvents || !content.events || hunt.result !== 'success') return null;
  const rng = createRng(`${seed}:party-event`);
  if (!rng.chance(eventChance(content, hunt.minutes))) return null;
  const open = content.partyEvents.list.filter((/** @type {PartyEvent} */ event) => drafts || !event.draft);
  return open.length > 0 ? rng.weighted(open, (/** @type {PartyEvent} */ event) => event.weight ?? 1) : null;
}

// The best healing potion among those carried (`potions`, by id), the one a
// leader gives away for an option of `leaderPotion` (the most it heals, then
// the highest level), or null for none.
/**
 * @param {Record<string, number> | null | undefined} potions
 * @param {Content} content
 * @returns {string | null}
 */
export function carriedHealing(potions, content) {
  /** @type {Record<string, any> | null} */
  let best = null;
  for (const [id, count] of Object.entries(potions ?? {})) {
    const potion = content.potionsById[id];
    if (!potion?.effect?.heal || !(count > 0)) continue;
    if (!best || potion.effect.heal > best.effect.heal || (potion.effect.heal === best.effect.heal && potion.level > best.level)) best = potion;
  }
  return best?.id ?? null;
}

// Why the leader cannot take an option, or null: one that gives away a
// healing potion (`leaderPotion`) while it carries none (`potion` false).
/**
 * @param {Record<string, any>} option
 * @param {{ potion: boolean }} leader
 * @param {Content} content
 * @returns {{ code: string, text: string } | null}
 */
export function partyOptionLock(option, { potion }, content) {
  return option.leaderPotion && !potion ? { code: 'no_potion', text: content.partyEvents.texts.noPotion } : null;
}

// The event as its leader sees it, on the background of the trip's land:
// its title, text, the line of whom it decides for (`names`: the others who
// went) and the options, greyed out with why where it cannot take them.
/**
 * @param {PartyEvent} event
 * @param {{ area?: Area | null, names?: string[], potion?: boolean }} leader
 * @param {Content} content
 */
export function partyEventView(event, { area = null, names = [], potion = false }, content) {
  const { texts } = content.partyEvents;
  return {
    id: event.id,
    title: event.title,
    art: null,
    scene: null,
    land: area?.regionId ?? null,
    figure: { ...FIGURE },
    text: event.text,
    ...(names.length > 0 && { note: fill(texts.leaderNote, { names: names.join(', ') }) }),
    options: event.options.map((/** @type {Record<string, any>} */ option) => {
      const lock = partyOptionLock(option, { potion }, content);
      return { id: option.id, label: option.label, ...(lock && { locked: lock.text }) };
    }),
  };
}

// One outcome of a list, drawn by weight once for the whole party, the
// drafts only where they are on.
/**
 * @param {PartyOutcome[]} list
 * @param {boolean} drafts
 * @param {Rng} rng
 * @returns {PartyOutcome}
 */
const drawnOutcome = (list, drafts, rng) =>
  rng.weighted(
    list.filter((one) => drafts || !one.draft),
    (one) => one.weight,
  );

// The outcome a result names: an option's own, or one of its list, by id
// (by its place in the list for one without).
/**
 * @param {Record<string, any>} option
 * @param {PartyResult} result
 * @returns {PartyOutcome}
 */
function outcomeOf(option, result) {
  if (!Array.isArray(option.outcome)) return option.outcome;
  return option.outcome.find((/** @type {PartyOutcome} */ one) => result.outcome !== null && one.id === result.outcome) ?? option.outcome[result.index ?? 0];
}

// Herbs the character's Zielarstwo knows, once it is open, or none (as for
// an exploration's event, events.js).
/**
 * @param {Record<string, any>} character
 * @param {Content} content
 */
function herbsKnown(character, content) {
  const profession = content.gathering && content.professionsById[content.gathering.profession];
  if (!profession || !professionOpen(profession, character.level, content)) return [];
  return knownHerbs(professionState(character.professions, content.gathering.profession).level, content);
}

// The best healing potion a character of `level` may get: of a level up to
// its own, the recipes a resident of the Osada teaches left out (Balsam
// Jagny stays hers to give).
/**
 * @param {number} level
 * @param {Content} content
 * @returns {Record<string, any> | null}
 */
function healingFor(level, content) {
  return content.potions
    .filter((/** @type {Record<string, any>} */ potion) => potion.effect?.heal && !potion.taught && potion.level <= level)
    .reduce((/** @type {Record<string, any> | null} */ best, /** @type {Record<string, any>} */ potion) => (!best || potion.level > best.level ? potion : best), null);
}

// The gem `step` gems below the best a character of `level` may get (the
// gems of Górnictwo by their level), the first one at the least.
/**
 * @param {number} level
 * @param {number} step
 * @param {Content} content
 * @returns {Record<string, any> | null}
 */
function gemFor(level, step, content) {
  const gems = content.minerals.filter((/** @type {Record<string, any>} */ mineral) => mineral.kind === 'gem').sort((/** @type {any} */ a, /** @type {any} */ b) => a.level - b.level);
  const best = gems.findLastIndex((/** @type {Record<string, any>} */ gem) => gem.level <= level);
  return gems[Math.max(0, best - step)] ?? null;
}

// `count` pieces of the materials the creatures of the trip's inner region
// leave, each of one of them drawn alike, a rarity or more higher as a
// creature of the member's `level` leaves it (crafting.js: materialPiece).
/**
 * @param {Area} area
 * @param {number} count
 * @param {number} level
 * @param {Rng} rng
 * @param {Content} content
 * @returns {Record<string, number>}
 */
function areaMaterials(area, count, level, rng, content) {
  const creatures = [...new Set([...area.encounters, ...(area.tough ?? [])].flatMap((/** @type {Record<string, any>} */ encounter) => encounter.monsters))].filter(
    (id) => content.materialsByMonster[id],
  );
  /** @type {Record<string, number>} */
  const found = {};
  if (creatures.length === 0) return found;
  const chances = rarityUpChances(level, content);
  for (let i = 0; i < count; i++) {
    const key = materialPiece(content.materialsByMonster[rng.pick(creatures)], chances, rng, content);
    found[key] = (found[key] ?? 0) + 1;
  }
  return found;
}

// What a reward gives one member at its level (`gives`: the outcome, or its
// leader's or the others' part): gold (goldPerLevel × level × `gold`, ±25%),
// the XP of beating `xpFoes`, herbs its Zielarstwo knows (gold without it,
// `herbsGold`), the best healing potions, materials of the trip's land, gems
// and reputation.
/**
 * @param {Record<string, any>} gives
 * @param {PartyMember} member
 * @param {Area} area
 * @param {Rng} rng
 * @param {Content} content
 * @returns {Share}
 */
function rewardOf(gives, member, area, rng, content) {
  const { level } = member.character;
  const goldOf = (/** @type {number} */ times) => Math.round(content.balance.rewards.goldPerLevel * level * times * rng.float(0.75, 1.25));
  /** @type {Share} */
  const share = { gold: gives.gold ? goldOf(gives.gold) : 0, xp: 0 };
  if (gives.xpFoes) {
    const xp = gives.xpFoes.reduce((/** @type {number} */ sum, /** @type {string} */ id) => sum + monsterXp(content.monstersById[id], level, content), 0);
    share.xp = Math.round(xp * (1 + content.balance.hunt.soloXpBonus));
  }
  if (gives.herbsKnown) {
    const known = herbsKnown(member.character, content);
    if (known.length > 0) {
      /** @type {Record<string, number>} */
      const herbs = {};
      for (let i = 0; i < gives.herbsKnown.count; i++) {
        const herb = rng.pick(known);
        herbs[herb.id] = (herbs[herb.id] ?? 0) + 1;
      }
      share.herbs = herbs;
    } else {
      share.gold += goldOf(gives.herbsKnown.gold);
      share.herbsGold = true;
    }
  }
  const potion = gives.potions ? healingFor(level, content) : null;
  if (potion) share.potions = { [potion.id]: gives.potions.count };
  if (gives.materials) share.materials = areaMaterials(area, gives.materials.count, level, rng, content);
  const gem = gives.minerals ? gemFor(level, gives.minerals.step ?? 0, content) : null;
  if (gem) share.minerals = { [gem.id]: gives.minerals.count };
  if (gives.reputation) share.reputation = { ...gives.reputation };
  return share;
}

// The party's one fight against the outcome's foes (the trip leader's
// `level`, the trip's inner region): its players only, each as it is now
// with the HP it ended the trip with, in the trip's order; with two or more
// the foes grow as on the way, one alone meets them as on its own
// (events.js). Ambushed, the foes all move first. Kept for the playback as
// an exploration's event fight is, and each one's HP before and after.
/**
 * @param {{ outcome: PartyOutcome, members: PartyMember[], area: Area, level: number, seed: string }} fight
 * @param {Content} content
 * @returns {FightView}
 */
export function partyFight({ outcome, members, area, level, seed }, content) {
  const allies = members.map((member, index) =>
    playerCombatant({ character: member.character, equipped: member.equipped, hp: Math.max(1, member.hpEnd), name: member.name, area, id: index === 0 ? 'a0' : `p${index}` }, content),
  );
  const growth = allies.length > 1 ? {} : { growth: content.balance.monsters.soloGrowth };
  /** @type {Record<string, any>[]} */
  const enemies = encounterCombatants({ members: outcome.foes.map((/** @type {string} */ monsterId) => ({ monsterId, level })) }, content, growth);
  const fight = simulateFight({ allies, enemies, rng: createRng(`${seed}:fight`), content, record: true, trait: area.trait, ambush: outcome.ambush === true });
  const after = (/** @type {Record<string, any>} */ unit) => Math.max(0, /** @type {Record<string, any>} */ (fight.units.find((/** @type {Record<string, any>} */ one) => one.id === unit.id)).hp);
  return {
    enemies: enemies.map((enemy) => ({ name: enemy.name, level: enemy.level, monsterId: enemy.monsterId })),
    won: fight.won,
    allies: allies.map((unit) => combatantView(unit, level, content)),
    enemiesView: enemies.map((enemy) => combatantView(enemy, allies[0].level, content)),
    events: fight.events,
    hp: Object.fromEntries(members.map((member, index) => [member.id, { before: allies[index].hp, after: after(allies[index]) }])),
  };
}

// The event settled with the option chosen (`optionId`: the leader's, or
// the event's `auto`): its outcome drawn once for everyone from the trip's
// seed, and what each member gets of it at its own level, from its own
// draws (by its id), so it comes out the same however often it is
// resolved. `level`: the trip leader's, the foes'; `leaderId`: who takes
// the leader's part of a split reward. A loss is the share of the most HP
// each loses (hpLoss), a fight lost a faint (`faint`: HP down to
// hunt.hpAfterFaint of the most, no XP or gold lost) and a draw nothing;
// a fight won gives each the foes' XP and gold at its level, as an
// exploration's event fight does without the companions' shares, and what
// `win` names besides. The fight (`fight`) is in the content's language;
// all the rest is numbers and ids, the same in every language.
/**
 * @param {{ event: PartyEvent, optionId: string, seed: string, areaId: string, level: number, leaderId: number, members: PartyMember[], drafts?: boolean }} input
 * @param {Content} content
 * @returns {PartyResult}
 */
export function resolvePartyEvent({ event, optionId, seed, areaId, level, leaderId, members, drafts = false }, content) {
  const option = event.options.find((/** @type {Record<string, any>} */ one) => one.id === optionId);
  // The server takes only an option the event has, so this is never met there.
  if (!option) throw new Error(`No option ${optionId} in the party event ${event.id}.`);
  const key = `${seed}:party-event:${option.id}`;
  /** @type {PartyOutcome} */
  const outcome = Array.isArray(option.outcome) ? drawnOutcome(option.outcome, drafts, createRng(key)) : option.outcome;
  const index = Array.isArray(option.outcome) ? option.outcome.indexOf(outcome) : null;
  const area = content.areasById[areaId];
  const fight = outcome.kind === 'fight' && members.length > 0 ? partyFight({ outcome, members, area, level, seed: key }, content) : null;
  const { rewards } = content.balance;
  /** @type {Record<string, Share>} */
  const shares = {};
  for (const member of members) {
    const rng = createRng(`${key}:${member.id}`);
    const at = member.character.level;
    if (outcome.kind === 'reward') {
      const part = outcome.leader || outcome.others ? (member.id === leaderId ? 'leader' : 'others') : null;
      shares[member.id] = { ...rewardOf(part ? outcome[part] : outcome, member, area, rng, content), ...(part && { part }) };
    } else if (outcome.kind === 'loss') {
      shares[member.id] = { gold: 0, xp: 0, hpLoss: outcome.hpLoss };
    } else if (outcome.kind === 'fight' && fight?.won === true) {
      const groupFactor = content.balance.hunt.groupFactors[outcome.foes.length - 1];
      let xp = 0;
      let gold = 0;
      for (const monsterId of outcome.foes) {
        const foe = content.monstersById[monsterId];
        xp += monsterXp(foe, at, content) * groupFactor;
        gold += rewards.goldPerLevel * at * foe.reward.gold * rng.float(0.5, 1.5) * groupFactor;
      }
      if (outcome.win?.gold) gold += rewards.goldPerLevel * at * outcome.win.gold * rng.float(0.75, 1.25);
      shares[member.id] = {
        gold: Math.round(gold),
        xp: Math.round(xp * (1 + content.balance.hunt.soloXpBonus)),
        ...(outcome.win?.materials && { materials: areaMaterials(area, outcome.win.materials.count, at, rng, content) }),
      };
    } else if (outcome.kind === 'fight' && fight?.won === false) {
      shares[member.id] = { gold: 0, xp: 0, faint: true };
    } else {
      shares[member.id] = { gold: 0, xp: 0 };
    }
  }
  return {
    event: event.id,
    option: option.id,
    outcome: outcome.id ?? null,
    index,
    kind: outcome.kind,
    ...(fight && { won: fight.won }),
    boon: outcome.kind === 'reward' && outcome.boon ? { ...outcome.boon } : null,
    fight,
    members: shares,
  };
}

// The line of the System in a trip's report (every member's, the leader's
// too) about its event: waiting for the leader's choice (`chosenBy` null),
// the leader's choice, or the one made when nobody chose in time.
/**
 * @param {{ event: PartyEvent, leaderName: string, chosenBy?: string | null, optionId?: string | null }} said
 * @param {Content} content
 * @returns {string}
 */
export function partyTripLine({ event, leaderName, chosenBy = null, optionId = null }, content) {
  const { texts } = content.partyEvents;
  const option = event.options.find((/** @type {Record<string, any>} */ one) => one.id === optionId);
  if (!chosenBy || !option) return fill(texts.waiting, { title: event.title, leader: leaderName });
  return fill(chosenBy === 'auto' ? texts.auto : texts.chosen, { title: event.title, leader: leaderName, option: option.label });
}

// A trip's XP and gold with the party's boon it set out with (`boon`: its
// xp and gold shares more), before a faint takes them (faintForfeit); the
// fights keep their own numbers.
/**
 * @param {Record<string, any>} hunt
 * @param {Record<string, number> | null | undefined} boon
 */
export function withBoon(hunt, boon) {
  if (!boon?.xp && !boon?.gold) return hunt;
  return { ...hunt, xp: Math.round(hunt.xp * (1 + (boon.xp ?? 0))), gold: Math.round(hunt.gold * (1 + (boon.gold ?? 0))) };
}

// The System's lines of a trip's report about the party's boon it set out
// with: shorter, more XP, more gold.
/**
 * @param {Record<string, number> | null | undefined} boon
 * @param {Content} content
 * @returns {string[]}
 */
export function boonLines(boon, content) {
  const { texts } = content.partyEvents;
  const percent = (/** @type {number} */ share) => Math.round(share * 100);
  return [
    ...(boon?.haste ? [fill(texts.boonHaste, { percent: percent(boon.haste) })] : []),
    ...(boon?.xp ? [fill(texts.boonXp, { percent: percent(boon.xp) })] : []),
    ...(boon?.gold ? [fill(texts.boonGold, { percent: percent(boon.gold) })] : []),
  ];
}

// One member's report of a resolved event, in the content's language, as an
// exploration's report is made of it (huntReport): `hunt`, with the event,
// the option chosen and what came of it for this member, its fight if one
// came (`fight`: the result's in this language) and what it got; `title`
// for the heading, and `line`, the leader's choice or the one made when
// nobody chose. `hp`: the member's HP before and after (null while it is
// busy elsewhere, `busy`), and the HP the event took (`lost`); `bagLost`:
// the herbs and potions the bag had no room for.
/**
 * @param {{ event: PartyEvent, result: PartyResult, fight?: FightView | null, memberId: number, area: Area, chosenBy: string, hp: { start: number | null, end: number | null, max: number | null, lost?: number, busy?: boolean }, bagLost?: { herbs?: Record<string, number>, potions?: Record<string, number> } }} input
 * @param {Content} content
 */
export function partyEventHunt({ event, result, fight = null, memberId, area, chosenBy, hp, bagLost = {} }, content) {
  const { texts } = content.partyEvents;
  const option = event.options.find((/** @type {Record<string, any>} */ one) => one.id === result.option);
  const outcome = outcomeOf(option, result);
  /** @type {Share} */
  const share = result.members[memberId] ?? { gold: 0, xp: 0 };
  const own = share.part ? outcome[share.part] : outcome;
  const values = {
    gold: share.gold,
    xp: share.xp,
    herbs: countList(share.herbs ?? {}, content.herbsById),
    potions: countList(share.potions ?? {}, content.potionsById),
    materials: materialsText(share.materials ?? {}, content),
    minerals: countList(share.minerals ?? {}, content.mineralsById),
  };
  const won = outcome.kind === 'fight' ? (fight?.won ?? result.won ?? null) : null;
  // What came of it: the outcome's words, a split reward's part, the gold
  // instead of herbs, and a fight's end.
  const said = [fill(share.herbsGold ? own.herbsKnown.goldText : (own.text ?? outcome.text ?? ''), values)];
  /** @type {string[]} */
  const ending = [];
  if (outcome.kind === 'fight' && won === true && outcome.win?.text) ending.push(fill(outcome.win.text, values));
  if (outcome.kind === 'fight' && won === false) ending.push(...(outcome.lose?.text ? [outcome.lose.text] : []), texts.fainted);
  if (outcome.kind === 'fight' && won === null) ending.push(texts.draw);
  said.push(...ending);
  if ((share.hpLoss || share.faint) && hp.busy) said.push(texts.busyHp);
  else if ((hp.lost ?? 0) > 0) said.push(fill(texts.hpLost, { hp: /** @type {number} */ (hp.lost) }));
  const lost = [countList(bagLost.herbs ?? {}, content.herbsById), countList(bagLost.potions ?? {}, content.potionsById)].filter(Boolean).join(', ');
  if (lost) said.push(fill(texts.bagFull, { lost }));
  const text = said.join(' ');
  const label = option.label;
  /** @type {Record<string, any>[]} */
  const fights = [];
  /** @type {Record<string, any>[]} */
  const entries = [{ t: 0, type: 'event', text: `${event.title}. ${label}: ${text}` }];
  if (outcome.kind === 'fight' && fight) {
    const mine = fight.hp?.[memberId] ?? { before: 0, after: 0 };
    fights.push({
      index: 0,
      t: 0,
      elite: false,
      champion: false,
      tough: false,
      event: true,
      enemies: fight.enemies,
      won,
      hpBefore: mine.before,
      hpAfter: mine.after,
      xp: share.xp,
      gold: share.gold,
      materials: share.materials ?? {},
      chests: [],
      recovered: 0,
      allies: fight.allies,
      enemiesView: fight.enemiesView,
      events: fight.events,
    });
    const enemyList = fight.enemies.map((/** @type {Record<string, any>} */ enemy) => word(content, '{name} (poz. {level})', { name: enemy.name, level: enemy.level })).join(', ');
    const lines = [fill(outcome.start, { enemies: enemyList })];
    if (won === true) lines.push(say(content.texts, 'victory', 0), word(content, 'HP: {before} → {after}. +{xp} XP, +{gold} złota.', { before: mine.before, after: mine.after, xp: share.xp, gold: share.gold }));
    lines.push(...ending);
    entries.push({ t: 0, type: 'fight', fight: 0, text: lines.join(' ') });
  }
  return {
    title: `${texts.reportTitle}: ${event.title}`,
    line: fill(chosenBy === 'auto' ? texts.reportAuto : texts.reportChosen, { option: label }),
    hunt: {
      areaId: area.id,
      minutes: 0,
      // A fight lost reads as a faint, one undecided as a retreat; nothing
      // of it is forfeit (no `forfeit`) and no XP is lost.
      result: won === false ? 'fainted' : outcome.kind === 'fight' && won === null ? 'escaped' : 'success',
      xp: share.xp,
      gold: share.gold,
      resources: {},
      materials: share.materials ?? {},
      timePoints: 0,
      items: [],
      hpStart: hp.start,
      hpEnd: hp.end,
      maxHp: hp.max,
      fights,
      entries,
      keyFight: fights.length > 0 ? { index: 0 } : null,
      potionsUsed: {},
      buffFights: {},
      event: {
        id: event.id,
        title: event.title,
        art: null,
        scene: null,
        land: area.regionId,
        figure: { ...FIGURE },
        text: event.text,
        option: { id: option.id, label, text },
        fight: fights.length > 0 ? 0 : null,
      },
    },
  };
}
