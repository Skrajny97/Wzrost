// @ts-check
// Partie kart na żywo (901 B; DECISIONS.md, „Karty z innymi graczami, z
// mieszkańcami Osady i z nowych źródeł”, point 2, and „Partie kart na żywo:
// zbudowane”): Talia Systemu's match (cards.js) between two players, in turn
// and in the open, as with Szczęsny. Pure, as the whole engine: the server
// gives the time, the seed and the decks.
//
// The match keeps the shape of cards.js's (Match): `me` is the side of the
// one who challenged, `foe` the side of the one challenged, and each player
// sees it from its own side (duelSeen), so the checks of a turn (turnBlock),
// the blows (roundHits), the game's own move (autoTurn) and the page's view
// (matchView) of cards.js serve both. Each side is dealt as newMatch deals
// the player's: its deck shuffled by the match's seed, its reserve drawn.
//
// A round: its leader lays cards from its reserve on its empty lines and may
// use its hero's skill, in the open; then the other one, seeing them (the
// new ones marked „nowa”), lays its own and so plays the round: every card
// hits at once as with Szczęsny, each side's skill working for its own
// cards. Who leads changes every round; the first round's leader comes from
// the match's seed. A move is due turnSeconds after it became due (by the
// server's clock), with graceSeconds more for its way to the server; a move
// missed is made by the game (autoTurn: the strongest cards of the reserve,
// no skill), and missedRounds missed in a row lose the match. Every deadline
// missed is applied in its order when the match is next read (duelCatchUp),
// so the server needs no clock of its own and two reads give the same.
// Both pay the stake at the start; the winner takes both stakes but the
// System's cut (rounded down), and a draw gives each its own stake back.

import { autoTurn, cardRules, cardsLeft, heroSkill, hostTiers, lifeLeft, matchView, newMatch, refill, roundHits, tierStake, turnBlock } from './cards.js';
import { createRng } from './rng.js';

/** @typedef {import('./cards.js').Content} Content */
/** @typedef {import('./cards.js').Match} Match */
/** @typedef {import('./cards.js').Side} Side */
/** @typedef {import('./cards.js').Seat} Seat */
/** @typedef {import('./cards.js').Turn} Turn */
/** @typedef {import('./cards.js').SkillUse} SkillUse */
/** @typedef {import('./cards.js').Hit} Hit */
/** @typedef {SkillUse & { kind: string, power: number }} UsedSkill A hero's skill used in a move, with its kind and its number at the hero's evolution. */
/** @typedef {{ filled: number[], skill: UsedSkill | null, auto: boolean }} Move A move made this round: the lines it laid new cards on, its hero's skill, and whether the game made it for a player who missed it. */
/** @typedef {{ cards: { id: string, level: number }[], hero?: { classId: string, stage: number } | null }} SideSpec A player's side as the server gives it: its deck's cards and its hero. */
/** @typedef {({ key: number, life: number } | null)[]} Board A side's three lines as the round's blows found them: each card's key and its Życie then. */
/**
 * The last round's account: its blows (each with its side), the cards each
 * side lost, the card a Kleryk brought back on each side, each side's skill
 * used in it, and both sides' lines as the blows found them (so the leader's
 * page can play the round it did not see laid).
 * @typedef {{ round: number, hits: Hit[], beaten: { me: number[], foe: number[] }, revived: { me: number | null, foe: number | null }, skills: { me: UsedSkill | null, foe: UsedSkill | null }, before: { me: Board, foe: Board } }} DuelLog
 */
/**
 * A live match as the server keeps it: a Match of cards.js (`me` the one
 * who challenged, `foe` the one challenged; `result` for `me`) with who
 * leads this round, whose move it is (null once over), the moves made this
 * round, each side's moves missed in a row, and when the move is due (the
 * server's ms). `end`: as a Match ends, or `missed`: a player's moves missed.
 * @typedef {{ v: number, duel: 1, seed: string, round: number, me: Side, foe: Side, last: DuelLog | null, result: null | 'won' | 'lost' | 'drawn', end: null | 'out' | 'cap' | 'surrender' | 'missed', lead: Seat, step: Seat | null, moves: { me: Move | null, foe: Move | null }, missed: { me: number, foe: number }, deadline: number }} Duel
 */

/** @type {Seat[]} */
const SEATS = ['me', 'foe'];
const LINES = [0, 1, 2];

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
const clone = (value) => JSON.parse(JSON.stringify(value));

// The other side of the table.
/**
 * @param {Seat} seat
 * @returns {Seat}
 */
export const otherSeat = (seat) => (seat === 'me' ? 'foe' : 'me');

// The live matches' numbers (data/cards.json, `live`).
/**
 * @param {Content} content
 * @returns {Record<string, any>}
 */
export const liveRules = (content) => cardRules(content).live;

const turnMs = (/** @type {Content} */ content) => liveRules(content).turnSeconds * 1000;
const graceMs = (/** @type {Content} */ content) => liveRules(content).graceSeconds * 1000;

// A new live match at `now`: each side dealt as newMatch deals the player's
// (its deck shuffled by the match's seed and its seat, its reserve drawn),
// the first round's leader drawn from the seed, its move due turnSeconds
// from now. `seed` is the server's, never shown.
/**
 * @param {{ seed: string, now: number, me: SideSpec, foe: SideSpec }} setup
 * @param {Content} content
 * @returns {Duel}
 */
export function newDuel({ seed, now, me, foe }, content) {
  /** @param {Seat} seat @param {SideSpec} spec */
  const dealt = (seat, spec) => newMatch({ seed: `${seed}:${seat}`, me: spec, foe: { cards: [] } }, content).me;
  /** @type {Seat} */
  const lead = createRng(`${seed}:lead`).next() < 0.5 ? 'me' : 'foe';
  return {
    v: 1,
    duel: 1,
    seed,
    round: 1,
    me: dealt('me', me),
    foe: dealt('foe', foe),
    last: null,
    result: null,
    end: null,
    lead,
    step: lead,
    moves: { me: null, foe: null },
    missed: { me: 0, foe: 0 },
    deadline: now + turnMs(content),
  };
}

// The match as `seat` sees it: its own side as `me`, the other across the
// table as `foe`, the last round's account and the result its way round (a
// match with Szczęsny's shape, so cards.js's checks, blows, own move and
// view read it). Not a copy: for the functions that only read it.
/**
 * @param {Duel} duel
 * @param {Seat} seat
 * @returns {Match}
 */
export function duelSeen(duel, seat) {
  const turned = seat === 'foe';
  /** @param {Seat} who @returns {Seat} */
  const as = (who) => (turned ? otherSeat(who) : who);
  const last = duel.last && {
    round: duel.last.round,
    hits: turned ? duel.last.hits.map((hit) => ({ ...hit, side: otherSeat(hit.side) })) : duel.last.hits,
    beaten: { me: duel.last.beaten[as('me')], foe: duel.last.beaten[as('foe')] },
    revived: duel.last.revived[as('me')],
    skill: duel.last.skills[as('me')],
    placed: [],
    // What a match with Szczęsny has not: the other side's own, and the
    // lines as the blows found them.
    revivedFoe: duel.last.revived[as('foe')],
    skillFoe: duel.last.skills[as('foe')],
    before: duel.last.before && { me: duel.last.before[as('me')], foe: duel.last.before[as('foe')] },
  };
  const result = turned && duel.result ? /** @type {const} */ ({ won: 'lost', lost: 'won', drawn: 'drawn' })[duel.result] : duel.result;
  return /** @type {Match} */ (/** @type {unknown} */ ({ v: duel.v, seed: duel.seed, round: duel.round, me: duel[as('me')], foe: duel[as('foe')], last, result, end: duel.end }));
}

// Why `seat` cannot make `turn` now, or null: the match still on, its move,
// and the turn as turnBlock checks a player's against the match as `seat`
// sees it (the round, the cards kept on their lines, the empty lines filled
// while the reserve has cards, the skill once a match).
/**
 * @param {Duel} duel
 * @param {Seat} seat
 * @param {unknown} turn
 * @param {Content} content
 * @returns {{ code: string, message: string, status?: number } | null}
 */
export function duelTurnBlock(duel, seat, turn, content) {
  if (duel.result) return { code: 'match_over', message: 'Ta partia już się skończyła.', status: 409 };
  if (duel.step !== seat) return { code: 'not_your_move', message: 'Teraz ruch rywala.', status: 409 };
  return turnBlock(duelSeen(duel, seat), turn, content);
}

// `seat`'s move at `at` (checked by duelTurnBlock first): its cards laid on
// its lines and its hero's skill used, in the open (a Mag's card shows its
// new type at once, a Cień's card swapped goes back to the reserve). The
// leader's move passes the move to the other, due turnSeconds after; the
// other's plays the round (playRound) and, unless the match is over, draws
// both reserves up and gives the next round to the other leader. `auto`:
// the game's move for a player who missed it, which keeps its count of
// moves missed; a player's own move clears it.
/**
 * @param {Duel} current
 * @param {Seat} seat
 * @param {Turn} turn
 * @param {number} at
 * @param {Content} content
 * @param {{ auto?: boolean }} [options]
 * @returns {Duel}
 */
export function duelMove(current, seat, turn, at, content, { auto = false } = {}) {
  const duel = clone(current);
  const side = duel[seat];
  const skill = turn.skill ?? null;
  const hero = skill && side.hero ? heroSkill(side.hero.classId, side.hero.stage, content) : null;
  const before = [...side.lines];
  // The Cień's card goes back to the reserve with the Życie it has.
  if (hero?.kind === 'swap' && skill) side.hand.push(skill.card);
  side.lines = [...turn.lines];
  side.hand = side.hand.filter((key) => !side.lines.includes(key));
  if (hero && skill && side.hero) {
    side.hero.used = true;
    if (hero.kind === 'shift') {
      side.cards[skill.card].type = /** @type {string} */ (skill.type);
      side.cards[skill.card].shifted = true;
    }
  }
  duel.moves[seat] = {
    filled: LINES.filter((line) => side.lines[line] !== null && side.lines[line] !== before[line]),
    skill: hero && skill ? { ...skill, kind: hero.kind, power: hero.power } : null,
    auto,
  };
  if (!auto) duel.missed[seat] = 0;
  const due = at + turnMs(content);
  if (seat === duel.lead) {
    duel.step = otherSeat(seat);
    duel.deadline = due;
    return duel;
  }
  playRound(duel, content);
  if (duel.result) {
    duel.step = null;
    return duel;
  }
  duel.round += 1;
  refill(duel.me, content);
  refill(duel.foe, content);
  duel.lead = otherSeat(duel.lead);
  duel.step = duel.lead;
  duel.moves = { me: null, foe: null };
  duel.deadline = due;
  return duel;
}

// The round played once both have laid: every card hits the card opposite
// (or the other side's first from the front), all at once, from the cards
// as they stand, each side's skill boosting or aiming its own cards (its
// blows are those roundHits gives it seeing the match from its side); the
// cards left with no Życie beaten, a Kleryk's chosen card back with its
// share; the match over when a side has no cards left (both: a draw), or
// after roundCap rounds the side with more cards left, then more Życie, the
// winner (else a draw), as with Szczęsny.
/**
 * @param {Duel} duel changed in place
 * @param {Content} content
 */
function playRound(duel, content) {
  /** @type {Hit[]} */
  const hits = [];
  /** @type {{ me: number | null, foe: number | null }} */
  const revive = { me: null, foe: null };
  for (const seat of SEATS) {
    const used = duel.moves[seat]?.skill ?? null;
    /** @type {Record<number, number>} */
    const boost = {};
    /** @type {{ key: number, line: number } | null} */
    let aim = null;
    if (used) {
      if (used.kind === 'fury') boost[used.card] = used.power;
      if (used.kind === 'aim') {
        aim = { key: used.card, line: /** @type {number} */ (used.target) };
        if (used.power > 0) boost[used.card] = used.power;
      }
      if (used.kind === 'shift' && used.power > 0) boost[used.card] = used.power;
      if (used.kind === 'swap' && used.power > 0) boost[/** @type {number} */ (used.swap)] = used.power;
      if (used.kind === 'revive') revive[seat] = used.card;
    }
    for (const hit of roundHits(duelSeen(duel, seat), content, { boost, aim })) if (hit.side === 'me') hits.push({ ...hit, side: seat });
  }
  /** @param {Side} side @returns {Board} */
  const board = (side) => side.lines.map((key) => (key === null ? null : { key, life: side.cards[key].life }));
  const before = { me: board(duel.me), foe: board(duel.foe) };
  for (const hit of hits) {
    const card = duel[otherSeat(hit.side)].cards[hit.target.key];
    card.life = Math.max(0, card.life - hit.damage);
  }
  /** @type {{ me: number[], foe: number[] }} */
  const beaten = { me: [], foe: [] };
  /** @type {{ me: number | null, foe: number | null }} */
  const revived = { me: null, foe: null };
  for (const seat of SEATS) {
    const side = duel[seat];
    const power = duel.moves[seat]?.skill?.power ?? 0;
    for (const line of LINES) {
      const key = side.lines[line];
      if (key === null || side.cards[key].life > 0) continue;
      if (key === revive[seat]) {
        side.cards[key].life = Math.max(1, Math.round(side.cards[key].max * power));
        revived[seat] = key;
        continue;
      }
      side.lines[line] = null;
      side.out.push(key);
      beaten[seat].push(key);
    }
  }
  duel.last = { round: duel.round, hits, beaten, revived, skills: { me: duel.moves.me?.skill ?? null, foe: duel.moves.foe?.skill ?? null }, before };
  const mine = cardsLeft(duel.me);
  const theirs = cardsLeft(duel.foe);
  if (mine === 0 || theirs === 0) {
    duel.result = mine === 0 && theirs === 0 ? 'drawn' : mine === 0 ? 'lost' : 'won';
    duel.end = 'out';
    return;
  }
  if (duel.round >= cardRules(content).roundCap) {
    const life = lifeLeft(duel.me) - lifeLeft(duel.foe);
    duel.result = mine !== theirs ? (mine > theirs ? 'won' : 'lost') : life !== 0 ? (life > 0 ? 'won' : 'lost') : 'drawn';
    duel.end = 'cap';
  }
}

// The match with every move missed by `now` made, one after another in
// their order: at each deadline passed (its grace too) the player whose move
// it was misses it, and the game makes it for that player at that moment
// (autoTurn: the strongest cards of its reserve, no skill), so the next move
// is due turnSeconds after it; the missedRounds-th move missed in a row loses
// the match. The same match back when nothing was missed.
/**
 * @param {Duel} duel
 * @param {number} now
 * @param {Content} content
 * @returns {Duel}
 */
export function duelCatchUp(duel, now, content) {
  const { missedRounds } = liveRules(content);
  let next = duel;
  while (!next.result && next.step && now > next.deadline + graceMs(content)) {
    const seat = next.step;
    const at = next.deadline + graceMs(content);
    const missed = next.missed[seat] + 1;
    if (missed >= missedRounds) {
      next = clone(next);
      next.missed[seat] = missed;
      next.result = seat === 'me' ? 'lost' : 'won';
      next.end = 'missed';
      next.step = null;
      break;
    }
    next = duelMove(next, seat, autoTurn(duelSeen(next, seat), content), at, content, { auto: true });
    next.missed[seat] = missed;
  }
  return next;
}

// `seat` gives up: the match lost for it.
/**
 * @param {Duel} current
 * @param {Seat} seat
 * @returns {Duel}
 */
export function surrenderDuel(current, seat) {
  const duel = clone(current);
  duel.result = seat === 'me' ? 'lost' : 'won';
  duel.end = 'surrender';
  duel.step = null;
  return duel;
}

// What the winner of a match for `stake` takes (901 B): both stakes but the
// System's cut, rounded down.
/**
 * @param {number} stake
 * @param {Content} content
 */
export const duelPot = (stake, content) => Math.floor(2 * stake * (1 - liveRules(content).systemCut) + 1e-9);

// What each side gets at the end of a match for `stake`: the winner the
// pot, a draw each its own stake back; nothing without a stake or a result.
/**
 * @param {Duel['result']} result `me`'s
 * @param {number} stake
 * @param {Content} content
 * @returns {{ me: number, foe: number }}
 */
export function duelPayout(result, stake, content) {
  if (!(stake > 0) || !result) return { me: 0, foe: 0 };
  if (result === 'drawn') return { me: stake, foe: stake };
  const pot = duelPot(stake, content);
  return result === 'won' ? { me: pot, foe: 0 } : { me: 0, foe: pot };
}

// The stakes two characters may play for (901 B): none, or one of
// Szczęsny's tiers' stakes at the lower of their levels, so the highest is
// his top tier's (tierStake); only none while either is below minLevel.
/**
 * @param {number[]} levels
 * @param {Content} content
 * @returns {number[]}
 */
export function duelStakes(levels, content) {
  const level = Math.min(...levels);
  if (level < liveRules(content).minLevel) return [0];
  return [0, ...new Set(hostTiers(content).map((tier) => tierStake(tier, level, content)))].sort((a, b) => a - b);
}

// The match as the page of `seat` sees it: cards.js's matchView from its
// side (its own reserve, only the number of the other's; never the seed nor
// the decks' order), with who leads this round, whose move it is and until
// when (the server's ms), each side's moves missed in a row, and the moves
// made this round: the leader's lines filled (its new cards, „nowa” for the
// other) and its skill, in the open.
/**
 * @param {Duel} duel
 * @param {Seat} seat
 * @param {Content} content
 * @returns {Record<string, any>}
 */
export function duelView(duel, seat, content) {
  const theirs = otherSeat(seat);
  /** @param {Seat | null} who */
  const near = (who) => (who === null ? null : who === seat ? 'me' : 'foe');
  return {
    ...matchView(duelSeen(duel, seat), content),
    lead: near(duel.lead),
    step: near(duel.step),
    deadline: duel.deadline,
    missed: { me: duel.missed[seat], foe: duel.missed[theirs] },
    moves: { me: duel.moves[seat], foe: duel.moves[theirs] },
  };
}
