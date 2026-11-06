// A companion's card (questions 104–113), shared by the Karczma, where the
// candidates wait for the werbunek, and the camp's Kwatery, where the hired
// companions live (the author: "Po zwerbowaniu postac powinna zniknąć z
// Karczmy i pojawić się w Kwaterach - stamtąd ewentualne Odprawy, więcej
// info o postaci [...] zmiana wyposażenia"): class, level, numbers, traits,
// skills, gear and story, its gift of the week and wounds, with what can be
// done with it. `apply` takes an action's answer (the Osada after it).

import { companionBust } from './art.js';
import { h } from './dom.js';
import { formatCountdown, formatDecimal, formatNumber } from './format.js';
import { t } from './i18n.js';
import { call, serverNow, state } from './state.js';
import { closeSheet, confirmAction, openSheet, toast, withButton } from './ui.js';
import { anvilSection, compareTable, itemDetails, itemSummary } from './screens/character.js';

// An item of the character's, from the bag or worn.
const itemView = (id) => (state.character.bag ?? []).find((one) => one.id === id) ?? Object.values(state.character.equipment ?? {}).find((one) => one?.id === id);

// A companion's gift of the week from its profession (question 112 A),
// into the bag, also while the character is away.
function giftRow(companion, apply) {
  const { gift } = companion;
  return h(
    'div',
    { class: 'settlement-choice' },
    h('p', { class: 'muted', text: t('Prezent tygodnia z profesji: {count} × {name}.', { count: gift.count, name: gift.name }) }),
    h('button', {
      type: 'button',
      class: 'button button--world button--small',
      text: t('Odbierz prezent'),
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          const answer = await call('POST', '/api/settlement/gift', { companionId: companion.id });
          apply(answer);
          toast(t('Odebrano: {count} × {name}.', { count: answer.gift.count, name: answer.gift.name }));
        }),
    }),
  );
}

// The bag's items the companion can wear, each with its numbers in sight
// (a player on the chat: "fajnie jakby podświetlało staty przedmiotów, bo
// tak to się trochę na ślepo strzela, jak mam np. 3 amulety te same"); a tap
// folds out the comparison with what the companion wears in that place and
// "Załóż". What it wore there goes back to the bag.
function wearSheet(companion, apply) {
  const items = companion.wearable.map((id) => itemView(id)).filter(Boolean);
  const put = (item) => (event) =>
    withButton(event.currentTarget, async () => {
      apply(await call('POST', '/api/settlement/equip', { companionId: companion.id, itemId: item.id }));
      closeSheet();
      toast(t('{name} nosi teraz: {item}.', { name: companion.name, item: item.name }));
    });
  openSheet(
    h('h2', { class: 'sheet-title', text: t('Sprzęt: {name}', { name: companion.name }) }),
    items.length === 0
      ? h('p', {
          class: 'sheet-text',
          text: t('W plecaku nie ma nic, co ten towarzysz może założyć na swój poziom: broni ani pancerza swojej klasy, ani biżuterii (amuletu, pierścienia albo talizmanu).'),
        })
      : [
          h('p', {
            class: 'sheet-text',
            text:
              companion.appearance === 'female'
                ? t('Stuknij przedmiot, żeby porównać go z tym, co nosi, i założyć. To, co towarzyszka nosiła w tym miejscu, wróci do plecaka, a przy odprawie odda wszystko, co od Ciebie dostała. Biżuterię nosi jedną: amulet, pierścień albo talizman.')
                : t('Stuknij przedmiot, żeby porównać go z tym, co nosi, i założyć. To, co towarzysz nosił w tym miejscu, wróci do plecaka, a przy odprawie odda wszystko, co od Ciebie dostał. Biżuterię nosi jedną: amulet, pierścień albo talizman.'),
          }),
          h(
            'ul',
            { class: 'item-list' },
            items.map((item) => h('li', {}, wearChoice(companion, item, put(item)))),
          ),
        ],
  );
}

// One item of the bag in "Załóż z plecaka": its name and numbers; under a
// tap, beside what the companion wears in its place (its weapon, its armour,
// or its one piece of jewellery for an amulet, a ring or a talisman), and the
// button that puts it on.
function wearChoice(companion, item, put) {
  const place = companion.wear.find((one) => one.slot === item.slot) ?? companion.wear.find((one) => one.slot === 'jewelry');
  const worn = place?.item ?? null;
  return h(
    'details',
    { class: 'wear-choice' },
    h('summary', {}, h('span', { class: 'item-row wear-choice-row' }, itemSummary(item, { stats: true }), h('span', { class: 'wear-choice-mark', 'aria-hidden': 'true' }))),
    h(
      'div',
      { class: 'wear-choice-body' },
      worn
        ? compareTable(item, worn, { title: t('Porównanie z tym, co nosi {name}', { name: companion.name }), wornLabel: t('Nosi') })
        : h('p', { class: 'muted', text: t('W tym miejscu {name} nic teraz nie nosi.', { name: companion.name }) }),
      h('button', { type: 'button', class: 'button button--system', text: t('Załóż'), onClick: put }),
    ),
  );
}

// The card of an item a hired companion wears, as the card of the
// character's own (screens/character.js), with the same Kowadło (the
// author: "niech tu będzie opcja kliknięcia w przedmiot i ulepszania go jak
// na Kowadle"): the character pays from its own stock, and only the
// companion's item changes. While the companion is away on an exploration
// the try waits, as "Załóż z plecaka" does. A try names the item's last one
// as the card shows it (`roll`), so a second tap makes none. After a try
// the card opens again with the Kowadło unfolded, or closes when the item
// broke; when the item changed meanwhile, the Kwatery load it anew.
function companionItemSheet(companion, slot, apply, anvil = false) {
  const item = companion.wear.find((place) => place.slot === slot)?.item;
  if (!item) {
    closeSheet();
    return;
  }
  const send = async (choices) => {
    try {
      const answer = await call('POST', '/api/settlement/companion-upgrade', { companionId: companion.id, slot, roll: item.roll, ...choices });
      apply(answer);
      return answer;
    } catch (error) {
      if (error.status === 409) call('GET', '/api/settlement').then(apply, () => {});
      throw error;
    }
  };
  const reopen = (done, answer) => {
    const after = answer.settlement?.companions.hired.find((one) => one.id === companion.id);
    if (after) companionItemSheet(after, slot, apply, true);
    else closeSheet();
  };
  openSheet(
    itemDetails(item),
    h('p', { class: 'muted', text: companion.wornBy }),
    anvilSection(item, Boolean(companion.away), anvil, { send, reopen }),
    companion.away && h('p', { class: 'muted', text: companion.away }),
  );
}

// What a companion wears in its three places (jewellery is one: an
// amulet, a ring or a talisman); one hired has a button to
// put on an item from the bag (question 108 A), at home or at a profession's
// work, as the character's own equipment (an exploration keeps what it set
// out with, so one away on it waits for its return), and each item it wears
// opens its card under a tap; a candidate only shows what it comes with.
function wearList(companion, apply) {
  const hired = Boolean(companion.wearable);
  return h(
    'div',
    { class: 'settlement-companion-wear' },
    companion.wear.map((place) =>
      h(
        'div',
        { class: 'settlement-companion-slot' },
        h('span', { class: 'field-label', text: place.slotName }),
        !place.item
          ? h('span', { class: 'muted', text: t('Pusto') })
          : hired
            ? h('button', { type: 'button', class: 'item-row', onClick: () => companionItemSheet(companion, place.slot, apply) }, itemSummary(place.item))
            : itemSummary(place.item),
      ),
    ),
    hired && h('button', { type: 'button', class: 'button button--small', text: t('Załóż z plecaka'), disabled: Boolean(companion.away), onClick: () => wearSheet(companion, apply) }),
    hired && companion.away && h('p', { class: 'muted', text: companion.away }),
  );
}

// Whether the companion goes on the explorations or stays in the Kwatery
// (the author: "[Zostań w kwaterze]"), and the switch: none while the
// character is in a Drużyna, where every companion stays, but the reason.
function stayBlock(companion, apply) {
  const { stay } = companion;
  return h(
    'div',
    { class: 'settlement-companion-stay' },
    h('p', { class: 'muted', text: stay.text }),
    stay.action &&
      h('button', {
        type: 'button',
        class: 'button button--small',
        text: stay.action.label,
        onClick: (event) =>
          withButton(event.currentTarget, async () => {
            const answer = await call('POST', '/api/settlement/companion-stay', { companionId: companion.id, stays: stay.action.stays });
            apply(answer);
            toast(answer.text);
          }),
      }),
  );
}

// The relation with a hired companion (296 A) and what it told in talks
// (295 A): its standing, its bonus in a fight, the points to the next
// standing, and the pieces of its story, folded.
function bondBlock(bond) {
  const parts = [t('Relacja: {standing}', { standing: bond.standing })];
  if (bond.bonus > 0) parts.push(t('w walce +{bonus}% obrażeń i HP', { bonus: formatDecimal(bond.bonus * 100) }));
  // The points grow by fractions of a point (341 A): the rest rounded up.
  if (bond.next) parts.push(t('do stopnia {name}: {points} pkt', { name: bond.next.name, points: formatNumber(Math.ceil(bond.next.points - bond.points)) }));
  return h(
    'div',
    { class: 'settlement-companion-bond' },
    h('p', { class: 'muted', text: `${parts.join(' · ')}.` }),
    bond.told.length > 0 &&
      h(
        'details',
        { class: 'settlement-companion-talks' },
        h('summary', { text: t('Z rozmów ({count})', { count: bond.told.length }) }),
        h('ul', {}, bond.told.map((piece) => h('li', { text: t('„{line}”', { line: piece }) }))),
      ),
  );
}

export function companionCard(companion, action, apply) {
  // Its wounds heal with the character's rest (the author: "Niech rany
  // towarzyszy goją się wraz z ranami postaci"): a sentence for each form
  // and case (t()), one English for both forms.
  const female = companion.appearance === 'female';
  const healsIn = companion.healsAt ? { time: formatCountdown(companion.healsAt - serverNow()) } : null;
  const wounded = !companion.wounded
    ? null
    : healsIn
      ? female
        ? t('Ranna. Wróci do sił, gdy postać odpocznie do pełna HP (jeszcze {time}).', healsIn)
        : t('Ranny. Wróci do sił, gdy postać odpocznie do pełna HP (jeszcze {time}).', healsIn)
      : female
        ? t('Ranna. Wróci do sił, gdy postać po wyprawie odpocznie do pełna HP.')
        : t('Ranny. Wróci do sił, gdy postać po wyprawie odpocznie do pełna HP.');
  // Its own face (question 107 B) beside who it is, as a resident's.
  const bust = companionBust(companion.classId, companion.appearance);
  return h(
    'article',
    { class: 'card settlement-companion' },
    h(
      'div',
      { class: 'settlement-resident-head' },
      bust && h('span', { class: 'settlement-resident-bust' }, bust),
      h(
        'div',
        {},
        h('p', { class: 'settlement-resident-name', text: t('{name}, {className}, poz. {level}', { name: companion.name, className: companion.className, level: companion.level }) }),
        h('p', {
          class: 'muted',
          text: `${t('HP {hp} · pancerz {armor}', { hp: formatNumber(companion.maxHp), armor: formatNumber(companion.armor) })}${companion.profession ? ` · ${companion.profession}` : ''}`,
        }),
        h('p', { class: 'muted settlement-resident-story', text: companion.story }),
      ),
    ),
    h(
      'ul',
      { class: 'settlement-companion-list' },
      companion.traits.map((trait) => h('li', {}, h('strong', { text: trait.name }), `: ${trait.text}`)),
      companion.skills.map((skill) =>
        h('li', { text: skill.level > 0 ? t('{name}, poz. {level}', { name: skill.name, level: skill.level }) : t('{name}, jeszcze nie umie', { name: skill.name }) }),
      ),
      !companion.wear && h('li', { class: 'muted', text: t('Sprzęt: {gear}', { gear: companion.gear.join(', ') }) }),
    ),
    companion.bond && bondBlock(companion.bond),
    companion.wear && wearList(companion, apply),
    companion.gift && giftRow(companion, apply),
    wounded && h('p', { class: 'region-warning', text: wounded }),
    companion.stay && stayBlock(companion, apply),
    action,
  );
}

// "Odpraw": the companion leaves for good, giving back what it got from the
// bag; asked first.
export const dismissButton = (companion, apply) =>
  h('button', {
    type: 'button',
    class: 'button button--small',
    text: t('Odpraw'),
    onClick: async (event) => {
      const button = event.currentTarget;
      const given = companion.wear.some((place) => place.item?.given);
      // A sentence for each case and form (t()), one English for both forms.
      const name = { name: companion.name };
      const text = !given
        ? t('{name} odejdzie na dobre.', name)
        : companion.appearance === 'female'
          ? t('{name} odejdzie na dobre i odda wszystko, co od Ciebie dostała.', name)
          : t('{name} odejdzie na dobre i odda wszystko, co od Ciebie dostał.', name);
      if (!(await confirmAction({ title: t('Odprawić: {name}?', name), text, confirmLabel: t('Odpraw') }))) return;
      withButton(button, async () => apply(await call('POST', '/api/settlement/dismiss', { companionId: companion.id })));
    },
  });

// What a companion said in a talk, with its face, and what it brought.
function talkSheet(companion, talk) {
  const bust = companionBust(companion.classId, companion.appearance);
  openSheet(
    h('div', { class: 'settlement-resident-head' }, bust && h('span', { class: 'settlement-resident-bust' }, bust), h('h2', { class: 'sheet-title', text: companion.name })),
    h('p', { class: 'sheet-text settlement-talk', text: t('„{line}”', { line: talk.text }) }),
    h('p', { class: 'muted', text: `${talk.story ? `${t('Nowy kawałek historii.')} ` : ''}${t('Relacja +{points} pkt.', { points: talk.points })}` }),
    h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--world', text: t('Zamknij'), onClick: closeSheet })),
  );
}

// "Porozmawiaj", once a day with each companion (295 A: "w Kwaterach
// przycisk „Porozmawiaj” raz dziennie").
const talkButton = (companion, apply) =>
  h('button', {
    type: 'button',
    class: 'button button--world button--small',
    text: t('Porozmawiaj'),
    disabled: companion.bond.talked,
    onClick: (event) =>
      withButton(event.currentTarget, async () => {
        const answer = await call('POST', '/api/settlement/talk', { companionId: companion.id });
        apply(answer);
        talkSheet(companion, answer.talk);
      }),
  });

// The camp's Kwatery: the companions who live there, each with its card,
// gear, gift and "Odpraw", and how many beds there are. It loads the Osada
// for them and redraws itself after each action; `holder` keeps it.
export function mountQuarters(holder) {
  let companions = null;
  let failure = null;
  let gone = false;
  const apply = (answer) => {
    if (answer.settlement) companions = answer.settlement.companions;
    if (!gone) render();
  };
  async function load() {
    try {
      companions = (await call('GET', '/api/settlement')).settlement.companions;
      failure = null;
    } catch (error) {
      failure = error;
    }
    if (!gone) render();
  }
  function render() {
    if (failure) {
      holder.replaceChildren(h('p', { class: 'muted', text: failure.message }));
      return;
    }
    if (!companions) {
      holder.replaceChildren(h('p', { class: 'muted', text: t('Wczytywanie towarzyszy…') }));
      return;
    }
    const { hired, places } = companions;
    holder.replaceChildren(
      h(
        'section',
        { class: 'stack' },
        h('h2', { class: 'section-title', text: t('Towarzysze: {count} z {all}', { count: hired.length, all: places }) }),
        hired.length === 0
          ? h(
              'p',
              { class: 'muted' },
              t('Nikt tu jeszcze nie mieszka. Towarzyszy zwerbujesz w '),
              h('a', { href: '#/osada/tavern/companions', text: t('Karczmie') }),
              t(' w Osadzie.'),
            )
          : hired.map((companion) =>
              companionCard(
                companion,
                [
                  h('div', { class: 'settlement-actions' }, talkButton(companion, apply), dismissButton(companion, apply)),
                  companion.bond.talked && h('p', { class: 'muted', text: t('Następna rozmowa jutro.') }),
                ],
                apply,
              ),
            ),
      ),
    );
  }
  render();
  load();
  return {
    refresh: () => {
      if (!gone) render();
    },
    unmount() {
      gone = true;
    },
  };
}
