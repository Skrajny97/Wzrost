// Partie kart na żywo (901 B; src/server/card-duel.js; mock-ups 908.1–908.4):
// Talia Systemu's match with another player, in turn and in the open.
//   908.1: „Zagraj w karty” on the card of another player in the game now
//     (profile.js; from the chat, the Znajomi and the Ranking), never on
//     one's own characters.
//   908.2: the challenge sheet: the stake, from „Bez stawki” up to
//     Szczęsny's highest stake at the lower of the two levels, what a win
//     gives (both stakes but 5%) and the rules in short.
//   908.3: the challenge at the other player, in a sheet over whatever the
//     game shows (like a Wymiana, screens/trade.js), with the time left to
//     answer, „Przyjmij” and „Odrzuć”.
//   908.4: the table in the Salon Gier's „Karty” tab, as Szczęsny's
//     (cards.js mounts it, with its card faces): the other player's bust,
//     „Twój ruch” with the 30 seconds left, the leader's cards marked
//     „nowa” for the one who answers, the round's blows shown before
//     „Walcz” once the table is whole.
// The server cannot push: the chat's poll (chat-news.js, every 15 seconds)
// brings the challenge and the match going on (duelSeen); a challenge sent
// is asked about every two seconds until its answer, and the table asks for
// its match every two seconds while it is on the screen and the page in
// front. Whoever answers a challenge, or hears it was accepted, goes to the
// table. The words come with the server's answers (data/cards.json,
// texts.live), the rest is the page's (t()).

import { portraitSprite } from './art.js';
import { createCardsFx } from './cards-fx.js';
import { h, icon } from './dom.js';
import { formatCountdown, formatNumber } from './format.js';
import { t } from './i18n.js';
import { narratorIdle } from './narrator.js';
import { playSound } from './sound.js';
import { call, serverNow, state } from './state.js';
import { closeSheet, confirmAction, openSheet, toast, withButton } from './ui.js';

const TABLE = '#/osada/casino/cards';
const POLL_MS = 2000;
// The answers that end a challenge before it could be accepted: its sheet
// goes too.
const LAPSED = ['offline', 'no_deck_other', 'no_gold_other', 'stakes_used_other', 'busy', 'answered', 'no_duel'];

// The {…} of a text filled in, and its [a|b] in the form for a woman (a) or
// a man (b).
const filled = (text, vars = {}) => String(text ?? '').replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
const gendered = (text, female) => text.replace(/\[([^[\]|]*)\|([^[\]|]*)\]/g, (_, she, he) => (female ? she : he));
const say = (text, vars, female = false) => gendered(filled(text, vars), female);

// What the chat's poll last told of the character's challenge or match
// (duelNews in the server): { id, state, mine, stake, pot, endsAt, other,
// step, deadline, round }, or null.
let news = null;
// The table's words and shape, from the latest answer of the duel's own
// reads: { texts, types, lines, typeBonus, turnSeconds, acceptSeconds, cut,
// used, limit }.
let table = null;
// The challenge this page sent, until its answer: { id, other }.
let waiting = null;
let waitAskedAt = 0;
// The challenges to this character already shown in a sheet, the matches
// already gone to, and the moves already reminded of off the table.
const asked = new Set();
const begun = new Set();
const reminded = new Set();
// The challenge's sheet while it is open: its countdown's parts.
let popup = null;
// The tables mounted (cards.js), told when a match begins.
const tables = new Set();
// The match followed, to tell its end when no table showed it.
let followed = null;

function take(answer) {
  if (answer?.texts) {
    const { texts, types, lines, typeBonus, turnSeconds, acceptSeconds, cut, used, limit } = answer;
    table = { texts, types, lines, typeBonus, turnSeconds, acceptSeconds, cut, used, limit };
  }
}

// A character's bust, as the Arena's rivals show it.
const bust = (person) => portraitSprite(person.classId, person.appearance, { bust: true, skin: person.skin, evolution: person.evolution ?? undefined }) ?? icon(person.classId, { size: 32 });
const button = (label, kind, run, { disabled = false } = {}) =>
  h('button', { type: 'button', class: `button button--${kind}`, text: label, disabled, onClick: (event) => withButton(event.currentTarget, run) });
const goldText = (gold) => t('{gold} zł', { gold: formatNumber(gold) });
// Whether a table is on the screen now.
const tableInSight = () => [...tables].some((one) => one.inSight());
// Nothing of the narrator's on the screen or due (a character made before
// the introduction has none, as weeks.js counts it) and no other sheet open.
const quiet = () => (state.character?.tutorial === null || narratorIdle()) && !document.querySelector('dialog[open]');

// --- The chat's poll -------------------------------------------------------

// What the chat's poll brought (chat-news.js): the character's challenge or
// match, or none. A match that began goes to the table; one followed that
// is over tells its end, when no table showed it.
export function duelSeen(next) {
  news = next ?? null;
  // A challenge this character sent before the page was loaded anew: its
  // answer asked for every two seconds again.
  if (news?.state === 'proposed' && news.mine && waiting?.id !== news.id) waiting = { id: news.id, other: news.other };
  if (news?.state === 'playing') {
    if (!begun.has(news.id)) matchBegun(news);
    followed = news.id;
  } else if (followed && !tableInSight()) {
    const id = followed;
    followed = null;
    tellEnd(id);
  }
}

// A match over while its table was not on the screen: how it ended, in a
// toast, and the gold it gave in the top bar.
async function tellEnd(id) {
  let answer;
  try {
    answer = await call('GET', `/api/cards/duel?id=${id}`);
  } catch {
    return;
  }
  take(answer);
  const duel = answer.duel;
  if (duel?.state !== 'done' || !duel.match) return;
  toast(`${resultTitle(duel.match.result)} ${endText(duel)}${duel.gold > 0 ? ` ${t('+{gold} zł', { gold: formatNumber(duel.gold) })}` : ''}`);
  if (duel.stake > 0) call('GET', '/api/character').catch(() => {});
}

// A match that began: the table, wherever the player is (the Salon's
// „Karty” tab, which takes it at once when it is on the screen).
function matchBegun(duel) {
  begun.add(duel.id);
  followed = duel.id;
  if (duel.stake > 0) call('GET', '/api/character').catch(() => {});
  const here = [...tables].filter((one) => one.connected());
  if (here.length > 0) for (const one of here) one.load();
  else location.hash = TABLE;
}

// --- 908.1 and 908.2: the button and the challenge -------------------------

// „Zagraj w karty” on another player's card (profile.js), while its player
// is in the game (the server's `cardDuel`) and the Osada is open here.
export function duelButton(profile) {
  if (!profile.cardDuel || !state.character?.settlementOpen) return null;
  return h('button', {
    type: 'button',
    class: 'button button--system button--small duel-button',
    text: t('Zagraj w karty'),
    onClick: (event) => withButton(event.currentTarget, () => openChallenge(profile)),
  });
}

// The challenge's sheet (908.2): the other, the stakes with what a win
// gives, the rules in short; „Wyzwij” sends it.
async function openChallenge(person) {
  const answer = await call('GET', `/api/cards/duel/offer?id=${person.id}`);
  take(answer);
  const { offer } = answer;
  const { texts } = table;
  const other = offer.other;
  const gold = offer.gold;
  const forGold = offer.stakes.length > 1;
  const open = (one) => one.stake === 0 || (one.stake <= gold && table.used < table.limit && !offer.theirsFull);
  // At first the highest stake the player can play for.
  let chosen = [...offer.stakes].reverse().find(open) ?? offer.stakes[0];
  const send = async () => {
    const sent = await call('POST', '/api/cards/duel/challenge', { id: other.id, stake: chosen.stake });
    take(sent);
    closeSheet();
    toast(sent.text);
    if (sent.duel) {
      waiting = { id: sent.duel.id, other: sent.duel.other };
      waitAskedAt = Date.now();
      news = { id: sent.duel.id, state: 'proposed', mine: true, stake: sent.duel.stake, pot: sent.duel.pot, endsAt: sent.duel.endsAt, other: sent.duel.other };
    }
  };
  const render = () =>
    openSheet(
      h(
        'div',
        { class: 'stack duel-sheet' },
        h('h2', { class: 'sheet-title', text: filled(texts.challengeTitle, { name: other.name }) }),
        h(
          'div',
          { class: 'duel-row' },
          h('span', { class: 'select-portrait pvp-arena-portrait', 'aria-hidden': 'true' }, bust(other)),
          h('div', { class: 'duel-who' }, h('p', { class: 'duel-name', text: other.name }), h('p', { class: 'muted', text: filled(texts.online, { className: other.className, level: other.level }) })),
        ),
        h('h3', { class: 'section-title', text: t('Stawka partii') }),
        h(
          'div',
          { class: 'duel-stakes', role: 'radiogroup', 'aria-label': t('Stawka partii') },
          offer.stakes.map((one) =>
            h(
              'button',
              {
                type: 'button',
                class: 'chat-tab',
                role: 'radio',
                'aria-checked': String(one === chosen),
                'aria-selected': String(one === chosen),
                disabled: !open(one),
                onClick: () => {
                  chosen = one;
                  render();
                },
              },
              h('span', { class: 'chat-tab-name', text: one.stake === 0 ? t('Bez stawki') : goldText(one.stake) }),
            ),
          ),
        ),
        h('p', { text: chosen.stake > 0 ? filled(texts.staked, { stake: formatNumber(chosen.stake), pot: formatNumber(chosen.pot), cut: table.cut }) : texts.free }),
        h('p', { class: 'muted', text: forGold ? filled(texts.limits, { max: formatNumber(offer.max), used: table.used, limit: table.limit }) : filled(texts.lowLevel, { level: offer.minLevel }) }),
        forGold && offer.theirsFull && h('p', { class: 'muted', text: t('{name} nie zagra już dziś o złoto. Bez stawki możecie grać dalej.', { name: other.name }) }),
        h('p', { class: 'muted', text: filled(texts.rules, { name: other.name }) }),
        offer.block && h('p', { class: 'region-warning', role: 'status', text: offer.block }),
        h(
          'div',
          { class: 'duel-actions' },
          button(chosen.stake > 0 ? t('Wyzwij o {gold} zł', { gold: formatNumber(chosen.stake) }) : t('Wyzwij bez stawki'), 'world', send, { disabled: Boolean(offer.block) }),
          h('button', { type: 'button', class: 'button button--system', text: t('Anuluj'), onClick: closeSheet }),
        ),
      ),
    );
  render();
}

// The challenge sent, asked about every two seconds until its answer: an
// acceptance goes to the table, a refusal or its lapse says so.
async function askWaiting() {
  if (!waiting || Date.now() - waitAskedAt < POLL_MS) return;
  waitAskedAt = Date.now();
  const { id } = waiting;
  let answer;
  try {
    answer = await call('GET', `/api/cards/duel?id=${id}`);
  } catch {
    return;
  }
  take(answer);
  const duel = answer.duel;
  if (!waiting || waiting.id !== id || !duel || duel.state === 'proposed') return;
  waiting = null;
  const { texts } = table;
  const vars = { name: duel.other.name };
  if (duel.state === 'playing' || duel.state === 'done') {
    toast(say(texts.accepted, vars, duel.other.female));
    playSound('swing');
    news = { ...news, id: duel.id, state: duel.state };
    if (!begun.has(duel.id)) matchBegun(duel);
  } else {
    news = null;
    toast(say(duel.state === 'declined' ? texts.declined : texts.expired, vars, duel.other.female));
  }
}

// --- 908.3: the challenge at the other player -------------------------------

// A challenge to this character, in a sheet over whatever the player does,
// once the narrator and other sheets are done; the app asks every second.
function offerChallenge() {
  const incoming = news?.state === 'proposed' && !news.mine ? news : null;
  if (!incoming || asked.has(incoming.id) || serverNow() > incoming.endsAt) return;
  if (!quiet()) return;
  asked.add(incoming.id);
  showChallenge(incoming.id).catch(() => asked.delete(incoming.id));
}

async function showChallenge(id) {
  const answer = await call('GET', '/api/cards/duel');
  take(answer);
  const duel = answer.duel;
  if (!duel || duel.id !== id || duel.state !== 'proposed' || duel.mine) return;
  // Something came on the screen meanwhile: the next second tries again.
  if (document.querySelector('dialog[open]')) {
    asked.delete(id);
    return;
  }
  const { texts } = table;
  const other = duel.other;
  const clock = h('strong', { class: 'duel-clock' });
  const fill = h('span', { class: 'duel-bar-fill' });
  const act = (accept) => async (event) => {
    const pressed = event.currentTarget;
    if (pressed.disabled) return;
    pressed.disabled = true;
    try {
      const done = await call('POST', '/api/cards/duel/answer', { id: duel.id, accept });
      take(done);
      popup = null;
      closeSheet();
      if (accept && done.duel?.state === 'playing') {
        playSound('swing');
        news = { ...(news ?? {}), id: done.duel.id, state: 'playing', mine: false };
        matchBegun(done.duel);
      } else if (!accept) {
        news = null;
        toast(t('Wyzwanie odrzucone.'));
      }
    } catch (error) {
      toast(error.message);
      if (LAPSED.includes(error.code)) {
        popup = null;
        news = null;
        closeSheet();
      } else if (pressed.isConnected) pressed.disabled = false;
    }
  };
  // „Sulisław (Mag, poz. 66) wyzywa Cię…”: the name stands out.
  const [before, after = ''] = texts.incoming.split('{name}').map((part) => filled(part, { className: other.className, level: other.level }));
  openSheet(
    h(
      'div',
      { class: 'stack duel-sheet' },
      h('h2', { class: 'sheet-title', text: texts.incomingTitle }),
      h(
        'div',
        { class: 'duel-row' },
        h('span', { class: 'select-portrait pvp-arena-portrait', 'aria-hidden': 'true' }, bust(other)),
        h('p', {}, before, h('strong', { class: 'duel-name-inline', text: other.name }), after),
      ),
      h('p', { text: duel.stake > 0 ? filled(texts.incomingStake, { stake: formatNumber(duel.stake), pot: formatNumber(duel.pot) }) : texts.incomingFree }),
      h('div', { class: 'duel-turn', role: 'timer' }, h('div', { class: 'duel-turn-head' }, h('span', { text: t('Na odpowiedź') }), clock), h('span', { class: 'duel-bar' }, fill)),
      duel.stake > 0 && h('p', { class: 'muted', text: filled(texts.incomingGold, { gold: formatNumber(state.character?.gold ?? 0), used: table.used, limit: table.limit }) }),
      h(
        'div',
        { class: 'duel-actions' },
        h('button', { type: 'button', class: 'button button--world', text: t('Przyjmij'), onClick: act(true) }),
        h('button', { type: 'button', class: 'button button--system', text: t('Odrzuć'), onClick: act(false) }),
      ),
    ),
  );
  popup = { id: duel.id, endsAt: duel.endsAt, clock, fill, total: table.acceptSeconds * 1000 };
  tickChallenge();
}

// The challenge's sheet counts down; once its time is up, it goes.
function tickChallenge() {
  if (!popup) return;
  if (!popup.clock.isConnected) {
    popup = null;
    return;
  }
  const left = popup.endsAt - serverNow();
  popup.clock.textContent = formatCountdown(left);
  popup.fill.style.width = `${Math.max(0, Math.min(1, left / popup.total)) * 100}%`;
  if (left <= 0) {
    popup = null;
    closeSheet();
    toast(t('Wyzwanie przepadło.'));
  }
}

// A match going on while its table is not on the screen: the player's move
// asked for once in a sheet, with the way to the table.
function remindMove() {
  if (news?.state !== 'playing' || news.step !== 'me' || tableInSight() || !table) return;
  const key = `${news.id}:${news.round}`;
  if (reminded.has(key) || serverNow() > (news.deadline ?? 0)) return;
  if (!quiet()) return;
  reminded.add(key);
  openSheet(
    h('h2', { class: 'sheet-title', text: t('Partia kart na żywo') }),
    h('p', { class: 'sheet-text', text: filled(table.texts.yourMove, { name: news.other.name }) }),
    h(
      'div',
      { class: 'sheet-actions' },
      h('a', {
        class: 'button button--world',
        href: TABLE,
        text: t('Do stołu'),
        onClick: () => closeSheet(),
      }),
    ),
  );
}

// Called every second by the page's ticker (app.js).
export function offerDuel() {
  if (!state.character || document.hidden) return;
  askWaiting();
  tickChallenge();
  offerChallenge();
  remindMove();
}

// --- 908.4: the table -------------------------------------------------------

const resultTitle = (result) => ({ won: t('Wygrana!'), lost: t('Przegrana'), drawn: t('Remis') })[result] ?? '';

// How a match ended, in its words (texts.live.ends).
function endText(duel) {
  const match = duel.match;
  const words = table?.texts?.ends?.[match.result]?.[match.end];
  return words ? say(words, { name: duel.other.name, rounds: match.cap }, duel.other.female) : '';
}

// The table of a live match in the Salon's „Karty” tab (cards.js mounts it
// over Szczęsny's while a match of the character's runs). `cardFace`: the
// cards' faces of cards.js; `onLayout`: the table took the tab or gave it
// back; `onEnd`: the player is done with the match's end.
export function mountDuel(holder, { cardFace, onLayout = () => {}, onEnd = () => {} }) {
  let duel = null;
  let shown = false;
  let gone = false;
  let polledAt = 0;
  let asking = false;
  let seen = '';
  // The move being laid: its round, the player's lines and the hero's skill;
  // the reserve's card picked to lay, and the skill's steps.
  let plan = null;
  let picked = null;
  let aiming = null;
  // A match over, shown until „Dalej”, and whether its motion is still to
  // play (cards-fx.js: the end card comes in, the coins fly to the gold).
  let ended = null;
  let endMotion = false;
  // The newest request's number: a poll's answer older than an action's
  // never draws over it.
  let latest = 0;
  const fx = createCardsFx(holder);
  let deferred = false;
  // The parts of the table the clock moves.
  let clock = null;

  const connected = () => !gone && holder.isConnected;
  const inSight = () => connected() && shown;
  const show = (next) => {
    if (next === shown) return;
    shown = next;
    onLayout();
  };

  // A match's state, to draw the table anew only when it changed.
  const stamp = (one) => (one ? JSON.stringify([one.id, one.state, one.match?.round, one.match?.step, one.match?.deadline, one.match?.moves, one.match?.result]) : '');

  function apply(answer, goldBefore = state.character?.gold ?? 0) {
    take(answer);
    const next = answer.duel;
    if (next && (next.state === 'playing' || next.state === 'done') && next.match) {
      if (next.state === 'done' && !ended) finished(next, goldBefore);
      if (!plan || plan.round !== next.match.round || next.match.step !== 'me') {
        plan = null;
        picked = null;
        aiming = null;
      }
      duel = next;
      followed = next.state === 'playing' ? next.id : followed;
      begun.add(next.id);
      show(true);
    } else if (!ended) {
      duel = null;
      show(false);
    }
  }

  // The match over: its end shown until „Dalej”, the gold it gave in the
  // top bar (held at `goldBefore` until the coins land, with the motion on).
  function finished(next, goldBefore) {
    ended = next;
    endMotion = true;
    followed = null;
    playSound(next.match.result === 'won' ? 'chest' : 'tick');
    if (next.gold > 0 && fx.on()) fx.holdGold(goldBefore, goldBefore + next.gold);
    if (next.stake > 0) call('GET', '/api/character').catch(() => {});
  }

  // The end card's motion, once it is drawn: it comes in, and a win's or a
  // draw's coins fly from its gold to the top bar.
  async function endPlayed() {
    if (!endMotion || !ended) return;
    endMotion = false;
    if (!fx.on()) return;
    const over = ended;
    await fxPlay((run) => fx.ended(run, { end: { mode: over.stake > 0 ? 'staked' : 'training', result: over.match.result, gold: over.gold, daily: 0, stake: over.stake }, coinsDone: false }));
  }

  // The round the other's answer played, on the table as the blows found it
  // (the round's `before`): the leader's cards as it laid them and the
  // other's answer, each with the Życie it had, the other's skill marked.
  function roundBoard(previous, played) {
    const before = played.last?.before;
    if (!before) return null;
    const cardsOf = (...lists) => new Map(lists.flat().filter(Boolean).map((card) => [card.key, card]));
    const known = {
      me: cardsOf(played.me.lines, played.last.beatenCards.me, previous.me.lines),
      foe: cardsOf(previous.foe.lines, played.foe.lines, played.last.beatenCards.foe),
    };
    const lines = (side) => before[side].map((one) => (one && known[side].has(one.key) ? { ...known[side].get(one.key), life: one.life } : null));
    const theirs = played.last.skillFoe ? { filled: [], skill: played.last.skillFoe, auto: false } : null;
    return { ...previous, me: { ...previous.me, lines: lines('me') }, foe: { ...previous.foe, lines: lines('foe') }, moves: { me: previous.moves?.me ?? null, foe: theirs } };
  }

  // Asked for once more when the table's read was on its way already (a
  // match begun meanwhile is not missed).
  let again = false;
  async function load() {
    if (gone) return;
    if (asking) {
      again = true;
      return;
    }
    asking = true;
    again = false;
    polledAt = Date.now();
    const asked = ++latest;
    try {
      const id = duel?.state === 'playing' ? duel.id : null;
      const answer = await call('GET', id ? `/api/cards/duel?id=${id}` : '/api/cards/duel');
      if (asked !== latest || gone) return;
      const before = stamp(duel);
      const previous = duel?.match ?? null;
      const next = answer.duel?.match;
      // The round this player led, played by the other's answer meanwhile:
      // its blows on the table as they fell.
      const answered = previous && next?.last && next.last.round === previous.round && previous.lead === 'me' && previous.step === 'foe';
      const board = answered && fx.on() && shown && !ended ? roundBoard(previous, next) : null;
      if (board) {
        render(board);
        const run = fx.begin();
        try {
          const shownCards = (side) => new Map(board[side].lines.filter(Boolean).map((card) => [card.key, card]));
          await fx.round(run, { last: next.last, shown: { me: shownCards('me'), foe: shownCards('foe') }, after: next, end: null, types: types() });
        } catch (error) {
          console.error('cards-fx', error);
          run.skip();
        }
        fx.finish(run);
        deferred = false;
        if (gone) return;
      }
      apply(answer);
      if (!gone && (stamp(duel) !== before || !seen || board)) {
        render();
        await endPlayed();
        // A new round: the reserve's new cards dealt.
        if (previous && duel?.match && duel.match.round > previous.round && fx.on() && !ended) await fxPlay((run) => fx.enter(run, { previous, match: duel.match }));
      }
    } catch {
      // Asked again at the next poll.
    } finally {
      asking = false;
      if (again && !gone) load();
    }
  }

  const entry = { load, inSight, connected };
  tables.add(entry);

  // --- Cards -----------------------------------------------------------------

  const types = () => table?.types ?? [];
  const typeOf = (id) => types().find((type) => type.id === id);
  const beats = (a, b) => typeOf(a)?.target === b;
  const face = (card, options = {}) => cardFace(card, { ...options, types: types() });
  const withKey = (element, side, key) => {
    element.dataset.fx = `${side}:${key}`;
    return element;
  };
  const backs = (count) => h('span', { class: 'cards-backs', 'aria-hidden': 'true' }, Array.from({ length: Math.max(0, Math.min(count, 4)) }, () => h('span', { class: 'cards-back' })));
  const slot = (label, onClick = null, ready = false) =>
    onClick
      ? h('button', { type: 'button', class: `tcard-slot${ready ? ' tcard-slot--ready' : ''}`, onClick }, h('span', { text: label }))
      : h('span', { class: 'tcard-slot' }, h('span', { text: label }));

  function renderLaid() {
    const before = fx.on() ? fx.measure() : null;
    render();
    if (before) fx.lay(before);
  }

  async function fxPlay(play) {
    const run = fx.begin();
    try {
      await play(run);
    } catch (error) {
      console.error('cards-fx', error);
      run.skip();
    }
    fx.finish(run);
    if (deferred && !gone) {
      deferred = false;
      render();
    }
  }

  // --- The move ----------------------------------------------------------------

  const myMove = () => duel?.match?.step === 'me' && !duel.match.result;
  function planOf(match) {
    if (!plan || plan.round !== match.round) plan = { round: match.round, lines: match.me.lines.map((card) => card?.key ?? null), skill: null };
    return plan;
  }
  const myCards = (match) => new Map([...match.me.lines.filter(Boolean), ...match.me.hand].map((card) => [card.key, card]));
  const standingKeys = (match) => match.me.lines.map((card) => card?.key ?? null);
  const reserveLeft = (match) => match.me.hand.filter((card) => !plan.lines.includes(card.key));

  // The skill a side uses this round as the blows count it: the player's as
  // it lays it, the other's as it laid it (in the open), with its power.
  const skillOf = (side, match) => (side === 'me' ? plan.skill && { ...plan.skill, power: match.me.hero?.skill?.power ?? 0 } : match.moves?.foe?.skill ?? null);

  // The blows of the round as the move stands, as the server counts them
  // (roundHits in src/engine/cards.js), both sides' skills in: each card
  // hits the card opposite or the other side's first from the front, half
  // again harder against a type it beats, more for the card a skill boosts.
  // Shown only to the one who answers, when the table is whole.
  function blows(match) {
    const mine = myCards(match);
    const own = skillOf('me', match);
    const lines = {
      me: plan.lines.map((key) => {
        if (key === null) return null;
        const card = mine.get(key);
        return own?.kind === 'shift' && own.card === key ? { ...card, type: own.type } : card;
      }),
      foe: match.foe.lines,
    };
    const taken = { me: [0, 0, 0], foe: [0, 0, 0] };
    const strong = { me: [false, false, false], foe: [false, false, false] };
    for (const side of ['me', 'foe']) {
      const other = side === 'me' ? 'foe' : 'me';
      const skill = skillOf(side, match);
      const boost = (card) => {
        if (!skill || !(skill.power > 0) || skill.kind === 'revive') return 0;
        if (skill.kind === 'swap') return skill.swap === card.key ? skill.power : 0;
        return skill.card === card.key ? skill.power : 0;
      };
      lines[side].forEach((card, line) => {
        if (!card) return;
        const aimed = skill?.kind === 'aim' && skill.card === card.key && lines[other][skill.target] ? skill.target : null;
        const at = aimed ?? (lines[other][line] ? line : lines[other].findIndex(Boolean));
        if (at === null || at < 0) return;
        const target = lines[other][at];
        const advantage = beats(card.type, target.type);
        taken[other][at] += Math.max(1, Math.round(card.attack * (1 + (advantage ? table.typeBonus : 0)) * (1 + boost(card))));
        if (advantage) strong[other][at] = true;
      });
    }
    return { taken, strong };
  }
  const noBlows = { taken: { me: [0, 0, 0], foe: [0, 0, 0] }, strong: { me: [false, false, false], foe: [false, false, false] } };

  const skillKind = () => duel.match.me.hero?.skill?.kind ?? null;
  function aimHint() {
    if (!aiming) return null;
    const kind = skillKind();
    if (aiming.step === 'target') return t('Wskaż kartę rywala, w którą uderzy Twoja karta.');
    if (aiming.step === 'type') return t('Wybierz nowy typ karty.');
    if (aiming.step === 'swap') return t('Wskaż kartę z rezerwy, która zajmie jej miejsce.');
    if (kind === 'swap') return t('Wskaż swoją kartę w linii, którą zabierasz do rezerwy.');
    return t('Wskaż swoją kartę w linii.');
  }
  function cancelSkill() {
    if (plan.skill?.kind === 'swap') {
      const line = plan.lines.indexOf(plan.skill.swap);
      if (line >= 0) plan.lines[line] = plan.skill.card;
    }
    plan.skill = null;
    aiming = null;
    renderLaid();
  }
  function chooseOwn(key) {
    const kind = skillKind();
    const line = plan.lines.indexOf(key);
    if (kind === 'swap') {
      if (standingKeys(duel.match)[line] !== key) {
        toast(t('Podmiana zabiera kartę, która stała już w linii.'));
        return;
      }
      aiming = { step: 'swap', card: key };
    } else if (kind === 'aim') aiming = { step: 'target', card: key };
    else if (kind === 'shift') aiming = { step: 'type', card: key };
    else {
      plan.skill = { kind, card: key };
      aiming = null;
    }
    render();
  }
  function tapReserve(card) {
    if (!myMove()) return;
    if (aiming?.step === 'swap') {
      const line = plan.lines.indexOf(aiming.card);
      plan.lines[line] = card.key;
      plan.skill = { kind: 'swap', card: aiming.card, swap: card.key };
      aiming = null;
      renderLaid();
      return;
    }
    if (aiming) return;
    const empty = plan.lines.map((key, line) => (key === null ? line : -1)).filter((line) => line >= 0);
    if (empty.length === 0) {
      toast(t('Wszystkie Twoje linie są zajęte.'));
      return;
    }
    picked = picked === card.key ? null : card.key;
    if (picked !== null && empty.length === 1) {
      plan.lines[empty[0]] = picked;
      picked = null;
    }
    renderLaid();
  }
  function tapMine(line) {
    if (!myMove()) return;
    const key = plan.lines[line];
    if (aiming) {
      if (key !== null && aiming.step === 'card') chooseOwn(key);
      return;
    }
    const standing = standingKeys(duel.match)[line];
    if (key === null) {
      if (picked === null) {
        toast(t('Najpierw wybierz kartę z rezerwy.'));
        return;
      }
      plan.lines[line] = picked;
      picked = null;
    } else if (key !== standing && plan.skill?.swap !== key) {
      plan.lines[line] = null;
      if (plan.skill?.card === key) plan.skill = null;
    } else return;
    renderLaid();
  }
  function tapFoe(line) {
    if (aiming?.step !== 'target' || !duel.match.foe.lines[line]) return;
    plan.skill = { kind: 'aim', card: aiming.card, target: line };
    aiming = null;
    render();
  }
  const turnReady = (match) => plan.lines.filter((key) => key === null).length === 0 || reserveLeft(match).length === 0;

  // The move sent: the leader's cards go on the table for the other to
  // see; the answer plays the round, which moves on the table first.
  async function sendMove() {
    const match = duel.match;
    const answering = match.lead === 'foe';
    const goldBefore = state.character?.gold ?? 0;
    latest += 1;
    const answer = await call('POST', '/api/cards/duel/turn', {
      id: duel.id,
      round: plan.round,
      lines: plan.lines,
      skill: plan.skill ? { card: plan.skill.card, target: plan.skill.target, type: plan.skill.type, swap: plan.skill.swap } : null,
    });
    playSound('swing');
    const played = answer.duel?.match;
    if (answering && played?.last && fx.on() && !gone) {
      const mine = myCards(match);
      const laid = {
        me: new Map(plan.lines.filter((key) => key !== null).map((key) => [key, plan.skill?.kind === 'shift' && plan.skill.card === key ? { ...mine.get(key), type: plan.skill.type } : mine.get(key)])),
        foe: new Map(match.foe.lines.filter(Boolean).map((card) => [card.key, card])),
      };
      const run = fx.begin();
      try {
        await fx.round(run, { last: played.last, shown: laid, after: played, end: null, types: types() });
      } catch (error) {
        console.error('cards-fx', error);
        run.skip();
      }
      fx.finish(run);
      plan = null;
      deferred = false;
      apply(answer, goldBefore);
      render();
      await endPlayed();
      if (!ended && played.round > match.round) await fxPlay((next) => fx.enter(next, { previous: match, match: duel.match }));
      return;
    }
    plan = null;
    apply(answer, goldBefore);
    render();
    await endPlayed();
  }

  // --- Drawing ---------------------------------------------------------------

  function linesRow(side, match, blowsNow) {
    const mine = myCards(match);
    const theirMove = match.moves?.foe;
    const myLaid = match.moves?.me;
    return h(
      'div',
      { class: `cards-lines cards-lines--${side}` },
      (table?.lines ?? []).map((name, line) => {
        const card = side === 'foe' ? match.foe.lines[line] : plan.lines[line] === null ? null : mine.get(plan.lines[line]);
        const shownCard = side === 'me' && card && plan.skill?.kind === 'shift' && plan.skill.card === card.key ? { ...card, type: plan.skill.type, shifted: true } : card;
        const blow = blowsNow.taken[side][line];
        const fresh = side === 'foe' ? Boolean(theirMove?.filled?.includes(line)) : Boolean(card && card.key !== standingKeys(match)[line]);
        // The skill's name on the card it works on: the player's as it
        // lays it or laid it, the other's as it laid it.
        const ownSkill = plan.skill ?? (myLaid?.skill || null);
        const skillName =
          card && side === 'me' && ownSkill && (ownSkill.card === card.key || ownSkill.swap === card.key)
            ? match.me.hero?.skill?.name
            : card && side === 'foe' && theirMove?.skill && (theirMove.skill.card === card.key || theirMove.skill.swap === card.key)
              ? match.foe.hero?.skill?.name
              : null;
        const aimed =
          (side === 'foe' && ownSkill?.kind === 'aim' && ownSkill.target === line) || (side === 'me' && theirMove?.skill?.kind === 'aim' && theirMove.skill.target === line);
        const target = side === 'foe' ? aiming?.step === 'target' && card : aiming?.step === 'card' && card;
        const content = shownCard
          ? withKey(
              face(shownCard, {
                marks: { blow, advantage: blowsNow.strong[side][line], fresh, skill: skillName ?? (aimed ? t('cel') : null), target },
                onClick: side === 'foe' ? (aiming?.step === 'target' ? () => tapFoe(line) : null) : myMove() ? () => tapMine(line) : null,
              }),
              side,
              shownCard.key,
            )
          : side === 'me' && myMove()
            ? slot(t('Puste'), () => tapMine(line), picked !== null)
            : slot(t('Puste'));
        return h('div', { class: 'cards-line' }, h('span', { class: 'cards-line-name', text: name.name }), content);
      }),
    );
  }

  function roundAccount(match) {
    const last = match.last;
    if (!last || last.round === 0 || last.hits.length === 0) return null;
    const known = {
      me: new Map([...match.me.lines.filter(Boolean), ...match.me.hand, ...last.beatenCards.me].map((card) => [card.key, card.name])),
      foe: new Map([...match.foe.lines.filter(Boolean), ...last.beatenCards.foe].map((card) => [card.key, card.name])),
    };
    const lines = last.hits.map((hit) => {
      const other = hit.side === 'me' ? 'foe' : 'me';
      return h(
        'li',
        { class: `cards-hit cards-hit--${hit.side}` },
        t('{who} → {whom}: {damage}', { who: known[hit.side].get(hit.key) ?? '?', whom: known[other].get(hit.target.key) ?? '?', damage: hit.damage }),
        hit.advantage && h('span', { class: 'cards-hit-note', text: t(' (przewaga typu)') }),
      );
    });
    const beaten = [...last.beatenCards.foe.map((card) => card.name), ...last.beatenCards.me.map((card) => card.name)];
    return h(
      'details',
      { class: 'how-more cards-account' },
      h('summary', { class: 'how-toggle', text: t('Runda {round}: zbite {count}', { round: last.round, count: beaten.length }) }),
      h('ul', { class: 'cards-hits' }, lines),
      beaten.length > 0 && h('p', { class: 'muted', text: t('Zbite: {names}.', { names: beaten.join(', ') }) }),
    );
  }

  // The bar of whose move it is (908.4): „Twój ruch” or the other's name,
  // the time left of the 30 seconds, and what happens now.
  function turnBar(match) {
    const { texts } = table;
    const other = duel.other;
    const mine = match.step === 'me';
    const vars = { name: other.name };
    const lines = [
      mine && match.lead === 'me' && say(texts.lead, vars, other.female),
      mine && match.lead === 'foe' && say(texts.answer, vars, other.female),
      !mine && match.lead === 'foe' && say(texts.theirLead, vars, other.female),
      !mine && match.lead === 'me' && say(texts.theirAnswer, vars, other.female),
      match.moves?.foe?.auto && say(texts.missedFoe, vars, other.female),
      mine && match.missed?.me > 0 && texts.missedMe,
    ].filter(Boolean);
    const time = h('strong', { class: 'duel-clock' });
    const fill = h('span', { class: 'duel-bar-fill' });
    clock = { time, fill, deadline: match.deadline, total: (table.turnSeconds ?? 30) * 1000 };
    tickClock();
    return h(
      'div',
      { class: `duel-turn${mine ? ' duel-turn--mine' : ''}`, role: 'timer', 'data-guide': 'duel-turn' },
      h('div', { class: 'duel-turn-head' }, h('span', { text: mine ? t('Twój ruch') : t('Ruch: {name}', vars) }), time),
      h('span', { class: 'duel-bar' }, fill),
      lines.map((line) => h('p', { class: 'muted duel-turn-text', text: line })),
    );
  }

  function tickClock() {
    if (!clock) return;
    const left = clock.deadline - serverNow();
    clock.time.textContent = formatCountdown(Math.max(0, left));
    clock.fill.style.width = `${Math.max(0, Math.min(1, left / clock.total)) * 100}%`;
  }

  function heroCard(match) {
    const hero = match.me.hero;
    if (!hero) return null;
    const skill = hero.skill;
    const self = duel.self;
    return h(
      'section',
      { class: 'card cards-skill', 'data-guide': 'cards-skill' },
      h(
        'section',
        { class: 'card cards-hero cards-hero--compact' },
        h('span', { class: 'cards-hero-portrait' }, portraitSprite(self.classId, self.appearance, { bust: true, skin: self.skin, evolution: self.evolution ?? undefined }) ?? icon(self.classId, { size: 40 })),
        h('div', { class: 'cards-hero-text' }, h('p', { class: 'cards-hero-label', text: t('Karta bohatera: {title}', { title: self.className }) }), skill && h('p', { class: 'cards-hero-skill', text: skill.name })),
      ),
      h('p', { class: 'muted cards-skill-text', text: skill?.text ?? '' }),
      hero.used && !plan.skill
        ? h('p', { class: 'chip chip--dashed', text: t('Umiejętność użyta w tej partii') })
        : plan.skill
          ? h('p', { class: 'cards-skill-set' }, h('span', { class: 'chip chip--success', text: t('{skill}: w tej rundzie', { skill: skill.name }) }), h('button', { type: 'button', class: 'link-button', text: t('Anuluj'), onClick: cancelSkill }))
          : aiming
            ? h('button', { type: 'button', class: 'button button--system', text: t('Anuluj'), onClick: cancelSkill })
            : h('button', {
                type: 'button',
                class: 'button button--system',
                disabled: !myMove(),
                text: t('Użyj: {skill}', { skill: skill?.name ?? '' }),
                onClick: () => {
                  aiming = { step: 'card' };
                  picked = null;
                  render();
                },
              }),
    );
  }

  function matchCard(match = duel.match) {
    planOf(match);
    const mine = myMove();
    const answering = mine && match.lead === 'foe';
    const blowsNow = answering ? blows(match) : noBlows;
    const { texts } = table;
    const other = duel.other;
    const reserve = mine ? reserveLeft(match) : match.me.hand;
    const ready = mine && turnReady(match);
    const foeHero = match.foe.hero?.skill;
    const tableCard = h(
      'section',
      { class: 'cards-table place-card', 'data-guide': 'cards-table', 'aria-label': t('Stół') },
      h(
        'div',
        { class: 'cards-table-head' },
        h('span', { class: 'cards-table-bust' }, bust(other)),
        h(
          'div',
          { class: 'cards-table-who' },
          h('p', { class: 'cards-table-name', text: other.name }),
          h('p', { class: 'cards-table-tier', text: duel.stake > 0 ? filled(texts.tableStaked, { stake: formatNumber(duel.stake) }) : texts.tableFree }),
          h('p', { class: 'muted cards-table-count' }, backs(match.foe.hand), h('span', { text: t('Rezerwa {hand} · talia {deck} · zbite {out}', { hand: match.foe.hand, deck: match.foe.deck, out: match.foe.out }) })),
          foeHero && h('p', { class: 'muted cards-table-count', text: match.foe.hero.used ? t('Bohater rywala: {skill} (użyta)', { skill: foeHero.name }) : t('Bohater rywala: {skill}', { skill: foeHero.name }) }),
        ),
        h('span', { class: 'cards-round', text: t('Runda {round}/{cap}', { round: match.round, cap: match.cap }) }),
      ),
      turnBar(match),
      linesRow('foe', match, blowsNow),
      h('div', { class: 'cards-divider', 'aria-hidden': 'true' }, h('span', { text: duel.stake > 0 ? filled(texts.dividerStaked, { stake: formatNumber(duel.stake) }) : texts.dividerFree })),
      linesRow('me', match, blowsNow),
      h('p', { class: 'muted cards-table-count cards-table-count--me' }, match.me.deck > 0 && backs(1), h('span', { text: t('Twoja talia {deck} · zbite {out}', { deck: match.me.deck, out: match.me.out }) })),
    );
    const hint = !mine
      ? t('Czekasz na ruch rywala.')
      : (aimHint() ?? (picked !== null ? t('Wskaż pustą linię dla tej karty.') : !ready ? t('Dołóż karty z rezerwy na puste linie.') : null));
    return h(
      'div',
      { class: 'stack cards-match duel-match', 'data-guide': 'duel-match' },
      tableCard,
      h(
        'section',
        { class: 'card cards-reserve', 'aria-label': t('Rezerwa') },
        h('div', { class: 'cards-section-head' }, h('h3', { class: 'section-title', text: t('Rezerwa') }), hint && h('p', { class: 'cards-hint', role: 'status', text: hint })),
        reserve.length > 0
          ? h(
              'div',
              { class: 'tcard-grid tcard-grid--reserve' },
              reserve.map((card) => withKey(face(card, { marks: { picked: picked === card.key, target: aiming?.step === 'swap', dim: !mine }, onClick: mine ? () => tapReserve(card) : null }), 'me', card.key)),
            )
          : h('p', { class: 'muted', text: t('Rezerwa pusta.') }),
        aiming?.step === 'type' &&
          h(
            'div',
            { class: 'cards-types' },
            types()
              .filter((type) => type.id !== myCards(match).get(aiming.card)?.type)
              .map((type) =>
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'button button--world',
                    onClick: () => {
                      plan.skill = { kind: 'shift', card: aiming.card, type: type.id };
                      aiming = null;
                      render();
                    },
                  },
                  h('span', { class: `tcard-type tcard-type--${type.id}`, 'aria-hidden': 'true' }, icon(type.icon, { size: 16 })),
                  type.name,
                ),
              ),
          ),
      ),
      heroCard(match),
      h(
        'div',
        { class: 'cards-actions' },
        h('button', {
          type: 'button',
          class: 'button button--world cards-fight',
          'data-guide': 'cards-fight',
          text: match.lead === 'me' ? t('Wyłóż karty') : t('Walcz'),
          disabled: !ready || Boolean(aiming),
          onClick: (event) => withButton(event.currentTarget, sendMove),
        }),
        h('button', {
          type: 'button',
          class: 'button button--system button--small',
          text: t('Poddaj partię'),
          onClick: async (event) => {
            const pressed = event.currentTarget;
            const sure = await confirmAction({
              title: t('Poddać partię?'),
              text: duel.stake > 0 ? t('Partia przepada, a {name} zgarnia {gold} zł.', { name: other.name, gold: formatNumber(duel.pot) }) : t('Partia skończy się przegraną.'),
              confirmLabel: t('Poddaj'),
              danger: true,
            });
            if (!sure) return;
            await withButton(pressed, async () => {
              const goldBefore = state.character?.gold ?? 0;
              latest += 1;
              const answer = await call('POST', '/api/cards/duel/surrender', { id: duel.id });
              apply(answer, goldBefore);
              render();
              await endPlayed();
            });
          },
        }),
      ),
      roundAccount(match),
    );
  }

  // The match's end (until „Dalej”): won, lost or a draw, how it ended, the
  // gold and the rounds.
  function endCard() {
    const over = ended;
    const match = over.match;
    const rows = [
      over.stake > 0 && match.result === 'won' && [t('Za wygraną zgarniasz'), t('+{gold} zł', { gold: formatNumber(over.gold) })],
      over.stake > 0 && match.result === 'drawn' && [t('Stawka wraca'), t('+{gold} zł', { gold: formatNumber(over.gold) })],
      over.stake > 0 && match.result === 'lost' && [t('Stawka przepada'), t('−{gold} zł', { gold: formatNumber(over.stake) })],
      over.stake === 0 && [t('Partia na żywo'), t('bez stawki')],
      [t('Rundy'), formatNumber(match.round)],
    ].filter(Boolean);
    return h(
      'section',
      { class: `card cards-end cards-end--${match.result}`, role: 'status', 'data-guide': 'duel-end' },
      h('p', { class: 'cards-end-title', text: resultTitle(match.result) }),
      h('p', { class: 'muted', text: t('Partia na żywo z: {name}', { name: over.other.name }) }),
      h('p', { class: 'settlement-greeting', text: endText(over) }),
      h('dl', { class: 'status-list' }, rows.map(([label, value]) => h('div', { class: 'status-row' }, h('dt', { text: label }), h('dd', { text: value })))),
      h('button', {
        type: 'button',
        class: 'button button--system',
        text: t('Dalej'),
        onClick: () => {
          ended = null;
          duel = null;
          plan = null;
          show(false);
          onEnd();
        },
      }),
    );
  }

  // The tab drawn anew: the match's end, or its table (`board`: the table
  // as a round's blows found it, while they play).
  function render(board = null) {
    if (gone || !shown) return;
    if (fx.holding()) {
      deferred = true;
      return;
    }
    clock = null;
    fx.cancelFlights();
    const body = ended
      ? [endCard(), ended.match && h('div', { class: 'duel-last' }, roundAccount(ended.match))]
      : duel?.match && table
        ? [matchCard(board ?? duel.match)]
        : [h('p', { class: 'muted', text: t('Wczytywanie partii…') })];
    holder.replaceChildren(h('div', { class: `stack cards-tab duel-tab${fx.on() ? ' cfx-on' : ''}` }, body));
    seen = stamp(duel);
  }

  // Every second: the clock; every two the match, while the table is on
  // the screen and the page in front.
  const timer = setInterval(() => {
    if (!inSight()) return;
    tickClock();
    if (!ended && !document.hidden && !fx.holding() && Date.now() - polledAt >= POLL_MS) load();
  }, 1000);

  load();
  return {
    // Whether the table holds the tab now.
    on: () => shown,
    unmount() {
      gone = true;
      clearInterval(timer);
      tables.delete(entry);
      fx.stop();
    },
  };
}
