import { test } from "node:test";
import assert from "node:assert/strict";

import { WEEK, MIN_HOURS, MAX_HOURS, stepHours, formatHours, toggleDay } from "../js/planner-core.js";
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
