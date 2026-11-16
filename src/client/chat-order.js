// The order of the chat's channels on this device (1039; a player through
// the author, 16.11.2026: „ustawienie kolejności wyboru czatu który ma być
// pierwszy, czy global czy drużyna czy gildia”): their ids, the first one's
// tab opening when the chat opens. A channel not in it keeps the game's
// place after those that are. Kept in localStorage: a private window or
// cleared site data gives the game's order back.
const KEY = 'insight.chatOrder';

export function chatOrder() {
  try {
    const order = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(order) ? order.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function setChatOrder(ids) {
  try {
    if (ids.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Not kept: the game's order stays.
  }
}

// Channels ({ id }) in the player's order.
export function ordered(channels) {
  const order = chatOrder();
  return channels
    .map((channel, index) => ({ channel, rank: order.includes(channel.id) ? order.indexOf(channel.id) : order.length + index }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ channel }) => channel);
}
