// The World Boss's card on its tab of the Walka, #/postrach (since
// 24.11.2026; before, on the Eksploracja's screen; src/server/world-boss.js;
// DECISIONS.md, "Postrach Krainy (1222–1226)", "Postrach Krainy co 3 dni
// (24.11.2026)" and "Postrach Krainy i Kultywacja jako zakładki Walki
// (24.11.2026)"; the author: 1222–1226 A): the boss the character fights
// in this period (a boss every 3 days from 27.11.2026), until which day it
// stays and on which the next one comes, with its picture (its own once
// drawn, else a creature of its land's in its place: art.js), name, band of
// levels and land, and the HP bar shared by the whole band; the attacks
// left today and "Atakuj", whose fight plays at once in a sheet with the
// boss's cry (sound.js, its voice's `cry`); the character's damage, place
// and chest now with what the next one asks for; its title of a fallen
// boss; the Skrzynie Bossa to open, and what one held as icons to tap (as
// the Bestia Gildii's, guild-beast.js); the best of the boss, whose names
// open their character cards (profile.js), with the character's own place
// under them; and the rules under "Jak to działa?". The card asks for the
// boss itself and takes its words from the answer (data/world-bosses.json,
// texts), in the page's language; its own few words go through t()
// (i18n.js). worldBossCard() makes the card once for its screen
// (mountWorldBoss), which keeps it over its renders; it stays empty below
// its unlock. `stop()` ends it.

import { createArena } from './arena.js';
import { itemSprite, worldBossSprite } from './art.js';
import { combatModes } from './combat-modes.js';
import { materialIcon, materialSheet, materialTitle } from './craft-table.js';
import { fill, h, icon } from './dom.js';
import { dateTimeFormat, formatNumber } from './format.js';
import { language, t } from './i18n.js';
import { CLASS_ICONS } from './icons.js';
import { openProfile } from './profile.js';
import { playVoice, preloadVoices } from './sound.js';
import { call, isUnlocked, onCharacterChange, state, unlockInfo } from './state.js';
import { foldPart, howItWorks, openSheet, systemPanel, toast, withButton } from './ui.js';
import { itemSheet } from './screens/character.js';

const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));

// The boss's periods go by the Polish clock (src/engine/world-boss.js,
// worldBossPeriod), as do their days on the card.
const ZONE = 'Europe/Warsaw';
const locale = () => (language() === 'en' ? 'en-GB' : 'pl-PL');

// A day as the page's language writes it ("1.12", "01/12"): the day of `at`.
const dayOf = (at) => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'numeric', timeZone: ZONE }).format(new Date(at));
// The last day before the midnight `until`.
const lastDay = (until) => dayOf(until - 1);

// "1–3 grudnia", "29 listopada – 1 grudnia" ("1–3 December"): a boss's
// period from its first midnight to its last, as the guild war's week.
function periodDates(startsAt, endsAt) {
  const first = new Date(startsAt);
  const last = new Date(endsAt - 1);
  const day = new Intl.DateTimeFormat(locale(), { day: 'numeric', timeZone: ZONE });
  const full = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', timeZone: ZONE });
  const month = new Intl.DateTimeFormat(locale(), { month: 'numeric', timeZone: ZONE });
  return month.format(first) === month.format(last) ? `${day.format(first)}–${full.format(last)}` : `${full.format(first)} – ${full.format(last)}`;
}

// The weekday of `at` on the Polish clock, from Monday (0) to Sunday (6).
function weekdayOf(at) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: ZONE })
      .formatToParts(new Date(at))
      .map((part) => [part.type, Number(part.value)]),
  );
  return (new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay() + 6) % 7;
}

// "środy 2 grudnia", "w czwartek 3 grudnia" ("Wednesday 2 December", "on
// Thursday 3 December"): the day of `at` with its weekday in the form the
// card's words want (texts.days: `to` after „do”, `on` for when).
const dayWords = (at, forms) => `${forms[weekdayOf(at)]} ${new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', timeZone: ZONE }).format(new Date(at))}`;

// `onView` is told each answer shown (null after a failed look): the chests
// waiting change with it, and so does the dot of its tab (combat-modes.js).
export function worldBossCard({ onView } = {}) {
  let view = null;
  // The last attack's answer and the last chest opened, while the card stays.
  let last = null;
  let opened = null;
  let asked = false;
  let gone = false;
  const card = h('section', { class: 'card world-boss', 'aria-labelledby': 'world-boss-title', hidden: true });

  function show(next) {
    if (gone) return;
    view = next;
    render();
    onView?.(view);
  }

  // Asked once the character has the World Boss: the first time the card
  // shows, and anew when asked to. A failed look says why in the card.
  function refresh() {
    asked = true;
    return call('GET', '/api/world-boss')
      .then(show)
      .catch((error) => {
        if (gone) return;
        fill(card, h('p', { class: 'muted', text: error.message ?? t('Nie udało się wczytać Postrachu Krainy.') }));
        card.hidden = false;
        onView?.(null);
      });
  }

  // The words of the last attack: what it took off the bar, and the fall.
  const attackText = (attack, texts) => [filled(texts.lastAttack, { damage: formatNumber(attack.damage) }), attack.fell && texts.fell].filter(Boolean).join(' ');

  async function attack() {
    const answer = await call('POST', '/api/world-boss/attack');
    last = answer.attack;
    opened = null;
    show(answer);
    // The fight played back at once, as the Bestia's, with the boss's cry
    // (data/sounds.json, voices.<sound>.cry).
    if (answer.attack.fight) {
      playVoice(answer.boss.sound, 'cry');
      const arena = createArena(answer.attack.fight, { autoplay: 'now' });
      const dialog = openSheet(h('h2', { class: 'sheet-title', text: answer.texts.fightTitle }), h('p', { class: 'sheet-text', text: attackText(answer.attack, answer.texts) }), arena.element);
      dialog.addEventListener('close', () => arena.stop(), { once: true });
    }
    if (answer.attack.fell) toast(answer.texts.fell);
  }

  async function claim(week) {
    const answer = await call('POST', '/api/world-boss/claim', { week });
    const { chest, character } = answer;
    opened = { text: chest.text, items: chest.items.map((item) => character.bag.find((one) => one.id === item.id) ?? item), materials: chest.materials };
    show(answer);
    toast(chest.text);
  }

  // A tap on the chest's item or material: its card as the bag has it now,
  // or the item's as worn once put on; a word when it is gone.
  function openItem(id) {
    const { bag, equipment } = state.character;
    const inBag = bag.find((one) => one.id === id);
    if (inBag) return itemSheet(inBag, { equipped: false });
    const worn = Object.values(equipment).find((one) => one?.id === id);
    if (worn) return itemSheet(worn, { equipped: true });
    toast(view.texts.notInBag);
  }

  function openMaterial(key) {
    const stack = state.character.crafting?.materials.find((one) => one.key === key);
    if (stack) materialSheet(stack);
    else toast(view.texts.notInBag);
  }

  // What the chest held, as the bag shows it, with the chest's counts.
  function lootPart() {
    const { items, materials } = opened;
    return h(
      'ul',
      { class: 'bag-grid guild-beast-loot' },
      items.map((item) =>
        h(
          'li',
          {},
          h(
            'button',
            { type: 'button', class: 'slot slot--bag', vars: { '--rarity': item.color }, 'aria-label': `${item.name}, ${item.rarityName ?? ''}`, onClick: () => openItem(item.id) },
            itemSprite(item) ?? icon('sword', { size: 24 }),
          ),
        ),
      ),
      materials.map((material) =>
        h(
          'li',
          {},
          h(
            'button',
            {
              type: 'button',
              class: 'slot slot--bag',
              vars: { '--rarity': material.color },
              'aria-label': `${materialTitle(material)}, ${material.rarityName}, ${formatNumber(material.count)}`,
              onClick: () => openMaterial(material.key),
            },
            materialIcon(material.materialId),
            h('span', { class: 'slot-level', text: formatNumber(material.count) }),
          ),
        ),
      ),
    );
  }

  function hpBar(boss) {
    const bar = h('div', { class: 'meter-fill' });
    bar.style.width = `${boss.maxHp > 0 ? Math.max(0, Math.min(1, boss.hp / boss.maxHp)) * 100 : 0}%`;
    return h(
      'div',
      { class: 'meter meter--hp world-boss-hp' },
      h('div', { class: 'meter-label' }, h('span', { text: 'HP' }), h('span', { class: 'meter-value', text: `${formatNumber(boss.hp)} / ${formatNumber(boss.maxHp)}` })),
      h('div', { class: 'meter-track', role: 'progressbar', 'aria-label': `${boss.name}: HP`, 'aria-valuemin': 0, 'aria-valuemax': boss.maxHp, 'aria-valuenow': boss.hp }, bar),
    );
  }

  // The boss: its picture, name, band and land, and its words.
  function headPart() {
    const { boss, texts } = view;
    const band = boss.band.last ? filled(texts.bandOpen, { min: boss.band.min }) : filled(texts.band, { min: boss.band.min, max: boss.band.max });
    return h(
      'div',
      { class: 'world-boss-head' },
      h('span', { class: 'world-boss-art', 'aria-hidden': 'true' }, worldBossSprite(boss.id) ?? icon('beast', { size: 48 })),
      h(
        'div',
        { class: 'world-boss-who' },
        h('p', { class: 'world-boss-name', text: boss.name }),
        h('p', { class: 'world-boss-meta', text: `${band} · ${boss.land}` }),
        h('p', { class: 'world-boss-description', text: boss.description }),
      ),
    );
  }

  // The bar, and the fall or the attacks left today with "Atakuj"; shut,
  // with the words of why, while the character offers itself or serves as
  // a mercenary (attacks.blocked).
  function fightPart() {
    const { boss, attacks, texts } = view;
    if (boss.fallen) {
      return [
        hpBar(boss),
        h('p', { class: 'world-boss-fallen', text: [filled(texts.fallen, { at: dateTimeFormat.format(new Date(boss.fallenAt)) }), boss.fallenBy && filled(texts.lastBlow, { name: boss.fallenBy })].filter(Boolean).join(' ') }),
        h('p', { class: 'muted', text: filled(texts.next, { day: dayWords(boss.endsAt, texts.days.on) }) }),
      ];
    }
    const disabled = attacks.left === 0 || Boolean(attacks.blocked);
    return [
      hpBar(boss),
      h('p', { class: 'muted', text: filled(texts.stays, { day: dayWords(boss.endsAt - 1, texts.days.to) }) }),
      h('p', { class: 'world-boss-attacks', text: [filled(texts.attacksLeft, { left: attacks.left, perDay: attacks.perDay }), attacks.left === 0 && texts.newAttacks].filter(Boolean).join('. ') }),
      attacks.blocked && h('p', { class: 'muted', text: attacks.blocked }),
      h('button', {
        type: 'button',
        class: 'button button--system world-boss-attack',
        text: texts.attack,
        disabled,
        onClick: (event) => withButton(event.currentTarget, attack),
      }),
    ];
  }

  // The character's part: its damage and place, its chest now and the
  // next one's damage, and the title it wears.
  function ownPart() {
    const { own, texts, title } = view;
    return h(
      'div',
      { class: 'world-boss-own' },
      own
        ? [
            h('p', { class: 'world-boss-own-damage', text: filled(texts.own, { damage: formatNumber(own.damage), place: formatNumber(own.place) }) }),
            h('p', { text: filled(texts.size, { size: texts.sizes[own.size] }) }),
            own.next && !view.boss.fallen && h('p', { class: 'muted', text: filled(texts.nextSize, { size: texts.nextSizes[own.next.id], damage: formatNumber(own.next.damage), missing: formatNumber(own.next.missing) }) }),
          ]
        : h('p', { class: 'muted', text: texts.noOwn }),
      title && h('p', { class: 'world-boss-title-worn' }, icon('trophy', { size: 18 }), h('span', { text: filled(texts.titleWorn, { until: lastDay(title.until), title: title.text }) })),
    );
  }

  // The last attack: what it took off the bar and the lines of its fight.
  function lastPart() {
    if (!last) return null;
    const { texts } = view;
    return h(
      'div',
      { class: 'guild-beast-last' },
      h('p', { text: attackText(last, texts) }),
      last.log.length > 0 &&
        h(
          'details',
          { class: 'guild-beast-log' },
          h('summary', { class: 'how-toggle', text: texts.log }),
          h(
            'ol',
            {},
            last.log.map((line) => h('li', { text: line })),
          ),
        ),
    );
  }

  // The Skrzynie Bossa to open, each with what it holds, the last blow's
  // part and the title its place won, and the last one opened.
  function chestsPart() {
    const { chests, texts } = view;
    if (chests.length === 0 && !opened) return null;
    return h(
      'div',
      { class: 'guild-beast-chests world-boss-chests' },
      h('h3', { class: 'guild-beast-subtitle', text: texts.chestTitle }),
      opened && h('p', { class: 'guild-beast-opened', text: opened.text }),
      opened && lootPart(),
      chests.map((chest) =>
        h(
          'div',
          { class: `guild-beast-chest world-boss-chest world-boss-chest--${chest.size}` },
          h('p', { class: 'world-boss-chest-head', text: filled(chest.fallen ? texts.chestFallen : texts.chestUnbeaten, { dates: periodDates(chest.startsAt, chest.endsAt), size: texts.sizes[chest.size] }) }),
          h('p', { text: filled(texts.chestContents, { gold: formatNumber(chest.gold), pieces: formatNumber(chest.pieces), chance: Math.round(chest.itemChance * 100) }) }),
          chest.lastBlow && h('p', { class: 'world-boss-chest-extra', text: filled(texts.chestLastBlow, { gold: formatNumber(chest.lastBlow.gold) }) }),
          chest.title && h('p', { class: 'world-boss-chest-extra' }, icon('trophy', { size: 16 }), h('span', { text: filled(texts.chestTitleEarned, { place: chest.title.place, title: chest.title.text, until: lastDay(chest.title.until) }) })),
          h('p', { class: 'muted', text: filled(texts.chestUntil, { until: lastDay(chest.until) }) }),
          h('button', { type: 'button', class: 'button button--system', text: texts.open, onClick: (event) => withButton(event.currentTarget, () => claim(chest.week)) }),
        ),
      ),
    );
  }

  // The best of the boss by damage, folded under the number of those who
  // hit the boss; a tap on a name opens its character card (profile.js);
  // the character's own place under them when it is not among them.
  function topPart() {
    const { top, own, fighters, texts } = view;
    if (top.length === 0) return [h('h3', { class: 'guild-beast-subtitle', text: texts.top }), h('p', { class: 'muted', text: texts.noHits })];
    const inTop = top.some((entry) => entry.own);
    return foldPart(
      { key: 'world-boss-top', title: texts.top, line: filled(texts.topLine, { count: formatNumber(fighters) }), open: true },
      h(
        'ol',
        { class: 'guild-beast-ranking world-boss-ranking' },
        top.map((entry) =>
          h(
            'li',
            { class: `guild-beast-row world-boss-row${entry.own ? ' guild-beast-row--own' : ''}` },
            h(
              'span',
              { class: 'guild-beast-row-name' },
              h('span', { class: 'world-boss-place', text: `${entry.place}.` }),
              icon(CLASS_ICONS[entry.classId] ?? 'person', { size: 14, className: 'chat-class' }),
              h('button', {
                type: 'button',
                class: 'chat-name guild-beast-ally',
                text: entry.name,
                'aria-label': t('{name}: zobacz postać', { name: entry.name }),
                onClick: (event) => withButton(event.currentTarget, () => openProfile(entry.name)),
              }),
            ),
            h('span', { class: 'guild-beast-row-damage', text: `${formatNumber(entry.damage)} HP` }),
          ),
        ),
      ),
      own && !inTop && h('p', { class: 'world-boss-you', text: filled(texts.you, { place: formatNumber(own.place), damage: formatNumber(own.damage) }) }),
    );
  }

  function render() {
    if (!view) return;
    const { texts } = view;
    card.hidden = false;
    // The boss's cry decoded ahead of its fight, so it plays as the fight opens.
    preloadVoices([view.boss.sound]);
    fill(
      card,
      h('h2', { class: 'card-title', id: 'world-boss-title' }, icon('swords', { size: 22 }), texts.title),
      howItWorks(texts.lead, texts.rules),
      headPart(),
      fightPart(),
      lastPart(),
      ownPart(),
      chestsPart(),
      topPart(),
    );
  }

  // Shown from the unlock on: asked the first time the character has it
  // (a new level on the screen too).
  function check() {
    if (gone || !state.character) return;
    const open = isUnlocked('world-boss');
    if (!open) {
      card.hidden = true;
      return;
    }
    if (!asked) refresh();
  }
  const unsubscribe = onCharacterChange(check);
  check();

  card.stop = () => {
    gone = true;
    unsubscribe();
  };
  return card;
}

// The Postrach Krainy's tab of the Walka (#/postrach, 24.11.2026; the
// author: „Postrach Krainy i Kultywacja powinny byc osobnymi zakładkami w
// Walce”): the Walka's heading and its switch (combat-modes.js), as over
// the Portale and the Wieże, then the card, "Wczytywanie…" in its place
// until the boss comes; below its unlock, the words of the lock.
export function mountWorldBoss(container, { navigate }) {
  let card = null;
  const heading = () => [h('div', { class: 'page-heading' }, h('h1', { class: 'page-title', tabindex: '-1', text: t('Walka') })), combatModes('world-boss', navigate)];

  function render() {
    if (!isUnlocked('world-boss')) {
      const unlock = unlockInfo('world-boss');
      fill(container, ...heading(), systemPanel(t('Dostęp zablokowany. {name}: od poziomu postaci {level}. Twój poziom: {own}.', { name: unlock?.name ?? t('Postrach Krainy'), level: unlock?.level ?? '', own: state.character.level })));
      return;
    }
    // Each answer shown draws the switch anew, with its dot for the chests.
    card ??= worldBossCard({ onView: render });
    fill(container, ...heading(), card.hidden && h('p', { class: 'muted', text: t('Wczytywanie…') }), card);
  }

  render();
  return {
    update: render,
    unmount: () => card?.stop(),
  };
}
