import { test } from "node:test";
import assert from "node:assert/strict";

import { parseAnimeId, describeRuntime, isSafeTrailerUrl, truncate } from "../js/detail.js";
import { addButtonHTML, emptyStateHTML } from "../js/ui.js";

const bebop = { id: 1, title: "Cowboy Bebop", type: "TV", status: "Finished Airing", episodes: 26, minutesPerEpisode: 24 };
const movie = { id: 199, title: "Spirited Away", type: "Movie", status: "Finished Airing", episodes: 1, minutesPerEpisode: 125 };
const airing = { id: 3, title: "Still Airing", type: "TV", status: "Currently Airing", episodes: null, minutesPerEpisode: 24 };
const upcoming = { id: 4, title: "Soon", type: "TV", status: "Not yet aired", episodes: null, minutesPerEpisode: null };
const noDuration = { id: 5, title: "No Duration", type: "TV", status: "Finished Airing", episodes: 10, minutesPerEpisode: null };

const byKey = (model, key) => model.stats.find((s) => s.key === key);

test("parseAnimeId accepts plain positive integers only", () => {
  assert.equal(parseAnimeId("?id=1"), 1);
  assert.equal(parseAnimeId("?id=52991"), 52991);
  assert.equal(parseAnimeId("?foo=1&id=199"), 199);
  for (const bad of ["", "?id=", "?id=0", "?id=-5", "?id=abc", "?id=1.5", "?id=01", "?id=1e3", "?id=12345678901", "?id=%3Cscript%3E", "?id=1 2", "?other=3"]) {
    assert.equal(parseAnimeId(bad), null, bad);
  }
});

test("runtime strip for a normal TV show", () => {
  const model = describeRuntime(bebop, 2);
  assert.equal(model.kind, "tv");
  assert.equal(byKey(model, "episodes").value, "26");
  assert.equal(byKey(model, "per-episode").value, "24 min");
  assert.equal(byKey(model, "total").value, "10h 24m");
  assert.equal(byKey(model, "total").highlight, true);
  assert.equal(byKey(model, "evenings").label, "Evenings at 2h");
  assert.equal(byKey(model, "evenings").value, "6"); // 624 / 120 = 5.2 -> 6
  assert.equal(model.note, null);
});

test("evenings follow the hours per evening and never drop below one", () => {
  assert.equal(byKey(describeRuntime(bebop, 3), "evenings").value, "4"); // 624 / 180 = 3.47
  assert.equal(byKey(describeRuntime(bebop, 1.5), "evenings").label, "Evenings at 1.5h");
  assert.equal(byKey(describeRuntime(bebop, 1.5), "evenings").value, "7"); // 624 / 90 = 6.93
  assert.equal(byKey(describeRuntime({ ...bebop, episodes: 1, minutesPerEpisode: 5 }, 2), "evenings").value, "1");
  // Bad hours fall back to a sensible default instead of dividing by zero.
  assert.equal(byKey(describeRuntime(bebop, 0), "evenings").label, "Evenings at 2h");
  assert.equal(byKey(describeRuntime(bebop, undefined), "evenings").value, "6");
  assert.equal(byKey(describeRuntime(bebop, NaN), "evenings").value, "6");
});

test("runtime strip for a movie", () => {
  const model = describeRuntime(movie, 2);
  assert.equal(model.kind, "movie");
  assert.equal(byKey(model, "format").value, "Movie");
  assert.equal(byKey(model, "total").value, "2h 05m");
  assert.equal(byKey(model, "evenings").value, "2"); // 125 min over 120 min evenings
  assert.equal(model.stats.length, 3);
});

test("runtime strip for airing and upcoming titles explains why there is no total", () => {
  const a = describeRuntime(airing, 2);
  assert.equal(a.kind, "ongoing");
  assert.equal(byKey(a, "episodes").value, "Still airing");
  assert.equal(byKey(a, "per-episode").value, "24 min");
  assert.equal(byKey(a, "total").value, "Not available yet");
  assert.match(a.note, /still airing/);

  const u = describeRuntime(upcoming, 2);
  assert.equal(byKey(u, "episodes").value, "Not announced");
  assert.equal(byKey(u, "per-episode").value, "Unknown");
  assert.match(u.note, /hasn't aired/);
});

test("missing episode length is estimated and flagged", () => {
  const model = describeRuntime(noDuration, 2);
  assert.equal(byKey(model, "per-episode").value, "24 min (estimated)");
  assert.equal(byKey(model, "total").value, "About 4h 00m");
  assert.match(model.note, /assumed 24 minutes/);
});

test("only https YouTube embeds are accepted as trailers", () => {
  assert.equal(isSafeTrailerUrl("https://www.youtube.com/embed/abc123?enablejsapi=1&autoplay=1"), true);
  assert.equal(isSafeTrailerUrl("https://www.youtube-nocookie.com/embed/abc123"), true);
  for (const bad of [
    "javascript:alert(1)", "http://www.youtube.com/embed/abc", "https://evil.com/embed/abc",
    "https://www.youtube.com.evil.com/embed/abc", "https://www.youtube.com/watch?v=abc",
    "data:text/html,<script>alert(1)</script>", "", null, undefined, "not a url",
  ]) {
    assert.equal(isSafeTrailerUrl(bad), false, String(bad));
  }
});

test("truncate cuts at a word and handles short or missing text", () => {
  assert.equal(truncate("Short text."), "Short text.");
  assert.equal(truncate(null), "");
  assert.equal(truncate("  lots   of\n\nspace  "), "lots of space");
  const long = "word ".repeat(60);
  const out = truncate(long, 50);
  assert.ok(out.length <= 50);
  assert.ok(out.endsWith("…"));
  assert.ok(!out.includes("  "));
});

test("large add button drops the compact card classes", () => {
  const compact = addButtonHTML(bebop, false);
  assert.ok(compact.includes("btn--small") && compact.includes("btn--block") && compact.includes('data-large="false"'));
  const large = addButtonHTML(bebop, false, { large: true });
  assert.ok(!large.includes("btn--small") && !large.includes("btn--block") && large.includes('data-large="true"'));
  const added = addButtonHTML(bebop, true, { large: true });
  assert.ok(added.includes("btn--secondary") && added.includes("Added") && added.includes('aria-label="Remove Cowboy Bebop from plan"'));
});

test("empty state heading level can be set", () => {
  assert.ok(emptyStateHTML({ title: "Gone", text: "x" }).includes("<h2>Gone</h2>"));
  assert.ok(emptyStateHTML({ title: "Gone", text: "x", headingLevel: 1 }).includes("<h1>Gone</h1>"));
});
