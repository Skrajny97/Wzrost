// Andrzejki: Wieczór wróżb (1082 C, 1083 C, 1084 A and B; the author's
// decisions of 18.11.2026 in DECISIONS.md; data/winter.json, `andrzejki`;
// src/engine/andrzejki.js): on the evening of 29 November the wax, on 30
// November the three cups, a fortune once each evening, its omen with one
// of the fortunes' words for the player (24.11.2026). The omen's premium
// runs for a day as a week's effect of the character's own (weekFor in
// weeks.js), its small reward comes at once, and a fortune on both evenings
// of a year gives the portrait's background (an event's cosmetic, not sold)
// and the feat its achievement with a title counts (achievements.json).
// The evening is held at the Zaklinaczka's in the Osada (24.11.2026), so
// only a character who may enter the Osada tells its fortune. Where
// ANDRZEJKI is "test" (the test version, features.js) every day is one of
// the evenings, so it can be tried before November.

import { andrzejkiEvening, bothEvenings, drawFortune, fortuneWords, omenReward, questPeriod, weekEffectText, withFortune } from '../engine/index.js';
import { featGains } from './achievements.js';
import { characterView, loadPlayer, requirePlayer, settlementOpen } from './characters.js';
import { content } from './content.js';
import { andrzejkiTestOn } from './features.js';
import { ApiError, json, readJson } from './http.js';
import { omensOf } from './weeks.js';

const rules = () => content().winter.andrzejki;
const words = () => rules().texts;

// The fortune evening at `now` (Polish time), or null.
export const eveningNow = (now) => andrzejkiEvening(questPeriod('daily', now, content()), now, rules(), andrzejkiTestOn());

// The character's stored fortunes (characters.andrzejki).
const storedOf = (row) => {
  try {
    return JSON.parse(row.andrzejki ?? 'null');
  } catch {
    return null;
  }
};

// An omen as the page shows it: its id, name and its premium in words, long
// ("o 10% więcej XP z walk") and short ("+10% XP z walk").
function omenView(id) {
  const omen = rules().omens.find((one) => one.id === id);
  if (!omen) return null;
  const effect = { kind: omen.kind, value: rules().value };
  return { id: omen.id, name: omen.name, kind: omen.kind, effect: weekEffectText(effect, content()), short: weekEffectText(effect, content(), true) };
}

// Andrzejki for the character's view, or null when there is neither an
// evening nor an omen running: tonight's evening (its kind, the cups, the
// fortune told with its words, `line`, and until when its premium runs),
// the omens running now and whether both evenings of the year are told.
export function andrzejkiView(row, now) {
  const evening = eveningNow(now);
  const stored = storedOf(row);
  const active = omensOf(row, now).map((one) => ({ ...omenView(one.omen), until: one.until }));
  if (!evening && active.length === 0) return null;
  const told = evening ? (stored?.[evening.key] ?? null) : null;
  return {
    evening: evening && {
      key: evening.key,
      kind: evening.kind,
      endsAt: evening.endsAt,
      cups: rules().cups,
      told: told && { ...omenView(told.omen), at: told.at, cup: told.cup ?? null, line: fortuneWords(told, rules()) },
    },
    active,
    both: bothEvenings(stored, evening?.key ?? new Date(now).toISOString().slice(0, 10), rules()),
    hours: rules().hours,
  };
}

// POST /api/andrzejki { cup }: tonight's fortune, once a character that may
// enter the Osada (`cup`: the cup chosen, 1 to the number of cups, on the
// cups' evening). The omen and the fortune's words come from the character,
// the evening and the cup, and the words' place is kept with the fortune, so
// coming back shows the same; its reward goes to the character, and the
// second evening of a year told gives the portrait's background and the
// achievement's feat. In one statement that holds only while the character
// is as read, so two taps at once tell it once.
export async function tellFortune(context) {
  const { session, player } = await requirePlayer(context);
  const db = context.env.DB;
  const row = player.row;
  // The evening is at the Zaklinaczka's in the Osada (the author,
  // 24.11.2026: „Niech będzie dla graczy od 20 poziomu, bo 20 poziom to i w
  // jedną dobę można wbić”): only for a character that has the Osada, by the
  // Osada's own rule (settlementOpen), and otherwise the evening's own words
  // say where it is and from what level.
  if (!settlementOpen(row)) throw new ApiError(403, 'andrzejki_locked', words().locked.replace('{level}', String(content().unlocksById.settlement.level)));
  const body = await readJson(context.request);
  const evening = eveningNow(context.now);
  if (!evening) throw new ApiError(409, 'andrzejki_closed', words().closed);
  const stored = storedOf(row);
  if (stored?.[evening.key]) throw new ApiError(409, 'andrzejki_told', words().taken);
  const cup = evening.kind === 'cups' ? Number(body.cup) : null;
  if (cup !== null && !(Number.isInteger(cup) && cup >= 1 && cup <= rules().cups)) throw new ApiError(400, 'invalid_cup', words().changed);

  const { omen, line } = drawFortune(`andrzejki:${row.id}:${evening.key}:${cup ?? 0}`, rules());
  const reward = omenReward(omen, row.level, rules(), content());
  const fortune = { omen: omen.id, kind: evening.kind, at: context.now, ...(cup !== null && { cup }), ...(line !== null && { line }) };
  const fortunes = withFortune(stored, evening.key, fortune);
  const both = bothEvenings(fortunes, evening.key, rules()) && !bothEvenings(stored, evening.key, rules());
  // The background among the cosmetics owned, the rest of them as they are.
  const cosmetics = JSON.parse(row.cosmetics ?? '{}');
  const owned = Array.isArray(cosmetics.owned) ? cosmetics.owned : [];
  const set = both && !owned.includes(rules().background) ? JSON.stringify({ ...cosmetics, owned: [...owned, rules().background] }) : null;
  const { meta } = await db
    .prepare(
      `UPDATE characters SET gold = gold + ?, time_points = time_points + ?, card_packs = card_packs + ?${set ? ', cosmetics = ?' : ''}, andrzejki = ?, version = version + 1
       WHERE id = ? AND version = ?`,
    )
    .bind(reward.gold, reward.timePoints, reward.packs, ...(set ? [set] : []), JSON.stringify(fortunes), row.id, row.version)
    .run();
  if (meta.changes !== 1) throw new ApiError(409, 'andrzejki_changed', words().changed);
  if (both) await db.batch(featGains(db, row.id, { [rules().feat]: 1 }));
  const fresh = await loadPlayer(db, session.userId);
  return json({
    andrzejki: andrzejkiView(fresh.row, context.now),
    fortune: { omen: omenView(omen.id), kind: evening.kind, cup, line: fortuneWords(fortune, rules()), reward, both },
    character: characterView(fresh, context.now),
  });
}
