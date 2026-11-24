// Kulki Profesji over the scene of a work (data/orbs.json `professions`,
// src/engine/profession-orbs.js; DECISIONS.md, „Kulki Profesji
// (24.11.2026)”), apart from the Kulki Systemu of an exploration (orbs.js)
// but as they are: the page gets the moments of the orbs of the
// character's own work under way (workOrbsView), never what they give. A
// tap catches one (claimWorkOrb) while that work runs, the orb is due and
// within its window by the server's clock, it is not caught yet and the
// day's own perDay is not reached. The orb's number goes with the work
// (options.orbs), the day's count with the character (profession_orbs:
// { day, count }) and its reward onto the character, in one atomic batch:
// a second tap, or a tap of a page that lags behind, answers with the
// game's usual 409. The Awatar Systemu's work has none: its rows are
// elsewhere (avatar.js).

import {
  bagCapacity,
  campLevels,
  helpableWork,
  helpProfession,
  orbBlock,
  orbsCaught,
  professionState,
  questPeriod,
  storeStacks,
  workOrbProducts,
  workOrbReward,
  workOrbTimes,
} from '../engine/index.js';
import { countedForm } from '../engine/text.js';
import { assertion, atomically, sameVersion } from './atomic.js';
import { bagPlaces, characterView, loadPlayer, requirePlayer } from './characters.js';
import { content } from './content.js';
import { ApiError, json, readJson } from './http.js';
import { numberText } from './i18n.js';
import { caughtOrbs } from './orbs.js';
import { addTo, workGains } from './professions.js';
import { herbsOf, potionsOf } from './professions-view.js';

const rules = () => content().orbs?.professions ?? null;

// When each orb of a work (its row in activities) comes, in server time, by
// the orb's number.
export const workOrbTimesOf = (activity) =>
  workOrbTimes({ seed: activity.seed, minutes: activity.minutes, startedAt: activity.started_at, endsAt: activity.ends_at }, content());

// Whether the character's activity is a work of a profession under way.
const working = (activity, now) => helpableWork(activity?.kind) && activity.ends_at > now;

// The orbs caught today, from the character's row.
const caughtToday = (row, now) => orbsCaught(JSON.parse(row.profession_orbs ?? 'null'), now, content(), rules().perDay);

// The orbs of the character's work under way, for its scene on the
// Profesje screen, as orbsView gives an exploration's: when each comes
// (`at`, server time, by its number), those caught (`claimed`), how many
// the day still allows (`left`) and when the day ends (`resetsAt`); null
// with no work under way or none of its orbs.
export function workOrbsView(activity, row, now) {
  if (!rules() || !working(activity, now)) return null;
  const at = workOrbTimesOf(activity);
  if (at.length === 0) return null;
  return { at, claimed: caughtOrbs(activity), left: Math.max(0, rules().perDay - caughtToday(row, now)), resetsAt: questPeriod('daily', now, content()).endsAt };
}

// A text of data/orbs.json with its {name} filled in.
const fill = (template, vars) => template.replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole));

// A product's name, by where it goes (WORK_ORB_STORES).
function productName(store, id) {
  const byStore = { herbs: content().herbsById, potions: content().potionsById, minerals: content().mineralsById, pantry: content().pantryById };
  return byStore[store]?.[id]?.name ?? id;
}

// What the reward sets on the character (`sql`, `binds`, after the day's
// count) and its words in the bubble: "Kulka Profesji: +120 drewna". The
// bag's herbs and potions go in as a work's do (storeStacks): what does not
// fit is lost, and the words say so. The XP goes by the work's own path
// (workGains, as its report): the profession's XP of those minutes, with
// the week's and a side Intelekt's share, the levels and the stats they
// bring, and the bit of the character's XP of that much work.
function rewardWrite(reward, player, profession, now) {
  const { texts } = rules();
  const { row } = player;
  if (reward.kind === 'resources') {
    const set = addTo('resources', { [reward.resource]: reward.amount });
    return { ...set, text: fill(texts.resources, { amount: numberText(reward.amount), resource: content().resourcesById[reward.resource].genitive }) };
  }
  if (reward.kind === 'product') {
    const name = productName(reward.store, reward.product);
    const found = { [reward.product]: reward.amount };
    const bag = reward.store === 'herbs' || reward.store === 'potions';
    const free = bag ? bagCapacity(campLevels(player.buildings, now, content()), content()) - bagPlaces(player) : 0;
    const { stored, lost } = bag ? storeStacks(reward.store === 'herbs' ? herbsOf(row) : potionsOf(row), found, free, content()) : { stored: found, lost: {} };
    const left = lost[reward.product] ?? 0;
    const words = { amount: numberText(reward.amount), product: name, lost: `${numberText(left)} × ${name}` };
    return { ...addTo(reward.store, stored), text: fill(left > 0 ? texts.productLost : texts.product, words), ...(left > 0 && { lost: left }) };
  }
  if (reward.kind === 'xp') {
    const before = professionState(JSON.parse(row.professions ?? '{}'), profession.id);
    const { after, sets } = workGains(player, profession, before, reward.minutes, false, now);
    const words = { amount: numberText(after.gained), profession: profession.genitive, level: after.level };
    return { ...sets, text: fill(after.level > before.level ? texts.xpLevel : texts.xp, words), xp: after.gained, level: after.level };
  }
  return {
    sql: ', time_points = time_points + ?',
    binds: [reward.timePoints],
    text: fill(texts.time, { amount: numberText(reward.timePoints), points: countedForm(reward.timePoints, content().orbs.texts.timePointForms) }),
  };
}

// { index }: the orb of that number of the character's own work under way.
// Its reward goes by the levels the work began with (options.levels, kept
// from 24.11.2026; the levels now for a work begun before), the products
// by the profession's level now.
export async function claimWorkOrb(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const orbs = rules();
  if (!orbs) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  const { texts, perDay } = orbs;
  const { row, activity } = player;
  const now = context.now;
  if (!working(activity, now)) throw new ApiError(409, 'no_work', texts.noWork);
  const times = workOrbTimesOf(activity);
  const { index } = body;
  if (!Number.isInteger(index) || index < 0 || index >= times.length) throw new ApiError(404, 'no_orb', texts.noOrb);
  const caught = caughtToday(row, now);
  const block = orbBlock({ at: times[index], now, taken: caughtOrbs(activity).includes(index), caught, perDay }, content());
  if (block) throw new ApiError(409, `orb_${block}`, block === 'limit' ? fill(texts.limit, { count: numberText(perDay) }) : texts[block]);
  const options = JSON.parse(activity.options ?? '{}');
  const profession = helpProfession(activity.kind, content());
  const { level: professionLevel } = professionState(JSON.parse(row.professions ?? '{}'), profession.id);
  const reward = workOrbReward(
    {
      seed: activity.seed,
      index,
      kind: activity.kind,
      level: options.levels?.level ?? row.level,
      classLevel: options.levels?.classLevel ?? row.class_level,
      products: workOrbProducts({ kind: activity.kind, options, level: professionLevel }, content()),
    },
    content(),
  );
  const { sql, binds, text, ...more } = rewardWrite(reward, player, profession, now);
  const db = context.env.DB;
  await atomically(db, [
    // The character as read, so the day's count, the bag and the
    // profession's XP are the ones read.
    sameVersion(db, row),
    // The work as read, still under way, the orb not caught on it yet.
    assertion(
      db,
      `EXISTS (SELECT 1 FROM activities WHERE character_id = ? AND kind = ? AND started_at = ? AND seed = ? AND ends_at > ?
         AND NOT EXISTS (SELECT 1 FROM json_each(activities.options, '$.orbs') WHERE value = ?))`,
      [row.id, activity.kind, activity.started_at, activity.seed, now, index],
    ),
    db
      .prepare(
        "UPDATE activities SET options = json_set(COALESCE(options, '{}'), '$.orbs', json_insert(COALESCE(json_extract(options, '$.orbs'), json_array()), '$[#]', ?)) WHERE character_id = ? AND started_at = ?",
      )
      .bind(index, row.id, activity.started_at),
    db
      .prepare(`UPDATE characters SET profession_orbs = ?${sql}, version = version + 1 WHERE id = ?`)
      .bind(JSON.stringify({ day: questPeriod('daily', now, content()).key, count: caught + 1 }), ...binds, row.id),
  ]);
  return json({ orb: { index, ...reward, ...more, text }, character: characterView(await loadPlayer(db, session.userId), now) });
}
