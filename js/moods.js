// Filter definitions for Discover.
//
// Jikan has no "mood" field, so each mood is our own mapping to genre names. The
// genre IDs are looked up from /genres/anime at runtime, so nothing is hard-coded.
// Jikan receives the IDs as a comma-separated list.

import { runtimeOf } from "./planner-core.js";

export const MOODS = [
  { key: "cosy", label: "Cosy", genres: ["Slice of Life", "Comedy"] },
  { key: "hype", label: "Hype", genres: ["Action", "Adventure"] },
  { key: "emotional", label: "Emotional", genres: ["Drama", "Romance"] },
  { key: "mind-bending", label: "Mind-bending", genres: ["Mystery", "Sci-Fi"] },
];

/**
 * Runtime filter. Ranges are on TOTAL watch time (episodes x minutes), because
 * "short" and "long" mean different things to different people.
 * "movie" is applied by the API (type=movie). The rest are applied after the
 * results arrive, using the same maths as the planner.
 */
export const RUNTIME_RANGES = [
  { key: "movie", label: "Movie", server: true },
  { key: "under5", label: "Under 5 hours", min: 0, max: 5 * 60 },
  { key: "5to15", label: "5 to 15 hours", min: 5 * 60, max: 15 * 60 },
  { key: "15to30", label: "15 to 30 hours", min: 15 * 60, max: 30 * 60 },
  { key: "over30", label: "Over 30 hours", min: 30 * 60, max: Infinity },
];

export const SORTS = [
  { key: "popular", label: "Popular", orderBy: "popularity", sort: "asc" },
  { key: "rating", label: "Top rated", orderBy: "score", sort: "desc" },
  { key: "title", label: "A to Z", orderBy: "title", sort: "asc" },
];

export function findMood(key) {
  return MOODS.find((m) => m.key === key) ?? null;
}

export function findRange(key) {
  return RUNTIME_RANGES.find((r) => r.key === key) ?? null;
}

export function findSort(key) {
  return SORTS.find((s) => s.key === key) ?? SORTS[0];
}

/**
 * Genre IDs for a mood, matched by name against the /genres/anime list.
 * @param {string} moodKey
 * @param {{id: number, name: string}[]} genres
 * @returns {number[]}
 */
export function genreIdsForMood(moodKey, genres) {
  const mood = findMood(moodKey);
  if (!mood) return [];
  const wanted = mood.genres.map((g) => g.toLowerCase());
  return genres.filter((g) => wanted.includes(g.name.toLowerCase())).map((g) => g.id);
}

/**
 * True when a title falls inside a client-side runtime range.
 * Titles with no known total (still airing) never match a range.
 */
export function matchesRuntime(item, rangeKey) {
  const range = findRange(rangeKey);
  if (!range || range.server) return true;
  const entry = runtimeOf(item);
  return entry.counted && entry.minutes >= range.min && entry.minutes < range.max;
}
