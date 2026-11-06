# AniPlanner

AniPlanner helps anime fans choose what they feel like watching, shows exactly how long it will take, and turns their picks into an evening-by-evening schedule with a finish date.

Built for Interactive Media 3B (Advanced Web Development with GSAP). It implements the design and technical specification (PRD) submitted for Assignment 4.

## Pages

| Page | File | Purpose |
| --- | --- | --- |
| Home | `index.html` | Introduces the idea, shows what is airing now, and starts a plan |
| Discover | `discover.html` | Search and filter by mood, genre and length, with runtime on every card |
| Anime detail | `anime.html?id=` | Episode count, minutes per episode, total runtime and Add to plan |
| Planner | `planner.html` | Total runtime, evenings needed and a finish date, based on the weekdays the user picks |
| Saved plans | `saved.html` | Plans saved in the browser, with open, delete and undo |

## Tech

- HTML, CSS and JavaScript (ES modules), no build step
- [GSAP](https://gsap.com) 3 with ScrollTrigger for motion, bundled in `js/vendor`
- [Tenrai](https://tenrai.org), a free keyless mirror of MyAnimeList data that serves the Jikan v4 format, for all anime data (the original public Jikan API closed on 1 October 2026)
- `localStorage` for the current plan and saved plans, `sessionStorage` for API caching

## Run locally

The site uses ES modules, so it must be served over HTTP. Opening the files directly with `file://` will not work.

```bash
# Option 1: VS Code
# Install the "Live Server" extension, then right-click index.html > Open with Live Server

# Option 2: Python
python3 -m http.server 8000
# then open http://localhost:8000
```

Run the unit tests (Node 18 or later):

```bash
npm test
```

## Project structure

```
index.html, discover.html, anime.html, planner.html, saved.html
css/
  tokens.css        Design tokens (colour, spacing, radius, type, layout)
  base.css          Reset, typography, layout primitives, accessibility helpers
  components.css    Buttons, inputs, chips, badges, cards, banners, skeletons, toasts, nav
  pages.css         Page-specific layout (Discover filters, card extras)
js/
  api.js            API client: request queue, cache, retry, data normalising
  planner-core.js   Runtime, totals and schedule maths (pure functions)
  storage.js        localStorage layer for the draft plan and saved plans
  utils.js          Duration parsing, formatting and helpers
  animations.js     All GSAP animation (timeline, ScrollTrigger, tweens), with reduced-motion handling
  vendor/           GSAP and ScrollTrigger, bundled so the site never depends on a CDN
  icons.js          Inline SVG icon set
  layout.js         Shared header and footer, mobile menu, toast helper
  moods.js          Mood, watch-time range and sort definitions for Discover
  ui.js             Markup builders: cards, badges, banners, empty states, skeletons
  detail.js         Pure helpers for the detail page (id parsing, runtime strip, trailer safety)
  plan-actions.js   Add or remove a title from the plan, with the Undo toast
  saved-model.js    Turns a saved plan into the numbers shown on its card (pure functions)
  pages/            One controller per page (home.js, discover.js, anime.js, planner.js, saved.js)
assets/             Favicon and images
tests/              Unit tests for the maths and the API client
```

## How the API is used

The API's public limit is about 3 requests per second and 60 per minute, so `js/api.js` handles this in one place. The address is a single constant (`BASE_URL`) at the top of that file:

- One queue starts requests at least 400 ms apart.
- Responses are cached for 10 minutes in `sessionStorage`.
- Identical requests made at the same time share one network call.
- A 429 or server error is retried once after 2 seconds, then reported.
- If a live request fails, recent cached results can still be shown.
- Every response is converted into one consistent shape before the interface uses it.

## The View plan pill

On Home, Discover and the detail pages, a "View plan" pill appears in the bottom-right corner as soon as the plan has a title. It shows how many titles are in the plan, pops when one is added, and links to the Planner. It matters most on a phone, where the navigation sits behind the menu button. Toasts stack above it so the two never overlap.

## How Home works

- The hero shows the three most popular titles as posters, and "Airing now" shows four titles from the current season. That is two API calls in total, and each fails on its own: if the posters can't load, the hero falls back to placeholders and the text still carries the page; if Airing now fails, it shows a red error banner with Retry.
- Airing now uses the same cards as Discover, so a title can be added to the plan straight from the home page.
- "Start a plan" goes to Discover, and "How it works" scrolls to the three-step explanation on the same page.
- On a phone, the posters sit above the headline and the buttons fill the width.

## How Discover works

- Search is debounced by 400 ms, needs at least 2 letters, and cancels any search it replaces.
- The API has no mood field, so each mood is mapped to genre names, and the genre IDs are looked up from the API at runtime.
- Watch-time ranges (under 5 hours, 5 to 15, 15 to 30, over 30) are based on total runtime, using the same maths as the planner. "Movie" is filtered by the API.
- Titles that are still airing have no total runtime, so they are left out of watch-time ranges, and the page says so.
- Filters are stored in the URL, so going back from a detail page returns to the same results.
- All four states are handled: loading skeletons, results, an error banner with Retry, and an empty state with Clear filters.

## How the detail page works

- The anime id comes from `anime.html?id=`. Anything that is not a plain positive whole number shows the not-found state without calling the API.
- The runtime strip shows episodes, minutes per episode, total runtime and evenings needed at the user's hours per evening. It explains itself for movies, titles that are still airing, and titles with no listed episode length (24 minutes is assumed and flagged).
- The synopsis is cut off after six lines, and Read more only appears when the text really is cut off.
- The trailer player is only built when the user presses play, and only https YouTube embeds are allowed.
- Related titles load after the main content, so a failure there never breaks the page. They use a simpler card, because the API gives only a title and image for each.
- Genres are shown as plain tags.
- The Back link returns to Discover with the filters the user had.

## How the Planner page works

- Pick the weekdays you watch (at least one must stay selected) and the hours per evening, in half-hour steps from 0.5 to 8. Both are stored in the browser.
- Titles load one by one through the same request queue as the rest of the site, with a skeleton row for each. If one fails, that row turns red with a Retry button, and the rest of the plan is still calculated. A title that no longer exists offers Remove only.
- The summary shows total runtime, evenings needed and the finish date. It explains anything it leaves out: ongoing titles, titles with no listed episode length, titles that failed to load, and plans that run for more than a year.
- The schedule lists each evening with its real date and what is watched, in the order of the list. The first 14 are shown, with a button to show them all.
- Removing a title shows a red toast with Undo, and Undo puts the title back in the same position so the watch order is unchanged.
- Save plan keeps the current plan under an optional name, shows a green confirmation with a link to Saved plans, and leaves the plan on screen.
- Once a plan is saved, the button becomes a disabled "Saved" and a line reads "Saved as ...". This stays across reloads and disappears as soon as the titles, their order, the evenings or the hours change, so the page always shows whether the plan on screen is safely saved.
- Clear plan empties the list (keeping the chosen evenings and hours) and offers Undo for six seconds, which restores every title in its original order. It sits away from Save so it can't be hit by accident, and clearing a plan that was already saved never touches the saved copy.
- When a title is removed, keyboard focus moves to the next remove button, so keyboard users don't lose their place.

## How Saved plans works

- Plans live in `localStorage`, so the page makes no API calls and shows instantly. When a plan is saved, a small snapshot of its totals and poster images is kept with it.
- Each card shows the title count, total runtime and finish date. The finish date is recalculated from today every time the page loads, using the weekdays and hours saved with the plan, so it never goes stale.
- Plans saved before snapshots existed still appear and explain that they need opening to show their runtime.
- Open loads the plan into the Planner. Delete shows a toast with Undo for five seconds, and Undo restores the plan in the same position.
- New plan only asks for confirmation when the current plan has titles and matches no saved plan, so work is never lost silently. The confirmation is an accessible dialog: Escape or clicking outside cancels, and focus starts on Cancel.
- If the browser blocks storage, the page says so instead of failing silently.

## How the planner works

- Total runtime is episodes multiplied by minutes per episode, added up across the plan.
- Shows that are still airing have no episode total, so they are listed but not counted.
- A movie counts as one episode of its full running time.
- If the minutes per episode are missing, 24 is used and the figure is marked as an estimate.
- The schedule uses the weekdays the user chooses. Titles are watched in order and can carry over into the next evening, so every evening has a real date and the last one is the finish date.

## Motion

All animation lives in `js/animations.js`. The page scripts say when something should animate, and that file decides how. Every animation uses only `transform` and `opacity`.

| Animation | Where | How |
| --- | --- | --- |
| Hero reveal | Home | A GSAP timeline: headline, lead, buttons, then the posters, staggered, about one second in total (`power3.out`) |
| Cards and steps rise in | Home, Discover | ScrollTrigger batches fade and lift items in as they reach the lower part of the screen. Only new cards animate, so Load more and filter changes never replay the cards already shown |
| Skeleton to content | Home, Discover, detail | The skeleton is copied over the container and fades out while the real content fades in (0.4s, `sine.inOut`), so nothing jumps |
| Evenings fill | Planner | Each evening's bar grows from the left with a stagger (`back.out(1.4)`), and the total runtime and evenings count up from their previous values |
| Confirmations | Everywhere | The Add button icon pops, toasts slide in and fade out, and the View plan pill pops when a title is added |

How it stays safe:

- **Reduced motion.** If the visitor prefers reduced motion, nothing slides, scales or counts. The hero text still appears with a quick fade, and everything else is simply there.
- **No GSAP, no problem.** If GSAP does not load, every function does nothing and the page is already fully visible. The hero text is held back only while GSAP is about to reveal it, and is released after four seconds at the latest.
- **Screen readers.** Numbers that count up are not a live region, so a screen reader never reads the in-between values. The finished result is announced once from a hidden message.
- **Always interactive.** The skeleton copy used for the crossfade ignores clicks and is hidden from assistive technology, so the page can be used while it fades.

## Accessibility

- Semantic landmarks, one `h1` per page, and a skip link
- Visible focus ring on every interactive element
- Text and control colours checked against WCAG 2.2 contrast ratios
- Tap targets of at least 44 by 44 pixels
- Status is never shown by colour alone: badges and messages pair an icon with text
- Messages are announced to screen readers
- Motion is reduced or removed when the user prefers reduced motion, and never hides content if it fails

## Credits

- Anime data and poster images: [Tenrai](https://tenrai.org), serving [MyAnimeList](https://myanimelist.net) data in the Jikan v4 format
- Fonts: [Sora](https://fonts.google.com/specimen/Sora) and [Inter](https://fonts.google.com/specimen/Inter) (Google Fonts)
- Icons: outline icon set based on the style of [Tabler Icons](https://tabler.io/icons)
- Animation: [GSAP](https://gsap.com) and ScrollTrigger, used under the [GSAP standard license](https://gsap.com/standard-license)
