// The Sklep Systemu (data/cosmetics.json; the author: "tylko ramki i tła
// wchodzą póki co do gry, wszystkie", the name shown in the frame's colour,
// and a "Tygrys szablozębny" for 1000 Punktów Systemu): cosmetics bought
// for Punkty Systemu that change only the look, each the character's that
// bought it, as its Punkty Systemu are. A frame and a background dress the
// portrait, a mount's look (mountSkin) changes the Stajnia's mount in the
// Walka scene, never what the mount does, an aura lights the figure on the
// portrait and in the Walka scene, and a trail (the author: "416 akcept",
// "417 akcept", "418 akcept") leaves glowing footprints behind it there.
//
// Stored state (characters.cosmetics): {"owned": [ids], "frame": id,
// "background": id, "mountSkin": id, "aura": id, "trail": id,
// "nameFromFrame": true}.

// The places a cosmetic is worn in, one of each kind at a time.
export const COSMETIC_KINDS = ['frame', 'background', 'mountSkin', 'aura', 'trail'];

const itemOf = (id, content) => (typeof id === 'string' ? (content.cosmeticsById?.[id] ?? null) : null);

// The stored state as it holds: only the cosmetics the data has, once
// each, and only an owned one of its kind worn.
export function cosmeticsOf(stored, content) {
  const owned = [...new Set(Array.isArray(stored?.owned) ? stored.owned : [])].filter((id) => itemOf(id, content));
  const worn = (kind) => {
    const id = stored?.[kind];
    return owned.includes(id) && itemOf(id, content).kind === kind ? id : null;
  };
  return {
    owned,
    frame: worn('frame'),
    background: worn('background'),
    mountSkin: worn('mountSkin'),
    aura: worn('aura'),
    trail: worn('trail'),
    nameFromFrame: stored?.nameFromFrame === true,
  };
}

// Why the character, with its Punkty Systemu and its Stajnia's mount (null
// for none), cannot buy the cosmetic `id` now, as { code, message }, or null
// when it can. A mount's look needs a mount to change.
export function cosmeticBlock(id, stored, { systemPoints, mount }, content) {
  const item = itemOf(id, content);
  if (!item) return { code: 'invalid_cosmetic', message: 'Nie ma takiego przedmiotu.' };
  if (cosmeticsOf(stored, content).owned.includes(item.id)) return { code: 'owned', message: 'Masz już ten przedmiot.' };
  if (item.kind === 'mountSkin' && !mount) return { code: 'no_mount', message: 'Najpierw kup wierzchowca w Stajni.' };
  if (systemPoints < item.price) return { code: 'not_enough_points', message: 'Brakuje Punktów Systemu.' };
  return null;
}

// Why the character cannot wear the cosmetic `id` as its `kind` now (null
// takes off what is worn there), as { code, message }, or null.
export function wearBlock(kind, id, stored, content) {
  if (!COSMETIC_KINDS.includes(kind)) return { code: 'invalid_kind', message: 'Nie ma takiego miejsca na przedmiot.' };
  if (id === null) return null;
  const item = itemOf(id, content);
  if (!item || item.kind !== kind) return { code: 'invalid_cosmetic', message: 'Nie ma takiego przedmiotu.' };
  if (!cosmeticsOf(stored, content).owned.includes(item.id)) return { code: 'not_owned', message: 'Najpierw kup ten przedmiot.' };
  return null;
}

// The colour of the character's name: its frame's, while it wears one and
// shows its name in it ("Kolor imienia jak ramka"), else null.
export function nameColor(stored, content) {
  const { frame, nameFromFrame } = cosmeticsOf(stored, content);
  return nameFromFrame && frame ? itemOf(frame, content).nameColor : null;
}
