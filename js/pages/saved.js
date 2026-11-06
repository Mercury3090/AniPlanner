// Saved plans page. Reads plans from localStorage (no API calls), shows a card for
// each one, and lets the user open, delete (with Undo) or start a new plan.

import { clearDraft, deletePlan, getDraft, hasUnsavedDraft, listPlans, loadPlanIntoDraft, onChange, restorePlan, storageAvailable } from "../storage.js";
import { describePlan } from "../saved-model.js";
import { escapeHtml, plural } from "../utils.js";
import { icon } from "../icons.js";
import { showToast } from "../layout.js";
import { attachImageFallback, bannerHTML, emptyStateHTML } from "../ui.js";

const el = {
  heading: document.getElementById("saved-heading"),
  banners: document.getElementById("banner-region"),
  plans: document.getElementById("plans"),
  empty: document.getElementById("empty-region"),
  newPlan: document.getElementById("new-plan"),
  dialog: document.getElementById("new-plan-dialog"),
  dialogText: document.getElementById("dialog-text"),
};

let focusIndex = null;

/* ---------- Rendering ---------- */

function posterHTML(title) {
  return `<span class="plan-card__poster"><img src="${escapeHtml(title.image)}" alt="" width="48" height="72" loading="lazy" decoding="async"></span>`;
}

function statHTML(label, value) {
  return `<div class="plan-card__stat"><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function planCardHTML(plan) {
  const d = describePlan(plan);
  const name = escapeHtml(plan.name);
  const posters = (plan.snapshot?.titles ?? [])
    .filter((t) => t.image)
    .slice(0, 3)
    .map(posterHTML)
    .join("");

  const stats = [statHTML("Titles", String(d.titleCount))];
  if (d.total) stats.push(statHTML("Total runtime", d.total));
  if (d.finish) stats.push(statHTML("Finish date", d.finish));
  else if (d.total) stats.push(statHTML("Finish date", "Not available yet"));

  const notes = d.notes.map((n) => `<p class="plan-card__note">${escapeHtml(n)}</p>`).join("");
  const savedOn = d.saved ? `Saved ${d.saved} · ` : "";

  return `
    <li>
      <article class="plan-card" data-id="${escapeHtml(plan.id)}">
        <h2 class="plan-card__title">${name}</h2>
        ${posters ? `<div class="plan-card__posters">${posters}</div>` : ""}
        <dl class="plan-card__stats">${stats.join("")}</dl>
        ${notes}
        <p class="plan-card__meta">${escapeHtml(savedOn)}${escapeHtml(d.days)} · ${escapeHtml(d.hoursLabel)}</p>
        <div class="plan-card__actions">
          <button type="button" class="btn btn--primary btn--small" data-open-plan="${escapeHtml(plan.id)}" aria-label="Open ${name}">Open</button>
          <button type="button" class="btn btn--quiet btn--small" data-delete="${escapeHtml(plan.id)}" aria-label="Delete ${name}">${icon("trash")}Delete</button>
        </div>
      </article>
    </li>`;
}

function newPlanCardHTML() {
  return `<li><button type="button" class="plan-card plan-card--new" data-new>${icon("plus")}<span>Create a plan</span></button></li>`;
}

function render() {
  const plans = listPlans();
  el.plans.innerHTML = plans.length ? plans.map(planCardHTML).join("") + newPlanCardHTML() : "";
  el.empty.innerHTML = plans.length
    ? ""
    : emptyStateHTML({
        iconName: "bookmark",
        title: "No saved plans yet",
        text: "Pick a few titles and save your first plan.",
        actionLabel: "Find anime",
        href: "discover.html",
      });

  if (focusIndex !== null) {
    const buttons = el.plans.querySelectorAll("[data-delete]");
    (buttons[Math.min(focusIndex, buttons.length - 1)] ?? el.heading).focus();
    focusIndex = null;
  }
}

/* ---------- Starting a new plan ---------- */

function goToNewPlan() {
  clearDraft();
  window.location.href = "planner.html";
}

function startNewPlan() {
  // Only ask when the current plan would be lost: it has titles and matches no saved plan.
  if (!hasUnsavedDraft()) {
    goToNewPlan();
    return;
  }
  const count = getDraft().titleIds.length;
  if (typeof el.dialog.showModal !== "function") {
    if (window.confirm(`Your current plan (${plural(count, "title")}) hasn't been saved. Start a new plan anyway?`)) goToNewPlan();
    return;
  }
  el.dialogText.textContent = `Your current plan has ${plural(count, "title")} and hasn't been saved. Starting a new plan will clear it.`;
  el.dialog.returnValue = "";
  el.dialog.showModal();
}

el.newPlan.addEventListener("click", startNewPlan);
el.dialog.addEventListener("close", () => {
  if (el.dialog.returnValue === "confirm") goToNewPlan();
});
// Clicking the dark area outside the dialog closes it, like Escape.
el.dialog.addEventListener("click", (event) => {
  if (event.target === el.dialog) el.dialog.close("cancel");
});

/* ---------- Events ---------- */

el.plans.addEventListener("click", (event) => {
  if (event.target.closest("[data-new]")) {
    startNewPlan();
    return;
  }

  const open = event.target.closest("[data-open-plan]");
  if (open) {
    const result = loadPlanIntoDraft(open.dataset.openPlan);
    if (result.ok) window.location.href = "planner.html";
    else el.banners.innerHTML = bannerHTML({ tone: "error", message: "Couldn't open that plan. Storage may be blocked." });
    return;
  }

  const remove = event.target.closest("[data-delete]");
  if (remove) {
    focusIndex = [...el.plans.querySelectorAll("[data-delete]")].indexOf(remove);
    const result = deletePlan(remove.dataset.delete);
    if (!result.ok || !result.removed) {
      focusIndex = null;
      el.banners.innerHTML = bannerHTML({ tone: "error", message: "Couldn't delete that plan. Storage may be blocked." });
      return;
    }
    const { removed } = result;
    showToast(`Deleted "${removed.name}"`, {
      tone: "removed",
      duration: 5000,
      action: { label: "Undo", onClick: () => restorePlan(removed) },
    });
  }
});

// Changes from this page, or from another tab, refresh the list.
onChange(render);
attachImageFallback(el.plans);

/* ---------- Start ---------- */

if (!storageAvailable()) {
  el.banners.innerHTML = bannerHTML({
    tone: "warning",
    message: "Your browser is blocking storage, so saved plans can't be shown or kept.",
  });
}
render();
