// The Bestiariusz chests ready to open (combat.js shows them at the Walka
// and in the Encyklopedia): of an inner region or a whole land whose
// creatures are all met and whose chest is shut.
export function placeReady(place, character) {
  const met = new Set(character.met ?? []);
  return place.dangers?.length > 0 && !(character.bestiary ?? []).includes(place.id) && place.dangers.every((danger) => met.has(danger.monsterId));
}

export function bestiaryReady(character, content) {
  return (content?.regions ?? []).flatMap((region) => [region, ...region.areas]).filter((place) => placeReady(place, character)).length;
}
