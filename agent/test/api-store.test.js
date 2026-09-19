/**
 * agent/test/api-store.test.js
 *
 * Zero-dependency test suite for agent/lib/api.js and agent/lib/store.js.
 * Run:  node agent/test/api-store.test.js
 *
 * No network access: every HTTP call goes through an injected fetchImpl stub.
 * No real credentials: store tests are redirected via EARN_AGENT_HOME.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Redirect the store to a throwaway directory BEFORE importing it, so a test
// run can never read or clobber a real agent/.earn-agent.json.
const TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'earn-agent-test-'));
process.env.EARN_AGENT_HOME = TMP_HOME;

const { createClient, ApiError, normaliseListing } = await import('../lib/api.js');
const store = await import('../lib/store.js');

/* -------------------------------------------------------------------------- */

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, err });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err && err.message}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
}

/** Minimal Response-like object. No `body` stream, so readBodyCapped uses text(). */
function reply(status, payload, headers = {}) {
  const lower = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = String(v);
  return {
    status,
    headers: { get: (name) => lower[String(name).toLowerCase()] ?? null },
    text: async () => (typeof payload === 'string' ? payload : JSON.stringify(payload)),
  };
}

/** Records every call so we can assert on retry behaviour. */
function recorder(handler) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init, calls.length);
  };
  fn.calls = calls;
  return fn;
}

const FAKE_KEY = `sk_${'a1b2c3d4'.repeat(8)}`; // sk_ + 64 hex chars
assert.equal(FAKE_KEY.length, 67, 'fixture key must match the real 67-char shape');

const FUTURE = new Date(Date.now() + 7 * 864e5).toISOString();
const PAST = new Date(Date.now() - 7 * 864e5).toISOString();

function listingRow(over = {}) {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    title: 'Nosana Builders Challenge: Agents 102',
    slug: 'nosana-builders-challenge-agents-102',
    type: 'bounty',
    status: 'OPEN',
    deadline: FUTURE,
    token: 'USDC',
    rewardAmount: 3000,
    compensationType: 'fixed',
    minRewardAsk: null,
    maxRewardAsk: null,
    agentAccess: 'AGENT_ALLOWED',
    isWinnersAnnounced: false,
    winnersAnnouncedAt: null,
    isFeatured: true,
    isPro: false,
    _count: { Comments: 12, Submission: 47 },
    sponsor: {
      name: 'Nosana',
      slug: 'nosana',
      logo: 'https://example.com/logo.png',
      isVerified: true,
      chapter: null,
    },
    ...over,
  };
}

/* ========================================================================== */
section('api.js — register');

await test('register() parses apiKey + claimCode from a 201 and builds the claim URL', async () => {
  const fetchImpl = recorder((url, init) => {
    assert.equal(url, 'https://superteam.fun/api/agents');
    assert.equal(init.method, 'POST');
    assert.equal(JSON.parse(init.body).name, 'DWE Agent');
    // Registration is anonymous — no Authorization header may be sent.
    assert.ok(!('authorization' in init.headers), 'register must not send auth');
    return reply(201, {
      agentId: 'aaaa-bbbb',
      userId: 'cccc-dddd',
      name: 'DWE Agent',
      username: 'dwe',
      apiKey: FAKE_KEY,
      claimCode: 'ABCDEF0123456789ABCDEF01',
    });
  });

  const client = createClient({ fetchImpl, timeoutMs: 1000 });
  const out = await client.register({ name: 'DWE Agent' });

  assert.equal(out.apiKey, FAKE_KEY);
  assert.equal(out.claimCode, 'ABCDEF0123456789ABCDEF01');
  assert.equal(out.agent.username, 'dwe');
  assert.equal(out.claimUrl, 'https://superteam.fun/earn/claim/ABCDEF0123456789ABCDEF01');
  assert.equal(fetchImpl.calls.length, 1);
});

await test('register() rejects an invalid name locally, without any HTTP call', async () => {
  const fetchImpl = recorder(() => reply(201, {}));
  const client = createClient({ fetchImpl });
  await assert.rejects(() => client.register({ name: 'x' }), (e) => e instanceof ApiError);
  await assert.rejects(() => client.register({ name: '<script>' }), (e) => e instanceof ApiError);
  assert.equal(fetchImpl.calls.length, 0, 'no request should be sent for an invalid name');
});

await test('register() refuses a 201 that is missing the claimCode', async () => {
  const fetchImpl = recorder(() => reply(201, { apiKey: FAKE_KEY }));
  const client = createClient({ fetchImpl });
  await assert.rejects(
    () => client.register({ name: 'DWE Agent' }),
    (e) => e instanceof ApiError && e.code === 'INCOMPLETE_REGISTRATION',
  );
});

/* ========================================================================== */
section('api.js — liveListings fallback (issue #1456)');

await test('primary success -> source "agents-live", no fallback call', async () => {
  const fetchImpl = recorder((url) => {
    assert.ok(url.includes('/api/agents/listings/live'));
    return reply(200, [listingRow()]);
  });
  const client = createClient({ fetchImpl, apiKey: FAKE_KEY });
  const out = await client.liveListings({ take: 20 });

  assert.equal(out.source, 'agents-live');
  assert.equal(out.listings.length, 1);
  assert.equal(out.listings[0].slug, 'nosana-builders-challenge-agents-102');
  assert.equal(fetchImpl.calls.length, 1, 'fallback must not run when primary works');
});

await test('primary returns [] -> falls back, source "fallback-filter", cites #1456', async () => {
  const fetchImpl = recorder((url) => {
    if (url.includes('/api/agents/listings/live')) return reply(200, []);
    if (url.includes('/api/listings')) {
      assert.ok(url.includes('context=agents'), 'must use the corrected context=agents fallback');
      return reply(200, [listingRow({ agentAccess: 'AGENT_ONLY' })]);
    }
    throw new Error(`unexpected url ${url}`);
  });
  const client = createClient({ fetchImpl, apiKey: FAKE_KEY });
  const out = await client.liveListings({ take: 20 });

  assert.equal(out.source, 'fallback-filter');
  assert.equal(out.listings.length, 1);
  assert.equal(out.listings[0].agentAccess, 'AGENT_ONLY');
  assert.ok(
    out.warnings.some((w) => w.includes('#1456')),
    'warnings must cite the issue number',
  );
  assert.ok(
    out.warnings.some((w) => w.toLowerCase().includes('cached')),
    'warnings must disclose the 5-minute cache on the fallback path',
  );
});

await test('primary returns ONLY past-deadline rows -> treated as a miss, falls back', async () => {
  const fetchImpl = recorder((url) => {
    if (url.includes('/api/agents/listings/live')) {
      return reply(200, [
        listingRow({ id: 'stale-1', deadline: PAST }),
        listingRow({ id: 'stale-2', deadline: PAST }),
      ]);
    }
    return reply(200, [listingRow({ id: 'fresh-1' })]);
  });
  const client = createClient({ fetchImpl, apiKey: FAKE_KEY });
  const out = await client.liveListings({ take: 20 });

  assert.equal(out.source, 'fallback-filter');
  assert.equal(out.listings.length, 1);
  assert.equal(out.listings[0].id, 'fresh-1');
  assert.ok(out.warnings.some((w) => w.includes('#1456')));
});

await test('a null deadline from the fallback is open-ended, not expired', async () => {
  const fetchImpl = recorder((url) =>
    url.includes('/api/agents/listings/live')
      ? reply(200, [])
      : reply(200, [listingRow({ id: 'open-ended', deadline: null })]),
  );
  const client = createClient({ fetchImpl, apiKey: FAKE_KEY });
  const out = await client.liveListings({ take: 5 });
  assert.equal(out.listings.length, 1);
  assert.equal(out.listings[0].deadline, null);
});

await test('mixed primary results keep the open rows and warn about the stale ones', async () => {
  const fetchImpl = recorder(() =>
    reply(200, [listingRow({ id: 'stale', deadline: PAST }), listingRow({ id: 'live' })]),
  );
  const client = createClient({ fetchImpl, apiKey: FAKE_KEY });
  const out = await client.liveListings({ take: 20 });

  assert.equal(out.source, 'agents-live');
  assert.equal(out.listings.length, 1);
  assert.equal(out.listings[0].id, 'live');
  assert.ok(out.warnings.some((w) => w.includes('past-deadline')));
});

await test('HUMAN_ONLY rows are filtered out of the fallback', async () => {
  const fetchImpl = recorder((url) =>
    url.includes('/api/agents/listings/live')
      ? reply(200, [])
      : reply(200, [
          listingRow({ id: 'human', agentAccess: 'HUMAN_ONLY' }),
          listingRow({ id: 'ok', agentAccess: 'AGENT_ALLOWED' }),
        ]),
  );
  const client = createClient({ fetchImpl, apiKey: FAKE_KEY });
  const out = await client.liveListings({});
  assert.deepEqual(out.listings.map((l) => l.id), ['ok']);
});

await test('401 on primary does NOT fall back — it surfaces so the key gets fixed', async () => {
  const fetchImpl = recorder(() => reply(401, { error: 'Unauthorized' }));
  const client = createClient({ fetchImpl, apiKey: FAKE_KEY, retryBaseMs: 1 });
  await assert.rejects(
    () => client.liveListings({}),
    (e) => e instanceof ApiError && e.status === 401,
  );
  assert.equal(fetchImpl.calls.length, 1, '401 must not be retried and must not fall back');
});

await test('take above the server cap of 50 is clamped and warned about', async () => {
  const fetchImpl = recorder((url) => {
    if (url.includes('/api/agents/listings/live')) {
      assert.ok(url.includes('take=50'), `expected take=50, got ${url}`);
      return reply(200, [listingRow()]);
    }
    return reply(200, []);
  });
  const client = createClient({ fetchImpl, apiKey: FAKE_KEY });
  const out = await client.liveListings({ take: 100 });
  assert.ok(out.warnings.some((w) => w.includes('clamped')));
});

await test('crossCheck reports a delta the agent endpoint missed', async () => {
  const fetchImpl = recorder((url) =>
    url.includes('/api/agents/listings/live')
      ? reply(200, [listingRow({ id: 'shared' })])
      : reply(200, [listingRow({ id: 'shared' }), listingRow({ id: 'only-in-fallback' })]),
  );
  const client = createClient({ fetchImpl, apiKey: FAKE_KEY });
  const out = await client.liveListings({ take: 20, crossCheck: true });
  assert.equal(out.source, 'agents-live');
  assert.ok(out.warnings.some((w) => w.includes('Cross-check') && w.includes('possible regression')));
});

/* ========================================================================== */
section('api.js — errors, retries, secret hygiene');

await test('401 produces an ApiError with status/endpoint and no key leakage', async () => {
  const fetchImpl = recorder(() => reply(401, { error: 'Unauthorized' }));
  const client = createClient({ fetchImpl, apiKey: FAKE_KEY, retryBaseMs: 1 });
  await assert.rejects(
    () => client.status(),
    (e) => {
      assert.ok(e instanceof ApiError);
      assert.equal(e.status, 401);
      assert.equal(e.code, 'UNAUTHORIZED');
      assert.ok(e.endpoint.includes('/api/agents/status'));
      assert.ok(e.isAuthError);
      return true;
    },
  );
});

await test('429 is never retried and carries retryAfter', async () => {
  const fetchImpl = recorder(() =>
    reply(
      429,
      { message: 'Too many requests. Please wait before trying again.', retryAfter: 42 },
      { 'retry-after': '42' },
    ),
  );
  const client = createClient({ fetchImpl, apiKey: FAKE_KEY, retryBaseMs: 1 });
  await assert.rejects(
    () => client.status(),
    (e) => {
      assert.ok(e instanceof ApiError);
      assert.equal(e.status, 429);
      assert.equal(e.retryAfter, 42);
      assert.ok(e.isRateLimited);
      assert.ok(/back off/i.test(e.message));
      return true;
    },
  );
  assert.equal(fetchImpl.calls.length, 1, '429 must not be retried');
});

await test('429 with only a Retry-After header still yields retryAfter', async () => {
  const fetchImpl = recorder(() => reply(429, { message: 'Too many requests.' }, { 'Retry-After': '7' }));
  const client = createClient({ fetchImpl, apiKey: FAKE_KEY });
  await assert.rejects(() => client.status(), (e) => e.retryAfter === 7);
});

await test('500 on a GET retries exactly twice (3 attempts) then throws', async () => {
  const fetchImpl = recorder(() => reply(500, { error: 'Internal Server Error' }));
  const client = createClient({ fetchImpl, apiKey: FAKE_KEY, retryBaseMs: 1, maxRetries: 2 });
  await assert.rejects(
    () => client.status(),
    (e) => e instanceof ApiError && e.status === 500 && e.code === 'SERVER_ERROR',
  );
  assert.equal(fetchImpl.calls.length, 3, 'expected 1 initial attempt + 2 retries');
});

await test('a GET that recovers on the third attempt succeeds', async () => {
  const fetchImpl = recorder((url, init, n) =>
    n < 3 ? reply(500, { error: 'Internal Server Error' }) : reply(200, { id: 'a', status: 'ACTIVE' }),
  );
  const client = createClient({ fetchImpl, apiKey: FAKE_KEY, retryBaseMs: 1 });
  const out = await client.status();
  assert.equal(out.status, 'ACTIVE');
  assert.equal(fetchImpl.calls.length, 3);
});

await test('POST createSubmission is NEVER retried, even on 500', async () => {
  const fetchImpl = recorder(() => reply(500, { error: 'Internal Server Error' }));
  const client = createClient({ fetchImpl, apiKey: FAKE_KEY, retryBaseMs: 1, maxRetries: 2 });
  await assert.rejects(
    () => client.createSubmission({ listingId: 'abc', link: 'https://x.dev/p', otherInfo: 'hi' }),
    (e) => e instanceof ApiError && e.status === 500,
  );
  assert.equal(fetchImpl.calls.length, 1, 'a submission POST must be sent at most once');
});

await test('POST updateSubmission is NEVER retried either', async () => {
  const fetchImpl = recorder(() => reply(503, { error: 'unavailable' }));
  const client = createClient({ fetchImpl, apiKey: FAKE_KEY, retryBaseMs: 1, maxRetries: 2 });
  await assert.rejects(() => client.updateSubmission({ listingId: 'abc' }));
  assert.equal(fetchImpl.calls.length, 1);
});

await test('POST register is never retried on 500', async () => {
  const fetchImpl = recorder(() => reply(500, { error: 'Internal Server Error' }));
  const client = createClient({ fetchImpl, retryBaseMs: 1, maxRetries: 2 });
  await assert.rejects(() => client.register({ name: 'DWE Agent' }));
  assert.equal(fetchImpl.calls.length, 1);
});

await test('the API key never leaks into ApiError message, body, endpoint or toSafeJSON', async () => {
  // A deliberately leaky server that echoes the request headers back.
  const fetchImpl = recorder((url, init) =>
    reply(500, {
      error: 'Internal Server Error',
      message: `upstream rejected ${init.headers.authorization}`,
      debug: { echoedHeaders: init.headers, note: `key was ${FAKE_KEY}` },
    }),
  );
  const client = createClient({ fetchImpl, apiKey: FAKE_KEY, retryBaseMs: 1, maxRetries: 0 });

  await assert.rejects(
    () => client.status(),
    (e) => {
      const blob = JSON.stringify({
        message: e.message,
        body: e.body,
        endpoint: e.endpoint,
        safe: e.toSafeJSON(),
        stringified: String(e),
      });
      assert.ok(!blob.includes(FAKE_KEY), 'full key leaked');
      assert.ok(!blob.includes(FAKE_KEY.slice(3, 20)), 'key fragment leaked');
      assert.ok(blob.includes('[REDACTED]'), 'expected redaction markers');
      return true;
    },
  );
});

await test('the key is never placed in a request URL', async () => {
  const seen = [];
  const fetchImpl = recorder((url) => {
    seen.push(url);
    return reply(200, [listingRow()]);
  });
  const client = createClient({ fetchImpl, apiKey: FAKE_KEY });
  await client.liveListings({ take: 5 });
  for (const url of seen) assert.ok(!url.includes('sk_'), `key found in URL: ${url}`);
});

await test('a non-JSON error page is truncated, not swallowed whole', async () => {
  const html = `<html>${'x'.repeat(5000)}</html>`;
  const fetchImpl = recorder(() => reply(502, html));
  const client = createClient({ fetchImpl, apiKey: FAKE_KEY, retryBaseMs: 1, maxRetries: 0 });
  await assert.rejects(
    () => client.status(),
    (e) => {
      assert.equal(e.status, 502);
      assert.ok(typeof e.body._raw === 'string');
      assert.ok(e.body._raw.length <= 500);
      return true;
    },
  );
});

await test('403 explains that the body is opaque and must not be string-matched', async () => {
  const fetchImpl = recorder(() =>
    reply(403, { error: 'Internal Server Error', message: 'Unable to create submission.' }),
  );
  const client = createClient({ fetchImpl, apiKey: FAKE_KEY });
  await assert.rejects(
    () => client.createSubmission({ listingId: 'abc', link: 'https://x.dev', otherInfo: 'y' }),
    (e) => e.status === 403 && /opaque/i.test(e.message),
  );
});

await test('the timeout fires when the server never responds', async () => {
  let aborted = false;
  const fetchImpl = (url, init) =>
    new Promise((_resolve, reject) => {
      // Cooperative: honour the signal the client passes in.
      init.signal.addEventListener('abort', () => {
        aborted = true;
        const e = new Error('aborted');
        e.name = 'AbortError';
        reject(e);
      });
    });
  const client = createClient({ fetchImpl, apiKey: FAKE_KEY, timeoutMs: 60, maxRetries: 0 });
  const started = Date.now();
  await assert.rejects(
    () => client.status(),
    (e) => {
      assert.ok(e instanceof ApiError);
      assert.equal(e.code, 'TIMEOUT');
      assert.equal(e.status, 0);
      assert.ok(/timed out after 60ms/.test(e.message));
      return true;
    },
  );
  assert.ok(aborted, 'the AbortController signal must actually be raised');
  assert.ok(Date.now() - started < 3000, 'timeout must not hang');
});

await test('the timeout still fires when fetchImpl ignores the abort signal', async () => {
  // Belt-and-braces: the client races the timeout as well as aborting.
  const fetchImpl = () => new Promise(() => {});
  const client = createClient({ fetchImpl, apiKey: FAKE_KEY, timeoutMs: 50, maxRetries: 0 });
  await assert.rejects(() => client.status(), (e) => e.code === 'TIMEOUT');
});

await test('a transport-level network failure surfaces as ApiError code NETWORK', async () => {
  const fetchImpl = recorder(() => Promise.reject(new Error('ECONNREFUSED')));
  const client = createClient({ fetchImpl, apiKey: FAKE_KEY, retryBaseMs: 1, maxRetries: 0 });
  await assert.rejects(() => client.status(), (e) => e instanceof ApiError && e.code === 'NETWORK');
});

await test('describeSubmission previews the exact request with the key masked (--dry-run)', async () => {
  const client = createClient({ fetchImpl: recorder(() => reply(200, {})), apiKey: FAKE_KEY });
  const preview = client.describeSubmission({
    listingId: 'abc',
    link: 'https://github.com/me/proj',
    otherInfo: 'What I built',
    eligibilityAnswers: [{ question: 'Project Title', answer: 'My project' }],
    telegram: 'http://t.me/someone',
  });
  assert.equal(preview.method, 'POST');
  assert.equal(preview.url, 'https://superteam.fun/api/agents/submissions/create');
  assert.equal(preview.headers.authorization, `Bearer sk_...${FAKE_KEY.slice(-4)}`);
  assert.ok(!JSON.stringify(preview).includes(FAKE_KEY));
  assert.equal(preview.body.ask, null);
  assert.ok(preview.bodyJson.includes('Project Title'));
});

/* ========================================================================== */
section('api.js — normaliseListing');

await test('returns null on garbage of every shape', async () => {
  const client = createClient({ fetchImpl: recorder(() => reply(200, {})) });
  const garbage = [
    null, undefined, 0, 1, '', 'nonsense', true, false, [], [1, 2, 3], {},
    { nope: true }, { id: null }, { id: '' }, { id: 123.456, title: {} },
    NaN, Symbol('x'), () => {}, new Date(), Object.create(null),
  ];
  const label = (v) => {
    try { return typeof v === 'object' && v !== null ? JSON.stringify(v) ?? typeof v : String(v); }
    catch { return `<${typeof v}>`; }
  };
  for (const g of garbage) {
    assert.equal(client.normaliseListing(g), null, `expected null for ${label(g)}`);
  }
});

await test('survives a hostile payload without throwing', async () => {
  const hostile = { id: 'x' };
  Object.defineProperty(hostile, 'title', {
    get() { throw new Error('boom'); },
    enumerable: true,
  });
  assert.equal(normaliseListing(hostile), null, 'a throwing getter must yield null, not a crash');

  const circular = { id: 'c1', slug: 's', _count: {} };
  circular.self = circular;
  const out = normaliseListing(circular);
  assert.equal(out.id, 'c1');
});

await test('builds a full Listing from a realistic listingSelect row', async () => {
  const client = createClient({ fetchImpl: recorder(() => reply(200, {})) });
  const l = client.normaliseListing(listingRow());

  assert.equal(l.id, '11111111-2222-3333-4444-555555555555');
  assert.equal(l.title, 'Nosana Builders Challenge: Agents 102');
  assert.equal(l.slug, 'nosana-builders-challenge-agents-102');
  assert.equal(l.url, 'https://superteam.fun/earn/listing/nosana-builders-challenge-agents-102');
  assert.equal(l.sponsor, 'Nosana');
  assert.equal(l.type, 'bounty');
  assert.equal(l.agentAccess, 'AGENT_ALLOWED');
  assert.equal(l.token, 'USDC');
  assert.equal(l.rewardUsd, 3000, 'USDC is USD-pegged so rewardUsd is honest');
  assert.equal(l.submissions, 47);
  assert.equal(l.status, 'OPEN');
  assert.equal(l.deadline, FUTURE);
  assert.deepEqual(l.prizes, [], 'prizes only exist on the details endpoint');
  assert.deepEqual(l.eligibilityQuestions, []);
  assert.equal(l.skill, null);
  assert.equal(l.region, null);
  assert.ok(l.raw, 'raw payload is preserved');

  // Every contract field must be present, even when null.
  for (const k of ['id', 'title', 'slug', 'url', 'sponsor', 'type', 'skill', 'agentAccess',
    'rewardUsd', 'token', 'prizes', 'submissions', 'deadline', 'status', 'region',
    'eligibilityQuestions', 'raw']) {
    assert.ok(k in l, `missing contract field: ${k}`);
  }
});

await test('rewardUsd stays null for a token with no known USD peg', async () => {
  const l = normaliseListing(listingRow({ token: 'SOL', rewardAmount: 12 }));
  assert.equal(l.token, 'SOL');
  assert.equal(l.rewardAmount, 12);
  assert.equal(l.rewardUsd, null, 'must not invent a USD figure without a price source');
});

await test('a details payload yields prizes, skills, region and eligibility questions', async () => {
  const l = normaliseListing({
    ...listingRow(),
    rewards: { 1: 1000, 2: 750, 3: 450, 4: 200, 5: 100 },
    skills: [{ skills: 'Backend', subskills: ['Node.js'] }, { skills: 'Blockchain', subskills: [] }],
    region: 'Global',
    maxBonusSpots: 2,
    eligibility: [
      { order: 2, question: 'Repo link', type: 'link' },
      { order: 1, question: 'Project Title', type: 'text' },
      { order: 3, question: 'Anything else?', type: 'text', optional: true },
      { order: 4, question: 'Legacy link', isLink: true },
      { order: 5, question: '   ' },
      'not an object',
    ],
  });

  assert.deepEqual(l.prizes, [
    { position: 1, amount: 1000 }, { position: 2, amount: 750 }, { position: 3, amount: 450 },
    { position: 4, amount: 200 }, { position: 5, amount: 100 },
  ]);
  assert.equal(l.skill, 'Backend, Blockchain');
  assert.equal(l.region, 'Global');
  assert.equal(l.maxBonusSpots, 2);

  // Sorted by `order` so the server's positional fallback also lines up.
  assert.deepEqual(l.eligibilityQuestions.map((q) => q.question),
    ['Project Title', 'Repo link', 'Anything else?', 'Legacy link']);
  assert.equal(l.eligibilityQuestions[1].type, 'link');
  assert.equal(l.eligibilityQuestions[2].optional, true);
  assert.equal(l.eligibilityQuestions[0].optional, false);
  assert.equal(l.eligibilityQuestions[3].type, 'link', 'legacy isLink must be honoured');
});

await test('question text is preserved byte-for-byte, never trimmed or retitled', async () => {
  const weird = '  what IS  your   plan? ';
  const l = normaliseListing({ ...listingRow(), eligibility: [{ order: 1, question: weird }] });
  assert.equal(l.eligibilityQuestions[0].question, weird);
});

await test('an unexpected envelope shape is still unwrapped by liveListings', async () => {
  const fetchImpl = recorder(() => reply(200, { listings: [listingRow()] }));
  const client = createClient({ fetchImpl, apiKey: FAKE_KEY });
  const out = await client.liveListings({});
  assert.equal(out.listings.length, 1);
});

/* ========================================================================== */
section('store.js');

await test('configPath() is absolute and lands on agent/.earn-agent.json', async () => {
  const p = store.configPath();
  assert.ok(path.isAbsolute(p));
  assert.equal(path.basename(p), '.earn-agent.json');
  assert.equal(path.dirname(p), TMP_HOME, 'EARN_AGENT_HOME override must be honoured');
});

await test('load() on a missing file returns defaults and does not throw', async () => {
  try { fs.unlinkSync(store.configPath()); } catch { /* fine */ }
  const s = store.load();
  assert.equal(s.apiKey, null);
  assert.equal(s.claimCode, null);
  assert.deepEqual(s.submissions, []);
  assert.equal(s.dailyCap, 3, 'daily cap defaults to 3 submissions/day');
  assert.ok(s.profile && Array.isArray(s.profile.skills));
  assert.equal(s._meta.exists, false);
  assert.equal(s._meta.corrupt, false);
});

await test('save() then load() round-trips state', async () => {
  const s = store.defaultState();
  s.apiKey = FAKE_KEY;
  s.claimCode = 'ABCDEF0123456789ABCDEF01';
  s.agentName = 'DWE Agent';
  s.username = 'dwe';
  s.profile.skills = ['Backend', 'Blockchain'];
  s.profile.telegram = 'https://t.me/someone';
  s.profile.hoursPerWeek = 12;
  store.save(s);

  const back = store.load();
  assert.equal(back.apiKey, FAKE_KEY);
  assert.equal(back.claimCode, 'ABCDEF0123456789ABCDEF01');
  assert.equal(back.agentName, 'DWE Agent');
  assert.deepEqual(back.profile.skills, ['Backend', 'Blockchain']);
  assert.equal(back.profile.hoursPerWeek, 12);
  assert.equal(back._meta.exists, true);
  assert.deepEqual(back._meta.warnings, [], 'a healthy file produces no warnings');
});

await test('the config file is mode 0600 and leaves no temp files behind', async () => {
  const file = store.configPath();
  const mode = fs.statSync(file).mode & 0o777;
  assert.equal(mode, 0o600, `expected 0600, got 0${mode.toString(8)}`);
  const strays = fs.readdirSync(TMP_HOME).filter((f) => f.includes('.tmp-'));
  assert.deepEqual(strays, [], `atomic write left temp files: ${strays.join(', ')}`);
});

await test('save() restores 0600 even if permissions were widened', async () => {
  const file = store.configPath();
  fs.chmodSync(file, 0o644);
  store.save(store.load());
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

await test('save() creates the agent directory when it is missing', async () => {
  const nested = path.join(TMP_HOME, 'deep', 'agent');
  const prev = process.env.EARN_AGENT_HOME;
  process.env.EARN_AGENT_HOME = nested;
  try {
    const s = store.defaultState();
    s.apiKey = FAKE_KEY;
    store.save(s);
    assert.ok(fs.existsSync(path.join(nested, '.earn-agent.json')));
    assert.equal(store.load().apiKey, FAKE_KEY);
  } finally {
    process.env.EARN_AGENT_HOME = prev;
  }
});

await test('load() survives a corrupt file, returns defaults, and backs it up', async () => {
  const file = store.configPath();
  fs.writeFileSync(file, '{ this is not json at all ,,,', { mode: 0o600 });

  const s = store.load(); // must not throw
  assert.equal(s.apiKey, null);
  assert.deepEqual(s.submissions, []);
  assert.equal(s._meta.corrupt, true);
  assert.ok(s._meta.warnings.some((w) => /corrupt/i.test(w)));
  assert.ok(s._meta.backupPath, 'a backup path must be reported');
  assert.ok(fs.existsSync(s._meta.backupPath), 'the damaged bytes must be preserved');
  assert.equal(fs.readFileSync(s._meta.backupPath, 'utf8'), '{ this is not json at all ,,,');
  assert.equal(fs.statSync(s._meta.backupPath).mode & 0o777, 0o600);
});

await test('load() survives a JSON file that is not an object', async () => {
  fs.writeFileSync(store.configPath(), '[1,2,3]', { mode: 0o600 });
  const s = store.load();
  assert.equal(s._meta.corrupt, true);
  assert.equal(s.apiKey, null);
});

await test('load() coerces hostile field types instead of trusting them', async () => {
  fs.writeFileSync(
    store.configPath(),
    JSON.stringify({
      apiKey: 12345,
      claimCode: '',
      dailyCap: 'lots',
      submissions: 'not-an-array',
      profile: { skills: 'Backend', hoursPerWeek: 'many', canDoVideo: 'yes' },
    }),
    { mode: 0o600 },
  );
  const s = store.load();
  assert.equal(s.apiKey, null, 'a non-string key must not be trusted');
  assert.equal(s.claimCode, null);
  assert.equal(s.dailyCap, 3);
  assert.deepEqual(s.submissions, []);
  assert.deepEqual(s.profile.skills, []);
  assert.equal(s.profile.hoursPerWeek, 10);
  assert.equal(s.profile.canDoVideo, false, 'truthy strings must not become true');
});

await test('load() warns when the file permissions have drifted', async () => {
  const s0 = store.defaultState();
  s0.apiKey = FAKE_KEY;
  store.save(s0);
  fs.chmodSync(store.configPath(), 0o644);
  const s = store.load();
  assert.ok(s._meta.warnings.some((w) => w.includes('chmod 600')));
  store.save(s); // restore
});

await test('maskKey never reveals more than the last 4 characters', async () => {
  assert.equal(store.maskKey(FAKE_KEY), `sk_...${FAKE_KEY.slice(-4)}`);
  assert.ok(!store.maskKey(FAKE_KEY).includes(FAKE_KEY.slice(3, 20)));
  assert.equal(store.maskKey(FAKE_KEY).length, 10);
  assert.equal(store.maskKey(null), '(none)');
  assert.equal(store.maskKey(undefined), '(none)');
  assert.equal(store.maskKey(''), '(none)');
  assert.equal(store.maskKey('sk_ab'), 'sk_...****', 'a short key reveals nothing');
  assert.equal(store.maskKey(12345), '(none)');
});

await test('recordSubmission / hasSubmittedTo / submittedToday enforce the rate limits', async () => {
  const fresh = store.defaultState();
  fresh.apiKey = FAKE_KEY;
  store.save(fresh);

  assert.equal(store.submittedToday(), 0);
  assert.equal(store.hasSubmittedTo('listing-a'), false);
  assert.equal(store.remainingToday(), 3);

  store.recordSubmission({ listingId: 'listing-a', submissionId: 'sub-1', listingTitle: 'A' });
  assert.equal(store.hasSubmittedTo('listing-a'), true, 'duplicate submissions must be detectable');
  assert.equal(store.hasSubmittedTo('listing-b'), false);
  assert.equal(store.submittedToday(), 1);
  assert.equal(store.remainingToday(), 2);

  store.recordSubmission({ listingId: 'listing-b', submissionId: 'sub-2' });
  store.recordSubmission({ listingId: 'listing-c', submissionId: 'sub-3' });
  assert.equal(store.submittedToday(), 3);
  assert.equal(store.remainingToday(), 0, 'the daily cap of 3 is exhausted');

  // An edit does not consume the daily *submission* budget.
  store.recordSubmission({ listingId: 'listing-a', submissionId: 'sub-1', mode: 'update' });
  assert.equal(store.submittedToday(), 3, 'an update must not count as a new submission');
  assert.equal(store.load().submissions.length, 4);
});

await test('a submission recorded yesterday does not count against today', async () => {
  const s = store.load();
  s.submissions.push({
    listingId: 'listing-old',
    mode: 'create',
    submittedAt: new Date(Date.now() - 864e5).toISOString(),
    date: store.localDateKey(Date.now() - 864e5),
  });
  store.save(s);
  assert.equal(store.submittedToday(), 3, 'yesterday must not count');
  assert.equal(store.hasSubmittedTo('listing-old'), true, 'but it is still a duplicate');
});

await test('recordSubmission rejects a malformed entry', async () => {
  assert.throws(() => store.recordSubmission(null), TypeError);
  assert.throws(() => store.recordSubmission({}), TypeError);
  assert.throws(() => store.recordSubmission({ listingId: 42 }), TypeError);
});

await test('describe() is printable and contains no secrets', async () => {
  const d = store.describe();
  const blob = JSON.stringify(d);
  assert.ok(!blob.includes(FAKE_KEY), 'describe() leaked the API key');
  assert.equal(d.apiKey, `sk_...${FAKE_KEY.slice(-4)}`);
  assert.ok(path.isAbsolute(d.path));
  assert.equal(typeof d.submittedToday, 'number');
});


section('store.js — reservations and the cross-process lock');

await test('reserveSubmission refuses a duplicate and a cap overrun', async () => {
  const fresh = store.defaultState();
  fresh.apiKey = FAKE_KEY;
  fresh.dailyCap = 2;
  store.save(fresh);

  const r1 = store.reserveSubmission({ listingId: 'lst-1', mode: 'create' });
  assert.equal(r1.pending, true, 'a reservation starts pending');
  assert.ok(r1.reservationId, 'a reservation carries an id');
  assert.equal(store.hasSubmittedTo('lst-1'), true, 'a pending reservation already blocks a duplicate');

  assert.throws(
    () => store.reserveSubmission({ listingId: 'lst-1', mode: 'create' }),
    (err) => err.name === 'LimitError' && err.code === 'DUPLICATE',
    'a second create for the same listing must be refused',
  );

  store.reserveSubmission({ listingId: 'lst-2', mode: 'create' });
  assert.throws(
    () => store.reserveSubmission({ listingId: 'lst-3', mode: 'create' }),
    (err) => err.name === 'LimitError' && err.code === 'DAILY_CAP',
    'the daily cap must be enforced at reservation time',
  );
});

await test('finalizeSubmission and releaseReservation close the loop', async () => {
  const fresh = store.defaultState();
  fresh.apiKey = FAKE_KEY;
  store.save(fresh);

  const r = store.reserveSubmission({ listingId: 'lst-fin', mode: 'create' });
  const row = store.finalizeSubmission(r.reservationId, { submissionId: 'sub-99' });
  assert.equal(row.pending, false);
  assert.equal(row.submissionId, 'sub-99');
  assert.equal(store.pendingSubmissions().length, 0);
  assert.equal(store.submittedToday(), 1);

  const r2 = store.reserveSubmission({ listingId: 'lst-rel', mode: 'create' });
  assert.equal(store.submittedToday(), 2, 'a reservation consumes the cap immediately');
  assert.equal(store.releaseReservation(r2.reservationId), true);
  assert.equal(store.submittedToday(), 1, 'releasing a reservation gives the slot back');
  assert.equal(store.hasSubmittedTo('lst-rel'), false);
  assert.equal(store.releaseReservation(r2.reservationId), false, 'releasing twice is a no-op');
});

await test('an update needs a prior create and has its own ceiling', async () => {
  const fresh = store.defaultState();
  fresh.apiKey = FAKE_KEY;
  fresh.dailyCap = 2;
  store.save(fresh);

  assert.throws(
    () => store.reserveSubmission({ listingId: 'lst-u', mode: 'update' }),
    (err) => err.name === 'LimitError' && err.code === 'NO_PRIOR',
  );

  const c = store.reserveSubmission({ listingId: 'lst-u', mode: 'create' });
  store.finalizeSubmission(c.reservationId, { submissionId: 'sub-u' });

  store.finalizeSubmission(store.reserveSubmission({ listingId: 'lst-u', mode: 'update' }).reservationId, {});
  store.finalizeSubmission(store.reserveSubmission({ listingId: 'lst-u', mode: 'update' }).reservationId, {});
  assert.equal(store.submittedToday(), 1, 'updates never consume the create budget');
  assert.throws(
    () => store.reserveSubmission({ listingId: 'lst-u', mode: 'update' }),
    (err) => err.name === 'LimitError' && err.code === 'UPDATE_CAP',
  );
});

await test('withLock serialises and refuses rather than racing', async () => {
  const fresh = store.defaultState();
  fresh.apiKey = FAKE_KEY;
  store.save(fresh);

  let inner = 'not run';
  store.withLock(() => {
    // Re-entering while held must refuse quickly instead of double-entering.
    assert.throws(
      () => store.withLock(() => { inner = 'RAN — the lock did not hold'; }, { waitMs: 50, staleMs: 60000 }),
      (err) => err.name === 'LimitError' && err.code === 'LOCK_BUSY',
    );
  });
  assert.equal(inner, 'not run');
  assert.equal(fs.existsSync(store.lockPath()), false, 'the lock must be released afterwards');

  // A stale lock left by a dead process is stolen, not honoured forever.
  fs.writeFileSync(store.lockPath(), '999999\n', { mode: 0o600 });
  const old = Date.now() - 10 * 60 * 1000;
  fs.utimesSync(store.lockPath(), old / 1000, old / 1000);
  assert.equal(store.withLock(() => 'acquired', { waitMs: 200 }), 'acquired');
  assert.equal(fs.existsSync(store.lockPath()), false);
});

/* ========================================================================== */

console.log(`\n${'='.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`\n- ${f.name}`);
    console.log(String(f.err && f.err.stack ? f.err.stack : f.err).split('\n').slice(0, 6).join('\n'));
  }
}

try { fs.rmSync(TMP_HOME, { recursive: true, force: true }); } catch { /* best effort */ }

process.exit(failed > 0 ? 1 : 0);
