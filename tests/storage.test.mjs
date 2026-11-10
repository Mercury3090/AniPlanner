import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// A tiny stand-in for the browser, so the storage layer can be tested in Node.
function installBrowserStub() {
  const data = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => void data.set(k, String(v)),
      removeItem: (k) => void data.delete(k),
    },
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return data;
}
let store;
beforeEach(() => { store = installBrowserStub(); });

const storage = await import("../js/storage.js");

test("a fresh draft has sensible defaults", () => {
  assert.deepEqual(storage.getDraft(), { titleIds: [], days: [1, 3, 5], hoursPerEvening: 2 });
});

test("titles are added in order and never duplicated", () => {
  storage.addToDraft(5); storage.addToDraft("7"); storage.addToDraft(5);
  assert.deepEqual(storage.getDraft().titleIds, [5, 7]);
  assert.equal(storage.isInDraft(7), true);
  assert.equal(storage.isInDraft(9), false);
});

test("removing reports the position, and Undo restores it exactly", () => {
  for (const id of [1, 2, 3, 4]) storage.addToDraft(id);
  const removed = storage.removeFromDraft(2);
  assert.equal(removed.ok, true);
  assert.equal(removed.index, 1);
  assert.deepEqual(storage.getDraft().titleIds, [1, 3, 4]);
  storage.addToDraft(2, { index: removed.index });
  assert.deepEqual(storage.getDraft().titleIds, [1, 2, 3, 4], "order is unchanged after Undo");

  // First and last positions
  const first = storage.removeFromDraft(1); storage.addToDraft(1, { index: first.index });
  const last = storage.removeFromDraft(4); storage.addToDraft(4, { index: last.index });
  assert.deepEqual(storage.getDraft().titleIds, [1, 2, 3, 4]);
});

test("a bad index falls back to the end, and removing a missing title is harmless", () => {
  storage.addToDraft(1); storage.addToDraft(2);
  storage.addToDraft(3, { index: 99 }); storage.addToDraft(4, { index: -1 }); storage.addToDraft(5, { index: 1.5 });
  assert.deepEqual(storage.getDraft().titleIds, [1, 2, 3, 4, 5]);
  const missing = storage.removeFromDraft(42);
  assert.equal(missing.ok, true);
  assert.equal(missing.index, -1);
  assert.deepEqual(storage.getDraft().titleIds, [1, 2, 3, 4, 5]);
});

test("settings are kept when titles change", () => {
  storage.saveDraft({ titleIds: [1], days: [0, 6], hoursPerEvening: 3.5 });
  storage.addToDraft(2); storage.removeFromDraft(1);
  assert.deepEqual(storage.getDraft(), { titleIds: [2], days: [0, 6], hoursPerEvening: 3.5 });
});

test("corrupt or odd stored data falls back safely", () => {
  store.set("wnp:draft", "{{not json");
  assert.deepEqual(storage.getDraft(), { titleIds: [], days: [1, 3, 5], hoursPerEvening: 2 });
  store.set("wnp:draft", JSON.stringify({ titleIds: "nope", days: [], hoursPerEvening: "abc" }));
  assert.deepEqual(storage.getDraft(), { titleIds: [], days: [1, 3, 5], hoursPerEvening: 2 });
  store.set("wnp:draft", JSON.stringify({ titleIds: [1], days: [2], hoursPerEvening: -4 }));
  assert.equal(storage.getDraft().hoursPerEvening, 2);
});

test("saving a plan names it, copies the draft, and lists newest first", () => {
  storage.saveDraft({ titleIds: [1, 2], days: [1], hoursPerEvening: 1.5 });
  const a = storage.savePlan("  Weekend binge  ");
  assert.equal(a.ok, true);
  assert.equal(a.plan.name, "Weekend binge");
  assert.deepEqual(a.plan.titleIds, [1, 2]);
  const b = storage.savePlan("");
  assert.equal(b.plan.name, "Plan 2");
  assert.deepEqual(storage.listPlans().map((p) => p.name), ["Plan 2", "Weekend binge"]);
  // Editing the draft afterwards does not change a saved plan.
  storage.addToDraft(9);
  assert.deepEqual(storage.listPlans()[1].titleIds, [1, 2]);
});

test("deleting a plan can be undone", () => {
  storage.addToDraft(1); const { plan } = storage.savePlan("Keep me");
  const del = storage.deletePlan(plan.id);
  assert.equal(storage.listPlans().length, 0);
  storage.restorePlan(del.removed);
  assert.equal(storage.listPlans()[0].name, "Keep me");
});

test("a plan can be loaded back into the draft", () => {
  storage.saveDraft({ titleIds: [4, 5], days: [2, 4], hoursPerEvening: 3 });
  const { plan } = storage.savePlan("Midweek");
  storage.saveDraft({ titleIds: [], days: [1], hoursPerEvening: 1 });
  assert.equal(storage.loadPlanIntoDraft(plan.id).ok, true);
  assert.deepEqual(storage.getDraft(), { titleIds: [4, 5], days: [2, 4], hoursPerEvening: 3 });
  assert.equal(storage.loadPlanIntoDraft("missing").ok, false);
});

test("blocked storage reports failure instead of throwing", () => {
  window.localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
  assert.equal(storage.addToDraft(1).ok, false);
  assert.equal(storage.removeFromDraft(1).ok, false);
  assert.equal(storage.savePlan("x").ok, false);
  assert.equal(storage.storageAvailable(), false);
});

test("a snapshot is saved with a plan, and only safe fields survive", () => {
  storage.addToDraft(1);
  const { plan } = storage.savePlan("With totals", {
    totalMinutes: 1296.4,
    titles: [
      { id: 1, title: "Cowboy Bebop", image: "https://cdn.example/1.jpg", extra: "dropped" },
      { id: "x", title: "Bad id", image: null },
      { id: 2, title: "Unsafe image", image: "javascript:alert(1)" },
      { id: 3, title: "t".repeat(500), image: "http://not-https.example/3.jpg" },
    ],
    ongoingCount: 2,
    hasEstimate: 1,
    partial: 0,
    evil: "dropped",
  });
  const snap = plan.snapshot;
  assert.equal(snap.totalMinutes, 1296);
  assert.equal(snap.titles.length, 3);
  assert.deepEqual(snap.titles[0], { id: 1, title: "Cowboy Bebop", image: "https://cdn.example/1.jpg" });
  assert.equal(snap.titles[1].image, null);
  assert.equal(snap.titles[2].image, null);
  assert.equal(snap.titles[2].title.length, 160);
  assert.equal(snap.ongoingCount, 2);
  assert.equal(snap.hasEstimate, true);
  assert.equal(snap.partial, false);
  assert.equal("evil" in snap, false);
});

test("a plan without a snapshot, or with a junk one, still saves", () => {
  storage.addToDraft(1);
  assert.equal(storage.savePlan("None").plan.snapshot, null);
  assert.equal(storage.savePlan("Junk", "nope").plan.snapshot, null);
  assert.equal(storage.savePlan("Negative", { totalMinutes: -5, titles: "no" }).plan.snapshot.totalMinutes, 0);
  assert.deepEqual(storage.savePlan("Negative", { titles: "no" }).plan.snapshot.titles, []);
});

test("at most 50 titles are kept in a snapshot", () => {
  storage.addToDraft(1);
  const titles = Array.from({ length: 80 }, (_, i) => ({ id: i + 1, title: `T${i}`, image: null }));
  assert.equal(storage.savePlan("Many", { totalMinutes: 10, titles }).plan.snapshot.titles.length, 50);
});

test("hasUnsavedDraft only warns when work would be lost", () => {
  assert.equal(storage.hasUnsavedDraft(), false, "empty plan");
  storage.addToDraft(1); storage.addToDraft(2);
  assert.equal(storage.hasUnsavedDraft(), true, "titles, nothing saved");
  storage.savePlan("Saved");
  assert.equal(storage.hasUnsavedDraft(), false, "matches a saved plan");
  storage.addToDraft(3);
  assert.equal(storage.hasUnsavedDraft(), true, "edited after saving");
  storage.removeFromDraft(3);
  assert.equal(storage.hasUnsavedDraft(), false, "back to the saved version");
  storage.removeFromDraft(1); storage.addToDraft(1);
  assert.equal(storage.hasUnsavedDraft(), true, "same titles in a different order are a different plan");
});

test("findSavedPlan recognises an identical saved plan", () => {
  assert.equal(storage.findSavedPlan(), null, "nothing yet");
  storage.saveDraft({ titleIds: [1, 2], days: [5, 1, 3], hoursPerEvening: 2 });
  assert.equal(storage.findSavedPlan(), null, "not saved yet");
  const { plan } = storage.savePlan("Mine");
  assert.equal(storage.findSavedPlan().id, plan.id);
  // The order days were picked in does not matter.
  storage.saveDraft({ titleIds: [1, 2], days: [3, 5, 1], hoursPerEvening: 2 });
  assert.equal(storage.findSavedPlan().id, plan.id);
});

test("any change to titles, order, days or hours means it is no longer saved", () => {
  storage.saveDraft({ titleIds: [1, 2], days: [1, 3, 5], hoursPerEvening: 2 });
  storage.savePlan("Mine");
  for (const changed of [
    { titleIds: [1, 2, 3], days: [1, 3, 5], hoursPerEvening: 2 },
    { titleIds: [1], days: [1, 3, 5], hoursPerEvening: 2 },
    { titleIds: [2, 1], days: [1, 3, 5], hoursPerEvening: 2 },
    { titleIds: [1, 2], days: [1, 3], hoursPerEvening: 2 },
    { titleIds: [1, 2], days: [1, 3, 5, 6], hoursPerEvening: 2 },
    { titleIds: [1, 2], days: [1, 3, 5], hoursPerEvening: 2.5 },
  ]) {
    storage.saveDraft(changed);
    assert.equal(storage.findSavedPlan(), null, JSON.stringify(changed));
  }
  // Changing it back makes it "saved" again.
  storage.saveDraft({ titleIds: [1, 2], days: [1, 3, 5], hoursPerEvening: 2 });
  assert.equal(storage.findSavedPlan().name, "Mine");
});

test("findSavedPlan picks the matching plan among several, and ignores empty plans", () => {
  storage.saveDraft({ titleIds: [1], days: [1], hoursPerEvening: 1 }); storage.savePlan("One");
  storage.saveDraft({ titleIds: [2], days: [2], hoursPerEvening: 3 }); storage.savePlan("Two");
  storage.saveDraft({ titleIds: [1], days: [1], hoursPerEvening: 1 });
  assert.equal(storage.findSavedPlan().name, "One");
  storage.saveDraft({ titleIds: [], days: [1], hoursPerEvening: 1 });
  assert.equal(storage.findSavedPlan(), null);
});

test("clearing the plan keeps the evenings and hours, and its ids can be restored", () => {
  storage.saveDraft({ titleIds: [4, 5, 6], days: [2, 4], hoursPerEvening: 3 });
  const before = storage.getDraft().titleIds;
  storage.clearDraft();
  assert.deepEqual(storage.getDraft(), { titleIds: [], days: [2, 4], hoursPerEvening: 3 });
  storage.saveDraft({ ...storage.getDraft(), titleIds: before });
  assert.deepEqual(storage.getDraft().titleIds, [4, 5, 6]);
});

test("moveInDraft reorders the plan and reports what happened", () => {
  for (const id of [1, 2, 3, 4]) storage.addToDraft(id);
  let r = storage.moveInDraft(3, 0);
  assert.deepEqual([r.ok, r.moved, r.from, r.to], [true, true, 2, 0]);
  assert.deepEqual(storage.getDraft().titleIds, [3, 1, 2, 4]);
  r = storage.moveInDraft("4", 1);
  assert.deepEqual(storage.getDraft().titleIds, [3, 4, 1, 2]);
  assert.equal(r.moved, true);
});

test("moveInDraft ignores no-op, unknown and out-of-range moves safely", () => {
  for (const id of [1, 2, 3]) storage.addToDraft(id);
  assert.equal(storage.moveInDraft(2, 1).moved, false, "already there");
  assert.equal(storage.moveInDraft(99, 0).moved, false, "not in the plan");
  assert.deepEqual(storage.moveInDraft(1, 99).to, 2, "clamped to the end");
  assert.deepEqual(storage.getDraft().titleIds, [2, 3, 1]);
  storage.moveInDraft(1, -5);
  assert.deepEqual(storage.getDraft().titleIds, [1, 2, 3], "clamped to the start");
  assert.equal(storage.moveInDraft(1, NaN).moved, false);
});

test("reordering keeps the evenings and hours, and makes a saved plan unsaved", () => {
  storage.saveDraft({ titleIds: [1, 2, 3], days: [2, 4], hoursPerEvening: 3 });
  storage.savePlan("Order matters");
  assert.equal(storage.findSavedPlan().name, "Order matters");
  storage.moveInDraft(3, 0);
  assert.deepEqual(storage.getDraft(), { titleIds: [3, 1, 2], days: [2, 4], hoursPerEvening: 3 });
  assert.equal(storage.findSavedPlan(), null, "a different order is a different plan");
  storage.moveInDraft(3, 2);
  assert.equal(storage.findSavedPlan().name, "Order matters", "moving it back makes it saved again");
});

test("reordering fails safely when storage is blocked", () => {
  for (const id of [1, 2]) storage.addToDraft(id);
  window.localStorage.setItem = () => { throw new Error("blocked"); };
  const r = storage.moveInDraft(2, 0);
  assert.equal(r.ok, false);
  assert.equal(r.moved, false);
});
