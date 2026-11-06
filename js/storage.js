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

export function addToDraft(id) {
  const draft = getDraft();
  const numeric = Number(id);
  if (draft.titleIds.includes(numeric)) return { ok: true, already: true };
  return saveDraft({ ...draft, titleIds: [...draft.titleIds, numeric] });
}

export function removeFromDraft(id) {
  const draft = getDraft();
  return saveDraft({ ...draft, titleIds: draft.titleIds.filter((x) => x !== Number(id)) });
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
 * Saves the current draft as a named plan.
 * @param {string} name
 */
export function savePlan(name) {
  const draft = getDraft();
  const plan = {
    id: `plan-${Date.now()}`,
    name: name.trim() || `Plan ${listPlans().length + 1}`,
    titleIds: draft.titleIds,
    days: draft.days,
    hoursPerEvening: draft.hoursPerEvening,
    createdAt: new Date().toISOString(),
  };
  const result = write(PLANS_KEY, [plan, ...listPlans()]);
  return { ...result, plan };
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
