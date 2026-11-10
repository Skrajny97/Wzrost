// The Czat on a screen of its own (782 C, the author 10.11.2026: „783.4
// wariant C ale niech można będzie przesuwać to kółko jak dymek messengera
// albo schować aż do samych ustawień”), opened by the round chat button
// over the game on a phone (../chat-bubble.js): the chat's rooms in tabs
// under its title, which stay under the top bar while the page scrolls, the
// messages and the line to write in, without the Społeczność's list above
// them (the author: „nawet się nie wyświetla ta nadkarta Społeczności przy
// nim”). The Społeczność keeps its Czat too, for those who hid the button.

import { $, fill, h } from '../dom.js';
import { onChatNews, takeConversation, takeMention } from '../chat-news.js';
import { t } from '../i18n.js';
import { isUnlocked } from '../state.js';
import { pageHeading } from '../ui.js';
import { mountChat } from './community.js';
import { lockedScreen } from './locked.js';

export function mountChatScreen(container, context) {
  if (!isUnlocked('community')) return lockedScreen('community', 'Społeczność')(container, context);
  const bar = h('div', { class: 'community-picker chat-screen-bar' });
  const body = h('div', { class: 'community-body' });
  fill(container, pageHeading(t('Czat')), bar, body);

  // The rooms' tabs stay under the top bar, as the Społeczność's list does.
  const topbar = $('.topbar');
  const stick = () => bar.style.setProperty('--community-top', `${topbar?.offsetHeight ?? 0}px`);
  const watcher = topbar && typeof ResizeObserver === 'function' ? new ResizeObserver(stick) : null;
  watcher?.observe(topbar);
  stick();

  const chat = mountChat(body, { bar, person: takeConversation(), mention: takeMention(), id: 'chat-screen' });
  // "Prywatna wiadomość" and "Oznacz" on a character's sheet opened over
  // this screen.
  const stopAsking = onChatNews(() => {
    const person = takeConversation();
    const mention = takeMention();
    if (person) chat.talkTo(person);
    if (mention) chat.mention(mention);
  });
  return {
    unmount() {
      chat.unmount();
      stopAsking();
      watcher?.disconnect();
    },
  };
}
