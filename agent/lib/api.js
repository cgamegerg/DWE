/**
 * agent/lib/api.js — HTTP client for the Superteam Earn agent API.
 *
 * Zero dependencies. Node 18+ built-ins only (global fetch, AbortController).
 * ESM (see agent/package.json -> "type": "module").
 *
 * Design rules enforced here:
 *   - The API key is a secret. It is NEVER placed in a URL, never logged, and
 *     is scrubbed out of every ApiError message/body/endpoint before it escapes.
 *   - Only idempotent GETs are retried. A POST that creates or updates a
 *     submission is NEVER retried (double-submit risk).
 *   - 429 is never retried; it surfaces as an ApiError carrying retryAfter.
 *   - liveListings() implements the primary agent endpoint AND the documented
 *     fallback for SuperteamDAO/earn issue #1456, and always reports which
 *     path produced the results.
 *
 * Verified against SuperteamDAO/earn @ 7bf213b86 (origin/main, 2026-09-17).
 * Anything marked ASSUMED below is a client-side choice, not an API fact.
 */

export const DEFAULT_BASE_URL = 'https://superteam.fun';

/** Legacy host serving the same Next.js app; used for the public fallback. */
export const DEFAULT_FALLBACK_BASE_URL = 'https://earn.superteam.fun';

/** Server hard-caps `take` at 50 on /api/agents/listings/live (silently). */
export const MAX_AGENT_TAKE = 50;

/** The public fallback ignores `take` entirely, so we cap the body ourselves. */
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

const AGENT_ACCESS_ELIGIBLE = new Set(['AGENT_ALLOWED', 'AGENT_ONLY']);
const LISTING_TYPES = new Set(['bounty', 'project', 'hackathon']);

const ISSUE_1456 =
  'SuperteamDAO/earn#1456 (live agent listings returned no open rows / past-deadline rows)';

/* -------------------------------------------------------------------------- */
/* Secret scrubbing                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Any `sk_` token is an API key. Redact it wherever it appears, whatever the
 * length, so a key can never ride out inside an error message or body.
 */
const SK_PATTERN = /sk_[A-Za-z0-9._-]{2,}/g;

export function redactSecrets(value, seen) {
  if (typeof value === 'string') return value.replace(SK_PATTERN, 'sk_[REDACTED]');
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  const visited = seen || new WeakSet();
  if (visited.has(value)) return '[Circular]';
  visited.add(value);

  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, visited));

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    // Drop anything that even looks like an auth carrier, key and all.
    if (/^(authorization|api[-_]?key|apikey|token|claim[-_]?code|secret)$/i.test(k)) {
      out[k] = '[REDACTED]';
      continue;
    }
    out[k] = redactSecrets(v, visited);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* ApiError                                                                    */
/* -------------------------------------------------------------------------- */

export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {{status?:number, body?:any, endpoint?:string, code?:string,
   *          retryAfter?:number|null, cause?:any}} [opts]
   */
  constructor(message, opts = {}) {
    super(redactSecrets(String(message ?? 'Request failed')));
    this.name = 'ApiError';
    this.status = typeof opts.status === 'number' ? opts.status : 0;
    this.body = redactSecrets(opts.body ?? null);
    this.endpoint = redactSecrets(String(opts.endpoint ?? ''));
    this.code = opts.code || codeForStatus(this.status);
    this.retryAfter =
      typeof opts.retryAfter === 'number' && Number.isFinite(opts.retryAfter)
        ? opts.retryAfter
        : null;
    if (opts.cause !== undefined) this.cause = opts.cause;
    if (Error.captureStackTrace) Error.captureStackTrace(this, ApiError);
  }

  get isRateLimited() {
    return this.status === 429;
  }

  get isAuthError() {
    return this.status === 401;
  }

  /** Safe to print or log: nothing here can contain the key. */
  toSafeJSON() {
    return {
      name: this.name,
      code: this.code,
      status: this.status,
      endpoint: this.endpoint,
      message: this.message,
      retryAfter: this.retryAfter,
      body: this.body,
    };
  }
}

function codeForStatus(status) {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 405) return 'METHOD_NOT_ALLOWED';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'SERVER_ERROR';
  if (status >= 400) return 'BAD_REQUEST';
  if (status === 0) return 'NETWORK';
  return 'HTTP_ERROR';
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function trimSlash(s) {
  return String(s || '').replace(/\/+$/, '');
}

function toFiniteNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Strict: only a genuine non-empty string counts. Deliberately does NOT coerce
 * numbers — every field this is used on (id, slug, token, status, ...) is a
 * string in the API, and silently stringifying a number would let a garbage
 * payload yield an `id` that later gets POSTed as a real `listingId`.
 */
function toCleanString(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/** Accepts Date | ISO string | epoch ms; returns an ISO string or null. */
function toIsoOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(typeof v === 'number' ? v : String(v));
  const t = d.getTime();
  return Number.isFinite(t) ? d.toISOString() : null;
}

function parseRetryAfter(res, body) {
  const fromBody = body && typeof body === 'object' ? toFiniteNumber(body.retryAfter) : null;
  if (fromBody !== null && fromBody >= 0) return Math.ceil(fromBody);
  const header = res && res.headers && typeof res.headers.get === 'function'
    ? res.headers.get('retry-after')
    : null;
  const fromHeader = toFiniteNumber(header);
  if (fromHeader !== null && fromHeader >= 0) return Math.ceil(fromHeader);
  return null;
}

/**
 * Read a response body with a hard byte cap. The public /api/listings fallback
 * ignores `take` and is therefore UNBOUNDED — without this a single call could
 * pull a multi-megabyte payload into memory.
 */
async function readBodyCapped(res, maxBytes) {
  const declared = toFiniteNumber(
    res.headers && typeof res.headers.get === 'function' ? res.headers.get('content-length') : null,
  );
  if (declared !== null && declared > maxBytes) {
    throw new ApiError(
      `Response body too large (${declared} bytes > ${maxBytes} cap)`,
      { status: res.status || 0, code: 'BODY_TOO_LARGE' },
    );
  }

  // Stream when we can so we can bail early; fall back to text() otherwise
  // (a stubbed fetchImpl in tests usually has no .body).
  const stream = res.body;
  if (!stream || typeof stream.getReader !== 'function') {
    return typeof res.text === 'function' ? await res.text() : '';
  }

  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch { /* best effort */ }
        throw new ApiError(
          `Response body exceeded ${maxBytes} byte cap`,
          { status: res.status || 0, code: 'BODY_TOO_LARGE' },
        );
      }
      chunks.push(value);
    }
  } finally {
    try { reader.releaseLock(); } catch { /* best effort */ }
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function parseMaybeJson(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    // Never let a raw HTML error page balloon an error object.
    return { _raw: text.slice(0, 500) };
  }
}

/* -------------------------------------------------------------------------- */
/* Listing normalisation                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Convert the listing `eligibility` Json (details endpoint only) into a stable
 * question array. Honours the legacy `isLink` flag as well as `type: 'link'`.
 */
export function normaliseEligibility(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  raw.forEach((q, index) => {
    if (!q || typeof q !== 'object') return;
    const question = typeof q.question === 'string' ? q.question : null;
    if (question === null || question.trim() === '') return;
    const order = toFiniteNumber(q.order);
    out.push({
      // question text is echoed BYTE-FOR-BYTE — the server matches on exact,
      // case- and whitespace-sensitive equality before falling back to index.
      question,
      order: order === null ? index : order,
      type: q.isLink === true || q.type === 'link' ? 'link' : 'text',
      optional: q.optional === true,
    });
  });
  // Ascending `order` so the server's positional fallback also lines up.
  out.sort((a, b) => a.order - b.order);
  return out;
}

/** Stablecoins we are willing to treat as 1:1 USD without a price source. */
const USD_PEGGED = new Set(['USDC', 'USDT', 'USDG', 'USD', 'USDD', 'PYUSD']);

/**
 * rewards Json is a { position: amount } map, e.g. {"1":1000,"2":750}.
 * Returns [{ position, amount }] sorted by position ascending.
 */
function normalisePrizes(rewards) {
  if (!rewards || typeof rewards !== 'object' || Array.isArray(rewards)) return [];
  const out = [];
  for (const [k, v] of Object.entries(rewards)) {
    const position = toFiniteNumber(k);
    const amount = toFiniteNumber(v);
    if (position === null || amount === null) continue;
    out.push({ position, amount });
  }
  out.sort((a, b) => a.position - b.position);
  return out;
}

/** skills Json is [{ skills: ParentSkill, subskills: string[] }]. */
function normaliseSkill(skills) {
  if (!Array.isArray(skills)) return null;
  const parents = [];
  for (const entry of skills) {
    if (!entry || typeof entry !== 'object') continue;
    const parent = toCleanString(entry.skills);
    if (parent && !parents.includes(parent)) parents.push(parent);
  }
  return parents.length ? parents.join(', ') : null;
}

/**
 * Defensively derive a Listing from any payload shape. Returns null rather than
 * a half-built object. Must survive garbage without throwing.
 *
 * @param {any} raw
 * @param {{baseUrl?: string}} [opts]
 * @returns {Listing|null}
 */
export function normaliseListing(raw, opts = {}) {
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

    // `id` is the only field POST /submissions/create actually needs. Without
    // it the row is useless to us, so refuse rather than half-build.
    const id = toCleanString(raw.id);
    if (id === null) return null;

    const slug = toCleanString(raw.slug);
    const title = toCleanString(raw.title) ?? slug ?? '(untitled listing)';
    const base = trimSlash(opts.baseUrl || DEFAULT_BASE_URL);

    const typeRaw = toCleanString(raw.type);
    const type = typeRaw && LISTING_TYPES.has(typeRaw.toLowerCase())
      ? typeRaw.toLowerCase()
      : typeRaw;

    const statusRaw = toCleanString(raw.status);
    const status = statusRaw ? statusRaw.toUpperCase() : null;

    const token = toCleanString(raw.token);
    const rewardAmount = toFiniteNumber(raw.rewardAmount);

    // ASSUMED: neither agent endpoint exposes `usdValue`, so a USD figure is
    // only honest for a USD-pegged token. Anything else stays null and the
    // caller must rank within a token or supply its own price source.
    const rewardUsd =
      token && USD_PEGGED.has(token.toUpperCase()) && rewardAmount !== null
        ? rewardAmount
        : null;

    const sponsorObj = raw.sponsor && typeof raw.sponsor === 'object' ? raw.sponsor : null;

    const counts = raw._count && typeof raw._count === 'object' ? raw._count : {};
    const submissions = toFiniteNumber(counts.Submission) ?? 0;
    const comments = toFiniteNumber(counts.Comments) ?? 0;

    // `rewards`, `skills`, `region` and `eligibility` exist ONLY on the details
    // endpoint; they stay empty/null for rows that came from a list call.
    const prizes = normalisePrizes(raw.rewards);
    const eligibilityQuestions = normaliseEligibility(raw.eligibility);

    const agentAccessRaw = toCleanString(raw.agentAccess);
    const agentAccess = agentAccessRaw ? agentAccessRaw.toUpperCase() : null;

    return {
      id,
      title,
      slug,
      // ASSUMED: public listing permalink shape. Null when we have no slug.
      url: slug ? `${base}/listing/${slug}` : null,
      sponsor: sponsorObj ? toCleanString(sponsorObj.name) : null,
      type: type ?? null,
      skill: normaliseSkill(raw.skills),
      agentAccess,
      rewardUsd,
      token,
      prizes,
      submissions,
      deadline: toIsoOrNull(raw.deadline),
      status,
      region: toCleanString(raw.region),
      eligibilityQuestions,

      // Extras beyond the shared contract — additive, safe to ignore.
      rewardAmount,
      compensationType: toCleanString(raw.compensationType),
      minRewardAsk: toFiniteNumber(raw.minRewardAsk),
      maxRewardAsk: toFiniteNumber(raw.maxRewardAsk),
      isWinnersAnnounced: raw.isWinnersAnnounced === true,
      isFeatured: raw.isFeatured === true,
      isPro: raw.isPro === true,
      comments,
      sponsorVerified: sponsorObj ? sponsorObj.isVerified === true : false,
      sponsorSlug: sponsorObj ? toCleanString(sponsorObj.slug) : null,
      maxBonusSpots: toFiniteNumber(raw.maxBonusSpots) ?? 0,
      raw,
    };
  } catch {
    // "Must survive a completely unexpected payload shape."
    return null;
  }
}

/**
 * Is this listing actually submittable right now?
 * A null deadline is open-ended (the public fallback returns those; the agent
 * endpoint never does because it requires deadline >= now).
 */
export function isListingOpen(listing, now = Date.now()) {
  if (!listing) return false;
  if (listing.status && listing.status !== 'OPEN') return false;
  if (listing.isWinnersAnnounced === true) return false;
  if (listing.agentAccess && !AGENT_ACCESS_ELIGIBLE.has(listing.agentAccess)) return false;
  if (listing.deadline === null || listing.deadline === undefined) return true;
  const t = Date.parse(listing.deadline);
  if (!Number.isFinite(t)) return true; // unparseable: don't silently drop it
  return t > now;
}

/* -------------------------------------------------------------------------- */
/* Client                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * @param {{baseUrl?:string, fallbackBaseUrl?:string, apiKey?:string|null,
 *          fetchImpl?:Function, timeoutMs?:number, maxRetries?:number,
 *          retryBaseMs?:number, maxResponseBytes?:number, userAgent?:string}} [options]
 */
export function createClient(options = {}) {
  const baseUrl = trimSlash(options.baseUrl || DEFAULT_BASE_URL);
  const fallbackBaseUrl = trimSlash(options.fallbackBaseUrl || DEFAULT_FALLBACK_BASE_URL);
  const apiKey = options.apiKey || null;
  const timeoutMs = toFiniteNumber(options.timeoutMs) ?? 15000;
  const maxRetries = Math.max(0, toFiniteNumber(options.maxRetries) ?? 2);
  const retryBaseMs = toFiniteNumber(options.retryBaseMs) ?? 400;
  const maxResponseBytes = toFiniteNumber(options.maxResponseBytes) ?? MAX_RESPONSE_BYTES;
  const userAgent = options.userAgent || 'earn-agent/0.1 (+zero-dep node client)';

  // Injectable for tests; defaults to global fetch, bound so `this` is right.
  const rawFetch = options.fetchImpl || (typeof globalThis.fetch === 'function'
    ? (...args) => globalThis.fetch(...args)
    : null);
  if (typeof rawFetch !== 'function') {
    throw new ApiError(
      'No fetch implementation available. Node 18+ provides global fetch; otherwise pass fetchImpl.',
      { code: 'NO_FETCH' },
    );
  }

  function authHeaders(extra) {
    const headers = { accept: 'application/json', 'user-agent': userAgent, ...(extra || {}) };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    return headers;
  }

  /** One attempt. Never retries. Returns { status, ok, body, headers, res }. */
  async function attempt(url, init, endpointLabel) {
    const controller = new AbortController();
    let timedOut = false;
    let timer = null;

    const timeoutPromise = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        try { controller.abort(); } catch { /* best effort */ }
        reject(
          new ApiError(`Request timed out after ${timeoutMs}ms`, {
            status: 0,
            code: 'TIMEOUT',
            endpoint: endpointLabel,
          }),
        );
      }, timeoutMs);
      // Deliberately NOT unref'd: the timer is always cleared in `finally`, and
      // unref'ing would let the process exit silently if a request never settles.
    });

    let res;
    try {
      // Race as well as abort: a stubbed fetchImpl may ignore the signal.
      res = await Promise.race([
        rawFetch(url, { ...init, signal: controller.signal }),
        timeoutPromise,
      ]);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (timedOut || (err && (err.name === 'AbortError' || err.name === 'TimeoutError'))) {
        throw new ApiError(`Request timed out after ${timeoutMs}ms`, {
          status: 0,
          code: 'TIMEOUT',
          endpoint: endpointLabel,
          cause: err,
        });
      }
      throw new ApiError(`Network error: ${err && err.message ? err.message : String(err)}`, {
        status: 0,
        code: 'NETWORK',
        endpoint: endpointLabel,
        cause: err,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }

    if (!res || typeof res.status !== 'number') {
      throw new ApiError('fetchImpl returned a non-Response value', {
        status: 0,
        code: 'BAD_FETCH_IMPL',
        endpoint: endpointLabel,
      });
    }

    const text = await readBodyCapped(res, maxResponseBytes);
    const body = parseMaybeJson(text);
    return { status: res.status, ok: res.status >= 200 && res.status < 300, body, res };
  }

  function errorFor(endpointLabel, result) {
    const { status, body, res } = result;
    const retryAfter = status === 429 ? parseRetryAfter(res, body) : null;

    // The server's own wording, when it gave us any. Note 429 uses `message`,
    // NOT `error` — do not branch on `error` alone.
    let detail = null;
    if (body && typeof body === 'object') {
      if (typeof body.message === 'string') detail = body.message;
      else if (typeof body.error === 'string') detail = body.error;
    }

    let message;
    if (status === 429) {
      message = `Rate limited (429) on ${endpointLabel}. Back off${
        retryAfter !== null ? ` for ${retryAfter}s` : ''
      } before retrying — this request was NOT retried automatically.`;
    } else if (status === 401) {
      message =
        `Unauthorized (401) on ${endpointLabel}. The API key is missing, wrong, or REVOKED — ` +
        'the server returns an identical body for all three. Check GET /api/agents/status.';
    } else if (status === 403) {
      message =
        `Forbidden (403) on ${endpointLabel}. ${detail || 'No reason given.'} ` +
        'The agent submission routes collapse almost every failure into this one opaque body ' +
        '(already-submitted, closed, ineligible, and ALL validation errors), so do not ' +
        'string-match it — pre-validate client-side instead.';
    } else {
      message = `HTTP ${status} on ${endpointLabel}${detail ? `: ${detail}` : ''}`;
    }

    return new ApiError(message, { status, body, endpoint: endpointLabel, retryAfter });
  }

  /**
   * @param {{method:string, url:string, endpoint:string, headers?:object,
   *          json?:any, retry?:boolean, allowStatuses?:number[]}} spec
   */
  async function request(spec) {
    const { method, url, endpoint, headers, json } = spec;

    // Retries are permitted ONLY for idempotent GETs. A POST here creates or
    // mutates a submission; retrying one risks a duplicate the API cannot undo.
    const retriable = spec.retry === true && method === 'GET';
    const attempts = retriable ? maxRetries + 1 : 1;

    let lastError = null;
    for (let i = 0; i < attempts; i += 1) {
      let result;
      try {
        result = await attempt(
          url,
          {
            method,
            headers: json === undefined
              ? headers
              : { ...headers, 'content-type': 'application/json' },
            body: json === undefined ? undefined : JSON.stringify(json),
          },
          endpoint,
        );
      } catch (err) {
        lastError = err;
        // Transport-level failure. Retry only if this GET has budget left.
        if (retriable && i < attempts - 1) {
          await sleep(retryBaseMs * 2 ** i);
          continue;
        }
        throw err;
      }

      if (result.ok) return result;

      const err = errorFor(endpoint, result);

      // 429 is NEVER retried — honouring Retry-After is the caller's job, and
      // the windows are fixed, so hammering only burns the next window too.
      if (err.status === 429) throw err;

      // Retry only transient server-side faults, and only for GETs.
      const transient = err.status >= 500;
      if (retriable && transient && i < attempts - 1) {
        lastError = err;
        await sleep(retryBaseMs * 2 ** i);
        continue;
      }
      throw err;
    }

    throw lastError || new ApiError(`Request failed: ${endpoint}`, { endpoint });
  }

  /* ---------------------------------------------------------------------- */
  /* 1. REGISTER                                                            */
  /* ---------------------------------------------------------------------- */

  /**
   * POST /api/agents — anonymous. Returns 201.
   * `name` is the ONLY accepted field (zod strips everything else).
   * apiKey and claimCode are returned exactly once and are UNRECOVERABLE.
   */
  async function register({ name } = {}) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (trimmed.length < 2 || trimmed.length > 80 || /[<>]/.test(trimmed)) {
      throw new ApiError(
        'Agent name must be 2-80 characters and contain no angle brackets (server-side zod rule).',
        { status: 0, code: 'INVALID_NAME', endpoint: 'POST /api/agents' },
      );
    }

    const endpoint = 'POST /api/agents';
    const result = await request({
      method: 'POST',
      url: `${baseUrl}/api/agents`,
      endpoint,
      headers: { accept: 'application/json', 'user-agent': userAgent },
      json: { name: trimmed },
      retry: false, // creating an identity is not idempotent
    });

    const body = result.body && typeof result.body === 'object' ? result.body : {};
    const key = toCleanString(body.apiKey);
    const claimCode = toCleanString(body.claimCode);

    if (!key || !claimCode) {
      throw new ApiError(
        'Registration succeeded but the response did not contain both apiKey and claimCode. ' +
          'These are shown exactly once and cannot be recovered — do not retry blindly; ' +
          'check whether an agent was created before registering again.',
        { status: result.status, body: result.body, endpoint, code: 'INCOMPLETE_REGISTRATION' },
      );
    }

    return {
      apiKey: key,
      claimCode,
      agent: {
        agentId: toCleanString(body.agentId),
        userId: toCleanString(body.userId),
        name: toCleanString(body.name) ?? trimmed,
        username: toCleanString(body.username),
      },
      // The human finishes at this URL. The tool never claims anything itself.
      claimUrl: `${baseUrl}/earn/claim/${claimCode}`,
      raw: result.body,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* 2. DISCOVER                                                            */
  /* ---------------------------------------------------------------------- */

  function toListingArray(body, endpointLabel) {
    // Both discovery paths return a BARE array. Tolerate an envelope anyway.
    if (Array.isArray(body)) return body;
    if (body && typeof body === 'object') {
      for (const key of ['listings', 'result', 'data', 'items']) {
        if (Array.isArray(body[key])) return body[key];
      }
      // parseMaybeJson() parks an unparseable body under `_raw`. A 2xx carrying
      // HTML (a CDN error page, a captive portal, a proxy interstitial) is NOT
      // an empty listing set, and reporting it as one made the caller blame
      // issue #1456 for an infrastructure failure. Say what actually happened.
      if (typeof body._raw === 'string') {
        throw new ApiError(
          `${endpointLabel || 'The listings endpoint'} answered 2xx with a body that is not JSON ` +
            '(an HTML error page, a proxy interstitial or a captive portal). This is NOT an empty ' +
            `listing set and NOT ${ISSUE_1456}.`,
          { status: 200, body, endpoint: endpointLabel || '', code: 'NON_JSON_BODY' },
        );
      }
    }
    return [];
  }

  function normaliseAll(rows) {
    const out = [];
    for (const row of rows) {
      const listing = normaliseListing(row, { baseUrl });
      if (listing) out.push(listing);
    }
    return out;
  }

  /** Primary: authenticated agent endpoint. */
  async function fetchPrimary(take) {
    const url = new URL(`${baseUrl}/api/agents/listings/live`);
    url.searchParams.set('take', String(take));
    const result = await request({
      method: 'GET',
      url: url.toString(),
      endpoint: 'GET /api/agents/listings/live',
      headers: authHeaders(),
      retry: true,
    });
    return normaliseAll(toListingArray(result.body, 'GET /api/agents/listings/live'));
  }

  /**
   * Corrected fallback. The workaround written in issue #1456
   * (`/api/listings?take=100` + filter agentAccess in AGENT_ALLOWED/AGENT_ONLY)
   * has three defects, all confirmed in source:
   *   1. `take` is not in QueryParamsSchema — zod strips it, so the response is
   *      UNBOUNDED, not 100. We cap locally.
   *   2. With the default context='all' the server applies
   *      agentAccess: { not: 'AGENT_ONLY' }, so the issue's own filter can
   *      NEVER match an AGENT_ONLY row — it silently drops exactly the
   *      agent-exclusive listings it exists to rescue.
   *   3. It omits the sponsor.isVerified gate, so it can surface listings whose
   *      details endpoint will 404 (no eligibility questions retrievable).
   * `context=agents` is a first-class enum value that fixes all three.
   */
  async function fetchFallback(host, useAgentsContext) {
    const url = new URL(`${trimSlash(host)}/api/listings`);
    if (useAgentsContext) {
      url.searchParams.set('context', 'agents');
      url.searchParams.set('status', 'open');
      url.searchParams.set('tab', 'all');
    } else {
      // Last-resort tier: the issue's literal workaround, verbatim.
      url.searchParams.set('take', '100');
    }
    const endpoint = `GET ${trimSlash(host)}/api/listings${useAgentsContext ? '?context=agents' : '?take=100'}`;
    const result = await request({
      method: 'GET',
      url: url.toString(),
      endpoint,
      // No auth needed; this route reads a human session, not an agent key.
      headers: { accept: 'application/json', 'user-agent': userAgent },
      retry: true,
    });
    return normaliseAll(toListingArray(result.body, endpoint));
  }

  function filterEligible(listings, now) {
    return listings.filter(
      (l) => AGENT_ACCESS_ELIGIBLE.has(l.agentAccess) && isListingOpen(l, now),
    );
  }

  function dedupe(listings) {
    const seen = new Set();
    const out = [];
    for (const l of listings) {
      if (seen.has(l.id)) continue;
      seen.add(l.id);
      out.push(l);
    }
    return out;
  }

  /**
   * @param {{take?:number, crossCheck?:boolean, now?:number}} [opts]
   * @returns {Promise<{listings: Listing[], source:'agents-live'|'fallback-filter', warnings:string[]}>}
   */
  async function liveListings(opts = {}) {
    const requested = toFiniteNumber(opts.take) ?? 20;
    const take = Math.min(Math.max(1, Math.trunc(requested)), MAX_AGENT_TAKE);
    const now = toFiniteNumber(opts.now) ?? Date.now();
    const warnings = [];

    if (requested > MAX_AGENT_TAKE) {
      warnings.push(
        `take=${requested} was clamped to ${MAX_AGENT_TAKE}; the agent endpoint silently caps take at 50.`,
      );
    }

    let primary = null;
    let primaryFailed = null;

    try {
      primary = await fetchPrimary(take);
    } catch (err) {
      // Do NOT fall back on 401 (fix the key) or 400 (fix the params) — a
      // fallback there would hide a real, fixable configuration error.
      if (err instanceof ApiError && (err.status === 401 || err.status === 400 || err.status === 429)) {
        throw err;
      }
      primaryFailed = err;
      warnings.push(
        `Primary agent endpoint failed (${
          err instanceof ApiError ? `${err.code} ${err.status}` : 'error'
        }): ${err.message} — falling back.`,
      );
    }

    if (primary !== null) {
      const open = filterEligible(primary, now);
      const staleCount = primary.length - open.length;

      if (open.length > 0) {
        if (staleCount > 0) {
          warnings.push(
            `Primary returned ${primary.length} rows but ${staleCount} were past-deadline or ` +
              `not open and were dropped — the symptom of ${ISSUE_1456}.`,
          );
        }

        if (opts.crossCheck === true) {
          try {
            const alt = filterEligible(await fetchFallback(baseUrl, true), now);
            const primaryIds = new Set(open.map((l) => l.id));
            const missing = alt.filter((l) => !primaryIds.has(l.id));
            if (missing.length > 0) {
              warnings.push(
                `Cross-check: the public fallback surfaced ${missing.length} eligible listing(s) ` +
                  `the agent endpoint did not (${missing
                    .slice(0, 5)
                    .map((l) => l.slug || l.id)
                    .join(', ')}) — possible regression of ${ISSUE_1456}.`,
              );
            } else {
              warnings.push('Cross-check: both discovery paths agree.');
            }
          } catch (err) {
            warnings.push(`Cross-check against the fallback failed: ${err.message}`);
          }
        }

        return { listings: dedupe(open).slice(0, take), source: 'agents-live', warnings };
      }

      warnings.push(
        primary.length === 0
          ? `Primary GET /api/agents/listings/live returned 0 listings — the exact symptom of ${ISSUE_1456}. Falling back.`
          : `Primary returned ${primary.length} listing(s) but none were open and agent-eligible ` +
              `(all past-deadline or ineligible) — the documented bug in ${ISSUE_1456}. Falling back.`,
      );
    }

    // Tier 2: corrected fallback on the canonical host.
    // Tier 3: same on the legacy host.
    // Tier 4: the issue's literal (defective) workaround, last resort only.
    const tiers = [
      { host: baseUrl, agentsContext: true, label: `public fallback (${baseUrl}/api/listings?context=agents)` },
      { host: fallbackBaseUrl, agentsContext: true, label: `public fallback (${fallbackBaseUrl}/api/listings?context=agents)` },
      { host: fallbackBaseUrl, agentsContext: false, label: `issue-#1456 literal workaround (${fallbackBaseUrl}/api/listings?take=100)` },
    ];

    let lastErr = primaryFailed;
    for (const tier of tiers) {
      try {
        const rows = await fetchFallback(tier.host, tier.agentsContext);
        const open = dedupe(filterEligible(rows, now));
        if (open.length === 0) {
          warnings.push(`${tier.label} returned 0 eligible listings.`);
          continue;
        }
        warnings.push(
          `Results came from the ${tier.label}, not the agent API. ` +
            'This path is cached up to 5 minutes (Cache-Control: private, max-age=300, ' +
            'stale-while-revalidate=600), so it may be slightly stale.',
        );
        if (!tier.agentsContext) {
          warnings.push(
            'WARNING: this is the literal workaround from the issue text. With context defaulting ' +
              "to 'all' the server forces agentAccess != AGENT_ONLY, so AGENT_ONLY listings are " +
              'INVISIBLE here, and the sponsor.isVerified gate is missing — some rows may 404 on ' +
              'the details endpoint. Treat the result as incomplete.',
          );
        }
        return { listings: open.slice(0, take), source: 'fallback-filter', warnings };
      } catch (err) {
        lastErr = err;
        warnings.push(`${tier.label} failed: ${err.message}`);
      }
    }

    if (primary === null && lastErr) {
      // Every path failed outright — surface the cause rather than a silent [].
      throw lastErr;
    }

    warnings.push('No agent-eligible open listings found on any discovery path.');
    return { listings: [], source: primary === null ? 'fallback-filter' : 'agents-live', warnings };
  }

  /* ---------------------------------------------------------------------- */
  /* Listing details — the ONLY source of eligibility questions              */
  /* ---------------------------------------------------------------------- */

  async function listingDetails(slug) {
    const clean = toCleanString(slug);
    if (clean === null) {
      throw new ApiError('listingDetails() requires the listing slug (not the id).', {
        code: 'MISSING_SLUG',
        endpoint: 'GET /api/agents/listings/details/{slug}',
      });
    }
    const result = await request({
      method: 'GET',
      url: `${baseUrl}/api/agents/listings/details/${encodeURIComponent(clean)}`,
      endpoint: `GET /api/agents/listings/details/${clean}`,
      headers: authHeaders(),
      retry: true,
    });
    const listing = normaliseListing(result.body, { baseUrl });
    if (!listing) {
      throw new ApiError('Listing details response could not be parsed into a Listing.', {
        status: result.status,
        body: result.body,
        endpoint: `GET /api/agents/listings/details/${clean}`,
        code: 'UNPARSEABLE_LISTING',
      });
    }
    return { listing, raw: result.body };
  }

  /** GET /api/agents/status — validates a key with no side effects. */
  async function status() {
    const result = await request({
      method: 'GET',
      url: `${baseUrl}/api/agents/status`,
      endpoint: 'GET /api/agents/status',
      headers: authHeaders(),
      retry: true,
    });
    const body = result.body && typeof result.body === 'object' ? result.body : {};
    return {
      id: toCleanString(body.id),
      name: toCleanString(body.name),
      status: toCleanString(body.status),
      claimedByUserId: toCleanString(body.claimedByUserId),
      claimedAt: toIsoOrNull(body.claimedAt),
      createdAt: toIsoOrNull(body.createdAt),
      claimed: toCleanString(body.claimedByUserId) !== null,
      // lastUsedAt is selected server-side but NOTHING ever writes it.
      // Treat as permanently null; never build freshness logic on it.
      raw: result.body,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* 3 & 4. SUBMIT / UPDATE                                                 */
  /* ---------------------------------------------------------------------- */

  function buildSubmissionBody(payload) {
    const p = payload && typeof payload === 'object' ? payload : {};
    const listingId = toCleanString(p.listingId);
    if (listingId === null) {
      throw new ApiError('listingId is required (the listing `id`, not the slug).', {
        code: 'MISSING_LISTING_ID',
      });
    }

    const answers = Array.isArray(p.eligibilityAnswers)
      ? p.eligibilityAnswers
          .filter((a) => a && typeof a === 'object' && typeof a.question === 'string')
          .map((a) => ({
            // Echo `question` byte-for-byte: the server matches on exact,
            // case- and whitespace-sensitive equality first.
            question: a.question,
            answer: typeof a.answer === 'string' ? a.answer : String(a.answer ?? ''),
          }))
      : [];

    const ask = toFiniteNumber(p.ask);

    return {
      listingId,
      link: typeof p.link === 'string' ? p.link.trim() : '',
      tweet: typeof p.tweet === 'string' ? p.tweet.trim() : '',
      otherInfo: typeof p.otherInfo === 'string' ? p.otherInfo : '',
      eligibilityAnswers: answers,
      ask: ask === null ? null : ask,
      telegram: typeof p.telegram === 'string' ? p.telegram.trim() : '',
    };
  }

  /**
   * Preview the exact HTTP request without sending it. Powers --dry-run.
   * The Authorization header is masked — this output is printed to a terminal.
   */
  function describeSubmission(payload, { mode = 'create' } = {}) {
    const body = buildSubmissionBody(payload);
    const path = mode === 'update'
      ? '/api/agents/submissions/update'
      : '/api/agents/submissions/create';
    return {
      method: 'POST',
      url: `${baseUrl}${path}`,
      headers: {
        authorization: apiKey ? `Bearer sk_...${apiKey.slice(-4)}` : '(none — not registered)',
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body,
      bodyJson: JSON.stringify(body, null, 2),
    };
  }

  async function postSubmission(payload, mode) {
    const body = buildSubmissionBody(payload);
    const path = mode === 'update'
      ? '/api/agents/submissions/update'
      : '/api/agents/submissions/create';
    const endpoint = `POST ${path}`;

    const result = await request({
      method: 'POST',
      url: `${baseUrl}${path}`,
      endpoint,
      headers: authHeaders(),
      json: body,
      // NEVER retried. A lost response cannot be safely re-sent as a create —
      // there is no Idempotency-Key support anywhere in the API. Recovery is
      // to call updateSubmission() instead.
      retry: false,
    });

    const row = result.body && typeof result.body === 'object' ? result.body : {};
    return {
      ok: true,
      submission: {
        id: toCleanString(row.id),
        status: toCleanString(row.status),
        label: toCleanString(row.label),
        listingId: toCleanString(row.listingId) ?? body.listingId,
        link: toCleanString(row.link),
        createdAt: toIsoOrNull(row.createdAt),
        updatedAt: toIsoOrNull(row.updatedAt),
      },
      raw: result.body,
    };
  }

  const createSubmission = (payload) => postSubmission(payload, 'create');
  const updateSubmission = (payload) => postSubmission(payload, 'update');

  /* ---------------------------------------------------------------------- */

  return {
    baseUrl,
    fallbackBaseUrl,
    hasKey: Boolean(apiKey),
    register,
    liveListings,
    listingDetails,
    status,
    createSubmission,
    updateSubmission,
    describeSubmission,
    normaliseListing: (raw) => normaliseListing(raw, { baseUrl }),
    isListingOpen,
  };
}

export default { createClient, ApiError, normaliseListing, isListingOpen, redactSecrets };
