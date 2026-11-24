// The Skrzynia Gildii on the Gildia page (src/server/guild-chest.js;
// DECISIONS.md, "Skrzynia Gildii"; the author, 10.11.2026: „Wspólna
// skrzynia Gildii, w której można równocześnie zostawiać przedmioty bez
// przypisania do jakiegokolwiek gracza, zeby kazdy mogl wziąć lub z
// przypisaniem do konkretnego gracza w Gildii. Cel takiego rozwiązania to
// brak konieczności bycia online przez obydwu członków Gildii na raz.”):
// the card of the "Skrzynia" tab. On top, how many items lie in the chest
// and how many wait for this character; then the items, those for it
// first, each with its picture, name, who put it in, for whom and when,
// and "Weź" ("Zabierz" for one it put in itself), or the member it waits
// for; a tap on an item opens its card, which compares it with what the
// character and its companions wear (as on the Targowisko). Under them "Włóż z plecaka", the
// bag's items with "Włóż", which asks in a sheet for whom: "Dla wszystkich"
// or one of the guild's members; and "Ostatnie ruchy", the chest's log.
// Below the Wymiana's level (the server's `locked`) a line says from which
// level, and "Włóż" and "Weź" only say it again (as the Wymiana w Gildii);
// "Zabierz" of its own items still works.
// The words come with the answer (data/guilds.json, chest.texts), in the
// page's language; the card's own few go through t() (i18n.js).
// mountGuildChest(container) adds the card to the container and gives
// { unmount() }, which takes it away.

import { materialSprite, pantrySprite } from './art.js';
import { checkGuildTodo } from './chat-news.js';
import { fill, h, icon } from './dom.js';
import { dateTimeFormat, formatNumber } from './format.js';
import { t } from './i18n.js';
import { CLASS_ICONS } from './icons.js';
import { call, onCharacterChange, state } from './state.js';
import { closeSheet, foldPart, framedName, howItWorks, openSheet, toast, withButton } from './ui.js';
import { compareTable, itemDetails, itemSheet, itemSummary, levelLocked } from './screens/character.js';
import { companionCompare } from './screens/market.js';

const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
const when = (at) => dateTimeFormat.format(new Date(at));

export function mountGuildChest(container) {
  let view = null;
  let gone = false;
  const card = h('section', { class: 'card guild-stash', 'aria-labelledby': 'guild-stash-title' }, h('p', { class: 'muted', text: t('Wczytywanie…') }));
  container.append(card);

  function show(next) {
    if (gone) return;
    view = next;
    render();
  }

  // An action answered with the chest anew, its words in a toast; the
  // Gildia's dots follow at once.
  async function act(path, body) {
    const answer = await call('POST', path, body);
    checkGuildTodo({ now: true });
    show(answer);
    if (answer.text) toast(answer.text);
  }

  const title = () => h('h2', { class: 'card-title', id: 'guild-stash-title', text: view.texts.title });

  // Who put the item in, for whom and when, and whether this character
  // wears it (as in the Skrzynia Konta, screens/chest.js); on the list also
  // whether the Kowal has raised it already, once for good (a player's
  // remark, 12.11.2026: „informacje czy było już ulepszane w kuźni”), which
  // its card says in full.
  function note(item, { list = false } = {}) {
    const { texts } = view;
    const forWhom = item.forYou ? texts.forYou : item.forName ? filled(texts.forOne, { name: item.forName }) : texts.forAll;
    if (item.goods) return [filled(texts.from, { name: item.from }), forWhom, when(item.putAt)].join(' · ');
    const wear = !item.usable
      ? t('nie dla tej klasy')
      : item.wornFrom && item.wornFrom > state.character.classLevel
        ? t('założysz od poziomu klasy {level}', { level: item.wornFrom })
        : levelLocked(item, state.character)
          ? t('założysz od {level}. poziomu postaci albo klasy', { level: item.wearLevel })
          : null;
    const raised = list && item.raised && t('przekuty u Kowala');
    return [filled(texts.from, { name: item.from }), forWhom, when(item.putAt), wear, raised].filter(Boolean).join(' · ');
  }

  // "Weź", "Zabierz" for an item this character put in itself, or the
  // member it waits for. A full bag shows over the list; the server says
  // so too.
  function takePart(item, { closing = false } = {}) {
    const { texts } = view;
    // Not this character's to take: the member it waits for, or for a
    // Nowicjusz (1062) an item for all, from the day its days end.
    if (!item.canTake) return h('p', { class: 'guild-stash-waits', text: item.forName === null && view.novice ? view.novice.take : filled(texts.waitsFor, { name: item.forName }) });
    return h('button', {
      type: 'button',
      class: 'button button--system button--small',
      text: item.own ? texts.takeBack : texts.take,
      onClick: (event) => {
        if (view.locked && !item.own) return toast(texts.level);
        return withButton(event.currentTarget, async () => {
          await act('/api/guild/chest/take', { id: item.id });
          if (closing) closeSheet();
        });
      },
    });
  }

  // An item's card from the chest: its properties and gem, who left it for
  // whom, then how it compares with what the character wears in its place
  // and with what each companion who can put it on wears there, as on the
  // Targowisko (market.js; a player's remark, 12.11.2026: „W oknie skrzyni
  // gildii można by również dać możliwość porównania eq swojego i swoich
  // towarzyszy z włożonymi w skrzynię gildii”), and the same "Weź". The
  // scrapper's price stays off: it is not the bag's.
  function openItem(item) {
    const worn = state.character.equipment?.[item.slot] ?? null;
    const companions = (item.wearers ?? []).map((id) => (view.team ?? []).find((one) => one.id === id)).filter(Boolean);
    openSheet(
      itemDetails({ ...item, price: undefined }),
      h('p', { class: 'sheet-text guild-stash-sheet-note', text: note(item) }),
      item.usable && (worn ? compareTable(item, worn) : h('p', { class: 'muted', text: t('W miejscu „{slot}” postać nic teraz nie nosi.', { slot: item.slotName }) })),
      companions.map((companion) => companionCompare(companion, item)),
      h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--world', text: t('Zamknij'), onClick: closeSheet }), takePart(item, { closing: true })),
    );
  }

  // What lies in the chest and waits for this character, and a full bag
  // while something waits to be taken.
  function headPart() {
    const { texts, capacity, count, waiting, items } = view;
    const character = state.character;
    const bagFull = character.bagUsed >= character.bagCapacity && items.some((item) => item.canTake && !item.goods);
    return h(
      'div',
      { class: 'guild-stash-head' },
      h('span', { class: 'chest-art', 'aria-hidden': 'true' }, materialSprite('chest')),
      h(
        'div',
        { class: 'guild-stash-counts' },
        h('p', { class: 'guild-stash-count', text: filled(texts.inside, { count: formatNumber(count), capacity: formatNumber(capacity) }) }),
        waiting > 0 && h('p', { class: 'guild-stash-waiting', text: filled(texts.forMe, { count: formatNumber(waiting) }) }),
        bagFull && h('p', { class: 'muted', text: texts.bagFull }),
        view.locked && h('p', { class: 'muted', text: texts.level }),
        view.novice && h('p', { class: 'muted', text: view.novice.note }),
      ),
    );
  }

  function itemsPart() {
    const { items, texts } = view;
    if (items.length === 0) return h('p', { class: 'muted', text: texts.empty });
    return h(
      'ul',
      { class: 'chest-list guild-stash-list' },
      items.map((item) =>
        h(
          'li',
          { class: `chest-row guild-stash-row${item.forYou ? ' guild-stash-row--yours' : ''}` },
          item.goods
            ? h('div', { class: 'chest-item chest-item--bag' }, goodsSummary(item.goods), h('span', { class: 'chest-note', text: note(item, { list: true }) }))
            : h('button', { type: 'button', class: 'chest-item chest-item--bag', onClick: () => openItem(item) }, itemSummary(item), h('span', { class: 'chest-note', text: note(item, { list: true }) })),
          takePart(item),
        ),
      ),
    );
  }

  // A lot of the Spiżarnia's goods in one line: its picture, name and how
  // many (the author, 18.11.2026: „Skrzynia Konta, Skrzynia Gildii
  // wszędzie”).
  function goodsSummary(goods) {
    return h(
      'span',
      { class: 'item-summary-art market-goods' },
      h('span', { class: 'potion-pick-art' }, pantrySprite(goods.key) ?? icon('fish', { size: 24 })),
      h('span', { class: 'item-summary' }, h('span', { class: 'item-name', text: `${goods.name} ×${formatNumber(goods.count)}` }), h('span', { class: 'item-meta', text: t('Spiżarnia') })),
    );
  }

  // The sheet of "Włóż": the item, and for whom it stays, "Dla wszystkich"
  // (picked first) or one of the guild's other members, each with its
  // class and level, in a box that scrolls in a big guild. A good of the
  // Spiżarnia (`good`) asks how many pieces first.
  function openPutSheet(item, good = null) {
    const { texts, members } = view;
    let picked = null;
    let count = good ? good.count : 1;
    const picker = h('div', { class: 'guild-ask-picker guild-stash-picker', role: 'group', 'aria-label': texts.putLead });
    const choice = (id, ...parts) =>
      h(
        'button',
        {
          type: 'button',
          class: 'guild-ask-choice',
          'aria-pressed': String(id === picked),
          onClick: () => {
            picked = id;
            draw();
          },
        },
        parts,
      );
    const draw = () =>
      fill(
        picker,
        choice(null, h('span', { class: 'guild-stash-choice', text: texts.forAll })),
        members.map((one) =>
          choice(
            one.id,
            h('span', { class: 'guild-stash-choice' }, icon(CLASS_ICONS[one.classId] ?? 'person', { size: 16, className: 'chat-class' }), framedName(h('span', { class: 'guild-stash-choice-name', text: one.name }), one.nameColor)),
            h('span', { class: 'guild-ask-have', text: t('poz. {level}', { level: formatNumber(one.level) }) }),
          ),
        ),
      );
    draw();
    const send = h('button', {
      type: 'button',
      class: 'button button--system',
      text: texts.put,
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          await act(good ? '/api/guild/chest/put-goods' : '/api/guild/chest/put', good ? { kind: 'pantry', key: good.id, count, forId: picked } : { itemId: item.id, forId: picked });
          closeSheet();
        }),
    });
    // How many of the good: − and + by one, "wszystkie" for the lot.
    const amount = good && (() => {
      const value = h('output', { class: 'herb-count-value' });
      const less = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': t('Mniej'), text: '−', onClick: () => set(count - 1) });
      const more = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': t('Więcej'), text: '+', onClick: () => set(count + 1) });
      const all = h('button', { type: 'button', class: 'link-button', text: t('wszystkie'), onClick: () => set(good.count) });
      function set(next) {
        count = Math.min(good.count, Math.max(1, next));
        value.textContent = t('{count} szt.', { count: formatNumber(count) });
        less.disabled = count === 1;
        more.disabled = count === good.count;
      }
      set(count);
      return h('div', { class: 'herb-count' }, less, value, more, all);
    })();
    openSheet(
      h('h2', { class: 'sheet-title', text: texts.putTitle }),
      h(
        'div',
        { class: 'guild-ask-sheet guild-stash-put' },
        good ? goodsSummary({ key: good.id, name: good.name, count: good.count }) : itemSummary(item),
        amount,
        h('p', { class: 'field-label', text: texts.putLead }),
        picker,
        h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--world', text: t('Anuluj'), onClick: closeSheet }), send),
      ),
    );
  }

  // The bag's items with "Włóż": shut while the chest is full, and for an
  // item a gem is being set in (the server's `setting`). Unfolded at first
  // while the chest is empty.
  function bagPart() {
    const { texts, capacity, count, setting } = view;
    const { bag } = state.character;
    const room = capacity - count;
    const busy = new Set(setting);
    return h(
      'div',
      { class: 'guild-part guild-stash-bag' },
      foldPart(
        { key: 'guild-chest-bag', title: texts.bag, line: filled(texts.bagLine, { count: formatNumber(bag.length) }), open: count === 0 },
        room <= 0 && h('p', { class: 'muted', text: texts.full }),
        bag.length === 0
          ? h('p', { class: 'muted', text: texts.bagEmpty })
          : h(
              'ul',
              { class: 'chest-list' },
              bag.map((item) =>
                h(
                  'li',
                  { class: 'chest-row' },
                  h(
                    'button',
                    { type: 'button', class: 'chest-item chest-item--bag', onClick: () => itemSheet(item, { equipped: false }) },
                    itemSummary(item),
                    busy.has(item.id) && h('span', { class: 'chest-note', text: texts.setting }),
                  ),
                  h('button', {
                    type: 'button',
                    class: 'button button--world button--small',
                    text: texts.put,
                    disabled: room <= 0 || busy.has(item.id),
                    onClick: () => (view.locked ? toast(texts.level) : openPutSheet(item)),
                  }),
                ),
              ),
            ),
      ),
    );
  }

  // The Spiżarnia's fish, crops and dishes with "Włóż", as the bag's items:
  // a lot of one good, as many pieces as chosen. Folded at first.
  function pantryPart() {
    const { texts, capacity, count } = view;
    const pantry = state.character.pantry ?? [];
    const room = capacity - count;
    if (pantry.length === 0) return null;
    return h(
      'div',
      { class: 'guild-part guild-stash-bag' },
      foldPart(
        { key: 'guild-chest-pantry', title: t('Włóż ze Spiżarni'), line: t('{count} rodz.', { count: formatNumber(pantry.length) }), open: false },
        room <= 0 && h('p', { class: 'muted', text: texts.full }),
        h(
          'ul',
          { class: 'chest-list' },
          pantry.map((good) =>
            h(
              'li',
              { class: 'chest-row' },
              h('div', { class: 'chest-item chest-item--bag' }, goodsSummary({ key: good.id, name: good.name, count: good.count })),
              h('button', {
                type: 'button',
                class: 'button button--world button--small',
                text: texts.put,
                disabled: room <= 0,
                onClick: () => (view.locked ? toast(texts.level) : openPutSheet(null, good)),
              }),
            ),
          ),
        ),
      ),
    );
  }

  // The last moves: each item's name in its rarity's colour, who put it in
  // (and for whom) or took it out, or the war chest of a war won
  // (guild-war.js), and when; folded under their number.
  function logPart() {
    const { log, texts } = view;
    if (log.length === 0) return h('div', { class: 'guild-part' }, h('h3', { class: 'guild-subtitle', text: texts.log }), h('p', { class: 'muted', text: texts.logEmpty }));
    const kinds = { put: (move) => (move.forName ? texts.logPutFor : texts.logPut), take: () => texts.logTake, war: () => texts.logWar };
    const line = (move) => filled((kinds[move.kind] ?? kinds.take)(move), { name: move.name, for: move.forName, at: when(move.at) });
    return h(
      'div',
      { class: 'guild-part' },
      foldPart(
        { key: 'guild-chest-log', title: texts.log, line: filled(texts.logLine, { count: formatNumber(log.length) }), open: false },
        h(
          'ol',
          { class: 'guild-stash-log' },
          log.map((move) =>
            h(
              'li',
              { class: 'guild-stash-move' },
              h('span', { class: 'guild-stash-move-item', vars: move.item.color ? { '--rarity': move.item.color } : undefined, text: move.item.name }),
              h('span', { class: 'guild-stash-move-who', text: line(move) }),
            ),
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
    fill(card, title(), how, headPart(), itemsPart(), bagPart(), pantryPart(), logPart());
  }

  // The character changed (its bag, as after a report): the card again.
  const unsubscribe = onCharacterChange(() => {
    if (view && !gone) render();
  });

  call('GET', '/api/guild/chest')
    .then(show)
    .catch((error) => {
      if (!gone) fill(card, h('p', { class: 'muted', text: error.message ?? t('Nie udało się wczytać Skrzyni Gildii.') }));
    });

  return {
    unmount() {
      gone = true;
      unsubscribe();
      card.remove();
    },
  };
}
