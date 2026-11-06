// insightrpg.com/en (en.html, 0.2.2): who comes by an English link plays in
// English. The choice is kept as the language picked on this phone, the one
// i18n.js reads before the phone's own, and the game opens; an account that
// signs in keeps its own language (i18n.js, followAccount).
try {
  localStorage.setItem('insight.language', 'en');
} catch {
  // Without storage the phone's own language decides.
}
location.replace('/');
