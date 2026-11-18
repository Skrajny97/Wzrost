// How skills look in a fight's playback (arena.js): the skill's name pops up
// over its user, a sweep crosses the whole enemy row before its blows land
// (a blade's arc, an icy gust, columns of holy light, falling arrows),
// a skill blow lands with its own impact (a heavy crack, a fiery burst, a
// strike out of the shadows), a heal rises in green sparks, and a blessing,
// a shield or a dance of shadows wraps the character in its aura. Each skill
// has a look below, by its id in data/skills.json.

import { artChain, itemSprite, monsterSprite } from './art.js';
import { h } from './dom.js';
import { t } from './i18n.js';
import { playSkill } from './sound.js';

// cast: what plays when the skill wakes or a sweep starts; impact: extra
// on the target of the skill's own blow; color: its light.
export const SKILL_LOOKS = {
  'power-strike': { color: '#f6ecd6', impact: 'heavy' },
  'wide-sweep': { color: '#dfe7ea', cast: 'sweep' },
  unyielding: { color: '#d9b45a', cast: 'guard' },
  'aimed-shot': { color: '#ef9a85', impact: 'aim', glow: true },
  'arrow-rain': { color: '#e3cf98', cast: 'rain' },
  'pinning-shot': { color: '#c49a6c', impact: 'pin', glow: true },
  fireball: { color: '#ff8a3d', impact: 'fire', big: true },
  'frost-gust': { color: '#8fd3ff', cast: 'frost' },
  'mana-shield': { color: '#6fb6ff', cast: 'shield' },
  'prayer-of-health': { color: '#a7c47f', cast: 'heal' },
  exorcism: { color: '#f2d675', cast: 'holy' },
  blessing: { color: '#f2d675', cast: 'bless' },
  backstab: { color: '#a690e8', impact: 'shadow', teleport: true },
  'poisoned-blade': { color: '#9ccc65', cast: 'poison' },
  'shadow-dance': { color: '#a690e8', cast: 'dance' },
  // The evolutions' skills (data/evolutions.json), in the looks of the
  // skills they grow from until they have their own.
  'crushing-blow': { color: '#f6ecd6', impact: 'heavy', big: true },
  'blood-frenzy': { color: '#d9534f', cast: 'bless' },
  millstone: { color: '#dfe7ea', cast: 'sweep' },
  riposte: { color: '#e8d9a0' },
  indomitable: { color: '#d9b45a', cast: 'guard' },
  challenge: { color: '#e0a03c', cast: 'bless' },
  'piercing-shot': { color: '#ef9a85', impact: 'aim', glow: true },
  'ambush-shot': { color: '#c9b7ff', impact: 'aim', glow: true },
  'arrow-storm': { color: '#b9a8ff', cast: 'rain' },
  'storm-cloud': { color: '#b9a8ff', cast: 'holy' },
  'barbed-arrow': { color: '#c49a6c', impact: 'pin', glow: true },
  falcon: { color: '#d8c39a' },
  'fire-burst': { color: '#ff8a3d', impact: 'fire', big: true },
  'elemental-ray': { color: '#ffd27a', cast: 'holy' },
  blizzard: { color: '#8fd3ff', cast: 'frost' },
  'ice-lance': { color: '#bfe8ff', impact: 'heavy', glow: true },
  'mana-mirror': { color: '#9fc8ff', cast: 'shield' },
  'elemental-summon': { color: '#ffb36b', cast: 'bless' },
  renewal: { color: '#a7c47f', cast: 'heal' },
  miracle: { color: '#f2c14e', cast: 'heal' },
  judgement: { color: '#f2d675', cast: 'holy' },
  verdict: { color: '#f2d675', impact: 'heavy', glow: true },
  'great-blessing': { color: '#f2d675', cast: 'bless' },
  psalm: { color: '#cfe6a0', cast: 'bless' },
  execution: { color: '#a690e8', impact: 'shadow', teleport: true },
  'death-mark': { color: '#7b5fc7', impact: 'shadow' },
  'black-venom': { color: '#7fa34a', cast: 'poison' },
  'toxic-slime': { color: '#9ccc65', cast: 'poison' },
  'blade-dance': { color: '#a690e8', cast: 'dance' },
  'shadow-whirl': { color: '#a690e8', cast: 'sweep' },
  // The second forms' skills ("Druga ewolucja klas"), brighter or heavier
  // than the skills they grow from, until they have their own.
  'shattering-blow': { color: '#ffe2a8', impact: 'heavy', big: true, glow: true },
  'berserker-roar': { color: '#e8462f', cast: 'bless' },
  'steel-whirl': { color: '#f0f4f6', cast: 'sweep' },
  duel: { color: '#f2c14e', impact: 'aim' },
  unbending: { color: '#f2c14e', cast: 'guard' },
  'shield-wall': { color: '#d9b45a', cast: 'shield' },
  'heart-shot': { color: '#ff7a6b', impact: 'aim', glow: true, big: true },
  'target-lock': { color: '#ff7a6b', impact: 'aim' },
  'sky-thunder': { color: '#c9b7ff', cast: 'rain' },
  'thunder-orb': { color: '#c9b7ff', impact: 'aim', glow: true },
  harpoon: { color: '#b07d4f', impact: 'pin', glow: true, big: true },
  'wolf-call': { color: '#c8b49a', cast: 'bless' },
  'meteor-shower': { color: '#ff6a2a', cast: 'rain' },
  'elemental-harmony': { color: '#ffd27a', cast: 'bless' },
  'ice-star': { color: '#d6f1ff', impact: 'heavy', glow: true, big: true },
  'ice-armor': { color: '#a8e0ff', cast: 'shield' },
  'ent-summon': { color: '#7fb069', cast: 'bless' },
  'bear-summon': { color: '#a0784f', cast: 'bless' },
  'great-renewal': { color: '#b9d98f', cast: 'heal' },
  'life-aura': { color: '#d9f0a3', cast: 'bless' },
  'final-verdict': { color: '#ffe08a', impact: 'heavy', glow: true, big: true },
  pyre: { color: '#ffb347', cast: 'holy' },
  choir: { color: '#e6f2b8', cast: 'bless' },
  'divine-shield': { color: '#f2d675', cast: 'shield' },
  beheading: { color: '#b9a3f0', impact: 'shadow', teleport: true, big: true },
  vanish: { color: '#5d4a8f', cast: 'dance' },
  'raise-dead': { color: '#8fbf5a', cast: 'poison' },
  'curse-of-decay': { color: '#6b8f3a', cast: 'poison' },
  'blade-storm': { color: '#b9a3f0', cast: 'sweep' },
  'shadow-double': { color: '#4b3a73', cast: 'dance' },
  // The third forms' skills ("Trzecia ewolucja klas"), brighter or heavier
  // again, until they have their own.
  'smashing-blow': { color: '#fff1c9', impact: 'heavy', big: true, glow: true },
  slaughter: { color: '#c0392b', cast: 'sweep' },
  'steel-hurricane': { color: '#ffffff', cast: 'sweep' },
  cheers: { color: '#ffd24d', cast: 'bless' },
  unbroken: { color: '#ffd76a', cast: 'guard' },
  earthquake: { color: '#b08a5a', cast: 'sweep' },
  'master-shot': { color: '#ff5a4a', impact: 'aim', glow: true, big: true },
  'steady-hand': { color: '#9fe3b0', cast: 'bless' },
  'perun-wrath': { color: '#e0d4ff', cast: 'rain' },
  'thunder-sign': { color: '#b9a8ff', cast: 'bless' },
  'pack-leader': { color: '#f2efe6', cast: 'bless' },
  'eagle-talon': { color: '#d9b26b', impact: 'pin', glow: true },
  cataclysm: { color: '#ff7a3a', cast: 'rain' },
  'elemental-shield': { color: '#ffcf7a', cast: 'shield' },
  'ice-storm': { color: '#e6f7ff', cast: 'frost' },
  'ice-tomb': { color: '#bfefff', cast: 'frost' },
  'oak-awakening': { color: '#6fa058', cast: 'bless' },
  'bison-call': { color: '#8a6a45', cast: 'bless' },
  'miraculous-healing': { color: '#e3f5b0', cast: 'heal' },
  'holy-light': { color: '#fff3b0', cast: 'holy' },
  'last-judgment': { color: '#fff0a8', impact: 'heavy', glow: true, big: true },
  'holy-seal': { color: '#f2d675', cast: 'holy' },
  hymn: { color: '#f4fbd2', cast: 'bless' },
  vision: { color: '#d8e9ff', cast: 'bless' },
  'final-blow': { color: '#d6c2ff', impact: 'shadow', teleport: true, big: true },
  'blood-mark': { color: '#b3263b', impact: 'shadow' },
  'army-of-dead': { color: '#a6d96a', cast: 'poison' },
  'death-touch': { color: '#7fbf3f', impact: 'shadow' },
  'shadow-storm': { color: '#d0b8ff', cast: 'sweep' },
  eclipse: { color: '#2e2350', cast: 'dance' },
  // The fourth forms' skills ("Czwarta ewolucja klas"), each in a look of its
  // own (below).
  carnage: { color: '#ff6a2a', cast: 'sweep' },
  breach: { color: '#ff8a3d', impact: 'heavy', big: true },
  'glory-hurricane': { color: '#ffd76a', cast: 'sweep' },
  'champion-challenge': { color: '#f2c14e', impact: 'heavy' },
  'mountain-wrath': { color: '#7fe3ef', cast: 'sweep' },
  'titan-shield': { color: '#7fe3ef', cast: 'shield' },
  'heaven-arrow': { color: '#fff1b8', impact: 'aim', glow: true, big: true },
  'star-rain': { color: '#d6e4ff', cast: 'rain' },
  'perun-storm': { color: '#fff2a8', cast: 'rain' },
  'ball-lightning': { color: '#d9ccff', impact: 'aim', glow: true },
  'pack-chief': { color: '#e8eef8', cast: 'bless' },
  'bear-call': { color: '#c98a4b', cast: 'bless' },
  'primal-chaos': { color: '#ffb36b', cast: 'rain' },
  elemental: { color: '#ffd27a', cast: 'bless' },
  'ice-eternity': { color: '#cdf3ff', impact: 'heavy', big: true, glow: true },
  'ice-heart': { color: '#9fe3ff', cast: 'shield' },
  'oak-of-ages': { color: '#9fd36b', cast: 'bless' },
  'forest-rebirth': { color: '#8fdc6a', cast: 'heal' },
  'divine-healing': { color: '#ffe9a8', cast: 'heal' },
  'wings-of-light': { color: '#fff2b0', cast: 'shield' },
  // The skeleton Żniwo raises (combat.js RISEN).
  risen: { color: '#8fbf5a', cast: 'poison' },
};

const DEFAULT_LOOK = { color: '#8fe3ef' };
// A skill's look, or that of the skill it stands in with (art.js artChain).
export const lookOf = (event) => artChain(event.skill).map((id) => SKILL_LOOKS[id]).find(Boolean) ?? DEFAULT_LOOK;

// `kit` is what the arena shares: its cards, its effects layer and its
// animation helpers, so every animation here can be cancelled with the rest,
// and its measures: where an element stands on the arena's stage as its box
// (`boxOf`) or its middle (`centerOf`), by the page's layout, so the camera's
// zoom (arena-fx.js) does not shift them.
// The new looks of 956 (the author: „Sprawdź te [animacje] od umiejętności
// zaczynając od podstawowych”, „świetne nowe animacje niech zostają”):
// every skill drawn as a basic one is drawn the new way, the evolutions'
// skills in the looks they share with it too. A fireball flies in an arc and
// bursts; a gust of frost comes as a cone of snow and rimes the foes; a
// shield is a wall of hexagons over the card; an aimed shot locks a sight on
// its target and pierces it; a pinning shot leaves its arrow quivering in
// the ground with a coil of rope; a sweep is a giant blade's crescent; a
// guard brings a golden shield down. The arrows' rain is a volley loosed into
// the sky (the archers' rains only), and the warriors' heavy blows crack
// the ground.
for (const look of Object.values(SKILL_LOOKS)) {
  if (look.impact === 'fire') look.orb = 'fire';
  if (look.cast === 'frost') look.blizzard = true;
  if (look.cast === 'shield') look.hexwall = true;
  if (look.impact === 'aim') look.reticle = true;
  if (look.impact === 'pin') look.pinned = true;
  if (look.cast === 'sweep') look.crescent = true;
  if (look.cast === 'guard') look.emblem = true;
}
for (const id of ['arrow-rain', 'arrow-storm', 'sky-thunder']) SKILL_LOOKS[id].volley = true;
for (const id of ['power-strike', 'crushing-blow', 'shattering-blow']) SKILL_LOOKS[id].quake = true;
// The Kleryk's and the Cień's basic skills (956.10–956.15, the author: "wszystkie
// nowe super"): a beam of light on the healed ally, circles of runes and
// pillars of light under the foes, a golden halo with falling feathers, a
// strike out of shadow smoke, venom coating the blade and a dance of shadow
// afterimages. The evolved classes' skills of the same kinds keep their
// looks until their own turn (the author: animations of the evolved
// classes after the basic ones).
SKILL_LOOKS['prayer-of-health'].lightfall = true;
SKILL_LOOKS.exorcism.runes = true;
SKILL_LOOKS.blessing.halo = true;
SKILL_LOOKS.backstab.smoke = true;
SKILL_LOOKS['poisoned-blade'].venom = true;
SKILL_LOOKS['shadow-dance'].afterimages = true;

// The evolved Mag's skills in looks of their own (960.1–960.18, the
// author: "Wszystko super").
// The summons: a circle opens on the ground and the creature's card comes
// its own way.
SKILL_LOOKS['oak-awakening'].arrival = 'oak';
SKILL_LOOKS['bison-call'].arrival = 'aurochs';
SKILL_LOOKS['elemental-summon'].arrival = 'elemental';
SKILL_LOOKS['ent-summon'].arrival = 'ent';
SKILL_LOOKS['bear-summon'].arrival = 'bear';
// Burning boulders from the sky; lightning and ice with them in the
// Kataklizm.
SKILL_LOOKS['meteor-shower'].meteors = 'fire';
SKILL_LOOKS.cataclysm.meteors = 'cataclysm';
SKILL_LOOKS['elemental-harmony'].harmony = true;
SKILL_LOOKS['mana-mirror'].mirror = true;
SKILL_LOOKS['elemental-shield'].orbit = true;
SKILL_LOOKS['ice-armor'].icearmor = true;
SKILL_LOOKS['fire-burst'].splash = true;
SKILL_LOOKS['elemental-ray'].braid = true;
SKILL_LOOKS['ice-storm'].icefall = true;
SKILL_LOOKS.blizzard.snowstorm = true;
SKILL_LOOKS['ice-tomb'].tomb = true;
// A star of ice and a lance of ice fly instead of a spell's light
// (arena-fx.js strike()).
SKILL_LOOKS['ice-star'].orb = 'ice-star';
SKILL_LOOKS['ice-lance'].orb = 'ice-lance';
// The light the blows of these skills land in (arena-fx.js kindOf()),
// and the sweeps whose cast has already struck every foe: their hits
// only light the foes up, without a second burst.
for (const [id, kind] of [
  ['meteor-shower', 'fire'],
  ['cataclysm', 'fire'],
  ['elemental-ray', 'arcane'],
  ['ice-star', 'frost'],
  ['ice-lance', 'frost'],
]) {
  SKILL_LOOKS[id].kind = kind;
}
for (const id of ['meteor-shower', 'cataclysm', 'elemental-ray', 'ice-storm']) SKILL_LOOKS[id].struck = true;

// The evolved Łucznik's skills in looks of their own (961.1–961.18, the
// author: "wszystko super"). After the 0.3.43 loop: `reticle: false` and
// `pinned: false` override what it sets.
// A barbed head lodged in the foe, which bleeds; a harpoon on its rope,
// which yanks the foe toward its hunter (arena-fx.js strike(), hit()).
Object.assign(SKILL_LOOKS['barbed-arrow'], { barbs: true, pinned: false });
Object.assign(SKILL_LOOKS.harpoon, { orb: 'harpoon', pinned: false });
// Birds diving out of the sky instead of an arrow: the Łowca's falcon
// pecks, the Władca Puszczy's eagle rakes with its talons.
Object.assign(SKILL_LOOKS.falcon, { orb: 'falcon', wake: 'falcon' });
Object.assign(SKILL_LOOKS['eagle-talon'], { orb: 'eagle', impact: 'talons', pinned: false });
// The wolves come at the hunter's whistle and bite their foes.
Object.assign(SKILL_LOOKS['wolf-call'], { arrival: 'wolf', orb: 'bite', kind: 'physical' });
Object.assign(SKILL_LOOKS['pack-leader'], { arrival: 'alpha-wolf', orb: 'bite', kind: 'physical' });
// Shots that go on through their target into those behind it, without
// being aimed again.
Object.assign(SKILL_LOOKS['piercing-shot'], { orb: 'pierce', through: true });
Object.assign(SKILL_LOOKS['heart-shot'], { orb: 'heart', through: true, reticle: false, heart: true });
Object.assign(SKILL_LOOKS['master-shot'], { orb: 'master', through: true, reticle: false, sightline: true });
Object.assign(SKILL_LOOKS['ambush-shot'], { orb: 'ambush', reticle: false, hidden: true });
SKILL_LOOKS['steady-hand'].focus = true;
SKILL_LOOKS['target-lock'].lock = true;
// The storm's violet lightning (arena-fx.js KINDS.storm).
Object.assign(SKILL_LOOKS['arrow-storm'], { storm: 'arrows', kind: 'storm', struck: true });
Object.assign(SKILL_LOOKS['sky-thunder'], { storm: 'thunder', kind: 'storm', struck: true });
Object.assign(SKILL_LOOKS['perun-wrath'], { storm: 'wrath', kind: 'storm', struck: true });
Object.assign(SKILL_LOOKS['storm-cloud'], { cloud: true, kind: 'storm', struck: true });
Object.assign(SKILL_LOOKS['thunder-orb'], { orb: 'thunder-orb', wake: 'thunder-orb', kind: 'storm', impact: 'zap', reticle: false });
SKILL_LOOKS['thunder-sign'].rune = 'thunder';
// The archer's creatures that come at a whistle, not out of a circle.
const HUNT_CALLS = new Set(['wolf', 'alpha-wolf']);

// The evolved Wojownik's skills in looks of their own (962.1–962.18, the
// author: "Wszystkie animacje zaakceptowane"). After the 0.3.43 loop:
// `quake`, `crescent`, `emblem` and `hexwall` set to false override what
// it set.
// The heavy blows: the Barbarzyńca's slams its foe into the ground, the
// Berserker's shatters its armour, the Pogromca Hord's crushes it and
// its force goes on into the one behind (arena-fx.js smashOn()). A foe
// they stun sees stars (daze()).
Object.assign(SKILL_LOOKS['crushing-blow'], { quake: false, slam: true, dazed: true });
Object.assign(SKILL_LOOKS['shattering-blow'], { quake: false, shatter: true, dazed: true });
Object.assign(SKILL_LOOKS['smashing-blow'], { smash: true, orb: 'smash', through: true, dazed: true });
// The sweeps: the Gladiator's blade circling it in a ring of steel that
// goes out over the foes, the Czempion's spin ending in one flash that
// cuts every foe at once, swords flying out of the Legenda into a storm
// round the foes (twice), the Pogromca's cuts raining on the horde, and
// the ground cracking under the foes.
// (arena.js sweepOf() tells these looks the foes the blows reach and the
// Huragan stali's turn.)
Object.assign(SKILL_LOOKS.millstone, { crescent: false, millstone: true });
Object.assign(SKILL_LOOKS['steel-whirl'], { crescent: false, whirl: true });
Object.assign(SKILL_LOOKS['steel-hurricane'], { crescent: false, hurricane: true });
Object.assign(SKILL_LOOKS.slaughter, { crescent: false, slaughter: true });
Object.assign(SKILL_LOOKS.earthquake, { crescent: false, earthquake: true, dazed: true });
// The guards: the card bristling with golden spikes, wounds sealed with
// gold, a skin of stone.
Object.assign(SKILL_LOOKS.indomitable, { emblem: false, thorns: true });
Object.assign(SKILL_LOOKS.unbending, { emblem: false, seams: true });
Object.assign(SKILL_LOOKS.unbroken, { emblem: false, statue: true });
// The stances: a rage of blood, a challenge every foe answers, a roar
// that drives the foes back, a wall of shields before the party and the
// crowd's cheers.
SKILL_LOOKS['blood-frenzy'].frenzy = true;
SKILL_LOOKS.challenge.taunt = true;
SKILL_LOOKS['berserker-roar'].roar = true;
Object.assign(SKILL_LOOKS['shield-wall'], { hexwall: false, shieldwall: true });
SKILL_LOOKS.cheers.cheers = true;
// The Gladiator's guard at the fight's start, its parry and counter-cut;
// the Czempion's duel with the strongest foe.
SKILL_LOOKS.riposte.parry = true;
SKILL_LOOKS.duel.duel = true;

// The evolved Kleryk's skills in looks of their own (963.1–963.18).
// The party heals (arena.js healOf() tells their heals the party and
// which of it each heals): sprouts growing out of the ground (Odnowa),
// light rising up every card (Wielka odnowa), ribbons of light out of an
// orb over the Święty (Cudowne uzdrowienie); and the Cud's wings.
SKILL_LOOKS.renewal.sprout = true;
SKILL_LOOKS['great-renewal'].uplift = true;
SKILL_LOOKS['miraculous-healing'].radiance = true;
SKILL_LOOKS.miracle.wings = true;
// The holy blows: the sword of the sentence from above (Wyrok), a spear
// of holy fire (Ostateczny wyrok), the opened sky's beam (Sąd
// ostateczny), a burning seal (Pieczęć świętości) (arena-fx.js strike()).
Object.assign(SKILL_LOOKS.verdict, { orb: 'sentence', sentence: true });
Object.assign(SKILL_LOOKS['final-verdict'], { orb: 'holy-spear', holyfire: true });
Object.assign(SKILL_LOOKS['last-judgment'], { orb: 'heavens', heavens: true });
Object.assign(SKILL_LOOKS['holy-seal'], { seal: true, struck: true });
// Over the foes: a lash of light and its brands, chains for its
// paralysis (Sąd); the Święty's sun (Święte światło); the pyre under
// every foe (Stos). Their blows only light the foes up after.
Object.assign(SKILL_LOOKS.judgement, { lash: true, chained: true, struck: true });
Object.assign(SKILL_LOOKS['holy-light'], { sun: true, struck: true });
Object.assign(SKILL_LOOKS.pyre, { pyre: true, struck: true });
// Over the party: golden ribbons and lighter feet (Wielkie
// błogosławieństwo), notes of a song (Psalm), a warm light (Aura życia),
// unseen singers (Chór), horns and laurels (Hymn), an eye that sees the
// blows coming (Wizja) and a golden dome (Boska ochrona).
SKILL_LOOKS['great-blessing'].anoint = true;
SKILL_LOOKS.psalm.notes = true;
SKILL_LOOKS['life-aura'].breath = true;
SKILL_LOOKS.choir.voices = true;
SKILL_LOOKS.hymn.laurels = true;
SKILL_LOOKS.vision.foresight = true;
Object.assign(SKILL_LOOKS['divine-shield'], { hexwall: false, dome: true });

// The evolved Cień's skills in looks of their own (964.1–964.18). After
// the 0.3.43 loop: `crescent: false` overrides what it set.
// The blows out of the shadows: pools of shadow and an executioner's
// chop (Egzekucja), a line and one clean cut across (Ścięcie), time
// stopped and a crescent cleave (Cios ostateczny); an hourglass that
// counts the wounds and gives them back (Znak śmierci); a red cut and a
// rune of blood (Krwawy znak).
Object.assign(SKILL_LOOKS.execution, { executioner: true, chop: true });
// (Only the Egzekucja comes out of the shadows by its foe: the Ścięcie
// cuts across the field, the Cios ostateczny walks through stopped time,
// arena-fx.js strike().)
Object.assign(SKILL_LOOKS.beheading, { behead: true, teleport: false, orb: 'crosscut' });
Object.assign(SKILL_LOOKS['final-blow'], { cleave: true, teleport: false, orb: 'timewalk' });
Object.assign(SKILL_LOOKS['death-mark'], { hourglass: true, echo: true });
SKILL_LOOKS['blood-mark'].bloodcut = true;
// The venoms and the dead: a vial of black venom (Czarny jad), a slime
// out of a puddle that spits and bursts (Trujący Szlam), the dead out of
// a necromancer's circle with venomed blades (Wskrzeszenie, Armia
// umarłych), whispers and rot (Klątwa rozkładu), a hand of bone (Dotyk
// śmierci) (arena-fx.js strike()).
SKILL_LOOKS['black-venom'].blackvenom = true;
Object.assign(SKILL_LOOKS['toxic-slime'], { arrival: 'slime', spit: true });
Object.assign(SKILL_LOOKS['raise-dead'], { arrival: 'skeleton', orb: 'lunge', rot: 'skeleton' });
Object.assign(SKILL_LOOKS['army-of-dead'], { arrival: 'army', orb: 'lunge', rot: 'knight' });
SKILL_LOOKS['curse-of-decay'].curse = true;
SKILL_LOOKS['death-touch'].orb = 'touch';
// The whirls: a shadow dashing foe to foe (Wir cieni), a rain of blades
// (Burza ostrzy), shadows rising by the foes (Nawałnica cieni).
Object.assign(SKILL_LOOKS['shadow-whirl'], { crescent: false, shadowwhirl: true });
Object.assign(SKILL_LOOKS['blade-storm'], { crescent: false, bladerain: true });
Object.assign(SKILL_LOOKS['shadow-storm'], { crescent: false, legion: true });
// The stances: a ring of daggers that fly at the foes after its dodges
// (Taniec ostrzy), melting into the shadows (Zniknięcie), a shadow that
// stands up and repeats the blows (Cień-sobowtór), the sun put out
// (Zaćmienie). A stance's mark stays on its card while it holds
// (`stance`, arena.js stanceDown()).
Object.assign(SKILL_LOOKS['blade-dance'], { bladering: true, orb: 'thrown' });
Object.assign(SKILL_LOOKS.vanish, { vanishing: true, stance: 'unit--vanished' });
Object.assign(SKILL_LOOKS['shadow-double'], { doubling: true, stance: 'unit--doubled', orb: 'double' });
SKILL_LOOKS.eclipse.darksun = true;

// The fourth forms' skills in looks of their own (the author: „wszystkie
// umiejętności nowe muszą mieć też nowe animacje”). After the 0.3.43 loop:
// `crescent`, `hexwall` and `reticle` set to false override what it set.
// The Burzyciel: a forge-hot rampage whose cleaves split every foe's
// armour (Pogrom); one blow that opens a molten rift in its foe and
// tears on into the one behind, then breaks its shield (Wyłom).
Object.assign(SKILL_LOOKS.carnage, { crescent: false, carnage: true });
Object.assign(SKILL_LOOKS.breach, { breach: true, dazed: true });
// The Nieśmiertelny: three spins of golden blades, the crowd roaring at
// the third (Huragan chwały); a laurel thrown on the strongest foe, a
// golden cut and a golden bond between them (Wyzwanie czempiona).
Object.assign(SKILL_LOOKS['glory-hurricane'], { crescent: false, glory: true });
SKILL_LOOKS['champion-challenge'].challenger = true;
// The Tytan: its tower shield slammed into the ground and pillars of rune
// stone under every foe (Gniew góry); the tower shield rising over the
// party as a rampart of light (Tarcza tytana).
Object.assign(SKILL_LOOKS['mountain-wrath'], { crescent: false, mountain: true, dazed: true });
// (The Tytan's card keeps the shield's rim while the Tarcza tytana holds.)
Object.assign(SKILL_LOOKS['titan-shield'], { hexwall: false, rampart: true, stance: 'unit--shielded' });
// The Niebiański Łucznik: a star over its bow and an arrow like a falling
// star through the whole formation (Strzała z niebios); a handful of
// arrows into a night sky, falling back as shooting stars (Deszcz gwiazd).
Object.assign(SKILL_LOOKS['heaven-arrow'], { orb: 'master', through: true, reticle: false, comet: true });
Object.assign(SKILL_LOOKS['star-rain'], { starfall: true, struck: true });
// The Gromowładny: the sky splitting and Perun's golden lightning leaping
// from foe to foe (Burza Peruna); a great ball of lightning over the
// battlefield striking the strongest foe (Kula piorunów). A foe they stun
// crackles (jolt()).
Object.assign(SKILL_LOOKS['perun-storm'], { skysplit: true, kind: 'storm', struck: true, jolted: true });
Object.assign(SKILL_LOOKS['ball-lightning'], { orb: 'globe', wake: 'globe', kind: 'storm', impact: 'zap', reticle: false, jolted: true });
// The Pan Zwierząt: the white wolf howling at a full moon, the party fired
// up, its bites bleeding (Wódz watahy); the brown bear rearing up with a
// roar, its paw raking three claw marks (Zew niedźwiedzia).
Object.assign(SKILL_LOOKS['pack-chief'], { arrival: 'alpha-wolf', orb: 'bite', kind: 'physical', chief: true });
Object.assign(SKILL_LOOKS['bear-call'], { arrival: 'bear', orb: 'maul', kind: 'physical', grizzly: true, dazed: true });
// The Stwórca Żywiołów: fire, ice, lightning and boulders falling at once
// out of a dark sky (Pierwotny chaos); four orbs of the elements sinking
// into the elemental, its blows bursting in all four colours (Żywiołak).
Object.assign(SKILL_LOOKS['primal-chaos'], { chaos: true, struck: true, dazed: true });
Object.assign(SKILL_LOOKS.elemental, { arrival: 'elemental', prism: true });
// The Lodowy Bóg: a great crystal of ice growing over its foe (Lodowa
// wieczność); a heart of ice bursting into armour (Lodowe serce).
Object.assign(SKILL_LOOKS['ice-eternity'], { orb: 'ice-lance', eternity: true, reticle: false });
Object.assign(SKILL_LOOKS['ice-heart'], { iceheart: true, stance: 'unit--shielded' });
// The Pradruid: the ancient oak with roots under the whole field, its
// branches lashing and roots twining up its foe (Dąb wieków); the forest
// breathing in, vines blossoming on every card (Odrodzenie puszczy).
Object.assign(SKILL_LOOKS['oak-of-ages'], { arrival: 'oak', orb: 'lash', kind: 'physical', ancient: true });
SKILL_LOOKS['forest-rebirth'].rebirth = true;
// The Archanioł: wings of light and a rain of light over the party
// (Boskie uzdrowienie); wings of light shielding every card (Skrzydła
// światłości).
SKILL_LOOKS['divine-healing'].divine = true;
SKILL_LOOKS['wings-of-light'].lightwings = true;

// 960: the summoning circles, drawn flat on the ground. A druid's: two
// rings, a wreath of leaves between them and a triskele inside; an
// arcanist's: two rings, runes and a star of two triangles.
const DRUID_CIRCLE = (() => {
  const leaf = 'M0 -4.6C2.9 -2.4 2.9 2.4 0 4.6C-2.9 2.4 -2.9 -2.4 0 -4.6ZM0 -4.6V4.6';
  const wreath = Array.from({ length: 12 }, (_, k) => `<path d="${leaf}" transform="rotate(${k * 30}) translate(0 -38.5) rotate(70)"/>`).join('');
  const arm = (turn) => {
    const points = Array.from({ length: 15 }, (_, step) => {
      const share = step / 14;
      const angle = ((turn + share * 250) * Math.PI) / 180;
      const radius = 3 + share * 22;
      return `${(Math.cos(angle) * radius).toFixed(1)} ${(Math.sin(angle) * radius).toFixed(1)}`;
    });
    return `<path d="M${points.join('L')}"/>`;
  };
  return (
    '<svg viewBox="-50 -50 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle r="46" stroke-width="3.2"/><circle r="31" stroke-width="2"/>' +
    `<g stroke-width="1.7">${wreath}</g><g stroke-width="2.4">${[0, 120, 240].map(arm).join('')}</g></g></svg>`
  );
})();
const ARCANE_CIRCLE = (() => {
  const glyphs = ['M-2.5 -3.5V3.5M-2.5 -3.5L2.5 -1L-2.5 1.5', 'M-2.5 3.5L0 -3.5L2.5 3.5M-1.3 0.6H1.3', 'M0 -3.5V3.5M-2.5 -1.5L2.5 1.5', 'M-2.5 -3.5L2.5 3.5M2.5 -3.5L0 0', 'M2.5 -3.5H-2.5V3.5H2.5', 'M-2.5 3.5V-3.5L2.5 3.5V-3.5'];
  const runes = Array.from({ length: 12 }, (_, k) => `<path d="${glyphs[(k * 5) % glyphs.length]}" transform="rotate(${k * 30 + 15}) translate(0 -38.5)"/>`).join('');
  const triangle = (turn) =>
    Array.from({ length: 3 }, (_, k) => {
      const angle = ((k * 120 + turn - 90) * Math.PI) / 180;
      return `${(Math.cos(angle) * 29).toFixed(1)},${(Math.sin(angle) * 29).toFixed(1)}`;
    }).join(' ');
  return (
    '<svg viewBox="-50 -50 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle r="46" stroke-width="3.2"/><circle r="31" stroke-width="2"/>' +
    `<g stroke-width="2.2">${runes}</g>` +
    `<polygon points="${triangle(0)}" stroke-width="1.8"/><polygon points="${triangle(60)}" stroke-width="1.8"/>` +
    '<circle r="9" stroke-width="1.8"/></g></svg>'
  );
})();

// A leaf (the druids' summons), in one of the greens.
const LEAF = (fill) =>
  '<svg viewBox="0 0 10 16" aria-hidden="true">' +
  `<path d="M5 0.6C8.8 3.4 9.6 9.2 5.7 15.4H4.3C0.4 9.2 1.2 3.4 5 0.6Z" fill="${fill}" stroke="#24300f" stroke-width="0.8"/>` +
  '<path d="M5 2.6V14.8" stroke="#e4f0b0" stroke-width="0.7" opacity="0.7"/></svg>';
const LEAVES = ['#6f9a3a', '#8bbf4a', '#5c8a2e', '#a6c45a'];
const THICKET = ['#5c8a2e', '#6f9a3a', '#4f7a22', '#8bbf4a'];
const TWIGS = ['#6b4f2a', '#8a6a3a', '#4a3520'];
const MANA = ['#ffffff', '#c8f4fa', '#8fd3ff'];
const BOLT = ['#ffffff', '#fff7c2', '#f2e36b'];

// A wave of a roar (the Niedźwiedź's coming): the top of a circle.
const ROAR =
  '<svg viewBox="-50 -50 100 100" aria-hidden="true"><path d="M-30.6 -25.7A40 40 0 0 1 30.6 -25.7" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>';

// A whirl of mana and flame (the Żywiołak's coming): four spiral arms.
const VORTEX = (() => {
  const arm = (turn, width, color) => {
    const points = Array.from({ length: 19 }, (_, step) => {
      const share = step / 18;
      const angle = ((turn + share * 300) * Math.PI) / 180;
      const radius = 47 - share * 40;
      return `${(Math.cos(angle) * radius).toFixed(1)} ${(Math.sin(angle) * radius).toFixed(1)}`;
    });
    return `<path d="M${points.join('L')}" stroke="${color}" stroke-width="${width}"/>`;
  };
  const arms = [0, 90, 180, 270].map((turn, k) => arm(turn, 6, '#18304d') + arm(turn + 3, 2.2, k % 2 ? '#ffb36b' : '#bfe8ff')).join('');
  return `<svg viewBox="-50 -50 100 100" aria-hidden="true"><g fill="none" stroke-linecap="round" stroke-linejoin="round">${arms}</g></svg>`;
})();

// A star of ice with sharp arms (the Lodowa gwiazda's and the Lodowa
// nawałnica's): six long arms, six short ones and a bright heart.
export const ICE_STAR = (() => {
  const arm = (angle, length, width) => `<path d="M0 0L${width} ${(-length * 0.32).toFixed(1)}L0 ${-length}L${-width} ${(-length * 0.32).toFixed(1)}Z" transform="rotate(${angle})"/>`;
  const long = [0, 60, 120, 180, 240, 300].map((angle) => arm(angle, 47, 8)).join('');
  const short = [30, 90, 150, 210, 270, 330].map((angle) => arm(angle, 25, 5.5)).join('');
  const spines = [0, 60, 120].map((angle) => `<path d="M0 -40V40" transform="rotate(${angle})"/>`).join('');
  return (
    `<svg viewBox="-50 -50 100 100" aria-hidden="true"><g fill="#e6f7ff" stroke="#4fa8e0" stroke-width="2.4" stroke-linejoin="round">${short}${long}</g>` +
    `<g stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" opacity="0.85">${spines}</g><circle r="6" fill="#ffffff" stroke="#9fd8ff" stroke-width="2"/></svg>`
  );
})();

// One arm of a star of ice, flying off as it breaks.
const ICE_SHARD = '<svg viewBox="-6 -24 12 26" aria-hidden="true"><path d="M0 0L5 -8L0 -23L-5 -8Z" fill="#e6f7ff" stroke="#4fa8e0" stroke-width="1.6" stroke-linejoin="round"/><path d="M0 -3V-20" stroke="#ffffff" stroke-width="1.1" stroke-linecap="round"/></svg>';

// A lance of ice, its point to the right (the Lodowa włócznia's).
export const ICE_LANCE =
  '<svg viewBox="0 0 120 24" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="fx-lance-ice" x1="0" y1="0" x2="0" y2="1">' +
  '<stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="#d8f2ff"/><stop offset="1" stop-color="#7cc4ee"/></linearGradient></defs>' +
  '<path d="M1 12L9 6.5L14 9L82 7L119 12L82 17L14 15L9 17.5Z" fill="url(#fx-lance-ice)" stroke="#3f8fc8" stroke-width="1.4" stroke-linejoin="round"/>' +
  '<path d="M14 12H112" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round"/>' +
  '<path d="M30 8.6L38 15.4M52 8L60 16M72 7.6L80 16.2" stroke="#ffffff" stroke-width="0.8" opacity="0.7"/></svg>';

// Cracks running out from a point, as in glass or ice (a star of ice
// breaking on its foe, a tomb of ice cracking): jagged lines, each
// branching once.
function cracksArt(seed, rays = 7) {
  let value = seed;
  const random = () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
  const lines = [];
  for (let index = 0; index < rays; index++) {
    const angle = (index / rays) * Math.PI * 2 + random() * 0.5;
    let x = 0;
    let y = 0;
    let d = 'M0 0';
    for (let step = 1; step <= 4; step++) {
      const reach = step * 11 + random() * 4;
      const bend = angle + (random() - 0.5) * 0.7;
      x = Math.cos(bend) * reach;
      y = Math.sin(bend) * reach;
      d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
      if (step === 2) {
        const side = angle + (random() < 0.5 ? -0.9 : 0.9);
        lines.push(`M${x.toFixed(1)} ${y.toFixed(1)}L${(x + Math.cos(side) * 12).toFixed(1)} ${(y + Math.sin(side) * 12).toFixed(1)}`);
      }
    }
    lines.push(d);
  }
  return (
    '<svg viewBox="-50 -50 100 100" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' +
    lines.map((d) => `<path d="${d}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`).join('') +
    '</g></svg>'
  );
}
const GLASS_CRACKS = cracksArt(7);
const TOMB_CRACKS = cracksArt(23, 6);

// The faces of a block of ice (the Lodowy grobowiec): a few lines of its
// facets and the shine on its edges, stretched over the block.
const TOMB_FACETS =
  '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="#ffffff" stroke-linecap="round">' +
  '<path d="M0 24L30 12L58 28L100 16" stroke-width="1.4" opacity="0.75" vector-effect="non-scaling-stroke"/>' +
  '<path d="M30 12L36 100M58 28L64 100" stroke-width="1" opacity="0.4" vector-effect="non-scaling-stroke"/>' +
  '<path d="M9 36L14 84M88 30L92 70" stroke-width="2.4" opacity="0.55" vector-effect="non-scaling-stroke"/></g></svg>';

// The three elements circling the Tarcza żywiołów: a flame, a shard of
// ice and a spark of lightning.
const FLAME =
  '<svg viewBox="0 0 20 28" aria-hidden="true"><path d="M10 1C13 7 18 10 18 17C18 23 14.5 27 10 27C5.5 27 2 23 2 17C2 12 6 10 7 5C8.5 8 9.5 9 10 1Z" fill="#ff7a2e"/>' +
  '<path d="M10 10C12 14 14.5 15.5 14.5 19.5C14.5 23 12.5 25 10 25C7.5 25 5.5 23 5.5 19.5C5.5 16.5 8 15 10 10Z" fill="#ffd27a"/>' +
  '<path d="M10 17C11 19 12 20 12 21.6C12 23.2 11.1 24 10 24C8.9 24 8 23.2 8 21.6C8 20 9.2 19 10 17Z" fill="#fff6d6"/></svg>';
const FROST_SHARD =
  '<svg viewBox="0 0 20 28" aria-hidden="true"><path d="M10 1L15.5 9L13 25L10 27L7 25L4.5 9Z" fill="#e6f7ff" stroke="#4fa8e0" stroke-width="1.4" stroke-linejoin="round"/>' +
  '<path d="M10 3.5V24.5M4.5 9L15.5 9" stroke="#ffffff" stroke-width="1" stroke-linecap="round"/></svg>';
const SPARK_BOLT =
  '<svg viewBox="0 0 20 28" aria-hidden="true"><path d="M12.5 1L3 16H9.2L6.8 27L17 10.6H10.8L14.6 1Z" fill="#fff3a0" stroke="#d9a520" stroke-width="1.3" stroke-linejoin="round"/></svg>';

// The Promień Żywiołów: three strands, fire, frost and lightning, twisting
// round a white core; the strands run toward the foes (their group
// moves).
const RAY = (() => {
  const wave = (phase) => {
    const points = [];
    for (let x = 0; x <= 260; x += 2.5) points.push(`${x} ${(10 + Math.sin((x / 26) * Math.PI * 2 + phase) * 6).toFixed(2)}`);
    return `M${points.join('L')}`;
  };
  const strands = [
    ['#ff7a2e', 0],
    ['#8fd3ff', (Math.PI * 2) / 3],
    ['#f2e36b', (Math.PI * 4) / 3],
  ]
    .map(([color, phase]) => `<path d="${wave(phase)}" stroke="${color}" stroke-width="2.6" vector-effect="non-scaling-stroke"/>`)
    .join('');
  return (
    '<svg viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true">' +
    '<path d="M0 10H200" stroke="#fff3d6" stroke-width="9" stroke-linecap="round" opacity="0.32" vector-effect="non-scaling-stroke"/>' +
    `<g class="fx-ray-strands" fill="none" stroke-linecap="round">${strands}</g>` +
    '<path d="M0 10H200" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>'
  );
})();

// A flat ring in the three elements' colours (the Tarcza żywiołów's).
const ELEMENT_RING =
  '<svg viewBox="-50 -50 100 100" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke">' +
  '<circle r="46" pathLength="300" stroke="#ff8a3d" stroke-dasharray="96 204" vector-effect="non-scaling-stroke"/>' +
  '<circle r="46" pathLength="300" stroke="#8fd3ff" stroke-dasharray="96 204" stroke-dashoffset="-100" vector-effect="non-scaling-stroke"/>' +
  '<circle r="46" pathLength="300" stroke="#f2e36b" stroke-dasharray="96 204" stroke-dashoffset="-200" vector-effect="non-scaling-stroke"/></g></svg>';

const DUST = ['#b9a98f', '#8f816b', '#d8cbb0'];
const STONE = ['#8a8274', '#6f675b', '#a39a89'];

// A sight's four corners, a ring and a dot (the Celny strzał's look).
const RETICLE =
  '<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="square">' +
  '<path d="M8 30V8h22M70 8h22v22M92 70v22H70M30 92H8V70"/></g>' +
  '<circle cx="50" cy="50" r="26" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="7 6"/>' +
  '<circle cx="50" cy="50" r="4" fill="currentColor"/></svg>';

// Cracks in the ground from a point (the Potężny cios's look).
const CRACKS =
  '<svg viewBox="-50 -20 100 40" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M0 0l-9 3-6-4-10 5-8-2-12 6"/><path d="M0 0l10 2 5-5 11 4 9-3 13 5"/><path d="M0 0l-3 8-7 4-2 7"/><path d="M0 0l4 9 8 3 1 6"/>' +
  '<path d="M-15 -1l-4-7-7-3"/><path d="M16 -3l3-8 8-2"/></g></svg>';

// A heater shield with a cross (the Nieugięty's look).
const EMBLEM =
  '<svg viewBox="0 0 60 72" aria-hidden="true"><path d="M30 3 L55 11 L55 34 C55 52 43 63 30 69 C17 63 5 52 5 34 L5 11 Z" fill="rgba(60,44,12,0.55)" stroke="currentColor" stroke-width="4"/>' +
  '<path d="M30 14 V58 M15 30 H45" stroke="currentColor" stroke-width="6" stroke-linecap="round"/></svg>';

const FIRE = ['#fff1c1', '#ffd27a', '#ff8a3d', '#ff5a1f'];
const SMOKE = ['#4a3d35', '#5d4c40', '#3a312b'];
const ICE = ['#ffffff', '#e4f6ff', '#bfe8ff', '#8fd3ff'];
const LIFE = ['#ffffff', '#e3f5a8', '#b6e388', '#7fd36b'];
const HOLY = ['#ffffff', '#fff6cf', '#f2d675'];
const GOLD = ['#fff6cf', '#ffe08a', '#f2d675', '#e8c76a'];
const SHADE = ['#2a2040', '#3a2c58', '#1e1730'];
const SHADE_SPARKS = ['#efe8ff', '#c9b7ff', '#a690e8'];
const VENOM = ['#eaffc0', '#c5f08a', '#9ccc65', '#6f9a3a'];
// The venom's band on a blade's icon (the Zatrute ostrze's look): between
// the guard's line and a line across the blade that moves to the point.
const VENOM_FROM = 'polygon(-100% -72%, 200% 228%, 200% 228%, -100% -72%)';
const VENOM_TO = 'polygon(-100% -72%, 200% 228%, 200% 100%, -100% -200%)';

// A cross of light (the Modlitwa o zdrowie's look).
const CROSS =
  '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M15 3h10v12h12v10H25v12H15V25H3V15h12z" fill="currentColor" stroke="#ffffff" stroke-width="2.4" stroke-linejoin="round"/>' +
  '<path d="M20 8v24M8 20h24" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" opacity="0.75"/></svg>';

// A circle of runes on the ground (the Egzorcyzm's look): two rings, runes
// between them and an eight-pointed star inside.
const RUNES = (() => {
  const glyphs = ['M-2.5 -3.5V3.5M-2.5 -3.5L2.5 -1L-2.5 1.5', 'M-2.5 3.5L0 -3.5L2.5 3.5M-1.3 0.6H1.3', 'M0 -3.5V3.5M-2.5 -1.5L2.5 1.5', 'M-2.5 -3.5L2.5 3.5M2.5 -3.5L0 0', 'M2.5 -3.5H-2.5V3.5H2.5', 'M-2.5 3.5V-3.5L2.5 3.5V-3.5'];
  const runes = Array.from({ length: 12 }, (_, k) => `<path d="${glyphs[k % glyphs.length]}" transform="rotate(${k * 30}) translate(0 -38.5)"/>`).join('');
  const square = (turn) =>
    Array.from({ length: 4 }, (_, k) => {
      const angle = ((k * 90 + turn) * Math.PI) / 180;
      return `${(Math.cos(angle) * 29).toFixed(1)},${(Math.sin(angle) * 29).toFixed(1)}`;
    }).join(' ');
  return (
    '<svg viewBox="-50 -50 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle r="46" stroke-width="3.2"/><circle r="31" stroke-width="2"/>' +
    `<g stroke-width="2.2">${runes}</g>` +
    `<polygon points="${square(0)}" stroke-width="1.8"/><polygon points="${square(45)}" stroke-width="1.8"/>` +
    '<circle r="7" stroke-width="1.8"/></g></svg>'
  );
})();

// A dark wisp torn out of a foe (the Egzorcyzm's look).
const WISP =
  '<svg viewBox="0 0 20 60" aria-hidden="true"><defs><linearGradient id="fx-wisp-fade" x1="0" y1="1" x2="0" y2="0">' +
  '<stop offset="0" stop-color="#1b1429" stop-opacity="0"/><stop offset="0.35" stop-color="#1b1429"/><stop offset="0.75" stop-color="#2e2347"/><stop offset="1" stop-color="#2e2347" stop-opacity="0"/></linearGradient>' +
  '<linearGradient id="fx-wisp-edge" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#b9a6f0" stop-opacity="0"/><stop offset="0.4" stop-color="#b9a6f0"/><stop offset="1" stop-color="#b9a6f0" stop-opacity="0"/></linearGradient></defs>' +
  '<path d="M10 58C2 47 17 39 10 28C4 19 15 11 10 2" fill="none" stroke="url(#fx-wisp-fade)" stroke-width="7" stroke-linecap="round"/>' +
  '<path d="M10 58C2 47 17 39 10 28C4 19 15 11 10 2" fill="none" stroke="url(#fx-wisp-edge)" stroke-width="1.8" stroke-linecap="round"/></svg>';

// A halo (the Błogosławieństwo's look).
const HALO =
  '<svg viewBox="0 0 60 20" aria-hidden="true"><ellipse cx="30" cy="10" rx="26" ry="6.5" fill="none" stroke="#fff6cf" stroke-width="4.4"/>' +
  '<ellipse cx="30" cy="10" rx="26" ry="6.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

// A white feather with a golden quill, its vane a little bent.
const FEATHER =
  '<svg viewBox="0 0 12 30" aria-hidden="true"><path d="M6.4 1.5C9.6 5 10.6 11 9.4 17C8.6 21 7.4 24 6.6 27L5.8 27C4.4 23 2.2 19 2 14C1.8 8.6 3.6 4.4 6.4 1.5Z" fill="#fffdf6" stroke="#b8902f" stroke-width="0.8"/>' +
  '<path d="M6.2 8L9.4 6.4M6.2 11L9.8 9.2M6.2 14L9.8 12.4M6.1 17L9.2 15.6M6.2 8L2.8 5.8M6.2 11L2.3 9M6.2 14L2.1 12.2M6.1 17L2.5 15.4" stroke="#d9c38a" stroke-width="0.55"/>' +
  '<path d="M6.4 3C6.6 11 6.4 19 6 29" fill="none" stroke="#b8862a" stroke-width="1.2" stroke-linecap="round"/></svg>';

// A four-pointed glint of light.
const GLINT = '<svg viewBox="-10 -10 20 20" aria-hidden="true"><path d="M0 -10L1.8 -1.8L10 0L1.8 1.8L0 10L-1.8 1.8L-10 0L-1.8 -1.8Z" fill="currentColor"/><circle r="2.2" fill="#ffffff"/></svg>';

// A violet cut from behind (the Cios w plecy's look), with a thin echo
// along it: parallel, never a cross (that is the mark of a fallen unit).
const SHADOW_SLASH =
  '<svg viewBox="-50 -50 100 100" aria-hidden="true"><path d="M-49 -23Q-4 -13 49 26Q-10 2 -49 -23Z" fill="#241a38"/>' +
  '<path d="M-46 -21Q-4 -12 46 23Q-8 0 -46 -21Z" fill="currentColor"/>' +
  '<path d="M-42 -18Q-3 -9 42 20" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/>' +
  '<path d="M-38 -5Q0 5 38 30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/></svg>';

// Three spiral arms of a whirl of shadows (the Taniec cieni's look), drawn
// on a circle that the card's box stretches.
const SWIRL = (() => {
  const arm = (turn, width, color) => {
    const points = Array.from({ length: 17 }, (_, step) => {
      const share = step / 16;
      const angle = ((turn + share * 160) * Math.PI) / 180;
      const radius = 47 - share * 25;
      return `${(Math.cos(angle) * radius).toFixed(1)} ${(Math.sin(angle) * radius).toFixed(1)}`;
    });
    return `<path d="M${points.join('L')}" stroke="${color}" stroke-width="${width}" vector-effect="non-scaling-stroke"/>`;
  };
  const arms = [0, 120, 240].map((turn) => arm(turn, 6, '#241a38') + arm(turn + 4, 1.8, '#c9b7ff')).join('');
  return `<svg viewBox="-50 -50 100 100" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke-linecap="round" stroke-linejoin="round">${arms}</g></svg>`;
})();

// Hexagons in the skill's colour over the Osłona many's wall (its new
// look), as an inline SVG pattern (the page's rules allow no image made of
// data).
let hexPatterns = 0;
const hexPattern = (color) => {
  const r = 7;
  const w = Math.sqrt(3) * r;
  const hex = (cx, cy) =>
    Array.from({ length: 6 }, (_, k) => {
      const angle = Math.PI / 6 + (k * Math.PI) / 3;
      return `${(cx + Math.cos(angle) * r).toFixed(2)},${(cy + Math.sin(angle) * r).toFixed(2)}`;
    }).join(' ');
  const cells = [hex(w / 2, r), hex(0, r * 2.5), hex(w, r * 2.5), hex(w / 2, r * 4)].map((points) => `<polygon points="${points}"/>`).join('');
  const id = `fx-hex-${(hexPatterns += 1)}`;
  return (
    `<svg width="100%" height="100%" aria-hidden="true"><defs><pattern id="${id}" width="${w.toFixed(2)}" height="${(r * 3).toFixed(2)}" patternUnits="userSpaceOnUse">` +
    `<g fill="none" stroke="${color}" stroke-width="1" stroke-opacity="0.85">${cells}</g></pattern></defs><rect width="100%" height="100%" fill="url(#${id})"/></svg>`
  );
};

// 961: the evolved Łucznik's looks: blood, the storm's violet lightning
// and the brown of a bird's feathers.
const BLOOD = ['#ff8a7a', '#d9534f', '#b3263b', '#7a1424'];
const STORM = ['#ffffff', '#ece6ff', '#c9b7ff', '#9fb8ff'];
const PLUMAGE = ['#8a6a45', '#c8a87a', '#5c4024'];

// A barbed arrow, its point to the right (the Grot z zadziorem): the
// shaft, its fletching and a head whose two hooks turn back.
const BARBED_ARROW =
  '<svg viewBox="0 0 64 16" aria-hidden="true">' +
  '<path d="M7 8H50" stroke="#3e2a18" stroke-width="3.2" stroke-linecap="round"/>' +
  '<path d="M7 8H50" stroke="#d8ad6e" stroke-width="1.5" stroke-linecap="round"/>' +
  '<path d="M1.5 8L7 3.2H13L9 8L13 12.8H7Z" fill="#fbf6ea" stroke="#5a4630" stroke-width="0.8" stroke-linejoin="round"/>' +
  '<path d="M63 8L53 3.4L46.2 0.9L50.4 6.1L47.6 8L50.4 9.9L46.2 15.1L53 12.6Z" fill="#cfd4dc" stroke="#2a2d34" stroke-width="0.9" stroke-linejoin="round"/>' +
  '<path d="M51 8H60.5" stroke="#ffffff" stroke-width="0.8" stroke-linecap="round" opacity="0.85"/></svg>';

// A harpoon, its point to the right: a heavy shaft, a ring at its tail for
// its rope and an iron head with two big barbs (the Harpun).
export const HARPOON =
  '<svg viewBox="0 0 90 18" preserveAspectRatio="none" aria-hidden="true">' +
  '<path d="M9 9H66" stroke="#3a2614" stroke-width="3.8" stroke-linecap="round"/>' +
  '<path d="M9 9H66" stroke="#9a7044" stroke-width="1.6" stroke-linecap="round"/>' +
  '<circle cx="5.6" cy="9" r="3.4" fill="none" stroke="#2a2d34" stroke-width="2.6"/>' +
  '<circle cx="5.6" cy="9" r="3.4" fill="none" stroke="#b9bfc8" stroke-width="1.2"/>' +
  '<path d="M89 9L73 3.2L75.6 7.1L62.5 1.2L66.5 9L62.5 16.8L75.6 10.9L73 14.8Z" fill="#c9ced6" stroke="#2a2d34" stroke-width="1.1" stroke-linejoin="round"/>' +
  '<path d="M74 9H86" stroke="#ffffff" stroke-width="1" stroke-linecap="round" opacity="0.85"/></svg>';

// A heart (the Strzał w serce's mark), and its two halves broken along a
// zigzag.
const HEART_PATH = 'M0 38C-30 18 -46 2 -46 -16C-46 -32 -33 -42 -20 -42C-10 -42 -3 -36 0 -28C3 -36 10 -42 20 -42C33 -42 46 -32 46 -16C46 2 30 18 0 38Z';
const HEART =
  '<svg viewBox="-50 -50 100 100" aria-hidden="true">' +
  `<path d="${HEART_PATH}" fill="rgba(255, 80, 70, 0.24)" stroke="currentColor" stroke-width="5.5" stroke-linejoin="round"/>` +
  `<path d="${HEART_PATH}" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linejoin="round" transform="scale(0.7)" opacity="0.85"/></svg>`;
const HEART_HALVES = [
  'M0 -28C-3 -36 -10 -42 -20 -42C-33 -42 -46 -32 -46 -16C-46 2 -30 18 0 38L-4 24L4 10L-4 -4L4 -16Z',
  'M0 -28L4 -16L-4 -4L4 10L-4 24L0 38C30 18 46 2 46 -16C46 -32 33 -42 20 -42C10 -42 3 -36 0 -28Z',
].map((d) => `<svg viewBox="-50 -50 100 100" aria-hidden="true"><path d="${d}" fill="rgba(255, 80, 70, 0.3)" stroke="currentColor" stroke-width="5.5" stroke-linejoin="round"/></svg>`);

// A sight's four corners alone (the Spokojna ręka's calm focus).
const FOCUS =
  '<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="square">' +
  '<path d="M8 30V8h22M70 8h22v22M92 70v22H70M30 92H8V70"/></g></svg>';

// The sign of thunder (the Znak gromu): six petals in a circle, the
// rosette once carved over the doors of cottages against lightning. Each
// stroke is drawn on in turn (its length counted as 100).
const THUNDER_SIGN = (() => {
  const petal = 25;
  const tip = petal * Math.sqrt(3);
  const petals = Array.from({ length: 6 }, (_, k) => {
    const angle = ((k * 60 - 90) * Math.PI) / 180;
    const x = (Math.cos(angle) * tip).toFixed(2);
    const y = (Math.sin(angle) * tip).toFixed(2);
    return `<path class="fx-sign-stroke" pathLength="100" d="M0 0A${petal} ${petal} 0 0 1 ${x} ${y}A${petal} ${petal} 0 0 1 0 0"/>`;
  }).join('');
  return (
    '<svg viewBox="-50 -50 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle class="fx-sign-stroke" pathLength="100" r="47" stroke-width="3.2"/>' +
    `<circle class="fx-sign-stroke" pathLength="100" r="${tip.toFixed(2)}" stroke-width="1.6"/>` +
    `<g stroke-width="2.8">${petals}</g></g></svg>`
  );
})();

// A wolf's jaws snapping shut (the wolves' bites): a row of fangs above, a
// row below, each in its own group, to move.
export const FANGS = (() => {
  const fang = (x, y, length, half, down) => `M${x - half} ${y}L${x} ${y + (down ? length : -length)}L${x + half} ${y}Z`;
  const upper = [-24, -12, 0, 12, 24].map((x) => fang(x, -9 + Math.abs(x) * 0.16, Math.abs(x) === 12 ? 17 : 11, Math.abs(x) === 12 ? 5 : 4, true)).join('');
  const lower = [-18, -6, 6, 18].map((x) => fang(x, 9 - Math.abs(x) * 0.16, Math.abs(x) === 18 ? 15 : 10, Math.abs(x) === 18 ? 4.6 : 3.8, false)).join('');
  const row = (d) => `<path d="${d}" fill="#fffaf0" stroke="#3a1a10" stroke-width="1.6" stroke-linejoin="round"/>`;
  return `<svg viewBox="-50 -50 100 100" aria-hidden="true"><g class="fx-jaw">${row(upper)}</g><g class="fx-jaw">${row(lower)}</g></svg>`;
})();

// Talons' rakes across a foe (the Szpon orła's three, the falcon's two),
// each drawn along its line.
function rakesArt(count) {
  const lines = Array.from({ length: count }, (_, k) => {
    const shift = (k - (count - 1) / 2) * 15;
    return `M${-24 + shift} -36Q${-4 + shift} 0 ${8 + shift} 36`;
  });
  return (
    '<svg viewBox="-50 -50 100 100" aria-hidden="true"><g fill="none" stroke-linecap="round">' +
    lines.map((d) => `<path class="fx-rake-glow" pathLength="100" d="${d}" stroke-width="8"/>`).join('') +
    lines.map((d) => `<path class="fx-rake-core" pathLength="100" d="${d}" stroke-width="2.6"/>`).join('') +
    '</g></svg>'
  );
}

// A feather of a bird of prey: the white feather's shape in browns.
const BROWN_FEATHER = FEATHER.replace('#fffdf6', '#a8804e').replace('#b8902f', '#3a2814').replace('#d9c38a', '#6b4f2a').replace('#b8862a', '#3a2814');

// Arcs of lightning crackling round a ball of it (the Kula piorunów).
export const ORB_ARCS = (() => {
  let seed = 11;
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const arc = (turn) => {
    const points = Array.from({ length: 7 }, (_, step) => {
      const angle = ((turn + step * 14) * Math.PI) / 180;
      const radius = 34 + (random() - 0.5) * 14;
      return `${(Math.cos(angle) * radius).toFixed(1)} ${(Math.sin(angle) * radius).toFixed(1)}`;
    });
    return `M${points.join('L')}`;
  };
  const arcs = [0, 120, 240].map(arc);
  return (
    '<svg viewBox="-50 -50 100 100" aria-hidden="true"><g fill="none" stroke-linecap="round" stroke-linejoin="round">' +
    arcs.map((d) => `<path d="${d}" stroke="currentColor" stroke-width="6" opacity="0.6"/>`).join('') +
    arcs.map((d) => `<path d="${d}" stroke="#ffffff" stroke-width="2.2"/>`).join('') +
    '</g></svg>'
  );
})();

// 961: a bolt of lightning from one point of the stage to another, jagged,
// with a fork or two: the box it takes (its corner `x`, `y`) and its SVG,
// in the colour of its element's `--fx`.
export function boltArt(from, to, { jag = 1, forks = 1, width = 1 } = {}) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const steps = Math.max(3, Math.round(length / 20));
  const swing = Math.min(18, length * 0.18) * jag;
  const main = [from];
  for (let step = 1; step < steps; step++) {
    const share = step / steps;
    const off = (Math.random() - 0.5) * 2 * swing * Math.sqrt(Math.sin(share * Math.PI));
    main.push({ x: from.x + dx * share + nx * off, y: from.y + dy * share + ny * off });
  }
  main.push(to);
  const lines = [main];
  for (let fork = 0; fork < forks && main.length > 3; fork++) {
    const at = main[1 + Math.floor(Math.random() * (main.length - 3))];
    const turn = Math.atan2(dy, dx) + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.4);
    const reach = length * (0.16 + Math.random() * 0.12);
    const branch = [at];
    for (let step = 1; step <= 3; step++) {
      const off = (Math.random() - 0.5) * swing * 0.8;
      branch.push({ x: at.x + Math.cos(turn) * reach * (step / 3) - Math.sin(turn) * off, y: at.y + Math.sin(turn) * reach * (step / 3) + Math.cos(turn) * off });
    }
    lines.push(branch);
  }
  const all = lines.flat();
  const pad = 8;
  const x = Math.min(...all.map((point) => point.x)) - pad;
  const y = Math.min(...all.map((point) => point.y)) - pad;
  const w = Math.ceil(Math.max(...all.map((point) => point.x)) + pad - x);
  const hgt = Math.ceil(Math.max(...all.map((point) => point.y)) + pad - y);
  const d = (line) => `M${line.map((point) => `${(point.x - x).toFixed(1)} ${(point.y - y).toFixed(1)}`).join('L')}`;
  const html =
    `<svg width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}" aria-hidden="true">` +
    lines.map((line, index) => `<path class="fx-zap-glow" stroke-width="${((index ? 3.6 : 6) * width).toFixed(1)}" d="${d(line)}"/>`).join('') +
    lines.map((line, index) => `<path class="fx-zap-core" stroke-width="${((index ? 1.2 : 2.2) * width).toFixed(1)}" d="${d(line)}"/>`).join('') +
    '</svg>';
  return { x, y, html };
}
// A bolt's flicker as it strikes.
export const FLICKER = [{ opacity: 0 }, { opacity: 1, offset: 0.06 }, { opacity: 0.3, offset: 0.16 }, { opacity: 1, offset: 0.26 }, { opacity: 0.85, offset: 0.55 }, { opacity: 0 }];

// 961: the frames of a bird (a creature's sprite, which faces right)
// flying through `points` (its middle on the stage), facing the way it
// flies and tilted a little with its path, at `scales`.
export function birdFrames(points, scales) {
  return points.map((point, index) => {
    const next = points[Math.min(points.length - 1, index + 1)];
    const prev = points[Math.max(0, index - 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const face = dx < 0 ? -1 : 1;
    const tilt = Math.max(-30, Math.min(30, ((Math.atan2(dy, Math.abs(dx) || 0.001) * 180) / Math.PI) * 0.5));
    const scale = scales[index];
    return { transform: `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px) translate(-50%, -50%) rotate(${(tilt * face).toFixed(1)}deg) scale(${(face * scale).toFixed(3)}, ${scale.toFixed(3)})` };
  });
}
// A point of a quadratic Bézier curve.
export const curve = (from, control, to, t) => ({
  x: (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * control.x + t * t * to.x,
  y: (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * control.y + t * t * to.y,
});

// ——— 962: the evolved Wojownik's looks ———

// Steel, the plates of armour, the Berserker's rage and red-hot iron.
const STEEL = ['#ffffff', '#e6ebf0', '#c9ced6', '#9aa3ae'];
const PLATES = ['#c9ced6', '#9aa3ae', '#6d7480'];
const RAGE = ['#ffd2c4', '#ff7a5c', '#e8462f', '#a3202a'];
const STEAM = ['#f2d0c8', '#e8b4a8', '#c9786c'];

// A seeded random number (the same art every time).
const seeded = (seed) => {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
};

// The jagged flash of a heavy blow landing (the Druzgocący cios): eleven
// uneven points, orange round a white heart.
const IMPACT_STAR = (() => {
  const tips = [46, 37, 44, 34, 48, 39, 43, 35, 46, 38, 42];
  const count = tips.length;
  const outer = tips.map((reach, k) => {
    const angle = (((k / count) * 360 - 90 + (k % 3) * 4) * Math.PI) / 180;
    return [Math.cos(angle) * reach, Math.sin(angle) * reach];
  });
  const inner = tips.map((_, k) => {
    const angle = ((((k + 0.5) / count) * 360 - 90) * Math.PI) / 180;
    const reach = 17 + (k % 3) * 3;
    return [Math.cos(angle) * reach, Math.sin(angle) * reach];
  });
  const points = (scale) =>
    outer
      .flatMap((point, k) => [point, inner[k]])
      .map(([x, y]) => `${(x * scale).toFixed(1)},${(y * scale).toFixed(1)}`)
      .join(' ');
  return (
    '<svg viewBox="-50 -50 100 100" aria-hidden="true">' +
    `<polygon points="${points(1)}" fill="#ffa53d" stroke="#3a1d00" stroke-width="2.6" stroke-linejoin="miter"/>` +
    `<polygon points="${points(0.68)}" fill="#ffe3a0"/><polygon points="${points(0.4)}" fill="#ffffff"/></svg>`
  );
})();

// Lines rushing in to a blow's impact.
const IMPACT_LINES = (() => {
  const lines = Array.from({ length: 14 }, (_, k) => {
    const angle = (((k / 14) * 360 + (k % 2) * 9) * Math.PI) / 180;
    const from = 30 + (k % 3) * 5;
    return `M${(Math.cos(angle) * from).toFixed(1)} ${(Math.sin(angle) * from).toFixed(1)}L${(Math.cos(angle) * 49).toFixed(1)} ${(Math.sin(angle) * 49).toFixed(1)}`;
  }).join('');
  return `<svg viewBox="-50 -50 100 100" aria-hidden="true"><path d="${lines}" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round"/></svg>`;
})();

// A star of a stunned foe's daze.
const DAZE_STAR =
  '<svg viewBox="-10 -10 20 20" aria-hidden="true"><path d="M0 -9L2.6 -3.2L8.8 -2.8L4 1.4L5.5 7.6L0 4.3L-5.5 7.6L-4 1.4L-8.8 -2.8L-2.6 -3.2Z" fill="#ffe08a" stroke="#5a3a00" stroke-width="1.5" stroke-linejoin="round"/>' +
  '<path d="M-1.2 -4.4L0 -6.8L1.2 -4.4Z" fill="#ffffff"/></svg>';

// The Młyn: a ring of steel turning round the Gladiator, grooved like a
// millstone's rim (its strokes the same at any size, as it grows out over
// the arena).
const MILL_RING =
  '<svg viewBox="-50 -50 100 100" aria-hidden="true"><g fill="none">' +
  '<circle r="47" stroke="#9aa3ae" stroke-width="9" opacity="0.42" vector-effect="non-scaling-stroke"/>' +
  '<circle r="47" stroke="#e6ebf0" stroke-width="2.6" vector-effect="non-scaling-stroke"/>' +
  '<circle r="47" pathLength="100" stroke="#4a4f57" stroke-width="5" stroke-dasharray="2.2 6.1" opacity="0.9" vector-effect="non-scaling-stroke"/></g></svg>';

// The icons' blades point up and to the right; the hand holds them here (a
// share of the icon from its left and from its top), as in arena-fx.js.
const ICON_GRIP = [0.25, 0.75];

// A sword, its point to the right (the Huragan stali's storm).
const SWORD =
  '<svg viewBox="0 0 60 14" aria-hidden="true">' +
  '<path d="M17 4.6H51L59 7L51 9.4H17Z" fill="#e6ebf0" stroke="#22262d" stroke-width="1.3" stroke-linejoin="round"/>' +
  '<path d="M18 7H54" stroke="#ffffff" stroke-width="0.9" opacity="0.9"/>' +
  '<path d="M13.6 1.4H17.4V12.6H13.6Z" fill="#c9a24a" stroke="#3a2814" stroke-width="1"/>' +
  '<path d="M4.6 5.5H13.6V8.5H4.6Z" fill="#6b4f2a" stroke="#2a1a0a" stroke-width="1"/>' +
  '<circle cx="3.2" cy="7" r="2.6" fill="#c9a24a" stroke="#3a2814" stroke-width="1"/></svg>';

// The Pojedynek's sign: two swords crossed, points up, each in its own
// group to swing into place.
const DUEL_SWORD =
  '<path d="M-3.4 18V-38L0 -47L3.4 -38V18Z" fill="#f4f6f8" stroke="#22262d" stroke-width="2" stroke-linejoin="round"/>' +
  '<path d="M0 -42V15" stroke="#ffffff" stroke-width="1.2" opacity="0.8"/>' +
  '<path d="M-12 17.5H12V23H-12Z" fill="currentColor" stroke="#3a2814" stroke-width="1.8" stroke-linejoin="round"/>' +
  '<path d="M-2.6 23H2.6V35.5H-2.6Z" fill="#6b4f2a" stroke="#2a1a0a" stroke-width="1.6"/>' +
  '<circle cy="39.5" r="4.4" fill="currentColor" stroke="#3a2814" stroke-width="1.8"/>';
const CROSSED_SWORDS = `<svg viewBox="-50 -50 100 100" aria-hidden="true"><g class="fx-duel-blade">${DUEL_SWORD}</g><g class="fx-duel-blade">${DUEL_SWORD}</g></svg>`;

// A duelist's circle drawn on the ground: two rings and the marks of an
// arena between them.
const DUEL_CIRCLE = (() => {
  const marks = Array.from({ length: 12 }, (_, k) => `<path d="M0 -44V-37" transform="rotate(${k * 30})"/>`).join('');
  return `<svg viewBox="-50 -50 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round"><circle r="46" stroke-width="3.4"/><circle r="34" stroke-width="1.8"/><g stroke-width="2.4">${marks}</g></g></svg>`;
})();

// A shield of the Mur tarcz: a steel heater with a golden band and boss.
const WALL_SHIELD =
  '<svg viewBox="0 0 40 48" aria-hidden="true">' +
  '<path d="M20 1.5L38 6.5V21C38 33.5 30 41.5 20 46.5C10 41.5 2 33.5 2 21V6.5Z" fill="#555c67" stroke="#1b1e24" stroke-width="2" stroke-linejoin="round"/>' +
  '<path d="M20 5L34.5 9V21C34.5 31 28 38 20 42.5C12 38 5.5 31 5.5 21V9Z" fill="#8d96a3"/>' +
  '<path d="M20 5.5V42" stroke="currentColor" stroke-width="5"/>' +
  '<circle cx="20" cy="19" r="5.4" fill="currentColor" stroke="#4a3610" stroke-width="1.6"/>' +
  '<path d="M8.5 11L14.5 9.2" stroke="#eef3f8" stroke-width="1.7" stroke-linecap="round" opacity="0.85"/></svg>';

// The Tytan's tower shield (Gniew góry, Tarcza tytana): tall, crowned with
// battlements like a castle tower, with glowing runes down its face.
const TOWER_SHIELD =
  '<svg viewBox="0 0 40 56" aria-hidden="true">' +
  '<path d="M3 11H9V4H15V11H25V4H31V11H37V40C37 47 29 52 20 55C11 52 3 47 3 40Z" fill="#545c69" stroke="#1b1e24" stroke-width="2" stroke-linejoin="round"/>' +
  '<path d="M6.5 14H33.5V39.5C33.5 45 27 49 20 51.5C13 49 6.5 45 6.5 39.5Z" fill="#8a94a3"/>' +
  '<g class="fx-tower-runes" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M20 18V46"/><path d="M13 25L20 21L27 25"/><path d="M13 34L20 30L27 34"/><path d="M15.5 42L20 39L24.5 42"/></g>' +
  '<path d="M9.5 16.5L15 15" stroke="#eef3f8" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/></svg>';

// The Wyłom's broken guard: a shield split in two along a red-hot crack,
// each half in its own group to fall away.
const SUNDER_SHIELD =
  '<svg viewBox="0 0 40 48" aria-hidden="true">' +
  '<g class="fx-sunder-half"><path d="M20 1.5L17 10L23 18L18 27L22 36L20 46.5C10 41.5 2 33.5 2 21V6.5Z" fill="#7c8592" stroke="#1b1e24" stroke-width="2" stroke-linejoin="round"/>' +
  '<path d="M8.5 11L14 9.4" stroke="#eef3f8" stroke-width="1.7" stroke-linecap="round" opacity="0.85"/></g>' +
  '<g class="fx-sunder-half"><path d="M20 1.5L38 6.5V21C38 33.5 30 41.5 20 46.5L22 36L18 27L23 18L17 10Z" fill="#666d79" stroke="#1b1e24" stroke-width="2" stroke-linejoin="round"/></g>' +
  '<path class="fx-sunder-crack" d="M20 1.5L17 10L23 18L18 27L22 36L20 46.5" fill="none" stroke="#ffb347" stroke-width="2.6" stroke-linejoin="round"/></svg>';

// The Lodowa wieczność's prison: a cluster of clear ice crystals, the
// tallest in the middle (stretched over its foe's figure).
const ICE_PRISON =
  '<svg viewBox="0 0 40 50" preserveAspectRatio="none" aria-hidden="true">' +
  '<g fill="#d6f4ff" fill-opacity="0.5" stroke="#ffffff" stroke-width="1.2" stroke-linejoin="round">' +
  '<path vector-effect="non-scaling-stroke" d="M3 50L1 27L6 16L12 28L11 50Z"/>' +
  '<path vector-effect="non-scaling-stroke" d="M29 50L29 23L34 12L39 25L37 50Z"/>' +
  '<path vector-effect="non-scaling-stroke" d="M10 50L11 14L20 1L29 14L30 50Z"/></g>' +
  '<g fill="none" stroke="#ffffff" stroke-width="0.8" stroke-opacity="0.8">' +
  '<path vector-effect="non-scaling-stroke" d="M20 1V50M11 14L20 22L29 14M14 36L20 31L26 36"/></g>' +
  '<path vector-effect="non-scaling-stroke" d="M14 18L17 11" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/></svg>';

// The Lodowe serce: a heart of faceted ice.
const ICE_HEART =
  '<svg viewBox="-20 -18 40 36" aria-hidden="true">' +
  '<path d="M0 16C-13 7 -18 -1 -16 -8C-14 -15 -5 -16 0 -9C5 -16 14 -15 16 -8C18 -1 13 7 0 16Z" fill="#8fd8ff" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/>' +
  '<path d="M0 -9L-4 0L0 16M-4 0L-14 -6M-4 0L4 2L12 -6M4 2L0 16" fill="none" stroke="#2f86c2" stroke-width="1.1" stroke-linejoin="round"/>' +
  '<path d="M-11 -9L-7 -12" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/></svg>';

// The Wyłom's rift: a molten seam opening down a foe from head to feet.
const RIFT =
  '<svg viewBox="-12 -50 24 100" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke-linecap="round" stroke-linejoin="round">' +
  '<path class="fx-rift-glow" pathLength="100" d="M0 -48L-3 -35L2.5 -22L-2 -9L3 5L-2.5 19L2 33L0 48" stroke-width="9"/>' +
  '<path class="fx-rift-core" pathLength="100" d="M0 -48L-3 -35L2.5 -22L-2 -9L3 5L-2.5 19L2 33L0 48" stroke-width="3"/></g></svg>';

// The Niezłomny's golden spikes, bristling out of a card's edges all
// round it (`width` × `height`, the card's size; `reach`: how far they
// stick out of each edge), and a golden rim on its edges. Its box reaches
// past the card's edges by `reach` and 3 more on each side.
const SPIKE_REACH = 15;
function spikedFrame(width, height, reach) {
  const half = 5.4;
  const spikes = [];
  const edge = (x0, y0, x1, y1, nx, ny, out) => {
    const length = Math.hypot(x1 - x0, y1 - y0);
    const count = Math.max(2, Math.round((length - 16) / 24));
    const tx = (x1 - x0) / length;
    const ty = (y1 - y0) / length;
    for (let k = 0; k < count; k++) {
      const share = 8 / length + ((k + 0.5) / count) * (1 - 16 / length);
      const x = x0 + (x1 - x0) * share;
      const y = y0 + (y1 - y0) * share;
      const tip = (k % 2 ? 0.7 : 1) * out;
      spikes.push(`M${(x - tx * half).toFixed(1)} ${(y - ty * half).toFixed(1)}L${(x + nx * tip).toFixed(1)} ${(y + ny * tip).toFixed(1)}L${(x + tx * half).toFixed(1)} ${(y + ty * half).toFixed(1)}Z`);
    }
  };
  edge(0, 0, width, 0, 0, -1, reach.top);
  edge(width, 0, width, height, 1, 0, reach.right);
  edge(width, height, 0, height, 0, 1, reach.bottom);
  edge(0, height, 0, 0, -1, 0, reach.left);
  // A spike out of each corner, slanting.
  for (const [x, y, sx, sy] of [
    [0, 0, -1, -1],
    [width, 0, 1, -1],
    [width, height, 1, 1],
    [0, height, -1, 1],
  ]) {
    const out = Math.min(sx < 0 ? reach.left : reach.right, sy < 0 ? reach.top : reach.bottom) * 0.75;
    spikes.push(`M${x} ${(y - sy * half * 1.4).toFixed(1)}L${(x + sx * out).toFixed(1)} ${(y + sy * out).toFixed(1)}L${(x - sx * half * 1.4).toFixed(1)} ${y}Z`);
  }
  const [left, top, right, bottom] = [reach.left, reach.top, reach.right, reach.bottom].map((out) => out + 3);
  const box = `${-left} ${-top} ${width + left + right} ${height + top + bottom}`;
  return (
    `<svg viewBox="${box}" width="${Math.round(width + left + right)}" height="${Math.round(height + top + bottom)}" aria-hidden="true">` +
    `<path d="${spikes.join('')}" fill="currentColor" stroke="#4a3610" stroke-width="1.4" stroke-linejoin="round"/>` +
    `<rect width="${width}" height="${height}" rx="4" fill="none" stroke="#4a3610" stroke-width="4.4"/>` +
    `<rect width="${width}" height="${height}" rx="4" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>`
  );
}

// A red "!" over a foe that answers the Wyzwanie.
const ALERT =
  '<svg viewBox="0 0 12 28" aria-hidden="true"><path d="M2.6 1.8H9.4L7.8 18.4H4.2Z" fill="#ff5a3a" stroke="#2a0800" stroke-width="1.7" stroke-linejoin="round"/>' +
  '<circle cx="6" cy="23.6" r="3.1" fill="#ff5a3a" stroke="#2a0800" stroke-width="1.7"/><path d="M4.4 4H6.4L6 10" stroke="#ffd2c4" stroke-width="1.1" stroke-linecap="round" fill="none"/></svg>';

// A plate of armour breaking off (the Kruszący cios), in three shapes.
const PLATE_ART = [
  ['M2 4L18 1L20 12L5 16Z', 'M3 4.6L17.5 1.8'],
  ['M1 2L16 5L13 17L3 13Z', 'M2 2.8L15.2 5.6'],
  ['M4 1L19 6L16 15L1 11Z', 'M4.4 2L18 6.6'],
].map(
  ([d, edge]) =>
    `<svg viewBox="0 0 21 18" aria-hidden="true"><path d="${d}" fill="#9aa3ae" stroke="#1d2027" stroke-width="1.4" stroke-linejoin="round"/>` +
    `<path d="${edge}" stroke="#eef3f8" stroke-width="1.2" stroke-linecap="round"/></svg>`,
);

// Red-hot cracks running through a foe's armour.
const HOT_CRACKS = cracksArt(41, 8);

// A slab of rock jutting out of the ground (the Trzęsienie ziemi), lit on
// its left.
const ROCK =
  '<svg viewBox="0 0 30 40" preserveAspectRatio="none" aria-hidden="true">' +
  '<path d="M2 40L6 14L13 2L19 9L24 6L28 40Z" fill="#7d6f5c" stroke="#2a2219" stroke-width="1.6" stroke-linejoin="round"/>' +
  '<path d="M13.4 3L15.5 39H27L23.6 7.4L19 10Z" fill="#5c5141"/>' +
  '<path d="M6.6 14.5L13 3.2L14.4 12" fill="none" stroke="#b9aa8e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// A pillar of the mountain's grey stone with a rune glowing down its face
// (the Gniew góry).
const RUNE_ROCK =
  '<svg viewBox="0 0 30 40" preserveAspectRatio="none" aria-hidden="true">' +
  '<path d="M2 40L6 14L13 2L19 9L24 6L28 40Z" fill="#6c7581" stroke="#1d2229" stroke-width="1.6" stroke-linejoin="round"/>' +
  '<path d="M13.4 3L15.5 39H27L23.6 7.4L19 10Z" fill="#4e5661"/>' +
  '<path d="M6.6 14.5L13 3.2L14.4 12" fill="none" stroke="#aeb8c4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<path class="fx-rock-rune" d="M14 15V34M10.5 20L14 17.5L17.5 20M10.5 27L14 24.5L17.5 27" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// The Riposta's arc of steel: a blade's guard caught in light.
const PARRY_ARC =
  '<svg viewBox="-50 -50 100 100" aria-hidden="true"><g fill="none" stroke-linecap="round">' +
  '<path d="M-37.6 -13.7A40 40 0 0 1 37.6 -13.7" stroke="currentColor" stroke-width="6" opacity="0.5"/>' +
  '<path d="M-37.6 -13.7A40 40 0 0 1 37.6 -13.7" stroke="#ffffff" stroke-width="2.2"/></g></svg>';

// A wave of the Ryk berserkera: a quarter of a circle, thin (it grows
// big).
const RAGE_WAVE =
  '<svg viewBox="-50 -50 100 100" aria-hidden="true"><g fill="none" stroke-linecap="round">' +
  '<path d="M-35.4 -35.4A50 50 0 0 1 35.4 -35.4" stroke="currentColor" stroke-width="3" opacity="0.7"/>' +
  '<path d="M-35.4 -35.4A50 50 0 0 1 35.4 -35.4" stroke="#ffd2c4" stroke-width="1.2"/></g></svg>';

// The Wir stali: steel whirling round a figure (three arcs).
const STEEL_SWIRL =
  '<svg viewBox="-50 -50 100 100" aria-hidden="true"><g fill="none" stroke-linecap="round">' +
  [0, 120, 240]
    .map((turn) => `<path d="M0 -44A44 44 0 0 1 43.3 -7.6" transform="rotate(${turn})" stroke="currentColor" stroke-width="5" opacity="0.4"/><path d="M0 -44A44 44 0 0 1 43.3 -7.6" transform="rotate(${turn})" stroke="#ffffff" stroke-width="1.8"/>`)
    .join('') +
  '</g></svg>';
// The Huragan stali's wind: arcs of a whirl round the foes (stretched to
// their row).
const GALE =
  '<svg viewBox="-50 -50 100 100" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke-linecap="round">' +
  '<path d="M0 -46A46 46 0 0 1 46 0" stroke="#ffffff" stroke-width="2" opacity="0.55" vector-effect="non-scaling-stroke"/>' +
  '<path d="M0 46A46 46 0 0 1 -46 0" stroke="#ffffff" stroke-width="2" opacity="0.55" vector-effect="non-scaling-stroke"/>' +
  '<path d="M-27 -27A38 38 0 0 1 27 -27" stroke="currentColor" stroke-width="1.6" opacity="0.6" vector-effect="non-scaling-stroke"/>' +
  '<path d="M27 27A38 38 0 0 1 -27 27" stroke="currentColor" stroke-width="1.6" opacity="0.6" vector-effect="non-scaling-stroke"/></g></svg>';

// The Wiwaty: a gold coin, a flower in a colour, and a garland of
// pennants `width` wide, sagging in its middle.
const COIN =
  '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="#f2c14e" stroke="#6a4808" stroke-width="1.2"/>' +
  '<circle cx="6" cy="6" r="2.6" fill="none" stroke="#ffe8a8" stroke-width="1"/></svg>';
const FLOWER = (color) =>
  '<svg viewBox="-6 -6 12 12" aria-hidden="true">' +
  `<g fill="${color}" stroke="#3a1414" stroke-width="0.5">${[0, 72, 144, 216, 288].map((turn) => `<ellipse cy="-3" rx="1.9" ry="2.8" transform="rotate(${turn})"/>`).join('')}</g>` +
  '<circle r="1.7" fill="#ffd24d" stroke="#6a4808" stroke-width="0.5"/></svg>';
const PENNANTS = ['#c0392b', '#f2c14e', '#3d6fb6', '#f4ecd8'];
function garlandArt(width, sag, count) {
  const at = (share) => ({ x: share * width, y: 3 + 4 * sag * share * (1 - share) });
  const flags = Array.from({ length: count }, (_, k) => {
    const share = (k + 0.5) / count;
    const left = at(share - 0.32 / count);
    const right = at(share + 0.32 / count);
    const tip = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 + 13 };
    return `<path d="M${left.x.toFixed(1)} ${left.y.toFixed(1)}L${right.x.toFixed(1)} ${right.y.toFixed(1)}L${tip.x.toFixed(1)} ${tip.y.toFixed(1)}Z" fill="${PENNANTS[k % PENNANTS.length]}" stroke="#2a1a10" stroke-width="1.1" stroke-linejoin="round"/>`;
  }).join('');
  return (
    `<svg width="${Math.round(width)}" height="${Math.round(sag + 20)}" viewBox="0 0 ${Math.round(width)} ${Math.round(sag + 20)}" aria-hidden="true">` +
    `<path d="M0 3Q${(width / 2).toFixed(1)} ${(3 + sag * 2).toFixed(1)} ${width.toFixed(1)} 3" fill="none" stroke="#3a2814" stroke-width="1.6"/>${flags}</svg>`
  );
}

// ——— 963: the evolved Kleryk's looks ———

// A sprout of the Odnowa: a stem (drawn on from the ground) and two leaves
// and a bud that open on it, its foot at (0, 0).
const SPROUT =
  '<svg viewBox="-22 -62 44 64" aria-hidden="true">' +
  '<path class="fx-sprout-stem" pathLength="100" d="M0 0C-3 -14 4 -27 0 -44" fill="none" stroke="#3f6b22" stroke-width="3.4" stroke-linecap="round"/>' +
  '<path class="fx-sprout-stem" pathLength="100" d="M0 0C-3 -14 4 -27 0 -44" fill="none" stroke="#9fd36b" stroke-width="1.6" stroke-linecap="round"/>' +
  '<g class="fx-sprout-leaf" data-origin="1px -22px"><path d="M1 -22C-6 -28 -15 -28 -20 -22C-15 -17 -6 -17 1 -22Z" fill="#7fbf4a" stroke="#2f4f16" stroke-width="1.1"/><path d="M1 -22H-15" stroke="#d9f0a3" stroke-width="0.8"/></g>' +
  '<g class="fx-sprout-leaf" data-origin="1px -33px"><path d="M1 -33C8 -39 17 -39 21 -33C17 -28 8 -28 1 -33Z" fill="#8bcf52" stroke="#2f4f16" stroke-width="1.1"/><path d="M1 -33H16" stroke="#d9f0a3" stroke-width="0.8"/></g>' +
  '<g class="fx-sprout-leaf" data-origin="0px -44px"><path d="M0 -44C-4 -50 -2 -57 0 -59C2 -57 4 -50 0 -44Z" fill="#b6e388" stroke="#2f4f16" stroke-width="1.1"/></g></svg>';

// One white wing of the Cud, its root at (0, 0), spread up and out to
// the right (the left one is the same, mirrored): its long feathers fanned
// from the root, the shorter ones over their bases, and its arm.
const WING = (() => {
  const feather = (angle, length, width) =>
    `<path d="M0 0Q${(length * 0.45).toFixed(1)} ${(-width).toFixed(1)} ${length} 0Q${(length * 0.6).toFixed(1)} ${(width * 0.8).toFixed(1)} 0 0Z" transform="rotate(${angle})"/>`;
  const long = [-86, -70, -55, -40, -26, -12].map((angle, k) => feather(angle, 58 - k * 6, 9)).join('');
  const small = [-80, -62, -45, -28].map((angle, k) => feather(angle, 30 - k * 3, 8)).join('');
  return (
    '<svg viewBox="-8 -64 70 70" aria-hidden="true">' +
    `<g fill="#fffdf6" stroke="#c9a24a" stroke-width="1.4" stroke-linejoin="round">${long}</g>` +
    `<g fill="#fff3d0" stroke="#d9b45a" stroke-width="1.2" stroke-linejoin="round">${small}</g>` +
    '<path d="M0 0Q10 -30 4 -56" fill="none" stroke="#e8c76a" stroke-width="3" stroke-linecap="round"/>' +
    '<circle r="5" fill="#fff3d0" stroke="#c9a24a" stroke-width="1.2"/></svg>'
  );
})();

// The Psalm's notes: a single note and two beamed.
const NOTES = [
  '<svg viewBox="0 0 20 28" aria-hidden="true"><g fill="currentColor" stroke="#3a2a08" stroke-width="1.2" stroke-linejoin="round">' +
    '<ellipse cx="7" cy="22" rx="5.6" ry="4" transform="rotate(-22 7 22)"/><path d="M11.4 20.6V3.2H13.4V20.6Z"/>' +
    '<path d="M13.4 3.2C14 7.4 19 8.6 17.6 15.2C16.8 11.6 14.6 10.4 13.4 10Z"/></g></svg>',
  '<svg viewBox="0 0 28 28" aria-hidden="true"><g fill="currentColor" stroke="#3a2a08" stroke-width="1.2" stroke-linejoin="round">' +
    '<ellipse cx="6" cy="23" rx="5.2" ry="3.8" transform="rotate(-22 6 23)"/><ellipse cx="20" cy="19.6" rx="5.2" ry="3.8" transform="rotate(-22 20 19.6)"/>' +
    '<path d="M10.2 21.6V6.4H12V21.6Z"/><path d="M24.2 18.2V3H26V18.2Z"/><path d="M10.2 6.4L26 3V7L10.2 10.4Z"/></g></svg>',
];

// The Wizja's eye: its white, a golden iris, the pupil and a gleam.
const EYE =
  '<svg viewBox="-50 -30 100 60" aria-hidden="true">' +
  '<path d="M-46 0Q0 -38 46 0Q0 38 -46 0Z" fill="#fff8e6" stroke="currentColor" stroke-width="4"/>' +
  '<circle r="15" fill="#f2c14e" stroke="#7a5a10" stroke-width="2.4"/><circle r="15" fill="none" stroke="#fff3c4" stroke-width="1.2" stroke-dasharray="3 3"/>' +
  '<circle r="6.5" fill="#1d1608"/><circle cx="-4.5" cy="-5" r="3" fill="#ffffff"/></svg>';

// The Hymn's laurel wreath, open at the top: on each side a branch with
// pointed leaves in pairs, and its herald's horn (its bell to the right)
// with a pennant.
const LAUREL = (() => {
  const leaf = 'M0 0C3 -4 9 -5 14 -3C9 0 4 1 0 0Z';
  const branch = (side) =>
    Array.from({ length: 6 }, (_, k) => {
      const degrees = 104 + k * 27;
      const x = Math.cos((degrees * Math.PI) / 180) * 32;
      const y = Math.sin((degrees * Math.PI) / 180) * 32;
      const along = degrees + 90;
      return [-1, 1]
        .map((out) => `<path d="${leaf}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${along + out * 38}) scale(1, ${out})"/>`)
        .join('');
    }).join('');
  const half = `<path d="M-5 33A32 32 0 0 1 -14 -29" fill="none" stroke="#6b4a10" stroke-width="2.4"/><g fill="#f2c14e" stroke="#6b4a10" stroke-width="1.1" stroke-linejoin="round">${branch()}</g>`;
  return `<svg viewBox="-50 -50 100 100" aria-hidden="true"><g>${half}</g><g transform="scale(-1, 1)">${half}</g></svg>`;
})();
const HORN =
  '<svg viewBox="0 0 80 34" aria-hidden="true">' +
  '<path d="M20 15H36V28L28 25L20 28Z" fill="#b3263b" stroke="#5a1a08" stroke-width="1.2" stroke-linejoin="round"/><path d="M22 17H34" stroke="#f2c14e" stroke-width="1.6"/>' +
  '<path d="M6 13H50C60 13 66 6 77 2V28C66 24 60 17 50 17H6Z" fill="#f2c14e" stroke="#5a3a08" stroke-width="1.6" stroke-linejoin="round"/>' +
  '<path d="M1 11H6V19H1Z" fill="#c98a1e" stroke="#5a3a08" stroke-width="1.2"/><path d="M8 14.2H50" stroke="#fff3c4" stroke-width="1.2"/>' +
  '<path d="M74 4.5V25.5" stroke="#fff3c4" stroke-width="1.2" opacity="0.8"/></svg>';

// The Sąd's brand: a sun sigil burnt into a foe.
const BRAND =
  '<svg viewBox="-50 -50 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round">' +
  '<circle r="22" stroke-width="5"/>' +
  `<g stroke-width="5">${Array.from({ length: 8 }, (_, k) => `<path d="M0 -30V-42" transform="rotate(${k * 45})"/>`).join('')}</g>` +
  '<circle r="7" fill="currentColor" stroke-width="0"/></g></svg>';

// Holy chains round a foe the Sąd paralyses: links along a flat ellipse,
// each seen from the side or from above in turn.
const CHAINS = (() => {
  const links = Array.from({ length: 14 }, (_, k) => {
    const angle = (k / 14) * Math.PI * 2;
    const x = Math.cos(angle) * 42;
    const y = Math.sin(angle) * 12;
    const turn = (Math.atan2(Math.cos(angle) * 12, -Math.sin(angle) * 42) * 180) / Math.PI;
    return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="7" ry="${k % 2 ? 2 : 4.2}" transform="rotate(${turn.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }).join('');
  return `<svg viewBox="-52 -20 104 40" aria-hidden="true"><g fill="none" stroke="#2e2410" stroke-width="4.6">${links}</g><g fill="none" stroke="#ffe08a" stroke-width="2.4">${links}</g></svg>`;
})();

// The Wyrok's sword, its point down.
export const SENTENCE_SWORD =
  '<svg viewBox="-14 -50 28 100" aria-hidden="true">' +
  '<path d="M-4.2 -14V36L0 48L4.2 36V-14Z" fill="#fff8e0" stroke="#5a3a08" stroke-width="1.8" stroke-linejoin="round"/>' +
  '<path d="M0 -12V42" stroke="#ffffff" stroke-width="1.2"/>' +
  '<path d="M-13 -19H13V-13H-13Z" fill="#f2c14e" stroke="#5a3a08" stroke-width="1.6" stroke-linejoin="round"/>' +
  '<path d="M-2.8 -19V-38H2.8V-19Z" fill="#8a5a1e" stroke="#3a2008" stroke-width="1.4"/>' +
  '<circle cy="-42" r="4.8" fill="#f2c14e" stroke="#5a3a08" stroke-width="1.6"/></svg>';

// The Ostateczny wyrok's spear of holy fire, its point to the right.
export const HOLY_SPEAR =
  '<svg viewBox="0 0 100 16" preserveAspectRatio="none" aria-hidden="true">' +
  '<path d="M4 8H78" stroke="#7a4a10" stroke-width="3.4" stroke-linecap="round"/>' +
  '<path d="M4 8H78" stroke="#ffe8a8" stroke-width="1.6" stroke-linecap="round"/>' +
  '<path d="M99 8L78 1.5L82 8L78 14.5Z" fill="#fff8e0" stroke="#7a4a10" stroke-width="1.2" stroke-linejoin="round"/></svg>';

// Holy fire: a flame's tongue in white and gold (the Ostateczny wyrok), or
// in the pyre's orange (the Stos).
const HOLY_FLAME = FLAME.replace('#ff7a2e', '#f7d26b').replace('#ffd27a', '#fff6dc').replace('#fff6d6', '#ffffff');

// The Stos's logs: two below, one across them.
const LOGS =
  '<svg viewBox="0 0 64 24" aria-hidden="true"><g stroke="#2a1608" stroke-width="1.4">' +
  '<rect x="2" y="12" width="29" height="10" rx="5" fill="#6b4220"/><rect x="33" y="12" width="29" height="10" rx="5" fill="#5c381a"/>' +
  '<rect x="12" y="3" width="40" height="10" rx="5" fill="#7a4c26"/></g>' +
  '<g fill="#c8935a" stroke="#2a1608" stroke-width="1"><circle cx="7" cy="17" r="3.4"/><circle cx="57" cy="17" r="3.4"/><circle cx="17" cy="8" r="3.4"/></g>' +
  '<path d="M20 8H44M8 17H26M38 17H52" stroke="#3a2210" stroke-width="0.9"/></svg>';

// The Pieczęć świętości: a ring with a cross whose arms flare, and dots
// round it.
const SEAL =
  '<svg viewBox="-50 -50 100 100" aria-hidden="true">' +
  '<circle r="42" fill="none" stroke="#5a1a08" stroke-width="7"/><circle r="42" fill="none" stroke="currentColor" stroke-width="4"/>' +
  `<g fill="currentColor">${Array.from({ length: 8 }, (_, k) => `<circle cy="-33" r="2.6" transform="rotate(${k * 45 + 22.5})"/>`).join('')}</g>` +
  '<path d="M-6 -27H6L4 -6L27 -6V6L4 6L6 27H-6L-4 6L-27 6V-6L-4 -6Z" fill="currentColor" stroke="#5a1a08" stroke-width="2.4" stroke-linejoin="round"/></svg>';

// The Święte światło's sun: a white heart and its rays, long and short.
const SUN =
  '<svg viewBox="-50 -50 100 100" aria-hidden="true">' +
  `<g fill="#fff3b0" stroke="#e8b84a" stroke-width="1.2" stroke-linejoin="round">${Array.from({ length: 16 }, (_, k) => `<path d="M-4 -20L0 ${k % 2 ? -36 : -48}L4 -20Z" transform="rotate(${k * 22.5})"/>`).join('')}</g>` +
  '<circle r="19" fill="#fffdf2" stroke="#f2c14e" stroke-width="3"/><circle r="12" fill="#ffffff"/></svg>';

// A light of the Chór's unseen singers: a white flame of a soul with a
// golden halo over it; and an arc of a sound (a voice) curving round to
// the right.
const SPIRIT =
  '<svg viewBox="-20 -24 40 44" aria-hidden="true">' +
  '<ellipse cy="-17" rx="9" ry="3.2" fill="none" stroke="#f2c14e" stroke-width="2.2"/>' +
  '<path d="M0 -10C7 -3 10 5 6 12C3 17 -3 17 -6 12C-10 5 -7 -3 0 -10Z" fill="#fffdf2" stroke="#e8c76a" stroke-width="1.4"/>' +
  '<path d="M0 -2C3 2 4 7 2 10C1 12 -1 12 -2 10C-4 7 -3 2 0 -2Z" fill="#ffffff"/></svg>';
const SOUND_ARC =
  '<svg viewBox="-50 -50 100 100" aria-hidden="true"><path d="M8 -38A44 44 0 0 1 8 38" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" opacity="0.55"/>' +
  '<path d="M8 -38A44 44 0 0 1 8 38" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"/></svg>';

// 964: the evolved Cień's looks.

// The Znak śmierci's hourglass, its sand in two groups (to drain and fill).
const HOURGLASS =
  '<svg viewBox="-20 -30 40 60" aria-hidden="true">' +
  '<path d="M-15 -27H15M-15 27H15" stroke="#2a1d40" stroke-width="5" stroke-linecap="round"/>' +
  '<path d="M-15 -27H15M-15 27H15" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>' +
  '<path d="M-12 -24C-12 -8 -3 -4 -3 0C-3 4 -12 8 -12 24H12C12 8 3 4 3 0C3 -4 12 -8 12 -24Z" fill="rgba(30, 20, 50, 0.55)" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>' +
  '<g class="fx-sand-top"><path d="M-9 -18H9C8 -10 2 -6 0 -2C-2 -6 -8 -10 -9 -18Z" fill="#e8d8ff"/></g>' +
  '<g class="fx-sand-bottom"><path d="M-10 22C-8 14 -3 12 0 10C3 12 8 14 10 22Z" fill="#e8d8ff"/></g>' +
  '<path class="fx-sand-stream" d="M0 -2V20" stroke="#e8d8ff" stroke-width="1.4"/></svg>';

// The Czarny jad's vial: a round flask with a cork and a skull on its
// label, its neck to the upper right (it tips to pour).
const VIAL =
  '<svg viewBox="0 0 40 48" aria-hidden="true">' +
  '<path d="M16 4H24V14C32 17 36 24 36 31C36 41 29 46 20 46C11 46 4 41 4 31C4 24 8 17 16 14Z" fill="#1d2a14" stroke="#c9d6b0" stroke-width="2.2" stroke-linejoin="round"/>' +
  '<path d="M7 31C7 25 10 21 14 19" fill="none" stroke="#e9f2d8" stroke-width="1.6" stroke-linecap="round" opacity="0.7"/>' +
  '<path d="M7 33C12 31 28 31 33 33C33 40 28 43 20 43C12 43 7 40 7 33Z" fill="#0f1609"/>' +
  '<rect x="15" y="1" width="10" height="6" rx="2" fill="#8a6a3a" stroke="#3a2814" stroke-width="1.2"/>' +
  '<circle cx="20" cy="27" r="5.6" fill="#e9f2d8" stroke="#2a3418" stroke-width="1"/>' +
  '<circle cx="18" cy="26.4" r="1.3" fill="#1d2a14"/><circle cx="22" cy="26.4" r="1.3" fill="#1d2a14"/><path d="M18 30H22" stroke="#1d2a14" stroke-width="1"/></svg>';

// A necromancer's circle on the ground: two rings, bone runes between them
// and a skull-like sigil inside.
const NECRO_CIRCLE = (() => {
  const glyphs = ['M-2.5 -3.5V3.5M-2.5 0H2.5', 'M-2.5 3.5L0 -3.5L2.5 3.5', 'M-2.5 -3.5L2.5 3.5M-2.5 3.5L0 1', 'M0 -3.5V3.5M-2.5 -3.5H2.5', 'M-2.5 -3.5V3.5H2.5'];
  const runes = Array.from({ length: 10 }, (_, k) => `<path d="${glyphs[k % glyphs.length]}" transform="rotate(${k * 36}) translate(0 -38.5)"/>`).join('');
  return (
    '<svg viewBox="-50 -50 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle r="46" stroke-width="3.2"/><circle r="31" stroke-width="2"/>' +
    `<g stroke-width="2.2">${runes}</g>` +
    '<path d="M-14 4C-14 -10 -8 -16 0 -16C8 -16 14 -10 14 4C14 8 10 9 9 12H-9C-10 9 -14 8 -14 4Z" stroke-width="2.2"/>' +
    '<circle cx="-5.5" cy="-2" r="3" stroke-width="2"/><circle cx="5.5" cy="-2" r="3" stroke-width="2"/>' +
    '<path d="M-5 12V17M0 12V17M5 12V17" stroke-width="1.8"/></g></svg>'
  );
})();

// The Krwawy znak's rune: a drop of blood in a ring with two fangs.
const BLOOD_RUNE =
  '<svg viewBox="-50 -50 100 100" aria-hidden="true">' +
  '<circle r="40" fill="none" stroke="#3a0810" stroke-width="8"/><circle r="40" fill="none" stroke="currentColor" stroke-width="4"/>' +
  '<path d="M-26 -26L-17 -12L-30 -14Z M26 -26L17 -12L30 -14Z" fill="currentColor" stroke="#3a0810" stroke-width="2" stroke-linejoin="round"/>' +
  '<path d="M0 -24C10 -8 16 2 16 10C16 20 9 26 0 26C-9 26 -16 20 -16 10C-16 2 -10 -8 0 -24Z" fill="currentColor" stroke="#3a0810" stroke-width="3" stroke-linejoin="round"/>' +
  '<path d="M-7 8C-7 3 -4 -1 -1 -4" fill="none" stroke="#ffd2c4" stroke-width="2.4" stroke-linecap="round"/></svg>';

// The Dotyk śmierci's hand of bone: its fingers spread (`fx-hand-open`)
// and closed on its foe (`fx-hand-closed`), shown one after the other
// (arena-fx.js boneTouch()).
export const BONE_HAND = (() => {
  const bone = '#d8f0c0';
  const line = `stroke="${bone}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  const open = (x, length, turn) =>
    `<g transform="rotate(${turn} ${x} 0)"><path d="M${x} 0V${length}" ${line}/>` +
    `<circle cx="${x}" cy="${(length * 0.45).toFixed(1)}" r="3" fill="${bone}"/><circle cx="${x}" cy="${length}" r="2.4" fill="${bone}"/></g>`;
  const closed = (x, length, inward) =>
    `<path d="M${x} 0V${(length * 0.5).toFixed(1)}L${(x + inward).toFixed(1)} ${(length * 0.8).toFixed(1)}" ${line}/>` +
    `<circle cx="${x}" cy="${(length * 0.5).toFixed(1)}" r="3" fill="${bone}"/>`;
  return (
    '<svg viewBox="-30 -36 60 76" aria-hidden="true">' +
    `<path d="M-14 -34L-10 -12M14 -34L10 -12" ${line}/>` +
    `<path d="M-16 -12H16L18 2H-18Z" fill="${bone}" stroke="#24301a" stroke-width="1" stroke-linejoin="round"/>` +
    `<g class="fx-hand-open">${open(-14, 26, 12)}${open(-5, 32, 4)}${open(5, 32, -4)}${open(14, 26, -12)}<path d="M-18 -4L-30 4" ${line}/></g>` +
    `<g class="fx-hand-closed" opacity="0">${closed(-14, 26, 7)}${closed(-5, 30, 5)}${closed(5, 30, -5)}${closed(14, 26, -7)}<path d="M-18 -4L-24 8L-14 12" ${line}/></g></svg>`
  );
})();

// The Armia umarłych's gravestone, in two halves that fall apart along
// its crack, on a mound of earth.
const GRAVESTONE =
  '<svg viewBox="-20 -27 40 54" aria-hidden="true">' +
  '<path d="M-20 27C-15 19 15 19 20 27Z" fill="#3a2e22"/>' +
  '<g class="fx-stone-left"><path d="M0 -24A16 16 0 0 0 -16 -8V24H0Z" fill="#7d7a72"/>' +
  '<path d="M0 -24A16 16 0 0 0 -16 -8V24H0" fill="none" stroke="#2a2824" stroke-width="1.6" stroke-linejoin="round"/>' +
  '<path d="M-1.3 -17H0V3H-1.3ZM-7 -11.2H0V-8.8H-7Z" fill="#3a3832"/>' +
  '<path d="M-12 8H-3M-12 13H-4" stroke="#55524a" stroke-width="1.4"/>' +
  '<path d="M-15 -3C-13 -6 -10 -4 -8 -7" fill="none" stroke="#5f7a3a" stroke-width="1.8" stroke-linecap="round"/></g>' +
  '<g class="fx-stone-right"><path d="M0 -24A16 16 0 0 1 16 -8V24H0Z" fill="#8a877e"/>' +
  '<path d="M0 -24A16 16 0 0 1 16 -8V24H0" fill="none" stroke="#2a2824" stroke-width="1.6" stroke-linejoin="round"/>' +
  '<path d="M0 -17H1.3V3H0ZM0 -11.2H7V-8.8H0Z" fill="#3a3832"/>' +
  '<path d="M3 8H12M4 13H12" stroke="#55524a" stroke-width="1.4"/></g>' +
  '<path class="fx-stone-crack" d="M0 -24L-1.6 -15L1.2 -7L-1 2L0.8 12L0 24" fill="none" stroke="#1a1612" stroke-width="1.5" stroke-linejoin="round" opacity="0"/></svg>';

// The Armia umarłych's knight's sword: broad, rusted, its edge running
// with green venom, its point to the right.
const RUSTY_SWORD =
  '<svg viewBox="0 0 60 16" aria-hidden="true">' +
  '<path d="M16 3.4H50L59.5 8L50 12.6H16Z" fill="#8f8577" stroke="#22180f" stroke-width="1.3" stroke-linejoin="round"/>' +
  '<path d="M21 4.4H27V7H21ZM33 9.2H40V11.7H33ZM44 4.6H48V6.6H44Z" fill="#b5652a" opacity="0.9"/>' +
  '<path d="M18 11.4H51L56 9" fill="none" stroke="#9ccc65" stroke-width="1.6" stroke-linecap="round"/>' +
  '<path d="M30 12.6V15" stroke="#9ccc65" stroke-width="1.4" stroke-linecap="round"/>' +
  '<path d="M13.4 0.6H17V15.4H13.4Z" fill="#5a3e24" stroke="#22180f" stroke-width="1"/>' +
  '<path d="M4.4 6.3H13.4V9.7H4.4Z" fill="#3e2e1e" stroke="#1a120a" stroke-width="1"/>' +
  '<circle cx="3" cy="8" r="2.6" fill="#5a3e24" stroke="#22180f" stroke-width="1"/></svg>';

// The Cios ostateczny's cleave: a crescent of black and violet light with
// a white edge, from high on one side to low on the other.
const CLEAVE =
  '<svg viewBox="-50 -50 100 100" aria-hidden="true">' +
  '<path d="M-30 -46A60 60 0 0 1 30 46A110 110 0 0 0 -30 -46Z" fill="#120c20"/>' +
  '<path d="M-27 -42A57 57 0 0 1 27 42A104 104 0 0 0 -27 -42Z" fill="currentColor"/>' +
  '<path d="M-27 -43A59 59 0 0 1 28 43" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"/></svg>';

export function skillEffects(kit) {
  const { animate, boxOf, centerOf, cards, fx, row, reduced, wait } = kit;
  const particles = kit.specks;

  // A small element in the effects layer at a point, removed when done.
  function spark(className, { x, y }, style = {}) {
    const element = h('span', { class: className });
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    for (const [key, value] of Object.entries(style)) element.style.setProperty(key, value);
    fx.append(element);
    return element;
  }

  // The skill's name over its user, kept inside the arena by its edges.
  function callout(id, text, color) {
    const entry = cards.get(id);
    if (!entry) return Promise.resolve();
    const { x, y } = centerOf(entry.card);
    const label = spark('skill-callout', { x, y: y - entry.card.offsetHeight / 2 }, { '--fx': color });
    label.textContent = text;
    // Kept inside the arena at its biggest (×1.08) and by the room of the
    // stage's shakes, as the blows' numbers are (wordsRoom in arena-fx.js):
    // on a 360 px phone a back-row caster's „Gniew Peruna” went past the
    // right edge (the promo reel, 16.11.2026).
    const half = (label.offsetWidth / 2) * 1.08;
    const [from, to] = kit.wordsRoom ? kit.wordsRoom(half) : [half + 4, kit.arena.clientWidth - half - 4];
    label.style.left = `${Math.min(Math.max(x, from), to)}px`;
    return animate(
      label,
      [
        { transform: 'translate(-50%, 0) scale(0.6)', opacity: 0 },
        { transform: 'translate(-50%, -10px) scale(1.08)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, -14px) scale(1)', opacity: 1, offset: 0.75 },
        { transform: 'translate(-50%, -22px) scale(1)', opacity: 0 },
      ],
      { duration: 1300, easing: 'ease-out' },
    ).then(() => label.remove());
  }

  // A glow that pulses around a card.
  function aura(id, color, pulses = 2) {
    const entry = cards.get(id);
    if (!entry) return Promise.resolve();
    return animate(
      entry.card,
      [
        { boxShadow: '0 0 0 0 transparent' },
        { boxShadow: `0 0 18px 6px ${color}`, offset: 0.5 },
        { boxShadow: '0 0 0 0 transparent' },
      ],
      { duration: 520, iterations: pulses },
    );
  }

  // A ring of light that grows from a card's middle.
  function ring(id, color, size = 90, duration = 520) {
    const entry = cards.get(id);
    if (!entry) return Promise.resolve();
    const mark = spark('fx-ring', centerOf(entry.card), { '--fx': color, '--size': `${size}px` });
    return animate(
      mark,
      [
        { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0.95 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
      ],
      { duration, easing: 'ease-out' },
    ).then(() => mark.remove());
  }

  // A burst of light, bigger and brighter than a plain hit's.
  function burst(id, color, size = 70) {
    const entry = cards.get(id);
    if (!entry) return Promise.resolve();
    const mark = spark('fx-burst', centerOf(entry.card), { '--fx': color, '--size': `${size}px` });
    return animate(
      mark,
      [
        { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.1)', opacity: 1, offset: 0.3 },
        { transform: 'translate(-50%, -50%) scale(1.35)', opacity: 0 },
      ],
      { duration: 480, easing: 'ease-out' },
    ).then(() => mark.remove());
  }

  // Specks rising (a heal) or dripping (venom) over a card.
  function specks(id, color, { count = 7, rise = true } = {}) {
    const entry = cards.get(id);
    if (!entry) return Promise.resolve();
    const box = boxOf(entry.card);
    const { x, y } = centerOf(entry.card);
    const all = Array.from({ length: count }, (_, index) => {
      const dx = ((index + 0.5) / count - 0.5) * box.width * 0.8;
      const mark = spark('fx-speck', { x: x + dx, y: y + (rise ? box.height * 0.3 : -box.height * 0.3) }, { '--fx': color });
      const travel = (rise ? -1 : 1) * (box.height * 0.5 + (index % 3) * 6);
      return animate(
        mark,
        [
          { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0 },
          { transform: `translate(-50%, calc(-50% + ${travel * 0.3}px)) scale(1)`, opacity: 1, offset: 0.25 },
          { transform: `translate(-50%, calc(-50% + ${travel}px)) scale(0.7)`, opacity: 0 },
        ],
        { duration: 760, delay: index * 50, easing: 'ease-out', fill: 'backwards' },
      ).then(() => mark.remove());
    });
    return Promise.all(all);
  }

  // A box over the enemy row that clips what moves inside it, so nothing
  // reaches past the arena's edge and the page never scrolls sideways.
  function overRow() {
    const target = row('enemy');
    if (!target) return null;
    const box = boxOf(target);
    const clip = spark('fx-clip', { x: box.x, y: box.y });
    clip.style.width = `${box.width}px`;
    clip.style.height = `${box.height}px`;
    return clip;
  }

  // A blade's arc drawn over the whole enemy row, left to right.
  function arc(color) {
    const clip = overRow();
    if (!clip) return Promise.resolve();
    const blade = h('span', { class: 'fx-arc' });
    blade.style.setProperty('--fx', color);
    clip.append(blade);
    const keyframes = reduced()
      ? [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }]
      : [
          { transform: 'scaleX(0.08)', opacity: 0 },
          { transform: 'scaleX(1)', opacity: 1, offset: 0.5 },
          { transform: 'scaleX(1) translateY(8px)', opacity: 0 },
        ];
    return animate(blade, keyframes, { duration: 560, easing: 'ease-out' }).then(() => clip.remove());
  }

  // An icy gust that blows over the enemy row, and frost settling on each foe.
  function gust(color, targets) {
    const clip = overRow();
    if (!clip) return Promise.resolve();
    const wind = h('span', { class: 'fx-gust' });
    wind.style.setProperty('--fx', color);
    clip.append(wind);
    const blow = reduced()
      ? animate(wind, [{ opacity: 0 }, { opacity: 0.8 }, { opacity: 0 }], { duration: 500 })
      : animate(
          wind,
          [
            { transform: 'translateX(-60%)', opacity: 0 },
            { transform: 'translateX(-10%)', opacity: 0.9, offset: 0.5 },
            { transform: 'translateX(30%)', opacity: 0 },
          ],
          { duration: 720, easing: 'ease-out' },
        );
    return Promise.all([blow.then(() => clip.remove()), ...targets.map((id) => specks(id, '#e4f5ff', { count: 5, rise: false }))]);
  }

  // A column of holy light falling on each foe.
  function beams(color, targets) {
    return Promise.all(
      targets.map((id, index) => {
        const entry = cards.get(id);
        if (!entry) return null;
        const beam = spark('fx-beam', centerOf(entry.card), { '--fx': color });
        beam.style.height = `${entry.card.offsetHeight + 20}px`;
        return animate(
          beam,
          [
            { transform: 'translate(-50%, -50%) scaleY(0)', opacity: 0 },
            { transform: 'translate(-50%, -50%) scaleY(1)', opacity: 1, offset: 0.35 },
            { transform: 'translate(-50%, -50%) scale(1.5, 1)', opacity: 0 },
          ],
          { duration: 680, delay: index * 80, easing: 'ease-out', fill: 'backwards' },
        ).then(() => beam.remove());
      }),
    );
  }

  // Arrows falling on every enemy at once.
  function rain(color, targets) {
    return Promise.all(
      targets.map((id, index) => {
        const entry = cards.get(id);
        if (!entry) return null;
        const { x, y } = centerOf(entry.card);
        return Promise.all(
          [-12, 0, 12].map((dx, arrow) => {
            const mark = spark('projectile projectile--arrow projectile--fall projectile--glow', { x: x + dx, y }, { '--fx': color });
            return animate(
              mark,
              [
                { transform: 'translate(0, -70px) rotate(90deg)', opacity: 0 },
                { opacity: 1, offset: 0.3 },
                { transform: 'translate(0, -6px) rotate(90deg)', opacity: 1 },
              ],
              { duration: 300, delay: index * 60 + arrow * 40, easing: 'ease-in', fill: 'backwards' },
            ).then(() => mark.remove());
          }),
        );
      }),
    );
  }

  // Faint copies of a card that drift aside and fade: a dance of shadows.
  function ghosts(id, color) {
    const entry = cards.get(id);
    if (!entry || reduced()) return aura(id, color, 1);
    return Promise.all(
      [-18, 18].map((dx) => {
        const copy = entry.card.cloneNode(true);
        copy.classList.add('fx-ghost');
        copy.removeAttribute('aria-label');
        copy.style.setProperty('--fx', color);
        const box = boxOf(entry.card);
        copy.style.left = `${box.x}px`;
        copy.style.top = `${box.y}px`;
        copy.style.width = `${box.width}px`;
        copy.style.height = `${box.height}px`;
        fx.append(copy);
        return animate(
          copy,
          [
            { transform: 'translateX(0)', opacity: 0.6 },
            { transform: `translateX(${dx}px)`, opacity: 0 },
          ],
          { duration: 620, easing: 'ease-out' },
        ).then(() => copy.remove());
      }),
    );
  }

  // A blue bubble around a card, kept while the shield holds.
  function bubble(id, color) {
    const entry = cards.get(id);
    if (!entry) return Promise.resolve();
    entry.card.classList.add('unit--shielded');
    entry.card.style.setProperty('--shield', color);
    return ring(id, color, 120, 700);
  }

  // A round flash over a whole card, then a ring around it.
  function flashAround(id, color) {
    const entry = cards.get(id);
    if (!entry) return Promise.resolve();
    const size = Math.round(Math.hypot(entry.card.offsetWidth, entry.card.offsetHeight));
    return Promise.all([burst(id, color, size), ring(id, color, Math.round(size * 1.25), 700)]);
  }

  // A flash of light over the whole arena (an explosion's, a shield's).
  function flash(color, strength = 0.2, duration = 360) {
    const veil = h('span', { class: 'fx-flash' });
    veil.style.setProperty('--fx', color);
    fx.append(veil);
    return animate(veil, [{ opacity: 0 }, { opacity: strength, offset: 0.2 }, { opacity: 0 }], { duration, easing: 'ease-out' }).then(() => veil.remove());
  }

  // The fireball gathering in the Mag's hands before it flies.
  function gather(id) {
    const entry = cards.get(id);
    if (!entry || reduced()) return Promise.resolve();
    const { x, y } = centerOf(entry.card);
    const orb = spark('fx-fireball', { x, y }, { '--size': `${Math.round(entry.card.offsetWidth * 0.42)}px` });
    particles?.burst({ x, y, count: 10, colors: FIRE, speed: [20, 70], life: [260, 460], size: [1.4, 2.8], shape: 'ember', rise: 40, drag: 1.5, gravity: -40 });
    return animate(
      orb,
      [
        { transform: 'translate(-50%, -50%) scale(0.1) rotate(0deg)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(0.8) rotate(120deg)', opacity: 1, offset: 0.7 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(200deg)', opacity: 0 },
      ],
      { duration: 380, easing: 'ease-out' },
    ).then(() => orb.remove());
  }

  // The fireball bursting on its target: a bloom of fire, a ring, embers,
  // sparks and smoke, the arena lit up and the target scorched.
  function explode(id) {
    const entry = cards.get(id);
    if (!entry) return Promise.resolve();
    const { x, y } = centerOf(entry.card);
    const size = Math.round(Math.hypot(entry.card.offsetWidth, entry.card.offsetHeight) * 0.9);
    const bloom = spark('fx-explosion', { x, y }, { '--size': `${size}px` });
    particles?.burst({ x, y, count: 26, colors: FIRE, angle: -Math.PI / 2, spread: Math.PI, speed: [140, 340], life: [420, 900], size: [1.4, 3.2], shape: 'ember', gravity: 170, drag: 2.2 });
    particles?.burst({ x, y, count: 14, colors: ['#fff7d6', '#ffd27a'], speed: [220, 440], life: [160, 340], size: [1.2, 2], shape: 'spark', drag: 4 });
    particles?.burst({ x, y, count: 7, colors: SMOKE, speed: [16, 60], life: [800, 1300], size: [6, 11], shape: 'dust', gravity: -40, drag: 1.6, area: { width: size * 0.4, height: size * 0.3 } });
    flash('#ff9a4d', 0.2, 380);
    animate(entry.card, [{ filter: 'brightness(1.9) sepia(0.6) saturate(2.2)' }, { filter: 'brightness(1)' }], { duration: 650, easing: 'ease-out' });
    return Promise.all([
      animate(
        bloom,
        [
          { transform: 'translate(-50%, -50%) scale(0.15)', opacity: 1 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.95, offset: 0.35 },
          { transform: 'translate(-50%, -50%) scale(1.3)', opacity: 0 },
        ],
        { duration: 560, easing: 'ease-out' },
      ).then(() => bloom.remove()),
      ring(id, '#ffcf8a', Math.round(size * 1.5), 520),
    ]);
  }

  // Streaks of wind blowing over the enemy row, one after another.
  function windLines() {
    const clip = overRow();
    if (!clip) return Promise.resolve();
    const lines = [0.22, 0.42, 0.62, 0.8].map((top, index) => {
      const line = h('span', { class: 'fx-windline' });
      line.style.top = `${top * 100}%`;
      clip.append(line);
      return animate(
        line,
        [
          { transform: 'translateX(-90%) scaleX(0.4)', opacity: 0 },
          { transform: 'translateX(10%) scaleX(1)', opacity: 1, offset: 0.45 },
          { transform: 'translateX(150%) scaleX(0.6)', opacity: 0 },
        ],
        { duration: 560, delay: index * 70, easing: 'ease-out', fill: 'backwards' },
      );
    });
    return Promise.all(lines).then(() => clip.remove());
  }

  // Frost settling on a foe: an icy rim, shards and crystals.
  function freeze(id) {
    const entry = cards.get(id);
    if (!entry) return Promise.resolve();
    const { x, y } = centerOf(entry.card);
    entry.card.classList.add('unit--frosted');
    wait(1200).then(() => entry.card.classList.remove('unit--frosted'));
    particles?.burst({ x, y, count: 12, colors: ['#ffffff', '#cfefff', '#8fd3ff'], speed: [60, 170], life: [380, 720], size: [1.6, 3], shape: 'shard', gravity: 240, drag: 2 });
    [-0.28, 0.05, 0.3].forEach((dx, index) => {
      const crystal = spark('fx-crystal', { x: x + dx * entry.card.offsetWidth, y: y + (index % 2 ? -0.16 : 0.12) * entry.card.offsetHeight });
      animate(
        crystal,
        [
          { transform: 'translate(-50%, -50%) scale(0) rotate(0deg)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(1.15) rotate(30deg)', opacity: 1, offset: 0.3 },
          { transform: 'translate(-50%, -50%) scale(0.9) rotate(50deg)', opacity: 0 },
        ],
        { duration: 900, delay: index * 60, easing: 'ease-out', fill: 'backwards' },
      ).then(() => crystal.remove());
    });
    return wait(380);
  }

  // The Mroźny podmuch's new look: a cone of snow from the Mag, wind over the
  // foes and frost on each of them.
  async function blizzard(event, color, targets) {
    const caster = cards.get(event.actor);
    const foes = row('enemy');
    if (!caster || !foes || reduced() || !particles) return gust(color, targets);
    const from = centerOf(caster.card);
    const box = boxOf(foes);
    const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const reach = Math.hypot(to.x - from.x, to.y - from.y);
    const cone = spark('fx-cone', from, { '--fx': color });
    cone.style.width = `${Math.round(reach * 1.15)}px`;
    cone.style.height = `${Math.round(Math.max(60, reach * 0.55))}px`;
    animate(
      cone,
      [
        { transform: `translate(0, -50%) rotate(${angle}rad) scaleX(0.1)`, opacity: 0 },
        { transform: `translate(0, -50%) rotate(${angle}rad) scaleX(1)`, opacity: 0.9, offset: 0.45 },
        { transform: `translate(0, -50%) rotate(${angle}rad) scaleX(1.05)`, opacity: 0 },
      ],
      { duration: 620, easing: 'ease-out' },
    ).then(() => cone.remove());
    for (let wave = 0; wave < 3; wave++) {
      wait(wave * 90).then(() => particles.burst({ x: from.x, y: from.y, count: 30, colors: ICE, angle, spread: 0.32, speed: [reach * 1.3, reach * 2.1], life: [480, 820], size: [1.6, 3.4], shape: 'mote', drag: 0.5 }));
    }
    const streaks = windLines();
    await wait(240);
    await Promise.all([streaks, ...targets.map((id, index) => wait(index * 70).then(() => freeze(id)))]);
  }

  // The Osłona many's new look: motes of mana drawn into the Mag, then a
  // dome of hexagons that flares and settles into the shield.
  async function hexShield(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await bubble(id, color);
      return;
    }
    const { x, y } = centerOf(entry.card);
    const radius = Math.hypot(entry.card.offsetWidth, entry.card.offsetHeight) * 0.62;
    for (let index = 0; index < 16; index++) {
      const angle = (index / 16) * Math.PI * 2;
      particles.burst({ x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius, count: 1, colors: [color, '#e8f4ff'], angle: angle + Math.PI, spread: 0.04, speed: [radius * 2.3, radius * 2.5], life: [330, 360], size: [1.6, 2.6], shape: 'mote', drag: 0 });
    }
    await wait(300);
    // A wall of hexagons the shape of the card, so it never leaves the arena.
    const box = boxOf(entry.card);
    const wall = h('span', { class: 'fx-hexwall' });
    wall.style.left = `${box.x - 5}px`;
    wall.style.top = `${box.y - 5}px`;
    wall.style.width = `${box.width + 10}px`;
    wall.style.height = `${box.height + 10}px`;
    wall.style.setProperty('--fx', color);
    wall.innerHTML = hexPattern(color);
    fx.append(wall);
    entry.card.classList.add('unit--shielded');
    entry.card.style.setProperty('--shield', color);
    flash(color, 0.12, 320);
    await animate(
      wall,
      [
        { clipPath: 'circle(0% at 50% 50%)', opacity: 1, transform: 'scale(0.96)' },
        { clipPath: 'circle(75% at 50% 50%)', opacity: 1, transform: 'scale(1.03)', offset: 0.35 },
        { clipPath: 'circle(75% at 50% 50%)', opacity: 0.8, transform: 'scale(1)', offset: 0.7 },
        { clipPath: 'circle(75% at 50% 50%)', opacity: 0, transform: 'scale(1)' },
      ],
      { duration: 1100, easing: 'ease-out' },
    );
    wall.remove();
  }

  // The Celny strzał's sight closing on its target and locking on.
  function reticle(id, color) {
    const entry = cards.get(id);
    if (!entry) return Promise.resolve();
    const size = Math.round(Math.max(entry.card.offsetWidth, entry.card.offsetHeight) * 0.95);
    const sight = spark('fx-reticle', centerOf(entry.card), { '--fx': color, '--size': `${size}px` });
    sight.innerHTML = RETICLE;
    return animate(
      sight,
      [
        { transform: 'translate(-50%, -50%) scale(1.9) rotate(60deg)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1, offset: 0.45 },
        { transform: 'translate(-50%, -50%) scale(0.92) rotate(0deg)', opacity: 1, offset: 0.6 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1, offset: 0.85 },
        { transform: 'translate(-50%, -50%) scale(0.7) rotate(0deg)', opacity: 0 },
      ],
      { duration: 620, easing: 'ease-out' },
    ).then(() => sight.remove());
  }

  // An aimed arrow piercing its target: a bright line through it along the
  // shot, and sparks thrown on.
  function pierce(event, color) {
    const target = cards.get(event.target);
    const shooter = cards.get(event.actor);
    if (!target || !shooter) return Promise.resolve();
    const to = centerOf(target.card);
    const from = centerOf(shooter.card);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const length = Math.hypot(target.card.offsetWidth, target.card.offsetHeight) * 1.5;
    const line = spark('fx-pierce', to, { '--fx': color });
    line.style.width = `${Math.round(length)}px`;
    particles?.burst({ x: to.x, y: to.y, count: 16, colors: ['#ffffff', color, '#ffe0c4'], angle, spread: 0.35, speed: [200, 420], life: [180, 360], size: [1.2, 2.4], shape: 'spark', drag: 3.5 });
    return animate(
      line,
      [
        { transform: `translate(-50%, -50%) rotate(${angle}rad) scaleX(0)`, opacity: 1 },
        { transform: `translate(-50%, -50%) rotate(${angle}rad) scaleX(1)`, opacity: 1, offset: 0.3 },
        { transform: `translate(-50%, -50%) rotate(${angle}rad) scaleX(1.1) scaleY(0.3)`, opacity: 0 },
      ],
      { duration: 380, easing: 'ease-out' },
    ).then(() => line.remove());
  }

  // One arrow of a volley: up from the archer, or down onto a foe.
  function arrowFlight(point, frames, duration, delay, color) {
    const arrow = spark('projectile projectile--arrow projectile--glow', point, { '--fx': color });
    return animate(arrow, frames, { duration, delay, easing: 'ease-in', fill: 'backwards' }).then(() => arrow.remove());
  }

  // The Grad strzał's new look: a volley loosed up into the sky, then a
  // shower of arrows on every foe, each raising dust where it lands.
  async function volley(event, color, targets) {
    const caster = cards.get(event.actor);
    if (!caster || reduced()) {
      await rain(color, targets);
      return;
    }
    const from = centerOf(caster.card);
    const up = [-14, -5, 4, 13, 22].map((dx, index) =>
      arrowFlight(
        { x: from.x + dx, y: from.y },
        [
          { transform: 'translate(0, 0) rotate(-90deg)', opacity: 0 },
          { opacity: 1, offset: 0.2 },
          { transform: `translate(${dx * 0.6}px, -240px) rotate(-90deg)`, opacity: 0 },
        ],
        300,
        index * 45,
        color,
      ),
    );
    await wait(260);
    const falls = targets.flatMap((id, index) => {
      const entry = cards.get(id);
      if (!entry) return [];
      const box = boxOf(entry.card);
      return [-0.32, -0.12, 0.08, 0.26, 0.4].map((dx, arrow) => {
        const land = { x: box.x + box.width * (0.5 + dx), y: box.y + box.height * (0.42 + (arrow % 2) * 0.22) };
        const delay = index * 60 + arrow * 45;
        return arrowFlight(
          land,
          [
            { transform: 'translate(-26px, -110px) rotate(76deg)', opacity: 0 },
            { opacity: 1, offset: 0.25 },
            { transform: 'translate(0, 0) rotate(76deg)', opacity: 1 },
          ],
          260,
          delay,
          color,
        ).then(() => particles?.burst({ x: land.x, y: land.y + 4, count: 2, colors: DUST, speed: [10, 40], life: [380, 620], size: [3, 5], shape: 'dust', gravity: -10, drag: 2 }));
      });
    });
    await Promise.all([...up, ...falls]);
  }

  // The Przyszpilenie's new look: the arrow stays stuck at the foe's feet,
  // quivering, and a coil of rope tightens round it.
  function pin(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return Promise.resolve();
    const box = boxOf(entry.card);
    const foot = { x: box.x + box.width * 0.62, y: box.y + box.height - 10 };
    const arrow = spark('projectile projectile--arrow projectile--glow fx-pinned', foot, { '--fx': color });
    const rope = spark('fx-rope', { x: box.x + box.width / 2, y: box.y + box.height - 6 }, { '--fx': color });
    rope.style.width = `${Math.round(box.width * 1.08)}px`;
    particles?.burst({ x: foot.x, y: foot.y, count: 6, colors: DUST, speed: [20, 70], life: [420, 700], size: [3, 6], shape: 'dust', gravity: -12, drag: 2 });
    animate(entry.card, [{ transform: 'translateY(0)' }, { transform: 'translateY(3px)' }, { transform: 'translateY(0)' }], { duration: 220, easing: 'ease-out' });
    const quiver = animate(
      arrow,
      [
        { transform: 'translate(-50%, -50%) rotate(58deg)' },
        { transform: 'translate(-50%, -50%) rotate(70deg)', offset: 0.1 },
        { transform: 'translate(-50%, -50%) rotate(60deg)', offset: 0.2 },
        { transform: 'translate(-50%, -50%) rotate(67deg)', offset: 0.3 },
        { transform: 'translate(-50%, -50%) rotate(63deg)', offset: 0.4 },
        { transform: 'translate(-50%, -50%) rotate(64deg)', opacity: 1, offset: 0.85 },
        { transform: 'translate(-50%, -50%) rotate(64deg)', opacity: 0 },
      ],
      { duration: 1500, easing: 'ease-out' },
    ).then(() => arrow.remove());
    const tie = animate(
      rope,
      [
        { transform: 'translate(-50%, -50%) scale(1.5, 1.5)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1, 1)', opacity: 1, offset: 0.25 },
        { transform: 'translate(-50%, -50%) scale(1, 1)', opacity: 1, offset: 0.8 },
        { transform: 'translate(-50%, -50%) scale(1, 1)', opacity: 0 },
      ],
      { duration: 1400, easing: 'ease-out' },
    ).then(() => rope.remove());
    return Promise.all([quiver, tie]);
  }

  // The Potężny cios's new look: the ground cracks under the foe, a shock
  // wave runs out and stones fly.
  function quake(id, color) {
    const entry = cards.get(id);
    if (!entry) return Promise.resolve();
    const box = boxOf(entry.card);
    const base = { x: box.x + box.width / 2, y: box.y + box.height - 8 };
    const cracks = spark('fx-cracks', base, { '--fx': color });
    cracks.style.width = `${Math.round(box.width * 1.7)}px`;
    cracks.innerHTML = CRACKS;
    particles?.burst({ x: base.x, y: base.y, count: 12, colors: STONE, angle: -Math.PI / 2, spread: 1.2, speed: [120, 280], life: [420, 760], size: [1.8, 3.4], shape: 'shard', gravity: 520, drag: 1.2 });
    particles?.burst({ x: base.x, y: base.y, count: 8, colors: DUST, speed: [30, 90], life: [600, 950], size: [5, 9], shape: 'dust', gravity: -20, drag: 2, area: { width: box.width, height: 8 } });
    animate(entry.card, [{ transform: 'translateY(0)' }, { transform: 'translateY(5px) scaleY(0.97)', offset: 0.25 }, { transform: 'translateY(0)' }], { duration: 300, easing: 'ease-out' });
    const wave = spark('fx-shockwave', base, { '--fx': color });
    wave.style.width = `${Math.round(box.width * 2.2)}px`;
    return Promise.all([
      animate(
        cracks,
        [
          { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 1 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.25 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.7 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
        ],
        { duration: 900, easing: 'ease-out' },
      ).then(() => cracks.remove()),
      animate(
        wave,
        [
          { transform: 'translate(-50%, -50%) scale(0.15)', opacity: 0.95 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
        ],
        { duration: 480, easing: 'ease-out' },
      ).then(() => wave.remove()),
    ]);
  }

  // The Szeroki zamach's new look: a broad glowing crescent swept over the
  // whole enemy row, each foe flashing as it passes.
  async function crescent(color, targets) {
    const clip = overRow();
    if (!clip || reduced()) {
      if (clip) clip.remove();
      await arc(color);
      return;
    }
    // A giant blade's arc, swung on a pivot below the row, with two fading
    // copies behind it for its blur.
    const box = boxOf(clip);
    const blades = [0, 45, 90].map((delay, index) => {
      const blade = h('span', { class: 'fx-crescent' });
      blade.style.setProperty('--fx', color);
      blade.style.width = `${Math.round(box.width * 1.1)}px`;
      blade.style.opacity = '0';
      blade.innerHTML =
        '<svg viewBox="0 0 200 80" aria-hidden="true"><defs><linearGradient id="fx-crescent-' + index + '" x1="0" x2="1">' +
        '<stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.45" stop-color="#ffffff"/><stop offset="0.8" stop-color="currentColor"/>' +
        '<stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>' +
        '<path d="M6 72 Q100 -22 194 72 Q100 14 6 72 Z" fill="url(#fx-crescent-' + index + ')"/></svg>';
      clip.append(blade);
      const fade = [1, 0.45, 0.22][index];
      return animate(
        blade,
        [
          { transform: 'translate(-50%, -50%) rotate(-64deg)', opacity: 0 },
          { transform: 'translate(-50%, -50%) rotate(-30deg)', opacity: fade, offset: 0.22 },
          { transform: 'translate(-50%, -50%) rotate(34deg)', opacity: fade, offset: 0.78 },
          { transform: 'translate(-50%, -50%) rotate(58deg)', opacity: 0 },
        ],
        { duration: 520, delay, easing: 'cubic-bezier(0.35, 0, 0.3, 1)', fill: 'backwards' },
      );
    });
    const sweep = Promise.all(blades);
    const row0 = boxOf(clip);
    const flashes = targets.map((id) => {
      const entry = cards.get(id);
      if (!entry) return null;
      const { x } = centerOf(entry.card);
      const share = Math.min(1, Math.max(0, (x - row0.x) / Math.max(1, row0.width)));
      return wait(140 + share * 240).then(() => {
        const point = centerOf(entry.card);
        particles?.burst({ x: point.x, y: point.y, count: 8, colors: ['#ffffff', color], angle: 0, spread: 0.6, speed: [160, 320], life: [180, 340], size: [1.2, 2.2], shape: 'spark', drag: 3.5 });
        return animate(entry.card, [{ filter: 'brightness(2.2)' }, { filter: 'brightness(1)' }], { duration: 260, easing: 'ease-out' });
      });
    });
    await Promise.all([sweep.then(() => clip.remove()), ...flashes]);
  }

  // The Nieugięty's new look: a golden shield comes down on the warrior,
  // with a ring on the ground and golden sparks.
  function emblem(id, color) {
    const entry = cards.get(id);
    if (!entry) return Promise.resolve();
    const { x, y } = centerOf(entry.card);
    const size = Math.round(entry.card.offsetWidth * 0.9);
    const shield = spark('fx-emblem', { x, y }, { '--fx': color, '--size': `${size}px` });
    shield.innerHTML = EMBLEM;
    particles?.burst({ x, y: y + entry.card.offsetHeight * 0.35, count: 16, colors: ['#fff3c4', color, '#e8c76a'], angle: -Math.PI / 2, spread: 1.3, speed: [80, 200], life: [380, 700], size: [1.2, 2.4], shape: 'spark', gravity: 160, drag: 2 });
    return Promise.all([
      animate(
        shield,
        [
          { transform: 'translate(-50%, -110%) scale(1.5)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(0.95)', opacity: 1, offset: 0.28 },
          { transform: 'translate(-50%, -50%) scale(1.04)', opacity: 1, offset: 0.4 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.9, offset: 0.75 },
          { transform: 'translate(-50%, -50%) scale(1.1)', opacity: 0 },
        ],
        { duration: 1000, easing: 'ease-out' },
      ).then(() => shield.remove()),
      wait(260).then(() => ring(id, color, Math.round(entry.card.offsetWidth * 1.6), 520)),
      wait(260).then(() => animate(entry.card, [{ boxShadow: `0 0 0 0 ${color}` }, { boxShadow: `0 0 16px 4px ${color}`, offset: 0.3 }, { boxShadow: '0 0 0 0 transparent' }], { duration: 700 })),
    ]);
  }

  // A step of an effect after a pause, left out when the fight was cut short
  // meanwhile: Pomiń and Powtórz clear the stage, `element` with it, so a
  // late step neither flashes over the replay nor sets an HP over the end.
  const after = (ms, element, step) => wait(ms).then(() => (element.isConnected ? step() : null));

  // The stage's size, and a middle kept inside it for a thing `half` wide.
  const stageWidth = () => kit.arena.clientWidth;
  const stageHeight = () => kit.arena.clientHeight;
  const inside = (value, half, size) => Math.min(Math.max(value, half + 2), Math.max(half + 2, size - half - 2));
  // The box of a card's picture (its upper part when it has none).
  function artOf(card) {
    const art = card.querySelector('.unit-art');
    if (art) return boxOf(art);
    const box = boxOf(card);
    return { x: box.x, y: box.y, width: box.width, height: box.height * 0.5 };
  }
  // The size of the figure in a card's picture, which keeps its size when a
  // computer's card is wider: the looks round a figure follow it.
  const figureOf = (art) => Math.min(art.width, art.height);

  // A four-pointed glint that flares and turns.
  function twinkle(point, color, size = 16, delay = 0) {
    const star = spark('fx-glint', point, { '--fx': color, '--size': `${Math.round(size)}px` });
    star.innerHTML = GLINT;
    return animate(
      star,
      [
        { transform: 'translate(-50%, -50%) scale(0) rotate(0deg)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.25) rotate(45deg)', opacity: 1, offset: 0.35 },
        { transform: 'translate(-50%, -50%) scale(0) rotate(90deg)', opacity: 0 },
      ],
      { duration: 440, delay, easing: 'ease-out', fill: 'backwards' },
    ).then(() => star.remove());
  }

  // A ring of light opening on the ground at a card's foot.
  function groundRing(id, color, { delay = 0, scale = 1, duration = 820 } = {}) {
    const entry = cards.get(id);
    if (!entry) return Promise.resolve();
    const box = boxOf(entry.card);
    const mark = spark('fx-groundring', { x: box.x + box.width / 2, y: box.y + box.height - 9 }, { '--fx': color });
    mark.style.width = `${Math.round(Math.min(box.width * 0.96, figureOf(artOf(entry.card)) * 1.4) * scale)}px`;
    return animate(
      mark,
      [
        { transform: 'translate(-50%, -50%) scale(0.25)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(0.85)', opacity: 1, offset: 0.35 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
      ],
      { duration, delay, easing: 'ease-out', fill: 'backwards' },
    ).then(() => mark.remove());
  }

  // The Modlitwa o zdrowie's new look: a soft beam of light comes down on the
  // healed ally, rings of light open at its feet, and a cross of light forms
  // over it and breaks into small crosses as the HP comes back.
  async function lightfall(event, color) {
    const entry = cards.get(event.target);
    const landed = () => {
      kit.setHp(event.target, event.hp);
      kit.float(event.target, `+${event.amount}`, 'heal');
    };
    if (!entry) {
      landed();
      return;
    }
    const box = boxOf(entry.card);
    const x = box.x + box.width / 2;
    const top = Math.max(0, box.y - box.height * 0.8);
    const foot = box.y + box.height - 6;
    const span = Math.min(box.width * 0.84, figureOf(artOf(entry.card)) * 1.2);
    const beam = spark('fx-lightfall', { x, y: top }, { '--fx': color });
    beam.style.width = `${Math.round(span)}px`;
    beam.style.height = `${Math.round(foot - top)}px`;
    animate(
      beam,
      [
        { transform: 'translate(-50%, 0) scaleY(0)', opacity: 0 },
        { transform: 'translate(-50%, 0) scaleY(1)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, 0) scale(1.06, 1)', opacity: 0.9, offset: 0.65 },
        { transform: 'translate(-50%, 0) scale(0.55, 1)', opacity: 0 },
      ],
      { duration: 1300, easing: 'ease-out' },
    ).then(() => beam.remove());
    // Light falling down the beam.
    for (let wave = 0; wave < 4; wave++) {
      after(wave * 110, beam, () =>
        particles.burst({ x, y: top + 4, area: { width: span * 0.55, height: 10 }, count: 4, colors: ['#ffffff', '#fff6cf', '#e3f5a8'], angle: Math.PI / 2, spread: 0.05, speed: [280, 400], life: [240, 380], size: [0.9, 1.5], shape: 'spark', drag: 1 }),
      );
    }
    await wait(240);
    if (!beam.isConnected) return;
    // The light lands: the card brightens, motes rise from its feet and a
    // cross of light forms over it, then breaks into small crosses as the
    // HP comes back.
    animate(entry.card, [{ filter: 'brightness(1.35) saturate(1.1)' }, { filter: 'brightness(1)' }], { duration: 700, easing: 'ease-out' });
    particles.burst({ x, y: foot - 4, area: { width: span * 0.95, height: 6 }, count: 10, colors: LIFE, angle: -Math.PI / 2, spread: 0.35, speed: [40, 90], rise: 20, gravity: -30, drag: 0.8, life: [800, 1200], size: [1.2, 2.2], shape: 'mote' });
    const crossAt = { x, y: box.y + box.height * 0.36 };
    const cross = spark('fx-holycross', crossAt, { '--fx': color, '--size': `${Math.round(Math.min(box.width, box.height) * 0.42)}px` });
    cross.innerHTML = CROSS;
    const lift = animate(
      cross,
      [
        { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.15)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.34 },
        { transform: 'translate(-50%, -50%) scale(1.02)', opacity: 1, offset: 0.66 },
        { transform: 'translate(-50%, -50%) scale(1.5)', opacity: 0 },
      ],
      { duration: 460, easing: 'ease-out' },
    ).then(() => cross.remove());
    after(320, beam, () => {
      particles.burst({ x, y: crossAt.y, count: 10, colors: LIFE, angle: -Math.PI / 2, spread: 1.3, speed: [50, 130], gravity: -20, drag: 1.8, life: [700, 1100], size: [1.6, 2.6], shape: 'plus' });
      landed();
    });
    await Promise.all([groundRing(event.target, color), groundRing(event.target, '#fff6cf', { delay: 160, scale: 0.8 }), lift, aura(event.target, color, 1), wait(820)]);
  }

  // The Egzorcyzm's new look: a circle of runes opens under each foe, a
  // pillar of light comes down on it and tears dark wisps out of it, the
  // arena lit up. Resolves when the light has struck the last foe.
  async function exorcise(color, targets) {
    if (reduced() || !particles) {
      await beams(color, targets);
      return;
    }
    await Promise.all(targets.map((id, index) => purge(id, color, index * 90, index === 0)));
  }

  // One foe of the Egzorcyzm: its circle at the creature's feet (under its
  // picture, so its HP stays in sight), the pillar down to it, the strike.
  async function purge(id, color, delay, first) {
    const entry = cards.get(id);
    if (!entry) return;
    const box = boxOf(entry.card);
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const width = stageWidth();
    const x = art.x + art.width / 2;
    const foot = art.y + art.height - 6;
    const size = Math.round(Math.min(box.width, figure * 1.3, (Math.min(x, width - x) - 2) * 2));
    const circle = spark('fx-runes', { x, y: foot }, { '--fx': color, '--size': `${size}px` });
    circle.innerHTML = RUNES;
    const flat = 'translate(-50%, -50%) scale(1, 0.38)';
    animate(
      circle,
      [
        { transform: `${flat} rotate(-50deg) scale(0.3)`, opacity: 0 },
        { transform: `${flat} rotate(0deg) scale(1)`, opacity: 1, offset: 0.26 },
        { transform: `${flat} rotate(45deg) scale(1)`, opacity: 1, offset: 0.66 },
        { transform: `${flat} rotate(68deg) scale(1.1)`, opacity: 0 },
      ],
      { duration: 1150, delay, fill: 'backwards' },
    ).then(() => circle.remove());
    after(delay, circle, () => particles.burst({ x, y: foot, area: { width: size * 0.8, height: size * 0.22 }, count: 6, colors: HOLY, angle: -Math.PI / 2, spread: 0.3, speed: [20, 60], rise: 10, gravity: -40, drag: 1, life: [600, 900], size: [1, 1.8], shape: 'mote' }));
    await wait(delay + 220);
    if (!circle.isConnected) return;
    // The pillar: from above the foe (never above the stage) to its circle.
    const top = Math.max(0, box.y - box.height * 0.55);
    const pillar = spark('fx-pillar', { x, y: top }, { '--fx': color });
    pillar.style.width = `${Math.round(figure * 0.72)}px`;
    pillar.style.height = `${Math.round(foot - top + 6)}px`;
    animate(
      pillar,
      [
        { transform: 'translate(-50%, 0) scaleY(0)', opacity: 1 },
        { transform: 'translate(-50%, 0) scaleY(1)', opacity: 1, offset: 0.16 },
        { transform: 'translate(-50%, 0) scale(1.3, 1)', opacity: 1, offset: 0.3 },
        { transform: 'translate(-50%, 0) scale(1, 1)', opacity: 0.8, offset: 0.6 },
        { transform: 'translate(-50%, 0) scale(0.2, 1)', opacity: 0 },
      ],
      { duration: 1000, easing: 'ease-out' },
    ).then(() => pillar.remove());
    await wait(165);
    if (!pillar.isConnected) return;
    // The light strikes: a bloom on the circle, the foe blazes and dark
    // wisps are torn out of it; the first strike lights the arena up.
    if (first) flash('#fff3c4', 0.16, 420);
    const bloom = spark('fx-burst', { x, y: foot }, { '--fx': color, '--size': `${Math.round(size * 0.8)}px` });
    animate(
      bloom,
      [
        { transform: 'translate(-50%, -50%) scale(0.3, 0.12)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1, 0.45)', opacity: 1, offset: 0.3 },
        { transform: 'translate(-50%, -50%) scale(1.3, 0.55)', opacity: 0 },
      ],
      { duration: 480, easing: 'ease-out' },
    ).then(() => bloom.remove());
    animate(entry.card, [{ filter: 'brightness(1.9) saturate(0.7)' }, { filter: 'brightness(1)' }], { duration: 560, easing: 'ease-out' });
    particles.burst({ x, y: foot, area: { width: size * 0.7, height: 6 }, count: 10, colors: HOLY, angle: -Math.PI / 2, spread: 1.2, speed: [60, 160], drag: 2.5, life: [300, 560], size: [1.1, 2], shape: 'spark' });
    tear({ x: x - figure / 2, y: art.y, width: figure, height: art.height });
  }

  // Dark wisps and smoke torn out of a foe's picture, rising into the light.
  function tear(box) {
    const x = box.x + box.width / 2;
    const y = box.y + box.height * 0.6;
    particles.burst({ x, y, area: { width: box.width * 0.55, height: box.height * 0.3 }, count: 8, colors: SHADE, angle: -Math.PI / 2, spread: 0.5, speed: [40, 110], gravity: -60, drag: 1.4, life: [600, 950], size: [3.5, 6], shape: 'dust' });
    particles.burst({ x, y, area: { width: box.width * 0.5, height: box.height * 0.3 }, count: 8, colors: ['#c9b7ff', '#7b5fc7', '#fff6cf'], angle: -Math.PI / 2, spread: 0.6, speed: [60, 160], gravity: -40, drag: 2, life: [400, 700], size: [1.2, 2.2], shape: 'ember' });
    [-0.22, 0.04, 0.25].forEach((dx, index) => {
      const wisp = spark('fx-wisp', { x: x + dx * box.width, y: y + (index % 2) * 10 });
      wisp.innerHTML = WISP;
      const lean = dx * 40;
      animate(
        wisp,
        [
          { transform: 'translate(-50%, -30%) scale(0.6, 0.4)', opacity: 0 },
          { transform: `translate(-50%, -60%) rotate(${(lean * 0.3).toFixed(1)}deg) scale(1, 1)`, opacity: 0.95, offset: 0.3 },
          { transform: `translate(calc(-50% + ${(lean * 0.4).toFixed(1)}px), -130%) rotate(${lean.toFixed(1)}deg) scale(0.7, 1.4)`, opacity: 0 },
        ],
        { duration: 700, delay: index * 60, easing: 'ease-out', fill: 'backwards' },
      ).then(() => wisp.remove());
    });
  }

  // The Błogosławieństwo's new look: rays of light open behind the Kleryk's
  // head, a golden halo settles over it, golden feathers and sparks drift
  // down and a warm light fills the card.
  async function halo(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await Promise.all([ring(id, color, 130, 760), aura(id, color, 2)]);
      return;
    }
    const box = boxOf(entry.card);
    const art = artOf(entry.card);
    const x = art.x + art.width / 2;
    const face = Math.min(art.width, art.height, 72);
    // The halo over the crown of the head, below the skill's name over the
    // card.
    const crown = art.y + face * 0.17;
    // The rays behind the head.
    const glory = spark('fx-aureole', { x, y: art.y + face * 0.4 }, { '--fx': color, '--size': `${Math.round(Math.min(box.width * 0.98, box.height * 0.9))}px` });
    animate(
      glory,
      [
        { transform: 'translate(-50%, -50%) scale(0.5) rotate(0deg)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(12deg)', opacity: 0.9, offset: 0.25 },
        { transform: 'translate(-50%, -50%) scale(1.02) rotate(36deg)', opacity: 0.75, offset: 0.75 },
        { transform: 'translate(-50%, -50%) scale(1.08) rotate(48deg)', opacity: 0 },
      ],
      { duration: 1500, easing: 'ease-out' },
    ).then(() => glory.remove());
    // The warm light over the card.
    const warmth = h('span', { class: 'fx-tint' });
    warmth.style.setProperty('--fx', color);
    entry.card.append(warmth);
    animate(warmth, [{ opacity: 0 }, { opacity: 0.42, offset: 0.3 }, { opacity: 0.3, offset: 0.7 }, { opacity: 0 }], { duration: 1400, easing: 'ease-out' }).then(() => warmth.remove());
    // The halo comes down and settles over the head.
    const ringWidth = Math.round(face * 0.56);
    const crownMark = spark('fx-halo', { x, y: crown }, { '--fx': color, '--size': `${ringWidth}px` });
    crownMark.innerHTML = HALO;
    animate(
      crownMark,
      [
        { transform: 'translate(-50%, calc(-50% - 18px)) scale(1.3)', opacity: 0 },
        { transform: 'translate(-50%, calc(-50% + 2px)) scale(0.96)', opacity: 1, offset: 0.24 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.34 },
        { transform: 'translate(-50%, calc(-50% - 1px)) scale(1.02)', opacity: 1, offset: 0.8 },
        { transform: 'translate(-50%, calc(-50% - 5px)) scale(1.06)', opacity: 0 },
      ],
      { duration: 1450, easing: 'ease-out' },
    ).then(() => crownMark.remove());
    after(360, crownMark, () => {
      twinkle({ x: x - ringWidth * 0.46, y: crown }, '#fff6cf', 14);
      twinkle({ x: x + ringWidth * 0.46, y: crown }, '#fff6cf', 12, 90);
      particles.burst({ x, y: crown, area: { width: ringWidth, height: 6 }, count: 8, colors: GOLD, angle: -Math.PI / 2, spread: Math.PI, speed: [30, 90], drag: 2, life: [400, 700], size: [1, 1.8], shape: 'spark' });
    });
    // Golden feathers and sparks drifting down over the card, round the
    // figure.
    const spread = Math.min(box.width, figureOf(art) * 1.45);
    const left = box.x + (box.width - spread) / 2;
    particles.burst({ x: box.x + box.width / 2, y: box.y + 6, area: { width: spread * 0.85, height: 14 }, count: 12, colors: GOLD, angle: Math.PI / 2, spread: 0.5, speed: [12, 40], gravity: 34, drag: 0.8, life: [900, 1400], size: [1.1, 2], shape: 'mote' });
    // (They and the halo keep fading while the fight goes on.)
    [0.16, 0.84, 0.36, 0.64, 0.26, 0.74].forEach((share, index) => {
      const feather = spark('fx-feather', { x: left + spread * share, y: box.y - 8 + (index % 3) * 12 }, { '--fx': color });
      feather.innerHTML = FEATHER;
      const fall = box.height * (0.5 + (index % 3) * 0.1);
      const sway = (index % 2 ? 1 : -1) * Math.min(9, spread * 0.08);
      const frames = Array.from({ length: 6 }, (_, step) => {
        const share0 = step / 5;
        const swing = Math.sin(share0 * Math.PI * 2.2 + index) * sway;
        return {
          transform: `translate(calc(-50% + ${swing.toFixed(1)}px), calc(-50% + ${(fall * share0).toFixed(1)}px)) rotate(${(swing * 3.6 + (index % 2 ? 18 : -18)).toFixed(1)}deg)`,
          opacity: step === 0 || step === 5 ? 0 : 1,
        };
      });
      animate(feather, frames, { duration: 1500 + (index % 3) * 180, delay: 60 + index * 70, easing: 'linear', fill: 'backwards' }).then(() => feather.remove());
    });
    await Promise.all([groundRing(id, color, { delay: 280 }), aura(id, color, 2), wait(1150)]);
  }

  // A puff of shadow smoke at a point: a dark cloud that swells and thins,
  // smoke and violet sparks.
  function puff(point, size) {
    const cloud = spark('fx-smoke', point, { '--size': `${Math.round(size)}px` });
    particles.burst({ x: point.x, y: point.y, count: 9, colors: SHADE, speed: [20, 70], life: [600, 950], size: [size * 0.06, size * 0.1], shape: 'dust', gravity: -30, drag: 2.2, area: { width: size * 0.5, height: size * 0.4 } });
    particles.burst({ x: point.x, y: point.y, count: 8, colors: SHADE_SPARKS, speed: [60, 150], life: [300, 560], size: [1.2, 2.2], shape: 'ember', drag: 3 });
    animate(
      cloud,
      [
        { transform: 'translate(-50%, -50%) scale(0.35)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(0.9)', opacity: 0.95, offset: 0.25 },
        { transform: 'translate(-50%, -50%) scale(1.15)', opacity: 0 },
      ],
      { duration: 640, easing: 'ease-out' },
    ).then(() => cloud.remove());
    return cloud;
  }

  // The Cios w plecy's new look, as its blow starts (arena-fx.js strike()
  // fades the Cień out and thrusts its dagger by the target): the Cień
  // vanishes in a puff of shadow smoke and comes out of another behind its
  // target, as a shadow of itself that melts away after the blow; a last
  // puff as it is back in its place.
  function vanish(event) {
    const actor = cards.get(event.actor);
    const target = cards.get(event.target);
    if (!actor || !target || reduced() || !particles) return;
    const from = boxOf(actor.card);
    const to = boxOf(target.card);
    const width = stageWidth();
    const art = artOf(actor.card);
    const smoke = figureOf(art) * 1.3;
    const home = puff({ x: from.x + from.width / 2, y: from.y + from.height * 0.42 }, smoke);
    // Behind the target: on its side toward the arena's middle, where the
    // dagger comes from.
    const side = to.x + to.width / 2 < width / 2 ? 1 : -1;
    const half = figureOf(art) / 2;
    const x = inside(side > 0 ? to.x + to.width + half - 8 : to.x - half + 8, half, width);
    const y = inside(to.y + (art.y - from.y) + art.height / 2, art.height / 2, stageHeight());
    const shade = actor.card.querySelector('.unit-art')?.cloneNode(true) ?? null;
    after(20, home, () => puff({ x, y }, smoke * 0.85));
    if (shade) {
      shade.querySelector('.unit-level')?.remove();
      shade.classList.add('fx-shade');
      shade.setAttribute('aria-hidden', 'true');
      shade.style.left = `${x - art.width / 2}px`;
      shade.style.top = `${y - art.height / 2}px`;
      shade.style.width = `${art.width}px`;
      shade.style.height = `${art.height}px`;
      fx.append(shade);
      animate(
        shade,
        [
          { transform: `translate(${side * 6}px, 4px) scale(0.9)`, opacity: 0 },
          { transform: 'translate(0, 0) scale(1)', opacity: 0.92, offset: 0.15 },
          { transform: 'translate(0, 0) scale(1)', opacity: 0.92, offset: 0.62 },
          { transform: `translate(${-side * 4}px, -8px) scale(1.05)`, opacity: 0 },
        ],
        { duration: 720, delay: 25, easing: 'ease-out', fill: 'backwards' },
      ).then(() => shade.remove());
      after(450, shade, () => puff({ x, y: y + 4 }, smoke * 0.75));
    }
    after(320, home, () => puff({ x: from.x + from.width / 2, y: from.y + from.height * 0.42 }, smoke * 0.75));
  }

  // The Cios w plecy's blow: a violet cut across the target from behind,
  // shadow smoke and violet shards.
  function shadowCut(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    const box = boxOf(entry.card);
    const width = stageWidth();
    const { x, y } = centerOf(entry.card);
    const side = x < width / 2 ? 1 : -1;
    const size = Math.round(Math.min(Math.min(box.width, box.height * 1.15) * 1.3, (Math.min(x, width - x) - 2) * 2));
    const cut = spark('fx-shadowslash', { x, y }, { '--fx': color, '--size': `${size}px` });
    cut.innerHTML = SHADOW_SLASH;
    // Drawn from the Cień's side across to the other.
    const at = `translate(-50%, -50%) scaleX(${-side})`;
    animate(
      cut,
      [
        { transform: `${at} scale(0.92)`, clipPath: 'inset(0 100% 0 0)', opacity: 1 },
        { transform: `${at} scale(1)`, clipPath: 'inset(0 0% 0 0)', opacity: 1, offset: 0.2 },
        { transform: `${at} scale(1.02)`, clipPath: 'inset(0 0% 0 0)', opacity: 1, offset: 0.6 },
        { transform: `${at} scale(1.08)`, clipPath: 'inset(0 0% 0 0)', opacity: 0 },
      ],
      { duration: 600, easing: 'ease-out' },
    ).then(() => cut.remove());
    particles.burst({ x, y, count: 14, colors: SHADE_SPARKS, angle: side > 0 ? Math.PI * 0.82 : Math.PI * 0.18, spread: 0.45, speed: [150, 320], life: [260, 480], size: [1.4, 2.6], shape: 'shard', drag: 3, gravity: 120 });
    puff({ x: x + side * box.width * 0.1, y }, figureOf(artOf(entry.card)) * 1.05);
    burst(event.target, '#7b5fc7', 80);
  }

  // The Zatrute ostrze's new look: the Cień's own blade over its card, point
  // down, venom running down it from the guard to the point, bubbling and
  // dripping from the point, a toxic glint along it and a green haze at the
  // card's foot.
  async function venom(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    const base = entry.unit.weapon ?? (entry.unit.classId === 'shadow' ? 'dagger' : null);
    const steel = base && !reduced() && particles ? itemSprite({ base }) : null;
    if (!steel) {
      await Promise.all([specks(id, color, { rise: false }), aura(id, color, 1)]);
      return;
    }
    const box = boxOf(entry.card);
    const art = artOf(entry.card);
    const size = Math.round(Math.min(art.width, art.height, 72) * 1.08);
    const x = art.x + art.width / 2;
    const y = art.y + art.height * 0.52;
    // Where the point is, the blade turned point down (the item icons'
    // blades point up and to the right).
    const tip = { x, y: y + size * 0.47 };
    const blade = spark('fx-venom', { x, y }, { '--fx': color, '--size': `${size}px` });
    steel.removeAttribute('width');
    steel.removeAttribute('height');
    steel.className = 'fx-venom-steel';
    const coat = steel.cloneNode();
    coat.className = 'fx-venom-coat';
    const shine = h('span', { class: 'fx-venom-shine' });
    const picture = `url("${steel.getAttribute('src')}")`;
    shine.style.setProperty('-webkit-mask-image', picture);
    shine.style.setProperty('mask-image', picture);
    blade.append(steel, coat, shine);
    const held = 'translate(-50%, -50%) rotate(135deg)';
    animate(
      blade,
      [
        { transform: `translate(-50%, calc(-50% - 12px)) rotate(135deg) scale(0.7)`, opacity: 0 },
        { transform: `${held} scale(1)`, opacity: 1, offset: 0.13 },
        { transform: `${held} scale(1)`, opacity: 1, offset: 0.84 },
        { transform: `translate(-50%, calc(-50% + 4px)) rotate(135deg) scale(0.94)`, opacity: 0 },
      ],
      { duration: 1550, easing: 'ease-out' },
    ).then(() => blade.remove());
    // The venom runs down the blade from the crossguard to the point: a band
    // across the blade (in the icon, from its guard's line, x − y = −0.28,
    // toward its point, up and to the right) that grows.
    animate(coat, [{ clipPath: VENOM_FROM }, { clipPath: VENOM_TO }], { duration: 560, delay: 160, easing: 'ease-in-out', fill: 'both' });
    for (const [delay, count] of [
      [260, 5],
      [620, 6],
      [980, 5],
    ]) {
      after(delay, blade, () => particles.burst({ x, y: y + size * 0.1, area: { width: size * 0.16, height: size * 0.6 }, count, colors: ['#eaffc0', '#9ccc65'], angle: -Math.PI / 2, spread: 0.6, speed: [8, 26], rise: 14, life: [600, 1000], size: [1.4, 2.6], shape: 'bubble', drag: 1 }));
    }
    // Drops gather on the point and fall.
    for (const [index, delay] of [560, 960].entries()) {
      after(delay, blade, () => drop(tip, box, index));
    }
    for (let step = 0; step < 6; step++) {
      after(640 + step * 110, blade, () => particles.burst({ x: tip.x, y: tip.y, count: 1, colors: VENOM, angle: Math.PI / 2, spread: 0.15, speed: [10, 30], gravity: 420, life: [360, 480], size: [1.6, 2.4], shape: 'ember', drag: 0.6 }));
    }
    // The toxic glint along the blade, a flash on its point.
    animate(shine, [{ backgroundPosition: '100% 0%', opacity: 1 }, { backgroundPosition: '0% 100%', opacity: 1 }], { duration: 440, delay: 740, easing: 'ease-in-out', fill: 'both' });
    twinkle({ x: tip.x, y: tip.y - size * 0.08 }, '#eaffc0', 18, 1060);
    // A green haze and bubbles at the card's feet, its frame lit green.
    after(420, blade, () => {
      particles.burst({ x: box.x + box.width / 2, y: box.y + box.height - 10, area: { width: size * 1.1, height: 6 }, count: 4, colors: ['#6f9a3a', '#4f7a22'], angle: -Math.PI / 2, spread: 0.8, speed: [6, 18], gravity: -10, drag: 1.5, life: [700, 1000], size: [2.5, 4], shape: 'dust' });
      particles.burst({ x: box.x + box.width / 2, y: box.y + box.height - 12, area: { width: size * 1.0, height: 8 }, count: 7, colors: ['#d7f5a8', '#9ccc65'], angle: -Math.PI / 2, spread: 0.5, speed: [10, 30], rise: 16, life: [600, 950], size: [1.4, 2.4], shape: 'bubble', drag: 1 });
      aura(id, color, 1);
    });
    // The blade fades while the fight goes on.
    await wait(1250);
  }

  // A drop of venom gathering on the blade's point and falling, splashing
  // at the card's foot.
  function drop(tip, box, index) {
    const bead = spark('fx-drop', tip);
    const fall = Math.max(12, box.y + box.height - 14 - tip.y);
    return animate(
      bead,
      [
        { transform: 'translate(-50%, -20%) scale(0.2)', opacity: 0 },
        { transform: 'translate(-50%, 0%) scale(1)', opacity: 1, offset: 0.55, easing: 'ease-in' },
        { transform: `translate(-50%, ${fall.toFixed(1)}px) scale(0.9, 1.15)`, opacity: 1 },
      ],
      { duration: 520 + index * 40, easing: 'ease-out' },
    ).then(() => {
      bead.remove();
      particles.burst({ x: tip.x, y: tip.y + fall + 4, count: 5, colors: VENOM, angle: -Math.PI / 2, spread: 0.9, speed: [40, 90], gravity: 300, drag: 1, life: [260, 420], size: [1.1, 1.8], shape: 'ember' });
    });
  }

  // The Taniec cieni's new look: shadows whirl round the Cień, its figure
  // dims in its card while dark violet copies of it dash from side to side
  // round it, and it comes back in a burst of violet light.
  async function dance(id, color) {
    const entry = cards.get(id);
    const source = entry?.card.querySelector('.unit-art');
    if (!entry || !source || reduced() || !particles) {
      await ghosts(id, color);
      return;
    }
    const box = boxOf(entry.card);
    const art = boxOf(source);
    const width = stageWidth();
    // The whirl: the card's height, as wide as the card at most (round the
    // figure on a computer's wide card), a little more, kept on the stage.
    const across = Math.min(box.width, box.height);
    const from = box.x + (box.width - across) / 2;
    const margin = Math.max(0, Math.min(6, from - 1, width - from - across - 1, box.y - 1));
    const swirl = spark('fx-swirl', { x: from - margin, y: box.y - margin }, { '--fx': color });
    swirl.style.width = `${Math.round(across + margin * 2)}px`;
    swirl.style.height = `${Math.round(box.height + margin * 2)}px`;
    swirl.innerHTML = SWIRL;
    animate(swirl.querySelector('g'), [{ transform: 'rotate(0deg)' }, { transform: 'rotate(300deg)' }], { duration: 1000, easing: 'cubic-bezier(0.3, 0.1, 0.4, 1)' });
    const whirl = animate(
      swirl,
      [
        { transform: 'scale(1.08)', opacity: 0 },
        { transform: 'scale(1)', opacity: 0.95, offset: 0.18 },
        { transform: 'scale(0.96)', opacity: 0.85, offset: 0.7 },
        { transform: 'scale(0.86)', opacity: 0 },
      ],
      { duration: 1000, easing: 'ease-out' },
    ).then(() => swirl.remove());
    particles.burst({ x: box.x + box.width / 2, y: box.y + box.height - 10, area: { width: across * 0.8, height: 8 }, count: 6, colors: SHADE, angle: -Math.PI / 2, spread: 0.7, speed: [10, 40], gravity: -20, drag: 1.5, life: [700, 1100], size: [3, 5], shape: 'dust' });
    // The figure dims in its card while its shadows dance.
    const figure = source.querySelector('img, svg, .unit-icon') ?? source;
    animate(figure, [{ opacity: 1 }, { opacity: 0.2, offset: 0.1 }, { opacity: 0.2, offset: 0.78 }, { opacity: 1 }], { duration: 720 });
    // Where the copies stand round the figure (by its middle), kept on the
    // stage: left, right, up left, up right, and back in the middle.
    const reach = Math.min(figureOf(art) * 0.44, 32);
    const fit = (dx) => Math.min(Math.max(dx, 2 - art.x), width - 2 - art.x - art.width);
    const spots = [
      [-1, 0.06],
      [1, -0.04],
      [-0.75, -0.2],
      [0.8, -0.12],
      [0, 0],
    ].map(([sideways, up]) => ({ x: fit(sideways * reach), y: up * art.height * 0.5 }));
    spots.forEach((at, step) => {
      const last = step === spots.length - 1;
      after(step * 105, swirl, () => {
        const before = spots[step - 1] ?? { x: 0, y: 0 };
        shadowCopy(source, art, at, Math.sign(at.x - before.x) || 1, last);
        if (step > 0) dashLine(art, before.x, at.x, color);
      });
    });
    await wait(spots.length * 105 + 40);
    if (!swirl.isConnected) return;
    // Back in its place, wrapped in violet light.
    particles.burst({ x: art.x + art.width / 2, y: art.y + art.height / 2, area: { width: figureOf(art) * 0.7, height: art.height * 0.6 }, count: 14, colors: SHADE_SPARKS, speed: [60, 150], drag: 3, life: [300, 600], size: [1.2, 2.2], shape: 'spark' });
    animate(entry.card, [{ filter: 'brightness(0.6) saturate(1.4)' }, { filter: 'brightness(1)' }], { duration: 420, easing: 'ease-out' });
    await Promise.all([whirl, aura(id, color, 1)]);
  }

  // A dark violet copy of a card's figure at `at` from it, fading as it
  // drifts back against its dash (the last one comes back into the figure).
  function shadowCopy(source, art, at, way, last) {
    const copy = source.cloneNode(true);
    copy.querySelector('.unit-level')?.remove();
    copy.classList.add('fx-shade', 'fx-shade--dance');
    copy.setAttribute('aria-hidden', 'true');
    copy.style.left = `${art.x + at.x}px`;
    copy.style.top = `${art.y + at.y}px`;
    copy.style.width = `${art.width}px`;
    copy.style.height = `${art.height}px`;
    fx.append(copy);
    const frames = last
      ? [
          { transform: 'scale(1.12)', opacity: 0.85 },
          { transform: 'scale(1)', opacity: 0 },
        ]
      : [
          { transform: `translateX(${-way * 4}px) skewX(${-way * 8}deg)`, opacity: 0.95 },
          { transform: 'translateX(0) skewX(0deg)', opacity: 0.8, offset: 0.25 },
          { transform: `translateX(${-way * 7}px) skewX(0deg)`, opacity: 0 },
        ];
    return animate(copy, frames, { duration: last ? 320 : 420, easing: 'ease-out' }).then(() => copy.remove());
  }

  // A streak of a dash, across a figure's middle.
  function dashLine(box, from, to, color) {
    const line = spark('fx-dashline', { x: box.x + box.width / 2 + (from + to) / 2, y: box.y + box.height * (0.4 + Math.random() * 0.3) }, { '--fx': color });
    line.style.width = `${Math.round(Math.max(24, Math.abs(to - from) + figureOf(box) * 0.6))}px`;
    const way = Math.sign(to - from) || 1;
    return animate(
      line,
      [
        { transform: `translate(-50%, -50%) translateX(${-way * 10}px) scaleX(0.3)`, opacity: 0 },
        { transform: 'translate(-50%, -50%) scaleX(1)', opacity: 0.9, offset: 0.35 },
        { transform: `translate(-50%, -50%) translateX(${way * 12}px) scaleX(0.5)`, opacity: 0 },
      ],
      { duration: 260, easing: 'ease-out' },
    ).then(() => line.remove());
  }

  // ——— 960: the evolved Mag's skills in looks of their own ———

  // The arena trembling (the ground shaking, a heavy landing): the stage
  // shakes a little, a little zoomed so its edges stay covered.
  // (962: `vertical`: a thud, up and down only.)
  function shake(power, duration = 320, vertical = false) {
    if (reduced()) return;
    const steps = 8;
    const frames = Array.from({ length: steps + 1 }, (_, index) => {
      if (index === 0 || index === steps) return { transform: 'translate(0px, 0px) scale(1)' };
      const left = 1 - index / steps;
      const x = vertical ? 0 : (index % 2 ? 1 : -1) * power * left;
      const y = vertical ? (index % 2 ? 1 : -1) * power * 0.8 * left : ((index % 3) - 1) * power * 0.6 * left;
      return { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(1 + power * 0.004).toFixed(3)})` };
    });
    animate(kit.arena, frames, { duration, composite: 'add' });
  }

  // An empty mark in the effects layer for a look's late steps: they go on
  // while it is there (Pomiń and Powtórz clear the layer).
  function anchor(duration) {
    const mark = spark('fx-anchor', { x: 0, y: 0 });
    wait(duration).then(() => mark.remove());
    return mark;
  }

  // Leaves thrown up out of a point, turning and drifting down, kept on
  // the stage.
  function leaves(point, { count = 8, reach = 40, delay = 0, colors = LEAVES } = {}) {
    const width = stageWidth();
    for (let index = 0; index < count; index++) {
      const share = count > 1 ? index / (count - 1) : 0.5;
      const angle = -Math.PI / 2 + (share - 0.5) * Math.PI * 1.25;
      const far = reach * (0.65 + ((index * 7) % 5) * 0.09);
      const dx = Math.min(Math.max(Math.cos(angle) * far, (8 - point.x) / 1.25), (width - 8 - point.x) / 1.25);
      const dy = Math.max(Math.sin(angle) * far * 0.75, 6 - point.y);
      const drop = 16 + (index % 3) * 8;
      const spin = (index % 2 ? 1 : -1) * (120 + ((index * 53) % 140));
      const leaf = spark('fx-leaf', point);
      leaf.innerHTML = LEAF(colors[index % colors.length]);
      animate(
        leaf,
        [
          { transform: 'translate(-50%, -50%) scale(0.3) rotate(0deg)', opacity: 0 },
          { transform: `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px)) scale(1) rotate(${Math.round(spin * 0.45)}deg)`, opacity: 1, offset: 0.3, easing: 'ease-in-out' },
          { transform: `translate(calc(-50% + ${(dx * 1.25).toFixed(1)}px), calc(-50% + ${(dy + drop).toFixed(1)}px)) scale(0.9) rotate(${spin}deg)`, opacity: 0 },
        ],
        { duration: 950 + (index % 3) * 110, delay: delay + index * 16, easing: 'ease-out', fill: 'backwards' },
      ).then(() => leaf.remove());
    }
  }

  // Motes of light drawn into a point from a ring round it.
  function gatherTo(point, radius, colors, { count = 12, life = 320 } = {}) {
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2 + Math.random() * 0.4;
      particles.burst({ x: point.x + Math.cos(angle) * radius, y: point.y + Math.sin(angle) * radius, count: 1, colors: [colors[index % colors.length]], angle: angle + Math.PI, spread: 0, speed: [(radius / life) * 950, (radius / life) * 1000], life: [life, life], size: [1.3, 2.3], shape: 'mote', drag: 0 });
    }
  }

  // The card of the creature a summon calls (arena.js gives it a card of
  // its own before its summoner), by its summoner and its skill.
  function summonedCard(event) {
    for (const entry of cards.values()) {
      if (entry.unit.summon === event.skill && entry.unit.id.startsWith(`${event.target}~`)) return entry;
    }
    return null;
  }

  // How each creature comes: the circle's colour (a druid's, or an
  // arcanist's runes), the summoner's magic and the creature's own colour.
  const ARRIVALS = {
    oak: { circle: '#9fd36b', motes: LIFE, own: '#7fb069' },
    ent: { circle: '#9fd36b', motes: LIFE, own: '#7fb069' },
    bear: { circle: '#9fd36b', motes: LIFE, own: '#c8a070' },
    aurochs: { circle: '#9fd36b', motes: LIFE, own: '#c8a26a' },
    elemental: { circle: '#8fd3ff', motes: MANA, own: '#ffb36b', arcane: true },
    // 964: the Cień's: a puddle of venom, a necromancer's circle, a grave
    // (the first and the last without a circle).
    slime: { circle: '#9ccc65', motes: VENOM, own: '#9ccc65', puddle: true },
    skeleton: { circle: '#a6d96a', motes: ['#eaffc0', '#a6d96a', '#5f8f2e'], own: '#8fbf5a', necro: true },
    army: { circle: '#cfc6a8', motes: ['#efe8d8', '#cfc6a8', '#9a927e'], own: '#c8803a', grave: true },
  };
  // When the creature starts to come, after the circle opened.
  const COMING = 380;

  // 960: a summoning (Przebudzenie dębu, Przywołanie żubra, żywiołaka, enta
  // and niedźwiedzia). A circle opens on the ground where the creature will
  // stand and the summoner's magic flows into it; then the creature's card
  // comes its own way, with a burst in its style: an oak rises out of the
  // trembling ground, an ent grows up out of it, a bear bursts out of a
  // thicket with a roar, an aurochs charges in, an elemental takes shape in
  // a whirl of mana and flame. (Its card's own coming in arena.js plays
  // under this one, which hides it until its time.)
  async function summonCreature(event, look) {
    const owner = cards.get(event.actor);
    const entry = summonedCard(event);
    if (!owner || !entry || reduced() || !particles) {
      await Promise.all([ring(event.actor, look.color, 130, 760), aura(event.actor, look.color, 2)]);
      return;
    }
    const style = ARRIVALS[look.arrival];
    const box = boxOf(entry.card);
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const width = stageWidth();
    const x = box.x + box.width / 2;
    // (964: a grave opens at the figure's feet, over the bottom of its
    // picture, not under the card.)
    const ground = style.grave ? art.y + art.height - 3 : box.y + box.height - 8;
    const size = Math.round(Math.min(box.width * 0.96, figure * 1.45, (Math.min(x, width - x) - 2) * 2));
    // The circle, under the card's foot.
    const circle = spark('fx-circle', { x, y: ground }, { '--fx': style.circle, '--size': `${size}px` });
    circle.innerHTML = style.puddle || style.grave ? '' : style.necro ? NECRO_CIRCLE : style.arcane ? ARCANE_CIRCLE : DRUID_CIRCLE;
    // (964: the slime's puddle and the grave have no circle: an empty mark
    // the creature's coming goes by.)
    if (style.puddle || style.grave) circle.style.setProperty('--size', '0px');
    const flat = 'translate(-50%, -50%) scale(1, 0.38)';
    animate(
      circle,
      [
        { transform: `${flat} rotate(-60deg) scale(0.2)`, opacity: 0 },
        { transform: `${flat} rotate(0deg) scale(1)`, opacity: 1, offset: 0.24 },
        { transform: `${flat} rotate(45deg) scale(1)`, opacity: 1, offset: 0.68 },
        { transform: `${flat} rotate(64deg) scale(1.12)`, opacity: 0 },
      ],
      { duration: 1500 },
    ).then(() => circle.remove());
    // The summoner's magic flowing into it.
    const from = centerOf(owner.card);
    const distance = Math.hypot(x - from.x, ground - from.y);
    const toward = Math.atan2(ground - from.y, x - from.x);
    for (let wave = 0; wave < 3; wave++) {
      after(wave * 70, circle, () => particles.burst({ x: from.x, y: from.y, area: { width: 10, height: 10 }, count: 6, colors: style.motes, angle: toward, spread: 0.1, speed: [distance * 2.9, distance * 3.1], life: [320, 330], size: [1.4, 2.4], shape: 'mote', drag: 0 }));
    }
    after(160, circle, () => particles.burst({ x, y: ground, area: { width: size * 0.8, height: size * 0.18 }, count: 8, colors: style.motes, angle: -Math.PI / 2, spread: 0.3, speed: [30, 70], rise: 10, gravity: -40, drag: 1, life: [500, 800], size: [1, 1.8], shape: 'mote' }));
    const scene = { entry, card: entry.card, box, art, figure, x, ground, circle, width };
    if (look.arrival === 'oak') riseOak(scene);
    else if (look.arrival === 'ent') growEnt(scene);
    else if (look.arrival === 'bear') bearOut(scene);
    else if (look.arrival === 'aurochs') chargeIn(scene);
    // 964: the Trujący Szlam oozes out of its puddle; the dead rise.
    else if (look.arrival === 'slime') slimeOut(scene);
    else if (look.arrival === 'skeleton') riseUndead(scene);
    else if (look.arrival === 'army') graveOut(scene);
    else formElemental(scene);
    await wait(look.arrival === 'army' ? 1450 : 1250);
  }

  // An oak rising out of the trembling ground: the ground cracks, stones
  // and dust fly, the card comes up from under its foot (what is still
  // under the ground unseen) and its crown shakes out leaves.
  function riseOak({ entry, card, box, art, figure, x, ground, circle }) {
    after(COMING - 220, circle, () => shake(2.4, 560));
    const cracks = spark('fx-cracks', { x, y: ground + 2 }, { '--fx': '#8bbf4a' });
    cracks.style.width = `${Math.round(Math.min(box.width * 1.05, figure * 1.7))}px`;
    cracks.style.color = '#d8c39a';
    cracks.innerHTML = CRACKS;
    animate(
      cracks,
      [
        { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.25 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.7 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
      ],
      { duration: 1150, delay: COMING - 140, easing: 'ease-out', fill: 'backwards' },
    ).then(() => cracks.remove());
    const depth = box.height + 4;
    animate(
      card,
      [
        { transform: `translateY(${depth}px)`, clipPath: `inset(0px -14px ${depth}px -14px)`, easing: 'cubic-bezier(0.2, 0.75, 0.35, 1)' },
        { transform: 'translateY(-5px)', clipPath: 'inset(-14px -14px -5px -14px)', offset: 0.78, easing: 'ease-in-out' },
        { transform: 'translateY(0px)', clipPath: 'inset(-14px -14px 0px -14px)' },
      ],
      { duration: 600, delay: COMING, fill: 'backwards' },
    );
    for (const [delay, count] of [
      [COMING, 8],
      [COMING + 160, 6],
      [COMING + 320, 4],
    ]) {
      after(delay, circle, () => {
        particles.burst({ x, y: ground, area: { width: box.width * 0.7, height: 4 }, count, colors: STONE, angle: -Math.PI / 2, spread: 0.9, speed: [90, 220], life: [380, 700], size: [1.6, 3], shape: 'shard', gravity: 520, drag: 1.2 });
        particles.burst({ x, y: ground, area: { width: box.width * 0.8, height: 6 }, count: Math.ceil(count / 2), colors: DUST, speed: [20, 70], life: [600, 950], size: [4, 8], shape: 'dust', gravity: -20, drag: 2 });
      });
    }
    after(COMING + 470, circle, () => {
      leaves({ x, y: art.y + art.height * 0.3 }, { count: 9, reach: figure * 0.75 });
      groundRing(entry.unit.id, '#9fd36b');
      aura(entry.unit.id, '#7fb069', 1);
    });
  }

  // An ent growing up out of the ground from a sprout, green light rising
  // round it and leaves sprouting on its crown.
  function growEnt({ entry, card, box, art, figure, x, ground, circle }) {
    const lift = (scale) => `translate(0px, ${((1 - scale) * box.height * 0.5).toFixed(1)}px)`;
    animate(
      card,
      [
        { transform: `${lift(0.06)} scale(0.3, 0.06)`, opacity: 0, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' },
        { transform: `${lift(0.62)} scale(0.78, 0.62)`, opacity: 1, offset: 0.4 },
        { transform: `${lift(1.08)} scale(1.04, 1.08)`, opacity: 1, offset: 0.78, easing: 'ease-in-out' },
        { transform: `${lift(1)} scale(1, 1)`, opacity: 1 },
      ],
      { duration: 640, delay: COMING, fill: 'backwards' },
    );
    for (let wave = 0; wave < 4; wave++) {
      after(COMING + wave * 120, circle, () => particles.burst({ x, y: ground, area: { width: box.width * 0.6, height: 6 }, count: 5, colors: LIFE, angle: -Math.PI / 2, spread: 0.35, speed: [50, 110], gravity: -20, drag: 1, life: [600, 900], size: [1.2, 2.2], shape: 'mote' }));
    }
    after(COMING + 470, circle, () => {
      leaves({ x, y: art.y + art.height * 0.25 }, { count: 7, reach: figure * 0.6 });
      groundRing(entry.unit.id, '#9fd36b');
      aura(entry.unit.id, '#7fb069', 1);
    });
  }

  // A bear bursting out of a thicket: leaves and twigs thrown about, the
  // card stepping out, and its roar rolling out over the arena.
  function bearOut({ entry, card, art, figure, x, circle, width }) {
    const middle = { x, y: art.y + art.height * 0.6 };
    after(COMING - 40, circle, () => {
      leaves(middle, { count: 11, reach: figure * 0.8, colors: THICKET });
      particles.burst({ x: middle.x, y: middle.y, area: { width: figure * 0.6, height: figure * 0.4 }, count: 10, colors: TWIGS, speed: [80, 200], life: [380, 650], size: [1.4, 2.6], shape: 'shard', gravity: 300, drag: 1.5 });
    });
    animate(
      card,
      [
        { transform: 'translateY(10px) scale(0.86)', opacity: 0, easing: 'cubic-bezier(0.25, 0.8, 0.35, 1)' },
        { transform: 'translateY(-4px) scale(1.05)', opacity: 1, offset: 0.55, easing: 'ease-in-out' },
        { transform: 'translateY(0px) scale(1)', opacity: 1 },
      ],
      { duration: 420, delay: COMING, fill: 'backwards' },
    );
    // Its roar: waves of sound rolling up from its head toward the foes.
    const head = { x, y: art.y + art.height * 0.32 };
    const across = Math.round(Math.min(figure * 1.4, (Math.min(head.x, width - head.x) - 3) * 2));
    for (let index = 0; index < 3; index++) {
      const wave = spark('fx-roar', head, { '--fx': '#f1e6cc', '--size': `${across}px` });
      wave.innerHTML = ROAR;
      animate(
        wave,
        [
          { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(0.7)', opacity: 1, offset: 0.3 },
          { transform: 'translate(-50%, -50%) scale(1.15)', opacity: 0 },
        ],
        { duration: 480, delay: COMING + 300 + index * 110, easing: 'ease-out', fill: 'backwards' },
      ).then(() => wave.remove());
    }
    after(COMING + 300, circle, () => {
      shake(2.2, 300);
      groundRing(entry.unit.id, '#c8a070');
      aura(entry.unit.id, '#a0784f', 1);
    });
  }

  // An aurochs charging in from the arena's edge, dust under its hooves,
  // and stopping dead with a thud.
  function chargeIn({ entry, card, box, x, ground, circle }) {
    const from = -(box.x + box.width + 6);
    const run = 560;
    animate(
      card,
      [
        { transform: `translateX(${from}px) skewX(-9deg)`, easing: 'cubic-bezier(0.35, 0.1, 0.55, 1)' },
        { transform: 'translateX(9px) skewX(-5deg)', offset: 0.74, easing: 'cubic-bezier(0.2, 0.8, 0.4, 1)' },
        { transform: 'translateX(-2px) skewX(2deg)', offset: 0.88, easing: 'ease-in-out' },
        { transform: 'translateX(0px) skewX(0deg)' },
      ],
      { duration: run, delay: COMING, fill: 'backwards' },
    );
    // Dust kicked up behind it as it runs.
    for (let step = 0; step < 6; step++) {
      const at = x + from * (1 - (step + 1) / 6.5) - box.width * 0.3;
      if (at < 6) continue;
      after(COMING + step * 70, circle, () => particles.burst({ x: at, y: ground + 2, area: { width: 24, height: 5 }, count: 2, colors: DUST, angle: -Math.PI * 0.8, spread: 0.5, speed: [20, 50], life: [450, 700], size: [2.5, 4.5], shape: 'dust', gravity: -10, drag: 2 }));
    }
    after(COMING + run * 0.74, circle, () => {
      particles.burst({ x, y: ground, area: { width: box.width * 0.9, height: 6 }, count: 9, colors: DUST, speed: [30, 100], life: [600, 950], size: [3.5, 6.5], shape: 'dust', gravity: -20, drag: 2 });
      particles.burst({ x: x + box.width * 0.3, y: ground, count: 6, colors: STONE, angle: -Math.PI * 0.35, spread: 0.6, speed: [100, 220], life: [350, 600], size: [1.4, 2.6], shape: 'shard', gravity: 520, drag: 1.2 });
      shake(4, 340);
      groundRing(entry.unit.id, '#c8a26a');
      aura(entry.unit.id, '#8a6a45', 1);
    });
  }

  // An elemental taking shape in a whirl of mana and flame: the whirl spins
  // up where it will stand, the card comes out of it in a flare, and
  // flames and sparks of mana burst round it.
  function formElemental({ entry, card, box, art, figure, x, circle, width }) {
    const middle = { x, y: art.y + art.height * 0.5 };
    const across = Math.round(Math.min(figure * 1.35, box.width, (Math.min(x, width - x) - 2) * 2));
    const vortex = spark('fx-vortex', middle, { '--fx': '#8fd3ff', '--size': `${across}px` });
    vortex.innerHTML = VORTEX;
    animate(vortex.querySelector('g'), [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-560deg)' }], { duration: 1100, delay: 60, easing: 'cubic-bezier(0.3, 0.1, 0.5, 1)', fill: 'backwards' });
    animate(
      vortex,
      [
        { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.95, offset: 0.3 },
        { transform: 'translate(-50%, -50%) scale(1.05)', opacity: 0.8, offset: 0.6 },
        { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0 },
      ],
      { duration: 1100, delay: 60, easing: 'ease-out', fill: 'backwards' },
    ).then(() => vortex.remove());
    after(COMING - 160, circle, () => gatherTo(middle, across * 0.62, [...MANA, '#ffb36b'], { count: 14, life: 300 }));
    animate(
      card,
      [
        { transform: 'scale(0.2) rotate(-35deg)', opacity: 0, filter: 'brightness(3) saturate(0.3)', easing: 'cubic-bezier(0.25, 0.8, 0.35, 1)' },
        { transform: 'scale(1.08) rotate(4deg)', opacity: 1, filter: 'brightness(1.8) saturate(0.8)', offset: 0.6 },
        { transform: 'scale(1) rotate(0deg)', opacity: 1, filter: 'brightness(1) saturate(1)' },
      ],
      { duration: 480, delay: COMING + 60, fill: 'backwards' },
    );
    after(COMING + 300, circle, () => {
      particles.burst({ x: middle.x, y: middle.y, count: 16, colors: FIRE, angle: -Math.PI / 2, spread: Math.PI, speed: [80, 200], life: [380, 700], size: [1.4, 2.8], shape: 'ember', gravity: -60, drag: 2 });
      particles.burst({ x: middle.x, y: middle.y, count: 10, colors: MANA, speed: [120, 260], life: [200, 380], size: [1.1, 2], shape: 'spark', drag: 3.5 });
      ring(entry.unit.id, '#ffb36b', Math.round(figure * 1.3), 520);
      aura(entry.unit.id, '#ffb36b', 1);
    });
  }

  // 960: the Deszcz meteorów and the Kataklizm. The sky over the foes
  // darkens red and burning boulders fall on each foe and burst; in the
  // Kataklizm a bolt of lightning and a comet of ice fall with each, and
  // the ground under the foes burns, freezes and crackles. Resolves when
  // the last has landed.
  async function meteors(event, look, targets) {
    if (reduced() || !particles) {
      await rain(look.color, targets);
      return;
    }
    const cataclysm = look.meteors === 'cataclysm';
    const foes = row('enemy');
    const reach = foes ? boxOf(foes) : null;
    const sky = spark(`fx-sky${cataclysm ? ' fx-sky--storm' : ''}`, { x: 0, y: 0 });
    sky.style.width = `${stageWidth()}px`;
    sky.style.height = `${Math.round(reach ? reach.y + Math.min(reach.height * 0.5, 140) : stageHeight() * 0.3)}px`;
    animate(sky, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0.85, offset: 0.7 }, { opacity: 0 }], { duration: cataclysm ? 1800 : 1500, easing: 'ease-out' }).then(() => sky.remove());
    const kinds = cataclysm ? ['bolt', 'fire', 'ice'] : ['fire', 'fire'];
    const landings = targets.flatMap((id, index) => {
      const entry = cards.get(id);
      if (!entry) return [];
      const art = artOf(entry.card);
      const figure = figureOf(art);
      const middle = { x: art.x + art.width / 2, y: art.y + art.height * 0.55 };
      return kinds.map((kind, step) => {
        const spot = step === 0 || kind === 'bolt' ? middle : { x: middle.x + (step % 2 ? -1 : 1) * figure * 0.2, y: middle.y + figure * 0.1 };
        const delay = 200 + index * 120 + step * (cataclysm ? 150 : 210);
        return skyfall(id, spot, kind, figure, delay, sky, index === 0 && step === 0).then(() => {
          if (step === kinds.length - 1 && sky.isConnected) burning(id, figure, cataclysm, sky);
        });
      });
    });
    await Promise.all(landings);
  }

  // One thing falling out of the sky onto a point of a foe's card and
  // bursting there: a burning boulder ('fire'), a comet of ice ('ice') or
  // a bolt of lightning ('bolt'). The boulders come from above the stage.
  function skyfall(id, point, kind, figure, delay, mark, first) {
    if (kind === 'bolt') return after(delay, mark, () => thunderbolt(id, point, figure, first));
    const ice = kind === 'ice';
    const size = Math.round(figure * (ice ? 0.24 : 0.3));
    const rock = spark(`fx-meteor${ice ? ' fx-meteor--ice' : ''}`, { x: 0, y: 0 }, { '--size': `${size}px` });
    const run = Math.min(80, figure) * (ice ? -0.7 : 1);
    const start = { x: point.x - run, y: -size * 1.6 };
    const angle = Math.atan2(point.y - start.y, point.x - start.x);
    const flight = 300;
    const place = (at, scale) => `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px) translate(-50%, -50%) rotate(${angle.toFixed(3)}rad) scale(${scale})`;
    after(delay, mark, () => particles.trail({ from: start, to: point, duration: flight, colors: ice ? ICE : FIRE, rate: 150, sizes: [1.4, 3], life: [200, 420], shape: ice ? 'mote' : 'ember' }));
    return animate(
      rock,
      [
        { transform: place(start, 0.85), opacity: 1 },
        { transform: place(point, 1), opacity: 1 },
      ],
      { duration: flight, delay, easing: 'cubic-bezier(0.55, 0, 0.9, 0.55)', fill: 'backwards' },
    ).then(() => {
      rock.remove();
      if (!mark.isConnected) return;
      if (ice) iceImpact(id, point, figure);
      else fireImpact(id, point, figure, first);
    });
  }

  // A burning boulder bursting on a foe: a bloom of fire, embers, sparks
  // and smoke, the card scorched and the arena shaken (the first one
  // lights the arena up).
  function fireImpact(id, point, figure, first) {
    const entry = cards.get(id);
    const size = Math.round(figure * 1.05);
    const bloom = spark('fx-explosion', point, { '--size': `${size}px` });
    animate(
      bloom,
      [
        { transform: 'translate(-50%, -50%) scale(0.15)', opacity: 1 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.95, offset: 0.35 },
        { transform: 'translate(-50%, -50%) scale(1.25)', opacity: 0 },
      ],
      { duration: 520, easing: 'ease-out' },
    ).then(() => bloom.remove());
    particles.burst({ x: point.x, y: point.y, count: 14, colors: FIRE, angle: -Math.PI / 2, spread: Math.PI * 0.85, speed: [110, 260], life: [380, 760], size: [1.4, 3], shape: 'ember', gravity: 200, drag: 2.2 });
    particles.burst({ x: point.x, y: point.y, count: 8, colors: ['#fff7d6', '#ffd27a'], speed: [200, 380], life: [140, 280], size: [1.2, 2], shape: 'spark', drag: 4 });
    particles.burst({ x: point.x, y: point.y, count: 4, colors: SMOKE, speed: [14, 50], life: [700, 1100], size: [5, 9], shape: 'dust', gravity: -40, drag: 1.6, area: { width: size * 0.4, height: size * 0.3 } });
    if (entry) animate(entry.card, [{ filter: 'brightness(1.8) sepia(0.5) saturate(2)' }, { filter: 'brightness(1)' }], { duration: 560, easing: 'ease-out' });
    if (first) flash('#ff9a4d', 0.18, 380);
    shake(first ? 3.2 : 2.2, 280);
  }

  // A comet of ice shattering on a foe: shards, a cold flare and frost
  // settling on it.
  function iceImpact(id, point, figure) {
    const glow = spark('fx-burst', point, { '--fx': '#bfe8ff', '--size': `${Math.round(figure * 0.85)}px` });
    animate(
      glow,
      [
        { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.05)', opacity: 1, offset: 0.25 },
        { transform: 'translate(-50%, -50%) scale(1.3)', opacity: 0 },
      ],
      { duration: 440, easing: 'ease-out' },
    ).then(() => glow.remove());
    particles.burst({ x: point.x, y: point.y, count: 12, colors: ICE, speed: [120, 260], life: [300, 600], size: [1.6, 3], shape: 'shard', gravity: 240, drag: 2.2 });
    freeze(id);
    shake(1.6, 220);
  }

  // A bolt of lightning from the top of the stage down to a point of a
  // foe's card, flickering; the first lights the whole arena.
  function thunderbolt(id, point, figure, first) {
    const entry = cards.get(id);
    const height = Math.max(24, Math.round(point.y));
    const width = Math.round(figure * 0.9);
    let x = width / 2 + (Math.random() - 0.5) * width * 0.3;
    let d = `M${x.toFixed(1)} 0`;
    for (let step = 1; step <= 7; step++) {
      x = step === 7 ? width / 2 : width / 2 + (Math.random() - 0.5) * width * 0.6;
      d += `L${x.toFixed(1)} ${((step / 7) * height).toFixed(1)}`;
    }
    const bolt = spark('fx-strike', { x: point.x - width / 2, y: 0 });
    bolt.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><path class="fx-strike-glow" d="${d}"/><path class="fx-strike-core" d="${d}"/></svg>`;
    animate(bolt, [{ opacity: 0 }, { opacity: 1, offset: 0.06 }, { opacity: 0.25, offset: 0.18 }, { opacity: 1, offset: 0.28 }, { opacity: 0.85, offset: 0.55 }, { opacity: 0 }], { duration: 460 }).then(() => bolt.remove());
    const glow = spark('fx-burst', point, { '--fx': '#fff7c2', '--size': `${Math.round(figure * 0.8)}px` });
    animate(
      glow,
      [
        { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, -50%) scale(1.2)', opacity: 0 },
      ],
      { duration: 360, easing: 'ease-out' },
    ).then(() => glow.remove());
    particles.burst({ x: point.x, y: point.y, count: 12, colors: BOLT, speed: [150, 320], life: [200, 380], size: [1, 1.8], shape: 'spark', drag: 4 });
    if (entry) animate(entry.card, [{ filter: 'brightness(2.4) saturate(0.4)' }, { filter: 'brightness(1)' }], { duration: 380, easing: 'ease-out' });
    if (first) flash('#fff7c2', 0.24, 320);
    shake(2.4, 240);
  }

  // The ground under a foe after the fall: flames licking it (frost and
  // sparks too, after the Kataklizm).
  function burning(id, figure, cataclysm, mark) {
    const entry = cards.get(id);
    if (!entry) return;
    const box = boxOf(entry.card);
    const foot = { x: box.x + box.width / 2, y: box.y + box.height - 12 };
    const span = Math.min(box.width * 0.8, figure * 1.2);
    for (let wave = 0; wave < 3; wave++) {
      after(wave * 140, mark, () => particles.burst({ x: foot.x, y: foot.y, area: { width: span, height: 6 }, count: 5, colors: FIRE, angle: -Math.PI / 2, spread: 0.3, speed: [30, 80], gravity: -30, drag: 1.2, life: [400, 700], size: [1.4, 2.6], shape: 'ember' }));
    }
    if (!cataclysm) return;
    [-0.3, 0.3].forEach((share, index) => {
      const crystal = spark('fx-crystal', { x: foot.x + share * span, y: foot.y - 2 });
      animate(
        crystal,
        [
          { transform: 'translate(-50%, -50%) scale(0) rotate(0deg)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(1.1) rotate(30deg)', opacity: 1, offset: 0.3 },
          { transform: 'translate(-50%, -50%) scale(0.9) rotate(50deg)', opacity: 0 },
        ],
        { duration: 820, delay: index * 90, easing: 'ease-out', fill: 'backwards' },
      ).then(() => crystal.remove());
    });
    for (let wave = 0; wave < 2; wave++) {
      after(120 + wave * 200, mark, () => particles.burst({ x: foot.x, y: foot.y, area: { width: span, height: 4 }, count: 5, colors: BOLT, angle: -Math.PI / 2, spread: 1.2, speed: [80, 180], life: [140, 260], size: [0.9, 1.6], shape: 'spark', drag: 4 }));
    }
  }

  // 960: the Zamieć: the Władca Lodu sends the cold out, and a snowstorm
  // sweeps over the whole enemy row: snow driving across it in gusts, the
  // row going white, and ice crusting at each foe's feet as the frost takes
  // it. Resolves when the last foe is frozen over.
  async function snowstorm(event, color, targets) {
    const caster = cards.get(event.actor);
    const foes = row('enemy');
    if (!caster || !foes || reduced() || !particles) {
      await blizzard(event, color, targets);
      return;
    }
    const box = boxOf(foes);
    const from = centerOf(caster.card);
    const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    // The storm blows from the caster's side across the row.
    const way = from.x >= middle.x ? -1 : 1;
    const distance = Math.hypot(middle.x - from.x, middle.y - from.y);
    particles.burst({ x: from.x, y: from.y, area: { width: 14, height: 14 }, count: 16, colors: ICE, angle: Math.atan2(middle.y - from.y, middle.x - from.x), spread: 0.2, speed: [distance * 2.4, distance * 3], life: [300, 380], size: [1.4, 2.6], shape: 'mote', drag: 0.4 });
    const clip = overRow();
    const veil = h('span', { class: 'fx-whiteout' });
    clip.append(veil);
    const enter = way < 0 ? '60%' : '-60%';
    const leave = way < 0 ? '-40%' : '40%';
    animate(
      veil,
      [
        { transform: `translateX(${enter})`, opacity: 0 },
        { transform: 'translateX(0%)', opacity: 0.85, offset: 0.3 },
        { transform: 'translateX(0%)', opacity: 0.7, offset: 0.7 },
        { transform: `translateX(${leave})`, opacity: 0 },
      ],
      { duration: 1400, delay: 120, easing: 'ease-in-out', fill: 'backwards' },
    ).then(() => clip.remove());
    // Snow driving across the row in gusts, from its edge.
    const edge = way < 0 ? box.x + box.width - 2 : box.x + 2;
    for (let gust = 0; gust < 5; gust++) {
      after(120 + gust * 150, clip, () => particles.burst({ x: edge, y: middle.y, area: { width: 12, height: box.height * 0.92 }, count: 22, colors: ICE, angle: way < 0 ? Math.PI - 0.1 : 0.1, spread: 0.14, speed: [box.width * 1.1, box.width * 1.7], life: [600, 900], size: [1.2, 2.6], shape: 'mote', drag: 0.25 }));
    }
    after(160, clip, () => windLines());
    // The frost takes each foe, ice crusting at its feet.
    await wait(420);
    if (!clip.isConnected) return;
    await Promise.all(
      targets.map((id, index) =>
        after(index * 90, clip, () => {
          freeze(id);
          iceCrust(id);
        }),
      ),
    );
    await wait(380);
  }

  // Ice crusting at a foe's feet: shards growing up round the bottom of its
  // figure, melting a moment later.
  function iceCrust(id) {
    const entry = cards.get(id);
    if (!entry) return;
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const x = art.x + art.width / 2;
    const bottom = art.y + art.height;
    [-0.42, -0.2, 0.02, 0.24, 0.44].forEach((share, index) => {
      const shard = spark('fx-spike', { x: x + share * figure, y: bottom });
      shard.style.height = `${Math.round(figure * (0.22 + (index % 2) * 0.12))}px`;
      animate(
        shard,
        [
          { transform: `translate(-50%, -100%) rotate(${(share * 30).toFixed(1)}deg) scaleY(0)`, opacity: 1 },
          { transform: `translate(-50%, -100%) rotate(${(share * 30).toFixed(1)}deg) scaleY(1)`, opacity: 1, offset: 0.3 },
          { transform: `translate(-50%, -100%) rotate(${(share * 30).toFixed(1)}deg) scaleY(1)`, opacity: 0.9, offset: 0.75 },
          { transform: `translate(-50%, -100%) rotate(${(share * 30).toFixed(1)}deg) scaleY(0.9)`, opacity: 0 },
        ],
        { duration: 1000, delay: index * 30, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'backwards' },
      ).then(() => shard.remove());
    });
  }

  // 960: the Lodowa nawałnica. Stars of ice fall on the foes one after
  // another, spinning, and break; frost settles on each foe as its last
  // star lands. Resolves when the last has broken.
  async function icefall(event, color, targets) {
    if (reduced() || !particles) {
      await blizzard(event, color, targets);
      return;
    }
    // A cold haze over the foes, the sky they fall from.
    const foes = row('enemy');
    const reach = foes ? boxOf(foes) : null;
    const mark = spark('fx-sky fx-sky--frost', { x: 0, y: 0 });
    mark.style.width = `${stageWidth()}px`;
    mark.style.height = `${Math.round(reach ? reach.y + Math.min(reach.height * 0.5, 140) : stageHeight() * 0.3)}px`;
    animate(mark, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0.8, offset: 0.75 }, { opacity: 0 }], { duration: 1600 + targets.length * 110, easing: 'ease-out' }).then(() => mark.remove());
    const landings = targets.flatMap((id, index) => {
      const entry = cards.get(id);
      if (!entry) return [];
      const art = artOf(entry.card);
      const figure = figureOf(art);
      const middle = { x: art.x + art.width / 2, y: art.y + art.height * 0.5 };
      return [-0.22, 0.2, 0].map((dx, step) => {
        const spot = { x: middle.x + dx * figure, y: middle.y + (step === 2 ? 0.06 : -0.06) * figure };
        return starfall(id, spot, figure, 140 + index * 110 + step * 190, mark, step === 2);
      });
    });
    await Promise.all(landings);
  }

  // One star of ice falling and breaking where it lands.
  function starfall(id, point, figure, delay, mark, last) {
    const size = Math.round(figure * (last ? 0.46 : 0.34));
    const star = spark('fx-icestar', { x: 0, y: 0 }, { '--size': `${size}px` });
    star.innerHTML = ICE_STAR;
    const start = { x: point.x + figure * 0.35, y: -size };
    const flight = 280;
    const place = (at, turn, scale) => `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px) translate(-50%, -50%) rotate(${turn}deg) scale(${scale})`;
    after(delay, mark, () => particles.trail({ from: start, to: point, duration: flight, colors: ICE, rate: 110, sizes: [1, 2.2], life: [200, 380], shape: 'mote' }));
    return animate(
      star,
      [
        { transform: place(start, 0, 0.8), opacity: 1 },
        { transform: place(point, 300, 1), opacity: 1 },
      ],
      { duration: flight, delay, easing: 'cubic-bezier(0.5, 0, 0.85, 0.6)', fill: 'backwards' },
    ).then(() => {
      star.remove();
      if (!mark.isConnected) return;
      breakStar(point, size, 300);
      particles.burst({ x: point.x, y: point.y, count: last ? 12 : 7, colors: ICE, speed: [100, 230], life: [260, 520], size: [1.4, 2.6], shape: 'shard', gravity: 220, drag: 2.4 });
      if (last) {
        freeze(id);
        shake(1.6, 220);
      }
    });
  }

  // A star of ice breaking: its six long arms fly apart, turning, and a
  // cold flare where it was.
  function breakStar(point, size, turn = 0) {
    const glow = spark('fx-burst', point, { '--fx': '#bfe8ff', '--size': `${Math.round(size * 1.6)}px` });
    animate(
      glow,
      [
        { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.25 },
        { transform: 'translate(-50%, -50%) scale(1.25)', opacity: 0 },
      ],
      { duration: 380, easing: 'ease-out' },
    ).then(() => glow.remove());
    const length = size * 0.47;
    for (let index = 0; index < 6; index++) {
      const angle = turn + index * 60;
      const way = ((angle - 90) * Math.PI) / 180;
      const piece = spark('fx-iceshard', point, { '--size': `${Math.round(length)}px` });
      piece.innerHTML = ICE_SHARD;
      const far = size * 0.55;
      const spin = (index % 2 ? 1 : -1) * 70;
      animate(
        piece,
        [
          { transform: `translate(-50%, -100%) rotate(${angle}deg)`, opacity: 1 },
          { transform: `translate(calc(-50% + ${(Math.cos(way) * far).toFixed(1)}px), calc(-100% + ${(Math.sin(way) * far + size * 0.25).toFixed(1)}px)) rotate(${angle + spin}deg) scale(0.7)`, opacity: 0 },
        ],
        { duration: 420, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' },
      ).then(() => piece.remove());
    }
  }

  // 960: ice gathering at the caster before it flies: a star of ice
  // (Lodowa gwiazda) or a lance of ice aimed at its target (Lodowa
  // włócznia), formed as the caster draws back (arena-fx.js strike()
  // flies it from there).
  function forge(event, kind) {
    const caster = cards.get(event.actor);
    const target = cards.get(event.target);
    if (!caster || !target || reduced() || !particles) return;
    const a = centerOf(caster.card);
    const b = centerOf(target.card);
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    gatherTo(a, Math.min(caster.card.offsetWidth, caster.card.offsetHeight) * 0.55, ICE, { count: 10, life: 220 });
    if (kind === 'ice-star') {
      const size = Math.round(Math.min(40, Math.max(24, distance * 0.14)));
      // Formed while the caster draws back (200 ms, arena-fx.js strike()),
      // and held until the star that flies takes its place (iceStar()).
      const star = spark('fx-icestar fx-forged', a, { '--size': `${size}px` });
      star.innerHTML = ICE_STAR;
      animate(
        star,
        [
          { transform: 'translate(-50%, -50%) scale(0) rotate(-140deg)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(0.8) rotate(0deg)', opacity: 1 },
        ],
        { duration: 200, easing: 'ease-out', fill: 'forwards' },
      );
      wait(600).then(() => star.remove());
      return;
    }
    const length = Math.round(Math.min(110, Math.max(60, distance * 0.42)));
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    // As the star: held until the lance that flies takes its place.
    const lance = spark('fx-lance fx-forged', { x: 0, y: 0 });
    lance.innerHTML = ICE_LANCE;
    lance.style.width = `${length}px`;
    const held = `translate(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px) rotate(${angle.toFixed(3)}rad) translate(0, -50%)`;
    animate(
      lance,
      [
        { transform: `${held} scaleX(0.05)`, opacity: 0 },
        { transform: `${held} scaleX(1)`, opacity: 1 },
      ],
      { duration: 200, easing: 'ease-out', fill: 'forwards' },
    );
    wait(600).then(() => lance.remove());
  }

  // 960: the Lodowa gwiazda bursting on its foe: the star breaks into its
  // arms, the foe cracks like glass and frost settles on it.
  function starBreak(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 90);
      ring(event.target, color, 110, 420);
      return;
    }
    const point = centerOf(entry.card);
    const art = artOf(entry.card);
    const figure = figureOf(art);
    breakStar(point, Math.round(figure * 0.55), 20);
    particles.burst({ x: point.x, y: point.y, count: 16, colors: ICE, speed: [130, 280], life: [300, 620], size: [1.6, 3], shape: 'shard', gravity: 220, drag: 2.2 });
    glassCracks(entry, art, figure);
    freeze(event.target);
    ring(event.target, '#dff4ff', Math.round(figure * 1.4), 420);
  }

  // Cracks over a foe's picture, as in glass, gone in a moment.
  function glassCracks(entry, art, figure, cracks = GLASS_CRACKS, delay = 0, duration = 700, tone = '') {
    const size = Math.round(Math.min(art.width, figure * 1.25));
    const mark = spark(`fx-glasscrack${tone ? ` ${tone}` : ''}`, { x: art.x + art.width / 2, y: art.y + art.height / 2 }, { '--size': `${size}px` });
    mark.style.height = `${Math.round(Math.min(art.height, size))}px`;
    mark.innerHTML = cracks;
    return animate(
      mark,
      [
        { transform: 'translate(-50%, -50%) scale(0.5)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.12 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.9, offset: 0.6 },
        { transform: 'translate(-50%, -50%) scale(1.02)', opacity: 0 },
      ],
      { duration, delay, easing: 'ease-out', fill: 'backwards' },
    ).then(() => mark.remove());
  }

  // 960: the Lodowa włócznia striking: it runs through its foe (a bright
  // line along the throw), breaks into shards thrown on and frost settles
  // on the foe.
  function lanceBreak(event, color) {
    const target = cards.get(event.target);
    const caster = cards.get(event.actor);
    if (!target || !caster) return;
    if (reduced() || !particles) {
      burst(event.target, color, 90);
      ring(event.target, color, 110, 420);
      return;
    }
    const to = centerOf(target.card);
    const from = centerOf(caster.card);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const length = Math.hypot(target.card.offsetWidth, target.card.offsetHeight) * 1.2;
    const line = spark('fx-pierce', to, { '--fx': '#bfe8ff' });
    line.style.width = `${Math.round(length)}px`;
    animate(
      line,
      [
        { transform: `translate(-50%, -50%) rotate(${angle}rad) scaleX(0)`, opacity: 1 },
        { transform: `translate(-50%, -50%) rotate(${angle}rad) scaleX(1)`, opacity: 1, offset: 0.3 },
        { transform: `translate(-50%, -50%) rotate(${angle}rad) scaleX(1.1) scaleY(0.3)`, opacity: 0 },
      ],
      { duration: 380, easing: 'ease-out' },
    ).then(() => line.remove());
    particles.burst({ x: to.x, y: to.y, count: 16, colors: ICE, angle, spread: 0.5, speed: [180, 360], life: [260, 520], size: [1.6, 3], shape: 'shard', drag: 3, gravity: 160 });
    particles.burst({ x: to.x, y: to.y, count: 8, colors: ['#ffffff', '#dff4ff'], angle: angle + Math.PI, spread: 0.9, speed: [60, 140], life: [200, 380], size: [1.2, 2.2], shape: 'shard', drag: 3, gravity: 200 });
    burst(event.target, '#dff4ff', 70);
    freeze(event.target);
  }

  // 960: the Lodowy grobowiec closing on its foe: shards of ice shoot up
  // round its figure, a block of clear ice rises over it from the ground,
  // it cracks, and melts away while the fight goes on.
  function tomb(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 60);
      return;
    }
    const box = boxOf(entry.card);
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const x = art.x + art.width / 2;
    const width = Math.round(Math.min(box.width - 6, figure * 1.2));
    const height = Math.round(Math.min(art.height + 10, box.height * 0.8));
    const bottom = art.y + art.height + 6;
    const block = spark('fx-tomb', { x: x - width / 2, y: bottom - height });
    block.style.width = `${width}px`;
    block.style.height = `${height}px`;
    block.innerHTML = TOMB_FACETS;
    animate(
      block,
      [
        { clipPath: 'inset(100% -4px -4px -4px)', opacity: 1, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
        { clipPath: 'inset(0% -4px -4px -4px)', opacity: 1, offset: 0.2 },
        { clipPath: 'inset(0% -4px -4px -4px)', opacity: 1, offset: 0.76 },
        { clipPath: 'inset(0% -4px -4px -4px)', opacity: 0 },
      ],
      { duration: 1700, delay: 120, easing: 'ease-out', fill: 'backwards' },
    ).then(() => block.remove());
    // The shards shooting up round it first.
    [-0.5, -0.28, 0.3, 0.52, 0].forEach((share, index) => {
      const shard = spark('fx-spike', { x: x + share * width, y: bottom });
      shard.style.height = `${Math.round(height * (index === 4 ? 0.5 : 0.36 + (index % 2) * 0.16))}px`;
      animate(
        shard,
        [
          { transform: `translate(-50%, -100%) rotate(${(share * 24).toFixed(1)}deg) scaleY(0)`, opacity: 1 },
          { transform: `translate(-50%, -100%) rotate(${(share * 24).toFixed(1)}deg) scaleY(1)`, opacity: 1, offset: 0.35 },
          { transform: `translate(-50%, -100%) rotate(${(share * 24).toFixed(1)}deg) scaleY(1)`, opacity: 0 },
        ],
        { duration: 520, delay: index * 30, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'backwards' },
      ).then(() => shard.remove());
    });
    particles.burst({ x, y: bottom - 4, area: { width, height: 6 }, count: 10, colors: ICE, angle: -Math.PI / 2, spread: 0.6, speed: [60, 160], life: [300, 600], size: [1.4, 2.6], shape: 'shard', gravity: 260, drag: 2 });
    after(140, block, () => {
      flash('#dff4ff', 0.12, 320);
      particles.burst({ x, y: bottom - height / 2, area: { width, height }, count: 10, colors: ['#ffffff', '#e4f6ff'], angle: -Math.PI / 2, spread: 1.2, speed: [10, 40], life: [700, 1100], size: [1, 1.8], shape: 'mote', gravity: -10, drag: 1 });
    });
    // It cracks.
    const inner = { x: x - width / 2, y: bottom - height, width, height };
    after(760, block, () => {
      glassCracks(entry, inner, Math.min(width, height), TOMB_CRACKS, 0, 900);
      particles.burst({ x, y: bottom - height * 0.55, count: 6, colors: ['#ffffff', '#cfefff'], speed: [60, 140], life: [240, 420], size: [1.2, 2], shape: 'shard', gravity: 260, drag: 2 });
    });
    entry.card.classList.add('unit--frosted');
    wait(1700).then(() => entry.card.classList.remove('unit--frosted'));
  }

  // 960: the Lustro many: mana drawn into the Arkanista, then a pane of
  // mirror turning to face the foes over its card, a shine running across
  // it and glints at its corners, and it settles into the shield.
  async function mirror(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await bubble(id, color);
      return;
    }
    const box = boxOf(entry.card);
    const middle = centerOf(entry.card);
    gatherTo(middle, Math.hypot(box.width, box.height) * 0.6, [color, '#e8f4ff', '#ffffff'], { count: 16, life: 330 });
    await wait(300);
    const pane = spark('fx-mirror', { x: box.x - 4, y: box.y - 4 }, { '--fx': color });
    pane.style.width = `${Math.round(box.width + 8)}px`;
    pane.style.height = `${Math.round(box.height + 8)}px`;
    const shine = h('span', { class: 'fx-mirror-shine' });
    pane.append(shine);
    entry.card.classList.add('unit--shielded');
    entry.card.style.setProperty('--shield', color);
    flash(color, 0.12, 320);
    animate(
      pane,
      [
        { transform: 'scaleX(0.04)', opacity: 0 },
        { transform: 'scaleX(1.03)', opacity: 1, offset: 0.2 },
        { transform: 'scaleX(1)', opacity: 1, offset: 0.3 },
        { transform: 'scaleX(1)', opacity: 0.85, offset: 0.74 },
        { transform: 'scaleX(1)', opacity: 0 },
      ],
      { duration: 1250, easing: 'ease-out' },
    ).then(() => pane.remove());
    animate(shine, [{ transform: 'translateX(-60%)' }, { transform: 'translateX(60%)' }], { duration: 560, delay: 280, easing: 'ease-in-out', fill: 'both' });
    after(420, pane, () => twinkle({ x: box.x + box.width - 7, y: box.y + 9 }, '#ffffff', 18));
    after(600, pane, () => twinkle({ x: box.x + 9, y: box.y + box.height - 12 }, '#e8f4ff', 14));
    await wait(1000);
  }

  // 960: the Tarcza żywiołów: a flame, a shard of ice and a spark of
  // lightning circle the Awatar's card, the ring they make flares in their
  // three colours, and the shield settles.
  async function elementRing(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await bubble(id, color);
      return;
    }
    const box = boxOf(entry.card);
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const width = stageWidth();
    const cx = art.x + art.width / 2;
    const cy = art.y + art.height * 0.7;
    const rx = Math.min(box.width * 0.6, figure * 0.85, cx - 12, width - cx - 12);
    const ry = Math.min(art.height * 0.3, 22);
    const size = Math.round(Math.min(26, Math.max(17, figure * 0.32)));
    const steps = 32;
    const duration = 1300;
    const turns = 1.3;
    const kinds = [
      { art: FLAME, glow: '#ff8a3d', specks: FIRE, shape: 'ember' },
      { art: FROST_SHARD, glow: '#8fd3ff', specks: ICE, shape: 'mote' },
      { art: SPARK_BOLT, glow: '#f2e36b', specks: BOLT, shape: 'spark' },
    ];
    const at = (start, share) => {
      const angle = start + share * turns * Math.PI * 2;
      const open = Math.min(1, share * 3.5);
      return { x: cx + Math.cos(angle) * rx * (0.35 + 0.65 * open), y: cy + Math.sin(angle) * ry * (0.35 + 0.65 * open), front: Math.sin(angle) };
    };
    kinds.forEach((kind, k) => {
      const start = (k / 3) * Math.PI * 2 - Math.PI / 2;
      const orbiter = spark('fx-orbiter', { x: 0, y: 0 }, { '--fx': kind.glow, '--size': `${size}px` });
      orbiter.innerHTML = kind.art;
      const frames = Array.from({ length: steps + 1 }, (_, step) => {
        const share = step / steps;
        const point = at(start, share);
        const scale = 0.8 + point.front * 0.22;
        const opacity = step === 0 || step === steps ? 0 : point.front < -0.2 ? 0.55 : 1;
        return { transform: `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px) translate(-50%, -50%) scale(${scale.toFixed(2)})`, opacity };
      });
      animate(orbiter, frames, { duration, easing: 'linear' }).then(() => orbiter.remove());
      for (let step = 1; step < steps - 1; step += 2) {
        const point = at(start, step / steps);
        after((step / steps) * duration, orbiter, () => particles.burst({ x: point.x, y: point.y, count: 2, colors: kind.specks, speed: [6, 24], life: [260, 440], size: [1.2, 2.2], shape: kind.shape, drag: 2 }));
      }
    });
    // The ring they make flares and the shield settles.
    const band = spark('fx-elementring', { x: cx, y: cy });
    band.style.width = `${Math.round(rx * 2)}px`;
    band.style.height = `${Math.round(ry * 2)}px`;
    band.innerHTML = ELEMENT_RING;
    animate(
      band,
      [
        { transform: 'translate(-50%, -50%) scale(0.5) rotate(0deg)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 0, offset: 0.3 },
        { transform: 'translate(-50%, -50%) scale(1.04) rotate(0deg)', opacity: 1, offset: 0.5 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 0.8, offset: 0.78 },
        { transform: 'translate(-50%, -50%) scale(1.08) rotate(0deg)', opacity: 0 },
      ],
      { duration, easing: 'ease-out' },
    ).then(() => band.remove());
    after(duration * 0.45, band, () => {
      entry.card.classList.add('unit--shielded');
      entry.card.style.setProperty('--shield', color);
      flash(color, 0.1, 300);
      aura(id, color, 1);
    });
    await wait(duration - 100);
  }

  // A plate of ice the size of a card (the Lodowa zbroja): a frosted pane
  // and shards of ice along its edges and in its corners, each pointing
  // in, to grow from its base (`data-delay`: the corners first, the middle
  // of the edges last).
  function frostPlate(width, height) {
    const reach = Math.min(width, height) * 0.34;
    const lengths = [1, 0.55, 0.8, 0.45, 0.95, 0.6, 0.75, 0.5];
    const far = Math.hypot(width, height) / 2;
    const shards = [];
    const tooth = (x, y, nx, ny, base, long) => {
      const tx = -ny;
      const ty = nx;
      const points = `${(x + tx * base).toFixed(1)},${(y + ty * base).toFixed(1)} ${(x + nx * long).toFixed(1)},${(y + ny * long).toFixed(1)} ${(x - tx * base).toFixed(1)},${(y - ty * base).toFixed(1)}`;
      const shine = `M${x.toFixed(1)} ${y.toFixed(1)}L${(x + nx * long * 0.8).toFixed(1)} ${(y + ny * long * 0.8).toFixed(1)}`;
      const corner = Math.min(Math.hypot(x, y), Math.hypot(width - x, y), Math.hypot(x, height - y), Math.hypot(width - x, height - y));
      const delay = Math.round((corner / far) * 420);
      shards.push(`<g class="fx-shard" data-delay="${delay}" data-origin="${x.toFixed(1)}px ${y.toFixed(1)}px"><polygon points="${points}"/><path d="${shine}"/></g>`);
    };
    const across = Math.max(3, Math.round(width / 17));
    const down = Math.max(4, Math.round(height / 17));
    for (let k = 0; k < across; k++) {
      const x = (width * (k + 0.5)) / across;
      const base = (width / across) * 0.55;
      tooth(x, 0, 0, 1, base, reach * lengths[k % 8]);
      tooth(x, height, 0, -1, base, reach * lengths[(k + 3) % 8]);
    }
    for (let k = 0; k < down; k++) {
      const y = (height * (k + 0.5)) / down;
      const base = (height / down) * 0.55;
      tooth(0, y, 1, 0, base, reach * lengths[(k + 5) % 8] * 0.9);
      tooth(width, y, -1, 0, base, reach * lengths[(k + 1) % 8] * 0.9);
    }
    const corner = reach * 1.15;
    for (const [x, y, nx, ny] of [
      [0, 0, 0.707, 0.707],
      [width, 0, -0.707, 0.707],
      [0, height, 0.707, -0.707],
      [width, height, -0.707, -0.707],
    ]) {
      tooth(x, y, nx, ny, 9, corner);
    }
    return (
      `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">` +
      `<rect class="fx-frostpane" x="1.5" y="1.5" width="${width - 3}" height="${height - 3}" rx="7" fill="rgba(200, 236, 255, 0.2)" stroke="#e8f8ff" stroke-width="2"/>` +
      `<g fill="rgba(226, 246, 255, 0.82)" stroke="#5aaee0" stroke-width="1" stroke-linejoin="round">${shards.join('')}</g></svg>`
    );
  }

  // 960: the Lodowa zbroja: snow drawn in round the Pan Zimy, then frost
  // grows over its card: shards of ice shoot out from its corners and its
  // edges into a plate of armour, a cold glint runs over it and it
  // settles into the shield.
  async function iceArmor(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await bubble(id, color);
      return;
    }
    const box = boxOf(entry.card);
    gatherTo(centerOf(entry.card), Math.hypot(box.width, box.height) * 0.6, ICE, { count: 16, life: 300 });
    await wait(240);
    const width = Math.round(box.width + 6);
    const height = Math.round(box.height + 6);
    const plate = spark('fx-frostplate', { x: box.x - 3, y: box.y - 3 });
    plate.style.width = `${width}px`;
    plate.style.height = `${height}px`;
    plate.innerHTML = frostPlate(width, height);
    const shine = h('span', { class: 'fx-mirror-shine fx-mirror-shine--frost' });
    plate.append(shine);
    entry.card.classList.add('unit--shielded');
    entry.card.style.setProperty('--shield', color);
    animate(plate, [{ opacity: 1 }, { opacity: 1, offset: 0.62 }, { opacity: 0 }], { duration: 1350, easing: 'ease-in' }).then(() => plate.remove());
    animate(plate.querySelector('.fx-frostpane'), [{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: 'ease-out', fill: 'backwards' });
    for (const shard of plate.querySelectorAll('.fx-shard')) {
      // Its base, set here: the page's rules allow no style in markup.
      shard.style.transformOrigin = shard.dataset.origin;
      animate(
        shard,
        [
          { transform: 'scale(0)', opacity: 0 },
          { transform: 'scale(1.12)', opacity: 1, offset: 0.65 },
          { transform: 'scale(1)', opacity: 1 },
        ],
        { duration: 260, delay: Number(shard.dataset.delay), easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'backwards' },
      );
    }
    animate(shine, [{ transform: 'translateX(-60%)' }, { transform: 'translateX(60%)' }], { duration: 520, delay: 560, easing: 'ease-in-out', fill: 'both' });
    after(300, plate, () => {
      flash('#dff4ff', 0.12, 320);
      particles.burst({ x: box.x + box.width / 2, y: box.y + box.height / 2, area: { width: box.width, height: box.height }, count: 12, colors: ['#ffffff', '#e4f6ff', '#bfe8ff'], angle: -Math.PI / 2, spread: Math.PI, speed: [10, 40], life: [600, 1000], size: [1, 1.8], shape: 'mote', drag: 1 });
    });
    after(700, plate, () => twinkle({ x: box.x + box.width - 8, y: box.y + 10 }, '#ffffff', 16));
    await wait(1100);
  }

  // 960: the Harmonia żywiołów: three lights, fire, frost and lightning,
  // rise round the Arcymag in a braid, meet over its head in a star of
  // light, and their three colours ring out round it.
  async function harmony(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await Promise.all([ring(id, color, 130, 760), aura(id, color, 2)]);
      return;
    }
    const box = boxOf(entry.card);
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const cx = art.x + art.width / 2;
    const bottom = box.y + box.height - 12;
    const top = Math.max(8, art.y + figure * 0.18);
    const radius = Math.min(figure * 0.5, box.width * 0.42);
    const size = Math.round(Math.max(11, figure * 0.21));
    const lights = [
      { glow: '#ff8a3d', specks: FIRE },
      { glow: '#8fd3ff', specks: ICE },
      { glow: '#f2e36b', specks: BOLT },
    ];
    const steps = 28;
    const duration = 950;
    const at = (k, share) => {
      const angle = (k / 3) * Math.PI * 2 + share * Math.PI * 2.3;
      const rise = 1 - (1 - share) ** 1.6;
      const r = radius * (1 - share * 0.9);
      return { x: cx + Math.cos(angle) * r, y: bottom + (top - bottom) * rise, front: Math.sin(angle) };
    };
    const mark = anchor(duration + 900);
    lights.forEach((light, k) => {
      const orb = spark('fx-orb', { x: 0, y: 0 }, { '--fx': light.glow, '--size': `${size}px` });
      const frames = Array.from({ length: steps + 1 }, (_, step) => {
        const share = step / steps;
        const point = at(k, share);
        const scale = (0.85 + point.front * 0.2) * (step === steps ? 0.6 : 1);
        return { transform: `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px) translate(-50%, -50%) scale(${scale.toFixed(2)})`, opacity: step === 0 ? 0 : point.front < -0.3 ? 0.6 : 1 };
      });
      animate(orb, frames, { duration, easing: 'ease-in-out' }).then(() => orb.remove());
      for (let step = 1; step < steps; step += 2) {
        const point = at(k, step / steps);
        after((step / steps) * duration, mark, () => particles.burst({ x: point.x, y: point.y, count: 2, colors: light.specks, speed: [5, 20], life: [300, 520], size: [1.1, 2], shape: 'mote', drag: 2 }));
      }
    });
    // They meet: a star of light over the head, rings of the three colours
    // and their motes falling round the Arcymag.
    after(duration - 30, mark, () => {
      const point = { x: cx, y: top };
      twinkle(point, '#ffffff', figure * 0.75);
      const glow = spark('fx-burst', point, { '--fx': '#ffe6a8', '--size': `${Math.round(figure * 0.8)}px` });
      animate(
        glow,
        [
          { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.25 },
          { transform: 'translate(-50%, -50%) scale(1.3)', opacity: 0 },
        ],
        { duration: 520, easing: 'ease-out' },
      ).then(() => glow.remove());
      lights.forEach((light, k) => after(k * 90, mark, () => ring(id, light.glow, Math.round(Math.min(box.width, box.height) * (0.9 + k * 0.18)), 620)));
      particles.burst({ x: cx, y: top, area: { width: radius * 1.6, height: 8 }, count: 15, colors: ['#ff8a3d', '#8fd3ff', '#f2e36b', '#ffffff'], angle: Math.PI / 2, spread: 0.9, speed: [20, 70], gravity: 40, drag: 1, life: [700, 1100], size: [1.1, 2], shape: 'mote' });
      aura(id, color, 1);
    });
    await wait(duration + 650);
  }

  // 960: the Promień Żywiołów: fire, frost and lightning twist into one
  // beam from the Elementalist that sweeps across the foes, each lit in the
  // three colours as it passes.
  async function braid(event, color, targets) {
    const caster = cards.get(event.actor);
    if (!caster || reduced() || !particles) {
      await beams(color, targets);
      return;
    }
    const art = artOf(caster.card);
    const from = { x: art.x + art.width / 2, y: art.y + art.height * 0.45 };
    // The foes in the order the beam turns through them.
    const turn = (point) => Math.atan2(point.y - from.y, point.x - from.x);
    const foes = targets
      .map((id) => ({ id, entry: cards.get(id) }))
      .filter((foe) => foe.entry)
      .map((foe) => ({ ...foe, point: centerOf(foe.entry.card) }))
      .sort((a, b) => turn(a.point) - turn(b.point));
    if (foes.length === 0) {
      await beams(color, targets);
      return;
    }
    // The beam's end: from the first foe to the last, a line from each to
    // the next.
    const path = [];
    foes.forEach((foe, index) => {
      if (index === 0) path.push(foe.point);
      else {
        const before = foes[index - 1].point;
        for (let step = 1; step <= 6; step++) path.push({ x: before.x + ((foe.point.x - before.x) * step) / 6, y: before.y + ((foe.point.y - before.y) * step) / 6 });
      }
    });
    if (foes.length === 1) path.push({ x: foes[0].point.x + 1, y: foes[0].point.y });
    const reach = Math.max(...path.map((point) => Math.hypot(point.x - from.x, point.y - from.y)));
    const thick = Math.round(Math.max(12, Math.min(20, art.height * 0.24)));
    const ray = spark('fx-ray', { x: 0, y: 0 }, { '--size': `${thick}px` });
    ray.style.width = `${Math.round(reach)}px`;
    ray.innerHTML = RAY;
    const shoot = 160;
    const sweep = 260 * Math.max(1, foes.length - 1) + 120;
    const fade = 260;
    const duration = shoot + sweep + fade;
    const pose = (point, grow = 1, wide = 1) => {
      const length = Math.hypot(point.x - from.x, point.y - from.y);
      const angle = Math.atan2(point.y - from.y, point.x - from.x);
      return `translate(${from.x.toFixed(1)}px, ${from.y.toFixed(1)}px) rotate(${angle.toFixed(4)}rad) scale(${((length / reach) * grow).toFixed(4)}, ${wide}) translate(0, -50%)`;
    };
    const frames = [{ transform: pose(path[0], 0.05, 0.6), opacity: 0, offset: 0 }, { transform: pose(path[0]), opacity: 1, offset: shoot / duration }];
    path.slice(1).forEach((point, index) => frames.push({ transform: pose(point), opacity: 1, offset: (shoot + (sweep * (index + 1)) / Math.max(1, path.length - 1)) / duration }));
    frames.push({ transform: pose(path[path.length - 1], 1, 0.15), opacity: 0, offset: 1 });
    const strands = ray.querySelector('.fx-ray-strands');
    animate(strands, [{ transform: 'translateX(0px)' }, { transform: 'translateX(-52px)' }], { duration: 420, iterations: Math.ceil(duration / 420) });
    const beam = animate(ray, frames, { duration, easing: 'linear' }).then(() => ray.remove());
    // Its light at the end, where it strikes, and at the caster's hands.
    const tip = spark('fx-burst', { x: 0, y: 0 }, { '--fx': '#ffe6a8', '--size': `${thick * 2.6}px` });
    const tipFrames = frames.map((frame, index) => {
      const point = index === 0 ? from : path[Math.min(path.length - 1, Math.max(0, index - 1))];
      return { transform: `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px) translate(-50%, -50%)`, opacity: frame.opacity, offset: frame.offset };
    });
    animate(tip, tipFrames, { duration, easing: 'linear' }).then(() => tip.remove());
    gatherTo(from, art.height * 0.5, ['#ff8a3d', '#8fd3ff', '#f2e36b'], { count: 9, life: 200 });
    // Sparks of the three elements thrown off where it strikes.
    const ticks = Math.ceil((sweep + shoot) / 60);
    for (let tick = 0; tick < ticks; tick++) {
      const at = tick * 60;
      const share = Math.min(1, Math.max(0, (at - shoot) / sweep));
      const point = path[Math.round(share * (path.length - 1))];
      after(at, ray, () => particles.burst({ x: point.x, y: point.y, count: 3, colors: [['#ff8a3d', '#ffd27a'], ['#8fd3ff', '#ffffff'], ['#f2e36b', '#fff7c2']][tick % 3], speed: [80, 200], life: [200, 380], size: [1.1, 2.2], shape: tick % 3 === 1 ? 'shard' : tick % 3 === 2 ? 'spark' : 'ember', drag: 3 }));
    }
    // Each foe lit as the beam reaches it.
    foes.forEach((foe, index) => {
      const atFoe = shoot + (foes.length > 1 ? (sweep * index) / (foes.length - 1) : 0) - 20;
      after(Math.max(0, atFoe), ray, () => {
        animate(foe.entry.card, [{ filter: 'brightness(2) saturate(1.3)' }, { filter: 'brightness(1)' }], { duration: 420, easing: 'ease-out' });
        particles.burst({ x: foe.point.x, y: foe.point.y, count: 6, colors: FIRE, angle: -Math.PI / 2, spread: 1.2, speed: [60, 160], life: [300, 560], size: [1.4, 2.6], shape: 'ember', gravity: -40, drag: 2 });
        particles.burst({ x: foe.point.x, y: foe.point.y, count: 6, colors: ICE, speed: [90, 200], life: [260, 480], size: [1.4, 2.6], shape: 'shard', gravity: 200, drag: 2.2 });
        particles.burst({ x: foe.point.x, y: foe.point.y, count: 6, colors: BOLT, speed: [140, 280], life: [160, 300], size: [1, 1.8], shape: 'spark', drag: 4 });
      });
    });
    await beam;
  }

  // 960: the Ognisty wybuch's blast: burning shards of the fireball fly
  // from where it burst to every other foe and splash on them in fire.
  function splash(event) {
    const entry = cards.get(event.target);
    if (!entry || reduced() || !particles) return;
    const from = centerOf(entry.card);
    const width = stageWidth();
    const others = [...cards.values()].filter((other) => other !== entry && other.unit.side === entry.unit.side && !other.unit.summon && !other.card.classList.contains('unit--down') && other.card.isConnected);
    const base = boxOf(entry.card);
    const mark = anchor(2000);
    const wave = spark('fx-shockwave', { x: from.x, y: base.y + base.height - 10 }, { '--fx': '#ff8a3d' });
    wave.style.width = `${Math.round(Math.min(base.width * 1.6, figureOf(artOf(entry.card)) * 2.6, (Math.min(from.x, width - from.x) - 2) * 2))}px`;
    animate(
      wave,
      [
        { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0.95 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
      ],
      { duration: 520, easing: 'ease-out' },
    ).then(() => wave.remove());
    others.forEach((other, index) => {
      const to = centerOf(other.card);
      const figure = figureOf(artOf(other.card));
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      const lift = Math.min(60, distance * 0.35);
      const control = { x: (from.x + to.x) / 2, y: Math.max(8, Math.min(from.y, to.y) - lift) };
      const along = (t) => ({ x: (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * control.x + t * t * to.x, y: (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * control.y + t * t * to.y });
      const steps = 10;
      const flight = 420;
      const delay = 120 + index * 60;
      const size = Math.round(Math.max(12, figure * 0.22));
      const shard = spark('fx-fireball', { x: 0, y: 0 }, { '--size': `${size}px` });
      const points = Array.from({ length: steps + 1 }, (_, step) => along(step / steps));
      animate(
        shard,
        points.map((point, step) => ({ transform: `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px) translate(-50%, -50%) rotate(${step * 40}deg) scale(${(0.6 + (step / steps) * 0.4).toFixed(2)})`, opacity: step === 0 ? 0 : 1 })),
        { duration: flight, delay, easing: 'linear', fill: 'backwards' },
      ).then(() => {
        shard.remove();
        if (mark.isConnected) splashOn(other, to, figure, mark);
      });
      points.slice(0, -1).forEach((point, step) => after(delay + (step * flight) / steps, mark, () => particles.trail({ from: point, to: points[step + 1], duration: flight / steps, colors: FIRE, rate: 160, sizes: [1.4, 3], life: [160, 360], shape: 'ember' })));
    });
  }

  // A burning shard splashing on a foe: a small burst of fire, embers and
  // flames licking the card a moment.
  function splashOn(other, point, figure, mark) {
    const bloom = spark('fx-explosion', point, { '--size': `${Math.round(figure * 0.7)}px` });
    animate(
      bloom,
      [
        { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 1 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.9, offset: 0.35 },
        { transform: 'translate(-50%, -50%) scale(1.2)', opacity: 0 },
      ],
      { duration: 460, easing: 'ease-out' },
    ).then(() => bloom.remove());
    particles.burst({ x: point.x, y: point.y, count: 10, colors: FIRE, angle: -Math.PI / 2, spread: Math.PI * 0.8, speed: [80, 200], life: [360, 680], size: [1.3, 2.6], shape: 'ember', gravity: 160, drag: 2.2 });
    animate(other.card, [{ filter: 'brightness(1.7) sepia(0.5) saturate(2)' }, { filter: 'brightness(1)' }], { duration: 520, easing: 'ease-out' });
    // It keeps burning until its own hit comes (the blast's damage shows
    // with the next moves of the fight).
    const box = boxOf(other.card);
    [4, 4, 3, 3, 3, 2, 2].forEach((count, wave) => {
      after(80 + wave * 160, mark, () => particles.burst({ x: box.x + box.width / 2, y: box.y + box.height * 0.6, area: { width: figure * 0.7, height: figure * 0.4 }, count, colors: FIRE, angle: -Math.PI / 2, spread: 0.3, speed: [30, 70], gravity: -40, drag: 1.2, life: [380, 620], size: [1.3, 2.4], shape: 'ember' }));
    });
  }

  // ——— 961: the evolved Łucznik's skills in looks of their own ———

  // A bolt of lightning from one point to another, flickering (boltArt()).
  function lightning(from, to, { color = '#b9a8ff', jag = 1, forks = 1, width = 1, duration = 420, delay = 0 } = {}) {
    const art = boltArt(from, to, { jag, forks, width });
    const bolt = spark('fx-zap', { x: art.x, y: art.y }, { '--fx': color });
    bolt.innerHTML = art.html;
    return animate(bolt, FLICKER, { duration, delay, fill: 'backwards' }).then(() => bolt.remove());
  }

  // Short bolts crackling out of a point.
  function crackle(point, reach, color, count = 3, delay = 0) {
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2 + Math.random() * 1.4;
      const far = reach * (0.6 + Math.random() * 0.5);
      lightning(point, { x: point.x + Math.cos(angle) * far, y: point.y + Math.sin(angle) * far }, { color, jag: 0.8, forks: 0, width: 0.65, duration: 280, delay: delay + index * 35 });
    }
  }

  // Sparks of the storm's lightning out of a point.
  function stormSparks(point, count = 10) {
    particles.burst({ x: point.x, y: point.y, count, colors: STORM, speed: [140, 300], life: [180, 360], size: [1, 1.8], shape: 'spark', drag: 4 });
  }

  // A foe struck by the storm's lightning: its card flares white.
  function shocked(entry, strength = 2.3) {
    animate(entry.card, [{ filter: `brightness(${strength}) saturate(0.4)` }, { filter: 'brightness(1)' }], { duration: 420, easing: 'ease-out' });
  }

  // The sky over the foes blackening with a storm (the Gniew Peruna's over
  // nearly the whole stage), for `duration`.
  function stormSky(duration, deep = false) {
    const foes = row('enemy');
    const reach = foes ? boxOf(foes) : null;
    const sky = spark(`fx-sky fx-sky--thunder${deep ? ' fx-sky--wrath' : ''}`, { x: 0, y: 0 });
    sky.style.width = `${stageWidth()}px`;
    sky.style.height = `${Math.round(deep ? stageHeight() * 0.8 : reach ? reach.y + Math.min(reach.height * 0.6, 160) : stageHeight() * 0.35)}px`;
    animate(sky, [{ opacity: 0 }, { opacity: 1, offset: 0.18 }, { opacity: 0.85, offset: 0.72 }, { opacity: 0 }], { duration, easing: 'ease-out' }).then(() => sky.remove());
    return sky;
  }

  // The middle of a card's figure, and a point of its picture.
  const figurePoint = (card, down = 0.5) => {
    const art = artOf(card);
    return { x: art.x + art.width / 2, y: art.y + art.height * down };
  };

  // A wound bleeding: drops thrown out of it (`away`: their way) and a few
  // running down from it over the picture, in the card so they move with
  // it.
  function bleed(card, wound, away, { count = 10, drips = 2, delay = 0 } = {}) {
    particles.burst({ x: wound.x, y: wound.y, count, colors: BLOOD, angle: away, spread: 0.8, speed: [50, 150], gravity: 480, drag: 1.4, life: [380, 640], size: [1, 1.9], shape: 'drop' });
    const box = boxOf(card);
    const art = artOf(card);
    const fall = Math.max(8, art.y + art.height - 6 - wound.y);
    for (let index = 0; index < drips; index++) {
      const bead = h('span', { class: 'fx-blood' });
      bead.style.left = `${(wound.x - box.x + (index ? 4 : -3)).toFixed(1)}px`;
      bead.style.top = `${(wound.y - box.y + 1).toFixed(1)}px`;
      card.append(bead);
      animate(
        bead,
        [
          { transform: 'translate(-50%, -30%) scale(0.3)', opacity: 0 },
          { transform: 'translate(-50%, 0px) scale(1)', opacity: 1, offset: 0.3, easing: 'ease-in' },
          { transform: `translate(-50%, ${(fall * 0.85).toFixed(1)}px) scale(0.85, 1.15)`, opacity: 1, offset: 0.8 },
          { transform: `translate(-50%, ${fall.toFixed(1)}px) scale(0.7, 1)`, opacity: 0 },
        ],
        { duration: 900 + index * 200, delay: delay + 120 + index * 240, easing: 'linear', fill: 'backwards' },
      ).then(() => bead.remove());
    }
  }

  // 961: the Grot z zadziorem: its barbed head lodges in the foe, the arrow
  // sticking out toward the archer and quivering; the foe thrashes, the
  // barbs hold, and it bleeds.
  function barbs(event, color) {
    const entry = cards.get(event.target);
    const shooter = cards.get(event.actor);
    if (!entry) return;
    if (!shooter || reduced() || !particles) {
      burst(event.target, color, 60);
      return;
    }
    const card = entry.card;
    const box = boxOf(card);
    const art = artOf(card);
    const figure = figureOf(art);
    const from = centerOf(shooter.card);
    const middle = art.x + art.width / 2;
    // The wound: low on its body, on the archer's side (the damage number
    // pops over its middle).
    const toward = Math.sign(from.x - middle || 1);
    const wound = { x: middle + toward * figure * 0.2, y: art.y + art.height * 0.7 };
    const angle = Math.atan2(wound.y - from.y, wound.x - from.x);
    const deg = (angle * 180) / Math.PI;
    const arrow = h('span', { class: 'fx-barbed' });
    arrow.innerHTML = BARBED_ARROW;
    arrow.style.width = `${Math.round(Math.min(66, Math.max(44, figure * 0.85)))}px`;
    arrow.style.left = `${(wound.x - box.x).toFixed(1)}px`;
    arrow.style.top = `${(wound.y - box.y).toFixed(1)}px`;
    arrow.style.setProperty('--fx', color);
    // In the card, so it moves with it; its point (where it turns) in the
    // wound, the head sunk a little way in.
    card.append(arrow);
    const pose = (turn, sink) => `translate(-100%, -50%) rotate(${(deg + turn).toFixed(1)}deg) translateX(${sink}px)`;
    animate(
      arrow,
      [
        { transform: pose(0, -8), opacity: 1 },
        { transform: pose(0, 3), offset: 0.05 },
        { transform: pose(8, 3), offset: 0.12 },
        { transform: pose(-6, 3), offset: 0.19 },
        { transform: pose(4, 3), offset: 0.26 },
        { transform: pose(-2, 3), offset: 0.33 },
        { transform: pose(0, 3), opacity: 1, offset: 0.82 },
        { transform: pose(0, 3), opacity: 0 },
      ],
      { duration: 1700, easing: 'ease-out' },
    ).then(() => arrow.remove());
    // A spurt of blood back toward the archer and a red flash in the wound.
    const flare = spark('fx-burst', wound, { '--fx': '#d9534f', '--size': `${Math.round(figure * 0.55)}px` });
    animate(
      flare,
      [
        { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.9, offset: 0.25 },
        { transform: 'translate(-50%, -50%) scale(1.25)', opacity: 0 },
      ],
      { duration: 380, easing: 'ease-out' },
    ).then(() => flare.remove());
    bleed(card, wound, angle + Math.PI, { count: 12, drips: 2 });
    // The foe thrashes, after the blow's own jolt, and the barbs hold.
    const width = stageWidth();
    const shift = (value) => Math.min(Math.max(value, 2 - box.x), width - 2 - box.x - box.width);
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const lean = ux > 0 ? 2 : -2;
    after(480, arrow, () => {
      twinkle(wound, '#ffffff', 14);
      animate(
        card,
        [
          { transform: 'translate(0px, 0px) rotate(0deg)' },
          { transform: `translate(${shift(ux * 6).toFixed(1)}px, ${(uy * 2).toFixed(1)}px) rotate(${lean}deg)`, offset: 0.2 },
          { transform: `translate(${shift(-ux * 2).toFixed(1)}px, 0px) rotate(${-lean * 0.4}deg)`, offset: 0.42 },
          { transform: `translate(${shift(ux * 4).toFixed(1)}px, ${(uy * 1.5).toFixed(1)}px) rotate(${lean * 0.7}deg)`, offset: 0.64 },
          { transform: 'translate(0px, 0px) rotate(0deg)' },
        ],
        { duration: 460, easing: 'ease-in-out' },
      );
      particles.burst({ x: wound.x, y: wound.y, count: 5, colors: BLOOD, angle: angle + Math.PI, spread: 1, speed: [40, 110], gravity: 480, drag: 1.4, life: [340, 560], size: [1, 1.7], shape: 'drop' });
    });
  }

  // 961: the Harpun's blow: the foe bleeds where it went in, and again as
  // it is yanked toward the archer (arena-fx.js draws the harpoon, its
  // rope and the yank).
  function harpooned(event, color) {
    const entry = cards.get(event.target);
    const shooter = cards.get(event.actor);
    if (!entry) return;
    if (!shooter || reduced() || !particles) {
      burst(event.target, color, 60);
      return;
    }
    const from = centerOf(shooter.card);
    const to = centerOf(entry.card);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const sink = Math.min(12, entry.card.offsetWidth * 0.1);
    const wound = { x: to.x - Math.cos(angle) * sink, y: to.y - Math.sin(angle) * sink };
    burst(event.target, '#d9534f', 70);
    bleed(entry.card, wound, angle + Math.PI, { count: 14, drips: 2 });
    const mark = anchor(900);
    after(300, mark, () => particles.burst({ x: wound.x, y: wound.y, count: 6, colors: BLOOD, angle: angle + Math.PI, spread: 0.7, speed: [70, 150], gravity: 480, drag: 1.4, life: [340, 560], size: [1, 1.8], shape: 'drop' }));
  }

  // The hunter's whistle: small waves of sound from its head, turned
  // (degrees from straight up) toward what it calls.
  function whistle(art, turn) {
    const head = { x: art.x + art.width / 2, y: art.y + art.height * 0.3 };
    const size = Math.round(figureOf(art) * 0.55);
    for (let index = 0; index < 3; index++) {
      const wave = spark('fx-roar', head, { '--fx': '#f1e6cc', '--size': `${size}px` });
      wave.innerHTML = ROAR;
      const at = `translate(-50%, -50%) rotate(${turn}deg)`;
      animate(
        wave,
        [
          { transform: `${at} scale(0.25)`, opacity: 0 },
          { transform: `${at} translateY(-6px) scale(0.6)`, opacity: 0.95, offset: 0.35 },
          { transform: `${at} translateY(-16px) scale(0.95)`, opacity: 0 },
        ],
        { duration: 420, delay: index * 90, easing: 'ease-out', fill: 'backwards' },
      ).then(() => wave.remove());
    }
  }

  // Feathers knocked loose from a bird, tumbling down from a point.
  function feathers(point, count, figure, color = '#d9b26b') {
    const width = stageWidth();
    for (let index = 0; index < count; index++) {
      const feather = spark('fx-feather', point, { '--fx': color });
      feather.innerHTML = BROWN_FEATHER;
      const side = index % 2 ? 1 : -1;
      const dx = Math.min(Math.max(side * figure * (0.25 + (index % 3) * 0.12), 10 - point.x), width - 10 - point.x);
      const rise = -figure * (0.1 + (index % 2) * 0.12);
      const fall = figure * (0.35 + (index % 3) * 0.1);
      const spin = side * (60 + index * 25);
      animate(
        feather,
        [
          { transform: 'translate(-50%, -50%) scale(0.5) rotate(0deg)', opacity: 0 },
          { transform: `translate(calc(-50% + ${(dx * 0.6).toFixed(1)}px), calc(-50% + ${rise.toFixed(1)}px)) scale(0.8) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.25 },
          { transform: `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${fall.toFixed(1)}px)) scale(0.75) rotate(${spin}deg)`, opacity: 0 },
        ],
        { duration: 900 + (index % 3) * 120, delay: index * 30, easing: 'ease-out', fill: 'backwards' },
      ).then(() => feather.remove());
    }
  }

  // Talons' rakes across a point, drawn along one after another.
  function rakes(point, size, color, count) {
    const mark = spark('fx-rakes', point, { '--fx': color, '--size': `${Math.round(size)}px` });
    mark.innerHTML = rakesArt(count);
    mark.querySelectorAll('path').forEach((line, index) => {
      line.setAttribute('stroke-dasharray', '100 100');
      line.setAttribute('stroke-dashoffset', '100');
      animate(line, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duration: 110, delay: (index % count) * 45, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', fill: 'both' });
    });
    return animate(
      mark,
      [
        { transform: 'translate(-50%, -50%) rotate(-8deg) scale(0.95)', opacity: 1 },
        { transform: 'translate(-50%, -50%) rotate(-8deg) scale(1)', opacity: 1, offset: 0.55 },
        { transform: 'translate(-50%, -50%) rotate(-8deg) scale(1.05)', opacity: 0 },
      ],
      { duration: 520, easing: 'ease-out' },
    ).then(() => mark.remove());
  }

  // 961: the Sokół wakes: at the Łowca's whistle a falcon swoops down out
  // of the sky onto its card, spreads its wings and flies off at the foes.
  async function falconCall(id, color) {
    const entry = cards.get(id);
    const bird = monsterSprite('falcon');
    if (!entry || !bird || reduced() || !particles) {
      await aura(id, color, 1);
      return;
    }
    const box = boxOf(entry.card);
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const width = stageWidth();
    const inward = box.x + box.width / 2 < width / 2 ? 1 : -1;
    whistle(art, inward * 24);
    const size = Math.round(figure * 0.62);
    const half = size / 2;
    // It lands on the picture's top corner toward the arena's middle.
    const perch = { x: inside(art.x + art.width / 2 + inward * figure * 0.3, half, width), y: Math.max(half, art.y + size * 0.1) };
    const start = { x: inside(perch.x + inward * figure * 2, half, width), y: -size };
    const flyoff = { x: perch.x + inward * figure * 2.2, y: -size };
    const holder = spark('fx-bird', { x: 0, y: 0 }, { '--size': `${size}px` });
    holder.append(bird);
    const steps = 12;
    const swoop = Array.from({ length: steps + 1 }, (_, step) => curve(start, { x: perch.x + inward * figure * 1.3, y: perch.y - figure * 0.1 }, perch, step / steps));
    await animate(holder, birdFrames(swoop, swoop.map((_, step) => 0.8 + (step / steps) * 0.2)), { duration: 560, delay: 120, easing: 'cubic-bezier(0.3, 0.2, 0.4, 1)', fill: 'backwards' });
    if (!holder.isConnected) return;
    // It lands: its wings beat twice, a feather or two drift down.
    aura(id, color, 1);
    feathers({ x: perch.x, y: perch.y + half * 0.4 }, 2, figure);
    const face = -inward;
    const sit = (sx, sy, lift = 0) => `translate(${perch.x.toFixed(1)}px, ${(perch.y - lift).toFixed(1)}px) translate(-50%, -50%) scale(${(face * sx).toFixed(3)}, ${sy.toFixed(3)})`;
    await animate(
      holder,
      [
        { transform: sit(1, 1) },
        { transform: sit(1.16, 0.9, 2), offset: 0.2 },
        { transform: sit(1, 1), offset: 0.4 },
        { transform: sit(1.14, 0.92, 2), offset: 0.6 },
        { transform: sit(1, 1) },
      ],
      { duration: 340, easing: 'ease-in-out' },
    );
    if (!holder.isConnected) return;
    // And it flies off up toward the foes.
    const climb = Array.from({ length: steps + 1 }, (_, step) => curve(perch, { x: perch.x + inward * figure * 0.3, y: perch.y - figure * 1.1 }, flyoff, step / steps));
    await animate(holder, birdFrames(climb, climb.map((_, step) => 1 - (step / steps) * 0.25)), { duration: 420, easing: 'cubic-bezier(0.4, 0, 0.7, 1)' });
    holder.remove();
  }

  // 961: the falcon's peck at the foe's head: two scratches and a few
  // feathers.
  function peck(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 60);
      return;
    }
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const head = { x: art.x + art.width / 2, y: art.y + art.height * 0.32 };
    rakes(head, figure * 0.6, '#f1e6cc', 2);
    feathers(head, 3, figure * 0.8);
    particles.burst({ x: head.x, y: head.y, count: 6, colors: ['#ffffff', '#f1e6cc'], speed: [90, 200], life: [160, 300], size: [1, 1.8], shape: 'spark', drag: 4 });
  }

  // 961: the Szpon orła: the eagle's talons rake the foe's face (three
  // gashes of light), feathers fly and a shadow falls over its eyes: it is
  // blinded.
  function talons(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 60);
      return;
    }
    const card = entry.card;
    const box = boxOf(card);
    const art = artOf(card);
    const figure = figureOf(art);
    const face = { x: art.x + art.width / 2, y: art.y + art.height * 0.42 };
    rakes(face, figure * 0.95, color, 3);
    feathers(face, 5, figure);
    particles.burst({ x: face.x, y: face.y, count: 12, colors: ['#ffffff', '#fff1c9', color], speed: [120, 260], life: [200, 380], size: [1.2, 2.2], shape: 'spark', drag: 3.5 });
    // The shadow over its eyes, in the card, so it moves with it.
    const band = h('span', { class: 'fx-blindfold' });
    band.style.left = `${(face.x - box.x).toFixed(1)}px`;
    band.style.top = `${(art.y + art.height * 0.3 - box.y).toFixed(1)}px`;
    band.style.width = `${Math.round(figure * 1.1)}px`;
    band.style.height = `${Math.round(art.height * 0.34)}px`;
    card.append(band);
    animate(
      band,
      [
        { transform: 'translate(-50%, -50%) scaleX(0.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scaleX(1)', opacity: 0.9, offset: 0.25 },
        { transform: 'translate(-50%, -50%) scaleX(1)', opacity: 0.8, offset: 0.75 },
        { transform: 'translate(-50%, -50%) scaleX(1.1)', opacity: 0 },
      ],
      { duration: 1200, delay: 220, easing: 'ease-out', fill: 'backwards' },
    ).then(() => band.remove());
    after(260, band, () => particles.burst({ x: face.x, y: art.y + art.height * 0.3, area: { width: figure * 0.8, height: 6 }, count: 6, colors: SHADE, angle: -Math.PI / 2, spread: 0.6, speed: [8, 26], gravity: -12, drag: 1.5, life: [700, 1000], size: [3, 5], shape: 'dust' }));
  }

  // 961: the hunter's call (Wilk, Przewodnik watahy): it whistles, and its
  // wolf leaps out of the thicket at the arena's edge into its place; the
  // white wolf comes out of a pale mist and howls, and its howl lights up
  // the whole party. (The card's own coming in arena.js plays under this
  // one, which hides it until its time.)
  async function huntCall(event, look) {
    const owner = cards.get(event.actor);
    const entry = summonedCard(event);
    if (!owner || !entry || reduced() || !particles) {
      await Promise.all([ring(event.actor, look.color, 130, 760), aura(event.actor, look.color, 2)]);
      return;
    }
    const box = boxOf(entry.card);
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const width = stageWidth();
    const x = box.x + box.width / 2;
    const ground = box.y + box.height - 8;
    const mark = anchor(1800);
    const ownerBox = boxOf(owner.card);
    whistle(artOf(owner.card), x < ownerBox.x + ownerBox.width / 2 ? -35 : 35);
    const scene = { entry, card: entry.card, box, art, figure, x, ground, mark, width, look, owner };
    if (look.arrival === 'wolf') wolfLeap(scene);
    else whiteWolf(scene);
    await wait(1250);
  }

  // A wolf leaping out of the thicket at the arena's edge on the side away
  // from its hunter, in an arc, and landing in its place in a puff of dust.
  function wolfLeap({ entry, card, box, art, figure, x, ground, mark, width, look, owner }) {
    const hunter = boxOf(owner.card);
    const side = hunter.x + hunter.width / 2 > x ? -1 : 1;
    const from = side < 0 ? -(box.x + box.width + 6) : width - box.x + 6;
    const edge = { x: side < 0 ? 8 : width - 8, y: art.y + art.height * 0.6 };
    after(COMING - 200, mark, () => {
      leaves(edge, { count: 9, reach: figure * 0.75, colors: THICKET });
      particles.burst({ x: edge.x, y: edge.y, area: { width: 10, height: figure * 0.5 }, count: 8, colors: TWIGS, angle: side < 0 ? 0 : Math.PI, spread: 0.9, speed: [80, 180], life: [380, 650], size: [1.4, 2.6], shape: 'shard', gravity: 300, drag: 1.5 });
    });
    const rise = Math.max(0, Math.min(box.y - 4, figure * 0.45));
    const lean = -side * 6;
    animate(
      card,
      [
        { transform: `translate(${from.toFixed(1)}px, 0px) rotate(${lean}deg)`, easing: 'cubic-bezier(0.25, 0.4, 0.6, 1)' },
        { transform: `translate(${(from * 0.42).toFixed(1)}px, ${(-rise).toFixed(1)}px) rotate(${lean * 0.5}deg)`, offset: 0.5, easing: 'cubic-bezier(0.45, 0, 0.75, 0.6)' },
        { transform: 'translate(0px, 3px) rotate(0deg) scale(1.05, 0.93)', offset: 0.84, easing: 'ease-out' },
        { transform: 'translate(0px, 0px) rotate(0deg) scale(1, 1)' },
      ],
      { duration: 560, delay: COMING, fill: 'backwards' },
    );
    after(COMING + 470, mark, () => {
      particles.burst({ x, y: ground, area: { width: box.width * 0.8, height: 6 }, count: 8, colors: DUST, speed: [30, 90], life: [600, 950], size: [3.5, 6.5], shape: 'dust', gravity: -20, drag: 2 });
      leaves({ x, y: art.y + art.height * 0.4 }, { count: 4, reach: figure * 0.45, colors: THICKET });
      groundRing(entry.unit.id, '#c8b49a');
      aura(entry.unit.id, look.color, 1);
    });
  }

  // The white wolf coming out of a pale mist, its howl rising and the
  // party lit up by it.
  function whiteWolf({ entry, card, box, art, figure, x, mark, width, look, owner }) {
    const middle = { x, y: art.y + art.height * 0.55 };
    const across = Math.round(Math.min(box.width, figure * 1.6, (Math.min(x, width - x) - 2) * 2));
    const mist = spark('fx-mist', middle, { '--size': `${across}px` });
    animate(
      mist,
      [
        { transform: 'translate(-50%, -50%) scale(0.4, 0.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1, 1)', opacity: 0.95, offset: 0.3 },
        { transform: 'translate(-50%, -55%) scale(1.15, 1.05)', opacity: 0.35, offset: 0.6 },
        { transform: 'translate(-50%, -65%) scale(1.3, 1.1)', opacity: 0 },
      ],
      { duration: 1400, easing: 'ease-out' },
    ).then(() => mist.remove());
    for (let wave = 0; wave < 3; wave++) {
      after(wave * 130, mark, () => particles.burst({ x, y: middle.y + art.height * 0.2, area: { width: across * 0.8, height: 10 }, count: 6, colors: ['#ffffff', '#e6eeff', '#c9d8f0'], angle: -Math.PI / 2, spread: 0.6, speed: [10, 36], gravity: -18, drag: 1, life: [800, 1200], size: [3, 6], shape: 'dust' }));
    }
    animate(
      card,
      [
        { opacity: 0, filter: 'brightness(2.4) saturate(0)', transform: 'translateY(6px) scale(0.94)', easing: 'cubic-bezier(0.3, 0.6, 0.4, 1)' },
        { opacity: 1, filter: 'brightness(1.7) saturate(0.4)', transform: 'translateY(0px) scale(1.02)', offset: 0.6 },
        { opacity: 1, filter: 'brightness(1) saturate(1)', transform: 'translateY(0px) scale(1)' },
      ],
      { duration: 560, delay: COMING - 80, fill: 'backwards' },
    );
    // Its howl: it lifts its head, waves rise from it, and the whole party
    // is lit up.
    const howl = COMING + 500;
    // (A computer's wide card tilts less, to lift the head as far.)
    const tilt = Math.min(3, Math.max(1.2, 300 / box.width)).toFixed(1);
    after(howl, mark, () => animate(card, [{ transform: 'translateY(0px) rotate(0deg)' }, { transform: `translateY(-3px) rotate(-${tilt}deg)`, offset: 0.3 }, { transform: `translateY(-3px) rotate(-${tilt}deg)`, offset: 0.7 }, { transform: 'translateY(0px) rotate(0deg)' }], { duration: 620, easing: 'ease-in-out' }));
    const head = { x, y: art.y + art.height * 0.2 };
    const size = Math.round(Math.min(figure * 1.5, (Math.min(x, width - x) - 3) * 2));
    for (let index = 0; index < 4; index++) {
      const wave = spark('fx-roar fx-roar--howl', head, { '--fx': '#dfe9ff', '--size': `${size}px` });
      wave.innerHTML = ROAR;
      animate(
        wave,
        [
          { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
          { transform: 'translate(-50%, calc(-50% - 8px)) scale(0.7)', opacity: 1, offset: 0.3 },
          { transform: 'translate(-50%, calc(-50% - 26px)) scale(1.1)', opacity: 0 },
        ],
        { duration: 620, delay: howl + 40 + index * 130, easing: 'ease-out', fill: 'backwards' },
      ).then(() => wave.remove());
    }
    after(howl + 140, mark, () => {
      for (const ally of cards.values()) {
        if (ally.unit.side !== owner.unit.side || ally.card.classList.contains('unit--down') || !ally.card.isConnected) continue;
        const glow = boxOf(ally.card);
        animate(ally.card, [{ boxShadow: '0 0 0 0 transparent' }, { boxShadow: '0 0 0 2px #e8f0ff, 0 0 16px 3px #c9d8f0', offset: 0.3 }, { boxShadow: '0 0 0 0 transparent' }], { duration: 760 });
        particles.burst({ x: glow.x + glow.width / 2, y: glow.y + glow.height * 0.7, area: { width: glow.width * 0.7, height: glow.height * 0.3 }, count: 8, colors: ['#ffffff', '#e8f0ff', look.color], angle: -Math.PI / 2, spread: 0.5, speed: [20, 50], rise: 30, gravity: -24, drag: 0.8, life: [700, 1000], size: [1.2, 2.2], shape: 'mote' });
      }
    });
  }

  // 961: the Strzał w serce's aim: a heart on the foe's chest, beating
  // twice while the archer draws.
  function heartMark(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      ring(id, color, 70, 420);
      return;
    }
    const figure = figureOf(artOf(entry.card));
    const point = figurePoint(entry.card, 0.56);
    const size = Math.round(figure * 0.5);
    const heart = spark('fx-heart', point, { '--fx': color, '--size': `${size}px` });
    heart.innerHTML = HEART;
    const at = (scale) => `translate(-50%, -50%) scale(${scale})`;
    animate(
      heart,
      [
        { transform: at(0.4), opacity: 0 },
        { transform: at(1), opacity: 1, offset: 0.14 },
        { transform: at(1.24), opacity: 1, offset: 0.24 },
        { transform: at(0.98), opacity: 1, offset: 0.34 },
        { transform: at(1.18), opacity: 1, offset: 0.44 },
        { transform: at(1), opacity: 1, offset: 0.56 },
        { transform: at(1), opacity: 1, offset: 0.9 },
        { transform: at(1.1), opacity: 0 },
      ],
      { duration: 900 },
    ).then(() => heart.remove());
    // A ring of red light with each beat.
    for (const delay of [190, 370]) {
      after(delay, heart, () => {
        const pulse = spark('fx-ring', point, { '--fx': color, '--size': `${Math.round(size * 1.5)}px` });
        animate(
          pulse,
          [
            { transform: 'translate(-50%, -50%) scale(0.5)', opacity: 0.9 },
            { transform: 'translate(-50%, -50%) scale(1.1)', opacity: 0 },
          ],
          { duration: 380, easing: 'ease-out' },
        ).then(() => pulse.remove());
      });
    }
  }

  // The heart of the Strzał w serce breaking where the arrow went in: its
  // halves fall apart, red sparks fly.
  function heartBreak(color) {
    const heart = fx.querySelector('.fx-heart');
    if (!heart) return;
    const point = { x: parseFloat(heart.style.left), y: parseFloat(heart.style.top) };
    const size = heart.style.getPropertyValue('--size');
    heart.remove();
    HEART_HALVES.forEach((half, index) => {
      const piece = spark('fx-heart', point, { '--fx': color, '--size': size });
      piece.innerHTML = half;
      const side = index ? 1 : -1;
      animate(
        piece,
        [
          { transform: 'translate(-50%, -50%) rotate(0deg)', opacity: 1 },
          { transform: `translate(calc(-50% + ${side * 12}px), calc(-50% - 2px)) rotate(${side * 14}deg)`, opacity: 1, offset: 0.28 },
          { transform: `translate(calc(-50% + ${side * 24}px), calc(-50% + 10px)) rotate(${side * 30}deg)`, opacity: 1, offset: 0.6 },
          { transform: `translate(calc(-50% + ${side * 30}px), calc(-50% + 22px)) rotate(${side * 40}deg)`, opacity: 0 },
        ],
        { duration: 720, easing: 'ease-in' },
      ).then(() => piece.remove());
    });
    particles.burst({ x: point.x, y: point.y, count: 14, colors: ['#ffffff', '#ffb3a8', color, '#d9534f'], speed: [90, 220], life: [260, 520], size: [1.2, 2.4], shape: 'spark', drag: 3, gravity: 120 });
  }

  // The cards standing in the fields behind a card's, deeper in its side's
  // formation (where a shot that goes through it goes on), the nearest
  // field first.
  function behindOf(card) {
    const field = card.closest('.arena-field');
    const fields = field?.parentElement ? [...field.parentElement.querySelectorAll(':scope > .arena-field')] : [];
    const depth = fields.indexOf(field);
    if (depth < 0) return [];
    return fields.slice(depth + 1).flatMap((deeper) => [...deeper.querySelectorAll(':scope > .unit')].filter((unit) => !unit.classList.contains('unit--down')));
  }

  // The card a shot that went through it came out of: in the nearest field
  // ahead of a card's (standing or fallen), the one nearest to it.
  function aheadOf(card) {
    const field = card.closest('.arena-field');
    const fields = field?.parentElement ? [...field.parentElement.querySelectorAll(':scope > .arena-field')] : [];
    const at = centerOf(card);
    for (let depth = fields.indexOf(field) - 1; depth >= 0; depth--) {
      const units = [...fields[depth].querySelectorAll(':scope > .unit')];
      if (units.length > 0) return units.reduce((best, unit) => (Math.abs(centerOf(unit).y - at.y) < Math.abs(centerOf(best).y - at.y) ? unit : best));
    }
    return null;
  }

  // A bright line through a card along a shot's way, and sparks thrown on
  // (as pierce(), along any way).
  function pierceAlong(card, angle, color) {
    const to = centerOf(card);
    const line = spark('fx-pierce', to, { '--fx': color });
    line.style.width = `${Math.round(Math.hypot(card.offsetWidth, card.offsetHeight) * 1.5)}px`;
    particles.burst({ x: to.x, y: to.y, count: 16, colors: ['#ffffff', color, '#ffe0c4'], angle, spread: 0.35, speed: [200, 420], life: [180, 360], size: [1.2, 2.4], shape: 'spark', drag: 3.5 });
    animate(
      line,
      [
        { transform: `translate(-50%, -50%) rotate(${angle}rad) scaleX(0)`, opacity: 1 },
        { transform: `translate(-50%, -50%) rotate(${angle}rad) scaleX(1)`, opacity: 1, offset: 0.3 },
        { transform: `translate(-50%, -50%) rotate(${angle}rad) scaleX(1.1) scaleY(0.3)`, opacity: 0 },
      ],
      { duration: 380, easing: 'ease-out' },
    ).then(() => line.remove());
  }

  // A dashed line of sight between two points, drawn on from the first.
  function sightOf(from, to, color, delay, duration) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const line = spark('fx-sightline', from, { '--fx': color });
    line.style.width = `${Math.round(Math.hypot(dx, dy))}px`;
    const at = `rotate(${Math.atan2(dy, dx).toFixed(4)}rad)`;
    return animate(
      line,
      [
        { transform: `${at} scaleX(0)`, opacity: 0 },
        { transform: `${at} scaleX(1)`, opacity: 0.85, offset: 0.3 },
        { transform: `${at} scaleX(1)`, opacity: 0.85, offset: 0.82 },
        { transform: `${at} scaleX(1)`, opacity: 0 },
      ],
      { duration, delay, easing: 'ease-out', fill: 'backwards' },
    ).then(() => line.remove());
  }

  // 961: the Mistrzowski strzał's aim, while the bowstring is drawn to the
  // ear (arena-fx.js): a line of sight from the archer to its target, and on
  // from it to every foe in the formation behind it, which the arrow will go
  // through.
  function sightline(event, color) {
    const target = cards.get(event.target);
    const shooter = cards.get(event.actor);
    if (!target || !shooter) return;
    reticle(event.target, color);
    if (reduced()) return;
    const to = centerOf(target.card);
    sightOf(centerOf(shooter.card), to, color, 0, 760);
    behindOf(target.card).forEach((card, index) => sightOf(to, centerOf(card), color, 160 + index * 60, 600 - index * 60));
  }

  // 961: a shot that goes on through its target (Przebijający strzał,
  // Strzał w serce, Mistrzowski strzał): a line of light pierces it and the
  // arrow bursts out of its back in splinters and sparks; the Strzał w
  // serce breaks its heart, the Mistrzowski strzał blazes.
  function throughShot(event, look) {
    const target = cards.get(event.target);
    const shooter = cards.get(event.actor);
    if (!target || !shooter) return;
    if (reduced() || !particles) {
      pierce(event, look.color);
      burst(event.target, look.color, 60);
      return;
    }
    const to = centerOf(target.card);
    // Its way: from the archer, or for its pierce from the foe it went
    // through; it goes on toward the foe behind, if one stands there.
    const ahead = event.pierced ? aheadOf(target.card) : null;
    const from = centerOf(ahead ?? shooter.card);
    const way = Math.atan2(to.y - from.y, to.x - from.x);
    const next = behindOf(target.card)[0];
    const toward = next ? centerOf(next) : null;
    const angle = toward ? Math.atan2(toward.y - to.y, toward.x - to.x) : way;
    const figure = figureOf(artOf(target.card));
    const master = look.orb === 'master';
    pierceAlong(target.card, way, look.color);
    if (look.heart && !event.pierced) heartBreak(look.color);
    // Out of its back.
    const exit = { x: to.x + Math.cos(angle) * figure * 0.45, y: to.y + Math.sin(angle) * figure * 0.45 };
    particles.burst({ x: exit.x, y: exit.y, count: master ? 20 : 14, colors: ['#ffffff', look.color, '#efe3c8'], angle, spread: 0.3, speed: [220, 440], life: [200, 380], size: [1.2, 2.4], shape: 'spark', drag: 3 });
    particles.burst({ x: exit.x, y: exit.y, count: 6, colors: TWIGS, angle, spread: 0.5, speed: [110, 230], life: [300, 520], size: [1.2, 2], shape: 'shard', gravity: 320, drag: 2 });
    const flare = spark('fx-burst', exit, { '--fx': look.color, '--size': `${Math.round(figure * (master ? 0.75 : 0.5))}px` });
    animate(
      flare,
      [
        { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.25 },
        { transform: 'translate(-50%, -50%) scale(1.3)', opacity: 0 },
      ],
      { duration: 360, easing: 'ease-out' },
    ).then(() => flare.remove());
    if (master) {
      burst(event.target, '#fff1c9', Math.round(figure * 1.4));
      ring(event.target, look.color, Math.round(figure * 1.6), 460);
      if (!event.pierced) flash(look.color, 0.14, 320);
    } else burst(event.target, look.color, 60);
  }

  // 961: the Strzał z ukrycia: the Snajper hides in the shadow of leaves,
  // its card darkened and leaves stirring over it, until its arrow has
  // flown out of hiding (arena-fx.js flies it unseen).
  function hide(event) {
    const shooter = cards.get(event.actor);
    if (!shooter || reduced() || !particles) {
      ring(event.target, lookOf(event).color, 70, 420);
      return;
    }
    const box = boxOf(shooter.card);
    const art = artOf(shooter.card);
    const figure = figureOf(art);
    animate(
      shooter.card,
      [
        { filter: 'brightness(1) saturate(1)' },
        { filter: 'brightness(0.32) saturate(0.45)', offset: 0.22 },
        { filter: 'brightness(0.32) saturate(0.45)', offset: 0.8 },
        { filter: 'brightness(1) saturate(1)' },
      ],
      { duration: 1000, easing: 'ease-in-out' },
    );
    leaves({ x: art.x + art.width / 2, y: art.y + 6 }, { count: 10, reach: figure * 0.55, colors: THICKET });
    particles.burst({ x: box.x + box.width / 2, y: art.y + art.height * 0.5, area: { width: figure * 0.9, height: art.height * 0.8 }, count: 8, colors: SHADE, angle: -Math.PI / 2, spread: 1.2, speed: [6, 24], gravity: -8, drag: 1.4, life: [700, 1000], size: [4, 7], shape: 'dust' });
    // The leaves stir again as the arrow leaves its cover.
    const mark = anchor(700);
    after(200, mark, () => leaves({ x: art.x + art.width / 2, y: art.y + art.height * 0.4 }, { count: 6, reach: figure * 0.45, colors: THICKET }));
  }

  // 961: the arrow out of hiding strikes: a sudden white flash on the foe,
  // a dark line through it, and the leaves it came through scattering.
  function ambushHit(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    pierce(event, color);
    if (reduced() || !particles) {
      burst(event.target, color, 60);
      return;
    }
    burst(event.target, '#ffffff', Math.round(figureOf(artOf(entry.card)) * 1.3));
    flash('#e6dcff', 0.16, 240);
    particles.burst({ x: centerOf(entry.card).x, y: centerOf(entry.card).y, count: 10, colors: SHADE_SPARKS, speed: [80, 200], life: [260, 480], size: [1.2, 2.2], shape: 'spark', drag: 3 });
  }

  // 961: the Spokojna ręka: the world goes still round the Mistrz Łuku: the
  // arena dims but for it, a slow breath draws in and goes out, the corners
  // of a sight close calmly round its head and its eye glints.
  async function steady(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await Promise.all([ring(id, color, 130, 760), aura(id, color, 2)]);
      return;
    }
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const middle = { x: art.x + art.width / 2, y: art.y + art.height * 0.45 };
    const stillness = spark('fx-stillness', { x: 0, y: 0 });
    stillness.style.width = `${stageWidth()}px`;
    stillness.style.height = `${stageHeight()}px`;
    stillness.style.setProperty('--x', `${middle.x.toFixed(1)}px`);
    stillness.style.setProperty('--y', `${middle.y.toFixed(1)}px`);
    stillness.style.setProperty('--r', `${Math.round(figure * 0.85)}px`);
    animate(stillness, [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 1, offset: 0.72 }, { opacity: 0 }], { duration: 1600, easing: 'ease-in-out' }).then(() => stillness.remove());
    // The breath: a ring drawing in, then going out again, slowly.
    const size = Math.round(figure * 1.45);
    const breath = spark('fx-breath', middle, { '--fx': color, '--size': `${size}px` });
    animate(
      breath,
      [
        { transform: 'translate(-50%, -50%) scale(1.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.05)', opacity: 0.85, offset: 0.2 },
        { transform: 'translate(-50%, -50%) scale(0.5)', opacity: 0.9, offset: 0.45, easing: 'cubic-bezier(0.3, 0, 0.3, 1)' },
        { transform: 'translate(-50%, -50%) scale(1.45)', opacity: 0 },
      ],
      { duration: 1400, easing: 'ease-in-out' },
    ).then(() => breath.remove());
    // The sight's corners close calmly round its head and hold.
    const head = { x: middle.x, y: art.y + art.height * 0.38 };
    const corners = spark('fx-reticle', head, { '--fx': '#ffffff', '--size': `${Math.round(figure * 0.78)}px` });
    corners.innerHTML = FOCUS;
    animate(
      corners,
      [
        { transform: 'translate(-50%, -50%) scale(1.7)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.95, offset: 0.4, easing: 'ease-in-out' },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.95, offset: 0.78 },
        { transform: 'translate(-50%, -50%) scale(0.92)', opacity: 0 },
      ],
      { duration: 1400, easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)' },
    ).then(() => corners.remove());
    // The breath held: its eye glints, calm motes drift round it.
    after(640, stillness, () => {
      twinkle({ x: middle.x + figure * 0.08, y: art.y + art.height * 0.32 }, '#ffffff', 16);
      aura(id, color, 1);
    });
    particles.burst({ x: middle.x, y: middle.y, area: { width: figure * 1.2, height: art.height }, count: 10, colors: ['#ffffff', color, '#d8f5df'], angle: -Math.PI / 2, spread: Math.PI, speed: [4, 14], drag: 0.4, life: [1000, 1400], size: [1, 1.8], shape: 'mote' });
    await wait(1300);
  }

  // 961: the Namierzenie: the Strzelec Wyborowy's line of sight runs to the
  // foe, a red sight closes on it and locks with two clicks, crosshairs
  // run across its card and a ring marks its feet.
  async function lockOn(event, color) {
    const target = cards.get(event.targets[0]);
    const shooter = cards.get(event.actor);
    if (!target || !shooter || reduced() || !particles) {
      await aura(event.actor, color, 1);
      return;
    }
    const from = centerOf(shooter.card);
    const box = boxOf(target.card);
    const to = centerOf(target.card);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const line = spark('fx-sightline fx-sightline--lock', from, { '--fx': color });
    line.style.width = `${Math.round(Math.hypot(dx, dy))}px`;
    const along = `rotate(${Math.atan2(dy, dx).toFixed(4)}rad)`;
    animate(
      line,
      [
        { transform: `${along} scaleX(0)`, opacity: 0 },
        { transform: `${along} scaleX(1)`, opacity: 0.9, offset: 0.22 },
        { transform: `${along} scaleX(1)`, opacity: 0.9, offset: 0.6 },
        { transform: `${along} scaleX(1)`, opacity: 0 },
      ],
      { duration: 1000, easing: 'ease-out' },
    ).then(() => line.remove());
    const size = Math.round(Math.min(box.width, box.height) * 1.05);
    const sight = spark('fx-reticle', to, { '--fx': color, '--size': `${size}px` });
    sight.innerHTML = RETICLE;
    const at = (scale, turn) => `translate(-50%, -50%) scale(${scale}) rotate(${turn}deg)`;
    animate(
      sight,
      [
        { transform: at(2.1, 90), opacity: 0 },
        { transform: at(1, 0), opacity: 1, offset: 0.34, easing: 'ease-out' },
        { transform: at(0.86, 0), opacity: 1, offset: 0.4 },
        { transform: at(1, 0), opacity: 1, offset: 0.46 },
        { transform: at(0.88, 0), opacity: 1, offset: 0.52 },
        { transform: at(0.94, 0), opacity: 1, offset: 0.58 },
        { transform: at(0.94, 0), opacity: 1, offset: 0.86 },
        { transform: at(0.8, 0), opacity: 0 },
      ],
      { duration: 1300, delay: 120, easing: 'ease-in-out', fill: 'backwards' },
    ).then(() => sight.remove());
    // Locked: the crosshairs run across the foe's card, which reddens, and
    // a ring marks its feet.
    after(640, sight, () => {
      for (const across of [true, false]) {
        const hair = spark('fx-crosshair', to, { '--fx': color });
        hair.style.width = across ? `${Math.round(box.width + 14)}px` : '2px';
        hair.style.height = across ? '2px' : `${Math.round(box.height + 14)}px`;
        animate(
          hair,
          [
            { transform: `translate(-50%, -50%) ${across ? 'scaleX' : 'scaleY'}(0)`, opacity: 0.95 },
            { transform: `translate(-50%, -50%) ${across ? 'scaleX' : 'scaleY'}(1)`, opacity: 0.95, offset: 0.3 },
            { transform: `translate(-50%, -50%) ${across ? 'scaleX' : 'scaleY'}(1)`, opacity: 0 },
          ],
          { duration: 700, easing: 'ease-out' },
        ).then(() => hair.remove());
      }
      animate(target.card, [{ boxShadow: '0 0 0 0 transparent' }, { boxShadow: `0 0 0 2px ${color}, 0 0 16px 2px ${color}`, offset: 0.3 }, { boxShadow: '0 0 0 0 transparent' }], { duration: 760 });
      groundRing(event.targets[0], color);
      twinkle({ x: to.x, y: to.y }, '#ffffff', 14);
    });
    await wait(1250);
  }

  // The volley loosed up into the storm (as the Grad strzał's).
  function volleyUp(from, color) {
    return [-14, -5, 4, 13, 22].map((dx, index) =>
      arrowFlight(
        { x: from.x + dx, y: from.y },
        [
          { transform: 'translate(0, 0) rotate(-90deg)', opacity: 0 },
          { opacity: 1, offset: 0.2 },
          { transform: `translate(${dx * 0.6}px, -240px) rotate(-90deg)`, opacity: 0 },
        ],
        300,
        index * 45,
        color,
      ),
    );
  }

  // Arrows falling on a foe, out of the storm; `landed` for each where it
  // lands.
  function arrowsOn(entry, color, delay, count, landed) {
    const box = boxOf(entry.card);
    return [-0.3, 0.06, 0.32, -0.12, 0.2].slice(0, count).map((dx, arrow) => {
      const land = { x: box.x + box.width * (0.5 + dx), y: box.y + box.height * (0.42 + (arrow % 2) * 0.2) };
      return arrowFlight(
        land,
        [
          { transform: 'translate(-26px, -110px) rotate(76deg)', opacity: 0 },
          { opacity: 1, offset: 0.25 },
          { transform: 'translate(0, 0) rotate(76deg)', opacity: 1 },
        ],
        260,
        delay + arrow * 50,
        color,
      ).then(() => landed(land, arrow));
    });
  }

  // 961: the storms of the Strzelec Burzy's line. The Burza strzał: storm
  // clouds darken the sky over the foes, a volley goes up into them and
  // comes down on every foe charged with lightning, each arrow landing in a
  // crackle of sparks. The Grom z nieba: the sky blackens, and with the
  // arrows a bolt of lightning strikes every foe. The Gniew Peruna: the
  // whole sky blackens, bolts strike every foe by the handful and leap from
  // foe to foe.
  async function storm(event, look, targets) {
    const caster = cards.get(event.actor);
    if (!caster || reduced() || !particles) {
      await (look.volley ? volley(event, look.color, targets) : rain(look.color, targets));
      return;
    }
    if (look.storm === 'wrath') {
      await perunWrath(look.color, targets);
      return;
    }
    const thunder = look.storm === 'thunder';
    const sky = stormSky(thunder ? 1800 : 1500);
    const from = centerOf(caster.card);
    const up = volleyUp(from, look.color);
    for (let index = 0; index < 4; index++) {
      after(40 + index * 55, sky, () => particles.burst({ x: from.x + (index % 2 ? 10 : -6), y: from.y - 30 - index * 40, count: 3, colors: STORM, speed: [60, 140], life: [140, 260], size: [1, 1.6], shape: 'spark', drag: 4 }));
    }
    // Lightning in the clouds as the volley goes into them.
    after(220, sky, () => flash('#c9b7ff', thunder ? 0.16 : 0.1, 280));
    await wait(260);
    if (!sky.isConnected) return;
    const falls = targets.flatMap((id, index) => {
      const entry = cards.get(id);
      if (!entry) return [];
      const art = artOf(entry.card);
      const figure = figureOf(art);
      const delay = index * (thunder ? 110 : 70);
      if (thunder) {
        // The bolt first, then the arrows with it.
        after(delay, sky, () => {
          const point = figurePoint(entry.card, 0.5);
          lightning({ x: point.x + (Math.random() - 0.5) * 20, y: 0 }, point, { color: look.color, forks: 2, width: 1.15, duration: 460 });
          stormSparks(point, 12);
          shocked(entry, 2.6);
          if (index === 0) flash('#ece6ff', 0.22, 300);
          shake(index === 0 ? 3 : 2, 240);
        });
      }
      let first = true;
      return arrowsOn(entry, look.color, delay + (thunder ? 60 : 0), thunder ? 3 : 5, (land) => {
        if (!sky.isConnected) return;
        crackle(land, figure * 0.22, look.color, 2);
        particles.burst({ x: land.x, y: land.y, count: 3, colors: STORM, speed: [80, 180], life: [140, 280], size: [1, 1.6], shape: 'spark', drag: 4 });
        particles.burst({ x: land.x, y: land.y + 4, count: 2, colors: DUST, speed: [10, 40], life: [380, 620], size: [3, 5], shape: 'dust', gravity: -10, drag: 2 });
        if (first && !thunder) shocked(entry, 1.9);
        first = false;
      });
    });
    await Promise.all([...up, ...falls]);
  }

  // The Gniew Peruna (storm() above).
  async function perunWrath(color, targets) {
    const sky = stormSky(2100, true);
    after(140, sky, () => {
      flash('#ece6ff', 0.24, 320);
      shake(2.4, 260);
    });
    const foes = targets.map((id) => cards.get(id)).filter(Boolean);
    const strikes = [];
    foes.forEach((entry, index) => {
      for (let bolt = 0; bolt < 2; bolt++) {
        strikes.push(
          after(260 + index * 120 + bolt * 90, sky, () => {
            const point = figurePoint(entry.card, bolt ? 0.42 : 0.6);
            lightning({ x: point.x + (bolt ? 1 : -1) * (8 + Math.random() * 14), y: 0 }, point, { color, forks: 2, width: 1.2, duration: 480 });
            stormSparks(point, 10);
            shocked(entry, 2.8);
            shake(bolt ? 2.6 : 3.2, 240);
            if (bolt) flash('#c9b7ff', 0.14, 260);
          }),
        );
      }
    });
    // The bolts leap from foe to foe.
    const chained = 260 + foes.length * 120 + 160;
    foes.slice(1).forEach((entry, index) => {
      strikes.push(
        after(chained + index * 110, sky, () => {
          const a = figurePoint(foes[index].card, 0.5);
          const b = figurePoint(entry.card, 0.5);
          lightning(a, b, { color, jag: 1.4, forks: 1, width: 0.9, duration: 380 });
          stormSparks(a, 6);
          stormSparks(b, 8);
          shocked(entry, 2.2);
        }),
      );
    });
    await Promise.all(strikes);
    await wait(220);
  }

  // A storm cloud rolling in over the enemy row (the Chmura burzowa): two
  // rows of dark puffs gathering from both sides, the sky darkening under
  // them, lit from inside now and then.
  function cloudOver(duration) {
    const foes = row('enemy');
    const reach = foes ? boxOf(foes) : { x: 0, y: 0, width: stageWidth(), height: 120 };
    const width = stageWidth();
    const left = Math.max(0, reach.x - 6);
    const across = Math.min(width, reach.x + reach.width + 6) - left;
    const top = -22;
    const height = Math.round(Math.min(96, Math.max(68, reach.y + 72)));
    const sky = stormSky(duration);
    const cloud = spark('fx-cloud', { x: left, y: top });
    cloud.style.width = `${Math.round(across)}px`;
    cloud.style.height = `${height}px`;
    // The back row higher and lighter, the front row lower and darker.
    // (As many as the cloud is wide, so a computer's wide one stays a cloud.)
    const rows = [
      { count: Math.max(7, Math.round(across / 50)), from: -0.12, size: 0.62, kind: 'fx-cloud-puff fx-cloud-puff--back' },
      { count: Math.max(9, Math.round(across / 40)), from: 0.2, size: 0.56, kind: 'fx-cloud-puff' },
    ];
    for (const [layer, { count, from, size: share0, kind }] of rows.entries()) {
      for (let index = 0; index < count; index++) {
        const puff = h('span', { class: kind });
        const share = (index + 0.5 + (layer ? 0 : 0.25)) / count;
        const size = height * share0 * (index % 2 ? 0.9 : 1.15) * (0.9 + ((index * 37) % 5) * 0.06);
        puff.style.left = `${(share * across - size * 0.75).toFixed(1)}px`;
        puff.style.top = `${(height * from + (index % 2 ? size * 0.12 : 0)).toFixed(1)}px`;
        puff.style.width = `${(size * 1.5).toFixed(1)}px`;
        puff.style.height = `${size.toFixed(1)}px`;
        cloud.append(puff);
        animatePuff(puff, share, across, duration, layer);
      }
    }
    const glow = h('span', { class: 'fx-cloud-glow' });
    cloud.append(glow);
    animate(cloud, [{ opacity: 1 }, { opacity: 1 }], { duration }).then(() => {
      cloud.remove();
      sky.remove();
    });
    return { cloud, glow, bottom: top + height * 0.78, left, across };
  }

  // A puff of the cloud drifting in from its side, growing, and thinning
  // away at the end.
  function animatePuff(puff, share, across, duration, layer) {
    const drift = (share < 0.5 ? -1 : 1) * across * (layer ? 0.25 : 0.18);
    animate(
      puff,
      [
        { transform: `translateX(${drift.toFixed(1)}px) scale(0.6)`, opacity: 0 },
        { transform: 'translateX(0px) scale(1)', opacity: 1, offset: 0.3 },
        { transform: `translateX(${(-drift * 0.08).toFixed(1)}px) scale(1.03)`, opacity: 1, offset: 0.8 },
        { transform: `translateX(${(-drift * 0.12).toFixed(1)}px) scale(1.05)`, opacity: 0 },
      ],
      { duration, easing: 'ease-out' },
    );
  }

  // The cloud lit from inside, as lightning goes through it.
  function rumble(sky) {
    animate(sky.glow, [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 0.3, offset: 0.3 }, { opacity: 0.8, offset: 0.42 }, { opacity: 0 }], { duration: 420 });
  }

  // 961: the Chmura burzowa: as it wakes, a storm cloud rolls in over the
  // foes and rumbles; on each of its moves after, it gathers again and
  // lightning strikes from it at every foe.
  async function stormCloud(event, look, targets) {
    if (reduced() || !particles) {
      await beams(look.color, targets);
      return;
    }
    if (targets.length === 0) {
      const sky = cloudOver(1700);
      after(520, sky.cloud, () => rumble(sky));
      after(900, sky.cloud, () => {
        rumble(sky);
        lightning({ x: sky.left + sky.across * 0.35, y: sky.bottom - 6 }, { x: sky.left + sky.across * 0.62, y: sky.bottom + 4 }, { color: look.color, jag: 1.2, forks: 1, width: 0.8, duration: 320 });
      });
      await wait(1300);
      return;
    }
    const sky = cloudOver(1250);
    after(200, sky.cloud, () => rumble(sky));
    await wait(300);
    if (!sky.cloud.isConnected) return;
    await Promise.all(
      targets.map((id, index) =>
        after(index * 100, sky.cloud, () => {
          const entry = cards.get(id);
          if (!entry) return;
          const point = figurePoint(entry.card, 0.5);
          lightning({ x: point.x + (Math.random() - 0.5) * 18, y: sky.bottom }, point, { color: look.color, forks: 1, duration: 420 });
          stormSparks(point, 8);
          shocked(entry);
          if (index === 0) flash('#c9b7ff', 0.12, 260);
        }),
      ),
    );
    await wait(260);
  }

  // Where the Kula piorunów hangs: over its archer's head, toward the
  // arena's middle.
  function orbAt(card) {
    const box = boxOf(card);
    const art = artOf(card);
    const figure = figureOf(art);
    const inward = box.x + box.width / 2 < stageWidth() / 2 ? 1 : -1;
    return { point: { x: art.x + art.width / 2 + inward * figure * 0.34, y: art.y + figure * 0.27 }, size: Math.round(Math.max(16, figure * 0.3)), figure };
  }

  // 961: the Kula piorunów wakes: sparks gather over the Władca Piorunów's
  // head into a crackling ball of lightning, which flares and hangs there
  // (arena-fx.js strikes from it).
  async function orbForm(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await aura(id, color, 1);
      return;
    }
    const { point, size, figure } = orbAt(entry.card);
    gatherTo(point, figure * 0.62, STORM, { count: 14, life: 320 });
    const ball = spark('fx-thunderorb', point, { '--fx': color, '--size': `${size}px` });
    ball.innerHTML = ORB_ARCS;
    animate(
      ball,
      [
        { transform: 'translate(-50%, -50%) scale(0)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(0)', opacity: 0, offset: 0.2 },
        { transform: 'translate(-50%, -50%) scale(1.35)', opacity: 1, offset: 0.32 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.42 },
        { transform: 'translate(-50%, -50%) translateY(-3px) scale(1.06)', opacity: 1, offset: 0.66 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.86 },
        { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0 },
      ],
      { duration: 1500, easing: 'ease-in-out' },
    ).then(() => ball.remove());
    after(330, ball, () => {
      stormSparks(point, 12);
      aura(id, color, 1);
    });
    for (const delay of [560, 820, 1060]) after(delay, ball, () => crackle(point, size * 1.1, color, 2));
    await wait(1300);
  }

  // 961: the Kula piorunów's bolt lands: it crackles over the foe.
  function zapped(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 60);
      return;
    }
    const point = centerOf(entry.card);
    crackle(point, figureOf(artOf(entry.card)) * 0.45, color, 4);
    stormSparks(point, 12);
    burst(event.target, '#ece6ff', 70);
    shocked(entry, 2);
  }

  // 961: the Znak gromu: the Wybraniec Peruna draws the sign of thunder in
  // the air over its card, stroke after stroke; it flares and crackles,
  // and its lightning runs to every card of the party, whose blows it
  // charges.
  async function thunderSign(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await Promise.all([ring(id, color, 130, 760), aura(id, color, 2)]);
      return;
    }
    const box = boxOf(entry.card);
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const width = stageWidth();
    const point = { x: art.x + art.width / 2, y: art.y + art.height * 0.5 };
    const size = Math.round(Math.min(box.width * 0.96, figure * 1.2, (Math.min(point.x, width - point.x) - 2) * 2, point.y * 2 - 4));
    const sign = spark('fx-sign', point, { '--fx': color, '--size': `${size}px` });
    sign.innerHTML = THUNDER_SIGN;
    sign.querySelectorAll('.fx-sign-stroke').forEach((stroke, index) => {
      stroke.setAttribute('stroke-dasharray', '100 100');
      stroke.setAttribute('stroke-dashoffset', '100');
      animate(stroke, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duration: 220, delay: 60 + index * 75, easing: 'ease-in-out', fill: 'both' });
    });
    const at = (scale, turn = 0) => `translate(-50%, -50%) scale(${scale}) rotate(${turn}deg)`;
    animate(
      sign,
      [
        { transform: at(0.94, -10), opacity: 1 },
        { transform: at(1, 0), opacity: 1, offset: 0.5 },
        { transform: at(1.12), opacity: 1, offset: 0.58, easing: 'ease-out' },
        { transform: at(1), opacity: 0.95, offset: 0.7 },
        { transform: at(1.02), opacity: 0.9, offset: 0.84 },
        { transform: at(1.08), opacity: 0 },
      ],
      { duration: 1550, easing: 'ease-in-out' },
    ).then(() => sign.remove());
    // Drawn: it flares, crackles at its petals' tips, and its lightning
    // runs to the party.
    after(800, sign, () => {
      flash(color, 0.14, 320);
      animate(sign, [{ filter: 'brightness(1.8)' }, { filter: 'brightness(1)' }], { duration: 420, easing: 'ease-out' });
      const reach = size * 0.43;
      for (let k = 0; k < 6; k++) {
        const angle = ((k * 60 - 90) * Math.PI) / 180;
        const tip = { x: point.x + Math.cos(angle) * reach, y: point.y + Math.sin(angle) * reach };
        if (k % 2 === 0) crackle(tip, size * 0.16, color, 1, k * 20);
      }
      stormSparks(point, 14);
      for (const ally of cards.values()) {
        if (ally.unit.side !== entry.unit.side || ally.card.classList.contains('unit--down') || !ally.card.isConnected) continue;
        if (ally !== entry) lightning(point, figurePoint(ally.card, 0.5), { color, jag: 0.9, forks: 0, width: 0.8, duration: 360 });
        aura(ally.unit.id, color, 1);
      }
    });
    await wait(1400);
  }

  // ——— 962: the evolved Wojownik's skills in looks of their own ———

  // The standing cards of a side (the foes of a unit: the other side's).
  const standing = (side) => [...cards.values()].filter((other) => other.unit.side === side && other.card.isConnected && !other.card.classList.contains('unit--down'));
  const foesOf = (entry) => standing(entry.unit.side === 'ally' ? 'enemy' : 'ally');
  // A card's current HP and its maximum (from its HP line).
  function hpOf(entry) {
    const [now, max] = entry.hpText.textContent.split('/').map((part) => Number(part.trim()));
    return Number.isFinite(now) && max > 0 ? { now, max } : { now: 1, max: 1 };
  }
  // A card lit for a moment in a colour, over its picture and words.
  function tintCard(card, color, frames, duration) {
    const glow = h('span', { class: 'fx-tint' });
    glow.style.setProperty('--fx', color);
    card.append(glow);
    return animate(glow, frames, { duration, easing: 'ease-out' }).then(() => glow.remove());
  }
  // A card's frame glowing a moment in a colour.
  const rimGlow = (card, color, duration = 700, delay = 0) =>
    animate(card, [{ boxShadow: '0 0 0 0 transparent' }, { boxShadow: `0 0 0 2px ${color}, 0 0 16px 3px ${color}`, offset: 0.3 }, { boxShadow: '0 0 0 0 transparent' }], { duration, delay, fill: 'backwards' });
  // A thin cut drawn across a point at an angle (degrees), in a colour
  // round a white core: one stroke, drawn on fast, then fading.
  function cutAt(point, angle, length, color, { delay = 0, duration = 420, bend = 7, width = 1 } = {}) {
    const mark = spark('fx-cut', point, { '--fx': color, '--size': `${Math.round(length)}px` });
    mark.innerHTML =
      '<svg viewBox="-50 -50 100 100" aria-hidden="true"><g fill="none" stroke-linecap="round">' +
      `<path class="fx-cut-glow" pathLength="100" d="M-48 ${-bend * 0.3}Q0 ${bend} 48 ${-bend * 0.3}" stroke-width="${(7 * width).toFixed(1)}"/>` +
      `<path class="fx-cut-core" pathLength="100" d="M-48 ${-bend * 0.3}Q0 ${bend} 48 ${-bend * 0.3}" stroke-width="${(2.4 * width).toFixed(1)}"/></g></svg>`;
    for (const line of mark.querySelectorAll('path')) {
      line.setAttribute('stroke-dasharray', '100 100');
      line.setAttribute('stroke-dashoffset', '100');
      animate(line, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duration: 90, delay, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', fill: 'both' });
    }
    const at = `translate(-50%, -50%) rotate(${angle.toFixed(1)}deg)`;
    return animate(
      mark,
      [
        { transform: `${at} scale(0.94)`, opacity: 1 },
        { transform: `${at} scale(1)`, opacity: 1, offset: 0.45 },
        { transform: `${at} scale(1.04)`, opacity: 0 },
      ],
      { duration, delay, easing: 'ease-out', fill: 'backwards' },
    ).then(() => mark.remove());
  }

  // 962: the Druzgocący cios: the Barbarzyńca's whole weight in its blow:
  // a jagged flash where it lands with lines rushing in to it, the foe
  // driven down into the ground, which sinks round its feet, and dust and
  // pebbles thrown out along it.
  function slam(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 90);
      ring(event.target, color, 110, 420);
      return;
    }
    const card = entry.card;
    const art = artOf(card);
    const figure = figureOf(art);
    const width = stageWidth();
    const x = art.x + art.width / 2;
    const landed = { x, y: art.y + art.height * 0.3 };
    const foot = { x, y: art.y + art.height - 2 };
    const size = Math.round(Math.min(figure * 1.1, (Math.min(x, width - x) - 2) * 2));
    const star = spark('fx-impact', landed, { '--size': `${size}px` });
    star.innerHTML = IMPACT_STAR;
    animate(
      star,
      [
        { transform: 'translate(-50%, -50%) scale(0.35) rotate(-10deg)', opacity: 1 },
        { transform: 'translate(-50%, -50%) scale(1.1) rotate(0deg)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(2deg)', opacity: 0.95, offset: 0.45 },
        { transform: 'translate(-50%, -50%) scale(1.04) rotate(3deg)', opacity: 0 },
      ],
      { duration: 360, easing: 'ease-out' },
    ).then(() => star.remove());
    // The lines rush in (shrinking from their full size, so they stay on
    // the stage).
    const lines = spark('fx-impact', landed, { '--size': `${Math.round(Math.min(size * 1.45, (landed.y - 2) * 2, (Math.min(x, width - x) - 2) * 2))}px` });
    lines.innerHTML = IMPACT_LINES;
    animate(
      lines,
      [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(0.92)', opacity: 0.95, offset: 0.3 },
        { transform: 'translate(-50%, -50%) scale(0.7)', opacity: 0 },
      ],
      { duration: 320, easing: 'ease-out' },
    ).then(() => lines.remove());
    // Driven down into the ground and springing back, over the blow's own
    // jolt.
    animate(
      card,
      [
        { transform: 'translateY(0px) scale(1, 1)' },
        { transform: 'translateY(8px) scale(1.05, 0.88)', offset: 0.18 },
        { transform: 'translateY(-2px) scale(0.99, 1.02)', offset: 0.55 },
        { transform: 'translateY(0px) scale(1, 1)' },
      ],
      { duration: 460, easing: 'ease-out', composite: 'add' },
    );
    // Dust billowing out along the ground on both sides.
    for (const angle of [0, Math.PI]) {
      particles.burst({ x: foot.x, y: foot.y, count: 8, colors: DUST, angle, spread: 0.2, speed: [90, 230], life: [560, 900], size: [5, 9], shape: 'dust', gravity: -14, drag: 2.4 });
    }
    particles.burst({ x: foot.x, y: foot.y, area: { width: figure * 0.6, height: 4 }, count: 12, colors: STONE, angle: -Math.PI / 2, spread: 1.3, speed: [90, 220], life: [360, 640], size: [1.6, 2.8], shape: 'shard', gravity: 640, drag: 1 });
    shake(3.5, 380);
  }

  // 962: a foe a heavy blow stunned (Druzgocący, Kruszący and Miażdżący
  // cios, Trzęsienie ziemi): stars circle its head a moment.
  function daze(event) {
    const look = lookOf(event);
    const entry = cards.get(event.target);
    // (963: the Sąd's paralysis: holy chains.)
    if (look.chained) {
      chained(event);
      return;
    }
    // (The Gromowładny's lightning: the stunned foe crackles.)
    if (look.jolted) {
      jolt(event);
      return;
    }
    if (!look.dazed || !entry || reduced() || !particles) return;
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const x = art.x + art.width / 2;
    const y = art.y + Math.max(10, art.height * 0.15);
    const across = figure * 0.4;
    const deep = figure * 0.11;
    const size = Math.round(Math.max(15, figure * 0.22));
    for (let k = 0; k < 3; k++) {
      const star = spark('fx-dazestar', { x, y }, { '--size': `${size}px` });
      star.innerHTML = DAZE_STAR;
      const frames = Array.from({ length: 25 }, (_, step) => {
        const angle = (step / 24) * Math.PI * 3 + (k * Math.PI * 2) / 3;
        const front = Math.sin(angle);
        return {
          transform: `translate(calc(-50% + ${(Math.cos(angle) * across).toFixed(1)}px), calc(-50% + ${(front * deep).toFixed(1)}px)) scale(${(0.78 + front * 0.22).toFixed(2)})`,
          opacity: step === 0 || step === 24 ? 0 : 1,
        };
      });
      animate(star, frames, { duration: 1300, easing: 'linear' }).then(() => star.remove());
    }
  }

  // 962: the Krwawy szał: the Barbarzyńca's rage: its card throbs like a
  // heart, its figure flares blood-red with each beat, red steam and
  // embers rise off it and the arena reddens for a moment.
  async function frenzy(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await Promise.all([ring(id, color, 130, 760), aura(id, color, 2)]);
      return;
    }
    const card = entry.card;
    const art = artOf(card);
    const figure = figureOf(art);
    const x = art.x + art.width / 2;
    // Two heartbeats, each a double thump: the card swells, red light
    // fills it and the figure's outline glows blood-red.
    const beats = [0.08, 0.16, 0.23, 0.36, 0.48, 0.56, 0.63, 0.78];
    const strength = [1, 0.35, 0.8, 0.25, 1, 0.35, 0.8, 0.15];
    const swell = (k) => (k % 2 ? 'scale(1)' : `scale(${(1 + strength[k] * 0.06).toFixed(3)})`);
    animate(card, [{ transform: 'scale(1)' }, ...beats.map((offset, k) => ({ transform: swell(k), offset })), { transform: 'scale(1)' }], { duration: 1250, easing: 'ease-in-out', composite: 'add' });
    tintCard(card, '#d9342b', [{ opacity: 0 }, ...beats.map((offset, k) => ({ opacity: strength[k] * 0.6, offset })), { opacity: 0 }], 1250);
    const figureArt = card.querySelector('.unit-art img, .unit-art svg, .unit-icon');
    if (figureArt) {
      const glow = (share) => `drop-shadow(0 0 ${(1 + share * 4).toFixed(1)}px rgba(255, 46, 30, ${(0.25 + share * 0.75).toFixed(2)})) brightness(${(1 + share * 0.18).toFixed(2)}) saturate(${(1 + share * 0.35).toFixed(2)})`;
      animate(figureArt, [{ filter: glow(0) }, ...beats.map((offset, k) => ({ filter: glow(strength[k]), offset })), { filter: 'drop-shadow(0 0 1px rgba(255, 46, 30, 0)) brightness(1) saturate(1)' }], { duration: 1250, easing: 'ease-in-out' });
    }
    // Steam and red embers rising off it with each beat.
    const mark = anchor(1300);
    for (const [delay, count] of [
      [60, 8],
      [580, 8],
      [900, 3],
    ]) {
      after(delay, mark, () => {
        particles.burst({ x, y: art.y + art.height * 0.5, area: { width: figure * 0.75, height: art.height * 0.5 }, count, colors: STEAM, angle: -Math.PI / 2, spread: 0.4, speed: [24, 60], gravity: -50, drag: 1.2, life: [600, 950], size: [3, 5.5], shape: 'dust' });
        particles.burst({ x, y: art.y + art.height * 0.6, area: { width: figure * 0.7, height: art.height * 0.4 }, count: Math.ceil(count * 0.8), colors: RAGE, angle: -Math.PI / 2, spread: 0.6, speed: [30, 90], gravity: -40, drag: 1.5, life: [420, 760], size: [1.2, 2.2], shape: 'ember' });
      });
    }
    after(60, mark, () => flash('#b3263b', 0.13, 420));
    after(600, mark, () => flash('#b3263b', 0.1, 380));
    await wait(1250);
  }

  // A foe a blade of a sweep went through: it flashes white, sparks fly
  // on along the blade's way.
  function bladeThrough(entry, angle, colors = STEEL) {
    const point = figurePoint(entry.card, 0.5);
    particles.burst({ x: point.x, y: point.y, count: 10, colors, angle, spread: 0.55, speed: [160, 320], life: [180, 340], size: [1.2, 2.2], shape: 'spark', drag: 3.5 });
    animate(entry.card, [{ filter: 'brightness(2.2)' }, { filter: 'brightness(1)' }], { duration: 260, easing: 'ease-out' });
  }

  // The Gladiator's own blade (the icon of its weapon, else a sword drawn)
  // held at its grip at the middle of a box that turns, its point out
  // `reach` from it, with the blur of its swing behind it (`trail`).
  function heldBlade(unit, reach, trail) {
    const arm = spark('fx-millarm', { x: 0, y: 0 });
    if (trail) {
      // Two arcs behind the blade (it turns clockwise), the nearer
      // brighter.
      const r = reach * 0.78;
      const point = (deg) => `${(Math.cos((deg * Math.PI) / 180) * r).toFixed(1)} ${(Math.sin((deg * Math.PI) / 180) * r).toFixed(1)}`;
      const box = Math.ceil(reach + 6);
      arm.insertAdjacentHTML(
        'beforeend',
        `<svg class="fx-millarm-trail" width="${box * 2}" height="${box * 2}" viewBox="${-box} ${-box} ${box * 2} ${box * 2}" aria-hidden="true"><g fill="none" stroke-linecap="round">` +
          `<path d="M${point(-130)}A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${point(-60)}" stroke="#ffffff" stroke-width="${(reach * 0.16).toFixed(1)}" opacity="0.22"/>` +
          `<path d="M${point(-64)}A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${point(-6)}" stroke="#ffffff" stroke-width="${(reach * 0.22).toFixed(1)}" opacity="0.5"/></g></svg>`,
      );
      arm.lastElementChild.style.left = `${-box}px`;
      arm.lastElementChild.style.top = `${-box}px`;
    }
    const picture = itemSprite({ base: unit.weapon ?? 'sword' });
    if (picture) {
      // The icon's blade, from its grip to its point, is about as long as
      // the icon is wide.
      const size = Math.round(reach);
      picture.removeAttribute('width');
      picture.removeAttribute('height');
      picture.className = 'fx-millarm-weapon';
      picture.style.width = `${size}px`;
      picture.style.height = `${size}px`;
      picture.style.left = `${(-ICON_GRIP[0] * size).toFixed(1)}px`;
      picture.style.top = `${(-ICON_GRIP[1] * size).toFixed(1)}px`;
      picture.style.transformOrigin = `${(ICON_GRIP[0] * size).toFixed(1)}px ${(ICON_GRIP[1] * size).toFixed(1)}px`;
      picture.style.transform = 'rotate(45deg)';
      arm.append(picture);
    } else {
      const sword = h('span', { class: 'fx-millarm-sword' });
      sword.style.width = `${Math.round(reach * 1.1)}px`;
      sword.innerHTML = SWORD;
      arm.append(sword);
    }
    return arm;
  }

  // 962: the Młyn: the Gladiator spins with its weapon like a millstone:
  // its own blade circles its figure in a blur inside a turning ring of
  // steel, and the ring goes out from it wide across the foes; each one it
  // passes grinds against it in orange sparks, flashes and loses flakes of
  // its armour.
  async function millstone(event, color, targets) {
    const entry = cards.get(event.actor);
    const foes = targets.map((id) => cards.get(id)).filter(Boolean);
    if (!entry || foes.length === 0 || reduced() || !particles) {
      await arc(color);
      return;
    }
    const card = entry.card;
    const art = artOf(card);
    const figure = figureOf(art);
    const middle = figurePoint(card, 0.5);
    const reach = Math.round(figure * 0.68);
    // The blade circling, one and a half turns, with two fading copies.
    const spin = 640;
    const turn = (deg) => `translate(${middle.x.toFixed(1)}px, ${middle.y.toFixed(1)}px) rotate(${deg}deg)`;
    const arms = [0, 38, 76].map((delay, index) => {
      const arm = heldBlade(entry.unit, reach, index === 0);
      arm.style.opacity = '0';
      const fade = [1, 0.42, 0.18][index];
      return animate(
        arm,
        [
          { transform: turn(-40), opacity: 0 },
          { transform: turn(40), opacity: fade, offset: 0.12 },
          { transform: turn(440), opacity: fade, offset: 0.82 },
          { transform: turn(500), opacity: 0 },
        ],
        { duration: spin, delay, easing: 'cubic-bezier(0.45, 0.05, 0.55, 0.95)', fill: 'backwards' },
      ).then(() => arm.remove());
    });
    // The ring turning round it as it spins, then going out across the
    // foes, past the farthest.
    const points = foes.map((foe) => figurePoint(foe.card, 0.5));
    const far = Math.max(...points.map((point) => Math.hypot(point.x - middle.x, point.y - middle.y))) + figure * 0.6;
    const ring = spark('fx-millring', middle);
    ring.innerHTML = MILL_RING;
    const across = (radius) => `${Math.round(radius * 2)}px`;
    const out = 560;
    const start = 300;
    const near = reach * 1.02;
    animate(
      ring,
      [
        { width: across(near * 0.7), transform: 'translate(-50%, -50%) rotate(0deg)', opacity: 0 },
        { width: across(near), transform: 'translate(-50%, -50%) rotate(140deg)', opacity: 0.95, offset: 0.2 },
        { width: across(near), transform: 'translate(-50%, -50%) rotate(300deg)', opacity: 0.95, offset: start / (start + out) },
        { width: across(far), transform: 'translate(-50%, -50%) rotate(560deg)', opacity: 0.85, offset: 0.94 },
        { width: across(far * 1.03), transform: 'translate(-50%, -50%) rotate(580deg)', opacity: 0 },
      ],
      { duration: (start + out) / 0.94, easing: 'linear' },
    ).then(() => ring.remove());
    // Each foe its blow reaches, as the ring passes it.
    const hit = reached(event, targets);
    foes.forEach((foe, index) => {
      if (!hit.includes(foe.unit.id)) return;
      const point = points[index];
      const distance = Math.hypot(point.x - middle.x, point.y - middle.y);
      const away = Math.atan2(point.y - middle.y, point.x - middle.x);
      const share = Math.max(0, (distance - near) / (far - near));
      after(start + share * out * 0.94, ring, () => {
        animate(foe.card, [{ filter: 'brightness(2.1)' }, { filter: 'brightness(1)' }], { duration: 280, easing: 'ease-out' });
        for (const side of [-1, 1]) {
          particles.burst({ x: point.x, y: point.y, count: 9, colors: ['#ffffff', '#fff1c9', '#ffd27a', '#ff9a4d'], angle: away + side * Math.PI * 0.5, spread: 0.45, speed: [150, 300], life: [220, 420], size: [1.1, 2.1], shape: 'spark', drag: 3, gravity: 320 });
        }
        particles.burst({ x: point.x, y: point.y, count: 7, colors: PLATES, angle: away, spread: 0.9, speed: [70, 170], life: [380, 640], size: [1.6, 2.6], shape: 'shard', gravity: 520, drag: 1.4 });
      });
    });
    await Promise.all([...arms, wait(start + out + 120)]);
  }

  // 962: the Riposta at the fight's start: the Gladiator takes its guard: a
  // gleam runs along its blade, across its card, and two arcs of steel
  // close round its figure on both sides and hold a moment: whatever
  // comes, it is parried.
  async function enGarde(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await aura(id, color, 1);
      return;
    }
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const middle = figurePoint(entry.card, 0.5);
    const gleam = spark('fx-gleam', middle, { '--size': `${Math.round(figure * 1.25)}px` });
    animate(
      gleam,
      [
        { transform: 'translate(-50%, -50%) rotate(-38deg) translateX(-55%) scaleX(0.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) rotate(-38deg) translateX(0%) scaleX(1)', opacity: 1, offset: 0.45 },
        { transform: 'translate(-50%, -50%) rotate(-38deg) translateX(55%) scaleX(0.3)', opacity: 0 },
      ],
      { duration: 520, easing: 'ease-in-out' },
    ).then(() => gleam.remove());
    after(300, gleam, () => twinkle({ x: middle.x + figure * 0.3, y: middle.y - figure * 0.24 }, '#ffffff', figure * 0.32));
    // The two arcs of its guard, one on each side of its figure.
    const size = Math.round(Math.min(figure * 1.3, entry.card.offsetWidth * 1.02));
    for (const side of [-1, 1]) {
      const guard = spark('fx-parry', middle, { '--fx': color, '--size': `${size}px` });
      guard.innerHTML = PARRY_ARC;
      const turn = side * 90;
      animate(
        guard,
        [
          { transform: `translate(-50%, -50%) rotate(${turn + side * 70}deg) scale(0.85)`, opacity: 0 },
          { transform: `translate(-50%, -50%) rotate(${turn}deg) scale(1)`, opacity: 1, offset: 0.28, easing: 'ease-out' },
          { transform: `translate(-50%, -50%) rotate(${turn}deg) scale(1)`, opacity: 0.95, offset: 0.72 },
          { transform: `translate(-50%, -50%) rotate(${turn}deg) scale(1.1)`, opacity: 0 },
        ],
        { duration: 1000, delay: 180, easing: 'ease-in-out', fill: 'backwards' },
      ).then(() => guard.remove());
      after(460, gleam, () => twinkle({ x: middle.x + side * size * 0.38, y: middle.y - size * 0.14 }, '#ffffff', 12));
    }
    after(360, gleam, () => aura(id, color, 1));
    await wait(1000);
  }

  // 962: the Riposta's counter, before its blow: steel rings on steel where
  // the Gladiator caught the foe's blow: a white flash at its side, sparks
  // spraying off it and its blade's arc sweeping the blow aside.
  function parry(event, color) {
    const actor = cards.get(event.actor);
    const foe = cards.get(event.target);
    if (!actor || !foe || reduced() || !particles) return;
    const art = artOf(actor.card);
    const figure = figureOf(art);
    const middle = figurePoint(actor.card, 0.48);
    const to = centerOf(foe.card);
    // On its side toward the foe (its right, with the foe straight ahead).
    const side = to.x < middle.x - 4 ? -1 : 1;
    const point = { x: middle.x + side * figure * 0.34, y: middle.y };
    twinkle(point, '#ffffff', figure * 0.6);
    const flare = spark('fx-burst', point, { '--fx': '#fff1c9', '--size': `${Math.round(figure * 0.75)}px` });
    animate(
      flare,
      [
        { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, -50%) scale(1.25)', opacity: 0 },
      ],
      { duration: 320, easing: 'ease-out' },
    ).then(() => flare.remove());
    for (const way of [-1, 1]) {
      particles.burst({ x: point.x, y: point.y, count: 8, colors: ['#ffffff', '#fff1c9', '#ffd27a'], angle: side > 0 ? way * 0.9 : Math.PI - way * 0.9, spread: 0.45, speed: [150, 300], life: [200, 380], size: [1.1, 2], shape: 'spark', drag: 3, gravity: 260 });
    }
    const sweep = spark('fx-parry', middle, { '--fx': color, '--size': `${Math.round(figure * 1.15)}px` });
    sweep.innerHTML = PARRY_ARC;
    const turn = side * 90;
    animate(
      sweep,
      [
        { transform: `translate(-50%, -50%) rotate(${turn - side * 50}deg) scale(0.9)`, opacity: 0 },
        { transform: `translate(-50%, -50%) rotate(${turn}deg) scale(1)`, opacity: 1, offset: 0.35 },
        { transform: `translate(-50%, -50%) rotate(${turn + side * 45}deg) scale(1.05)`, opacity: 0 },
      ],
      { duration: 320, easing: 'ease-out' },
    ).then(() => sweep.remove());
  }

  // 962: the Riposta's counter lands: a thin fast cut across the foe, a red
  // flash in it and blood running from it (the bleeding it leaves).
  function counterCut(event, color) {
    const target = cards.get(event.target);
    const actor = cards.get(event.actor);
    if (!target) return;
    if (!actor || reduced() || !particles) {
      burst(event.target, color, 60);
      return;
    }
    const art = artOf(target.card);
    const figure = figureOf(art);
    const wound = figurePoint(target.card, 0.52);
    const from = centerOf(actor.card);
    const way = Math.atan2(wound.y - from.y, wound.x - from.x);
    const turn = (way * 180) / Math.PI + 90 + (Math.cos(way) >= 0 ? -32 : 32);
    cutAt(wound, turn, figure * 1.25, '#e8462f', { duration: 380, bend: 4, width: 0.9 });
    const flare = spark('fx-burst', wound, { '--fx': '#d9534f', '--size': `${Math.round(figure * 0.5)}px` });
    animate(
      flare,
      [
        { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.9, offset: 0.25 },
        { transform: 'translate(-50%, -50%) scale(1.25)', opacity: 0 },
      ],
      { duration: 360, easing: 'ease-out' },
    ).then(() => flare.remove());
    bleed(target.card, wound, way, { count: 10, drips: 2 });
  }

  // 962: the Niezłomny: the Strażnik digs its feet in (a golden ring opens
  // on the ground, dust flies) and its card bristles with golden spikes
  // all round, turned against the foes' blows, which then draw back into
  // a golden glow.
  async function thorns(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await flashAround(id, color);
      return;
    }
    const card = entry.card;
    const box = boxOf(card);
    const middle = figurePoint(card, 0.55);
    groundRing(id, color, { scale: 1.15, duration: 700 });
    for (const angle of [0, Math.PI]) {
      particles.burst({ x: middle.x, y: box.y + box.height - 8, count: 5, colors: DUST, angle, spread: 0.2, speed: [70, 150], life: [480, 760], size: [3.5, 6], shape: 'dust', gravity: -12, drag: 2.4 });
    }
    shake(2.2, 280);
    // Shorter spikes on a side near the stage's edge, so none is cut off.
    const fit = (room) => Math.max(4, Math.min(SPIKE_REACH, room - 4));
    const reach = { top: fit(box.y), right: fit(stageWidth() - box.x - box.width), bottom: fit(stageHeight() - box.y - box.height), left: fit(box.x) };
    const frame = spark('fx-thorns', { x: box.x - reach.left - 3, y: box.y - reach.top - 3 }, { '--fx': color });
    frame.style.transformOrigin = `${(reach.left + 3 + box.width / 2).toFixed(1)}px ${(reach.top + 3 + box.height / 2).toFixed(1)}px`;
    frame.innerHTML = spikedFrame(box.width, box.height, reach);
    animate(
      frame,
      [
        { transform: 'scale(0.9)', opacity: 0 },
        { transform: 'scale(1.015)', opacity: 1, offset: 0.14, easing: 'cubic-bezier(0.25, 0.8, 0.4, 1)' },
        { transform: 'scale(1)', opacity: 1, offset: 0.24 },
        { transform: 'scale(1)', opacity: 0.95, offset: 0.74 },
        { transform: 'scale(0.96)', opacity: 0 },
      ],
      { duration: 1200, delay: 100, easing: 'ease-out', fill: 'backwards' },
    ).then(() => frame.remove());
    after(330, frame, () => {
      for (const [k, [sx, sy]] of [
        [0, 0],
        [1, 0.35],
        [0.12, 1],
      ].entries()) {
        twinkle({ x: inside(box.x + box.width * sx + (sx > 0.5 ? 6 : -6), 8, stageWidth()), y: inside(box.y + box.height * sy + (sy > 0.5 ? 6 : -6), 8, stageHeight()) }, '#fff6cf', 14, k * 80);
      }
      particles.burst({ x: middle.x, y: middle.y, area: { width: box.width, height: box.height }, count: 14, colors: GOLD, speed: [60, 150], life: [300, 560], size: [1.1, 2], shape: 'spark', drag: 3 });
      rimGlow(card, color, 760);
    });
    await wait(1150);
  }

  // A dashed line curving from one point to another (bent toward the
  // stage's middle by `bend`), its dashes running on toward the second.
  function aggroLine(from, to, bend, color, delay, duration) {
    const width = stageWidth();
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    let normal = { x: -dy / length, y: dx / length };
    if (normal.x * (width / 2 - middle.x) < 0) normal = { x: -normal.x, y: -normal.y };
    const control = { x: Math.min(Math.max(middle.x + normal.x * bend, 10), width - 10), y: middle.y + normal.y * bend };
    const x0 = Math.min(from.x, to.x, control.x) - 6;
    const y0 = Math.min(from.y, to.y, control.y) - 6;
    const w = Math.ceil(Math.max(from.x, to.x, control.x) + 6 - x0);
    const hgt = Math.ceil(Math.max(from.y, to.y, control.y) + 6 - y0);
    const at = (point) => `${(point.x - x0).toFixed(1)} ${(point.y - y0).toFixed(1)}`;
    const line = spark('fx-aggro', { x: x0, y: y0 }, { '--fx': color });
    line.innerHTML = `<svg width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}" aria-hidden="true"><path d="M${at(from)}Q${at(control)} ${at(to)}"/></svg>`;
    const path = line.querySelector('path');
    animate(path, [{ strokeDashoffset: 0 }, { strokeDashoffset: -72 }], { duration, delay, easing: 'linear', fill: 'both' });
    return animate(line, [{ opacity: 0 }, { opacity: 1, offset: 0.16 }, { opacity: 1, offset: 0.78 }, { opacity: 0 }], { duration, delay, easing: 'ease-out', fill: 'backwards' }).then(() => line.remove());
  }

  // 962: the Wyzwanie: the Strażnik strikes its shield (a clang of light on
  // it and its rings rolling out), every foe turns to it (a red "!" over
  // each) and a red line runs from every foe to it; its card glows red
  // while all eyes are on it.
  async function taunt(event, color) {
    const entry = cards.get(event.actor);
    if (!entry) return;
    if (reduced() || !particles) {
      await Promise.all([ring(event.actor, color, 130, 760), aura(event.actor, color, 2)]);
      return;
    }
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const middle = figurePoint(entry.card, 0.5);
    twinkle(middle, '#ffffff', figure * 0.7);
    particles.burst({ x: middle.x, y: middle.y, count: 14, colors: ['#ffffff', '#ffe08a', color], speed: [140, 300], life: [220, 420], size: [1.1, 2.1], shape: 'spark', drag: 3 });
    shake(2, 240);
    for (const [k, delay] of [0, 150].entries()) {
      const wave = spark('fx-ring', middle, { '--fx': k ? '#e8462f' : '#ffe08a', '--size': `${Math.round(figure * (2.4 + k * 0.6))}px` });
      animate(
        wave,
        [
          { transform: 'translate(-50%, -50%) scale(0.25)', opacity: 0.95 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
        ],
        { duration: 600, delay, easing: 'ease-out', fill: 'backwards' },
      ).then(() => wave.remove());
    }
    const mark = anchor(1300);
    const foes = foesOf(entry);
    // The farther a foe, the wider its line bends, so they do not run over
    // one another.
    const far = (foe) => Math.hypot(centerOf(foe.card).x - middle.x, centerOf(foe.card).y - middle.y);
    const nearer = [...foes].sort((a, b) => far(a) - far(b));
    foes.forEach((foe, index) => {
      const delay = 240 + index * 110;
      const head = artOf(foe.card);
      const size = figureOf(head);
      const alert = spark('fx-alert', { x: head.x + head.width / 2 + size * 0.34, y: head.y + head.height * 0.3 }, { '--size': `${Math.round(Math.max(10, size * 0.17))}px` });
      alert.innerHTML = ALERT;
      animate(
        alert,
        [
          { transform: 'translate(-50%, -50%) translateY(6px) scale(0.3)', opacity: 0 },
          { transform: 'translate(-50%, -50%) translateY(-3px) scale(1.25)', opacity: 1, offset: 0.14, easing: 'ease-out' },
          { transform: 'translate(-50%, -50%) translateY(0px) scale(1)', opacity: 1, offset: 0.24 },
          { transform: 'translate(-50%, -50%) translateY(0px) scale(1)', opacity: 1, offset: 0.8 },
          { transform: 'translate(-50%, -50%) translateY(-4px) scale(1)', opacity: 0 },
        ],
        { duration: 1000, delay, easing: 'ease-in-out', fill: 'backwards' },
      ).then(() => alert.remove());
      const from = figurePoint(foe.card, 0.45);
      aggroLine(from, middle, Math.hypot(middle.x - from.x, middle.y - from.y) * (0.1 + nearer.indexOf(foe) * 0.17), '#e8462f', delay + 100, 950);
      after(delay, mark, () => rimGlow(foe.card, '#e8462f', 520));
    });
    after(620, mark, () => {
      rimGlow(entry.card, '#e8462f', 900);
      tintCard(entry.card, '#e8462f', [{ opacity: 0 }, { opacity: 0.35, offset: 0.25 }, { opacity: 0 }], 900);
    });
    await wait(1300);
  }

  // 962: the Kruszący cios: the blow goes through the foe's armour: red-hot
  // cracks run over it, it bursts into plates of steel thrown off with
  // sparks, and the foe flares red.
  function shatter(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 90);
      ring(event.target, color, 110, 420);
      return;
    }
    const card = entry.card;
    const art = artOf(card);
    const figure = figureOf(art);
    const middle = figurePoint(card, 0.5);
    const actor = cards.get(event.actor);
    const from = actor ? centerOf(actor.card) : { x: middle.x, y: middle.y + 100 };
    const way = Math.atan2(middle.y - from.y, middle.x - from.x);
    glassCracks(entry, art, figure, HOT_CRACKS, 0, 620, 'fx-hotcrack');
    burst(event.target, '#ff7a5c', Math.round(figure * 1.2));
    const mark = anchor(900);
    after(110, mark, () => {
      PLATE_ART.concat(PLATE_ART).forEach((art0, index) => {
        const plate = spark('fx-plate', middle, { '--size': `${Math.round(Math.max(14, figure * 0.28))}px` });
        plate.innerHTML = art0;
        const angle = way + (index - 2.5) * 0.62 + (index % 2 ? 0.2 : -0.2);
        const far = figure * (0.55 + (index % 3) * 0.14);
        const dx = Math.cos(angle) * far;
        const dy = Math.sin(angle) * far * 0.8;
        const spin = (index % 2 ? 1 : -1) * (200 + index * 40);
        animate(
          plate,
          [
            { transform: 'translate(-50%, -50%) rotate(0deg) scale(0.6)', opacity: 1 },
            { transform: `translate(calc(-50% + ${(dx * 0.7).toFixed(1)}px), calc(-50% + ${(dy * 0.7 - figure * 0.12).toFixed(1)}px)) rotate(${spin * 0.5}deg) scale(1)`, opacity: 1, offset: 0.45 },
            { transform: `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${(dy + figure * 0.32).toFixed(1)}px)) rotate(${spin}deg) scale(0.9)`, opacity: 0 },
          ],
          { duration: 560, easing: 'cubic-bezier(0.2, 0.6, 0.5, 1)' },
        ).then(() => plate.remove());
      });
      particles.burst({ x: middle.x, y: middle.y, count: 16, colors: ['#ffffff', '#ffd27a', '#ff7a3d'], speed: [160, 340], life: [200, 420], size: [1.2, 2.3], shape: 'spark', drag: 3, gravity: 200 });
      particles.burst({ x: middle.x, y: middle.y, count: 10, colors: PLATES, angle: way, spread: 1.1, speed: [110, 260], life: [360, 620], size: [1.6, 2.8], shape: 'shard', gravity: 520, drag: 1.4 });
      ring(event.target, '#ff7a5c', Math.round(figure * 1.6), 440);
      animate(card, [{ filter: 'brightness(1.9) saturate(1.8) hue-rotate(-12deg)' }, { filter: 'brightness(1)' }], { duration: 520, easing: 'ease-out' });
    });
    shake(3.5, 360);
  }

  // 962: the Ryk berserkera: the Berserker roars: red waves of it roll out
  // from its head across the arena, which shakes; every foe is driven back
  // a step and dims, and the Berserker's card leans forward in a red glow.
  async function berserkRoar(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await Promise.all([ring(id, color, 130, 760), aura(id, color, 2)]);
      return;
    }
    const card = entry.card;
    const art = artOf(card);
    const figure = figureOf(art);
    const head = figurePoint(card, 0.34);
    const foes = foesOf(entry);
    const points = foes.map((foe) => centerOf(foe.card));
    const toward = points.length ? { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length } : { x: head.x, y: head.y - 200 };
    const angle = Math.atan2(toward.y - head.y, toward.x - head.x);
    const reach = Math.max(figure * 2, ...points.map((point) => Math.hypot(point.x - head.x, point.y - head.y) + figure * 0.6));
    const turn = (angle * 180) / Math.PI + 90;
    const size = Math.round(reach * 2);
    for (let k = 0; k < 4; k++) {
      const wave = spark('fx-ragewave', head, { '--fx': '#e8462f', '--size': `${size}px` });
      wave.innerHTML = RAGE_WAVE;
      animate(
        wave,
        [
          { transform: `translate(-50%, -50%) rotate(${turn.toFixed(1)}deg) scale(0.08)`, opacity: 0 },
          { transform: `translate(-50%, -50%) rotate(${turn.toFixed(1)}deg) scale(0.3)`, opacity: 1, offset: 0.2 },
          { transform: `translate(-50%, -50%) rotate(${turn.toFixed(1)}deg) scale(1)`, opacity: 0 },
        ],
        { duration: 760, delay: k * 120, easing: 'cubic-bezier(0.25, 0.5, 0.45, 1)', fill: 'backwards' },
      ).then(() => wave.remove());
    }
    // The Berserker leans into its roar, red-hot.
    const lean = { x: Math.cos(angle) * 6, y: Math.sin(angle) * 6 };
    animate(
      card,
      [
        { transform: 'translate(0px, 0px) scale(1)' },
        { transform: `translate(${(lean.x * -0.4).toFixed(1)}px, ${(lean.y * -0.4).toFixed(1)}px) scale(0.97)`, offset: 0.12 },
        { transform: `translate(${lean.x.toFixed(1)}px, ${lean.y.toFixed(1)}px) scale(1.07)`, offset: 0.3 },
        { transform: `translate(${lean.x.toFixed(1)}px, ${lean.y.toFixed(1)}px) scale(1.06)`, offset: 0.7 },
        { transform: 'translate(0px, 0px) scale(1)' },
      ],
      { duration: 1100, easing: 'ease-in-out', composite: 'add' },
    );
    tintCard(card, '#e8462f', [{ opacity: 0 }, { opacity: 0.5, offset: 0.25 }, { opacity: 0.4, offset: 0.6 }, { opacity: 0 }], 1100);
    particles.burst({ x: head.x, y: head.y, count: 10, colors: RAGE, angle, spread: 0.7, speed: [80, 200], life: [300, 560], size: [1.2, 2.2], shape: 'ember', drag: 2 });
    const mark = anchor(1300);
    after(120, mark, () => shake(4.5, 520));
    // Each foe is driven back a step and dims, as the roar reaches it.
    const width = stageWidth();
    foes.forEach((foe, index) => {
      const at = points[index];
      const far = Math.hypot(at.x - head.x, at.y - head.y);
      const away = Math.atan2(at.y - head.y, at.x - head.x);
      const box = boxOf(foe.card);
      const dx = Math.min(Math.max(Math.cos(away) * 12, 2 - box.x), width - 2 - box.x - box.width);
      const dy = Math.max(Math.sin(away) * 10, 2 - box.y);
      after(140 + (far / reach) * 420, mark, () => {
        animate(
          foe.card,
          [
            { transform: 'translate(0px, 0px)' },
            { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`, offset: 0.22 },
            { transform: `translate(${(dx * 0.8).toFixed(1)}px, ${(dy * 0.8).toFixed(1)}px)`, offset: 0.6 },
            { transform: 'translate(0px, 0px)' },
          ],
          { duration: 700, easing: 'ease-out', composite: 'add' },
        );
        animate(foe.card, [{ filter: 'brightness(1) saturate(1)' }, { filter: 'brightness(0.55) saturate(0.5)', offset: 0.25 }, { filter: 'brightness(0.8) saturate(0.8)', offset: 0.7 }, { filter: 'brightness(1) saturate(1)' }], { duration: 800, easing: 'ease-out' });
        const feet = boxOf(foe.card);
        particles.burst({ x: feet.x + feet.width / 2, y: feet.y + feet.height - 8, area: { width: feet.width * 0.6, height: 4 }, count: 5, colors: DUST, angle: away, spread: 0.6, speed: [30, 80], life: [450, 700], size: [3, 5], shape: 'dust', gravity: -10, drag: 2 });
      });
    });
    await wait(1200);
  }

  // 962: the Wir stali: the Czempion spins so fast that its steel blurs
  // into one disc of light round it, which flashes: in that one flash
  // lines of light run out to every foe and each is cut at the same
  // instant, and bleeds.
  async function whirl(event, color, targets) {
    const entry = cards.get(event.actor);
    const foes = targets.map((id) => cards.get(id)).filter(Boolean);
    if (!entry || foes.length === 0 || reduced() || !particles) {
      await arc(color);
      return;
    }
    const card = entry.card;
    const art = artOf(card);
    const figure = figureOf(art);
    const middle = figurePoint(card, 0.5);
    const width = stageWidth();
    const build = 440;
    // Its figure turns round faster and faster (the card's words stay).
    const figureArt = card.querySelector('.unit-art img, .unit-art svg, .unit-icon');
    if (figureArt) {
      const flips = [0, 0.3, 0.52, 0.68, 0.8, 0.89, 0.96, 1];
      animate(
        figureArt,
        flips.map((offset, k) => ({ transform: `scaleX(${k % 2 ? -1 : 1})`, offset })),
        { duration: build, easing: 'linear' },
      );
    }
    // The steel blurring into one disc of light round it.
    const size = Math.round(Math.min(figure * 1.5, (Math.min(middle.x, width - middle.x) - 2) * 2));
    const swirl = spark('fx-steelswirl', middle, { '--fx': color, '--size': `${size}px` });
    swirl.innerHTML = STEEL_SWIRL;
    animate(
      swirl,
      [
        { transform: 'translate(-50%, -50%) rotate(0deg) scale(0.7)', opacity: 0 },
        { transform: 'translate(-50%, -50%) rotate(300deg) scale(0.95)', opacity: 1, offset: 0.4 },
        { transform: 'translate(-50%, -50%) rotate(1100deg) scale(1)', opacity: 0.4 },
      ],
      { duration: build, easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)' },
    ).then(() => swirl.remove());
    const disc = spark('fx-steelblur', middle, { '--size': `${size}px` });
    animate(
      disc,
      [
        { transform: 'translate(-50%, -50%) rotate(0deg) scale(0.6)', opacity: 0 },
        { transform: 'translate(-50%, -50%) rotate(500deg) scale(0.95)', opacity: 0.85, offset: build / (build + 420) },
        { transform: 'translate(-50%, -50%) rotate(560deg) scale(1.3)', opacity: 1, offset: (build + 60) / (build + 420) },
        { transform: 'translate(-50%, -50%) rotate(620deg) scale(1.4)', opacity: 0 },
      ],
      { duration: build + 420, easing: 'linear' },
    ).then(() => disc.remove());
    // The flash: lines of light out to every foe, every one cut at once.
    const hit = reached(event, targets);
    after(build, disc, () => {
      flash('#ffffff', 0.3, 260);
      twinkle(middle, '#ffffff', size * 0.7);
      for (const foe of foes.filter((one) => hit.includes(one.unit.id))) {
        const point = figurePoint(foe.card, 0.5);
        const dx = point.x - middle.x;
        const dy = point.y - middle.y;
        const out = Math.atan2(dy, dx);
        const line = spark('fx-flashline', middle);
        line.style.width = `${Math.round(Math.hypot(dx, dy))}px`;
        const along = `rotate(${out.toFixed(4)}rad)`;
        animate(
          line,
          [
            { transform: `${along} scaleX(0.2)`, opacity: 1 },
            { transform: `${along} scaleX(1)`, opacity: 1, offset: 0.15 },
            { transform: `${along} scaleX(1) scaleY(0.4)`, opacity: 0 },
          ],
          { duration: 300, easing: 'ease-out' },
        ).then(() => line.remove());
        bladeThrough(foe, out + Math.PI / 2);
        cutAt(point, (out * 180) / Math.PI + 90 + 18, figureOf(artOf(foe.card)) * 1.15, '#e8462f', { duration: 380, bend: 5, width: 0.9 });
        bleed(foe.card, point, out, { count: 8, drips: 1 });
      }
    });
    await wait(build + 420);
  }

  // Where the way from one point to another leaves a box the first stands
  // in (a share of the way).
  function exitShare(box, from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    let share = 1;
    if (dx > 0) share = Math.min(share, (box.x + box.width - from.x) / dx);
    if (dx < 0) share = Math.min(share, (box.x - from.x) / dx);
    if (dy > 0) share = Math.min(share, (box.y + box.height - from.y) / dy);
    if (dy < 0) share = Math.min(share, (box.y - from.y) / dy);
    return Math.max(0, share);
  }

  // 962: the Pojedynek: the Czempion points its weapon at the strongest
  // foe: the arena dims but for the two of them (the crowd falls silent),
  // its blade points at the foe with a glint, a duelist's circle opens
  // under each, a golden line runs over the ground between them and in the
  // space between their cards two swords swing in and cross with a clash.
  async function duel(event, color) {
    const champion = cards.get(event.actor);
    const foe = cards.get(event.targets[0]);
    if (!champion || !foe || reduced() || !particles) {
      await aura(event.actor, color, 1);
      return;
    }
    const a = figurePoint(champion.card, 0.5);
    const b = figurePoint(foe.card, 0.5);
    const figure = figureOf(artOf(champion.card));
    const width = stageWidth();
    const dim = spark('fx-duelspot', { x: 0, y: 0 });
    dim.style.width = `${width}px`;
    dim.style.height = `${stageHeight()}px`;
    for (const [name, value] of Object.entries({ '--ax': a.x, '--ay': a.y, '--bx': b.x, '--by': b.y, '--r': figure * 0.85 })) dim.style.setProperty(name, `${value.toFixed(1)}px`);
    animate(dim, [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 2050, easing: 'ease-in-out' }).then(() => dim.remove());
    // The duelists' circles at their feet.
    [champion, foe].forEach((entry, index) => {
      const box = boxOf(entry.card);
      const x = box.x + box.width / 2;
      const size = Math.round(Math.min(box.width * 0.96, figureOf(artOf(entry.card)) * 1.45, (Math.min(x, width - x) - 2) * 2));
      const circle = spark('fx-circle', { x, y: box.y + box.height - 9 }, { '--fx': color, '--size': `${size}px` });
      circle.innerHTML = DUEL_CIRCLE;
      const flat = 'translate(-50%, -50%) scale(1, 0.36)';
      animate(
        circle,
        [
          { transform: `${flat} rotate(-40deg) scale(0.3)`, opacity: 0 },
          { transform: `${flat} rotate(0deg) scale(1)`, opacity: 1, offset: 0.2 },
          { transform: `${flat} rotate(20deg) scale(1)`, opacity: 1, offset: 0.78 },
          { transform: `${flat} rotate(28deg) scale(1.06)`, opacity: 0 },
        ],
        { duration: 1650, delay: 80 + index * 140, fill: 'backwards' },
      ).then(() => circle.remove());
    });
    // Its blade pointing at the foe, a glint on its point.
    const toward = Math.atan2(b.y - a.y, b.x - a.x);
    const length = Math.round(figure * 0.62);
    const blade = heldBlade(champion.unit, length, false);
    const pose = (push, scale) => `translate(${(a.x + Math.cos(toward) * push).toFixed(1)}px, ${(a.y + Math.sin(toward) * push).toFixed(1)}px) rotate(${((toward * 180) / Math.PI).toFixed(1)}deg) scale(${scale})`;
    blade.style.opacity = '0';
    animate(
      blade,
      [
        { transform: pose(-8, 0.8), opacity: 0 },
        { transform: pose(4, 1), opacity: 1, offset: 0.18, easing: 'ease-out' },
        { transform: pose(4, 1), opacity: 1, offset: 0.78 },
        { transform: pose(4, 1), opacity: 0 },
      ],
      { duration: 1150, delay: 40, fill: 'backwards' },
    ).then(() => blade.remove());
    const tip = { x: a.x + Math.cos(toward) * (length + 4), y: a.y + Math.sin(toward) * (length + 4) };
    after(260, blade, () => twinkle(tip, '#ffffff', 18));
    // The golden line on the ground between them (under their cards),
    // drawn from the Czempion.
    const from = centerOf(champion.card);
    const to = centerOf(foe.card);
    const ground = groundLayer(1900);
    const line = h('span', { class: 'fx-duelline' });
    line.style.left = `${from.x.toFixed(1)}px`;
    line.style.top = `${from.y.toFixed(1)}px`;
    line.style.setProperty('--fx', color);
    line.style.width = `${Math.round(Math.hypot(to.x - from.x, to.y - from.y))}px`;
    line.style.opacity = '0';
    ground.append(line);
    const along = `rotate(${Math.atan2(to.y - from.y, to.x - from.x).toFixed(4)}rad)`;
    animate(
      line,
      [
        { transform: `${along} scaleX(0)`, opacity: 0 },
        { transform: `${along} scaleX(1)`, opacity: 1, offset: 0.2 },
        { transform: `${along} scaleX(1)`, opacity: 0.95, offset: 0.8 },
        { transform: `${along} scaleX(1)`, opacity: 0 },
      ],
      { duration: 1600, delay: 200, easing: 'ease-out', fill: 'backwards' },
    ).then(() => line.remove());
    // The swords, in the space between their cards (on the line), once
    // the Czempion's call is fading.
    const leave = exitShare(boxOf(champion.card), from, to);
    const enter = 1 - exitShare(boxOf(foe.card), to, from);
    const share = leave < enter ? (leave + enter) / 2 : 0.5;
    const middle = { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
    const size = Math.round(Math.min(figure * 0.82, (Math.min(middle.x, width - middle.x) - 2) * 2));
    const sign = spark('fx-duelsign', middle, { '--fx': '#f2c14e', '--size': `${size}px` });
    sign.innerHTML = CROSSED_SWORDS;
    // (Once the Czempion's call over its card, in that space, is fading.)
    const swing = 880;
    const [left, right] = sign.querySelectorAll('.fx-duel-blade');
    animate(left, [{ transform: 'rotate(-100deg)' }, { transform: 'rotate(-34deg)', offset: 0.8 }, { transform: 'rotate(-40deg)' }], { duration: 300, delay: swing, easing: 'cubic-bezier(0.5, 0, 0.8, 0.6)', fill: 'both' });
    animate(right, [{ transform: 'rotate(100deg)' }, { transform: 'rotate(34deg)', offset: 0.8 }, { transform: 'rotate(40deg)' }], { duration: 300, delay: swing, easing: 'cubic-bezier(0.5, 0, 0.8, 0.6)', fill: 'both' });
    animate(
      sign,
      [
        { transform: 'translate(-50%, -50%) scale(0.8)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(0.9)', opacity: 1, offset: 0.08 },
        { transform: 'translate(-50%, -50%) scale(1.14)', opacity: 1, offset: 0.24 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.32 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.84 },
        { transform: 'translate(-50%, -50%) scale(1.05)', opacity: 0 },
      ],
      { duration: 1150, delay: swing - 60, easing: 'ease-out', fill: 'backwards' },
    ).then(() => sign.remove());
    after(swing + 240, sign, () => {
      twinkle({ x: middle.x, y: middle.y - size * 0.08 }, '#ffffff', size * 0.5);
      particles.burst({ x: middle.x, y: middle.y - size * 0.08, count: 12, colors: ['#ffffff', '#fff1c9', '#f2c14e'], speed: [120, 260], life: [200, 400], size: [1.1, 2], shape: 'spark', drag: 3, gravity: 160 });
      rimGlow(champion.card, color, 800);
      rimGlow(foe.card, color, 800);
    });
    // (The sign and the dimmed arena fade while the fight goes on.)
    await wait(swing + 560);
  }

  // 962: the Nieugięty: the Bastion's wounds close: red cuts open over its
  // figure and fill with gold, which seals them shining; a gleam of
  // polished steel runs over its card and a ring of light pushes out.
  async function seams(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await flashAround(id, color);
      return;
    }
    const card = entry.card;
    const art = artOf(card);
    const figure = figureOf(art);
    const x = art.x + art.width / 2;
    // Three wounds, near-parallel, one under another (never crossed).
    const wounds = [
      { dx: -0.16, dy: 0.3, turn: -28, length: 0.62 },
      { dx: 0.1, dy: 0.5, turn: -24, length: 0.74 },
      { dx: -0.04, dy: 0.72, turn: -32, length: 0.56 },
    ];
    const mark = anchor(1300);
    wounds.forEach((wound, index) => {
      const point = { x: x + wound.dx * figure, y: art.y + art.height * wound.dy };
      const seam = spark('fx-seam', point, { '--size': `${Math.round(figure * wound.length)}px` });
      seam.innerHTML =
        '<svg viewBox="-50 -10 100 20" aria-hidden="true"><g fill="none" stroke-linecap="round" stroke-linejoin="round">' +
        '<path class="fx-seam-glow" pathLength="100" d="M-46 2L-30 -2L-16 3L0 -1L14 3L30 -2L46 1" stroke-width="7"/>' +
        '<path class="fx-seam-core" pathLength="100" d="M-46 2L-30 -2L-16 3L0 -1L14 3L30 -2L46 1" stroke-width="3"/></g></svg>';
      for (const line of seam.querySelectorAll('path')) {
        line.setAttribute('stroke-dasharray', '100 100');
        line.setAttribute('stroke-dashoffset', '100');
        animate(line, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duration: 160, delay: index * 90, easing: 'ease-out', fill: 'both' });
      }
      // Red, then gold from 380 ms: sealed.
      animate(seam, [{ color: '#e8462f' }, { color: '#e8462f', offset: 0.3 }, { color: '#ffe08a', offset: 0.42 }, { color: '#ffe08a' }], { duration: 1150, fill: 'both' });
      animate(
        seam,
        [
          { transform: `translate(-50%, -50%) rotate(${wound.turn}deg) scale(1)`, opacity: 1 },
          { transform: `translate(-50%, -50%) rotate(${wound.turn}deg) scale(1)`, opacity: 1, offset: 0.36 },
          { transform: `translate(-50%, -50%) rotate(${wound.turn}deg) scale(1.08, 1.4)`, opacity: 1, offset: 0.44 },
          { transform: `translate(-50%, -50%) rotate(${wound.turn}deg) scale(1)`, opacity: 1, offset: 0.55 },
          { transform: `translate(-50%, -50%) rotate(${wound.turn}deg) scale(0.96, 0.6)`, opacity: 0 },
        ],
        { duration: 1150, easing: 'ease-in-out' },
      ).then(() => seam.remove());
      after(430 + index * 60, mark, () => {
        twinkle(point, '#fff6cf', 13);
        particles.burst({ x: point.x, y: point.y, area: { width: figure * wound.length * 0.8, height: 4 }, count: 6, colors: GOLD, angle: -Math.PI / 2, spread: 1, speed: [30, 90], life: [380, 640], size: [1, 1.8], shape: 'spark', drag: 2 });
      });
    });
    // The gleam of steel over its card, and the ring.
    after(500, mark, () => {
      const gleam = spark('fx-gleam fx-gleam--steel', figurePoint(card, 0.5), { '--size': `${Math.round(figure * 1.35)}px` });
      animate(
        gleam,
        [
          { transform: 'translate(-50%, -50%) rotate(-50deg) translateX(-55%) scaleX(0.4)', opacity: 0 },
          { transform: 'translate(-50%, -50%) rotate(-50deg) translateX(0%) scaleX(1)', opacity: 0.95, offset: 0.45 },
          { transform: 'translate(-50%, -50%) rotate(-50deg) translateX(55%) scaleX(0.4)', opacity: 0 },
        ],
        { duration: 480, easing: 'ease-in-out' },
      ).then(() => gleam.remove());
      ring(id, color, Math.round(figure * 1.9), 620);
      rimGlow(card, color, 800);
    });
    await wait(1200);
  }

  // 962: the Mur tarcz: the Bastion drives its shield into the ground and
  // the party's wall of shields comes down in front of it, shield by
  // shield from the Bastion out, each landing edge to edge with a thud and
  // dust; a gleam runs along the wall and the party's cards take its
  // glint. (The Bastion's card keeps its rim while the wall stands.)
  async function shieldWall(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await bubble(id, color);
      return;
    }
    const party = standing(entry.unit.side);
    const boxes = party.map((member) => boxOf(member.card));
    const ally = entry.unit.side === 'ally';
    // The wall stands on the party's front edge, toward the foes.
    const front = ally ? Math.min(...boxes.map((box) => box.y)) : Math.max(...boxes.map((box) => box.y + box.height));
    const firstRow = boxes.filter((box) => Math.abs((ally ? box.y : box.y + box.height) - front) < 4);
    const left = Math.min(...firstRow.map((box) => box.x));
    const right = Math.max(...firstRow.map((box) => box.x + box.width));
    const figure = figureOf(artOf(entry.card));
    const shieldWidth = Math.round(Math.min(40, Math.max(28, figure * 0.5)));
    const shieldHeight = Math.round(shieldWidth * 1.2);
    const count = Math.max(2, Math.ceil((right - left - shieldWidth) / (shieldWidth * 0.8)) + 1);
    const step = count > 1 ? (right - left - shieldWidth) / (count - 1) : 0;
    const own = boxOf(entry.card);
    const home = own.x + own.width / 2;
    // Its foot a little into the party's cards, so it stands before them.
    const foot = ally ? front + 9 : front - 9;
    const spots = Array.from({ length: count }, (_, k) => left + shieldWidth / 2 + k * step).sort((a, b) => Math.abs(a - home) - Math.abs(b - home));
    const ready = spots.length * 70 + 260;
    const mark = anchor(ready + 700);
    spots.forEach((x, order) => {
      const delay = order * 70;
      const shield = spark('fx-wallshield', { x, y: foot }, { '--fx': color, '--size': `${shieldWidth}px` });
      shield.innerHTML = WALL_SHIELD;
      const at = ally ? 'translate(-50%, -100%)' : 'translate(-50%, 0%)';
      animate(
        shield,
        [
          { transform: `${at} translateY(-26px) scale(1.2)`, opacity: 0 },
          { transform: `${at} translateY(0px) scale(1)`, opacity: 1, offset: 0.12, easing: 'ease-out' },
          { transform: `${at} translateY(0px) scale(1.04, 0.94)`, opacity: 1, offset: 0.16 },
          { transform: `${at} translateY(0px) scale(1)`, opacity: 1, offset: 0.22 },
          { transform: `${at} translateY(0px) scale(1)`, opacity: 1, offset: 0.82 },
          { transform: `${at} translateY(0px) scale(1)`, opacity: 0 },
        ],
        { duration: 1500 - delay * 0.5, delay, easing: 'ease-in', fill: 'backwards' },
      ).then(() => shield.remove());
      after(delay + 170, mark, () => {
        particles.burst({ x, y: foot, area: { width: shieldWidth, height: 3 }, count: 4, colors: DUST, angle: -Math.PI / 2, spread: 1.3, speed: [20, 70], life: [450, 700], size: [3, 5], shape: 'dust', gravity: -10, drag: 2 });
        if (order === 0) shake(3, 300);
      });
    });
    // The wall's gleam, from end to end, and the party's glint.
    after(ready, mark, () => {
      const gleam = spark('fx-wallgleam', { x: left, y: foot - (ally ? shieldHeight / 2 : -shieldHeight / 2) }, { '--size': `${shieldHeight}px` });
      gleam.style.width = `${Math.round(right - left)}px`;
      animate(
        gleam,
        [
          { backgroundPosition: '-60% 0', opacity: 0 },
          { backgroundPosition: '20% 0', opacity: 1, offset: 0.3 },
          { backgroundPosition: '160% 0', opacity: 0 },
        ],
        { duration: 560, easing: 'ease-in-out' },
      ).then(() => gleam.remove());
      party.forEach((member, index) => {
        rimGlow(member.card, color, 700, index * 60);
      });
      entry.card.classList.add('unit--shielded');
      entry.card.style.setProperty('--shield', color);
    });
    await wait(ready + 520);
  }

  // 962: the Miażdżący cios: a blow that crushes armour and bones: a red
  // blast on the foe, the arena shaking hard, and its force bursting out
  // of the foe's back in a spray of rubble toward the one behind it, which
  // it reaches too (arena-fx.js smashOn()).
  function smash(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 90);
      ring(event.target, color, 110, 420);
      return;
    }
    const card = entry.card;
    const art = artOf(card);
    const figure = figureOf(art);
    const middle = figurePoint(card, 0.5);
    if (event.pierced) {
      // The force carried on into the one behind.
      burst(event.target, '#ffb36b', Math.round(figure * 1.1));
      particles.burst({ x: middle.x, y: middle.y, count: 10, colors: STONE, speed: [90, 200], life: [360, 600], size: [1.6, 2.8], shape: 'shard', gravity: 520, drag: 1.2 });
      animate(card, [{ filter: 'brightness(1.7) sepia(0.4)' }, { filter: 'brightness(1)' }], { duration: 420, easing: 'ease-out' });
      shake(2.5, 300);
      return;
    }
    const actor = cards.get(event.actor);
    const from = actor ? centerOf(actor.card) : { x: middle.x, y: middle.y + 100 };
    const way = Math.atan2(middle.y - from.y, middle.x - from.x);
    const next = behindOf(card)[0];
    const goal = next ? centerOf(next) : null;
    const angle = goal ? Math.atan2(goal.y - middle.y, goal.x - middle.x) : way;
    const blast = spark('fx-explosion fx-explosion--smash', middle, { '--size': `${Math.round(figure * 1.5)}px` });
    animate(
      blast,
      [
        { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 1 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.95, offset: 0.3 },
        { transform: 'translate(-50%, -50%) scale(1.25)', opacity: 0 },
      ],
      { duration: 520, easing: 'ease-out' },
    ).then(() => blast.remove());
    ring(event.target, '#ffb36b', Math.round(figure * 1.7), 460);
    animate(
      card,
      [
        { transform: 'scale(1, 1)' },
        { transform: 'scale(1.08, 0.86)', offset: 0.16 },
        { transform: 'scale(0.98, 1.03)', offset: 0.5 },
        { transform: 'scale(1, 1)' },
      ],
      { duration: 420, easing: 'ease-out', composite: 'add' },
    );
    animate(card, [{ filter: 'brightness(2) sepia(0.5) saturate(2.4) hue-rotate(-18deg)' }, { filter: 'brightness(1)' }], { duration: 600, easing: 'ease-out' });
    // The force out of its back, toward the one behind.
    const exit = { x: middle.x + Math.cos(angle) * figure * 0.4, y: middle.y + Math.sin(angle) * figure * 0.4 };
    const cone = spark('fx-smashcone', exit, { '--size': `${Math.round(figure * 0.9)}px` });
    cone.style.width = `${Math.round(Math.min(goal ? Math.hypot(goal.x - exit.x, goal.y - exit.y) : figure * 1.4, figure * 2.2))}px`;
    const along = `translate(0, -50%) rotate(${angle.toFixed(4)}rad)`;
    animate(
      cone,
      [
        { transform: `${along} scaleX(0.1)`, opacity: 0 },
        { transform: `${along} scaleX(1)`, opacity: 0.95, offset: 0.35 },
        { transform: `${along} scaleX(1.05)`, opacity: 0 },
      ],
      { duration: 420, easing: 'ease-out' },
    ).then(() => cone.remove());
    particles.burst({ x: exit.x, y: exit.y, count: 16, colors: STONE, angle, spread: 0.35, speed: [200, 420], life: [300, 560], size: [1.6, 3], shape: 'shard', gravity: 380, drag: 1.4 });
    particles.burst({ x: exit.x, y: exit.y, count: 8, colors: PLATES, angle, spread: 0.5, speed: [160, 320], life: [300, 520], size: [1.4, 2.4], shape: 'shard', gravity: 420, drag: 1.4 });
    particles.burst({ x: exit.x, y: exit.y, count: 8, colors: DUST, angle, spread: 0.4, speed: [90, 200], life: [500, 800], size: [4, 7], shape: 'dust', gravity: -12, drag: 2.2 });
    particles.burst({ x: middle.x, y: middle.y, count: 14, colors: ['#ffffff', '#ffd27a', '#ff8a3d'], speed: [150, 320], life: [200, 400], size: [1.2, 2.3], shape: 'spark', drag: 3, gravity: 160 });
    flash('#ff8a3d', 0.16, 360);
    shake(6.5, 480);
  }

  // 962: the Rzeź: the Pogromca throws itself into the middle of the
  // horde: it lunges in, and red cuts rain on every foe, more of them the
  // deeper its own wounds, with sparks flying and the arena reddening.
  async function slaughter(event, color, targets) {
    const entry = cards.get(event.actor);
    const foes = targets.map((id) => cards.get(id)).filter(Boolean);
    if (!entry || foes.length === 0 || reduced() || !particles) {
      await arc(color);
      return;
    }
    const { now, max } = hpOf(entry);
    const fury = Math.min(1, Math.max(0, 1 - now / max));
    const cuts = 3 + Math.round(fury * 3);
    const from = centerOf(entry.card);
    const points = foes.map((foe) => figurePoint(foe.card, 0.5));
    const middle = { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length };
    const reach = { x: (middle.x - from.x) * 0.1, y: (middle.y - from.y) * 0.1 };
    animate(
      entry.card,
      [
        { transform: 'translate(0px, 0px) scale(1)' },
        { transform: `translate(${(-reach.x * 0.3).toFixed(1)}px, ${(-reach.y * 0.3).toFixed(1)}px) scale(0.96)`, offset: 0.15 },
        { transform: `translate(${reach.x.toFixed(1)}px, ${reach.y.toFixed(1)}px) scale(1.08)`, offset: 0.35 },
        { transform: `translate(${reach.x.toFixed(1)}px, ${reach.y.toFixed(1)}px) scale(1.06)`, offset: 0.7 },
        { transform: 'translate(0px, 0px) scale(1)' },
      ],
      { duration: 1000, easing: 'ease-in-out', composite: 'add' },
    );
    tintCard(entry.card, '#c0392b', [{ opacity: 0 }, { opacity: 0.45 + fury * 0.2, offset: 0.3 }, { opacity: 0 }], 1000);
    const mark = anchor(1300);
    after(120, mark, () => flash('#a3202a', 0.12 + fury * 0.1, 640));
    // (A foe that dodges the blow is not cut.)
    const hit = reached(event, targets);
    foes.forEach((foe, index) => {
      if (!hit.includes(foe.unit.id)) return;
      const point = points[index];
      const figure = figureOf(artOf(foe.card));
      // Each foe's cuts near-parallel, one way or the other (a cross is the
      // mark of a fallen unit).
      const lean = index % 2 ? 1 : -1;
      for (let k = 0; k < cuts; k++) {
        const delay = 160 + index * 70 + k * 85;
        const turn = lean * 32 + ((k * 7) % 11) - 5;
        const shift = (k - (cuts - 1) / 2) * figure * (0.8 / cuts);
        const across = { x: point.x - Math.sin((turn * Math.PI) / 180) * shift, y: point.y + Math.cos((turn * Math.PI) / 180) * shift };
        cutAt(across, turn, figure * (1 + (k % 2) * 0.15), k % 3 === 2 ? '#ff8a6a' : '#e8462f', { delay, duration: 360, bend: 6 * lean });
        after(delay, mark, () => {
          particles.burst({ x: across.x, y: across.y, count: 5, colors: ['#ffffff', '#ffd2c4', '#e8462f'], angle: (turn * Math.PI) / 180 + (k % 2 ? 0 : Math.PI), spread: 0.5, speed: [120, 260], life: [160, 320], size: [1, 2], shape: 'spark', drag: 3.5 });
          animate(foe.card, [{ filter: 'brightness(1.9) saturate(1.3)' }, { filter: 'brightness(1)' }], { duration: 200, easing: 'ease-out' });
        });
      }
      after(160 + index * 70 + cuts * 85, mark, () => particles.burst({ x: point.x, y: point.y, count: 8, colors: BLOOD, speed: [60, 150], gravity: 480, drag: 1.4, life: [340, 560], size: [1, 1.8], shape: 'drop' }));
    });
    await wait(160 + (foes.length - 1) * 70 + cuts * 85 + 300);
  }

  // The foes a sweep's blows reach (arena.js sweepOf()), of its targets.
  const reached = (event, targets) => (event.struck ? targets.filter((id) => event.struck.includes(id)) : targets);

  // 962: the Huragan stali: the Legenda spins round and its steel flies out
  // of it as a storm: swords whirl out of its card into a cyclone round the
  // foes, with its wind, cutting every one as they pass; at its second
  // turn it spins again and the storm whirls back the other way, faster
  // and denser.
  async function hurricane(event, color, targets) {
    const foes = targets.map((id) => cards.get(id)).filter(Boolean);
    const legend = cards.get(event.actor);
    if (!legend || foes.length === 0 || reduced() || !particles) {
      await arc(color);
      return;
    }
    const second = (event.turn ?? 1) > 1;
    // The Legenda spins round (its figure; the card's words stay), and its
    // steel blurs round it.
    const own = figurePoint(legend.card, 0.5);
    const figureArt = legend.card.querySelector('.unit-art img, .unit-art svg, .unit-icon');
    if (figureArt) {
      animate(
        figureArt,
        [0, 0.25, 0.5, 0.75, 1].map((offset, k) => ({ transform: `scaleX(${k % 2 ? -1 : 1})`, offset })),
        { duration: 320, easing: 'linear' },
      );
    }
    const blur = spark('fx-steelswirl', own, { '--fx': color, '--size': `${Math.round(figureOf(artOf(legend.card)) * 1.35)}px` });
    blur.innerHTML = STEEL_SWIRL;
    animate(
      blur,
      [
        { transform: 'translate(-50%, -50%) rotate(0deg) scale(0.7)', opacity: 0 },
        { transform: `translate(-50%, -50%) rotate(${second ? -260 : 260}deg) scale(1)`, opacity: 1, offset: 0.4 },
        { transform: `translate(-50%, -50%) rotate(${second ? -620 : 620}deg) scale(1.1)`, opacity: 0 },
      ],
      { duration: 420, easing: 'linear' },
    ).then(() => blur.remove());
    const boxes = foes.map((foe) => boxOf(foe.card));
    const art = artOf(foes[0].card);
    const figure = figureOf(art);
    const width = stageWidth();
    const left = Math.min(...boxes.map((box) => box.x));
    const right = Math.max(...boxes.map((box) => box.x + box.width));
    const top = Math.min(...boxes.map((box) => box.y));
    const bottom = Math.max(...boxes.map((box) => box.y + box.height));
    const middle = { x: (left + right) / 2, y: top + (bottom - top) * 0.45 };
    const bladeLength = Math.round(Math.max(38, figure * 0.64));
    const across = Math.min((right - left) / 2 + figure * 0.12, Math.min(middle.x, width - middle.x) - bladeLength * 0.5 - 2);
    const deep = Math.max(figure * 0.4, (bottom - top) * 0.36);
    const duration = second ? 860 : 980;
    const spin = second ? -1 : 1;
    const count = second ? 8 : 6;
    // The wind, turning with it.
    const gale = spark('fx-gale', middle, { '--fx': color });
    gale.style.width = `${Math.round(across * 2.1)}px`;
    gale.style.height = `${Math.round(deep * 2.1)}px`;
    gale.innerHTML = GALE;
    animate(
      gale,
      [
        { transform: 'translate(-50%, -50%) rotate(0deg) scale(0.6)', opacity: 0 },
        { transform: `translate(-50%, -50%) rotate(${spin * 120}deg) scale(1)`, opacity: 0.9, offset: 0.25 },
        { transform: `translate(-50%, -50%) rotate(${spin * 380}deg) scale(1.02)`, opacity: 0.8, offset: 0.75 },
        { transform: `translate(-50%, -50%) rotate(${spin * 500}deg) scale(1.1)`, opacity: 0 },
      ],
      { duration, easing: 'linear' },
    ).then(() => gale.remove());
    const steps = 20;
    const laps = second ? 1.4 : 1.15;
    // Out of the Legenda's card into the storm in the first fifth of their
    // flight, then round the foes.
    const join = 0.22;
    const swords = Array.from({ length: count }, (_, k) => {
      const blade = spark('fx-hblade', { x: 0, y: 0 }, { '--size': `${bladeLength}px` });
      blade.innerHTML = SWORD;
      blade.style.opacity = '0';
      const phase = (k / count) * Math.PI * 2;
      const lane = 0.78 + (k % 3) * 0.12;
      const points = Array.from({ length: steps + 1 }, (_, step) => {
        const share = step / steps;
        const angle = phase + spin * share * laps * Math.PI * 2;
        const ring = { x: middle.x + Math.cos(angle) * across * lane, y: middle.y + Math.sin(angle) * deep * lane, angle };
        const out = Math.min(1, share / join);
        const pull = 1 - (1 - out) * (1 - out);
        return { x: own.x + (ring.x - own.x) * pull, y: own.y + (ring.y - own.y) * pull, angle, out };
      });
      const frames = points.map((point, step) => {
        // Facing the way it flies: along its path out, then along the
        // storm's turn.
        const next = points[Math.min(steps, step + 1)];
        const prev = points[Math.max(0, step - 1)];
        const facing = (Math.atan2(next.y - prev.y, next.x - prev.x) * 180) / Math.PI;
        const near = point.out < 1 ? 0.7 + point.out * 0.3 : 0.82 + Math.sin(point.angle) * 0.18;
        return {
          transform: `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px) translate(-50%, -50%) rotate(${facing.toFixed(1)}deg) scale(${near.toFixed(2)})`,
          opacity: step === 0 || step === steps ? 0 : 1,
        };
      });
      return animate(blade, frames, { duration, delay: 60 + k * 22, easing: 'linear', fill: 'backwards' }).then(() => blade.remove());
    });
    // Each foe is cut as the storm sweeps it: twice in its first turn,
    // three times in its second.
    const mark = anchor(duration + 260);
    const passes = second ? [0.22, 0.48, 0.74] : [0.3, 0.66];
    const hit = reached(event, targets);
    foes.filter((foe) => hit.includes(foe.unit.id)).forEach((foe, index) => {
      const point = figurePoint(foe.card, 0.5);
      const side = Math.atan2(point.y - middle.y, point.x - middle.x);
      // The storm's way where it passes the foe (along its ellipse).
      const phase = Math.atan2((point.y - middle.y) / deep, (point.x - middle.x) / across);
      const way = Math.atan2(Math.cos(phase) * deep * spin, -Math.sin(phase) * across * spin);
      for (const share of passes) after(duration * share + index * 50, mark, () => bladeThrough(foe, way));
      // As the storm dies away it leaves its cut on the foe, along its
      // way, and the foe bleeds.
      after(duration + index * 40, mark, () => {
        cutAt(point, (way * 180) / Math.PI, figure * 1.1, '#e8462f', { duration: 340, bend: 5, width: 0.85 });
        bleed(foe.card, point, side, { count: 6, drips: 1 });
      });
    });
    after(duration * 0.3, mark, () => shake(second ? 3 : 2.2, 360));
    await Promise.all(swords);
  }

  // 962: the Wiwaty: the stands go wild: a garland of pennants swings down
  // over the party, flowers and gold coins are thrown in from the arena's
  // sides onto it, and every card of the party flares gold with the cheer.
  async function cheering(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    const party = standing(entry.unit.side);
    if (reduced() || !particles) {
      await Promise.all(party.map((member) => Promise.all([ring(member.unit.id, color, 130, 760), aura(member.unit.id, color, 1)])));
      return;
    }
    const width = stageWidth();
    const ally = entry.unit.side === 'ally';
    const boxes = party.map((member) => boxOf(member.card));
    const front = ally ? Math.min(...boxes.map((box) => box.y)) : Math.max(...boxes.map((box) => box.y + box.height));
    // The garland over the party's front edge, from one side of the arena
    // to the other.
    const span = width - 8;
    const sag = 10;
    const garland = spark('fx-garland', { x: 4, y: ally ? Math.max(2, front - sag - 26) : front + 4 });
    garland.innerHTML = garlandArt(span, sag, Math.max(7, Math.round(span / 34)));
    animate(
      garland,
      [
        { transform: 'translateY(-14px) scaleY(0.4)', opacity: 0 },
        { transform: 'translateY(2px) scaleY(1.05)', opacity: 1, offset: 0.14, easing: 'ease-out' },
        { transform: 'translateY(0px) scaleY(1)', opacity: 1, offset: 0.22 },
        { transform: 'translateY(0px) scaleY(1)', opacity: 1, offset: 0.84 },
        { transform: 'translateY(-4px) scaleY(1)', opacity: 0 },
      ],
      { duration: 1700, easing: 'ease-in-out' },
    ).then(() => garland.remove());
    const sway = garland.querySelector('svg');
    if (sway) animate(sway, [{ transform: 'skewX(0deg)' }, { transform: 'skewX(5deg)', offset: 0.3 }, { transform: 'skewX(-4deg)', offset: 0.65 }, { transform: 'skewX(0deg)' }], { duration: 1500, delay: 150, easing: 'ease-in-out' });
    // Flowers and coins thrown in from both sides, landing over the party.
    const throwsIn = 14;
    for (let k = 0; k < throwsIn; k++) {
      const fromLeft = k % 2 === 0;
      const box = boxes[k % boxes.length];
      const land = { x: box.x + box.width * (0.2 + ((k * 37) % 60) / 100), y: box.y + box.height * (0.25 + ((k * 23) % 45) / 100) };
      const start = { x: fromLeft ? 6 : width - 6, y: Math.max(8, front - 30 - ((k * 13) % 30)) };
      const peak = { x: (start.x + land.x) / 2, y: Math.max(6, Math.min(start.y, land.y) - 50 - ((k * 17) % 30)) };
      const coin = k % 3 !== 1;
      const piece = spark(coin ? 'fx-coin' : 'fx-flower', { x: 0, y: 0 });
      piece.innerHTML = coin ? COIN : FLOWER(['#e8462f', '#f4ecd8', '#f2c14e', '#d96aa8'][k % 4]);
      const frames = Array.from({ length: 11 }, (_, step) => {
        const share = step / 10;
        const point = curve(start, peak, land, share);
        const flip = coin ? Math.cos(share * Math.PI * 5) : 1;
        return {
          transform: `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px) translate(-50%, -50%) rotate(${(share * (fromLeft ? 360 : -360)).toFixed(0)}deg) scale(${flip.toFixed(2)}, 1)`,
          opacity: step === 0 ? 0 : step === 10 ? 0 : 1,
        };
      });
      animate(piece, frames, { duration: 760 + (k % 4) * 60, delay: 120 + k * 45, easing: 'linear', fill: 'backwards' }).then(() => piece.remove());
    }
    // The cheer: each card of the party flares gold.
    const mark = anchor(1500);
    party.forEach((member, index) => {
      after(380 + index * 110, mark, () => {
        rimGlow(member.card, '#ffd24d', 760);
        tintCard(member.card, '#ffd24d', [{ opacity: 0 }, { opacity: 0.38, offset: 0.25 }, { opacity: 0 }], 760);
        const point = figurePoint(member.card, 0.5);
        particles.burst({ x: point.x, y: point.y, area: { width: figureOf(artOf(member.card)) * 0.7, height: 30 }, count: 8, colors: GOLD, angle: -Math.PI / 2, spread: 1, speed: [30, 90], life: [500, 800], size: [1.1, 2], shape: 'mote', drag: 1.2 });
      });
    });
    await wait(1450);
  }

  // 962: the Nieprzełamany: the Kolos turns to stone: grey stone creeps up
  // its picture from its feet, the ground thuds and dust trickles off it,
  // golden cracks glow in the stone, and it breaks off in chips into a
  // golden glow, the Kolos whole again.
  async function statue(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await flashAround(id, color);
      return;
    }
    const card = entry.card;
    const box = boxOf(card);
    const art = artOf(card);
    const figure = figureOf(art);
    // A copy of its figure in stone over it, creeping up from its feet.
    const source = card.querySelector('.unit-art img, .unit-art svg');
    if (source) {
      const picture = boxOf(source);
      const stone = source.cloneNode(true);
      stone.removeAttribute('id');
      stone.setAttribute('aria-hidden', 'true');
      stone.classList.add('fx-stoneskin');
      stone.style.left = `${(picture.x - box.x - card.clientLeft).toFixed(1)}px`;
      stone.style.top = `${(picture.y - box.y - card.clientTop).toFixed(1)}px`;
      stone.style.width = `${picture.width.toFixed(1)}px`;
      stone.style.height = `${picture.height.toFixed(1)}px`;
      card.append(stone);
      animate(
        stone,
        [
          { clipPath: 'inset(100% 0 0 0)', opacity: 1 },
          { clipPath: 'inset(0% 0 0 0)', opacity: 1, offset: 0.3 },
          { clipPath: 'inset(0% 0 0 0)', opacity: 1, offset: 0.7 },
          { clipPath: 'inset(0% 0 0 0)', opacity: 0 },
        ],
        { duration: 1300, easing: 'ease-in-out' },
      ).then(() => stone.remove());
    }
    const middle = figurePoint(card, 0.5);
    const mark = anchor(1400);
    after(380, mark, () => {
      // A thud, up and down (the armour's number pops at this moment by the
      // arena's edge).
      shake(3.2, 340, true);
      groundRing(id, '#b9aa8e', { scale: 1.1, duration: 600 });
      particles.burst({ x: middle.x, y: box.y + box.height - 8, area: { width: figure, height: 4 }, count: 7, colors: DUST, speed: [20, 70], life: [600, 900], size: [4, 7], shape: 'dust', gravity: -12, drag: 2 });
      particles.burst({ x: middle.x, y: art.y + art.height * 0.5, area: { width: figure * 0.7, height: art.height * 0.6 }, count: 8, colors: DUST, angle: Math.PI / 2, spread: 0.3, speed: [10, 30], life: [500, 800], size: [1.5, 2.5], shape: 'dust', gravity: 120, drag: 1 });
    });
    // Golden cracks glowing in the stone.
    after(520, mark, () => {
      glassCracks(entry, art, figure, TOMB_CRACKS, 0, 560, 'fx-goldcrack');
    });
    // The stone breaks off into a golden glow.
    after(900, mark, () => {
      particles.burst({ x: middle.x, y: middle.y, area: { width: figure * 0.8, height: art.height * 0.7 }, count: 16, colors: STONE, speed: [80, 200], life: [380, 640], size: [1.6, 3], shape: 'shard', gravity: 480, drag: 1.2 });
      ring(id, color, Math.round(figure * 1.8), 560);
      rimGlow(card, color, 760);
      tintCard(card, color, [{ opacity: 0 }, { opacity: 0.4, offset: 0.2 }, { opacity: 0 }], 600);
    });
    await wait(1350);
  }

  // A layer on the stage under the cards (the ground they stand on), for
  // what the ground itself does; gone with its look.
  function groundLayer(duration) {
    const layer = h('span', { class: 'fx-ground', 'aria-hidden': 'true' });
    kit.arena.prepend(layer);
    animate(layer, [{ opacity: 1 }, { opacity: 1 }], { duration }).then(() => layer.remove());
    return layer;
  }

  // 962: the Trzęsienie ziemi: the Kolos slams its shield into the ground:
  // the arena shakes, a crack runs from it over the field to the foes and
  // splits under every one of them, rocks jut up under them and toss them,
  // and dust rises.
  async function earthquake(event, color, targets) {
    const entry = cards.get(event.actor);
    const foes = targets.map((id) => cards.get(id)).filter(Boolean);
    if (!entry || foes.length === 0 || reduced() || !particles) {
      await arc(color);
      return;
    }
    const width = stageWidth();
    const own = boxOf(entry.card);
    const ally = entry.unit.side === 'ally';
    const figure = figureOf(artOf(entry.card));
    // The slam: at the Kolos's front edge, toward the foes.
    const slamAt = { x: own.x + own.width / 2, y: ally ? own.y - 4 : own.y + own.height + 4 };
    shake(6, 520);
    particles.burst({ x: slamAt.x, y: slamAt.y, area: { width: own.width * 0.7, height: 6 }, count: 10, colors: DUST, speed: [40, 120], life: [600, 950], size: [4, 8], shape: 'dust', gravity: -16, drag: 2 });
    particles.burst({ x: slamAt.x, y: slamAt.y, count: 10, colors: STONE, angle: ally ? -Math.PI / 2 : Math.PI / 2, spread: 1.1, speed: [100, 220], life: [380, 640], size: [1.6, 2.8], shape: 'shard', gravity: 600, drag: 1 });
    const wave = spark('fx-shockwave', slamAt, { '--fx': '#d8c39a' });
    wave.style.width = `${Math.round(Math.min(own.width * 1.8, (Math.min(slamAt.x, width - slamAt.x) - 2) * 2))}px`;
    animate(
      wave,
      [
        { transform: 'translate(-50%, -50%) scale(0.15)', opacity: 0.95 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
      ],
      { duration: 520, easing: 'ease-out' },
    ).then(() => wave.remove());
    // The crack on the ground, under the cards: from the Kolos to the foes'
    // row, then to every foe's feet.
    const feet = foes.map((foe) => {
      const box = boxOf(foe.card);
      return { x: box.x + box.width / 2, y: ally ? box.y + box.height + 2 : box.y - 2 };
    });
    const ridge = ally ? Math.max(...feet.map((point) => point.y)) + 8 : Math.min(...feet.map((point) => point.y)) - 8;
    const fork = { x: inside((slamAt.x + feet.reduce((sum, point) => sum + point.x, 0) / feet.length) / 2, 8, width), y: ridge };
    const random = seeded(7 + foes.length);
    const jag = (from, to, parts) => {
      const points = [from];
      for (let k = 1; k < parts; k++) {
        const share = k / parts;
        const sideways = (random() - 0.5) * 16;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy) || 1;
        points.push({ x: from.x + dx * share - (dy / length) * sideways, y: from.y + dy * share + (dx / length) * sideways });
      }
      points.push(to);
      return points;
    };
    const trunk = jag(slamAt, fork, 6);
    const branches = feet.map((point) => jag(fork, { x: point.x, y: point.y + (ally ? -6 : 6) }, 4));
    const all = [trunk, ...branches].flat();
    const pad = 6;
    const x0 = Math.max(0, Math.min(...all.map((point) => point.x)) - pad);
    const y0 = Math.max(0, Math.min(...all.map((point) => point.y)) - pad);
    const x1 = Math.min(width, Math.max(...all.map((point) => point.x)) + pad);
    const y1 = Math.min(stageHeight(), Math.max(...all.map((point) => point.y)) + pad);
    const d = (line) => `M${line.map((point) => `${(point.x - x0).toFixed(1)} ${(point.y - y0).toFixed(1)}`).join('L')}`;
    const ground = groundLayer(1500);
    const crack = h('span', { class: 'fx-quakecrack' });
    crack.style.left = `${x0.toFixed(1)}px`;
    crack.style.top = `${y0.toFixed(1)}px`;
    crack.innerHTML =
      `<svg width="${Math.round(x1 - x0)}" height="${Math.round(y1 - y0)}" viewBox="0 0 ${Math.round(x1 - x0)} ${Math.round(y1 - y0)}" aria-hidden="true"><g fill="none" stroke-linecap="round" stroke-linejoin="round">` +
      [trunk, ...branches].map((line, index) => `<path class="fx-quake-glow" pathLength="100" d="${d(line)}" stroke-width="${index ? 8 : 11}"/>`).join('') +
      [trunk, ...branches].map((line, index) => `<path class="fx-quake-core" pathLength="100" d="${d(line)}" stroke-width="${index ? 3 : 4.2}"/>`).join('') +
      '</g></svg>';
    ground.append(crack);
    const lines = [...crack.querySelectorAll('path')];
    const count = 1 + branches.length;
    const run = 300;
    const split = 220;
    lines.forEach((line, index) => {
      const branch = index % count;
      line.setAttribute('stroke-dasharray', '100 100');
      line.setAttribute('stroke-dashoffset', '100');
      animate(line, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duration: branch ? split : run, delay: branch ? 80 + run : 80, easing: 'ease-in', fill: 'both' });
    });
    animate(crack, [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 1450, easing: 'ease-in' }).then(() => crack.remove());
    // The rocks under every foe, tossing it, and dust.
    const reach = 80 + run + split;
    const hit = reached(event, targets);
    const rockHeight = Math.round(Math.max(22, figure * 0.42));
    foes.forEach((foe, index) => {
      const art = artOf(foe.card);
      const base = { x: art.x + art.width / 2, y: art.y + art.height + 2 };
      const delay = reach + index * 40;
      [-0.3, 0.06, 0.34].forEach((dx, k) => {
        const rock = spark('fx-rock', { x: base.x + dx * figureOf(art), y: base.y }, { '--size': `${Math.round(rockHeight * (k === 1 ? 1 : 0.72))}px` });
        rock.innerHTML = ROCK;
        const tilt = (dx * 40).toFixed(1);
        animate(
          rock,
          [
            { transform: `translate(-50%, -100%) rotate(${tilt}deg) scaleY(0)`, opacity: 1 },
            { transform: `translate(-50%, -100%) rotate(${tilt}deg) scaleY(1.1)`, opacity: 1, offset: 0.16, easing: 'ease-out' },
            { transform: `translate(-50%, -100%) rotate(${tilt}deg) scaleY(1)`, opacity: 1, offset: 0.26 },
            { transform: `translate(-50%, -100%) rotate(${tilt}deg) scaleY(1)`, opacity: 1, offset: 0.7 },
            { transform: `translate(-50%, -100%) rotate(${tilt}deg) scaleY(0.2)`, opacity: 0 },
          ],
          { duration: 820, delay: delay + k * 40, easing: 'ease-in', fill: 'backwards' },
        ).then(() => rock.remove());
      });
      after(delay, ground, () => {
        // (A foe its blow does not reach stays standing.)
        if (!hit.includes(foe.unit.id)) return;
        animate(
          foe.card,
          [
            { transform: 'translateY(0px) rotate(0deg)' },
            { transform: `translateY(-10px) rotate(${index % 2 ? 2 : -2}deg)`, offset: 0.3, easing: 'ease-in' },
            { transform: 'translateY(2px) rotate(0deg)', offset: 0.62 },
            { transform: 'translateY(0px) rotate(0deg)' },
          ],
          { duration: 460, easing: 'ease-out', composite: 'add' },
        );
        particles.burst({ x: base.x, y: base.y, area: { width: figureOf(art), height: 4 }, count: 8, colors: DUST, angle: -Math.PI / 2, spread: 1.2, speed: [30, 90], life: [600, 950], size: [4, 7], shape: 'dust', gravity: -16, drag: 2 });
        particles.burst({ x: base.x, y: base.y, count: 9, colors: STONE, angle: -Math.PI / 2, spread: 1.1, speed: [110, 230], life: [380, 620], size: [1.6, 2.8], shape: 'shard', gravity: 620, drag: 1 });
      });
    });
    after(reach, ground, () => shake(5, 460));
    await wait(reach + foes.length * 40 + 380);
  }

  // ——— 963: the evolved Kleryk's skills in looks of their own ———

  // A heal's HP and its number, as the plain look gives them.
  function healed(event) {
    kit.setHp(event.target, event.hp);
    kit.float(event.target, `+${event.amount}`, 'heal');
  }
  // The plain look of a heal, with its HP at once (the animations off).
  function plainHeal(event, color) {
    healed(event);
    return Promise.all([specks(event.target, '#a7c47f'), aura(event.target, color, 1)]);
  }
  // The point over a card's figure's head.
  const headOf = (card) => {
    const art = artOf(card);
    return { x: art.x + art.width / 2, y: art.y + art.height * 0.2 };
  };

  // A sprout growing out of the ground at a card's foot: its stem drawn up,
  // its leaves opening on it.
  function sprout(card, { x, size, delay = 0 }) {
    const box = boxOf(card);
    const mark = spark('fx-sprout', { x, y: box.y + box.height - 5 }, { '--size': `${Math.round(size)}px` });
    mark.innerHTML = SPROUT;
    for (const stem of mark.querySelectorAll('.fx-sprout-stem')) {
      stem.setAttribute('stroke-dasharray', '100 100');
      stem.setAttribute('stroke-dashoffset', '100');
      animate(stem, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duration: 240, delay, easing: 'ease-out', fill: 'both' });
    }
    // (Each leaf opens from where it grows on the stem, set here: the page's
    // rules allow no style written into the art.)
    mark.querySelectorAll('.fx-sprout-leaf').forEach((leaf, index) => {
      leaf.style.transformOrigin = leaf.dataset.origin;
      animate(leaf, [{ transform: 'scale(0)' }, { transform: 'scale(1.18)', offset: 0.7 }, { transform: 'scale(1)' }], { duration: 240, delay: delay + 150 + index * 60, easing: 'ease-out', fill: 'both' });
    });
    animate(mark, [{ opacity: 1 }, { opacity: 1, offset: 0.72 }, { opacity: 0 }], { duration: 1050, delay, fill: 'backwards' }).then(() => mark.remove());
    return mark;
  }

  // 963: the Odnowa: the Uzdrowiciel's prayer opens a ring of green light at
  // its feet, and on every card of the party (as each is healed) sprouts
  // grow out of the ground, their leaves opening, green motes rising, and
  // the HP comes back.
  async function renewalHeal(event, color) {
    const entry = cards.get(event.target);
    if (!entry || reduced() || !particles) {
      await plainHeal(event, color);
      return;
    }
    const card = entry.card;
    const art = artOf(card);
    const figure = figureOf(art);
    const box = boxOf(card);
    const mark = anchor(1100);
    let lead = 0;
    const healer = !event.place ? cards.get(event.actor) : null;
    if (healer) {
      groundRing(event.actor, '#9fd36b', { duration: 760, scale: 1.1 });
      const feet = boxOf(healer.card);
      particles.burst({ x: feet.x + feet.width / 2, y: feet.y + feet.height - 10, area: { width: figureOf(artOf(healer.card)), height: 6 }, count: 10, colors: LIFE, angle: -Math.PI / 2, spread: 0.4, speed: [40, 90], gravity: -30, drag: 1, life: [600, 900], size: [1.2, 2.2], shape: 'mote' });
      lead = 240;
    }
    const middle = art.x + art.width / 2;
    sprout(card, { x: middle - figure * 0.3, size: Math.min(figure * 0.8, box.height * 0.55), delay: lead });
    sprout(card, { x: middle + figure * 0.32, size: Math.min(figure * 0.62, box.height * 0.45), delay: lead + 90 });
    after(lead + 160, mark, () =>
      particles.burst({ x: middle, y: box.y + box.height - 12, area: { width: figure * 0.9, height: 8 }, count: 12, colors: LIFE, angle: -Math.PI / 2, spread: 0.35, speed: [40, 100], gravity: -30, drag: 1, life: [600, 950], size: [1.2, 2.2], shape: 'mote' }),
    );
    after(lead + 300, mark, () => {
      healed(event);
      animate(card, [{ filter: 'brightness(1.3) saturate(1.2)' }, { filter: 'brightness(1)' }], { duration: 520, easing: 'ease-out' });
    });
    await wait(lead + 560);
  }

  // The Odnowa's later heals: a small sprout and green motes.
  async function renewalTick(event, color) {
    const entry = cards.get(event.target);
    if (!entry || reduced() || !particles) {
      await plainHeal(event, color);
      return;
    }
    healed(event);
    const art = artOf(entry.card);
    const box = boxOf(entry.card);
    sprout(entry.card, { x: art.x + art.width / 2 + figureOf(art) * 0.3, size: Math.min(figureOf(art) * 0.55, box.height * 0.4) });
    particles.burst({ x: art.x + art.width / 2, y: box.y + box.height - 12, area: { width: figureOf(art) * 0.7, height: 6 }, count: 6, colors: LIFE, angle: -Math.PI / 2, spread: 0.35, speed: [30, 80], gravity: -30, drag: 1, life: [500, 800], size: [1.1, 2], shape: 'mote' });
    await wait(480);
  }

  // A column of golden light rising up a card from its foot (the Wielka
  // odnowa), `full` of its height.
  function rise(card, { delay = 0, width, full = 1, duration = 700 }) {
    const box = boxOf(card);
    const art = artOf(card);
    const height = Math.round((box.height + 6) * full);
    const column = spark('fx-rise', { x: art.x + art.width / 2, y: box.y + box.height + 2 });
    column.style.width = `${Math.round(width)}px`;
    column.style.height = `${height}px`;
    return animate(
      column,
      [
        { transform: 'translate(-50%, -100%) scaleY(0)', opacity: 0.9 },
        { transform: 'translate(-50%, -100%) scaleY(1)', opacity: 1, offset: 0.4, easing: 'ease-out' },
        { transform: 'translate(-50%, -100%) scale(0.6, 1)', opacity: 0 },
      ],
      { duration, delay, easing: 'cubic-bezier(0.3, 0.6, 0.4, 1)', fill: 'backwards' },
    ).then(() => column.remove());
  }

  // 963: the Wielka odnowa: the Cudotwórca's prayer lifts the party up:
  // under each card of it (as each is healed) golden light rises from the
  // ground up the card, which rises with it, golden motes flying up, and
  // the HP comes back as the light reaches its top.
  async function upliftHeal(event, color) {
    const entry = cards.get(event.target);
    if (!entry || reduced() || !particles) {
      await plainHeal(event, color);
      return;
    }
    const card = entry.card;
    const art = artOf(card);
    const figure = figureOf(art);
    const box = boxOf(card);
    const mark = anchor(1100);
    let lead = 0;
    if (!event.place && cards.get(event.actor)) {
      groundRing(event.actor, '#f2c14e', { duration: 760, scale: 1.15 });
      animate(cards.get(event.actor).card, [{ filter: 'brightness(1)' }, { filter: 'brightness(1.5) sepia(0.3)', offset: 0.4 }, { filter: 'brightness(1)' }], { duration: 520, easing: 'ease-out' });
      lead = 220;
    }
    rise(card, { delay: lead, width: Math.min(box.width * 0.9, figure * 1.05) });
    groundRing(event.target, '#ffe08a', { delay: lead, duration: 620 });
    after(lead, mark, () => {
      animate(card, [{ transform: 'translateY(0px)' }, { transform: 'translateY(-7px)', offset: 0.45, easing: 'ease-out' }, { transform: 'translateY(0px)' }], { duration: 620, easing: 'ease-in-out', composite: 'add' });
      particles.burst({ x: art.x + art.width / 2, y: box.y + box.height - 8, area: { width: figure * 0.8, height: 6 }, count: 14, colors: GOLD, angle: -Math.PI / 2, spread: 0.2, speed: [90, 170], gravity: -20, drag: 1.2, life: [500, 800], size: [1.1, 2], shape: 'mote' });
    });
    after(lead + 280, mark, () => {
      healed(event);
      twinkle({ x: art.x + art.width / 2, y: art.y + 4 }, '#fff6cf', 16);
    });
    await wait(lead + 560);
  }

  // The Wielka odnowa's later heals: a thin column of light rising up the
  // card and golden motes.
  async function upliftTick(event, color) {
    const entry = cards.get(event.target);
    if (!entry || reduced() || !particles) {
      await plainHeal(event, color);
      return;
    }
    healed(event);
    const art = artOf(entry.card);
    const box = boxOf(entry.card);
    rise(entry.card, { width: figureOf(art) * 0.4, full: 0.8, duration: 560 });
    particles.burst({ x: art.x + art.width / 2, y: box.y + box.height - 10, area: { width: figureOf(art) * 0.5, height: 6 }, count: 6, colors: GOLD, angle: -Math.PI / 2, spread: 0.2, speed: [70, 130], gravity: -20, drag: 1.2, life: [400, 700], size: [1.1, 1.9], shape: 'mote' });
    await wait(480);
  }

  // The Cudowne uzdrowienie's light over its Święty, shared by the heals of
  // one prayer (a heal finds it by its caster and moment).
  let radiantOrb = null; // { key, element, point }

  // 963: the Cudowne uzdrowienie: the Święty raises its hands and white
  // light gathers into a bright orb over its head; from it a ribbon of
  // light arcs to every card of the party in turn, which flashes white as
  // dark specks of what ailed it burst out of it and fade, and its HP comes
  // back.
  async function radianceHeal(event, color) {
    const entry = cards.get(event.target);
    const saint = cards.get(event.actor);
    if (!entry || !saint || reduced() || !particles) {
      await plainHeal(event, color);
      return;
    }
    const key = `${event.actor} ${event.t}`;
    let lead = 0;
    if (!event.place || radiantOrb?.key !== key || !radiantOrb.element.isConnected) {
      const head = headOf(saint.card);
      const figure = figureOf(artOf(saint.card));
      const point = { x: head.x, y: Math.max(14, head.y - figure * 0.1) };
      const size = Math.round(figure * 0.55);
      const stay = 380 + Math.max(1, event.party?.length ?? 1) * 700;
      const orb = spark('fx-radiant', point, { '--size': `${size}px` });
      animate(
        orb,
        [
          { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 300 / stay, easing: 'ease-out' },
          { transform: 'translate(-50%, -50%) scale(0.9)', opacity: 1, offset: 0.85 },
          { transform: 'translate(-50%, -50%) scale(1.3)', opacity: 0 },
        ],
        { duration: stay, easing: 'ease-in-out' },
      ).then(() => orb.remove());
      gatherTo(point, figure * 0.7, ['#ffffff', '#fff6cf', '#e3f5b0'], { count: 14, life: 300 });
      animate(saint.card, [{ filter: 'brightness(1)' }, { filter: 'brightness(1.6) saturate(0.8)', offset: 0.5 }, { filter: 'brightness(1)' }], { duration: 600, easing: 'ease-out' });
      radiantOrb = { key, element: orb, point };
      lead = 320;
    }
    const from = radiantOrb.point;
    const card = entry.card;
    const art = artOf(card);
    const figure = figureOf(art);
    const to = figurePoint(card, 0.45);
    const mark = anchor(1200);
    // The ribbon, bowed (up over a card beside it, out toward the stage's
    // middle round one under it), drawn from the orb to the card.
    const chord = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    let normal = { x: -(to.y - from.y) / chord, y: (to.x - from.x) / chord };
    const level = Math.abs(to.x - from.x) > Math.abs(to.y - from.y);
    if (level ? normal.y > 0 : normal.x * (stageWidth() / 2 - from.x) < 0) normal = { x: -normal.x, y: -normal.y };
    const lift = Math.max(24, chord * 0.28);
    const bow = { x: Math.min(stageWidth() - 6, Math.max(6, (from.x + to.x) / 2 + normal.x * lift)), y: Math.max(6, (from.y + to.y) / 2 + normal.y * lift) };
    const x0 = Math.min(from.x, to.x, bow.x) - 8;
    const y0 = Math.min(from.y, to.y, bow.y) - 8;
    const w = Math.ceil(Math.max(from.x, to.x, bow.x) + 8 - x0);
    const hgt = Math.ceil(Math.max(from.y, to.y, bow.y) + 8 - y0);
    const at = (point) => `${(point.x - x0).toFixed(1)} ${(point.y - y0).toFixed(1)}`;
    const ribbon = spark('fx-ribbon', { x: x0, y: y0 });
    ribbon.innerHTML =
      `<svg width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}" aria-hidden="true">` +
      `<path class="fx-ribbon-glow" pathLength="100" d="M${at(from)}Q${at(bow)} ${at(to)}"/><path class="fx-ribbon-core" pathLength="100" d="M${at(from)}Q${at(bow)} ${at(to)}"/></svg>`;
    for (const line of ribbon.querySelectorAll('path')) {
      line.setAttribute('stroke-dasharray', '100 100');
      line.setAttribute('stroke-dashoffset', '100');
      animate(line, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duration: 220, delay: lead, easing: 'ease-in', fill: 'both' });
    }
    animate(ribbon, [{ opacity: 1 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }], { duration: 640, delay: lead, fill: 'backwards' }).then(() => ribbon.remove());
    after(lead + 220, mark, () => {
      healed(event);
      animate(card, [{ filter: 'brightness(2.2) saturate(0.4)' }, { filter: 'brightness(1)' }], { duration: 560, easing: 'ease-out' });
      // What ailed it, torn out: dark specks bursting off it and fading.
      particles.burst({ x: to.x, y: to.y, area: { width: figure * 0.6, height: art.height * 0.5 }, count: 10, colors: ['#3a3446', '#4a4038', '#2e2a36'], angle: -Math.PI / 2, spread: 1.4, speed: [40, 120], gravity: -40, drag: 1.6, life: [500, 800], size: [3, 5], shape: 'dust' });
      particles.burst({ x: to.x, y: to.y, count: 12, colors: ['#ffffff', '#fff6cf', '#e3f5b0'], speed: [80, 200], drag: 3, life: [300, 560], size: [1.1, 2], shape: 'spark' });
      twinkle({ x: to.x + figure * 0.22, y: art.y + art.height * 0.25 }, '#ffffff', 16);
    });
    await wait(lead + 520);
  }

  // The Cudowne uzdrowienie's later heals: a white glint and a soft light.
  async function radianceTick(event, color) {
    const entry = cards.get(event.target);
    if (!entry || reduced() || !particles) {
      await plainHeal(event, color);
      return;
    }
    healed(event);
    const art = artOf(entry.card);
    twinkle({ x: art.x + art.width / 2 + figureOf(art) * 0.2, y: art.y + art.height * 0.3 }, '#ffffff', 18);
    tintCard(entry.card, '#fffdf2', [{ opacity: 0 }, { opacity: 0.35, offset: 0.3 }, { opacity: 0 }], 520);
    await wait(460);
  }

  // The three party heals, after their first heal: what their heal will do
  // for a few moves, settling on every card of the party (green leaves,
  // a golden ring at its feet, white glints).
  async function healSeed(id, look) {
    const entry = cards.get(id);
    if (!entry) return;
    const party = standing(entry.unit.side);
    if (reduced() || !particles) {
      await aura(id, look.color, 1);
      return;
    }
    const mark = anchor(700 + party.length * 90);
    party.forEach((member, index) => {
      const art = artOf(member.card);
      const middle = art.x + art.width / 2;
      const delay = index * 90;
      if (look.sprout) {
        leaves({ x: middle, y: art.y + art.height * 0.3 }, { count: 5, reach: figureOf(art) * 0.45, delay });
      } else if (look.uplift) {
        groundRing(member.unit.id, '#f2c14e', { delay, duration: 760 });
      } else {
        for (const [k, share] of [0.25, 0.75].entries()) twinkle({ x: art.x + art.width * share, y: art.y + art.height * (0.3 + k * 0.3) }, '#ffffff', 14, delay + k * 80);
      }
      after(delay, mark, () => tintCard(member.card, look.sprout ? '#b6e388' : look.uplift ? '#ffe08a' : '#fffdf2', [{ opacity: 0 }, { opacity: 0.28, offset: 0.3 }, { opacity: 0 }], 600));
    });
    await wait(650 + party.length * 90);
  }

  // 963: the Cud: the fallen one's card greys as if it had fallen, a shaft
  // of golden light comes down on it, white wings open behind its figure,
  // and it rises back in its colours with a golden ring, its HP back.
  async function miracleRise(event, color) {
    const entry = cards.get(event.target);
    if (!entry || reduced() || !particles) {
      await plainHeal(event, color);
      return;
    }
    const card = entry.card;
    const box = boxOf(card);
    const art = artOf(card);
    const figure = figureOf(art);
    const width = stageWidth();
    const mark = anchor(1500);
    // Fallen: grey and sunk.
    animate(
      card,
      [
        { filter: 'grayscale(0) brightness(1)', transform: 'translateY(0px)' },
        { filter: 'grayscale(1) brightness(0.55)', transform: 'translateY(3px)', offset: 0.3 },
        { filter: 'grayscale(1) brightness(0.55)', transform: 'translateY(3px)', offset: 0.55 },
        { filter: 'grayscale(0) brightness(1.7)', transform: 'translateY(-6px)', offset: 0.78, easing: 'ease-out' },
        { filter: 'grayscale(0) brightness(1)', transform: 'translateY(0px)' },
      ],
      { duration: 1150, easing: 'ease-in-out' },
    );
    // The shaft of light, from a little above the card (in the gap over its
    // row, not over the cards there) down to the card's foot.
    const x = art.x + art.width / 2;
    const top = Math.max(0, box.y - 30);
    const shaft = spark('fx-shaft', { x, y: top });
    shaft.style.width = `${Math.round(Math.min(box.width * 0.8, figure * 0.95))}px`;
    shaft.style.height = `${Math.round(box.y + box.height - top)}px`;
    animate(
      shaft,
      [
        { transform: 'translate(-50%, 0) scaleY(0)', opacity: 0 },
        { transform: 'translate(-50%, 0) scaleY(1)', opacity: 1, offset: 0.25 },
        { transform: 'translate(-50%, 0) scale(1.1, 1)', opacity: 0.9, offset: 0.6 },
        { transform: 'translate(-50%, 0) scale(0.4, 1)', opacity: 0 },
      ],
      { duration: 1300, delay: 200, easing: 'ease-out', fill: 'backwards' },
    ).then(() => shaft.remove());
    // The wings, from the figure's shoulders, kept on the stage.
    const shoulder = { y: art.y + art.height * 0.42 };
    for (const side of [-1, 1]) {
      const root = { x: x + side * figure * 0.16, y: shoulder.y };
      const room = side > 0 ? width - root.x - 2 : root.x - 2;
      const size = Math.round(Math.max(20, Math.min(figure * 0.95, room / 0.9, (root.y - 2) / 0.92)));
      const wing = spark('fx-wing', root, { '--size': `${size}px` });
      wing.innerHTML = WING;
      const flip = side < 0 ? ' scaleX(-1)' : '';
      animate(
        wing,
        [
          { transform: `translate(-11%, -91%)${flip} rotate(${side * 0}deg) scale(0.2)`, opacity: 0 },
          { transform: `translate(-11%, -91%)${flip} rotate(-14deg) scale(0.75)`, opacity: 1, offset: 0.25 },
          { transform: `translate(-11%, -91%)${flip} rotate(6deg) scale(1)`, opacity: 1, offset: 0.45, easing: 'ease-out' },
          { transform: `translate(-11%, -91%)${flip} rotate(-4deg) scale(1)`, opacity: 1, offset: 0.62 },
          { transform: `translate(-11%, -91%)${flip} rotate(2deg) scale(0.98)`, opacity: 0.9, offset: 0.8 },
          { transform: `translate(-11%, -91%)${flip} rotate(0deg) scale(0.9)`, opacity: 0 },
        ],
        { duration: 1250, delay: 320, easing: 'ease-in-out', fill: 'backwards' },
      ).then(() => wing.remove());
    }
    after(620, mark, () => {
      healed(event);
      ring(event.target, '#f2c14e', Math.round(Math.min(box.width * 1.05, figure * 1.7)), 560);
      particles.burst({ x, y: art.y + art.height * 0.5, area: { width: figure * 0.8, height: art.height * 0.6 }, count: 16, colors: GOLD, angle: -Math.PI / 2, spread: 1.2, speed: [40, 120], gravity: -30, drag: 1.2, life: [600, 950], size: [1.1, 2.1], shape: 'mote' });
      particles.burst({ x, y: art.y + art.height * 0.4, count: 8, colors: ['#ffffff', '#fffdf6'], speed: [60, 140], gravity: 40, drag: 2, life: [500, 800], size: [1.4, 2.4], shape: 'mote' });
    });
    await wait(1250);
  }

  // A golden ribbon winding up a card (the Wielkie błogosławieństwo): a
  // helix round the figure from its foot to its head, its turns behind the
  // figure dimmer, shown from the foot up.
  function windUp(card, delay) {
    const box = boxOf(card);
    const art = artOf(card);
    const figure = figureOf(art);
    const across = Math.min(box.width, figure * 1.15);
    const height = box.height - 6;
    const turns = 2.5;
    const front = [];
    const back = [];
    let run = null;
    let ahead = null;
    for (let step = 0; step <= 60; step++) {
      const share = step / 60;
      const angle = share * turns * Math.PI * 2;
      const point = `${(50 + Math.sin(angle) * 46 * (1 - share * 0.25)).toFixed(1)} ${(100 - share * 100).toFixed(1)}`;
      const near = Math.cos(angle) >= 0;
      if (near !== ahead && run) {
        run.push(point);
        (ahead ? front : back).push(run);
        run = null;
      }
      if (!run) run = [];
      run.push(point);
      ahead = near;
    }
    if (run && run.length > 1) (ahead ? front : back).push(run);
    const d = (runs) => runs.map((points) => `M${points.join('L')}`).join('');
    const ribbon = spark('fx-anoint', { x: art.x + art.width / 2 - across / 2, y: box.y + 3 });
    ribbon.style.width = `${Math.round(across)}px`;
    ribbon.style.height = `${Math.round(height)}px`;
    ribbon.innerHTML =
      '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
      `<path class="fx-anoint-back" d="${d(back)}"/><path class="fx-anoint-glow" d="${d(front)}"/><path class="fx-anoint-core" d="${d(front)}"/></svg>`;
    animate(
      ribbon,
      [
        { clipPath: 'inset(100% -10% 0 -10%)', opacity: 1 },
        { clipPath: 'inset(0% -10% 0 -10%)', opacity: 1, offset: 0.5 },
        { clipPath: 'inset(0% -10% 0 -10%)', opacity: 1, offset: 0.65 },
        { clipPath: 'inset(0% -10% 0 -10%)', opacity: 0 },
      ],
      { duration: 960, delay, easing: 'ease-in-out', fill: 'backwards' },
    ).then(() => ribbon.remove());
  }

  // Streaks of wind flicking out at a card's foot, to both sides (light
  // feet: the speed it gives).
  function lightFeet(card, delay) {
    const box = boxOf(card);
    const art = artOf(card);
    const figure = figureOf(art);
    const x = art.x + art.width / 2;
    const width = stageWidth();
    for (const [k, side] of [-1, 1, -1, 1].entries()) {
      const y = box.y + box.height - 10 - (k > 1 ? 7 : 0);
      const length = Math.min(figure * 0.5, (side > 0 ? width - x : x) - figure * 0.3 - 4);
      if (length < 8) continue;
      const streak = spark('fx-gust-streak', { x: x + side * figure * 0.22, y });
      streak.style.width = `${Math.round(length)}px`;
      streak.style.transformOrigin = side > 0 ? '0 50%' : '100% 50%';
      const at = side > 0 ? 'translate(0, -50%)' : 'translate(-100%, -50%)';
      animate(
        streak,
        [
          { transform: `${at} scaleX(0.2)`, opacity: 0 },
          { transform: `${at} scaleX(1)`, opacity: 1, offset: 0.4 },
          { transform: `${at} translateX(${side * 4}px) scaleX(0.6)`, opacity: 0 },
        ],
        { duration: 420, delay: delay + k * 60, easing: 'ease-out', fill: 'backwards' },
      ).then(() => streak.remove());
    }
  }

  // 963: the Wielkie błogosławieństwo: golden light flows from the Kapłan
  // over the whole party: a golden ribbon winds up every card from its foot
  // to its head, wind flicks out at its feet (lighter feet) and a glint
  // shines on it (stronger arms and armour).
  async function anoint(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    const party = standing(entry.unit.side);
    if (reduced() || !particles) {
      await Promise.all(party.map((member) => Promise.all([ring(member.unit.id, color, 130, 760), aura(member.unit.id, color, 1)])));
      return;
    }
    const mark = anchor(1600);
    flash('#f2d675', 0.12, 420);
    const source = headOf(entry.card);
    particles.burst({ x: source.x, y: source.y, count: 14, colors: GOLD, speed: [60, 160], drag: 2.4, life: [400, 700], size: [1.1, 2], shape: 'spark' });
    party.forEach((member, index) => {
      const delay = 120 + index * 170;
      windUp(member.card, delay);
      lightFeet(member.card, delay + 360);
      const art = artOf(member.card);
      twinkle({ x: art.x + art.width / 2 + figureOf(art) * 0.3, y: art.y + art.height * 0.2 }, '#fff6cf', 16, delay + 420);
      after(delay + 300, mark, () => rimGlow(member.card, color, 700));
    });
    await wait(900 + party.length * 170);
  }

  // A note of a song flying from one point to another in an arc, bobbing.
  function noteFlight(from, to, { size, delay = 0, duration = 900, which = 0 }) {
    const note = spark('fx-note', { x: 0, y: 0 }, { '--size': `${Math.round(size)}px` });
    note.innerHTML = NOTES[which % NOTES.length];
    const peak = { x: (from.x + to.x) / 2, y: Math.max(size, Math.min(from.y, to.y) - size * 1.6) };
    const frames = Array.from({ length: 13 }, (_, step) => {
      const share = step / 12;
      const point = curve(from, peak, to, share);
      const sway = Math.sin(share * Math.PI * 3) * 8;
      return { transform: `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px) translate(-50%, -50%) rotate(${sway.toFixed(1)}deg) scale(${(0.7 + Math.sin(share * Math.PI) * 0.35).toFixed(2)})`, opacity: step === 0 || step === 12 ? 0 : 1 };
    });
    return animate(note, frames, { duration, delay, easing: 'ease-in-out', fill: 'backwards' }).then(() => note.remove());
  }

  // A stave of five golden lines unrolling from one point to another in a
  // bow (over it), for `duration`, and notes riding along it.
  function stave(from, to, { size, delay = 0, duration = 1100, notes = 2, lift = 0.35 }) {
    const width = stageWidth();
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    // Bowed up over a card beside it, out toward the stage's middle round a
    // card under it.
    let out = { x: nx, y: ny };
    if (Math.abs(dx) > Math.abs(dy) ? out.y > 0 : out.x * (width / 2 - from.x) < 0) out = { x: -out.x, y: -out.y };
    const reach = Math.max(size, length * lift);
    const bow = { x: Math.min(width - size, Math.max(size, (from.x + to.x) / 2 + out.x * reach)), y: Math.max(size, (from.y + to.y) / 2 + out.y * reach) };
    const gap = Math.max(2.4, size * 0.13);
    const lines = [-2, -1, 0, 1, 2].map((k) => {
      const shift = (point) => ({ x: point.x + nx * gap * k, y: point.y + ny * gap * k });
      return [shift(from), shift(bow), shift(to)];
    });
    const all = lines.flat();
    const x0 = Math.max(0, Math.min(...all.map((point) => point.x)) - 4);
    const y0 = Math.max(0, Math.min(...all.map((point) => point.y)) - 4);
    const w = Math.ceil(Math.max(...all.map((point) => point.x)) + 4 - x0);
    const hgt = Math.ceil(Math.max(...all.map((point) => point.y)) + 4 - y0);
    const at = (point) => `${(point.x - x0).toFixed(1)} ${(point.y - y0).toFixed(1)}`;
    const staff = spark('fx-stave', { x: x0, y: y0 });
    staff.innerHTML = `<svg width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}" aria-hidden="true">${lines.map(([a, b, c]) => `<path pathLength="100" d="M${at(a)}Q${at(b)} ${at(c)}"/>`).join('')}</svg>`;
    for (const line of staff.querySelectorAll('path')) {
      line.setAttribute('stroke-dasharray', '100 100');
      line.setAttribute('stroke-dashoffset', '100');
      animate(line, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0, offset: 0.4 }, { strokeDashoffset: 0, offset: 0.7 }, { strokeDashoffset: -100 }], { duration, delay, easing: 'ease-in-out', fill: 'both' });
    }
    animate(staff, [{ opacity: 1 }, { opacity: 1 }], { duration, delay, fill: 'backwards' }).then(() => staff.remove());
    // The notes ride along it, the first ahead.
    for (let k = 0; k < notes; k++) {
      const note = spark('fx-note', { x: 0, y: 0 }, { '--size': `${Math.round(size * (k ? 0.85 : 1))}px` });
      note.innerHTML = NOTES[k % NOTES.length];
      const frames = Array.from({ length: 13 }, (_, step) => {
        const share = step / 12;
        const point = curve(from, bow, to, share);
        const sway = Math.sin(share * Math.PI * 3 + k) * 10;
        return { transform: `translate(${point.x.toFixed(1)}px, ${(point.y - gap * 2.6).toFixed(1)}px) translate(-50%, -70%) rotate(${sway.toFixed(1)}deg)`, opacity: step === 0 || step === 12 ? 0 : 1 };
      });
      animate(note, frames, { duration: duration * 0.7, delay: delay + duration * 0.08 + k * 140, easing: 'ease-in-out', fill: 'backwards' }).then(() => note.remove());
    }
  }

  // 963: the Psalm: the Kapłan sings: a golden stave unrolls from it in a
  // bow to every card of the party, notes riding along it, and each card
  // glows softly as the song reaches it.
  async function psalmSong(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await Promise.all([ring(id, color, 130, 760), aura(id, color, 2)]);
      return;
    }
    const party = standing(entry.unit.side);
    const from = headOf(entry.card);
    const figure = figureOf(artOf(entry.card));
    const size = Math.max(18, figure * 0.3);
    aura(id, '#f2d675', 1);
    const mark = anchor(1500);
    const others = party.filter((member) => member !== entry);
    const reach = others.length ? others : [entry];
    reach.forEach((member, index) => {
      const head = headOf(member.card);
      const to = member === entry ? { x: Math.min(stageWidth() - size, head.x + figure * 0.5), y: Math.max(size * 2, head.y - figure * 0.35) } : head;
      stave(from, to, { size, delay: index * 160 });
      after(index * 160 + 600, mark, () => tintCard(member.card, '#f2d675', [{ opacity: 0 }, { opacity: 0.3, offset: 0.3 }, { opacity: 0 }], 600));
    });
    await wait(1150 + reach.length * 160);
  }

  // The Psalm's heals: a note rising off the card.
  async function psalmTick(event, color) {
    const entry = cards.get(event.target);
    if (!entry || reduced() || !particles) {
      await plainHeal(event, color);
      return;
    }
    healed(event);
    const head = headOf(entry.card);
    const figure = figureOf(artOf(entry.card));
    noteFlight({ x: head.x + figure * 0.2, y: head.y + figure * 0.25 }, { x: head.x + figure * 0.3, y: Math.max(figure * 0.2, head.y - figure * 0.15) }, { size: Math.max(16, figure * 0.28), duration: 760, which: event.amount });
    await wait(460);
  }

  // 963: the Aura życia: a warm light swells round the Cudotwórca over the
  // party (kept on the stage), breathes in and out twice, and every card it
  // holds glows warm.
  async function lifeAura(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await Promise.all([ring(id, color, 130, 760), aura(id, color, 2)]);
      return;
    }
    const party = standing(entry.unit.side);
    const middle = figurePoint(entry.card, 0.5);
    // Over the party's cards (their box, a little more), kept on the stage,
    // round the Cudotwórca.
    const boxes = party.map((member) => boxOf(member.card));
    const left = Math.max(2, Math.min(...boxes.map((box) => box.x)) - 14);
    const right = Math.min(stageWidth() - 2, Math.max(...boxes.map((box) => box.x + box.width)) + 14);
    const top = Math.max(2, Math.min(...boxes.map((box) => box.y)) - 14);
    const bottom = Math.min(stageHeight() - 2, Math.max(...boxes.map((box) => box.y + box.height)) + 14);
    const reach = Math.max(...party.map((member) => Math.hypot(centerOf(member.card).x - middle.x, centerOf(member.card).y - middle.y)), 1);
    const glow = spark('fx-lifeaura fx-lifeaura--party', { x: left, y: top });
    glow.style.width = `${Math.round(right - left)}px`;
    glow.style.height = `${Math.round(bottom - top)}px`;
    glow.style.setProperty('--x', `${(((middle.x - left) / (right - left)) * 100).toFixed(1)}%`);
    glow.style.setProperty('--y', `${(((middle.y - top) / (bottom - top)) * 100).toFixed(1)}%`);
    animate(
      glow,
      [
        { transform: 'scale(0.6)', opacity: 0 },
        { transform: 'scale(1)', opacity: 1, offset: 0.25, easing: 'ease-out' },
        { transform: 'scale(0.96)', opacity: 0.7, offset: 0.45, easing: 'ease-in-out' },
        { transform: 'scale(1)', opacity: 1, offset: 0.65, easing: 'ease-in-out' },
        { transform: 'scale(0.98)', opacity: 0 },
      ],
      { duration: 1600, easing: 'ease-in-out' },
    ).then(() => glow.remove());
    const mark = anchor(1600);
    party.forEach((member) => {
      const distance = Math.hypot(centerOf(member.card).x - middle.x, centerOf(member.card).y - middle.y);
      after(120 + (distance / Math.max(1, reach)) * 260, mark, () => {
        tintCard(member.card, '#ffcf7a', [{ opacity: 0 }, { opacity: 0.38, offset: 0.3 }, { opacity: 0.18, offset: 0.6 }, { opacity: 0.32, offset: 0.75 }, { opacity: 0 }], 1100);
        const art = artOf(member.card);
        particles.burst({ x: art.x + art.width / 2, y: art.y + art.height * 0.6, area: { width: figureOf(art) * 0.8, height: art.height * 0.5 }, count: 8, colors: ['#fff1c9', '#ffcf7a', '#d9f0a3'], angle: -Math.PI / 2, spread: 0.6, speed: [10, 40], gravity: -30, drag: 1, life: [800, 1200], size: [1.2, 2.2], shape: 'mote' });
      });
    });
    await wait(1400);
  }

  // The Aura życia's heals: a warm breath of light over the card.
  async function breathTick(event, color) {
    const entry = cards.get(event.target);
    if (!entry || reduced() || !particles) {
      await plainHeal(event, color);
      return;
    }
    healed(event);
    const box = boxOf(entry.card);
    const art = artOf(entry.card);
    const size = Math.round(Math.min(box.width, box.height, figureOf(art) * 1.4));
    const breath = spark('fx-lifeaura', figurePoint(entry.card, 0.55), { '--size': `${size}px` });
    animate(
      breath,
      [
        { transform: 'translate(-50%, -50%) scale(0.75)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.9, offset: 0.4, easing: 'ease-in-out' },
        { transform: 'translate(-50%, -50%) scale(0.85)', opacity: 0 },
      ],
      { duration: 760, easing: 'ease-in-out' },
    ).then(() => breath.remove());
    await wait(480);
  }

  // A light of an unseen singer by a card, with the arcs of its voice
  // toward the card's middle.
  function singer(card, point, delay, side) {
    const art = artOf(card);
    const figure = figureOf(art);
    const size = Math.round(Math.max(16, figure * 0.26));
    const light = spark('fx-spirit', point, { '--size': `${size}px` });
    light.innerHTML = SPIRIT;
    animate(
      light,
      [
        { transform: 'translate(-50%, -50%) translateY(6px) scale(0.4)', opacity: 0 },
        { transform: 'translate(-50%, -50%) translateY(0px) scale(1)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, -50%) translateY(-3px) scale(1)', opacity: 1, offset: 0.45 },
        { transform: 'translate(-50%, -50%) translateY(1px) scale(1)', opacity: 1, offset: 0.7 },
        { transform: 'translate(-50%, -50%) translateY(-6px) scale(0.9)', opacity: 0 },
      ],
      { duration: 1200, delay, easing: 'ease-in-out', fill: 'backwards' },
    ).then(() => light.remove());
    for (let k = 0; k < 2; k++) {
      const arc = spark('fx-voice', point, { '--fx': '#ffd75e', '--size': `${Math.round(figure * 0.5)}px` });
      arc.innerHTML = SOUND_ARC;
      const turn = side > 0 ? 180 : 0;
      animate(
        arc,
        [
          { transform: `translate(-50%, -50%) rotate(${turn}deg) translateX(0px) scale(0.4)`, opacity: 0 },
          { transform: `translate(-50%, -50%) rotate(${turn}deg) translateX(${(figure * 0.12).toFixed(1)}px) scale(0.8)`, opacity: 0.95, offset: 0.35 },
          { transform: `translate(-50%, -50%) rotate(${turn}deg) translateX(${(figure * 0.3).toFixed(1)}px) scale(1.1)`, opacity: 0 },
        ],
        { duration: 620, delay: delay + 260 + k * 260, easing: 'ease-out', fill: 'backwards' },
      ).then(() => arc.remove());
    }
  }

  // 963: the Chór: by every card of the party (in turn) two faint lights
  // of unseen singers appear at the sides of its figure and sing to it,
  // the golden arcs of their voices running in to it, and the card glows
  // gold (stronger blows).
  async function choirSong(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    const party = standing(entry.unit.side);
    if (reduced() || !particles) {
      await Promise.all([ring(id, color, 130, 760), aura(id, color, 2)]);
      return;
    }
    const mark = anchor(1700);
    party.forEach((member, index) => {
      const art = artOf(member.card);
      const figure = figureOf(art);
      const x = art.x + art.width / 2;
      const y = art.y + art.height * 0.42;
      const delay = index * 150;
      for (const side of [-1, 1]) singer(member.card, { x: x + side * figure * 0.4, y }, delay + (side > 0 ? 80 : 0), side);
      after(delay + 300, mark, () => rimGlow(member.card, '#f2c14e', 900));
    });
    await wait(1300 + party.length * 150);
  }

  // The Chór's heals: a singer's light by the card, singing to it.
  async function choirTick(event, color) {
    const entry = cards.get(event.target);
    if (!entry || reduced() || !particles) {
      await plainHeal(event, color);
      return;
    }
    healed(event);
    const art = artOf(entry.card);
    const figure = figureOf(art);
    singer(entry.card, { x: art.x + art.width / 2 + figure * 0.4, y: art.y + art.height * 0.42 }, 0, 1);
    await wait(500);
  }

  // A laurel wreath settling over a card's head.
  function laurel(card, { delay = 0, scale = 1 }) {
    const art = artOf(card);
    const figure = figureOf(art);
    const size = Math.round(figure * 0.62 * scale);
    const head = { x: art.x + art.width / 2, y: Math.max(size / 2 + 2, art.y + art.height * 0.24) };
    const wreath = spark('fx-laurel', head, { '--size': `${size}px` });
    wreath.innerHTML = LAUREL;
    return animate(
      wreath,
      [
        { transform: 'translate(-50%, calc(-50% - 14px)) scale(1.35)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(0.95)', opacity: 1, offset: 0.3, easing: 'ease-out' },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.4 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.78 },
        { transform: 'translate(-50%, calc(-50% - 4px)) scale(1.04)', opacity: 0 },
      ],
      { duration: 1250, delay, easing: 'ease-in-out', fill: 'backwards' },
    ).then(() => wreath.remove());
  }

  // 963: the Hymn: two herald's horns rise beside the Prorok and sound,
  // the arena lights up gold, and a laurel wreath of victory settles over
  // the head of every card of the party.
  async function hymn(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    const party = standing(entry.unit.side);
    if (reduced() || !particles) {
      await Promise.all([ring(id, color, 130, 760), aura(id, color, 2)]);
      return;
    }
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const width = stageWidth();
    const mark = anchor(1900);
    for (const side of [-1, 1]) {
      const mouth = { x: art.x + art.width / 2 + side * figure * 0.12, y: art.y + art.height * 0.32 };
      const room = side > 0 ? width - mouth.x - 2 : mouth.x - 2;
      const length = Math.round(Math.max(24, Math.min(figure * 0.85, room / 0.98)));
      const horn = spark('fx-horn', mouth, { '--size': `${length}px` });
      horn.innerHTML = HORN;
      const flip = side < 0 ? 'scaleX(-1) ' : '';
      const up = 'rotate(-16deg)';
      animate(
        horn,
        [
          { transform: `translate(0, -50%) ${flip}${up} scale(0.3)`, opacity: 0 },
          { transform: `translate(0, -50%) ${flip}${up} scale(1)`, opacity: 1, offset: 0.25, easing: 'ease-out' },
          { transform: `translate(0, -50%) ${flip}${up} scale(1)`, opacity: 1, offset: 0.4 },
          { transform: `translate(0, -50%) ${flip}${up} scale(0.94, 1.06)`, opacity: 1, offset: 0.46 },
          { transform: `translate(0, -50%) ${flip}${up} scale(1)`, opacity: 1, offset: 0.55 },
          { transform: `translate(0, -50%) ${flip}${up} scale(1)`, opacity: 0 },
        ],
        { duration: 1350, easing: 'ease-in-out' },
      ).then(() => horn.remove());
      // The blast: lines of sound out of its bell.
      const bell = { x: mouth.x + side * Math.cos((16 * Math.PI) / 180) * length, y: mouth.y - Math.sin((16 * Math.PI) / 180) * length };
      after(540, mark, () => {
        for (let k = 0; k < 3; k++) {
          const arc = spark('fx-voice', bell, { '--fx': '#ffe08a', '--size': `${Math.round(figure * 0.42)}px` });
          arc.innerHTML = SOUND_ARC;
          const turn = side > 0 ? -16 : 196;
          const room0 = Math.max(4, Math.min(figure * 0.3, (side > 0 ? width - bell.x : bell.x) - figure * 0.25));
          animate(
            arc,
            [
              { transform: `translate(-50%, -50%) rotate(${turn}deg) translateX(0px) scale(0.5)`, opacity: 0 },
              { transform: `translate(-50%, -50%) rotate(${turn}deg) translateX(${(room0 * 0.4).toFixed(1)}px) scale(0.8)`, opacity: 1, offset: 0.3 },
              { transform: `translate(-50%, -50%) rotate(${turn}deg) translateX(${room0.toFixed(1)}px) scale(1)`, opacity: 0 },
            ],
            { duration: 520, delay: k * 120, easing: 'ease-out', fill: 'backwards' },
          ).then(() => arc.remove());
        }
      });
    }
    after(560, mark, () => {
      flash('#ffd24d', 0.14, 420);
      animate(entry.card, [{ transform: 'translateY(0px)' }, { transform: 'translateY(2px)', offset: 0.3 }, { transform: 'translateY(0px)' }], { duration: 260, composite: 'add' });
    });
    party.forEach((member, index) => {
      laurel(member.card, { delay: 640 + index * 140 });
      after(820 + index * 140, mark, () => {
        rimGlow(member.card, '#f2c14e', 700);
        const head = headOf(member.card);
        particles.burst({ x: head.x, y: head.y, count: 8, colors: GOLD, speed: [50, 130], drag: 2.4, life: [400, 700], size: [1.1, 2], shape: 'spark' });
      });
    });
    await wait(1500 + party.length * 140);
  }

  // The Hymn's heals: a small laurel wreath over the card's head.
  async function hymnTick(event, color) {
    const entry = cards.get(event.target);
    if (!entry || reduced() || !particles) {
      await plainHeal(event, color);
      return;
    }
    healed(event);
    laurel(entry.card, { scale: 0.75 });
    await wait(500);
  }

  // 963: the Wizja: a great eye opens over the Prorok's figure (under its
  // called name), lines of its sight run to every foe and then to every
  // card of the party, and each of them shows for a moment the step aside
  // it will take before the blow comes.
  async function foresight(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await Promise.all([ring(id, color, 130, 760), aura(id, color, 2)]);
      return;
    }
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const width = stageWidth();
    const across = Math.round(Math.min(figure * 0.95, (Math.min(art.x + art.width / 2, width - art.x - art.width / 2) - 2) * 2));
    const point = { x: art.x + art.width / 2, y: art.y + art.height * 0.52 };
    const eye = spark('fx-eye', point, { '--fx': color, '--size': `${across}px` });
    eye.innerHTML = EYE;
    animate(
      eye,
      [
        { transform: 'translate(-50%, -50%) scaleY(0.05)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scaleY(0.08)', opacity: 1, offset: 0.08 },
        { transform: 'translate(-50%, -50%) scaleY(1)', opacity: 1, offset: 0.24, easing: 'ease-out' },
        { transform: 'translate(-50%, -50%) scaleY(1)', opacity: 1, offset: 0.8 },
        { transform: 'translate(-50%, -50%) scaleY(0.05)', opacity: 0 },
      ],
      { duration: 1450, easing: 'ease-in-out' },
    ).then(() => eye.remove());
    const mark = anchor(1500);
    after(320, mark, () => {
      flash(color, 0.1, 360);
      for (const foe of foesOf(entry)) sightOf(point, figurePoint(foe.card, 0.45), color, 0, 620);
    });
    standing(entry.unit.side).forEach((member, index) => {
      if (member !== entry) sightOf(point, figurePoint(member.card, 0.45), '#fff3c4', 560 + index * 60, 560);
      after(700 + index * 90, mark, () => foreseen(member.card, index % 2 ? 1 : -1));
    });
    await wait(1350);
  }

  // A card's figure stepping aside in a pale copy of itself, and back.
  function foreseen(card, way) {
    const source = card.querySelector('.unit-art');
    if (!source) return;
    const box = boxOf(source);
    const shift = Math.max(-box.x + 2, Math.min(stageWidth() - box.x - box.width - 2, way * Math.min(14, box.width * 0.18)));
    const copy = source.cloneNode(true);
    copy.querySelector('.unit-level')?.remove();
    copy.classList.add('fx-foreseen');
    copy.setAttribute('aria-hidden', 'true');
    copy.style.left = `${box.x}px`;
    copy.style.top = `${box.y}px`;
    copy.style.width = `${box.width}px`;
    copy.style.height = `${box.height}px`;
    fx.append(copy);
    animate(
      copy,
      [
        { transform: 'translateX(0px)', opacity: 0 },
        { transform: `translateX(${shift.toFixed(1)}px)`, opacity: 0.75, offset: 0.35, easing: 'ease-out' },
        { transform: `translateX(${shift.toFixed(1)}px)`, opacity: 0.6, offset: 0.6 },
        { transform: 'translateX(0px)', opacity: 0 },
      ],
      { duration: 620, easing: 'ease-in-out' },
    ).then(() => copy.remove());
  }

  // 963: the Boska ochrona: a golden dome closes over the whole party:
  // rising from the ground round its cards, its ribs drawn up and across
  // it like a globe's, it flares, and its light settles on every card of
  // the party.
  async function dome(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await bubble(id, color);
      return;
    }
    const party = standing(entry.unit.side);
    const boxes = party.map((member) => boxOf(member.card));
    const width = stageWidth();
    const height = stageHeight();
    const left = Math.max(3, Math.min(...boxes.map((box) => box.x)) - 10);
    const right = Math.min(width - 3, Math.max(...boxes.map((box) => box.x + box.width)) + 10);
    const top = Math.max(3, Math.min(...boxes.map((box) => box.y)) - 14);
    const base = Math.min(height - 3, Math.max(...boxes.map((box) => box.y + box.height)) + 8);
    const shell = spark('fx-dome', { x: left, y: top }, { '--fx': color });
    shell.style.width = `${Math.round(right - left)}px`;
    shell.style.height = `${Math.round(base - top)}px`;
    const across = (y) => 49 * Math.sqrt(Math.max(0, 1 - ((y - 50) / 49) ** 2));
    const meridians = [16, 33].map((rx) => `<ellipse class="fx-dome-rib" pathLength="100" cx="50" cy="50" rx="${rx}" ry="49"/>`).join('') + '<path class="fx-dome-rib" pathLength="100" d="M50 1V99"/>';
    const parallels = [22, 50, 78].map((y) => `<path class="fx-dome-band" d="M${(50 - across(y)).toFixed(1)} ${y}Q50 ${(y + (y - 50) * 0.15 + 4).toFixed(1)} ${(50 + across(y)).toFixed(1)} ${y}"/>`).join('');
    shell.innerHTML =
      '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
      '<ellipse class="fx-dome-fill" cx="50" cy="50" rx="49" ry="49"/>' +
      `<g class="fx-dome-lines">${meridians}${parallels}</g>` +
      '<path class="fx-dome-shine" d="M14 30Q22 12 40 6"/>' +
      '<ellipse class="fx-dome-edge" cx="50" cy="50" rx="49" ry="49"/></svg>';
    for (const rib of shell.querySelectorAll('.fx-dome-rib')) {
      rib.setAttribute('stroke-dasharray', '100 100');
      rib.setAttribute('stroke-dashoffset', '100');
      animate(rib, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duration: 420, delay: 140, easing: 'ease-out', fill: 'both' });
    }
    animate(
      shell,
      [
        { clipPath: 'inset(100% 0 0 0)', opacity: 1 },
        { clipPath: 'inset(0% 0 0 0)', opacity: 1, offset: 0.28, easing: 'ease-out' },
        { clipPath: 'inset(0% 0 0 0)', opacity: 0.9, offset: 0.75 },
        { clipPath: 'inset(0% 0 0 0)', opacity: 0 },
      ],
      { duration: 1500, easing: 'ease-in-out' },
    ).then(() => shell.remove());
    const mark = anchor(1500);
    after(440, mark, () => {
      flash(color, 0.14, 380);
      twinkle({ x: left + (right - left) * 0.24, y: top + (base - top) * 0.16 }, '#ffffff', 20);
      party.forEach((member, index) => rimGlow(member.card, color, 800, index * 60));
      entry.card.classList.add('unit--shielded');
      entry.card.style.setProperty('--shield', color);
    });
    await wait(1300);
  }

  // 963: the Sąd: the Inkwizytor's lash of holy light cracks at every foe
  // it strikes, one after another in the order its blows land (each crack
  // from the Inkwizytor, bowed like a whip); where it cracks, a burning
  // brand of the sun is left on the foe.
  async function lash(event, color, targets) {
    const entry = cards.get(event.actor);
    const foes = reached(event, targets).map((id) => cards.get(id)).filter(Boolean);
    if (!entry || foes.length === 0 || reduced() || !particles) {
      await beams(color, targets);
      return;
    }
    const width = stageWidth();
    const from = figurePoint(entry.card, 0.4);
    const gap = 150;
    const draw = 150;
    const mark = anchor(foes.length * gap + 1100);
    foes.forEach((foe, index) => {
      const to = figurePoint(foe.card, 0.45);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy) || 1;
      // Bowed to one side, then the other, toward the stage's middle where
      // it can.
      const side = index % 2 ? 1 : -1;
      const bow = Math.min(36, length * 0.16) * side;
      const control = { x: Math.min(width - 6, Math.max(6, (from.x + to.x) / 2 - (dy / length) * bow)), y: (from.y + to.y) / 2 + (dx / length) * bow };
      const x0 = Math.max(0, Math.min(from.x, to.x, control.x) - 6);
      const y0 = Math.max(0, Math.min(from.y, to.y, control.y) - 6);
      const w = Math.ceil(Math.max(from.x, to.x, control.x) + 6 - x0);
      const hgt = Math.ceil(Math.max(from.y, to.y, control.y) + 6 - y0);
      const at = (point) => `${(point.x - x0).toFixed(1)} ${(point.y - y0).toFixed(1)}`;
      const d = `M${at(from)}Q${at(control)} ${at(to)}`;
      const delay = index * gap;
      const whip = spark('fx-lash', { x: x0, y: y0 }, { '--fx': color });
      whip.innerHTML = `<svg width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}" aria-hidden="true"><path class="fx-lash-glow" pathLength="100" d="${d}"/><path class="fx-lash-core" pathLength="100" d="${d}"/></svg>`;
      for (const line of whip.querySelectorAll('path')) {
        line.setAttribute('stroke-dasharray', '100 100');
        line.setAttribute('stroke-dashoffset', '100');
        // Drawn out to the foe, then pulled back from the Inkwizytor's end.
        animate(line, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0, offset: 0.45 }, { strokeDashoffset: 0, offset: 0.6 }, { strokeDashoffset: -100 }], { duration: draw / 0.45, delay, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'both' });
      }
      animate(whip, [{ opacity: 1 }, { opacity: 1 }], { duration: draw / 0.45, delay, fill: 'backwards' }).then(() => whip.remove());
      after(delay + draw, mark, () => {
        const figure = figureOf(artOf(foe.card));
        twinkle(to, '#ffffff', figure * 0.5);
        particles.burst({ x: to.x, y: to.y, count: 10, colors: HOLY, speed: [120, 260], drag: 3, life: [200, 400], size: [1.1, 2], shape: 'spark' });
        animate(foe.card, [{ filter: 'brightness(2)' }, { filter: 'brightness(1)' }], { duration: 320, easing: 'ease-out' });
        const brand = spark('fx-brand', to, { '--fx': '#ffd27a', '--size': `${Math.round(figure * 0.42)}px` });
        brand.innerHTML = BRAND;
        animate(
          brand,
          [
            { transform: 'translate(-50%, -50%) scale(1.5)', opacity: 0 },
            { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.15 },
            { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.9, offset: 0.7 },
            { transform: 'translate(-50%, -50%) scale(0.96)', opacity: 0 },
          ],
          { duration: 1000, easing: 'ease-out' },
        ).then(() => brand.remove());
      });
    });
    await wait((foes.length - 1) * gap + draw + 420);
  }

  // A foe the Sąd paralyses: holy chains close round it.
  function chained(event) {
    const entry = cards.get(event.target);
    if (!entry || reduced() || !particles) return;
    const box = boxOf(entry.card);
    const art = artOf(entry.card);
    const width = stageWidth();
    const middle = { x: art.x + art.width / 2, y: art.y + art.height * 0.62 };
    const across = Math.round(Math.min(box.width * 1.02, figureOf(art) * 1.35, (Math.min(middle.x, width - middle.x) - 2) * 2));
    const chains = spark('fx-chains', middle, { '--size': `${across}px` });
    chains.innerHTML = CHAINS;
    animate(
      chains,
      [
        { transform: 'translate(-50%, -50%) scale(1.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(0.96)', opacity: 1, offset: 0.2, easing: 'ease-out' },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.3 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.8 },
        { transform: 'translate(-50%, -50%) scale(1.02)', opacity: 0 },
      ],
      { duration: 1300, easing: 'ease-in-out' },
    ).then(() => chains.remove());
    particles.burst({ x: middle.x, y: middle.y, count: 8, colors: HOLY, speed: [60, 140], drag: 3, life: [300, 500], size: [1.1, 2], shape: 'spark' });
  }

  // 963: the Wyrok: the sword of the sentence (arena-fx.js sentence()) has
  // come down on the foe: a white cut of light runs down it, golden shards
  // fly and a ring rolls out.
  function sentenceHit(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 90);
      ring(event.target, color, 110, 420);
      return;
    }
    const art = artOf(entry.card);
    const box = boxOf(entry.card);
    const figure = figureOf(art);
    const x = art.x + art.width / 2;
    const cut = spark('fx-verdictcut', { x, y: art.y + art.height * 0.5 });
    cut.style.height = `${Math.round(Math.min(box.height * 0.95, figure * 1.4))}px`;
    animate(
      cut,
      [
        { transform: 'translate(-50%, -50%) scaleY(0)', opacity: 1 },
        { transform: 'translate(-50%, -50%) scaleY(1)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, -50%) scale(2.2, 1)', opacity: 0 },
      ],
      { duration: 420, easing: 'ease-out' },
    ).then(() => cut.remove());
    particles.burst({ x, y: art.y + art.height * 0.5, count: 14, colors: GOLD, angle: -Math.PI / 2, spread: Math.PI, speed: [140, 300], drag: 2.6, life: [260, 480], size: [1.4, 2.6], shape: 'shard', gravity: 260 });
    ring(event.target, '#ffe08a', Math.round(Math.min(box.width * 1.02, figure * 1.6)), 460);
    animate(entry.card, [{ filter: 'brightness(2.2) saturate(0.6)' }, { filter: 'brightness(1)' }], { duration: 480, easing: 'ease-out' });
    shake(3, 300);
  }

  // Tongues of a fire rising round a figure from its foot (`flameArt`:
  // the holy fire's white and gold, or the pyre's orange), staggered; in
  // the card, so they move with it.
  function flames(card, { flameArt = HOLY_FLAME, count = 5, delay = 0, tall = 0.62, duration = 900, holy = true } = {}) {
    const art = artOf(card);
    const box = boxOf(card);
    const figure = figureOf(art);
    const x = art.x + art.width / 2 - box.x;
    const foot = Math.min(box.height - 6, art.y + art.height + 4 - box.y);
    for (let k = 0; k < count; k++) {
      const share = count > 1 ? k / (count - 1) - 0.5 : 0;
      const size = figure * tall * (1 - Math.abs(share) * 0.5);
      const tongue = h('span', { class: `fx-flame${holy ? ' fx-flame--holy' : ''}` });
      tongue.style.left = `${(x + share * figure * 0.9).toFixed(1)}px`;
      tongue.style.top = `${foot.toFixed(1)}px`;
      tongue.style.setProperty('--size', `${Math.round(size)}px`);
      tongue.innerHTML = flameArt;
      card.append(tongue);
      const lean = share * 16;
      animate(
        tongue,
        [
          { transform: `translate(-50%, -100%) rotate(${lean.toFixed(1)}deg) scale(0.3, 0.1)`, opacity: 0 },
          { transform: `translate(-50%, -100%) rotate(${lean.toFixed(1)}deg) scale(1, 1.1)`, opacity: 1, offset: 0.25, easing: 'ease-out' },
          { transform: `translate(-50%, -100%) rotate(${(-lean * 0.5).toFixed(1)}deg) scale(0.92, 0.95)`, opacity: 1, offset: 0.5 },
          { transform: `translate(-50%, -100%) rotate(${(lean * 0.6).toFixed(1)}deg) scale(1, 1.05)`, opacity: 0.9, offset: 0.75 },
          { transform: 'translate(-50%, -100%) rotate(0deg) scale(0.4, 0.6)', opacity: 0 },
        ],
        { duration, delay: delay + (k % 3) * 60, easing: 'ease-in-out', fill: 'backwards' },
      ).then(() => tongue.remove());
    }
  }

  // 963: the Ostateczny wyrok: the spear of holy fire (arena-fx.js
  // holySpear()) strikes and the foe is wrapped in white and gold flames
  // that rise up it and burn out, embers flying.
  function holyFire(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 90);
      ring(event.target, color, 110, 420);
      return;
    }
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const middle = figurePoint(entry.card, 0.5);
    burst(event.target, '#fff1c1', Math.round(figure * 1.1));
    flames(entry.card, { count: 5, tall: 0.7, duration: 1000 });
    flames(entry.card, { count: 3, tall: 0.95, delay: 120, duration: 900 });
    particles.burst({ x: middle.x, y: middle.y, area: { width: figure * 0.8, height: art.height * 0.6 }, count: 18, colors: ['#ffffff', '#fff1c1', '#ffd27a', '#ffb347'], angle: -Math.PI / 2, spread: 0.7, speed: [50, 140], gravity: -80, drag: 1.4, life: [500, 900], size: [1.2, 2.4], shape: 'ember' });
    animate(entry.card, [{ filter: 'brightness(2) sepia(0.5) saturate(1.6)' }, { filter: 'brightness(1.4) sepia(0.3)', offset: 0.5 }, { filter: 'brightness(1)' }], { duration: 900, easing: 'ease-out' });
    flash('#ffd27a', 0.14, 380);
  }

  // 963: the Sąd ostateczny, before its blow: the sky over the foe darkens
  // and opens in a bright circle above it (the beam comes down from there
  // as the blow lands, judgmentBeam()).
  function openHeavens(event) {
    const entry = cards.get(event.target);
    if (!entry || reduced() || !particles) return;
    const art = artOf(entry.card);
    const box = boxOf(entry.card);
    const figure = figureOf(art);
    const width = stageWidth();
    const sky = spark('fx-sky fx-sky--judgment', { x: 0, y: 0 });
    sky.style.width = `${width}px`;
    sky.style.height = `${Math.round(Math.min(stageHeight(), box.y + box.height + 30))}px`;
    animate(sky, [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0.9, offset: 0.7 }, { opacity: 0 }], { duration: 1500, easing: 'ease-out' }).then(() => sky.remove());
    const x = art.x + art.width / 2;
    const across = Math.round(Math.min(figure * 1.5, (Math.min(x, width - x) - 2) * 2));
    // (Its half height at its largest, ×1.05, kept on the stage.)
    const opening = spark('fx-heavens', { x, y: Math.max(across * 0.27 + 2, box.y - 4) }, { '--size': `${across}px` });
    animate(
      opening,
      [
        { transform: 'translate(-50%, -50%) scale(0.1, 0.05)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(0.6, 0.4)', opacity: 1, offset: 0.25 },
        { transform: 'translate(-50%, -50%) scale(1, 1)', opacity: 1, offset: 0.4, easing: 'ease-out' },
        { transform: 'translate(-50%, -50%) scale(1.05, 1.05)', opacity: 1, offset: 0.7 },
        { transform: 'translate(-50%, -50%) scale(0.8, 0.6)', opacity: 0 },
      ],
      { duration: 1300, easing: 'ease-in-out' },
    ).then(() => opening.remove());
  }

  // 963: the Sąd ostateczny's blow: a great column of white light crashes
  // down from the opened sky on the foe, a ring of light runs out over the
  // ground at its feet and the arena shakes.
  function judgmentBeam(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 90);
      ring(event.target, color, 110, 420);
      return;
    }
    const art = artOf(entry.card);
    const box = boxOf(entry.card);
    const figure = figureOf(art);
    const width = stageWidth();
    const x = art.x + art.width / 2;
    const top = 0;
    const foot = box.y + box.height - 4;
    const beam = spark('fx-judgment', { x, y: top });
    beam.style.width = `${Math.round(Math.min(box.width * 0.9, figure * 1.15, (Math.min(x, width - x) - 2) * 2))}px`;
    beam.style.height = `${Math.round(foot - top)}px`;
    animate(
      beam,
      [
        { transform: 'translate(-50%, 0) scaleY(0)', opacity: 1 },
        { transform: 'translate(-50%, 0) scaleY(1)', opacity: 1, offset: 0.12 },
        { transform: 'translate(-50%, 0) scale(1.2, 1)', opacity: 1, offset: 0.3 },
        { transform: 'translate(-50%, 0) scale(1, 1)', opacity: 0.85, offset: 0.6 },
        { transform: 'translate(-50%, 0) scale(0.3, 1)', opacity: 0 },
      ],
      { duration: 900, easing: 'ease-out' },
    ).then(() => beam.remove());
    const wave = spark('fx-shockwave', { x, y: foot }, { '--fx': '#fff3c4' });
    wave.style.width = `${Math.round(Math.min(box.width * 1.6, (Math.min(x, width - x) - 2) * 2))}px`;
    animate(
      wave,
      [
        { transform: 'translate(-50%, -50%) scale(0.15)', opacity: 1 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
      ],
      { duration: 520, easing: 'ease-out' },
    ).then(() => wave.remove());
    particles.burst({ x, y: foot, area: { width: figure, height: 6 }, count: 14, colors: HOLY, angle: -Math.PI / 2, spread: 1.2, speed: [80, 220], drag: 2.4, life: [300, 600], size: [1.2, 2.2], shape: 'spark' });
    particles.burst({ x, y: art.y + art.height * 0.5, area: { width: figure * 0.6, height: art.height * 0.8 }, count: 12, colors: ['#ffffff', '#fff6cf'], angle: -Math.PI / 2, spread: 0.3, speed: [120, 260], drag: 1.5, life: [400, 700], size: [1, 1.8], shape: 'mote' });
    animate(entry.card, [{ filter: 'brightness(2.8) saturate(0.2)' }, { filter: 'brightness(1)' }], { duration: 700, easing: 'ease-out' });
    flash('#ffffff', 0.28, 420);
    shake(5.5, 460);
  }

  // A seal of holiness over a foe's forehead, pressed on or burning.
  function sealMark(card, { scale = 1, from = 1.8, duration = 1700, delay = 0 } = {}) {
    const art = artOf(card);
    const figure = figureOf(art);
    const size = Math.round(figure * 0.46 * scale);
    const point = { x: art.x + art.width / 2, y: Math.max(size / 2 + 2, art.y + art.height * 0.3) };
    const seal = spark('fx-seal', point, { '--size': `${size}px` });
    seal.innerHTML = SEAL;
    animate(
      seal,
      [
        { transform: `translate(-50%, -50%) scale(${from})`, opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.1, easing: 'ease-in' },
        { transform: 'translate(-50%, -50%) scale(1.06)', opacity: 1, offset: 0.16 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.24 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.85, offset: 0.8 },
        { transform: 'translate(-50%, -50%) scale(0.96)', opacity: 0 },
      ],
      { duration, delay, easing: 'ease-out', fill: 'backwards' },
    ).then(() => seal.remove());
    return { point, seal };
  }

  // 963: the Pieczęć świętości's blow: a burning seal is pressed onto the
  // foe's forehead with a thud, and stays there, glowing.
  function sealStamp(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 70);
      return;
    }
    const { point, seal } = sealMark(entry.card);
    after(170, seal, () => {
      particles.burst({ x: point.x, y: point.y, count: 12, colors: ['#ffffff', '#ffd27a', '#ff8a3d'], speed: [80, 180], drag: 3, life: [260, 480], size: [1.1, 2], shape: 'spark' });
      animate(entry.card, [{ filter: 'brightness(1.8) sepia(0.5)' }, { filter: 'brightness(1)' }], { duration: 420, easing: 'ease-out' });
      shake(2.4, 260);
    });
  }

  // 963: the Pieczęć świętości takes hold (a 'skill' event on its foe): the
  // seal flares on its forehead and a crimson ring closes round the foe:
  // no wound of it will heal.
  async function sealBurn(event, color) {
    const entry = cards.get(event.targets[0]);
    if (!entry) return;
    if (reduced() || !particles) {
      await ring(event.targets[0], color, 110, 520);
      return;
    }
    const box = boxOf(entry.card);
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const width = stageWidth();
    const { point } = sealMark(entry.card, { scale: 1.1, from: 1.3, duration: 1300 });
    particles.burst({ x: point.x, y: point.y, count: 10, colors: ['#ffd27a', '#ff8a3d', '#b3263b'], angle: -Math.PI / 2, spread: 0.8, speed: [30, 90], gravity: -60, drag: 1.4, life: [500, 800], size: [1.1, 2], shape: 'ember' });
    const x = art.x + art.width / 2;
    const across = Math.round(Math.min(box.width * 1.02, figure * 1.6, (Math.min(x, width - x) - 2) * 2));
    const bind = spark('fx-bind', figurePoint(entry.card, 0.55), { '--size': `${across}px` });
    animate(
      bind,
      [
        { transform: 'translate(-50%, -50%) scale(1.25)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.35, easing: 'ease-in' },
        { transform: 'translate(-50%, -50%) scale(0.92)', opacity: 0.9, offset: 0.6 },
        { transform: 'translate(-50%, -50%) scale(0.86)', opacity: 0 },
      ],
      { duration: 900, easing: 'ease-out' },
    ).then(() => bind.remove());
    tintCard(entry.card, '#b3263b', [{ opacity: 0 }, { opacity: 0.35, offset: 0.4 }, { opacity: 0 }], 800);
    await wait(900);
  }

  // 963: the Święte światło: the Święty blazes like a sun, the arena turns
  // white, and its light runs out in beams: to every foe, which burns, and
  // to every card of the party, which glows.
  async function holyLight(event, color, targets) {
    const entry = cards.get(event.actor);
    const foes = reached(event, targets).map((id) => cards.get(id)).filter(Boolean);
    if (!entry || reduced() || !particles) {
      await beams(color, targets);
      return;
    }
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const width = stageWidth();
    const middle = figurePoint(entry.card, 0.45);
    const size = Math.round(Math.min(figure * 1.6, (Math.min(middle.x, width - middle.x) - 2) * 2, (Math.min(middle.y, stageHeight() - middle.y) - 2) * 2));
    const sun = spark('fx-sun', middle, { '--size': `${size}px` });
    sun.innerHTML = SUN;
    animate(
      sun,
      [
        { transform: 'translate(-50%, -50%) scale(0.2) rotate(0deg)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(40deg)', opacity: 1, offset: 0.3, easing: 'ease-out' },
        { transform: 'translate(-50%, -50%) scale(1.05) rotate(80deg)', opacity: 1, offset: 0.7 },
        { transform: 'translate(-50%, -50%) scale(0.9) rotate(100deg)', opacity: 0 },
      ],
      { duration: 1200, easing: 'linear' },
    ).then(() => sun.remove());
    const mark = anchor(1300);
    after(300, mark, () => {
      flash('#fffdf2', 0.32, 460);
      const beamTo = (card, warm) => {
        const to = figurePoint(card, 0.45);
        const dx = to.x - middle.x;
        const dy = to.y - middle.y;
        const line = spark(`fx-sunbeam${warm ? ' fx-sunbeam--warm' : ''}`, middle);
        line.style.width = `${Math.round(Math.hypot(dx, dy))}px`;
        const along = `rotate(${Math.atan2(dy, dx).toFixed(4)}rad)`;
        animate(
          line,
          [
            { transform: `${along} scaleX(0)`, opacity: 1 },
            { transform: `${along} scaleX(1)`, opacity: 1, offset: 0.3 },
            { transform: `${along} scaleX(1) scaleY(0.4)`, opacity: 0 },
          ],
          { duration: 520, easing: 'ease-out' },
        ).then(() => line.remove());
      };
      for (const foe of foes) {
        beamTo(foe.card, false);
        after(150, mark, () => {
          const point = figurePoint(foe.card, 0.5);
          const foeArt = artOf(foe.card);
          animate(foe.card, [{ filter: 'brightness(2.3) sepia(0.6) saturate(1.8)' }, { filter: 'brightness(1)' }], { duration: 600, easing: 'ease-out' });
          particles.burst({ x: point.x, y: point.y, area: { width: figureOf(foeArt) * 0.6, height: foeArt.height * 0.5 }, count: 8, colors: SMOKE, angle: -Math.PI / 2, spread: 0.5, speed: [20, 60], gravity: -40, drag: 1.6, life: [600, 900], size: [3, 5], shape: 'dust' });
          particles.burst({ x: point.x, y: point.y, count: 10, colors: ['#fff1c1', '#ffd27a', '#ff8a3d'], angle: -Math.PI / 2, spread: 1, speed: [40, 120], gravity: -60, drag: 1.4, life: [400, 700], size: [1.1, 2.2], shape: 'ember' });
        });
      }
      for (const member of standing(entry.unit.side)) {
        if (member === entry) continue;
        beamTo(member.card, true);
        after(150, mark, () => tintCard(member.card, '#fff3b0', [{ opacity: 0 }, { opacity: 0.4, offset: 0.3 }, { opacity: 0 }], 600));
      }
    });
    await wait(900);
  }

  // The Święte światło's heals of the party: a warm glint on the card.
  async function sunTick(event, color) {
    const entry = cards.get(event.target);
    if (!entry || reduced() || !particles) {
      await plainHeal(event, color);
      return;
    }
    healed(event);
    const art = artOf(entry.card);
    twinkle({ x: art.x + art.width / 2 - figureOf(art) * 0.2, y: art.y + art.height * 0.3 }, '#fff3b0', 16);
    await wait(300);
  }

  // 963: the Stos lit: a holy flame rises over the Wielki Inkwizytor's
  // head and embers fly off it.
  async function lightPyre(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await aura(id, color, 1);
      return;
    }
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const head = { x: art.x + art.width / 2, y: art.y + art.height * 0.3 };
    const size = Math.round(figure * 0.6);
    const torch = spark('fx-flame fx-flame--holy', head, { '--size': `${size}px` });
    torch.innerHTML = HOLY_FLAME;
    animate(
      torch,
      [
        { transform: 'translate(-50%, -100%) scale(0.2)', opacity: 0 },
        { transform: 'translate(-50%, -100%) scale(1.1)', opacity: 1, offset: 0.3, easing: 'ease-out' },
        { transform: 'translate(-50%, -100%) scale(0.95, 1.05)', opacity: 1, offset: 0.55 },
        { transform: 'translate(-50%, -100%) scale(1.05, 0.95)', opacity: 1, offset: 0.75 },
        { transform: 'translate(-50%, -100%) scale(0.5)', opacity: 0 },
      ],
      { duration: 1000, easing: 'ease-in-out' },
    ).then(() => torch.remove());
    particles.burst({ x: head.x, y: head.y - size * 0.5, count: 12, colors: ['#ffffff', '#fff1c1', '#ffd27a', '#ffb347'], angle: -Math.PI / 2, spread: 0.6, speed: [40, 110], gravity: -60, drag: 1.4, life: [500, 800], size: [1.1, 2], shape: 'ember' });
    tintCard(entry.card, '#ffb347', [{ opacity: 0 }, { opacity: 0.35, offset: 0.3 }, { opacity: 0 }], 800);
    await wait(900);
  }

  // 963: the Stos burning, every move: under every foe it reaches a pyre of
  // logs appears at its feet and flames rise from it up the foe, embers
  // and smoke flying.
  async function pyreFire(event, color, targets) {
    const foes = reached(event, targets).map((id) => cards.get(id)).filter(Boolean);
    if (foes.length === 0 || reduced() || !particles) {
      await beams(color, targets);
      return;
    }
    const mark = anchor(1200);
    foes.forEach((foe, index) => {
      const box = boxOf(foe.card);
      const art = artOf(foe.card);
      const figure = figureOf(art);
      const x = art.x + art.width / 2;
      // The logs at its figure's feet, over the bottom of its picture (its
      // name under it stays readable).
      const foot = art.y + art.height - 2;
      const delay = index * 70;
      const logs = spark('fx-logs', { x, y: foot }, { '--size': `${Math.round(figure * 0.72)}px` });
      logs.innerHTML = LOGS;
      animate(
        logs,
        [
          { transform: 'translate(-50%, -80%) scale(0.6)', opacity: 0 },
          { transform: 'translate(-50%, -80%) scale(1)', opacity: 1, offset: 0.15, easing: 'ease-out' },
          { transform: 'translate(-50%, -80%) scale(1)', opacity: 1, offset: 0.8 },
          { transform: 'translate(-50%, -80%) scale(1)', opacity: 0 },
        ],
        { duration: 1100, delay, fill: 'backwards' },
      ).then(() => logs.remove());
      flames(foe.card, { flameArt: FLAME, count: 4, tall: 0.62, delay: delay + 120, duration: 880, holy: false });
      after(delay + 180, mark, () => {
        animate(foe.card, [{ filter: 'brightness(1.8) sepia(0.6) saturate(2)' }, { filter: 'brightness(1)' }], { duration: 700, easing: 'ease-out' });
        particles.burst({ x, y: foot - 10, area: { width: figure * 0.7, height: 6 }, count: 10, colors: FIRE, angle: -Math.PI / 2, spread: 0.5, speed: [60, 140], gravity: -70, drag: 1.4, life: [500, 850], size: [1.2, 2.2], shape: 'ember' });
        particles.burst({ x, y: art.y + art.height * 0.3, area: { width: figure * 0.6, height: 10 }, count: 5, colors: SMOKE, angle: -Math.PI / 2, spread: 0.4, speed: [20, 50], gravity: -40, drag: 1.6, life: [700, 1000], size: [3.5, 6], shape: 'dust' });
      });
    });
    await wait(900 + foes.length * 70);
  }

  // What plays when a skill wakes (a 'skill' event), or when a sweep starts:
  // the skill's own sound, or a plain one while it has none.
  // ——— 964: the evolved Cień's skills in looks of their own ———

  // A pool of shadow opening on the ground at a card's foot.
  function shadowPool(card, delay = 0, duration = 700) {
    const box = boxOf(card);
    const art = artOf(card);
    const width = stageWidth();
    const x = art.x + art.width / 2;
    const size = Math.round(Math.min(box.width, figureOf(art) * 1.5, (Math.min(x, width - x) - 2) * 2));
    const pool = spark('fx-pool', { x, y: art.y + art.height - 4 }, { '--size': `${size}px` });
    return animate(
      pool,
      [
        { transform: 'translate(-50%, -50%) scale(0.1)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.35, easing: 'ease-out' },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.9, offset: 0.7 },
        { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0 },
      ],
      { duration, delay, fill: 'backwards' },
    ).then(() => pool.remove());
  }

  // 964: the Egzekucja, before its blow: the Skrytobójca sinks into a pool
  // of shadow and one opens under its victim, at the back.
  function sinkIn(event) {
    const actor = cards.get(event.actor);
    const target = cards.get(event.target);
    if (!actor || !target || reduced() || !particles) return;
    shadowPool(actor.card, 0, 700);
    shadowPool(target.card, 40, 980);
    const art = artOf(target.card);
    particles.burst({ x: art.x + art.width / 2, y: art.y + art.height - 4, area: { width: figureOf(art) * 0.8, height: 4 }, count: 8, colors: SHADE, angle: -Math.PI / 2, spread: 0.5, speed: [20, 60], gravity: -40, drag: 1.6, life: [500, 800], size: [3, 5], shape: 'dust' });
  }

  // 964: the Egzekucja's blow: the blade comes down on its victim like an
  // executioner's: one vertical cut from above, the foe jolted down, a dark
  // flash and violet shards.
  function chop(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 80);
      return;
    }
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const point = figurePoint(entry.card, 0.5);
    cutAt(point, 90, Math.min(art.height * 1.5, figure * 1.6), color, { duration: 480, bend: 2, width: 1.9 });
    animate(entry.card, [{ transform: 'translateY(0px)' }, { transform: 'translateY(6px)', offset: 0.2 }, { transform: 'translateY(0px)' }], { duration: 320, easing: 'ease-out', composite: 'add' });
    burst(event.target, '#4b3a73', Math.round(figure * 0.9));
    particles.burst({ x: point.x, y: point.y, count: 14, colors: SHADE_SPARKS, angle: Math.PI / 2, spread: 0.9, speed: [120, 260], life: [260, 480], size: [1.4, 2.6], shape: 'shard', drag: 3, gravity: 260 });
    shake(3, 300, true);
  }

  // 964: the Ścięcie, before its blow: a thin line of light runs across its
  // victim where the cut will fall.
  function markCut(event) {
    const entry = cards.get(event.target);
    if (!entry || reduced() || !particles) return;
    const art = artOf(entry.card);
    const x = art.x + art.width / 2;
    const line = spark('fx-cutline', { x, y: art.y + art.height * 0.36 });
    line.style.width = `${Math.round(Math.min(figureOf(art) * 1.55, (Math.min(x, stageWidth() - x) - 3) * 2))}px`;
    animate(
      line,
      [
        { transform: 'translate(-50%, -50%) scaleX(0)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scaleX(1)', opacity: 0.9, offset: 0.4 },
        { transform: 'translate(-50%, -50%) scaleX(1)', opacity: 0.7, offset: 0.85 },
        { transform: 'translate(-50%, -50%) scaleX(1)', opacity: 0 },
      ],
      { duration: 520, easing: 'ease-out' },
    ).then(() => line.remove());
  }

  // 964: the Ścięcie's blow: one clean cut across the foe at a stroke, the
  // part of its picture above the cut sliding along it and back, sparks
  // along the line.
  function behead(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 80);
      return;
    }
    const card = entry.card;
    const art = artOf(card);
    const figure = figureOf(art);
    const y = art.y + art.height * 0.36;
    const x = art.x + art.width / 2;
    // Wider than the figure, so it shows on both sides of the numbers.
    const span = Math.min(figure * 1.55, (Math.min(x, stageWidth() - x) - 3) * 2);
    const actor = cards.get(event.actor);
    const way = actor && centerOf(actor.card).x > x ? -1 : 1;
    cutAt({ x, y }, way > 0 ? 0 : 180, span, color, { duration: 560, bend: 1.5, width: 1.3 });
    // The picture above the cut slides along it.
    const picture = card.querySelector('.unit-art img, .unit-art svg');
    if (picture) {
      const box = boxOf(picture);
      const share = Math.min(0.95, Math.max(0.05, (y - box.y) / box.height));
      const top = picture.cloneNode(true);
      top.removeAttribute('id');
      top.setAttribute('aria-hidden', 'true');
      top.classList.add('fx-severed');
      const cardBox = boxOf(card);
      top.style.left = `${(box.x - cardBox.x - card.clientLeft).toFixed(1)}px`;
      top.style.top = `${(box.y - cardBox.y - card.clientTop).toFixed(1)}px`;
      top.style.width = `${box.width.toFixed(1)}px`;
      top.style.height = `${box.height.toFixed(1)}px`;
      top.style.clipPath = `inset(0 0 ${((1 - share) * 100).toFixed(1)}% 0)`;
      card.append(top);
      const shift = way * Math.min(12, figure * 0.15);
      animate(top, [{ transform: 'translate(0px, 0px)' }, { transform: `translate(${shift.toFixed(1)}px, -2px)`, offset: 0.25, easing: 'ease-out' }, { transform: `translate(${shift.toFixed(1)}px, -2px)`, offset: 0.7 }, { transform: 'translate(0px, 0px)' }], { duration: 760, easing: 'ease-in-out' }).then(() => top.remove());
      animate(picture, [{ clipPath: `inset(${(share * 100).toFixed(1)}% 0 0 0)` }, { clipPath: `inset(${(share * 100).toFixed(1)}% 0 0 0)` }], { duration: 760 });
    }
    particles.burst({ x, y, area: { width: span * 0.8, height: 3 }, count: 16, colors: ['#ffffff', '#e8deff', color], angle: way > 0 ? 0 : Math.PI, spread: 0.4, speed: [140, 300], life: [200, 380], size: [1.1, 2], shape: 'spark', drag: 3.5 });
    animate(card, [{ filter: 'brightness(1.8) saturate(0.6)' }, { filter: 'brightness(1)' }], { duration: 420, easing: 'ease-out' });
  }

  // 964: the Cios ostateczny, before its blow: time stops: the arena goes
  // grey (its cards behind a grey veil) while the blow comes.
  function stillTime(event) {
    if (reduced() || !particles) return;
    const veil = spark('fx-timestop', { x: 0, y: 0 });
    veil.style.width = `${stageWidth()}px`;
    veil.style.height = `${stageHeight()}px`;
    animate(veil, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 1150, easing: 'ease-in-out' }).then(() => veil.remove());
    const target = cards.get(event.target);
    if (target) after(120, veil, () => rimGlow(target.card, '#d6c2ff', 700));
  }

  // 964: the Cios ostateczny's blow: a huge crescent of black and violet
  // light cleaves its victim and the colours come back in a white flash.
  function finalCleave(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 90);
      return;
    }
    const box = boxOf(entry.card);
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const width = stageWidth();
    const point = figurePoint(entry.card, 0.5);
    const size = Math.round(Math.min(figure * 1.9, box.width * 1.2, (Math.min(point.x, width - point.x) - 2) * 2, (Math.min(point.y, stageHeight() - point.y) - 2) * 2));
    const cleave = spark('fx-cleave', point, { '--fx': color, '--size': `${size}px` });
    cleave.innerHTML = SHADOW_SLASH;
    animate(
      cleave,
      [
        { transform: 'translate(-50%, -50%) rotate(-20deg) scale(0.9)', clipPath: 'inset(0 100% 0 0)', opacity: 1 },
        { transform: 'translate(-50%, -50%) rotate(-20deg) scale(1)', clipPath: 'inset(0 0% 0 0)', opacity: 1, offset: 0.18 },
        { transform: 'translate(-50%, -50%) rotate(-20deg) scale(1.03)', clipPath: 'inset(0 0% 0 0)', opacity: 1, offset: 0.55 },
        { transform: 'translate(-50%, -50%) rotate(-20deg) scale(1.08)', clipPath: 'inset(0 0% 0 0)', opacity: 0 },
      ],
      { duration: 640, easing: 'ease-out' },
    ).then(() => cleave.remove());
    flash('#ffffff', 0.3, 360);
    burst(event.target, '#2a2040', Math.round(figure * 1.3));
    particles.burst({ x: point.x, y: point.y, count: 18, colors: SHADE_SPARKS, speed: [140, 320], life: [260, 520], size: [1.4, 2.6], shape: 'shard', drag: 3, gravity: 160 });
    particles.burst({ x: point.x, y: point.y, count: 8, colors: SHADE, speed: [30, 90], life: [600, 900], size: [4, 7], shape: 'dust', gravity: -30, drag: 2 });
    shake(4.5, 380);
  }

  // 964: the Znak śmierci: an hourglass of violet light is pressed over the
  // foe, its sand starting to run: it counts the wounds the foe takes.
  async function deathMark(event, color) {
    const entry = cards.get(event.targets[0]);
    if (!entry) return;
    if (reduced() || !particles) {
      await ring(event.targets[0], color, 90, 520);
      return;
    }
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const height = Math.round(figure * 0.74);
    const point = { x: art.x + art.width / 2, y: Math.max(height / 2 + 2, art.y + art.height * 0.42) };
    const glass = spark('fx-hourglass', point, { '--fx': color, '--size': `${height}px` });
    glass.innerHTML = HOURGLASS;
    const top = glass.querySelector('.fx-sand-top');
    const bottom = glass.querySelector('.fx-sand-bottom');
    animate(top, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.45)' }], { duration: 1100, delay: 300, fill: 'both' });
    animate(bottom, [{ transform: 'scaleY(0.2)' }, { transform: 'scaleY(1)' }], { duration: 1100, delay: 300, fill: 'both' });
    animate(
      glass,
      [
        { transform: 'translate(-50%, -50%) scale(1.6) rotate(-20deg)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1, offset: 0.18, easing: 'ease-out' },
        { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1, offset: 0.82 },
        { transform: 'translate(-50%, -50%) scale(0.7) rotate(0deg)', opacity: 0 },
      ],
      { duration: 1500, easing: 'ease-in-out' },
    ).then(() => glass.remove());
    after(260, glass, () => {
      ring(event.targets[0], color, Math.round(figure * 1.2), 480);
      tintCard(entry.card, '#4b3a73', [{ opacity: 0 }, { opacity: 0.4, offset: 0.3 }, { opacity: 0 }], 700);
    });
    await wait(1300);
  }

  // 964: the Znak śmierci strikes back: before the wounds it counted open
  // again, its hourglass comes back over the foe, turns over and bursts
  // (arena.js waits for it before the blow lands).
  function echoGlass(event, color) {
    const entry = cards.get(event.target);
    if (!entry || reduced() || !particles) return;
    const figure = figureOf(artOf(entry.card));
    const glass = spark('fx-hourglass', figurePoint(entry.card, 0.45), { '--fx': color, '--size': `${Math.round(figure * 0.62)}px` });
    glass.innerHTML = HOURGLASS;
    animate(
      glass,
      [
        { transform: 'translate(-50%, -50%) scale(0.7) rotate(0deg)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1, offset: 0.25, easing: 'ease-in-out' },
        { transform: 'translate(-50%, -50%) scale(1) rotate(180deg)', opacity: 1, offset: 0.72, easing: 'ease-in' },
        { transform: 'translate(-50%, -50%) scale(1.6) rotate(180deg)', opacity: 0 },
      ],
      { duration: 400 },
    ).then(() => glass.remove());
  }

  // 964: the Znak śmierci's wounds open again at once as its hourglass
  // bursts: violet cuts flash over the foe side by side, and shards fly.
  function deathEcho(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 70);
      return;
    }
    const figure = figureOf(artOf(entry.card));
    const point = figurePoint(entry.card, 0.45);
    particles.burst({ x: point.x, y: point.y, count: 14, colors: ['#e8d8ff', color, '#ffffff'], speed: [120, 260], life: [260, 460], size: [1.3, 2.4], shape: 'shard', drag: 3, gravity: 200 });
    for (const [k, shift] of [-0.22, 0, 0.22].entries()) {
      cutAt({ x: point.x + shift * figure, y: point.y + shift * figure * 0.3 }, 62, figure * 0.9, color, { delay: k * 40, duration: 360, bend: 4, width: 0.9 });
    }
    animate(entry.card, [{ filter: 'brightness(0.5) saturate(1.6)' }, { filter: 'brightness(1)' }], { duration: 480, easing: 'ease-out' });
  }

  // 964: the Czarny jad: a vial of black venom tips over the Truciciel's
  // figure from its shoulder and pours it out over it: a black stream,
  // black drops splashing, dark fumes, the figure darkening with it.
  async function blackVenom(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await Promise.all([specks(id, color, { rise: false }), aura(id, color, 1)]);
      return;
    }
    const card = entry.card;
    const art = artOf(card);
    const figure = figureOf(art);
    const x = art.x + art.width / 2;
    const size = Math.round(figure * 0.5);
    const center = { x: x + figure * 0.3, y: art.y + art.height * 0.24 };
    // Tipped over to the left, its neck points down at the figure.
    const tilt = -118;
    const neck = size * 0.6;
    const mouth = { x: center.x + neck * Math.sin((tilt * Math.PI) / 180), y: center.y - neck * Math.cos((tilt * Math.PI) / 180) };
    const vial = spark('fx-vial', center, { '--size': `${size}px` });
    vial.innerHTML = VIAL;
    animate(
      vial,
      [
        { transform: 'translate(-50%, -50%) translateY(-12px) rotate(0deg)', opacity: 0 },
        { transform: 'translate(-50%, -50%) rotate(0deg)', opacity: 1, offset: 0.16 },
        { transform: `translate(-50%, -50%) rotate(${tilt}deg)`, opacity: 1, offset: 0.36, easing: 'ease-in-out' },
        { transform: `translate(-50%, -50%) rotate(${tilt}deg)`, opacity: 1, offset: 0.8 },
        { transform: `translate(-50%, -50%) rotate(${tilt}deg) translateY(-6px)`, opacity: 0 },
      ],
      { duration: 1500, easing: 'ease-in-out' },
    ).then(() => vial.remove());
    // The black stream, from its neck down over the figure.
    const foot = { x: mouth.x, y: art.y + art.height * 0.86 };
    const stream = spark('fx-blackstream', mouth);
    stream.style.height = `${Math.round(Math.max(10, foot.y - mouth.y))}px`;
    animate(
      stream,
      [
        { transform: 'translateX(-50%) scaleY(0)', opacity: 0 },
        { transform: 'translateX(-50%) scaleY(0)', opacity: 1, offset: 0.34 },
        { transform: 'translateX(-50%) scaleY(1)', opacity: 1, offset: 0.46, easing: 'ease-in' },
        { transform: 'translateX(-50%) scaleY(1)', opacity: 1, offset: 0.78 },
        { transform: 'translateX(-50%) translateY(10px) scaleY(0.3)', opacity: 0 },
      ],
      { duration: 1500 },
    ).then(() => stream.remove());
    // Where it falls: black drops splashing, a black pool spreading, fumes.
    const pool = spark('fx-pool fx-pool--venom', foot, { '--size': `${Math.round(figure * 0.7)}px` });
    animate(
      pool,
      [
        { transform: 'translate(-50%, -50%) scale(0)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(0)', opacity: 1, offset: 0.46 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.66, easing: 'ease-out' },
        { transform: 'translate(-50%, -50%) scale(1.05)', opacity: 0.9, offset: 0.85 },
        { transform: 'translate(-50%, -50%) scale(1.1)', opacity: 0 },
      ],
      { duration: 1500 },
    ).then(() => pool.remove());
    for (const delay of [700, 880, 1060]) {
      after(delay, vial, () => {
        particles.burst({ x: foot.x, y: foot.y, count: 8, colors: ['#0f1609', '#1d2a14', '#2e3d1e'], angle: -Math.PI / 2, spread: 1.2, speed: [50, 120], gravity: 420, drag: 1, life: [300, 500], size: [1.4, 2.4], shape: 'drop' });
        particles.burst({ x: foot.x, y: foot.y - 6, area: { width: figure * 0.6, height: 6 }, count: 4, colors: ['#2a3a1a', '#3a4a26', '#1d2a14'], angle: -Math.PI / 2, spread: 0.4, speed: [20, 50], gravity: -40, drag: 1.4, life: [700, 1000], size: [4, 7], shape: 'dust' });
      });
    }
    after(720, vial, () => tintCard(card, '#2e4a12', [{ opacity: 0 }, { opacity: 0.55, offset: 0.3 }, { opacity: 0 }], 900));
    await wait(1450);
  }

  // 964: the Trujący Szlam's coming: a puddle of venom spreads on the
  // ground where it will stand, bubbling, and the slime oozes up out of it.
  function slimeOut({ entry, card, box, art, figure, x, ground, circle }) {
    const puddle = spark('fx-puddle', { x, y: ground }, { '--size': `${Math.round(Math.min(box.width * 0.96, figure * 1.5))}px` });
    animate(
      puddle,
      [
        { transform: 'translate(-50%, -50%) scale(0.1, 0.1)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.05, 1)', opacity: 1, offset: 0.25, easing: 'ease-out' },
        { transform: 'translate(-50%, -50%) scale(1, 1)', opacity: 1, offset: 0.7 },
        { transform: 'translate(-50%, -50%) scale(0.9, 0.9)', opacity: 0 },
      ],
      { duration: 1400 },
    ).then(() => puddle.remove());
    for (const [delay, count] of [
      [80, 4],
      [260, 5],
      [520, 4],
    ]) {
      after(delay, circle, () => particles.burst({ x, y: ground - 4, area: { width: figure * 0.9, height: 6 }, count, colors: ['#eaffc0', '#9ccc65'], angle: -Math.PI / 2, spread: 0.5, speed: [10, 30], rise: 10, life: [500, 800], size: [1.6, 3], shape: 'bubble', drag: 1 }));
    }
    const lift = box.height * 0.5;
    animate(
      card,
      [
        { transform: `translateY(${lift.toFixed(1)}px) scale(1.3, 0.05)`, opacity: 0, easing: 'cubic-bezier(0.3, 0.6, 0.4, 1)' },
        { transform: `translateY(${(lift * 0.3).toFixed(1)}px) scale(1.15, 0.5)`, opacity: 1, offset: 0.4 },
        { transform: 'translateY(-4px) scale(0.92, 1.1)', opacity: 1, offset: 0.7, easing: 'ease-in-out' },
        { transform: 'translateY(0px) scale(1.04, 0.96)', opacity: 1, offset: 0.85 },
        { transform: 'translateY(0px) scale(1, 1)', opacity: 1 },
      ],
      { duration: 700, delay: COMING, fill: 'backwards' },
    );
    after(COMING + 500, circle, () => {
      particles.burst({ x, y: art.y + art.height * 0.6, area: { width: figure * 0.7, height: art.height * 0.4 }, count: 8, colors: VENOM, angle: -Math.PI / 2, spread: 1.2, speed: [40, 110], gravity: 380, drag: 1, life: [360, 600], size: [1.4, 2.4], shape: 'drop' });
      aura(entry.unit.id, '#9ccc65', 1);
    });
  }

  // 964: the Wskrzeszenie's skeleton rising out of the ground in its
  // circle: the ground cracks, bones and dust fly, the card comes up from
  // under its foot with green fire.
  function riseUndead({ entry, card, box, art, figure, x, ground, circle }) {
    after(COMING - 200, circle, () => shake(2.2, 480));
    const crackWidth = Math.round(Math.min(box.width * 1.05, figure * 1.7));
    const cracks = spark('fx-cracks', { x, y: Math.min(ground + 2, stageHeight() - 2 - crackWidth * 0.2) }, { '--fx': '#8fbf5a' });
    cracks.style.width = `${crackWidth}px`;
    cracks.style.color = '#c9e8a0';
    cracks.innerHTML = CRACKS;
    animate(
      cracks,
      [
        { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.25 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.7 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
      ],
      { duration: 1100, delay: COMING - 160, easing: 'ease-out', fill: 'backwards' },
    ).then(() => cracks.remove());
    const depth = box.height + 4;
    animate(
      card,
      [
        { transform: `translateY(${depth}px)`, clipPath: `inset(0px -14px ${depth}px -14px)`, easing: 'cubic-bezier(0.25, 0.7, 0.35, 1)' },
        { transform: 'translateY(-4px)', clipPath: 'inset(-14px -14px -4px -14px)', offset: 0.8, easing: 'ease-in-out' },
        { transform: 'translateY(0px)', clipPath: 'inset(-14px -14px 0px -14px)' },
      ],
      { duration: 620, delay: COMING, fill: 'backwards' },
    );
    for (const [delay, count] of [
      [COMING, 8],
      [COMING + 180, 6],
    ]) {
      after(delay, circle, () => {
        particles.burst({ x, y: ground, area: { width: box.width * 0.7, height: 4 }, count, colors: ['#e9e4d0', '#c9c2a8', '#a39a89'], angle: -Math.PI / 2, spread: 0.9, speed: [90, 220], life: [380, 700], size: [1.6, 3], shape: 'shard', gravity: 520, drag: 1.2 });
        particles.burst({ x, y: ground, area: { width: box.width * 0.8, height: 6 }, count: Math.ceil(count / 2), colors: DUST, speed: [20, 70], life: [600, 950], size: [4, 8], shape: 'dust', gravity: -20, drag: 2 });
        particles.burst({ x, y: ground - 6, area: { width: figure * 0.7, height: 8 }, count, colors: ['#d7f5a8', '#8fbf5a', '#5f8f2e'], angle: -Math.PI / 2, spread: 0.4, speed: [40, 110], gravity: -60, drag: 1.4, life: [500, 800], size: [1.4, 2.6], shape: 'ember' });
      });
    }
    after(COMING + 520, circle, () => {
      groundRing(entry.unit.id, '#8fbf5a');
      aura(entry.unit.id, '#8fbf5a', 1);
    });
  }

  // 964: the Armia umarłych's coming: an old gravestone stands where the
  // knight will stand; the ground shakes, the stone cracks and its halves
  // fall apart, and the knight in its rusted armour climbs out of the grave
  // in two heaves, earth, dust and bones flying and rust flaking off it; a
  // pale light glints in its eye.
  function graveOut({ card, box, art, figure, x, ground, circle }) {
    const tall = Math.round(Math.min(art.height * 0.95, figure));
    const stone = spark('fx-gravestone', { x, y: art.y + art.height - tall / 2 }, { '--size': `${tall}px` });
    stone.innerHTML = GRAVESTONE;
    animate(
      stone,
      [
        { transform: 'translate(-50%, -50%) translateY(6px)', opacity: 0 },
        { transform: 'translate(-50%, -50%) translateY(0px)', opacity: 1, offset: 0.3, easing: 'ease-out' },
        { transform: 'translate(-50%, -50%) translateY(0px)', opacity: 1, offset: 0.85 },
        { transform: 'translate(-50%, -50%) translateY(0px)', opacity: 0 },
      ],
      { duration: COMING + 760 },
    ).then(() => stone.remove());
    after(COMING - 280, circle, () => shake(2.8, 560, true));
    animate(stone.querySelector('.fx-stone-crack'), [{ opacity: 0 }, { opacity: 0, offset: 0.55 }, { opacity: 1 }], { duration: COMING, fill: 'forwards' });
    for (const [half, way] of [
      [stone.querySelector('.fx-stone-left'), -1],
      [stone.querySelector('.fx-stone-right'), 1],
    ]) {
      animate(
        half,
        [
          { transform: 'rotate(0deg)', opacity: 1 },
          { transform: `rotate(${way * 30}deg)`, opacity: 1, offset: 0.6, easing: 'ease-in' },
          { transform: `rotate(${way * 44}deg) translateY(4px)`, opacity: 0 },
        ],
        { duration: 700, delay: COMING, fill: 'both' },
      );
    }
    // The open grave at its feet, over the bottom of its picture; it closes
    // once the knight is out.
    const across = Math.round(Math.min(box.width * 0.9, figure * 1.25));
    const pit = spark('fx-pit', { x, y: ground }, { '--size': `${across}px` });
    animate(
      pit,
      [
        { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0, offset: 0.21 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.33, easing: 'ease-out' },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.84 },
        { transform: 'translate(-50%, -50%) scale(0.9)', opacity: 0 },
      ],
      { duration: 1340 },
    ).then(() => pit.remove());
    // The knight climbs out of it in two heaves, swaying: its card rises
    // from the grave's line (what is under it unseen), then the rest of
    // the card (its name and HP) shows.
    const line = ground - box.y;
    const hidden = (rise) => `inset(-14px -14px ${(box.height - line + rise).toFixed(1)}px -14px)`;
    const pose = (rise, turn) => `translateY(${rise.toFixed(1)}px) rotate(${turn}deg)`;
    animate(
      card,
      [
        { transform: pose(line, 0), clipPath: hidden(line), easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' },
        { transform: pose(line * 0.45, -3), clipPath: hidden(line * 0.45), offset: 0.3 },
        { transform: pose(line * 0.4, -2), clipPath: hidden(line * 0.4), offset: 0.43, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' },
        { transform: pose(-3, 2), clipPath: hidden(-3), offset: 0.72, easing: 'ease-in-out' },
        { transform: pose(0, 0), clipPath: hidden(0), offset: 0.82, easing: 'ease-out' },
        { transform: pose(0, 0), clipPath: 'inset(-14px -14px -14px -14px)' },
      ],
      { duration: 1000, delay: COMING, fill: 'backwards' },
    );
    for (const [delay, count] of [
      [COMING, 10],
      [COMING + 320, 8],
    ]) {
      after(delay, circle, () => {
        particles.burst({ x, y: ground, area: { width: box.width * 0.7, height: 4 }, count, colors: ['#3a2e22', '#5a4632', '#4a3a28'], angle: -Math.PI / 2, spread: 1, speed: [80, 190], life: [400, 700], size: [2.4, 4], shape: 'dust', gravity: 520, drag: 1 });
        particles.burst({ x, y: ground, area: { width: box.width * 0.6, height: 4 }, count: Math.ceil(count / 2), colors: ['#efe8d8', '#d4ccb4'], angle: -Math.PI / 2, spread: 0.9, speed: [90, 210], life: [380, 650], size: [1.6, 2.8], shape: 'shard', gravity: 520, drag: 1.2 });
        particles.burst({ x, y: ground, area: { width: box.width * 0.8, height: 6 }, count: Math.ceil(count / 2), colors: DUST, speed: [20, 70], life: [650, 1000], size: [4, 8], shape: 'dust', gravity: -20, drag: 2 });
      });
    }
    after(COMING + 620, circle, () => {
      particles.burst({ x, y: art.y + art.height * 0.5, area: { width: figure * 0.6, height: art.height * 0.6 }, count: 12, colors: ['#b5652a', '#8a4a20', '#c87a3a'], angle: Math.PI / 2, spread: 0.8, speed: [10, 40], gravity: 160, drag: 1.2, life: [500, 800], size: [1.4, 2.2], shape: 'dust' });
      twinkle({ x: x + figure * 0.04, y: art.y + art.height * 0.3 }, '#e6f5b8', Math.max(10, figure * 0.2));
    });
  }

  // 964: the Armia umarłych's knight's blow, as it lunges: its broad
  // rusted sword rises over the foe and comes down on it in a heavy arc of
  // rust, landing with the blow (rustCleave()). Its hilt by the foe's head
  // on its side toward the stage's middle; raised only as high as the
  // stage leaves room for (a foe in the top row), the arc with it.
  function rustSwing(event) {
    const entry = cards.get(event.target);
    if (!entry || reduced() || !particles) return;
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const point = figurePoint(entry.card, 0.5);
    const width = stageWidth();
    const side = point.x < width / 2 ? 1 : -1;
    const length = Math.round(figure * 1.05);
    const pivot = { x: inside(point.x - side * figure * 0.4, length * 0.06, width), y: art.y + art.height * 0.2 };
    // The highest the blade may stand (its top corner 3 px under the
    // stage's top), in steps of 2 degrees, between 12 and 50.
    const top = (degrees) => length * (0.95 * Math.sin((degrees * Math.PI) / 180) + 0.135 * Math.cos((degrees * Math.PI) / 180));
    let raise = 50;
    while (raise > 12 && pivot.y - top(raise) < 3) raise -= 2;
    const blade = spark('fx-rustblade', pivot, { '--size': `${length}px` });
    blade.innerHTML = RUSTY_SWORD;
    const turn = (degrees) => `translate(-5%, -50%) scaleX(${side}) rotate(${degrees}deg)`;
    animate(
      blade,
      [
        { transform: turn(-raise + 6), opacity: 0 },
        { transform: turn(-raise), opacity: 1, offset: 0.12 },
        { transform: turn(-raise + 4), opacity: 1, offset: 0.3, easing: 'cubic-bezier(0.55, 0, 0.9, 0.5)' },
        { transform: turn(82), opacity: 1, offset: 0.56, easing: 'ease-out' },
        { transform: turn(86), opacity: 1, offset: 0.78 },
        { transform: turn(88), opacity: 0 },
      ],
      { duration: 520 },
    ).then(() => blade.remove());
    // The arc of rust it leaves, drawn over the stage round its hilt.
    const height = stageHeight();
    const arc = spark('fx-rustarc', { x: 0, y: 0 });
    arc.style.width = `${width}px`;
    arc.style.height = `${height}px`;
    const at = (degrees, radius) => {
      const angle = (degrees * Math.PI) / 180;
      return `${(pivot.x + side * Math.cos(angle) * radius).toFixed(1)} ${(pivot.y + Math.sin(angle) * radius).toFixed(1)}`;
    };
    const sweep = side > 0 ? 1 : 0;
    const band = (radius, stroke, extra) =>
      `<path d="M${at(-raise + 4, radius)}A${radius.toFixed(1)} ${radius.toFixed(1)} 0 0 ${sweep} ${at(82, radius)}" stroke-width="${stroke.toFixed(1)}" ${extra} pathLength="100" stroke-dasharray="100 100" stroke-dashoffset="100"/>`;
    arc.innerHTML =
      `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true"><g fill="none" stroke-linecap="butt">` +
      band(length * 0.76, length * 0.28, 'stroke="#c8803a" opacity="0.55"') +
      band(length * 0.88, Math.max(1.4, length * 0.048), 'stroke="#f0c890"') +
      '</g></svg>';
    for (const line of arc.querySelectorAll('path')) {
      animate(line, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duration: 135, delay: 156, easing: 'cubic-bezier(0.55, 0, 0.9, 0.5)', fill: 'both' });
    }
    animate(arc, [{ opacity: 1 }, { opacity: 1, offset: 0.62 }, { opacity: 0 }], { duration: 560 }).then(() => arc.remove());
  }

  // 964: the knight's blow lands: green venom sprays from the wound, dust
  // flies, the foe is driven down.
  function rustCleave(event) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, '#c8803a', 80);
      return;
    }
    const card = entry.card;
    const figure = figureOf(artOf(card));
    const point = figurePoint(card, 0.5);
    const side = point.x < stageWidth() / 2 ? 1 : -1;
    particles.burst({ x: point.x, y: point.y, count: 16, colors: VENOM, angle: side > 0 ? Math.PI * 0.3 : Math.PI * 0.7, spread: 1, speed: [80, 200], gravity: 420, drag: 1.2, life: [380, 640], size: [1.4, 2.6], shape: 'drop' });
    particles.burst({ x: point.x, y: point.y + figure * 0.2, area: { width: figure * 0.5, height: 6 }, count: 6, colors: DUST, speed: [20, 70], gravity: -20, drag: 2, life: [600, 900], size: [4, 7], shape: 'dust' });
    drop({ x: point.x, y: point.y + 4 }, boxOf(card), 0);
    animate(card, [{ filter: 'brightness(1.5) sepia(0.4)' }, { filter: 'brightness(1)' }], { duration: 380, easing: 'ease-out' });
    shake(3, 300, true);
  }

  // A glob of green venom flying in an arc from a point to a foe and
  // splattering on it, dripping (`delay` before it flies).
  async function globTo(from, target, size, delay = 0) {
    const to = figurePoint(target.card, 0.45);
    const peak = { x: (from.x + to.x) / 2, y: Math.max(8, Math.min(from.y, to.y) - 40) };
    const glob = spark('fx-glob', { x: 0, y: 0 }, { '--size': `${size}px` });
    const frames = Array.from({ length: 11 }, (_, step) => {
      const point = curve(from, peak, to, step / 10);
      return { transform: `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px) translate(-50%, -50%) scale(${(0.7 + Math.sin((step / 10) * Math.PI) * 0.3).toFixed(2)})`, opacity: step === 0 ? 0 : 1 };
    });
    after(delay, glob, () => particles.trail({ from, to, duration: 420, colors: VENOM, rate: 40, sizes: [1.2, 2], life: [200, 380], shape: 'drop' }));
    await animate(glob, frames, { duration: 420, delay, easing: 'linear', fill: 'backwards' });
    // (Pomiń cleared the stage: nothing lands.)
    const landed = glob.isConnected;
    glob.remove();
    if (!landed || !target.card.isConnected) return;
    const splat = spark('fx-splat', to, { '--size': `${Math.round(size * 3.2)}px` });
    animate(
      splat,
      [
        { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 1 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.95, offset: 0.25 },
        { transform: 'translate(-50%, -50%) scale(1.1)', opacity: 0 },
      ],
      { duration: 520, easing: 'ease-out' },
    ).then(() => splat.remove());
    particles.burst({ x: to.x, y: to.y, count: 12, colors: VENOM, speed: [60, 160], gravity: 380, drag: 1.2, life: [360, 600], size: [1.4, 2.4], shape: 'drop' });
    tintCard(target.card, '#9ccc65', [{ opacity: 0 }, { opacity: 0.45, offset: 0.2 }, { opacity: 0 }], 600);
    drop({ x: to.x, y: to.y + 6 }, boxOf(target.card), 0);
  }

  // 964: the Trujący Szlam's spit: it squashes and a glob of green venom
  // flies in an arc from it to its foe and splatters on it.
  async function spit(event, color) {
    const slime = cards.get(event.actor);
    const target = cards.get(event.targets[0]);
    if (!slime || !target || reduced() || !particles) {
      await Promise.all([specks(event.actor, color, { rise: false }), aura(event.actor, color, 1)]);
      return;
    }
    animate(slime.card, [{ transform: 'scale(1, 1)' }, { transform: 'scale(1.06, 0.9)', offset: 0.4 }, { transform: 'scale(1, 1)' }], { duration: 280 });
    await globTo(figurePoint(slime.card, 0.4), target, Math.round(Math.max(10, figureOf(artOf(slime.card)) * 0.2)));
    await wait(260);
  }

  // 964: the Trujący Szlam bursts as it falls: its grey card swells and
  // pops in a splash of venom, and globs of it fly onto every foe at once.
  async function slimeBurst(event, color, targets) {
    const slime = cards.get(event.actor);
    const foes = targets.map((id) => cards.get(id)).filter(Boolean);
    if (!slime || foes.length === 0 || reduced() || !particles) {
      await Promise.all([specks(event.actor, color, { rise: false }), aura(event.actor, color, 1)]);
      return;
    }
    const from = figurePoint(slime.card, 0.5);
    const figure = figureOf(artOf(slime.card));
    const mark = anchor(1400);
    animate(slime.card, [{ transform: 'scale(1)' }, { transform: 'scale(1.16, 0.86)', offset: 0.7, easing: 'ease-in' }, { transform: 'scale(1)' }], { duration: 320, composite: 'add' });
    after(240, mark, () => {
      const splash = spark('fx-splat', from, { '--size': `${Math.round(figure * 1.3)}px` });
      animate(
        splash,
        [
          { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 1 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.95, offset: 0.3 },
          { transform: 'translate(-50%, -50%) scale(1.15)', opacity: 0 },
        ],
        { duration: 620, easing: 'ease-out' },
      ).then(() => splash.remove());
      particles.burst({ x: from.x, y: from.y, count: 24, colors: VENOM, speed: [90, 230], gravity: 380, drag: 1.2, life: [400, 700], size: [1.6, 3], shape: 'drop' });
      particles.burst({ x: from.x, y: from.y, count: 8, colors: ['#eaffc0', '#9ccc65'], speed: [20, 60], rise: 20, gravity: -40, drag: 1, life: [600, 900], size: [2, 3.6], shape: 'bubble' });
    });
    await wait(260);
    if (!mark.isConnected) return;
    const size = Math.round(Math.max(10, figure * 0.2));
    await Promise.all(foes.map((foe, index) => globTo(from, foe, size, index * 50)));
    await wait(200);
  }

  // 964: the Wskrzeszenie's skeleton's blow: a green cut of its venomed
  // blade, green drops and bubbles.
  function rotCut(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 70);
      return;
    }
    const figure = figureOf(artOf(entry.card));
    const point = figurePoint(entry.card, 0.5);
    cutAt(point, -32, figure * 1.05, '#8fbf5a', { duration: 420, bend: 6, width: 0.95 });
    particles.burst({ x: point.x, y: point.y, count: 10, colors: VENOM, speed: [70, 180], gravity: 380, drag: 1.2, life: [360, 620], size: [1.3, 2.3], shape: 'drop' });
    particles.burst({ x: point.x, y: point.y, count: 6, colors: ['#d7f5a8', '#8fbf5a'], angle: -Math.PI / 2, spread: 0.8, speed: [20, 60], rise: 20, gravity: -40, drag: 1, life: [500, 800], size: [2, 3.4], shape: 'bubble' });
  }


  // The blows of a whirl in the order they land (arena.js sweepOf()), each
  // a foe's card and whether it struck; a look without them: one blow at
  // each target.
  function blowsOf(event, targets) {
    const order = event.blows ?? targets.map((target) => ({ target, hit: true }));
    return order.map((blow) => ({ ...blow, entry: cards.get(blow.target) })).filter((blow) => blow.entry);
  }

  // A streak of a shadow's dash between two points.
  function dashStreak(from, to, color, delay, duration = 220) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const line = spark('fx-dashstreak', from, { '--fx': color });
    line.style.width = `${Math.round(Math.hypot(dx, dy))}px`;
    const along = `rotate(${Math.atan2(dy, dx).toFixed(4)}rad)`;
    return animate(
      line,
      [
        { transform: `${along} scaleX(0)`, opacity: 1 },
        { transform: `${along} scaleX(1)`, opacity: 1, offset: 0.45 },
        { transform: `${along} scaleX(1) scaleY(0.3)`, opacity: 0 },
      ],
      { duration, delay, easing: 'ease-out', fill: 'backwards' },
    ).then(() => line.remove());
  }

  // A blow of a whirl landing on a foe: a violet cut (across its way, or
  // along it) and sparks, or a swish past one that dodged it.
  function whirlCut(blow, color, angle, index = 0, across = true, sparks = SHADE_SPARKS) {
    const point = figurePoint(blow.entry.card, 0.5);
    const figure = figureOf(artOf(blow.entry.card));
    if (!blow.hit) {
      particles.burst({ x: point.x, y: point.y, count: 4, colors: ['#ffffff', color], angle, spread: 0.3, speed: [160, 280], life: [140, 240], size: [1, 1.6], shape: 'spark', drag: 3 });
      return;
    }
    cutAt(point, (angle * 180) / Math.PI + (across ? 90 : 0) + (index % 2 ? -24 : 24), figure * 1.05, color, { duration: 340, bend: 6, width: 0.9 });
    particles.burst({ x: point.x, y: point.y, count: 8, colors: sparks, angle, spread: 0.6, speed: [120, 260], life: [200, 380], size: [1.2, 2.2], shape: 'spark', drag: 3.5 });
    animate(blow.entry.card, [{ filter: 'brightness(0.6) saturate(1.6)' }, { filter: 'brightness(1)' }], { duration: 280, easing: 'ease-out' });
  }

  // 964: the Wir cieni: the Nocny Tancerz vanishes into a whirl of shadow
  // on its card, then dashes as a streak of shadow from foe to foe in the
  // order its blows land, cutting each, and comes back.
  async function shadowWhirl(event, color, targets) {
    const entry = cards.get(event.actor);
    const blows = blowsOf(event, targets);
    if (!entry || blows.length === 0 || reduced() || !particles) {
      await crescent(color, targets);
      return;
    }
    const card = entry.card;
    const art = artOf(card);
    const box = boxOf(card);
    const home = figurePoint(card, 0.5);
    const across = Math.min(box.width, box.height);
    const swirl = spark('fx-swirl', { x: box.x + (box.width - across) / 2, y: box.y }, { '--fx': color });
    swirl.style.width = `${Math.round(across)}px`;
    swirl.style.height = `${Math.round(box.height)}px`;
    swirl.innerHTML = SWIRL;
    const gap = Math.max(90, Math.min(150, 600 / blows.length));
    const total = 260 + blows.length * gap + 260;
    animate(swirl.querySelector('g'), [{ transform: 'rotate(0deg)' }, { transform: 'rotate(540deg)' }], { duration: total });
    animate(swirl, [{ opacity: 0 }, { opacity: 0.95, offset: 0.15 }, { opacity: 0.8, offset: 0.85 }, { opacity: 0 }], { duration: total }).then(() => swirl.remove());
    const figureArt = card.querySelector('.unit-art img, .unit-art svg, .unit-icon');
    if (figureArt) animate(figureArt, [{ opacity: 1 }, { opacity: 0.15, offset: 0.12 }, { opacity: 0.15, offset: 0.85 }, { opacity: 1 }], { duration: total });
    let from = home;
    blows.forEach((blow, index) => {
      const to = figurePoint(blow.entry.card, 0.5);
      // Again at the same foe: it dashes in at it from another side.
      let start = from;
      if (Math.hypot(to.x - from.x, to.y - from.y) < 4) {
        const turn = 0.6 + index * 2.4;
        const reach = figureOf(artOf(blow.entry.card)) * 0.62;
        start = { x: inside(to.x + Math.cos(turn) * reach, 2, stageWidth()), y: inside(to.y + Math.sin(turn) * reach, 2, stageHeight()) };
      }
      const angle = Math.atan2(to.y - start.y, to.x - start.x);
      const delay = 260 + index * gap;
      dashStreak(start, to, color, delay, gap + 80);
      after(delay + gap * 0.6, swirl, () => whirlCut(blow, color, angle, index));
      from = to;
    });
    dashStreak(from, home, color, 260 + blows.length * gap, 220);
    after(total - 120, swirl, () => particles.burst({ x: home.x, y: home.y, area: { width: figureOf(art) * 0.7, height: art.height * 0.6 }, count: 12, colors: SHADE_SPARKS, speed: [60, 150], drag: 3, life: [300, 600], size: [1.2, 2.2], shape: 'spark' }));
    await wait(total);
  }

  // The Burza ostrzy's steel: silver blades and their glints.
  const STEEL = ['#ffffff', '#e6ecf5', '#b8c4d6'];

  // A silver blade flying from a point to another, its point ahead,
  // fading in and out on its way (`delay` before it flies).
  function steelBlade(from, to, length, delay, duration) {
    const blade = spark('fx-hblade fx-hblade--steel', { x: 0, y: 0 }, { '--size': `${length}px` });
    blade.innerHTML = SWORD;
    const turn = ((Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI).toFixed(1);
    const at = (point) => `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px) translate(-50%, -50%) rotate(${turn}deg)`;
    return animate(
      blade,
      [
        { transform: at(from), opacity: 0 },
        { transform: at({ x: from.x + (to.x - from.x) * 0.2, y: from.y + (to.y - from.y) * 0.2 }), opacity: 1, offset: 0.2 },
        { transform: at({ x: from.x + (to.x - from.x) * 0.85, y: from.y + (to.y - from.y) * 0.85 }), opacity: 1, offset: 0.85 },
        { transform: at(to), opacity: 0 },
      ],
      { duration, delay, easing: 'linear', fill: 'backwards' },
    ).then(() => blade.remove());
  }

  // 964: the Burza ostrzy: the Widmo bursts into a storm of steel: a fan of
  // silver blades shoots up out of its card as its figure fades into the
  // glitter; then the blades come down on the foes slanting like a gale,
  // one cutting each blow in the order the blows land and two more past
  // it, while others fly across their row.
  async function bladeStorm(event, color, targets) {
    const entry = cards.get(event.actor);
    const blows = blowsOf(event, targets);
    if (!entry || blows.length === 0 || reduced() || !particles) {
      await crescent(color, targets);
      return;
    }
    const card = entry.card;
    const art = artOf(card);
    const figure = figureOf(art);
    const width = stageWidth();
    const middle = figurePoint(card, 0.45);
    const length = Math.round(Math.max(28, figure * 0.62));
    const start = 380;
    const gap = Math.max(90, Math.min(140, 700 / blows.length));
    const total = start + blows.length * gap + 460;
    const mark = anchor(total + 200);
    const picture = pictureIn(card);
    if (picture) {
      animate(picture, [{ opacity: 1, filter: 'none' }, { opacity: 0.3, filter: 'grayscale(1) brightness(1.8)', offset: 0.15 }, { opacity: 0.3, filter: 'grayscale(1) brightness(1.8)', offset: 0.85 }, { opacity: 1, filter: 'none' }], { duration: total });
    }
    particles.burst({ x: middle.x, y: middle.y, area: { width: figure * 0.6, height: art.height * 0.6 }, count: 16, colors: STEEL, speed: [60, 160], drag: 2.5, life: [400, 700], size: [1.2, 2.2], shape: 'spark' });
    // The fan of blades shooting up out of its card.
    for (let k = 0; k < 7; k++) {
      const spread = (k - 3) * 0.24;
      const reach = Math.max(20, Math.min(middle.y - length * 0.6, figure * (1.5 + (k % 2) * 0.35)));
      const tip = { x: inside(middle.x + Math.sin(spread) * reach, length * 0.6, width), y: middle.y - Math.cos(spread) * reach };
      steelBlade(middle, tip, length, k * 30, 420);
    }
    // The storm: slanting down from the upper left (or right, for a foe on
    // the stage's left), each blow's blade cutting its foe.
    blows.forEach((blow, index) => {
      const foe = blow.entry.card;
      const point = figurePoint(foe, 0.45);
      const foeArt = artOf(foe);
      const way = point.x < width / 2 ? -1 : 1;
      const slant = (way * 24 * Math.PI) / 180;
      const fall = Math.min(point.y - 6, figureOf(foeArt) * 1.3);
      const delay = start + index * gap;
      // (Its start kept low enough for the whole sword to be on the
      // stage: over a foe in the top row it falls a little less far.)
      const path = (shift, below, size) => {
        const end = { x: point.x + shift, y: point.y + below };
        const from = { x: inside(end.x - Math.sin(slant) * (fall + below), size * 0.6, width), y: end.y - Math.cos(slant) * (fall + below) };
        const highest = 2 + size * 0.52;
        if (from.y < highest && end.y > highest) {
          const share = (end.y - highest) / (end.y - from.y);
          return { from: { x: end.x + (from.x - end.x) * share, y: highest }, to: end };
        }
        return { from, to: end };
      };
      const main = path(0, 0, length);
      steelBlade(main.from, main.to, length, delay, 240);
      for (const [shift, lag] of [
        [-0.42, 50],
        [0.42, 90],
      ]) {
        const past = path(shift * figureOf(foeArt), foeArt.y + foeArt.height - point.y, Math.round(length * 0.8));
        steelBlade(past.from, past.to, Math.round(length * 0.8), delay + lag, 260);
      }
      after(delay + 200, mark, () => whirlCut(blow, '#e6ecf5', Math.PI / 2 - slant, index, false, STEEL));
    });
    // Blades flying across the foes' row in the gale.
    const row = blows.map((blow) => figurePoint(blow.entry.card, 0.3).y);
    const top = Math.min(...row);
    const bottom = Math.max(...row);
    for (let k = 0; k < 4; k++) {
      const y = top + ((bottom - top + 30) * k) / 4 - 10;
      const from = { x: k % 2 ? width - length * 0.6 - 4 : length * 0.6 + 4, y };
      const to = { x: k % 2 ? length * 0.6 + 4 : width - length * 0.6 - 4, y: y + 14 };
      steelBlade(from, to, Math.round(length * 0.7), start + k * Math.round((blows.length * gap) / 4), 380);
    }
    await wait(total);
  }

  // 964: the Nawałnica cieni: the shadows tear off the ground and cut with
  // the Władca Cieni: the arena goes dark, and round every foe big black
  // shadows of the Władca peel up off the ground at once, one for each
  // blow it will take, on its sides; then, in the order the blows land,
  // each lunges in and cuts, and they all sink back into the ground.
  async function shadowLegion(event, color, targets) {
    const entry = cards.get(event.actor);
    const blows = blowsOf(event, targets);
    const source = entry?.card.querySelector('.unit-art');
    if (!entry || !source || blows.length === 0 || reduced() || !particles) {
      await crescent(color, targets);
      return;
    }
    const width = stageWidth();
    const height = stageHeight();
    const own = boxOf(source);
    const w = own.width * 1.25;
    const h = own.height * 1.25;
    const rise = 440;
    const gap = Math.max(90, Math.min(120, 760 / blows.length));
    const sink = rise + (blows.length - 1) * gap + 300;
    const life = sink + 340;
    const dark = spark('fx-flash fx-flash--dark', { x: 0, y: 0 });
    animate(dark, [{ opacity: 0 }, { opacity: 0.5, offset: 0.15 }, { opacity: 0.5, offset: 0.82 }, { opacity: 0 }], { duration: life + 100 }).then(() => dark.remove());
    // Round each foe, a side for each of its blows: left, right, then up
    // on the left and up on the right.
    const SIDES = [
      [-0.8, 0],
      [0.8, 0],
      [-0.46, -0.32],
      [0.46, -0.32],
    ];
    const taken = new Map();
    blows.forEach((blow, index) => {
      const n = taken.get(blow.target) ?? 0;
      taken.set(blow.target, n + 1);
      const [sx, sy] = SIDES[n % SIDES.length];
      const foeArt = artOf(blow.entry.card);
      const f = figureOf(foeArt);
      const foeMiddle = { x: foeArt.x + foeArt.width / 2, y: foeArt.y + foeArt.height / 2 };
      const left = Math.min(Math.max(foeMiddle.x + sx * f * 1.1 - w / 2, 2), width - 2 - w);
      const top = Math.min(Math.max(foeArt.y + foeArt.height - h + sy * f, 2 + h * 0.04), height - 2 - h);
      const shade = source.cloneNode(true);
      shade.querySelector('.unit-level')?.remove();
      shade.classList.add('fx-shade', 'fx-shade--lord');
      shade.setAttribute('aria-hidden', 'true');
      shade.style.left = `${left.toFixed(1)}px`;
      shade.style.top = `${top.toFixed(1)}px`;
      shade.style.width = `${w.toFixed(1)}px`;
      shade.style.height = `${h.toFixed(1)}px`;
      shade.style.transformOrigin = '50% 100%';
      fx.append(shade);
      const flip = left + w / 2 > foeMiddle.x ? 'scaleX(-1) ' : '';
      const reach = { x: (foeMiddle.x - (left + w / 2)) * 0.4, y: (foeMiddle.y - (top + h / 2)) * 0.4 };
      const pose = (x, y, tall) => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) ${flip}scaleY(${tall})`;
      const lunge = rise + index * gap;
      animate(
        shade,
        [
          { transform: pose(0, 0, 0.05), opacity: 0, offset: 0 },
          { transform: pose(0, 0, 1.04), opacity: 0.95, offset: (rise * 0.75) / life, easing: 'ease-out' },
          { transform: pose(0, 0, 1), opacity: 0.95, offset: lunge / life },
          { transform: pose(reach.x, reach.y, 1), opacity: 1, offset: (lunge + 110) / life, easing: 'ease-out' },
          { transform: pose(0, 0, 1), opacity: 0.95, offset: (lunge + 260) / life },
          { transform: pose(0, 0, 1), opacity: 0.95, offset: sink / life, easing: 'ease-in' },
          { transform: pose(0, 0, 0.05), opacity: 0, offset: 1 },
        ],
        { duration: life, delay: (index % 4) * 15, fill: 'backwards' },
      ).then(() => shade.remove());
      const angle = Math.atan2(reach.y, reach.x || 0.001);
      after(lunge + 110, dark, () => whirlCut(blow, color, angle, index));
    });
    after(rise * 0.5, dark, () => {
      for (const [id] of taken) {
        const foe = cards.get(id);
        if (!foe) continue;
        const foeArt = artOf(foe.card);
        particles.burst({ x: foeArt.x + foeArt.width / 2, y: foeArt.y + foeArt.height - 4, area: { width: figureOf(foeArt) * 1.4, height: 4 }, count: 8, colors: SHADE, angle: -Math.PI / 2, spread: 0.6, speed: [20, 60], gravity: -40, drag: 1.6, life: [500, 800], size: [3, 6], shape: 'dust' });
      }
    });
    await wait(life);
  }

  // 964: the Taniec ostrzy: a ring of the Nocny Tancerz's daggers appears
  // round its card and dances round it once, then sinks into it, ready to
  // fly at the foes (arena-fx.js thrownDagger()).
  async function bladeRing(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    const base = entry.unit.weapon ?? 'dagger';
    if (reduced() || !particles || !itemSprite({ base })) {
      await ghosts(id, color);
      return;
    }
    const art = artOf(entry.card);
    const box = boxOf(entry.card);
    const figure = figureOf(art);
    const middle = figurePoint(entry.card, 0.5);
    const width = stageWidth();
    const rx = Math.min(figure * 0.72, Math.min(middle.x, width - middle.x) - 14);
    const ry = Math.min(box.height * 0.5, figure * 0.72);
    const size = Math.round(Math.max(16, figure * 0.36));
    const count = 6;
    const steps = 18;
    for (let k = 0; k < count; k++) {
      const knife = spark('fx-thrown', { x: 0, y: 0 }, { '--size': `${size}px` });
      const picture = itemSprite({ base });
      picture.removeAttribute('width');
      picture.removeAttribute('height');
      picture.className = 'fx-thrown-weapon';
      knife.append(picture);
      const phase = (k / count) * Math.PI * 2;
      const frames = Array.from({ length: steps + 1 }, (_, step) => {
        const share = step / steps;
        const angle = phase + share * Math.PI * 2;
        const squeeze = share > 0.75 ? 1 - (share - 0.75) * 3.2 : 1;
        const x = middle.x + Math.cos(angle) * rx * squeeze;
        const y = middle.y + Math.sin(angle) * ry * squeeze;
        return { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) rotate(${((angle * 180) / Math.PI + 135).toFixed(0)}deg)`, opacity: step === 0 || step === steps ? 0 : 1 };
      });
      animate(knife, frames, { duration: 1100, delay: k * 40, easing: 'ease-in-out', fill: 'backwards' }).then(() => knife.remove());
    }
    const mark = anchor(1300);
    after(950, mark, () => particles.burst({ x: middle.x, y: middle.y, area: { width: figure * 0.6, height: art.height * 0.5 }, count: 12, colors: SHADE_SPARKS, speed: [60, 150], drag: 3, life: [300, 560], size: [1.2, 2.2], shape: 'spark' }));
    await Promise.all([aura(id, color, 1), wait(1200)]);
  }

  // 964: a dagger of the Taniec ostrzy lands: a violet cut where it struck.
  function daggerHit(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 60);
      return;
    }
    const point = figurePoint(entry.card, 0.5);
    const actor = cards.get(event.actor);
    const angle = actor ? Math.atan2(point.y - centerOf(actor.card).y, point.x - centerOf(actor.card).x) : 0;
    whirlCut({ entry, hit: true }, color, angle);
  }

  // The Zniknięcie's figure, faint in its card while the stance holds, and
  // the Cień-sobowtór's shadow beside it (as styles.css .unit--vanished,
  // .unit--doubled).
  const VANISHED = 'grayscale(0.5) brightness(0.55) sepia(0.6) hue-rotate(215deg)';
  const DOUBLED = 'drop-shadow(-7px 0px 0px rgba(58, 40, 104, 0.9)) drop-shadow(0px 0px 2px rgba(166, 144, 232, 0.7))';
  const pictureIn = (card) => card.querySelector('.unit-art > img, .unit-art > svg');

  // 964: the Zniknięcie: the Królobójca melts into the shadows: dark smoke
  // rises from its feet and swallows it, two violet eyes glint in it a
  // moment, and its figure stays a faint shadow in its card until the
  // stance ends (arena.js stanceDown(), stanceOver() here).
  async function fadeAway(event, color) {
    const entry = cards.get(event.actor);
    if (!entry) return;
    const card = entry.card;
    card.classList.add('unit--vanished');
    if (reduced() || !particles) {
      await aura(event.actor, color, 1);
      return;
    }
    const art = artOf(card);
    const figure = figureOf(art);
    const width = stageWidth();
    const x = art.x + art.width / 2;
    const picture = pictureIn(card);
    if (picture) {
      animate(picture, [{ opacity: 1, filter: 'none' }, { opacity: 1, filter: 'none', offset: 0.3 }, { opacity: 0.28, filter: VANISHED }], { duration: 1000, easing: 'ease-in' });
    }
    [-0.24, 0.24, 0].forEach((share, index) => {
      const size = Math.round(Math.min(figure * (index === 2 ? 1.15 : 0.85), (Math.min(x + share * figure, width - x - share * figure) - 2) * 2));
      const smoke = spark('fx-smoke', { x: x + share * figure, y: art.y + art.height * 0.82 }, { '--size': `${size}px` });
      animate(
        smoke,
        [
          { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
          { transform: `translate(-50%, -50%) translateY(${(-art.height * 0.24).toFixed(1)}px) scale(0.9)`, opacity: 0.95, offset: 0.4 },
          { transform: `translate(-50%, -50%) translateY(${(-art.height * 0.46).toFixed(1)}px) scale(1.2)`, opacity: 0 },
        ],
        { duration: 1150, delay: index * 120, easing: 'ease-out', fill: 'backwards' },
      ).then(() => smoke.remove());
    });
    particles.burst({ x, y: art.y + art.height - 6, area: { width: figure * 0.8, height: 6 }, count: 12, colors: SHADE, angle: -Math.PI / 2, spread: 0.5, speed: [20, 60], gravity: -50, drag: 1.4, life: [700, 1100], size: [3, 6], shape: 'dust' });
    // Two eyes in the dark, blinking once.
    const eyes = spark('fx-eyes', { x, y: art.y + art.height * 0.34 }, { '--size': `${Math.round(figure * 0.36)}px` });
    animate(
      eyes,
      [
        { transform: 'translate(-50%, -50%) scaleY(0.1)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scaleY(1)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, -50%) scaleY(1)', opacity: 1, offset: 0.5 },
        { transform: 'translate(-50%, -50%) scaleY(0.1)', opacity: 1, offset: 0.58 },
        { transform: 'translate(-50%, -50%) scaleY(1)', opacity: 1, offset: 0.66 },
        { transform: 'translate(-50%, -50%) scaleY(1)', opacity: 0 },
      ],
      { duration: 900, delay: 560, fill: 'backwards' },
    ).then(() => eyes.remove());
    await wait(1350);
  }

  // 964: the Cień-sobowtór: the Widmo's shadow tears off the ground: its
  // dark reflection under its feet swings up and stands beside it, black
  // water rippling round its feet, then steps into its side, where it
  // stays (a dark shadow beside its figure) until the stance ends; on each
  // of its blows it dashes out (arena-fx.js shadowDash()).
  async function doubleRise(event, color) {
    const entry = cards.get(event.actor);
    if (!entry) return;
    const card = entry.card;
    card.classList.add('unit--doubled');
    const source = card.querySelector('.unit-art');
    if (!source || reduced() || !particles) {
      await aura(event.actor, color, 1);
      return;
    }
    const art = artOf(card);
    const figure = figureOf(art);
    const width = stageWidth();
    // Beside it: on its left (its shadow's side in its card), or on its
    // right by the stage's left edge.
    const reach = figure * 0.5;
    const side = art.x - reach >= 2 ? -reach : Math.min(reach, Math.max(0, width - 2 - art.x - art.width));
    const shade = source.cloneNode(true);
    shade.querySelector('.unit-level')?.remove();
    shade.classList.add('fx-shade', 'fx-shade--double');
    shade.setAttribute('aria-hidden', 'true');
    shade.style.left = `${art.x.toFixed(1)}px`;
    shade.style.top = `${art.y.toFixed(1)}px`;
    shade.style.width = `${art.width.toFixed(1)}px`;
    shade.style.height = `${art.height.toFixed(1)}px`;
    shade.style.transformOrigin = '50% 100%';
    fx.append(shade);
    const at = `translateX(${side.toFixed(1)}px)`;
    animate(
      shade,
      [
        { transform: `${at} scaleY(-0.3)`, opacity: 0 },
        { transform: `${at} scaleY(-0.3)`, opacity: 0.8, offset: 0.14 },
        { transform: `${at} scaleY(1.05)`, opacity: 0.92, offset: 0.5, easing: 'ease-out' },
        { transform: `${at} scaleY(1)`, opacity: 0.92, offset: 0.62 },
        { transform: `${at} scaleY(1)`, opacity: 0.92, offset: 0.76 },
        { transform: `translateX(${(side * 0.12).toFixed(1)}px) scaleY(1)`, opacity: 0 },
      ],
      { duration: 1500, easing: 'cubic-bezier(0.4, 0, 0.3, 1)' },
    ).then(() => shade.remove());
    const picture = pictureIn(card);
    if (picture) animate(picture, [{ filter: 'none' }, { filter: 'none', offset: 0.8 }, { filter: DOUBLED }], { duration: 1500 });
    // Black water rippling round its feet.
    const foot = { x: art.x + art.width / 2 + side, y: art.y + art.height - 3 };
    const size = Math.round(Math.min(figure * 1.1, (Math.min(foot.x, width - foot.x) - 2) * 2));
    for (const delay of [120, 420, 720]) {
      const ripple = spark('fx-ripple', foot, { '--size': `${size}px` });
      animate(
        ripple,
        [
          { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(0.5)', opacity: 1, offset: 0.25 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
        ],
        { duration: 760, delay, easing: 'ease-out', fill: 'backwards' },
      ).then(() => ripple.remove());
    }
    after(700, shade, () => particles.burst({ x: foot.x, y: art.y + art.height * 0.5, area: { width: figure * 0.6, height: art.height * 0.7 }, count: 10, colors: SHADE_SPARKS, speed: [30, 90], drag: 2, life: [400, 700], size: [1.2, 2.2], shape: 'spark' }));
    await wait(1450);
  }

  // 964: a stance's end on its card: the Królobójca comes back out of the
  // shadows in a puff of smoke; the Widmo's shadow sinks into the ground.
  // (arena.js stanceDown() has taken its mark off the card.)
  function stanceOver(event) {
    const look = lookOf(event);
    const entry = cards.get(event.target);
    // (The Skrzydła światłości's shields leave every card of the party.)
    if (look.lightwings && entry) {
      for (const member of standing(entry.unit.side)) {
        member.card.classList.remove('unit--shielded');
        if (!reduced()) rimGlow(member.card, look.color, 400);
      }
      return;
    }
    if (!look.stance || !entry || reduced() || !particles) return;
    // (The Tarcza tytana's light leaves the Tytan's card.)
    if (look.rampart) {
      rimGlow(entry.card, look.color, 500);
      return;
    }
    // (The Lodowe serce's armour breaks into a fall of ice.)
    if (look.iceheart) {
      const point = figurePoint(entry.card, 0.5);
      particles.burst({ x: point.x, y: point.y, area: { width: figureOf(artOf(entry.card)) * 0.6, height: 10 }, count: 12, colors: ICE, speed: [40, 120], gravity: 300, drag: 1.4, life: [400, 700], size: [1.1, 2.2], shape: 'shard' });
      return;
    }
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const picture = pictureIn(entry.card);
    if (look.stance === 'unit--vanished') {
      if (picture) animate(picture, [{ opacity: 0.28, filter: VANISHED }, { opacity: 1, filter: 'none' }], { duration: 420, easing: 'ease-out' });
      puff({ x: art.x + art.width / 2, y: art.y + art.height * 0.5 }, figure * 1.05);
      return;
    }
    if (picture) animate(picture, [{ filter: DOUBLED }, { filter: 'none' }], { duration: 460, easing: 'ease-in' });
    particles.burst({ x: art.x + art.width / 2 - figure * 0.1, y: art.y + art.height - 6, area: { width: figure * 0.5, height: 4 }, count: 8, colors: SHADE, angle: Math.PI / 2, spread: 0.6, speed: [10, 30], drag: 1.5, life: [400, 700], size: [3, 5], shape: 'dust' });
  }

  // 964: the Zaćmienie: the Władca Cieni puts out the sun over the field: a
  // sun over the arena, a black disc sliding over it until only its corona
  // burns, the arena going dark round it and stars showing; then the light
  // comes back.
  async function darkSun(event, color) {
    const entry = cards.get(event.actor);
    if (!entry) return;
    if (reduced() || !particles) {
      await aura(event.actor, color, 2);
      return;
    }
    const width = stageWidth();
    const height = stageHeight();
    const size = Math.round(Math.min(60, width * 0.16));
    const point = { x: width / 2, y: Math.round(Math.max(size * 1.2, height * 0.11)) };
    const veil = spark('fx-eclipse-veil', { x: 0, y: 0 }, { '--x': `${point.x}px`, '--y': `${point.y}px` });
    veil.style.width = `${width}px`;
    veil.style.height = `${height}px`;
    animate(veil, [{ opacity: 0 }, { opacity: 0.15, offset: 0.25 }, { opacity: 1, offset: 0.5 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 2000, easing: 'ease-in-out' }).then(() => veil.remove());
    const sky = spark('fx-eclipse', point, { '--size': `${size}px` });
    sky.innerHTML = '<span class="fx-eclipse-sun"></span><span class="fx-eclipse-corona"></span><span class="fx-eclipse-moon"></span>';
    animate(
      sky,
      [
        { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.12 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.82 },
        { transform: 'translate(-50%, -50%) scale(1.04)', opacity: 0 },
      ],
      { duration: 2000, easing: 'ease-out' },
    ).then(() => sky.remove());
    animate(
      sky.querySelector('.fx-eclipse-moon'),
      [
        { transform: `translateX(${(size * 1.2).toFixed(1)}px)`, opacity: 0 },
        { transform: `translateX(${(size * 1.05).toFixed(1)}px)`, opacity: 1, offset: 0.14 },
        { transform: 'translateX(0px)', opacity: 1, offset: 0.46, easing: 'ease-out' },
        { transform: 'translateX(0px)', opacity: 1 },
      ],
      { duration: 2000, fill: 'both' },
    );
    animate(
      sky.querySelector('.fx-eclipse-corona'),
      [
        { transform: 'scale(0.9)', opacity: 0 },
        { transform: 'scale(0.9)', opacity: 0, offset: 0.42 },
        { transform: 'scale(1.12)', opacity: 1, offset: 0.5 },
        { transform: 'scale(1.04)', opacity: 0.85, offset: 0.8 },
        { transform: 'scale(1.1)', opacity: 0 },
      ],
      { duration: 2000, fill: 'both' },
    );
    // The last ray as the sun goes out, then the stars in the dark.
    after(860, sky, () => twinkle({ x: point.x + size * 0.36, y: point.y - size * 0.34 }, '#ffffff', size * 0.8));
    const stars = seeded(964);
    for (let index = 0; index < 9; index++) {
      const star = { x: 10 + stars() * (width - 20), y: 10 + stars() * (height - 20) };
      if (Math.hypot(star.x - point.x, star.y - point.y) < size) continue;
      twinkle(star, '#efe8ff', 8 + stars() * 6, 980 + index * 60);
    }
    aura(event.actor, color, 2);
    await wait(1900);
  }

  // A whisper winding from a point to another: a thin wavy line of dark
  // green light drawn along it, then fading (an SVG over the stage).
  function whisper(layer, from, to, delay, wave) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const normal = { x: -dy / length, y: dx / length };
    const points = Array.from({ length: 25 }, (_, step) => {
      const share = step / 24;
      const swing = Math.sin(share * Math.PI * 2 * 1.5 + wave) * Math.sin(share * Math.PI) * Math.min(9, length * 0.06);
      return `${(from.x + dx * share + normal.x * swing).toFixed(1)} ${(from.y + dy * share + normal.y * swing).toFixed(1)}`;
    });
    const path = `M${points.join('L')}`;
    for (const part of ['glow', 'core']) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      line.setAttribute('d', path);
      line.setAttribute('class', `fx-whisper-${part}`);
      line.setAttribute('pathLength', '100');
      line.setAttribute('stroke-dasharray', '100 100');
      line.setAttribute('stroke-dashoffset', '100');
      layer.append(line);
      animate(line, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duration: 440, delay, easing: 'ease-in-out', fill: 'both' });
      animate(line, [{ opacity: part === 'glow' ? 0.7 : 1 }, { opacity: 0 }], { duration: 360, delay: delay + 520, fill: 'forwards' });
    }
  }

  // 964: the Klątwa rozkładu: the Nekromanta whispers the curse: dark green
  // whispers wind from it to every foe, in the order of its targets; on
  // each foe the curse takes, rot creeps up its card, its armour crumbles
  // away and the ground withers at its feet; on one it does not take, the
  // whisper breaks apart.
  async function curse(event, color, targets) {
    const entry = cards.get(event.actor);
    const foes = targets.map((id) => cards.get(id)).filter(Boolean);
    if (!entry || foes.length === 0 || reduced() || !particles) {
      await Promise.all([specks(event.actor, color, { rise: false }), aura(event.actor, color, 1)]);
      return;
    }
    const from = figurePoint(entry.card, 0.34);
    const taken = new Set(event.affected ?? targets);
    const width = stageWidth();
    const height = stageHeight();
    const holder = spark('fx-whispers', { x: 0, y: 0 });
    holder.style.width = `${width}px`;
    holder.style.height = `${height}px`;
    holder.innerHTML = `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true"><g fill="none" stroke-linecap="round" stroke-linejoin="round"></g></svg>`;
    const layer = holder.querySelector('g');
    const total = 520 + foes.length * 140 + 900;
    wait(total).then(() => holder.remove());
    particles.burst({ x: from.x, y: from.y, area: { width: 12, height: 8 }, count: 12, colors: ['#3e5a1e', '#56702a', '#2a3a14'], speed: [20, 60], gravity: -30, drag: 2, life: [600, 900], size: [3, 6], shape: 'dust' });
    aura(event.actor, color, 1);
    foes.forEach((foe, index) => {
      const to = figurePoint(foe.card, 0.45);
      const delay = 120 + index * 140;
      whisper(layer, from, to, delay, index * 2.1);
      after(delay, holder, () => particles.trail({ from, to, duration: 440, colors: ['#c5e38f', '#8fbf5a', '#56702a'], rate: 50, sizes: [1, 2], life: [260, 460], shape: 'mote' }));
      after(delay + 440, holder, () => (taken.has(foe.unit.id) ? rot(foe) : particles.burst({ x: to.x, y: to.y, count: 10, colors: ['#c5e38f', '#56702a', '#2a3a14'], speed: [50, 130], drag: 2.5, life: [260, 460], size: [1.2, 2.2], shape: 'mote' })));
    });
    await wait(total - 300);
  }

  // A cursed foe rotting: rot creeping up its card, flakes of its armour
  // falling, the grass withering at its feet.
  function rot(foe) {
    const card = foe.card;
    const art = artOf(card);
    const box = boxOf(card);
    const figure = figureOf(art);
    const x = art.x + art.width / 2;
    const rotting = h('span', { class: 'fx-rot' });
    card.append(rotting);
    const picture = pictureIn(card);
    if (picture) animate(picture, [{ filter: 'none' }, { filter: 'sepia(0.7) hue-rotate(35deg) saturate(1.3) brightness(0.75)', offset: 0.4 }, { filter: 'sepia(0.7) hue-rotate(35deg) saturate(1.3) brightness(0.75)', offset: 0.75 }, { filter: 'none' }], { duration: 1200 });
    animate(
      rotting,
      [
        { clipPath: 'inset(100% 0 0 0)', opacity: 1 },
        { clipPath: 'inset(12% 0 0 0)', opacity: 1, offset: 0.55, easing: 'ease-out' },
        { clipPath: 'inset(12% 0 0 0)', opacity: 0.9, offset: 0.78 },
        { clipPath: 'inset(12% 0 0 0)', opacity: 0 },
      ],
      { duration: 1100 },
    ).then(() => rotting.remove());
    particles.burst({ x, y: art.y + art.height * 0.55, area: { width: figure * 0.6, height: art.height * 0.4 }, count: 10, colors: ['#8a6a48', '#6b5a3a', '#a39a89', '#5a4a30'], angle: Math.PI / 2, spread: 0.7, speed: [10, 40], gravity: 260, drag: 1, life: [500, 800], size: [1.4, 2.4], shape: 'dust' });
    particles.burst({ x, y: art.y + art.height * 0.5, area: { width: figure * 0.5, height: art.height * 0.3 }, count: 6, colors: ['#d7f5a8', '#8fbf5a', '#56702a'], angle: -Math.PI / 2, spread: 0.8, speed: [15, 40], rise: 20, gravity: -40, drag: 1, life: [500, 800], size: [1.6, 3], shape: 'bubble' });
    particles.burst({ x, y: box.y + box.height - 4, area: { width: box.width * 0.7, height: 4 }, count: 7, colors: ['#6b5a2a', '#4a3d1a', '#8a7a3a'], angle: -Math.PI / 2, spread: 0.7, speed: [10, 30], gravity: 50, drag: 1.2, life: [600, 900], size: [2, 3.2], shape: 'dust' });
  }

  // 964: the Krwawy znak's cut: one long red slash across the foe, blood
  // spraying from it and running down its card.
  function bloodCut(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 80);
      return;
    }
    const card = entry.card;
    const figure = figureOf(artOf(card));
    const point = figurePoint(card, 0.48);
    cutAt(point, -38, figure * 1.25, '#d9534f', { duration: 480, bend: 5, width: 1.2 });
    bleed(card, point, Math.PI * 0.6, { count: 14, drips: 3 });
    animate(card, [{ filter: 'brightness(1.5) saturate(1.4)' }, { filter: 'brightness(1)' }], { duration: 360, easing: 'ease-out' });
  }

  // 964: the Krwawy znak takes hold: a rune of blood brands the foe it cut,
  // flares and fades; a red ring round it (the crits find it easier now).
  async function bloodRune(event, color) {
    const id = event.targets[0];
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await ring(id, color, 90, 520);
      return;
    }
    const figure = figureOf(artOf(entry.card));
    const point = figurePoint(entry.card, 0.45);
    const rune = spark('fx-bloodrune', point, { '--fx': '#d9534f', '--size': `${Math.round(figure * 0.62)}px` });
    rune.innerHTML = BLOOD_RUNE;
    animate(
      rune,
      [
        { transform: 'translate(-50%, -50%) scale(1.8) rotate(-30deg)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1, offset: 0.2, easing: 'ease-out' },
        { transform: 'translate(-50%, -50%) scale(1.08) rotate(0deg)', opacity: 1, offset: 0.34 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 0.95, offset: 0.75 },
        { transform: 'translate(-50%, -50%) scale(0.85) rotate(0deg)', opacity: 0 },
      ],
      { duration: 1200, easing: 'ease-in-out' },
    ).then(() => rune.remove());
    after(220, rune, () => {
      tintCard(entry.card, '#b3263b', [{ opacity: 0 }, { opacity: 0.5, offset: 0.25 }, { opacity: 0 }], 600);
      particles.burst({ x: point.x, y: point.y, count: 10, colors: BLOOD, speed: [60, 150], gravity: 380, drag: 1.2, life: [360, 600], size: [1.3, 2.3], shape: 'drop' });
      ring(id, '#d9534f', Math.round(figure * 1.15), 520);
    });
    await wait(1100);
  }

  // 964: the Dotyk śmierci's grip (the hand of bone, arena-fx.js
  // boneTouch()): the foe greys and greens under it, venom bubbles out of
  // it, and its life flows away in pale green motes to the Licz.
  function deathTouch(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 80);
      return;
    }
    const card = entry.card;
    const figure = figureOf(artOf(card));
    const point = figurePoint(card, 0.45);
    tintCard(card, '#7fbf3f', [{ opacity: 0 }, { opacity: 0.55, offset: 0.2 }, { opacity: 0 }], 700);
    animate(card, [{ filter: 'grayscale(0.8) brightness(0.75)' }, { filter: 'grayscale(0) brightness(1)' }], { duration: 760, easing: 'ease-out' });
    particles.burst({ x: point.x, y: point.y, area: { width: figure * 0.5, height: figure * 0.4 }, count: 10, colors: VENOM, speed: [20, 60], rise: 20, gravity: -50, drag: 1.2, life: [500, 800], size: [1.6, 3], shape: 'bubble' });
    const licz = cards.get(event.actor);
    if (!licz) return;
    const to = figurePoint(licz.card, 0.5);
    const distance = Math.hypot(to.x - point.x, to.y - point.y);
    const toward = Math.atan2(to.y - point.y, to.x - point.x);
    const mark = anchor(900);
    for (let wave = 0; wave < 4; wave++) {
      after(120 + wave * 70, mark, () => particles.burst({ x: point.x, y: point.y, area: { width: figure * 0.4, height: figure * 0.4 }, count: 4, colors: LIFE, angle: toward, spread: 0.12, speed: [distance * 2.9, distance * 3.1], life: [320, 330], size: [1.4, 2.4], shape: 'mote', drag: 0 }));
    }
    after(460, mark, () => tintCard(licz.card, '#b6e388', [{ opacity: 0 }, { opacity: 0.45, offset: 0.3 }, { opacity: 0 }], 520));
  }

  // ——— The fourth forms' skills in looks of their own ———

  // Steel plates of a foe's armour thrown off a point along `way`, turning
  // as they fall (as the Kruszący cios's).
  function platesOff(point, figure, way, count = 4) {
    for (let index = 0; index < count; index++) {
      const plate = spark('fx-plate', point, { '--size': `${Math.round(Math.max(12, figure * 0.24))}px` });
      plate.innerHTML = PLATE_ART[index % PLATE_ART.length];
      const angle = way + (index - (count - 1) / 2) * 0.7;
      const far = figure * (0.5 + (index % 3) * 0.12);
      const dx = Math.cos(angle) * far;
      const dy = Math.sin(angle) * far * 0.8;
      const spin = (index % 2 ? 1 : -1) * (220 + index * 50);
      animate(
        plate,
        [
          { transform: 'translate(-50%, -50%) rotate(0deg) scale(0.6)', opacity: 1 },
          { transform: `translate(calc(-50% + ${(dx * 0.7).toFixed(1)}px), calc(-50% + ${(dy * 0.7 - figure * 0.12).toFixed(1)}px)) rotate(${spin * 0.5}deg) scale(1)`, opacity: 1, offset: 0.45 },
          { transform: `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${(dy + figure * 0.32).toFixed(1)}px)) rotate(${spin}deg) scale(0.9)`, opacity: 0 },
        ],
        { duration: 560, easing: 'cubic-bezier(0.2, 0.6, 0.5, 1)' },
      ).then(() => plate.remove());
    }
  }

  // The Pogrom: the Burzyciel's armour glows like a forge, it hurls itself
  // into the middle of the horde and molten cleaves rake every foe, more of
  // them the deeper its own wounds; each foe's armour splits in red-hot
  // cracks and throws off its plates, and embers rise off the field.
  async function carnage(event, color, targets) {
    const entry = cards.get(event.actor);
    const foes = targets.map((id) => cards.get(id)).filter(Boolean);
    if (!entry || foes.length === 0 || reduced() || !particles) {
      await arc(color);
      return;
    }
    const { now, max } = hpOf(entry);
    const fury = Math.min(1, Math.max(0, 1 - now / max));
    const cleaves = 2 + Math.round(fury * 2);
    const own = artOf(entry.card);
    const size = figureOf(own);
    const from = centerOf(entry.card);
    rimGlow(entry.card, '#ff6a2a', 1000);
    tintCard(entry.card, '#ff5a1f', [{ opacity: 0 }, { opacity: 0.45 + fury * 0.25, offset: 0.3 }, { opacity: 0.3, offset: 0.7 }, { opacity: 0 }], 1150);
    particles.burst({ x: own.x + own.width / 2, y: own.y + own.height * 0.6, area: { width: size * 0.7, height: own.height * 0.4 }, count: 12, colors: FIRE, angle: -Math.PI / 2, spread: 0.5, speed: [30, 90], gravity: -40, drag: 1.4, life: [420, 760], size: [1.2, 2.4], shape: 'ember' });
    const points = foes.map((foe) => figurePoint(foe.card, 0.5));
    const middle = { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length };
    const reach = { x: (middle.x - from.x) * 0.14, y: (middle.y - from.y) * 0.14 };
    // (It gathers itself in place, not back toward the arena's edge, where
    // its card would be cut.)
    animate(
      entry.card,
      [
        { transform: 'translate(0px, 0px) scale(1)' },
        { transform: 'translate(0px, 0px) scale(0.94)', offset: 0.14 },
        { transform: `translate(${reach.x.toFixed(1)}px, ${reach.y.toFixed(1)}px) scale(1.1)`, offset: 0.32 },
        { transform: `translate(${reach.x.toFixed(1)}px, ${reach.y.toFixed(1)}px) scale(1.07)`, offset: 0.72 },
        { transform: 'translate(0px, 0px) scale(1)' },
      ],
      { duration: 1150, easing: 'ease-in-out', composite: 'add' },
    );
    const mark = anchor(1700);
    after(140, mark, () => {
      flash('#ff6a2a', 0.12 + fury * 0.1, 560);
      shake(3 + fury * 2, 420);
    });
    // (A foe that dodges the blow is not cut.)
    const hit = reached(event, targets);
    let end = 0;
    foes.forEach((foe, index) => {
      if (!hit.includes(foe.unit.id)) return;
      const point = points[index];
      const art = artOf(foe.card);
      const figure = figureOf(art);
      // Each foe's cleaves near-parallel, one way or the other (a cross is
      // the mark of a fallen unit).
      const lean = index % 2 ? 1 : -1;
      const start = 220 + index * 90;
      for (let k = 0; k < cleaves; k++) {
        const delay = start + k * 120;
        const turn = lean * (26 + k * 6);
        const radians = (turn * Math.PI) / 180;
        const shift = (k - (cleaves - 1) / 2) * figure * (0.7 / cleaves);
        const across = { x: point.x - Math.sin(radians) * shift, y: point.y + Math.cos(radians) * shift };
        cutAt(across, turn, figure * 1.15, k % 2 ? '#ffd27a' : '#ff6a2a', { delay, duration: 420, bend: 8 * lean, width: 1.3 });
        after(delay, mark, () => {
          particles.burst({ x: across.x, y: across.y, count: 7, colors: FIRE, angle: radians + (k % 2 ? 0 : Math.PI), spread: 0.55, speed: [130, 280], life: [200, 380], size: [1.1, 2.2], shape: 'spark', drag: 3.2 });
          animate(foe.card, [{ filter: 'brightness(2) sepia(0.5) saturate(2) hue-rotate(-15deg)' }, { filter: 'brightness(1)' }], { duration: 260, easing: 'ease-out' });
        });
      }
      // Its armour gives way.
      const split = start + cleaves * 120;
      end = Math.max(end, split);
      after(split, mark, () => {
        glassCracks(foe, art, figure, HOT_CRACKS, 0, 600, 'fx-hotcrack');
        platesOff(point, figure, Math.atan2(point.y - from.y, point.x - from.x), 4);
        particles.burst({ x: point.x, y: point.y, count: 8, colors: PLATES, speed: [90, 220], life: [320, 560], size: [1.4, 2.6], shape: 'shard', gravity: 480, drag: 1.4 });
        particles.burst({ x: point.x, y: point.y + figure * 0.2, area: { width: figure * 0.6, height: 6 }, count: 8, colors: FIRE, angle: -Math.PI / 2, spread: 0.6, speed: [30, 80], gravity: -40, drag: 1.3, life: [480, 820], size: [1.2, 2.3], shape: 'ember' });
      });
    });
    // (The blows' numbers come as the last armour gives way.)
    await wait(end + 160);
  }

  // The Wyłom, before its blow: the Burzyciel's weapon heats to a glow and
  // embers rise off its card.
  function breachWindup(event) {
    const entry = cards.get(event.actor);
    if (!entry || reduced() || !particles) return;
    const art = artOf(entry.card);
    const figure = figureOf(art);
    tintCard(entry.card, '#ff6a2a', [{ opacity: 0 }, { opacity: 0.4, offset: 0.5 }, { opacity: 0 }], 520);
    particles.burst({ x: art.x + art.width / 2, y: art.y + art.height * 0.5, area: { width: figure * 0.6, height: art.height * 0.5 }, count: 10, colors: FIRE, angle: -Math.PI / 2, spread: 0.5, speed: [30, 90], gravity: -40, drag: 1.3, life: [380, 640], size: [1.2, 2.3], shape: 'ember' });
  }

  // The Wyłom's blow: a molten rift opens down its foe from head to feet,
  // its armour cracks red-hot, embers spray out of the rift, and the blow's
  // force tears on out of its back into the foe behind, which reels.
  function breachHit(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 90);
      ring(event.target, color, 110, 420);
      return;
    }
    const card = entry.card;
    const art = artOf(card);
    const figure = figureOf(art);
    const middle = figurePoint(card, 0.5);
    // (The rift over the whole figure, from its head to its feet.)
    const rift = spark('fx-rift', middle, { '--size': `${Math.round(Math.max(48, art.height * 1.15))}px` });
    rift.innerHTML = RIFT;
    for (const line of rift.querySelectorAll('path')) {
      line.setAttribute('stroke-dasharray', '100 100');
      line.setAttribute('stroke-dashoffset', '100');
      animate(line, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duration: 180, easing: 'ease-in', fill: 'both' });
    }
    animate(
      rift,
      [
        { transform: 'translate(-50%, -50%) scaleX(1)', opacity: 1 },
        { transform: 'translate(-50%, -50%) scaleX(1.7)', opacity: 1, offset: 0.3 },
        { transform: 'translate(-50%, -50%) scaleX(1.5)', opacity: 1, offset: 0.65 },
        { transform: 'translate(-50%, -50%) scaleX(1.2)', opacity: 0 },
      ],
      { duration: 1000, easing: 'ease-out' },
    ).then(() => rift.remove());
    glassCracks(entry, art, figure, HOT_CRACKS, 80, 760, 'fx-hotcrack');
    burst(event.target, '#ffb347', Math.round(figure * 1.25));
    ring(event.target, color, Math.round(figure * 1.8), 480);
    animate(card, [{ filter: 'brightness(2.2) sepia(0.5) saturate(2.4) hue-rotate(-18deg)' }, { filter: 'brightness(1)' }], { duration: 640, easing: 'ease-out' });
    for (const side of [-1, 1]) {
      particles.burst({ x: middle.x + side * 3, y: middle.y, area: { width: 2, height: art.height * 0.7 }, count: 10, colors: FIRE, angle: side > 0 ? 0 : Math.PI, spread: 0.5, speed: [100, 240], life: [220, 420], size: [1.1, 2.2], shape: 'spark', drag: 3 });
    }
    flash('#ff8a3d', 0.16, 380);
    shake(7, 520);
    // The force out of its back, toward the one behind.
    const actor = cards.get(event.actor);
    const from = actor ? centerOf(actor.card) : { x: middle.x, y: middle.y + 100 };
    const next = behindOf(card)[0];
    const goal = next ? centerOf(next) : null;
    const angle = goal ? Math.atan2(goal.y - middle.y, goal.x - middle.x) : Math.atan2(middle.y - from.y, middle.x - from.x);
    const exit = { x: middle.x + Math.cos(angle) * figure * 0.4, y: middle.y + Math.sin(angle) * figure * 0.4 };
    const cone = spark('fx-smashcone fx-smashcone--molten', exit, { '--size': `${Math.round(figure * 0.9)}px` });
    cone.style.width = `${Math.round(Math.min(goal ? Math.hypot(goal.x - exit.x, goal.y - exit.y) : figure * 1.3, figure * 2.2))}px`;
    const along = `translate(0, -50%) rotate(${angle.toFixed(4)}rad)`;
    animate(
      cone,
      [
        { transform: `${along} scaleX(0.1)`, opacity: 0 },
        { transform: `${along} scaleX(1)`, opacity: 0.95, offset: 0.35 },
        { transform: `${along} scaleX(1.05)`, opacity: 0 },
      ],
      { duration: 440, delay: 90, easing: 'ease-out', fill: 'backwards' },
    ).then(() => cone.remove());
    particles.burst({ x: exit.x, y: exit.y, count: 14, colors: FIRE, angle, spread: 0.35, speed: [200, 420], life: [260, 480], size: [1.3, 2.6], shape: 'ember', gravity: 120, drag: 1.6 });
    if (!next) return;
    const mark = anchor(900);
    after(220, mark, () => {
      animate(next, [{ filter: 'brightness(1.9) sepia(0.4) saturate(1.8)' }, { filter: 'brightness(1)' }], { duration: 480, easing: 'ease-out' });
      // (It reels inside the arena: no further than the room by its edge.)
      const near = boxOf(next);
      const room = { left: Math.max(0, near.x - 2), right: Math.max(0, stageWidth() - near.x - near.width - 2) };
      const push = { x: Math.max(-room.left, Math.min(room.right, Math.cos(angle) * 8)), y: Math.sin(angle) * 8 };
      animate(
        next,
        [
          { transform: 'translate(0px, 0px) scale(1)' },
          { transform: `translate(${push.x.toFixed(1)}px, ${push.y.toFixed(1)}px) scale(0.95)`, offset: 0.3 },
          { transform: 'translate(0px, 0px) scale(1)' },
        ],
        { duration: 520, easing: 'ease-out', composite: 'add' },
      );
      const point = centerOf(next);
      particles.burst({ x: point.x, y: point.y, count: 10, colors: STONE, angle, spread: 0.6, speed: [90, 200], life: [320, 560], size: [1.4, 2.6], shape: 'shard', gravity: 480, drag: 1.3 });
      particles.burst({ x: point.x, y: point.y, count: 8, colors: FIRE, angle, spread: 0.7, speed: [80, 180], life: [220, 420], size: [1.1, 2], shape: 'ember', drag: 2 });
    });
  }

  // The Wyłom's mark on the foe whose guard it broke (rozbita osłona: it
  // takes more from every blow after): over its head a shield splits in two
  // along a red-hot crack and its halves fall away, and the foe flushes red.
  async function sunder(event, color, targets) {
    if (reduced() || !particles) {
      await Promise.all(targets.map((id) => ring(id, color, 100, 600)));
      return;
    }
    targets.forEach((id, index) => {
      const entry = cards.get(id);
      if (!entry) return;
      const art = artOf(entry.card);
      const figure = figureOf(art);
      const size = Math.round(Math.max(22, figure * 0.4));
      const point = { x: art.x + art.width / 2, y: Math.max(size * 0.62 + 2, art.y + art.height * 0.3) };
      const delay = index * 80;
      const shield = spark('fx-sunder', point, { '--size': `${size}px` });
      shield.innerHTML = SUNDER_SHIELD;
      animate(
        shield,
        [
          { transform: 'translate(-50%, -50%) scale(0.5)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(1.1)', opacity: 1, offset: 0.16, easing: 'ease-out' },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.26 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.86 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
        ],
        { duration: 1150, delay, fill: 'backwards' },
      ).then(() => shield.remove());
      const crack = shield.querySelector('.fx-sunder-crack');
      animate(crack, [{ opacity: 0 }, { opacity: 0, offset: 0.26 }, { opacity: 1, offset: 0.32 }, { opacity: 1, offset: 0.48 }, { opacity: 0, offset: 0.6 }, { opacity: 0 }], { duration: 1150, delay, fill: 'both' });
      shield.querySelectorAll('.fx-sunder-half').forEach((half, side) => {
        const way = side ? 1 : -1;
        animate(
          half,
          [
            { transform: 'translate(0px, 0px) rotate(0deg)' },
            { transform: 'translate(0px, 0px) rotate(0deg)', offset: 0.44 },
            { transform: `translate(${way * 11}px, 15px) rotate(${way * 34}deg)` },
          ],
          { duration: 1150, delay, easing: 'cubic-bezier(0.5, 0, 0.8, 0.6)', fill: 'both' },
        );
      });
      after(delay + 500, shield, () => {
        particles.burst({ x: point.x, y: point.y, count: 10, colors: ['#ffffff', '#ffd27a', '#ff8a3d'], speed: [90, 200], life: [200, 380], size: [1, 2], shape: 'spark', drag: 3 });
        tintCard(entry.card, '#e8462f', [{ opacity: 0 }, { opacity: 0.4, offset: 0.3 }, { opacity: 0 }], 700);
        rimGlow(entry.card, '#e8462f', 700);
      });
    });
    await wait(900 + (targets.length - 1) * 80);
  }

  const GOLD_LEAVES = ['#f2c14e', '#ffe08a', '#c99a2e', '#fff1c9'];

  // The Huragan chwały: three spins in one move, each faster: the
  // Nieśmiertelny turns and golden blades fly out of it into a storm round
  // the foes (one way, back, and the first way again), cutting every foe as
  // they pass and leaving it bleeding; at the third the stands roar.
  async function gloryHurricane(event, color, targets) {
    const foes = targets.map((id) => cards.get(id)).filter(Boolean);
    const champion = cards.get(event.actor);
    if (!champion || foes.length === 0 || reduced() || !particles) {
      await arc(color);
      return;
    }
    const turn = Math.min(3, event.turn ?? 1);
    const spin = turn === 2 ? -1 : 1;
    const own = figurePoint(champion.card, 0.5);
    const figureArt = champion.card.querySelector('.unit-art img, .unit-art svg, .unit-icon');
    if (figureArt) {
      animate(
        figureArt,
        [0, 0.25, 0.5, 0.75, 1].map((offset, k) => ({ transform: `scaleX(${k % 2 ? -1 : 1})`, offset })),
        { duration: 300, easing: 'linear' },
      );
    }
    const blur = spark('fx-steelswirl fx-steelswirl--gold', own, { '--fx': color, '--size': `${Math.round(figureOf(artOf(champion.card)) * 1.35)}px` });
    blur.innerHTML = STEEL_SWIRL;
    animate(
      blur,
      [
        { transform: 'translate(-50%, -50%) rotate(0deg) scale(0.7)', opacity: 0 },
        { transform: `translate(-50%, -50%) rotate(${spin * 260}deg) scale(1)`, opacity: 1, offset: 0.4 },
        { transform: `translate(-50%, -50%) rotate(${spin * 620}deg) scale(1.1)`, opacity: 0 },
      ],
      { duration: 400, easing: 'linear' },
    ).then(() => blur.remove());
    const boxes = foes.map((foe) => boxOf(foe.card));
    const figure = figureOf(artOf(foes[0].card));
    const width = stageWidth();
    const left = Math.min(...boxes.map((box) => box.x));
    const right = Math.max(...boxes.map((box) => box.x + box.width));
    const top = Math.min(...boxes.map((box) => box.y));
    const bottom = Math.max(...boxes.map((box) => box.y + box.height));
    const middle = { x: (left + right) / 2, y: top + (bottom - top) * 0.45 };
    const bladeLength = Math.round(Math.max(36, figure * 0.6));
    const across = Math.min((right - left) / 2 + figure * 0.12, Math.min(middle.x, width - middle.x) - bladeLength * 0.5 - 2);
    const deep = Math.max(figure * 0.4, (bottom - top) * 0.36);
    const duration = [920, 820, 760][turn - 1];
    const count = [5, 7, 9][turn - 1];
    const laps = [1.05, 1.25, 1.5][turn - 1];
    const gale = spark('fx-gale fx-gale--gold', middle, { '--fx': color });
    gale.style.width = `${Math.round(across * 2.1)}px`;
    gale.style.height = `${Math.round(deep * 2.1)}px`;
    gale.innerHTML = GALE;
    animate(
      gale,
      [
        { transform: 'translate(-50%, -50%) rotate(0deg) scale(0.6)', opacity: 0 },
        { transform: `translate(-50%, -50%) rotate(${spin * 120}deg) scale(1)`, opacity: 0.9, offset: 0.25 },
        { transform: `translate(-50%, -50%) rotate(${spin * 380}deg) scale(1.02)`, opacity: 0.8, offset: 0.75 },
        { transform: `translate(-50%, -50%) rotate(${spin * 500}deg) scale(1.1)`, opacity: 0 },
      ],
      { duration, easing: 'linear' },
    ).then(() => gale.remove());
    const steps = 20;
    const join = 0.22;
    const swords = Array.from({ length: count }, (_, k) => {
      const blade = spark('fx-hblade fx-hblade--gold', { x: 0, y: 0 }, { '--size': `${bladeLength}px` });
      blade.innerHTML = SWORD;
      blade.style.opacity = '0';
      const phase = (k / count) * Math.PI * 2;
      const lane = 0.78 + (k % 3) * 0.12;
      const points = Array.from({ length: steps + 1 }, (_, step) => {
        const share = step / steps;
        const angle = phase + spin * share * laps * Math.PI * 2;
        const path = { x: middle.x + Math.cos(angle) * across * lane, y: middle.y + Math.sin(angle) * deep * lane };
        const out = Math.min(1, share / join);
        const pull = 1 - (1 - out) * (1 - out);
        return { x: own.x + (path.x - own.x) * pull, y: own.y + (path.y - own.y) * pull, angle, out };
      });
      const frames = points.map((point, step) => {
        const next = points[Math.min(steps, step + 1)];
        const prev = points[Math.max(0, step - 1)];
        const facing = (Math.atan2(next.y - prev.y, next.x - prev.x) * 180) / Math.PI;
        const near = point.out < 1 ? 0.7 + point.out * 0.3 : 0.82 + Math.sin(point.angle) * 0.18;
        return {
          transform: `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px) translate(-50%, -50%) rotate(${facing.toFixed(1)}deg) scale(${near.toFixed(2)})`,
          opacity: step === 0 || step === steps ? 0 : 1,
        };
      });
      return animate(blade, frames, { duration, delay: 60 + k * 20, easing: 'linear', fill: 'backwards' }).then(() => blade.remove());
    });
    const mark = anchor(duration + 1400);
    const hit = reached(event, targets);
    foes.filter((foe) => hit.includes(foe.unit.id)).forEach((foe, index) => {
      const point = figurePoint(foe.card, 0.5);
      const side = Math.atan2(point.y - middle.y, point.x - middle.x);
      const phase = Math.atan2((point.y - middle.y) / deep, (point.x - middle.x) / across);
      const way = Math.atan2(Math.cos(phase) * deep * spin, -Math.sin(phase) * across * spin);
      for (const share of [0.32, 0.7]) after(duration * share + index * 50, mark, () => bladeThrough(foe, way, GOLD));
      after(duration + index * 40, mark, () => {
        cutAt(point, (way * 180) / Math.PI, figure * 1.05, spinCut(turn), { duration: 340, bend: 5, width: 0.9 });
        bleed(foe.card, point, side, { count: 5, drips: 1 });
      });
    });
    after(duration * 0.3, mark, () => shake(1.8 + turn * 0.6, 340));
    // The third spin: the stands roar: laurel leaves and gold rain over the
    // arena from above, and a wreath settles on the Nieśmiertelny's head.
    if (turn === 3) after(duration * 0.85, mark, () => crowdRoar(champion, color));
    await Promise.all(swords);
  }
  // The cut a spin leaves: gold, then gold-red, then red.
  const spinCut = (turn) => ['#ffd76a', '#ff9a4a', '#e8462f'][turn - 1];

  // The stands roar for the Nieśmiertelny: a gold flash, laurel leaves and
  // sparks of gold falling over the arena, and a wreath on its head.
  function crowdRoar(champion, color) {
    const width = stageWidth();
    flash('#ffe08a', 0.16, 420);
    for (let k = 0; k < 5; k++) leaves({ x: width * (0.1 + k * 0.2), y: 12 }, { count: 4, reach: 34, delay: k * 60, colors: GOLD_LEAVES });
    particles.burst({ x: width / 2, y: 2, area: { width: width * 0.9, height: 4 }, count: 26, colors: GOLD, angle: Math.PI / 2, spread: 0.5, speed: [40, 120], gravity: 120, drag: 0.8, life: [900, 1400], size: [1.2, 2.4], shape: 'mote' });
    laurel(champion.card, { scale: 1.05 });
    rimGlow(champion.card, color, 900);
  }

  // The Wyzwanie czempiona, before its blow: the Nieśmiertelny's sword
  // flashes and a line of gold runs from it to the strongest foe, the one it
  // calls out.
  function championCall(event, color) {
    const champion = cards.get(event.actor);
    const foe = cards.get(event.target);
    if (!champion || !foe || reduced() || !particles) return;
    const art = artOf(champion.card);
    const tip = { x: art.x + art.width / 2, y: art.y + art.height * 0.3 };
    twinkle(tip, '#ffffff', figureOf(art) * 0.6);
    rimGlow(champion.card, color, 700);
    sightOf(centerOf(champion.card), centerOf(foe.card), color, 0, 640);
    rimGlow(foe.card, color, 700, 160);
  }

  // The Wyzwanie czempiona's blow: two golden cuts side by side, a burst of
  // gold and laurel leaves thrown off the foe.
  function championStrike(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 90);
      ring(event.target, color, 110, 420);
      return;
    }
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const point = figurePoint(entry.card, 0.5);
    for (const [k, shift] of [-0.12, 0.12].entries()) {
      cutAt({ x: point.x + shift * figure, y: point.y + shift * figure * 0.4 }, -38, figure * 1.2, k ? '#fff1c9' : color, { delay: k * 70, duration: 400, bend: 6, width: 1.4 });
    }
    burst(event.target, '#fff1c9', Math.round(figure * 1.2));
    ring(event.target, color, Math.round(figure * 1.7), 460);
    particles.burst({ x: point.x, y: point.y, count: 16, colors: GOLD, speed: [130, 300], life: [220, 420], size: [1.1, 2.2], shape: 'spark', drag: 3, gravity: 140 });
    leaves(point, { count: 6, reach: figure * 0.6, colors: GOLD_LEAVES });
    animate(entry.card, [{ filter: 'brightness(2) sepia(0.4) saturate(1.6)' }, { filter: 'brightness(1)' }], { duration: 480, easing: 'ease-out' });
    shake(3.5, 320);
  }

  // The Wyzwanie czempiona taken: a laurel wreath settles on the foe's head,
  // a golden bond runs from it to the Nieśmiertelny (it strikes only the
  // Nieśmiertelny for a few moves), and rings of gold open at their feet.
  async function championBond(event, color, targets) {
    const champion = cards.get(event.actor);
    const foes = targets.map((id) => cards.get(id)).filter(Boolean);
    if (!champion || foes.length === 0 || reduced() || !particles) {
      await aura(event.actor, color, 1);
      return;
    }
    const middle = figurePoint(champion.card, 0.45);
    groundRing(event.actor, color, { delay: 120 });
    foes.forEach((foe, index) => {
      laurel(foe.card, { delay: index * 90 });
      groundRing(foe.unit.id, color, { delay: 120 + index * 90 });
      const from = figurePoint(foe.card, 0.45);
      aggroLine(from, middle, Math.hypot(middle.x - from.x, middle.y - from.y) * (0.08 + index * 0.12), color, 260 + index * 90, 900);
      rimGlow(foe.card, color, 700, 300 + index * 90);
    });
    const mark = anchor(1200);
    after(520, mark, () => {
      rimGlow(champion.card, color, 800);
      particles.burst({ x: middle.x, y: middle.y, count: 12, colors: GOLD, speed: [80, 200], life: [240, 460], size: [1, 2], shape: 'spark', drag: 3 });
    });
    await wait(1100);
  }

  // The Gniew góry: the Tytan raises its tower shield and drives it into the
  // ground before it like an avalanche: a ring of runes bursts out, the
  // ground splits in glowing rune cracks to every foe, and pillars of rune
  // stone burst up under them, tossing each one.
  async function mountainWrath(event, color, targets) {
    const entry = cards.get(event.actor);
    const foes = targets.map((id) => cards.get(id)).filter(Boolean);
    if (!entry || foes.length === 0 || reduced() || !particles) {
      await arc(color);
      return;
    }
    const width = stageWidth();
    const own = boxOf(entry.card);
    const ally = entry.unit.side === 'ally';
    const figure = figureOf(artOf(entry.card));
    const slamAt = { x: own.x + own.width / 2, y: ally ? own.y - 2 : own.y + own.height + 2 };
    // The shield up over its edge, then down into the ground.
    const shieldSize = Math.round(Math.max(30, figure * 0.62));
    const shield = spark('fx-towershield', slamAt, { '--fx': color, '--size': `${shieldSize}px` });
    shield.innerHTML = TOWER_SHIELD;
    const slam = 460;
    animate(
      shield,
      [
        { transform: 'translate(-50%, -100%) translateY(0px) scale(0.6)', opacity: 0 },
        { transform: `translate(-50%, -100%) translateY(${(-shieldSize * 0.55).toFixed(1)}px) scale(1.05)`, opacity: 1, offset: 0.3, easing: 'ease-in' },
        { transform: 'translate(-50%, -100%) translateY(0px) scale(1.08, 0.9)', opacity: 1, offset: 0.42 },
        { transform: 'translate(-50%, -100%) translateY(0px) scale(1)', opacity: 1, offset: 0.55 },
        { transform: 'translate(-50%, -100%) translateY(0px) scale(1)', opacity: 0 },
      ],
      { duration: 1100, easing: 'ease-out' },
    ).then(() => shield.remove());
    const ground = groundLayer(slam + 1500);
    after(slam, ground, () => {
      shake(7, 540);
      flash(color, 0.12, 320);
      particles.burst({ x: slamAt.x, y: slamAt.y, area: { width: own.width * 0.7, height: 6 }, count: 12, colors: DUST, speed: [40, 120], life: [600, 950], size: [4, 8], shape: 'dust', gravity: -16, drag: 2 });
      particles.burst({ x: slamAt.x, y: slamAt.y, count: 12, colors: STONE, angle: ally ? -Math.PI / 2 : Math.PI / 2, spread: 1.1, speed: [100, 240], life: [380, 640], size: [1.6, 2.8], shape: 'shard', gravity: 600, drag: 1 });
      for (const [k, delay] of [0, 120].entries()) {
        const wave = spark('fx-shockwave', slamAt, { '--fx': k ? '#ffffff' : color });
        wave.style.width = `${Math.round(Math.min(own.width * (2 - k * 0.4), (Math.min(slamAt.x, width - slamAt.x) - 2) * 2))}px`;
        animate(
          wave,
          [
            { transform: 'translate(-50%, -50%) scale(0.15)', opacity: 0.95 },
            { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
          ],
          { duration: 560, delay, easing: 'ease-out', fill: 'backwards' },
        ).then(() => wave.remove());
      }
    });
    // The rune cracks, from the shield to every foe's feet.
    const feet = foes.map((foe) => {
      const box = boxOf(foe.card);
      return { x: box.x + box.width / 2, y: ally ? box.y + box.height + 2 : box.y - 2 };
    });
    const random = seeded(11 + foes.length);
    const jag = (from, to, parts) => {
      const points = [from];
      for (let k = 1; k < parts; k++) {
        const share = k / parts;
        const sideways = (random() - 0.5) * 14;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy) || 1;
        points.push({ x: from.x + dx * share - (dy / length) * sideways, y: from.y + dy * share + (dx / length) * sideways });
      }
      points.push(to);
      return points;
    };
    const lines = feet.map((point) => jag(slamAt, point, 6));
    const all = lines.flat();
    const pad = 8;
    const x0 = Math.max(0, Math.min(...all.map((point) => point.x)) - pad);
    const y0 = Math.max(0, Math.min(...all.map((point) => point.y)) - pad);
    const x1 = Math.min(width, Math.max(...all.map((point) => point.x)) + pad);
    const y1 = Math.min(stageHeight(), Math.max(...all.map((point) => point.y)) + pad);
    const d = (line) => `M${line.map((point) => `${(point.x - x0).toFixed(1)} ${(point.y - y0).toFixed(1)}`).join('L')}`;
    const crack = h('span', { class: 'fx-quakecrack fx-quakecrack--rune' });
    crack.style.left = `${x0.toFixed(1)}px`;
    crack.style.top = `${y0.toFixed(1)}px`;
    crack.style.setProperty('--fx', color);
    crack.innerHTML =
      `<svg width="${Math.round(x1 - x0)}" height="${Math.round(y1 - y0)}" viewBox="0 0 ${Math.round(x1 - x0)} ${Math.round(y1 - y0)}" aria-hidden="true"><g fill="none" stroke-linecap="round" stroke-linejoin="round">` +
      lines.map((line) => `<path class="fx-quake-glow" pathLength="100" d="${d(line)}" stroke-width="9"/>`).join('') +
      lines.map((line) => `<path class="fx-quake-core" pathLength="100" d="${d(line)}" stroke-width="3.4"/>`).join('') +
      '</g></svg>';
    ground.append(crack);
    for (const line of crack.querySelectorAll('path')) {
      line.setAttribute('stroke-dasharray', '100 100');
      line.setAttribute('stroke-dashoffset', '100');
      animate(line, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duration: 340, delay: slam + 40, easing: 'ease-in', fill: 'both' });
    }
    animate(crack, [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: slam + 1300, easing: 'ease-in' }).then(() => crack.remove());
    // The pillars under every foe, tossing it.
    const reach = slam + 40 + 340;
    const hit = reached(event, targets);
    foes.forEach((foe, index) => {
      const art = artOf(foe.card);
      const base = { x: art.x + art.width / 2, y: art.y + art.height + 2 };
      const delay = reach + index * 60;
      // (Low pillars, as the Trzęsienie ziemi's rocks: the foe stays in sight
      // above them.)
      const pillar = Math.round(Math.max(22, figureOf(art) * 0.42));
      [-0.3, 0.04, 0.32].forEach((dx, k) => {
        const rock = spark('fx-rock fx-rock--rune', { x: base.x + dx * figureOf(art), y: base.y }, { '--fx': color, '--size': `${Math.round(pillar * (k === 1 ? 1 : 0.72))}px` });
        rock.innerHTML = RUNE_ROCK;
        const tilt = (dx * 36).toFixed(1);
        animate(
          rock,
          [
            { transform: `translate(-50%, -100%) rotate(${tilt}deg) scaleY(0)`, opacity: 1 },
            { transform: `translate(-50%, -100%) rotate(${tilt}deg) scaleY(1.15)`, opacity: 1, offset: 0.16, easing: 'ease-out' },
            { transform: `translate(-50%, -100%) rotate(${tilt}deg) scaleY(1)`, opacity: 1, offset: 0.26 },
            { transform: `translate(-50%, -100%) rotate(${tilt}deg) scaleY(1)`, opacity: 1, offset: 0.7 },
            { transform: `translate(-50%, -100%) rotate(${tilt}deg) scaleY(0.2)`, opacity: 0 },
          ],
          { duration: 860, delay: delay + k * 40, easing: 'ease-in', fill: 'backwards' },
        ).then(() => rock.remove());
      });
      after(delay, ground, () => {
        groundRing(foe.unit.id, color, { scale: 1.1, duration: 640 });
        if (!hit.includes(foe.unit.id)) return;
        animate(
          foe.card,
          [
            { transform: 'translateY(0px) rotate(0deg)' },
            { transform: `translateY(-13px) rotate(${index % 2 ? 3 : -3}deg)`, offset: 0.3, easing: 'ease-in' },
            { transform: 'translateY(2px) rotate(0deg)', offset: 0.62 },
            { transform: 'translateY(0px) rotate(0deg)' },
          ],
          { duration: 480, easing: 'ease-out', composite: 'add' },
        );
        particles.burst({ x: base.x, y: base.y, area: { width: figureOf(art), height: 4 }, count: 8, colors: DUST, angle: -Math.PI / 2, spread: 1.2, speed: [30, 90], life: [600, 950], size: [4, 7], shape: 'dust', gravity: -16, drag: 2 });
        particles.burst({ x: base.x, y: base.y, count: 10, colors: STONE, angle: -Math.PI / 2, spread: 1.1, speed: [110, 240], life: [380, 620], size: [1.6, 2.8], shape: 'shard', gravity: 620, drag: 1 });
        particles.burst({ x: base.x, y: base.y - figureOf(art) * 0.2, count: 6, colors: ['#ffffff', color], angle: -Math.PI / 2, spread: 0.8, speed: [60, 160], life: [260, 480], size: [1, 1.8], shape: 'spark', drag: 3 });
      });
    });
    after(reach, ground, () => shake(5, 460));
    await wait(reach + foes.length * 60 + 420);
  }

  // A rampart of light with battlements, `width` × `height`.
  function rampartArt(width, height) {
    const w = Math.round(width);
    const hgt = Math.round(height);
    const notch = Math.round(hgt * 0.32);
    const step = 12;
    let d = `M1 ${hgt - 1}V${notch}`;
    for (let x = 1; x < w - 1; x += step) {
      const middle = Math.min(w - 1, x + step / 2);
      const end = Math.min(w - 1, x + step);
      d += `H${middle.toFixed(1)}V1H${end.toFixed(1)}V${notch}`;
    }
    d += `V${hgt - 1}Z`;
    return (
      `<svg width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}" aria-hidden="true">` +
      `<path d="${d}" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>` +
      `<path d="M3 ${(hgt * 0.66).toFixed(1)}H${w - 3}" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 6" opacity="0.75"/></svg>`
    );
  }

  // The Tarcza tytana: the Tytan's tower shield rises over its card, grows
  // and flares with runes, and its light spreads over the party's front as
  // a rampart with battlements; lines of runes bind every card of the
  // party to the Tytan (the foes' blows go to it), whose card keeps the
  // shield's rim.
  async function rampart(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await bubble(id, color);
      return;
    }
    const party = standing(entry.unit.side);
    const boxes = party.map((member) => boxOf(member.card));
    const ally = entry.unit.side === 'ally';
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const width = stageWidth();
    const own = boxOf(entry.card);
    const center = { x: own.x + own.width / 2, y: art.y + art.height * 0.5 };
    const size = Math.round(Math.max(34, Math.min(figure * 0.8, art.height * 0.9)));
    const shield = spark('fx-towershield fx-towershield--light', center, { '--fx': color, '--size': `${size}px` });
    shield.innerHTML = TOWER_SHIELD;
    animate(
      shield,
      [
        { transform: 'translate(-50%, -50%) translateY(14px) scale(0.4)', opacity: 0 },
        { transform: 'translate(-50%, -50%) translateY(-4px) scale(1.12)', opacity: 1, offset: 0.25, easing: 'ease-out' },
        { transform: 'translate(-50%, -50%) translateY(-3px) scale(1.04)', opacity: 1, offset: 0.5 },
        { transform: 'translate(-50%, -50%) translateY(-3px) scale(1.35)', opacity: 0 },
      ],
      { duration: 1250, easing: 'ease-in-out' },
    ).then(() => shield.remove());
    // The rampart on the party's front edge, spreading out from the Tytan.
    const front = ally ? Math.min(...boxes.map((box) => box.y)) : Math.max(...boxes.map((box) => box.y + box.height));
    const left = Math.max(2, Math.min(...boxes.map((box) => box.x)) - 4);
    const right = Math.min(width - 2, Math.max(...boxes.map((box) => box.x + box.width)) + 4);
    const height = Math.round(Math.max(20, figure * 0.4));
    const wall = spark('fx-rampart', { x: left, y: ally ? front - height + 8 : front - 8 }, { '--fx': color });
    wall.style.width = `${Math.round(right - left)}px`;
    wall.style.height = `${height}px`;
    wall.style.transformOrigin = `${(center.x - left).toFixed(1)}px 50%`;
    wall.innerHTML = rampartArt(right - left, height);
    animate(
      wall,
      [
        { transform: 'scaleX(0)', opacity: 0 },
        { transform: 'scaleX(0)', opacity: 0, offset: 0.2 },
        { transform: 'scaleX(1)', opacity: 0.95, offset: 0.42, easing: 'ease-out' },
        { transform: 'scaleX(1)', opacity: 0.9, offset: 0.82 },
        { transform: 'scaleX(1)', opacity: 0 },
      ],
      { duration: 1550 },
    ).then(() => wall.remove());
    const mark = anchor(1600);
    after(320, mark, () => {
      flash(color, 0.12, 360);
      shake(2.5, 260, true);
      particles.burst({ x: center.x, y: center.y, count: 14, colors: ['#ffffff', '#c8f4fa', color], speed: [80, 200], life: [260, 480], size: [1, 2], shape: 'spark', drag: 3 });
    });
    party.forEach((member, index) => {
      if (member === entry) return;
      sightOf(figurePoint(member.card, 0.5), center, color, 520 + index * 70, 820);
      after(520 + index * 70, mark, () => rimGlow(member.card, color, 700));
    });
    after(600, mark, () => {
      rimGlow(entry.card, color, 900);
      entry.card.classList.add('unit--shielded');
      entry.card.style.setProperty('--shield', color);
    });
    await wait(1300);
  }

  // The Strzała z niebios, while its bowstring is drawn (arena-fx.js): a
  // star kindles over the Niebiański Łucznik, lines of starlight run from it
  // through its target and every foe behind it, where the arrow will go, and
  // the arrow leaves a wake of starlight.
  function starAim(event, color) {
    const target = cards.get(event.target);
    const shooter = cards.get(event.actor);
    if (!target || !shooter) return;
    if (reduced() || !particles) {
      ring(event.target, color, 70, 420);
      return;
    }
    const art = artOf(shooter.card);
    const figure = figureOf(art);
    const star = { x: art.x + art.width / 2, y: art.y + Math.max(8, art.height * 0.12) };
    twinkle(star, '#ffffff', figure * 0.95);
    twinkle(star, color, figure * 0.6, 160);
    rimGlow(shooter.card, color, 700);
    gatherTo(star, figure * 0.5, ['#ffffff', '#fff6cf', color], { count: 12, life: 300 });
    const from = centerOf(shooter.card);
    const to = centerOf(target.card);
    sightOf(from, to, color, 120, 700);
    behindOf(target.card).forEach((card, index) => sightOf(to, centerOf(card), color, 260 + index * 60, 560 - index * 40));
    const mark = anchor(1000);
    after(440, mark, () => particles.trail({ from, to, duration: 260, colors: ['#ffffff', '#fff6cf', color, '#cfe0ff'], rate: 150, sizes: [1, 2.4], life: [300, 620], shape: 'mote' }));
  }

  // The Strzała z niebios lands: it bursts on its foe in a star of light (a
  // smaller one on every foe behind that it goes through) and flies on.
  function starHit(event, look) {
    const target = cards.get(event.target);
    const shooter = cards.get(event.actor);
    if (!target || !shooter) return;
    if (reduced() || !particles) {
      pierce(event, look.color);
      burst(event.target, look.color, 60);
      return;
    }
    const to = centerOf(target.card);
    const ahead = event.pierced ? aheadOf(target.card) : null;
    const from = centerOf(ahead ?? shooter.card);
    const way = Math.atan2(to.y - from.y, to.x - from.x);
    const figure = figureOf(artOf(target.card));
    const big = !event.pierced;
    pierceAlong(target.card, way, look.color);
    twinkle(to, '#ffffff', figure * (big ? 1.25 : 0.85));
    twinkle(to, look.color, figure * (big ? 0.9 : 0.6), 90);
    burst(event.target, '#fff6cf', Math.round(figure * (big ? 1.3 : 0.9)));
    ring(event.target, look.color, Math.round(figure * (big ? 1.7 : 1.2)), 480);
    particles.burst({ x: to.x, y: to.y, count: big ? 22 : 14, colors: ['#ffffff', '#fff6cf', look.color, '#cfe0ff'], speed: [120, 300], life: [300, 620], size: [1, 2.4], shape: 'mote', drag: 2.4 });
    animate(target.card, [{ filter: 'brightness(2.4) saturate(0.6)' }, { filter: 'brightness(1)' }], { duration: 520, easing: 'ease-out' });
    if (big) {
      flash('#fff6cf', 0.16, 340);
      shake(3, 280);
    }
  }

  // A shooting star from one point to another: a bright head and a long
  // tail behind it.
  function shootingStar(from, to, delay, color) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = Math.atan2(dy, dx).toFixed(4);
    const star = spark('fx-shootingstar', from, { '--fx': color, '--size': `${Math.round(Math.min(64, Math.hypot(dx, dy) * 0.4))}px` });
    return animate(
      star,
      [
        { transform: `translate(0px, 0px) rotate(${angle}rad) scaleX(0.3)`, opacity: 0 },
        { opacity: 1, offset: 0.15 },
        { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${angle}rad) scaleX(1)`, opacity: 1 },
      ],
      { duration: 300, delay, easing: 'ease-in', fill: 'backwards' },
    ).then(() => star.remove());
  }

  // The Deszcz gwiazd: night falls over the arena with its stars, the
  // Niebiański Łucznik looses a handful of arrows into it, and they fall
  // back as shooting stars, each on its foe in the order of the blows,
  // bursting in starlight where they land.
  async function starfall(event, color, targets) {
    const caster = cards.get(event.actor);
    if (!caster || reduced() || !particles) {
      await rain(color, targets);
      return;
    }
    const width = stageWidth();
    const height = stageHeight();
    const night = spark('fx-sky fx-sky--night', { x: 0, y: 0 });
    night.style.width = `${width}px`;
    night.style.height = `${Math.round(height * 0.7)}px`;
    const blows = event.blows?.length ? event.blows.map((blow) => blow.target) : targets;
    const total = 640 + blows.length * 110 + 700;
    animate(night, [{ opacity: 0 }, { opacity: 1, offset: 0.16 }, { opacity: 0.9, offset: 0.8 }, { opacity: 0 }], { duration: total, easing: 'ease-out' }).then(() => night.remove());
    const random = seeded(31 + blows.length);
    for (let k = 0; k < 9; k++) twinkle({ x: width * (0.06 + random() * 0.88), y: height * (0.03 + random() * 0.24) }, '#ffffff', 8 + random() * 8, 120 + k * 90);
    const up = volleyUp(centerOf(caster.card), color);
    await wait(320);
    if (!night.isConnected) return;
    const falls = blows.map((id, index) => {
      const entry = cards.get(id);
      if (!entry) return Promise.resolve();
      const art = artOf(entry.card);
      const figure = figureOf(art);
      const land = { x: art.x + art.width * (0.35 + random() * 0.3), y: art.y + art.height * (0.35 + random() * 0.3) };
      const start = { x: inside(land.x - 50 - random() * 40, 4, width), y: -8 };
      return shootingStar(start, land, index * 110, color).then(() => {
        if (!night.isConnected) return;
        twinkle(land, '#ffffff', figure * 0.7);
        particles.burst({ x: land.x, y: land.y, count: 10, colors: ['#ffffff', '#fff6cf', color], speed: [80, 220], life: [240, 460], size: [1, 2], shape: 'mote', drag: 2.6 });
        animate(entry.card, [{ filter: 'brightness(2.1) saturate(0.7)' }, { filter: 'brightness(1)' }], { duration: 340, easing: 'ease-out' });
        if (index === 0) flash('#d6e4ff', 0.1, 260);
      });
    });
    await Promise.all([...up, ...falls]);
  }

  // A crack of light across the sky over the arena, `width` wide, round the
  // height `y`: its left and its right half, each drawn from the middle out.
  function skyCrackArt(width, y) {
    const random = seeded(53);
    const w = Math.round(width);
    const mid = w / 2;
    const half = (way) => {
      const points = [{ x: mid, y }];
      for (let k = 1; k <= 8; k++) points.push({ x: mid + way * (mid / 8) * k, y: y + (random() - 0.5) * 14 });
      return `M${points.map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join('L')}`;
    };
    const paths = [half(-1), half(1)];
    const forks = [0.3, 0.55, 0.78].map((share, k) => {
      const x = mid + (k % 2 ? 1 : -1) * mid * share;
      return `M${x.toFixed(1)} ${y.toFixed(1)}L${(x + (k % 2 ? 8 : -8)).toFixed(1)} ${(y + 12).toFixed(1)}L${(x + (k % 2 ? 4 : -4)).toFixed(1)} ${(y + 20).toFixed(1)}`;
    });
    return (
      `<svg width="${w}" height="${Math.round(y + 30)}" viewBox="0 0 ${w} ${Math.round(y + 30)}" aria-hidden="true"><g fill="none" stroke-linecap="round" stroke-linejoin="round">` +
      [...paths, ...forks].map((d, k) => `<path class="fx-skycrack-glow" pathLength="100" d="${d}" stroke-width="${k < 2 ? 10 : 6}"/>`).join('') +
      [...paths, ...forks].map((d, k) => `<path class="fx-skycrack-core" pathLength="100" d="${d}" stroke-width="${k < 2 ? 3.2 : 2}"/>`).join('') +
      '</g></svg>'
    );
  }

  // The Burza Peruna: the sky over the arena blackens and splits with a
  // blinding crack of gold, Perun's lightning strikes every foe out of it,
  // and then each bolt leaps on from foe to foe as the blows go.
  async function skySplit(event, color, targets) {
    const caster = cards.get(event.actor);
    const blows = event.blows?.length ? event.blows.map((blow) => blow.target) : targets;
    const order = [...new Set(blows)].filter((id) => cards.get(id));
    if (!caster || order.length === 0 || reduced() || !particles) {
      await rain(color, targets);
      return;
    }
    const width = stageWidth();
    const y = Math.round(Math.max(10, stageHeight() * 0.05));
    const strikes = [];
    const leaps = [];
    for (let k = 1; k < blows.length; k++) if (blows[k] !== blows[k - 1] && cards.get(blows[k]) && cards.get(blows[k - 1])) leaps.push([blows[k - 1], blows[k]]);
    const leapAt = 420 + order.length * 140 + 160;
    const sky = stormSky(leapAt + leaps.length * 130 + 900, true);
    const crack = spark('fx-skycrack', { x: 0, y: 0 }, { '--fx': color });
    crack.innerHTML = skyCrackArt(width, y);
    crack.querySelectorAll('path').forEach((line) => {
      line.setAttribute('stroke-dasharray', '100 100');
      line.setAttribute('stroke-dashoffset', '100');
      animate(line, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duration: 260, delay: 120, easing: 'ease-out', fill: 'both' });
    });
    animate(crack, [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: leapAt + 300, easing: 'ease-in' }).then(() => crack.remove());
    after(160, sky, () => {
      flash('#fff7d6', 0.28, 380);
      shake(3, 300);
    });
    order.forEach((id, index) => {
      strikes.push(
        after(420 + index * 140, sky, () => {
          const entry = cards.get(id);
          if (!entry) return;
          const point = figurePoint(entry.card, 0.55);
          lightning({ x: inside(point.x + (Math.random() - 0.5) * 16, 4, width), y: y + 4 }, point, { color, forks: 2, width: 1.35, duration: 520 });
          stormSparks(point, 12);
          shocked(entry, 2.8);
          shake(3, 240);
        }),
      );
    });
    leaps.forEach(([from, to], index) => {
      strikes.push(
        after(leapAt + index * 130, sky, () => {
          const a = cards.get(from);
          const b = cards.get(to);
          if (!a || !b) return;
          const start = figurePoint(a.card, 0.5);
          const end = figurePoint(b.card, 0.5);
          lightning(start, end, { color, jag: 1.5, forks: 1, width: 1, duration: 420 });
          particles.trail({ from: start, to: end, duration: 200, colors: ['#ffffff', color], rate: 120, sizes: [1, 2], life: [160, 300], shape: 'mote' });
          stormSparks(end, 8);
          shocked(b, 2.2);
        }),
      );
    });
    await Promise.all(strikes);
    await wait(260);
  }

  // Where the Kula piorunów hangs: high over the middle of the battlefield
  // (arena-fx.js globeZap() strikes from the same place).
  function globeAt() {
    const width = stageWidth();
    const size = Math.round(Math.min(58, width * 0.15));
    return { point: { x: width / 2, y: Math.round(Math.max(size * 1.2, stageHeight() * 0.11)) }, size };
  }

  // The Kula piorunów wakes: lightning runs up from the Gromowładny into the
  // sky over the middle of the battlefield, sparks gather there into a great
  // ball of lightning, which flares and crackles, its arcs reaching out.
  async function globeForm(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await aura(id, color, 1);
      return;
    }
    const { point, size } = globeAt();
    const from = figurePoint(entry.card, 0.35);
    lightning(from, point, { color, jag: 1.2, forks: 1, width: 0.9, duration: 420 });
    particles.trail({ from, to: point, duration: 340, colors: STORM, rate: 90, sizes: [1, 2], life: [200, 380], shape: 'mote' });
    gatherTo(point, size * 1.4, STORM, { count: 16, life: 340 });
    const ball = spark('fx-thunderorb fx-thunderorb--globe', point, { '--fx': color, '--size': `${size}px` });
    ball.innerHTML = ORB_ARCS;
    animate(
      ball,
      [
        { transform: 'translate(-50%, -50%) scale(0)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(0)', opacity: 0, offset: 0.2 },
        { transform: 'translate(-50%, -50%) scale(1.15)', opacity: 1, offset: 0.3 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.4 },
        { transform: 'translate(-50%, -50%) scale(1.08)', opacity: 1, offset: 0.62 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.85 },
        { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0 },
      ],
      { duration: 1600, easing: 'ease-in-out' },
    ).then(() => ball.remove());
    after(420, ball, () => {
      flash(color, 0.14, 320);
      stormSparks(point, 16);
      shake(2, 220);
      aura(id, color, 1);
    });
    // (Its arcs reach no higher than the arena's top edge.)
    const reach = Math.min(size * 1.3, point.y - 6);
    for (const delay of [640, 900, 1160]) after(delay, ball, () => crackle(point, reach, color, 3));
    await wait(1400);
  }

  // The Kula piorunów's bolt lands (arena-fx.js globeZap() drew it from the
  // ball): lightning crackles over the foe, a ring of it bursts round its
  // card and the card flares white.
  function globeStrike(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 60);
      return;
    }
    const point = centerOf(entry.card);
    const figure = figureOf(artOf(entry.card));
    crackle(point, figure * 0.55, color, 5);
    stormSparks(point, 16);
    burst(event.target, '#ece6ff', Math.round(figure * 1.1));
    ring(event.target, color, Math.round(figure * 1.6), 440);
    shocked(entry, 2.6);
    shake(2.6, 240);
  }

  // A foe the Gromowładny's lightning stunned (porażony): bolts crackle round
  // its card twice and the card twitches.
  function jolt(event) {
    const entry = cards.get(event.target);
    if (!entry || reduced() || !particles) return;
    const { color } = lookOf(event);
    const point = figurePoint(entry.card, 0.5);
    const figure = figureOf(artOf(entry.card));
    crackle(point, figure * 0.5, color, 4);
    crackle(point, figure * 0.45, '#ffffff', 3, 380);
    ring(event.target, color, Math.round(figure * 1.4), 520);
    animate(
      entry.card,
      [{ transform: 'translateX(0px)' }, { transform: 'translateX(-2px)', offset: 0.2 }, { transform: 'translateX(2px)', offset: 0.4 }, { transform: 'translateX(-1px)', offset: 0.6 }, { transform: 'translateX(0px)' }],
      { duration: 340, iterations: 2, composite: 'add' },
    );
  }

  // ——— The fourth forms' skills, batch 2 ———

  // The Stwórca Żywiołów's four elements: fire, ice, lightning and stone.
  const ELEMENTS4 = [
    { color: '#ff8a3d', colors: FIRE, shape: 'ember' },
    { color: '#bfe8ff', colors: ICE, shape: 'shard' },
    { color: '#d9ccff', colors: STORM, shape: 'spark' },
    { color: '#a39a89', colors: STONE, shape: 'shard' },
  ];

  // The card of the creature a summon's blow comes from.
  const summonOfBlow = (event) => [...cards.values()].find((entry) => entry.unit.summon === event.skill && entry.unit.id.startsWith(`${event.actor}~`)) ?? null;

  // The Wódz watahy: the white wolf comes out of a pale mist (huntCall), a
  // full moon rises over it, it howls at the moon in silver waves, and its
  // howl fires up the whole party (their blows hit harder while it
  // stands): their cards flare red and silver.
  async function chiefCall(event, look) {
    const owner = cards.get(event.actor);
    const calling = huntCall(event, look);
    const entry = summonedCard(event);
    if (!owner || !entry || reduced() || !particles) {
      await calling;
      return;
    }
    const art = artOf(entry.card);
    const box = boxOf(entry.card);
    const figure = figureOf(art);
    const width = stageWidth();
    const head = { x: art.x + art.width / 2, y: art.y + art.height * 0.3 };
    const size = Math.round(Math.max(30, Math.min(figure * 0.85, 64)));
    // (Night falls over the arena a moment, and the moon rises high in its
    // sky over the wolf's side of the field.)
    const night = spark('fx-sky fx-sky--night', { x: 0, y: 0 });
    night.style.width = `${width}px`;
    night.style.height = `${Math.round(stageHeight() * 0.7)}px`;
    animate(night, [{ opacity: 0 }, { opacity: 0.85, offset: 0.25 }, { opacity: 0.8, offset: 0.75 }, { opacity: 0 }], { duration: 1500, delay: 150, fill: 'backwards' }).then(() => night.remove());
    const moonAt = { x: inside(box.x + box.width / 2, size / 2 + 2, width), y: Math.round(Math.max(size * 0.7, stageHeight() * 0.09)) };
    const moon = spark('fx-moon', moonAt, { '--size': `${size}px` });
    animate(
      moon,
      [
        { transform: 'translate(-50%, -50%) translateY(14px) scale(0.6)', opacity: 0 },
        { transform: 'translate(-50%, -50%) translateY(0px) scale(1)', opacity: 0.95, offset: 0.3, easing: 'ease-out' },
        { transform: 'translate(-50%, -50%) translateY(-2px) scale(1.02)', opacity: 0.9, offset: 0.78 },
        { transform: 'translate(-50%, -50%) translateY(-4px) scale(1.04)', opacity: 0 },
      ],
      { duration: 1350, delay: 200, easing: 'ease-in-out', fill: 'backwards' },
    ).then(() => moon.remove());
    const mark = anchor(1700);
    // The howl: silver waves from the wolf's head, three of them.
    for (let k = 0; k < 3; k++) {
      after(650 + k * 180, mark, () => {
        const wave = spark('fx-ragewave', head, { '--fx': '#e8eef8', '--size': `${Math.round(figure * 0.9)}px` });
        wave.innerHTML = RAGE_WAVE;
        animate(
          wave,
          [
            { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0.95 },
            { transform: `translate(-50%, -50%) translateY(${(-figure * 0.25).toFixed(1)}px) scale(1.6)`, opacity: 0 },
          ],
          { duration: 700, easing: 'ease-out' },
        ).then(() => wave.remove());
      });
    }
    // The party fired up by the howl.
    const party = standing(owner.unit.side).filter((member) => member !== entry);
    party.forEach((member, index) => {
      after(820 + index * 80, mark, () => {
        rimGlow(member.card, '#ff7a5c', 700);
        tintCard(member.card, '#e8462f', [{ opacity: 0 }, { opacity: 0.3, offset: 0.3 }, { opacity: 0 }], 700);
        const point = figurePoint(member.card, 0.6);
        particles.burst({ x: point.x, y: point.y, area: { width: figureOf(artOf(member.card)) * 0.6, height: 6 }, count: 8, colors: ['#ffffff', '#e8eef8', '#ff7a5c', '#e8462f'], angle: -Math.PI / 2, spread: 0.5, speed: [40, 110], gravity: -30, drag: 1.2, life: [500, 800], size: [1.1, 2.1], shape: 'spark' });
      });
    });
    await calling;
    await wait(Math.max(0, 1550 - 1250));
  }

  // The white wolf's bite (Wódz watahy): its fangs' marks in red, blood
  // spurting and dripping from the wound.
  function chiefBite(event) {
    const entry = cards.get(event.target);
    if (!entry || reduced() || !particles) return;
    const point = figurePoint(entry.card, 0.45);
    const figure = figureOf(artOf(entry.card));
    const biter = summonOfBlow(event) ?? cards.get(event.actor);
    const from = biter ? centerOf(biter.card) : { x: point.x, y: point.y + 80 };
    const away = Math.atan2(point.y - from.y, point.x - from.x);
    const turn = (away * 180) / Math.PI + 90;
    for (const [k, shift] of [-0.1, 0.1].entries()) {
      const across = { x: point.x + Math.cos(away) * shift * figure, y: point.y + Math.sin(away) * shift * figure };
      cutAt(across, turn, figure * 0.55, k ? '#ff8a7a' : '#d9534f', { delay: k * 50, duration: 360, bend: k ? -7 : 7, width: 1.2 });
    }
    bleed(entry.card, point, away, { count: 9, drips: 2 });
    tintCard(entry.card, '#b3263b', [{ opacity: 0 }, { opacity: 0.35, offset: 0.25 }, { opacity: 0 }], 520);
  }

  // The Zew niedźwiedzia: once the brown bear has burst out of the thicket
  // (bearOut), it rears up on its hind legs and roars: waves of its roar
  // roll at the foes, dust flies off the ground and the foes flinch.
  async function bearRears(event, color) {
    const entry = summonedCard(event);
    if (!entry || reduced() || !particles) return;
    const card = entry.card;
    const art = artOf(card);
    const figure = figureOf(art);
    const box = boxOf(card);
    const head = { x: art.x + art.width / 2, y: art.y + art.height * 0.3 };
    animate(
      card,
      [
        { transform: 'translateY(0px) scale(1) rotate(0deg)' },
        { transform: 'translateY(-9px) scale(1.1) rotate(-2deg)', offset: 0.3, easing: 'ease-out' },
        { transform: 'translateY(-9px) scale(1.1) rotate(1deg)', offset: 0.6 },
        { transform: 'translateY(0px) scale(1) rotate(0deg)' },
      ],
      { duration: 900, composite: 'add' },
    );
    const mark = anchor(1100);
    after(260, mark, () => {
      shake(4, 420);
      flash('#c98a4b', 0.1, 300);
      for (let k = 0; k < 3; k++) {
        const wave = spark('fx-ragewave', head, { '--fx': '#ffcf8a', '--size': `${Math.round(figure * (1.3 + k * 0.25))}px` });
        wave.innerHTML = RAGE_WAVE;
        animate(
          wave,
          [
            { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0.95 },
            { transform: 'translate(-50%, -50%) scale(1.7)', opacity: 0 },
          ],
          { duration: 640, delay: k * 120, easing: 'ease-out', fill: 'backwards' },
        ).then(() => wave.remove());
      }
      particles.burst({ x: box.x + box.width / 2, y: box.y + box.height - 8, area: { width: box.width * 0.8, height: 6 }, count: 10, colors: DUST, speed: [30, 90], life: [600, 950], size: [4, 8], shape: 'dust', gravity: -16, drag: 2 });
      for (const foe of foesOf(entry)) {
        animate(foe.card, [{ transform: 'translateY(0px)' }, { transform: 'translateY(-4px)', offset: 0.3 }, { transform: 'translateY(0px)' }], { duration: 360, delay: 120, composite: 'add' });
      }
    });
    await wait(900);
  }

  // The bear's paw (Zew niedźwiedzia): three claw marks rake the foe at
  // once, dust and stones fly and its card is knocked down.
  function bearMaul(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 80);
      return;
    }
    const card = entry.card;
    const point = figurePoint(card, 0.45);
    const figure = figureOf(artOf(card));
    const turn = -62;
    const radians = (turn * Math.PI) / 180;
    for (let k = 0; k < 3; k++) {
      const shift = (k - 1) * figure * 0.16;
      const across = { x: point.x - Math.sin(radians) * shift, y: point.y + Math.cos(radians) * shift };
      cutAt(across, turn, figure * 0.95, k === 1 ? '#ffffff' : '#e8462f', { delay: k * 40, duration: 380, bend: 6, width: 1.3 });
    }
    particles.burst({ x: point.x, y: point.y, count: 10, colors: ['#ffffff', BLOOD[0], BLOOD[1]], angle: radians + Math.PI / 2, spread: 0.6, speed: [100, 220], life: [220, 420], size: [1.1, 2.2], shape: 'spark', drag: 3 });
    particles.burst({ x: point.x, y: point.y + figure * 0.3, count: 8, colors: STONE, angle: -Math.PI / 2, spread: 1, speed: [80, 180], life: [320, 560], size: [1.4, 2.6], shape: 'shard', gravity: 520, drag: 1.2 });
    shake(4.5, 360);
    animate(card, [{ transform: 'translateY(0px) scale(1)' }, { transform: 'translateY(6px) scale(0.97)', offset: 0.25 }, { transform: 'translateY(0px) scale(1)' }], { duration: 420, easing: 'ease-out', composite: 'add' });
  }

  // A fall from the sky onto a point: a burning meteor or a falling star of
  // ice, its tail behind it, or a boulder turning as it drops.
  function fallOn(kind, from, to, { delay = 0, duration = 340, size = 16 } = {}) {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const rock = kind === 'stone';
    const body = spark(rock ? 'fx-rock fx-rock--falling' : `fx-meteor${kind === 'ice' ? ' fx-meteor--ice' : ''}`, { x: 0, y: 0 }, { '--size': `${size}px` });
    if (rock) body.innerHTML = ROCK;
    const at = (point, turn) =>
      rock
        ? `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px) translate(-50%, -50%) rotate(${turn}deg)`
        : `translate(${(point.x - size / 2).toFixed(1)}px, ${(point.y - size / 2).toFixed(1)}px) rotate(${angle.toFixed(4)}rad)`;
    return animate(
      body,
      [
        { transform: at(from, 0), opacity: 0 },
        { opacity: 1, offset: 0.12 },
        { transform: at(to, 300), opacity: 1 },
      ],
      { duration, delay, easing: 'ease-in', fill: 'backwards' },
    ).then(() => body.remove());
  }

  // The Pierwotny chaos: the world goes back to its beginning for a moment:
  // the sky over the arena darkens, the four elements circle high over the
  // field, and then fire, ice, lightning and boulders fall at once on every
  // foe, each bursting in its own way.
  async function primalChaos(event, color, targets) {
    const caster = cards.get(event.actor);
    const foes = targets.map((id) => cards.get(id)).filter(Boolean);
    if (!caster || foes.length === 0 || reduced() || !particles) {
      await rain(color, targets);
      return;
    }
    const width = stageWidth();
    const height = stageHeight();
    const sky = spark('fx-sky fx-sky--chaos', { x: 0, y: 0 });
    sky.style.width = `${width}px`;
    sky.style.height = `${Math.round(height * 0.7)}px`;
    const total = 560 + foes.length * 150 + 900;
    animate(sky, [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 0.9, offset: 0.8 }, { opacity: 0 }], { duration: total, easing: 'ease-out' }).then(() => sky.remove());
    // The four elements circling high over the middle of the field.
    const center = { x: width / 2, y: Math.round(Math.max(30, height * 0.1)) };
    const radius = Math.min(width * 0.12, 44);
    const orbs = ELEMENTS4.map((element, k) => {
      const orb = spark('fx-element-orb', center, { '--fx': element.color, '--size': '14px' });
      const frames = Array.from({ length: 9 }, (_, step) => {
        const turn = (k / 4) * Math.PI * 2 + (step / 8) * Math.PI * 2.5;
        const r = radius * Math.min(1, step / 2);
        return { transform: `translate(-50%, -50%) translate(${(Math.cos(turn) * r).toFixed(1)}px, ${(Math.sin(turn) * r * 0.5).toFixed(1)}px) scale(${step === 0 ? 0.3 : 1})`, opacity: step === 0 || step === 8 ? 0 : 1 };
      });
      return animate(orb, frames, { duration: 700, easing: 'linear' }).then(() => orb.remove());
    });
    const mark = anchor(total);
    after(80, mark, () => {
      flash('#ffb36b', 0.12, 320);
      shake(2, 260);
    });
    const hit = reached(event, targets);
    const random = seeded(71 + foes.length);
    const strikes = [];
    foes.forEach((foe, index) => {
      if (!hit.includes(foe.unit.id)) return;
      const figure = figureOf(artOf(foe.card));
      const point = figurePoint(foe.card, 0.5);
      const start = 560 + index * 150;
      const spots = [
        { x: point.x - figure * 0.2, y: point.y - figure * 0.08 },
        { x: point.x + figure * 0.2, y: point.y - figure * 0.04 },
        { x: point.x, y: point.y },
        { x: point.x + figure * 0.05, y: point.y + figure * 0.12 },
      ];
      const land = (k) => {
        if (!sky.isConnected) return;
        const element = ELEMENTS4[k];
        particles.burst({ x: spots[k].x, y: spots[k].y, count: 10, colors: element.colors, speed: [80, 200], life: [260, 480], size: [1.2, 2.4], shape: element.shape, gravity: k === 3 ? 520 : k === 0 ? -40 : 120, drag: 1.6 });
        animate(foe.card, [{ filter: `brightness(1.9) drop-shadow(0 0 6px ${element.color})` }, { filter: 'brightness(1)' }], { duration: 300, easing: 'ease-out' });
      };
      strikes.push(fallOn('fire', { x: inside(spots[0].x - 70, 8, width), y: -10 }, spots[0], { delay: start, size: 16 }).then(() => land(0)));
      strikes.push(fallOn('ice', { x: inside(spots[1].x + 70, 8, width), y: -10 }, spots[1], { delay: start + 90, size: 14 }).then(() => land(1)));
      strikes.push(
        after(start + 180, mark, () => {
          lightning({ x: inside(point.x + (random() - 0.5) * 30, 4, width), y: 2 }, spots[2], { color: '#d9ccff', forks: 2, width: 1.2, duration: 420 });
          stormSparks(spots[2], 8);
          land(2);
        }),
      );
      strikes.push(
        fallOn('stone', { x: spots[3].x + 12, y: -20 }, spots[3], { delay: start + 270, size: Math.round(Math.max(16, figure * 0.4)) }).then(() => {
          land(3);
          if (sky.isConnected) shake(2.5, 200);
        }),
      );
    });
    await Promise.all([...orbs, ...strikes]);
    await wait(160);
  }

  // The Żywiołak of the Stwórca Żywiołów: as it takes shape
  // (formElemental), four orbs, of fire, ice, lightning and stone, circle
  // its card and sink into it one by one, each with a flash of its colour.
  async function prismForm(event) {
    const entry = summonedCard(event);
    if (!entry || reduced() || !particles) return;
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const middle = figurePoint(entry.card, 0.5);
    const radius = Math.round(Math.min(figure * 0.62, 46));
    const mark = anchor(1900);
    ELEMENTS4.forEach((element, k) => {
      const orb = spark('fx-element-orb', middle, { '--fx': element.color, '--size': `${Math.round(Math.max(10, figure * 0.16))}px` });
      const frames = Array.from({ length: 13 }, (_, step) => {
        const share = step / 12;
        const turn = (k / 4) * Math.PI * 2 + share * Math.PI * 3;
        const r = radius * (share < 0.15 ? share / 0.15 : share > 0.75 ? Math.max(0, 1 - (share - 0.75) / 0.25) : 1);
        return { transform: `translate(-50%, -50%) translate(${(Math.cos(turn) * r).toFixed(1)}px, ${(Math.sin(turn) * r * 0.6).toFixed(1)}px)`, opacity: step === 0 || step === 12 ? 0 : 1 };
      });
      animate(orb, frames, { duration: 1300, delay: 300 + k * 60, easing: 'linear', fill: 'backwards' }).then(() => orb.remove());
      after(300 + k * 60 + 1240, mark, () => {
        particles.burst({ x: middle.x, y: middle.y, count: 8, colors: element.colors, speed: [60, 160], life: [240, 440], size: [1.1, 2.2], shape: element.shape, drag: 2 });
        rimGlow(entry.card, element.color, 360);
      });
    });
    await wait(1500);
  }

  // The Żywiołak's blow: it strikes with the element its foe is weakest to,
  // and the blow bursts round the foe in all four of its colours: embers,
  // shards of ice, sparks and stones, in rings of each colour.
  function prismHit(event) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, '#ffd27a', 70);
      return;
    }
    const point = figurePoint(entry.card, 0.5);
    const figure = figureOf(artOf(entry.card));
    const mark = anchor(700);
    ELEMENTS4.forEach((element, k) => {
      const angle = -Math.PI / 4 + (k * Math.PI) / 2;
      particles.burst({ x: point.x, y: point.y, count: 9, colors: element.colors, angle, spread: 0.55, speed: [90, 220], life: [240, 460], size: [1.2, 2.4], shape: element.shape, drag: 2, gravity: k === 3 ? 400 : 0 });
      after(k * 70, mark, () => ring(event.target, element.color, Math.round(figure * (1.1 + k * 0.15)), 380));
    });
    burst(event.target, '#ffffff', Math.round(figure * 1.05));
    shake(2.4, 220);
  }

  // The Lodowa wieczność: snow closes on the foe and a great crystal of
  // clear ice grows up over its figure from the ground, glints run up it,
  // frost mist spills at its foot, and it melts away.
  function eternityHit(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 80);
      return;
    }
    const card = entry.card;
    const box = boxOf(card);
    const art = artOf(card);
    const figure = figureOf(art);
    const x = art.x + art.width / 2;
    const width = Math.round(Math.min(box.width, figure * 1.45));
    const height = Math.round(Math.min(box.height + 4, art.height * 1.35));
    const bottom = box.y + box.height + 2;
    const prison = spark('fx-iceprison', { x: x - width / 2, y: bottom - height });
    prison.style.width = `${width}px`;
    prison.style.height = `${height}px`;
    prison.innerHTML = ICE_PRISON;
    animate(
      prison,
      [
        { clipPath: 'inset(100% -6px -6px -6px)', opacity: 1, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
        { clipPath: 'inset(0% -6px -6px -6px)', opacity: 1, offset: 0.18 },
        { clipPath: 'inset(0% -6px -6px -6px)', opacity: 1, offset: 0.78 },
        { clipPath: 'inset(0% -6px -6px -6px)', opacity: 0 },
      ],
      { duration: 1800 },
    ).then(() => prison.remove());
    gatherTo(figurePoint(card, 0.5), figure * 0.9, ICE, { count: 16, life: 300 });
    tintCard(card, '#bfefff', [{ opacity: 0 }, { opacity: 0.45, offset: 0.2 }, { opacity: 0.4, offset: 0.75 }, { opacity: 0 }], 1700);
    const mark = anchor(1800);
    after(120, mark, () => {
      particles.burst({ x, y: bottom - 6, area: { width: width * 0.9, height: 4 }, count: 14, colors: ICE, angle: -Math.PI / 2, spread: 0.6, speed: [80, 200], life: [320, 560], size: [1.2, 2.4], shape: 'shard', gravity: 300, drag: 1.4 });
      particles.burst({ x, y: bottom - 4, area: { width, height: 4 }, count: 10, colors: ['#ffffff', '#e4f6ff', '#bfe8ff'], speed: [10, 40], life: [800, 1200], size: [4, 8], shape: 'dust', gravity: -10, drag: 2 });
      shake(4, 360);
      flash('#e4f6ff', 0.14, 300);
    });
    after(520, mark, () => twinkle({ x: x - width * 0.18, y: bottom - height * 0.7 }, '#ffffff', figure * 0.5));
    after(760, mark, () => twinkle({ x: x + width * 0.2, y: bottom - height * 0.45 }, '#ffffff', figure * 0.4));
  }

  // The Lodowe serce: a heart of ice kindles over the Lodowy Bóg's chest and
  // beats twice, then bursts into shards that settle round its card as ice
  // armour, with frost mist curling at its foot. Its card keeps the ice
  // rim while the armour holds.
  async function iceHeart(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await bubble(id, color);
      return;
    }
    const card = entry.card;
    const art = artOf(card);
    const figure = figureOf(art);
    const box = boxOf(card);
    const chest = figurePoint(card, 0.62);
    const size = Math.round(Math.max(22, figure * 0.42));
    const heart = spark('fx-iceheart', chest, { '--size': `${size}px` });
    heart.innerHTML = ICE_HEART;
    animate(
      heart,
      [
        { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.18, easing: 'ease-out' },
        { transform: 'translate(-50%, -50%) scale(1.25)', opacity: 1, offset: 0.3 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.4 },
        { transform: 'translate(-50%, -50%) scale(1.3)', opacity: 1, offset: 0.52 },
        { transform: 'translate(-50%, -50%) scale(1.5)', opacity: 0, offset: 0.62 },
        { transform: 'translate(-50%, -50%) scale(1.5)', opacity: 0 },
      ],
      { duration: 1300 },
    ).then(() => heart.remove());
    gatherTo(chest, figure * 0.7, ICE, { count: 12, life: 260 });
    const mark = anchor(1500);
    after(800, mark, () => {
      flash('#bfefff', 0.14, 300);
      shake(2.5, 240, true);
      particles.burst({ x: chest.x, y: chest.y, count: 22, colors: ICE, speed: [120, 260], life: [240, 420], size: [1.2, 2.6], shape: 'shard', drag: 3.2 });
      tintCard(card, '#bfefff', [{ opacity: 0 }, { opacity: 0.5, offset: 0.25 }, { opacity: 0 }], 700);
      rimGlow(card, color, 900);
      card.classList.add('unit--shielded');
      card.style.setProperty('--shield', color);
      particles.burst({ x: box.x + box.width / 2, y: box.y + box.height - 6, area: { width: box.width * 0.8, height: 4 }, count: 10, colors: ['#ffffff', '#e4f6ff', '#bfe8ff'], speed: [10, 40], life: [800, 1200], size: [4, 7], shape: 'dust', gravity: -12, drag: 2 });
    });
    await wait(1250);
  }

  // Roots curling up from the bottom of a box `width` × `height`.
  function rootsArt(width, height) {
    const w = Math.round(width);
    const tall = Math.round(height);
    const curl = (x0, lean) => `M${x0.toFixed(1)} ${tall}C${(x0 + lean * 6).toFixed(1)} ${(tall * 0.6).toFixed(1)} ${(x0 - lean * 10).toFixed(1)} ${(tall * 0.35).toFixed(1)} ${(x0 + lean * 4).toFixed(1)} ${(tall * 0.08).toFixed(1)}`;
    const paths = [curl(w * 0.2, 1), curl(w * 0.5, -1), curl(w * 0.8, 1)];
    return (
      `<svg width="${w}" height="${tall}" viewBox="0 0 ${w} ${tall}" aria-hidden="true"><g fill="none" stroke-linecap="round">` +
      paths.map((d) => `<path class="fx-roots-glow" pathLength="100" d="${d}" stroke-width="6"/>`).join('') +
      paths.map((d) => `<path class="fx-roots-core" pathLength="100" d="${d}" stroke-width="2.6"/>`).join('') +
      '</g></svg>'
    );
  }

  // Lines drawn out along their length (stroke-dash), from `delay` for
  // `duration`.
  function drawLines(element, delay, duration) {
    for (const line of element.querySelectorAll('path')) {
      line.setAttribute('stroke-dasharray', '100 100');
      line.setAttribute('stroke-dashoffset', '100');
      animate(line, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duration, delay, easing: 'ease-out', fill: 'both' });
    }
  }

  // The Dąb wieków: as the oak rises out of the ground (riseOak), its roots
  // run out under the field in glowing green lines to every card of the
  // party and every foe, leaves come down all over the arena, and the
  // party's cards glow green (it heals them while it stands).
  async function ancientOak(event, color) {
    const entry = summonedCard(event);
    const owner = cards.get(event.actor);
    if (!entry || !owner || reduced() || !particles) return;
    const box = boxOf(entry.card);
    const width = stageWidth();
    const height = stageHeight();
    const root = { x: box.x + box.width / 2, y: box.y + box.height - 4 };
    const party = standing(owner.unit.side).filter((member) => member !== entry);
    const ends = [...party, ...foesOf(owner)].map((member) => {
      const end = boxOf(member.card);
      return { x: end.x + end.width / 2, y: end.y + end.height - 4 };
    });
    const random = seeded(29 + ends.length);
    const lines = ends.map((to) => {
      const bend = { x: (root.x + to.x) / 2 + (random() - 0.5) * 40, y: (root.y + to.y) / 2 + (random() - 0.5) * 30 };
      return `M${root.x.toFixed(1)} ${root.y.toFixed(1)}Q${bend.x.toFixed(1)} ${bend.y.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
    });
    const ground = groundLayer(2300);
    const roots = h('span', { class: 'fx-roots fx-roots--field' });
    roots.innerHTML =
      `<svg width="${Math.round(width)}" height="${Math.round(height)}" viewBox="0 0 ${Math.round(width)} ${Math.round(height)}" aria-hidden="true"><g fill="none" stroke-linecap="round">` +
      lines.map((d) => `<path class="fx-roots-glow" pathLength="100" d="${d}" stroke-width="7"/>`).join('') +
      lines.map((d) => `<path class="fx-roots-core" pathLength="100" d="${d}" stroke-width="2.6"/>`).join('') +
      '</g></svg>';
    ground.append(roots);
    drawLines(roots, 560, 700);
    animate(roots, [{ opacity: 1 }, { opacity: 1, offset: 0.72 }, { opacity: 0 }], { duration: 2200, easing: 'ease-in' }).then(() => roots.remove());
    for (let k = 0; k < 5; k++) leaves({ x: width * (0.1 + k * 0.2), y: 34 }, { count: 4, reach: 26, delay: 700 + k * 70 });
    party.forEach((member, index) => {
      rimGlow(member.card, color, 700, 1000 + index * 80);
      leaves(figurePoint(member.card, 0.3), { count: 3, reach: 20, delay: 1000 + index * 80 });
    });
    await wait(1300);
  }

  // The Dąb wieków's blow: a branch lashes the foe and roots burst out of
  // the ground at its feet and twine up it (it is slowed), with leaves and
  // bark flying.
  function oakLash(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 80);
      return;
    }
    const card = entry.card;
    const art = artOf(card);
    const box = boxOf(card);
    const figure = figureOf(art);
    const point = figurePoint(card, 0.45);
    cutAt(point, -24, figure * 1.2, '#8b5a2b', { duration: 420, bend: 14, width: 2.2 });
    cutAt({ x: point.x + figure * 0.08, y: point.y + figure * 0.12 }, -18, figure * 0.9, color, { delay: 60, duration: 380, bend: 10, width: 1.2 });
    leaves(point, { count: 7, reach: figure * 0.5 });
    particles.burst({ x: point.x, y: point.y, count: 8, colors: TWIGS, speed: [80, 200], life: [300, 520], size: [1.2, 2.4], shape: 'shard', gravity: 400, drag: 1.4 });
    // Roots twine up from its feet.
    const feet = { x: art.x + art.width / 2, y: box.y + box.height - 4 };
    const span = Math.round(Math.min(box.width * 0.9, figure * 1.2));
    const tall = Math.round(Math.min(box.height * 0.55, figure * 0.8));
    const roots = spark('fx-roots', { x: feet.x - span / 2, y: feet.y - tall });
    roots.innerHTML = rootsArt(span, tall);
    drawLines(roots, 120, 360);
    animate(roots, [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 1200, easing: 'ease-in' }).then(() => roots.remove());
    shake(3, 280);
  }

  // The Dąb wieków's heal each move: a few leaves drift down on the card,
  // which glows green, and the HP comes back.
  async function oakTick(event, color) {
    const entry = cards.get(event.target);
    if (!entry || reduced() || !particles) {
      await plainHeal(event, color);
      return;
    }
    const art = artOf(entry.card);
    leaves({ x: art.x + art.width / 2, y: art.y + art.height * 0.2 }, { count: 3, reach: figureOf(art) * 0.3 });
    tintCard(entry.card, '#b6e388', [{ opacity: 0 }, { opacity: 0.25, offset: 0.4 }, { opacity: 0 }], 500);
    healed(event);
    await wait(260);
  }

  // The Odrodzenie puszczy: the forest breathes in: green light floods the
  // arena and leaves fall all over it; on every card of the party vines
  // climb up and burst into white and pink blossom, golden pollen rises,
  // a ring of green opens at its feet and the HP comes back.
  async function rebirthHeal(event, color) {
    const entry = cards.get(event.target);
    if (!entry || reduced() || !particles) {
      await plainHeal(event, color);
      return;
    }
    const card = entry.card;
    const art = artOf(card);
    const box = boxOf(card);
    const figure = figureOf(art);
    let lead = 0;
    if (!event.place) {
      lead = 260;
      flash('#b6e388', 0.14, 420);
      groundRing(event.actor, color, { duration: 900, scale: 1.4 });
      const width = stageWidth();
      for (let k = 0; k < 5; k++) leaves({ x: width * (0.1 + k * 0.2), y: 34 }, { count: 4, reach: 26, delay: k * 60 });
    }
    const middle = art.x + art.width / 2;
    sprout(card, { x: middle - figure * 0.36, size: Math.min(figure * 0.9, box.height * 0.6), delay: lead });
    sprout(card, { x: middle + figure * 0.36, size: Math.min(figure * 0.8, box.height * 0.55), delay: lead + 80 });
    sprout(card, { x: middle, size: Math.min(figure * 0.6, box.height * 0.42), delay: lead + 160 });
    const mark = anchor(lead + 1200);
    after(lead + 380, mark, () => {
      particles.burst({ x: middle, y: art.y + art.height * 0.55, area: { width: figure * 0.9, height: art.height * 0.5 }, count: 14, colors: ['#ffffff', '#ffd6e8', '#ff9ec4', '#fff6cf'], speed: [30, 90], gravity: 30, drag: 1.4, life: [700, 1000], size: [1.4, 2.6], shape: 'mote' });
      particles.burst({ x: middle, y: box.y + box.height - 10, area: { width: figure, height: 6 }, count: 10, colors: GOLD, angle: -Math.PI / 2, spread: 0.4, speed: [30, 80], gravity: -30, drag: 1, life: [700, 1000], size: [1, 1.8], shape: 'mote' });
      healed(event);
      groundRing(entry.unit.id, color, { duration: 700 });
      animate(card, [{ filter: 'brightness(1.35) saturate(1.3)' }, { filter: 'brightness(1)' }], { duration: 600, easing: 'ease-out' });
    });
    await wait(lead + 640);
  }

  // Wings of light spread from a card's figure's shoulders (the
  // Archanioł's), kept on the stage, gold and glowing, for `duration`.
  function spreadWings(entry, duration, { delay = 0, scale = 1 } = {}) {
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const width = stageWidth();
    const x = art.x + art.width / 2;
    const shoulder = art.y + art.height * 0.42;
    for (const side of [-1, 1]) {
      const root = { x: x + side * figure * 0.16, y: shoulder };
      const room = side > 0 ? width - root.x - 2 : root.x - 2;
      const size = Math.round(Math.max(20, Math.min(figure * 1.1 * scale, room / 0.9, (root.y - 2) / 0.92)));
      const wing = spark('fx-wing fx-wing--light', root, { '--size': `${size}px` });
      wing.innerHTML = WING;
      const flip = side < 0 ? ' scaleX(-1)' : '';
      animate(
        wing,
        [
          { transform: `translate(-11%, -91%)${flip} rotate(20deg) scale(0.2)`, opacity: 0 },
          { transform: `translate(-11%, -91%)${flip} rotate(-10deg) scale(1)`, opacity: 1, offset: 0.25, easing: 'ease-out' },
          { transform: `translate(-11%, -91%)${flip} rotate(4deg) scale(1)`, opacity: 1, offset: 0.5 },
          { transform: `translate(-11%, -91%)${flip} rotate(-2deg) scale(1)`, opacity: 1, offset: 0.75 },
          { transform: `translate(-11%, -91%)${flip} rotate(0deg) scale(0.95)`, opacity: 0 },
        ],
        { duration, delay, easing: 'ease-in-out', fill: 'backwards' },
      ).then(() => wing.remove());
    }
  }

  // Streaks of golden light raining down on a card.
  function lightRain(card, { delay = 0, count = 8, duration = 700 } = {}) {
    const box = boxOf(card);
    const random = seeded(Math.round(box.x + box.y) + count);
    for (let k = 0; k < count; k++) {
      const x = box.x + box.width * (0.1 + random() * 0.8);
      const length = Math.round(box.height * (0.25 + random() * 0.2));
      const drop = spark('fx-lightrain', { x, y: Math.max(0, box.y - length * 0.5) }, { '--size': `${length}px` });
      animate(
        drop,
        [
          { transform: 'translate(-50%, 0) translateY(0px)', opacity: 0 },
          { opacity: 1, offset: 0.2 },
          { transform: `translate(-50%, 0) translateY(${Math.round(box.height * 0.8)}px)`, opacity: 0 },
        ],
        { duration: duration * (0.7 + random() * 0.4), delay: delay + k * (duration / count) * 0.6, easing: 'ease-in', fill: 'backwards' },
      ).then(() => drop.remove());
    }
  }

  // The Boskie uzdrowienie: the Archanioł spreads its wings of light and
  // light comes down on the party like rain: streaks of gold fall over
  // every card, which glows, a column of light rising through it, its bad
  // effects washed off in white sparks, and the HP comes back.
  async function divineHeal(event, color) {
    const entry = cards.get(event.target);
    if (!entry || reduced() || !particles) {
      await plainHeal(event, color);
      return;
    }
    const card = entry.card;
    const art = artOf(card);
    const figure = figureOf(art);
    let lead = 0;
    if (!event.place) {
      const angel = cards.get(event.actor);
      if (angel) {
        spreadWings(angel, 1300);
        flash('#fff6cf', 0.16, 420);
        lead = 420;
      }
    }
    lightRain(card, { delay: lead, count: 9, duration: 700 });
    const mark = anchor(lead + 1100);
    after(lead + 320, mark, () => {
      healed(event);
      rise(card, { width: figure * 0.7, full: 1, duration: 700 });
      particles.burst({ x: art.x + art.width / 2, y: art.y + art.height * 0.5, area: { width: figure * 0.8, height: art.height * 0.6 }, count: 14, colors: GOLD, angle: -Math.PI / 2, spread: 1, speed: [40, 110], gravity: -30, drag: 1.2, life: [600, 900], size: [1.1, 2.1], shape: 'mote' });
      particles.burst({ x: art.x + art.width / 2, y: art.y + art.height * 0.4, count: 8, colors: ['#ffffff'], speed: [60, 140], gravity: -60, drag: 2, life: [400, 700], size: [1, 1.8], shape: 'spark' });
      animate(card, [{ filter: 'brightness(1.5) saturate(0.9)' }, { filter: 'brightness(1)' }], { duration: 600, easing: 'ease-out' });
    });
    await wait(lead + 620);
  }

  // The Boskie uzdrowienie's light over the next moves: a few streaks of
  // gold fall on the card and the HP comes back.
  async function divineTick(event, color) {
    const entry = cards.get(event.target);
    if (!entry || reduced() || !particles) {
      await plainHeal(event, color);
      return;
    }
    lightRain(entry.card, { count: 4, duration: 520 });
    const mark = anchor(600);
    after(300, mark, () => {
      healed(event);
      tintCard(entry.card, '#fff6cf', [{ opacity: 0 }, { opacity: 0.3, offset: 0.4 }, { opacity: 0 }], 500);
    });
    await wait(420);
  }

  // The Skrzydła światłości: great wings of light open behind the
  // Archanioł and beat; feathers of light drift down over every card of
  // the party, and each takes a golden glow, its shield, kept while the
  // wings hold (whoever strikes it burns).
  async function wingsOfLight(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await bubble(id, color);
      return;
    }
    spreadWings(entry, 1500, { scale: 1.15 });
    const party = standing(entry.unit.side);
    const mark = anchor(1800);
    after(380, mark, () => {
      flash('#fff6cf', 0.16, 380);
      shake(2, 220, true);
    });
    party.forEach((member, index) => {
      const art = artOf(member.card);
      const delay = 520 + index * 90;
      leaves({ x: art.x + art.width / 2, y: art.y + art.height * 0.15 }, { count: 5, reach: figureOf(art) * 0.45, delay, colors: ['#ffffff', '#fffdf6', '#fff3d0', '#ffe08a'] });
      after(delay + 160, mark, () => {
        rimGlow(member.card, color, 800);
        tintCard(member.card, '#fff6cf', [{ opacity: 0 }, { opacity: 0.35, offset: 0.3 }, { opacity: 0 }], 600);
        member.card.classList.add('unit--shielded');
        member.card.style.setProperty('--shield', color);
      });
    });
    await wait(1250 + party.length * 90);
  }

  async function cast(event) {
    const look = lookOf(event);
    playSkill(artChain(event.skill), look.cast === 'sweep' ? 'swing' : look.cast === 'rain' ? 'shot' : 'magic');
    callout(event.actor, event.skillName, look.color);
    const targets = event.targets ?? [];
    // 961: a stance that wakes a creature of its own (the Sokół's falcon,
    // the Kula piorunów), and the Namierzenie's sight on its foe.
    if (look.wake && !event.targets) {
      await (look.wake === 'falcon' ? falconCall(event.actor, look.color) : look.wake === 'globe' ? globeForm(event.actor, look.color) : orbForm(event.actor, look.color));
      await wait(120);
      return;
    }
    // The fourth forms: the Wyłom's broken guard and the Wyzwanie
    // czempiona taken, both after their blow.
    if (look.breach && targets.length > 0) {
      await sunder(event, look.color, targets);
      await wait(120);
      return;
    }
    if (look.challenger && targets.length > 0) {
      await championBond(event, look.color, targets);
      await wait(120);
      return;
    }
    if (look.lock && targets.length > 0) {
      await lockOn(event, look.color);
      await wait(120);
      return;
    }
    // 962: the Riposta's guard at the fight's start, the Pojedynek's call.
    if (look.parry && !event.targets) {
      await enGarde(event.actor, look.color);
      await wait(120);
      return;
    }
    if (look.duel && targets.length > 0) {
      await duel(event, look.color);
      await wait(120);
      return;
    }
    // 963: what a party heal will do for a few moves; the Pieczęć świętości
    // taking hold of its foe; the Stos lit.
    if (!event.targets && (look.sprout || look.uplift || look.radiance || look.divine)) {
      await healSeed(event.actor, look);
      await wait(120);
      return;
    }
    if (look.seal && targets.length > 0) {
      await sealBurn(event, look.color);
      await wait(120);
      return;
    }
    if (look.pyre && !event.targets) {
      await lightPyre(event.actor, look.color);
      await wait(120);
      return;
    }
    // 964: the Znak śmierci's hourglass over its foe; the Krwawy znak's
    // rune on the foe it cut.
    if (look.hourglass && targets.length > 0) {
      await deathMark(event, look.color);
      await wait(120);
      return;
    }
    if (look.bloodcut && targets.length > 0) {
      await bloodRune(event, look.color);
      await wait(120);
      return;
    }
    switch (look.cast) {
      case 'sweep':
        // 962: the evolved Wojownik's sweeps.
        if (look.millstone) await millstone(event, look.color, targets);
        else if (look.whirl) await whirl(event, look.color, targets);
        else if (look.hurricane) await hurricane(event, look.color, targets);
        else if (look.slaughter) await slaughter(event, look.color, targets);
        else if (look.earthquake) await earthquake(event, look.color, targets);
        // The fourth forms' sweeps.
        else if (look.carnage) await carnage(event, look.color, targets);
        else if (look.glory) await gloryHurricane(event, look.color, targets);
        else if (look.mountain) await mountainWrath(event, look.color, targets);
        // 964: the evolved Cień's whirls.
        else if (look.shadowwhirl) await shadowWhirl(event, look.color, targets);
        else if (look.bladerain) await bladeStorm(event, look.color, targets);
        else if (look.legion) await shadowLegion(event, look.color, targets);
        else await (look.crescent ? crescent(look.color, targets) : arc(look.color));
        break;
      case 'frost':
        if (look.icefall) await icefall(event, look.color, targets);
        else if (look.snowstorm) await snowstorm(event, look.color, targets);
        else await (look.blizzard ? blizzard(event, look.color, targets) : gust(look.color, targets));
        break;
      case 'holy':
        if (look.cloud) await stormCloud(event, look, targets);
        // 963: the Sąd's lash, the Święte światło's sun, the Stos's pyres.
        else if (look.lash) await lash(event, look.color, targets);
        else if (look.sun) await holyLight(event, look.color, targets);
        else if (look.pyre) await pyreFire(event, look.color, targets);
        else await (look.braid ? braid(event, look.color, targets) : look.runes ? exorcise(look.color, targets) : beams(look.color, targets));
        break;
      case 'rain':
        if (look.storm) await storm(event, look, targets);
        // The fourth forms: shooting stars, the sky split by Perun.
        else if (look.starfall) await starfall(event, look.color, targets);
        else if (look.skysplit) await skySplit(event, look.color, targets);
        else if (look.chaos) await primalChaos(event, look.color, targets);
        else await (look.meteors ? meteors(event, look, targets) : look.volley ? volley(event, look.color, targets) : rain(look.color, targets));
        break;
      case 'bless':
        // The fourth forms' summons.
        if (look.chief && event.kind === 'summon') await chiefCall(event, look);
        else if (look.grizzly && event.kind === 'summon') await summonCreature(event, look).then(() => bearRears(event, look.color));
        else if (look.prism && event.kind === 'summon') await Promise.all([summonCreature(event, look), prismForm(event)]);
        else if (look.ancient && event.kind === 'summon') await Promise.all([summonCreature(event, look), ancientOak(event, look.color)]);
        else if (look.arrival && event.kind === 'summon') await (HUNT_CALLS.has(look.arrival) ? huntCall(event, look) : summonCreature(event, look));
        else if (look.harmony) await harmony(event.actor, look.color);
        else if (look.focus) await steady(event.actor, look.color);
        else if (look.rune) await thunderSign(event.actor, look.color);
        // 962: the evolved Wojownik's stances.
        else if (look.frenzy) await frenzy(event.actor, look.color);
        else if (look.taunt) await taunt(event, look.color);
        else if (look.roar) await berserkRoar(event.actor, look.color);
        else if (look.cheers) await cheering(event.actor, look.color);
        // 963: the evolved Kleryk's blessings and songs.
        else if (look.anoint) await anoint(event.actor, look.color);
        else if (look.notes) await psalmSong(event.actor, look.color);
        else if (look.breath) await lifeAura(event.actor, look.color);
        else if (look.voices) await choirSong(event.actor, look.color);
        else if (look.laurels) await hymn(event.actor, look.color);
        else if (look.foresight) await foresight(event.actor, look.color);
        else await (look.halo ? halo(event.actor, look.color) : Promise.all([ring(event.actor, look.color, 130, 760), aura(event.actor, look.color, 2)]));
        break;
      case 'poison':
        // 964: the evolved Cień's venoms and its dead: a summon's coming, the
        // slime's spit (its burst once it fell), the black venom, the curse.
        if (look.arrival && event.kind === 'summon') await summonCreature(event, look);
        else if (look.spit && targets.length > 0) await (cards.get(event.actor)?.card.classList.contains('unit--down') ? slimeBurst(event, look.color, targets) : spit(event, look.color));
        else if (look.blackvenom) await blackVenom(event.actor, look.color);
        else if (look.curse && targets.length > 0) await curse(event, look.color, targets);
        else await (look.venom ? venom(event.actor, look.color) : Promise.all([specks(event.actor, look.color, { rise: false }), aura(event.actor, look.color, 1)]));
        break;
      case 'shield':
        if (look.mirror) await mirror(event.actor, look.color);
        else if (look.orbit) await elementRing(event.actor, look.color);
        else if (look.icearmor) await iceArmor(event.actor, look.color);
        else if (look.shieldwall) await shieldWall(event.actor, look.color);
        else if (look.rampart) await rampart(event.actor, look.color);
        else if (look.iceheart) await iceHeart(event.actor, look.color);
        else if (look.lightwings) await wingsOfLight(event.actor, look.color);
        else if (look.dome) await dome(event.actor, look.color);
        else await (look.hexwall ? hexShield(event.actor, look.color) : bubble(event.actor, look.color));
        break;
      case 'dance':
        // 964: the evolved Cień's stances.
        if (look.bladering) await bladeRing(event.actor, look.color);
        else if (look.vanishing) await fadeAway(event, look.color);
        else if (look.doubling) await doubleRise(event, look.color);
        else if (look.darksun) await darkSun(event, look.color);
        else await (look.afterimages ? dance(event.actor, look.color) : ghosts(event.actor, look.color));
        break;
      default:
        await aura(event.actor, look.color, 1);
    }
    await wait(120);
  }

  // 963: the evolved Kleryk's heals by their looks' flags: the look of a
  // skill's heal, and of the quiet heals that follow it.
  const KLERYK_HEALS = {
    wings: [miracleRise, miracleRise],
    sprout: [renewalHeal, renewalTick],
    uplift: [upliftHeal, upliftTick],
    radiance: [radianceHeal, radianceTick],
    notes: [null, psalmTick],
    breath: [null, breathTick],
    voices: [null, choirTick],
    laurels: [null, hymnTick],
    sun: [null, sunTick],
    // The fourth forms' heals: the Dąb wieków's each move, the Odrodzenie
    // puszczy, the Boskie uzdrowienie and its light over the next moves.
    ancient: [null, oakTick],
    rebirth: [rebirthHeal, rebirthHeal],
    divine: [divineHeal, divineTick],
  };

  // A heal: green sparks and the HP that came back. A guard instead flashes
  // round the whole card, with the armour it gives. A heal that goes on for
  // a few moves (a psalm) heals quietly, without its name each time.
  async function heal(event) {
    const look = lookOf(event);
    // (963: a party heal's name is called over its first heal only.)
    const again = event.place > 0 && (look.sprout || look.uplift || look.radiance || look.rebirth || look.divine);
    if (!event.quiet && !again) {
      playSkill(artChain(event.skill), 'effect');
      callout(event.actor, event.skillName, look.color);
    }
    // 963: the evolved Kleryk's heals: their own look for a skill's heal
    // and for those that follow it over a few moves (quiet).
    const flag = Object.keys(KLERYK_HEALS).find((name) => look[name]);
    const kleryk = flag ? KLERYK_HEALS[flag][event.quiet ? 1 : 0] : null;
    if (kleryk) {
      await kleryk(event, look.color);
      return;
    }
    // The Modlitwa o zdrowie's new look brings the HP back as its light
    // lands.
    if (look.lightfall && !reduced() && particles) {
      await lightfall(event, look.color);
      return;
    }
    kit.setHp(event.target, event.hp);
    kit.float(event.target, `+${event.amount}`, 'heal');
    if (look.cast === 'guard') {
      if (event.armor) kit.float(event.target, t('pancerz +{armor}%', { armor: event.armor }), 'guard', 380);
      // 962: the evolved Wojownik's guards.
      if (look.thorns) await thorns(event.target, look.color);
      else if (look.seams) await seams(event.target, look.color);
      else if (look.statue) await statue(event.target, look.color);
      else await (look.emblem ? emblem(event.target, look.color) : flashAround(event.target, look.color));
      return;
    }
    await Promise.all([specks(event.target, '#a7c47f'), aura(event.target, look.color, 1)]);
  }

  // Before a skill's own blow travels: its sound and name, and a mark on the
  // target.
  function before(event) {
    const look = lookOf(event);
    playSkill(artChain(event.skill));
    callout(event.actor, event.skillName, look.color);
    // 961: the Strzał w serce's beating heart, the Mistrzowski strzał's
    // line through the formation, the Strzał z ukrycia's hiding.
    if (look.heart) heartMark(event.target, look.color);
    else if (look.comet) starAim(event, look.color);
    else if (look.sightline) sightline(event, look.color);
    else if (look.hidden) hide(event);
    else if (look.reticle) reticle(event.target, look.color);
    else if (look.impact === 'aim') ring(event.target, look.color, 70, 420);
    if (look.orb === 'fire') gather(event.actor);
    if (look.orb === 'ice-star' || look.orb === 'ice-lance') forge(event, look.orb);
    if (look.smoke) vanish(event);
    // 962: the Riposta's parry, before its counter.
    if (look.parry && event.counter) parry(event, look.color);
    // 963: the sky opens over the Sąd ostateczny's foe.
    if (look.heavens) openHeavens(event);
    // 964: the Egzekucja's pools of shadow, the Ścięcie's line, the Cios
    // ostateczny's stopped time.
    if (look.executioner) sinkIn(event);
    if (look.behead) markCut(event);
    if (look.cleave) stillTime(event);
    if (look.rot === 'knight') rustSwing(event);
    if (look.echo && event.sweep) echoGlass(event, look.color);
    // The fourth forms: the Wyłom's glowing weapon, the Wyzwanie czempiona's
    // call.
    if (look.breach) breachWindup(event);
    if (look.challenger) championCall(event, look.color);
  }

  // When a skill's own blow lands, on top of the plain hit.
  function impact(event) {
    const look = lookOf(event);
    // 962: the evolved Wojownik's blows.
    if (look.slam) return slam(event, look.color);
    if (look.shatter) return shatter(event, look.color);
    if (look.smash) return smash(event, look.color);
    if (look.parry && event.counter) return counterCut(event, look.color);
    // The fourth forms' blows.
    if (look.breach) return breachHit(event, look.color);
    if (look.challenger) return championStrike(event, look.color);
    if (look.comet) return starHit(event, look);
    if (look.orb === 'globe') return globeStrike(event, look.color);
    if (look.chief) return chiefBite(event);
    if (look.grizzly) return bearMaul(event, look.color);
    if (look.prism) return prismHit(event);
    if (look.eternity) return eternityHit(event, look.color);
    if (look.ancient) return oakLash(event, look.color);
    // 963: the evolved Kleryk's blows.
    if (look.sentence) return sentenceHit(event, look.color);
    if (look.holyfire) return holyFire(event, look.color);
    if (look.heavens) return judgmentBeam(event, look.color);
    if (look.seal) return sealStamp(event, look.color);
    // 964: the evolved Cień's blows (the Znak śmierci's wounds given back
    // too, arena.js show()).
    if (look.chop) return chop(event, look.color);
    if (look.behead) return behead(event, look.color);
    if (look.cleave) return finalCleave(event, look.color);
    if (look.echo) return deathEcho(event, look.color);
    if (look.bloodcut) return bloodCut(event, look.color);
    if (look.rot === 'knight') return rustCleave(event);
    if (look.rot) return rotCut(event, look.color);
    if (look.orb === 'touch') return deathTouch(event, look.color);
    if (look.orb === 'thrown' || look.orb === 'double') return daggerHit(event, look.color);
    // 961: the evolved Łucznik's blows. (A wolf's bite is drawn with its
    // blow, arena-fx.js.)
    if (look.orb === 'bite') return;
    if (look.barbs) barbs(event, look.color);
    else if (look.orb === 'harpoon') harpooned(event, look.color);
    else if (look.orb === 'falcon') peck(event, look.color);
    else if (look.orb === 'eagle') talons(event, look.color);
    else if (look.orb === 'thunder-orb') zapped(event, look.color);
    else if (look.through) throughShot(event, look);
    else if (look.orb === 'ambush') ambushHit(event, look.color);
    if (look.barbs || look.through || ['harpoon', 'falcon', 'eagle', 'thunder-orb', 'ambush'].includes(look.orb)) return;
    if (look.orb === 'ice-star') {
      starBreak(event, look.color);
    } else if (look.orb === 'ice-lance') {
      lanceBreak(event, look.color);
    } else if (look.tomb) {
      tomb(event, look.color);
    } else if (look.quake) {
      burst(event.target, look.color, 90);
      quake(event.target, look.color);
    } else if (look.impact === 'heavy') {
      burst(event.target, look.color, 90);
      ring(event.target, look.color, 110, 420);
    } else if (look.orb === 'fire') {
      explode(event.target);
      if (look.splash) splash(event);
    } else if (look.reticle) {
      pierce(event, look.color);
      burst(event.target, look.color, 60);
    } else if (look.pinned) {
      pin(event, look.color);
      burst(event.target, look.color, 60);
    } else if (look.impact === 'fire') {
      burst(event.target, look.color, 100);
      specks(event.target, look.color, { count: 6 });
    } else if (look.smoke && !reduced() && particles) {
      shadowCut(event, look.color);
    } else if (look.impact === 'shadow') {
      burst(event.target, look.color, 80);
    } else {
      burst(event.target, look.color, 60);
    }
  }

  // A pinned or slowed foe shows it on its card.
  function status(id, text) {
    const entry = cards.get(id);
    if (entry) entry.status.textContent = text;
  }

  return { cast, heal, before, impact, status, ring, callout, daze, stanceOver };
}
