// The potions and the meal of an exploration's "Opcje wyprawy" on the Walka
// (screens/combat.js): what the character takes along and what it eats as
// it sets out, each choice remembered in this browser. "Wyrusz ponownie" on
// a report (screens/report.js) sends them as the place's screen would, with
// what this browser remembers (keptSupplies; gracz (poz. 202), 26.11.2026:
// „Jak jesteś liderem drużyny i klikasz powtórz wyprawę, to nie dodaje z
// automatu jedzenia”). Its texts are written in Polish and shown in the
// page's language (t(), i18n.js).

import { dishSprite, potionSprite } from './art.js';
import { h, icon } from './dom.js';
import { formatMinutes } from './format.js';
import { t } from './i18n.js';
import { askMealSwap } from './meal.js';

// The potions to take along and the healing mark: { potions: { [id]: count },
// picks: { heal, mana }, strengths: { heal, mana }, counts: { heal, mana },
// healBelow } (picks, their strengths and counts since 959, for the kinds
// chosen from a list).
const POTION_KEY = 'wzrost.potion-choice';
// The dish last chosen to eat as an exploration sets out (mealPicker).
const MEAL_KEY = 'wzrost.meal-choice';
// And how many portions of it at once, when fewer than the most were last
// chosen (mealPicker, 24.11.2026); none for the most.
const MEAL_PORTIONS_KEY = 'wzrost.meal-portions';
// The kinds of potions taken as one choice from a list (959 B), with the
// name of the row.
const POTION_GROUPS = { heal: 'Leczenie', mana: 'Mana' };

function loadChoice(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? {};
  } catch {
    return {};
  }
}

function saveChoice(choice, key) {
  try {
    localStorage.setItem(key, JSON.stringify(choice));
  } catch {
    // Without storage the page simply forgets the last choice.
  }
}

// The fights of an exploration of `minutes`, and so the most potions of a
// kind it takes along (potionsPerKind in the engine).
const fightsFor = (use, minutes) => use.fightsByMinutes.filter(([from]) => from <= minutes).at(-1)?.[1] ?? 1;

// The two choices of a character's "Opcje wyprawy", each null where it has
// nothing to choose: the potions it carries that work in fights
// (potionPicker; one it may not use yet stays home: above its level, with
// its recipe unknown, 1272), and the dishes of its Spiżarnia (mealPicker).
// `onChange()` after a change of the potions, for the threat.
export function supplyPickers(character, onChange) {
  const use = character.professions?.potionUse;
  const carried = use ? (character.potions ?? []).filter((potion) => potion.fight && potion.usable) : [];
  return { potions: carried.length > 0 ? potionPicker(carried, use, onChange) : null, meal: mealPicker(character) };
}

// What "Wyrusz" sends of them: the potions taken along with the healing
// mark, and the dish eaten with its portions and the meal at work it
// replaces.
export function suppliesSent({ potions, meal }) {
  return {
    ...(potions && { potions: potions.taken(), healBelow: potions.below() }),
    ...(meal?.chosen() && { meal: meal.chosen(), mealPortions: meal.portions(), mealReplaces: meal.replaces() }),
  };
}

// The same for an exploration of `minutes` as the place's screen would send
// them before any tap, from what this browser remembers: "Wyrusz ponownie"
// on a report, alone or with a Drużyna, takes the potions and eats the meal
// "Wyrusz" would (a meal at work goes on, never replaced without asking).
export function keptSupplies(character, minutes) {
  const pickers = supplyPickers(character);
  pickers.potions?.update(minutes);
  return suppliesSent(pickers);
}

// The meal (cooking.js; 999.5 v2): a dish of the Spiżarnia to eat as the
// character sets out, or none, the last choice remembered in this
// browser; its bonus works for 4 hours of explorations. With a meal at
// work, the other dishes too (the author, 20.11.2026: „może dam opcję
// zjedzenia innego posiłku i zmarnowania poprzedniego bonusu”): the
// choice starts at keeping it, and another dish first asks, as the meal
// at work would end with its bonus lost (hunts.js, mealAtStart).
// Up to 3 portions of one dish at once (the author, 20.11.2026:
// „maksymalnie do 3 potraw jednego rodzaju na raz (i analogicznie dodane
// 3x procenty danej potrawy)”): how many to eat now with −/+, as many as
// the Spiżarnia has and the meal has room for, the meal at work's own
// dish on top of its portions; the line shows the meal they make. A dish
// picked starts at the most of them, or at as many as the player last
// chose, remembered beside the dish (the author, 24.11.2026:
// „Automatyczne jedzenie w drużynie i w ogóle trzeba ustawić tak mogło
// jeść 3 te same posiłki na raz nie tylko jeden”).
// { element, chosen(): the dish's id or null, portions(): how many of it,
// replaces(): the meal at work, { dish, portions }, or null }, or null.
function mealPicker(character) {
  const current = character.meal ?? null;
  // The portions of a dish the meal at work already has, and how many
  // more of it can be eaten now (`stacks`: its meals, one to the most).
  const had = (dish) => (dish && dish.id === current?.id ? current.portions : 0);
  const room = (dish) => (dish ? Math.min(dish.count, dish.stacks.length - had(dish)) : 0);
  const dishes = (character.pantry ?? []).filter((good) => good.group === 'dish' && room(good) > 0);
  if (dishes.length === 0) return null;
  // The most portions of one dish at once (cooking.meal.portions).
  const atOnce = dishes[0].stacks.length;
  let stored = null;
  let storedPortions = 0;
  try {
    stored = localStorage.getItem(MEAL_KEY);
    storedPortions = Number(localStorage.getItem(MEAL_PORTIONS_KEY));
  } catch {
    // Without storage nothing is remembered.
  }
  // How many portions a dish picked starts at: as many as last chosen,
  // the most without a choice, then as many as there is room for (show).
  let wanted = Number.isInteger(storedPortions) && storedPortions >= 1 && storedPortions < atOnce ? storedPortions : atOnce;
  let picked = current ? null : (dishes.find((dish) => dish.id === stored) ?? null);
  let portions = wanted;
  // The meal a dish makes with `count` portions eaten now: its name and bonus.
  const made = (dish, count) => dish.stacks[Math.min(dish.stacks.length, had(dish) + count) - 1];
  const art = (dish) => ((dish ?? current) && dishSprite((dish ?? current).id)) ?? icon('pot', { size: 24 });
  // The meal's name over its bonuses and how many dishes there are, which
  // wrap; without one, the meal at work with its time left, or none.
  const name = (dish, count) =>
    dish
      ? `${made(dish, count).name} · ${t('masz {count}', { count: dish.count })}`
      : current
        ? `${t('Posiłek: {dish}', { dish: current.name })} · ${t('jeszcze {time} wypraw', { time: formatMinutes(current.left) })}`
        : t('Bez posiłku');
  const line = (dish, count = 1) => [
    h('span', { class: 'potion-pick-art' }, art(dish)),
    h(
      'span',
      { class: 'meal-kind-text' },
      h('span', { class: 'potion-kind-name', text: name(dish, count) }),
      h('span', { class: 'potion-kind-meta cook-bonus', text: dish ? made(dish, count).bonus : (current?.bonus ?? t('bez premii')) }),
    ),
  ];
  // How many portions of the dish picked, once more than one can be eaten.
  // The choice made with no meal at work is the one remembered, as the
  // dish: all there is room for counts as the most, for when the
  // Spiżarnia has more again.
  const step = (sign) => {
    portions = Math.max(1, Math.min(room(picked), portions + sign));
    if (!current) {
      wanted = portions >= room(picked) ? atOnce : portions;
      try {
        if (wanted < atOnce) localStorage.setItem(MEAL_PORTIONS_KEY, String(wanted));
        else localStorage.removeItem(MEAL_PORTIONS_KEY);
      } catch {
        // Without storage nothing is remembered.
      }
    }
    show();
  };
  const less = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': t('{name}: mniej', { name: t('Porcje') }), text: '−', onClick: () => step(-1) });
  const more = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': t('{name}: więcej', { name: t('Porcje') }), text: '+', onClick: () => step(1) });
  const value = h('output', { class: 'potion-pick-value' });
  const portionsRow = h('div', { class: 'potion-pick', hidden: true }, h('span', { class: 'potion-pick-name', text: t('Porcje') }), less, value, more);
  const shown = h('span', { class: 'potion-kind-current' });
  const options = h('ul', { class: 'potion-kind-options', hidden: true, role: 'listbox', 'aria-label': t('Posiłek') });
  const setOpen = (open) => {
    options.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };
  const toggle = h('button', { type: 'button', class: 'potion-kind', 'aria-expanded': 'false', 'aria-label': t('Posiłek'), onClick: () => setOpen(options.hidden) }, shown, h('span', { class: 'potion-kind-caret', 'aria-hidden': 'true', text: '▾' }));
  const show = () => {
    const most = room(picked);
    portions = Math.max(1, Math.min(portions, most));
    shown.replaceChildren(...line(picked, portions));
    portionsRow.hidden = most < 2;
    value.textContent = t('{count} z {all}', { count: portions, all: most });
    less.disabled = portions <= 1;
    more.disabled = portions >= most;
    options.replaceChildren(
      ...[null, ...dishes].map((dish) =>
        h(
          'li',
          {},
          h(
            'button',
            {
              type: 'button',
              role: 'option',
              class: 'potion-kind-option',
              'aria-selected': String((dish?.id ?? null) === (picked?.id ?? null)),
              onClick: async () => {
                setOpen(false);
                // Another dish in place of the meal at work, once the player agrees.
                if (dish && current && dish.id !== current.id && dish.id !== picked?.id && !(await askMealSwap(current, dish))) return;
                if (dish?.id !== picked?.id) portions = wanted;
                picked = dish;
                // The choice made with no meal at work is the one remembered.
                if (!current) {
                  try {
                    if (dish) localStorage.setItem(MEAL_KEY, dish.id);
                    else localStorage.removeItem(MEAL_KEY);
                  } catch {
                    // Without storage nothing is remembered.
                  }
                }
                show();
              },
            },
            // Each with the meal it makes as picked now.
            ...line(dish, dish?.id === picked?.id ? portions : Math.max(1, Math.min(wanted, room(dish)))),
          ),
        ),
      ),
    );
  };
  show();
  return {
    element: h(
      'div',
      { class: 'stack meal-picker' },
      h('p', { class: 'duration-title', text: t('Posiłek') }),
      h('div', { class: 'potion-kind-box' }, toggle, options),
      portionsRow,
      h('p', {
        class: 'muted',
        text: t('Zjedzona potrawa działa przez 4 godziny wypraw. Tej samej potrawy możesz mieć naraz do {most} porcji: premie się sumują, a każda porcja przywraca pełny czas. Inna potrawa zastępuje poprzednią, a premia poprzedniej przepada.', {
          most: atOnce,
        }),
      }),
    ),
    chosen: () => picked?.id ?? null,
    portions: () => (picked ? portions : 1),
    replaces: () => (picked && current ? { dish: current.id, portions: current.portions } : null),
  };
}

// The potions to take along, up to one for each fight of the length, and
// the healing mark, all remembered in this browser. Of healing and of mana
// the kind is picked from a list and how many with −/+, the weaker ones of
// the kind making up for what the bag lacks (959 B, the author: "biorę
// tylko jeden dostępny rodzaj lub jeśli nie mam tyle zapasów uzupełniam
// wtedy tymi słabszymi"); the cures and the revivals each with −/+ (a
// revival one at all: its `carry`).
// The wish is kept apart from what a shorter length allows, so it comes
// back with a longer one. A change is saved, then `onChange()`: the place's
// screen asks for the threat again.
function potionPicker(carried, use, onChange) {
  const stored = loadChoice(POTION_KEY);
  const wanted = { ...stored.potions };
  const picks = { ...stored.picks };
  // How strong the kind picked is, for when the bag runs out of it.
  const strengths = { ...stored.strengths };
  const counts = { ...stored.counts };
  let below = use.healBelowChoices.includes(stored.healBelow) ? stored.healBelow : use.healBelow;
  let fights = 1;
  const save = () => saveChoice({ potions: wanted, picks, strengths, counts, healBelow: below }, POTION_KEY);
  const changed = () => {
    save();
    onChange?.();
  };
  const stepper = (label, onStep) => {
    const less = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': t('{name}: mniej', { name: label }), text: '−', onClick: () => onStep(-1) });
    const more = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': t('{name}: więcej', { name: label }), text: '+', onClick: () => onStep(1) });
    return { less, more };
  };
  const art = (potion) => potionSprite(potion.id) ?? icon('flask', { size: 20 });
  // The cures and the revivals one by one, as before.
  const rows = carried
    .filter((potion) => !POTION_GROUPS[potion.fight])
    .map((potion) => {
      const limit = () => Math.min(potion.count, fights, potion.carry ?? Infinity);
      const count = () => Math.min(wanted[potion.id] ?? 0, limit());
      const value = h('output', { class: 'potion-pick-value' });
      const { less, more } = stepper(potion.name, (sign) => {
        wanted[potion.id] = Math.max(0, Math.min(limit(), count() + sign));
        show();
        changed();
      });
      const show = () => {
        value.textContent = t('{count} z {all}', { count: count(), all: limit() });
        less.disabled = count() === 0;
        more.disabled = count() >= limit();
      };
      const element = h('div', { class: 'potion-pick' }, h('span', { class: 'potion-pick-art' }, art(potion)), h('span', { class: 'potion-pick-name', text: potion.name }), less, value, more);
      return { taken: () => ({ [potion.id]: count() }), show, element };
    });
  // Healing and mana: the kind chosen from a list and how many, the weaker
  // ones of the kind making up for what the bag lacks, the strongest of
  // them first.
  const groups = Object.entries(POTION_GROUPS).flatMap(([kind, title]) => {
    const kinds = carried.filter((potion) => potion.fight === kind).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
    if (kinds.length === 0) return [];
    // A kind picked that the bag has run out of gives way to the strongest
    // of those weaker than it (the stronger ones stay home), or to the
    // weakest there is. A choice kept from the list of single potions:
    // the strongest of them wished for, and as many as all of them together.
    if (!kinds.some((potion) => potion.id === picks[kind])) {
      const weaker = Number.isFinite(strengths[kind]) ? (kinds.find((potion) => (potion.amount ?? 0) < strengths[kind]) ?? kinds.at(-1)) : null;
      picks[kind] = (weaker ?? kinds.find((potion) => (wanted[potion.id] ?? 0) > 0) ?? kinds[0]).id;
      counts[kind] ??= kinds.reduce((sum, potion) => sum + (wanted[potion.id] ?? 0), 0);
    }
    const chosen = () => kinds.find((potion) => potion.id === picks[kind]) ?? kinds[0];
    strengths[kind] = chosen().amount;
    const line = () => kinds.slice(kinds.indexOf(chosen()));
    const limit = () => Math.min(fights, line().reduce((sum, potion) => sum + potion.count, 0));
    const count = () => Math.min(counts[kind] ?? 0, limit());
    const taken = () => {
      let left = count();
      /** @type {Record<string, number>} */
      const out = {};
      for (const potion of line()) {
        const take = Math.min(left, potion.count);
        if (take > 0) out[potion.id] = take;
        left -= take;
      }
      return out;
    };
    const strength = (potion) => t(kind === 'heal' ? '+{amount}% HP' : '+{amount}% many', { amount: Math.round((potion.amount ?? 0) * 100) });
    const label = t(title);
    const headArt = h('span', { class: 'potion-pick-art' });
    const value = h('output', { class: 'potion-pick-value' });
    const { less, more } = stepper(label, (sign) => {
      counts[kind] = Math.max(0, Math.min(limit(), count() + sign));
      show();
      changed();
    });
    const note = h('p', { class: 'potion-group-note muted', hidden: true });
    const choose = (id) => {
      picks[kind] = id;
      strengths[kind] = chosen().amount;
      show();
      changed();
    };
    // The list unfolds under the row, with the potions' pictures, their
    // strength and how many the bag holds (959 B).
    const shown = h('span', { class: 'potion-kind-current' });
    const options = h('ul', { class: 'potion-kind-options', hidden: true, role: 'listbox', 'aria-label': label });
    const toggle = h('button', { type: 'button', class: 'potion-kind', 'aria-expanded': 'false', 'aria-label': t('{name}: rodzaj', { name: label }), onClick: () => setOpen(options.hidden) }, shown, h('span', { class: 'potion-kind-caret', 'aria-hidden': 'true', text: '▾' }));
    const setOpen = (open) => {
      options.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    };
    const showChooser = () => {
      const potion = chosen();
      shown.replaceChildren(
        h('span', { class: 'potion-pick-art' }, art(potion)),
        h('span', { class: 'potion-kind-name', text: potion.name }),
        h('span', { class: 'potion-kind-meta', text: `${strength(potion)} · ${t('masz {count}', { count: potion.count })}` }),
      );
      options.replaceChildren(
        ...kinds.map((one) =>
          h(
            'li',
            {},
            h(
              'button',
              {
                type: 'button',
                role: 'option',
                class: 'potion-kind-option',
                'aria-selected': String(one.id === potion.id),
                onClick: () => {
                  setOpen(false);
                  choose(one.id);
                },
              },
              h('span', { class: 'potion-pick-art' }, art(one)),
              h('span', { class: 'potion-kind-name', text: one.name }),
              h('span', { class: 'potion-kind-meta', text: `${strength(one)} · ${t('masz {count}', { count: one.count })}` }),
            ),
          ),
        ),
      );
    };
    const chooser = h('div', { class: 'potion-kind-box' }, toggle, options);
    const show = () => {
      headArt.replaceChildren(art(chosen()));
      value.textContent = t('{count} z {all}', { count: count(), all: limit() });
      less.disabled = count() === 0;
      more.disabled = count() >= limit();
      showChooser();
      const parts = Object.entries(taken());
      note.hidden = parts.length < 2;
      note.textContent = t('Weźmiesz: {potions}.', { potions: parts.map(([id, many]) => `${many} × ${kinds.find((potion) => potion.id === id)?.name}`).join(', ') });
    };
    const element = h(
      'div',
      { class: 'potion-group' },
      h('div', { class: 'potion-pick' }, headArt, h('span', { class: 'potion-pick-name potion-group-title', text: label }), less, value, more),
      chooser,
      note,
    );
    return [{ kind, taken, show, element, count }];
  });
  const heal = groups.find((group) => group.kind === 'heal');
  const manaGroup = groups.find((group) => group.kind === 'mana');
  // Jagna's burn brew (667) is named only when the character carries it:
  // until she teaches the recipe, it has never heard of it.
  const burnCure = carried.some((potion) => potion.cures === 'burning');
  const markValue = h('output', { class: 'potion-pick-value' });
  const mark = stepper(t('Próg leczenia'), (sign) => {
    const choices = use.healBelowChoices;
    below = choices[Math.max(0, Math.min(choices.length - 1, choices.indexOf(below) + sign))];
    showMark();
    changed();
  });
  const showMark = () => {
    markValue.textContent = `${Math.round(below * 100)}% HP`;
    mark.less.disabled = below === use.healBelowChoices[0];
    mark.more.disabled = below === use.healBelowChoices.at(-1);
  };
  showMark();
  const all = [...groups, ...rows];
  const element = h(
    'section',
    { class: 'potion-picks', 'aria-label': t('Mikstury na wyprawę') },
    h('p', { class: 'duration-title', text: t('Mikstury na wyprawę') }),
    heal?.element,
    heal && h('div', { class: 'potion-pick' }, h('span', { class: 'potion-pick-name', text: t('Lecz poniżej') }), mark.less, markValue, mark.more),
    groups.filter((group) => group !== heal).map((group) => group.element),
    rows.map((row) => row.element),
    h('p', {
      class: 'muted',
      text: t(
        'Każdego rodzaju najwyżej jedna na walkę, a Napar z kwiatu paproci jeden na wyprawę. Postać pije sama: leczenia poniżej progu, many, gdy zabraknie jej na umiejętność, Odtrutkę, gdy ją zatrują, {burn}a Napar, gdy padnie. Niewypite wrócą do plecaka.',
        { burn: burnCure ? t('Wywar od oparzeń, gdy ją poparzy, ') : '' },
      ),
    }),
  );
  return {
    element,
    update(minutes) {
      fights = fightsFor(use, minutes);
      for (const one of all) one.show();
    },
    taken: () => Object.fromEntries(all.flatMap((one) => Object.entries(one.taken())).filter(([, count]) => count > 0)),
    // The healing potions wished for, whatever the length: the server
    // takes one for each fight of every length.
    healing: () => heal && { count: counts.heal ?? 0, below, kind: picks.heal },
    // And the mana potions, the same way (1220 B).
    mana: () => manaGroup && { count: counts.mana ?? 0, kind: picks.mana },
    below: () => below,
  };
}
