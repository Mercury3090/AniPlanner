// Discover page: search, mood and runtime filters, results grid, and all four
// states (loading, success, error, empty). Filters live in the URL, so the back
// link on the detail page returns here exactly as the user left it.

import { api, describeError } from "../api.js";
import { MOODS, RUNTIME_RANGES, SORTS, findMood, findRange, findSort, matchesRuntime, resolveMoodGenres } from "../moods.js";
import { isInDraft, onChange } from "../storage.js";
import { debounce, plural } from "../utils.js";
import { crossfade, revealCards } from "../animations.js";
import { togglePlan } from "../plan-actions.js";
import {
  animeCardHTML,
  attachImageFallback,
  bannerHTML,
  emptyStateHTML,
  setAddButtonState,
  skeletonCardsHTML,
} from "../ui.js";

const PAGE_SIZE = 24;
const MIN_VISIBLE = 8; // keep fetching when a runtime range hides most of a page
const MAX_AUTO_PAGES = 3;

const el = {
  form: document.getElementById("search-form"),
  input: document.getElementById("q"),
  clear: document.getElementById("q-clear"),
  error: document.getElementById("q-error"),
  moods: document.getElementById("mood-chips"),
  ranges: document.getElementById("runtime-chips"),
  sort: document.getElementById("sort"),
  toggle: document.getElementById("filters-toggle"),
  toggleCount: document.getElementById("filters-count"),
  panel: document.getElementById("filters-panel"),
  banners: document.getElementById("banner-region"),
  status: document.getElementById("results-status"),
  note: document.getElementById("runtime-note"),
  moodNote: document.getElementById("mood-note"),
  results: document.getElementById("results"),
  empty: document.getElementById("empty-region"),
  more: document.getElementById("load-more"),
};

const state = {
  q: "",
  mood: "",
  runtime: "",
  sort: "popular",
  page: 0,
  hasNext: false,
  items: [],
  loading: false,
  autoPages: 0,
  moodGenres: [], // the genres of the chosen mood, main genre first
  genreOverride: null, // set when the genres together matched nothing and one genre is used instead
  moodNote: "", // what to tell the user when the mood could not be matched exactly
  seen: new Set(), // ids whose card has already animated in
  freshLoad: false, // true until the first render after a new search or filter
  controller: null,
  genres: null,
  lastError: null,
};

/* ---------- URL sync ---------- */

function readUrl() {
  const params = new URLSearchParams(window.location.search);
  state.q = (params.get("q") ?? "").trim();
  state.mood = findMood(params.get("mood")) ? params.get("mood") : "";
  state.runtime = findRange(params.get("runtime")) ? params.get("runtime") : "";
  state.sort = findSort(params.get("sort")).key;
}

function writeUrl() {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.mood) params.set("mood", state.mood);
  if (state.runtime) params.set("runtime", state.runtime);
  if (state.sort !== "popular") params.set("sort", state.sort);
  const query = params.toString();
  window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}

/* ---------- Controls ---------- */

function chipHTML(key, label, pressed) {
  return `<button type="button" class="chip" data-key="${key}" aria-pressed="${pressed}">${label}</button>`;
}

function renderControls() {
  el.moods.innerHTML = MOODS.map((m) => chipHTML(m.key, m.label, state.mood === m.key)).join("");
  el.ranges.innerHTML = RUNTIME_RANGES.map((r) => chipHTML(r.key, r.label, state.runtime === r.key)).join("");
  el.sort.innerHTML = SORTS.map((s) => `<option value="${s.key}"${s.key === state.sort ? " selected" : ""}>${s.label}</option>`).join("");
  el.input.value = state.q;
  el.clear.hidden = !state.q;
  updateFilterCount();
}

function updateFilterCount() {
  const count = Number(Boolean(state.mood)) + Number(Boolean(state.runtime));
  el.toggleCount.hidden = count === 0;
  el.toggleCount.textContent = String(count);
}

function setQueryError(message) {
  el.error.hidden = !message;
  el.error.innerHTML = message ? `<span aria-hidden="true">!</span> ${message}` : "";
  if (message) el.input.setAttribute("aria-invalid", "true");
  else el.input.removeAttribute("aria-invalid");
}

/* ---------- Data ---------- */

async function ensureGenres(signal) {
  if (!state.genres) state.genres = await api.getGenres({ signal });
  return state.genres;
}

async function buildParams(page, signal) {
  const sort = findSort(state.sort);
  const params = { page, limit: PAGE_SIZE, signal };
  if (state.q.length >= 2) params.q = state.q;
  // With a search term, "Popular" keeps Jikan's own best-match order.
  if (!(params.q && state.sort === "popular")) {
    params.orderBy = sort.orderBy;
    params.sort = sort.sort;
  }
  state.moodGenres = [];
  if (state.mood) {
    state.moodGenres = resolveMoodGenres(state.mood, await ensureGenres(signal));
    if (state.genreOverride) params.genres = state.genreOverride;
    else if (state.moodGenres.length) params.genres = state.moodGenres.map((g) => g.id).join(",");
  }
  if (state.runtime === "movie") params.type = "movie";
  return params;
}

function visibleItems() {
  return state.items.filter((item) => matchesRuntime(item, state.runtime));
}

async function load({ append = false } = {}) {
  state.controller?.abort();
  const controller = new AbortController();
  state.controller = controller;
  state.loading = true;
  state.lastError = null;
  el.results.setAttribute("aria-busy", "true");
  el.banners.innerHTML = "";
  el.empty.innerHTML = "";

  if (!append) {
    state.items = [];
    state.page = 0;
    state.autoPages = 0;
    state.seen = new Set();
    state.genreOverride = null;
    state.moodNote = "";
    state.freshLoad = true;
    el.results.innerHTML = skeletonCardsHTML(8);
    el.status.textContent = "Loading titles";
    el.more.hidden = true;
  } else {
    el.results.insertAdjacentHTML("beforeend", skeletonCardsHTML(4));
    el.more.disabled = true;
    el.more.setAttribute("aria-busy", "true");
  }

  try {
    const nextPage = state.page + 1;
    const params = await buildParams(nextPage, controller.signal);
    let result = await api.searchAnime(params);
    if (controller.signal.aborted) return;

    // A title must have EVERY genre of a mood, so a mood can match nothing. When that happens,
    // try its genres one at a time (main genre first) rather than showing a dead end.
    if (!append && state.mood) {
      const mood = findMood(state.mood);
      if (state.moodGenres.length === 0) {
        state.moodNote = `We couldn't match the ${mood.label} mood to the catalogue, so these results aren't filtered.`;
      } else if (result.items.length === 0 && state.moodGenres.length > 1) {
        for (const genre of state.moodGenres) {
          const single = await api.searchAnime({ ...params, genres: String(genre.id) });
          if (controller.signal.aborted) return;
          if (single.items.length) {
            result = single;
            state.genreOverride = String(genre.id);
            state.moodNote = `No titles matched all of the ${mood.label} mood's genres at once, so these match ${genre.name}.`;
            break;
          }
        }
      }
    }

    const known = new Set(state.items.map((i) => i.id));
    const fresh = result.items.filter((i) => !known.has(i.id));
    const firstNewId = fresh[0]?.id;
    state.items = state.items.concat(fresh);
    state.page = result.pagination.page;
    state.hasNext = result.pagination.hasNext;
    state.loading = false;

    if (result.stale) {
      el.banners.innerHTML = bannerHTML({ tone: "warning", message: "Showing saved results. We couldn't reach the server, so these may be out of date.", actionLabel: "Try again" });
    }
    render({ focusId: append ? firstNewId : undefined });
    await ensureEnough();
  } catch (error) {
    if (error.kind === "aborted") return;
    state.loading = false;
    state.lastError = error;
    render();
  } finally {
    if (state.controller === controller) {
      el.results.removeAttribute("aria-busy");
      el.more.disabled = false;
      el.more.removeAttribute("aria-busy");
    }
  }
}

/** When a runtime range hides most of a page, quietly fetch more so the grid is not empty. */
async function ensureEnough() {
  const clientRange = state.runtime && !findRange(state.runtime)?.server;
  if (!clientRange || state.loading) return;
  if (visibleItems().length >= MIN_VISIBLE || !state.hasNext || state.autoPages >= MAX_AUTO_PAGES) return;
  state.autoPages += 1;
  await load({ append: true });
}

/* ---------- Rendering ---------- */

function render({ focusId } = {}) {
  const items = visibleItems();
  const paint = () => {
    el.results.innerHTML = items.map((item) => animeCardHTML(item, { inPlan: isInDraft(item.id) })).join("");
  };
  // The first render after a new search: the skeleton fades out while the cards rise in.
  // Later renders (Load more, filter chips) only animate cards that are new.
  if (state.freshLoad) crossfade(el.results, paint, { fadeContent: false });
  else paint();
  state.freshLoad = false;
  revealCards(el.results, state.seen);
  const clientRange = state.runtime && !findRange(state.runtime)?.server;
  el.note.hidden = !clientRange || items.length === 0;
  el.moodNote.hidden = !state.moodNote || items.length === 0;
  el.moodNote.textContent = state.moodNote;
  el.more.hidden = !state.hasNext || Boolean(state.lastError && items.length === 0);

  if (state.lastError) {
    const failedMore = items.length > 0;
    el.banners.innerHTML = bannerHTML({
      tone: "error",
      message: describeError(state.lastError),
      actionLabel: "Retry",
      action: failedMore ? "retry-more" : "retry",
    });
    el.status.textContent = "";
    return;
  }

  if (items.length === 0) {
    el.status.textContent = "No titles found";
    if (state.hasNext && clientRange) {
      el.empty.innerHTML = emptyStateHTML({
        title: "Nothing matched yet",
        text: "None of the titles loaded so far fit that runtime range. Load more to keep looking.",
        actionLabel: "Load more",
        action: "load-more",
      });
    } else {
      const mood = findMood(state.mood);
      const label = state.q ? `No results for "${state.q}"` : mood ? `Nothing matched the ${mood.label} mood right now` : "No titles found";
      el.empty.innerHTML = emptyStateHTML({
        title: label,
        text: mood && !state.q ? "Try another mood or clear your filters." : "Try another search or clear your filters.",
        actionLabel: "Clear filters",
        action: "clear",
      });
    }
    return;
  }

  const suffix = state.q ? ` for "${state.q}"` : "";
  el.status.textContent = `${plural(items.length, "title")} shown${suffix}`;

  if (focusId) {
    const link = el.results.querySelector(`.card[data-id="${focusId}"] .card__title a`);
    link?.focus({ preventScroll: false });
  }
}

/* ---------- Events ---------- */

function resetAndLoad() {
  writeUrl();
  updateFilterCount();
  setQueryError("");
  load();
}

const runSearchDebounced = debounce(() => {
  const value = el.input.value.trim();
  if (value.length === 1) {
    setQueryError("Enter at least 2 letters to search.");
    return;
  }
  setQueryError("");
  if (value === state.q) return;
  state.q = value;
  resetAndLoad();
}, 400);

el.input.addEventListener("input", () => {
  el.clear.hidden = !el.input.value;
  runSearchDebounced();
});

el.form.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearchDebounced.cancel();
  const value = el.input.value.trim();
  if (value.length === 1) {
    setQueryError("Enter at least 2 letters to search.");
    el.input.focus();
    return;
  }
  setQueryError("");
  state.q = value;
  resetAndLoad();
});

el.clear.addEventListener("click", () => {
  runSearchDebounced.cancel();
  el.input.value = "";
  el.clear.hidden = true;
  setQueryError("");
  el.input.focus();
  if (state.q) {
    state.q = "";
    resetAndLoad();
  }
});

function toggleChip(group, key, current) {
  const next = current === key ? "" : key;
  for (const chip of group.querySelectorAll(".chip")) chip.setAttribute("aria-pressed", String(chip.dataset.key === next));
  return next;
}

el.moods.addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;
  state.mood = toggleChip(el.moods, chip.dataset.key, state.mood);
  resetAndLoad();
});

el.ranges.addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;
  const before = state.runtime;
  state.runtime = toggleChip(el.ranges, chip.dataset.key, state.runtime);
  const serverChanged = findRange(before)?.server || findRange(state.runtime)?.server;
  writeUrl();
  updateFilterCount();
  if (serverChanged) {
    load();
  } else {
    state.autoPages = 0;
    render();
    ensureEnough();
  }
});

el.sort.addEventListener("change", () => {
  state.sort = el.sort.value;
  resetAndLoad();
});

el.toggle.addEventListener("click", () => {
  const open = el.panel.dataset.open !== "true";
  el.panel.dataset.open = String(open);
  el.toggle.setAttribute("aria-expanded", String(open));
});

el.more.addEventListener("click", () => {
  state.autoPages = 0;
  load({ append: true });
});

function clearFilters() {
  state.q = "";
  state.mood = "";
  state.runtime = "";
  state.sort = "popular";
  renderControls();
  resetAndLoad();
}

function handleAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  switch (button.dataset.action) {
    case "retry":
      load();
      break;
    case "retry-more":
      load({ append: true });
      break;
    case "load-more":
      state.autoPages = 0;
      load({ append: true });
      break;
    case "clear":
      clearFilters();
      break;
  }
}
el.banners.addEventListener("click", handleAction);
el.empty.addEventListener("click", handleAction);

// Add to plan / Remove from plan
el.results.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add]");
  if (!button) return;
  const item = state.items.find((i) => i.id === Number(button.dataset.add));
  if (!item) return;
  const result = togglePlan(item);
  if (!result.ok) {
    el.banners.innerHTML = bannerHTML({ tone: "error", message: "Couldn't save your plan. Storage may be full or blocked." });
  }
});

// Keep every Add button in step with the plan, including changes from Undo or other tabs.
onChange(() => {
  for (const button of el.results.querySelectorAll("[data-add]")) {
    const id = Number(button.dataset.add);
    const item = state.items.find((i) => i.id === id);
    const inPlan = isInDraft(id);
    if (item && String(inPlan) !== button.dataset.inPlan) setAddButtonState(button, item, inPlan);
  }
});

attachImageFallback(el.results);

/* ---------- Start ---------- */

readUrl();
renderControls();
load();
