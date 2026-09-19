/*
 * agent/test/rank.test.js — adversarial test for agent/lib/rank.js
 *
 * Run: node --test agent/test/rank.test.js
 *      node agent/test/rank.test.js        (node:test runs standalone too)
 *
 * Zero dependencies: node:test and node:assert/strict only.
 *
 * What this proves, in order of how much it matters:
 *   1. TOTALITY. Every exported function is total over a hostile input matrix plus a
 *      seeded fuzz: no throw, no NaN, no Infinity, no out-of-range score, for any input
 *      at all — undefined, null, NaN, Infinity, negatives, numeric strings, booleans,
 *      functions, symbols, cyclic objects, throwing getters and Proxies included.
 *   2. The money core has not drifted from assets/js/calculator.js: expectedUsd <= pool
 *      always, and with e = 1 against a full podium split expectedUsd == pool / n.
 *   3. The strategy spec's own worked example (Nosana Agents 102) reproduces to the
 *      decimal the spec published: podiumProb 27.6%, $141.93, $7.10/h, SCORE 65.4, BUILD.
 *   4. The gates actually gate: on-camera scores FIT 0 for a profile that cannot do it,
 *      and a bounty with less runway than build time scores 0 whatever the pool.
 *   5. AGENT_ONLY outranks AGENT_ALLOWED with everything else held equal.
 *   6. qualityGate rejects an empty draft with specific, actionable failures, and passes
 *      a complete one at 13/13.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  scoreListing,
  rankListings,
  qualityGate,
  partitionListings,
  computeEV,
  splitFromPrizes,
  checkProse,
  harvestText,
  WEIGHTS,
  BANDS,
  CONSTANTS
} from '../lib/rank.js';

/* ==================================================================================== *
 * Helpers                                                                               *
 * ==================================================================================== */

const NOW = Date.parse('2026-09-19T00:00:00.000Z');
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Some values in the matrix throw when stringified. Labels must never be the failure. */
function lbl(v) {
  try {
    if (typeof v === 'symbol') return 'Symbol()';
    if (typeof v === 'bigint') return String(v) + 'n';
    if (typeof v === 'function') return 'function';
    return String(v).slice(0, 20);
  } catch {
    return '<unprintable>';
  }
}

/** Mirrors num() in rank.js, so the test computes the same pool the engine does. */
function mirrorNum(value, fallback) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return fallback;
}

function poolOf(value) {
  return Math.max(0, mirrorNum(value, 0));
}

/** Walks a result and asserts no NaN/Infinity anywhere, at any depth. */
function assertNoBadNumbers(value, path, seen) {
  seen = seen || new WeakSet();
  if (value === null || value === undefined) return;
  const t = typeof value;
  if (t === 'number') {
    assert.ok(Number.isFinite(value), `${path} is ${String(value)} (must be finite)`);
    return;
  }
  if (t !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) assertNoBadNumbers(value[i], `${path}[${i}]`, seen);
    return;
  }
  for (const k of Object.keys(value)) assertNoBadNumbers(value[k], `${path}.${k}`, seen);
}

const VERDICTS = new Set(['BUILD', 'SHORTLIST', 'WATCH', 'SKIP']);

/** The invariants every scoreListing result must satisfy, for every input. */
function assertScoreShape(res, label) {
  assert.ok(res && typeof res === 'object', `${label}: result must be an object`);
  assertNoBadNumbers(res, label);

  assert.ok(isFiniteNumber(res.score), `${label}: score not finite`);
  assert.ok(res.score >= 0 && res.score <= 100, `${label}: score ${res.score} out of [0,100]`);

  assert.ok(isFiniteNumber(res.expectedUsd), `${label}: expectedUsd not finite`);
  assert.ok(res.expectedUsd >= 0, `${label}: expectedUsd negative`);

  assert.ok(isFiniteNumber(res.expectedPerHour), `${label}: expectedPerHour not finite`);
  assert.ok(res.expectedPerHour >= 0, `${label}: expectedPerHour negative`);

  assert.ok(isFiniteNumber(res.fit) && res.fit >= 0 && res.fit <= 1, `${label}: fit ${res.fit} out of [0,1]`);
  assert.ok(isFiniteNumber(res.crowding) && res.crowding >= 0 && res.crowding <= 1, `${label}: crowding ${res.crowding} out of [0,1]`);

  assert.equal(typeof res.runwayOk, 'boolean', `${label}: runwayOk must be a boolean`);
  assert.ok(VERDICTS.has(res.verdict), `${label}: verdict "${res.verdict}" is not one of BUILD/SHORTLIST/WATCH/SKIP`);

  assert.ok(Array.isArray(res.reasons), `${label}: reasons must be an array`);
  for (const r of res.reasons) assert.equal(typeof r, 'string', `${label}: every reason must be a string`);

  // The contract's own promise: expectedUsd can never exceed the pool.
  const pool = res.inputs && isFiniteNumber(res.inputs.pool) ? res.inputs.pool : 0;
  assert.ok(res.expectedUsd <= pool + 1e-6, `${label}: expectedUsd ${res.expectedUsd} > pool ${pool}`);
}

/* A deliberately nasty value set. Every one of these is fed everywhere. */
const cyclic = { name: 'cyclic' };
cyclic.self = cyclic;
cyclic.raw = cyclic;
cyclic.nest = { up: cyclic, list: [cyclic, cyclic] };

const throwingGetter = {};
Object.defineProperty(throwingGetter, 'boom', {
  get() { throw new Error('getter exploded'); },
  enumerable: true
});
Object.defineProperty(throwingGetter, 'title', {
  get() { throw new Error('title exploded'); },
  enumerable: true
});

const hostileProxy = new Proxy({}, {
  get() { throw new Error('proxy trap'); },
  ownKeys() { throw new Error('ownKeys trap'); }
});

const deepNest = (() => {
  let node = { leaf: 'deep code cli agent' };
  for (let i = 0; i < 60; i += 1) node = { down: node, i };
  return node;
})();

const HOSTILE = [
  undefined, null, NaN, Infinity, -Infinity,
  0, -0, 1, -1, 0.5, 1e309, -1e309, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER,
  '', '   ', 'abc', 'NaN', 'Infinity', '-5', '1e400', '0x10',
  true, false,
  [], {}, [NaN], [1, -2, NaN], [Infinity], ['a', 'b'], [[[[1]]]],
  { a: 1 }, { length: 3 },
  () => {}, function named() {},
  Symbol('sym'),
  new Date('invalid'), new Date(NOW),
  cyclic, throwingGetter, hostileProxy, deepNest,
  'x'.repeat(50000),
  10n, Object.create(null)
];

const LISTING_KEYS = [
  'id', 'title', 'slug', 'url', 'sponsor', 'type', 'skill', 'agentAccess', 'rewardUsd',
  'token', 'prizes', 'submissions', 'deadline', 'status', 'region',
  'eligibilityQuestions', 'raw', 'estimatedHours', 'requirements', 'judgingCriteria',
  'verifiability', 'compensationType'
];

const PROFILE_KEYS = [
  'skills', 'skillEdge', 'hoursPerWeek', 'canDoVideo', 'canDoOnCamera',
  'hasTwitterReach', 'regions', 'telegram', 'sponsors', 'blacklist', 'defaultHours',
  'hoursEstimates', 'now'
];

function baseListing(over) {
  return Object.assign({
    id: 'lst_base',
    title: 'Build a CLI tool',
    slug: 'build-a-cli-tool',
    url: 'https://earn.superteam.fun/listing/build-a-cli-tool',
    sponsor: 'Acme Protocol',
    type: 'bounty',
    skill: 'development',
    agentAccess: 'AGENT_ALLOWED',
    rewardUsd: 1000,
    token: 'USDC',
    prizes: [600, 250, 150],
    submissions: 20,
    deadline: NOW + 7 * DAY,
    status: 'OPEN',
    region: 'Global',
    eligibilityQuestions: [{ question: 'Project Title' }],
    raw: { description: 'Build a working CLI in TypeScript, judged on working code.' }
  }, over || {});
}

function baseProfile(over) {
  return Object.assign({
    skills: ['development'],
    skillEdge: 1.8,
    hoursPerWeek: 30,
    canDoVideo: true,
    canDoOnCamera: false,
    hasTwitterReach: false,
    regions: ['Global', 'Thailand'],
    telegram: 'http://t.me/operator_handle',
    now: NOW
  }, over || {});
}

/** Deterministic PRNG so a fuzz failure is always reproducible. */
function lcg(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ==================================================================================== *
 * 1. TOTALITY                                                                           *
 * ==================================================================================== */

test('computeEV is total across a hostile matrix and a 20,000-case seeded fuzz', () => {
  let cases = 0;

  // Every hostile value, in every slot, against three baselines.
  const baselines = [
    { prizeUsd: 1000, submissions: 20, hours: 10, skillEdge: 1.8, podiumSplit: [0.5, 0.3, 0.2] },
    { prizeUsd: 0, submissions: 0, hours: 0, skillEdge: 0, podiumSplit: [] },
    { prizeUsd: 'junk', submissions: 'junk', hours: 'junk', skillEdge: 'junk', podiumSplit: 'junk' }
  ];
  const slots = ['prizeUsd', 'submissions', 'hours', 'skillEdge', 'podiumSplit'];

  for (const base of baselines) {
    for (const slot of slots) {
      for (const v of HOSTILE) {
        const input = Object.assign({}, base);
        input[slot] = v;
        const ev = computeEV(input);
        cases += 1;
        assertNoBadNumbers(ev, `computeEV(${slot}=${lbl(v)})`);
        assert.ok(ev.expectedUsd >= 0, 'expectedUsd negative');
        assert.ok(ev.podiumProb >= 0 && ev.podiumProb <= 1, 'podiumProb out of [0,1]');
        assert.ok(ev.winProb >= 0 && ev.winProb <= 1, 'winProb out of [0,1]');
        const pool = poolOf(input.prizeUsd);
        assert.ok(ev.expectedUsd <= pool + 1e-9,
          `expectedUsd ${ev.expectedUsd} exceeds pool ${pool} (slot ${slot})`);
      }
    }
  }

  // Seeded fuzz over the whole numeric space, including the absurd ends of it.
  const rnd = lcg(0xEA2117);
  const pick = () => {
    const r = rnd();
    if (r < 0.10) return HOSTILE[Math.floor(rnd() * HOSTILE.length)];
    if (r < 0.20) return (rnd() - 0.5) * 1e12;
    if (r < 0.30) return -rnd() * 1000;
    if (r < 0.40) return String((rnd() - 0.5) * 1000);
    return rnd() * 10000;
  };
  for (let i = 0; i < 20000; i += 1) {
    const depth = Math.floor(rnd() * 8);
    const split = [];
    for (let j = 0; j < depth; j += 1) split.push(pick());
    const input = {
      prizeUsd: pick(), submissions: pick(), hours: pick(),
      skillEdge: pick(), podiumSplit: rnd() < 0.15 ? pick() : split
    };
    const ev = computeEV(input);
    cases += 1;
    assertNoBadNumbers(ev, `fuzz#${i}`);
    const pool = poolOf(input.prizeUsd);
    assert.ok(ev.expectedUsd <= pool + 1e-6,
      `fuzz#${i}: expectedUsd ${ev.expectedUsd} exceeds pool ${pool}`);
    assert.ok(ev.expectedPerHour >= 0, `fuzz#${i}: negative rate`);
  }

  assert.ok(cases > 20000, 'expected 20k+ computeEV cases');
});

test('scoreListing is total: every hostile value in every listing and profile slot', () => {
  let cases = 0;

  // The listing itself being garbage.
  for (const v of HOSTILE) {
    const res = scoreListing(v, baseProfile());
    assertScoreShape(res, `scoreListing(listing=${lbl(v)})`);
    cases += 1;
  }

  // The profile itself being garbage.
  for (const v of HOSTILE) {
    const res = scoreListing(baseListing(), v, { now: NOW });
    assertScoreShape(res, `scoreListing(profile=${lbl(v)})`);
    cases += 1;
  }

  // Both being garbage, pairwise.
  for (const a of HOSTILE) {
    for (const b of HOSTILE) {
      const res = scoreListing(a, b, { now: NOW });
      assertScoreShape(res, 'scoreListing(both hostile)');
      cases += 1;
    }
  }

  // One poisoned field at a time, everything else sane.
  for (const key of LISTING_KEYS) {
    for (const v of HOSTILE) {
      const listing = baseListing();
      listing[key] = v;
      const res = scoreListing(listing, baseProfile(), { now: NOW });
      assertScoreShape(res, `listing.${key} = ${lbl(v)}`);
      cases += 1;
    }
  }
  for (const key of PROFILE_KEYS) {
    for (const v of HOSTILE) {
      const profile = baseProfile();
      profile[key] = v;
      const res = scoreListing(baseListing(), profile, { now: NOW });
      assertScoreShape(res, `profile.${key} = ${lbl(v)}`);
      cases += 1;
    }
  }

  // A listing that is nothing but poison in every slot at once.
  for (const v of HOSTILE) {
    const listing = {};
    for (const key of LISTING_KEYS) listing[key] = v;
    const res = scoreListing(listing, baseProfile(), { now: NOW });
    assertScoreShape(res, `all-poison listing (${lbl(v)})`);
    cases += 1;
  }

  // A listing whose every property read throws.
  const res = scoreListing(hostileProxy, baseProfile(), { now: NOW });
  assertScoreShape(res, 'proxy listing');
  assert.equal(res.verdict, 'SKIP');
  assert.equal(res.score, 0);
  cases += 1;

  assert.ok(cases > 2000, `expected 2000+ scoreListing cases, got ${cases}`);
});

test('scoreListing is total under a 5,000-case seeded fuzz of random listings', () => {
  const rnd = lcg(0x5EED17);
  const pickHostile = () => HOSTILE[Math.floor(rnd() * HOSTILE.length)];

  for (let i = 0; i < 5000; i += 1) {
    const listing = {};
    for (const key of LISTING_KEYS) {
      if (rnd() < 0.5) listing[key] = pickHostile();
    }
    if (rnd() < 0.3) listing.prizes = [pickHostile(), pickHostile(), pickHostile()];
    if (rnd() < 0.3) listing.deadline = NOW + (rnd() - 0.5) * 400 * DAY;
    if (rnd() < 0.3) listing.rewardUsd = (rnd() - 0.2) * 1e7;
    if (rnd() < 0.3) listing.submissions = Math.floor((rnd() - 0.2) * 1e6);

    const profile = {};
    for (const key of PROFILE_KEYS) {
      if (rnd() < 0.5) profile[key] = pickHostile();
    }
    profile.now = rnd() < 0.5 ? NOW : pickHostile();

    const res = scoreListing(listing, profile, rnd() < 0.5 ? { now: NOW } : pickHostile());
    assertScoreShape(res, `fuzz listing #${i}`);
  }
});

test('rankListings and partitionListings survive a hostile array', () => {
  const hostileArray = HOSTILE.concat([
    baseListing(),
    baseListing({ status: 'CLOSED' }),
    baseListing({ deadline: NOW - DAY }),
    baseListing({ agentAccess: undefined }),
    null, undefined, 42, 'listing', [], cyclic, throwingGetter, hostileProxy
  ]);

  const ranked = rankListings(hostileArray, baseProfile(), { now: NOW });
  assert.ok(Array.isArray(ranked), 'rankListings must return an array');
  assertNoBadNumbers(ranked, 'ranked');
  for (const row of ranked) {
    assert.ok(row && typeof row === 'object', 'row must be an object');
    assert.ok(isFiniteNumber(row.score), 'row.score must be finite');
    assert.ok(row.score >= 0 && row.score <= 100, 'row.score out of range');
    assert.ok('listing' in row, 'row must carry its listing');
  }

  // Sorted descending by score.
  for (let i = 1; i < ranked.length; i += 1) {
    assert.ok(ranked[i - 1].score >= ranked[i].score, 'ranked array is not sorted desc');
  }

  const part = partitionListings(hostileArray, baseProfile(), { now: NOW });
  assert.ok(Array.isArray(part.ranked) && Array.isArray(part.skipped));
  // The closed and expired rows are never ranked.
  const skippedReasons = part.skipped.map((s) => s.result.reasons.join(' | ')).join('\n');
  assert.match(skippedReasons, /status is CLOSED/, 'a CLOSED listing must be reported as skipped');
  assert.match(skippedReasons, /deadline passed/, 'an expired listing must be reported as skipped');

  // Non-arrays must not throw either.
  for (const v of HOSTILE) {
    const out = rankListings(v, v, v);
    assert.ok(Array.isArray(out), `rankListings(${lbl(v)}) must return an array`);
  }
});

test('qualityGate, checkProse and harvestText are total', () => {
  for (const a of HOSTILE) {
    for (const b of HOSTILE) {
      const g = qualityGate(a, b, { now: NOW });
      assert.equal(typeof g.pass, 'boolean', 'pass must be a boolean');
      assert.ok(Array.isArray(g.failures), 'failures must be an array');
      assert.ok(Array.isArray(g.warnings), 'warnings must be an array');
      assertNoBadNumbers(g, 'qualityGate');
      for (const f of g.failures) {
        assert.equal(typeof f.message, 'string', 'every failure needs a message');
        assert.ok(f.message.length > 0, 'failure messages must not be empty');
      }
    }
  }
  for (const v of HOSTILE) {
    const p = checkProse(v);
    assert.equal(typeof p.ok, 'boolean');
    assert.ok(Array.isArray(p.failures) && Array.isArray(p.warnings));
    const t = harvestText(v);
    assert.equal(typeof t, 'string', 'harvestText must always return a string');
  }
  // Cyclic and deeply nested raw payloads must not hang or overflow.
  assert.equal(typeof harvestText({ raw: cyclic }), 'string');
  assert.equal(typeof harvestText({ raw: deepNest }), 'string');
  assert.equal(typeof harvestText({ raw: hostileProxy }), 'string');
});

/* ==================================================================================== *
 * 2. THE MONEY CORE HAS NOT DRIFTED FROM calculator.js                                  *
 * ==================================================================================== */

test('expectedUsd never exceeds the pool, across a wide sweep', () => {
  for (const pool of [0, 1, 150, 500, 1000, 3000, 5000, 50000, 1e7]) {
    for (const n of [1, 2, 3, 5, 8, 25, 30, 100, 312, 10000]) {
      for (const e of [0.5, 0.8, 1, 1.2, 1.8, 2.5, 5]) {
        for (const split of [[1], [0.5, 0.3, 0.2], [0.3333, 0.25, 0.15, 0.0667, 0.0333], [0.9, 0.9, 0.9]]) {
          const ev = computeEV({ prizeUsd: pool, submissions: n, hours: 10, skillEdge: e, podiumSplit: split });
          assert.ok(ev.expectedUsd <= pool + 1e-9,
            `pool=${pool} n=${n} e=${e}: expectedUsd ${ev.expectedUsd} > pool`);
          assert.ok(ev.podiumProb <= 1 + 1e-12, 'podiumProb > 1');
        }
      }
    }
  }
});

test('e = 1 identity: a no-edge entrant expects pool / n against a full podium split', () => {
  for (const pool of [100, 1000, 3000, 25000]) {
    for (const n of [4, 5, 10, 25, 100]) {
      for (const split of [[1], [0.5, 0.3, 0.2], [0.4, 0.3, 0.2, 0.1], [0.25, 0.25, 0.25, 0.25]]) {
        const sum = split.reduce((a, b) => a + b, 0);
        const ev = computeEV({ prizeUsd: pool, submissions: n, hours: 1, skillEdge: 1, podiumSplit: split });
        const expected = pool * sum / n;
        assert.ok(Math.abs(ev.expectedUsd - expected) < 1e-9,
          `pool=${pool} n=${n} split=[${split}]: got ${ev.expectedUsd}, expected ${expected}`);
        // And with a split that sums to 1, that is exactly pool / n.
        if (Math.abs(sum - 1) < 1e-12) {
          assert.ok(Math.abs(ev.expectedUsd - pool / n) < 1e-9,
            `pool=${pool} n=${n}: expected exactly pool/n = ${pool / n}, got ${ev.expectedUsd}`);
        }
      }
    }
  }
});

test('winProb follows e / (e + (n - 1)) exactly', () => {
  for (const e of [0.5, 1, 1.8, 2.5, 5]) {
    for (const n of [1, 2, 7, 30, 500]) {
      const ev = computeEV({ prizeUsd: 1000, submissions: n, hours: 1, skillEdge: e, podiumSplit: [1] });
      assert.ok(Math.abs(ev.winProb - e / (e + (n - 1))) < 1e-12,
        `e=${e} n=${n}: winProb ${ev.winProb}`);
    }
  }
});

test('splitFromPrizes divides by the pool, not by the podium sum', () => {
  const split = splitFromPrizes([1000, 750, 450, 200, 100], 3000);
  const sum = split.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 2500 / 3000) < 1e-9,
    `shares must sum to 0.8333 (the missing $500 is money nobody can win), got ${sum}`);
  assert.ok(Math.abs(split[0] - 1 / 3) < 1e-9);
  // Junk in, sane out.
  assert.deepEqual(splitFromPrizes(null, 1000), [1]);
  assert.deepEqual(splitFromPrizes([NaN, -5, 'x'], 1000), [1]);
  assert.deepEqual(splitFromPrizes([0, 0], 0), [1]);
});

/* ==================================================================================== *
 * 3. THE SPEC'S OWN WORKED EXAMPLE                                                      *
 * ==================================================================================== */

const NOSANA = {
  id: 'nosana-agents-102',
  title: 'Nosana Builders Challenge Agents 102',
  slug: 'nosana-builders-challenge-agents-102',
  url: 'https://earn.superteam.fun/listing/nosana-agents-102',
  sponsor: 'Nosana',
  type: 'bounty',
  skill: 'development',
  agentAccess: 'AGENT_ALLOWED',
  rewardUsd: 3000,
  token: 'USDC',
  prizes: [1000, 750, 450, 200, 100],
  submissions: 30,
  estimatedHours: 20,
  deadline: NOW + 240 * HOUR,
  status: 'OPEN',
  region: 'Global',
  eligibilityQuestions: [{ question: 'Project Title' }],
  raw: {
    description:
      'Build and ship a working agent on Nosana. Judged on working code against the stated ' +
      'spec, with a reproducible benchmark and a public repo.'
  }
};

const NOSANA_PROFILE = baseProfile({
  skills: ['agent', 'development'],
  skillEdge: 1.8,
  sponsors: { nosana: { paid: true, listings90d: 4, identifiable: true } }
});

test('worked example: Nosana Agents 102 reproduces the published numbers', () => {
  const res = scoreListing(NOSANA, NOSANA_PROFILE, { now: NOW });

  // The EV core, to the decimal the spec published.
  assert.ok(Math.abs(res.ev.podiumProb - 0.276) < 0.001, `podiumProb ${res.ev.podiumProb} (want ~0.276)`);
  assert.ok(Math.abs(res.expectedUsd - 141.93) < 0.05, `expectedUsd ${res.expectedUsd} (want $141.93)`);
  assert.ok(Math.abs(res.expectedPerHour - 7.10) < 0.02, `rate ${res.expectedPerHour} (want $7.10/h)`);

  // The seven sub-scores.
  assert.ok(Math.abs(res.money - 0.221) < 0.002, `MONEY ${res.money} (want 0.221)`);
  assert.equal(res.fit, 1, `FIT ${res.fit} (want 1.00)`);
  assert.ok(Math.abs(res.crowding - 0.4444) < 0.001, `CROWD ${res.crowding} (want 0.444)`);
  assert.equal(res.runway, 1, `RUNWAY ${res.runway} (want 1.00)`);
  assert.ok(Math.abs(res.runwayRatio - 3) < 1e-6, `r ${res.runwayRatio} (want 3.0)`);
  assert.equal(res.sponsor, 1, `SPONSOR ${res.sponsor} (want 1.00: paid + cadence + identifiable)`);
  assert.equal(res.verify, 1, `VERIFY ${res.verify} (want 1.00: judged on working code)`);
  assert.equal(res.exclusivity, 0.35, `EXCLUSIVITY ${res.exclusivity} (want 0.35)`);

  // The blend.
  assert.ok(Math.abs(res.score - 65.4) < 0.15, `SCORE ${res.score} (want 65.4)`);
  assert.equal(res.verdict, 'BUILD');
  assert.equal(res.band, 'BUILD');
  assert.equal(res.gates.length, 0, 'no gate should fire on this row');

  // The row is honest about being a $7/hour build.
  const joined = res.reasons.join('\n');
  assert.match(joined, /under the \$8\/h floor/, 'must warn that the rate is under the $8/h floor');
  assert.match(joined, /30 entrants for a \$3,000 pool — \$100\.00 per entrant/,
    'must print the entrants-per-dollar reason verbatim');
});

test('the same pool with 18 hours of runway scores 0 regardless of the prize', () => {
  const rushed = Object.assign({}, NOSANA, { deadline: NOW + 18 * HOUR });
  const res = scoreListing(rushed, NOSANA_PROFILE, { now: NOW });

  assert.ok(Math.abs(res.runwayRatio - (18 * 0.35) / (1.4 * 20)) < 1e-6,
    `r ${res.runwayRatio} (want 0.225)`);
  assert.equal(res.runwayOk, false);
  assert.equal(res.score, 0, 'G_runway must zero the row');
  assert.equal(res.verdict, 'SKIP');
  assert.ok(res.gates.some((g) => g.gate === 'G_runway'), 'G_runway must be named');
  assert.match(res.reasons.join('\n'), /insufficient runway/,
    'the SKIP reason must name the runway, not a low score');
});

test('the weights sum to 1.00 and the bands are ordered', () => {
  const sum = Object.keys(WEIGHTS).reduce((a, k) => a + WEIGHTS[k], 0);
  assert.ok(Math.abs(sum - 1) < 1e-12, `weights sum to ${sum}, must be 1.00`);
  assert.ok(BANDS.BUILD > BANDS.SHORTLIST && BANDS.SHORTLIST > BANDS.WATCH);
  assert.equal(CONSTANTS.TARGET_RATE_USD, 25);
  assert.equal(CONSTANTS.RUNWAY_GATE, 1.25);
  assert.equal(CONSTANTS.FIT_GATE, 0.34);
});

test('MONEY is the saturating curve the spec specifies', () => {
  // rate / (rate + 25): $8 -> 0.24, $25 -> 0.50, $75 -> 0.75, $225 -> 0.90
  const cases = [[8, 0.24], [25, 0.50], [75, 0.75], [225, 0.90]];
  for (const [rate, want] of cases) {
    // One entrant, winner-take-all, e clamped high: expectedUsd == pool, so rate == pool/hours.
    const listing = baseListing({
      rewardUsd: rate * 10, prizes: [rate * 10], submissions: 1, estimatedHours: 10,
      raw: { description: 'Build a CLI judged on working code.' }
    });
    const res = scoreListing(listing, baseProfile(), { now: NOW });
    assert.ok(Math.abs(res.expectedPerHour - rate) < 1e-6, `rate ${res.expectedPerHour} != ${rate}`);
    assert.ok(Math.abs(res.money - want) < 0.005, `MONEY ${res.money} for $${rate}/h (want ${want})`);
  }
});

test('CROWD is 1 / (1 + D/8) on entrants per $1,000 of pool', () => {
  const cases = [[0, 1.0], [12, 0.667], [24, 0.5], [48, 0.333], [90, 0.211]];
  for (const [entrants, want] of cases) {
    const listing = baseListing({ rewardUsd: 3000, prizes: [3000], submissions: entrants });
    // trustZeroEntrants so the D = 0 row is scored as the genuinely empty field it claims
    // to be, rather than as the "count not published" case the next test covers.
    const res = scoreListing(listing, baseProfile({ trustZeroEntrants: true }), { now: NOW });
    assert.ok(Math.abs(res.crowding - want) < 0.002,
      `${entrants} entrants on a $3,000 pool: CROWD ${res.crowding} (want ${want})`);
  }
});

test('a reported 0 entrants is treated as unknown, because the feed conflates the two', () => {
  // api.js normalises a missing _count.Submission to 0. Trusting that sets the field size
  // to 1, hands the row a ~100% win probability and makes the engine recommend a phantom.
  const listing = baseListing({ rewardUsd: 3000, prizes: [3000], submissions: 0 });

  const cautious = scoreListing(listing, baseProfile(), { now: NOW });
  assert.equal(cautious.inputs.entrants, 25, 'a 0 must be read as "not published"');
  assert.ok(cautious.assumptions.includes('assumed-field-size'));
  assert.match(cautious.reasons.join('\n'), /also what the feed returns when it does not publish counts/);

  const trusting = scoreListing(listing, baseProfile({ trustZeroEntrants: true }), { now: NOW });
  assert.equal(trusting.inputs.entrants, 0, 'the opt-out must be honoured');
  assert.ok(trusting.score > cautious.score, 'trusting an empty field is the optimistic read');

  // AGENT_ONLY assumes the thinner field.
  const only = scoreListing(
    baseListing({ submissions: 0, agentAccess: 'AGENT_ONLY' }), baseProfile(), { now: NOW });
  assert.equal(only.inputs.entrants, 8);
});

test('a non-USD token pool is never silently read as dollars', () => {
  const sol = baseListing({ rewardUsd: undefined, token: 'SOL', prizes: [12, 6, 2], rewardAmount: 20 });
  const res = scoreListing(sol, baseProfile(), { now: NOW });
  assert.ok(res.assumptions.includes('assumed-usd-parity'), 'must flag the parity assumption');
  assert.match(res.reasons.join('\n'), /SOL is not USD-pegged/);

  // A USD-pegged token needs no flag.
  const usdc = baseListing({ rewardUsd: undefined, token: 'USDC', rewardAmount: 3000, prizes: [3000] });
  const ok = scoreListing(usdc, baseProfile(), { now: NOW });
  assert.equal(ok.inputs.pool, 3000);
  assert.ok(!ok.assumptions.includes('assumed-usd-parity'));
});

/* ==================================================================================== *
 * 4. THE GATES ACTUALLY GATE                                                            *
 * ==================================================================================== */

test('an on-camera listing scores FIT 0 for a profile that cannot do on camera', () => {
  const listing = baseListing({
    title: 'Record an on-camera walkthrough of your integration',
    rewardUsd: 5000,
    prizes: [5000],
    submissions: 3,
    raw: { description: 'You must appear on camera and show your face while demoing the integration.' }
  });

  const res = scoreListing(listing, baseProfile({ canDoOnCamera: false }), { now: NOW });
  assert.equal(res.fit, 0, `FIT ${res.fit} (want exactly 0)`);
  assert.equal(res.score, 0, 'a FIT of 0 must zero the score however large the pool');
  assert.equal(res.verdict, 'SKIP');
  assert.ok(res.gates.some((g) => g.gate === 'G_fit'), 'G_fit must be named');
  assert.match(res.reasons.join('\n'), /needs on-camera video — not buildable by this agent/,
    'the reason must name the capability, not the score');
  assert.ok(res.fitMultipliers.some((m) => m.id === 'on-camera' && m.mult === 0),
    'the firing multiplier must be recorded on the row');

  // The same listing for an operator who says they can do it is graded, not zeroed.
  const ok = scoreListing(listing, baseProfile({ canDoOnCamera: true }), { now: NOW });
  assert.ok(ok.fit > 0, 'canDoOnCamera true must not zero FIT');
  assert.ok(ok.fit <= 0.7 + 1e-9, 'it still costs human hours');
});

test('every hard FIT rule zeroes the row and explains itself', () => {
  const cases = [
    ['in-person', 'Attend the event in person at the venue in Bangkok.'],
    ['reach-gated', 'You must have at least 5000 followers and the winner is judged on engagement.'],
    ['kyc-region', 'KYC is required and this is open to US persons only.'],
    ['no-ai-clause', 'AI-generated submissions are not allowed; entries must be written by a human.'],
    ['team-required', 'Applicants must enter as a team of 3 or as a registered company.']
  ];
  for (const [id, description] of cases) {
    const listing = baseListing({ rewardUsd: 5000, prizes: [5000], submissions: 2, raw: { description } });
    const res = scoreListing(listing, baseProfile(), { now: NOW });
    assert.equal(res.fit, 0, `${id}: FIT ${res.fit} (want 0)`);
    assert.equal(res.score, 0, `${id}: score must be 0`);
    assert.equal(res.verdict, 'SKIP', `${id}: verdict must be SKIP`);
    assert.ok(res.fitMultipliers.some((m) => m.id === id), `${id}: the multiplier must be recorded`);
    assert.ok(res.reasons.join('\n').length > 0, `${id}: must explain itself`);
  }
});

test('a no-AI clause also trips G_integrity and cannot be overridden', () => {
  const listing = baseListing({
    rewardUsd: 5000, prizes: [5000], submissions: 2,
    raw: { description: 'No AI-generated submissions. Entries must be written by a human.' }
  });
  const res = scoreListing(listing, baseProfile(), { now: NOW });
  assert.ok(res.gates.some((g) => g.gate === 'G_integrity'), 'G_integrity must fire');
  assert.equal(res.score, 0);
});

test('graded FIT penalties compound rather than round to "fine"', () => {
  const listing = baseListing({
    raw: { description: 'Submit a demo video walkthrough and a tweet about it on X.' }
  });
  const res = scoreListing(listing, baseProfile(), { now: NOW });
  // screencast 0.70 * tweet 0.85 = 0.595
  assert.ok(Math.abs(res.fit - 0.595) < 1e-9, `FIT ${res.fit} (want 0.595)`);
  assert.equal(res.fitMultipliers.length >= 2, true);
});

test('an unreadable brief lands on FIT 0.50 and says so instead of guessing high', () => {
  const listing = {
    id: 'x', title: 'Opportunity', status: 'OPEN', agentAccess: 'AGENT_ALLOWED',
    rewardUsd: 1000, prizes: [1000], submissions: 10, deadline: NOW + 10 * DAY,
    estimatedHours: 10, region: 'Global'
  };
  const res = scoreListing(listing, baseProfile(), { now: NOW });
  assert.equal(res.fit, 0.5, `FIT ${res.fit} (want 0.50)`);
  assert.ok(res.assumptions.includes('assumed-fit'), 'must flag assumed-fit');
  assert.match(res.reasons.join('\n'), /fit unresolved — read the brief yourself/);
});

test('a probe listing and a blacklisted sponsor both trip G_integrity', () => {
  const probe = baseListing({ title: 'zz-probe-test-listing', rewardUsd: 5000, prizes: [5000], submissions: 1 });
  const p = scoreListing(probe, baseProfile(), { now: NOW });
  assert.equal(p.score, 0);
  assert.ok(p.gates.some((g) => g.gate === 'G_integrity'));

  const bl = scoreListing(baseListing(), baseProfile({ blacklist: ['Acme Protocol'] }), { now: NOW });
  assert.equal(bl.score, 0);
  assert.ok(bl.gates.some((g) => /blacklist/.test(g.reason)));
});

test('a sub-$150 pool is gated by value, and the gate names the money', () => {
  const tiny = baseListing({ rewardUsd: 100, prizes: [100], submissions: 1, estimatedHours: 1 });
  const res = scoreListing(tiny, baseProfile(), { now: NOW });
  assert.equal(res.score, 0);
  assert.ok(res.gates.some((g) => g.gate === 'G_value'), 'G_value must fire');
  assert.match(res.reasons.join('\n'), /\$150 floor/);
});

test('missing agentAccess is kept, flagged and scored at EXCLUSIVITY 0.20', () => {
  const listing = baseListing({ agentAccess: undefined });
  const res = scoreListing(listing, baseProfile(), { now: NOW });
  assert.equal(res.exclusivity, 0.2);
  assert.ok(res.assumptions.includes('assumed-agent-access'), 'must flag assumed-agent-access');
  assert.equal(res.eligible, true, 'a row missing the field is kept, not silently dropped');
  assert.match(res.reasons.join('\n'), /we never invent the field/);
});

test('an unpublished entrant count is assumed and flagged, 8 for AGENT_ONLY and 25 otherwise', () => {
  const only = scoreListing(baseListing({ submissions: undefined, agentAccess: 'AGENT_ONLY' }), baseProfile(), { now: NOW });
  assert.equal(only.inputs.entrants, 8);
  assert.ok(only.assumptions.includes('assumed-field-size'));

  const allowed = scoreListing(baseListing({ submissions: undefined }), baseProfile(), { now: NOW });
  assert.equal(allowed.inputs.entrants, 25);
  assert.ok(allowed.assumptions.includes('assumed-field-size'));
});

/* ==================================================================================== *
 * 5. AGENT_ONLY OUTRANKS AGENT_ALLOWED                                                  *
 * ==================================================================================== */

test('AGENT_ONLY outranks AGENT_ALLOWED with everything else held equal', () => {
  const allowed = baseListing({ id: 'allowed', agentAccess: 'AGENT_ALLOWED', submissions: 12 });
  const only = baseListing({ id: 'only', agentAccess: 'AGENT_ONLY', submissions: 12 });

  const a = scoreListing(allowed, baseProfile(), { now: NOW });
  const o = scoreListing(only, baseProfile(), { now: NOW });

  assert.ok(o.score > a.score, `AGENT_ONLY ${o.score} must beat AGENT_ALLOWED ${a.score}`);
  // The only difference is the EXCLUSIVITY term: 0.07 * (1.00 - 0.35) * 100 = 4.55 points.
  assert.ok(Math.abs((o.score - a.score) - 4.55) < 0.02,
    `the gap should be exactly the EXCLUSIVITY weight (4.55), got ${(o.score - a.score).toFixed(2)}`);
  assert.match(o.reasons.join('\n'), /AGENT_ONLY — no human field to beat/);

  const ranked = rankListings([allowed, only], baseProfile(), { now: NOW });
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].listing.id, 'only', 'AGENT_ONLY must sort first');
});

test('ranking is sorted by score, then expectedUsd, then deadline', () => {
  // Two rows engineered to tie on score but not on expectedUsd.
  const rows = [
    baseListing({ id: 'low', rewardUsd: 1000, prizes: [1000], submissions: 10, estimatedHours: 10 }),
    baseListing({ id: 'high', rewardUsd: 4000, prizes: [4000], submissions: 40, estimatedHours: 10 })
  ];
  const ranked = rankListings(rows, baseProfile(), { now: NOW });
  for (let i = 1; i < ranked.length; i += 1) {
    const prev = ranked[i - 1];
    const cur = ranked[i];
    assert.ok(prev.score > cur.score ||
      (prev.score === cur.score && prev.result.expectedUsd >= cur.result.expectedUsd),
      'tie-break order violated');
  }
});

test('ineligible rows are never ranked but are still explained', () => {
  const rows = [
    baseListing({ id: 'open' }),
    baseListing({ id: 'closed', status: 'CLOSED' }),
    baseListing({ id: 'expired', deadline: NOW - 3 * DAY })
  ];
  const { ranked, skipped } = partitionListings(rows, baseProfile(), { now: NOW });
  assert.deepEqual(ranked.map((r) => r.listing.id), ['open']);
  assert.deepEqual(skipped.map((r) => r.listing.id).sort(), ['closed', 'expired']);
  for (const s of skipped) {
    assert.ok(s.result.reasons.length > 0, 'a skipped row must carry its reason');
    assert.equal(s.result.verdict, 'SKIP');
  }
});

/* ==================================================================================== *
 * 6. qualityGate                                                                        *
 * ==================================================================================== */

const GATE_LISTING = {
  id: 'lst_abc123',
  title: 'Build a CLI that ranks open bounties',
  slug: 'build-a-cli-that-ranks-open-bounties',
  sponsor: 'Acme Protocol',
  type: 'bounty',
  skill: 'development',
  agentAccess: 'AGENT_ALLOWED',
  status: 'OPEN',
  rewardUsd: 3000,
  token: 'USDC',
  prizes: [1500, 900, 600],
  submissions: 24,
  deadline: NOW + 5 * DAY,
  region: 'Global',
  eligibilityQuestions: [
    { question: 'Project Title' },
    { question: 'What did you build?' }
  ],
  requirements: ['Must be open source', 'Must include tests'],
  judgingCriteria: ['Working code', 'Documentation'],
  raw: { description: 'Build a working CLI in TypeScript. Judged on working code against the spec.' }
};

const GOOD_OTHER_INFO = [
  'A CLI that ranks open Superteam Earn listings by expected dollars per hour and refuses to submit anything that fails a 13-point quality gate.',
  '',
  'What it does',
  '- Scores every open AGENT_ALLOWED and AGENT_ONLY listing in under 2 seconds, offline, from a cached feed',
  '- Falls back to the public listings endpoint when the agent feed returns no open rows (earn#1456) and names which path produced the results',
  '- Blocks submission on 13 checks, including a clean-room fetch of the demo URL',
  '',
  'How it works',
  'Node 22, zero npm dependencies, built-ins only. Scoring is a pure module with an injectable clock, so the 20,000-case fuzz is reproducible. I rejected an LLM scorer because a judge cannot audit one.',
  '',
  'Against your criteria',
  '- Working code: agent/lib/rank.js plus 31 tests (run npm test, 4 seconds)',
  '- Documentation: README judging table (read it, 90 seconds)',
  '',
  'Run it in 2 minutes',
  '1. git clone the repo',
  '2. node agent/bin/earn-agent.js rank',
  '3. You should see a ranked table with a provenance header',
  '',
  'What it does not do yet',
  '- No retry on HTTP 429 from the fallback feed',
  '- Only tested against Node 22 on Linux',
  '',
  'Built by the operator (ICT), 14 hours over 4 days.'
].join('\n');

function completeDraft(over) {
  return Object.assign({
    listingId: 'lst_abc123',
    // Not *.example.com: the gate now refuses IANA-reserved placeholder domains,
    // because nobody can demo on one and a judge cannot open it.
    link: 'https://earn-rank.pages.dev',
    tweet: '',
    otherInfo: GOOD_OTHER_INFO,
    ask: null,
    telegram: 'http://t.me/operator_handle',
    verdict: 'BUILD',
    expectedPerHour: 12.5,
    eligibilityAnswers: [
      { question: 'Project Title', answer: 'Earn Rank, a scoring and submission gate for agent bounties' },
      { question: 'What did you build?', answer: 'A zero-dependency Node CLI that ranks open agent-eligible listings by expected dollars per hour and blocks any submission that fails a 13-point quality gate.' }
    ],
    compliance: [
      { requirement: 'Must be open source', satisfiedBy: 'https://github.com/operator/earn-rank (MIT)' },
      { requirement: 'Must include tests', satisfiedBy: 'agent/test/rank.test.js, 31 tests' }
    ],
    judgingMap: [
      { criterion: 'Working code', where: 'agent/lib/rank.js', howToVerify: 'run npm test, 4 seconds' },
      { criterion: 'Documentation', where: 'README.md judging table', howToVerify: 'read the table, 40 seconds' }
    ],
    linkCheck: { status: 200, checkedAt: NOW - 3 * 60 * 1000, cleanRoom: true },
    runCheck: { command: 'git clone ... && node agent/bin/earn-agent.js rank', exitCode: 0, cleanContainer: true },
    readme: {
      readAloudSeconds: 104,
      timed: true,
      sections: ['whatItDoes', 'oneCommandRun', 'screenshot', 'judgingCriteria', 'limits'],
      limits: [
        'No retry on HTTP 429 from the fallback feed',
        'Only tested against Node 22 on Linux'
      ]
    },
    attribution: { vendoredUnattributed: [] },
    tests: { ci: 'green', hasFailingIfBrokenTest: true },
    repo: {
      url: 'https://github.com/operator/earn-rank',
      public: true,
      license: 'MIT',
      commits: 14,
      commitSubjects: ['scaffold cli', 'add scoring engine', 'add quality gate', 'readme and tests']
    },
    secretScan: { clean: true, hits: [] },
    humanSignOff: { approved: true, openedLink: true, by: 'operator', at: NOW - 60 * 1000 }
  }, over || {});
}

test('qualityGate rejects an empty draft, naming the failing items', () => {
  const res = qualityGate({}, GATE_LISTING, { now: NOW });
  assert.equal(res.pass, false, 'an empty draft must never pass');
  assert.ok(res.failures.length >= 15, `expected many failures, got ${res.failures.length}`);

  // Every one of the 13 items has to register the emptiness.
  const items = new Set(res.failures.map((f) => String(f.item)));
  for (const n of ['1', '2', '3', '4', '5', '6', '8', '9', '10', '11', '12', '13']) {
    assert.ok(items.has(n), `item ${n} should have failed on an empty draft`);
  }

  // The failures have to be actionable, not "invalid".
  const byCode = res.failures.reduce((m, f) => { m[f.code] = f; return m; }, {});
  assert.ok(byCode['no-compliance-matrix'], 'must demand a brief-compliance matrix');
  assert.ok(byCode['answer-missing'], 'must name the unanswered eligibility question');
  assert.ok(byCode['link-unusable'] || byCode['link-unverified'], 'must demand a verified demo link');
  assert.ok(byCode['other-info-too-short'], 'must refuse a stub otherInfo');
  assert.ok(byCode['telegram-malformed'], 'must demand a real telegram handle');
  assert.ok(byCode['no-human-signoff'], 'must demand a human sign-off');
  for (const f of res.failures) {
    assert.ok(f.message.length > 20, `failure ${f.code} is not specific enough: "${f.message}"`);
  }
});

test('qualityGate passes a complete draft at 13/13', () => {
  const res = qualityGate(completeDraft(), GATE_LISTING, { now: NOW });
  if (!res.pass) {
    const detail = res.failures.map((f) => `  [item ${f.item}] ${f.code}: ${f.message}`).join('\n');
    assert.fail(`complete draft should pass 13/13 but failed:\n${detail}`);
  }
  assert.equal(res.pass, true);
  assert.deepEqual(res.failures, []);
  assert.equal(res.itemsPassed, 13);
});

test('qualityGate refuses padding that only LOOKS long enough', () => {
  // Regression: these all passed 13/13 before the gate measured substance
  // instead of String.length. Each one is an empty submission with padding.
  const padding = [
    ['400 spaces + the required heading',
      { otherInfo: `${' '.repeat(400)}\nwhat it does not do yet\n` }, /actual content/],
    ['500 newlines + the required heading',
      { otherInfo: `${'\n'.repeat(500)}What it does not do yet` }, /actual content/],
    ['one letter repeated past the minimum',
      { otherInfo: `${'a'.repeat(450)} What it does not do yet` }, /distinct/],
    ['an answer of one repeated letter',
      { eligibilityAnswers: [
        { question: 'Project Title', answer: 'a'.repeat(60) },
        { question: 'What did you build?', answer: 'b'.repeat(60) },
      ] }, /word/],
  ];
  for (const [label, over, re] of padding) {
    const res = qualityGate(completeDraft(over), GATE_LISTING, { now: NOW });
    assert.equal(res.pass, false, `padding case "${label}" must not pass`);
    assert.ok(
      res.failures.some((f) => re.test(f.message)),
      `"${label}" failed for the wrong reason: ${res.failures.map((f) => f.code).join(',')}`,
    );
  }
});

test('qualityGate refuses an unopenable host and a stale sign-off', () => {
  const cases = [
    ['no TLD', { link: 'https://a' }, /no resolvable host/],
    ['reserved placeholder domain', { link: 'https://demo.example.com/x' }, /placeholder domain/],
    ['sign-off from last year', { humanSignOff: { approved: true, openedLink: true, by: 'op', at: NOW - 400 * 24 * 3600 * 1000 } }, /hours old/],
  ];
  for (const [label, over, re] of cases) {
    const res = qualityGate(completeDraft(over), GATE_LISTING, { now: NOW });
    assert.equal(res.pass, false, `"${label}" must not pass`);
    assert.ok(res.failures.some((f) => re.test(f.message)), `"${label}" failed for the wrong reason`);
  }
});

test('qualityGate blocks each refusal rule one at a time', () => {
  const cases = [
    ['localhost demo link', { link: 'http://localhost:3000' }, /localhost/],
    ['tunnel demo link', { link: 'https://abc123.ngrok-free.app' }, /tunnel/],
    ['stale link check', { linkCheck: { status: 200, checkedAt: NOW - 40 * 60 * 1000, cleanRoom: true } }, /inside 15/],
    ['non-200 demo', { linkCheck: { status: 503, checkedAt: NOW - 60000, cleanRoom: true } }, /HTTP 503/],
    ['dirty link check', { linkCheck: { status: 200, checkedAt: NOW - 60000, cleanRoom: false } }, /clean-room|fresh environment/],
    ['failing run', { runCheck: { command: 'npm start', exitCode: 1, cleanContainer: true } }, /exited 1/],
    ['long readme', { readme: Object.assign({}, completeDraft().readme, { readAloudSeconds: 260 }) }, /260 seconds/],
    ['one limitation', { readme: Object.assign({}, completeDraft().readme, { limits: ['only one'] }) }, /at least 2/],
    ['squashed history', { repo: Object.assign({}, completeDraft().repo, { commits: 1, commitSubjects: ['initial commit'] }) }, /commit/],
    ['no license', { repo: Object.assign({}, completeDraft().repo, { license: '' }) }, /license/],
    ['secrets found', { secretScan: { clean: false, hits: ['agent/.earn-agent.json'] } }, /scan/],
    ['wrong listing id', { listingId: 'lst_someone_else' }, /does not match/],
    ['unrequested tweet', { tweet: 'https://x.com/op/status/1' }, /does not ask for one/],
    ['non-null ask', { ask: 500 }, /must be null/],
    ['bad telegram', { telegram: '@operator' }, /t\.me/],
    ['no sign-off', { humanSignOff: { approved: false, openedLink: true, by: 'op', at: NOW } }, /sign-off/i],
    ['duplicate create', { priorSubmissionId: 'sub_999' }, /submissions\/update/],
    ['not shortlisted', { verdict: 'WATCH' }, /spray-and-pray/],
    ['micro-value rate', { expectedPerHour: 3 }, /\$8\/h floor|\$8 floor/],
    ['banned phrase', { otherInfo: GOOD_OTHER_INFO.replace('A CLI that ranks', 'This project leverages a cutting-edge approach that ranks') }, /banned filler phrase/],
    ['no limits section', { otherInfo: GOOD_OTHER_INFO.replace(/What it does not do yet[\s\S]*/, 'Built by the operator, 14 hours.') }, /What it does not do yet/],
    ['stub title answer', { eligibilityAnswers: [
      { question: 'Project Title', answer: 'test submission placeholder entry for the listing' },
      { question: 'What did you build?', answer: 'A zero-dependency Node CLI that ranks open agent-eligible listings and blocks weak submissions.' }
    ] }, /not caring/],
    ['short answer', { eligibilityAnswers: [
      { question: 'Project Title', answer: 'Earn Rank' },
      { question: 'What did you build?', answer: 'A zero-dependency Node CLI that ranks open agent-eligible listings and blocks weak submissions.' }
    ] }, /minimum is 40/]
  ];

  for (const [label, override, pattern] of cases) {
    const res = qualityGate(completeDraft(override), GATE_LISTING, { now: NOW });
    assert.equal(res.pass, false, `${label}: should not pass`);
    const joined = res.failures.map((f) => f.message).join('\n');
    assert.match(joined, pattern, `${label}: expected a failure matching ${pattern}\ngot:\n${joined}`);
  }
});

test('qualityGate refuses inside the final 60 minutes and when the deadline has passed', () => {
  const soon = Object.assign({}, GATE_LISTING, { deadline: NOW + 30 * 60 * 1000 });
  const a = qualityGate(completeDraft(), soon, { now: NOW });
  assert.equal(a.pass, false);
  assert.match(a.failures.map((f) => f.message).join('\n'), /final 60 minutes/);

  const gone = Object.assign({}, GATE_LISTING, { deadline: NOW - 60 * 1000 });
  const b = qualityGate(completeDraft(), gone, { now: NOW });
  assert.equal(b.pass, false);
  assert.match(b.failures.map((f) => f.message).join('\n'), /deadline passed/);
});

test('qualityGate refuses a submission when the brief bans AI entries', () => {
  const banned = Object.assign({}, GATE_LISTING, {
    raw: { description: 'AI-generated submissions are not allowed. Entries must be written by a human.' }
  });
  const res = qualityGate(completeDraft(), banned, { now: NOW });
  assert.equal(res.pass, false);
  assert.match(res.failures.map((f) => f.message).join('\n'), /prohibits AI/);
});

test('qualityGate catches a leaked API key in the submission body itself', () => {
  const res = qualityGate(completeDraft({
    otherInfo: GOOD_OTHER_INFO.replace('Node 22, zero npm', 'Key sk_live_A1b2C3d4E5f6G7h8 used. Node 22, zero npm')
  }), GATE_LISTING, { now: NOW });
  assert.equal(res.pass, false);
  assert.match(res.failures.map((f) => f.message).join('\n'), /rotate the key/);
});

test('a tweet is required when the brief asks for one', () => {
  const wantsTweet = Object.assign({}, GATE_LISTING, {
    raw: { description: 'Build the integration and submit a tweet about it. Judged on working code.' }
  });
  const missing = qualityGate(completeDraft(), wantsTweet, { now: NOW });
  assert.equal(missing.pass, false);
  assert.match(missing.failures.map((f) => f.message).join('\n'), /tweet field is empty/);

  const supplied = qualityGate(completeDraft({ tweet: 'https://x.com/operator/status/123' }), wantsTweet, { now: NOW });
  assert.equal(supplied.pass, true, supplied.failures.map((f) => f.code).join(', '));
});

test('checkProse enforces the draft-template rules', () => {
  const bad = checkProse('I\'m excited to share this revolutionary, game-changing tool — it seamlessly works.');
  assert.equal(bad.ok, false);
  const joined = bad.failures.join('\n');
  assert.match(joined, /banned filler phrase/);
  assert.match(joined, /em dash/);
  assert.match(joined, /What it does not do yet/);

  const good = checkProse(GOOD_OTHER_INFO);
  assert.equal(good.ok, true, good.failures.join('; '));
});

/* ==================================================================================== *
 * 7. REASONS ARE PRINTABLE VERBATIM                                                     *
 * ==================================================================================== */

test('reasons read like the spec\'s examples, with real numbers in them', () => {
  const crowded = baseListing({
    id: 'crowded', rewardUsd: 1000, prizes: [1000], submissions: 312, estimatedHours: 10
  });
  const res = scoreListing(crowded, baseProfile(), { now: NOW });
  assert.match(res.reasons.join('\n'), /312 entrants for a \$1,000 pool — \$3\.21 per entrant/);

  const rushed = baseListing({ deadline: NOW + 18 * HOUR, estimatedHours: 30 });
  const r2 = scoreListing(rushed, baseProfile(), { now: NOW });
  assert.match(r2.reasons.join('\n'), /deadline in 18h vs ~42h of realistic build — insufficient runway/);

  const only = scoreListing(baseListing({ agentAccess: 'AGENT_ONLY' }), baseProfile(), { now: NOW });
  assert.match(only.reasons.join('\n'), /AGENT_ONLY — no human field to beat/);

  const oncam = scoreListing(
    baseListing({ raw: { description: 'You must appear on camera.' } }),
    baseProfile({ canDoOnCamera: false }), { now: NOW });
  assert.match(oncam.reasons.join('\n'), /needs on-camera video — not buildable by this agent/);
});

test('the engine never flatters an above-baseline skill edge without saying so', () => {
  const res = scoreListing(baseListing(), baseProfile({ skillEdge: 4.5 }), { now: NOW });
  assert.match(res.reasons.join('\n'), /above the 1\.8 baseline/);
});

test('an absent deadline and an absent status are assumed, flagged and printed', () => {
  const res = scoreListing(
    baseListing({ deadline: undefined, status: undefined }), baseProfile(), { now: NOW });
  assert.ok(res.assumptions.includes('assumed-deadline'));
  assert.ok(res.assumptions.includes('assumed-status-open'));
  assert.match(res.reasons.join('\n'), /no deadline published/);
  assert.match(res.reasons.join('\n'), /no status published/);
});
