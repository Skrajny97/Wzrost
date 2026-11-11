// Payments for Punkty Systemu (data/payments.json; DECISIONS.md, "Płatności
// za Punkty Systemu: podwaliny"): the rules of a purchase, worked out on a
// character's points and an account's purchases, without the ledger or the
// gateway, which the server keeps (src/server/payments.js).
//
// A character's points are a total (system_points) and the part of it that
// was bought (system_points_paid); the rest was won in the game. Spending
// takes the won points first, so the bought ones stay, as long as they can,
// to be given back within the withdrawal's days (the EU consumer
// authorities' principles on in-game currencies, 21.03.2025).
//
// `rules` is data/payments.json; amounts are in grosze, times in ms.

const DAY = 24 * 60 * 60 * 1000;

export const packOf = (rules, id) => (typeof id === 'string' ? (rules.packs.find((pack) => pack.id === id) ?? null) : null);

// What an account paid for the purchases that still count against its
// limit: the paid ones and the ones waiting for the payment, of the last
// `limitDays` days; refunds and failed ones do not count.
export function spentLately(purchases, now, rules) {
  const since = now - rules.limitDays * DAY;
  return purchases
    .filter((one) => one.createdAt > since && (one.status === 'pending' || one.status === 'paid'))
    .reduce((sum, one) => sum + one.price, 0);
}

// An amount in grosze as Polish writes it, with its currency ("400,00 zł").
const money = (grosze, currency) => new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(grosze / 100);

// Why the account cannot order `pack` now, or null.
export function orderBlock({ rules, pack, consents, spent, blocked }) {
  if (!pack) return { code: 'invalid_pack', message: 'Nie ma takiego pakietu.' };
  if (blocked) return { code: 'purchases_blocked', message: 'Zakupy na tym koncie są wstrzymane. Napisz do nas, a wyjaśnimy sprawę.' };
  if (consents?.terms !== true) return { code: 'terms_required', message: 'Zaakceptuj regulamin, żeby kupić.' };
  if (rules.adultOnly && consents?.adult !== true) return { code: 'adult_required', message: 'Punkty Systemu mogą kupować tylko osoby pełnoletnie.' };
  if (spent + pack.price > rules.monthlyLimit) {
    const left = money(Math.max(0, rules.monthlyLimit - spent), rules.currency);
    return { code: 'monthly_limit', message: `Limit zakupów to ${money(rules.monthlyLimit, rules.currency)} na ${rules.limitDays} dni. Do wykorzystania zostało ${left}.` };
  }
  return null;
}

// The points after a paid purchase.
export const credited = (balance, points) => ({ systemPoints: balance.systemPoints + points, systemPointsPaid: balance.systemPointsPaid + points });

// The points after spending `cost` of them: the won ones go first, the
// bought ones last.
export function spentFrom(balance, cost) {
  const systemPoints = balance.systemPoints - cost;
  return { systemPoints, systemPointsPaid: Math.max(0, Math.min(balance.systemPointsPaid, systemPoints)) };
}

// Why a paid purchase can no longer be withdrawn from (its points given
// back for the money), or null: only within the days after the payment,
// and only while its points are still unspent among the bought ones.
export function withdrawalBlock({ rules, purchase, balance, now }) {
  if (!purchase || purchase.status !== 'paid') return { code: 'not_withdrawable', message: 'Tego zakupu nie można już zwrócić.' };
  if (now > purchase.paidAt + rules.withdrawalDays * DAY) {
    return { code: 'withdrawal_expired', message: `Zwrot jest możliwy przez ${rules.withdrawalDays} dni od zapłaty.` };
  }
  if (balance.systemPointsPaid < purchase.points) {
    return { code: 'points_spent', message: 'Punkty z tego zakupu zostały już wydane, więc nie można go zwrócić.' };
  }
  return null;
}

// The points after a withdrawal or a refund: the purchase's points taken
// back from the bought ones.
export const withdrawn = (balance, points) => ({ systemPoints: balance.systemPoints - points, systemPointsPaid: balance.systemPointsPaid - points });

// The points after a chargeback (the bank gave the money back): as many of
// the purchase's points as there still are, never below none. What is
// missing (`debt`, already spent) stays spent; the account stops buying
// until the author clears it.
export function chargedBack(balance, points) {
  const taken = Math.min(points, balance.systemPoints);
  return {
    systemPoints: balance.systemPoints - taken,
    systemPointsPaid: Math.max(0, balance.systemPointsPaid - points),
    debt: points - taken,
  };
}
