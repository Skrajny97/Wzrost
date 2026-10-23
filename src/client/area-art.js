// Vector stand-ins for the inner regions, drawn for a circle (the page clips
// them): one small scene for each place, in the colours of the class
// portraits. The author will replace them with their own artwork.

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
};

// For a place without its own scene yet: a few trees.
const FALLBACK = `${SKY}
<path d="M0 90 Q60 80 120 90 V120 H0 Z" fill="#141b11"></path>
<path d="M30 92 L40 40 L50 92 Z M62 92 L74 28 L86 92 Z" fill="#172014" stroke="${LINE}" stroke-width="1"></path>`;

export const areaArtIds = Object.keys(SCENES);

export function areaArt(areaId) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'area-art');
  // Fixed markup from this file only; no game data goes into it.
  svg.innerHTML = SCENES[areaId] ?? FALLBACK;
  return svg;
}
