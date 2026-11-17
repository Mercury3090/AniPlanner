//builds the HTML for the shared parts (cards, buttons, banners, empty states).
//everything from the API goes through escapeHtml first so it can't inject HTML.

import { icon } from "./icons.js";
import { illustration, illustrationFor } from "./illustrations.js";
import { escapeHtml, formatMinutes } from "./utils.js";
import { runtimeOf } from "./planner-core.js";
import { popIcon } from "./animations.js";

//Airing / Finished / Upcoming badge. always an icon or dot plus text, never just colour
export function statusBadgeHTML(item) {
  switch (item.status) {
    case "Currently Airing":
      return `<span class="badge badge--airing"><span class="badge__dot" aria-hidden="true"></span>Airing</span>`;
    case "Finished Airing":
      return `<span class="badge">${icon("check")}Finished</span>`;
    case "Not yet aired":
      return `<span class="badge badge--upcoming">${icon("calendar")}Upcoming</span>`;
    default:
      return "";
  }
}

//the two runtime lines on a card: episodes x minutes, and the total
export function runtimeLines(item) {
  const r = runtimeOf(item);
  const isMovie = String(item.type ?? "").toLowerCase() === "movie";

  if (!r.counted) {
    const detail = r.minutesPerEpisode ? `${r.minutesPerEpisode} min per episode` : "Length per episode unknown";
    const note = item.status === "Not yet aired" ? "Not aired yet" : "Ongoing, no total yet";
    return { meta: detail, total: note, counted: false };
  }
  if (isMovie) {
    return { meta: "Movie", total: formatMinutes(r.minutes), counted: true };
  }
  const eps = `${r.episodes} ${r.episodes === 1 ? "episode" : "episodes"}`;
  const mins = `${r.minutesPerEpisode} min${r.estimated ? " (estimated)" : ""}`;
  return { meta: `${eps} · ${mins}`, total: `${r.estimated ? "About " : ""}${formatMinutes(r.minutes)}`, counted: true };
}

//Add to plan / Added button. small and full width on cards, large: true for the detail page
export function addButtonHTML(item, inPlan, { large = false } = {}) {
  const title = escapeHtml(item.title);
  const size = large ? "" : " btn--small btn--block";
  const data = `data-add="${item.id}" data-in-plan="${inPlan}" data-large="${large}"`;
  return inPlan
    ? `<button type="button" class="btn btn--secondary${size}" ${data} aria-label="Remove ${title} from plan">${icon("check")}Added</button>`
    : `<button type="button" class="btn btn--primary${size}" ${data} aria-label="Add ${title} to plan">${icon("plus")}Add to plan</button>`;
}

//switch an Add button between Add and Added without replacing it, so focus stays on it
export function setAddButtonState(button, item, inPlan) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = addButtonHTML(item, inPlan, { large: button.dataset.large === "true" });
  const fresh = wrapper.firstElementChild;
  button.className = fresh.className;
  button.innerHTML = fresh.innerHTML;
  button.setAttribute("aria-label", fresh.getAttribute("aria-label"));
  button.dataset.inPlan = String(inPlan);
  popIcon(button);
}

//anime card. the title link stretches over the whole card so you can click anywhere, and the Add button sits on top so it still works on its own
export function animeCardHTML(item, { inPlan = false, headingLevel = 3 } = {}) {
  const title = escapeHtml(item.title);
  const { meta, total, counted } = runtimeLines(item);
  const media = item.image
    ? `<img src="${escapeHtml(item.image)}" alt="Poster for ${title}" width="200" height="300" loading="lazy" decoding="async">`
    : placeholderHTML();
  return `
    <li class="card-grid__item">
      <article class="card" data-id="${item.id}">
        <div class="card__media">${media}</div>
        <div class="card__body">
          <h${headingLevel} class="card__title"><a href="anime.html?id=${item.id}">${title}</a></h${headingLevel}>
          <p class="card__meta">${escapeHtml(meta)}</p>
          <p class="card__runtime${counted ? "" : " card__runtime--none"}">${icon("clock")}<span><span class="visually-hidden">Total runtime: </span>${escapeHtml(total)}</span></p>
          <div>${statusBadgeHTML(item)}</div>
        </div>
        <div class="card__actions">${addButtonHTML(item, inPlan)}</div>
      </article>
    </li>`;
}

//icon for when there's no poster
export function placeholderHTML() {
  return `<span class="card__placeholder">${icon("image")}<span class="visually-hidden">No poster available</span></span>`;
}

//swap broken posters for the placeholder. true = capture, because image errors don't bubble
export function attachImageFallback(root) {
  root.addEventListener(
    "error",
    (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement)) return;
      const holder = img.closest(".card__media, .detail__poster, .related-card__media, .plan-card__poster");
      if (holder) holder.innerHTML = placeholderHTML();
    },
    true
  );
}

//fake loading cards
export function skeletonCardsHTML(count = 8) {
  const card = `
    <li class="card-grid__item" aria-hidden="true">
      <div class="card">
        <span class="skeleton skeleton--poster"></span>
        <div class="card__body">
          <span class="skeleton skeleton--line" style="width:80%"></span>
          <span class="skeleton skeleton--line" style="width:55%"></span>
          <span class="skeleton skeleton--line" style="width:40%"></span>
        </div>
        <div class="card__actions"><span class="skeleton" style="height:44px;border-radius:var(--radius-control)"></span></div>
      </div>
    </li>`;
  return card.repeat(count);
}

//message banner (error, warning or success) with an optional button or link.
//errors use role="alert" so screen readers say them straight away, the rest use role="status"
export function bannerHTML({ tone, message, actionLabel, action = "retry", href }) {
  const iconName = tone === "success" ? "circle-check" : tone === "warning" ? "clock" : "alert";
  const role = tone === "error" ? "alert" : "status";
  let button = "";
  if (actionLabel && href) {
    button = `<a class="btn btn--secondary btn--small" href="${escapeHtml(href)}">${escapeHtml(actionLabel)}</a>`;
  } else if (actionLabel) {
    button = `<button type="button" class="btn btn--secondary btn--small" data-action="${action}">${escapeHtml(actionLabel)}</button>`;
  }
  return `<div class="banner banner--${tone}" role="${role}">${icon(iconName)}<p class="banner__text">${escapeHtml(message)}</p>${button}</div>`;
}

//empty-state box: picture, heading, text and an optional button
export function emptyStateHTML({ iconName = "search", title, text, actionLabel, action = "clear", href, headingLevel = 2 }) {
  const button = actionLabel
    ? href
      ? `<a class="btn btn--primary" href="${href}">${escapeHtml(actionLabel)}</a>`
      : `<button type="button" class="btn btn--primary" data-action="${action}">${escapeHtml(actionLabel)}</button>`
    : "";
  const h = `h${headingLevel}`;
  const picture = illustration(illustrationFor(iconName) ?? "") || icon(iconName);
  return `<div class="empty-state">${picture}<${h}>${escapeHtml(title)}</${h}><p>${escapeHtml(text)}</p>${button}</div>`;
}
