// Anime API client.
//
// The public Jikan API (api.jikan.moe) closed on 1 October 2026. Tenrai is a free,
// keyless mirror that serves the same Jikan v4 JSON, so only the address below
// changes. The public limit is about 3 requests per second and 60 per minute, so
// every call goes through one queue that starts requests at least 400 ms apart. Responses are
// cached in sessionStorage for 10 minutes, identical in-flight requests are
// shared, and a 429 or server error is retried once before it is reported.
// Every response is converted into one consistent internal shape (see
// normalizeAnime), so the UI never touches raw API fields.

import { parseDuration } from "./utils.js";

export const BASE_URL = "https://api.tenrai.org/v1";

/** kind is one of: "rate-limit" | "not-found" | "network" | "server" | "aborted" */
export class ApiError extends Error {
  constructor(kind, message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

function abortError() {
  return new ApiError("aborted", "Request cancelled");
}

function makeCache(storage, ttlMs, now) {
  const memory = new Map();
  const prefix = "wnp:cache:";
  return {
    get(key, { allowStale = false } = {}) {
      let entry = memory.get(key);
      if (!entry && storage) {
        try {
          const raw = storage.getItem(prefix + key);
          entry = raw ? JSON.parse(raw) : undefined;
        } catch {
          entry = undefined;
        }
      }
      if (!entry) return undefined;
      const fresh = now() - entry.t < ttlMs;
      return fresh || allowStale ? { data: entry.data, stale: !fresh } : undefined;
    },
    set(key, data) {
      const entry = { t: now(), data };
      memory.set(key, entry);
      if (!storage) return;
      try {
        storage.setItem(prefix + key, JSON.stringify(entry));
      } catch {
        // Storage full or blocked: the in-memory copy still works.
      }
    },
  };
}

function safeSessionStorage() {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null;
  }
}

/** Converts a raw Jikan anime object into the shape used everywhere in the app. */
export function normalizeAnime(raw) {
  if (!raw) return null;
  const images = raw.images ?? {};
  const image =
    images.webp?.large_image_url ??
    images.jpg?.large_image_url ??
    images.webp?.image_url ??
    images.jpg?.image_url ??
    null;
  return {
    id: raw.mal_id,
    title: raw.title_english || raw.title || "Untitled",
    image,
    episodes: Number.isFinite(raw.episodes) ? raw.episodes : null,
    minutesPerEpisode: parseDuration(raw.duration),
    durationText: raw.duration ?? null,
    type: raw.type ?? null,
    status: raw.status ?? null,
    airing: raw.airing === true || raw.status === "Currently Airing",
    score: typeof raw.score === "number" ? raw.score : null,
    year: raw.year ?? raw.aired?.prop?.from?.year ?? null,
    synopsis: raw.synopsis ?? null,
    genres: Array.isArray(raw.genres) ? raw.genres.map((g) => ({ id: g.mal_id, name: g.name })) : [],
    trailerEmbedUrl: raw.trailer?.embed_url ?? null,
  };
}

function normalizePagination(p) {
  return {
    page: p?.current_page ?? 1,
    hasNext: Boolean(p?.has_next_page),
    lastPage: p?.last_visible_page ?? 1,
  };
}

/**
 * Creates an API client. Every dependency can be replaced, which is how the
 * unit tests run without a network.
 */
export function createApi({
  fetchImpl = (...args) => fetch(...args),
  baseUrl = BASE_URL,
  minGapMs = 400,
  retryDelayMs = 2000,
  ttlMs = 10 * 60 * 1000,
  storage = safeSessionStorage(),
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const cache = makeCache(storage, ttlMs, now);
  const inflight = new Map();
  let chain = Promise.resolve();
  let lastStart = -Infinity;

  // Spaces request starts at least minGapMs apart. Requests may overlap once started.
  function reserveSlot(signal) {
    const slot = chain.then(async () => {
      if (signal?.aborted) throw abortError();
      const wait = Math.max(0, lastStart + minGapMs - now());
      if (wait) await sleep(wait);
      if (signal?.aborted) throw abortError();
      lastStart = now();
    });
    chain = slot.catch(() => {});
    return slot;
  }

  function buildUrl(path, params = {}) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") continue;
      search.set(key, String(value));
    }
    const query = search.toString();
    return `${baseUrl}${path}${query ? `?${query}` : ""}`;
  }

  async function fetchOnce(url, signal) {
    let response;
    try {
      response = await fetchImpl(url, { signal, headers: { Accept: "application/json" } });
    } catch (error) {
      if (error?.name === "AbortError" || signal?.aborted) throw abortError();
      throw new ApiError("network", "Could not reach the server");
    }
    if (response.status === 404) throw new ApiError("not-found", "Not found", 404);
    if (response.status === 429) throw new ApiError("rate-limit", "Too many requests", 429);
    if (!response.ok) throw new ApiError("server", `Server error (${response.status})`, response.status);
    try {
      return await response.json();
    } catch {
      throw new ApiError("server", "Unreadable response", response.status);
    }
  }

  async function load(url, { signal, allowStale }) {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await reserveSlot(signal);
        const json = await fetchOnce(url, signal);
        cache.set(url, json);
        return { json, stale: false };
      } catch (error) {
        lastError = error;
        const retryable = error.kind === "rate-limit" || error.kind === "server" || error.kind === "network";
        if (!retryable || attempt === 1) break;
        await sleep(retryDelayMs);
      }
    }
    if (allowStale && lastError?.kind !== "aborted" && lastError?.kind !== "not-found") {
      const stale = cache.get(url, { allowStale: true });
      if (stale) return { json: stale.data, stale: true };
    }
    throw lastError;
  }

  /**
   * GET a path. Returns { json, stale }. stale is true when old cached data was
   * returned because the live request failed.
   */
  async function request(path, { params, signal, allowStale = false } = {}) {
    const url = buildUrl(path, params);
    const cached = cache.get(url);
    if (cached) return { json: cached.data, stale: false };

    if (signal?.aborted) throw abortError();
    const shareable = !signal && inflight.has(url);
    if (shareable) return inflight.get(url);

    const promise = load(url, { signal, allowStale }).finally(() => {
      if (inflight.get(url) === promise) inflight.delete(url);
    });
    if (!signal) inflight.set(url, promise);
    return promise;
  }

  /* ---------- Endpoint helpers (see PRD endpoint table) ---------- */

  async function getTopAnime({ limit = 3, signal } = {}) {
    const { json, stale } = await request("/top/anime", { params: { limit, sfw: true }, signal, allowStale: true });
    return { items: (json.data ?? []).map(normalizeAnime), pagination: normalizePagination(json.pagination), stale };
  }

  async function getSeasonNow({ limit = 4, signal } = {}) {
    const { json, stale } = await request("/seasons/now", { params: { limit, sfw: true }, signal, allowStale: true });
    return { items: (json.data ?? []).map(normalizeAnime), pagination: normalizePagination(json.pagination), stale };
  }

  async function searchAnime({ q, genres, type, status, orderBy, sort, page = 1, limit = 24, signal } = {}) {
    const { json, stale } = await request("/anime", {
      params: { q, genres, type, status, order_by: orderBy, sort, page, limit, sfw: true },
      signal,
      allowStale: true,
    });
    return { items: (json.data ?? []).map(normalizeAnime), pagination: normalizePagination(json.pagination), stale };
  }

  async function getGenres({ signal } = {}) {
    const { json } = await request("/genres/anime", { signal });
    return (json.data ?? []).map((g) => ({ id: g.mal_id, name: g.name }));
  }

  async function getAnimeFull(id, { signal } = {}) {
    const { json } = await request(`/anime/${Number(id)}/full`, { signal });
    return normalizeAnime(json.data);
  }

  async function getAnime(id, { signal } = {}) {
    const { json } = await request(`/anime/${Number(id)}`, { signal });
    return normalizeAnime(json.data);
  }

  async function getRecommendations(id, { limit = 4, signal } = {}) {
    const { json } = await request(`/anime/${Number(id)}/recommendations`, { signal });
    return (json.data ?? [])
      .slice(0, limit)
      .map((r) => normalizeAnime(r.entry))
      .filter(Boolean);
  }

  return { request, getTopAnime, getSeasonNow, searchAnime, getGenres, getAnimeFull, getAnime, getRecommendations };
}

/** Shared client used by the pages. */
export const api = createApi();

/** Friendly message for each kind of failure (matches the PRD interface states). */
export function describeError(error) {
  switch (error?.kind) {
    case "rate-limit":
      return "Too many requests. Wait a moment and try again.";
    case "not-found":
      return "We couldn't find that anime.";
    case "network":
      return "Couldn't load titles. Check your connection and try again.";
    default:
      return "Something went wrong on our side. Please try again.";
  }
}