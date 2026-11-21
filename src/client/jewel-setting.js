// What Jubilerstwo's „Oprawianie” (screens/professions.js, setForm) says
// over the figure and under „Z plecaka”'s title. With no one free for a new
// work the figure and „Z plecaka” stay on the tab, dim and not to be
// tapped, and the line over them says why and when a gem can be set
// (21.11.2026): the tab showed nothing then, so players could not find the
// setting from the bag of 0.4.79 (the author, 21.11.2026: „niby nie
// działa”).

import { t } from './i18n.js';

// The kinds of work that take the character away (buildLocked, state.js):
// then only the Awatar sets a gem, and only in an item from the bag.
const AWAY = new Set(['hunt', 'mercenary']);

/**
 * The line in the hint's place over the figure (`hint`) and the one under
 * „Z plecaka”'s title (`bag`, null when the hint says it already).
 * @param {{ activity: { kind: string } | null, professions: { avatar: { owned: boolean } } }} character
 * @param {boolean} idle no one free for a new work: the character busy, and
 *   no Awatar or none free (freeWorkers)
 * @param {string} doing what the character does, as the page says it
 *   („kopie w Kopalni”), for its work other than an exploration
 */
export function settingLines(character, idle, doing) {
  const kind = character.activity?.kind;
  const away = AWAY.has(kind);
  const serving = kind === 'mercenary';
  const owned = character.professions.avatar.owned;
  let hint;
  if (!idle) {
    hint = !away
      ? t('Stuknij przedmiot albo Rdzeń, żeby oprawić w nim kamień.')
      : serving
        ? t('Na usłudze najemnej oprawisz tylko przedmioty z plecaka.')
        : t('Na wyprawie oprawisz tylko przedmioty z plecaka.');
  } else if (away && owned) {
    hint = serving
      ? t('Postać wykonuje usługę najemną. Kamień w przedmiocie z plecaka oprawi Awatar Systemu, gdy będzie wolny.')
      : t('Postać jest na wyprawie. Kamień w przedmiocie z plecaka oprawi Awatar Systemu, gdy będzie wolny.');
  } else if (away) {
    hint = serving ? t('Postać wykonuje usługę najemną. W trakcie usługi oprawia tylko Awatar Systemu.') : t('Postać jest na wyprawie. W trakcie wyprawy oprawia tylko Awatar Systemu.');
  } else {
    hint = owned
      ? t('Postać {doing}, a Awatar Systemu jest zajęty. Oprawisz kamień, gdy któreś z nich będzie wolne.', { doing })
      : t('Postać {doing}. Oprawisz kamień, gdy będzie wolna.', { doing });
  }
  // Away, the hint names the bag and the Awatar already.
  const bag = away ? null : t('Oprawisz kamień w przedmiocie z plecaka, także gdy postać jest na wyprawie (pracę wykona Awatar Systemu).');
  return { hint, bag };
}
