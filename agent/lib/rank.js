/*
 * agent/lib/rank.js — the selection engine for the Superteam Earn agent toolkit.
 *
 * MODULE FORMAT: ESM, matching agent/package.json ({"type":"module"}) and the sibling
 * modules agent/lib/api.js and agent/lib/store.js. Named exports plus a default bundle:
 *     import { scoreListing, rankListings, qualityGate } from './lib/rank.js';
 *
 * PURITY CONTRACT
 *   No imports of anything. No fs, no net, no process, no console.
 *   The single piece of ambient state is the wall clock, read only as a default for
 *   `now`; every entry point accepts an injected clock (opts.now, or profile.now) so a
 *   test can be deterministic. Nothing here throws, and nothing here can return NaN or
 *   Infinity for any input at all — including undefined, null, NaN, negatives, strings,
 *   cyclic objects and missing nested fields. The adversarial test proves it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS
 * ---------------------------------------------------------------------------------------
 * A listing is money only if you can (a) finish it, (b) be judged fairly on it, and
 * (c) get paid by someone who pays. Expected value alone answers none of those, so the
 * EV model from assets/js/calculator.js (window.EarnCalculator.computeEV) is used here as
 * one term out of seven rather than as the answer.
 *
 * The probability core below is a faithful re-implementation of that file's CONTRACT C
 * Plackett-Luce model. It is re-implemented rather than imported because calculator.js is
 * a browser classic script that attaches to a global and owns DOM code; importing it from
 * a Node CLI would mean I/O and a global side effect, which this module is not allowed to
 * have. The two must stay in step: with skill edge e against n entrants,
 *     winProb = e / (e + (n - 1))
 *     hazard at paid rank i (0-indexed) h_i = e / (e + (n - 1) - i)
 *     P(exactly rank i+1) = h_i * PROD_{j<i} (1 - h_j)
 *     expectedUsd = SUM_i P(rank i+1) * prizeUsd * podiumSplit[i]   and always <= prizeUsd
 * The self-test asserts the e = 1 identity (expectedUsd == prizeUsd / n for a full podium)
 * against this file, so drift from calculator.js shows up as a test failure.
 *
 * ---------------------------------------------------------------------------------------
 * THE SCORE, IN ONE SCREEN
 * ---------------------------------------------------------------------------------------
 * STEP 0  ELIGIBILITY   status OPEN, agentAccess in {AGENT_ALLOWED, AGENT_ONLY},
 *                       deadline > now. A row that fails is never ranked. A row missing
 *                       agentAccess is KEPT, flagged assumed-agent-access, and scored with
 *                       EXCLUSIVITY = 0.20. We never invent the field; we say we guessed.
 *
 * STEP 1  MONEY         rate = computeEV(...).expectedPerHour
 *                       MONEY = rate / (rate + T),  T = 25 USD/hour (the operator's target)
 *                       $8/h -> 0.24   $25/h -> 0.50   $75/h -> 0.75   $225/h -> 0.90
 *                       Saturating, bounded, monotone, no cliff. T is the one number the
 *                       operator should tune. It is the same opinion the calculator's
 *                       50/20/8 verdict tiers encode, expressed continuously.
 *
 * STEP 2  SIX MORE      FIT, CROWD, RUNWAY, SPONSOR, VERIFY, EXCLUSIVITY, each in [0,1].
 *
 * STEP 3  RAW = 0.30*MONEY + 0.22*FIT + 0.12*CROWD + 0.10*RUNWAY + 0.10*SPONSOR
 *             + 0.09*VERIFY + 0.07*EXCLUSIVITY                     (weights sum to 1.00)
 *         SCORE = 100 * RAW * G_fit * G_runway * G_integrity * G_value
 *         A zeroed row is reported as SKIP with the gate named, never as "low score".
 *
 * STEP 4  >= 62 BUILD | 45-61 SHORTLIST | 30-44 WATCH | < 30 or any gate 0 -> SKIP
 *
 * WHY THE WEIGHTS ARE WHAT THEY ARE (kept here so nobody re-tunes them by vibe):
 *   MONEY 0.30  largest single weight because it is the only term denominated in income,
 *               but capped at 0.30: EV $/hour already assumes you win, and the other six
 *               factors are what decide whether you do.
 *   FIT   0.22  biggest non-money weight and also a hard gate. A listing needing a human
 *               face, an X account with reach, or a KYC-gated region has an effective EV
 *               of zero no matter how large the pool.
 *   CROWD 0.12  deliberately overlaps MONEY (entrants already shrink the Plackett-Luce win
 *               probability) but density separately measures how discovered a listing is,
 *               which predicts judge-attention dilution and the odds a known team entered.
 *   RUNWAY 0.10 low because it mostly acts as the gate: below r = 1.25 it zeroes the row
 *               outright, so the graded part only separates comfortable from very
 *               comfortable.
 *   SPONSOR 0.10 a sponsor who has paid once and posts monthly is a recurring income
 *               channel, not one payout. This weight is what makes the engine choose the
 *               $7/hour Nosana listing over a richer one-off from a stranger.
 *   VERIFY 0.09 rigor is the operator's only structural edge. A benchmark or a
 *               spec-conformant build can be checked and therefore won; a taste contest is
 *               decided by the entrant with the biggest brand.
 *   EXCLUSIVITY 0.07 kept small on purpose. AGENT_ONLY excludes the whole human field, but
 *               that benefit is already priced in through a smaller entrant count feeding
 *               MONEY and CROWD, so a larger weight would triple-count one advantage.
 *   FIT + SPONSOR (0.32) outweigh MONEY (0.30) on purpose. Income growth comes from
 *   AGENT_ONLY listings and from becoming a name 2-3 repeat sponsors recognise, not from
 *   entering more things.
 *
 * ---------------------------------------------------------------------------------------
 * WORKED EXAMPLE, ASSERTED IN THE TEST — Nosana Builders Challenge Agents 102
 * ---------------------------------------------------------------------------------------
 *   pool 3,000 USDC; prizes 1000/750/450/200/100 = 2,500. splitFromPrizes divides by the
 *   POOL, not the podium sum, so shares are .3333/.25/.15/.0667/.0333 and sum to 0.833 —
 *   the missing $500 is money nobody can win and the model refuses to inflate it back to
 *   1. entrants 30, H_est 20h, E 1.8, 10 days runway.
 *     computeEV -> podiumProb 27.6%, expectedUsd $141.93, rate $7.10/h
 *     MONEY .221 | FIT 1.00 | CROWD 1/(1+10/8) = .444 | r = (240*.35)/(1.4*20) = 3.0 -> RUNWAY 1.00
 *     SPONSOR 1.00 | VERIFY 1.00 | EXCLUSIVITY .35
 *     RAW = .0663+.220+.0533+.100+.100+.090+.0245 = .6541  ->  SCORE 65.4  ->  BUILD
 *   The whole engine is in that row. Raw EV is $7/hour, which the calculator alone would
 *   call "marginal", yet it is still the right build, because the sponsor is real, repeats,
 *   and judges on working code. Conversely a 3,000 USDC bounty due in 18 hours against a
 *   20h estimate gives r = (18*.35)/28 = 0.23 -> G_runway = 0 -> SCORE 0, whatever the pool.
 *
 * ---------------------------------------------------------------------------------------
 * ONE DELIBERATE CONTRADICTION IN THE SPEC, AND HOW IT IS RESOLVED
 * ---------------------------------------------------------------------------------------
 * The refusal list says "refuse listings with pool < $150 or expectedPerHour < $8 even if
 * they pass every gate". The worked example above scores a $7.10/hour listing as BUILD.
 * Both cannot be enforced at scoring time. Resolution, stated rather than silently picked:
 *   - pool < $150 is a hard scoring gate (G_value). A sub-$150 pool cannot repay the
 *     sponsor goodwill a submission costs, at any hourly rate.
 *   - expectedPerHour < $8 is NOT a scoring gate. It is a printed warning on the row
 *     ("EV $7.10/h is under the $8/h floor — SPONSOR and VERIFY are carrying this row")
 *     and a hard failure in qualityGate, which is where submission is actually decided.
 * That keeps the worked example's arithmetic intact and still stops micro-value noise from
 * ever reaching POST /api/agents/submissions/create.
 */

'use strict';

/* ==================================================================================== *
 * 0. NUMERIC AND TYPE GUARDS                                                           *
 * Mirrors the guards in assets/js/calculator.js. Nothing downstream may see NaN.        *
 * ==================================================================================== */

var EDGE_MIN = 0.5;
var EDGE_MAX = 5;
var MIN_HOURS = 0.25;
var MAX_SPLIT = 24;
var MAX_FIELD = 1e9;

/** Coerce anything to a finite number, falling back to `fallback`. Accepts numeric strings. */
function num(value, fallback) {
  var n;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string' && value.trim() !== '') {
    n = Number(value);
  } else if (typeof value === 'boolean') {
    return value ? 1 : 0;
  } else {
    return fallback;
  }
  return isFinite(n) ? n : fallback;
}

/** Like num() but reports "absent" as null, so 0 stays distinguishable from missing. */
function numOrNull(value) {
  var n = num(value, null);
  return n === null ? null : n;
}

function clamp(value, lo, hi) {
  if (!(typeof value === 'number') || !isFinite(value)) return lo;
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

/** Last line of defence before a number reaches the caller. */
function safe(value, fallback) {
  return (typeof value === 'number' && isFinite(value)) ? value : fallback;
}

function round(value, places) {
  var f = Math.pow(10, places);
  return Math.round(safe(value, 0) * f) / f;
}

function obj(value) {
  return (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function str(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && isFinite(value)) return String(value);
  return '';
}

function lower(value) {
  return str(value).toLowerCase();
}

function isTrue(value) {
  return value === true || value === 'true' || value === 1;
}

/** Accepts ms, seconds, ISO strings and Date. Returns null when there is no usable date. */
function toMillis(value) {
  if (value instanceof Date) {
    var t = value.getTime();
    return isFinite(t) ? t : null;
  }
  if (typeof value === 'number' && isFinite(value)) {
    if (value <= 0) return null;
    // Anything below ~2001 in ms is almost certainly a seconds-epoch timestamp.
    return value < 1e11 ? value * 1000 : value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    var p = Date.parse(value.trim());
    if (isFinite(p)) return p;
    var asNum = Number(value);
    if (isFinite(asNum) && asNum > 0) return asNum < 1e11 ? asNum * 1000 : asNum;
  }
  return null;
}

/** The one ambient read in this file, and it is always overridable. */
function resolveNow(profile, opts) {
  var injected = toMillis(obj(opts).now);
  if (injected !== null) return injected;
  injected = toMillis(obj(profile).now);
  if (injected !== null) return injected;
  var n = Date.now();
  return isFinite(n) ? n : 0;
}

/* Formatting for reasons[]. Deliberately not Intl: deterministic across locales. */

function fmtUsd(value) {
  var v = safe(value, 0);
  var abs = Math.abs(v);
  var s;
  if (v === Math.trunc(v)) s = String(Math.trunc(v));   // "$8", not "$8.00"
  else if (abs >= 10) s = v.toFixed(0);
  else s = v.toFixed(2);
  return '$' + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fmtUsd2(value) {
  var v = safe(value, 0);
  return '$' + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fmtInt(value) {
  return String(Math.round(safe(value, 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fmtPct(value) {
  return (safe(value, 0) * 100).toFixed(1) + '%';
}

function fmtHours(value) {
  var h = safe(value, 0);
  if (h >= 48) return Math.round(h / 24) + 'd';
  if (h >= 10) return Math.round(h) + 'h';
  return round(h, 1) + 'h';
}

/* ==================================================================================== *
 * 1. TUNABLE CONSTANTS                                                                 *
 * ==================================================================================== */

var WEIGHTS = {
  MONEY: 0.30,
  FIT: 0.22,
  CROWD: 0.12,
  RUNWAY: 0.10,
  SPONSOR: 0.10,
  VERIFY: 0.09,
  EXCLUSIVITY: 0.07
};

var BANDS = { BUILD: 62, SHORTLIST: 45, WATCH: 30 };

var TARGET_RATE_USD = 25;      // T in MONEY = rate / (rate + T). The operator's target $/h.
var CROWD_BREAK_POINT = 8;     // entrants per $1,000 of pool at which CROWD = 0.50
var WALLCLOCK_USABLE = 0.35;   // ~8.4 usable build hours per calendar day
var REVISION_MULTIPLIER = 1.4; // first-pass estimates are never the shipped cost
var RUNWAY_GATE = 1.25;        // r below this cannot be finished; EV is imaginary
var FIT_GATE = 0.34;           // below this the listing needs a human we do not have
var MIN_POOL_USD = 150;        // below this a submission costs more goodwill than it returns
var MIN_RATE_USD = 8;          // warning at score time, hard failure at submission time

var DEFAULT_EDGE = 1.8;        // honest baseline for a code/tooling/docs deliverable
var EDGE_NO_PRIOR_ART = 1.2;   // domain we have no prior art in
var ASSUMED_ENTRANTS_ALLOWED = 25;
var ASSUMED_ENTRANTS_ONLY = 8;
var ASSUMED_HOURS = 12;
var ASSUMED_DEADLINE_HOURS = 168; // 7 days, when a listing publishes no deadline
var ASSUMED_FIT = 0.50;
var ASSUMED_VERIFY = 0.45;

var EXCLUSIVITY_SCORE = { AGENT_ONLY: 1.00, AGENT_ALLOWED: 0.35, UNKNOWN: 0.20 };

var SPONSOR_BASE = 0.35;
var SPONSOR_PAID = 0.30;
var SPONSOR_CADENCE = 0.20;
var SPONSOR_IDENTIFIABLE = 0.15;
var SPONSOR_GHOSTED = -0.35;

var OTHER_INFO_MIN = 400;
var OTHER_INFO_MAX = 1500;
var ANSWER_MIN_CHARS = 40;
var ANSWER_MIN_WORDS = 6;          // 40 chars of one repeated letter is not an answer
var OTHER_INFO_MIN_WORDS = 60;     // ~400 chars of real prose is well over this
var OTHER_INFO_MIN_UNIQUE = 30;    // filler repeats itself; a real description does not
var SIGNOFF_MAX_AGE_MS = 24 * 60 * 60 * 1000;
var LINK_CHECK_MAX_AGE_MS = 15 * 60 * 1000;
var README_MAX_SECONDS = 120;
var MIN_COMMITS = 3;
var MIN_LIMITS = 2;
var MIN_TEMPLATE_DELTA = 0.60;

var MAX_TEXT_CHARS = 120000;   // harvest ceiling; keeps every regex below linear and bounded
var MAX_WALK_NODES = 4000;
var MAX_WALK_DEPTH = 5;
var MAX_LISTINGS = 5000;
var FAR_FUTURE = 8.64e15;      // stands in for "no deadline" in sorts, never Infinity

/* ==================================================================================== *
 * 2. THE MONEY CORE — a faithful mirror of calculator.js CONTRACT C                     *
 * ==================================================================================== */

/**
 * Turn arbitrary input into valid prize-pool fractions. Drops junk, clamps negatives to
 * zero, caps depth, and scales down (never up) when shares exceed the whole pool.
 */
function normaliseSplit(input) {
  var raw = Array.isArray(input) ? input : [];
  var out = [];
  var total = 0;
  var i, v;
  for (i = 0; i < raw.length && out.length < MAX_SPLIT; i += 1) {
    v = num(raw[i], 0);
    if (v < 0) v = 0;
    out.push(v);
    total += v;
  }
  while (out.length && out[out.length - 1] === 0) out.pop();
  if (!out.length) return { split: [1], assumed: true };
  if (total > 1) {
    for (i = 0; i < out.length; i += 1) out[i] = out[i] / total;
  }
  return { split: out, assumed: false };
}

/**
 * One podium entry -> its amount. Accepts BOTH shapes this codebase produces:
 * a bare number, and the `{ position, amount }` row that api.js normalisePrizes()
 * emits for every listing that came from the details endpoint. Reading the object
 * as a number used to yield 0, which silently collapsed every published podium to
 * winner-take-all and understated podiumProb by ~5x.
 */
function prizeAmount(entry) {
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    var a = num(entry.amount, null);
    if (a === null) a = num(entry.value, null);
    if (a === null) a = num(entry.usd, 0);
    return a;
  }
  return num(entry, 0);
}

/**
 * Derive prize-pool fractions from a published podium. Dividing by the POOL rather than
 * the podium sum is deliberate: if a sponsor advertises $3,000 but lists $2,500 of prizes,
 * the missing $500 is money nobody can win, and the shares should sum to 0.833.
 */
function splitFromPrizes(prizes, poolUsd) {
  var raw = Array.isArray(prizes) ? prizes : [];
  var amounts = [];
  var total = 0;
  var i, v, out, denom;
  for (i = 0; i < raw.length && amounts.length < MAX_SPLIT; i += 1) {
    v = prizeAmount(raw[i]);
    if (!isFinite(v)) v = 0;
    if (v > 0) { amounts.push(v); total += v; }
  }
  if (!amounts.length || total <= 0) return [1];
  var pool = Math.max(0, num(poolUsd, 0));
  denom = pool > 0 ? Math.max(pool, total) : total;
  if (!(denom > 0)) return [1];
  out = [];
  for (i = 0; i < amounts.length; i += 1) out.push(amounts[i] / denom);
  return out;
}

/** P(you finish exactly at paid rank i+1). Stops when the field is exhausted. */
function rankProbabilities(edge, field, depth) {
  var probs = [];
  var survive = 1;
  var i, rivals, hazard;
  for (i = 0; i < depth; i += 1) {
    rivals = (field - 1) - i;
    if (rivals < 0) break;
    hazard = edge / (edge + rivals);
    hazard = clamp(safe(hazard, 0), 0, 1);
    probs.push(survive * hazard);
    survive *= (1 - hazard);
    if (survive <= 0) break;
  }
  return probs;
}

/**
 * computeEV — identical semantics to window.EarnCalculator.computeEV. Exported so the CLI
 * and the test can assert this file has not drifted from assets/js/calculator.js.
 */
function computeEV(input) {
  var opts = obj(input);
  var notes = [];

  var prizeUsd = Math.max(0, num(opts.prizeUsd, 0));

  var rawSubs = num(opts.submissions, 0);
  var field = clamp(Math.floor(Math.max(0, rawSubs)), 0, MAX_FIELD);
  field = Math.max(1, field);

  var rawHours = num(opts.hours, 0);
  var hours = Math.max(0, rawHours);
  if (hours < MIN_HOURS) notes.push('hours-floored');
  var billableHours = Math.max(hours, MIN_HOURS);

  var rawEdge = num(opts.skillEdge, 1);
  var edge = clamp(rawEdge, EDGE_MIN, EDGE_MAX);
  if (rawEdge !== edge) notes.push('edge-clamped');

  var podium = normaliseSplit(opts.podiumSplit);
  var split = podium.split;
  if (podium.assumed) notes.push('assumed-winner-take-all');

  var probs = rankProbabilities(edge, field, split.length);
  var winProb = clamp(safe(edge / (edge + (field - 1)), 0), 0, 1);

  var podiumProb = 0;
  var expectedUsd = 0;
  var i;
  for (i = 0; i < probs.length; i += 1) {
    podiumProb += probs[i];
    expectedUsd += probs[i] * prizeUsd * split[i];
  }
  podiumProb = clamp(safe(podiumProb, 0), 0, 1);
  expectedUsd = clamp(safe(expectedUsd, 0), 0, prizeUsd);

  var expectedPerHour = clamp(safe(expectedUsd / billableHours, 0), 0, prizeUsd / MIN_HOURS);

  if (prizeUsd <= 0) notes.push('no-prize');
  if (field >= 100) notes.push('crowded-field');
  else if (field <= 10) notes.push('thin-field');
  if (field < split.length) notes.push('field-smaller-than-podium');
  if (hours >= 30) notes.push('long-tail-effort');
  if (split.length >= 5) notes.push('deep-podium');
  if (split[0] >= 0.6) notes.push('podium-heavy');
  else if (split.length >= 3 && split[0] <= 0.4) notes.push('flat-podium');

  var verdict;
  if (expectedPerHour >= 50) verdict = 'great';
  else if (expectedPerHour >= 20) verdict = 'good';
  else if (expectedPerHour >= 8) verdict = 'marginal';
  else verdict = 'skip';

  return {
    winProb: winProb,
    podiumProb: podiumProb,
    expectedUsd: expectedUsd,
    expectedPerHour: expectedPerHour,
    breakEvenRate: expectedPerHour,
    verdict: verdict,
    notes: notes
  };
}

/* ==================================================================================== *
 * 3. TEXT HARVEST                                                                       *
 * The Listing contract carries no `description`, so the brief lives in `raw`. We walk it *
 * defensively: depth-capped, node-capped, char-capped and cycle-safe, so a hostile or    *
 * merely enormous payload cannot hang or explode the scorer.                             *
 * ==================================================================================== */

/** Read one property without trusting the object: getters throw, Proxies trap. */
function pluck(o, key) {
  try {
    return o[key];
  } catch (e) {
    return undefined;
  }
}

function harvestText(listing) {
  try {
    return harvestTextInner(listing);
  } catch (e) {
    return '';
  }
}

function harvestTextInner(listing) {
  var l = obj(listing);
  var parts = [];
  var budget = { nodes: MAX_WALK_NODES, chars: MAX_TEXT_CHARS };
  var seen = typeof WeakSet === 'function' ? new WeakSet() : null;

  function push(v) {
    var s = str(v);
    if (!s) return;
    if (budget.chars <= 0) return;
    if (s.length > budget.chars) s = s.slice(0, budget.chars);
    budget.chars -= s.length;
    parts.push(s);
  }

  function walk(node, depth) {
    if (budget.nodes <= 0 || budget.chars <= 0 || depth > MAX_WALK_DEPTH) return;
    budget.nodes -= 1;
    if (node === null || node === undefined) return;
    var t = typeof node;
    if (t === 'string' || t === 'number') { push(node); return; }
    if (t !== 'object') return;
    if (seen) {
      if (seen.has(node)) return;
      seen.add(node);
    }
    var i, keys, k, v;
    if (Array.isArray(node)) {
      for (i = 0; i < node.length && budget.nodes > 0; i += 1) walk(node[i], depth + 1);
      return;
    }
    try {
      keys = Object.keys(node);
    } catch (e) {
      return;
    }
    for (i = 0; i < keys.length && budget.nodes > 0; i += 1) {
      k = keys[i];
      // Keys are meaning too: {requiresVideo: true} should read as "requires video".
      try { v = node[k]; } catch (e2) { continue; }
      if (v === true) push(k.replace(/([a-z0-9])([A-Z])/g, '$1 $2'));
      else walk(v, depth + 1);
    }
  }

  push(pluck(l, 'title'));
  push(pluck(l, 'slug'));
  push(pluck(l, 'type'));
  push(pluck(l, 'skill'));
  push(pluck(l, 'region'));
  var sp = pluck(l, 'sponsor');
  push(typeof sp === 'string' ? sp : pluck(obj(sp), 'name'));
  push(pluck(l, 'description'));
  walk(pluck(l, 'requirements'), MAX_WALK_DEPTH - 1);
  push(pluck(l, 'brief'));

  var qs = arr(pluck(l, 'eligibilityQuestions'));
  for (var qi = 0; qi < qs.length && qi < 200; qi += 1) {
    var q = qs[qi];
    push(typeof q === 'string' ? q : pluck(obj(q), 'question'));
  }

  walk(pluck(l, 'raw'), 0);

  return parts.join(' \n ').toLowerCase().slice(0, MAX_TEXT_CHARS);
}

function makeMatcher(text) {
  var t = typeof text === 'string' ? text : '';
  return function has(re) {
    try {
      return re.test(t);
    } catch (e) {
      return false;
    }
  };
}

/* ==================================================================================== *
 * 4. FIT — scored as a product of capability multipliers, starting at 1.00               *
 *                                                                                        *
 * Score it honestly. The failure mode is not being too harsh; it is talking yourself into *
 * a 0.6 on a listing that needs a face. Every multiplier that fires is recorded on the    *
 * row and shown in the SKIP reason, so a 0 is always explained ("needs on-camera video")  *
 * rather than reported as a low score.                                                    *
 *                                                                                        *
 * LEARNING RULE: when a build is killed because of a human-only requirement these rules   *
 * missed, the miss must be added here as a new multiplier in the same session. This table *
 * is the only part of the engine allowed to grow from experience.                         *
 * ==================================================================================== */

var RX = {
  onCamera: /(on[-\s]?camera|face[-\s]?cam|facecam|talking head|show (?:your|their) face|your face (?:must|should|will)|appear (?:on|in) (?:the )?video|record yourself|webcam|selfie video|live ?stream|twitter space|x space|host (?:a|an) (?:ama|call|space)|podcast (?:episode|appearance|guest)|in your own voice|real voice|voice ?over is required|requires video call)/,
  irl: /(in[-\s]?person|\birl\b|on[-\s]?site attendance|physical (?:attendance|venue|presence)|attend (?:in person|the (?:event|meetup|conference|summit|hackathon))|must (?:be present|attend)|venue|booth|side event|meetup in|travel to)/,
  reachGated: /(minimum (?:of )?[\d,]+\+? ?(?:followers|subscribers)|must have (?:at least )?[\d,]+\+? ?(?:followers|subscribers)|[\d,]{3,}\+? followers|judged (?:on|by) (?:engagement|impressions|reach|likes|views)|based on (?:engagement|impressions|reach|views)|quote[- ]?tweet|most (?:likes|impressions|engagement|views|retweets)|go viral|virality|prize (?:is )?based on reach)/,
  kyc: /(\bkyc\b|know your customer|us persons only|u\.s\. (?:persons|residents) only|united states (?:residents|citizens) only|eu(?:rope)? only|residents of [a-z ]+ only|accredited investor|government[- ]issued id|passport (?:required|verification)|proof of address)/,
  noAi: /(no (?:ai|a\.i\.|llm|chatgpt)[- ]?(?:generated|assisted|written|submissions)|ai[- ](?:generated|assisted|written)[^.]{0,40}(?:not (?:allowed|permitted|accepted)|prohibited|forbidden|banned|disqualif)|(?:no|without) (?:bots|agents|automated)[- ]?(?:submissions|entries|generated)|human[- ]only|must be (?:written|built|created) by a human|do not use (?:ai|chatgpt|claude|llms)|ai (?:submissions|entries) will be (?:rejected|disqualified))/,
  team: /(team of (?:at least )?(?:two|three|four|2|3|4|\d+)|teams? of [\d]+\+?|minimum (?:of )?[\d]+ (?:team )?members|must be a (?:registered )?(?:company|legal entity|business)|incorporated entity|requires? a co[- ]?founder|at least [\d]+ people)/,
  taste: /(\blogo\b|brand identity|branding|mascot|illustration|\bmeme\b|sticker (?:pack|design)|poster design|visual identity|album art|character design|banner design|design contest|art contest)/,
  mainnet: /(live on mainnet|mainnet deployment|deployed (?:to|on) mainnet with|existing (?:users|tvl)|real users|proof of (?:traction|usage)|\btvl\b of|must (?:already )?have (?:users|customers|traction))/,
  audience: /(your (?:own )?(?:newsletter|discord|community|channel|audience)|existing audience|established (?:following|audience|community)|own a (?:discord|telegram group|newsletter)|substack|mailing list of|your (?:twitter|x) account with)/,
  sustained: /(ambassador|moderat(?:or|e) (?:the|our|a)|daily post|post daily|weekly for [\d]+ weeks|over (?:the )?(?:next )?[\d]+ (?:weeks|months)|community manager|host weekly|ongoing engagement|campaign (?:over|across) [\d]+)/,
  screencast: /(demo video|screen ?cast|screen ?record|\bloom\b|video walkthrough|record a (?:short )?video|video demo|[\d]+[- ]minute video|video submission)/,
  tweetArtifact: /(submit (?:a|the) (?:tweet|x post)|tweet (?:the|your|about)|post (?:on|to) (?:x|twitter)|share on (?:x|twitter)|thread on (?:x|twitter)|\bx post\b|tag @)/,
  article: /(blog post|\barticle\b|long[- ]form|[\d,]{3,} words|\bessay\b|tutorial post|medium post|newsletter issue|deep dive|written piece)/,
  identity: /(your (?:twitter|x|github|telegram|discord) (?:handle|account|profile|username)|tag (?:us|@)|@your|personal account|under your (?:name|handle)|\bbyline\b|credited to you|your real name)/,
  build: /(\bcode\b|\bcli\b|\bsdk\b|\bapi\b|integration|\bbot\b|\bagent\b|dashboard|dataset|benchmark|\bdocs\b|documentation|\baudit\b|test suite|bug (?:report|bounty|fix)|open[- ]source|\brepo\b|github|smart contract|plugin|library|framework|script|tooling|typescript|javascript|rust|python|solidity|anchor|\bnode\b|implementation|prototype|\bmvp\b|\bbuild\b|developer|engineer|backend|frontend|indexer|subgraph)/,
  probe: /^(?:zz[-_ ]?probe|probe|test listing|test bounty|\[test\]|do not submit|ignore this|dummy|sample listing|placeholder)/
};

/**
 * Each rule returns null (did not fire) or { mult, reason }. Every rule that fires is
 * multiplied in, so two 0.7 penalties compound to 0.49 — which is correct: two human
 * checkpoints are worse than one.
 */
var FIT_RULES = [
  {
    id: 'on-camera',
    run: function (c) {
      if (!c.has(RX.onCamera)) return null;
      if (isTrue(c.profile.canDoOnCamera)) {
        return { mult: 0.70, reason: 'needs a person on camera and the profile says that is possible — 0.70 for the human hours it costs' };
      }
      return { mult: 0.00, reason: 'needs on-camera video — not buildable by this agent' };
    }
  },
  {
    id: 'in-person',
    run: function (c) {
      if (!c.has(RX.irl)) return null;
      return { mult: 0.00, reason: 'needs in-person attendance — not buildable by this agent' };
    }
  },
  {
    id: 'reach-gated',
    run: function (c) {
      if (!c.has(RX.reachGated)) return null;
      if (isTrue(c.profile.hasTwitterReach)) {
        return { mult: 0.25, reason: 'judged on social reach; profile claims reach, but the outcome is not ours to control' };
      }
      return { mult: 0.00, reason: 'judged on follower count or engagement — no audience to compete with' };
    }
  },
  {
    id: 'kyc-region',
    run: function (c) {
      if (!c.has(RX.kyc)) return null;
      return { mult: 0.00, reason: 'KYC or residency gating in the brief — assume excluded until a human confirms otherwise' };
    }
  },
  {
    id: 'region-locked',
    run: function (c) {
      var region = str(c.listing.region).trim();
      if (!region) return null;
      var norm = region.toLowerCase();
      if (norm === 'global' || norm === 'worldwide' || norm === 'any' || norm === 'all' || norm === 'international') return null;
      var allowed = arr(c.profile.regions).map(lower);
      for (var i = 0; i < allowed.length; i += 1) {
        if (allowed[i] && (allowed[i] === norm || norm.indexOf(allowed[i]) !== -1 || allowed[i].indexOf(norm) !== -1)) return null;
      }
      return { mult: 0.00, reason: 'region-locked to ' + region + ' and that is not in the operator profile' };
    }
  },
  {
    id: 'no-ai-clause',
    run: function (c) {
      if (!c.has(RX.noAi)) return null;
      return { mult: 0.00, reason: 'the brief prohibits AI or agent submissions — not ours to enter' };
    }
  },
  {
    id: 'team-required',
    run: function (c) {
      if (!c.has(RX.team)) return null;
      return { mult: 0.00, reason: 'requires a team of named humans or a company entity — one operator cannot satisfy it' };
    }
  },
  {
    id: 'taste-deliverable',
    run: function (c) {
      if (!c.has(RX.taste)) return null;
      return { mult: 0.15, reason: 'the deliverable is taste (logo, brand, meme) — judged on style, not on function' };
    }
  },
  {
    id: 'mainnet-traction',
    run: function (c) {
      if (!c.has(RX.mainnet)) return null;
      return { mult: 0.20, reason: 'needs a live mainnet deployment with real users or TVL we do not have' };
    }
  },
  {
    id: 'audience-asset',
    run: function (c) {
      if (!c.has(RX.audience)) return null;
      if (isTrue(c.profile.hasTwitterReach)) {
        return { mult: 0.75, reason: 'needs an existing audience; profile claims some reach' };
      }
      return { mult: 0.25, reason: 'needs a pre-existing audience asset (newsletter, Discord, X account with reach)' };
    }
  },
  {
    id: 'sustained-community',
    run: function (c) {
      if (!c.has(RX.sustained)) return null;
      return { mult: 0.45, reason: 'needs sustained community activity over weeks — an agent cannot hold that shape' };
    }
  },
  {
    id: 'screencast',
    run: function (c) {
      if (!c.has(RX.screencast)) return null;
      if (c.profile.canDoVideo === false) {
        return { mult: 0.00, reason: 'needs a demo video and the profile says video is not possible' };
      }
      return { mult: 0.70, reason: 'needs a screencast demo (no face) — agent records it, human spends ~30 min reviewing' };
    }
  },
  {
    id: 'tweet-artifact',
    run: function (c) {
      if (!c.has(RX.tweetArtifact)) return null;
      return { mult: 0.85, reason: 'a tweet or X post is part of the submission — the human posts it, ~10 minutes' };
    }
  },
  {
    id: 'article',
    run: function (c) {
      if (!c.has(RX.article)) return null;
      return { mult: 0.90, reason: 'a written article is the primary deliverable — an agent drafts it, a human owns the byline' };
    }
  }
];

function scoreFit(ctx) {
  var mult = 1;
  var fired = [];
  var reasons = [];
  var assumptions = [];
  var i, hit;

  for (i = 0; i < FIT_RULES.length; i += 1) {
    hit = null;
    try {
      hit = FIT_RULES[i].run(ctx);
    } catch (e) {
      hit = null;
    }
    if (hit && typeof hit === 'object') {
      var m = clamp(num(hit.mult, 0), 0, 1);
      mult *= m;
      fired.push({ id: FIT_RULES[i].id, mult: m, reason: str(hit.reason) });
      reasons.push(str(hit.reason));
    }
  }

  // Cap: the human's personal accounts or identity appearing anywhere in the deliverable
  // cannot be automated, and is the most common cause of a missed deadline for a one-human
  // operation.
  if (ctx.has(RX.identity) && mult > 0.90) {
    mult = 0.90;
    fired.push({ id: 'identity-cap', mult: 0.90, reason: 'the human\'s own accounts appear in the deliverable — capped at 0.90' });
    reasons.push('the human\'s own accounts appear in the deliverable — capped at 0.90');
  }

  var buildShaped = ctx.has(RX.build);
  var resolved = fired.length > 0 || buildShaped;

  if (!resolved) {
    // Unknown after reading the full brief. We do not guess high.
    return {
      fit: ASSUMED_FIT,
      fired: fired,
      reasons: ['fit unresolved — read the brief yourself before I score this'],
      assumptions: ['assumed-fit'],
      assumed: true,
      buildShaped: false
    };
  }

  if (buildShaped && !fired.length) {
    reasons.push('code or tooling deliverable — an agent can produce it end to end');
  }

  return {
    fit: clamp(safe(mult, 0), 0, 1),
    fired: fired,
    reasons: reasons,
    assumptions: assumptions,
    assumed: false,
    buildShaped: buildShaped
  };
}

/* ==================================================================================== *
 * 5. VERIFY — how objectively judgeable the deliverable is                              *
 * ==================================================================================== */

var VERIFY_TIERS = [
  { score: 1.00, id: 'objective', re: /(benchmark|spec[- ]?conform|conforms? to (?:the )?spec|passing tests|test suite|reproducib|must pass|acceptance criteria|working (?:code|implementation|integration)|bug (?:report|fix|bounty)|\baudit\b|leaderboard|scored (?:by|on)|measured (?:by|on)|builders challenge|\bctf\b|pull request)/ },
  { score: 0.75, id: 'demo', re: /(working demo|live demo|functional (?:demo|prototype)|prototype|\bmvp\b|deployed app|working product|must (?:run|work))/ },
  { score: 0.45, id: 'integration', re: /(best integration|most creative|best use of|creative use|most (?:innovative|interesting))/ },
  { score: 0.20, id: 'content', re: /(\bthread\b|blog post|\barticle\b|content piece|write[- ]up|\bvideo\b|social post|tutorial)/ },
  { score: 0.05, id: 'taste', re: /(\blogo\b|brand identity|\bmeme\b|mascot|vibe|aesthetic|art contest|design contest)/ }
];

function scoreVerify(ctx) {
  // Explicit operator override wins over any keyword guess.
  var override = numOrNull(obj(ctx.listing).verifiability);
  if (override !== null) {
    return { verify: clamp(override, 0, 1), reason: 'verifiability set explicitly to ' + round(clamp(override, 0, 1), 2), assumed: false };
  }

  // Taste is unambiguous and is checked first so "design contest" cannot be read as a demo.
  if (ctx.has(VERIFY_TIERS[4].re) && !ctx.has(VERIFY_TIERS[0].re)) {
    return { verify: 0.05, reason: 'judged on taste — decided by the entrant with the biggest brand, not by rigor', assumed: false };
  }
  for (var i = 0; i < VERIFY_TIERS.length; i += 1) {
    if (ctx.has(VERIFY_TIERS[i].re)) {
      var tier = VERIFY_TIERS[i];
      var words = {
        objective: 'judged against a spec, a benchmark or working code — checkable, therefore winnable',
        demo: 'judged on a working demo plus a write-up',
        integration: 'judged on function plus some taste ("best integration")',
        content: 'judged on reach or style rather than on function',
        taste: 'judged on taste alone'
      };
      return { verify: tier.score, reason: words[tier.id], assumed: false };
    }
  }
  return { verify: ASSUMED_VERIFY, reason: 'no judging signal in the brief — assumed 0.45, read the brief yourself', assumed: true };
}

/* ==================================================================================== *
 * 6. SPONSOR — paid before, repeat cadence, identifiable                                *
 * The operator keeps the ledger in profile.sponsors, keyed by sponsor name:             *
 *   { "nosana": { paid: true, listings90d: 4, identifiable: true, ghosted: false } }    *
 * ==================================================================================== */

function sponsorName(listing) {
  var l = obj(listing);
  if (typeof l.sponsor === 'string' && l.sponsor.trim()) return l.sponsor.trim();
  var s = obj(l.sponsor);
  var n = str(s.name) || str(s.slug) || str(s.title);
  return n.trim();
}

function lookupSponsor(ledger, name) {
  var book = obj(ledger);
  var key = lower(name).trim();
  if (!key) return null;
  if (Object.prototype.hasOwnProperty.call(book, key)) return obj(book[key]);
  var keys;
  try { keys = Object.keys(book); } catch (e) { return null; }
  for (var i = 0; i < keys.length && i < 2000; i += 1) {
    if (lower(keys[i]).trim() === key) return obj(book[keys[i]]);
  }
  return null;
}

function scoreSponsor(ctx) {
  var name = sponsorName(ctx.listing);
  var label = name || 'an unnamed sponsor';
  var rec = lookupSponsor(ctx.profile.sponsors, name);
  var s = SPONSOR_BASE;
  var reasons = [];

  if (!rec) {
    reasons.push('sponsor ' + label + ' is not in the ledger — starting at ' + SPONSOR_BASE + ', everyone starts somewhere');
    return { sponsor: SPONSOR_BASE, reasons: reasons, known: false, name: name };
  }

  var paidListings = num(rec.paidListings, isTrue(rec.paid) ? 1 : 0);
  if (paidListings >= 1) {
    s += SPONSOR_PAID;
    reasons.push(label + ' has announced and paid winners before (+' + SPONSOR_PAID + ')');
  } else {
    reasons.push(label + ' has never been seen to pay out (+0)');
  }

  var cadence = num(rec.listings90d, 0);
  if (cadence >= 3) {
    s += SPONSOR_CADENCE;
    reasons.push(fmtInt(cadence) + ' listings from ' + label + ' in 90 days — a repeat channel, not one payout (+' + SPONSOR_CADENCE + ')');
  }

  if (isTrue(rec.identifiable)) {
    s += SPONSOR_IDENTIFIABLE;
    reasons.push(label + ' is an identifiable protocol or company (+' + SPONSOR_IDENTIFIABLE + ')');
  }

  var ghosted = num(rec.expiredUnannounced, isTrue(rec.ghosted) ? 1 : 0);
  if (ghosted >= 1) {
    s += SPONSOR_GHOSTED;
    reasons.push(label + ' has ' + fmtInt(ghosted) + ' expired listing(s) with no winners 30+ days past deadline (' + SPONSOR_GHOSTED + ')');
  }

  return { sponsor: clamp(safe(s, SPONSOR_BASE), 0, 1), reasons: reasons, known: true, name: name };
}

/* ==================================================================================== *
 * 7. SKILL EDGE, HOURS, ENTRANTS                                                        *
 * ==================================================================================== */

function skillMatches(listing, profile) {
  var want = arr(profile.skills).map(lower).filter(function (s) { return !!s; });
  if (!want.length) return null;                 // no declared skills: no opinion either way
  var hay = (lower(obj(listing).skill) + ' ' + lower(obj(listing).type) + ' ' + lower(obj(listing).title));
  for (var i = 0; i < want.length; i += 1) {
    if (hay.indexOf(want[i]) !== -1) return want[i];
  }
  return false;
}

/**
 * E, the skill edge, clamped to [0.5, 5] by computeEV:
 *   2.5  stack + problem shape already shipped once (prior art in the repo)
 *   1.8  default for a code/tooling/docs deliverable  <- the honest baseline
 *   1.2  domain we have no prior art in
 *   0.8  we would be learning the domain during the build
 * Do not start above 1.8. Recalibrate from outcomes, never from optimism.
 */
function resolveEdge(listing, profile, reasons, assumptions) {
  var declared = numOrNull(profile.skillEdge);
  var base = declared === null ? DEFAULT_EDGE : clamp(declared, EDGE_MIN, EDGE_MAX);

  if (declared === null) {
    assumptions.push('assumed-skill-edge');
    reasons.push('no skillEdge in the profile — using the honest baseline E=' + DEFAULT_EDGE);
  } else if (base > DEFAULT_EDGE) {
    reasons.push('skillEdge ' + round(base, 2) + ' is above the ' + DEFAULT_EDGE + ' baseline — the model is allowed to flatter you exactly never; recalibrate from outcomes');
  }

  var match = skillMatches(listing, profile);
  if (match === false) {
    var reduced = Math.min(base, EDGE_NO_PRIOR_ART);
    if (reduced < base) {
      reasons.push('no declared skill matches this listing — edge cut to E=' + EDGE_NO_PRIOR_ART + ' (no prior art in this domain)');
    }
    return clamp(reduced, EDGE_MIN, EDGE_MAX);
  }
  if (typeof match === 'string') {
    reasons.push('skill match on "' + match + '" — E=' + round(base, 2));
  }
  return clamp(base, EDGE_MIN, EDGE_MAX);
}

function resolveHours(listing, profile, reasons, assumptions) {
  var l = obj(listing);
  var explicit = numOrNull(l.estimatedHours);
  if (explicit !== null && explicit > 0) return clamp(explicit, MIN_HOURS, 2000);

  var byType = obj(profile.hoursEstimates);
  var typeKey = lower(l.type);
  var fromProfile = numOrNull(byType[typeKey]);
  if (fromProfile !== null && fromProfile > 0) return clamp(fromProfile, MIN_HOURS, 2000);

  var dflt = numOrNull(profile.defaultHours);
  if (dflt !== null && dflt > 0) {
    assumptions.push('assumed-build-hours');
    reasons.push('no per-listing build estimate — using the profile default of ' + fmtHours(dflt));
    return clamp(dflt, MIN_HOURS, 2000);
  }

  var guess = ASSUMED_HOURS;
  if (typeKey.indexOf('project') !== -1) guess = 24;
  else if (typeKey.indexOf('hackathon') !== -1) guess = 20;
  else if (lower(l.skill).indexOf('content') !== -1) guess = 6;

  assumptions.push('assumed-build-hours');
  reasons.push('no build estimate anywhere — assuming ' + fmtHours(guess) + '; put a real number on it before you commit');
  return guess;
}

/**
 * A zero is not the same as a silence, and the feed conflates them: api.js normalises a
 * missing `_count.Submission` to 0, which is also what a genuinely empty listing reports.
 * Trusting a 0 sets the field size to 1, which hands the row a ~100% win probability and
 * makes the engine recommend BUILD on a phantom. So a 0 is treated as unknown by default,
 * loudly, and the operator can opt out per profile once they have confirmed the count.
 */
function resolveEntrants(listing, agentAccess, profile, reasons, assumptions) {
  var raw = numOrNull(obj(listing).submissions);
  var guess = agentAccess === 'AGENT_ONLY' ? ASSUMED_ENTRANTS_ONLY : ASSUMED_ENTRANTS_ALLOWED;

  if (raw !== null && raw > 0) return Math.floor(clamp(raw, 0, MAX_FIELD));

  if (raw === 0 && isTrue(obj(profile).trustZeroEntrants)) {
    reasons.push('the feed reports 0 entrants and the profile says to trust that — scored as an empty field');
    return 0;
  }

  assumptions.push('assumed-field-size');
  if (raw === 0) {
    reasons.push('entrant count reads 0, which is also what the feed returns when it does not publish counts — assuming ' + guess + ' for ' + (agentAccess || 'an unknown access level') + '; set profile.trustZeroEntrants once you have confirmed it');
  } else {
    reasons.push('entrant count not published — assuming ' + guess + ' for ' + (agentAccess || 'an unknown access level'));
  }
  return guess;
}

var USD_PEGGED = { USDC: 1, USDT: 1, USD: 1, USDG: 1, PYUSD: 1, EURC: 0 };

/**
 * The pool in USD. api.js deliberately leaves rewardUsd null for a token it cannot price,
 * so falling back to the prize amounts means reading token units as dollars. That is done
 * only as a last resort and it is always flagged, never silent.
 */
function resolvePool(listing, reasons, assumptions) {
  var l = obj(listing);
  var pool = num(l.rewardUsd, null);
  if (pool === null) pool = num(obj(l.reward).usd, null);
  if (pool !== null) return Math.max(0, safe(pool, 0));

  var fallback = num(l.rewardAmount, null);
  if (fallback === null) fallback = num(obj(l.reward).amount, null);
  if (fallback === null) {
    var prizes = arr(l.prizes);
    var total = 0;
    for (var i = 0; i < prizes.length && i < MAX_SPLIT; i += 1) {
      var v = prizeAmount(prizes[i]);
      if (v > 0) total += v;
    }
    fallback = total;
  }
  fallback = Math.max(0, safe(fallback, 0));

  if (fallback > 0 && reasons) {
    var token = str(l.token).trim().toUpperCase();
    if (token && !USD_PEGGED[token]) {
      if (assumptions) assumptions.push('assumed-usd-parity');
      reasons.push('no USD value published and ' + token + ' is not USD-pegged — reading ' + fmtInt(fallback) + ' ' + token + ' as ' + fmtUsd(fallback) + '; price it yourself before you commit');
    } else if (!token) {
      if (assumptions) assumptions.push('assumed-usd-parity');
      reasons.push('no USD value and no token published — reading the prize total as ' + fmtUsd(fallback) + ' at face value');
    }
  }
  return fallback;
}

function normaliseAccess(listing) {
  var a = str(obj(listing).agentAccess).trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (a === 'AGENT_ONLY' || a === 'AGENT_ALLOWED') return a;
  return '';
}

function normaliseStatus(listing) {
  return str(obj(listing).status).trim().toUpperCase();
}

/* ==================================================================================== *
 * 8. scoreListing                                                                       *
 * ==================================================================================== */

/** The shape returned when a row is so broken that scoring it is meaningless. */
function unscorable(reason) {
  return {
    score: 0, expectedUsd: 0, expectedPerHour: 0, fit: 0, crowding: 0,
    runwayOk: false, verdict: 'SKIP', reasons: [str(reason)],
    band: 'ERROR', eligible: false, raw: 0, money: 0, runway: 0, sponsor: 0,
    verify: 0, exclusivity: 0, crowdDensity: 0, runwayRatio: 0,
    gates: [{ gate: 'G_unscorable', reason: str(reason) }],
    warnings: [], assumptions: ['unscorable'], fitMultipliers: [],
    inputs: {
      pool: 0, entrants: 0, hoursEstimate: 0, hoursToDeadline: 0, skillEdge: 0,
      agentAccess: null, status: null, deadlineMs: null, podiumSplit: [1],
      sponsor: null, now: 0
    },
    ev: {
      winProb: 0, podiumProb: 0, expectedUsd: 0, expectedPerHour: 0,
      breakEvenRate: 0, verdict: 'skip', notes: ['unscorable']
    }
  };
}

/**
 * scoreListing(listing, profile, opts) -> {
 *   score, expectedUsd, expectedPerHour, fit, crowding, runwayOk, verdict, reasons: [], ...
 * }
 * Total: no input can make it throw or return NaN/Infinity. The try/catch is the outermost
 * guarantee, not the strategy — every branch inside is individually guarded. It exists for
 * inputs no amount of guarding reaches, such as a listing whose `title` is a throwing
 * getter or a Proxy that traps property reads.
 * `opts.now` (or `profile.now`) injects the clock; otherwise Date.now() is used.
 */
function scoreListing(listing, profile, opts) {
  try {
    return scoreListingInner(listing, profile, opts);
  } catch (e) {
    return unscorable('this listing could not be read at all (' + str(e && e.message).slice(0, 120) + ') — inspect it by hand');
  }
}

function scoreListingInner(listing, profile, opts) {
  var l = obj(listing);
  var p = obj(profile);
  var now = resolveNow(p, opts);

  var reasons = [];
  var warnings = [];
  var assumptions = [];
  var gates = [];

  /* ---------------- STEP 0: eligibility ---------------- */

  var status = normaliseStatus(l);
  var access = normaliseAccess(l);
  var deadlineMs = toMillis(l.deadline);
  var eligible = true;
  var ineligibleReasons = [];

  if (!status) {
    assumptions.push('assumed-status-open');
    reasons.push('no status published — assuming OPEN; confirm before you build');
  } else if (status !== 'OPEN') {
    eligible = false;
    ineligibleReasons.push('status is ' + status + ' — not open for submissions');
  }

  if (!access) {
    assumptions.push('assumed-agent-access');
    reasons.push('agentAccess absent — scored as an assumed agent listing at EXCLUSIVITY ' + EXCLUSIVITY_SCORE.UNKNOWN + '; we never invent the field');
  }

  var hoursToDeadline;
  if (deadlineMs === null) {
    assumptions.push('assumed-deadline');
    hoursToDeadline = ASSUMED_DEADLINE_HOURS;
    reasons.push('no deadline published — assuming ' + fmtHours(ASSUMED_DEADLINE_HOURS) + ' of runway; verify it');
  } else {
    hoursToDeadline = (deadlineMs - now) / 3600000;
    if (!isFinite(hoursToDeadline)) hoursToDeadline = 0;
    if (hoursToDeadline <= 0) {
      eligible = false;
      ineligibleReasons.push('deadline passed ' + fmtHours(Math.abs(hoursToDeadline)) + ' ago');
      hoursToDeadline = 0;
    }
  }
  hoursToDeadline = clamp(hoursToDeadline, 0, 24 * 365 * 10);

  /* ---------------- STEP 1: money core ---------------- */

  var pool = resolvePool(l, reasons, assumptions);
  var entrants = resolveEntrants(l, access, p, reasons, assumptions);
  var hoursEstimate = resolveHours(l, p, reasons, assumptions);
  var edge = resolveEdge(l, p, reasons, assumptions);
  var split = splitFromPrizes(l.prizes, pool);

  var ev = computeEV({
    prizeUsd: pool,
    submissions: entrants,
    hours: hoursEstimate,
    skillEdge: edge,
    podiumSplit: split
  });

  var rate = safe(ev.expectedPerHour, 0);
  var MONEY = clamp(safe(rate / (rate + TARGET_RATE_USD), 0), 0, 1);

  reasons.push(
    fmtUsd(pool) + ' pool, ' + fmtInt(entrants) + ' entrants, ~' + fmtHours(hoursEstimate) +
    ' at E=' + round(edge, 2) + ' — ' + fmtPct(ev.podiumProb) + ' chance of placing, ' +
    fmtUsd2(ev.expectedUsd) + ' expected, ' + fmtUsd2(rate) + '/h'
  );

  if (arr(l.prizes).length && ev.notes.indexOf('assumed-winner-take-all') === -1) {
    var splitSum = 0;
    for (var si = 0; si < split.length; si += 1) splitSum += split[si];
    if (splitSum < 0.995) {
      reasons.push('published prizes cover only ' + fmtPct(splitSum) + ' of the pool — the rest is money nobody can win, and the model does not inflate it back');
    }
  }

  /* ---------------- STEP 2: the six non-money sub-scores ---------------- */

  var text = harvestText(l);
  var ctx = { listing: l, profile: p, text: text, has: makeMatcher(text) };

  var fitOut = scoreFit(ctx);
  var FIT = fitOut.fit;
  for (var fr = 0; fr < fitOut.reasons.length; fr += 1) reasons.push(fitOut.reasons[fr]);
  for (var fa = 0; fa < fitOut.assumptions.length; fa += 1) assumptions.push(fitOut.assumptions[fa]);

  var density, CROWD;
  if (pool <= 0) {
    density = 0;
    CROWD = 0;
    reasons.push('no published pool — crowding cannot be measured and the row cannot be valued');
  } else {
    density = safe(entrants / (pool / 1000), 0);
    density = clamp(density, 0, 1e6);
    CROWD = clamp(safe(1 / (1 + density / CROWD_BREAK_POINT), 0), 0, 1);
    var perEntrant = entrants > 0 ? pool / entrants : pool;
    reasons.push(fmtInt(entrants) + ' entrants for a ' + fmtUsd(pool) + ' pool — ' + fmtUsd2(perEntrant) + ' per entrant');
  }

  var runwayDenom = REVISION_MULTIPLIER * Math.max(hoursEstimate, MIN_HOURS);
  var r = runwayDenom > 0 ? (hoursToDeadline * WALLCLOCK_USABLE) / runwayDenom : 0;
  r = clamp(safe(r, 0), 0, 1e6);
  var RUNWAY = clamp(safe((r - 1) / 2, 0), 0, 1);
  var runwayOk = r >= RUNWAY_GATE;
  if (!runwayOk) {
    reasons.push('deadline in ' + fmtHours(hoursToDeadline) + ' vs ~' + fmtHours(hoursEstimate * REVISION_MULTIPLIER) + ' of realistic build — insufficient runway (r=' + round(r, 2) + ')');
  } else if (RUNWAY < 0.5) {
    reasons.push('runway is tight: ' + fmtHours(hoursToDeadline) + ' of wall clock against a ' + fmtHours(hoursEstimate) + ' estimate (r=' + round(r, 2) + ')');
  }

  var sponsorOut = scoreSponsor(ctx);
  var SPONSOR = sponsorOut.sponsor;
  for (var sr = 0; sr < sponsorOut.reasons.length; sr += 1) reasons.push(sponsorOut.reasons[sr]);
  if (!sponsorOut.known) assumptions.push('assumed-sponsor');

  var verifyOut = scoreVerify(ctx);
  var VERIFY = verifyOut.verify;
  reasons.push(verifyOut.reason);
  if (verifyOut.assumed) assumptions.push('assumed-verifiability');

  var EXCLUSIVITY;
  if (access === 'AGENT_ONLY') {
    EXCLUSIVITY = EXCLUSIVITY_SCORE.AGENT_ONLY;
    reasons.push('AGENT_ONLY — no human field to beat');
  } else if (access === 'AGENT_ALLOWED') {
    EXCLUSIVITY = EXCLUSIVITY_SCORE.AGENT_ALLOWED;
    reasons.push('AGENT_ALLOWED — the whole human field is in this one too');
  } else {
    EXCLUSIVITY = EXCLUSIVITY_SCORE.UNKNOWN;
  }

  /* ---------------- STEP 3: blend and gate ---------------- */

  var RAW =
    WEIGHTS.MONEY * MONEY +
    WEIGHTS.FIT * FIT +
    WEIGHTS.CROWD * CROWD +
    WEIGHTS.RUNWAY * RUNWAY +
    WEIGHTS.SPONSOR * SPONSOR +
    WEIGHTS.VERIFY * VERIFY +
    WEIGHTS.EXCLUSIVITY * EXCLUSIVITY;
  RAW = clamp(safe(RAW, 0), 0, 1);

  var gFit = 1, gRunway = 1, gIntegrity = 1, gValue = 1;

  if (FIT < FIT_GATE) {
    gFit = 0;
    gates.push({ gate: 'G_fit', reason: 'FIT ' + round(FIT, 2) + ' is below ' + FIT_GATE + ' — this needs a human we do not have' });
  }
  if (r < RUNWAY_GATE) {
    gRunway = 0;
    gates.push({ gate: 'G_runway', reason: 'runway ratio r=' + round(r, 2) + ' is below ' + RUNWAY_GATE + ' — cannot finish, so the EV is imaginary' });
  }

  var blacklist = arr(p.blacklist).map(lower);
  var sponsorKey = lower(sponsorOut.name);
  if (sponsorKey && blacklist.indexOf(sponsorKey) !== -1) {
    gIntegrity = 0;
    gates.push({ gate: 'G_integrity', reason: 'sponsor ' + sponsorOut.name + ' is on the operator blacklist' });
  }
  if (ctx.has(RX.noAi)) {
    gIntegrity = 0;
    gates.push({ gate: 'G_integrity', reason: 'the brief prohibits AI or agent submissions — gated to zero and not overridable from the CLI' });
  }
  var titleLower = lower(l.title).trim();
  if (RX.probe.test(titleLower) || /^zz[-_ ]?probe/.test(lower(sponsorOut.name))) {
    gIntegrity = 0;
    gates.push({ gate: 'G_integrity', reason: 'this looks like a probe or test listing — not a real income opportunity' });
  }

  if (pool < MIN_POOL_USD) {
    gValue = 0;
    gates.push({ gate: 'G_value', reason: fmtUsd(pool) + ' pool is below the ' + fmtUsd(MIN_POOL_USD) + ' floor — a submission costs more sponsor goodwill than it can return' });
  }

  var score = 100 * RAW * gFit * gRunway * gIntegrity * gValue;
  score = clamp(safe(score, 0), 0, 100);

  /* The $8/h floor is a submission-time refusal, not a scoring gate — see the file header. */
  if (rate < MIN_RATE_USD && pool >= MIN_POOL_USD && !gates.length) {
    warnings.push('EV ' + fmtUsd2(rate) + '/h is under the ' + fmtUsd(MIN_RATE_USD) + '/h floor in the refuse list — SPONSOR and VERIFY are carrying this row, and qualityGate will block a submission unless you say why');
  }
  var weekBudget = numOrNull(p.hoursPerWeek);
  if (weekBudget !== null && weekBudget > 0 && hoursEstimate > weekBudget) {
    warnings.push('~' + fmtHours(hoursEstimate) + ' estimated against a ' + fmtHours(weekBudget) + '/week budget — this is the whole week');
  }

  /* ---------------- STEP 4: bands ---------------- */

  var verdict, band;
  if (!eligible) {
    verdict = 'SKIP';
    band = 'INELIGIBLE';
  } else if (gates.length) {
    verdict = 'SKIP';
    band = 'GATED';
  } else if (score >= BANDS.BUILD) {
    verdict = 'BUILD';
    band = 'BUILD';
  } else if (score >= BANDS.SHORTLIST) {
    verdict = 'SHORTLIST';
    band = 'SHORTLIST';
  } else if (score >= BANDS.WATCH) {
    verdict = 'WATCH';
    band = 'WATCH';
  } else {
    verdict = 'SKIP';
    band = 'BELOW_WATCH';
  }

  if (!eligible) {
    score = 0;
    reasons = ineligibleReasons.concat(reasons);
  } else if (gates.length) {
    for (var gi = 0; gi < gates.length; gi += 1) reasons.unshift('SKIP: ' + gates[gi].reason);
  }

  return {
    // contract fields
    score: round(score, 2),
    expectedUsd: round(ev.expectedUsd, 2),
    expectedPerHour: round(rate, 2),
    fit: round(FIT, 4),
    crowding: round(CROWD, 4),
    runwayOk: runwayOk,
    verdict: verdict,
    reasons: reasons.concat(warnings),

    // everything the CLI needs to explain itself
    band: band,
    eligible: eligible,
    raw: round(RAW, 6),
    money: round(MONEY, 4),
    runway: round(RUNWAY, 4),
    sponsor: round(SPONSOR, 4),
    verify: round(VERIFY, 4),
    exclusivity: round(EXCLUSIVITY, 4),
    crowdDensity: round(density, 3),
    runwayRatio: round(r, 3),
    gates: gates,
    warnings: warnings,
    assumptions: assumptions,
    fitMultipliers: fitOut.fired,
    inputs: {
      pool: round(pool, 2),
      entrants: entrants,
      hoursEstimate: round(hoursEstimate, 2),
      hoursToDeadline: round(hoursToDeadline, 2),
      skillEdge: round(edge, 3),
      agentAccess: access || null,
      status: status || null,
      deadlineMs: deadlineMs,
      podiumSplit: split,
      sponsor: sponsorOut.name || null,
      now: now
    },
    ev: ev
  };
}

/* ==================================================================================== *
 * 9. rankListings / partitionListings                                                   *
 * ==================================================================================== */

function sortKeyDeadline(entry) {
  var d = toMillis(obj(obj(entry).listing).deadline);
  return d === null ? FAR_FUTURE : d;
}

/**
 * rankListings(listings, profile, opts) -> [{ listing, score, result }] sorted desc.
 * STEP-0-ineligible rows are never ranked (they are returned by partitionListings so the
 * CLI can still print why). Gate-zeroed rows ARE ranked, at score 0, so the operator sees
 * them reported as SKIP with the gate named rather than silently vanishing.
 * Tie-break: score desc, expectedUsd desc, deadline asc.
 */
function rankListings(listings, profile, opts) {
  return partitionListings(listings, profile, opts).ranked;
}

function partitionListings(listings, profile, opts) {
  var rows = arr(listings);
  var ranked = [];
  var skipped = [];
  var i, listing, result;

  for (i = 0; i < rows.length && i < MAX_LISTINGS; i += 1) {
    listing = rows[i];
    if (listing === null || listing === undefined) continue;
    if (typeof listing !== 'object' || Array.isArray(listing)) continue;
    try {
      result = scoreListing(listing, profile, opts);
    } catch (e) {
      // Belt and braces: scoreListing is already total, but a ranked list must never die
      // for one row.
      skipped.push({
        listing: listing,
        score: 0,
        result: unscorable('scoring failed for this row: ' + str(e && e.message).slice(0, 120))
      });
      continue;
    }
    var entry = { listing: listing, score: result.score, result: result };
    if (result.eligible) ranked.push(entry);
    else skipped.push(entry);
  }

  ranked.sort(function (a, b) {
    var d = safe(b.score, 0) - safe(a.score, 0);
    if (d !== 0) return d;
    d = safe(obj(b.result).expectedUsd, 0) - safe(obj(a.result).expectedUsd, 0);
    if (d !== 0) return d;
    return sortKeyDeadline(a) - sortKeyDeadline(b);
  });

  return { ranked: ranked, skipped: skipped };
}

/* ==================================================================================== *
 * 10. PROSE RULES for the otherInfo field                                               *
 * ==================================================================================== */

var BANNED_PHRASES = [
  "i'm excited to", 'im excited to', 'i am excited to',
  'this project leverages',
  'seamlessly',
  'cutting-edge', 'cutting edge',
  'revolutionary',
  'game-changing', 'game changing',
  'robust and scalable',
  "in today's fast-paced", 'in todays fast-paced', 'in today’s fast-paced',
  'unlock the power of'
];

var EM_DASH = '—';

var LIMITS_HEADINGS = [
  'what it does not do yet',
  "what it doesn't do yet",
  'what it doesn’t do yet',
  'limitations',
  'known limits',
  'limits'
];

/**
 * checkProse(text) -> { ok, failures: [], warnings: [] }
 * The rules the draft generator enforces before text is allowed into a submission body.
 */
function checkProse(text) {
  var t = str(text);
  var lowerT = t.toLowerCase();
  var failures = [];
  var warnings = [];
  var i;

  for (i = 0; i < BANNED_PHRASES.length; i += 1) {
    if (lowerT.indexOf(BANNED_PHRASES[i]) !== -1) {
      failures.push('banned filler phrase "' + BANNED_PHRASES[i] + '" — say the thing instead');
    }
  }

  if (t.indexOf(EM_DASH) !== -1) {
    failures.push('contains an em dash — the template bans them; use a full stop or a comma');
  }

  var hasLimits = false;
  for (i = 0; i < LIMITS_HEADINGS.length; i += 1) {
    if (lowerT.indexOf(LIMITS_HEADINGS[i]) !== -1) { hasLimits = true; break; }
  }
  if (!hasLimits) {
    failures.push('no "What it does not do yet" section — a submission that claims no limitations is refused');
  }

  if (!/\d/.test(t)) {
    warnings.push('not a single number in the whole body — every adjective is supposed to have a number or a verifiable fact behind it');
  }

  if (/\b(\w+), (\w+),? and (\w+)\b/.test(lowerT)) {
    warnings.push('possible rule-of-three adjective stack — check it is three facts, not three adjectives');
  }

  var firstSentence = t.split(/(?<=[.!?])\s/)[0] || t;
  if (firstSentence.length > 0 && firstSentence.length < 40) {
    warnings.push('first sentence is ' + firstSentence.length + ' characters — on a crowded listing that is all a judge reads');
  }

  var expected = ['what it does', 'how it works', 'run it'];
  for (i = 0; i < expected.length; i += 1) {
    if (lowerT.indexOf(expected[i]) === -1) {
      warnings.push('template section "' + expected[i] + '" is missing');
    }
  }

  return { ok: failures.length === 0, failures: failures, warnings: warnings };
}

/* ==================================================================================== *
 * 11. qualityGate — the 13 points. PASS only at 13/13. There is no override flag.        *
 * ==================================================================================== */

var TUNNEL_HOSTS = /(^|\.)(ngrok(?:-free)?\.(?:io|app|dev)|trycloudflare\.com|loca\.lt|localtunnel\.me|serveo\.net|localhost\.run|tunnelto\.dev|bore\.pub|pinggy\.link)$/i;
var SECRET_PATTERNS = [
  { re: /\bsk_[A-Za-z0-9_\-]{8,}/, what: 'a Superteam agent API key (sk_...)' },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, what: 'a PEM private key' },
  { re: /\b[1-9A-HJ-NP-Za-km-z]{85,90}\b/, what: 'something shaped like a base58 Solana secret key' },
  // Line-anchored on purpose: an unanchored 12-word run matches ordinary English prose.
  { re: /(?:^|\n)[ \t]*(?:[a-z]{3,8}[ ]){11,23}[a-z]{3,8}[ \t]*(?=\n|$)/, what: 'a line shaped like a seed phrase' },
  { re: /(?:^|[\s/])\.env(?:[\s.:]|$)/, what: 'a reference to a committed .env file' }
];

function parseUrl(value) {
  var s = str(value).trim();
  if (!s) return null;
  var m = /^([a-z][a-z0-9+.\-]*):\/\/([^/?#\s]+)/i.exec(s);
  if (!m) return null;
  var scheme = m[1].toLowerCase();
  var host = m[2].toLowerCase();
  var at = host.lastIndexOf('@');
  if (at !== -1) host = host.slice(at + 1);
  var colon = host.lastIndexOf(':');
  if (colon !== -1 && host.indexOf(']') === -1) host = host.slice(0, colon);
  return { scheme: scheme, host: host, href: s };
}

function urlProblems(value, label) {
  var out = [];
  var u = parseUrl(value);
  if (!u) {
    out.push(label + ' is not an absolute http(s) URL (' + (str(value) ? '"' + str(value).slice(0, 80) + '"' : 'empty') + ')');
    return out;
  }
  if (u.scheme !== 'http' && u.scheme !== 'https') {
    out.push(label + ' uses the "' + u.scheme + '" scheme — a judge needs a plain https link');
  }
  if (u.host === 'localhost' || u.host === '127.0.0.1' || u.host === '0.0.0.0' || u.host === '::1' || /\.local$/.test(u.host)) {
    out.push(label + ' points at ' + u.host + ' — localhost is an automatic fail');
  }
  if (TUNNEL_HOSTS.test(u.host)) {
    out.push(label + ' is a tunnel URL (' + u.host + ') — tunnels die and a dead link is worse than no submission');
  }
  // `https://a` parses as a URL and used to sail through. A judge needs a host
  // that actually resolves: a dotted name with a real TLD, or a literal IP.
  var isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(u.host);
  var isIpv6 = u.host.indexOf('[') === 0;
  if (!isIpv4 && !isIpv6 && !/\.[a-z]{2,}$/i.test(u.host)) {
    out.push(label + ' has no resolvable host ("' + u.host + '" has no TLD) — a judge cannot open it');
  }
  if (PLACEHOLDER_HOSTS.test(u.host)) {
    out.push(label + ' points at the placeholder domain ' + u.host + ' — that is a template value, not your work');
  }
  return out;
}

function questionText(q) {
  if (typeof q === 'string') return q;
  var o = obj(q);
  return str(o.question) || str(o.label) || str(o.title) || str(o.name);
}

function normQuestion(q) {
  return questionText(q).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

var PLACEHOLDER_ANSWER = /^(n\/?a|na|tbd|todo|none|-{1,3}|\.|test|wip|xxx+|lorem ipsum.*)$/i;

/**
 * Length checks that count whitespace are not length checks. `' '.repeat(400)`
 * and `'a'.repeat(450)` both cleared the old minimums, which is exactly the
 * "obviously empty entry" the gate exists to refuse. Everything below measures
 * SUBSTANCE: non-whitespace characters, words, and distinct words.
 */
function contentLength(text) {
  return str(text).replace(/\s+/g, '').length;
}

function wordsOf(text) {
  var m = str(text).toLowerCase().match(/[a-z0-9฀-๿][a-z0-9'’฀-๿-]*/g);
  return m || [];
}

function uniqueWordCount(text) {
  var words = wordsOf(text);
  var seen = {};
  var n = 0;
  for (var i = 0; i < words.length; i += 1) {
    if (!seen[words[i]]) { seen[words[i]] = true; n += 1; }
  }
  return n;
}

/** Reserved/placeholder domains nobody can actually demo on (RFC 2606 + friends). */
var PLACEHOLDER_HOSTS = /(^|\.)(example\.(com|org|net|edu)|test|invalid|localdomain|yourdomain\.com|mysite\.com|foo\.bar)$/i;

/**
 * qualityGate(draft, listing, opts) -> { pass, failures: [], warnings: [] }
 *
 * Pure: it never fetches anything. Item 3 and item 4 are checked against evidence the
 * caller collected (draft.linkCheck, draft.runCheck), which is the only honest way for a
 * pure function to assert "the demo was live 15 minutes ago".
 *
 * Every failure carries { item, code, message, evidence } so the CLI can print the failing
 * item numbers and the specific evidence. There is no override flag: the fix is to fix
 * the work. Re-running the gate after fixes is cheap and expected.
 */
function qualityGate(draft, listing, opts) {
  try {
    return qualityGateInner(draft, listing, opts);
  } catch (e) {
    return {
      pass: false,
      failures: [{
        item: 'R',
        code: 'gate-error',
        message: 'The quality gate could not read this draft (' + str(e && e.message).slice(0, 120) + '). A draft the gate cannot parse is not a draft that ships.',
        evidence: null
      }],
      warnings: [],
      failedItems: ['R'],
      itemsChecked: 13,
      itemsPassed: 0
    };
  }
}

function qualityGateInner(draft, listing, opts) {
  var d = obj(draft);
  var l = obj(listing);
  var now = resolveNow(obj(opts).profile, opts);
  var failures = [];
  var warnings = [];
  var i, j;

  function fail(item, code, message, evidence) {
    failures.push({
      item: item,
      code: code,
      message: str(message),
      evidence: evidence === undefined ? null : evidence
    });
  }
  function warn(item, message) {
    warnings.push({ item: item, message: str(message) });
  }

  var otherInfo = str(d.otherInfo);
  var link = str(d.link);
  var text = harvestText(l);
  var has = makeMatcher(text);

  /* ---- 1. BRIEF COMPLIANCE MATRIX ---------------------------------------------- */
  var compliance = arr(d.compliance);
  if (!compliance.length) {
    fail(1, 'no-compliance-matrix', 'No brief-compliance matrix. Extract every explicit requirement from the brief into a numbered list and map each to a file path, route or URL.');
  } else {
    var mapped = {};
    for (i = 0; i < compliance.length && i < 500; i += 1) {
      var row = obj(compliance[i]);
      var req = str(row.requirement).trim();
      var sat = str(row.satisfiedBy).trim();
      if (!req) {
        fail(1, 'compliance-row-empty', 'Compliance row ' + (i + 1) + ' has no requirement text.', row);
        continue;
      }
      if (!sat) {
        fail(1, 'compliance-unmapped', 'Requirement "' + req.slice(0, 80) + '" is not mapped to anything.', row);
        continue;
      }
      if (/\b(partial|partially|mostly|todo|tbd|wip|in progress|n\/a)\b/i.test(sat)) {
        fail(1, 'compliance-partial', 'Requirement "' + req.slice(0, 80) + '" is only "' + sat.slice(0, 60) + '". Partially is a fail.', row);
        continue;
      }
      mapped[req.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()] = true;
    }
    var stated = arr(l.requirements);
    for (i = 0; i < stated.length && i < 200; i += 1) {
      var key = str(typeof stated[i] === 'string' ? stated[i] : obj(stated[i]).text)
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (key && !mapped[key]) {
        fail(1, 'compliance-missing-requirement', 'The listing states a requirement that the matrix does not cover: "' + key.slice(0, 80) + '".');
      }
    }
  }

  /* ---- 2. ELIGIBILITY ANSWERS COMPLETE ----------------------------------------- */
  var questions = arr(l.eligibilityQuestions);
  var answers = arr(d.eligibilityAnswers);
  var answerIndex = {};
  for (i = 0; i < answers.length && i < 500; i += 1) {
    var a = obj(answers[i]);
    var qn = normQuestion(a.question !== undefined ? a.question : a);
    if (qn) answerIndex[qn] = str(a.answer);
  }
  for (i = 0; i < questions.length && i < 200; i += 1) {
    var qRaw = questions[i];
    var qLabel = questionText(qRaw);
    var qKey = normQuestion(qRaw);
    if (!qKey) {
      fail(2, 'question-unparsed', 'Eligibility question ' + (i + 1) + ' has a shape this tool cannot read. Answer it yourself; it is never auto-filled.', qRaw);
      continue;
    }
    var ans = answerIndex[qKey];
    if (ans === undefined) {
      fail(2, 'answer-missing', 'Eligibility question "' + qLabel.slice(0, 80) + '" is unanswered.');
      continue;
    }
    var trimmed = ans.trim();
    if (!trimmed || PLACEHOLDER_ANSWER.test(trimmed)) {
      fail(2, 'answer-placeholder', 'Answer to "' + qLabel.slice(0, 60) + '" is a placeholder ("' + trimmed.slice(0, 20) + '").');
      continue;
    }
    // Measure substance, not keystrokes: whitespace and one repeated letter
    // both used to clear this minimum.
    var ansChars = contentLength(trimmed);
    if (ansChars < ANSWER_MIN_CHARS) {
      if (/^n\/?a\b/i.test(trimmed)) {
        fail(2, 'answer-na-unexplained', 'Answer to "' + qLabel.slice(0, 60) + '" is N/A without saying why. If it genuinely does not apply, say so in at least ' + ANSWER_MIN_CHARS + ' characters.');
      } else {
        fail(2, 'answer-too-short', 'Answer to "' + qLabel.slice(0, 60) + '" is ' + ansChars + ' characters of actual content; the minimum is ' + ANSWER_MIN_CHARS + '.');
      }
      continue;
    }
    if (wordsOf(trimmed).length < ANSWER_MIN_WORDS) {
      fail(2, 'answer-not-prose', 'Answer to "' + qLabel.slice(0, 60) + '" is ' + wordsOf(trimmed).length + ' word(s). Padding is not an answer; write at least ' + ANSWER_MIN_WORDS + ' words.', trimmed.slice(0, 40));
    }
  }
  for (i = 0; i < answers.length && i < 500; i += 1) {
    var extra = normQuestion(obj(answers[i]).question);
    var known = false;
    for (j = 0; j < questions.length && j < 200; j += 1) {
      if (normQuestion(questions[j]) === extra) { known = true; break; }
    }
    if (extra && !known && questions.length) {
      warn(2, 'Answering "' + extra.slice(0, 60) + '", which is not a question this listing asked. Check you scored the right listing.');
    }
  }

  /* ---- 3. DEMO IS LIVE AND CLEAN-ROOM ------------------------------------------ */
  var linkIssues = urlProblems(link, 'The demo link');
  for (i = 0; i < linkIssues.length; i += 1) fail(3, 'link-unusable', linkIssues[i], link);
  var lc = obj(d.linkCheck);
  var lcStatus = numOrNull(lc.status);
  var lcAt = toMillis(lc.checkedAt);
  if (lcStatus === null || lcAt === null) {
    fail(3, 'link-unverified', 'No clean-room check recorded for the demo link. Fetch it from a fresh environment and record { status, checkedAt, cleanRoom }.');
  } else {
    if (lcStatus !== 200) {
      fail(3, 'link-not-200', 'The demo link returned HTTP ' + Math.round(lcStatus) + ', not 200.', lc);
    }
    var ageMs = now - lcAt;
    if (!(ageMs >= 0)) ageMs = 0;
    if (ageMs > LINK_CHECK_MAX_AGE_MS) {
      fail(3, 'link-check-stale', 'The last demo check was ' + Math.round(ageMs / 60000) + ' minutes ago; it has to be inside 15. Re-check it.', lc);
    }
    if (lc.cleanRoom === false) {
      fail(3, 'link-not-clean-room', 'The demo check ran with local state or a logged-in session. Re-run it from a fresh environment with no credentials you did not document.', lc);
    } else if (lc.cleanRoom !== true) {
      fail(3, 'link-clean-room-unknown', 'The demo check does not say whether it was clean-room. Set cleanRoom explicitly.', lc);
    }
  }

  /* ---- 4. ONE-COMMAND RUN VERIFIED --------------------------------------------- */
  var rc = obj(d.runCheck);
  var rcExit = numOrNull(rc.exitCode);
  if (!str(rc.command).trim()) {
    fail(4, 'run-command-missing', "No install-and-run command recorded. The README's own path has to be executed, not assumed.");
  }
  if (rcExit === null) {
    fail(4, 'run-unverified', 'No exit code recorded for the one-command run.');
  } else if (rcExit !== 0) {
    fail(4, 'run-failed', "The README's run command exited " + Math.round(rcExit) + ', not 0.', rc);
  }
  if (rc.cleanContainer === false) {
    fail(4, 'run-not-clean', 'The run was verified on a dirty machine. Run it in a clean container.', rc);
  } else if (rcExit !== null && rc.cleanContainer !== true) {
    warn(4, 'The run does not say whether it happened in a clean container. Say so explicitly.');
  }

  /* ---- 5. README PASSES THE LITERAL 2-MINUTE TEST ------------------------------ */
  var readme = obj(d.readme);
  var secs = numOrNull(readme.readAloudSeconds);
  if (secs === null) {
    fail(5, 'readme-untimed', 'The README has not been read aloud and timed. Time it; do not estimate it.');
  } else if (secs > README_MAX_SECONDS) {
    fail(5, 'readme-too-long', 'The README takes ' + Math.round(secs) + ' seconds to read aloud; the limit is ' + README_MAX_SECONDS + '. Cut it.');
  } else if (secs <= 0) {
    fail(5, 'readme-timing-invalid', 'The recorded read-aloud time is ' + secs + ' seconds, which is not a real measurement.');
  }
  if (readme.timed !== true) {
    fail(5, 'readme-timing-not-attested', 'readme.timed is not true. The 2-minute test is timed, not estimated.');
  }
  var wantOrder = ['whatItDoes', 'oneCommandRun', 'screenshot', 'judgingCriteria', 'limits'];
  var got = arr(readme.sections).map(function (s) { return str(s); });
  var cursor = -1;
  for (i = 0; i < wantOrder.length; i += 1) {
    var at = got.indexOf(wantOrder[i]);
    if (at === -1) {
      fail(5, 'readme-section-missing', 'The README is missing the "' + wantOrder[i] + '" section. Required order: ' + wantOrder.join(' -> ') + '.');
    } else if (at < cursor) {
      fail(5, 'readme-section-order', 'README section "' + wantOrder[i] + '" appears out of order. Required order: ' + wantOrder.join(' -> ') + '.');
    } else {
      cursor = at;
    }
  }

  /* ---- 6. JUDGING-CRITERIA MAP -------------------------------------------------- */
  var jmap = arr(d.judgingMap);
  if (!jmap.length) {
    fail(6, 'judging-map-missing', 'No judging-criteria map. One row per criterion the sponsor stated: criterion -> where it is satisfied -> how a judge verifies it in under 60 seconds.');
  } else {
    for (i = 0; i < jmap.length && i < 200; i += 1) {
      var jr = obj(jmap[i]);
      if (!str(jr.criterion).trim()) fail(6, 'judging-row-no-criterion', 'Judging map row ' + (i + 1) + ' has no criterion.', jr);
      if (!str(jr.where).trim()) fail(6, 'judging-row-no-where', 'Judging map row ' + (i + 1) + ' does not say where the criterion is satisfied.', jr);
      if (!str(jr.howToVerify).trim()) fail(6, 'judging-row-no-how', 'Judging map row ' + (i + 1) + ' does not say how a judge confirms it in under a minute.', jr);
    }
  }
  var statedCriteria = arr(l.judgingCriteria);
  if (statedCriteria.length) {
    for (i = 0; i < statedCriteria.length && i < 100; i += 1) {
      var sc = str(typeof statedCriteria[i] === 'string' ? statedCriteria[i] : obj(statedCriteria[i]).name)
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      var covered = false;
      for (j = 0; j < jmap.length && j < 200; j += 1) {
        if (str(obj(jmap[j]).criterion).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === sc) { covered = true; break; }
      }
      if (sc && !covered) fail(6, 'judging-criterion-uncovered', 'The sponsor stated the criterion "' + sc.slice(0, 80) + '" and the map does not cover it.');
    }
  } else if (d.criteriaInferred !== true && readme.criteriaInferredStated !== true) {
    fail(6, 'judging-criteria-inferred-unstated', 'The sponsor stated no criteria, so they were inferred from the brief. The README has to say that they were inferred.');
  }

  /* ---- 7. ORIGINALITY AND ATTRIBUTION ------------------------------------------ */
  var attr = obj(d.attribution);
  var unattributed = arr(attr.vendoredUnattributed);
  if (unattributed.length) {
    fail(7, 'unattributed-code', 'Borrowed code with no attribution: ' + unattributed.slice(0, 5).map(str).join(', ') + '. Attribute every dependency and adapted snippet in the README.', unattributed);
  }
  var template = obj(attr.template);
  if (str(template.name).trim()) {
    var delta = numOrNull(template.newLineRatio);
    var deltaIsPoint = template.deltaIsThePoint === true && attr.statedInReadme === true;
    if (!deltaIsPoint) {
      if (delta === null) {
        fail(7, 'template-delta-unknown', 'Built on the "' + str(template.name) + '" starter template and the new-line ratio was not measured. It has to be at least ' + Math.round(MIN_TEMPLATE_DELTA * 100) + '%.');
      } else if (delta < MIN_TEMPLATE_DELTA) {
        fail(7, 'template-delta-too-small', 'Only ' + Math.round(clamp(delta, 0, 1) * 100) + '% of the lines are new on top of "' + str(template.name) + '". Needs ' + Math.round(MIN_TEMPLATE_DELTA * 100) + '%, or the delta has to be the entire point and the README has to say so plainly.');
      }
    }
  }
  var overlap = numOrNull(attr.priorSubmissionOverlap);
  if (overlap !== null && overlap > 0.85) {
    if (!(has(/\breuse\b|may reuse|previous submission|same codebase/) && /reus|previously submitted|same repo/i.test(otherInfo))) {
      fail(7, 'recycled-artifact', 'This repo is ' + Math.round(clamp(overlap, 0, 1) * 100) + '% identical to a prior submission. Refuse unless the brief permits reuse and the otherInfo declares it in a visible sentence.');
    }
  }

  /* ---- 8. IT ACTUALLY WORKS UNDER TEST ----------------------------------------- */
  var tests = obj(d.tests);
  var ciGreen = lower(tests.ci) === 'green' || tests.ci === true;
  var logExit = numOrNull(obj(tests.runLog).exitCode);
  if (!ciGreen && logExit !== 0) {
    fail(8, 'tests-not-green', 'No green CI and no recorded run log with exit code 0. Paste a real run log into the README.', tests);
  }
  if (tests.hasFailingIfBrokenTest !== true) {
    fail(8, 'no-meaningful-test', 'No test that would fail if the core logic were broken. A demo that only works on the happy path in the recording is a fail.');
  }

  /* ---- 9. HONEST LIMITS SECTION ------------------------------------------------ */
  var limits = arr(readme.limits);
  var realLimits = [];
  for (i = 0; i < limits.length && i < 100; i += 1) {
    var lim = str(limits[i]).trim();
    if (!lim) continue;
    if (/^(none|n\/?a|nothing|no known)/i.test(lim)) {
      fail(9, 'limit-not-a-limit', '"' + lim.slice(0, 40) + '" is not a limitation.');
      continue;
    }
    if (lim.length < 15) {
      warn(9, 'Limitation "' + lim + '" is vague. Name the specific gap, like "no retry on 429".');
    }
    realLimits.push(lim);
  }
  if (realLimits.length < MIN_LIMITS) {
    fail(9, 'limits-too-few', 'Only ' + realLimits.length + ' named limitation(s); at least ' + MIN_LIMITS + ' are required. Judges trust submissions that name their own gaps.');
  }

  /* ---- 10. REAL COMMIT HISTORY -------------------------------------------------- */
  var repo = obj(d.repo);
  var repoIssues = urlProblems(repo.url, 'The repo URL');
  for (i = 0; i < repoIssues.length; i += 1) fail(10, 'repo-url-unusable', repoIssues[i], repo.url);
  if (repo.public === false) {
    fail(10, 'repo-private', 'The repo is private. A judge who cannot read the code cannot score it.');
  } else if (repo.public !== true) {
    warn(10, 'The repo does not say whether it is public. Say so explicitly.');
  }
  if (!str(repo.license).trim()) {
    fail(10, 'repo-no-license', 'No license file in the repo.');
  }
  var commits = numOrNull(repo.commits);
  if (commits === null) {
    fail(10, 'repo-commits-unknown', 'Commit count not recorded. At least ' + MIN_COMMITS + ' commits showing progression are required.');
  } else if (commits < MIN_COMMITS) {
    fail(10, 'repo-too-few-commits', 'Only ' + Math.round(commits) + ' commit(s). A single "initial commit" containing a finished project reads as bought or generated.');
  }
  var subjects = arr(repo.commitSubjects).map(lower);
  if (subjects.length === 1 || (subjects.length > 1 && subjects.every(function (s) { return s === subjects[0]; }))) {
    fail(10, 'repo-squashed-history', 'The commit history is one squashed dump. Judges read history as evidence of a real build.');
  }

  /* ---- 11. NO SECRETS COMMITTED ------------------------------------------------- */
  var scan = obj(d.secretScan);
  if (scan.clean !== true) {
    fail(11, 'secret-scan-not-run', 'The tree has not been scanned clean for sk_ keys, private keys, mnemonics and .env files. Set secretScan.clean once it passes.');
  }
  var hits = arr(scan.hits);
  if (hits.length) {
    fail(11, 'secrets-found', 'Secret scan found ' + hits.length + ' hit(s): ' + hits.slice(0, 3).map(str).join(', ') + '. Rotate the key before anything is submitted.', hits);
  }
  var ownText = [otherInfo, link, str(d.tweet), str(d.telegram)].join('\n');
  for (i = 0; i < answers.length && i < 200; i += 1) ownText += '\n' + str(obj(answers[i]).answer);
  for (i = 0; i < SECRET_PATTERNS.length; i += 1) {
    if (SECRET_PATTERNS[i].re.test(ownText)) {
      fail(11, 'secret-in-submission-body', 'The submission body itself contains ' + SECRET_PATTERNS[i].what + '. Remove it and rotate the key.');
    }
  }

  /* ---- 12. SUBMISSION BODY HYGIENE ---------------------------------------------- */
  var listingId = str(l.id);
  var draftListingId = str(d.listingId);
  if (!draftListingId) {
    fail(12, 'listing-id-missing', 'The draft has no listingId.');
  } else if (listingId && draftListingId !== listingId) {
    fail(12, 'listing-id-mismatch', 'listingId "' + draftListingId + '" does not match the listing we scored ("' + listingId + '").');
  }

  // Non-whitespace characters, not raw .length: 400 spaces is an empty entry.
  var otherChars = contentLength(otherInfo);
  var otherWords = wordsOf(otherInfo).length;
  var otherUnique = uniqueWordCount(otherInfo);
  if (otherChars < OTHER_INFO_MIN) {
    fail(12, 'other-info-too-short', 'otherInfo has ' + otherChars + ' characters of actual content (whitespace does not count); the minimum is ' + OTHER_INFO_MIN + '. There is no such thing as reserving a slot.');
  } else if (otherInfo.length > OTHER_INFO_MAX) {
    fail(12, 'other-info-too-long', 'otherInfo is ' + otherInfo.length + ' characters; the maximum is ' + OTHER_INFO_MAX + '.');
  } else if (otherWords < OTHER_INFO_MIN_WORDS || otherUnique < OTHER_INFO_MIN_UNIQUE) {
    // Long enough by character count, but repetitive — padding, not a description.
    fail(12, 'other-info-filler', 'otherInfo is ' + otherWords + ' word(s) with ' + otherUnique
      + ' distinct; at least ' + OTHER_INFO_MIN_WORDS + ' words and ' + OTHER_INFO_MIN_UNIQUE
      + ' distinct are required. Padding a field to clear a length check is an empty submission with extra steps.');
  }
  var prose = checkProse(otherInfo);
  for (i = 0; i < prose.failures.length; i += 1) fail(12, 'other-info-prose', prose.failures[i]);
  for (i = 0; i < prose.warnings.length; i += 1) warn(12, prose.warnings[i]);

  var wantsTweet = has(RX.tweetArtifact) || has(RX.reachGated);
  var tweet = str(d.tweet).trim();
  if (tweet && !wantsTweet) {
    fail(12, 'tweet-unrequested', 'tweet is populated but the brief does not ask for one. Leave it empty.');
  }
  if (!tweet && wantsTweet) {
    fail(12, 'tweet-required', 'The brief asks for a tweet or X post and the tweet field is empty.');
  }
  if (tweet) {
    var tIssues = urlProblems(tweet, 'The tweet URL');
    for (i = 0; i < tIssues.length; i += 1) fail(12, 'tweet-url-unusable', tIssues[i], tweet);
  }

  var variablePrice = lower(l.compensationType) === 'variable' || lower(l.type) === 'project' || isTrue(l.variablePrice);
  var ask = d.ask;
  if (ask !== null && ask !== undefined && !variablePrice) {
    fail(12, 'ask-unrequested', 'ask is set to ' + str(ask) + ' but this listing is not variable-price. It must be null.');
  }
  if (variablePrice && (ask === null || ask === undefined)) {
    warn(12, 'This is a variable-price listing and ask is null. Confirm that is intentional.');
  }
  if (ask !== null && ask !== undefined && numOrNull(ask) === null) {
    fail(12, 'ask-not-a-number', 'ask is set to a non-numeric value.');
  }

  var telegram = str(d.telegram).trim();
  if (!/^https?:\/\/t\.me\/[A-Za-z0-9_]{4,32}$/.test(telegram)) {
    fail(12, 'telegram-malformed', 'telegram must be the operator\'s real handle in the form http://t.me/<username>; got "' + telegram.slice(0, 60) + '".');
  }

  var title = '';
  for (i = 0; i < answers.length && i < 200; i += 1) {
    if (/project title|title/.test(normQuestion(obj(answers[i]).question))) title = str(obj(answers[i]).answer);
  }
  if (/^(test|probe|wip|todo|untitled|asdf|placeholder)\b/i.test(title.trim())) {
    fail(12, 'stub-title', 'The project title is "' + title.trim().slice(0, 40) + '". A stub submission is a permanent public record of not caring.');
  }

  /* ---- 13. HUMAN SIGN-OFF -------------------------------------------------------- */
  var sign = obj(d.humanSignOff);
  if (sign.approved !== true) {
    fail(13, 'no-human-signoff', 'No human sign-off. The tool will not call /api/agents/submissions/create on items 1-12 alone.');
  }
  if (sign.openedLink !== true) {
    fail(13, 'link-not-opened-by-human', 'The operator has not personally opened the demo link.');
  }
  if (!str(sign.by).trim()) {
    fail(13, 'signoff-unattributed', 'The sign-off does not say who approved it.');
  }
  var signAt = toMillis(sign.at);
  if (signAt === null) {
    fail(13, 'signoff-untimed', 'The sign-off has no timestamp.');
  } else if (signAt > now + 60000) {
    fail(13, 'signoff-in-future', 'The sign-off is timestamped in the future.');
  } else if (now - signAt > SIGNOFF_MAX_AGE_MS) {
    // Item 3 already refuses a link check older than 15 minutes. A sign-off from
    // last year attesting to work that changed since is the same defect, and it
    // is how a stale approval gets reused to wave a new draft through.
    fail(13, 'signoff-stale', 'The sign-off is '
      + Math.round((now - signAt) / 3600000) + ' hours old; the maximum is '
      + Math.round(SIGNOFF_MAX_AGE_MS / 3600000) + '. Re-approve the draft as it stands now.');
  }

  /* ---- REFUSAL RULES that are not one of the 13 but block a submission ---------- */
  if (str(d.priorSubmissionId).trim()) {
    fail('R', 'duplicate-create', 'A submission already exists for this listing (' + str(d.priorSubmissionId) + '). The only legal path is POST /api/agents/submissions/update.');
  }
  var pool = resolvePool(l, null, null);
  if (pool > 0 && pool < MIN_POOL_USD) {
    fail('R', 'micro-value-pool', 'Pool is ' + fmtUsd(pool) + ', under the ' + fmtUsd(MIN_POOL_USD) + ' floor. The submission costs more in sponsor goodwill than it can return.');
  }
  var rate = numOrNull(d.expectedPerHour);
  if (rate !== null && rate < MIN_RATE_USD) {
    fail('R', 'micro-value-rate', 'Expected ' + fmtUsd2(rate) + '/h is under the ' + fmtUsd(MIN_RATE_USD) + '/h floor.');
  }
  var verdict = str(d.verdict).toUpperCase();
  if (verdict && verdict !== 'BUILD' && verdict !== 'SHORTLIST') {
    fail('R', 'not-shortlisted', 'The engine scored this listing ' + verdict + '. Submitting to anything the engine did not score BUILD or SHORTLIST is spray-and-pray.');
  }
  var deadlineMs = toMillis(l.deadline);
  if (deadlineMs !== null) {
    var minsLeft = (deadlineMs - now) / 60000;
    if (minsLeft <= 0) {
      fail('R', 'deadline-passed', 'The deadline passed ' + Math.round(Math.abs(minsLeft)) + ' minutes ago.');
    } else if (minsLeft < 60) {
      fail('R', 'deadline-sniping', 'Only ' + Math.round(minsLeft) + ' minutes left. No submission inside the final 60 minutes.');
    } else if (minsLeft < 24 * 60) {
      warn('R', 'Less than 24 hours left. The playbook submits at T-24h.');
    }
  }
  if (has(RX.noAi)) {
    fail('R', 'no-ai-clause', 'The brief prohibits AI or agent submissions. This cannot be overridden from the CLI.');
  }

  var itemsFailed = {};
  for (i = 0; i < failures.length; i += 1) itemsFailed[String(failures[i].item)] = true;
  var failedItemList = Object.keys(itemsFailed).sort(function (a, b) {
    var na = num(a, 99), nb = num(b, 99);
    return na - nb;
  });

  return {
    pass: failures.length === 0,
    failures: failures,
    warnings: warnings,
    failedItems: failedItemList,
    itemsChecked: 13,
    itemsPassed: 13 - failedItemList.filter(function (x) { return x !== 'R'; }).length
  };
}

/* ==================================================================================== *
 * 12. EXPORTS                                                                           *
 * Named exports are the contract surface; the default export is the same bundle, so the  *
 * CLI can `import rank from './lib/rank.js'` if it prefers a namespace.                  *
 * ==================================================================================== */

/** Every tunable the engine uses, exported so the CLI prints them instead of re-typing them. */
var CONSTANTS = {
  TARGET_RATE_USD: TARGET_RATE_USD,
  CROWD_BREAK_POINT: CROWD_BREAK_POINT,
  WALLCLOCK_USABLE: WALLCLOCK_USABLE,
  REVISION_MULTIPLIER: REVISION_MULTIPLIER,
  RUNWAY_GATE: RUNWAY_GATE,
  FIT_GATE: FIT_GATE,
  MIN_POOL_USD: MIN_POOL_USD,
  MIN_RATE_USD: MIN_RATE_USD,
  DEFAULT_EDGE: DEFAULT_EDGE,
  EDGE_NO_PRIOR_ART: EDGE_NO_PRIOR_ART,
  ASSUMED_ENTRANTS_ALLOWED: ASSUMED_ENTRANTS_ALLOWED,
  ASSUMED_ENTRANTS_ONLY: ASSUMED_ENTRANTS_ONLY,
  OTHER_INFO_MIN: OTHER_INFO_MIN,
  OTHER_INFO_MAX: OTHER_INFO_MAX,
  ANSWER_MIN_CHARS: ANSWER_MIN_CHARS,
  LINK_CHECK_MAX_AGE_MS: LINK_CHECK_MAX_AGE_MS,
  MIN_COMMITS: MIN_COMMITS,
  MIN_LIMITS: MIN_LIMITS,
  MIN_TEMPLATE_DELTA: MIN_TEMPLATE_DELTA
};

export {
  // contract
  scoreListing,
  rankListings,
  qualityGate,

  // extras the CLI needs, all pure
  partitionListings,
  computeEV,
  splitFromPrizes,
  checkProse,
  harvestText,

  // constants
  WEIGHTS,
  BANDS,
  BANNED_PHRASES,
  CONSTANTS
};

export default {
  scoreListing: scoreListing,
  rankListings: rankListings,
  qualityGate: qualityGate,
  partitionListings: partitionListings,
  computeEV: computeEV,
  splitFromPrizes: splitFromPrizes,
  checkProse: checkProse,
  harvestText: harvestText,
  WEIGHTS: WEIGHTS,
  BANDS: BANDS,
  BANNED_PHRASES: BANNED_PHRASES,
  CONSTANTS: CONSTANTS
};
