# Watch Night Planner

Watch Night Planner helps anime fans choose what they feel like watching, shows exactly how long it will take, and turns their picks into an evening-by-evening schedule with a finish date.

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
- [GSAP](https://gsap.com) with ScrollTrigger for motion
- [Jikan API v4](https://docs.api.jikan.moe) for all anime data (no key needed)
- `localStorage` for the current plan and saved plans, `sessionStorage` for API caching

## Run locally

The site uses ES modules, so it must be served over HTTP. Opening the files directly with `file://` will not work.

```bash
# VS Code
# Install the "Live Server" extension, then right-click index.html > Open with Live Server

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
js/
  api.js            Jikan client: request queue, cache, retry, data normalising
  planner-core.js   Runtime, totals and schedule maths (pure functions)
  storage.js        localStorage layer for the draft plan and saved plans
  utils.js          Duration parsing, formatting and helpers
  icons.js          Inline SVG icon set
  layout.js         Shared header and footer, mobile menu, toast helper
assets/             Favicon and images
tests/              Unit tests for the maths and the API client
```

## How the API is used

Jikan allows 3 requests per second and 60 per minute, so `js/api.js` handles this in one place:

- One queue starts requests at least 400 ms apart.
- Responses are cached for 10 minutes in `sessionStorage`.
- Identical requests made at the same time share one network call.
- A 429 or server error is retried once after 2 seconds, then reported.
- If a live request fails, recent cached results can still be shown.
- Every response is converted into one consistent shape before the interface uses it.

## How the planner works

- Total runtime is episodes multiplied by minutes per episode, added up across the plan.
- Shows that are still airing have no episode total, so they are listed but not counted.
- A movie counts as one episode of its full running time.
- If the minutes per episode are missing, 24 is used and the figure is marked as an estimate.
- The schedule uses the weekdays the user chooses. Titles are watched in order and can carry over into the next evening, so every evening has a real date and the last one is the finish date.

## Accessibility

- Semantic landmarks, one `h1` per page, and a skip link
- Visible focus ring on every interactive element
- Text and control colours checked against WCAG 2.2 contrast ratios
- Tap targets of at least 44 by 44 pixels
- Status is never shown by colour alone: badges and messages pair an icon with text
- Messages are announced to screen readers
- Motion is reduced or removed when the user prefers reduced motion

## Credits

- Anime data and poster images: [Jikan API](https://jikan.moe), sourced from [MyAnimeList](https://myanimelist.net)
- Fonts: [Sora](https://fonts.google.com/specimen/Sora) and [Inter](https://fonts.google.com/specimen/Inter) (Google Fonts)
- Icons: outline icon set based on the style of [Tabler Icons](https://tabler.io/icons)
- Animation: [GSAP](https://gsap.com)
