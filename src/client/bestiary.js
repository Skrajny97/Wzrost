// The Bestiariusz chests ready to open: of an inner region or a whole land
// whose creatures are all met and whose chest is shut (combat.js shows
// them at the Walka and in the Encyklopedia).
export function bestiaryReady(character, content) {
  const met = new Set(character.met ?? []);
  const opened = new Set(character.bestiary ?? []);
  return (content?.regions ?? [])
    .flatMap((region) => [region, ...region.areas])
    .filter((place) => place.dangers?.length > 0 && !opened.has(place.id) && place.dangers.every((danger) => met.has(danger.monsterId))).length;
}
