//helpers for the anime detail page. no DOM in here, just input -> output.

import { runtimeOf } from "./planner-core.js";
import { formatMinutes } from "./utils.js";

//reads the id from the URL (?id=1). Anything that isn't a plain positive number gives null, so a bad link never reaches the API
export function parseAnimeId(search) {
  const raw = new URLSearchParams(search).get("id");
  return raw !== null && /^[1-9]\d{0,8}$/.test(raw) ? Number(raw) : null;
}

//the numbers for the runtime strip (episodes, minutes, total, evenings needed) plus a note for movies, ongoing and estimated titles
export function describeRuntime(item, hoursPerEvening) {
  const r = runtimeOf(item);
  const isMovie = String(item.type ?? "").toLowerCase() === "movie";
  const perEvening = Math.max(0.5, Number(hoursPerEvening) || 2);
  const eveningLabel = `Evenings at ${perEvening}h`;

  if (!r.counted) {
    const upcoming = item.status === "Not yet aired";
    return {
      kind: "ongoing",
      stats: [
        { key: "episodes", label: "Episodes", value: upcoming ? "Not announced" : "Still airing" },
        { key: "per-episode", label: "Per episode", value: item.minutesPerEpisode ? `${item.minutesPerEpisode} min` : "Unknown" },
        { key: "total", label: "Total runtime", value: "Not available yet", highlight: true },
        { key: "evenings", label: eveningLabel, value: "Not available yet" },
      ],
      note: upcoming
        ? "This title hasn't aired yet, so we can't total its runtime. It can be added to your plan but won't be counted."
        : "This title is still airing, so we can't total its runtime yet. It can be added to your plan but won't be counted.",
    };
  }

  const evenings = Math.max(1, Math.ceil(r.minutes / (perEvening * 60)));
  const estimatedNote = r.estimated ? "The length of each episode isn't listed, so we've assumed 24 minutes." : null;

  if (isMovie) {
    return {
      kind: "movie",
      stats: [
        { key: "format", label: "Format", value: "Movie" },
        { key: "total", label: "Running time", value: `${r.estimated ? "About " : ""}${formatMinutes(r.minutes)}`, highlight: true },
        { key: "evenings", label: eveningLabel, value: String(evenings) },
      ],
      note: estimatedNote,
    };
  }

  return {
    kind: "tv",
    stats: [
      { key: "episodes", label: "Episodes", value: String(r.episodes) },
      { key: "per-episode", label: "Per episode", value: `${r.minutesPerEpisode} min${r.estimated ? " (estimated)" : ""}` },
      { key: "total", label: "Total runtime", value: `${r.estimated ? "About " : ""}${formatMinutes(r.minutes)}`, highlight: true },
      { key: "evenings", label: eveningLabel, value: String(evenings) },
    ],
    note: estimatedNote,
  };
}

//hosts allowed for trailers
const TRAILER_HOSTS = new Set(["www.youtube.com", "youtube.com", "www.youtube-nocookie.com", "youtube-nocookie.com"]);

//only https YouTube links are allowed into the trailer iframe
export function isSafeTrailerUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && TRAILER_HOSTS.has(parsed.hostname) && parsed.pathname.startsWith("/embed/");
  } catch {
    return false;
  }
}

//squash spaces and cut at a whole word, for the meta description
export function truncate(text, max = 155) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 80 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:!?-]+$/, "")}…`;
}
