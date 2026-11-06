import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

/* ---------- Without GSAP (or without a browser): everything is a safe no-op ---------- */

const bare = await import("../js/animations.js?bare");

test("with no GSAP every function does nothing and nothing throws", () => {
  assert.equal(bare.motionAllowed(), false);
  assert.equal(bare.revealHero(), null);
  bare.revealOnScroll([{}]);
  bare.revealCards({ querySelectorAll: () => [] }, new Set());
  bare.fillEvenings({ querySelectorAll: () => [{}] });
  bare.countUp({ textContent: "5" }, 0, 5, "number");
  bare.popIcon({ querySelector: () => ({}) });
  bare.toastIn({});
  assert.equal(bare.pillPop({}), false);
});

test("without motion, content is swapped immediately and toasts are removed at once", () => {
  let updated = 0, removed = 0;
  bare.crossfade({ querySelector: () => ({}), parentElement: {} }, () => (updated += 1));
  assert.equal(updated, 1);
  bare.toastOut({}, () => (removed += 1));
  assert.equal(removed, 1);
});

test("count text formats minutes and plain numbers", () => {
  assert.equal(bare.formatCount("minutes", 1296), "21h 36m");
  assert.equal(bare.formatCount("minutes", 45), "45m");
  assert.equal(bare.formatCount("minutes", 1296.4), "21h 36m");
  assert.equal(bare.formatCount("minutes", 1296, { prefix: "About " }), "About 21h 36m");
  assert.equal(bare.formatCount("number", 10.6), "11");
  assert.equal(bare.formatCount("number", 366, { suffix: "+" }), "366+");
  assert.equal(bare.formatCount("number", 0), "0");
});

/* ---------- With a stand-in for GSAP: check what would be animated ---------- */

let calls, reduced, heldClass;
function install() {
  calls = [];
  heldClass = [];
  const chain = {
    fromTo: (...a) => (calls.push(["tl.fromTo", ...a]), chain),
    eventCallback: (...a) => (calls.push(["tl.eventCallback", ...a]), chain),
  };
  globalThis.window = {
    gsap: {
      registerPlugin() {},
      set: (...a) => calls.push(["set", ...a]),
      to: (...a) => calls.push(["to", ...a]),
      from: (...a) => calls.push(["from", ...a]),
      fromTo: (...a) => calls.push(["fromTo", ...a]),
      timeline: (...a) => (calls.push(["timeline", ...a]), chain),
    },
    ScrollTrigger: { batch: (...a) => calls.push(["batch", ...a]) },
    matchMedia: () => ({ matches: reduced }),
    document: { documentElement: { classList: { remove: (c) => heldClass.push(c) } } },
  };
}
beforeEach(() => { reduced = false; install(); });
const load = () => import(`../js/animations.js?stub=${Math.random()}`);

const card = (id) => ({ querySelector: () => (id == null ? null : { dataset: { id: String(id) } }) });
const grid = (...ids) => ({ querySelectorAll: () => ids.map(card) });

test("cards animate once each, and only new cards animate when more are added", async () => {
  const a = await load(); const seen = new Set();
  a.revealCards(grid(1, 2, 3), seen);
  const first = calls.filter((c) => c[0] === "batch");
  assert.equal(first.length, 1);
  assert.equal(first[0][1].length, 3);
  assert.deepEqual(calls.find((c) => c[0] === "set")[2], { opacity: 0, y: 24 });
  calls.length = 0;
  a.revealCards(grid(1, 2, 3, 4, 5), seen); // Load more: 4 and 5 are new
  assert.equal(calls.filter((c) => c[0] === "batch")[0][1].length, 2);
  calls.length = 0;
  a.revealCards(grid(1, 2, 3, 4, 5), seen); // redraw with nothing new
  assert.equal(calls.length, 0);
});

test("skeleton cards (no id) are never animated", async () => {
  const a = await load();
  a.revealCards({ querySelectorAll: () => [card(null), card(null)] }, new Set());
  assert.equal(calls.length, 0);
});

test("scroll reveal is fade and rise, once, 0.5s with a 0.08s stagger", async () => {
  const a = await load();
  a.revealOnScroll([{}, {}]);
  const cfg = calls.find((c) => c[0] === "batch")[2];
  assert.equal(cfg.once, true);
  assert.equal(cfg.start, "top 88%");
  cfg.onEnter(["x"]);
  const tween = calls.filter((c) => c[0] === "to").pop();
  assert.deepEqual([tween[2].duration, tween[2].stagger, tween[2].ease], [0.5, 0.08, "power2.out"]);
  assert.equal(tween[2].opacity, 1);
});

test("reduced motion: no scroll movement, no counting, no pop, no slide", async () => {
  reduced = true;
  const a = await load();
  assert.equal(a.motionAllowed(), false);
  a.revealCards(grid(1, 2), new Set());
  a.fillEvenings({ querySelectorAll: () => [{}] });
  a.countUp({ textContent: "9" }, 0, 9, "number");
  a.popIcon({ querySelector: () => ({}) });
  a.toastIn({});
  assert.equal(a.pillPop({}), false);
  assert.equal(calls.length, 0, JSON.stringify(calls));
  let removed = 0; a.toastOut({}, () => (removed += 1));
  assert.equal(removed, 1);
});

test("hero: a timeline of headline, lead, buttons, then posters; releases the hold when done", async () => {
  const a = await load();
  assert.ok(a.revealHero());
  const steps = calls.filter((c) => c[0] === "tl.fromTo");
  assert.deepEqual(steps.map((s) => s[1]), [".hero__title", ".hero__lead", ".hero__actions", ".hero-poster"]);
  assert.deepEqual(steps.map((s) => s[4]), [0, 0.1, 0.2, 0.3]); // start times in seconds
  assert.equal(steps[0][3].duration, 0.8);
  assert.equal(steps[3][3].stagger, 0.08);
  assert.deepEqual(steps[0][2], { y: 30, opacity: 0 });
  assert.equal(calls.find((c) => c[0] === "timeline")[1].defaults.ease, "power3.out");
  calls.find((c) => c[0] === "tl.eventCallback")[2](); // onComplete
  assert.deepEqual(heldClass, ["has-motion"]);
});

test("hero with reduced motion is a quick fade and releases the hold at once", async () => {
  reduced = true;
  const a = await load();
  assert.equal(a.revealHero(), null);
  assert.deepEqual(heldClass, ["has-motion"]);
  const t = calls.find((c) => c[0] === "fromTo");
  assert.deepEqual([t[2], t[3].duration], [{ opacity: 0 }, 0.2]);
  assert.equal(calls.some((c) => c[0] === "timeline"), false);
});

test("evenings fill from the left, with the stagger capped for long plans", async () => {
  const a = await load();
  a.fillEvenings({ querySelectorAll: () => new Array(3).fill({}) });
  let t = calls.find((c) => c[0] === "fromTo");
  assert.deepEqual(t[2], { scaleX: 0 });
  assert.equal(t[3].scaleX, 1); assert.equal(t[3].duration, 0.6); assert.equal(t[3].ease, "back.out(1.4)");
  assert.equal(t[3].stagger, 0.1); assert.equal(t[3].transformOrigin, "left center");
  calls.length = 0;
  a.fillEvenings({ querySelectorAll: () => new Array(100).fill({}) });
  t = calls.find((c) => c[0] === "fromTo");
  assert.ok(t[3].stagger < 0.01, "100 evenings must not take 10 seconds to appear");
  calls.length = 0;
  a.fillEvenings({ querySelectorAll: () => [] });
  assert.equal(calls.length, 0);
});

test("count-up runs 0.8s, ends on the exact final text, and skips unchanged numbers", async () => {
  const a = await load();
  const el = { textContent: "21h 36m" };
  a.countUp(el, 0, 1296, "minutes");
  const [, counter, vars] = calls.find((c) => c[0] === "to");
  assert.equal(counter.v, 0); assert.equal(vars.v, 1296); assert.equal(vars.duration, 0.8); assert.equal(vars.ease, "power1.out");
  counter.v = 90; vars.onUpdate();
  assert.equal(el.textContent, "1h 30m");
  counter.v = 1295.6; vars.onUpdate();
  assert.equal(el.textContent, "21h 36m");
  el.textContent = "stray"; vars.onComplete();
  assert.equal(el.textContent, "21h 36m", "the original final text is restored exactly");
  calls.length = 0;
  a.countUp(el, 11, 11, "number");
  assert.equal(calls.length, 0);
});

test("count-up keeps its prefix and suffix while counting", async () => {
  const a = await load();
  const el = { textContent: "About 4h 00m" };
  a.countUp(el, 0, 240, "minutes", { prefix: "About " });
  const [, counter, vars] = calls.find((c) => c[0] === "to");
  counter.v = 60; vars.onUpdate();
  assert.equal(el.textContent, "About 1h 00m");
});

test("confirmations: icon pop, toast in and out, pill pop", async () => {
  const a = await load();
  const icon = {}; a.popIcon({ querySelector: (s) => (s === ".icon" ? icon : null) });
  let t = calls.find((c) => c[0] === "fromTo");
  assert.equal(t[1], icon); assert.equal(t[3].ease, "back.out(2)"); assert.equal(t[3].duration, 0.3);
  calls.length = 0; a.popIcon({ querySelector: () => null }); assert.equal(calls.length, 0, "no icon, no animation");
  a.toastIn({}); t = calls.find((c) => c[0] === "from");
  assert.deepEqual([t[2].y, t[2].duration, t[2].ease], [16, 0.3, "power2.out"]);
  calls.length = 0; let done = 0;
  a.toastOut({}, () => (done += 1));
  assert.equal(done, 0, "waits for the fade");
  calls.find((c) => c[0] === "to")[2].onComplete(); assert.equal(done, 1);
  calls.length = 0;
  assert.equal(a.pillPop({}), true);
  assert.equal(calls.find((c) => c[0] === "fromTo")[3].ease, "back.out(1.7)");
});

test("crossfade leaves content alone when there is no skeleton to fade from", async () => {
  const a = await load();
  let updated = 0;
  a.crossfade({ querySelector: () => null, parentElement: {} }, () => (updated += 1));
  assert.equal(updated, 1);
  assert.equal(calls.length, 0);
});

test("only transform and opacity are animated", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../js/animations.js", import.meta.url), "utf8");
  const tweenVars = [...src.matchAll(/g\.(?:to|from|fromTo|set)\([^;]*?\{([^}]*)\}/gs)].map((m) => m[1]).join(" ");
  for (const bad of ["width", "height", "top", "left", "margin", "padding", "fontSize"]) {
    assert.equal(new RegExp(`\\b${bad}\\s*:`).test(tweenVars.replace(/transformOrigin/g, "")), false, `${bad} must not be animated`);
  }
});
