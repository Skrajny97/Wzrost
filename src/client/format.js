// Number, time and plural formatting for the page, in its language
// (i18n.js): Polish, or English in the English beta.

import { englishForms, language, t } from './i18n.js';

// The locale of the page's language; English writes 24-hour time too.
const LOCALES = { pl: 'pl-PL', en: 'en-GB' };
const formats = new Map();
// One Intl format of each kind for each language, made when first needed.
function format(kind, make) {
  const key = `${language()}:${kind}`;
  if (!formats.has(key)) formats.set(key, make(LOCALES[language()] ?? LOCALES.pl));
  return formats.get(key);
}
const integerFormat = () => format('integer', (locale) => new Intl.NumberFormat(locale));
const decimalFormat = () => format('decimal', (locale) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }));
const preciseFormat = () => format('precise', (locale) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }));

export const timeFormat = { format: (date) => format('time', (locale) => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' })).format(date) };
export const dateTimeFormat = {
  format: (date) =>
    format('dateTime', (locale) =>
      new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
    ).format(date),
};

export const formatNumber = (value) => integerFormat().format(value);
// For the narrow top bar: from a million on, "1,2 mln".
const shortFormat = () => format('short', (locale) => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }));
export const formatShort = (value) => (Math.abs(value) >= 1e6 ? shortFormat().format(value) : integerFormat().format(value));
export const formatDecimal = (value) => decimalFormat().format(value);
export const formatPrecise = (value) => preciseFormat().format(value);
// Real money, in grosze, as the page's language writes it with its currency
// ("4,99 zł", "PLN 4.99"): the price of the Punkty Systemu bought for money.
export const formatMoney = (grosze, currency) => format(`money:${currency}`, (locale) => new Intl.NumberFormat(locale, { style: 'currency', currency })).format(grosze / 100);

// Polish has three plural forms: 1 punkt, 2–4 punkty, 5 punktów (and 12–14
// punktów). English has two, one and the rest, under the three Polish ones
// (i18n.js); a noun without them stays Polish.
export function plural(count, one, few, many) {
  const n = Math.abs(count);
  const english = englishForms(one, few, many);
  if (english) return n === 1 ? english[0] : english[1];
  if (n === 1) return one;
  const last = n % 10;
  const lastTwo = n % 100;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
}

export const countOf = (count, one, few, many) => `${formatNumber(count)} ${plural(count, one, few, many)}`;

// The day's trade with a resident (Jagna, Wszebor, the kowal, the
// Targowisko): the gold a point takes and what is still short of the next
// one, as the trade's gold adds up through the day (the author: "Kupiłem
// dwa materiały jednego typu i nie wzrosła relacja").
export function tradePace(trade) {
  if (!trade?.perPoint) return '';
  if (trade.toNext === null) return ` ${t('Na dziś to już wszystkie punkty.')}`;
  return ` ${t('Punkt za każde {gold} zł handlu, do następnego brakuje {left} zł.', { gold: formatNumber(trade.perPoint), left: formatNumber(Math.ceil(trade.toNext)) })}`;
}

// What the scrapper or Jagna pays for `count` pieces at `unit` gold a piece,
// as the server counts it (saleGold in src/engine/items.js): rounded down,
// at least a coin.
export const saleGold = (unit, count) => Math.max(1, Math.floor(unit * count + 1e-9));

// "5 min", "1 h", "4 h".
// "45 min", "2 h", "1 h 25 min".
export function formatMinutes(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${rest} min`;
}

// "mm:ss", or "h:mm:ss" from an hour up.
export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

// A rough length of time: "40 min", "1,5 h", "12 h".
export function formatHours(hours) {
  if (hours * 60 < 59.5) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 10) return `${formatDecimal(Math.round(hours * 2) / 2)} h`;
  return `${formatNumber(Math.round(hours))} h`;
}

// Minutes after the start of a hunt, for the report: "po 12 min", "po 1 h 5 min".
export function formatOffset(ms) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return t('po {minutes} min', { minutes });
  const rest = minutes % 60;
  const hours = Math.floor(minutes / 60);
  return rest ? t('po {hours} h {minutes} min', { hours, minutes: rest }) : t('po {hours} h', { hours });
}
