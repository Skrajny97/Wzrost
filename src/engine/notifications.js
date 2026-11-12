// @ts-check
// Phone notifications (src/server/push.js sends them): what a player hears
// about from a stretch of time, after `from` up to `to`: the exploration,
// gathering, brewing, order of items, digging or work in the Szlifiernia
// that ended, the camp builds that ended and the stores that filled up,
// which stops their production. Each
// kind has its tag, and on the phone a newer notification takes the place of
// an older one with the same tag, so the store's one names every store full
// at `to`.

import { production } from './camp.js';
import { areaFor } from './hunt.js';
import { say } from './text.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ kind: string, areaId?: string, endsAt: number }} Activity */
/** @typedef {{ buildingId: string, level: number, endsAt: number }} Build */
/** @typedef {Build & { startsAt: number }} QueuedBuild A build waiting in the queue (camp.js). */
/** @typedef {{ tag: string, url: string, at: number, title: string, body: string }} Notice */

/**
 * @param {number} time
 * @param {number} from
 * @param {number} to
 */
const within = (time, from, to) => time > from && time <= to;

// The professions' works: where each one's report waits, and whose place
// and texts it has.
/** @type {Record<string, { url: string, place: string }>} */
const WORKS = {
  herbs: { url: '#/profesje/zielarstwo', place: 'gathering' },
  potions: { url: '#/profesje/alchemia', place: 'brewing' },
  items: { url: '#/profesje/rzemieslnictwo', place: 'workshop' },
  minerals: { url: '#/profesje/gornictwo', place: 'mining' },
  jewels: { url: '#/profesje/jubilerstwo', place: 'jewelcrafting' },
};

// The notification of a work that ended, the character's or, with
// `avatar`, the Awatar's; null for none.
/**
 * @param {Activity | null | undefined} activity
 * @param {number} from
 * @param {number} to
 * @param {Content} content
 * @returns {Notice | null}
 */
function workNotice(activity, from, to, content, avatar = false) {
  const work = activity && WORKS[activity.kind];
  if (!activity || !work || !within(activity.endsAt, from, to)) return null;
  const texts = activity.kind === 'herbs' ? content.professionTexts : content[work.place].texts;
  return {
    tag: avatar ? `avatar-${activity.kind}` : activity.kind,
    url: work.url,
    at: activity.endsAt,
    title: say(avatar ? content.avatar.texts : texts, 'pushTitle', 0),
    body: say(texts, 'pushBody', 0, { place: content[work.place].place.name }),
  };
}

// `player`: { level, activity, avatarActivity, buildings, queue, collector }:
// the activity and the Awatar's work as { kind, areaId, endsAt } (or null),
// the buildings and the build queue as the camp keeps them (camp.js), and
// whether the character has the Zbieracz Systemu. Gives
// [{ tag, url, at, title, body }], oldest first.
/**
 * @param {{ level: number, activity: Activity | null, avatarActivity?: Activity | null, buildings: Record<string, { level: number, endsAt: number }>, queue: QueuedBuild[], collector?: boolean }} player
 * @param {number} from
 * @param {number} to
 * @param {Content} content
 * @returns {Notice[]}
 */
export function notificationsDue({ level, activity, avatarActivity = null, buildings, queue, collector = false }, from, to, content) {
  const { texts } = content;
  /** @type {Notice[]} */
  const due = [];
  if (activity?.kind === 'hunt' && within(activity.endsAt, from, to)) {
    const area = areaFor(/** @type {string} */ (activity.areaId), level, content);
    due.push({
      tag: 'hunt',
      url: '#/walka',
      at: activity.endsAt,
      title: say(texts, 'pushHuntTitle', 0),
      body: say(texts, 'pushHuntBody', 0, { area: area?.name ?? '' }),
    });
  }
  // A gathering of herbs (professions.js), a brewing of potions (brewing.js),
  // an order of items (workshop.js), a digging (mining.js) and a work in the
  // Szlifiernia (jewelcraft.js), told the same way, and so the work
  // of the Awatar Systemu (avatar.js), under its own title and tag.
  for (const work of [workNotice(activity, from, to, content), workNotice(avatarActivity, from, to, content, true)]) {
    if (work) due.push(work);
  }

  // The upgrade under way and the waiting ones: a build from the queue may
  // end before the server moves it to the buildings.
  /** @type {Build[]} */
  const ended = [...Object.entries(buildings).map(([buildingId, stored]) => ({ buildingId, level: stored.level, endsAt: stored.endsAt })), ...queue]
    .filter((build) => content.buildingsById[build.buildingId] && within(build.endsAt, from, to))
    .sort((a, b) => a.endsAt - b.endsAt);
  if (ended.length > 0) {
    due.push({
      tag: 'build',
      url: '#/oboz',
      at: ended[ended.length - 1].endsAt,
      title: say(texts, 'pushBuildTitle', 0),
      body: ended.map((build) => say(texts, 'pushBuildBody', 0, { building: content.buildingsById[build.buildingId].name, level: build.level })).join(' '),
    });
  }

  // A store stays full from its fullAt, unless an upgrade of its building
  // from the queue has started: the upgrade takes the store along. With the
  // Zbieracz Systemu no store stands full: he collects it as it fills
  // (wholeFills in camp.js), so there is nothing to tell.
  /** @type {{ building: Record<string, any>, store: { fullAt: number } }[]} */
  const full = collector
    ? []
    : content.buildings
        .map((/** @type {import('./camp.js').Building} */ building) => ({ building, store: production(building, buildings[building.id], to) }))
        .filter((/** @type {{ building: Record<string, any>, store: any }} */ { building, store }) => store && store.fullAt <= to && !queue.some((build) => build.buildingId === building.id && build.startsAt <= to));
  const filled = full.filter(({ store }) => store.fullAt > from);
  if (filled.length > 0) {
    due.push({
      tag: 'store',
      url: '#/oboz',
      at: Math.max(...filled.map(({ store }) => store.fullAt)),
      title: say(texts, 'pushStoreTitle', 0),
      body: say(texts, 'pushStoreBody', 0, { buildings: full.map(({ building }) => building.name).join(', ') }),
    });
  }
  return due.sort((a, b) => a.at - b.at);
}
