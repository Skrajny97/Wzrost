// The offline page (offline.html) in the game's language (0.2.2): the one
// this phone plays in (i18n.js keeps it under these keys), else the phone's
// own, and English only where the game has offered it on this phone. The
// page's Polish is the rest; each text's English is in its data-en.
(() => {
  const read = (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  if (read('insight.english') !== 'on') return;
  const chosen = read('insight.language');
  const first = String(navigator.languages?.[0] ?? navigator.language ?? '').toLowerCase();
  const phone = first === '' || first === 'pl' || first.startsWith('pl-') ? 'pl' : 'en';
  if ((chosen === 'pl' || chosen === 'en' ? chosen : phone) !== 'en') return;
  document.documentElement.lang = 'en';
  for (const element of document.querySelectorAll('[data-en]')) element.textContent = element.dataset.en;
})();
