// Turns a saved plan into the text shown on its card. Pure functions, no DOM.
// The finish date is recalculated from today every time, so it never goes stale.

import { WEEK, buildSchedule, finishDateOf, formatHours } from "./planner-core.js";
import { formatDate, formatMinutes, plural } from "./utils.js";

/** "Mon, Wed, Fri", "Every day", or a fallback. Always listed Monday to Sunday. */
export function describeDays(days) {
  const chosen = new Set(Array.isArray(days) ? days : []);
  const picked = WEEK.filter((d) => chosen.has(d.day));
  if (picked.length === 7) return "Every day";
  return picked.length ? picked.map((d) => d.label).join(", ") : "No evenings chosen";
}

/**
 * @param {{titleIds?: number[], days?: number[], hoursPerEvening?: number, createdAt?: string, snapshot?: object | null}} plan
 * @param {Date} [today]
 */
export function describePlan(plan, today = new Date()) {
  const snapshot = plan.snapshot ?? null;
  const titleCount = Array.isArray(plan.titleIds) ? plan.titleIds.length : 0;
  const hours = Number(plan.hoursPerEvening) > 0 ? Number(plan.hoursPerEvening) : 2;
  const created = new Date(plan.createdAt);

  const result = {
    titleCount,
    titleLabel: plural(titleCount, "title"),
    days: describeDays(plan.days),
    hoursLabel: `${formatHours(hours)}h per evening`,
    saved: Number.isNaN(created.getTime()) ? "" : formatDate(created),
    total: null,
    evenings: null,
    finish: null,
    notes: [],
  };

  // Plans saved before snapshots existed have no totals to show.
  if (!snapshot) {
    result.notes.push("Open this plan to see its runtime.");
    return result;
  }

  if (snapshot.totalMinutes > 0) {
    const entries = [{ counted: true, minutes: snapshot.totalMinutes, item: { id: 0, title: "" } }];
    const { evenings, truncated } = buildSchedule(entries, Math.round(hours * 60), plan.days ?? [], today);
    result.total = `${snapshot.hasEstimate ? "About " : ""}${formatMinutes(snapshot.totalMinutes)}`;
    if (evenings.length) {
      result.evenings = truncated ? `${evenings.length}+` : String(evenings.length);
      const finish = finishDateOf(evenings);
      result.finish = finish && !truncated ? formatDate(finish) : null;
    }
  }

  if (snapshot.ongoingCount) {
    result.notes.push(`${plural(snapshot.ongoingCount, "title")} still airing, not counted.`);
  }
  if (snapshot.partial) {
    result.notes.push("Some titles hadn't loaded when this plan was saved, so the total may be incomplete.");
  }
  return result;
}