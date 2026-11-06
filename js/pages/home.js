// Home page. Two independent requests: three popular posters for the hero, and
// what is airing now. Each can fail without affecting the other or the rest of
// the page, and the page never makes more than these two calls.

import { api, describeError } from "../api.js";
import { isInDraft, onChange } from "../storage.js";
import { togglePlan } from "../plan-actions.js";
import { escapeHtml } from "../utils.js";
import { animeCardHTML, attachImageFallback, bannerHTML, emptyStateHTML, placeholderHTML, setAddButtonState, skeletonCardsHTML } from "../ui.js";

const HERO_COUNT = 3;
const AIRING_COUNT = 4;

const el = {
  posters: document.getElementById("hero-posters"),
  banner: document.getElementById("airing-banner"),
  airing: document.getElementById("airing"),
  empty: document.getElementById("airing-empty"),
};

const state = { airing: [] };

/* ---------- Hero posters ---------- */

function posterItemHTML(item) {
  const media = item.image
    ? `<img src="${escapeHtml(item.image)}" alt="Poster for ${escapeHtml(item.title)}" width="300" height="450" decoding="async">`
    : placeholderHTML();
  return `<li class="hero-poster">${media}</li>`;
}

function showPosterSkeletons() {
  el.posters.innerHTML = Array.from({ length: HERO_COUNT }, () => `<li class="hero-poster" aria-hidden="true"><span class="skeleton skeleton--poster" style="width:100%"></span></li>`).join("");
  el.posters.setAttribute("aria-busy", "true");
}

function showPosterPlaceholders() {
  // If the request fails the hero still looks complete, and the text carries the meaning.
  el.posters.innerHTML = Array.from({ length: HERO_COUNT }, () => `<li class="hero-poster" aria-hidden="true">${placeholderHTML()}</li>`).join("");
  el.posters.setAttribute("aria-hidden", "true");
}

async function loadHero() {
  showPosterSkeletons();
  try {
    const { items } = await api.getTopAnime({ limit: HERO_COUNT });
    const shown = items.slice(0, HERO_COUNT);
    if (shown.length === 0) {
      showPosterPlaceholders();
      return;
    }
    el.posters.innerHTML = shown.map(posterItemHTML).join("");
    el.posters.removeAttribute("aria-hidden");
  } catch {
    showPosterPlaceholders();
  } finally {
    el.posters.removeAttribute("aria-busy");
  }
}

/* ---------- Airing now ---------- */

function renderAiring() {
  el.airing.innerHTML = state.airing.map((item) => animeCardHTML(item, { inPlan: isInDraft(item.id) })).join("");
}

async function loadAiring() {
  el.banner.innerHTML = "";
  el.empty.innerHTML = "";
  el.airing.innerHTML = skeletonCardsHTML(AIRING_COUNT);
  el.airing.setAttribute("aria-busy", "true");

  try {
    const result = await api.getSeasonNow({ limit: AIRING_COUNT });
    state.airing = result.items.slice(0, AIRING_COUNT);

    if (state.airing.length === 0) {
      el.airing.innerHTML = "";
      el.empty.innerHTML = emptyStateHTML({
        iconName: "calendar",
        title: "Nothing airing right now",
        text: "Browse the full catalogue instead.",
        actionLabel: "Browse anime",
        href: "discover.html",
      });
      return;
    }
    if (result.stale) {
      el.banner.innerHTML = bannerHTML({ tone: "warning", message: "Showing saved results. We couldn't reach the server, so these may be out of date.", actionLabel: "Try again", action: "retry-airing" });
    }
    renderAiring();
  } catch (error) {
    state.airing = [];
    el.airing.innerHTML = "";
    el.banner.innerHTML = bannerHTML({ tone: "error", message: describeError(error), actionLabel: "Retry", action: "retry-airing" });
  } finally {
    el.airing.removeAttribute("aria-busy");
  }
}

/* ---------- Events ---------- */

el.banner.addEventListener("click", (event) => {
  if (event.target.closest('[data-action="retry-airing"]')) loadAiring();
});

el.airing.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add]");
  if (!button) return;
  const item = state.airing.find((i) => i.id === Number(button.dataset.add));
  if (!item) return;
  if (!togglePlan(item).ok) {
    el.banner.innerHTML = bannerHTML({ tone: "error", message: "Couldn't save your plan. Storage may be full or blocked." });
  }
});

// Keep every Add button in step with the plan, including Undo and changes from other tabs.
onChange(() => {
  for (const button of el.airing.querySelectorAll("[data-add]")) {
    const id = Number(button.dataset.add);
    const item = state.airing.find((i) => i.id === id);
    const inPlan = isInDraft(id);
    if (item && String(inPlan) !== button.dataset.inPlan) setAddButtonState(button, item, inPlan);
  }
});

attachImageFallback(el.airing);
el.posters.addEventListener(
  "error",
  (event) => {
    const img = event.target;
    if (img instanceof HTMLImageElement) img.closest(".hero-poster").innerHTML = placeholderHTML();
  },
  true
);

/* ---------- Start ---------- */

loadHero();
loadAiring();
