// Run with: npm test   (or: node tests/core.test.mjs)
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseDuration, formatMinutes, formatDate, plural, debounce, escapeHtml } from "../js/utils.js";
import { runtimeOf, planTotals, buildSchedule, finishDateOf, DEFAULT_MINUTES } from "../js/planner-core.js";
import { createApi, normalizeAnime, ApiError, describeError } from "../js/api.js";

/* ---------- utils ---------- */

test("parseDuration handles the formats Jikan returns", () => {
  assert.equal(parseDuration("24 min per ep"), 24);
  assert.equal(parseDuration("23 min per ep"), 23);
  assert.equal(parseDuration("1 hr 55 min"), 115);
  assert.equal(parseDuration("2 hr"), 120);
  assert.equal(parseDuration("45 sec per ep"), 1);
  assert.equal(parseDuration("Unknown"), null);
  assert.equal(parseDuration(""), null);
  assert.equal(parseDuration(null), null);
  assert.equal(parseDuration(undefined), null);
});

test("formatMinutes", () => {
  assert.equal(formatMinutes(624), "10h 24m");
  assert.equal(formatMinutes(120), "2h 00m");
  assert.equal(formatMinutes(45), "45m");
  assert.equal(formatMinutes(0), "0m");
  assert.equal(formatMinutes(1296), "21h 36m");
});

test("formatDate and plural", () => {
  assert.equal(formatDate(new Date(2026, 10, 6)), "Fri 6 Nov");
  assert.equal(plural(1, "title"), "1 title");
  assert.equal(plural(3, "title"), "3 titles");
});

test("escapeHtml and debounce", async () => {
  assert.equal(escapeHtml(`<b>"x"</b> & 'y'`), "&lt;b&gt;&quot;x&quot;&lt;/b&gt; &amp; &#39;y&#39;");
  let calls = 0;
  const fn = debounce(() => (calls += 1), 20);
  fn(); fn(); fn();
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(calls, 1);
});

/* ---------- planner maths ---------- */

const bebop = { id: 1, title: "Cowboy Bebop", type: "TV", episodes: 26, minutesPerEpisode: 24 };
const frieren = { id: 52991, title: "Frieren", type: "TV", episodes: 28, minutesPerEpisode: 24 };
const airing = { id: 3, title: "Still Airing", type: "TV", episodes: null, minutesPerEpisode: 24 };
const movie = { id: 199, title: "Spirited Away", type: "Movie", episodes: 1, minutesPerEpisode: 125 };
const noDuration = { id: 4, title: "No Duration", type: "TV", episodes: 10, minutesPerEpisode: null };

test("runtimeOf covers TV, movie, ongoing and missing duration", () => {
  assert.equal(runtimeOf(bebop).minutes, 624);
  assert.equal(runtimeOf(movie).minutes, 125);
  const ongoing = runtimeOf(airing);
  assert.equal(ongoing.counted, false);
  assert.equal(ongoing.reason, "ongoing");
  const estimated = runtimeOf(noDuration);
  assert.equal(estimated.minutes, 10 * DEFAULT_MINUTES);
  assert.equal(estimated.estimated, true);
  // A movie with null episodes still counts as one episode.
  assert.equal(runtimeOf({ ...movie, episodes: null }).minutes, 125);
});

test("planTotals sums counted titles and lists ongoing ones", () => {
  const totals = planTotals([bebop, frieren, airing], 2);
  assert.equal(totals.totalMinutes, 624 + 672);
  assert.equal(totals.ongoing.length, 1);
  assert.equal(totals.ongoing[0].id, 3);
  assert.equal(totals.minutesPerEvening, 120);
  assert.equal(totals.hasEstimate, false);
  assert.equal(planTotals([noDuration], 1).hasEstimate, true);
  assert.equal(planTotals([], 2).totalMinutes, 0);
});

test("schedule uses the chosen weekdays and real dates", () => {
  // Wed 14 Oct 2026, watching Mon / Wed / Fri, 2 hours each.
  const start = new Date(2026, 9, 14);
  const totals = planTotals([bebop, frieren], 2);
  const { evenings, truncated } = buildSchedule(totals.entries, totals.minutesPerEvening, [1, 3, 5], start);

  assert.equal(truncated, false);
  assert.equal(evenings.length, Math.ceil(totals.totalMinutes / totals.minutesPerEvening)); // 11
  assert.equal(evenings.length, 11);

  // Starts today (Wednesday) and only ever lands on Mon, Wed or Fri.
  assert.equal(evenings[0].date.getTime(), start.getTime());
  for (const e of evenings) assert.ok([1, 3, 5].includes(e.date.getDay()));

  // 14 Oct, 16, 19, 21, 23, 26, 28, 30 Oct, 2 Nov, 4 Nov, 6 Nov.
  assert.equal(formatDate(finishDateOf(evenings)), "Fri 6 Nov");

  // Every minute is placed exactly once, and the last evening is the partial one.
  const placed = evenings.reduce((s, e) => s + e.minutes, 0);
  assert.equal(placed, totals.totalMinutes);
  assert.equal(evenings[evenings.length - 1].minutes, 1296 - 10 * 120);
});

test("schedule starts on the next chosen day when today is not chosen", () => {
  const start = new Date(2026, 9, 14); // Wednesday
  const totals = planTotals([movie], 2);
  const { evenings } = buildSchedule(totals.entries, totals.minutesPerEvening, [5], start); // Fridays only
  assert.equal(formatDate(evenings[0].date), "Fri 16 Oct");
  assert.equal(evenings.length, 2); // 125 min over 120 min evenings
});

test("schedule can skip today", () => {
  const start = new Date(2026, 9, 14);
  const totals = planTotals([movie], 3);
  const { evenings } = buildSchedule(totals.entries, totals.minutesPerEvening, [3], start, { includeToday: false });
  assert.equal(formatDate(evenings[0].date), "Wed 21 Oct");
});

test("titles carry over between evenings in order", () => {
  const start = new Date(2026, 9, 14);
  const a = { id: 1, title: "A", type: "TV", episodes: 5, minutesPerEpisode: 30 }; // 150
  const b = { id: 2, title: "B", type: "TV", episodes: 2, minutesPerEpisode: 30 }; // 60
  const totals = planTotals([a, b], 2);
  const { evenings } = buildSchedule(totals.entries, totals.minutesPerEvening, [0, 1, 2, 3, 4, 5, 6], start);
  assert.equal(evenings.length, 2);
  assert.deepEqual(evenings[0].segments, [{ id: 1, title: "A", minutes: 120 }]);
  assert.deepEqual(evenings[1].segments, [
    { id: 1, title: "A", minutes: 30 },
    { id: 2, title: "B", minutes: 60 },
  ]);
});

test("schedule handles empty and invalid input safely", () => {
  const entries = planTotals([bebop], 2).entries;
  assert.deepEqual(buildSchedule([], 120, [1]).evenings, []);
  assert.deepEqual(buildSchedule(entries, 0, [1]).evenings, []);
  assert.deepEqual(buildSchedule(entries, 120, []).evenings, []);
  assert.deepEqual(buildSchedule(planTotals([airing], 2).entries, 120, [1]).evenings, []);
  assert.equal(finishDateOf([]), null);
});

test("schedule is capped so a huge plan cannot loop forever", () => {
  const huge = { id: 9, title: "Huge", type: "TV", episodes: 100000, minutesPerEpisode: 24 };
  const totals = planTotals([huge], 1);
  const { evenings, truncated } = buildSchedule(totals.entries, totals.minutesPerEvening, [1], new Date(2026, 9, 14), { maxEvenings: 50 });
  assert.equal(evenings.length, 50);
  assert.equal(truncated, true);
});

/* ---------- API client (mock fetch, no network) ---------- */

function mockResponse(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

function makeClient(handler, overrides = {}) {
  let clock = 0;
  const calls = [];
  const sleeps = [];
  const api = createApi({
    fetchImpl: async (url, opts) => {
      calls.push({ url, at: clock });
      return handler(url, opts, calls.length);
    },
    storage: null,
    now: () => clock,
    sleep: async (ms) => { sleeps.push(ms); clock += ms; },
    minGapMs: 400,
    retryDelayMs: 2000,
    ...overrides,
  });
  return { api, calls, sleeps, advance: (ms) => { clock += ms; } };
}

const rawAnime = {
  mal_id: 1,
  title: "Cowboy Bebop",
  title_english: "Cowboy Bebop",
  images: { jpg: { large_image_url: "https://img/bebop.jpg" } },
  episodes: 26,
  duration: "24 min per ep",
  type: "TV",
  status: "Finished Airing",
  score: 8.75,
  genres: [{ mal_id: 1, name: "Action" }],
  trailer: { embed_url: "https://youtube/embed/x" },
  synopsis: "Bounty hunters.",
};

test("normalizeAnime converts raw API data into the shared shape", () => {
  const n = normalizeAnime(rawAnime);
  assert.equal(n.id, 1);
  assert.equal(n.title, "Cowboy Bebop");
  assert.equal(n.image, "https://img/bebop.jpg");
  assert.equal(n.episodes, 26);
  assert.equal(n.minutesPerEpisode, 24);
  assert.equal(n.status, "Finished Airing");
  assert.deepEqual(n.genres, [{ id: 1, name: "Action" }]);
  assert.equal(n.trailerEmbedUrl, "https://youtube/embed/x");

  const sparse = normalizeAnime({ mal_id: 2, title: "Sparse", episodes: null, duration: "Unknown", images: {} });
  assert.equal(sparse.episodes, null);
  assert.equal(sparse.minutesPerEpisode, null);
  assert.equal(sparse.image, null);
  assert.equal(sparse.score, null);
  assert.equal(sparse.trailerEmbedUrl, null);
  assert.equal(normalizeAnime(null), null);
});

test("requests are spaced at least 400 ms apart", async () => {
  const { api, calls } = makeClient(() => mockResponse(200, { data: [], pagination: {} }));
  await Promise.all([api.getTopAnime(), api.getSeasonNow(), api.getGenres()]);
  assert.equal(calls.length, 3);
  assert.ok(calls[1].at - calls[0].at >= 400);
  assert.ok(calls[2].at - calls[1].at >= 400);
});

test("responses are cached and identical in-flight requests are shared", async () => {
  const { api, calls } = makeClient(() => mockResponse(200, { data: [rawAnime], pagination: { has_next_page: true } }));
  const [a, b] = await Promise.all([api.getTopAnime({ limit: 3 }), api.getTopAnime({ limit: 3 })]);
  assert.equal(calls.length, 1);
  assert.equal(a.items[0].title, "Cowboy Bebop");
  assert.equal(b.pagination.hasNext, true);
  await api.getTopAnime({ limit: 3 });
  assert.equal(calls.length, 1); // served from cache
  await api.getTopAnime({ limit: 5 });
  assert.equal(calls.length, 2); // different URL
});

test("search sends only the parameters that have values", async () => {
  const { api, calls } = makeClient(() => mockResponse(200, { data: [], pagination: {} }));
  await api.searchAnime({ q: "naruto", genres: "1,4", type: "", page: 2 });
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, "/v4/anime");
  assert.equal(url.searchParams.get("q"), "naruto");
  assert.equal(url.searchParams.get("genres"), "1,4");
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(url.searchParams.get("limit"), "24");
  assert.equal(url.searchParams.get("sfw"), "true");
  assert.equal(url.searchParams.has("type"), false);
});

test("a 429 is retried once after a delay, then succeeds", async () => {
  const { api, calls, sleeps } = makeClient((url, o, n) => (n === 1 ? mockResponse(429, {}) : mockResponse(200, { data: rawAnime })));
  const anime = await api.getAnime(1);
  assert.equal(calls.length, 2);
  assert.ok(sleeps.includes(2000));
  assert.equal(anime.id, 1);
});

test("a persistent 429 becomes a rate-limit error", async () => {
  const { api, calls } = makeClient(() => mockResponse(429, {}));
  await assert.rejects(() => api.getAnime(1), (e) => e instanceof ApiError && e.kind === "rate-limit");
  assert.equal(calls.length, 2);
});

test("404 is reported once as not-found and never retried", async () => {
  const { api, calls } = makeClient(() => mockResponse(404, {}));
  await assert.rejects(() => api.getAnimeFull(99999999), (e) => e.kind === "not-found");
  assert.equal(calls.length, 1);
});

test("network failures and server errors are classified", async () => {
  const net = makeClient(() => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(() => net.api.getAnime(1), (e) => e.kind === "network");
  const srv = makeClient(() => mockResponse(503, {}));
  await assert.rejects(() => srv.api.getAnime(1), (e) => e.kind === "server");
});

test("stale cached results are returned when the live request fails", async () => {
  let fail = false;
  const { api, advance } = makeClient(() => (fail ? mockResponse(503, {}) : mockResponse(200, { data: [rawAnime], pagination: {} })), { ttlMs: 1000 });
  const first = await api.searchAnime({ q: "bebop" });
  assert.equal(first.stale, false);
  advance(5000); // cache now expired
  fail = true;
  const second = await api.searchAnime({ q: "bebop" });
  assert.equal(second.stale, true);
  assert.equal(second.items[0].title, "Cowboy Bebop");
});

test("an aborted request is reported as aborted and not retried", async () => {
  const { api, calls } = makeClient(() => mockResponse(200, { data: [] }));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => api.searchAnime({ q: "x", signal: controller.signal }), (e) => e.kind === "aborted");
  assert.equal(calls.length, 0);
});

test("recommendations are limited and normalised", async () => {
  const entries = Array.from({ length: 8 }, (_, i) => ({ entry: { mal_id: i + 10, title: `Rec ${i}`, images: { jpg: { image_url: "x.jpg" } } } }));
  const { api } = makeClient(() => mockResponse(200, { data: entries }));
  const recs = await api.getRecommendations(1, { limit: 4 });
  assert.equal(recs.length, 4);
  assert.equal(recs[0].id, 10);
});

test("describeError gives a friendly message for every kind", () => {
  assert.match(describeError(new ApiError("rate-limit", "")), /Too many requests/);
  assert.match(describeError(new ApiError("not-found", "")), /couldn't find/);
  assert.match(describeError(new ApiError("network", "")), /connection/);
  assert.match(describeError(new ApiError("server", "")), /try again/);
});
