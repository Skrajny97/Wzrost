// Polish number, time and plural formatting for the page.

const integerFormat = new Intl.NumberFormat('pl-PL');
const decimalFormat = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 });
const preciseFormat = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 });

export const timeFormat = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' });
export const dateTimeFormat = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatNumber = (value) => integerFormat.format(value);
// For the narrow top bar: from a million on, "1,2 mln".
const shortFormat = new Intl.NumberFormat('pl-PL', { notation: 'compact', maximumFractionDigits: 1 });
export const formatShort = (value) => (Math.abs(value) >= 1e6 ? shortFormat.format(value) : integerFormat.format(value));
export const formatDecimal = (value) => decimalFormat.format(value);
export const formatPrecise = (value) => preciseFormat.format(value);

// Polish has three plural forms: 1 punkt, 2–4 punkty, 5 punktów (and 12–14 punktów).
export function plural(count, one, few, many) {
  const n = Math.abs(count);
  if (n === 1) return one;
  const last = n % 10;
  const lastTwo = n % 100;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
}

export const countOf = (count, one, few, many) => `${formatNumber(count)} ${plural(count, one, few, many)}`;

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
  if (minutes < 60) return `po ${minutes} min`;
  const rest = minutes % 60;
  return `po ${Math.floor(minutes / 60)} h${rest ? ` ${rest} min` : ''}`;
}
