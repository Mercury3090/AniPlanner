import { test } from "node:test";
import assert from "node:assert/strict";

import { WEEK, MIN_HOURS, MAX_HOURS, stepHours, formatHours, toggleDay, moveItem, dropIndex, shiftsFor } from "../js/planner-core.js";
import { bannerHTML } from "../js/ui.js";

test("the week runs Monday to Sunday with JavaScript weekday numbers", () => {
  assert.deepEqual(WEEK.map((d) => d.label), ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  assert.deepEqual(WEEK.map((d) => d.day), [1, 2, 3, 4, 5, 6, 0]);
  assert.equal(new Set(WEEK.map((d) => d.day)).size, 7);
  assert.equal(WEEK[0].name, "Monday");
});

test("hours step by half an hour and stay inside the limits", () => {
  assert.equal(stepHours(2, 1), 2.5);
  assert.equal(stepHours(2, -1), 1.5);
  assert.equal(stepHours(0.5, -1), MIN_HOURS);
  assert.equal(stepHours(8, 1), MAX_HOURS);
  assert.equal(stepHours(7.5, 1), 8);
  // Repeated steps never drift or leave the range.
  let h = 2;
  for (let i = 0; i < 40; i += 1) h = stepHours(h, 1);
  assert.equal(h, MAX_HOURS);
  for (let i = 0; i < 40; i += 1) h = stepHours(h, -1);
  assert.equal(h, MIN_HOURS);
  // Bad values fall back to the default of 2 hours.
  assert.equal(stepHours(undefined, 1), 2.5);
  assert.equal(stepHours(NaN, -1), 1.5);
  assert.equal(stepHours(-3, 1), 2.5);
  assert.equal(stepHours(2.3, 1), 2.5); // next half-hour mark above
  assert.equal(stepHours(2.3, -1), 2); // next half-hour mark below
  assert.equal(stepHours(2.5, 1), 3);
});

test("formatHours", () => {
  assert.equal(formatHours(2), "2");
  assert.equal(formatHours(1.5), "1.5");
  assert.equal(formatHours(0.5), "0.5");
  assert.equal(formatHours(8), "8");
});

test("days can be toggled but never emptied", () => {
  assert.deepEqual(toggleDay([1, 3, 5], 2), { days: [1, 2, 3, 5], blocked: false });
  assert.deepEqual(toggleDay([1, 3, 5], 3), { days: [1, 5], blocked: false });
  assert.deepEqual(toggleDay([3], 3), { days: [3], blocked: true });
  assert.deepEqual(toggleDay([0], 1), { days: [0, 1], blocked: false });
  // Input is not mutated.
  const days = [1, 3, 5];
  toggleDay(days, 2);
  assert.deepEqual(days, [1, 3, 5]);
});

test("a banner can carry a link instead of a button", () => {
  const html = bannerHTML({ tone: "success", message: "Plan saved", actionLabel: "View saved plans", href: "saved.html" });
  assert.ok(html.includes('<a class="btn btn--secondary btn--small" href="saved.html">View saved plans</a>'));
  assert.ok(!html.includes("<button"));
  assert.ok(bannerHTML({ tone: "error", message: "x", actionLabel: "Retry" }).includes("<button"));
  assert.ok(bannerHTML({ tone: "success", message: "x", actionLabel: "Go", href: 'a"b' }).includes("a&quot;b"));
});

test("moveItem moves one item and never changes the original list", () => {
  const list = ["a", "b", "c", "d"];
  assert.deepEqual(moveItem(list, 0, 2), ["b", "c", "a", "d"]);
  assert.deepEqual(moveItem(list, 3, 0), ["d", "a", "b", "c"]);
  assert.deepEqual(moveItem(list, 1, 2), ["a", "c", "b", "d"]);
  assert.deepEqual(moveItem(list, 2, 2), list, "same spot");
  assert.deepEqual(list, ["a", "b", "c", "d"], "the original is untouched");
  // Out-of-range targets are clamped, and bad sources change nothing.
  assert.deepEqual(moveItem(list, 0, 99), ["b", "c", "d", "a"]);
  assert.deepEqual(moveItem(list, 3, -5), ["d", "a", "b", "c"]);
  assert.deepEqual(moveItem(list, -1, 2), list);
  assert.deepEqual(moveItem(list, 9, 0), list);
  assert.deepEqual(moveItem([], 0, 0), []);
  assert.deepEqual(moveItem(["x"], 0, 5), ["x"]);
});

test("every possible move keeps the same items, just reordered", () => {
  const list = [10, 20, 30, 40, 50];
  for (let from = 0; from < list.length; from += 1) {
    for (let to = 0; to < list.length; to += 1) {
      const moved = moveItem(list, from, to);
      assert.deepEqual([...moved].sort((a, b) => a - b), list);
      assert.equal(moved[to], list[from], `item ${from} should land at ${to}`);
    }
  }
});

test("dropIndex says where a dragged row lands from its vertical middle", () => {
  const mids = [100, 200, 300, 400];
  assert.equal(dropIndex(mids, 0, 100), 0, "not moved");
  assert.equal(dropIndex(mids, 0, 250), 1, "dragged below the second row");
  assert.equal(dropIndex(mids, 0, 450), 3, "dragged below everything");
  assert.equal(dropIndex(mids, 3, 150), 1, "dragged up past two rows");
  assert.equal(dropIndex(mids, 3, 10), 0, "dragged above everything");
  assert.equal(dropIndex(mids, 1, 200), 1, "left where it started");
  assert.equal(dropIndex(mids, 1, 99), 0);
  assert.equal(dropIndex([50], 0, 9999), 0, "a single row cannot move");
  // The result always matches what moveItem would do.
  const order = ["a", "b", "c", "d"];
  const to = dropIndex(mids, 0, 250);
  assert.deepEqual(moveItem(order, 0, to), ["b", "a", "c", "d"]);
});

test("shiftsFor moves the rows in between by the dragged row's height plus the gap", () => {
  const heights = [80, 100, 60, 90];
  // Drag row 0 down to position 2: rows 1 and 2 move up by 80 + 16.
  assert.deepEqual(shiftsFor(heights, 16, 0, 2), [0, -96, -96, 0]);
  // Drag row 3 up to position 1: rows 1 and 2 move down by 90 + 16.
  assert.deepEqual(shiftsFor(heights, 16, 3, 1), [0, 106, 106, 0]);
  assert.deepEqual(shiftsFor(heights, 16, 1, 1), [0, 0, 0, 0], "no move, no shift");
  assert.deepEqual(shiftsFor(heights, 16, 0, 1), [0, -96, 0, 0]);
  assert.deepEqual(shiftsFor(heights, 16, 2, 3), [0, 0, 0, -76]);
});

test("after the shifts, every row ends exactly where moveItem puts it", () => {
  // Simulate the layout: rows stacked with a gap. Apply shifts, and check each row's new top
  // matches the position it would have in the reordered list.
  const heights = [80, 100, 60, 90]; const gap = 16;
  const tops = (hs) => hs.reduce((acc, h, i) => (acc.push(i === 0 ? 0 : acc[i - 1] + hs[i - 1] + gap), acc), []);
  for (let from = 0; from < 4; from += 1) {
    for (let to = 0; to < 4; to += 1) {
      const before = tops(heights);
      const shifts = shiftsFor(heights, gap, from, to);
      const order = moveItem([0, 1, 2, 3], from, to);
      const afterTops = tops(order.map((i) => heights[i]));
      order.forEach((original, newPosition) => {
        if (original === from) return; // the dragged row follows the pointer instead
        assert.equal(before[original] + shifts[original], afterTops[newPosition], `row ${original} when moving ${from} -> ${to}`);
      });
    }
  }
});
