// Small line illustrations for empty states, drawn in the site's own style: soft grey
// outlines, one amber accent, and the moon and sparkle from the logo. They are decorative,
// so they are hidden from screen readers (the words next to them say everything).

const PARTS = {
  // An empty calendar with a moon: "nothing planned yet"
  plan: `
    <rect class="il-line il-fill" x="14" y="22" width="76" height="62" rx="9"/>
    <path class="il-line" d="M14 40h76"/>
    <path class="il-line il-accent" d="M34 15v13M70 15v13"/>
    <rect class="il-line" x="26" y="50" width="11" height="11" rx="3"/>
    <rect class="il-line il-accent il-solid" x="46" y="50" width="11" height="11" rx="3"/>
    <rect class="il-line" x="66" y="50" width="11" height="11" rx="3"/>
    <rect class="il-line" x="26" y="66" width="11" height="11" rx="3"/>
    <rect class="il-line" x="46" y="66" width="11" height="11" rx="3" stroke-dasharray="3 4"/>
    <path class="il-solid" d="M110 10a15 15 0 1 0 8 27a12 12 0 0 1 -8 -27z"/>
    <circle class="il-dot" cx="100" cy="8" r="2"/><circle class="il-dot" cx="108" cy="56" r="1.8"/>`,
  // A bookmark holding a moon and sparkle: "nothing saved yet"
  saved: `
    <path class="il-line il-fill" d="M36 12h44a7 7 0 0 1 7 7v62l-29-19l-29 19v-62a7 7 0 0 1 7-7z"/>
    <path class="il-solid" d="M62 26a13 13 0 1 0 8 24a10.5 10.5 0 0 1 -8 -24z"/>
    <path class="il-line il-accent" d="M70 30v6M67 33h6"/>
    <circle class="il-dot" cx="100" cy="24" r="2.2"/><circle class="il-dot" cx="18" cy="60" r="1.8"/><circle class="il-dot" cx="104" cy="70" r="1.6"/>`,
  // A magnifier with a moon in the lens: "nothing found"
  search: `
    <circle class="il-line il-fill" cx="52" cy="42" r="28"/>
    <path class="il-line il-accent" d="M73 63l24 22"/>
    <path class="il-solid" d="M60 28a15 15 0 1 0 6 29a12 12 0 0 1 -6 -29z"/>
    <circle class="il-dot" cx="94" cy="22" r="2.2"/><circle class="il-dot" cx="22" cy="78" r="1.8"/>`,
};

/** Which illustration suits which icon name (so existing empty states pick one up automatically). */
const FOR_ICON = { search: "search", calendar: "plan", "calendar-plus": "plan", bookmark: "saved", bookmarks: "saved" };

/** @param {string} iconName @returns {string | null} the illustration name, if there is one */
export function illustrationFor(iconName) {
  return FOR_ICON[iconName] ?? null;
}

/**
 * @param {string} name plan, saved or search
 * @returns {string} inline SVG markup, or an empty string for an unknown name
 */
export function illustration(name) {
  const parts = PARTS[name];
  if (!parts) return "";
  return `<svg class="illustration" viewBox="0 0 120 96" aria-hidden="true" focusable="false">${parts}</svg>`;
}

export const ILLUSTRATIONS = Object.keys(PARTS);
