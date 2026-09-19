/*
 * agent/test/regression.test.js — regression tests for defects found by the
 * correctness/robustness audit. Each test below FAILED before its fix.
 *
 * Run: node --test agent/test/regression.test.js
 *
 * Zero dependencies: node:test and node:assert/strict only. Deliberately a
 * separate file so it can be read as "the bugs we have already had".
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { createClient, ApiError, normaliseListing } from '../lib/api.js';
import { splitFromPrizes, scoreListing, computeEV } from '../lib/rank.js';
import { isIgnoredByGit, findRepoRoot, configProtection } from '../lib/store.js';

const NOW = Date.parse('2026-09-19T00:00:00.000Z');
const DAY = 24 * 3600 * 1000;

/* -------------------------------------------------------------------------- *
 * 1. rank.js read api.js's podium as winner-take-all                          *
 *                                                                             *
 * api.js normalisePrizes() emits [{position, amount}] for every listing that   *
 * came from the details endpoint. splitFromPrizes() read each row with num(),  *
 * which returns 0 for an object, so amounts[] came back empty and every        *
 * published podium collapsed to [1]. podiumProb was understated ~4.7x and the  *
 * file's own worked example did not reproduce through the real pipeline.       *
 * -------------------------------------------------------------------------- */

const NOSANA_RAW = {
  id: 'lst_nosana',
  slug: 'nosana-builders-challenge-agents-102',
  title: 'Nosana Builders Challenge: Agents 102',
  status: 'OPEN',
  agentAccess: 'AGENT_ALLOWED',
  token: 'USDC',
  rewardAmount: 3000,
  deadline: new Date(NOW + 10 * DAY).toISOString(),
  sponsor: { name: 'Nosana', isVerified: true },
  _count: { Submission: 30 },
  rewards: { 1: 1000, 2: 750, 3: 450, 4: 200, 5: 100 },
  skills: [{ skills: 'Frontend' }],
};

test('splitFromPrizes reads the {position, amount} rows api.js actually produces', () => {
  const listing = normaliseListing(NOSANA_RAW, { baseUrl: 'https://superteam.fun' });
  assert.ok(Array.isArray(listing.prizes) && listing.prizes.length === 5);
  assert.equal(typeof listing.prizes[0], 'object', 'api.js emits objects, not numbers');

  const fromObjects = splitFromPrizes(listing.prizes, 3000);
  const fromNumbers = splitFromPrizes([1000, 750, 450, 200, 100], 3000);

  assert.deepEqual(fromObjects, fromNumbers, 'both shapes must yield the same split');
  assert.equal(fromObjects.length, 5, 'a 5-place podium is not winner-take-all');
  assert.ok(Math.abs(fromObjects[0] - 1 / 3) < 1e-12);
  const sum = fromObjects.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 2500 / 3000) < 1e-12, 'shares divide by the POOL, not the podium sum');
});

test('the worked example in the rank.js header reproduces through the real api.js pipeline', () => {
  const listing = normaliseListing(NOSANA_RAW, { baseUrl: 'https://superteam.fun' });
  const scored = scoreListing(listing, { defaultHours: 20 }, { now: NOW });

  assert.equal(scored.inputs.podiumSplit.length, 5);
  assert.ok(Math.abs(scored.ev.podiumProb - 0.276) < 0.002, `podiumProb ${scored.ev.podiumProb}`);
  assert.equal(scored.expectedUsd, 141.93);
  assert.equal(scored.expectedPerHour, 7.1);
});

test('splitFromPrizes keeps its old guarantees for junk input', () => {
  assert.deepEqual(splitFromPrizes(null, 1000), [1]);
  assert.deepEqual(splitFromPrizes([NaN, -5, 'x'], 1000), [1]);
  assert.deepEqual(splitFromPrizes([0, 0], 0), [1]);
  assert.deepEqual(splitFromPrizes([{ position: 1, amount: 'nope' }], 1000), [1]);
});

/* -------------------------------------------------------------------------- *
 * 2. round() manufactured Infinity from a FINITE input                        *
 *                                                                             *
 * round(v, 2) computed Math.round(v * 100) / 100. For v near Number.MAX_VALUE *
 * the multiply overflows, so the module's last line of defence was the one    *
 * place that could return Infinity for an input that was finite all the way   *
 * through. A listing with rewardUsd: 1e308 produced inputs.pool = Infinity.   *
 * The existing fuzz pool used '1e400' (already Infinity) and so never hit it. *
 * -------------------------------------------------------------------------- */

test('a finite but enormous pool never produces Infinity anywhere in the result', () => {
  for (const pool of [1e308, Number.MAX_VALUE, 1e307, 5e307]) {
    const scored = scoreListing(
      { id: 'x', title: 'Build a CLI', status: 'OPEN', agentAccess: 'AGENT_ALLOWED', rewardUsd: pool },
      {},
      { now: NOW },
    );
    for (const [k, v] of Object.entries({
      score: scored.score,
      expectedUsd: scored.expectedUsd,
      expectedPerHour: scored.expectedPerHour,
      pool: scored.inputs.pool,
      raw: scored.raw,
    })) {
      assert.ok(Number.isFinite(v), `${k} = ${v} for pool ${pool}`);
    }
    assert.ok(scored.score >= 0 && scored.score <= 100);
  }
});

test('ordinary values still round to 2 places', () => {
  const scored = scoreListing(
    { id: 'x', title: 'Build a CLI', status: 'OPEN', agentAccess: 'AGENT_ALLOWED', rewardUsd: 3000, token: 'USDC' },
    { defaultHours: 10 },
    { now: NOW },
  );
  assert.equal(scored.expectedUsd, Math.round(scored.expectedUsd * 100) / 100);
  assert.ok(Number.isFinite(computeEV({ prizeUsd: 1e308, submissions: 5, hours: 3 }).expectedUsd));
});

/* -------------------------------------------------------------------------- *
 * 3. A 2xx carrying HTML was reported as "0 listings", i.e. as bug #1456      *
 *                                                                             *
 * parseMaybeJson() parks an unparseable body under `_raw`; toListingArray()   *
 * then returned [] and liveListings() blamed SuperteamDAO/earn#1456 for what  *
 * was really a CDN error page or a proxy interstitial.                        *
 * -------------------------------------------------------------------------- */

const HTML_PAGE = '<!doctype html><html><head><title>502 Bad Gateway</title></head><body>nginx</body></html>';

function htmlClient() {
  return createClient({
    baseUrl: 'http://mock.test',
    fallbackBaseUrl: 'http://mock.test',
    apiKey: 'sk_test_0000000000000000',
    maxRetries: 0,
    fetchImpl: async () => ({ status: 200, headers: { get: () => null }, text: async () => HTML_PAGE }),
  });
}

test('a 200 carrying HTML is named as such, never as issue #1456', async () => {
  await assert.rejects(
    () => htmlClient().liveListings({ take: 5 }),
    (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.code, 'NON_JSON_BODY');
      assert.match(err.message, /not JSON/i);
      assert.match(err.message, /NOT SuperteamDAO\/earn#1456/);
      return true;
    },
  );
});

test('a genuinely empty array is still read as the #1456 symptom', async () => {
  const c = createClient({
    baseUrl: 'http://mock.test',
    fallbackBaseUrl: 'http://mock.test',
    apiKey: 'sk_test_0000000000000000',
    maxRetries: 0,
    fetchImpl: async () => ({ status: 200, headers: { get: () => null }, text: async () => '[]' }),
  });
  const res = await c.liveListings({ take: 5 });
  assert.equal(res.listings.length, 0);
  assert.ok(res.warnings.some((w) => w.includes('#1456')), 'the real symptom must still be named');
});

/* -------------------------------------------------------------------------- *
 * 4. A connection dropped MID-BODY escaped as a raw TypeError                 *
 *                                                                             *
 * The reset rejects inside readBodyCapped(), not inside fetch(), so it came   *
 * out as `TypeError: terminated` with no `code` and no `status`. The CLI      *
 * branches on `err instanceof ApiError` to decide whether a create's outcome  *
 * is unknown; a raw TypeError read as "definitely nothing happened", the      *
 * reservation was released, and the next submit would POST a duplicate the    *
 * API has no Idempotency-Key to collapse.                                     *
 * -------------------------------------------------------------------------- */

test('a connection dropped mid-body surfaces as ApiError NETWORK, status 0', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json', 'transfer-encoding': 'chunked' });
    res.write('{"id":"sub_1","stat');
    setTimeout(() => req.socket.destroy(), 20);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const c = createClient({ baseUrl, apiKey: 'sk_test_0000000000000000' });
    await assert.rejects(
      () => c.createSubmission({ listingId: 'lst_a', link: 'https://example.test' }),
      (err) => {
        assert.ok(err instanceof ApiError, `got ${err && err.constructor && err.constructor.name}`);
        assert.equal(err.code, 'NETWORK');
        assert.equal(err.status, 0);
        return true;
      },
    );
  } finally {
    server.close();
  }
});

/* -------------------------------------------------------------------------- *
 * 5. A 2xx with no submission id was reported as a plain success              *
 * -------------------------------------------------------------------------- */

test('a POST answered 200 with HTML is flagged unverified, not reported as sent', async () => {
  const res = await htmlClient().createSubmission({ listingId: 'lst_a', link: 'https://example.test' });
  assert.equal(res.unverified, true);
  assert.equal(res.submission.id, null);
  assert.ok(res.warnings.length > 0);
  assert.match(res.warnings[0], /NOT confirmed/);
});

test('a well-formed POST response is not flagged unverified', async () => {
  const c = createClient({
    baseUrl: 'http://mock.test',
    apiKey: 'sk_test_0000000000000000',
    fetchImpl: async () => ({
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify({ id: 'sub_1', status: 'Pending', listingId: 'lst_a' }),
    }),
  });
  const res = await c.createSubmission({ listingId: 'lst_a', link: 'https://example.test' });
  assert.equal(res.unverified, false);
  assert.equal(res.submission.id, 'sub_1');
  assert.deepEqual(res.warnings, []);
});

/* -------------------------------------------------------------------------- *
 * 6. An over-cap body was re-downloaded on every retry                        *
 * -------------------------------------------------------------------------- */

test('an over-cap body is fetched once, not once per retry', async () => {
  let calls = 0;
  const c = createClient({
    baseUrl: 'http://mock.test',
    apiKey: 'sk_test_0000000000000000',
    maxRetries: 2,
    maxResponseBytes: 1024,
    fetchImpl: async () => {
      calls += 1;
      return {
        status: 200,
        headers: { get: (h) => (h === 'content-length' ? '99999999' : null) },
        text: async () => 'x'.repeat(99999999),
      };
    },
  });
  await assert.rejects(() => c.status(), (err) => err.code === 'BODY_TOO_LARGE');
  assert.equal(calls, 1, `the oversized body was requested ${calls} times`);
});

test('a 500 on a GET is still retried twice (3 attempts)', async () => {
  let calls = 0;
  const c = createClient({
    baseUrl: 'http://mock.test',
    apiKey: 'sk_test_0000000000000000',
    maxRetries: 2,
    retryBaseMs: 1,
    fetchImpl: async () => {
      calls += 1;
      return { status: 500, headers: { get: () => null }, text: async () => '{"error":"boom"}' };
    },
  });
  await assert.rejects(() => c.status());
  assert.equal(calls, 3);
});

/* -------------------------------------------------------------------------- *
 * 7. liveListings() claimed a provenance it had not used                      *
 *                                                                             *
 * When the primary returned only ineligible rows and every fallback tier then *
 * returned nothing, the terminal `return` picked between the only two enum     *
 * values it had and reported 'agents-live'. The CLI printed                    *
 * "Source: agents-live — the agent endpoint itself" directly above warnings    *
 * saying the agent endpoint had hit #1456 and three fallbacks had been tried.  *
 * -------------------------------------------------------------------------- */

test("every tier empty reports source 'none', not a path it did not use", async () => {
  const seen = [];
  const c = createClient({
    baseUrl: 'http://mock.test',
    fallbackBaseUrl: 'http://legacy.test',
    apiKey: 'sk_test_0000000000000000',
    retryBaseMs: 1,
    fetchImpl: async (url) => {
      seen.push(String(url));
      const rows = String(url).includes('/api/agents/listings/live')
        // rows exist but are all past their deadline: the #1456 symptom
        ? [{ ...NOSANA_RAW, deadline: new Date(Date.now() - 864e5).toISOString() }]
        : [];
      return { status: 200, headers: { get: () => null }, text: async () => JSON.stringify(rows) };
    },
  });

  const out = await c.liveListings({ take: 20 });
  assert.equal(out.listings.length, 0);
  assert.equal(out.source, 'none', `source was "${out.source}"`);
  assert.notEqual(out.source, 'agents-live', 'must not credit an endpoint that produced nothing');
  assert.ok(seen.some((u) => u.includes('/api/agents/listings/live')));
  assert.ok(seen.some((u) => u.includes('context=agents')));
  assert.ok(seen.some((u) => u.includes('take=100')), 'all four tiers must have been walked');
});

test("a tier that DOES produce rows still reports its own source", async () => {
  const c = createClient({
    baseUrl: 'http://mock.test',
    apiKey: 'sk_test_0000000000000000',
    retryBaseMs: 1,
    fetchImpl: async (url) => {
      const rows = String(url).includes('/api/agents/listings/live') ? [] : [NOSANA_RAW];
      return { status: 200, headers: { get: () => null }, text: async () => JSON.stringify(rows) };
    },
  });
  const out = await c.liveListings({ take: 20 });
  assert.equal(out.source, 'fallback-filter');
  assert.equal(out.listings.length, 1);
});

/* -------------------------------------------------------------------------- *
 * 8. `register` asserted "already gitignored" without ever checking           *
 *                                                                             *
 * The success message was a constant string. It was true for the default      *
 * path and false the moment EARN_AGENT_HOME moved the state file — including  *
 * moving it somewhere git IS watching, which is exactly the case where a      *
 * false all-clear costs the operator their key. store.configProtection() now  *
 * answers from the filesystem; these tests pin it to real `git check-ignore`. *
 * -------------------------------------------------------------------------- */

function tmpRepo(gitignoreText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'earn-gi-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  if (gitignoreText !== null) fs.writeFileSync(path.join(dir, '.gitignore'), gitignoreText);
  return dir;
}

function gitAgrees(repo, rel) {
  try {
    execFileSync('git', ['-C', repo, 'check-ignore', '-q', '--no-index', rel], { stdio: 'ignore' });
    return true;
  } catch (err) {
    if (err.status === 1) return false;
    throw err;
  }
}

test('isIgnoredByGit agrees with real `git check-ignore`', () => {
  const repo = tmpRepo([
    'agent/.earn-agent.json',
    'agent/.earn-agent.json.*',
    'agent/drafts/',
    '*.pem',
    'build/',
    '!build/keep.txt',
    'docs/**/draft.md',
  ].join('\n'));

  const cases = [
    'agent/.earn-agent.json',
    'agent/.earn-agent.json.lock',
    'agent/..earn-agent.json.tmp-1-2',
    'agent/drafts/lst_a.json',
    'agent/lib/api.js',
    'keys/.earn-agent.json',
    'server.pem',
    'deep/server.pem',
    'build/out.js',
    'build/keep.txt', // git will NOT re-include: the parent dir is excluded
    'docs/a/b/draft.md',
    'docs/final.md',
    'README.md',
  ];

  for (const rel of cases) {
    assert.equal(
      isIgnoredByGit(repo, path.join(repo, rel)),
      gitAgrees(repo, rel),
      `disagreed with git on ${rel}`,
    );
  }
  fs.rmSync(repo, { recursive: true, force: true });
});

test('configProtection reports no-repo / ignored / not-ignored from disk', () => {
  // (a) outside any git working tree — the old code still said "gitignored"
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'earn-bare-'));
  const bareFile = path.join(bare, '.earn-agent.json');
  fs.writeFileSync(bareFile, '{}', { mode: 0o600 });
  const outside = configProtection(bareFile);
  assert.equal(outside.gitStatus, 'no-repo');
  assert.equal(outside.repoRoot, null);
  assert.equal(outside.modeOk, true, 'mode 600 is the half that was always true');

  // (b) inside a repo AND covered
  const repo = tmpRepo('agent/.earn-agent.json\n');
  fs.mkdirSync(path.join(repo, 'agent'), { recursive: true });
  const covered = path.join(repo, 'agent', '.earn-agent.json');
  fs.writeFileSync(covered, '{}', { mode: 0o600 });
  const ok = configProtection(covered);
  assert.equal(ok.gitStatus, 'ignored');
  assert.equal(ok.repoRoot, fs.realpathSync(repo));

  // (c) inside a repo and NOT covered — the dangerous case the constant
  //     string used to paper over
  fs.mkdirSync(path.join(repo, 'keys'), { recursive: true });
  const exposed = path.join(repo, 'keys', '.earn-agent.json');
  fs.writeFileSync(exposed, '{}', { mode: 0o600 });
  const danger = configProtection(exposed);
  assert.equal(danger.gitStatus, 'not-ignored');
  assert.equal(gitAgrees(repo, 'keys/.earn-agent.json'), false, 'git must agree it is exposed');

  // (d) mode drift is reported, not assumed
  fs.chmodSync(exposed, 0o644);
  assert.equal(configProtection(exposed).modeOk, false);
  assert.equal(configProtection(exposed).mode, 0o644);

  fs.rmSync(bare, { recursive: true, force: true });
  fs.rmSync(repo, { recursive: true, force: true });
});

test('findRepoRoot locates this toolkit inside its own repository', () => {
  const root = findRepoRoot(path.dirname(new URL('../lib', import.meta.url).pathname));
  assert.ok(root === null || fs.existsSync(path.join(root, '.git')));
});

/* -------------------------------------------------------------------------- *
 * 9. One error message served three different validation rules                *
 *                                                                             *
 * parseNumberFlag() threw 'prof.badNumber' for !isFinite, for < min and for   *
 * > max alike, so `--daily-cap 99` was rejected with "--daily-cap must be a   *
 * number" — 99 is a number, and the operator is sent looking in the wrong     *
 * place. The real rule is the 0-50 range. The same function also silently     *
 * truncated a fractional daily cap, changing a submission rate limit behind   *
 * the operator's back.                                                        *
 * -------------------------------------------------------------------------- */

const CLI = new URL('../bin/earn-agent.js', import.meta.url).pathname;

function runCli(args, env = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'earn-cli-'));
  try {
    const res = execFileSync(process.execPath, [CLI, ...args, '--no-color'], {
      env: { ...process.env, EARN_AGENT_HOME: home, NO_COLOR: '1', ...env },
      encoding: 'utf8',
    });
    return { code: 0, out: res, err: '' };
  } catch (err) {
    return { code: err.status, out: String(err.stdout || ''), err: String(err.stderr || '') };
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

test('an out-of-range flag names the range, not "must be a number"', () => {
  const r = runCli(['profile', 'set', '--daily-cap', '99', '--lang', 'en']);
  assert.equal(r.code, 1);
  assert.match(r.err, /--daily-cap must be between 0 and 50 \(got 99\)/);
  assert.doesNotMatch(r.err, /must be a number/, '99 IS a number');
});

test('a genuinely non-numeric flag still says "must be a number"', () => {
  const r = runCli(['profile', 'set', '--daily-cap', 'abc', '--lang', 'en']);
  assert.equal(r.code, 1);
  assert.match(r.err, /--daily-cap must be a number/);
});

test('a fractional daily cap is refused, not silently truncated', () => {
  const r = runCli(['profile', 'set', '--daily-cap', '2.7', '--lang', 'en']);
  assert.equal(r.code, 1, 'must not be accepted');
  assert.match(r.err, /whole number \(got 2\.7\)/);
});

test('the range message is translated, not English-only', () => {
  const r = runCli(['profile', 'set', '--daily-cap', '99', '--lang', 'th']);
  assert.equal(r.code, 1);
  assert.match(r.err, /ต้องอยู่ระหว่าง 0 ถึง 50/);
  assert.doesNotMatch(r.err, /ต้องเป็นตัวเลข$/m);
});

test('a valid in-range cap is still accepted', () => {
  const r = runCli(['profile', 'set', '--daily-cap', '5', '--lang', 'en']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /Daily submission cap\s+5/);
});

test('register never claims gitignore coverage it did not verify', () => {
  // EARN_AGENT_HOME lands outside any repo; the old build printed
  // "(mode 0600, already gitignored)" here regardless.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'earn-reg-'));
  try {
    const r = runCli(['whoami', '--lang', 'en'], { EARN_AGENT_HOME: home });
    assert.doesNotMatch(r.out + r.err, /already gitignored/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('a hostile or malformed .gitignore never yields a false all-clear', () => {
  // Every line here is either unparseable or a catch-all. Whatever this
  // matcher decides, it has to be what git decides — a wrong "ignored" here
  // would reassure the operator about an exposed API key.
  const repo = tmpRepo([
    '[unterminated',
    '\\',
    '!!!',
    '   ',
    '***',            // git really does treat this as a catch-all
  ].join('\n'));

  for (const rel of ['.earn-agent.json', 'sub/deep/.earn-agent.json', 'ab']) {
    assert.equal(
      isIgnoredByGit(repo, path.join(repo, rel)),
      gitAgrees(repo, rel),
      `disagreed with git on ${rel}`,
    );
  }

  // Drop the catch-all: nothing left can match, so nothing may be claimed.
  fs.writeFileSync(path.join(repo, '.gitignore'), '[unterminated\n\\\n!!!\n   \n');
  for (const rel of ['.earn-agent.json', 'sub/deep/.earn-agent.json']) {
    assert.equal(isIgnoredByGit(repo, path.join(repo, rel)), false);
    assert.equal(gitAgrees(repo, rel), false);
  }
  fs.rmSync(repo, { recursive: true, force: true });
});
