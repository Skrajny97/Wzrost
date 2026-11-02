// The Prośby Gildii (src/server/guild-requests.js; DECISIONS.md, "Próby i
// Prośby Gildii"; the author: "346 A"): the card for the Gildia's page
// with the character's own request, its gifts with "Podziękuj" and
// "Wycofaj"; the others' open requests, each with what the character holds
// and "Daj"; and the "Dobroczyńcy tygodnia". "Poproś gildię" (askGuildButton)
// stands where pieces are missing: an order on the Tablica zleceń, the
// Kowadło, the Kuźnia and the Zaklinaczka, for a character in a guild; its
// sheet asks for the goods named there, or for one material of a rarity,
// or, from the card, for anything the character knows. The card and the
// sheet ask for the Prośby themselves and take their words from the answer
// (data/guilds.json, requests.texts). mountGuildRequests(container) adds
// the card to the container and gives { unmount() }, which takes it away.

import { herbSprite, potionSprite } from './art.js';
import { materialIcon } from './craft-table.js';
import { fill, h, icon } from './dom.js';
import { dateTimeFormat, formatNumber, plural } from './format.js';
import { CLASS_ICONS } from './icons.js';
import { openProfile } from './profile.js';
import { call, state } from './state.js';
import { closeSheet, confirmAction, howItWorks, openSheet, toast, withButton } from './ui.js';

const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
const KINDS = ['material', 'herb', 'potion'];
const rarityOf = (id) => state.content.rarities.find((rarity) => rarity.id === id);

// The picture of goods: a material's, a herb's or a potion's.
function goodsArt(goods, size = 24) {
  if (goods.kind === 'material') return materialIcon(goods.materialId, size);
  if (goods.kind === 'herb') return herbSprite(goods.key) ?? icon('leaf', { size });
  return potionSprite(goods.key) ?? icon('flask', { size });
}

// Goods in one line: the picture and the name, in a material's rarity
// colour.
function goodsLine(goods, extra = null) {
  const rarity = rarityOf(goods.rarity);
  return h(
    'span',
    { class: 'guild-goods' },
    h('span', { class: 'guild-goods-art', 'aria-hidden': 'true' }, goodsArt(goods)),
    h('span', { class: 'item-name', vars: rarity ? { '--rarity': rarity.color } : {}, text: goods.name }),
    extra,
  );
}

// A material at a rarity, as the server names it: "Skóra wilka", "Rzadka
// skóra wilka" (materialView in the engine).
function materialAt(material, rarityId) {
  const name = material.name.toLowerCase();
  const label = rarityId === material.rarity ? name : `${rarityOf(rarityId).forms[material.gender]} ${name}`;
  return { kind: 'material', key: `${material.id}:${rarityId}`, name: label.charAt(0).toUpperCase() + label.slice(1), rarity: rarityId, materialId: material.id };
}

// How many pieces of the goods the character holds.
function held(goods) {
  const character = state.character;
  if (goods.kind === 'herb') return character.herbs?.find((one) => one.id === goods.key)?.count ?? 0;
  if (goods.kind === 'potion') return character.potions?.find((one) => one.id === goods.key)?.count ?? 0;
  return character.crafting?.materials.find((one) => one.key === goods.key)?.count ?? 0;
}

// The goods to ask for: those named (`key`), or the materials of a rarity
// the character knows of any rarity, raised to it where a material can be
// found that rare (a material is never under its creature's rarity), with
// `ordinary` no elite's or champion's trophy (an order for any materials
// takes none), the most held first; or all the goods it knows (`known`,
// from the server).
function choices(known, { kind, key, name, rarity, ordinary = false }) {
  if (key) return [known.find((goods) => goods.kind === kind && goods.key === key) ?? { kind, key, name, ...(kind === 'material' && materialFields(key)) }];
  if (!rarity) return known;
  const order = (id) => state.content.rarities.findIndex((one) => one.id === id);
  const ids = new Set(known.filter((goods) => goods.kind === 'material').map((goods) => goods.materialId));
  return state.content.materials
    .filter((material) => ids.has(material.id) && order(material.rarity) <= order(rarity) && !(ordinary && material.trophy))
    .map((material) => materialAt(material, rarity))
    .sort((a, b) => held(b) - held(a) || a.name.localeCompare(b.name, 'pl'));
}

// A material's fields from its stack key, for goods the server did not list.
function materialFields(key) {
  const at = key.lastIndexOf(':');
  const material = state.content.materials.find((one) => one.id === key.slice(0, at));
  return material ? materialAt(material, key.slice(at + 1)) : {};
}

// "Poproś gildię" where pieces are missing, for a character in a guild
// (null outside one): `kind` and `key` (with its `name`) of the goods, or a
// material's `rarity` (with `ordinary`, no trophy); `missing` pieces, or
// `need` of one stack (then the count starts at what the picked stack
// lacks).
export function askGuildButton(ask) {
  if (!state.character?.guildTag) return null;
  return h(
    'button',
    {
      type: 'button',
      class: 'button button--world button--small guild-ask',
      onClick: () => openAskSheet(ask),
    },
    icon('banner', { size: 18 }),
    h('span', { text: state.content.guildAsk }),
  );
}

// The sheet of a request: the goods and how many, or why the character
// cannot ask now. `onAsked` gets the answer.
export function openAskSheet(ask = {}, onAsked = null) {
  const body = h('div', { class: 'guild-ask-sheet' }, h('p', { class: 'muted', text: 'Wczytywanie…' }));
  openSheet(h('h2', { class: 'sheet-title', text: state.content.guildAsk }), body);
  call('GET', '/api/guild/requests')
    .then((view) => {
      if (body.isConnected) fillAskSheet(body, view, ask, onAsked);
    })
    .catch((error) => {
      if (body.isConnected) fill(body, h('p', { class: 'muted', text: error.message }));
    });
}

function fillAskSheet(body, view, ask, onAsked) {
  const { texts, rules } = view;
  if (!view.guild) return fill(body, h('p', { class: 'sheet-text', text: texts.noGuild }));
  const toCard = () => h('a', { class: 'button button--world', href: '#/gildia/requests', onClick: closeSheet, text: texts.title });
  if (view.waiting) return fill(body, h('p', { class: 'sheet-text', text: texts.askWaiting }), view.mine && h('p', { class: 'guild-mine-goods' }, goodsLine(view.mine.goods, h('span', { class: 'muted', text: ` × ${formatNumber(view.mine.count)}` }))), toCard());
  if (view.nextAt) return fill(body, h('p', { class: 'sheet-text', text: filled(texts.waitNext, { at: dateTimeFormat.format(new Date(view.nextAt)) }) }), toCard());
  // A list of all the goods known goes in the order shown: by kind, a
  // material by its rarity, then by name.
  const mixed = !(ask.rarity || ask.key);
  const order = (id) => state.content.rarities.findIndex((one) => one.id === id);
  const list = mixed
    ? [...choices(view.known, ask)].sort(
        (a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || (a.kind === 'material' ? order(a.rarity) - order(b.rarity) : 0) || a.name.localeCompare(b.name, 'pl'),
      )
    : choices(view.known, ask);
  if (list.length === 0) return fill(body, h('p', { class: 'sheet-text', text: texts.noGoods }));
  let picked = list[0];
  // What the request starts at: what is missing, of the stack picked where
  // one stack must hold it all.
  const start = () => Math.max(1, Math.min(rules.most, ask.need !== undefined ? ask.need - held(picked) : (ask.missing ?? 1)));
  const count = h('input', { type: 'number', id: 'guild-ask-count', class: 'trade-number', min: '1', max: String(rules.most), step: '1', inputmode: 'numeric', value: String(start()) });
  const goods = h('div', { class: 'guild-ask-goods' });
  // The goods to pick as the game's own list (the author: "lista ta w
  // prośbach Gildii musi być interfejsem w grze"): each with its picture,
  // its name and how many the character holds; the picked one marked. A
  // list of all the goods known is sorted in tabs by kind (the author:
  // "segregowana lista, z zakładkami"), the materials under their rarities;
  // a tab opened picks its first goods, so the one asked for is in sight.
  const kinds = mixed ? KINDS.filter((kind) => list.some((one) => one.kind === kind)) : [];
  let tab = picked.kind;
  const choice = (one) =>
    h(
      'button',
      {
        type: 'button',
        class: 'guild-ask-choice',
        'aria-pressed': String(one === picked),
        onClick: () => {
          picked = one;
          count.value = String(start());
          showGoods();
        },
      },
      goodsLine(one),
      h('span', { class: 'guild-ask-have', text: filled(texts.have, { have: formatNumber(held(one)) }) }),
    );
  // The materials of a tab under their rarities' headings, each heading in
  // its rarity's colour ("Pospolite", "Rzadkie"…).
  const byRarity = (some) =>
    state.content.rarities.map((rarity) => {
      const these = some.filter((one) => one.rarity === rarity.id);
      if (these.length === 0) return null;
      const heading = rarity.forms.pl.charAt(0).toUpperCase() + rarity.forms.pl.slice(1);
      return [h('p', { class: 'guild-ask-group', vars: { '--rarity': rarity.color }, text: heading }), these.map(choice)];
    });
  const tabs = () =>
    kinds.length > 1 &&
    h(
      'div',
      { class: 'chat-tabs market-tabs guild-ask-tabs', role: 'tablist', 'aria-label': texts.goods },
      kinds.map((kind) =>
        h(
          'button',
          {
            type: 'button',
            class: 'chat-tab',
            role: 'tab',
            'aria-selected': String(tab === kind),
            onClick: () => {
              if (tab === kind) return;
              tab = kind;
              picked = list.find((one) => one.kind === kind);
              count.value = String(start());
              showGoods();
            },
          },
          h('span', { class: 'chat-tab-name', text: texts.kindGroups[kind] }),
        ),
      ),
    );
  const showGoods = () => {
    if (list.length === 1) {
      fill(goods, h('p', { class: 'guild-ask-one' }, goodsLine(picked, h('span', { class: 'muted', text: ` · ${filled(texts.have, { have: formatNumber(held(picked)) })}` }))));
      return;
    }
    const some = mixed ? list.filter((one) => one.kind === tab) : list;
    fill(
      goods,
      tabs(),
      h('div', { class: 'guild-ask-picker', role: 'group', 'aria-label': mixed ? texts.kindGroups[tab] : texts.goods }, mixed && tab === 'material' ? byRarity(some) : some.map(choice)),
    );
  };
  showGoods();
  const send = h('button', {
    type: 'button',
    class: 'button button--system',
    text: texts.send,
    onClick: (event) =>
      withButton(event.currentTarget, async () => {
        const number = Number(count.value);
        if (!Number.isInteger(number) || number < 1 || number > rules.most) throw new Error(`${texts.count}: 1–${rules.most}.`);
        const answer = await call('POST', '/api/guild/requests', { kind: picked.kind, key: picked.key, count: number });
        closeSheet();
        toast(answer.text);
        onAsked?.(answer);
      }),
  });
  fill(
    body,
    h('p', { class: 'sheet-text', text: texts.askLead }),
    h('p', { class: 'field-label', text: texts.goods }),
    goods,
    h('div', { class: 'trade-field' }, h('label', { for: 'guild-ask-count', class: 'trade-field-label', text: `${texts.count} (1–${rules.most})` }), count),
    h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--world', text: 'Anuluj', onClick: closeSheet }), send),
  );
}

export function mountGuildRequests(container) {
  let view = null;
  let gone = false;
  const card = h('section', { class: 'card guild-requests', 'aria-labelledby': 'guild-requests-title' }, h('p', { class: 'muted', text: 'Wczytywanie…' }));
  container.append(card);

  function show(next) {
    if (gone) return;
    view = next;
    render();
  }

  // An action answered with the Prośby anew, its words in a toast.
  async function act(path, body) {
    const answer = await call('POST', path, body);
    show(answer);
    if (answer.text) toast(answer.text);
  }

  const title = () => h('h2', { class: 'card-title', id: 'guild-requests-title', text: view.texts.title });
  const subtitle = (text) => h('h3', { class: 'guild-subtitle', text });
  const pieces = (count) => `${formatNumber(count)} ${plural(count, ...view.texts.pieceForms)}`;
  const who = (person) =>
    h(
      'span',
      { class: 'guild-who' },
      icon(CLASS_ICONS[person.classId] ?? 'person', { size: 16, className: 'chat-class' }),
      person.name
        ? h('button', { type: 'button', class: 'chat-name', text: person.name, 'aria-label': `${person.name}: zobacz postać`, onClick: (event) => withButton(event.currentTarget, () => openProfile(person.name)) })
        : h('span', { class: 'muted', text: '?' }),
    );

  // The character's own request: its goods, the gifts with "Podziękuj",
  // "Wycofaj" while it hangs; then when it may ask again, or "Poproś gildię".
  function minePart() {
    const { mine, texts } = view;
    const ask = h('button', {
      type: 'button',
      class: 'button button--system',
      text: texts.ask,
      onClick: () => openAskSheet({}, show),
    });
    return h(
      'div',
      { class: 'guild-part guild-mine' },
      subtitle(texts.mine),
      mine && [
        h('p', { class: 'guild-mine-goods' }, goodsLine(mine.goods, h('span', { class: 'muted', text: ` × ${formatNumber(mine.count)}` }))),
        h('p', { class: 'guild-mine-state', text: [filled(texts.given, { given: formatNumber(mine.given), count: formatNumber(mine.count) }), filled(texts.states[mine.state], { until: dateTimeFormat.format(new Date(mine.endsAt)) })].join('. ') }),
        mine.gifts.length === 0
          ? h('p', { class: 'muted', text: texts.noGifts })
          : h(
              'ul',
              { class: 'guild-ranking' },
              mine.gifts.map((gift) =>
                h(
                  'li',
                  { class: 'guild-row' },
                  who(gift),
                  h('span', { class: 'guild-row-value', text: pieces(gift.count) }),
                  gift.thanked
                    ? h('span', { class: 'chip guild-chip', text: texts.thanked })
                    : h('button', { type: 'button', class: 'button button--system button--small', text: texts.thank, onClick: (event) => withButton(event.currentTarget, () => act('/api/guild/requests/thank', { giftId: gift.id })) }),
                ),
              ),
            ),
        mine.state === 'open' &&
          h(
            'div',
            { class: 'guild-actions' },
            h('button', {
              type: 'button',
              class: 'button button--world button--small',
              text: texts.cancel,
              onClick: (event) =>
                withButton(event.currentTarget, async () => {
                  if (!(await confirmAction({ title: texts.cancelTitle, text: texts.cancelText, confirmLabel: texts.cancel }))) return;
                  await act('/api/guild/requests/cancel');
                }),
            }),
          ),
      ],
      !view.waiting && (view.nextAt ? h('p', { class: 'muted', text: filled(texts.waitNext, { at: dateTimeFormat.format(new Date(view.nextAt)) }) }) : ask),
    );
  }

  // Another member's request: who asks, for what, what is missing and what
  // this character holds, with "Daj" for as many as it may give.
  function requestRow(request) {
    const { texts } = view;
    const field = request.give > 0 && h('input', { type: 'number', class: 'trade-number guild-give-count', min: '1', max: String(request.give), step: '1', inputmode: 'numeric', value: String(request.give), 'aria-label': texts.giveCount });
    const give = () => {
      const number = Number(field.value);
      if (!Number.isInteger(number) || number < 1 || number > request.give) throw new Error(`${texts.giveCount}: 1–${request.give}.`);
      return act('/api/guild/requests/give', { requestId: request.id, count: number });
    };
    return h(
      'li',
      { class: 'guild-request' },
      h('div', { class: 'guild-request-head' }, who(request), goodsLine(request.goods)),
      h('p', { class: 'guild-request-state', text: [filled(texts.left, { left: formatNumber(request.left), count: formatNumber(request.count) }), filled(texts.have, { have: formatNumber(request.have) })].join(' · ') }),
      request.sameAccount
        ? h('p', { class: 'muted', text: texts.sameAccount })
        : field && h('div', { class: 'guild-give' }, field, h('button', { type: 'button', class: 'button button--system button--small', text: texts.give, onClick: (event) => withButton(event.currentTarget, give) })),
    );
  }

  function othersPart() {
    const { requests, texts } = view;
    const others = requests.filter((request) => !request.own);
    return h(
      'div',
      { class: 'guild-part' },
      subtitle(texts.others),
      others.length === 0 ? h('p', { class: 'muted', text: texts.empty }) : h('ul', { class: 'guild-requests-list' }, others.map(requestRow)),
    );
  }

  // The "Dobroczyńcy tygodnia": the pieces each gave since Monday and the
  // thanks they brought.
  function rankingPart() {
    const { ranking, texts } = view;
    return h(
      'div',
      { class: 'guild-part' },
      subtitle(texts.rankingTitle),
      h('p', { class: 'muted', text: texts.ranking }),
      ranking.length === 0
        ? h('p', { class: 'muted', text: texts.rankingEmpty })
        : h(
            'ol',
            { class: 'guild-ranking' },
            ranking.map((one) =>
              h(
                'li',
                { class: `guild-row${one.own ? ' guild-row--own' : ''}` },
                h('span', { class: 'guild-row-name', text: one.name }),
                h('span', { class: 'guild-row-value', text: [pieces(one.pieces), one.thanks > 0 && `${formatNumber(one.thanks)} ${plural(one.thanks, ...texts.thankForms)}`].filter(Boolean).join(' · ') }),
              ),
            ),
          ),
    );
  }

  function render() {
    const { texts } = view;
    const how = howItWorks(texts.intro, texts.how);
    if (!view.guild) {
      fill(card, title(), h('p', { class: 'muted', text: texts.noGuild }), how);
      return;
    }
    fill(card, title(), how, minePart(), othersPart(), rankingPart());
  }

  call('GET', '/api/guild/requests')
    .then(show)
    .catch((error) => {
      if (!gone) fill(card, h('p', { class: 'muted', text: error.message ?? 'Nie udało się wczytać Próśb Gildii.' }));
    });

  return {
    unmount() {
      gone = true;
      card.remove();
    },
  };
}
