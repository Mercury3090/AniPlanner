// Planner maths. Pure functions, no DOM, fully unit tested.
//
// Rules (see PRD data handling):
// - Total runtime = episodes x minutes per episode, summed across the plan.
// - Ongoing shows (episodes unknown) are listed but not counted.
// - Movies count as one episode of the full running time.
// - If the minutes per episode are missing, 24 is used and flagged as an estimate.
// - The schedule uses the weekdays the user actually picked, so every evening has a real date.

import { startOfDay } from "./utils.js";

export const DEFAULT_MINUTES = 24;
const MAX_EVENINGS = 366;

/**
 * @typedef {Object} Title
 * @property {number} id
 * @property {string} title
 * @property {string | null} type
 * @property {number | null} episodes
 * @property {number | null} minutesPerEpisode
 */

/**
 * Runtime of a single title.
 * @param {Title} item
 */
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

/**
 * Totals for a whole plan.
 * @param {Title[]} items
 * @param {number} hoursPerEvening
 */
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

/**
 * Builds the evening-by-evening schedule from the weekdays the user picked.
 * Titles are watched in order, and a title can carry over into the next evening.
 *
 * @param {ReturnType<typeof runtimeOf>[]} entries
 * @param {number} minutesPerEvening
 * @param {number[]} days  Weekday numbers, Sunday = 0 ... Saturday = 6
 * @param {Date} [startDate]
 * @param {{includeToday?: boolean, maxEvenings?: number}} [options]
 * @returns {{evenings: {date: Date, minutes: number, segments: {id: number, title: string, minutes: number}[]}[], truncated: boolean}}
 */
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

/** Date of the last evening, or null when there is no schedule. */
export function finishDateOf(evenings) {
  return evenings.length ? evenings[evenings.length - 1].date : null;
}
