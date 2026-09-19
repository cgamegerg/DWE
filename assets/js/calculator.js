/*
 * calculator.js — window.EarnCalculator (CONTRACT C)
 *
 * Classic <script>. No modules, no imports, no network. Attaches to window.
 * Owns: the expected-value engine, the listing ranker, and the calculator panel UI.
 * Does NOT own CSS. Every class name it emits is prefixed `calc-` and is listed at the
 * bottom of this header so the app agent can style them.
 *
 * ---------------------------------------------------------------------------------------
 * THE MODEL (Plackett-Luce, derived rather than hand-waved)
 * ---------------------------------------------------------------------------------------
 * A bounty with `submissions` entries is a ranking contest. Let n = max(1, submissions)
 * be the size of the field INCLUDING you, and let e = skillEdge be how many times more
 * likely you are to be picked than a random entrant. Model the field as one entrant of
 * weight e (you) plus (n - 1) entrants of weight 1.
 *
 * Plackett-Luce generates a full ranking by repeatedly drawing, without replacement, from
 * the remaining pool with probability proportional to weight. So:
 *
 *   Rank 1 is drawn from total weight e + (n - 1):
 *       P(rank 1) = e / (e + (n - 1))                                       ... = winProb
 *
 *   If you were not drawn first, exactly one weight-1 rival left the pool, so the pool is
 *   now you (weight e) plus (n - 2) rivals. The chance of being drawn at step 2, GIVEN you
 *   survived step 1, is e / (e + (n - 2)). In general, the hazard at step i (0-indexed) is
 *
 *       h_i = e / (e + (n - 1) - i)
 *
 *   because exactly i rivals have been removed ahead of you and you are still in the pool.
 *
 * That gives the exact rank distribution over the k paid ranks (k = podiumSplit.length):
 *
 *       P(exactly rank i+1) = h_i * PROD_{j<i} (1 - h_j)
 *       podiumProb          = SUM_i P(exactly rank i+1) = 1 - PROD_{i<k} (1 - h_i)
 *
 * which is exactly the closed-ish form the spec asks for, and the two agree by construction
 * instead of by coincidence. Naively doing 1 - (1 - winProb)^k would be wrong: the trials
 * are not independent, and the field shrinks under you as ranks are handed out.
 *
 * FIELD EXHAUSTION. At i = n - 1 every rival is gone, so h_{n-1} = e / e = 1: you are
 * certain to take that rank, and the survival product hits zero. Ranks beyond n do not
 * exist, so the loop stops there. A 5-deep podium in a 3-entry field pays only 3 ranks.
 *
 *       expectedUsd = SUM_i P(exactly rank i+1) * prizeUsd * podiumSplit[i]
 *
 * SANITY IDENTITIES (both asserted in the self-test):
 *   1. expectedUsd <= prizeUsd always. SUM_i P(rank i+1) <= 1, podiumSplit is normalised so
 *      it sums to at most 1, hence every share is <= 1, hence the weighted sum is <= prizeUsd.
 *   2. With e = 1, h_i = 1/(n - i) and the telescoping product collapses:
 *          PROD_{j<i} (1 - 1/(n - j)) = (n - i)/n
 *      so P(exactly rank i+1) = (n - i)/n * 1/(n - i) = 1/n for every reachable rank —
 *      a no-edge entrant is uniformly likely to land anywhere, as it must be. Therefore
 *          expectedUsd = prizeUsd * SUM_{i < min(k, n)} podiumSplit[i] / n
 *      and when the field is at least as deep as the podium (n >= k) and the split sums to
 *      1, that is exactly prizeUsd / n. When n < k the shortfall is real, not a bug: the
 *      unreachable ranks go unfilled and that prize money is never paid to anyone.
 *
 * MONEY:
 *       expectedPerHour = expectedUsd / max(hours, 0.25)
 *       breakEvenRate   = expectedPerHour — the plain-language reading is "you are bidding
 *                         your time at $X/hour". Above your real rate, take it; below, don't.
 *
 * VERDICT THRESHOLDS ARE AN OPINION, NOT A FACT. >= $50/h 'great', >= $20 'good',
 * >= $8 'marginal', else 'skip'. They are calibrated to a competent remote freelancer.
 * Someone building a portfolio from zero should read one tier lower; someone with a day job
 * billing $120/h should read one tier higher.
 *
 * EVERY input is clamped. computeEV never throws and never returns NaN or Infinity, for any
 * input at all — including negatives, zero, strings, null and NaN. The self-test proves it.
 *
 * ---------------------------------------------------------------------------------------
 * CSS CLASS NAMES EMITTED (for styles.css — the app agent owns the stylesheet)
 *   calc-panel, calc-head, calc-title, calc-sub, calc-grid, calc-controls, calc-field,
 *   calc-label, calc-label-text, calc-value, calc-inputs, calc-input, calc-range,
 *   calc-select, calc-hint, calc-results, calc-headline, calc-metrics, calc-metric,
 *   calc-metric-label, calc-metric-value, calc-verdict, calc-verdict-great,
 *   calc-verdict-good, calc-verdict-marginal, calc-verdict-skip, calc-notes, calc-note,
 *   calc-note-good, calc-note-warn, calc-note-info, calc-best, calc-best-title,
 *   calc-best-list, calc-best-item, calc-best-link, calc-best-meta, calc-best-rate,
 *   calc-best-use, calc-empty, calc-foot
 * ---------------------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Numeric guards. Nothing downstream is allowed to see NaN/Infinity.  *
   * ------------------------------------------------------------------ */

  var EDGE_MIN = 0.5;
  var EDGE_MAX = 5;
  var MIN_HOURS = 0.25;      // the hour floor used for the $/h division
  var MAX_SPLIT = 24;        // deepest podium we will model
  var MAX_FIELD = 1e9;       // absurd-input ceiling on the field size
  var SKILL_MATCH_BONUS = 1.25; // opinion: knowing the domain makes you ~25% likelier to place

  /** Coerce anything to a finite number, falling back to `fallback`. Accepts numeric strings. */
  function num(value, fallback) {
    var n;
    if (typeof value === 'number') {
      n = value;
    } else if (typeof value === 'string' && value.trim() !== '') {
      n = Number(value);
    } else {
      return fallback;
    }
    return isFinite(n) ? n : fallback;
  }

  function clamp(value, lo, hi) {
    if (value < lo) return lo;
    if (value > hi) return hi;
    return value;
  }

  /** Last line of defence before a number reaches the caller or the DOM. */
  function safe(value, fallback) {
    return (typeof value === 'number' && isFinite(value)) ? value : fallback;
  }

  function round(value, places) {
    var f = Math.pow(10, places);
    return Math.round(safe(value, 0) * f) / f;
  }

  /* ------------------------------------------------------------------ *
   * Podium normalisation                                                *
   * ------------------------------------------------------------------ */

  /**
   * Turn arbitrary user input into a valid list of prize-pool fractions.
   * Drops junk, clamps negatives to zero, caps depth, and scales down (never up) if the
   * shares sum to more than the whole pool. An empty/unusable list becomes [1]: a listing
   * with no published podium — a grant, or a single-winner award — pays one person.
   */
  function normaliseSplit(input) {
    var raw = Object.prototype.toString.call(input) === '[object Array]' ? input : [];
    var out = [];
    var total = 0;
    var i, v;
    for (i = 0; i < raw.length && out.length < MAX_SPLIT; i += 1) {
      v = num(raw[i], 0);
      if (v < 0) v = 0;
      out.push(v);
      total += v;
    }
    while (out.length && out[out.length - 1] === 0) out.pop();   // trailing zero ranks pay nobody
    if (!out.length) return { split: [1], assumed: true };
    if (total > 1) {
      for (i = 0; i < out.length; i += 1) out[i] = out[i] / total;
    }
    return { split: out, assumed: false };
  }

  /**
   * P(you finish exactly at paid rank i+1), for i = 0..k-1, under the sequential model
   * derived in the file header. Stops when the field is exhausted.
   */
  function rankProbabilities(edge, field, depth) {
    var probs = [];
    var survive = 1;   // P(still unranked entering this step)
    var i, rivals, hazard;
    for (i = 0; i < depth; i += 1) {
      rivals = (field - 1) - i;
      if (rivals < 0) break;                 // rank i+1 does not exist in a field this small
      hazard = edge / (edge + rivals);       // edge >= EDGE_MIN > 0, rivals >= 0 => denom > 0
      hazard = clamp(safe(hazard, 0), 0, 1);
      probs.push(survive * hazard);
      survive *= (1 - hazard);
      if (survive <= 0) break;               // certainty reached; later ranks are impossible
    }
    return probs;
  }

  /* ------------------------------------------------------------------ *
   * CONTRACT C: computeEV                                               *
   * ------------------------------------------------------------------ */

  function computeEV(input) {
    var opts = (input && typeof input === 'object') ? input : {};
    var notes = [];

    var prizeUsd = Math.max(0, num(opts.prizeUsd, 0));

    var rawSubs = num(opts.submissions, 0);
    var field = clamp(Math.floor(Math.max(0, rawSubs)), 0, MAX_FIELD);
    field = Math.max(1, field);              // 0 or 1 submissions => you are effectively alone

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
    expectedUsd = clamp(safe(expectedUsd, 0), 0, prizeUsd);   // identity 1, enforced as well as derived

    var expectedPerHour = clamp(safe(expectedUsd / billableHours, 0), 0, prizeUsd / MIN_HOURS);

    /* Machine notes. The UI maps these to language; they carry no locale of their own. */
    if (prizeUsd <= 0) notes.push('no-prize');
    if (field >= 100) notes.push('crowded-field');
    else if (field <= 10) notes.push('thin-field');
    if (field < split.length) notes.push('field-smaller-than-podium');
    if (hours >= 30) notes.push('long-tail-effort');
    if (split.length >= 5) notes.push('deep-podium');
    if (split[0] >= 0.6) notes.push('podium-heavy');
    else if (split.length >= 3 && split[0] <= 0.4) notes.push('flat-podium');
    if (hours > 0 && hours <= 2 && expectedPerHour >= 20) notes.push('quick-win');

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

  /* ------------------------------------------------------------------ *
   * CONTRACT C: rankListings                                            *
   * ------------------------------------------------------------------ */

  /**
   * Derive prize-pool fractions from a listing's published podium.
   * Dividing by the pool (not by the podium sum) is deliberate: if a sponsor advertises
   * $5,000 but only lists $4,000 of podium prizes, the missing $1,000 is money you cannot
   * win, and the shares should sum to 0.8 rather than being inflated back to 1.
   */
  function splitFromPrizes(prizes, poolUsd) {
    var raw = Object.prototype.toString.call(prizes) === '[object Array]' ? prizes : [];
    var amounts = [];
    var total = 0;
    var i, v, out, denom;
    for (i = 0; i < raw.length && amounts.length < MAX_SPLIT; i += 1) {
      v = num(raw[i], 0);
      if (v > 0) { amounts.push(v); total += v; }
    }
    if (!amounts.length || total <= 0) return [1];   // grants publish no podium: one award, one winner
    denom = poolUsd > 0 ? Math.max(poolUsd, total) : total;
    out = [];
    for (i = 0; i < amounts.length; i += 1) out.push(amounts[i] / denom);
    return out;
  }

  function rankListings(listings, profile) {
    var rows = Object.prototype.toString.call(listings) === '[object Array]' ? listings : [];
    var prof = (profile && typeof profile === 'object') ? profile : {};
    var wanted = Object.prototype.toString.call(prof.skills) === '[object Array]' ? prof.skills : [];
    var baseEdge = clamp(num(prof.skillEdge, 1), EDGE_MIN, EDGE_MAX);
    var budget = num(prof.hoursAvailable, 0);

    var matched = {};
    var i;
    for (i = 0; i < wanted.length; i += 1) {
      if (typeof wanted[i] === 'string') matched[wanted[i]] = true;
    }

    var out = [];
    for (i = 0; i < rows.length; i += 1) {
      var listing = rows[i];
      if (!listing || typeof listing !== 'object') continue;
      if (listing.status !== 'open') continue;

      var reward = (listing.reward && typeof listing.reward === 'object') ? listing.reward : {};
      var poolUsd = Math.max(0, num(reward.usd, num(reward.amount, 0)));
      var hours = Math.max(MIN_HOURS, num(listing.estimatedHours, 1));
      var edge = matched[listing.skill] ? baseEdge * SKILL_MATCH_BONUS : baseEdge;

      var ev = computeEV({
        prizeUsd: poolUsd,
        submissions: num(listing.submissions, 0),
        hours: hours,
        skillEdge: clamp(edge, EDGE_MIN, EDGE_MAX),
        podiumSplit: splitFromPrizes(listing.prizes, poolUsd)
      });

      if (budget > 0 && hours > budget) ev.notes.push('over-your-budget');

      out.push({ listing: listing, ev: ev });
    }

    out.sort(function (a, b) {
      var diff = b.ev.expectedPerHour - a.ev.expectedPerHour;
      if (diff !== 0) return diff;
      return b.ev.expectedUsd - a.ev.expectedUsd;
    });
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Formatting — every number a user sees goes through here             *
   * ------------------------------------------------------------------ */

  var usdFormatters = {};

  function intlNumber(value, minFrac, maxFrac) {
    var key = minFrac + ':' + maxFrac;
    try {
      if (!usdFormatters[key]) {
        usdFormatters[key] = new Intl.NumberFormat('en-US', {
          minimumFractionDigits: minFrac,
          maximumFractionDigits: maxFrac
        });
      }
      return usdFormatters[key].format(value);
    } catch (err) {
      return String(round(value, maxFrac));
    }
  }

  function fmtUsd(value) {
    var v = Math.max(0, safe(value, 0));
    if (v === 0) return '$0';
    if (v < 10) return '$' + intlNumber(v, 2, 2);
    if (v < 1000) return '$' + intlNumber(v, 0, 0);
    return '$' + intlNumber(v, 0, 0);
  }

  function fmtRate(value) {
    var v = Math.max(0, safe(value, 0));
    if (v > 0 && v < 1) return '$' + intlNumber(v, 2, 2);
    return '$' + intlNumber(v, 0, 0);
  }

  function fmtPct(value) {
    var v = clamp(safe(value, 0), 0, 1) * 100;
    if (v === 0) return '0%';
    if (v < 0.1) return '<0.1%';
    if (v >= 99.95) return '100%';
    return intlNumber(v, 1, 1) + '%';
  }

  function fmtInt(value) {
    return intlNumber(Math.round(Math.max(0, safe(value, 0))), 0, 0);
  }

  function fmtHours(value) {
    var v = Math.max(0, safe(value, 0));
    return (v < 10 && v !== Math.floor(v)) ? intlNumber(v, 1, 1) : intlNumber(v, 0, 0);
  }

  /* ------------------------------------------------------------------ *
   * Bilingual strings                                                   *
   * ------------------------------------------------------------------ */

  var COPY = {
    th: {
      title: 'เครื่องคำนวณค่าคาดหวัง',
      sub: 'ก่อนจะลงแรง ถามก่อนว่าคุ้มเวลาไหม ตัวเลขทุกตัวปรับได้',
      prize: 'เงินรางวัลรวม (USD)',
      prizeHint: 'ยอดรวมทั้งกระดาน ไม่ใช่เฉพาะที่ 1',
      subs: 'จำนวนคนที่ส่งแข่ง',
      subsHint: 'ดูเลข Submissions ในหน้าประกาศ ใส่ 0 หรือ 1 ถ้าแทบไม่มีคู่แข่ง',
      hours: 'เวลาที่คุณจะลง (ชั่วโมง)',
      hoursHint: 'นับรวมเวลาอ่านโจทย์ แก้งาน และส่งงานด้วย',
      edge: 'ฝีมือคุณเหนือคนทั่วไปกี่เท่า',
      edgeHint: '1.0 = เท่าคนทั่วไป, 2.0 = โอกาสติดรางวัลเป็นสองเท่า อย่าเข้าข้างตัวเอง',
      split: 'การแบ่งรางวัล',
      splitHint: 'ที่ 1 กินเยอะ = เสี่ยงสูง จ่ายหลายอันดับ = ค่าคาดหวังนิ่งกว่า',
      headline: 'เท่ากับคุณขายเวลาตัวเองชั่วโมงละ ',
      winProb: 'โอกาสได้ที่ 1',
      podiumProb: 'โอกาสติดรางวัล',
      expected: 'ค่าคาดหวัง',
      perHour: 'ต่อชั่วโมง',
      best: 'แนะนำสำหรับคุณ',
      bestSub: 'งานที่เปิดอยู่ เรียงตามค่าคาดหวังต่อชั่วโมง',
      use: 'ใส่ตัวเลขนี้',
      empty: 'ยังไม่มีงานที่เปิดรับในชุดข้อมูลนี้',
      openLink: 'เปิดหน้าประกาศ',
      foot: 'เกณฑ์ 50 / 20 / 8 ดอลลาร์ต่อชั่วโมง เป็นความเห็น ไม่ใช่ข้อเท็จจริง ' +
        'ถ้าค่าแรงจริงของคุณสูงกว่านี้ ให้เลื่อนเกณฑ์ขึ้นตาม',
      hoursUnit: 'ชม.',
      subsUnit: 'คน',
      verdict: { great: 'คุ้มมาก', good: 'คุ้ม', marginal: 'ก้ำกึ่ง', skip: 'ข้ามไปเถอะ' },
      notes: {
        'crowded-field': 'สนามแออัด',
        'thin-field': 'คู่แข่งน้อย',
        'long-tail-effort': 'งานกินเวลายาว',
        'podium-heavy': 'ที่ 1 กินเรียบ',
        'flat-podium': 'รางวัลกระจาย',
        'deep-podium': 'จ่ายหลายอันดับ',
        'field-smaller-than-podium': 'คนส่งน้อยกว่ารางวัล',
        'assumed-winner-take-all': 'คิดแบบผู้ชนะคนเดียว',
        'edge-clamped': 'ปรับค่าฝีมือเข้ากรอบ 0.5-5',
        'no-prize': 'ไม่มีเงินรางวัล',
        'quick-win': 'งานสั้นแต่คุ้ม',
        'hours-floored': 'คิดขั้นต่ำ 15 นาที',
        'over-your-budget': 'เกินเวลาที่คุณมี'
      },
      splitLabels: {
        winner: 'ผู้ชนะรับทั้งหมด',
        s601515: '60 / 25 / 15',
        s503020: '50 / 30 / 20',
        top5: 'จ่าย 5 อันดับ'
      }
    },
    en: {
      title: 'Expected value calculator',
      sub: 'Before you spend the hours, price them. Every number here is yours to change.',
      prize: 'Total prize pool (USD)',
      prizeHint: 'The whole board, not just first place',
      subs: 'Competing submissions',
      subsHint: 'Read the Submissions count on the listing. 0 or 1 means you are effectively alone.',
      hours: 'Hours you will spend',
      hoursHint: 'Count reading the brief, revisions and submitting — not just the fun part',
      edge: 'Your edge over a random entrant',
      edgeHint: '1.0 = average. 2.0 = twice as likely to place. Be honest with yourself.',
      split: 'Prize split',
      splitHint: 'Top-heavy splits are a lottery. Deeper podiums pay a steadier expected value.',
      headline: 'You are effectively bidding your time at ',
      winProb: 'Chance of 1st',
      podiumProb: 'Chance of placing',
      expected: 'Expected value',
      perHour: 'Expected $/hour',
      best: 'Best value open listings right now',
      bestSub: 'Open listings, ranked by expected dollars per hour',
      use: 'Use these numbers',
      empty: 'No open listings in this dataset yet',
      openLink: 'Open the listing',
      foot: 'The 50 / 20 / 8 $-per-hour thresholds are an opinion, not a fact. ' +
        'If your real hourly rate is higher, move the whole scale up with it.',
      hoursUnit: 'h',
      subsUnit: 'entries',
      verdict: { great: 'Great', good: 'Good', marginal: 'Marginal', skip: 'Skip' },
      notes: {
        'crowded-field': 'Crowded field',
        'thin-field': 'Thin field',
        'long-tail-effort': 'Long effort',
        'podium-heavy': 'Winner takes most',
        'flat-podium': 'Flat podium',
        'deep-podium': 'Deep podium',
        'field-smaller-than-podium': 'Fewer entries than paid ranks',
        'assumed-winner-take-all': 'Modelled as a single winner',
        'edge-clamped': 'Edge clamped to 0.5-5',
        'no-prize': 'No prize pool',
        'quick-win': 'Quick win',
        'hours-floored': 'Billed at a 15-minute floor',
        'over-your-budget': 'Over your time budget'
      },
      splitLabels: {
        winner: 'Winner takes all',
        s601515: '60 / 25 / 15',
        s503020: '50 / 30 / 20',
        top5: 'Top 5 paid'
      }
    }
  };

  var NOTE_TONE = {
    'thin-field': 'good',
    'quick-win': 'good',
    'flat-podium': 'good',
    'deep-podium': 'good',
    'field-smaller-than-podium': 'good',
    'crowded-field': 'warn',
    'long-tail-effort': 'warn',
    'podium-heavy': 'warn',
    'no-prize': 'warn',
    'over-your-budget': 'warn',
    'assumed-winner-take-all': 'info',
    'edge-clamped': 'info',
    'hours-floored': 'info'
  };

  var SPLIT_PRESETS = [
    { id: 'winner', key: 'winner', split: [1] },
    { id: 's601515', key: 's601515', split: [0.6, 0.25, 0.15] },
    { id: 's503020', key: 's503020', split: [0.5, 0.3, 0.2] },
    { id: 'top5', key: 'top5', split: [0.4, 0.25, 0.15, 0.12, 0.08] }
  ];

  function copyFor(lang) {
    return COPY[lang] || COPY.th;
  }

  /* ------------------------------------------------------------------ *
   * CONTRACT C: mount                                                   *
   * ------------------------------------------------------------------ */

  function getDoc() {
    if (global && global.document) return global.document;
    if (typeof document !== 'undefined' && document) return document;
    return null;
  }

  var activeTeardown = null;   // so a second mount() never leaves a stale listener behind

  function mount(rootEl, opts) {
    if (!rootEl || typeof rootEl !== 'object') return;
    var doc = getDoc();
    if (!doc || typeof doc.createElement !== 'function') return;
    if (typeof rootEl.appendChild !== 'function') return;

    if (activeTeardown) { activeTeardown(); activeTeardown = null; }

    var options = (opts && typeof opts === 'object') ? opts : {};
    var data = (options.data && typeof options.data === 'object') ? options.data : {};
    var listings = Object.prototype.toString.call(data.listings) === '[object Array]'
      ? data.listings : [];
    var lang = (options.lang === 'en' || options.lang === 'th') ? options.lang : 'th';

    var state = {
      prizeUsd: 1000,
      submissions: 60,
      hours: 8,
      skillEdge: 1.5,
      splitId: 's601515'
    };

    var el = function (tag, className, text) {
      var node = doc.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined && text !== null) node.textContent = String(text);
      return node;
    };

    function currentSplit() {
      var i;
      for (i = 0; i < SPLIT_PRESETS.length; i += 1) {
        if (SPLIT_PRESETS[i].id === state.splitId) return SPLIT_PRESETS[i].split;
      }
      return SPLIT_PRESETS[1].split;
    }

    /* ---- build the panel once; paint() only updates text ---- */

    while (rootEl.firstChild) rootEl.removeChild(rootEl.firstChild);

    var panel = el('div', 'calc-panel');
    var head = el('div', 'calc-head');
    var titleNode = el('h3', 'calc-title');
    var subNode = el('p', 'calc-sub');
    head.appendChild(titleNode);
    head.appendChild(subNode);
    panel.appendChild(head);

    var grid = el('div', 'calc-grid');
    var controls = el('div', 'calc-controls');
    var results = el('div', 'calc-results');
    grid.appendChild(controls);
    grid.appendChild(results);
    panel.appendChild(grid);

    var uid = 'calc-' + Math.random().toString(36).slice(2, 8);
    var fields = {};

    /**
     * One control = label + live value + number box + slider + hint.
     * The number box and the slider write the same state key and mirror each other.
     */
    function buildField(key, inputAttrs, rangeAttrs) {
      var wrap = el('div', 'calc-field');
      var label = el('label', 'calc-label');
      var labelText = el('span', 'calc-label-text');
      var valueText = el('span', 'calc-value');
      var inputId = uid + '-' + key;
      label.setAttribute('for', inputId);
      label.appendChild(labelText);
      label.appendChild(valueText);

      var inputs = el('div', 'calc-inputs');
      var number = el('input', 'calc-input');
      number.type = 'number';
      number.id = inputId;
      var range = el('input', 'calc-range');
      range.type = 'range';
      range.setAttribute('aria-hidden', 'true');
      range.tabIndex = -1;

      var a;
      for (a in inputAttrs) {
        if (Object.prototype.hasOwnProperty.call(inputAttrs, a)) number.setAttribute(a, inputAttrs[a]);
      }
      for (a in rangeAttrs) {
        if (Object.prototype.hasOwnProperty.call(rangeAttrs, a)) range.setAttribute(a, rangeAttrs[a]);
      }

      inputs.appendChild(number);
      inputs.appendChild(range);

      var hint = el('p', 'calc-hint');
      wrap.appendChild(label);
      wrap.appendChild(inputs);
      wrap.appendChild(hint);
      controls.appendChild(wrap);

      fields[key] = { labelText: labelText, value: valueText, number: number, range: range, hint: hint };

      /* Mirror the two controls, but never rewrite the one being typed into — doing so
         would eat a half-finished entry like "" or "1." while the user is still typing. */
      function commit(raw, source) {
        state[key] = Math.max(0, num(raw, state[key]));
        if (source !== number) number.value = String(state[key]);
        if (source !== range) range.value = String(state[key]);
        paint();
      }
      number.addEventListener('input', function () { commit(number.value, number); });
      range.addEventListener('input', function () { commit(range.value, range); });
      return fields[key];
    }

    /** Push state into both controls. Used for the initial paint and the "use these numbers" button. */
    function syncField(key) {
      var f = fields[key];
      if (!f) return;
      f.number.value = String(state[key]);
      f.range.value = String(state[key]);
    }

    buildField('prizeUsd', { min: '0', step: '50' }, { min: '0', max: '25000', step: '50' });
    buildField('submissions', { min: '0', step: '1' }, { min: '0', max: '400', step: '1' });
    buildField('hours', { min: '0', step: '0.5' }, { min: '0.5', max: '80', step: '0.5' });
    buildField('skillEdge', { min: '0.5', max: '5', step: '0.1' }, { min: '0.5', max: '5', step: '0.1' });

    /* prize split is a preset picker, not a slider */
    var splitWrap = el('div', 'calc-field');
    var splitLabel = el('label', 'calc-label');
    var splitLabelText = el('span', 'calc-label-text');
    var splitId = uid + '-split';
    splitLabel.setAttribute('for', splitId);
    splitLabel.appendChild(splitLabelText);
    var splitSelect = el('select', 'calc-select');
    splitSelect.id = splitId;
    var splitOptions = [];
    (function () {
      var i, optNode;
      for (i = 0; i < SPLIT_PRESETS.length; i += 1) {
        optNode = doc.createElement('option');
        optNode.value = SPLIT_PRESETS[i].id;
        splitSelect.appendChild(optNode);
        splitOptions.push(optNode);
      }
    }());
    splitSelect.value = state.splitId;
    var splitHint = el('p', 'calc-hint');
    splitWrap.appendChild(splitLabel);
    splitWrap.appendChild(splitSelect);
    splitWrap.appendChild(splitHint);
    controls.appendChild(splitWrap);
    splitSelect.addEventListener('change', function () {
      state.splitId = splitSelect.value;
      paint();
    });

    /* ---- results ---- */

    var verdictNode = el('span', 'calc-verdict');
    var headlineNode = el('p', 'calc-headline');
    results.appendChild(verdictNode);
    results.appendChild(headlineNode);

    var metrics = el('div', 'calc-metrics');
    var metricNodes = {};
    (function () {
      var keys = ['winProb', 'podiumProb', 'expected', 'perHour'];
      var i, tile, label, value;
      for (i = 0; i < keys.length; i += 1) {
        tile = el('div', 'calc-metric');
        label = el('span', 'calc-metric-label');
        value = el('span', 'calc-metric-value');
        tile.appendChild(label);
        tile.appendChild(value);
        metrics.appendChild(tile);
        metricNodes[keys[i]] = { label: label, value: value };
      }
    }());
    results.appendChild(metrics);

    var notesNode = el('div', 'calc-notes');
    results.appendChild(notesNode);

    /* ---- best value list ---- */

    var best = el('section', 'calc-best');
    var bestTitle = el('h4', 'calc-best-title');
    var bestSub = el('p', 'calc-sub');
    var bestList = el('ol', 'calc-best-list');
    best.appendChild(bestTitle);
    best.appendChild(bestSub);
    best.appendChild(bestList);
    panel.appendChild(best);

    var footNode = el('p', 'calc-foot');
    panel.appendChild(footNode);

    rootEl.appendChild(panel);

    /* ---- painting ---- */

    var lastBestKey = '';

    function applyLabels() {
      var t = copyFor(lang);
      titleNode.textContent = t.title;
      subNode.textContent = t.sub;
      fields.prizeUsd.labelText.textContent = t.prize;
      fields.prizeUsd.hint.textContent = t.prizeHint;
      fields.submissions.labelText.textContent = t.subs;
      fields.submissions.hint.textContent = t.subsHint;
      fields.hours.labelText.textContent = t.hours;
      fields.hours.hint.textContent = t.hoursHint;
      fields.skillEdge.labelText.textContent = t.edge;
      fields.skillEdge.hint.textContent = t.edgeHint;
      splitLabelText.textContent = t.split;
      splitHint.textContent = t.splitHint;
      var i;
      for (i = 0; i < splitOptions.length; i += 1) {
        splitOptions[i].textContent = t.splitLabels[SPLIT_PRESETS[i].key] || SPLIT_PRESETS[i].id;
      }
      metricNodes.winProb.label.textContent = t.winProb;
      metricNodes.podiumProb.label.textContent = t.podiumProb;
      metricNodes.expected.label.textContent = t.expected;
      metricNodes.perHour.label.textContent = t.perHour;
      bestTitle.textContent = t.best;
      bestSub.textContent = t.bestSub;
      footNode.textContent = t.foot;
    }

    function renderNotes(noteKeys) {
      var t = copyFor(lang);
      while (notesNode.firstChild) notesNode.removeChild(notesNode.firstChild);
      var i, key, chip;
      for (i = 0; i < noteKeys.length; i += 1) {
        key = noteKeys[i];
        if (!t.notes[key]) continue;
        chip = el('span', 'calc-note calc-note-' + (NOTE_TONE[key] || 'info'), t.notes[key]);
        notesNode.appendChild(chip);
      }
    }

    function renderBest(edge) {
      var t = copyFor(lang);
      var key = lang + '|' + edge;
      if (key === lastBestKey) return;
      lastBestKey = key;

      while (bestList.firstChild) bestList.removeChild(bestList.firstChild);
      var ranked = rankListings(listings, {
        skills: [],
        skillEdge: edge,
        hoursAvailable: state.hours
      }).slice(0, 5);

      if (!ranked.length) {
        bestList.appendChild(el('li', 'calc-empty', t.empty));
        return;
      }

      var i;
      for (i = 0; i < ranked.length; i += 1) {
        (function (row) {
          var listing = row.listing;
          var item = el('li', 'calc-best-item');

          var link = el('a', 'calc-best-link', listing.title || listing.slug || listing.id || '—');
          link.href = listing.url || '#';
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.title = t.openLink;

          var pool = (listing.reward && num(listing.reward.usd, 0)) || 0;
          var meta = el('span', 'calc-best-meta',
            fmtUsd(pool) + ' · ' + fmtInt(listing.submissions) + ' ' + t.subsUnit +
            ' · ' + fmtHours(listing.estimatedHours) + ' ' + t.hoursUnit);

          var rate = el('span', 'calc-best-rate', fmtRate(row.ev.expectedPerHour) + '/' + t.hoursUnit);

          var use = el('button', 'calc-best-use', t.use);
          use.type = 'button';
          use.addEventListener('click', function () {
            state.prizeUsd = Math.max(0, pool);
            state.submissions = Math.max(0, Math.floor(num(listing.submissions, 0)));
            state.hours = Math.max(0, num(listing.estimatedHours, 1));
            syncField('prizeUsd');
            syncField('submissions');
            syncField('hours');
            paint();
          });

          item.appendChild(link);
          item.appendChild(meta);
          item.appendChild(rate);
          item.appendChild(use);
          bestList.appendChild(item);
        }(ranked[i]));
      }
    }

    function paint() {
      var t = copyFor(lang);
      var edge = clamp(num(state.skillEdge, 1), EDGE_MIN, EDGE_MAX);

      /* Pass the RAW edge so an out-of-range entry surfaces the 'edge-clamped' note to the
         user, rather than being silently corrected behind their back. */
      var ev = computeEV({
        prizeUsd: state.prizeUsd,
        submissions: state.submissions,
        hours: state.hours,
        skillEdge: state.skillEdge,
        podiumSplit: currentSplit()
      });

      fields.prizeUsd.value.textContent = fmtUsd(state.prizeUsd);
      fields.submissions.value.textContent = fmtInt(state.submissions) + ' ' + t.subsUnit;
      fields.hours.value.textContent = fmtHours(state.hours) + ' ' + t.hoursUnit;
      fields.skillEdge.value.textContent = intlNumber(edge, 1, 1) + '×';

      verdictNode.textContent = t.verdict[ev.verdict];
      verdictNode.className = 'calc-verdict calc-verdict-' + ev.verdict;
      headlineNode.textContent = t.headline + fmtRate(ev.breakEvenRate) + '/' + t.hoursUnit;

      metricNodes.winProb.value.textContent = fmtPct(ev.winProb);
      metricNodes.podiumProb.value.textContent = fmtPct(ev.podiumProb);
      metricNodes.expected.value.textContent = fmtUsd(ev.expectedUsd);
      metricNodes.perHour.value.textContent = fmtRate(ev.expectedPerHour);

      renderNotes(ev.notes);
      renderBest(edge);
    }

    function onLangChange(event) {
      var next = event && event.detail && event.detail.lang;
      if (next !== 'th' && next !== 'en') return;
      if (next === lang) return;
      lang = next;
      lastBestKey = '';
      applyLabels();
      paint();
    }

    if (typeof doc.addEventListener === 'function') {
      doc.addEventListener('earn:langchange', onLangChange);
      activeTeardown = function () {
        doc.removeEventListener('earn:langchange', onLangChange);
      };
    }

    syncField('prizeUsd');
    syncField('submissions');
    syncField('hours');
    syncField('skillEdge');
    applyLabels();
    paint();
  }

  global.EarnCalculator = {
    computeEV: computeEV,
    rankListings: rankListings,
    mount: mount
  };
}(typeof window !== 'undefined' ? window
  : (typeof globalThis !== 'undefined' ? globalThis : this)));
