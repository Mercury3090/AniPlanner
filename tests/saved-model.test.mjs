import { test } from "node:test";
import assert from "node:assert/strict";
import { describeDays, describePlan } from "../js/saved-model.js";

const TODAY = new Date(2026, 9, 14); // Wednesday 14 October 2026
const snap = (over = {}) => ({ totalMinutes: 1296, titles: [], ongoingCount: 0, hasEstimate: false, partial: false, ...over });
const plan = (over = {}) => ({ id: "p1", name: "Plan", titleIds: [1, 2], days: [1, 3, 5], hoursPerEvening: 2, createdAt: "2026-10-10T08:00:00.000Z", snapshot: snap(), ...over });

test("days are listed Monday to Sunday", () => {
  assert.equal(describeDays([5, 1, 3]), "Mon, Wed, Fri");
  assert.equal(describeDays([0, 6]), "Sat, Sun");
  assert.equal(describeDays([0, 1, 2, 3, 4, 5, 6]), "Every day");
  assert.equal(describeDays([]), "No evenings chosen");
  assert.equal(describeDays(undefined), "No evenings chosen");
  assert.equal(describeDays([9, 3]), "Wed");
});

test("a normal plan shows totals and a finish date recalculated from today", () => {
  const d = describePlan(plan(), TODAY);
  assert.equal(d.titleLabel, "2 titles");
  assert.equal(d.total, "21h 36m");
  assert.equal(d.evenings, "11");
  assert.equal(d.finish, "Fri 6 Nov");
  assert.equal(d.days, "Mon, Wed, Fri");
  assert.equal(d.hoursLabel, "2h per evening");
  assert.deepEqual(d.notes, []);
});

test("the finish date moves with today's date, so it never goes stale", () => {
  assert.equal(describePlan(plan(), new Date(2026, 9, 21)).finish, "Fri 13 Nov");
  assert.equal(describePlan(plan(), new Date(2026, 10, 2)).finish, "Wed 25 Nov");
  assert.equal(describePlan(plan(), new Date(2026, 9, 21)).evenings, "11");
});

test("hours and days change the result", () => {
  assert.equal(describePlan(plan({ hoursPerEvening: 3 }), TODAY).evenings, "8");
  assert.equal(describePlan(plan({ hoursPerEvening: 3 }), TODAY).finish, "Fri 30 Oct");
  assert.equal(describePlan(plan({ hoursPerEvening: 1.5 }), TODAY).hoursLabel, "1.5h per evening");
  assert.equal(describePlan(plan({ days: [3] }), TODAY).finish, "Wed 23 Dec");
});

test("singular title and estimates", () => {
  assert.equal(describePlan(plan({ titleIds: [1] }), TODAY).titleLabel, "1 title");
  assert.equal(describePlan(plan({ snapshot: snap({ hasEstimate: true }) }), TODAY).total, "About 21h 36m");
});

test("plans saved before snapshots existed explain themselves", () => {
  const d = describePlan(plan({ snapshot: undefined }), TODAY);
  assert.equal(d.total, null);
  assert.equal(d.finish, null);
  assert.deepEqual(d.notes, ["Open this plan to see its runtime."]);
  assert.equal(describePlan(plan({ snapshot: null }), TODAY).titleLabel, "2 titles");
});

test("ongoing and partial plans carry honest notes", () => {
  const d = describePlan(plan({ snapshot: snap({ ongoingCount: 2, partial: true }) }), TODAY);
  assert.equal(d.notes.length, 2);
  assert.match(d.notes[0], /2 titles still airing, not counted/);
  assert.match(d.notes[1], /may be incomplete/);
  assert.match(describePlan(plan({ snapshot: snap({ ongoingCount: 1 }) }), TODAY).notes[0], /1 title still airing/);
});

test("a plan with only ongoing titles has no total or finish date", () => {
  const d = describePlan(plan({ snapshot: snap({ totalMinutes: 0, ongoingCount: 1 }) }), TODAY);
  assert.equal(d.total, null);
  assert.equal(d.finish, null);
  assert.equal(d.evenings, null);
});

test("a plan longer than a year shows 366+ and no finish date", () => {
  const d = describePlan(plan({ snapshot: snap({ totalMinutes: 24 * 100000 }), days: [1] }), TODAY);
  assert.equal(d.evenings, "366+");
  assert.equal(d.finish, null);
});

test("odd stored values do not break the card", () => {
  const d = describePlan({ id: "x", name: "x", titleIds: undefined, days: undefined, hoursPerEvening: "abc", createdAt: "not a date", snapshot: snap() }, TODAY);
  assert.equal(d.titleCount, 0);
  assert.equal(d.saved, "");
  assert.equal(d.hoursLabel, "2h per evening");
  assert.equal(d.days, "No evenings chosen");
  assert.equal(d.finish, null); // no evenings to place it on
});

test("the saved date is formatted", () => {
  assert.equal(describePlan(plan({ createdAt: new Date(2026, 9, 10, 12).toISOString() }), TODAY).saved, "Sat 10 Oct");
});
