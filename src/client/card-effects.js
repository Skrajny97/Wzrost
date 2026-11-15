// Talia Systemu's effect cards at the table (976–979; DECISIONS.md, "Karty
// efektów w Talii Systemu"): the turn's effect card and its target as the
// player picks them, their part in the round's blows as the server counts
// them (applyEffect and roundHits in src/engine/cards.js), the marks on the
// cards they work on, the rival's effect card of the round, and the section
// under the hero's card where the player plays one (mock-ups 979.3 and
// 979.4). Szczęsny's, a resident's and the Arena's tables alike (cards.js,
// card-arena.js).

import { h } from './dom.js';
import { t } from './i18n.js';

// What no effect card does to the blows.
const none = () => ({ boost: {}, rally: 0, guard: {}, bind: {}, mist: 0 });

// The player's effect card of the turn being laid (`use`: { key, target }),
// as the match shows it, while not played yet; else null.
export const playedEffect = (match, use) => (use ? ((match.me.effects ?? []).find((one) => one.key === use.key && !one.used) ?? null) : null);

// A side's effect card in the blows (effectMods): `played` its view (kind,
// power), `at` what it works on (its side's card's key, or the other side's
// line), `otherLines` the other side's cards on its lines.
function modsOf(played, at, otherLines) {
  const mods = none();
  if (!played) return mods;
  const { kind, power } = played;
  if (kind === 'boost' && Number.isInteger(at)) mods.boost[at] = power;
  if (kind === 'shield' && Number.isInteger(at)) mods.guard[at] = power;
  if (kind === 'rally') mods.rally = power;
  if (kind === 'mist') mods.mist = power;
  if (kind === 'bind' && Number.isInteger(at) && otherLines[at]) mods.bind[otherLines[at].key] = power;
  return mods;
}

// The round's effect cards for the preview of its blows: the player's
// being laid and the rival's as it chose it (foe.effectPlan, its `at`),
// with the cards on the lines (`lines`: { me, foe }) as they will stand
// once Żywa woda, Piorun Peruna and Klątwa słabości have worked, the
// player's first (applyEffect, playTurn). Returns the cards and each
// side's part in the blows.
export function roundEffects(match, use, lines) {
  const cards = { me: lines.me.map((card) => card && { ...card }), foe: lines.foe.map((card) => card && { ...card }) };
  const mine = playedEffect(match, use);
  const theirs = match.foe.effectPlan ?? null;
  const work = (played, at, side) => {
    if (!played) return;
    const other = side === 'me' ? 'foe' : 'me';
    if (played.kind === 'heal') {
      const card = cards[side].find((one) => one?.key === at);
      if (card) card.life = Math.min(card.max, card.life + Math.max(1, Math.round(card.max * played.power)));
    }
    const struck = Number.isInteger(at) ? cards[other][at] : null;
    if (played.kind === 'bolt' && struck) struck.life = Math.max(1, struck.life - Math.max(1, Math.round(struck.life * played.power)));
    if (played.kind === 'curse' && struck) struck.cursed = Math.max(struck.cursed ?? 0, played.power);
  };
  work(mine, use?.target, 'me');
  work(theirs, theirs?.at, 'foe');
  return { cards, me: modsOf(mine, use?.target, cards.foe), foe: modsOf(theirs, theirs?.at, cards.me) };
}

// A blow as roundHits deals it: Atak more by `typeBonus` against a type it
// beats and by `extra` (the hero's skill, Niedźwiedzia siła, Zew watahy),
// less by a curse on the card, the other side's Pęta on it and its Kamienna
// skóra on the target (`theirs`, that side's part).
export function effectBlow(card, target, { advantage, typeBonus, extra, theirs }) {
  const blow = Math.max(1, Math.round(card.attack * (1 + (advantage ? typeBonus : 0)) * (1 + extra)));
  const cut = 1 - (1 - (card.cursed ?? 0)) * (1 - (theirs.bind[card.key] ?? 0)) * (1 - (theirs.guard[target.key] ?? 0));
  return cut >= 1 ? 0 : cut > 0 ? Math.max(1, Math.round(blow * (1 - cut))) : blow;
}

// The marks of the round's effect cards on the cards at the table: what
// each does ("+40% ciosu") on the card it works on, on all of its side's
// cards for Zew watahy and Mgła. Returns { me, foe }: the mark on each line.
export function effectMarks(match, use, cards) {
  const marks = { me: [null, null, null], foe: [null, null, null] };
  const mark = (played, at, side) => {
    if (!played) return;
    const other = side === 'me' ? 'foe' : 'me';
    if (played.target === 'all') cards[side].forEach((card, line) => card && (marks[side][line] = played.short));
    else if (played.target === 'own') cards[side].forEach((card, line) => card?.key === at && (marks[side][line] = played.short));
    else if (Number.isInteger(at) && cards[other][at]) marks[other][at] = played.short;
  };
  mark(playedEffect(match, use), use?.target, 'me');
  mark(match.foe.effectPlan ?? null, match.foe.effectPlan?.at, 'foe');
  return marks;
}

// The hint while an effect card waits for its target.
export const effectHint = (aim, texts) => (aim ? (aim.target === 'rival' ? texts.targetRival : texts.targetOwn) : null);

// The rival's effect card of the round, shown before the player answers it
// (977.4 A), as a line of the table; null without one.
export function rivalEffectLine(match, texts) {
  const plan = match.foe.effectPlan;
  if (!plan) return null;
  return h('p', { class: 'cards-rival-effect', role: 'status' }, h('span', { class: 'chip', text: plan.short }), h('span', { text: String(texts.rivalPlays ?? '').replace('{name}', plan.name) }));
}

// The section under the hero's card (979.4): the player's effect cards of
// the match, those played dimmed; a tap picks one (Zew watahy and Mgła at
// once, the others then their target); the one picked is lit, with
// "… : w tej rundzie" and "Anuluj". `face`: the table's card faces.
export function effectsSection({ match, use, aim, texts, face, onPick, onCancel }) {
  const effects = match.me.effects ?? [];
  if (effects.length === 0) return null;
  const chosen = playedEffect(match, use);
  const lit = chosen ?? (aim ? effects.find((one) => one.key === aim.key) : null);
  const words = lit ? `${lit.name}: ${lit.text.charAt(0).toLocaleLowerCase()}${lit.text.slice(1)} ${texts.once}` : texts.pick;
  return h(
    'section',
    { class: 'card stack cards-effects', 'data-guide': 'cards-effects' },
    h('div', { class: 'cards-section-head' }, h('h3', { class: 'section-title', text: texts.tab }), h('span', { class: 'muted', text: t('jedna na rundę') })),
    h('p', { class: 'muted cards-skill-text', text: words }),
    h(
      'div',
      { class: 'tcard-grid tcard-grid--reserve' },
      effects.map((card) =>
        face(card, {
          marks: { picked: lit?.key === card.key, dim: card.used, played: card.used && texts.used },
          label: t('{name}, poziom {level}: {state}', { name: card.name, level: card.level, state: card.used ? texts.used : card.text }),
          onClick: card.used ? null : () => onPick(card),
        }),
      ),
    ),
    chosen
      ? h('p', { class: 'cards-skill-set' }, h('span', { class: 'chip chip--success', text: t('{skill}: w tej rundzie', { skill: chosen.name }) }), h('button', { type: 'button', class: 'link-button', text: t('Anuluj'), onClick: onCancel }))
      : aim && h('button', { type: 'button', class: 'button button--system', text: t('Anuluj'), onClick: onCancel }),
  );
}
