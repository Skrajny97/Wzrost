// The Drużyna in the Społeczność (src/server/parties.js), from the character
// level of data/unlocks.json (the 10th since 0.1.69, 642 B): the
// invitations waiting for this character; its party with the
// members and their state (free, on an exploration, at a profession's
// work), the leader marked, and for the leader "Przekaż przywództwo" and
// "Usuń z drużyny" by each other member; the friends to invite at a tap and a name to invite; the
// invitations sent; and "Opuść drużynę". The leader sends the party out
// from "Wyrusz" in the Walka (screens/combat.js, "Z drużyną"); each other
// member chooses here the potions it takes along (potionsRubric).

import { potionSprite } from '../art.js';
import { partySeen } from '../chat-news.js';
import { fill, h, icon } from '../dom.js';
import { formatMinutes } from '../format.js';
import { t } from '../i18n.js';
import { CLASS_ICONS } from '../icons.js';
import { openProfile } from '../profile.js';
import { call, isUnlocked, state, unlockInfo } from '../state.js';
import { confirmAction, framedName, guildTag, howItWorks, toast, withButton } from '../ui.js';

// Who goes on the party's exploration and who stays (the author's words of
// 1.11.2026, "poziomu" for the slip "poziomem"), shown in the page's
// language (t()).
const GOERS =
  'Na wyprawę ruszają członkowie bez zajęć w trakcie, z dopasowaniem do najniższego poziomu klasy z drużyny. Kto zajmuje się profesją albo jest na solo wyprawie, zostaje w drużynie, ale nie uczestniczy we wspólnej wyprawie.';
// The companions from the Kwatery in a party: the sentence of 828 A, which
// 828 B goes like (11.11.2026), under "Jak to działa?".
const COMPANIONS_STAY = 'Póki jesteś w drużynie, towarzysze zostają w Kwaterach i nie zdobywają XP ani relacji z wypraw.';

// A member's dot (the Znajomi's colours, styles.css) and its words; the
// busy ones say it beside the name too, as they stay home when the party
// goes (screens/combat.js). The words are shown in the page's language
// (t()), here and in the Walka. Which of its player's characters is played
// does not count: since 0.4.59 one set aside goes on the party's trips too
// (src/server/parties.js), so no member is 'aside' any more.
const DOTS = { free: 'online', away: 'busy', working: 'busy' };
const STATES = { free: 'może iść na wyprawę', away: 'na wyprawie', working: 'pracuje w profesji' };
const stateText = (status) => (STATES[status] ? t(STATES[status]) : status);
export const BUSY = { away: 'na wyprawie', working: 'w profesji' };

// The class levels' spread (the author: "Rozpiętość poziomu klas w Drużynie
// maks 5 lvl", "niech nie będzie możliwości w ogole bycia w drużynie z kimś
// o rozpiętości lvli wyzszej niz 5"; src/server/parties.js).
const spreadText = (spread) => t('Poziomy klas w drużynie mogą się różnić najwyżej o {spread}. Kto przez awans odstanie bardziej, wypada z drużyny.', { spread });

// The fights of an exploration of `minutes`, and so the most potions of one
// it takes along (potionsPerKind in the engine; fightsFor in combat.js).
const fightsUpTo = (use, minutes) => use.fightsByMinutes.filter(([from]) => from <= minutes).at(-1)?.[1] ?? 1;
// How long after the last tap of the potions' rubric its choice is saved.
const POTIONS_SAVE_MS = 700;

// The time other members of a Drużyna's trip skipped for everyone
// (src/server/time.js), one line each, their skips added up (the author:
// "xxx przewinął czas o xxx").
export function skipLines(skips = []) {
  const byWho = new Map();
  for (const skip of skips) {
    const seen = byWho.get(skip.id);
    byWho.set(skip.id, seen ? { ...seen, minutes: seen.minutes + skip.minutes } : skip);
  }
  return [...byWho.values()].map((skip) => {
    const said = { name: skip.name, time: formatMinutes(skip.minutes) };
    return skip.female ? t('{name} przewinęła czas o {time}.', said) : t('{name} przewinął czas o {time}.', said);
  });
}

// The members a party's leader takes along now: the others free now, by
// name, while the character leads a party (/api/party's `party`); none
// otherwise. "Wyrusz" with "Z drużyną" (screens/combat.js) and "Wyrusz
// ponownie" (screens/report.js) go with them.
export function partyFree(party) {
  const own = party?.members.find((member) => member.own);
  if (!own?.leader || party.members.length < 2) return [];
  return party.members.filter((member) => !member.own && member.status === 'free').map((member) => member.name);
}

// What the toast says once a party's trip set out (POST /api/party/hunt):
// those who went, as the server says (one may have got busy at that very
// moment), and those who must first choose in their exploration's event.
export function partyWent(answer) {
  return [
    answer.went?.length > 0 ? t('Drużyna wyrusza: {names}.', { names: answer.went.join(', ') }) : t('Nikt z drużyny nie zdążył wyruszyć. Wyprawa jest tylko Twoja.'),
    ...(answer.notes ?? []),
  ].join(' ');
}

export function mountParty(container) {
  let view = null;
  let friends = [];
  let gone = false;
  // A member's choice of potions for the party's trips (potionsRubric), as
  // last changed here: saved a moment after the last tap (PUT
  // /api/party/potions), and taken from the server's answers again only
  // once every change made here has been saved.
  let potionChoice = null;
  let potionEdits = 0;
  let potionSynced = 0;
  let potionTimer = null;
  const savePotions = () => {
    clearTimeout(potionTimer);
    potionTimer = null;
    const edits = potionEdits;
    call('PUT', '/api/party/potions', potionChoice ?? {})
      .then(() => {
        potionSynced = Math.max(potionSynced, edits);
      })
      .catch((error) => {
        toast(error.message);
        // The rubric shows what the server keeps.
        potionSynced = potionEdits;
        if (!gone) call('GET', '/api/party').then(show, () => {});
      });
  };
  const changePotions = (next) => {
    potionChoice = next;
    potionEdits += 1;
    clearTimeout(potionTimer);
    potionTimer = setTimeout(savePotions, POTIONS_SAVE_MS);
  };
  const body = h('div', { class: 'friends party' }, h('p', { class: 'muted', text: t('Wczytywanie…') }));
  fill(container, body);

  if (!isUnlocked('party')) {
    const unlock = unlockInfo('party');
    fill(body, h('section', { class: 'card' }, h('p', { class: 'muted', text: t('Drużynę odblokujesz na poziomie postaci {level}. Twój poziom: {own}.', { level: unlock.level, own: state.character.level }) })));
    return { unmount() {} };
  }

  const name = h('input', {
    type: 'text',
    id: 'party-name',
    maxlength: '20',
    autocomplete: 'off',
    autocapitalize: 'none',
    enterkeyhint: 'send',
    placeholder: t('Imię postaci'),
    'aria-label': t('Imię postaci do zaproszenia do drużyny'),
  });
  const inviteButton = h('button', { type: 'submit', class: 'button button--system chat-send', text: t('Zaproś') });
  const inviteForm = h(
    'form',
    {
      class: 'chat-form',
      onSubmit: (event) => {
        event.preventDefault();
        withButton(inviteButton, async () => {
          const value = name.value.trim();
          if (!value || !(await companionsAgree('make'))) return;
          await act('/api/party/invite', { name: value })();
          name.value = '';
        });
      },
    },
    name,
    inviteButton,
  );

  function show(next) {
    if (gone) return;
    view = next;
    if (!potionTimer && potionSynced === potionEdits) potionChoice = view.potions ?? null;
    partySeen(view);
    fill(body, invitesCard(), partyCard(), inviteCard(), sentCard(), leaveCard());
  }

  // Before a party is made (`way` 'make': the first invitation) or joined
  // ('join'), one question naming the companions who go on the character's
  // explorations: they stay in the Kwatery while it is in the party (828 B,
  // 11.11.2026: „Dobrogost i Dobrosława zostaną w Kwaterach, póki jesteś w
  // drużynie: nie zdobędą XP ani relacji z wypraw.” [Dołącz] [Anuluj]).
  // None when no companion goes, nor in a party (the server's `companions`
  // is then null). Before 828 such companions kept it out of every party.
  const companionsAgree = async (way) => {
    const asked = view.companions;
    if (!asked) return true;
    return confirmAction({ title: asked[way].title, text: asked.text, confirmLabel: asked[way].confirm });
  };
  // An action that makes or joins a party, once the question is answered.
  const agreed = (way, run) => async () => {
    if (await companionsAgree(way)) await run();
  };

  // An action answered with the Drużyna anew, its words in a toast.
  const act = (path, data, said) => async () => {
    const answer = await call('POST', path, data);
    show(answer);
    const words = answer.text ?? said;
    if (words) toast(words);
  };
  const button = (label, run, kind = 'world') => h('button', { type: 'button', class: `button button--${kind} button--small`, text: label, onClick: (event) => withButton(event.currentTarget, run) });

  const who = (person, ...more) =>
    h(
      'div',
      { class: 'friend-who' },
      person.status && h('span', { class: `friend-status friend-status--${DOTS[person.status] ?? person.status}`, role: 'img', 'aria-label': stateText(person.status), title: stateText(person.status) }),
      icon(CLASS_ICONS[person.classId] ?? 'person', { size: 16, className: 'chat-class' }),
      framedName(
        h('button', {
          type: 'button',
          class: 'chat-name',
          text: person.name,
          'aria-label': t('{name}: zobacz postać', { name: person.name }),
          onClick: (event) => withButton(event.currentTarget, () => openProfile(person.name)),
        }),
        person.nameColor,
      ),
      guildTag(person.guildTag),
      // The class level too, as the profile says it: the party's spread is
      // of class levels.
      person.level &&
        h('span', {
          class: 'chat-level',
          text: person.classLevel ? t('poz. {level} · klasa {classLevel}', { level: person.level, classLevel: person.classLevel }) : t('poz. {level}', { level: person.level }),
        }),
      BUSY[person.status] && h('span', { class: 'chat-level party-busy', text: t(BUSY[person.status]) }),
      more,
    );

  function invitesCard() {
    if (view.invites.length === 0) return null;
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'party-invites-title' },
      h('h2', { class: 'card-title', id: 'party-invites-title', text: t('Zaproszenia do drużyny') }),
      h(
        'ul',
        { class: 'friends-list' },
        view.invites.map((invite) =>
          h(
            'li',
            { class: 'friend' },
            h('p', { class: 'party-invite', text: t('{name} zaprasza. W drużynie: {members}.', { name: invite.invitedBy, members: invite.members }) }),
            h(
              'div',
              { class: 'friend-actions' },
              button(t('Dołącz'), agreed('join', act('/api/party/accept', { partyId: invite.partyId })), 'system'),
              button(t('Odrzuć'), act('/api/party/decline', { partyId: invite.partyId }, t('Zaproszenie odrzucone.'))),
            ),
          ),
        ),
      ),
    );
  }

  function partyCard() {
    const party = view.party;
    if (!party) {
      return h(
        'section',
        { class: 'card', 'aria-labelledby': 'party-title' },
        h('h2', { class: 'card-title', id: 'party-title' }, icon('swords', { size: 22 }), t('Drużyna')),
        // The author's words (1.11.2026).
        h('p', {
          class: 'muted',
          text: t('Drużyna może składać się z maksymalnie 3 osób. Lider drużyny zarządza wspólnymi wyprawami wolnych towarzyszy. Każda z osób otrzymuje własne łupy.'),
        }),
      );
    }
    const own = party.members.find((member) => member.own);
    // The hand-over of the lead (the author, 20.11.2026: „Dodaj też opcje
    // przekazania pozycji lidera w drużynie”), as the guild's: its words
    // from data/community.json.
    const lead = state.content.community?.party?.texts;
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'party-title' },
      h('h2', { class: 'card-title', id: 'party-title' }, icon('swords', { size: 22 }), t('Drużyna ({count}/{max})', { count: party.members.length, max: party.size })),
      h(
        'ul',
        { class: 'friends-list' },
        party.members.map((member) =>
          h(
            'li',
            { class: 'friend' },
            who(member, member.leader && h('span', { class: 'party-leader', text: t('Lider') })),
            own?.leader &&
              !member.own &&
              h(
                'div',
                { class: 'friend-actions' },
                lead &&
                  button(lead.lead, async () => {
                    if (!(await confirmAction({ title: lead.leadTitle, text: lead.leadText.replace('{name}', member.name), confirmLabel: lead.leadConfirm }))) return;
                    await act('/api/party/lead', { characterId: member.id })();
                  }),
                button(t('Usuń z drużyny'), async () => {
                  if (!(await confirmAction({ title: t('Usunąć z drużyny?'), text: t('{name} opuści drużynę.', { name: member.name }), confirmLabel: t('Usuń') }))) return;
                  await act('/api/party/kick', { characterId: member.id }, t('{name} nie jest już w drużynie.', { name: member.name }))();
                }),
              ),
          ),
        ),
      ),
      potionsRubric(own),
      // Who goes and who stays: the author's words (1.11.2026: "zły opis,
      // powinno być …"), on both cards, folded under "Jak to działa?" (the
      // author: "ten taki długi tekst o Drużynie schowaj pod "Jak to
      // działa?"") with the first sentence in sight.
      own?.leader
        ? howItWorks(t('Wyprawę drużyny zaczynasz w Walce: wybierz miejsce, zaznacz „Z drużyną” i naciśnij „Wyrusz”.'), [
            t(GOERS),
            spreadText(view.range.spread),
            t('Wyprawa drużyny ma wspólny czas: gdy ktokolwiek ją przewinie, skraca się wszystkim.'),
            t('Bez „Z drużyną” wyprawa jest tylko Twoja, a członkowie też mogą wyruszać na własne wyprawy.'),
            t(COMPANIONS_STAY),
          ])
        : howItWorks(t('Wyprawy wybiera lider. Gdy nie masz innych zajęć, lider zabierze Cię ze sobą, a raport odbierzesz w Walce jak zwykle.'), [
            t(GOERS),
            spreadText(view.range.spread),
            t('Wyprawa drużyny ma wspólny czas: gdy ktokolwiek ją przewinie, skraca się wszystkim.'),
            t(COMPANIONS_STAY),
          ]),
    );
  }

  // A member's potions for the party's trips (the author, 20.11.2026:
  // „Powinna byc opcja zabierania przez reszte drużyny jakos mikstur
  // zdrowia i many”): each healing and mana potion of the bag whose recipe
  // it knows, with −/+, and the healing mark, as in the Walka's "Opcje
  // wyprawy" (screens/combat.js), of each at most as many as the longest
  // trip it may go on has fights. As the leader sends the party out, the
  // server takes from the bag what there is of it, as many as that trip's
  // fights allow, and what is not drunk comes back with the report
  // (src/server/parties.js, memberPotions). A choice of a potion the bag
  // has run out of stays for when it has one again. The leader takes its
  // own in "Opcje wyprawy", so it has no such rubric.
  function potionsRubric(own) {
    const texts = state.content.community?.party?.texts;
    const use = state.character.professions?.potionUse;
    if (!own || own.leader || !texts?.potionsTitle || !use) return null;
    // Healing first, then mana, each the strongest first.
    const carried = (state.character.potions ?? [])
      .filter((potion) => (potion.fight === 'heal' || potion.fight === 'mana') && potion.known && potion.count > 0)
      .sort((a, b) => Number(a.fight === 'mana') - Number(b.fight === 'mana') || (b.amount ?? 0) - (a.amount ?? 0));
    const longest = Math.min(Math.max(1, ...(state.character.huntDurations ?? [])), view.party.limits?.minutes ?? Infinity);
    const fights = fightsUpTo(use, longest);
    const wanted = { ...potionChoice?.potions };
    let below = use.healBelowChoices.includes(potionChoice?.healBelow) ? potionChoice.healBelow : use.healBelow;
    const changed = () => changePotions({ potions: Object.fromEntries(Object.entries(wanted).filter(([, count]) => count > 0)), healBelow: below });
    const stepper = (label, onStep) => ({
      less: h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': t('{name}: mniej', { name: label }), text: '−', onClick: () => onStep(-1) }),
      more: h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': t('{name}: więcej', { name: label }), text: '+', onClick: () => onStep(1) }),
    });
    const rows = carried.map((potion) => {
      const limit = Math.min(potion.count, fights);
      const count = () => Math.min(wanted[potion.id] ?? 0, limit);
      const value = h('output', { class: 'potion-pick-value' });
      const { less, more } = stepper(potion.name, (sign) => {
        wanted[potion.id] = Math.max(0, Math.min(limit, count() + sign));
        showRow();
        changed();
      });
      const showRow = () => {
        value.textContent = t('{count} z {all}', { count: count(), all: limit });
        less.disabled = count() === 0;
        more.disabled = count() >= limit;
      };
      showRow();
      const element = h('div', { class: 'potion-pick' }, h('span', { class: 'potion-pick-art' }, potionSprite(potion.id) ?? icon('flask', { size: 20 })), h('span', { class: 'potion-pick-name', text: potion.name }), less, value, more);
      return { fight: potion.fight, element };
    });
    // The healing mark, under the healing potions, as in "Opcje wyprawy".
    const healing = rows.filter((row) => row.fight === 'heal');
    let mark = null;
    if (healing.length > 0) {
      const markValue = h('output', { class: 'potion-pick-value' });
      const steps = stepper(t('Próg leczenia'), (sign) => {
        const choices = use.healBelowChoices;
        below = choices[Math.max(0, Math.min(choices.length - 1, choices.indexOf(below) + sign))];
        showMark();
        changed();
      });
      const showMark = () => {
        markValue.textContent = `${Math.round(below * 100)}% HP`;
        steps.less.disabled = below === use.healBelowChoices[0];
        steps.more.disabled = below === use.healBelowChoices.at(-1);
      };
      showMark();
      mark = h('div', { class: 'potion-pick' }, h('span', { class: 'potion-pick-name', text: t('Lecz poniżej') }), steps.less, markValue, steps.more);
    }
    return h(
      'section',
      { class: 'potion-picks party-potions', 'aria-labelledby': 'party-potions-title' },
      h('p', { class: 'duration-head', id: 'party-potions-title', text: texts.potionsTitle }),
      healing.map((row) => row.element),
      mark,
      rows.filter((row) => row.fight !== 'heal').map((row) => row.element),
      h('p', { class: 'muted', text: rows.length > 0 ? texts.potionsHint : texts.potionsNone }),
    );
  }

  function inviteCard() {
    const party = view.party;
    const own = party?.members.find((member) => member.own);
    if (party && (!own?.leader || party.members.length >= party.size)) return null;
    const inParty = new Set(party ? party.members.map((member) => member.name) : []);
    const invited = new Set(party ? party.invited.map((one) => one.name) : []);
    // Only the friends whose class level fits the party's spread.
    const { from, to, spread } = view.range;
    const ready = friends.filter(
      (friend) => !inParty.has(friend.name) && !invited.has(friend.name) && friend.level >= view.unlockLevel && friend.classLevel >= from && friend.classLevel <= to,
    );
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'party-invite-title' },
      h('h2', { class: 'card-title', id: 'party-invite-title', text: t('Zaproś do drużyny') }),
      // The author's words (1.11.2026), over the friends and the name field.
      h('p', { class: 'muted', text: t('Zaproś postaci od {level}. poziomu wzwyż. Poniżej możesz to zrobić z listy znajomych lub dodać kogokolwiek ręcznie spoza niej.', { level: view.unlockLevel }) }),
      h('p', { class: 'muted', text: t('Poziomy klas w drużynie mogą się różnić najwyżej o {spread}, więc teraz dołączy postać z poziomem klasy od {from} do {to}.', { spread, from, to }) }),
      ready.length > 0 &&
        h(
          'ul',
          { class: 'friends-list' },
          ready.map((friend) => h('li', { class: 'friend' }, who(friend), h('div', { class: 'friend-actions' }, button(t('Zaproś'), agreed('make', act('/api/party/invite', { name: friend.name })), 'system')))),
        ),
      inviteForm,
    );
  }

  function sentCard() {
    const party = view.party;
    if (!party || party.invited.length === 0) return null;
    const own = party.members.find((member) => member.own);
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'party-sent-title' },
      h('h2', { class: 'card-title', id: 'party-sent-title', text: t('Wysłane zaproszenia') }),
      h(
        'ul',
        { class: 'friends-list' },
        party.invited.map((one) =>
          h('li', { class: 'friend' }, who(one), own?.leader && h('div', { class: 'friend-actions' }, button(t('Cofnij'), act('/api/party/cancel', { characterId: one.id }, t('Zaproszenie cofnięte.'))))),
        ),
      ),
    );
  }

  function leaveCard() {
    if (!view.party) return null;
    return h(
      'div',
      { class: 'party-leave' },
      button(t('Opuść drużynę'), async () => {
        const own = view.party.members.find((member) => member.own);
        const text = own?.leader && view.party.members.length > 1 ? t('Przywództwo przejmie ta postać, która dołączyła najwcześniej.') : t('Wyprawa, która już trwa, skończy się jak zaczęła.');
        if (!(await confirmAction({ title: t('Opuścić drużynę?'), text, confirmLabel: t('Opuść') }))) return;
        await act('/api/party/leave')();
      }),
    );
  }

  Promise.all([call('GET', '/api/party'), call('GET', '/api/friends').catch(() => null)])
    .then(([party, known]) => {
      friends = known?.friends ?? [];
      show(party);
    })
    .catch((error) => {
      if (!gone) fill(body, h('section', { class: 'card' }, h('p', { class: 'muted', text: error.message ?? t('Nie udało się wczytać drużyny.') })));
    });

  return {
    unmount() {
      gone = true;
      // A change made a moment ago is saved all the same.
      if (potionTimer) savePotions();
    },
  };
}
