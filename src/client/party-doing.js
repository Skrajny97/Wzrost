// What a Drużyna's member is doing and whether its player is in the game,
// in the page's words (/api/party's members: `doing`, `online`,
// `playsOther` and `seenAt`, src/server/parties.js memberDoing; the author,
// 25.11.2026, on the report of gracz (poz. 120): „powinno być widoczne co
// robi dany gracz z drużyny i dlaczego nie może iść na wyprawę”): the line
// under each member's name in the Drużyna (screens/party.js) and, without
// the place, the words in brackets by each one who stays home in the
// Walka's line under „Z drużyną” (screens/combat.js). A time is a clock
// time as the rest of the game gives it (format.js: "13:31"), with the day
// where it is 12 hours away or more ("26 lis, 09:00"): an order in the
// Warsztat has no limit of time, and a mercenary's offer lasts up to a day.

import { dateTimeFormat, formatNumber, timeFormat } from './format.js';
import { t } from './i18n.js';
import { lastSeen } from './last-seen.js';

const WITH_DAY_MS = 12 * 3600000;

// The moment `at` as a clock time, seen at `now`.
export const clockAt = (at, now) => (at - now < WITH_DAY_MS ? timeFormat : dateTimeFormat).format(new Date(at));

// What `member` is doing at `now`, with when it is free again: „na wyprawie
// drużyny: Smolne Doły, wróci o 13:31”, „medytuje w Kultywacji do 14:00”,
// „może iść na wyprawę”. With `place` false an exploration's place is left
// out.
export function doingText(member, now, { place = true } = {}) {
  const doing = member.doing;
  if (!doing) return member.status && member.status !== 'free' ? t('zajęte') : t('może iść na wyprawę');
  const time = doing.until ? clockAt(doing.until, now) : '';
  const where = place && doing.place ? doing.place : null;
  switch (doing.kind) {
    case 'trip':
      return where ? t('na wyprawie drużyny: {place}, wróci o {time}', { place: where, time }) : t('na wyprawie drużyny, wróci o {time}', { time });
    case 'hunt':
      return where ? t('na własnej wyprawie: {place}, wróci o {time}', { place: where, time }) : t('na własnej wyprawie, wróci o {time}', { time });
    case 'work':
      return doing.profession ? t('pracuje w profesji {profession} do {time}', { profession: doing.profession, time }) : t('pracuje w profesji do {time}', { time });
    case 'cultivation':
      return t('medytuje w Kultywacji do {time}', { time });
    // One whose offer or service is over is free: the party's setting out
    // closes it (src/server/parties.js).
    case 'mercenary':
      return doing.hired ? t('na usłudze najemnej do {time}', { time }) : t('czeka w Karczmie na werbunek do {time}', { time });
    default:
      return t('zajęte');
  }
}

// How long a player has been away, by the units of last-seen.js.
const AWAY = { minutes: 'poza grą od {count} min', hours: 'poza grą od {count} godz.', yesterday: 'poza grą od wczoraj', days: 'poza grą od {count} dni' };

// Whether `member`'s player is in the game at `now`: „w grze” with this
// character, „gra teraz inną postacią” with another of its own, else since
// when it is away, as the Znajomi count it („poza grą od 25 min”); null
// for an account never seen.
export function presenceText(member, now) {
  if (member.online) return t('w grze');
  if (member.playsOther) return t('gra teraz inną postacią');
  const seen = lastSeen(member.seenAt, now);
  return seen && AWAY[seen.unit] ? t(AWAY[seen.unit], { count: formatNumber(seen.count) }) : null;
}
