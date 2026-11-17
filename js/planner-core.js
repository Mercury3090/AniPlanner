//Planner maths. Pure functions, no DOM, fully unit tested.
//
//Rules (see PRD data handling):
//- Total runtime = episodes x minutes per episode, summed across the plan.
//- Ongoing shows (episodes unknown) are listed but not counted.
//- Movies count as one episode of the full running time.
//- If the minutes per episode are missing, 24 is used and flagged as an estimate.
//- The schedule uses the weekdays the user actually picked, so every evening has a real date.

import { startOfDay } from "./utils.js";

//used when a title has no episode length (and flagged as an estimate)
export const DEFAULT_MINUTES = 24;
//stops a huge plan from scheduling forever (about a year)
const MAX_EVENINGS = 366;

/**
 * @typedef {Object} Title
 * @property {number} id
 * @property {string} title
 * @property {string | null} type
 * @property {number | null} episodes
 * @property {number | null} minutesPerEpisode
 */

//runtime for one title: movies count as one episode, ongoing shows aren't counted, 24 min is used if the length is missing
export function runtimeOf(item) {
  const isMovie = String(item.type ?? "").toLowerCase() === "movie";
  const episodes = item.episodes ?? (isMovie ? 1 : null);

  if (episodes == null) {
    return {
      item,
      counted: false,
      reason: "ongoing",
      minutes: 0,
      episodes: null,
      minutesPerEpisode: item.minutesPerEpisode ?? null,
      estimated: false,
    };
  }

  const known = item.minutesPerEpisode != null;
  const minutesPerEpisode = known ? item.minutesPerEpisode : DEFAULT_MINUTES;
  return {
    item,
    counted: true,
    reason: null,
    minutes: episodes * minutesPerEpisode,
    episodes,
    minutesPerEpisode,
    estimated: !known,
  };
}

//total runtime and evenings needed for the whole plan
export function planTotals(items, hoursPerEvening) {
  const entries = items.map(runtimeOf);
  const totalMinutes = entries.filter((e) => e.counted).reduce((sum, e) => sum + e.minutes, 0);
  return {
    entries,
    totalMinutes,
    ongoing: entries.filter((e) => !e.counted).map((e) => e.item),
    hasEstimate: entries.some((e) => e.estimated),
    minutesPerEvening: Math.round(hoursPerEvening * 60),
  };
}

//works out each evening from the weekdays picked. Titles go in order and can carry over into the next evening
export function buildSchedule(entries, minutesPerEvening, days, startDate = new Date(), options = {}) {
  const { includeToday = true, maxEvenings = MAX_EVENINGS } = options;
  const queue = entries
    .filter((e) => e.counted && e.minutes > 0)
    .map((e) => ({ id: e.item.id, title: e.item.title, left: e.minutes }));

  if (!queue.length || minutesPerEvening <= 0 || !days.length) {
    return { evenings: [], truncated: false };
  }

  const allowed = new Set(days);
  const evenings = [];
  const cursor = startOfDay(startDate);
  if (!includeToday) cursor.setDate(cursor.getDate() + 1);

  let steps = 0;
  const maxSteps = maxEvenings * 7 + 7;
  while (queue.length && evenings.length < maxEvenings && steps < maxSteps) {
    steps += 1;
    if (allowed.has(cursor.getDay())) {
      let room = minutesPerEvening;
      const segments = [];
      while (room > 0 && queue.length) {
        const head = queue[0];
        const take = Math.min(room, head.left);
        segments.push({ id: head.id, title: head.title, minutes: take });
        head.left -= take;
        room -= take;
        if (head.left === 0) queue.shift();
      }
      evenings.push({ date: new Date(cursor), minutes: minutesPerEvening - room, segments });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return { evenings, truncated: queue.length > 0 };
}

//date of the last evening, or null if there's no schedule
export function finishDateOf(evenings) {
  return evenings.length ? evenings[evenings.length - 1].date : null;
}

/*--- Planner controls (pure, so they can be tested) ---*/
//days shown Monday to Sunday (day is the JavaScript weekday, Sunday = 0)
export const WEEK = [
  { day: 1, label: "Mon", name: "Monday" },
  { day: 2, label: "Tue", name: "Tuesday" },
  { day: 3, label: "Wed", name: "Wednesday" },
  { day: 4, label: "Thu", name: "Thursday" },
  { day: 5, label: "Fri", name: "Friday" },
  { day: 6, label: "Sat", name: "Saturday" },
  { day: 0, label: "Sun", name: "Sunday" },
];

//hours per evening limits
export const MIN_HOURS = 0.5;
export const MAX_HOURS = 8;

//hours per evening up or down by half an hour, within the limits
export function stepHours(current, direction) {
  const base = Number(current) > 0 ? Number(current) : 2;
  const halves = base * 2;
  //Move to the next half-hour mark in the chosen direction, even if the stored value sits between marks.
  const next = direction > 0 ? Math.floor(halves + 1e-9) + 1 : Math.ceil(halves - 1e-9) - 1;
  return Math.min(MAX_HOURS, Math.max(MIN_HOURS, next / 2));
}

//2 or 1.5 (no trailing .0)
export function formatHours(hours) {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

//adds or removes a weekday, but at least one has to stay picked
export function toggleDay(days, day) {
  const set = new Set(days);
  if (set.has(day)) {
    if (set.size === 1) return { days: [...set], blocked: true };
    set.delete(day);
  } else {
    set.add(day);
  }
  return { days: [...set].sort((a, b) => a - b), blocked: false };
}

/*--- Reordering titles (pure, so the drag logic can be tested without a browser) ---*/

//copy of the list with one item moved to a new spot
export function moveItem(list, from, to) {
  const next = [...list];
  if (from === to || from < 0 || from >= next.length) return next;
  const target = Math.min(Math.max(to, 0), next.length - 1);
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}

//where a dragged row would land, based on the middle of each row
export function dropIndex(mids, draggedIndex, draggedMid) {
  let index = 0;
  mids.forEach((mid, i) => {
    if (i !== draggedIndex && mid < draggedMid) index += 1;
  });
  return index;
}

//how far each row slides to make room while one is dragged (the dragged row itself is 0)
export function shiftsFor(heights, gap, from, to) {
  const room = heights[from] + gap;
  return heights.map((_, i) => {
    if (i === from) return 0;
    if (from < to && i > from && i <= to) return -room;
    if (from > to && i >= to && i < from) return room;
    return 0;
  });
}
