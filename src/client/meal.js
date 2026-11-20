// The meal (cooking.js): another dish in place of the meal at work, asked
// first in the game's own words (`meal.swap`, professions-view.js), as the
// meal at work ends with its bonus lost (hunts.js, mealEaten): on the Walka
// screen's "Opcje wyprawy" and on a dish's card in the Spiżarnia.

import { formatMinutes } from './format.js';
import { confirmAction } from './ui.js';

// The server's words with their {name} gaps filled in.
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));

// Whether the player agrees to eat `dish` in place of the meal at work
// (`current`, the character's `meal`).
export const askMealSwap = (current, dish) =>
  confirmAction({
    title: current.swap.title,
    text: filled(current.swap.text, { dish: dish.name, current: current.name, time: formatMinutes(current.left) }),
    confirmLabel: current.swap.eat,
  });
