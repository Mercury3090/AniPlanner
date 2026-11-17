//all the GSAP animation. pages say when to animate, this file says how.
//rules:
// - if GSAP doesn't load, nothing animates and the page is just visible
// - reduced motion = no sliding, scaling or counting
// - only transform and opacity (plus SVG stroke), never width/height/top etc.
//GSAP, ScrollTrigger and Draggable come from <script> tags in js/vendor.

import { dropIndex, shiftsFor } from "./planner-core.js";
import { formatMinutes } from "./utils.js";

const win = typeof window !== "undefined" ? window : undefined;
const g = win?.gsap;
const ST = win?.ScrollTrigger;
const Drag = win?.Draggable;
if (g && ST) g.registerPlugin(ST);
if (g && Drag) g.registerPlugin(Drag);

//check if the visitor turned on reduced motion
function prefersReducedMotion() {
  return Boolean(win?.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

//true if GSAP loaded and reduced motion is off
export function motionAllowed() {
  return Boolean(g) && !prefersReducedMotion();
}

//un-hide the hero text (it's hidden by the has-motion class until GSAP shows it)
function endHeroHold() {
  win?.document?.documentElement.classList.remove("has-motion");
}

/*--- 1. Hero reveal (timeline) ---*/

//home hero: moon, headline, text, buttons, then posters rise in. about 1.3 seconds
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

  //draw in the underline under "watch night"
  const underline = win.document.querySelector(".hero__underline path");
  if (underline) {
    underline.setAttribute("pathLength", "100");        //100, not 1: GSAP rounds to whole numbers, so 0 to 1 would just pop
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

/*--- 2. Cards and steps rise in as they scroll into view (ScrollTrigger) ---*/

//fade items up as they scroll into view (ones already on screen go straight away)
export function revealOnScroll(items) {
  const list = Array.from(items ?? []);
  if (!list.length || !motionAllowed()) return;

  g.set(list, { opacity: 0, y: 24 });
  //fade the cards in and lift them up one by one
  const show = (batch) =>
    g.to(batch, { opacity: 1, y: 0, duration: 0.5, stagger: 0.08, ease: "power2.out", overwrite: true, clearProps: "transform" });

  if (ST) ST.batch(list, { start: "top 88%", once: true, onEnter: show });
  else show(list);
}

//only animate items we haven't animated before, so Load more doesn't replay old cards.
//seen = set of ids already done. skeletons have no id so they're skipped.
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

//slide in straight away, for lists near the top of the page
export function enterItems(items) {
  const list = Array.from(items ?? []);
  if (!list.length || !motionAllowed()) return;
  g.fromTo(list, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.06, ease: "power2.out", clearProps: "transform" });
}

//animate items out, then call done() which actually removes them (no motion = done() straight away)
export function exitItems(items, done, { x = 0, y = -6, stagger = 0.04 } = {}) {
  const list = Array.from(items ?? []);
  if (!list.length || !motionAllowed()) {
    done();
    return;
  }
  g.to(list, { opacity: 0, x, y, scale: 0.97, duration: 0.25, stagger, ease: "power1.in", onComplete: done });
}

/*--- 3. Skeleton to content (crossfade) ---*/

//swap fake loading cards for real content without a jump: a copy of the skeleton sits on top and fades out while the real content comes in underneath.
//fadeContent false = the content has its own animation
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

/*--- 4. Planner: evenings fill, numbers count up ---*/

//each evening's bar grows from the left, one after another
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

//the text shown while a number is counting (minutes like 2h 30m, or a plain number)
export function formatCount(kind, value, { prefix = "", suffix = "" } = {}) {
  const body = kind === "minutes" ? formatMinutes(value) : String(Math.round(value));
  return `${prefix}${body}${suffix}`;
}

//count a number up (or down). the element already has the final text in it,
//so if there's no motion it just stays as it is
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

/*--- 5. Confirmations: button icon, toast, View plan pill ---*/

//little pop on the Add button icon
export function popIcon(button) {
  const icon = button?.querySelector?.(".icon");
  if (!icon || !motionAllowed()) return;
  g.fromTo(icon, { scale: 0.5 }, { scale: 1, duration: 0.3, ease: "back.out(2)", clearProps: "transform" });
}

//toast slides up
export function toastIn(toast) {
  if (!motionAllowed()) return;
  g.from(toast, { y: 16, opacity: 0, duration: 0.3, ease: "power2.out", clearProps: "transform,opacity" });
}

//toast fades out, then done() removes it
export function toastOut(toast, done) {
  if (!motionAllowed()) {
    done();
    return;
  }
  g.to(toast, { y: 8, opacity: 0, duration: 0.2, ease: "power1.in", onComplete: done });
}

//View plan pill pops when a title is added. returns false if GSAP isn't there, so the CSS version runs
export function pillPop(pill) {
  if (!motionAllowed()) return false;
  g.fromTo(pill, { y: 14, scale: 0.9, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.35, ease: "back.out(1.7)", clearProps: "transform,opacity" });
  return true;
}

/*--- 6. Page headers: every page opens the same way ---*/

//page headings on Discover, Planner and Saved rise in (anything with data-header-reveal).
//hidden by has-motion until this runs, max 4 seconds
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

/*--- 7. Detail page: a timeline of the page arriving ---*/

//detail page: poster, title, runtime strip, then Add button in order. sections below come in on scroll
export function revealDetail(root) {
  if (!motionAllowed()) return null;
  //grab elements inside the detail page
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

/*--- 8. Logo: an SVG moon that draws itself ---*/

const LOGO_FLAG = "wnp:logo-played";

//logo moon and sparkle draw themselves once per visit (not every page).
//tilts on hover or focus
export function animateLogo(mark) {
  const svg = mark?.querySelector?.("svg");
  const paths = Array.from(svg?.querySelectorAll?.("path") ?? []);
  if (!paths.length || !motionAllowed()) return;

  let alreadyPlayed = false;
  try {
    alreadyPlayed = win.sessionStorage.getItem(LOGO_FLAG) === "1";
    win.sessionStorage.setItem(LOGO_FLAG, "1");
  } catch {
    //Storage blocked: it simply plays every time.
  }

  if (!alreadyPlayed) {
    for (const path of paths) path.setAttribute("pathLength", "100"); // the same dash maths for any drawing (100, because GSAP rounds to whole numbers)
    g.set(paths, { strokeDasharray: "100 1000", strokeDashoffset: 100 });
    g.timeline()
      .fromTo(mark, { scale: 0.85 }, { scale: 1, duration: 0.45, ease: "back.out(2)", clearProps: "transform" }, 0)
      .to(paths[0], { strokeDashoffset: 0, duration: 0.9, ease: "power2.inOut", clearProps: "strokeDasharray,strokeDashoffset" }, 0)
      //The sparkle is drawn last, as the moon finishes.
      .to(paths.slice(1), { strokeDashoffset: 0, duration: 0.4, ease: "power2.out", clearProps: "strokeDasharray,strokeDashoffset" }, 0.7);
  }

  const brand = mark.closest("a");
  //little tilt on the logo
  const tilt = (angle) => g.to(svg, { rotate: angle, duration: 0.4, ease: "power2.out", overwrite: "auto" });
  brand?.addEventListener("mouseenter", () => tilt(-18));
  brand?.addEventListener("mouseleave", () => tilt(0));
  brand?.addEventListener("focus", () => tilt(-18));
  brand?.addEventListener("blur", () => tilt(0));
}

/*--- 9. Drag to reorder (Draggable) ---*/

//drag rows by their handle to reorder. other rows slide out of the way, and on release the new spot goes to onCommit. keyboard reordering is in planner.js.
//returns a function that turns dragging off again
export function makeSortable(list, onCommit) {
  if (!g || !Drag) return () => {};
  const rows = Array.from(list.querySelectorAll(".title-row[data-id]"));
  if (rows.length < 2) return () => {};

  const slide = prefersReducedMotion() ? 0 : 0.2;
  let layout = null; // measured when a drag starts

  //note where each row sits and how tall it is
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
          //Dropped where it started: glide back and clear everything.
          g.to(rows, { y: 0, duration: slide, ease: "power2.out", overwrite: "auto", clearProps: "transform,zIndex" });
          return;
        }

        //save the new order (which redraws the list), then slide the row from where it
        //was dropped into its new spot. setTimeout 0 so we're not redrawing inside Draggable's own callback
        const id = row.dataset.id;
        const releasedTop = row.getBoundingClientRect().top;
        win.setTimeout(() => {
          onCommit(id, to);
          if (list.contains(row)) {
            //The order was not saved (the list was not redrawn), so put everything back.
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

/*--- 10. Ambient glow: a warm tint that drifts across the page as you scroll ---*/

//two amber glows behind the page that drift as you scroll (scrub, so they stop when you stop).
//no motion = they stay where the CSS puts them
export function ambientGlow(root) {
  if (!motionAllowed() || !ST || !root) return null;
  const a = root.querySelector(".ambient__glow--a");
  const b = root.querySelector(".ambient__glow--b");
  if (!a || !b) return null;

  //% of the screen width -> pixels (functions so they update on resize)
  const x = (percent) => () => win.innerWidth * (percent / 100);
  //% of the screen height -> pixels
  const y = (percent) => () => win.innerHeight * (percent / 100);
  //The home page hero already has its own glow, so the first one starts faint there.
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

  //Pages grow as their content loads, so work out the scroll length again when they do.
  if (typeof win.ResizeObserver === "function") {
    let timer;
    new win.ResizeObserver(() => {
      win.clearTimeout(timer);
      timer = win.setTimeout(() => ST.refresh(), 200);
    }).observe(win.document.body);
  }
  return tl;
}
