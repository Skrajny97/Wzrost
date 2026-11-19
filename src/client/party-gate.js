// 1178 B (the author, 19.11.2026): a member of a Drużyna who sets out alone,
// and a player who switches characters while the one played is in a party,
// is asked first. The server answers such a request with 'in_party'
// (partyGate in src/server/parties.js); "Wyjdź z drużyny" sends it again with
// `leaveParty`, and the character leaves the party with that same write.
// Gives the server's answer, or null when the player stays in the party.

import { t } from './i18n.js';
import { call } from './state.js';
import { confirmAction } from './ui.js';

export async function partyGated(path, body, send = (to, what) => call('POST', to, what)) {
  try {
    return await send(path, body);
  } catch (error) {
    if (error?.code !== 'in_party') throw error;
    const leave = await confirmAction({
      title: t('Drużyna'),
      text: error.message,
      confirmLabel: t('Wyjdź z drużyny'),
      cancelLabel: t('Zostań w drużynie'),
    });
    if (!leave) return null;
    return send(path, { ...body, leaveParty: true });
  }
}
