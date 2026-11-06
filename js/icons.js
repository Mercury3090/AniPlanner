// Small outline icon set (24px grid, 2px stroke). Inline SVG keeps icons fast,
// themeable with currentColor, and free of any extra network request.

const PATHS = {
  search: '<circle cx="10" cy="10" r="7"/><path d="M21 21l-6 -6"/>',
  plus: '<path d="M12 5l0 14"/><path d="M5 12l14 0"/>',
  minus: '<path d="M5 12l14 0"/>',
  x: '<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>',
  check: '<path d="M5 12l5 5l10 -10"/>',
  menu: '<path d="M4 6l16 0"/><path d="M4 12l16 0"/><path d="M4 18l16 0"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  calendar:
    '<path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M4 11h16"/>',
  "calendar-plus":
    '<path d="M12.5 21h-6.5a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v5"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M4 11h16"/><path d="M16 19h6"/><path d="M19 16v6"/>',
  trash:
    '<path d="M4 7l16 0"/><path d="M10 11l0 6"/><path d="M14 11l0 6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  "circle-check": '<circle cx="12" cy="12" r="9"/><path d="M9 12l2 2l4 -4"/>',
  play: '<path d="M7 4v16l13 -8z"/>',
  star: '<path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z"/>',
  "arrow-right": '<path d="M5 12l14 0"/><path d="M13 18l6 -6"/><path d="M13 6l6 6"/>',
  "arrow-left": '<path d="M5 12l14 0"/><path d="M5 12l6 6"/><path d="M5 12l6 -6"/>',
  moon: '<path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"/>',
  infinity:
    '<path d="M9.828 9.172a4 4 0 1 0 0 5.656a10 10 0 0 0 2.172 -2.828a10 10 0 0 1 2.172 -2.828a4 4 0 1 1 0 5.656a10 10 0 0 1 -2.172 -2.828a10 10 0 0 0 -2.172 -2.828"/>',
  loader: '<path d="M12 3a9 9 0 1 0 9 9"/>',
  bookmark: '<path d="M18 7v14l-6 -4l-6 4v-14a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4z"/>',
  image:
    '<path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z"/><path d="M3 16l5 -5l4 4l3 -3l6 6"/><path d="M15 8h.01"/>',
  filter: '<path d="M4 6h16"/><path d="M7 12h10"/><path d="M10 18h4"/>',
  "chevron-down": '<path d="M6 9l6 6l6 -6"/>',
};

/**
 * Returns an inline SVG string. Icons are decorative by default and hidden from
 * assistive tech; pass a label for icon-only meaning.
 * @param {string} name
 * @param {{label?: string, className?: string}} [opts]
 */
export function icon(name, { label = "", className = "" } = {}) {
  const body = PATHS[name];
  if (!body) return "";
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true" focusable="false"';
  const cls = className ? `icon ${className}` : "icon";
  return `<svg class="${cls}" viewBox="0 0 24 24" ${a11y}>${body}</svg>`;
}
