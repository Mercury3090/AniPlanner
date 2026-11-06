// Anime detail page. Loads one title by ?id=, shows the runtime strip, synopsis,
// trailer, genres and related titles, and handles loading, error and not-found states.

import { api, describeError } from "../api.js";
import { getDraft, isInDraft, onChange } from "../storage.js";
import { debounce, escapeHtml } from "../utils.js";
import { icon } from "../icons.js";
import { togglePlan } from "../plan-actions.js";
import { describeRuntime, isSafeTrailerUrl, parseAnimeId, truncate } from "../detail.js";
import { addButtonHTML, attachImageFallback, bannerHTML, emptyStateHTML, placeholderHTML, setAddButtonState, statusBadgeHTML } from "../ui.js";

const DEFAULT_TITLE = document.title;
const DEFAULT_DESCRIPTION = document.querySelector('meta[name="description"]')?.content ?? "";

const el = {
  back: document.getElementById("back-link"),
  banners: document.getElementById("banner-region"),
  detail: document.getElementById("detail"),
  empty: document.getElementById("empty-region"),
};

const state = { id: null, item: null, controller: null, relatedController: null, synopsisExpanded: false };

/* ---------- Back link: return to Discover with the filters the user had ---------- */

function setBackLink() {
  try {
    const ref = new URL(document.referrer);
    if (ref.origin === window.location.origin && ref.pathname.endsWith("/discover.html")) {
      el.back.href = ref.href;
    }
  } catch {
    // No usable referrer: the link keeps its default of discover.html.
  }
}

/* ---------- Loading, error and not-found states ---------- */

function showSkeleton() {
  el.detail.innerHTML = `
    <div class="detail__hero" aria-hidden="true">
      <span class="skeleton skeleton--poster detail__poster"></span>
      <div class="detail__summary">
        <span class="skeleton" style="height:2.5rem;width:70%"></span>
        <span class="skeleton skeleton--line" style="width:35%"></span>
        <span class="skeleton" style="height:6rem"></span>
        <span class="skeleton" style="height:3rem;width:10rem;border-radius:var(--radius-control)"></span>
      </div>
    </div>`;
  el.detail.setAttribute("aria-busy", "true");
}

function showNotFound() {
  el.detail.innerHTML = "";
  el.detail.removeAttribute("aria-busy");
  document.title = `Anime not found | ${DEFAULT_TITLE.split("|").pop().trim()}`;
  el.empty.innerHTML = emptyStateHTML({
    iconName: "search",
    title: "We couldn't find that anime",
    text: "The link may be wrong, or the title may have been removed.",
    actionLabel: "Back to Discover",
    href: "discover.html",
    headingLevel: 1,
  });
}

function showError(error) {
  el.detail.innerHTML = "";
  el.detail.removeAttribute("aria-busy");
  el.banners.innerHTML = bannerHTML({ tone: "error", message: describeError(error), actionLabel: "Retry", action: "retry" });
}

/* ---------- Rendering ---------- */

function scoreBadgeHTML(item) {
  return item.score == null
    ? `<span class="badge">No score yet</span>`
    : `<span class="badge">${icon("star")}<span class="visually-hidden">Score </span>${item.score.toFixed(2)}</span>`;
}

function runtimeHTML(item) {
  const hours = getDraft().hoursPerEvening;
  const { stats, note } = describeRuntime(item, hours);
  const rows = stats
    .map((s) => `<div class="runtime-strip__item${s.highlight ? " runtime-strip__item--total" : ""}"><dt>${escapeHtml(s.label)}</dt><dd>${escapeHtml(s.value)}</dd></div>`)
    .join("");
  const noteHTML = note ? `<p class="runtime-note">${icon("alert")}<span>${escapeHtml(note)}</span></p>` : "";
  return `<dl class="runtime-strip">${rows}</dl>${noteHTML}`;
}

function trailerHTML(item) {
  if (!item.trailerEmbedUrl || !isSafeTrailerUrl(item.trailerEmbedUrl)) return "";
  return `
    <section class="detail__section" aria-labelledby="trailer-heading">
      <h2 id="trailer-heading">Trailer</h2>
      <div id="trailer-slot">
        <button type="button" class="trailer" id="trailer-play" aria-label="Play trailer for ${escapeHtml(item.title)}">
          ${icon("play")}<span>Play trailer</span>
        </button>
      </div>
    </section>`;
}

function genresHTML(item) {
  if (!item.genres.length) return "";
  const tags = item.genres.map((g) => `<li class="tag">${escapeHtml(g.name)}</li>`).join("");
  return `
    <section class="detail__section" aria-labelledby="genres-heading">
      <h2 id="genres-heading">Genres</h2>
      <ul class="tag-list">${tags}</ul>
    </section>`;
}

function renderItem(item) {
  state.item = item;
  state.synopsisExpanded = false;
  const markup = `
    <header class="detail__hero">
      <div class="detail__poster">${
        item.image
          ? `<img src="${escapeHtml(item.image)}" alt="Poster for ${escapeHtml(item.title)}" width="300" height="450" decoding="async">`
          : placeholderHTML()
      }</div>
      <div class="detail__summary">
        <h1 class="detail__title">${escapeHtml(item.title)}</h1>
        <div class="cluster">
          ${statusBadgeHTML(item)}${scoreBadgeHTML(item)}
          ${item.type || item.year ? `<span class="caption">${escapeHtml([item.type, item.year].filter(Boolean).join(" · "))}</span>` : ""}
        </div>
        <section aria-labelledby="runtime-heading">
          <h2 id="runtime-heading" class="visually-hidden">Watch time</h2>
          <div id="runtime">${runtimeHTML(item)}</div>
        </section>
        <div class="detail__actions">${addButtonHTML(item, isInDraft(item.id), { large: true })}</div>
      </div>
    </header>

    <section class="detail__section" aria-labelledby="synopsis-heading">
      <h2 id="synopsis-heading">Synopsis</h2>
      <p id="synopsis" class="synopsis synopsis--clamped">${escapeHtml(item.synopsis || "No synopsis available.")}</p>
      <button type="button" id="synopsis-toggle" class="btn btn--text" aria-expanded="false" aria-controls="synopsis" hidden>Read more</button>
    </section>

    ${trailerHTML(item)}
    ${genresHTML(item)}

    <section id="related" class="detail__section" aria-labelledby="related-heading" hidden>
      <h2 id="related-heading">Related titles</h2>
      <div id="related-body"></div>
    </section>`;

  el.detail.innerHTML = markup;
  el.detail.removeAttribute("aria-busy");
  document.title = `${item.title} | AniPlanner`;
  const description = document.querySelector('meta[name="description"]');
  if (description) description.content = item.synopsis ? truncate(item.synopsis) : DEFAULT_DESCRIPTION;

  updateSynopsisToggle();
  loadRelated(item.id);
}

/** Shows Read more only when the synopsis is actually cut off. */
function updateSynopsisToggle() {
  const text = document.getElementById("synopsis");
  const toggle = document.getElementById("synopsis-toggle");
  if (!text || !toggle) return;
  if (state.synopsisExpanded) {
    toggle.hidden = false;
    return;
  }
  toggle.hidden = text.scrollHeight <= text.clientHeight + 1;
}

/* ---------- Related titles ---------- */

function relatedCardHTML(item) {
  const title = escapeHtml(item.title);
  const media = item.image ? `<img src="${escapeHtml(item.image)}" alt="" width="200" height="300" loading="lazy" decoding="async">` : placeholderHTML();
  return `
    <li>
      <a class="related-card" href="anime.html?id=${item.id}">
        <span class="related-card__media">${media}</span>
        <span class="related-card__title">${title}</span>
      </a>
    </li>`;
}

function relatedSkeletonHTML() {
  const tile = `<li aria-hidden="true"><span class="related-card"><span class="skeleton skeleton--poster"></span><span class="skeleton skeleton--line" style="width:70%"></span></span></li>`;
  return `<ul class="related-grid">${tile.repeat(4)}</ul>`;
}

async function loadRelated(id) {
  const section = document.getElementById("related");
  const body = document.getElementById("related-body");
  if (!section || !body) return;

  state.relatedController?.abort();
  const controller = new AbortController();
  state.relatedController = controller;

  section.hidden = false;
  body.innerHTML = relatedSkeletonHTML();
  body.setAttribute("aria-busy", "true");

  try {
    const items = await api.getRecommendations(id, { limit: 4, signal: controller.signal });
    if (controller.signal.aborted) return;
    if (items.length === 0) {
      section.hidden = true;
      return;
    }
    body.innerHTML = `<ul class="related-grid">${items.map(relatedCardHTML).join("")}</ul>`;
  } catch (error) {
    if (error.kind === "aborted") return;
    body.innerHTML = bannerHTML({
      tone: "error",
      message: "We couldn't load related titles. The rest of the page still works.",
      actionLabel: "Try again",
      action: "retry-related",
    });
  } finally {
    body.removeAttribute("aria-busy");
  }
}

/* ---------- Main load ---------- */

async function load() {
  state.controller?.abort();
  state.relatedController?.abort();
  const controller = new AbortController();
  state.controller = controller;

  el.banners.innerHTML = "";
  el.empty.innerHTML = "";

  state.id = parseAnimeId(window.location.search);
  if (state.id === null) {
    showNotFound();
    return;
  }

  showSkeleton();
  try {
    const item = await api.getAnimeFull(state.id, { signal: controller.signal });
    if (controller.signal.aborted) return;
    if (!item) {
      showNotFound();
      return;
    }
    renderItem(item);
  } catch (error) {
    if (error.kind === "aborted") return;
    if (error.kind === "not-found") showNotFound();
    else showError(error);
  }
}

/* ---------- Events ---------- */

el.banners.addEventListener("click", (event) => {
  if (event.target.closest('[data-action="retry"]')) load();
});

el.empty.addEventListener("click", (event) => {
  if (event.target.closest('[data-action="retry"]')) load();
});

el.detail.addEventListener("click", (event) => {
  const target = event.target;

  const add = target.closest("[data-add]");
  if (add && state.item) {
    const result = togglePlan(state.item);
    if (!result.ok) {
      el.banners.innerHTML = bannerHTML({ tone: "error", message: "Couldn't save your plan. Storage may be full or blocked." });
    }
    return;
  }

  if (target.closest("#synopsis-toggle")) {
    const text = document.getElementById("synopsis");
    const toggle = document.getElementById("synopsis-toggle");
    state.synopsisExpanded = !state.synopsisExpanded;
    text.classList.toggle("synopsis--clamped", !state.synopsisExpanded);
    toggle.setAttribute("aria-expanded", String(state.synopsisExpanded));
    toggle.textContent = state.synopsisExpanded ? "Read less" : "Read more";
    return;
  }

  if (target.closest("#trailer-play") && state.item) {
    // Only build the player when asked, so the page loads quickly.
    const slot = document.getElementById("trailer-slot");
    const iframe = document.createElement("iframe");
    iframe.className = "trailer trailer--playing";
    iframe.src = state.item.trailerEmbedUrl;
    iframe.title = `Trailer for ${state.item.title}`;
    iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    iframe.setAttribute("allowfullscreen", "");
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    slot.replaceChildren(iframe);
    iframe.focus();
    return;
  }

  if (target.closest('[data-action="retry-related"]') && state.item) {
    loadRelated(state.item.id);
  }
});

// Keep the Add button and the evenings figure in step with the plan.
onChange(() => {
  if (!state.item) return;
  const button = el.detail.querySelector("[data-add]");
  if (button) {
    const inPlan = isInDraft(state.item.id);
    if (String(inPlan) !== button.dataset.inPlan) setAddButtonState(button, state.item, inPlan);
  }
  const runtime = document.getElementById("runtime");
  if (runtime) runtime.innerHTML = runtimeHTML(state.item);
});

// Fonts and window size can change how the synopsis wraps.
const recheckSynopsis = debounce(updateSynopsisToggle, 150);
window.addEventListener("resize", recheckSynopsis);
document.fonts?.ready.then(updateSynopsisToggle);

attachImageFallback(el.detail);
setBackLink();
load();
