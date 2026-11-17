//small helpers used everywhere. no DOM in here, just input -> output.

//turn the API's duration text into minutes.
//"24 min per ep" -> 24, "1 hr 55 min" -> 115, "1 hr" -> 60, "Unknown" -> null
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

//minutes -> "10h 24m", "2h 00m" or "45m"
export function formatMinutes(totalMinutes) {
  const total = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

//date -> "Fri 6 Nov"
export function formatDate(date) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" })
    .format(date)
    .replace(",", "");
}

//"1 title" or "3 titles"
export function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

//copy of the date at midnight (so day counting works)
export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

//make text safe to put in HTML (turns < > & " ' into codes so API text can't add HTML)
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

//only run fn after calls stop for `wait` ms (used for search typing). .cancel() stops it
export function debounce(fn, wait = 400) {
  let timer;
  //waits for typing to pause before running
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}
