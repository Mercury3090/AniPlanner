// Pure helpers with no DOM access, so they can be unit tested in Node.

/**
 * Parses Jikan duration text into whole minutes.
 * "24 min per ep" -> 24, "1 hr 55 min" -> 115, "1 hr" -> 60, "Unknown" -> null.
 * @param {string | null | undefined} text
 * @returns {number | null}
 */
export function parseDuration(text) {
  if (typeof text !== "string") return null;
  const value = text.toLowerCase();
  const hours = value.match(/(\d+)\s*hr/);
  const minutes = value.match(/(\d+)\s*min/);
  const seconds = value.match(/(\d+)\s*sec/);
  let total = 0;
  if (hours) total += Number(hours[1]) * 60;
  if (minutes) total += Number(minutes[1]);
  if (!hours && !minutes && seconds) total += Math.max(1, Math.round(Number(seconds[1]) / 60));
  return total > 0 ? total : null;
}

/**
 * Formats minutes as "10h 24m", "2h 00m" or "45m".
 * @param {number} totalMinutes
 */
export function formatMinutes(totalMinutes) {
  const total = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/**
 * Formats a date as "Fri 6 Nov".
 * @param {Date} date
 */
export function formatDate(date) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" })
    .format(date)
    .replace(",", "");
}

/** @param {number} count @param {string} one @param {string} [many] */
export function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

/** Returns a copy of the date at local midnight. */
export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Escapes text for safe insertion into HTML strings. */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Debounce with a cancel handle. */
export function debounce(fn, wait = 400) {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}
