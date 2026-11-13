// Jubilerstwo in the Systemowa Szlifiernia (src/engine/jewelcraft.js): an
// order of as many jewels of one pattern and gem as the gems and the ore
// allow, with no cap on their number or time (as in the Warsztat, the
// author, 12.11.2026), takes the gems and the ore at the start, and its
// report brings the jewels made into the Przechowalnia, out of the bag (842,
// storage.js), the gems of the failed ones lost and their ore back. Called back early,
// the character brings the jewels done and gets back all the rest. A setting
// takes its gem at the start and sets it in the item at the end, the gem
// that was there before gone; called back early, or with the item gone by
// then, the gem comes back. As every work, by the character or by its Awatar
// Systemu (`avatar` in the request).

import {
  addQuestProgress,
  craftJewels,
  gemOf,
  itemName,
  jewelCost,
  jewelOrderMinutes,
  jewelReport,
  knowsJewelPattern,
  potionsDone,
  professionState,
  nextGem,
  setMinutes,
  transmuteBlock,
  transmuteGems,
  weakerGem,
} from '../engine/index.js';
import { say } from '../engine/text.js';
import { content } from './content.js';
import { characterView, coreOf, currentHp, loadPlayer, questsNow, requireNotExploring, requirePlayer, requireWorker, workOf } from './characters.js';
import { cardSummary, cardUpserts, workCard } from './cards.js';
import { labyrinthOn } from './features.js';
import { toHex } from './encoding.js';
import { assertion, atomically, raced, sameVersion } from './atomic.js';
import { ApiError, json, readJson } from './http.js';
import { t } from './i18n.js';
import { requireOpen } from './mining.js';
import { addTo, insertWork, requireProfessions, workClaim, workClaimFailed, workGains } from './professions.js';
import { workFamePoints } from './fame.js';
import { mineralsOf } from './professions-view.js';
import { trimReports } from './reports.js';

// A share of what an order took, by id: for `of` jewels out of `count`.
const shareOf = (amounts, of, count) =>
  Object.fromEntries(Object.entries(amounts ?? {}).map(([id, amount]) => [id, Math.round((amount * of) / Math.max(1, count))]));

// An order of jewels: a pattern the character knows, by the level or from a
// jewel taken apart, a gem it cuts, how many and what they take, at the
// character's level, which is also the jewels' level.
function jewelOrder(player, level, body) {
  const { jewelcrafting } = content();
  const base = typeof body.baseId === 'string' ? content().basesById[body.baseId] : undefined;
  const learned = JSON.parse(player.row.patterns ?? '[]');
  if (!base || !jewelcrafting.ores[base.slot] || !knowsJewelPattern(base, level, learned, content())) throw new ApiError(400, 'unknown_pattern', 'Tego wzoru jeszcze nie znasz.');
  const gem = typeof body.rarity === 'string' ? gemOf(body.rarity, content()) : undefined;
  if (!gem || gem.level > level) throw new ApiError(400, 'unknown_rarity', 'Tego kamienia jeszcze nie szlifujesz.');
  // As many as the gems and the ore allow (checked by the caller).
  if (!Number.isSafeInteger(body.count) || body.count < 1) throw new ApiError(400, 'invalid_count', 'Wybierz co najmniej 1 sztukę.');
  return {
    cost: jewelCost(base, gem.rarity, body.count, content()),
    minutes: jewelOrderMinutes(body.count, gem.rarity, level, content()),
    options: { base: base.id, rarity: gem.rarity, count: body.count, level: player.row.level },
  };
}

// A setting: an item of the character's, worn or in the bag, and a gem the
// level sets that is not in it already and not weaker than the one in it. A worn item waits while the
// character explores, as the Kowadło does, since the exploration's report is
// made with what it wears. One setting of an item at a time: of the
// character's and the Awatar's, the later would break the earlier's gem
// without asking (the code review of 3.11.2026).
function settingOrder(player, level, body, now) {
  // The Rdzeń takes one gem as any item does (863 A), where the Labirynt is
  // on and the Rdzeń is open.
  if (body.itemId === 'core') return coreSettingOrder(player, level, body, now);
  const item = player.items.find((candidate) => candidate.id === body.itemId);
  if (!item) throw new ApiError(404, 'item_not_found', 'Nie masz tego przedmiotu.');
  if (item.equippedSlot) requireNotExploring(player, now);
  const setting = [player.activity, player.avatarActivity].some((work) => {
    if (work?.kind !== 'jewels') return false;
    const options = JSON.parse(work.options ?? '{}');
    return options.set === true && options.item === item.id;
  });
  if (setting) throw new ApiError(409, 'setting_under_way', 'W tym przedmiocie trwa już oprawianie kamienia.');
  const gem = typeof body.gem === 'string' ? content().mineralsById[body.gem] : undefined;
  if (!gem || gem.kind !== 'gem') throw new ApiError(400, 'unknown_gem', 'Nie ma takiego kamienia.');
  if (gem.level > level) throw new ApiError(403, 'locked', say(content().jewelcrafting.texts, 'hidden', 0, { level: gem.level }));
  if (item.gem === gem.id) throw new ApiError(409, 'same_gem', `${gem.name} już tkwi w tym przedmiocie.`);
  // Only a stronger gem takes the place of one (the author, 13.11.2026).
  if (weakerGem(gem.id, item.gem, content())) throw new ApiError(409, 'weaker_gem', t('W tym przedmiocie tkwi {gem}. Oprawisz w nim tylko mocniejszy kamień.', { gem: content().mineralsById[item.gem].name }));
  return { cost: { [gem.id]: 1 }, minutes: setMinutes(gem.id, level, content()), options: { set: true, item: item.id, itemName: itemName(item, content()), gem: gem.id } };
}

// A gem set in the Rdzeń: as in a worn item, it waits for the character's
// return from an exploration, as the Rdzeń counts in its fights, and one
// setting of it at a time.
function coreSettingOrder(player, level, body, now) {
  if (!labyrinthOn() || !coreOf(player.row).open) throw new ApiError(404, 'item_not_found', 'Nie masz tego przedmiotu.');
  requireNotExploring(player, now);
  const setting = [player.activity, player.avatarActivity].some((work) => work?.kind === 'jewels' && JSON.parse(work.options ?? '{}').core === true);
  if (setting) throw new ApiError(409, 'setting_under_way', 'W Rdzeniu trwa już oprawianie kamienia.');
  const gem = typeof body.gem === 'string' ? content().mineralsById[body.gem] : undefined;
  if (!gem || gem.kind !== 'gem') throw new ApiError(400, 'unknown_gem', 'Nie ma takiego kamienia.');
  if (gem.level > level) throw new ApiError(403, 'locked', say(content().jewelcrafting.texts, 'hidden', 0, { level: gem.level }));
  if (coreOf(player.row).gem === gem.id) throw new ApiError(409, 'same_gem', `${gem.name} już tkwi w Rdzeniu.`);
  if (weakerGem(gem.id, coreOf(player.row).gem, content())) throw new ApiError(409, 'weaker_gem', t('W Rdzeniu tkwi {gem}. Oprawisz w nim tylko mocniejszy kamień.', { gem: content().mineralsById[coreOf(player.row).gem].name }));
  const name = content().slotsById.core?.name ?? 'Rdzeń';
  return { cost: { [gem.id]: 1 }, minutes: setMinutes(gem.id, level, content()), options: { set: true, core: true, itemName: name, gem: gem.id } };
}

// A work in the Szlifiernia from now on: an order of jewels, or with `set`
// a gem set in an item. The gems and the ore go at once, only if the
// character is still as seen, so two taps at once start one work. The
// bag's room does not count: the jewels wait in the Przechowalnia (842).
export async function startJewelcraft(context) {
  const body = await readJson(context.request);
  const { session, player, avatar } = await requireWorker(context, body);
  requireProfessions(player);
  const { jewelcrafting } = content();
  requireOpen(player, content().professionsById[jewelcrafting.profession]);
  const { level } = professionState(JSON.parse(player.row.professions ?? '{}'), jewelcrafting.profession);
  const now = context.now;
  const order = body.set === true ? settingOrder(player, level, body, now) : jewelOrder(player, level, body);
  const have = mineralsOf(player.row);
  const short = Object.entries(order.cost).find(([id, amount]) => (have[id] ?? 0) < amount);
  if (short) throw new ApiError(409, 'no_minerals', `Brakuje: ${content().mineralsById[short[0]].name} (potrzeba ${short[1]}).`);

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

// POST /api/professions/transmute: the przemiana of gems (913 A and B):
// `count` times transmute.cost gems of one kind into `count` gems one rarity
// up, at once and without a work, so also while the character explores or
// works. Only into a gem the System shows at the level of Jubilerstwo
// (transmuteBlock). Saved only over the character as read, so two taps at
// once never use the same gems twice.
export async function transmuteGemsNow(context) {
  const body = await readJson(context.request);
  const { session, player } = await requirePlayer(context);
  requireProfessions(player);
  const { jewelcrafting } = content();
  requireOpen(player, content().professionsById[jewelcrafting.profession]);
  const { level } = professionState(JSON.parse(player.row.professions ?? '{}'), jewelcrafting.profession);
  const gemId = typeof body.gem === 'string' ? body.gem : '';
  const have = mineralsOf(player.row);
  const blocked = transmuteBlock({ gemId, count: body.count, have: have[gemId] ?? 0, level }, content());
  if (blocked) throw new ApiError(blocked.code === 'unknown_gem' || blocked.code === 'invalid_count' ? 400 : 409, blocked.code, blocked.message);
  const left = transmuteGems(have, gemId, body.count, content());
  const { row } = player;
  const db = context.env.DB;
  const [, saved] = await atomically(db, [
    sameVersion(db, row),
    db.prepare('UPDATE characters SET minerals = ?, version = version + 1 WHERE id = ? AND version = ?').bind(JSON.stringify(left), row.id, row.version),
  ]);
  if (saved.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Postać zmieniła się w międzyczasie. Spróbuj ponownie.');
  return json({ transmuted: { from: gemId, to: nextGem(gemId, content())?.id ?? null, count: body.count }, character: characterView(await loadPlayer(db, session.userId), context.now) });
}

// A work claimed or called back by another request a moment ago.
const alreadyDone = () => new ApiError(409, 'already_claimed', 'Ten raport został już odebrany.');

// The report of a work in the Szlifiernia (claimHunt sends a finished one
// here), or with `stop` of the part done before now (cancelHunt). Stopped
// before the first jewel, or a setting called back, it only gives everything
// back and makes no report (null). With `avatar`, the work of the Awatar
// Systemu (avatar.js), which brings its share of the XP and of the levels
// since 10.11.2026 (workGains).
export async function finishJewels(db, player, now, { stop = false, avatar = false } = {}) {
  const { row } = player;
  const { table, activity, key } = workOf(player, avatar);
  const { jewelcrafting } = content();
  const profession = content().professionsById[jewelcrafting.profession];
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
  const known = (amounts) => Object.fromEntries(Object.entries(amounts ?? {}).filter(([id]) => content().mineralsById[id]));
  const taken = known(options.minerals);

  if (options.set && options.core) {
    const gem = content().mineralsById[options.gem];
    if (stop || !gem || !labyrinthOn() || !coreOf(row).open) return giveBack(taken);
    // The Rdzeń takes its gem only once the character is back from an
    // exploration and its report is claimed, as a worn item does.
    if (['hunt', 'mercenary'].includes(player.activity?.kind)) {
      throw new ApiError(
        409,
        'item_worn_exploring',
        player.activity.kind === 'mercenary'
          ? 'Kamień trafi do Rdzenia, gdy postać skończy usługę najemną albo zdejmie ogłoszenie.'
          : 'Kamień trafi do Rdzenia, gdy postać wróci z wyprawy i odbierze jej raport.',
      );
    }
    return saveReport({}, { set: { gem: gem.id, core: true, replaced: coreOf(row).gem } }, activity.minutes, null);
  }

  if (options.set) {
    const gem = content().mineralsById[options.gem];
    if (stop || !gem) return giveBack(taken);
    // An item gone by now (sold, taken apart, given away) gets no gem: the
    // gem comes back, and the report says so.
    const item = player.items.find((candidate) => candidate.id === options.item) ?? null;
    // A worn item takes its gem only once the character is back from an
    // exploration and its report is claimed, as that report is made with
    // what it wears (the code review of 3.11.2026: the Awatar's setting
    // claimed on the way changed the exploration's fights).
    // A mercenary's gear waits as well (mercenaries.js).
    if (item?.equippedSlot && ['hunt', 'mercenary'].includes(player.activity?.kind)) {
      throw new ApiError(
        409,
        'item_worn_exploring',
        player.activity.kind === 'mercenary'
          ? 'Kamień trafi do noszonego przedmiotu, gdy postać skończy usługę najemną albo zdejmie ogłoszenie.'
          : 'Kamień trafi do noszonego przedmiotu, gdy postać wróci z wyprawy i odbierze jej raport.',
      );
    }
    // The item as its row's data keeps it, without the row's id and slot.
    const data = item && Object.fromEntries(Object.entries(item).filter(([field]) => field !== 'id' && field !== 'equippedSlot'));
    return saveReport(item ? {} : taken, { set: { gem: gem.id, item: data && { ...data, gem: gem.id }, replaced: data?.gem ?? null } }, activity.minutes, item);
  }

  const base = content().basesById[options.base];
  const gem = gemOf(options.rarity, content());
  // A pattern or a gem the data no longer has makes nothing.
  const count = base && gem ? options.count : 0;
  const elapsed = now - activity.started_at;
  const done = stop ? potionsDone(count, activity.minutes, elapsed) : count;
  const worked = stop ? Math.floor(elapsed / 60000) : activity.minutes;
  const results =
    done > 0
      ? craftJewels({ baseId: base.id, rarityId: options.rarity, count: done, level: options.level, professionLevel: before.level, met: JSON.parse(row.met ?? '[]'), seed: activity.seed }, content())
      : [];
  const madeCount = results.filter((result) => result.made).length;
  // The gems of the jewels not done come back, and the ore of those and of
  // the failed ones.
  const isGem = (id) => content().mineralsById[id].kind === 'gem';
  const back = {
    ...shareOf(Object.fromEntries(Object.entries(taken).filter(([id]) => isGem(id))), options.count - done, options.count),
    ...shareOf(Object.fromEntries(Object.entries(taken).filter(([id]) => !isGem(id))), options.count - madeCount, options.count),
  };
  if (done === 0) return giveBack(back);
  return saveReport(back, { base, rarityId: options.rarity, results }, worked, null);

  // Saves the report of the work with what comes back to the character
  // (`back`), the profession's levels and XP (workGains), the jewels made
  // into the Przechowalnia, or the gem set in the item (`item`, as read),
  // and ends the work.
  async function saveReport(returned, made, minutes, item) {
    const { character, after, xp, work, sets } = workGains(player, profession, before, minutes, avatar, now);
    // A card the work may leave, by the time it lasted (903, cards.js).
    const card = await workCard(db, row, activity, minutes);
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
        content(),
      ),
      ...(avatar && { avatar: true }),
      ...(card && { cards: card.cards }),
    };
    const summary = {
      placeName: report.placeName,
      minutes: report.minutes,
      ...(report.set
        ? { set: { gem: report.set.gem.name, item: report.set.core ? options.itemName : (report.set.item?.name ?? null) } }
        : { items: report.items.length > 0 ? [{ name: report.base.name, count: report.items.length }] : [], failed: report.failed }),
      xp,
      professionName: profession.name,
      professionLevel: after.level,
      levelAfter: work.level,
      system: report.system,
      ...(avatar && { avatar: true }),
      ...(card && { cards: cardSummary(card.cards) }),
    };
    const minerals = addTo('minerals', returned);
    const store = db.prepare('INSERT INTO storage_items (character_id, data, created_at) VALUES (?, ?, ?)');
    const jewels = (made.results ?? []).filter((result) => result.made).map((result) => result.item);
    // The jewels that came out move the quests of jewellery (jewelAny).
    const quests = JSON.stringify(addQuestProgress(questsNow(player, now), { jewels: jewels.length }));
    let saved;
    try {
      saved = await db.batch([
        // The work still there and the character as read (workClaim).
        workClaim(db, row, table, activity),
        // The item is still the character's: one gone a moment ago is told
        // at the next claim, and its gem comes back then.
        ...(item ? [assertion(db, 'EXISTS (SELECT 1 FROM items WHERE id = ? AND character_id = ?)', [item.id, row.id])] : []),
        db
          .prepare('INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(row.id, key, 'jewels', now, JSON.stringify(summary), JSON.stringify(report)),
        trimReports(db, row.id, 'jewels'),
        db
          .prepare(`UPDATE characters SET version = version + 1, quests = CASE WHEN quests = ? THEN ? ELSE quests END${sets.sql}${minerals.sql} WHERE id = ? AND ${ongoing}`)
          .bind(row.quests, quests, ...sets.binds, ...minerals.binds, row.id, row.id, activity.started_at),
        // The gem goes into the item as it is now, so an upgrade meanwhile stays.
        ...(item ? [db.prepare("UPDATE items SET data = json_set(data, '$.gem', ?) WHERE id = ? AND character_id = ?").bind(made.set.gem, item.id, row.id)] : []),
        // Or into the Rdzeń, the gem before it gone (core.js).
        ...(made.set?.core ? [db.prepare("UPDATE characters SET core = json_set(core, '$.gem', ?) WHERE id = ?").bind(made.set.gem, row.id)] : []),
        // The jewels made wait in the Przechowalnia, out of the bag (842).
        ...jewels.map((jewel) => store.bind(row.id, JSON.stringify(jewel), now)),
        // The Punkty Sławy of the work (fame.js), the Awatar's a quarter.
        ...workFamePoints(db, row.id, minutes, avatar, now),
        // The card the work left, a copy (cards.js).
        ...cardUpserts(db, row.id, card?.ids ?? [], now),
        end,
      ]);
    } catch (error) {
      if (String(error?.message).includes('UNIQUE')) throw alreadyDone();
      if (raced(error)) {
        const failed = await workClaimFailed(db, row, table, activity);
        throw item && failed.code !== 'already_claimed' ? new ApiError(409, 'conflict', 'Coś zmieniło się w międzyczasie. Spróbuj ponownie.') : failed;
      }
      throw error;
    }
    return { id: saved[item ? 2 : 1].meta.last_row_id, report };
  }
}
