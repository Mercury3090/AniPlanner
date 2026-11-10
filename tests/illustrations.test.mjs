import { test } from "node:test";
import assert from "node:assert/strict";
import { ILLUSTRATIONS, illustration, illustrationFor } from "../js/illustrations.js";
import { emptyStateHTML } from "../js/ui.js";

test("there is an illustration for a calendar, a bookmark and a search", () => {
  assert.deepEqual([...ILLUSTRATIONS].sort(), ["plan", "saved", "search"]);
});

test("every illustration is decorative: hidden from screen readers and not focusable", () => {
  for (const name of ILLUSTRATIONS) {
    const svg = illustration(name);
    assert.ok(svg.startsWith("<svg"), name);
    assert.ok(svg.includes('aria-hidden="true"') && svg.includes('focusable="false"'), `${name} must be hidden from assistive technology`);
    assert.ok(!svg.includes("<title"), `${name} must not announce itself`);
    assert.ok(svg.includes("il-solid") && svg.includes("il-line"), `${name} uses the site's drawing classes`);
  }
});

test("an unknown illustration is an empty string, never broken markup", () => {
  assert.equal(illustration("nope"), "");
  assert.equal(illustration(""), "");
  assert.equal(illustrationFor("nope"), null);
  assert.equal(illustrationFor(undefined), null);
});

test("existing empty-state icons map to the right picture", () => {
  assert.equal(illustrationFor("search"), "search");
  assert.equal(illustrationFor("calendar-plus"), "plan");
  assert.equal(illustrationFor("calendar"), "plan");
  assert.equal(illustrationFor("bookmark"), "saved");
});

test("empty states show an illustration when there is one, and a plain icon when there is not", () => {
  const plan = emptyStateHTML({ iconName: "calendar-plus", title: "Your plan is empty", text: "x" });
  assert.ok(plan.includes('class="illustration"') && !plan.includes('class="icon"'));
  const search = emptyStateHTML({ title: "No results", text: "x" }); // default icon is search
  assert.ok(search.includes('class="illustration"'));
  const other = emptyStateHTML({ iconName: "alert", title: "Oops", text: "x" });
  assert.ok(!other.includes('class="illustration"') && other.includes('class="icon"'), "no picture for this icon, so the icon is kept");
  assert.ok(plan.includes("<h2>Your plan is empty</h2>"), "the words are still there");
});
