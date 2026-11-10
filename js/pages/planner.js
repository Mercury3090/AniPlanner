// Planner page. Shows the titles in the plan, lets the user pick their evenings and
// hours, and calculates total runtime, evenings needed and a finish date.
// The maths lives in planner-core.js; this file only reads the plan, fetches the
// titles, and draws the result.

import { api, describeError } from "../api.js";
import { addToDraft, findSavedPlan, getDraft, moveInDraft, onChange, removeFromDraft, saveDraft, savePlan, storageAvailable } from "../storage.js";
import {
  MAX_HOURS,
  MIN_HOURS,
  WEEK,
  buildSchedule,
  finishDateOf,
  formatHours,
  planTotals,
  stepHours,
  toggleDay,
} from "../planner-core.js";
import { escapeHtml, formatDate, formatMinutes, plural } from "../utils.js";
import { icon } from "../icons.js";
import { clearPlan, togglePlan } from "../plan-actions.js";
import { showToast } from "../layout.js";
import { attachImageFallback, bannerHTML, emptyStateHTML, placeholderHTML, runtimeLines } from "../ui.js";
import { countUp, exitItems, fillEvenings, makeSortable, revealCards } from "../animations.js";

const INITIAL_EVENINGS = 14;

const el = {
  banners: document.getElementById("banner-region"),
  dayChips: document.getElementById("day-chips"),
  daysHint: document.getElementById("days-hint"),
  hoursValue: document.getElementById("hours-value"),
  hoursDown: document.getElementById("hours-down"),
  hoursUp: document.getElementById("hours-up"),
  titlesHeading: document.getElementById("titles-heading"),
  list: document.getElementById("title-list"),
  empty: document.getElementById("empty-region"),
  addMore: document.getElementById("add-more"),
  clear: document.getElementById("clear-plan"),
  savedState: document.getElementById("saved-state"),
  saveName: document.getElementById("save-name"),
  summary: document.getElementById("summary"),
  announce: document.getElementById("summary-announce"),
  reorderAnnounce: document.getElementById("reorder-announce"),
  planName: document.getElementById("plan-name"),
  save: document.getElementById("save-plan"),
  scheduleSection: document.getElementById("schedule-section"),
  scheduleNote: document.getElementById("schedule-note"),
  schedule: document.getElementById("schedule"),
  scheduleToggle: document.getElementById("schedule-toggle"),
};

const state = {
  seenRows: new Set(), // title ids whose row has already animated in
  stopSorting: () => {}, // removes dragging from the list
  counts: { minutes: 0, evenings: 0 }, // what the summary last showed, so numbers count from there
  skipScheduleAnimation: false,
  summary: null, // totals from the latest render, saved with a plan
  items: new Map(), // id -> normalised title
  pending: new Set(), // ids being fetched
  failures: new Map(), // id -> ApiError
  showAllEvenings: false,
  ignoreNextChange: false,
  focusIndex: null,
};

/* ---------- Small helpers ---------- */

const lastHTML = new WeakMap();

/** Writes markup only when it changed, so screen readers aren't re-announcing and focus isn't lost. */
function setHTML(node, html) {
  if (lastHTML.get(node) === html) return false;
  node.innerHTML = html;
  lastHTML.set(node, html);
  return true;
}

/* ---------- Loading titles ---------- */

async function fetchTitle(id) {
  state.pending.add(id);
  state.failures.delete(id);
  render();
  try {
    state.items.set(id, await api.getAnime(id));
  } catch (error) {
    if (error.kind !== "aborted") state.failures.set(id, error);
  } finally {
    state.pending.delete(id);
    render();
  }
}

function ensureLoaded() {
  for (const id of getDraft().titleIds) {
    if (!state.items.has(id) && !state.pending.has(id) && !state.failures.has(id)) fetchTitle(id);
  }
}

/* ---------- Controls ---------- */

function renderControls() {
  el.dayChips.innerHTML = WEEK.map(
    ({ day, label, name }) => `<button type="button" class="chip" data-day="${day}" aria-pressed="false" aria-label="${name}">${label}</button>`
  ).join("");
}

function syncControls() {
  const draft = getDraft();
  for (const chip of el.dayChips.querySelectorAll(".chip")) {
    chip.setAttribute("aria-pressed", String(draft.days.includes(Number(chip.dataset.day))));
  }
  el.hoursValue.textContent = `${formatHours(draft.hoursPerEvening)} ${draft.hoursPerEvening === 1 ? "hour" : "hours"}`;
  el.hoursDown.disabled = draft.hoursPerEvening <= MIN_HOURS;
  el.hoursUp.disabled = draft.hoursPerEvening >= MAX_HOURS;
}

function setDaysHint(message) {
  el.daysHint.hidden = !message;
  el.daysHint.textContent = message;
}

el.dayChips.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-day]");
  if (!chip) return;
  const draft = getDraft();
  const result = toggleDay(draft.days, Number(chip.dataset.day));
  if (result.blocked) {
    setDaysHint("Choose at least one evening.");
    return;
  }
  setDaysHint("");
  saveDraft({ ...draft, days: result.days });
});

for (const button of [el.hoursDown, el.hoursUp]) {
  button.addEventListener("click", () => {
    const draft = getDraft();
    saveDraft({ ...draft, hoursPerEvening: stepHours(draft.hoursPerEvening, Number(button.dataset.step)) });
  });
}

/* ---------- Save area: "Save plan", or "Saved" once an identical plan exists ---------- */

function renderSaveArea(isEmpty) {
  if (el.save.getAttribute("aria-busy") === "true") return; // mid-save: leave the button alone
  const saved = isEmpty ? null : findSavedPlan();
  el.saveName.hidden = Boolean(saved);
  el.savedState.hidden = !saved;
  if (saved) {
    el.savedState.innerHTML = `${icon("circle-check")}<span>Saved as &ldquo;${escapeHtml(saved.name)}&rdquo;</span> <a href="saved.html">View saved plans</a>`;
    el.save.innerHTML = `${icon("check")}Saved`;
  } else {
    el.savedState.innerHTML = "";
    el.save.innerHTML = "Save plan";
  }
  const unavailable = isEmpty || Boolean(saved);
  el.save.disabled = unavailable;
  el.save.toggleAttribute("aria-disabled", unavailable);
}

/* ---------- Summary: numbers count up, and the result is announced once ---------- */

/** Counts the two numbers up from what the summary showed before. */
function animateSummary(next) {
  for (const dd of el.summary.querySelectorAll("[data-count]")) {
    const kind = dd.dataset.count;
    const key = kind === "minutes" ? "minutes" : "evenings";
    countUp(dd, state.counts[key], Number(dd.dataset.to), kind, { prefix: dd.dataset.prefix ?? "", suffix: dd.dataset.suffix ?? "" });
  }
  state.counts = next;
}

/**
 * Screen readers hear the finished result once, from a hidden message. The visible
 * numbers are not a live region, so counting up never reads out every step.
 */
function announceSummary(isEmpty) {
  if (isEmpty) {
    el.announce.textContent = "";
    return;
  }
  const values = [...el.summary.querySelectorAll(".summary__item")].map((item) => `${item.querySelector("dt").textContent} ${item.querySelector("dd").textContent}`);
  el.announce.textContent = `${values.join(". ")}.`;
}

/* ---------- Rendering ---------- */

function titleRowHTML(item, sort) {
  const { meta, total } = runtimeLines(item);
  const title = escapeHtml(item.title);
  const handle = sort
    ? `<button type="button" class="drag-handle" data-handle="${item.id}" aria-describedby="reorder-help" aria-label="Reorder ${title}, position ${sort.position} of ${sort.total}">${icon("grip")}</button>`
    : "";
  const media = item.image ? `<img src="${escapeHtml(item.image)}" alt="" width="56" height="84" loading="lazy" decoding="async">` : placeholderHTML();
  return `
    <li class="title-row${sort ? " title-row--sortable" : ""}" data-id="${item.id}">
      ${handle}
      <div class="title-row__media">${media}</div>
      <div class="title-row__body">
        <h3 class="title-row__title"><a href="anime.html?id=${item.id}">${title}</a></h3>
        <p class="title-row__meta">${escapeHtml(meta)}</p>
        <p class="title-row__total">${icon("clock")}<span><span class="visually-hidden">Runtime: </span>${escapeHtml(total)}</span></p>
      </div>
      <button type="button" class="icon-btn" data-remove="${item.id}" aria-label="Remove ${title} from plan">${icon("trash")}</button>
    </li>`;
}

function skeletonRowHTML() {
  return `
    <li class="title-row" aria-hidden="true">
      <div class="title-row__media"><span class="skeleton skeleton--poster" style="width:100%"></span></div>
      <div class="title-row__body">
        <span class="skeleton skeleton--line" style="width:60%"></span>
        <span class="skeleton skeleton--line" style="width:40%"></span>
        <span class="skeleton skeleton--line" style="width:30%"></span>
      </div>
    </li>`;
}

function failedRowHTML(id, error) {
  const gone = error.kind === "not-found";
  const message = gone ? "This title is no longer available." : describeError(error);
  const retry = gone ? "" : `<button type="button" class="btn btn--secondary btn--small" data-retry="${id}">Retry</button>`;
  return `
    <li class="title-row title-row--failed" data-id="${id}">
      <div class="title-row__body">
        <h3 class="title-row__title">${icon("alert")} Couldn't load title ${id}</h3>
        <p class="title-row__meta">${escapeHtml(message)}</p>
        <div class="cluster">${retry}</div>
      </div>
      <button type="button" class="icon-btn" data-remove="${id}" aria-label="Remove title ${id} from plan">${icon("trash")}</button>
    </li>`;
}

function summaryHTML({ totals, evenings, truncated, failedCount, pendingCount }) {
  const hasTotal = totals.totalMinutes > 0 && evenings.length > 0;
  const finish = finishDateOf(evenings);
  const approx = totals.hasEstimate ? "About " : "";
  const stats = [
    {
      label: "Total runtime",
      value: hasTotal ? `${approx}${formatMinutes(totals.totalMinutes)}` : "Not available yet",
      count: hasTotal ? `data-count="minutes" data-to="${totals.totalMinutes}" data-prefix="${approx}"` : "",
    },
    {
      label: "Evenings needed",
      value: hasTotal ? `${truncated ? `${evenings.length}+` : evenings.length}` : "Not available yet",
      count: hasTotal ? `data-count="number" data-to="${evenings.length}" data-suffix="${truncated ? "+" : ""}"` : "",
    },
    { label: "Finish date", value: hasTotal && finish && !truncated ? formatDate(finish) : "Not available yet", count: "" },
  ];
  const rows = stats.map((s) => `<div class="summary__item"><dt>${s.label}</dt><dd ${s.count}>${escapeHtml(s.value)}</dd></div>`).join("");

  const notes = [];
  if (pendingCount) notes.push(`Still loading ${plural(pendingCount, "title")}. The figures will update when they arrive.`);
  if (failedCount) notes.push(`${plural(failedCount, "title")} couldn't be loaded, so ${failedCount === 1 ? "it isn't" : "they aren't"} included yet.`);
  if (totals.ongoing.length) {
    notes.push(`${plural(totals.ongoing.length, "title")} ${totals.ongoing.length === 1 ? "is" : "are"} still airing, so ${totals.ongoing.length === 1 ? "it isn't" : "they aren't"} counted.`);
  }
  if (totals.hasEstimate) notes.push("Some titles have no listed episode length, so 24 minutes is assumed for each episode.");
  if (truncated) notes.push("This plan runs for more than a year, so the finish date isn't shown.");
  const noteHTML = notes.length ? `<ul class="summary__notes">${notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>` : "";
  return `<dl class="summary">${rows}</dl>${noteHTML}`;
}

function eveningHTML(evening, index, perEvening) {
  const percent = Math.min(100, Math.round((evening.minutes / perEvening) * 100));
  const what = evening.segments.map((s) => `${escapeHtml(s.title)} (${formatMinutes(s.minutes)})`).join(", ");
  return `
    <li class="evening">
      <div class="evening__head"><span class="evening__n">Evening ${index + 1}</span><span class="evening__date">${formatDate(evening.date)}</span></div>
      <div class="evening__bar" aria-hidden="true"><span class="evening__fill" style="width:${percent}%"></span></div>
      <p class="evening__time">${formatMinutes(evening.minutes)}</p>
      <p class="evening__what">${what}</p>
    </li>`;
}

function render() {
  const draft = getDraft();
  const ids = draft.titleIds;
  const isEmpty = ids.length === 0;
  // Reordering is offered once every title has loaded and there is more than one.
  const canSort = ids.length >= 2 && state.pending.size === 0 && ids.every((id) => state.items.has(id));

  syncControls();

  // Remember which button had focus, so a re-render doesn't drop it.
  const active = document.activeElement;
  const focusKey = active?.closest?.("#title-list")
    ? active.dataset.remove
      ? `[data-remove="${active.dataset.remove}"]`
      : active.dataset.retry
        ? `[data-retry="${active.dataset.retry}"]`
        : active.dataset.handle
          ? `[data-handle="${active.dataset.handle}"]`
          : null
    : null;

  // Titles
  const listChanged = setHTML(el.list, ids
    .map((id, index) => {
      if (state.items.has(id)) return titleRowHTML(state.items.get(id), canSort ? { position: index + 1, total: ids.length } : null);
      if (state.failures.has(id)) return failedRowHTML(id, state.failures.get(id));
      return skeletonRowHTML();
    })
    .join(""));
  if (listChanged) {
    // Rows that are new slide in; rows already seen (including after a reorder) do not replay.
    revealCards(el.list, state.seenRows, { item: ".title-row", id: (row) => row.dataset.id, scroll: false });
    // Dragging is rebuilt for the rows now on the page.
    state.stopSorting();
    state.stopSorting = canSort ? makeSortable(el.list, commitMove) : () => {};
    if (focusKey) el.list.querySelector(focusKey)?.focus();
  }
  el.list.setAttribute("aria-busy", String(state.pending.size > 0));
  el.addMore.hidden = isEmpty;
  setHTML(el.empty, isEmpty
    ? emptyStateHTML({
        iconName: "calendar-plus",
        title: "Your plan is empty",
        text: "Add a title to see how long it takes.",
        actionLabel: "Find anime",
        href: "discover.html",
      })
    : "");

  // Summary and schedule
  const loaded = ids.filter((id) => state.items.has(id)).map((id) => state.items.get(id));
  const totals = planTotals(loaded, draft.hoursPerEvening);
  const { evenings, truncated } = buildSchedule(totals.entries, totals.minutesPerEvening, draft.days, new Date());
  const failedCount = ids.filter((id) => state.failures.has(id)).length;
  const pendingCount = ids.filter((id) => !state.items.has(id) && !state.failures.has(id)).length;
  state.summary = {
    totalMinutes: totals.totalMinutes,
    titles: loaded.map((item) => ({ id: item.id, title: item.title, image: item.image })),
    ongoingCount: totals.ongoing.length,
    hasEstimate: totals.hasEstimate,
    partial: failedCount + pendingCount > 0,
  };

  const summaryChanged = setHTML(el.summary, isEmpty ? `<p class="muted">Your totals will appear here once you add a title.</p>` : summaryHTML({ totals, evenings, truncated, failedCount, pendingCount }));
  if (summaryChanged && pendingCount === 0) {
    announceSummary(isEmpty); // read the final numbers first, before anything starts counting
    animateSummary(totals.totalMinutes > 0 && evenings.length > 0 ? { minutes: totals.totalMinutes, evenings: evenings.length } : { minutes: 0, evenings: 0 });
  }
  renderSaveArea(isEmpty);

  const showSchedule = !isEmpty && evenings.length > 0;
  el.scheduleSection.hidden = !showSchedule;
  if (showSchedule) {
    const visible = state.showAllEvenings ? evenings : evenings.slice(0, INITIAL_EVENINGS);
    const scheduleChanged = setHTML(el.schedule, visible.map((e, i) => eveningHTML(e, i, totals.minutesPerEvening)).join(""));
    if (scheduleChanged && pendingCount === 0 && !state.skipScheduleAnimation) fillEvenings(el.schedule);
    state.skipScheduleAnimation = false;
    el.scheduleNote.textContent = `${plural(evenings.length, "evening")}${truncated ? " or more" : ""}, starting ${formatDate(evenings[0].date)}. Titles are watched in the order shown above.`;
    const more = evenings.length > INITIAL_EVENINGS;
    el.scheduleToggle.hidden = !more;
    el.scheduleToggle.setAttribute("aria-expanded", String(state.showAllEvenings));
    el.scheduleToggle.textContent = state.showAllEvenings ? "Show fewer evenings" : `Show all ${evenings.length} evenings`;
  }

  // Keep keyboard focus sensible after a title is removed.
  if (state.focusIndex !== null) {
    const buttons = el.list.querySelectorAll("[data-remove]");
    const target = buttons[Math.min(state.focusIndex, buttons.length - 1)];
    (target ?? el.titlesHeading).focus();
    state.focusIndex = null;
  }
}

/* ---------- Events ---------- */

el.list.addEventListener("click", (event) => {
  const remove = event.target.closest("[data-remove]");
  if (remove) {
    const id = Number(remove.dataset.remove);
    const row = remove.closest(".title-row");
    if (row.dataset.leaving) return; // already on its way out
    row.dataset.leaving = "1";
    state.focusIndex = [...el.list.querySelectorAll("[data-remove]")].indexOf(remove);
    const item = state.items.get(id);

    // The row eases out first, then the title is really removed.
    exitItems([row], () => {
      state.seenRows.delete(String(id)); // so Undo brings the row back with the entrance animation
      if (item) {
        if (!togglePlan(item).ok) state.focusIndex = null;
      } else {
        const result = removeFromDraft(id);
        if (!result.ok) state.focusIndex = null;
        else showToast("Removed from your plan", { tone: "removed", action: { label: "Undo", onClick: () => addToDraft(id, { index: result.index }) } });
      }
      if (row.isConnected) {
        // Nothing was removed (storage blocked): bring the row back.
        delete row.dataset.leaving;
        render();
        state.seenRows.add(String(id));
      }
    }, { x: 24, y: 0 });
    return;
  }

  const retry = event.target.closest("[data-retry]");
  if (retry) {
    fetchTitle(Number(retry.dataset.retry));
  }
});

/* ---------- Reordering: by dragging a handle, or with the arrow keys ---------- */

function announceMove(id, result) {
  const item = state.items.get(id);
  el.reorderAnnounce.textContent = item && result.moved ? `Moved ${item.title} to position ${result.to + 1} of ${getDraft().titleIds.length}.` : "";
}

/** Called when a drag ends in a new position. */
function commitMove(idText, toIndex) {
  const id = Number(idText);
  const result = moveInDraft(id, toIndex);
  if (!result.ok) {
    el.banners.innerHTML = bannerHTML({ tone: "error", message: "Couldn't change the order. Storage may be blocked." });
    return;
  }
  announceMove(id, result);
}

el.list.addEventListener("keydown", (event) => {
  const handle = event.target.closest("[data-handle]");
  if (!handle) return;
  const keys = { ArrowUp: -1, ArrowDown: 1, Home: -Infinity, End: Infinity };
  if (!(event.key in keys)) return;
  event.preventDefault();

  const id = Number(handle.dataset.handle);
  const ids = getDraft().titleIds;
  const from = ids.indexOf(id);
  const step = keys[event.key];
  const to = Number.isFinite(step) ? from + step : step < 0 ? 0 : ids.length - 1;
  const result = moveInDraft(id, to);
  if (!result.ok) {
    el.banners.innerHTML = bannerHTML({ tone: "error", message: "Couldn't change the order. Storage may be blocked." });
    return;
  }
  announceMove(id, result); // the list redraws and focus returns to this title's handle
});

el.scheduleToggle.addEventListener("click", () => {
  state.showAllEvenings = !state.showAllEvenings;
  state.skipScheduleAnimation = true; // expanding the list is not a change to the plan
  render();
});

el.save.addEventListener("click", () => {
  if (el.save.disabled || el.save.getAttribute("aria-busy") === "true") return;
  el.save.setAttribute("aria-busy", "true");
  el.save.innerHTML = `${icon("loader", { className: "icon--spin" })}Saving`;

  // A short pause so the user sees the save happen.
  window.setTimeout(() => {
    state.ignoreNextChange = true;
    const result = savePlan(el.planName.value, state.summary);
    state.ignoreNextChange = false;
    el.save.removeAttribute("aria-busy");
    if (!result.ok) {
      renderSaveArea(false);
      el.banners.innerHTML = bannerHTML({ tone: "error", message: "Couldn't save. Storage may be full or blocked." });
      return;
    }
    el.planName.value = "";
    renderSaveArea(false); // now shows "Saved" with the plan's name
    el.banners.innerHTML = bannerHTML({
      tone: "success",
      message: `Plan saved as "${result.plan.name}".`,
      actionLabel: "View saved plans",
      href: "saved.html",
    });
    showToast("Plan saved");
  }, 350);
});

el.clear.addEventListener("click", () => {
  state.focusIndex = 0; // lands on the heading once the list is empty
  const rows = el.list.querySelectorAll(".title-row");
  exitItems(rows, () => {
    state.seenRows.clear();
    const result = clearPlan();
    if (!result.ok) {
      state.focusIndex = null;
      render();
      el.banners.innerHTML = bannerHTML({ tone: "error", message: "Couldn't clear the plan. Storage may be blocked." });
    }
  }, { x: 24, y: 0 });
});

// Any change to the plan (here, on another page, or in another tab) refreshes the page.
onChange(() => {
  if (state.ignoreNextChange) {
    state.ignoreNextChange = false;
    return;
  }
  el.banners.querySelector(".banner--success")?.remove();
  ensureLoaded();
  render();
});

attachImageFallback(el.list);

/* ---------- Start ---------- */

if (!storageAvailable()) {
  el.banners.innerHTML = bannerHTML({
    tone: "warning",
    message: "Your browser is blocking storage, so your plan can't be kept between pages.",
  });
}
renderControls();
render();
ensureLoaded();
