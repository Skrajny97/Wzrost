// Small DOM helpers. Elements are built with textContent, never from HTML
// strings with game data, so names chosen by players cannot inject markup.
// Styles are set through the CSSOM, which the page's CSP allows (it blocks
// style attributes in markup).

import { ICONS } from './icons.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function h(tag, props, ...children) {
  const element = document.createElement(tag);
  setProps(element, props);
  return append(element, children);
}

function setProps(element, props) {
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null) continue;
    // ARIA states are written out as "true"/"false"; other false values mean "leave out".
    if (key.startsWith('aria-')) element.setAttribute(key, String(value));
    else if (value === false) continue;
    else if (key === 'class') element.className = value;
    else if (key === 'text') element.textContent = value;
    else if (key === 'style') Object.assign(element.style, value);
    else if (key === 'vars') for (const [name, v] of Object.entries(value)) element.style.setProperty(name, v);
    else if (key === 'dataset') Object.assign(element.dataset, value);
    else if (/^on[A-Z]/.test(key)) element.addEventListener(key.slice(2).toLowerCase(), value);
    else element.setAttribute(key, value === true ? '' : String(value));
  }
}

export function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : String(child));
  }
  return parent;
}

export function clear(element) {
  element.replaceChildren();
  return element;
}

// Replaces the contents; empty values (false, null) are skipped, as in h().
export function fill(element, ...children) {
  return append(clear(element), children);
}

// A 24×24 stroke icon from icons.js, coloured by CSS through currentColor.
export function icon(name, { size = 22, className } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const attributes = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.6,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  };
  for (const [key, value] of Object.entries(attributes)) svg.setAttribute(key, String(value));
  if (className) svg.setAttribute('class', className);
  for (const [tag, shape] of ICONS[name] ?? ICONS.unknown) {
    const child = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(shape)) child.setAttribute(key, String(value));
    svg.append(child);
  }
  return svg;
}
