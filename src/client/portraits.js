// Vector stand-ins for the class portraits (3:4), in the style of the
// character screen mockup: a hooded figure among trees, with the weapon of
// the class. The author will replace them with their own artwork.

const SVG_NS = 'http://www.w3.org/2000/svg';

const BACKGROUND = `
<defs>
  <pattern id="portrait-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
    <line x1="0" y1="0" x2="0" y2="7" stroke="#25301f" stroke-width="1.2"></line>
  </pattern>
</defs>
<rect x="0" y="0" width="336" height="448" fill="#1a2316"></rect>
<rect x="0" y="0" width="336" height="448" fill="url(#portrait-hatch)"></rect>
<rect x="18" y="0" width="22" height="448" fill="#141b11"></rect>
<rect x="58" y="0" width="10" height="448" fill="#172014"></rect>
<rect x="268" y="0" width="28" height="448" fill="#141b11"></rect>
<rect x="306" y="0" width="12" height="448" fill="#172014"></rect>
<path d="M22 40 q4 12 0 24 M30 120 q-5 14 0 30 M276 70 q5 16 0 34 M286 210 q-4 12 0 26" stroke="#2c3824" stroke-width="1.2" fill="none"></path>
<path d="M0 448 C30 410 60 400 90 404 M40 448 C70 420 96 416 120 420 M216 420 C240 414 270 418 300 448 M250 448 C270 424 300 412 336 416" stroke="#3b4a30" stroke-width="1.4" fill="none"></path>`;

const FIGURE = `
<path d="M168 78 C140 78 124 104 124 132 C124 148 127 158 132 166 L112 206 C100 246 96 306 90 448 L246 448 C240 306 236 246 224 206 L204 166 C209 158 212 148 212 132 C212 104 196 78 168 78 Z" fill="#0e130c" stroke="#b9ae94" stroke-width="1.2"></path>
<path d="M146 126 C146 108 190 108 190 126 C190 150 178 168 168 168 C158 168 146 150 146 126 Z" fill="#060805"></path>
<circle cx="160" cy="134" r="1.8" fill="#8fe3ef"></circle>
<circle cx="176" cy="134" r="1.8" fill="#8fe3ef"></circle>
<path d="M132 166 C150 178 186 178 204 166" stroke="#b9ae94" stroke-width="0.9" fill="none"></path>
<path d="M140 210 C134 280 128 360 124 448 M168 176 C168 260 166 360 166 448 M196 210 C202 280 208 360 212 448" stroke="#3a4733" stroke-width="1" fill="none"></path>`;

const LINE = 'stroke="#b9ae94" fill="none"';

const WEAPONS = {
  warrior: `
<path d="M236 110 L236 330 M224 300 L248 300 M236 330 L236 356" ${LINE} stroke-width="2"></path>
<path d="M236 110 L230 124 L242 124 Z" fill="#b9ae94"></path>
<path d="M70 236 C70 220 92 212 108 212 C124 212 146 220 146 236 C146 290 124 320 108 334 C92 320 70 290 70 236 Z" fill="#141b11" ${LINE.replace('fill="none"', '')} stroke-width="1.4"></path>
<path d="M108 222 L108 322 M80 246 L136 246" stroke="#3a4733" stroke-width="1"></path>`,
  archer: `
<path d="M106 150 L120 190 M100 156 L116 194 M112 146 L124 186" ${LINE} stroke-width="1"></path>
<path d="M232 120 C280 190 282 300 236 372" ${LINE} stroke-width="2"></path>
<path d="M232 120 L236 372" ${LINE} stroke-width="0.8"></path>`,
  mage: `
<path d="M244 96 L232 448" ${LINE} stroke-width="2.2"></path>
<circle cx="245" cy="86" r="11" fill="#0d1a1c" stroke="#8fe3ef" stroke-width="1.4"></circle>
<circle cx="245" cy="86" r="4" fill="#8fe3ef"></circle>
<path d="M226 70 L232 76 M264 70 L258 76 M245 62 L245 70" stroke="#8fe3ef" stroke-width="1"></path>`,
  cleric: `
<path d="M226 136 L252 300" ${LINE} stroke-width="2"></path>
<circle cx="222" cy="122" r="13" fill="#141b11" ${LINE.replace('fill="none"', '')} stroke-width="1.4"></circle>
<path d="M216 118 h.01 M226 116 h.01 M222 128 h.01" stroke="#b9ae94" stroke-width="2.4" stroke-linecap="round"></path>
<path d="M168 196 L168 232 M154 210 L182 210" stroke="#d9b45a" stroke-width="1.6"></path>`,
  shadow: `
<path d="M104 250 L136 196 M100 244 L112 252" ${LINE} stroke-width="1.8"></path>
<path d="M232 250 L200 196 M236 244 L224 252" ${LINE} stroke-width="1.8"></path>
<path d="M140 120 C150 100 186 100 196 120" stroke="#060805" stroke-width="10" fill="none"></path>`,
};

export function portrait(classId) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 336 448');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'portrait-svg');
  // Fixed markup from this file only; no game data goes into it.
  svg.innerHTML = BACKGROUND + FIGURE + (WEAPONS[classId] ?? '');
  return svg;
}
