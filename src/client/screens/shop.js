// The Sklep Systemu (src/server/cosmetics.js; DECISIONS.md, "Sklep Systemu:
// ramki, tła i tygrys szablozębny"), from the stall in the top bar: frames,
// backgrounds, auras, trails, the mount's look and pets (chowańce) for
// Punkty Systemu, in six tabs. Each shows itself on the character's own
// portrait, with what else it wears (a trail behind the character walking on
// the path, the mount's look its picture, once it has one), its words and
// its price. "Kup" asks first; what is owned has "Załóż" or "Zdejmij" in its
// place. With a frame worn, the switch "Kolor imienia jak ramka".

import { mountArt, walkerSheet } from '../art.js';
import { characterLook, portraitBox } from '../cosmetics.js';
import { fill, h, icon } from '../dom.js';
import { formatNumber } from '../format.js';
import { SYSTEM_POINTS_ICON } from '../icons.js';
import { systemPoints } from '../quests.js';
import { call, state } from '../state.js';
import { confirmAction, howItWorks, pageHeading, toast, withButton } from '../ui.js';

const HOME = '#/sklep';
const TABS = [
  { id: 'ramki', kind: 'frame', name: 'Ramki' },
  { id: 'tla', kind: 'background', name: 'Tła' },
  { id: 'aury', kind: 'aura', name: 'Aury' },
  { id: 'slady', kind: 'trail', name: 'Ślady' },
  { id: 'wierzchowiec', kind: 'mountSkin', name: 'Wierzchowiec' },
  { id: 'chowance', kind: 'pet', name: 'Chowańce' },
];

export function mountShop(container, { params }) {
  let tab = TABS.find((each) => each.id === params.tab) ?? TABS[0];

  function render() {
    const character = state.character;
    const { items, texts } = state.content.cosmetics;
    fill(
      container,
      pageHeading('Sklep Systemu'),
      h(
        'p',
        { class: 'shop-points' },
        icon(SYSTEM_POINTS_ICON, { size: 20 }),
        h('span', { text: 'Punkty Systemu:' }),
        h('strong', { text: formatNumber(character.systemPoints) }),
      ),
      howItWorks(texts.lead, texts.rules),
      h('div', { class: 'segmented shop-tabs', role: 'group', 'aria-label': 'Działy Sklepu Systemu' }, TABS.map(tabButton)),
      tab.kind === 'frame' && character.cosmetics.frame && nameSwitch(character),
      h(
        'ul',
        { class: 'shop-items' },
        items.filter((item) => item.kind === tab.kind).map((item) => card(item, character)),
      ),
    );
  }

  // The tab changes here; the address keeps it for a reload.
  const tabButton = (each) =>
    h('button', {
      type: 'button',
      class: 'segmented-option',
      'aria-pressed': each === tab,
      text: each.name,
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
        h('h2', { class: 'shop-item-name' }, item.name, worn && [' ', h('span', { class: 'chip chip--success', text: 'W użyciu' })]),
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
    return portraitBox(characterLook(character), { frame, background, aura, pet, [item.kind]: item.id }, 'shop-preview');
  }

  // A trail as the Walka scene shows it: the character on a bit of the path,
  // still, with its footprints glowing behind it, fainter the further.
  function trailPreview(item, character) {
    const sheet = walkerSheet(character.classId, character.appearance, character.skin, character.evolution?.current?.id);
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
        text: worn ? 'Zdejmij' : 'Załóż',
        onClick: (event) => withButton(event.currentTarget, () => wear(item, worn ? null : item.id)),
      });
    }
    const noMount = item.kind === 'mountSkin' && !character.mount;
    const short = item.price - character.systemPoints;
    return h('button', {
      type: 'button',
      class: 'button button--system button--small',
      text: noMount ? 'Najpierw kup wierzchowca w Stajni' : short > 0 ? `Brakuje ${formatNumber(short)} PS` : `Kup (${formatNumber(item.price)} PS)`,
      disabled: noMount || short > 0,
      onClick: (event) => buy(event.currentTarget, item),
    });
  }

  async function buy(button, item) {
    const sure = await confirmAction({
      title: 'Kupić przedmiot?',
      text: `${item.name} za ${systemPoints(item.price)}. Przedmiot zostanie przy tej postaci na stałe.`,
      confirmLabel: 'Kup',
    });
    if (!sure) return;
    await withButton(button, async () => {
      await call('POST', '/api/cosmetics/buy', { id: item.id });
      toast(`Kupiono: ${item.name}.`);
    });
  }

  async function wear(item, id) {
    await call('POST', '/api/cosmetics/wear', { kind: item.kind, id });
    toast(id ? `Założono: ${item.name}.` : `Zdjęto: ${item.name}.`);
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
      text: on ? 'Włączony' : 'Wyłączony',
      onClick: () => withButton(button, () => call('POST', '/api/cosmetics/name-color', { on: !on })),
    });
    return h('div', { class: 'shop-switch' }, h('span', { id: 'shop-name-label', text: 'Kolor imienia jak ramka' }), button);
  }

  render();
  return { update: render };
}
