// The game's two layouts: the phone's, and the computer's own (the author:
// "musi być kompletnie osobne, jakoś to na pewno da się ustawić i
// wykrywać"), with the menu down the left, the game in the middle, the
// narrator's quests and the chat on the right (474 A) and windows in the
// middle of the screen (475 A). On its own a wide screen with a mouse gets
// the computer's, a phone and a tablet the phone's; "Układ ekranu" in the
// settings sets either for this device (473 A). The page carries the layout
// as an attribute (data-layout), which styles.css reads.

const KEY = 'insight.layout';
const CHOICES = ['auto', 'phone', 'desktop'];
// From about 1100 px wide, with a mouse.
const wide = window.matchMedia('(min-width: 1100px) and (hover: hover) and (pointer: fine)');
// "Układ ekranu" shows on a screen where the computer's layout fits.
const roomy = window.matchMedia('(min-width: 1000px)');
const listeners = new Set();
// The choice for this visit when the browser keeps nothing.
let kept = null;

export function layoutChoice() {
  try {
    const stored = localStorage.getItem(KEY);
    return CHOICES.includes(stored) ? stored : 'auto';
  } catch {
    return kept ?? 'auto';
  }
}

export const desktopLayout = () => {
  const choice = layoutChoice();
  return choice === 'desktop' || (choice === 'auto' && wide.matches);
};

// The settings offer the choice where both layouts fit, and wherever one
// was chosen, so that it can be undone.
export const layoutOffered = () => roomy.matches || layoutChoice() !== 'auto';

export function setLayoutChoice(choice) {
  if (!CHOICES.includes(choice)) return;
  kept = choice;
  try {
    if (choice === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Kept for this visit only.
  }
  applyLayout();
}

// The page in the layout it should have now; those listening hear of a change.
export function applyLayout() {
  const desktop = desktopLayout();
  const value = desktop ? 'desktop' : 'phone';
  const root = document.documentElement;
  if (root.dataset.layout === value) return;
  root.dataset.layout = value;
  for (const listener of listeners) listener(desktop);
}

export function onLayoutChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

wide.addEventListener('change', applyLayout);
applyLayout();
