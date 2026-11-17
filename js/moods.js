//the filters for Discover.
//the API has no "mood" field, so each mood is my own list of genre names. the genre IDs are looked up from /genres/anime when the page runs, so no IDs are hard-coded.
//the API takes the IDs as a comma-separated list.

import { runtimeOf } from "./planner-core.js";

export const MOODS = [
  { key: "cosy", label: "Cosy", genres: ["Slice of Life", "Comedy"] },
  { key: "hype", label: "Hype", genres: ["Action", "Adventure"] },
  { key: "emotional", label: "Emotional", genres: ["Drama", "Romance"] },
  { key: "mind-bending", label: "Mind-bending", genres: ["Mystery", "Sci-Fi"] },
];

//runtime filter, based on TOTAL watch time (episodes x minutes).
//"movie" is filtered by the API. the rest are checked after the results come back,
//using the same maths as the planner
export const RUNTIME_RANGES = [
  { key: "movie", label: "Movie", server: true },
  { key: "under5", label: "Under 5 hours", min: 0, max: 5 * 60 },
  { key: "5to15", label: "5 to 15 hours", min: 5 * 60, max: 15 * 60 },
  { key: "15to30", label: "15 to 30 hours", min: 15 * 60, max: 30 * 60 },
  { key: "over30", label: "Over 30 hours", min: 30 * 60, max: Infinity },
];

//options for the sort dropdown
export const SORTS = [
  { key: "popular", label: "Popular", orderBy: "popularity", sort: "asc" },
  { key: "rating", label: "Top rated", orderBy: "score", sort: "desc" },
  { key: "title", label: "A to Z", orderBy: "title", sort: "asc" },
];

//find a mood by its key
export function findMood(key) {
  return MOODS.find((m) => m.key === key) ?? null;
}

//find a runtime range by its key
export function findRange(key) {
  return RUNTIME_RANGES.find((r) => r.key === key) ?? null;
}

//find a sort option by its key (first one if it's not found)
export function findSort(key) {
  return SORTS.find((s) => s.key === key) ?? SORTS[0];
}

//turn a mood's genre names into real genres from the API list, main genre first.
//names the API doesn't have are skipped
export function resolveMoodGenres(moodKey, genres) {
  const mood = findMood(moodKey);
  if (!mood) return [];
  const found = [];
  for (const wanted of mood.genres) {
    const match = genres.find((g) => g.name.toLowerCase() === wanted.toLowerCase());
    if (match && !found.some((f) => f.id === match.id)) found.push(match);
  }
  return found;
}

//just the genre IDs for a mood, main genre first
export function genreIdsForMood(moodKey, genres) {
  return resolveMoodGenres(moodKey, genres).map((g) => g.id);
}

//true if a title fits the chosen runtime range.
//titles still airing have no total, so they never match
export function matchesRuntime(item, rangeKey) {
  const range = findRange(rangeKey);
  if (!range || range.server) return true;
  const entry = runtimeOf(item);
  return entry.counted && entry.minutes >= range.min && entry.minutes < range.max;
}
