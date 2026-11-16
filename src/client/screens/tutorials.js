// The Samouczki (1039; a player through the author, 16.11.2026: „przydałoby
// się aby można było wrócić do objaśnień narratora w dowolnym momencie”; the
// author: „te objaśnienia narratora mogą być podane po prostu jak dziennik
// w formie tekstowej … w ustawieniach Samouczki”): the narrator's lines of
// the parts the character has come to (data/tutorial.json), to read again at
// any time as text, without the scrolls and the pointing of the tour; each
// line with its recording, to hear at a tap. The lines that only ask for a
// tap ("Stuknij Wiatrołomy.") and the author's first card are left out.
// Under a part the narrator may tell again (1039.2 B), "Objaśnij jeszcze
// raz": its lines unread, it comes again at its moment, with the scrolls.

import { fill, h, icon } from '../dom.js';
import { t } from '../i18n.js';
import { duckMusic } from '../music.js';
import { forgetPart, lineVoice, lineWords, narrate } from '../narrator.js';
import { playNarration, stopNarration } from '../sound.js';
import { call, state } from '../state.js';
import { confirmAction, foldPart, toast, withButton } from '../ui.js';

// The parts: the introduction, then the chapters in the order the data
// lists them, each once the character has come to it (one of its lines told
// or passed: a chapter skipped counts too); for a character made before the
// narrator (no list of lines read), which heard none of them, every part.
// Their lines with words for this character (narrator.js).
function parts() {
  const tutorial = state.content.tutorial;
  const before = !state.character?.tutorial;
  const read = new Set(state.character?.tutorial ?? []);
  const shown = (line) => line.kind !== 'tap' && line.speaker !== 'author' && lineWords(line).some((text) => text.trim() !== '');
  const reached = (id) => before || tutorial.lines.some((line) => line.chapter === id && read.has(line.id));
  return [
    { id: 'intro', title: tutorial.introTitle, lines: tutorial.lines.filter((line) => !line.chapter && shown(line)) },
    ...Object.entries(tutorial.chapters)
      .filter(([id]) => reached(id))
      .map(([id, chapter]) => ({ id, title: chapter.title, replay: Boolean(chapter.replay), lines: tutorial.lines.filter((line) => line.chapter === id && shown(line)) })),
  ].filter((part) => part.lines.length > 0);
}

export function mountTutorials(container) {
  // The recording playing and its button; one at a time.
  let playing = null;
  const stop = () => {
    if (!playing) return;
    playing.button.setAttribute('aria-pressed', 'false');
    playing = null;
    stopNarration();
    duckMusic(false);
  };
  function play(line, button) {
    const same = playing?.button === button;
    stop();
    if (same) return;
    const voice = lineVoice(line);
    playing = { button };
    button.setAttribute('aria-pressed', 'true');
    duckMusic(true);
    playNarration(voice, {
      onEnd: () => {
        if (playing?.button !== button) return;
        playing = null;
        button.setAttribute('aria-pressed', 'false');
        duckMusic(false);
      },
    });
  }

  const entry = (line) => {
    const voice = lineVoice(line);
    return h(
      'li',
      { class: 'tutorial-entry' },
      h(
        'div',
        { class: 'tutorial-entry-text' },
        lineWords(line).map((text) => h('p', { text })),
      ),
      voice &&
        h(
          'button',
          { type: 'button', class: 'button button--world button--small tutorial-entry-voice', 'aria-label': t('Posłuchaj'), title: t('Posłuchaj'), 'aria-pressed': 'false', onClick: (event) => play(line, event.currentTarget) },
          icon('play', { size: 18 }),
        ),
    );
  };

  // "Objaśnij jeszcze raz": a character with the narrator's introduction,
  // and the narrator not passing everything by the account's switch.
  const replayable = Boolean(state.character?.tutorial) && !state.user?.skipTutorials;
  const replay = (part) => async (event) => {
    const button = event.currentTarget;
    const sure = await confirmAction({
      title: t('Objaśnić jeszcze raz?'),
      text: t('Narrator objaśni część „{part}” od początku, gdy przyjdzie jej moment, jak za pierwszym razem.', { part: part.title }),
      confirmLabel: t('Objaśnij'),
    });
    if (!sure) return;
    await withButton(button, async () => {
      await call('POST', '/api/tutorial/replay', { chapter: part.id });
      forgetPart(part.id);
      toast(t('Narrator objaśni część „{part}” jeszcze raz.', { part: part.title }));
      narrate();
    });
  };

  fill(
    container,
    h('div', { class: 'page-heading' }, h('h1', { class: 'page-title', tabindex: '-1', text: t('Samouczki') })),
    h('p', { class: 'muted tutorials-lead', text: t('Objaśnienia narratora do przeczytania w każdej chwili. Części, do których Twoja postać jeszcze nie doszła, pojawią się tu, gdy do nich dojdzie.') }),
    h(
      'div',
      { class: 'tutorials-parts' },
      parts().map((part) =>
        h(
          'section',
          { class: 'card tutorials-part' },
          foldPart(
            { key: `tutorials-${part.id}`, title: part.title, open: false },
            h('ol', { class: 'tutorial-entries' }, part.lines.map(entry)),
            part.replay && replayable && h('button', { type: 'button', class: 'button button--system tutorials-replay', text: t('Objaśnij jeszcze raz'), onClick: replay(part) }),
          ),
        ),
      ),
    ),
  );
  return {
    unmount() {
      stop();
    },
  };
}
