// Phone notifications (src/server/push.js sends them): what a player hears
// about from a stretch of time, after `from` up to `to`: the exploration,
// gathering, brewing or order of items that ended, the camp builds that
// ended and the stores that filled up, which stops their production. Each
// kind has its tag, and on the phone a newer notification takes the place of
// an older one with the same tag, so the store's one names every store full
// at `to`.

import { production } from './camp.js';
import { areaFor } from './hunt.js';
import { say } from './text.js';

const within = (time, from, to) => time > from && time <= to;

// The professions' works: where each one's report waits, and whose place
// and texts it has.
const WORKS = {
  herbs: { url: '#/profesje/zielarstwo', place: 'gathering' },
  potions: { url: '#/profesje/alchemia', place: 'brewing' },
  items: { url: '#/profesje/rzemieslnictwo', place: 'workshop' },
};

// The notification of a work that ended, the character's or, with
// `avatar`, the Awatar's; null for none.
function workNotice(activity, from, to, content, avatar = false) {
  const work = activity && WORKS[activity.kind];
  if (!work || !within(activity.endsAt, from, to)) return null;
  const texts = activity.kind === 'herbs' ? content.professionTexts : content[work.place].texts;
  return {
    tag: avatar ? `avatar-${activity.kind}` : activity.kind,
    url: work.url,
    at: activity.endsAt,
    title: say(avatar ? content.avatar.texts : texts, 'pushTitle', 0),
    body: say(texts, 'pushBody', 0, { place: content[work.place].place.name }),
  };
}

// `player`: { level, activity, avatarActivity, buildings, queue }: the
// activity and the Awatar's work as { kind, areaId, endsAt } (or null), the
// buildings and the build queue as the camp keeps them (camp.js). Gives
// [{ tag, url, at, title, body }], oldest first.
export function notificationsDue({ level, activity, avatarActivity = null, buildings, queue }, from, to, content) {
  const { texts } = content;
  const due = [];
  if (activity?.kind === 'hunt' && within(activity.endsAt, from, to)) {
    const area = areaFor(activity.areaId, level, content);
    due.push({
      tag: 'hunt',
      url: '#/walka',
      at: activity.endsAt,
      title: say(texts, 'pushHuntTitle', 0),
      body: say(texts, 'pushHuntBody', 0, { area: area?.name ?? '' }),
    });
  }
  // A gathering of herbs (professions.js), a brewing of potions (brewing.js)
  // and an order of items (workshop.js), told the same way, and so the work
  // of the Awatar Systemu (avatar.js), under its own title and tag.
  for (const work of [workNotice(activity, from, to, content), workNotice(avatarActivity, from, to, content, true)]) {
    if (work) due.push(work);
  }

  // The upgrade under way and the waiting ones: a build from the queue may
  // end before the server moves it to the buildings.
  const ended = [...Object.entries(buildings).map(([buildingId, stored]) => ({ buildingId, level: stored.level, endsAt: stored.endsAt })), ...queue]
    .filter((build) => content.buildingsById[build.buildingId] && within(build.endsAt, from, to))
    .sort((a, b) => a.endsAt - b.endsAt);
  if (ended.length > 0) {
    due.push({
      tag: 'build',
      url: '#/oboz',
      at: ended.at(-1).endsAt,
      title: say(texts, 'pushBuildTitle', 0),
      body: ended.map((build) => say(texts, 'pushBuildBody', 0, { building: content.buildingsById[build.buildingId].name, level: build.level })).join(' '),
    });
  }

  // A store stays full from its fullAt, unless an upgrade of its building
  // from the queue has started: the upgrade takes the store along.
  const full = content.buildings
    .map((building) => ({ building, store: production(building, buildings[building.id], to) }))
    .filter(({ building, store }) => store && store.fullAt <= to && !queue.some((build) => build.buildingId === building.id && build.startsAt <= to));
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
