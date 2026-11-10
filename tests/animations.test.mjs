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

let calls, reduced, heldClass, headerEls, session, timers, created;
function install() {
  calls = [];
  heldClass = [];
  headerEls = [];
  session = new Map();
  timers = [];
  created = [];
  const chain = {
    fromTo: (...a) => (calls.push(["tl.fromTo", ...a]), chain),
    to: (...a) => (calls.push(["tl.to", ...a]), chain),
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
    Draggable: { create: (el, cfg) => { const d = { el, cfg, killed: false, kill() { d.killed = true; } }; created.push(d); return [d]; } },
    matchMedia: () => ({ matches: reduced }),
    sessionStorage: { getItem: (k) => session.get(k) ?? null, setItem: (k, v) => session.set(k, v) },
    setTimeout: (fn) => (timers.push(fn), timers.length),
    getComputedStyle: () => ({ rowGap: "16px", position: "static" }),
    document: { querySelectorAll: () => headerEls, documentElement: { classList: { remove: (c) => heldClass.push(c) } } },
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

/* ---------- Page headers, detail page, enter and exit, delayed count-up ---------- */

test("page headers rise in together and release the hold when finished", async () => {
  const a = await load();
  headerEls = [{}, {}];
  a.revealPageHeader();
  const t = calls.find((c) => c[0] === "fromTo");
  assert.equal(t[1].length, 2);
  assert.deepEqual(t[2], { y: 16, opacity: 0 });
  assert.deepEqual([t[3].duration, t[3].stagger, t[3].ease], [0.5, 0.08, "power2.out"]);
  t[3].onComplete();
  assert.deepEqual(heldClass, ["has-motion"]);
});

test("page headers: reduced motion or no GSAP just releases the hold, and no headers does nothing", async () => {
  reduced = true; headerEls = [{}];
  let a = await load();
  assert.equal(a.revealPageHeader(), null);
  assert.deepEqual(heldClass, ["has-motion"]);
  assert.equal(calls.length, 0);
  reduced = false; headerEls = []; heldClass.length = 0;
  a = await load();
  assert.equal(a.revealPageHeader(), null);
  assert.equal(calls.length, 0);
  assert.equal(heldClass.length, 0);
});

test("detail page: poster, title and badges, runtime strip, then the button, with sections on scroll", async () => {
  const a = await load();
  const root = { querySelectorAll: (s) => (s.includes("#related") ? [{ section: 1 }, { section: 2 }] : [{ sel: s }]) };
  assert.ok(a.revealDetail(root));
  const steps = calls.filter((c) => c[0] === "tl.fromTo");
  assert.equal(steps.length, 4);
  assert.deepEqual(steps.map((s) => s[1][0].sel), [".detail__poster", ".detail__title, .detail__summary .cluster", ".runtime-strip, .runtime-note", ".detail__actions"]);
  assert.deepEqual(steps.map((s) => s[4]), [0, 0.1, 0.25, 0.4]);
  assert.deepEqual(steps[0][2], { y: 24, opacity: 0 });
  assert.equal(calls.filter((c) => c[0] === "batch")[0][1].length, 2, "the sections reveal on scroll (the hidden related section is left out)");
});

test("detail page without motion does nothing", async () => {
  reduced = true;
  const a = await load();
  assert.equal(a.revealDetail({ querySelectorAll: () => [{}] }), null);
  assert.equal(calls.length, 0);
});

test("items enter and exit; exit calls done only after the fade", async () => {
  const a = await load();
  a.enterItems([{}, {}]);
  let t = calls.find((c) => c[0] === "fromTo");
  assert.deepEqual([t[2].y, t[3].duration, t[3].stagger], [12, 0.35, 0.06]);
  calls.length = 0; let done = 0;
  a.exitItems([{}], () => (done += 1), { x: 24, y: 0 });
  assert.equal(done, 0);
  t = calls.find((c) => c[0] === "to");
  assert.deepEqual([t[2].opacity, t[2].x, t[2].y, t[2].duration], [0, 24, 0, 0.25]);
  t[2].onComplete(); assert.equal(done, 1);
});

test("exit is immediate with no items, reduced motion or no GSAP", async () => {
  let a = await load(); let done = 0;
  a.exitItems([], () => (done += 1)); assert.equal(done, 1);
  reduced = true; a = await load();
  a.exitItems([{}], () => (done += 1)); assert.equal(done, 2);
  assert.equal(calls.length, 0);
  assert.equal(done, 2);
  let bareDone = 0; bare.exitItems([{}], () => (bareDone += 1)); assert.equal(bareDone, 1);
});

test("revealCards can reveal immediately and use its own id and selector (Saved plans, Planner rows)", async () => {
  const a = await load(); const seen = new Set();
  const li = (id) => ({ id });
  const container = { querySelectorAll: (s) => { assert.equal(s, ".plan-grid > li"); return [li("a"), li("b"), li(null)]; } };
  a.revealCards(container, seen, { item: ".plan-grid > li", id: (el) => el.id, scroll: false });
  assert.equal(calls.filter((c) => c[0] === "batch").length, 0, "no scroll trigger when scroll is false");
  assert.equal(calls.find((c) => c[0] === "fromTo")[1].length, 2, "the item with no id is skipped");
  assert.deepEqual([...seen], ["a", "b"]);
  calls.length = 0;
  a.revealCards(container, seen, { item: ".plan-grid > li", id: (el) => el.id, scroll: false });
  assert.equal(calls.length, 0, "nothing new, nothing animated");
});

test("a delayed count-up shows the starting value first, so the final number never flashes", async () => {
  const a = await load();
  const el = { textContent: "21h 36m" };
  a.countUp(el, 0, 1296, "minutes", {}, 0.45);
  assert.equal(el.textContent, "0m");
  const vars = calls.find((c) => c[0] === "to")[2];
  assert.equal(vars.delay, 0.45);
  vars.onComplete();
  assert.equal(el.textContent, "21h 36m");
  const plain = { textContent: "5" };
  calls.length = 0; a.countUp(plain, 0, 5, "number");
  assert.equal(plain.textContent, "5", "no delay, no reset");
});

/* ---------- The logo ---------- */

function fakeMark() {
  const path = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  const svg = { querySelector: () => path };
  const handlers = {};
  const brand = { addEventListener: (type, fn) => (handlers[type] = fn) };
  return { path, handlers, mark: { querySelector: () => svg, closest: () => brand }, svg };
}

test("the logo draws itself once per visit and tilts on hover", async () => {
  const a = await load();
  const first = fakeMark();
  a.animateLogo(first.mark);
  assert.equal(first.path.attrs.pathLength, "1");
  const set = calls.find((c) => c[0] === "set");
  assert.deepEqual(set[2], { strokeDasharray: 1, strokeDashoffset: 1 });
  assert.ok(calls.some((c) => c[0] === "timeline"));
  assert.equal(session.get("wnp:logo-played"), "1");

  // Hover and focus tilt the moon, leaving straightens it.
  calls.length = 0;
  first.handlers.mouseenter();
  assert.equal(calls.find((c) => c[0] === "to")[2].rotate, -18);
  calls.length = 0; first.handlers.mouseleave();
  assert.equal(calls.find((c) => c[0] === "to")[2].rotate, 0);
  calls.length = 0; first.handlers.focus(); assert.equal(calls.find((c) => c[0] === "to")[2].rotate, -18);

  // On the next page of the same visit it does not draw again, but still tilts.
  calls.length = 0;
  const second = fakeMark();
  a.animateLogo(second.mark);
  assert.equal(calls.some((c) => c[0] === "timeline" || c[0] === "set"), false);
  assert.equal(typeof second.handlers.mouseenter, "function");
});

test("the logo does nothing without motion or without a drawing", async () => {
  reduced = true;
  let a = await load();
  const f = fakeMark();
  a.animateLogo(f.mark);
  assert.equal(calls.length, 0);
  assert.deepEqual(f.handlers, {});
  reduced = false; a = await load();
  a.animateLogo(null); a.animateLogo({ querySelector: () => null });
  assert.equal(calls.length, 0);
});

/* ---------- Drag to reorder ---------- */

function fakeList(count, { connected = false } = {}) {
  const rows = Array.from({ length: count }, (_, i) => {
    const handle = { i };
    const row = {
      dataset: { id: String(100 + i) },
      classList: { added: [], add(c) { this.added.push(c); }, remove(c) { this.added = this.added.filter((x) => x !== c); } },
      rect: { top: i * 116, height: 100 }, // 100 tall with a 16 gap
      getBoundingClientRect() { return this.rect; },
      querySelector: () => handle,
    };
    return row;
  });
  let stillThere = connected;
  const list = {
    querySelectorAll: () => rows,
    getBoundingClientRect: () => ({ top: 0 }),
    contains: () => stillThere,
    querySelector: () => ({ placed: true, getBoundingClientRect: () => ({ top: 0 }) }),
    reconnect: () => (stillThere = true),
  };
  return { rows, list };
}

test("sorting needs at least two rows and the Draggable plugin", async () => {
  const a = await load();
  assert.equal(typeof a.makeSortable(fakeList(1).list, () => {}), "function");
  assert.equal(created.length, 0);
  assert.equal(typeof bare.makeSortable(fakeList(3).list, () => {}), "function");
  assert.equal(created.length, 0);
});

test("each row gets a vertical Draggable that starts from its handle and stays inside the list", async () => {
  const a = await load();
  const { rows, list } = fakeList(3);
  const stop = a.makeSortable(list, () => {});
  assert.equal(created.length, 3);
  created.forEach((d, i) => {
    assert.equal(d.el, rows[i]);
    assert.equal(d.cfg.type, "y");
    assert.equal(d.cfg.bounds, list);
    assert.equal(d.cfg.trigger.i, i);
  });
  stop();
  assert.ok(created.every((d) => d.killed), "stopping removes dragging from every row");
});

test("dragging a row down makes the others slide aside, and releasing commits the new position", async () => {
  const a = await load();
  const { rows, list } = fakeList(3);
  const commits = [];
  a.makeSortable(list, (id, to) => commits.push([id, to]));
  const first = created[0].cfg;

  first.onPress();
  assert.deepEqual(rows[0].classList.added, ["is-dragging"]);
  rows[0].rect = { top: 150, height: 100 }; // dragged down past the middle of the second row
  calls.length = 0;
  first.onDrag();
  const slides = calls.filter((c) => c[0] === "to");
  assert.equal(slides.length, 2, "the two other rows get a target position");
  assert.equal(slides[0][1], rows[1]);
  assert.equal(slides[0][2].y, -116, "the second row moves up by one row plus the gap");
  assert.equal(slides[1][2].y, 0, "the third row stays");

  first.onRelease();
  assert.deepEqual(rows[0].classList.added, []);
  assert.equal(timers.length, 1);
  list.reconnect = undefined; // the page redraws the list, so the old row is gone
  timers[0]();
  assert.deepEqual(commits, [["100", 1]]);
  assert.ok(calls.some((c) => c[0] === "fromTo"), "the dropped row settles into place");
});

test("dropping a row where it started commits nothing and glides everything back", async () => {
  const a = await load();
  const { rows, list } = fakeList(3);
  const commits = [];
  a.makeSortable(list, (id, to) => commits.push([id, to]));
  const cfg = created[1].cfg;
  cfg.onPress();
  rows[1].rect = { top: 120, height: 100 }; // barely moved
  cfg.onDrag();
  calls.length = 0;
  cfg.onRelease();
  assert.equal(timers.length, 0, "no commit is scheduled");
  assert.deepEqual(commits, []);
  const back = calls.find((c) => c[0] === "to");
  assert.equal(back[1].length, 3);
  assert.equal(back[2].y, 0);
});

test("if the new order could not be saved the rows glide back instead of staying displaced", async () => {
  const a = await load();
  const { rows, list } = fakeList(3, { connected: true }); // the list was NOT redrawn after the commit
  a.makeSortable(list, () => {});
  const cfg = created[0].cfg;
  cfg.onPress(); rows[0].rect = { top: 260, height: 100 }; cfg.onDrag(); cfg.onRelease();
  calls.length = 0;
  timers[0]();
  const back = calls.find((c) => c[0] === "to");
  assert.ok(back && back[2].y === 0 && back[1].length === 3);
});

test("reduced motion still allows dragging, but the rows jump instead of sliding", async () => {
  reduced = true;
  const a = await load();
  const { rows, list } = fakeList(3);
  a.makeSortable(list, () => {});
  assert.equal(created.length, 3, "reordering is an action, not decoration");
  const cfg = created[0].cfg;
  cfg.onPress(); rows[0].rect = { top: 150, height: 100 }; calls.length = 0; cfg.onDrag();
  assert.equal(calls.find((c) => c[0] === "to")[2].duration, 0);
});
