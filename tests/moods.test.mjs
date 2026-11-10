import { test } from "node:test";
import assert from "node:assert/strict";
import { MOODS, resolveMoodGenres, genreIdsForMood } from "../js/moods.js";

const GENRES = [
  { id: 1, name: "Action" }, { id: 2, name: "Adventure" }, { id: 4, name: "Comedy" }, { id: 7, name: "Mystery" },
  { id: 8, name: "Drama" }, { id: 22, name: "Romance" }, { id: 24, name: "Sci-Fi" }, { id: 36, name: "Slice of Life" },
];

test("a mood's genres come back main genre first, whatever order the API lists them in", () => {
  assert.deepEqual(resolveMoodGenres("cosy", GENRES), [{ id: 36, name: "Slice of Life" }, { id: 4, name: "Comedy" }]);
  assert.deepEqual(genreIdsForMood("cosy", GENRES), [36, 4]);
  assert.deepEqual(genreIdsForMood("cosy", [...GENRES].reverse()), [36, 4], "API order does not matter");
  assert.deepEqual(genreIdsForMood("hype", GENRES), [1, 2]);
  assert.deepEqual(genreIdsForMood("emotional", GENRES), [8, 22]);
  assert.deepEqual(genreIdsForMood("mind-bending", GENRES), [7, 24]);
});

test("names are matched ignoring case, and missing genres are skipped", () => {
  const lower = GENRES.map((g) => ({ ...g, name: g.name.toLowerCase() }));
  assert.deepEqual(genreIdsForMood("cosy", lower), [36, 4]);
  assert.deepEqual(genreIdsForMood("cosy", GENRES.filter((g) => g.name !== "Slice of Life")), [4], "only Comedy is found");
  assert.deepEqual(genreIdsForMood("cosy", GENRES.filter((g) => g.id > 100)), []);
  assert.deepEqual(genreIdsForMood("cosy", []), []);
});

test("the same genre is never listed twice, and unknown moods resolve to nothing", () => {
  const doubled = [...GENRES, { id: 36, name: "Slice of Life" }, { id: 99, name: "Comedy" }];
  assert.deepEqual(genreIdsForMood("cosy", doubled), [36, 4], "the first match for each name is used");
  assert.deepEqual(resolveMoodGenres("nope", GENRES), []);
  assert.deepEqual(resolveMoodGenres("", GENRES), []);
});

test("every mood is built from one to three named genres", () => {
  for (const mood of MOODS) {
    assert.ok(mood.genres.length >= 1 && mood.genres.length <= 3, mood.key);
    assert.equal(new Set(mood.genres).size, mood.genres.length, `${mood.key} repeats a genre`);
  }
  assert.equal(MOODS.length, 4, "the four moods named in the PRD");
});
