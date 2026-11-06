// Vector stand-ins for the inner regions, drawn for a circle (the page clips
// them): one small scene for each place, in the colours of the class
// portraits. A place with its pixel-art scene (art.js) shows that instead.

import { areaSprite } from './art.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const LINE = '#b9ae94';
const SKY = '<rect width="120" height="120" fill="#1f2b22"></rect>';
const NIGHT = '<rect width="120" height="120" fill="#17202a"></rect>';

const SCENES = {
  // Sparse trees at the edge and the first fallen trunks.
  'windfalls-edge': `${SKY}
<circle cx="84" cy="30" r="9" fill="#e7dcc2" opacity="0.8"></circle>
<path d="M0 80 Q30 70 60 76 T120 72 V120 H0 Z" fill="#172014"></path>
<path d="M24 82 V22 M24 40 l-9 -9 M24 50 l8 -8 M24 62 l-7 -6" stroke="#3b4a30" stroke-width="3" fill="none" stroke-linecap="round"></path>
<path d="M100 80 V36 M100 50 l-7 -7 M100 58 l7 -6" stroke="#3b4a30" stroke-width="3" fill="none" stroke-linecap="round"></path>
<path d="M0 94 Q60 84 120 94 V120 H0 Z" fill="#141b11"></path>
<path d="M14 98 L84 80 L86 89 L16 107 Z" fill="#4a3d2c" stroke="${LINE}" stroke-width="1"></path>
<ellipse cx="85" cy="84.5" rx="3" ry="4.8" transform="rotate(-14 85 84.5)" fill="#6b5a3e" stroke="${LINE}" stroke-width="1"></ellipse>
<path d="M15 99 l-5 -10 M14 102 l-10 -2 M16 106 l-7 7 M15 99 l-1 -12" stroke="${LINE}" stroke-width="1.2" fill="none" stroke-linecap="round"></path>
<path d="M46 110 L108 94 L110 102 L48 118 Z" fill="#3a2e22" stroke="${LINE}" stroke-width="1"></path>
<path d="M30 114 l2 -6 l2 6 M66 104 l2 -5 l2 5 M96 112 l2 -5 l2 5" stroke="#5f7a3f" stroke-width="1.2" fill="none"></path>`,

  // Sandy ravines with burrows, and a fox.
  'fox-ravines': `${SKY}
<path d="M0 26 Q22 38 32 70 L44 120 H0 Z" fill="#5a4a33"></path>
<path d="M120 20 Q94 38 86 70 L76 120 H120 Z" fill="#6b5a3e"></path>
<path d="M2 48 Q16 54 24 68 M4 72 Q18 80 30 96 M118 44 Q102 52 96 66 M116 70 Q102 80 94 96" stroke="#8a7350" stroke-width="1" fill="none"></path>
<ellipse cx="104" cy="86" rx="8" ry="5.5" fill="#0d110b" stroke="#8a7350" stroke-width="1"></ellipse>
<ellipse cx="14" cy="96" rx="6" ry="4" fill="#0d110b" stroke="#8a7350" stroke-width="1"></ellipse>
<path d="M24 120 Q60 96 96 120 Z" fill="#141b11"></path>
<g transform="translate(60 106) scale(1.55) translate(-60 -106)">
<path d="M66 104 C80 108 88 98 82 90 C80 97 74 100 68 98 Z" fill="#c46a2b" stroke="#e7dcc2" stroke-width="0.6"></path>
<path d="M80 92 C82 94 83 96 82 98 C84 96 84 93 82 90 Z" fill="#e7dcc2"></path>
<path d="M52 106 C50 94 53 86 57 82 L55 72 L61 78 L65 72 L64 82 C68 86 70 94 68 106 Z" fill="#c46a2b" stroke="#e7dcc2" stroke-width="0.6"></path>
<path d="M60 86 C62 90 63 98 62 106 L58 106 C57 98 58 90 60 86 Z" fill="#e7dcc2" opacity="0.85"></path>
<path d="M56.5 74.5 L58 77.5 M63.5 74.5 L62 77.5" stroke="#3a2e22" stroke-width="1"></path>
<circle cx="58" cy="80" r="0.8" fill="#0d110b"></circle><circle cx="62.5" cy="80" r="0.8" fill="#0d110b"></circle>
<path d="M59.4 83 h1.6 l-0.8 1 Z" fill="#0d110b"></path>
</g>`,

  // An uprooted tree, roots to the sky, with ravens.
  'raven-hollows': `${SKY}
<rect y="58" width="120" height="16" fill="#26332a"></rect>
<path d="M0 92 Q60 84 120 92 V120 H0 Z" fill="#141b11"></path>
<path d="M0 104 L66 82 L69 92 L4 116 Z" fill="#3a2e22" stroke="${LINE}" stroke-width="1"></path>
<path d="M80 48 l-5 -10 M90 52 l8 -9 M96 66 l11 -3 M96 82 l10 6 M88 96 l4 10 M72 58 l-9 -6 M84 98 l-6 9" stroke="${LINE}" stroke-width="1.3" fill="none" stroke-linecap="round"></path>
<path d="M82 46 L87 48 L91 46 L94 52 L97 56 L96 62 L99 68 L96 74 L98 80 L94 86 L95 92 L89 96 L86 101 L80 99 L75 101 L71 95 L67 90 L68 84 L65 78 L68 72 L66 66 L69 60 L68 54 L73 51 L76 46 Z" fill="#2b2219" stroke="${LINE}" stroke-width="1.2"></path>
<path d="M76 62 q5 4 2 10 M86 70 q-4 6 1 12 M78 86 q4 2 3 7" stroke="#4a3d2c" stroke-width="1.4" fill="none"></path>
<path d="M73 46 C75 40 81 38 85 40 L92 37 L88 42 C90 46 88 50 84 51 L91 57 L80 53 C77 52 74 50 73 46 Z" fill="#0d110b" stroke="${LINE}" stroke-width="0.8"></path>
<circle cx="84" cy="42.5" r="0.8" fill="#e7dcc2"></circle>
<path d="M24 30 q6 -6 12 0 q6 -6 12 0" stroke="${LINE}" stroke-width="1.6" fill="none" stroke-linecap="round"></path>
<path d="M44 18 q4 -4 8 0 q4 -4 8 0" stroke="${LINE}" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.7"></path>`,

  // A sun-warmed pile of logs with a viper on top.
  'viper-heaps': `<rect width="120" height="120" fill="#28291d"></rect>
<circle cx="32" cy="32" r="15" fill="#d9b45a" opacity="0.45"></circle>
<path d="M0 104 Q60 96 120 104 V120 H0 Z" fill="#141b11"></path>
${[[33, 100], [51, 100], [69, 100], [87, 100], [42, 84], [60, 84], [78, 84], [51, 68], [69, 68]]
  .map(
    ([x, y]) =>
      `<circle cx="${x}" cy="${y}" r="9" fill="#4a3d2c" stroke="${LINE}" stroke-width="1"></circle><circle cx="${x}" cy="${y}" r="4" fill="none" stroke="#6b5a3e" stroke-width="1"></circle>`,
  )
  .join('')}
<path d="M34 64 C42 54 52 60 60 57 C70 53 74 59 84 55 C90 53 94 56 96 59" stroke="#8aa05a" stroke-width="5" fill="none" stroke-linecap="round"></path>
<path d="M40 59 l3 -2 M48 57 l3 1 M56 58 l3 -2 M64 55 l3 1 M72 56 l3 -2 M80 56 l3 0 M88 54 l3 1" stroke="#2b3322" stroke-width="1.6" stroke-linecap="round"></path>
<ellipse cx="98" cy="60" rx="4.5" ry="3.2" fill="#8aa05a"></ellipse>
<path d="M102 61 l4 1.5 M102 61 l4 -1" stroke="#c8553d" stroke-width="0.9"></path>`,

  // The thickest part of the forest, churned ground and a boar.
  'boar-thicket': `<rect width="120" height="120" fill="#141b11"></rect>
<path d="M6 0 h8 v120 h-8 Z M22 0 h5 v120 h-5 Z M90 0 h7 v120 h-7 Z M106 0 h9 v120 h-9 Z" fill="#0e130c"></path>
<path d="M34 0 h4 v120 h-4 Z M80 0 h4 v120 h-4 Z" fill="#1a2316"></path>
<path d="M0 98 Q14 86 26 96 Q36 84 48 94 Q62 84 76 94 Q90 84 102 94 Q112 86 120 94 V120 H0 Z" fill="#1a2316"></path>
<path d="M14 110 q8 -5 16 0 q8 -5 16 0 M58 112 q8 -5 16 0 q8 -5 16 0" stroke="#4a3d2c" stroke-width="2" fill="none" stroke-linecap="round"></path>
<path d="M30 88 C30 76 42 68 58 68 C74 68 86 74 90 84 L92 98 L86 98 L84 92 L80 98 L74 98 L72 92 L52 93 L50 99 L44 99 L44 92 C40 92 34 93 30 94 L26 92 C25 90 27 88 30 88 Z" fill="#2b2219" stroke="${LINE}" stroke-width="1"></path>
<path d="M44 70 l-1 -4 M52 68 l0 -5 M60 68 l1 -5 M68 69 l2 -4 M76 72 l2 -4" stroke="${LINE}" stroke-width="1" stroke-linecap="round"></path>
<path d="M31 91 q-5 -1 -5 -6" stroke="#e7dcc2" stroke-width="1.8" fill="none" stroke-linecap="round"></path>
<circle cx="38" cy="82" r="1.4" fill="#c8553d"></circle>
<path d="M40 74 l-4 -6 l6 3" fill="#2b2219" stroke="${LINE}" stroke-width="0.8"></path>`,

  // Boulders under moss, a web strung between them.
  'mossy-boulders': `${SKY}
<path d="M0 96 Q60 88 120 96 V120 H0 Z" fill="#141b11"></path>
<path d="M60 60 L46 72 M60 60 L74 66 M60 60 L58 86 M60 60 L48 84 M60 60 L72 84" stroke="${LINE}" stroke-width="0.6" opacity="0.7"></path>
<path d="M53 66 L66 63 L64 74 L54 76 Z M50 70 L70 64 L68 80 L52 80 Z" stroke="${LINE}" stroke-width="0.6" fill="none" opacity="0.7"></path>
<path d="M8 106 C6 84 18 70 36 70 C52 70 60 84 58 106 Z" fill="#4d544a" stroke="${LINE}" stroke-width="1"></path>
<path d="M14 82 C22 70 46 66 55 80 C46 76 26 75 14 82 Z" fill="#5f7a3f"></path>
<path d="M62 108 C60 78 74 58 94 60 C112 62 118 84 114 108 Z" fill="#5d6459" stroke="${LINE}" stroke-width="1"></path>
<path d="M66 76 C74 60 102 56 113 74 C104 70 80 68 66 76 Z" fill="#7d9a5a"></path>
<path d="M86 84 q6 4 4 12 M24 88 q-4 6 0 12" stroke="#3a4038" stroke-width="1.4" fill="none"></path>
<ellipse cx="50" cy="110" rx="14" ry="7" fill="#3a4038" stroke="${LINE}" stroke-width="0.8"></ellipse>
<path d="M40 106 C44 102 56 102 60 106" fill="#5f7a3f"></path>`,

  // A narrow gully under a great web, with a cross spider.
  'spider-gully': `<rect width="120" height="120" fill="#1a2316"></rect>
<path d="M42 0 H78 L70 120 H50 Z" fill="#243024"></path>
<path d="M0 0 H46 C38 30 52 62 44 120 H0 Z" fill="#141b11" stroke="#3b4a30" stroke-width="1"></path>
<path d="M120 0 H74 C82 30 68 62 76 120 H120 Z" fill="#141b11" stroke="#3b4a30" stroke-width="1"></path>
<path d="M60 44 L44 14 M60 44 L76 14 M60 44 L42 40 M60 44 L80 46 M60 44 L46 72 M60 44 L74 74 M60 44 L60 10" stroke="${LINE}" stroke-width="0.7" opacity="0.8"></path>
<path d="M60 36 L67 37 L68 44 L66 50 L56 51 L52 44 L54 37 Z M60 26 L71 29 L73 45 L70 58 L52 60 L46 43 L50 29 Z M60 17 L74 21 L77 45 L73 66 L49 68 L43 42 L47 22 Z" stroke="${LINE}" stroke-width="0.6" fill="none" opacity="0.75"></path>
<path d="M60 44 V74" stroke="${LINE}" stroke-width="0.6"></path>
<path d="M55 78 l-8 -6 M55 81 l-9 -1 M55 84 l-8 4 M56 86 l-6 7 M65 78 l8 -6 M65 81 l9 -1 M65 84 l8 4 M64 86 l6 7" stroke="${LINE}" stroke-width="1" fill="none" stroke-linecap="round"></path>
<circle cx="60" cy="76" r="3.2" fill="#0d110b" stroke="${LINE}" stroke-width="0.8"></circle>
<ellipse cx="60" cy="85" rx="5.5" ry="6.5" fill="#0d110b" stroke="${LINE}" stroke-width="0.8"></ellipse>
<path d="M60 81 v8 M57 84.5 h6" stroke="#e7dcc2" stroke-width="1.1"></path>`,

  // A rocky ridge over the glade, a lynx on a ledge.
  'lynx-ridge': `<rect width="120" height="120" fill="#1d2630"></rect>
<circle cx="18" cy="18" r="0.9" fill="#e7dcc2"></circle><circle cx="40" cy="10" r="0.7" fill="#e7dcc2"></circle><circle cx="100" cy="16" r="0.9" fill="#e7dcc2"></circle><circle cx="62" cy="22" r="0.6" fill="#e7dcc2"></circle>
<path d="M0 92 L18 80 L32 84 L48 64 L60 70 L72 58 L96 60 L108 44 L120 50 V120 H0 Z" fill="#2a3026" stroke="${LINE}" stroke-width="1"></path>
<path d="M10 100 L26 92 M40 84 L54 80 M64 76 L80 72 M98 70 L112 64 M20 110 L40 104 M70 96 L92 90" stroke="#3b4a30" stroke-width="1.2"></path>
<g transform="translate(80 63) scale(1.28) translate(-80 -58)">
<path d="M72 58 C70 48 74 42 80 42 C86 42 90 48 88 58 Z" fill="#8a7350" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M88 58 C94 56 98 52 97 46" stroke="#8a7350" stroke-width="2.4" fill="none" stroke-linecap="round"></path>
<path d="M72 34 C72 27 76 24 80 24 C84 24 88 27 88 34 C88 40 84 44 80 44 C76 44 72 40 72 34 Z" fill="#8a7350" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M73 30 L73 20 L78 26 Z M87 30 L87 20 L82 26 Z" fill="#8a7350" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M73 20 l-1 -5 M87 20 l1 -5" stroke="#0d110b" stroke-width="1.6" stroke-linecap="round"></path>
<path d="M72 36 l-4 4 l4 0 M88 36 l4 4 l-4 0" stroke="#8a7350" stroke-width="1.4" fill="none"></path>
<circle cx="77" cy="32" r="1.4" fill="#d9b45a"></circle><circle cx="83" cy="32" r="1.4" fill="#d9b45a"></circle>
<path d="M79 37 h2 l-1 1.4 Z" fill="#0d110b"></path>
</g>`,

  // Glades where packs howl, under the full moon.
  'wolf-circles': `${NIGHT}
<circle cx="70" cy="42" r="24" fill="#e7dcc2" opacity="0.88"></circle>
<path d="M0 84 L8 70 L14 82 L22 62 L30 82 L38 72 L44 84 L120 84 L112 66 L104 80 L96 64 L88 80 L82 72 L76 84 Z" fill="#0e130c"></path>
<path d="M0 84 H120 V120 H0 Z" fill="#141b11"></path>
<ellipse cx="60" cy="104" rx="48" ry="10" fill="none" stroke="#3b4a30" stroke-width="2"></ellipse>
<path d="M50 100 C46 88 48 76 54 68 C56 62 60 56 60 50 L58 38 L64 44 L68 34 L69 46 C72 52 72 58 68 64 C72 72 74 86 72 100 Z" fill="#0d110b" stroke="${LINE}" stroke-width="0.9"></path>
<path d="M68 34 L74 26 L71 36" fill="#0d110b" stroke="${LINE}" stroke-width="0.9"></path>
<path d="M72 98 C80 98 86 94 84 86" stroke="#0d110b" stroke-width="4" fill="none" stroke-linecap="round"></path>
<path d="M40 100 h44" stroke="#3b4a30" stroke-width="2" stroke-linecap="round"></path>`,

  // The middle of the stone circle, where something old still glows.
  'glade-heart': `${NIGHT}
<path d="M0 78 Q60 70 120 78 V120 H0 Z" fill="#141b11"></path>
<ellipse cx="60" cy="92" rx="46" ry="15" fill="none" stroke="#3b4a30" stroke-width="1.4"></ellipse>
<ellipse cx="60" cy="92" rx="34" ry="12" fill="#8fe3ef" opacity="0.08"></ellipse>
<ellipse cx="60" cy="92" rx="18" ry="6.5" fill="#8fe3ef" opacity="0.14"></ellipse>
<ellipse cx="60" cy="92" rx="7" ry="2.8" fill="#8fe3ef" opacity="0.45"></ellipse>
<path d="M18 84 L18 71 L21 66 L27 65 L30 70 L30 84 Z M40 78 L40 64 L43 59 L49 60 L51 65 L51 78 Z M69 78 L69 65 L71 60 L77 59 L80 64 L80 78 Z M90 84 L90 70 L93 65 L99 66 L102 71 L102 84 Z" fill="#454c42" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M4 104 L5 82 L9 75 L16 77 L20 84 L20 104 Z M28 112 L29 85 L32 78 L40 77 L45 83 L46 112 Z M74 112 L75 83 L80 77 L88 78 L91 85 L92 112 Z M100 104 L100 84 L104 77 L111 75 L115 82 L116 104 Z" fill="#5d6459" stroke="${LINE}" stroke-width="1"></path>
<path d="M8 86 q3 -2 6 0 M32 90 q4 -3 9 0 M79 88 q4 -3 9 0 M104 86 q3 -2 7 0" stroke="#7d9a5a" stroke-width="1.6" fill="none" stroke-linecap="round"></path>
<path d="M60 88 C58 80 62 74 60 66 M56 86 C55 82 57 78 56 74 M64 86 C65 82 63 79 64 75" stroke="#8fe3ef" stroke-width="0.8" fill="none" opacity="0.5"></path>
<circle cx="52" cy="62" r="1" fill="#8fe3ef"></circle><circle cx="66" cy="56" r="1.2" fill="#8fe3ef"></circle><circle cx="60" cy="48" r="0.8" fill="#8fe3ef"></circle>`,

  // Zarośnięte Rozlewiska: reeds over the first water, with a heron.
  'reed-beds': `${SKY}
<path d="M0 78 H120 V120 H0 Z" fill="#1d2f36"></path>
<path d="M8 86 h26 M50 96 h30 M86 84 h24 M20 106 h40" stroke="#2c4650" stroke-width="1.4" stroke-linecap="round"></path>
<path d="M10 80 V44 M16 80 V36 M22 80 V48 M98 80 V40 M104 80 V32 M110 80 V46" stroke="#5f7a3f" stroke-width="1.6" fill="none"></path>
<ellipse cx="16" cy="40" rx="2" ry="5" fill="#6b4a2c"></ellipse><ellipse cx="104" cy="36" rx="2" ry="5" fill="#6b4a2c"></ellipse>
<path d="M58 92 L60 70 M64 92 L62 70" stroke="${LINE}" stroke-width="1.2"></path>
<path d="M50 70 C50 60 60 56 70 60 C74 62 74 68 68 70 Z" fill="#8a8f8c" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M68 61 C70 52 70 46 74 42 L90 44 L75 46 C73 50 73 56 72 62" fill="#8a8f8c" stroke="${LINE}" stroke-width="0.8"></path>`,

  // Bobrowe Tamy: a dam of logs holding back the flood, mosquitoes above.
  'beaver-dams': `${SKY}
<path d="M0 70 H120 V120 H0 Z" fill="#1d2f36"></path>
<path d="M0 92 L120 84 L120 98 L0 106 Z" fill="#4a3d2c" stroke="${LINE}" stroke-width="1"></path>
<path d="M6 96 l24 -2 M40 93 l30 -2 M80 90 l30 -2 M12 102 l40 -3 M64 99 l44 -3" stroke="#6b5a3e" stroke-width="2" stroke-linecap="round"></path>
<path d="M78 84 Q90 62 104 84 Z" fill="#3a2e22" stroke="${LINE}" stroke-width="1"></path>
<path d="M0 108 H120 V120 H0 Z" fill="#172a31"></path>
<circle cx="30" cy="40" r="1" fill="${LINE}"></circle><circle cx="36" cy="36" r="1" fill="${LINE}"></circle><circle cx="34" cy="44" r="1" fill="${LINE}"></circle><circle cx="42" cy="40" r="1" fill="${LINE}"></circle><circle cx="38" cy="48" r="1" fill="${LINE}"></circle>`,

  // Zatopiony Las: dead trees knee-deep in water, a cormorant on a branch.
  'drowned-forest': `${NIGHT}
<path d="M0 74 H120 V120 H0 Z" fill="#1a2a30"></path>
<path d="M26 98 V30 M26 52 l-10 -10 M26 62 l9 -8 M84 96 V24 M84 44 l12 -10 M84 58 l-10 -8 M56 102 V54 M56 66 l7 -6" stroke="#4a4d45" stroke-width="3.5" fill="none" stroke-linecap="round"></path>
<path d="M14 100 h24 M72 98 h26 M46 104 h22" stroke="#2c4650" stroke-width="1.4" stroke-linecap="round"></path>
<path d="M92 30 C92 24 98 22 101 26 L106 25 L102 28 C102 32 98 34 95 34 Z" fill="#0d110b" stroke="${LINE}" stroke-width="0.8"></path>
<ellipse cx="60" cy="112" rx="20" ry="4" fill="#0d1418"></ellipse>`,

  // Wierzbowe Kępy: willow islands in the fog, a pale maiden over the water.
  'willow-isles': `${NIGHT}
<path d="M0 80 H120 V120 H0 Z" fill="#1a2a30"></path>
<ellipse cx="28" cy="82" rx="24" ry="6" fill="#141b11"></ellipse><ellipse cx="96" cy="86" rx="22" ry="5" fill="#141b11"></ellipse>
<path d="M28 80 V52 M28 54 C18 56 14 66 12 78 M28 54 C38 56 42 66 44 78 M28 58 C22 62 20 70 20 78 M28 58 C34 62 36 70 36 78" stroke="#3b4a30" stroke-width="2" fill="none" stroke-linecap="round"></path>
<path d="M96 84 V60 M96 62 C88 64 84 72 82 82 M96 62 C104 64 108 72 110 82" stroke="#3b4a30" stroke-width="2" fill="none" stroke-linecap="round"></path>
<path d="M60 100 C54 92 56 78 60 72 C64 78 66 92 60 100 Z" fill="#c9d6dc" opacity="0.55"></path>
<circle cx="60" cy="70" r="3" fill="#c9d6dc" opacity="0.7"></circle>
<path d="M0 66 Q30 60 60 66 T120 64" stroke="#c9d6dc" stroke-width="5" fill="none" opacity="0.12"></path>`,

  // Stare Koryto: a deep old riverbed, bones in the mud, a glowing jar.
  'old-riverbed': `${NIGHT}
<path d="M0 40 Q30 60 34 120 H0 Z M120 40 Q90 60 86 120 H120 Z" fill="#2b2219"></path>
<path d="M34 120 Q36 70 60 64 Q84 70 86 120 Z" fill="#162228"></path>
<path d="M14 92 l12 4 M16 98 l8 -6 M100 96 l-10 4" stroke="#d8cfb6" stroke-width="2" stroke-linecap="round"></path>
<circle cx="13" cy="91" r="2" fill="#d8cfb6"></circle><circle cx="27" cy="97" r="2" fill="#d8cfb6"></circle>
<path d="M52 110 C50 100 54 94 60 94 C66 94 70 100 68 110 Z" fill="#6b4a2c" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M56 94 h8" stroke="${LINE}" stroke-width="1.2"></path>
<circle cx="60" cy="102" r="3" fill="#8fe3ef" opacity="0.6"></circle>`,

  // Torfowe Mszary: open moss with dancing cranes.
  'crane-meadows': `${SKY}
<path d="M0 74 Q60 66 120 74 V120 H0 Z" fill="#3a4428"></path>
<ellipse cx="28" cy="100" rx="14" ry="4" fill="#1a2a30"></ellipse><ellipse cx="92" cy="108" rx="12" ry="3.5" fill="#1a2a30"></ellipse>
<path d="M58 96 L56 80 M62 96 L64 80" stroke="${LINE}" stroke-width="1.1"></path>
<path d="M50 80 C50 70 62 66 70 72 C72 76 68 80 64 80 Z" fill="#9a9e98" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M66 72 C68 60 68 54 66 48 L70 46 L72 50 C70 56 70 64 70 72" fill="#9a9e98" stroke="${LINE}" stroke-width="0.8"></path>
<circle cx="69" cy="47" r="1.2" fill="#c0392b"></circle>
<path d="M40 70 Q30 56 34 46 M76 70 Q86 56 88 46" stroke="#9a9e98" stroke-width="1.4" fill="none"></path>`,

  // Pijawkowe Oczka: black pools in the peat, a harrier circling above.
  'leech-pools': `${SKY}
<path d="M0 70 Q60 62 120 70 V120 H0 Z" fill="#33301f"></path>
<ellipse cx="34" cy="90" rx="18" ry="6" fill="#0d1418" stroke="#5f7a3f" stroke-width="1"></ellipse>
<ellipse cx="84" cy="104" rx="22" ry="7" fill="#0d1418" stroke="#5f7a3f" stroke-width="1"></ellipse>
<path d="M28 90 q3 -2 6 0 q3 2 6 0 M78 104 q3 -2 6 0 q3 2 6 0" stroke="#6b4a2c" stroke-width="1.6" fill="none" stroke-linecap="round"></path>
<path d="M50 34 q10 -8 20 0 q10 -8 20 0" stroke="${LINE}" stroke-width="1.8" fill="none" stroke-linecap="round"></path>`,

  // Rosiczkowe Pole: moss red with sundews, under heavy fumes.
  'sundew-field': `${SKY}
<path d="M0 72 Q60 64 120 72 V120 H0 Z" fill="#3a2a22"></path>
<path d="M0 58 Q30 50 60 58 T120 56" stroke="#c8d46a" stroke-width="7" fill="none" opacity="0.12"></path>
<g stroke="#b3403a" stroke-width="1.4" stroke-linecap="round" fill="none"><path d="M30 96 l-8 -10 M30 96 l0 -13 M30 96 l8 -10 M30 96 l-11 -4 M30 96 l11 -4"></path><path d="M80 104 l-8 -10 M80 104 l0 -13 M80 104 l8 -10 M80 104 l-11 -4 M80 104 l11 -4"></path></g>
<circle cx="22" cy="86" r="1.4" fill="#e7dcc2"></circle><circle cx="30" cy="83" r="1.4" fill="#e7dcc2"></circle><circle cx="38" cy="86" r="1.4" fill="#e7dcc2"></circle>
<circle cx="72" cy="94" r="1.4" fill="#e7dcc2"></circle><circle cx="80" cy="91" r="1.4" fill="#e7dcc2"></circle><circle cx="88" cy="94" r="1.4" fill="#e7dcc2"></circle>
<path d="M96 80 C96 70 104 66 108 72 C110 76 108 82 104 82 Z" fill="#3a2e22" stroke="${LINE}" stroke-width="0.8"></path>`,

  // Tlące się Torfy: smoke from the smouldering peat, will-o-wisps at night.
  'smoldering-peat': `${NIGHT}
<path d="M0 76 Q60 68 120 76 V120 H0 Z" fill="#221a14"></path>
<path d="M30 80 C26 66 34 58 30 44 M70 84 C66 68 76 60 72 40 M96 78 C92 68 100 60 96 50" stroke="#5d6459" stroke-width="4" fill="none" opacity="0.5" stroke-linecap="round"></path>
<ellipse cx="30" cy="82" rx="5" ry="2" fill="#c0562b" opacity="0.8"></ellipse><ellipse cx="70" cy="86" rx="6" ry="2" fill="#c0562b" opacity="0.8"></ellipse>
<circle cx="48" cy="58" r="3" fill="#ff8a3d" opacity="0.85"></circle><circle cx="88" cy="48" r="2.4" fill="#ff8a3d" opacity="0.75"></circle><circle cx="20" cy="40" r="2" fill="#ff8a3d" opacity="0.6"></circle>`,

  // Stare Wyrobisko: an old peat pit with log walkways, the peat waking below.
  'old-diggings': `${NIGHT}
<path d="M0 30 L30 30 L40 120 H0 Z M120 30 L90 30 L80 120 H120 Z" fill="#1d1712"></path>
<path d="M40 120 L30 30 H90 L80 120 Z" fill="#120f0c"></path>
<path d="M2 50 H32 M88 50 H118 M4 76 H36 M84 76 H116" stroke="#6b5a3e" stroke-width="3" stroke-linecap="round"></path>
<path d="M8 50 v6 M24 50 v6 M96 50 v6 M112 50 v6" stroke="#4a3d2c" stroke-width="2"></path>
<path d="M44 118 C42 96 50 86 60 86 C70 86 78 96 76 118 Z" fill="#2b2219" stroke="${LINE}" stroke-width="0.8"></path>
<circle cx="55" cy="96" r="1.8" fill="#c8d46a"></circle><circle cx="65" cy="96" r="1.8" fill="#c8d46a"></circle>`,

  // Sosnowe Wydmy (126–150), until their drawn scenes come.
  // Wrzosowe Wydmy: dunes in purple heather, a crooked pine on the crest.
  'heather-dunes': `${SKY}
<path d="M0 78 Q30 58 60 70 T120 64 V120 H0 Z" fill="#8a7350"></path>
<path d="M0 96 Q40 80 80 92 T120 88 V120 H0 Z" fill="#6b5a3e"></path>
<path d="M8 92 q4 -6 8 0 q4 -6 8 0 M40 100 q4 -6 8 0 q4 -6 8 0 M84 96 q4 -6 8 0 q4 -6 8 0" stroke="#9b5fa8" stroke-width="2.4" fill="none" stroke-linecap="round"></path>
<path d="M78 66 C76 54 82 46 80 34 M80 44 C88 40 94 42 98 38 M79 52 C72 48 66 50 62 46" stroke="#3b4a30" stroke-width="3" fill="none" stroke-linecap="round"></path>
<path d="M90 36 q8 -4 12 2 q-6 4 -12 -2 Z M58 44 q-8 -2 -10 4 q6 2 10 -4 Z" fill="#2f4a2a"></path>`,

  // Żywiczny Bór: tall pines weeping amber resin.
  'resin-pinewood': `${SKY}
<path d="M0 92 Q60 84 120 92 V120 H0 Z" fill="#172014"></path>
<path d="M22 96 V30 M58 98 V26 M96 96 V34" stroke="#6b4a2c" stroke-width="6" stroke-linecap="round"></path>
<path d="M8 44 L22 16 L36 44 Z M12 58 L22 36 L32 58 Z M44 40 L58 10 L72 40 Z M48 54 L58 32 L68 54 Z M82 46 L96 20 L110 46 Z M86 60 L96 40 L106 60 Z" fill="#2f4a2a" stroke="${LINE}" stroke-width="0.8"></path>
<ellipse cx="23" cy="72" rx="2" ry="3.2" fill="#e0a02a"></ellipse><ellipse cx="57" cy="78" rx="2.2" ry="3.4" fill="#e0a02a"></ellipse><ellipse cx="97" cy="70" rx="1.8" ry="3" fill="#e0a02a"></ellipse>`,

  // Lotne Piaski: wind over open sand, an old barrow half bared.
  'drifting-sands': `${SKY}
<path d="M0 70 Q30 62 60 68 T120 62 V120 H0 Z" fill="#a08a5c"></path>
<path d="M30 74 Q60 44 90 74 Z" fill="#6b5a3e" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M52 60 h16 M56 54 h8" stroke="#3a2e22" stroke-width="1.6"></path>
<path d="M0 96 Q40 86 80 96 T120 92 V120 H0 Z" fill="#8a7350"></path>
<path d="M6 40 q20 -6 34 0 M70 30 q20 -6 40 0 M20 54 q14 -4 26 0" stroke="#e7dcc2" stroke-width="1.2" fill="none" opacity="0.5" stroke-linecap="round"></path>`,

  // Smolne Doły: earthen kilns smouldering in their pits, smoke above.
  'tar-pits': `${NIGHT}
<path d="M0 82 Q60 74 120 82 V120 H0 Z" fill="#221a14"></path>
<path d="M14 92 Q34 62 54 92 Z M66 96 Q88 66 110 96 Z" fill="#2b2219" stroke="${LINE}" stroke-width="0.8"></path>
<ellipse cx="34" cy="80" rx="5" ry="2" fill="#c0562b" opacity="0.85"></ellipse><ellipse cx="88" cy="84" rx="5" ry="2" fill="#c0562b" opacity="0.85"></ellipse>
<path d="M34 70 C30 58 38 50 34 38 M88 74 C84 60 92 52 88 40" stroke="#5d6459" stroke-width="4" fill="none" opacity="0.5" stroke-linecap="round"></path>
<ellipse cx="60" cy="108" rx="16" ry="4" fill="#0d0b09" stroke="#3a2e22" stroke-width="1"></ellipse>`,

  // Pogorzelisko: black trunks of a burnt pine forest, embers in the ash.
  'burnt-forest': `${NIGHT}
<path d="M0 84 Q60 76 120 84 V120 H0 Z" fill="#2a2724"></path>
<path d="M20 90 V30 M20 48 l-8 -8 M48 92 V22 M48 40 l7 -7 M84 90 V34 M84 52 l-7 -6 M104 92 V44" stroke="#120f0c" stroke-width="4" fill="none" stroke-linecap="round"></path>
<circle cx="30" cy="100" r="1.6" fill="#ff8a3d"></circle><circle cx="66" cy="96" r="1.4" fill="#ff8a3d"></circle><circle cx="94" cy="104" r="1.8" fill="#ff8a3d"></circle>
<path d="M58 30 q4 -6 8 0 M70 22 q3 -4 6 0" stroke="#ff8a3d" stroke-width="1" fill="none" opacity="0.7"></path>`,

  // Głucha Knieja (151–175), until their drawn scenes come.
  // Świerkowy Zmrok: close dark spruces, two yellow eyes in the gloom.
  'spruce-dusk': `${NIGHT}
<path d="M0 92 Q60 84 120 92 V120 H0 Z" fill="#141b11"></path>
<path d="M4 96 L20 24 L36 96 Z M30 98 L50 14 L70 98 Z M62 98 L82 20 L102 98 Z M94 96 L110 36 L126 96 Z" fill="#14231a" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M12 70 l8 -6 l8 6 M40 64 l10 -8 l10 8 M72 66 l10 -8 l10 8" stroke="#22382a" stroke-width="1.4" fill="none"></path>
<circle cx="56" cy="80" r="1.6" fill="#e8c547"></circle><circle cx="62" cy="80" r="1.6" fill="#e8c547"></circle>`,

  // Paprociowy Gąszcz: ferns waist-high, a pale mantis above them.
  'fern-thicket': `${SKY}
<path d="M0 88 Q60 80 120 88 V120 H0 Z" fill="#172014"></path>
<path d="M10 120 C14 96 26 84 40 78 M30 120 C34 98 48 86 62 82 M58 120 C60 100 72 88 88 84 M84 120 C88 98 100 90 116 86" stroke="#3f6b35" stroke-width="2.4" fill="none" stroke-linecap="round"></path>
<path d="M18 100 l-6 -3 M22 94 l-6 -4 M28 88 l-5 -5 M40 102 l-6 -3 M46 94 l-5 -5 M66 102 l-6 -3 M72 94 l-5 -5 M92 102 l-6 -3 M98 96 l-5 -5" stroke="#4f8a42" stroke-width="1.6" fill="none" stroke-linecap="round"></path>
<path d="M98 62 V40 M98 44 l-6 -8 l-2 6 M98 44 l6 -8 l2 6 M96 36 h4" stroke="#c9c2a0" stroke-width="1.4" fill="none" stroke-linecap="round"></path>`,

  // Zapomniany Trakt: an overgrown road and a cart's wheel left by it.
  'forgotten-track': `${NIGHT}
<path d="M0 84 Q60 76 120 84 V120 H0 Z" fill="#1a1712"></path>
<path d="M44 120 L56 84 H64 L76 120 Z" fill="#3a2e22"></path>
<path d="M48 112 l3 -6 M66 106 l3 -6 M58 96 l2 -5" stroke="#3f6b35" stroke-width="1.4" stroke-linecap="round"></path>
<circle cx="94" cy="98" r="12" fill="none" stroke="#6b4a2c" stroke-width="2.4"></circle>
<path d="M94 86 V110 M82 98 H106 M86 90 L102 106 M102 90 L86 106" stroke="#6b4a2c" stroke-width="1.4"></path>
<path d="M10 90 V36 M22 92 V28" stroke="#2b2219" stroke-width="5" stroke-linecap="round"></path>`,

  // Mszysty Wądół: mossy slopes of a ravine, a cold stream, a root plate.
  'mossy-dell': `${NIGHT}
<path d="M0 28 Q24 60 40 120 H0 Z" fill="#24361f"></path>
<path d="M120 24 Q96 60 80 120 H120 Z" fill="#2f4a2a"></path>
<path d="M50 120 Q58 96 62 70 Q66 96 72 120 Z" fill="#8fd3ff" opacity="0.35"></path>
<circle cx="28" cy="64" r="11" fill="#3a2e22" stroke="${LINE}" stroke-width="0.8"></circle>
<path d="M28 64 l-14 -6 M28 64 l-12 8 M28 64 l2 -14 M28 64 l12 4" stroke="#6b4a2c" stroke-width="1.4"></path>
<path d="M98 36 v18 c-5 4 5 8 0 13" stroke="${LINE}" stroke-width="1" fill="none"></path>`,

  // Matecznik: a dense den of black spruces, bones and an antler, white eyes.
  'wild-den': `${NIGHT}
<path d="M0 86 Q60 78 120 86 V120 H0 Z" fill="#1b1612"></path>
<path d="M0 86 L14 30 L26 86 Z M18 86 L34 20 L48 86 Z M76 86 L92 18 L108 86 Z M98 86 L112 34 L126 86 Z" fill="#14231a"></path>
<path d="M40 104 h18 M42 101 v6 M56 101 v6 M70 98 l12 8" stroke="#e7dcc2" stroke-width="1.6" fill="none" stroke-linecap="round"></path>
<path d="M58 72 c-6 -6 -4 -14 2 -18 M54 62 l-6 -4 M60 56 l6 -5" stroke="#d8cfb4" stroke-width="1.4" fill="none" stroke-linecap="round"></path>
<circle cx="86" cy="70" r="1.6" fill="#f2f2f2"></circle><circle cx="92" cy="70" r="1.6" fill="#f2f2f2"></circle>`,

  // Ostępy Nowiu (176–200), until their drawn scenes come.
  // Skrzypiące Sosny: huge old pines hung with grey beards of lichen.
  'creaking-pines': `${NIGHT}
<path d="M0 92 Q60 84 120 92 V120 H0 Z" fill="#141b11"></path>
<path d="M24 96 V10 M64 98 V6 M100 96 V14" stroke="#5a3e28" stroke-width="9" stroke-linecap="round"></path>
<path d="M10 20 Q24 10 38 20 Q24 26 10 20 Z M48 14 Q64 2 80 14 Q64 22 48 14 Z M86 22 Q100 12 114 22 Q100 28 86 22 Z" fill="#2f4a2a"></path>
<path d="M30 30 v12 M34 34 v10 M60 26 v14 M70 30 v10 M96 34 v12" stroke="#b5b8ab" stroke-width="1.6" stroke-linecap="round"></path>`,

  // Próchniejące Pnie: fallen trunks glowing green with rot, a puffball.
  'rotting-logs': `${NIGHT}
<path d="M0 90 Q60 82 120 90 V120 H0 Z" fill="#17140f"></path>
<path d="M6 96 L80 82 L84 94 L10 108 Z" fill="#4a3d2c" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M40 112 L114 98 L116 108 L42 120 Z" fill="#3a2e22" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M20 98 h6 M40 94 h8 M60 90 h6 M60 108 h6 M82 104 h8" stroke="#8ee07a" stroke-width="1.6" opacity="0.8" stroke-linecap="round"></path>
<circle cx="96" cy="72" r="7" fill="#a89a7a"></circle><path d="M92 64 q4 -8 8 0" stroke="#c9c2a0" stroke-width="1" fill="none" opacity="0.6"></path>`,

  // Czarcie Rozdroże: four paths meeting, a straw chochoł at the crossing.
  'devils-crossroads': `${NIGHT}
<path d="M0 70 Q60 62 120 70 V120 H0 Z" fill="#1b1a14"></path>
<path d="M0 96 L120 84 M20 70 L100 120 M100 70 L20 120" stroke="#3a2e22" stroke-width="7" stroke-linecap="round"></path>
<path d="M60 40 L48 88 H72 Z" fill="#c9a24a" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M60 44 l-14 14 M60 44 l14 14 M60 34 v8" stroke="#c9a24a" stroke-width="2" stroke-linecap="round"></path>
<circle cx="96" cy="30" r="1.2" fill="#e7dcc2"></circle><circle cx="20" cy="24" r="1" fill="#e7dcc2"></circle>`,

  // Morowe Mogiły: forgotten mounds with crosses, a belfry with its bell.
  'plague-graves': `${NIGHT}
<path d="M0 88 Q60 80 120 88 V120 H0 Z" fill="#1a1d17"></path>
<path d="M8 104 Q22 88 36 104 Z M44 110 Q60 94 76 110 Z M82 104 Q96 90 110 104 Z" fill="#2b2a22" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M22 92 v-10 M18 86 h8 M60 98 v-12 M56 90 h8" stroke="#6b5a3e" stroke-width="1.6"></path>
<path d="M88 76 V36 H104 V76 M86 36 L96 26 L106 36" stroke="#4a3d2c" stroke-width="2" fill="none"></path>
<path d="M92 50 q4 -8 8 0 v4 h-8 Z" fill="#8a8370"></path>`,

  // Zaćmiona Polana: a glade under a black moon in a pale ring, yellow eyes.
  'eclipsed-glade': `${NIGHT}
<circle cx="60" cy="34" r="16" fill="#e7dcc2" opacity="0.35"></circle>
<circle cx="60" cy="34" r="14" fill="#0b0d10"></circle>
<path d="M0 80 Q60 70 120 80 V120 H0 Z" fill="#141b11"></path>
<path d="M0 80 L10 44 L20 80 Z M100 80 L110 40 L120 80 Z" fill="#0f1a10"></path>
<path d="M30 100 q4 -6 8 0 M50 108 q4 -6 8 0 M78 102 q4 -6 8 0" stroke="#3f6b35" stroke-width="1.6" fill="none"></path>
<circle cx="88" cy="90" r="1.4" fill="#e8c547"></circle><circle cx="93" cy="90" r="1.4" fill="#e8c547"></circle>`,
};

// For a place without its own scene yet: a few trees.
const FALLBACK = `${SKY}
<path d="M0 90 Q60 80 120 90 V120 H0 Z" fill="#141b11"></path>
<path d="M30 92 L40 40 L50 92 Z M62 92 L74 28 L86 92 Z" fill="#172014" stroke="${LINE}" stroke-width="1"></path>`;

export const areaArtIds = Object.keys(SCENES);

export function areaArt(areaId) {
  const drawn = areaSprite(areaId);
  if (drawn) return drawn;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'area-art');
  // Fixed markup from this file only; no game data goes into it.
  svg.innerHTML = SCENES[areaId] ?? FALLBACK;
  return svg;
}
