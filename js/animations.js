// All GSAP animation lives here, so the page scripts only say WHEN something should
// animate and this file decides HOW.
//
// Rules every animation follows:
//   1. Nothing is ever left hidden. If GSAP did not load, every function does nothing
//      and the page is already fully visible.
//   2. If the visitor prefers reduced motion, movement is dropped. Text still appears
//      (a quick fade for the hero), and nothing slides, scales or counts.
//   3. Only transform and opacity are animated, so motion stays smooth.
//
// GSAP and ScrollTrigger are loaded by <script> tags (js/vendor) and found on window.

import { formatMinutes } from "./utils.js";

const win = typeof window !== "undefined" ? window : undefined;
const g = win?.gsap;
const ST = win?.ScrollTrigger;
if (g && ST) g.registerPlugin(ST);

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
  const text = [".hero__title", ".hero__lead", ".hero__actions"];
  if (!g) {
    endHeroHold();
    return null;
  }
  if (prefersReducedMotion()) {
    endHeroHold();
    g.fromTo(text, { opacity: 0 }, { opacity: 1, duration: 0.2 });
    return null;
  }

  const tl = g.timeline({ defaults: { ease: "power3.out" } });
  tl.fromTo(".hero__title", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, clearProps: "transform" }, 0)
    .fromTo(".hero__lead", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, clearProps: "transform" }, 0.1)
    .fromTo(".hero__actions", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, clearProps: "transform" }, 0.2)
    .fromTo(
      ".hero-poster",
      { y: 30, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.6, stagger: 0.08, clearProps: "transform" },
      0.3
    );
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
 * Animates only the cards that have not been seen yet, so loading more results (or
 * redrawing the list) never replays the animation for cards already on screen.
 * @param {ParentNode} container
 * @param {Set<string>} seen ids already animated; updated in place
 */
export function revealCards(container, seen) {
  const fresh = [];
  for (const item of container.querySelectorAll(".card-grid__item")) {
    const id = item.querySelector("[data-id]")?.dataset.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    fresh.push(item);
  }
  revealOnScroll(fresh);
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
 */
export function countUp(el, from, to, kind, parts = {}) {
  if (!motionAllowed() || from === to) return;
  const finalText = el.textContent;
  const counter = { v: from };
  g.to(counter, {
    v: to,
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
