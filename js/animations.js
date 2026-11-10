// All GSAP animation lives here, so the page scripts only say WHEN something should
// animate and this file decides HOW.
//
// Rules every animation follows:
//   1. Nothing is ever left hidden. If GSAP did not load, every function does nothing
//      and the page is already fully visible.
//   2. If the visitor prefers reduced motion, movement is dropped. Text still appears
//      (a quick fade for the hero), and nothing slides, scales or counts.
//   3. Layout is never animated (no width, height, top, left or margin). Motion is transform and
//      opacity, plus the stroke of the logo's SVG moon, so it stays smooth.
//
// GSAP and ScrollTrigger are loaded by <script> tags (js/vendor) and found on window.

import { dropIndex, shiftsFor } from "./planner-core.js";
import { formatMinutes } from "./utils.js";

const win = typeof window !== "undefined" ? window : undefined;
const g = win?.gsap;
const ST = win?.ScrollTrigger;
const Drag = win?.Draggable;
if (g && ST) g.registerPlugin(ST);
if (g && Drag) g.registerPlugin(Drag);

function prefersReducedMotion() {
  return Boolean(win?.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/** True when GSAP is available and the visitor has not asked for reduced motion. */
export function motionAllowed() {
  return Boolean(g) && !prefersReducedMotion();
}

/** The hero text starts hidden only while GSAP is about to reveal it (see the class on <html>). */
function endHeroHold() {
  win?.document?.documentElement.classList.remove("has-motion");
}

/* ---------- 1. Hero reveal (timeline) ---------- */

/**
 * Home page hero: headline, lead, buttons, then the posters rise in one after
 * another. About one second in total.
 */
export function revealHero() {
  const text = [".hero__title", ".hero__lead", ".hero__actions", ".hero__moon"];
  if (!g) {
    endHeroHold();
    return null;
  }
  if (prefersReducedMotion()) {
    endHeroHold();
    g.fromTo(text, { opacity: 0 }, { opacity: 1, duration: 0.2 });
    return null;
  }

  // The hand-drawn underline under "watch night" is drawn in with its stroke.
  const underline = win.document.querySelector(".hero__underline path");
  if (underline) {
    underline.setAttribute("pathLength", "100"); // 100, not 1: GSAP rounds to whole numbers, so 0 to 1 would just pop
    g.set(underline, { strokeDasharray: "100 1000", strokeDashoffset: 100 }); // a long gap, so the pattern can never wrap round and show a sliver or a dot
  }

  const rise = { y: 0, opacity: 1, clearProps: "transform" };
  const tl = g.timeline({ defaults: { ease: "power3.out" } });
  tl.fromTo(".hero__moon", { y: 12, opacity: 0 }, { ...rise, duration: 1.2, ease: "power2.out" }, 0)
    .fromTo(".hero__title", { y: 30, opacity: 0 }, { ...rise, duration: 0.8 }, 0)
    .fromTo(".hero__lead", { y: 30, opacity: 0 }, { ...rise, duration: 0.8 }, 0.1)
    .fromTo(".hero__actions", { y: 30, opacity: 0 }, { ...rise, duration: 0.8 }, 0.2)
    .fromTo(".hero-poster", { y: 30, opacity: 0 }, { ...rise, duration: 0.6, stagger: 0.08 }, 0.3);
  if (underline) {
    tl.to(underline, { strokeDashoffset: 0, duration: 0.7, ease: "power2.inOut", clearProps: "strokeDasharray,strokeDashoffset" }, 0.6);
  }
  tl.eventCallback("onComplete", endHeroHold);
  return tl;
}

/* ---------- 2. Cards and steps rise in as they scroll into view (ScrollTrigger) ---------- */

/**
 * Items fade up and in as they reach the lower part of the screen, in small groups.
 * Items already on screen animate straight away.
 * @param {ArrayLike<Element>} items
 */
export function revealOnScroll(items) {
  const list = Array.from(items ?? []);
  if (!list.length || !motionAllowed()) return;

  g.set(list, { opacity: 0, y: 24 });
  const show = (batch) =>
    g.to(batch, { opacity: 1, y: 0, duration: 0.5, stagger: 0.08, ease: "power2.out", overwrite: true, clearProps: "transform" });

  if (ST) ST.batch(list, { start: "top 88%", once: true, onEnter: show });
  else show(list);
}

/**
 * Animates only the items that have not been seen yet, so loading more (or redrawing
 * a list) never replays the animation for items already on screen.
 *
 * @param {ParentNode} container
 * @param {Set<string>} seen ids already animated; updated in place
 * @param {{item?: string, id?: (el: Element) => string | null | undefined, scroll?: boolean}} [options]
 *   item: selector for the items; id: how to read an item's id (skeletons have none and are skipped);
 *   scroll: reveal as they scroll into view (true) or straight away (false)
 */
export function revealCards(container, seen, { item = ".card-grid__item", id = (el) => el.querySelector("[data-id]")?.dataset.id, scroll = true } = {}) {
  const fresh = [];
  for (const el of container.querySelectorAll(item)) {
    const key = id(el);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    fresh.push(el);
  }
  if (scroll) revealOnScroll(fresh);
  else enterItems(fresh);
}

/** Items slide up and fade in straight away (for lists near the top of a page). */
export function enterItems(items) {
  const list = Array.from(items ?? []);
  if (!list.length || !motionAllowed()) return;
  g.fromTo(list, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.06, ease: "power2.out", clearProps: "transform" });
}

/**
 * Items ease out, then done() runs (that is where the real removal happens).
 * Without motion, done() runs at once.
 * @param {ArrayLike<Element>} items
 * @param {() => void} done
 * @param {{x?: number, y?: number, stagger?: number}} [options]
 */
export function exitItems(items, done, { x = 0, y = -6, stagger = 0.04 } = {}) {
  const list = Array.from(items ?? []);
  if (!list.length || !motionAllowed()) {
    done();
    return;
  }
  g.to(list, { opacity: 0, x, y, scale: 0.97, duration: 0.25, stagger, ease: "power1.in", onComplete: done });
}

/* ---------- 3. Skeleton to content (crossfade) ---------- */

/**
 * Swaps a skeleton for real content. A copy of the skeleton is laid over the
 * container and fades out while the new content fades in, so nothing jumps.
 * @param {HTMLElement} container
 * @param {() => void} update puts the real content in the container
 * @param {{fadeContent?: boolean}} [options] set fadeContent false when the content animates itself
 */
export function crossfade(container, update, { fadeContent = true } = {}) {
  if (!motionAllowed() || !container.querySelector?.(".skeleton") || !container.parentElement) {
    update();
    return;
  }

  const host = container.parentElement;
  if (win.getComputedStyle(host).position === "static") host.style.position = "relative";

  const ghost = container.cloneNode(true);
  ghost.removeAttribute("id");
  ghost.removeAttribute("aria-busy");
  ghost.removeAttribute("aria-label");
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    position: "absolute",
    top: `${container.offsetTop}px`,
    left: `${container.offsetLeft}px`,
    width: `${container.offsetWidth}px`,
    height: `${container.offsetHeight}px`,
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: "1",
  });
  host.append(ghost);

  update();

  g.to(ghost, { opacity: 0, duration: 0.4, ease: "sine.inOut", onComplete: () => ghost.remove() });
  if (fadeContent) g.fromTo(container, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "sine.inOut", clearProps: "opacity" });
}

/* ---------- 4. Planner: evenings fill, numbers count up ---------- */

/** The progress bar in each evening grows from the left, one evening after another. */
export function fillEvenings(container) {
  const bars = container.querySelectorAll?.(".evening__fill") ?? [];
  if (!bars.length || !motionAllowed()) return;
  g.fromTo(
    bars,
    { scaleX: 0 },
    {
      scaleX: 1,
      duration: 0.6,
      ease: "back.out(1.4)",
      stagger: Math.min(0.1, 0.8 / bars.length),
      transformOrigin: "left center",
      clearProps: "transform",
    }
  );
}

/**
 * Text for a counted number at a given moment.
 * @param {"minutes" | "number"} kind
 * @param {number} value
 * @param {{prefix?: string, suffix?: string}} [parts]
 */
export function formatCount(kind, value, { prefix = "", suffix = "" } = {}) {
  const body = kind === "minutes" ? formatMinutes(value) : String(Math.round(value));
  return `${prefix}${body}${suffix}`;
}

/**
 * Counts a number up (or down) to its new value. The element already holds the
 * final text, so reduced motion and failures simply leave it as it is.
 * @param {HTMLElement} el
 * @param {number} from
 * @param {number} to
 * @param {"minutes" | "number"} kind
 * @param {{prefix?: string, suffix?: string}} [parts]
 * @param {number} [delay] seconds to wait before counting starts
 */
export function countUp(el, from, to, kind, parts = {}, delay = 0) {
  if (!motionAllowed() || from === to) return;
  const finalText = el.textContent;
  const counter = { v: from };
  if (delay > 0) el.textContent = formatCount(kind, from, parts);
  g.to(counter, {
    v: to,
    delay,
    duration: 0.8,
    ease: "power1.out",
    onUpdate: () => {
      el.textContent = formatCount(kind, counter.v, parts);
    },
    onComplete: () => {
      el.textContent = finalText;
    },
  });
}

/* ---------- 5. Confirmations: button icon, toast, View plan pill ---------- */

/** A small pop on the icon of an Add / Added button. */
export function popIcon(button) {
  const icon = button?.querySelector?.(".icon");
  if (!icon || !motionAllowed()) return;
  g.fromTo(icon, { scale: 0.5 }, { scale: 1, duration: 0.3, ease: "back.out(2)", clearProps: "transform" });
}

/** A toast slides up into place. */
export function toastIn(toast) {
  if (!motionAllowed()) return;
  g.from(toast, { y: 16, opacity: 0, duration: 0.3, ease: "power2.out", clearProps: "transform,opacity" });
}

/** A toast fades away, then calls done. Without motion it is removed at once. */
export function toastOut(toast, done) {
  if (!motionAllowed()) {
    done();
    return;
  }
  g.to(toast, { y: 8, opacity: 0, duration: 0.2, ease: "power1.in", onComplete: done });
}

/**
 * The View plan pill pops when a title is added.
 * @returns {boolean} true when GSAP handled it (so the CSS fallback is not needed)
 */
export function pillPop(pill) {
  if (!motionAllowed()) return false;
  g.fromTo(pill, { y: 14, scale: 0.9, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.35, ease: "back.out(1.7)", clearProps: "transform,opacity" });
  return true;
}

/* ---------- 6. Page headers: every page opens the same way ---------- */

/**
 * The heading and intro of Discover, Planner and Saved plans rise in together.
 * Elements opt in with data-header-reveal. They are held hidden only while GSAP is
 * about to reveal them (the has-motion class), and released after four seconds at most.
 */
export function revealPageHeader() {
  const targets = Array.from(win?.document?.querySelectorAll("[data-header-reveal]") ?? []);
  if (!targets.length) return null;
  if (!motionAllowed()) {
    endHeroHold();
    return null;
  }
  return g.fromTo(
    targets,
    { y: 16, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.5, stagger: 0.08, ease: "power2.out", clearProps: "transform", onComplete: endHeroHold }
  );
}

/* ---------- 7. Detail page: a timeline of the page arriving ---------- */

/**
 * Poster, title and badges, runtime strip, then the Add button arrive in sequence.
 * The sections below reveal as they scroll into view.
 * @param {ParentNode} root
 * @returns {object | null} the timeline
 */
export function revealDetail(root) {
  if (!motionAllowed()) return null;
  const pick = (selector) => root.querySelectorAll(selector);
  const rise = { y: 0, opacity: 1, clearProps: "transform" };
  const from = { y: 24, opacity: 0 };

  const tl = g.timeline({ defaults: { ease: "power3.out" } });
  tl.fromTo(pick(".detail__poster"), from, { ...rise, duration: 0.6 }, 0)
    .fromTo(pick(".detail__title, .detail__summary .cluster"), from, { ...rise, duration: 0.6, stagger: 0.08 }, 0.1)
    .fromTo(pick(".runtime-strip, .runtime-note"), from, { ...rise, duration: 0.6, stagger: 0.08 }, 0.25)
    .fromTo(pick(".detail__actions"), from, { ...rise, duration: 0.6 }, 0.4);
  revealOnScroll(pick(".detail__section:not(#related)"));
  return tl;
}

/* ---------- 8. Logo: an SVG moon that draws itself ---------- */

const LOGO_FLAG = "wnp:logo-played";

/**
 * The moon and sparkle in the logo draw themselves once per visit (not on every page),
 * and the moon tilts when the logo is hovered or focused.
 * @param {Element | null} mark the .brand__mark element in the header
 */
export function animateLogo(mark) {
  const svg = mark?.querySelector?.("svg");
  const paths = Array.from(svg?.querySelectorAll?.("path") ?? []);
  if (!paths.length || !motionAllowed()) return;

  let alreadyPlayed = false;
  try {
    alreadyPlayed = win.sessionStorage.getItem(LOGO_FLAG) === "1";
    win.sessionStorage.setItem(LOGO_FLAG, "1");
  } catch {
    // Storage blocked: it simply plays every time.
  }

  if (!alreadyPlayed) {
    for (const path of paths) path.setAttribute("pathLength", "100"); // the same dash maths for any drawing (100, because GSAP rounds to whole numbers)
    g.set(paths, { strokeDasharray: "100 1000", strokeDashoffset: 100 });
    g.timeline()
      .fromTo(mark, { scale: 0.85 }, { scale: 1, duration: 0.45, ease: "back.out(2)", clearProps: "transform" }, 0)
      .to(paths[0], { strokeDashoffset: 0, duration: 0.9, ease: "power2.inOut", clearProps: "strokeDasharray,strokeDashoffset" }, 0)
      // The sparkle is drawn last, as the moon finishes.
      .to(paths.slice(1), { strokeDashoffset: 0, duration: 0.4, ease: "power2.out", clearProps: "strokeDasharray,strokeDashoffset" }, 0.7);
  }

  const brand = mark.closest("a");
  const tilt = (angle) => g.to(svg, { rotate: angle, duration: 0.4, ease: "power2.out", overwrite: "auto" });
  brand?.addEventListener("mouseenter", () => tilt(-18));
  brand?.addEventListener("mouseleave", () => tilt(0));
  brand?.addEventListener("focus", () => tilt(-18));
  brand?.addEventListener("blur", () => tilt(0));
}

/* ---------- 9. Drag to reorder (Draggable) ---------- */

/**
 * Makes the rows of a list reorderable by dragging their handles. While a row is
 * dragged the others slide aside to make room. On release the new position is
 * handed to onCommit, and the dropped row settles into its place.
 *
 * Rows need a [data-id] and a [data-handle] button. Pointer dragging is an
 * enhancement: reordering with the keyboard is handled by the page itself.
 *
 * @param {HTMLElement} list
 * @param {(id: string, toIndex: number) => void} onCommit
 * @returns {() => void} call to remove all dragging from the list
 */
export function makeSortable(list, onCommit) {
  if (!g || !Drag) return () => {};
  const rows = Array.from(list.querySelectorAll(".title-row[data-id]"));
  if (rows.length < 2) return () => {};

  const slide = prefersReducedMotion() ? 0 : 0.2;
  let layout = null; // measured when a drag starts

  const measure = (from) => {
    const listTop = list.getBoundingClientRect().top;
    const rects = rows.map((row) => row.getBoundingClientRect());
    return {
      from,
      to: from,
      heights: rects.map((r) => r.height),
      mids: rects.map((r) => r.top - listTop + r.height / 2),
      gap: parseFloat(win.getComputedStyle(list).rowGap) || 16,
    };
  };

  const instances = rows.map((row, index) =>
    Drag.create(row, {
      trigger: row.querySelector("[data-handle]"),
      type: "y",
      bounds: list,
      zIndexBoost: true,
      edgeResistance: 0.85,
      cursor: "grab",
      activeCursor: "grabbing",
      onPress() {
        layout = measure(index);
        row.classList.add("is-dragging");
      },
      onDrag() {
        const listTop = list.getBoundingClientRect().top;
        const rect = row.getBoundingClientRect();
        const to = dropIndex(layout.mids, layout.from, rect.top - listTop + rect.height / 2);
        if (to === layout.to) return;
        layout.to = to;
        const shifts = shiftsFor(layout.heights, layout.gap, layout.from, to);
        rows.forEach((other, i) => {
          if (i !== layout.from) g.to(other, { y: shifts[i], duration: slide, ease: "power2.out", overwrite: "auto" });
        });
      },
      onRelease() {
        if (!layout) return;
        const { from, to } = layout;
        layout = null;
        row.classList.remove("is-dragging");

        if (from === to) {
          // Dropped where it started: glide back and clear everything.
          g.to(rows, { y: 0, duration: slide, ease: "power2.out", overwrite: "auto", clearProps: "transform,zIndex" });
          return;
        }

        // Commit the new order (this redraws the list in the new order), then glide the
        // dropped row from where it was released into its real place. Done on the next
        // tick so we are not tearing the drag down from inside its own callback.
        const id = row.dataset.id;
        const releasedTop = row.getBoundingClientRect().top;
        win.setTimeout(() => {
          onCommit(id, to);
          if (list.contains(row)) {
            // The order was not saved (the list was not redrawn), so put everything back.
            g.to(rows, { y: 0, duration: slide, ease: "power2.out", overwrite: "auto", clearProps: "transform,zIndex" });
            return;
          }
          const placed = list.querySelector(`.title-row[data-id="${id}"]`);
          if (placed && slide > 0) {
            const delta = releasedTop - placed.getBoundingClientRect().top;
            g.fromTo(placed, { y: delta }, { y: 0, duration: 0.25, ease: "power2.out", clearProps: "transform" });
          }
        }, 0);
      },
    })[0]
  );

  return () => instances.forEach((d) => d?.kill());
}

/* ---------- 10. Ambient glow: a warm tint that drifts across the page as you scroll ---------- */

/**
 * Two soft amber glows sit fixed behind the page and drift across it as you scroll, so
 * different parts of the page pick up a warm tint. They are tied to the scroll position
 * (ScrollTrigger scrub), so they stop when you stop. Without motion they stay where the CSS
 * puts them.
 * @param {Element | null} root the .ambient element
 */
export function ambientGlow(root) {
  if (!motionAllowed() || !ST || !root) return null;
  const a = root.querySelector(".ambient__glow--a");
  const b = root.querySelector(".ambient__glow--b");
  if (!a || !b) return null;

  // Positions are functions of the window size, so they are recalculated on resize.
  const x = (percent) => () => win.innerWidth * (percent / 100);
  const y = (percent) => () => win.innerHeight * (percent / 100);
  // The home page hero already has its own glow, so the first one starts faint there.
  const startA = win.document?.body?.dataset?.page === "home" ? 0.25 : 1;

  const tl = g.timeline({
    defaults: { ease: "none" },
    scrollTrigger: {
      start: 0,
      end: () => Math.max(1, ST.maxScroll(win)),
      scrub: 1,
      invalidateOnRefresh: true,
    },
  });
  tl.fromTo(a, { x: x(85), y: y(12), opacity: startA }, { x: x(10), y: y(48), opacity: 1, duration: 1 }, 0)
    .to(a, { x: x(88), y: y(90), opacity: 0.7, duration: 1 }, 1)
    .fromTo(b, { x: x(12), y: y(85), opacity: 0.4 }, { x: x(62), y: y(40), opacity: 0.95, duration: 1 }, 0)
    .to(b, { x: x(92), y: y(8), opacity: 0.45, duration: 1 }, 1);

  // Pages grow as their content loads, so work out the scroll length again when they do.
  if (typeof win.ResizeObserver === "function") {
    let timer;
    new win.ResizeObserver(() => {
      win.clearTimeout(timer);
      timer = win.setTimeout(() => ST.refresh(), 200);
    }).observe(win.document.body);
  }
  return tl;
}
