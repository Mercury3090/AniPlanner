import { test } from "node:test";
import assert from "node:assert/strict";
import { icon } from "../js/icons.js";

test("every icon the app uses exists", () => {
  for (const name of ["search", "plus", "minus", "x", "check", "menu", "clock", "calendar", "calendar-plus", "trash", "alert", "circle-check", "circle-minus", "play", "star", "arrow-right", "arrow-left", "moon", "infinity", "loader", "bookmark", "image", "filter", "chevron-down"]) {
    assert.ok(icon(name).startsWith("<svg"), name);
  }
  assert.equal(icon("does-not-exist"), "");
});

test("circle-minus is a circle with a single horizontal line", () => {
  const svg = icon("circle-minus");
  assert.ok(svg.includes("<circle"));
  assert.ok(svg.includes('d="M9 12l6 0"'));
  assert.ok(!svg.includes("M9 12l2 2l4 -4"), "must not contain the tick");
});

test("icons are decorative unless given a label", () => {
  assert.ok(icon("check").includes('aria-hidden="true"'));
  const labelled = icon("check", { label: "Done" });
  assert.ok(labelled.includes('role="img"') && labelled.includes('aria-label="Done"') && !labelled.includes("aria-hidden"));
});
