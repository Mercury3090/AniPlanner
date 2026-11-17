//everything that saves to localStorage. every read and write is in a try/catch because
//storage can be blocked (private mode) or full. failures return { ok: false } instead of crashing.

import { moveItem } from "./planner-core.js";

const DRAFT_KEY = "wnp:draft";
const PLANS_KEY = "wnp:plans";
const CHANGE_EVENT = "wnp:change";

const DEFAULT_DRAFT = { titleIds: [], days: [1, 3, 5], hoursPerEvening: 2 };

//read from localStorage, or use the fallback
function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

//save to localStorage and tell the pages something changed
function write(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

//test if localStorage works by writing and removing a key
export function storageAvailable() {
  try {
    const probe = "wnp:probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

//run a function when the plan changes (also in other tabs). Returns a way to stop
export function onChange(handler) {
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

/*--- Draft plan (what is currently in the Planner) --- */

//the plan you're building right now (bad or missing values fall back to the defaults)
export function getDraft() {
  const stored = read(DRAFT_KEY, DEFAULT_DRAFT);
  return {
    titleIds: Array.isArray(stored.titleIds) ? stored.titleIds : [],
    days: Array.isArray(stored.days) && stored.days.length ? stored.days : DEFAULT_DRAFT.days,
    hoursPerEvening: Number(stored.hoursPerEvening) > 0 ? Number(stored.hoursPerEvening) : DEFAULT_DRAFT.hoursPerEvening,
  };
}

//save the plan you're building
export function saveDraft(draft) {
  return write(DRAFT_KEY, draft);
}

//is this title in the plan?
export function isInDraft(id) {
  return getDraft().titleIds.includes(Number(id));
}

//add a title to the plan. index puts it back in a set spot, which is how Undo works
export function addToDraft(id, { index } = {}) {
  const draft = getDraft();
  const numeric = Number(id);
  if (draft.titleIds.includes(numeric)) return { ok: true, already: true };
  const ids = [...draft.titleIds];
  const at = Number.isInteger(index) && index >= 0 && index <= ids.length ? index : ids.length;
  ids.splice(at, 0, numeric);
  return saveDraft({ ...draft, titleIds: ids });
}

//remove a title and return where it was, so Undo can put it back
export function removeFromDraft(id) {
  const draft = getDraft();
  const numeric = Number(id);
  const index = draft.titleIds.indexOf(numeric);
  const result = saveDraft({ ...draft, titleIds: draft.titleIds.filter((x) => x !== numeric) });
  return { ...result, index };
}

//move a title to a new spot in the plan (changes the watch order)
export function moveInDraft(id, toIndex) {
  const draft = getDraft();
  const from = draft.titleIds.indexOf(Number(id));
  if (from === -1) return { ok: true, moved: false };
  const to = Math.min(Math.max(Number(toIndex), 0), draft.titleIds.length - 1);
  if (!Number.isInteger(to) || to === from) return { ok: true, moved: false, from, to: from };
  const result = saveDraft({ ...draft, titleIds: moveItem(draft.titleIds, from, to) });
  return { ...result, moved: result.ok, from, to };
}

//remove every title, keep the days and hours
export function clearDraft() {
  return saveDraft({ ...getDraft(), titleIds: [] });
}

/* --- Saved plans --- */

//all saved plans
export function listPlans() {
  const plans = read(PLANS_KEY, []);
  return Array.isArray(plans) ? plans : [];
}

//only keep what the Saved page needs and check the types, so a saved plan can't carry
//weird data into the page (max 50 titles, https images only)
function cleanSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const titles = Array.isArray(snapshot.titles)
    ? snapshot.titles
        .slice(0, 50)
        .map((t) => ({
          id: Number(t?.id),
          title: String(t?.title ?? "").slice(0, 160),
          image: typeof t?.image === "string" && t.image.startsWith("https://") ? t.image : null,
        }))
        .filter((t) => Number.isFinite(t.id))
    : [];
  return {
    totalMinutes: Math.max(0, Math.round(Number(snapshot.totalMinutes) || 0)),
    titles,
    ongoingCount: Math.max(0, Math.round(Number(snapshot.ongoingCount) || 0)),
    hasEstimate: Boolean(snapshot.hasEstimate),
    partial: Boolean(snapshot.partial),
  };
}

//save the current plan with a name. the snapshot keeps the totals and posters,
//so the Saved page can show them without calling the API
export function savePlan(name, snapshot) {
  const draft = getDraft();
  const plan = {
    id: `plan-${Date.now()}`,
    name: String(name ?? "").trim() || `Plan ${listPlans().length + 1}`,
    titleIds: draft.titleIds,
    days: draft.days,
    hoursPerEvening: draft.hoursPerEvening,
    createdAt: new Date().toISOString(),
    snapshot: cleanSnapshot(snapshot),
  };
  const result = write(PLANS_KEY, [plan, ...listPlans()]);
  return { ...result, plan };
}

//find a saved plan that's exactly the same as the current one (titles, order, days, hours).
//used to show "Saved" on the Planner
export function findSavedPlan(draft = getDraft()) {
  if (draft.titleIds.length === 0) return null;
  const days = [...draft.days].sort((a, b) => a - b);
  return (
    listPlans().find(
      (p) =>
        Array.isArray(p.titleIds) &&
        p.titleIds.length === draft.titleIds.length &&
        p.titleIds.every((id, i) => id === draft.titleIds[i]) &&
        Array.isArray(p.days) &&
        p.days.length === days.length &&
        [...p.days].sort((a, b) => a - b).every((d, i) => d === days[i]) &&
        Number(p.hoursPerEvening) === draft.hoursPerEvening
    ) ?? null
  );
}

//true if the current plan has titles and no saved plan has the same titles in the same order
export function hasUnsavedDraft() {
  const ids = getDraft().titleIds;
  if (ids.length === 0) return false;
  return !listPlans().some((p) => Array.isArray(p.titleIds) && p.titleIds.length === ids.length && p.titleIds.every((id, i) => id === ids[i]));
}

//delete a saved plan (returns it so Undo works)
export function deletePlan(id) {
  const plans = listPlans();
  const removed = plans.find((p) => p.id === id);
  const result = write(
    PLANS_KEY,
    plans.filter((p) => p.id !== id)
  );
  return { ...result, removed };
}

//put a deleted plan back in its place (for Undo)
export function restorePlan(plan) {
  if (!plan) return { ok: false };
  const plans = listPlans().filter((p) => p.id !== plan.id);
  return write(PLANS_KEY, [plan, ...plans].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

//open a saved plan in the Planner
export function loadPlanIntoDraft(id) {
  const plan = listPlans().find((p) => p.id === id);
  if (!plan) return { ok: false };
  return saveDraft({ titleIds: plan.titleIds, days: plan.days, hoursPerEvening: plan.hoursPerEvening });
}
