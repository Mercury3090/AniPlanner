//Builds the shared header and footer on every page, wires up the mobile menu,
//and exposes a toast helper. Each page sets data-page on <body> so the matching nav link is marked with aria-current="page".

import { icon } from "./icons.js";
import { getDraft, onChange } from "./storage.js";
import { plural } from "./utils.js";
import { ambientGlow, animateLogo, pillPop, revealPageHeader, toastIn, toastOut } from "./animations.js";

const LINKS = [
  { key: "home", href: "index.html", label: "Home" },
  { key: "discover", href: "discover.html", label: "Discover" },
  { key: "planner", href: "planner.html", label: "Planner" },
  { key: "saved", href: "saved.html", label: "Saved" },
];

const MOBILE_QUERY = window.matchMedia("(max-width: 767px)");

//builds the header and marks the page you're on
function headerMarkup(current) {
  const items = LINKS.map((link) => {
    const active = link.key === current ? ' aria-current="page"' : "";
    const count = link.key === "planner" ? '<span class="nav-count" data-plan-count hidden></span>' : "";
    return `<li><a href="${link.href}"${active}>${link.label}${count}</a></li>`;
  }).join("");

  return `
    <div class="container site-header__inner">
      <a class="brand" href="index.html" aria-label="AniPlanner, home">
        <span class="brand__mark">${icon("moon")}</span>
        <span class="brand__name">Ani<b>Planner</b></span>
      </a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Open menu">
        ${icon("menu")}
      </button>
      <nav class="site-nav" id="site-nav" aria-label="Main">
        <ul>${items}</ul>
      </nav>
    </div>`;
}

//builds the footer
function footerMarkup() {
  const items = LINKS.map((l) => `<li><a href="${l.href}">${l.label}</a></li>`).join("");
  return `
    <div class="container site-footer__inner">
      <a class="brand" href="index.html" aria-label="AniPlanner, home">
        <span class="brand__mark">${icon("moon")}</span>
        <span class="brand__name">Ani<b>Planner</b></span>
      </a>
      <nav aria-label="Footer"><ul>${items}</ul></nav>
      <p style="margin:0">Anime data from <a href="https://tenrai.org" rel="noopener">Tenrai</a>, a mirror of MyAnimeList data.</p>
    </div>`;
}

//mobile menu: opens and closes. Escape, tapping a link, or going wider than mobile closes it too
function setupMenu(header) {
  const toggle = header.querySelector(".nav-toggle");
  const nav = header.querySelector(".site-nav");

  //open or close the menu and update the button
  function setOpen(open, { returnFocus = false } = {}) {
    nav.dataset.open = String(open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    toggle.innerHTML = icon(open ? "x" : "menu");
    if (!open && returnFocus) toggle.focus();
  }

  toggle.addEventListener("click", () => setOpen(nav.dataset.open !== "true"));
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a") && MOBILE_QUERY.matches) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && nav.dataset.open === "true") setOpen(false, { returnFocus: true });
  });
  MOBILE_QUERY.addEventListener("change", () => setOpen(false));
  setOpen(false);
}

/*--- Ambient glow ---*/

//the amber glow behind every page. just decoration, so screen readers skip it
function setupAmbient() {
  if (document.querySelector(".ambient")) return;
  const root = document.createElement("div");
  root.className = "ambient";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = '<span class="ambient__glow ambient__glow--a"></span><span class="ambient__glow ambient__glow--b"></span>';
  document.body.append(root);
  ambientGlow(root);
}

/*--- "View plan" pill ---*/

//Shown on the pages where titles are added, so the next step is always one tap away.
const PILL_PAGES = new Set(["home", "discover"]);
let pill = null;
let pillCount = 0;

//makes the View plan pill (only on pages where you add titles)
function setupPlanPill() {
  if (!PILL_PAGES.has(document.body.dataset.page ?? "")) return;
  pill = document.createElement("a");
  pill.className = "plan-pill";
  pill.href = "planner.html";
  pill.hidden = true;
  document.body.append(pill);
  updatePlanPill();
  onChange(updatePlanPill);
}

//keeps the pill's count right and hides it when the plan is empty
function updatePlanPill() {
  const count = getDraft().titleIds.length;
  const grew = count > pillCount;
  pill.hidden = count === 0;
  pill.setAttribute("aria-label", `View plan, ${plural(count, "title")}`);
  pill.innerHTML = `${icon("calendar")}<span>View plan</span><span class="nav-count" aria-hidden="true">${count}</span>`;
  document.body.classList.toggle("has-plan-pill", count > 0);

  //A small pop when a title is added (not when the page first loads with a plan already in it).
  if (grew && pillCount !== null) {
    pill.classList.remove("plan-pill--pop");
    //GSAP does the pop; if it is unavailable the CSS animation is the fallback.
    if (!pillPop(pill)) {
      void pill.offsetWidth;      //restart the animation
      pill.classList.add("plan-pill--pop");
    }
  }
  pillCount = count;
}

//number next to Planner in the nav
function updateCount() {
  const el = document.querySelector("[data-plan-count]");
  if (!el) return;
  const count = getDraft().titleIds.length;
  el.hidden = count === 0;
  el.textContent = String(count);
  el.setAttribute("aria-label", `${count} ${count === 1 ? "title" : "titles"} in your plan`);
}

//small message at the bottom of the screen, with an optional button (like Undo).
//tone is "success" (green tick) or "removed" (red minus). goes away after 4 seconds by default
export function showToast(message, { action, duration = 4000, tone = "success" } = {}) {
  let region = document.querySelector(".toast-region");
  if (!region) {
    region = document.createElement("div");
    region.className = "toast-region";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    document.body.append(region);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast--${tone}`;
  toast.innerHTML = `${icon(tone === "removed" ? "circle-minus" : "circle-check")}<span></span>`;
  toast.querySelector("span").textContent = message;

  if (action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn--text btn--small";
    button.textContent = action.label;
    button.addEventListener("click", () => {
      action.onClick();
      toastOut(toast, () => toast.remove());
    });
    toast.append(button);
  }

  region.append(toast);
  toastIn(toast);
  window.setTimeout(() => toastOut(toast, () => toast.remove()), duration);
  return toast;
}

//runs on every page: I build the header and footer here, start the glow and keep the plan count updated
function init() {
  const current = document.body.dataset.page ?? "";
  const header = document.getElementById("site-header");
  const footer = document.getElementById("site-footer");

  if (header) {
    header.classList.add("site-header");
    header.innerHTML = headerMarkup(current);
    setupMenu(header);
    animateLogo(header.querySelector(".brand__mark"));
  }
  if (footer) {
    footer.classList.add("site-footer");
    footer.innerHTML = footerMarkup();
  }

  setupAmbient();
  revealPageHeader();
  updateCount();
  onChange(updateCount);
  pillCount = getDraft().titleIds.length;
  setupPlanPill();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
