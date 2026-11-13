// The Siedziba Gildii (src/server/guild-seat.js; DECISIONS.md, "Siedziba
// Gildii (616 A)"; the author: "616 A - akcept, ale muszą być zwijalne
// budynki i ludzie muszą móc wpłacać na co chcą, lider i zastępca może tylko
// oznaczyć co jest preferowane"): the Gildia page's "Siedziba" tab. On top a
// card with the bonuses the guild's buildings give every member now and the
// rules under "Jak to działa?"; under it a card for each building, folded
// under its picture, name, level and what it gives now, with "Preferowany"
// once the leader or a deputy marked it. Unfolded: what it gives now and at
// its next level, that level's cost with what is collected for it, the
// member's donation of gold and the building's resource, with quick amounts
// and "Do poziomu" (what the level still lacks), and for the leader and the
// deputies the mark to put on or take off. Under the bonuses "Kto ile
// wpłacił" opens the Ranking członków of the Gildia tab on "Wpłaty" (897 A).
// The words come with the answer
// (data/guilds.json, seat.texts), in the page's language; the tab's own few
// go through t() (i18n.js). mountGuildSeat(container) adds the cards
// to the container and gives { unmount() }, which takes them away.

import { goldArt, guildSeatSprite, resourceArt } from './art.js';
import { fill, h, icon } from './dom.js';
import { formatNumber } from './format.js';
import { askDonations } from './guild-ranking.js';
import { t } from './i18n.js';
import { call } from './state.js';
import { confirmAction, foldPart, howItWorks, toast, withButton } from './ui.js';

const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
const KINDS = ['gold', 'resource'];

export function mountGuildSeat(container) {
  let view = null;
  let gone = false;
  const body = h('div', { class: 'guild-seat' }, h('section', { class: 'card' }, h('p', { class: 'muted', text: t('Wczytywanie…') })));
  container.append(body);

  function show(next) {
    if (gone) return;
    view = next;
    render();
  }

  // An action answered with the Siedziba anew, its words in a toast.
  async function act(path, data) {
    const answer = await call('POST', path, data);
    show(answer);
    if (answer.text) toast(answer.text);
  }

  // "5000 złota", "300 drewna", "5000 złota i 300 drewna": the amounts above
  // nothing, in the answer's words; null for none.
  function amountsText(building, gold, resource) {
    const { texts } = view;
    const parts = [
      gold > 0 && filled(texts.goldAmount, { count: formatNumber(gold) }),
      resource > 0 && filled(texts.resourceAmount, { count: formatNumber(resource), genitive: building.resource.genitive }),
    ].filter(Boolean);
    return parts.length === 2 ? filled(texts.both, { first: parts[0], second: parts[1] }) : (parts[0] ?? null);
  }

  // Gold or the building's resource: its picture and its name.
  const kindArt = (building, kind, size) => (kind === 'gold' ? goldArt(size) : resourceArt(building.resource.id, size));
  const kindName = (building, kind) => (kind === 'gold' ? view.texts.gold : building.resource.name);

  // The guild's bonuses for every member and the rules.
  function headCard() {
    const { texts } = view;
    return h(
      'section',
      { class: 'card guild-seat-head', 'aria-labelledby': 'guild-seat-title' },
      h('h2', { class: 'card-title', id: 'guild-seat-title', text: texts.title }),
      view.guild ? h('p', { class: 'guild-seat-bonuses' }, icon('keep', { size: 20 }), h('span', { text: view.bonusesText })) : h('p', { class: 'muted', text: texts.noGuild }),
      // Who gave what: the Ranking członków of the Gildia tab, on "Wpłaty"
      // from the start (guild-ranking.js, 897 A).
      view.guild && h('a', { class: 'button button--world button--small guild-seat-who', href: '#/gildia/guild', onClick: askDonations }, icon('coin', { size: 16 }), texts.whoGave),
      howItWorks(texts.intro, texts.how),
    );
  }

  // What the building gives now and at its next level.
  function effectsPart(building) {
    const { texts } = view;
    return h(
      'div',
      { class: 'guild-seat-effects' },
      h('p', { class: 'guild-seat-effect' }, h('strong', { text: `${texts.now} ` }), building.effect ?? texts.none),
      building.nextEffect &&
        h('p', { class: 'guild-seat-effect guild-seat-effect--next' }, h('strong', { text: `${filled(texts.next, { level: building.next.level })} ` }), building.nextEffect),
    );
  }

  // What is collected for the next level against its cost, gold and the
  // resource each on a bar, and the surplus that goes on to the levels after.
  function progressPart(building) {
    const { texts } = view;
    const { next } = building;
    const bar = (kind) => {
      const value = next.collected[kind];
      const max = next.cost[kind];
      const name = kindName(building, kind);
      const fillBar = h('div', { class: 'meter-fill' });
      fillBar.style.width = `${max > 0 ? Math.min(1, value / max) * 100 : 0}%`;
      return h(
        'div',
        { class: `meter guild-meter guild-seat-meter guild-seat-meter--${kind}` },
        h(
          'div',
          { class: 'meter-label' },
          h('span', { class: 'guild-seat-meter-name' }, kindArt(building, kind, 16), h('span', { text: name })),
          h('span', { class: 'meter-value', text: filled(texts.collected, { collected: formatNumber(value), cost: formatNumber(max) }) }),
        ),
        h('div', { class: 'meter-track', role: 'progressbar', 'aria-label': name, 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': value }, fillBar),
      );
    };
    const surplus = amountsText(building, next.surplus.gold, next.surplus.resource);
    return h(
      'div',
      { class: 'guild-part guild-seat-progress' },
      h('h3', { class: 'guild-subtitle', text: filled(texts.raising, { level: next.level }) }),
      KINDS.map(bar),
      surplus && h('p', { class: 'guild-seat-note', text: filled(texts.surplus, { amounts: surplus }) }),
    );
  }

  // The member's donation: a field for gold and one for the resource, each
  // with what the character holds, the quick amounts and "Do poziomu",
  // what the next level still lacks of it; each up to what the character
  // holds and the building can still take. "Wpłać" asks first, as the
  // donation never comes back.
  function donationPart(building) {
    const { texts, rules } = view;
    const fields = KINDS.map((kind) => {
      const have = building.have[kind];
      const most = Math.min(have, building.room[kind]);
      const lacking = Math.max(0, building.next.cost[kind] - building.next.collected[kind]);
      const id = `guild-seat-${building.id}-${kind}`;
      const input = h('input', { type: 'number', id, class: 'trade-number guild-seat-number', min: '0', max: String(most), step: '1', inputmode: 'numeric', placeholder: '0', disabled: most === 0 });
      const set = (amount) => {
        input.value = String(amount);
      };
      const quick = rules.quick[kind].map((amount) =>
        h('button', { type: 'button', class: 'button button--world button--small guild-seat-quick', text: formatNumber(amount), disabled: amount > most, onClick: () => set(amount) }),
      );
      const rest = Math.min(lacking, most);
      const genitive = kind === 'gold' ? texts.goldGenitive : building.resource.genitive;
      return {
        kind,
        input,
        element: h(
          'div',
          { class: 'guild-seat-field' },
          h(
            'div',
            { class: 'guild-seat-field-head' },
            h('label', { for: id, class: 'guild-seat-field-name' }, kindArt(building, kind, 20), h('span', { text: kindName(building, kind) })),
            h('span', { class: 'guild-ask-have', text: filled(texts.have, { have: formatNumber(have) }) }),
          ),
          building.room[kind] === 0
            ? h('p', { class: 'guild-seat-note', text: filled(texts.enough, { what: genitive.charAt(0).toUpperCase() + genitive.slice(1) }) })
            : [
                input,
                h(
                  'div',
                  { class: 'guild-seat-quicks' },
                  quick,
                  h('button', { type: 'button', class: 'button button--world button--small guild-seat-quick guild-seat-quick--rest', text: texts.rest, disabled: rest === 0, onClick: () => set(rest) }),
                ),
              ],
        ),
      };
    });
    const send = h('button', {
      type: 'button',
      class: 'button button--system guild-seat-send',
      text: texts.donate,
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          const [gold, resource] = fields.map((field) => (field.input.value.trim() === '' ? 0 : Number(field.input.value)));
          const amounts = [gold, resource].every((amount) => Number.isInteger(amount) && amount >= 0) ? amountsText(building, gold, resource) : null;
          // What the server refuses (nothing, not a whole number) it says
          // itself; a donation goes only once the player confirms it.
          if (amounts && !(await confirmAction({ title: filled(texts.donateTitle, { name: building.accusative }), text: filled(texts.donateText, { amounts }), confirmLabel: texts.donate }))) return;
          await act('/api/guild/seat/donate', { buildingId: building.id, gold, resource });
        }),
    });
    return h('div', { class: 'guild-part guild-seat-donation' }, h('h3', { class: 'guild-subtitle', text: texts.donation }), h('div', { class: 'guild-seat-fields' }, fields.map((field) => field.element)), send);
  }

  // Below the players' Wymiana's level, a line in the donation's place:
  // from which level the character donates (the author's 835 A).
  function lockedPart() {
    const { texts } = view;
    return h('div', { class: 'guild-part guild-seat-donation' }, h('h3', { class: 'guild-subtitle', text: texts.donation }), h('p', { class: 'guild-seat-note', text: texts.donateLevel }));
  }

  // The leader's and the deputies' mark (616 A), on or off.
  function markButton(building) {
    const { texts } = view;
    return h(
      'button',
      {
        type: 'button',
        class: 'button button--world button--small guild-seat-mark',
        'aria-pressed': String(building.preferred),
        onClick: (event) => withButton(event.currentTarget, () => act('/api/guild/seat/prefer', { buildingId: building.id, preferred: !building.preferred })),
      },
      icon('banner', { size: 18 }),
      h('span', { text: building.preferred ? texts.unprefer : texts.prefer }),
    );
  }

  // A building's card, folded under its picture, name, level and what it
  // gives now; a marked one opens by itself until the player folds it.
  function buildingCard(building, index) {
    const { texts } = view;
    const titleId = `guild-seat-${building.id}-title`;
    const badge = building.preferred && h('span', { class: 'chip guild-seat-preferred' }, icon('banner', { size: 14 }), h('span', { text: texts.preferred }));
    return h(
      'section',
      // The narrator's line about the Siedziba lights the first of the four
      // (narrator.js): a ring round all four drew the camera far back on a
      // phone (a player on the chat, 6.11.2026).
      { class: 'card guild-seat-building', 'aria-labelledby': titleId, ...(index === 0 && { 'data-guide': 'guild-seat-building' }) },
      foldPart(
        {
          key: `guild-seat-${building.id}`,
          title: building.name,
          card: true,
          id: titleId,
          open: building.preferred,
          art: guildSeatSprite(building.id),
          badge,
          line: `${filled(texts.level, { level: building.level, max: building.maxLevel })} · ${building.effect ?? texts.none}`,
          className: 'guild-seat-fold',
        },
        h(
          'div',
          { class: 'guild-seat-body' },
          effectsPart(building),
          building.next ? [progressPart(building), view.locked ? lockedPart() : donationPart(building)] : h('p', { class: 'muted', text: texts.top }),
          view.canMark && markButton(building),
        ),
      ),
    );
  }

  function render() {
    fill(body, headCard(), view.guild && view.buildings.map(buildingCard));
  }

  call('GET', '/api/guild/seat')
    .then(show)
    .catch((error) => {
      if (!gone) fill(body, h('section', { class: 'card' }, h('p', { class: 'muted', text: error.message ?? t('Nie udało się wczytać Siedziby.') })));
    });

  return {
    unmount() {
      gone = true;
      body.remove();
    },
  };
}
