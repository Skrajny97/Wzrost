// The Stajnia in the Osada (327 A; src/server/stable.js): the mounts
// Mirosław the koniuszy sells for good, on the Stajnia's screen, and how
// long an exploration waits with the character's mount, for the Walka
// screen. The wait is counted as the server counts it (huntWait in
// src/engine/stable.js): the length less the mount's share, to the whole
// second. Only the wait is shorter; the rewards stay those of the length.

import { mountArt } from './art.js';
import { h } from './dom.js';
import { formatMinutes, formatNumber } from './format.js';
import { call, state } from './state.js';
import { confirmAction, howItWorks, toast, withButton } from './ui.js';

// The wait of an exploration of `minutes` with `mount` ({ shorter }), in
// milliseconds; the full length without one.
export const stableWait = (minutes, mount) => Math.round(minutes * 60 * (1 - (mount?.shorter ?? 0))) * 1000;

// A wait as "27 min", "28 min 30 s", "1 h 54 min" or "57 s".
export function formatWait(ms) {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (rest === 0) return formatMinutes(minutes);
  return minutes > 0 ? `${formatMinutes(minutes)} ${rest} s` : `${rest} s`;
}

// The line under the length chosen: "Z wierzchowcem: 27 min", or '' when
// the character has no mount.
export const stableNote = (minutes, mount) => (mount ? `Z wierzchowcem: ${formatWait(stableWait(minutes, mount))}` : '');

const percent = (share) => `${Math.round(share * 100)}%`;

// The Stajnia's mounts on its screen (`stable` of the Osada's view): each
// with its words, its share of the wait, its price and level, the one the
// character has marked. Only the next one can be bought, and its button
// says what is missing. `apply` takes the server's answer, as the Osada's
// other places do.
export function stableCard({ stage, mounts }, apply) {
  const { level, gold } = state.character;
  const buy = (mount) => async (event) => {
    const button = event.currentTarget;
    const sure = await confirmAction({
      title: 'Kupić wierzchowca?',
      text: `${mount.name} za ${formatNumber(mount.gold)} zł. Każda wyprawa będzie krótsza o ${percent(mount.shorter)}.`,
      confirmLabel: 'Kup',
    });
    if (!sure) return;
    withButton(button, async () => {
      const answer = await call('POST', '/api/settlement/stable', { stage: mount.stage });
      apply(answer);
      // An exploration going on keeps its end; the next one goes quicker.
      const away = state.character.activity?.kind === 'hunt' && !state.character.activity.finished;
      toast(`Nowy wierzchowiec: ${mount.name}. Wyprawy są krótsze o ${percent(mount.shorter)}.${away ? ' Działa od następnej wyprawy.' : ''}`);
    });
  };
  const status = (mount) => {
    if (mount.stage < stage) return h('p', { class: 'muted', text: 'Masz już lepszego.' });
    if (mount.stage === stage) return null;
    const low = level < mount.level;
    const short = gold < mount.gold;
    return [
      h('p', { class: 'muted', text: `Cena: ${formatNumber(mount.gold)} zł. Od ${mount.level}. poziomu postaci.` }),
      mount.stage === stage + 1 &&
        h('button', {
          type: 'button',
          class: 'button button--world button--small',
          text: low ? `Od ${mount.level}. poziomu postaci` : short ? 'Brakuje złota' : `Kup (${formatNumber(mount.gold)} zł.)`,
          disabled: low || short,
          onClick: buy(mount),
        }),
    ];
  };
  return h(
    'section',
    { class: 'stack', 'data-guide': 'stable-mounts' },
    h('h2', { class: 'section-title', text: 'Wierzchowce' }),
    // All under "Jak to działa?" (the author: "Zdanie nad jak to działa
    // ładujemy pod jak to działa, a ostatnie o Szybkim Polowaniu wywalamy").
    howItWorks(null, [
      'Wierzchowiec zostaje na stałe i skraca czekanie na koniec każdej wyprawy.',
      'Nagrody, doświadczenie i walki są jak za pełny czas wyprawy.',
      'Wierzchowce kupuje się po kolei, a lepszy zastępuje słabszego.',
    ]),
    h(
      'ul',
      { class: 'settlement-goods' },
      mounts.map((mount) =>
        h(
          'li',
          { class: 'card settlement-good' },
          // The mount itself (the author: "wygenerować grafiki wierzchowców i
          // wkleić do stajni"), at the size it trots in the Walka scene.
          mountArt(mount.id),
          h('p', {}, h('strong', { text: mount.name }), mount.stage === stage && [' ', h('span', { class: 'chip chip--success', text: 'Twój' })]),
          h('p', { class: 'muted', text: mount.description }),
          h('p', { text: `Wyprawy krótsze o ${percent(mount.shorter)}: godzinna trwa ${formatWait(stableWait(60, mount))}.` }),
          status(mount),
        ),
      ),
    ),
  );
}
