// Kulki Systemu on the exploration board (data/orbs.json, src/engine/orbs.js;
// DECISIONS.md, „Kulki Systemu na planszy wyprawy (makieta, 19.11.2026)”).
// The page gets the moments of the orbs of the exploration under way with
// the character (orbsView), never what they give. A tap catches one
// (claimOrb) while the exploration runs, the orb is due and within its
// window by the server's clock, it is not caught yet and the day's perDay is
// not reached. The orb's number goes with the exploration (options.orbs),
// the day's count with the character (orbs: { day, count }) and its reward
// onto the character, in one atomic batch: a second tap, or a tap of a page
// that lags behind, answers with the game's usual 409.

import { areaFor, orbBlock, orbMoments, orbReward, orbsCaught, questPeriod } from '../engine/index.js';
import { countedForm, nameInText } from '../engine/text.js';
import { assertion, atomically, sameVersion } from './atomic.js';
import { characterView, loadPlayer, requirePlayer } from './characters.js';
import { content } from './content.js';
import { ApiError, json, readJson } from './http.js';
import { numberText } from './i18n.js';

// When each orb of an exploration (its row in activities) comes, in server
// time, by the orb's number.
export const orbTimes = (activity) => orbMoments(activity.seed, activity.minutes, activity.ends_at - activity.started_at, content()).map((offset) => activity.started_at + offset);

// The numbers of the orbs caught on an exploration so far.
export function caughtOrbs(activity) {
  const caught = JSON.parse(activity.options ?? '{}').orbs;
  return Array.isArray(caught) ? caught : [];
}

// The orbs of the character's exploration under way, for the Walka scene:
// when each comes (`at`, server time, by its number), those caught
// (`claimed`), how many the day still allows (`left`) and when the day ends
// (`resetsAt`, from when `left` is perDay again); null with no exploration
// under way or none of its orbs.
export function orbsView(activity, row, now) {
  const rules = content().orbs;
  if (!rules || activity?.kind !== 'hunt' || activity.ends_at <= now) return null;
  const at = orbTimes(activity);
  if (at.length === 0) return null;
  return {
    at,
    claimed: caughtOrbs(activity),
    left: Math.max(0, rules.perDay - orbsCaught(JSON.parse(row.orbs ?? 'null'), now, content())),
    resetsAt: questPeriod('daily', now, content()).endsAt,
  };
}

// A text of data/orbs.json with its {name} filled in.
const fill = (template, vars) => template.replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole));

// What the orb gave, in the words of the bubble: "Kulka Systemu: +120 złota".
function rewardText(reward) {
  const { texts } = content().orbs;
  if (reward.kind === 'gold') return fill(texts.gold, { amount: numberText(reward.gold) });
  if (reward.kind === 'time') return fill(texts.time, { amount: numberText(reward.timePoints), points: countedForm(reward.timePoints, texts.timePointForms) });
  return fill(texts.material, { amount: numberText(reward.amount), material: nameInText(content().materialsById[reward.material].name, content()) });
}

// { index }: the orb of that number of the character's own exploration
// under way. Its reward goes by the levels the exploration set out with
// (924 A): the gold by the character's, the late half by the class's
// (0.4.60), so the orb gives the same whenever it is caught.
export async function claimOrb(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const rules = content().orbs;
  const { texts } = rules;
  const { row, activity } = player;
  const now = context.now;
  if (activity?.kind !== 'hunt' || activity.ends_at <= now) throw new ApiError(409, 'no_exploration', texts.noExploration);
  const times = orbTimes(activity);
  const { index } = body;
  if (!Number.isInteger(index) || index < 0 || index >= times.length) throw new ApiError(404, 'no_orb', texts.noOrb);
  const caught = orbsCaught(JSON.parse(row.orbs ?? 'null'), now, content());
  const block = orbBlock({ at: times[index], now, taken: caughtOrbs(activity).includes(index), caught }, content());
  if (block) throw new ApiError(409, `orb_${block}`, block === 'limit' ? fill(texts.limit, { count: numberText(rules.perDay) }) : texts[block]);
  const levels = JSON.parse(activity.options ?? '{}').levels;
  const level = levels?.level ?? row.level;
  const classLevel = levels?.classLevel ?? row.class_level;
  const reward = orbReward({ seed: activity.seed, index, level, classLevel, area: areaFor(activity.region_id, level, content()) }, content());
  const stack = reward.kind === 'material' ? `$."${reward.stack}"` : null;
  const db = context.env.DB;
  await atomically(db, [
    // The character as read, so the day's count is the one read.
    sameVersion(db, row),
    // The exploration as read, still under way, the orb not caught on it yet.
    assertion(
      db,
      `EXISTS (SELECT 1 FROM activities WHERE character_id = ? AND kind = 'hunt' AND started_at = ? AND seed = ? AND ends_at > ?
         AND NOT EXISTS (SELECT 1 FROM json_each(activities.options, '$.orbs') WHERE value = ?))`,
      [row.id, activity.started_at, activity.seed, now, index],
    ),
    db
      .prepare("UPDATE activities SET options = json_set(options, '$.orbs', json_insert(COALESCE(json_extract(options, '$.orbs'), json_array()), '$[#]', ?)) WHERE character_id = ? AND started_at = ?")
      .bind(index, row.id, activity.started_at),
    db
      .prepare(`UPDATE characters SET gold = gold + ?, time_points = time_points + ?${stack ? ', materials = json_set(materials, ?, COALESCE(json_extract(materials, ?), 0) + ?)' : ''}, orbs = ?, version = version + 1 WHERE id = ?`)
      .bind(
        reward.kind === 'gold' ? reward.gold : 0,
        reward.kind === 'time' ? reward.timePoints : 0,
        ...(stack ? [stack, stack, reward.amount] : []),
        JSON.stringify({ day: questPeriod('daily', now, content()).key, count: caught + 1 }),
        row.id,
      ),
  ]);
  return json({ orb: { index, ...reward, text: rewardText(reward) }, character: characterView(await loadPlayer(db, session.userId), now) });
}
