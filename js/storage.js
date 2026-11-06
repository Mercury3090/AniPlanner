// localStorage layer. Every read and write is wrapped, because storage can be
// blocked (private mode) or full. Failures return { ok: false } and never throw.

const DRAFT_KEY = "wnp:draft";
const PLANS_KEY = "wnp:plans";
const CHANGE_EVENT = "wnp:change";

const DEFAULT_DRAFT = { titleIds: [], days: [1, 3, 5], hoursPerEvening: 2 };

function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

/** True when localStorage can be written to. */
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

export function onChange(handler) {
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

/* ---------- Draft plan (what is currently in the Planner) ---------- */

export function getDraft() {
  const stored = read(DRAFT_KEY, DEFAULT_DRAFT);
  return {
    titleIds: Array.isArray(stored.titleIds) ? stored.titleIds : [],
    days: Array.isArray(stored.days) && stored.days.length ? stored.days : DEFAULT_DRAFT.days,
    hoursPerEvening: Number(stored.hoursPerEvening) > 0 ? Number(stored.hoursPerEvening) : DEFAULT_DRAFT.hoursPerEvening,
  };
}

export function saveDraft(draft) {
  return write(DRAFT_KEY, draft);
}

export function isInDraft(id) {
  return getDraft().titleIds.includes(Number(id));
}

/**
 * Adds a title to the plan. Pass { index } to put it back at a specific position,
 * which is how Undo restores a removed title to where it was.
 */
export function addToDraft(id, { index } = {}) {
  const draft = getDraft();
  const numeric = Number(id);
  if (draft.titleIds.includes(numeric)) return { ok: true, already: true };
  const ids = [...draft.titleIds];
  const at = Number.isInteger(index) && index >= 0 && index <= ids.length ? index : ids.length;
  ids.splice(at, 0, numeric);
  return saveDraft({ ...draft, titleIds: ids });
}

/** Removes a title and reports the position it had, so Undo can put it back. */
export function removeFromDraft(id) {
  const draft = getDraft();
  const numeric = Number(id);
  const index = draft.titleIds.indexOf(numeric);
  const result = saveDraft({ ...draft, titleIds: draft.titleIds.filter((x) => x !== numeric) });
  return { ...result, index };
}

export function clearDraft() {
  return saveDraft({ ...getDraft(), titleIds: [] });
}

/* ---------- Saved plans ---------- */

export function listPlans() {
  const plans = read(PLANS_KEY, []);
  return Array.isArray(plans) ? plans : [];
}

/**
 * Keeps only the fields the Saved plans page needs, and checks their types, so a
 * plan can never carry odd data into the page.
 * @param {unknown} snapshot
 */
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

/**
 * Saves the current draft as a named plan. The optional snapshot holds the totals
 * and poster images known at save time, so Saved plans can show them instantly
 * without asking the API again.
 * @param {string} name
 * @param {{totalMinutes?: number, titles?: {id: number, title: string, image: string | null}[], ongoingCount?: number, hasEstimate?: boolean, partial?: boolean}} [snapshot]
 */
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

/**
 * The saved plan that is identical to the current draft (same titles in the same
 * order, same evenings, same hours), or null. Used to show "Saved" on the Planner.
 */
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

/** True when the plan being edited has titles and matches no saved plan. */
export function hasUnsavedDraft() {
  const ids = getDraft().titleIds;
  if (ids.length === 0) return false;
  return !listPlans().some((p) => Array.isArray(p.titleIds) && p.titleIds.length === ids.length && p.titleIds.every((id, i) => id === ids[i]));
}

export function deletePlan(id) {
  const plans = listPlans();
  const removed = plans.find((p) => p.id === id);
  const result = write(
    PLANS_KEY,
    plans.filter((p) => p.id !== id)
  );
  return { ...result, removed };
}

/** Puts a deleted plan back (used by the Undo toast). */
export function restorePlan(plan) {
  if (!plan) return { ok: false };
  const plans = listPlans().filter((p) => p.id !== plan.id);
  return write(PLANS_KEY, [plan, ...plans].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

/** Loads a saved plan into the draft so it can be edited in the Planner. */
export function loadPlanIntoDraft(id) {
  const plan = listPlans().find((p) => p.id === id);
  if (!plan) return { ok: false };
  return saveDraft({ titleIds: plan.titleIds, days: plan.days, hoursPerEvening: plan.hoursPerEvening });
}