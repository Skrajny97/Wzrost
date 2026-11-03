// Jubilerstwo in the Systemowa Szlifiernia (src/engine/jewelcraft.js): an
// order of up to maxCount jewels of one pattern and gem takes the gems and
// the ore at the start, and its report brings the jewels made into the bag,
// the gems of the failed ones lost and their ore back. Called back early,
// the character brings the jewels done and gets back all the rest. A setting
// takes its gem at the start and sets it in the item at the end, the gem
// that was there before gone; called back early, or with the item gone by
// then, the gem comes back. As every work, by the character or by its Awatar
// Systemu (`avatar` in the request).

import {
  bagCapacity,
  campLevels,
  craftJewels,
  gemOf,
  itemName,
  jewelCost,
  jewelOrderMinutes,
  jewelReport,
  knowsJewelPattern,
  potionsDone,
  professionState,
  setMinutes,
} from '../engine/index.js';
import { say } from '../engine/text.js';
import { content } from './content.js';
import { bagPlaces, characterView, currentHp, loadPlayer, requireNotExploring, requireWorker, workOf } from './characters.js';
import { toHex } from './encoding.js';
import { assertion, atomically, raced, sameVersion } from './atomic.js';
import { ApiError, json, readJson } from './http.js';
import { requireOpen } from './mining.js';
import { addTo, insertWork, requireProfessions, workGains } from './professions.js';
import { mineralsOf } from './professions-view.js';
import { trimReports } from './reports.js';

// A share of what an order took, by id: for `of` jewels out of `count`.
const shareOf = (amounts, of, count) =>
  Object.fromEntries(Object.entries(amounts ?? {}).map(([id, amount]) => [id, Math.round((amount * of) / Math.max(1, count))]));

// An order of jewels: a pattern the character knows, by the level or from a
// jewel taken apart, a gem it cuts, how many, what they take, at the
// character's level, which is also the jewels' level, and room for them in
// the bag.
function jewelOrder(player, level, body) {
  const { jewelcrafting } = content;
  const base = typeof body.baseId === 'string' ? content.basesById[body.baseId] : undefined;
  const learned = JSON.parse(player.row.patterns ?? '[]');
  if (!base || !jewelcrafting.ores[base.slot] || !knowsJewelPattern(base, level, learned, content)) throw new ApiError(400, 'unknown_pattern', 'Tego wzoru jeszcze nie znasz.');
  const gem = typeof body.rarity === 'string' ? gemOf(body.rarity, content) : undefined;
  if (!gem || gem.level > level) throw new ApiError(400, 'unknown_rarity', 'Tego kamienia jeszcze nie szlifujesz.');
  if (!Number.isInteger(body.count) || body.count < 1 || body.count > jewelcrafting.maxCount) {
    throw new ApiError(400, 'invalid_count', `Wybierz od 1 do ${jewelcrafting.maxCount} sztuk.`);
  }
  return {
    cost: jewelCost(base, gem.rarity, body.count, content),
    minutes: jewelOrderMinutes(body.count, gem.rarity, level, content),
    room: body.count,
    options: { base: base.id, rarity: gem.rarity, count: body.count, level: player.row.level },
  };
}

// A setting: an item of the character's, worn or in the bag, and a gem the
// level sets that is not in it already. A worn item waits while the
// character explores, as the Kowadło does, since the exploration's report is
// made with what it wears.
function settingOrder(player, level, body, now) {
  const item = player.items.find((candidate) => candidate.id === body.itemId);
  if (!item) throw new ApiError(404, 'item_not_found', 'Nie masz tego przedmiotu.');
  if (item.equippedSlot) requireNotExploring(player, now);
  const gem = typeof body.gem === 'string' ? content.mineralsById[body.gem] : undefined;
  if (!gem || gem.kind !== 'gem') throw new ApiError(400, 'unknown_gem', 'Nie ma takiego kamienia.');
  if (gem.level > level) throw new ApiError(403, 'locked', say(content.jewelcrafting.texts, 'hidden', 0, { level: gem.level }));
  if (item.gem === gem.id) throw new ApiError(409, 'same_gem', `${gem.name} już tkwi w tym przedmiocie.`);
  return { cost: { [gem.id]: 1 }, minutes: setMinutes(gem.id, level, content), room: 0, options: { set: true, item: item.id, itemName: itemName(item, content), gem: gem.id } };
}

// A work in the Szlifiernia from now on: an order of jewels, or with `set`
// a gem set in an item. The gems and the ore go at once, only if the
// character is still as seen, so two taps at once start one work.
export async function startJewelcraft(context) {
  const body = await readJson(context.request);
  const { session, player, avatar } = await requireWorker(context, body);
  requireProfessions(player);
  const { jewelcrafting } = content;
  requireOpen(player, content.professionsById[jewelcrafting.profession]);
  const { level } = professionState(JSON.parse(player.row.professions ?? '{}'), jewelcrafting.profession);
  const now = context.now;
  const order = body.set === true ? settingOrder(player, level, body, now) : jewelOrder(player, level, body);
  const have = mineralsOf(player.row);
  const short = Object.entries(order.cost).find(([id, amount]) => (have[id] ?? 0) < amount);
  if (short) throw new ApiError(409, 'no_minerals', `Brakuje: ${content.mineralsById[short[0]].name} (potrzeba ${short[1]}).`);
  const free = bagCapacity(campLevels(player.buildings, now, content), content) - bagPlaces(player);
  if (order.room > free) throw new ApiError(409, 'bag_full', `W plecaku musi być ${order.room} wolnych miejsc na całe zlecenie.`);

  const left = { ...have };
  for (const [id, amount] of Object.entries(order.cost)) {
    left[id] -= amount;
    if (left[id] === 0) delete left[id];
  }
  const { hp } = currentHp(player, now);
  const seed = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const { row } = player;
  const db = context.env.DB;
  // The batch holds only while the character is as read (atomic.js), so the
  // work starts only with what it takes taken by this request.
  const [, taken] = await atomically(db, [
    sameVersion(db, row),
    // The HP rested so far is saved, and resting goes on from now; the
    // Awatar's work leaves it be.
    db
      .prepare(
        `UPDATE characters SET minerals = ?${avatar ? '' : ', hp = ?, hp_at = ?'}, version = version + 1
         WHERE id = ? AND version = ? AND NOT EXISTS (SELECT 1 FROM ${avatar ? 'avatar_activities' : 'activities'} WHERE character_id = ?)`,
      )
      .bind(JSON.stringify(left), ...(avatar ? [] : [hp, now]), row.id, row.version, row.id),
    insertWork(db, avatar, row, {
      kind: 'jewels',
      placeId: jewelcrafting.place.id,
      minutes: order.minutes,
      now,
      seed,
      hp,
      options: { ...order.options, minerals: order.cost },
    }),
  ]);
  if (taken.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Postać zmieniła się w międzyczasie. Spróbuj ponownie.');
  return json({ character: characterView(await loadPlayer(db, session.userId), now) }, 201);
}

// A work claimed or called back by another request a moment ago.
const alreadyDone = () => new ApiError(409, 'already_claimed', 'Ten raport został już odebrany.');

// The report of a work in the Szlifiernia (claimHunt sends a finished one
// here), or with `stop` of the part done before now (cancelHunt). Stopped
// before the first jewel, or a setting called back, it only gives everything
// back and makes no report (null). With `avatar`, the work of the Awatar
// Systemu (avatar.js), which brings no XP, levels or stats.
export async function finishJewels(db, player, now, { stop = false, avatar = false } = {}) {
  const { row } = player;
  const { table, activity, key } = workOf(player, avatar);
  const { jewelcrafting } = content;
  const profession = content.professionsById[jewelcrafting.profession];
  const before = professionState(JSON.parse(row.professions ?? '{}'), profession.id);
  const options = JSON.parse(activity.options ?? '{}');
  // Only while the work is as seen (atomic.js), so a "Przerwij" and a claim
  // at once give back or give the jewels, never both.
  const ongoing = `EXISTS (SELECT 1 FROM ${table} WHERE character_id = ? AND started_at = ?)`;
  const stillThere = assertion(db, ongoing, [row.id, activity.started_at]);
  const end = db.prepare(`DELETE FROM ${table} WHERE character_id = ? AND started_at = ?`).bind(row.id, activity.started_at);
  // Gives `back` (minerals by id) and ends the work, with no report.
  const giveBack = async (back) => {
    const minerals = addTo('minerals', back);
    await atomically(
      db,
      [stillThere, db.prepare(`UPDATE characters SET version = version + 1${minerals.sql} WHERE id = ? AND ${ongoing}`).bind(...minerals.binds, row.id, row.id, activity.started_at), end],
      alreadyDone,
    );
    return null;
  };
  const known = (amounts) => Object.fromEntries(Object.entries(amounts ?? {}).filter(([id]) => content.mineralsById[id]));
  const taken = known(options.minerals);

  if (options.set) {
    const gem = content.mineralsById[options.gem];
    if (stop || !gem) return giveBack(taken);
    // An item gone by now (sold, taken apart, given away) gets no gem: the
    // gem comes back, and the report says so.
    const item = player.items.find((candidate) => candidate.id === options.item) ?? null;
    // The item as its row's data keeps it, without the row's id and slot.
    const data = item && Object.fromEntries(Object.entries(item).filter(([field]) => field !== 'id' && field !== 'equippedSlot'));
    return saveReport(item ? {} : taken, { set: { gem: gem.id, item: data && { ...data, gem: gem.id }, replaced: data?.gem ?? null } }, activity.minutes, item);
  }

  const base = content.basesById[options.base];
  const gem = gemOf(options.rarity, content);
  // A pattern or a gem the data no longer has makes nothing.
  const count = base && gem ? options.count : 0;
  const elapsed = now - activity.started_at;
  const done = stop ? potionsDone(count, activity.minutes, elapsed) : count;
  const worked = stop ? Math.floor(elapsed / 60000) : activity.minutes;
  const results =
    done > 0
      ? craftJewels({ baseId: base.id, rarityId: options.rarity, count: done, level: options.level, professionLevel: before.level, met: JSON.parse(row.met ?? '[]'), seed: activity.seed }, content)
      : [];
  const madeCount = results.filter((result) => result.made).length;
  // The gems of the jewels not done come back, and the ore of those and of
  // the failed ones.
  const isGem = (id) => content.mineralsById[id].kind === 'gem';
  const back = {
    ...shareOf(Object.fromEntries(Object.entries(taken).filter(([id]) => isGem(id))), options.count - done, options.count),
    ...shareOf(Object.fromEntries(Object.entries(taken).filter(([id]) => !isGem(id))), options.count - madeCount, options.count),
  };
  if (done === 0) return giveBack(back);
  return saveReport(back, { base, rarityId: options.rarity, results }, worked, null);

  // Saves the report of the work with what comes back to the character
  // (`back`), the profession's levels and XP (workGains), the jewels made
  // into the bag, or the gem set in the item (`item`, as read), and ends
  // the work.
  async function saveReport(returned, made, minutes, item) {
    const { character, after, xp, work, sets } = workGains(player, profession, before, minutes, avatar, now);
    const report = {
      ...jewelReport(
        {
          ...made,
          learned: JSON.parse(player.row.patterns ?? '[]'),
          minutes,
          startedAt: activity.started_at,
          endsAt: stop ? now : activity.ends_at,
          seed: activity.seed,
          stopped: stop,
          before,
          after,
          character,
          xp,
          work,
        },
        content,
      ),
      ...(avatar && { avatar: true }),
    };
    const summary = {
      placeName: report.placeName,
      minutes: report.minutes,
      ...(report.set
        ? { set: { gem: report.set.gem.name, item: report.set.item?.name ?? null } }
        : { items: report.items.length > 0 ? [{ name: report.base.name, count: report.items.length }] : [], failed: report.failed }),
      xp,
      professionName: profession.name,
      professionLevel: after.level,
      levelAfter: work.level,
      system: report.system,
      ...(avatar && { avatar: true }),
    };
    const minerals = addTo('minerals', returned);
    const insertItem = db.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, ?)');
    const jewels = (made.results ?? []).filter((result) => result.made).map((result) => result.item);
    let saved;
    try {
      saved = await db.batch([
        stillThere,
        // The item is still the character's: one gone a moment ago is told
        // at the next claim, and its gem comes back then.
        ...(item ? [assertion(db, 'EXISTS (SELECT 1 FROM items WHERE id = ? AND character_id = ?)', [item.id, row.id])] : []),
        db
          .prepare('INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(row.id, key, 'jewels', now, JSON.stringify(summary), JSON.stringify(report)),
        trimReports(db, row.id, 'jewels'),
        db
          .prepare(`UPDATE characters SET version = version + 1${sets.sql}${minerals.sql} WHERE id = ? AND ${ongoing}`)
          .bind(...sets.binds, ...minerals.binds, row.id, row.id, activity.started_at),
        // The gem goes into the item as it is now, so an upgrade meanwhile stays.
        ...(item ? [db.prepare("UPDATE items SET data = json_set(data, '$.gem', ?) WHERE id = ? AND character_id = ?").bind(made.set.gem, item.id, row.id)] : []),
        // The jewels made go to the bag; the room was there at the start.
        ...jewels.map((jewel) => insertItem.bind(row.id, JSON.stringify(jewel), now)),
        end,
      ]);
    } catch (error) {
      if (item && raced(error)) throw new ApiError(409, 'conflict', 'Coś zmieniło się w międzyczasie. Spróbuj ponownie.');
      if (String(error?.message).includes('UNIQUE') || raced(error)) throw alreadyDone();
      throw error;
    }
    return { id: saved[item ? 2 : 1].meta.last_row_id, report };
  }
}
