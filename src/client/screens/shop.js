// The Sklep Systemu (src/server/cosmetics.js; DECISIONS.md, "Sklep Systemu:
// ramki, tła i tygrys szablozębny"), from the stall in the top bar: frames,
// backgrounds, auras, trails, the mount's look and pets (chowańce) for
// Punkty Systemu, in six tabs, and a seventh, Skórki, for a class with an
// outfit (763 A), across the row under them. Each shows itself on the
// character's own
// portrait, with what else it wears (a trail behind the character walking on
// the path, the mount's look its picture, once it has one), its words and
// its price. "Kup" asks first; what is owned has "Załóż" or "Zdejmij" in its
// place. With a frame worn, the switch "Kolor imienia jak ramka". Where the
// account can buy Punkty Systemu (the server's payments answer), "Kup Punkty
// Systemu" by the points opens their page, #/sklep/punkty (shop-points.js).

import { mountArt, walkerSheet } from '../art.js';
import { characterLook, portraitBox } from '../cosmetics.js';
import { fill, h, icon } from '../dom.js';
import { formatNumber } from '../format.js';
import { t } from '../i18n.js';
import { SYSTEM_POINTS_ICON } from '../icons.js';
import { playBilling } from '../play-billing.js';
import { systemPoints } from '../quests.js';
import { call, state } from '../state.js';
import { confirmAction, howItWorks, pageHeading, toast, withButton } from '../ui.js';
import { mountShopPoints } from './shop-points.js';

const HOME = '#/sklep';
// The tabs, their names shown in the page's language (t()).
const TABS = [
  { id: 'ramki', kind: 'frame', name: 'Ramki' },
  { id: 'tla', kind: 'background', name: 'Tła' },
  { id: 'aury', kind: 'aura', name: 'Aury' },
  { id: 'slady', kind: 'trail', name: 'Ślady' },
  { id: 'wierzchowiec', kind: 'mountSkin', name: 'Wierzchowiec' },
  { id: 'chowance', kind: 'pet', name: 'Chowańce' },
  { id: 'skorki', kind: 'outfit', name: 'Skórki' },
];

// An item the character can wear: an outfit only for its own class.
const forCharacter = (item, character) => item.kind !== 'outfit' || item.classId === character.classId;

// Whether this account can buy Punkty Systemu here, asked once a page load:
// null until the server answers.
let paymentsOpen = null;

export function mountShop(container, { params }) {
  if (params.tab === 'punkty') return mountShopPoints(container);
  let tab = TABS.find((each) => each.id === params.tab) ?? TABS[0];
  if (paymentsOpen === null) {
    // Through Google Play only in the app from the Sklep Play (867 A): a
    // browser has nothing to buy with (play-billing.js).
    call('GET', '/api/payments')
      .then(async (shop) => shop.provider !== 'google-play' || (await playBilling()) !== null, () => false)
      .then((open) => {
        paymentsOpen = open;
        if (open && container.isConnected) render();
      });
  }

  function render() {
    const character = state.character;
    const { items, texts } = state.content.cosmetics;
    // The tabs with something for the character: Skórki only for a class
    // with an outfit.
    const tabs = TABS.filter((each) => items.some((item) => item.kind === each.kind && forCharacter(item, character)));
    if (!tabs.includes(tab)) tab = TABS[0];
    fill(
      container,
      pageHeading(t('Sklep Systemu')),
      h(
        'p',
        { class: 'shop-points' },
        icon(SYSTEM_POINTS_ICON, { size: 20 }),
        h('span', { text: t('Punkty Systemu:') }),
        h('strong', { text: formatNumber(character.systemPoints) }),
      ),
      paymentsOpen && h('a', { class: 'button button--system shop-buy-points', href: '#/sklep/punkty' }, icon(SYSTEM_POINTS_ICON, { size: 18 }), h('span', { text: t('Kup Punkty Systemu') })),
      howItWorks(texts.lead, texts.rules),
      h('div', { class: 'segmented shop-tabs', role: 'group', 'aria-label': t('Działy Sklepu Systemu') }, tabs.map(tabButton)),
      tab.kind === 'frame' && character.cosmetics.frame && nameSwitch(character),
      h(
        'ul',
        { class: 'shop-items' },
        items.filter((item) => item.kind === tab.kind && forCharacter(item, character)).map((item) => card(item, character)),
      ),
    );
  }

  // The tab changes here; the address keeps it for a reload.
  const tabButton = (each) =>
    h('button', {
      type: 'button',
      class: 'segmented-option',
      'aria-pressed': each === tab,
      text: t(each.name),
      onClick: () => {
        tab = each;
        history.replaceState(history.state, '', each === TABS[0] ? HOME : `${HOME}/${each.id}`);
        render();
      },
    });

  function card(item, character) {
    const { cosmetics } = character;
    const owned = cosmetics.owned.includes(item.id);
    const worn = cosmetics[item.kind] === item.id;
    return h(
      'li',
      { class: ['card', 'shop-item', item.kind === 'mountSkin' && 'shop-item--mount', worn && 'shop-item--worn'].filter(Boolean).join(' ') },
      preview(item, character),
      h(
        'div',
        { class: 'shop-item-text' },
        h('h2', { class: 'shop-item-name' }, item.name, worn && [' ', h('span', { class: 'chip chip--success', text: t('W użyciu') })]),
        h('p', { class: 'muted', text: item.description }),
        !owned && h('p', { class: 'shop-price' }, icon(SYSTEM_POINTS_ICON, { size: 16 }), systemPoints(item.price)),
        action(item, character, { owned, worn }),
      ),
    );
  }

  // The item on the character's own portrait, with the frame, the
  // background, the aura and the pet it wears besides; a trail behind the
  // character on the path; the mount's look as its picture, or none while it
  // has none.
  function preview(item, character) {
    if (item.kind === 'mountSkin') return mountArt(item.art);
    if (item.kind === 'trail') return trailPreview(item, character);
    const { frame, background, aura, pet } = character.cosmetics;
    // An outfit on the character itself, in its skin tone and evolution.
    if (item.kind === 'outfit') return portraitBox({ ...characterLook(character), outfit: item.id }, { frame, background, aura, pet }, 'shop-preview');
    return portraitBox(characterLook(character), { frame, background, aura, pet, [item.kind]: item.id }, 'shop-preview');
  }

  // A trail as the Walka scene shows it: the character on a bit of the path,
  // still, with its footprints glowing behind it, fainter the further.
  function trailPreview(item, character) {
    const sheet = walkerSheet(character.classId, character.appearance, character.skin, character.evolution?.current?.id, character.cosmetics?.outfit);
    const box = h('div', { class: 'shop-trail', 'aria-hidden': 'true' });
    box.style.setProperty('--trail', item.trail.color);
    box.style.setProperty('--path', `url("/${state.content.animations.walk.path}")`);
    for (let index = 0; index < 4; index += 1) {
      const print = h('span', { class: `shop-trail-step${index % 2 ? ' shop-trail-step--far' : ''}` });
      print.style.left = `${46 - index * 12}%`;
      print.style.opacity = String(1 - index * 0.22);
      box.append(print);
    }
    if (sheet) box.append(h('span', { class: 'shop-trail-walker', style: { backgroundImage: `url("/${sheet}")` } }));
    return box;
  }

  // "Kup" for its price, or what is missing; "Załóż" and "Zdejmij" once owned.
  function action(item, character, { owned, worn }) {
    if (owned) {
      return h('button', {
        type: 'button',
        class: `button button--small ${worn ? 'button--world' : 'button--system'}`,
        text: worn ? t('Zdejmij') : t('Załóż'),
        onClick: (event) => withButton(event.currentTarget, () => wear(item, worn ? null : item.id)),
      });
    }
    const noMount = item.kind === 'mountSkin' && !character.mount;
    const short = item.price - character.systemPoints;
    return h('button', {
      type: 'button',
      class: 'button button--system button--small',
      text: noMount
        ? t('Najpierw kup wierzchowca w Stajni')
        : short > 0
          ? t('Brakuje {count} PS', { count: formatNumber(short) })
          : t('Kup ({price} PS)', { price: formatNumber(item.price) }),
      disabled: noMount || short > 0,
      onClick: (event) => buy(event.currentTarget, item),
    });
  }

  async function buy(button, item) {
    const sure = await confirmAction({
      title: t('Kupić przedmiot?'),
      text: t('{name} za {price}. Przedmiot zostanie przy tej postaci na stałe.', { name: item.name, price: systemPoints(item.price) }),
      confirmLabel: t('Kup'),
    });
    if (!sure) return;
    await withButton(button, async () => {
      await call('POST', '/api/cosmetics/buy', { id: item.id });
      toast(t('Kupiono: {name}.', { name: item.name }));
    });
  }

  async function wear(item, id) {
    await call('POST', '/api/cosmetics/wear', { kind: item.kind, id });
    toast(id ? t('Założono: {name}.', { name: item.name }) : t('Zdjęto: {name}.', { name: item.name }));
  }

  // The name in the frame's colour, or in its own (the author: "opcja zmiany
  // wyświetlanego koloru na czacie na ten z ramki").
  function nameSwitch(character) {
    const on = character.cosmetics.nameFromFrame;
    const button = h('button', {
      type: 'button',
      class: 'toggle',
      role: 'switch',
      'aria-checked': on,
      'aria-labelledby': 'shop-name-label',
      text: on ? t('Włączony') : t('Wyłączony'),
      onClick: () => withButton(button, () => call('POST', '/api/cosmetics/name-color', { on: !on })),
    });
    return h('div', { class: 'shop-switch' }, h('span', { id: 'shop-name-label', text: t('Kolor imienia jak ramka') }), button);
  }

  render();
  return { update: render };
}
