// Views below a main view (a region, an inner region, a building of the camp)
// go on the browser history with their depth below it, so "Powrót" and the
// phone's back button lead to the same place. `key` names the main view.

const depth = (key) => history.state?.[key] ?? 0;

// Opens a view one level deeper, from a tapped link.
export function openView(event, hash, key) {
  event.preventDefault();
  history.pushState({ [key]: depth(key) + 1 }, '', hash);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

// Goes back `levels` views, or straight to `hash` when the page was opened
// at a deeper address.
export function leaveView(hash, levels, key) {
  if (depth(key) >= levels) history.go(-levels);
  else location.replace(hash);
}
