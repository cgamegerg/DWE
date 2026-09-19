/*
 * data.js — seed dataset + optional live refresh for the Superteam Earn playbook app.
 *
 * Loads as a classic <script> (no modules, no imports, works over file://) and attaches:
 *   window.EARN_DATA  — generatedAt, stats, skills, regions, listings[26], meta
 *   window.EarnLive   — ENDPOINT, fetchListings(opts), normalise(raw), audit(listings)
 *
 * PROVENANCE
 *   Captured 2026-09-19 from rendered Superteam Earn pages (search-result extracts).
 *   No structured/public API was reachable, so nothing here came from a JSON endpoint.
 *   EVERY row carries a real slug and resolves to a real Superteam Earn page. An earlier
 *   revision also shipped nine invented listings (l25-l30, l32-l34) whose slugs only LOOKED
 *   real and whose url pointed at /earn/all; they were attributed to real organisations
 *   (Jupiter, Superteam Thailand/India/Nigeria/Australia/Canada/Vietnam) with invented prize
 *   pools and submission counts. They have been deleted. Do not reintroduce a modelled row:
 *   this dataset is rendered as an opportunity board, so a row a reader cannot open and check
 *   is a false claim about a named organisation, however it is captioned.
 *   >>> Consumers must READ listing.url. Never rebuild a URL from listing.slug. <<<
 *
 * ACCURACY — READ THIS BEFORE TRUSTING A NUMBER
 *   No row was ever checked against Superteam Earn's own sponsor-verification state, so the
 *   dataset does NOT carry a `sponsor.verified` flag and the UI must not render a trust tick.
 *   `sponsor.handle` is present only where the social handle was actually seen on the source
 *   page; it is absent, not guessed, everywhere else.
 *   Listing fields go stale fast — submissions climb daily and a status flips to
 *   'in-review'/'completed' the moment a deadline passes. meta.sourceNotes carries the
 *   qualifications a reader needs and app.js RENDERS IT; do not let it fall out of the page.
 *
 * CURRENCY
 *   Every row is denominated in USDC or USDG (both dollar stablecoins), so
 *   reward.usd === reward.amount everywhere and no SOL price assumption is baked in.
 *
 * SUBMISSION COUNTS
 *   Counts come from the "Submissions<N>" string on the rendered listing page. The spread is
 *   the whole point of the app: advanced development draws single digits while beginner
 *   content draws hundreds (compare l13: 20,000 USDC / 57 entries against
 *   l14: 1,500 USDC / 353 entries). The tags 'thin-competition', 'crowded', 'low-effort' and
 *   'good-entry-point' encode that signal and are safe to filter on — but a tag is only as
 *   fresh as the count it was derived from.
 *
 * CORRECTIONS APPLIED TO THE RESEARCHED SEED (every deviation is listed here)
 *   1. Grants (l17, l31) had prizes [7100] / [10000]. The contract says grants carry an empty
 *      podium, so prizes is now [] for both. reward.amount is unchanged.
 *   2. stats.sourceNotes (a long string) was sitting inside the numeric `stats` object, where a
 *      naive Object.entries(stats) stat-card render would print it as a broken tile. Moved
 *      verbatim to EARN_DATA.meta.sourceNotes; `stats` now holds exactly the four numbers.
 *   3. regions lists only regions a surviving listing actually uses — anything else is a filter
 *      option guaranteed to return zero rows.
 *   4. l17's title carried a stale parenthetical, "(Applications by March 7th)", which
 *      contradicted its own deadline field (2026-11-14). The parenthetical is dropped from the
 *      display title; slug and url are untouched and still resolve to the real page.
 *   5. Re-checked against the live listing pages, these rows were WRONG and are now corrected:
 *        l02 castledao-content-challenge — sponsor is Superteam Ireland (/earn/s/superteamie),
 *            not "CastleDAO"; the listing has expired, so status is 'completed', not 'open'.
 *        l13 layerzero-solana-breakout-track — pool is 20,000 USDC (10,000/7,000/2,500 plus
 *            100 x5), 57 submissions, Winners Announced. Was 10,000 / [5000,3000,2000] / 19 / open.
 *        l14 post-why-flint-beats-building-your-own-prop-amm — pool is 1,500 USDC
 *            (750/500/250), 353 submissions, Submissions in Review. Was 500 / [250,150,100] /
 *            214 / open. Flint's handle is @flint_trade_, not @flint.
 *        l16 show-the-world-solara-content-seeker-dapp-reviews-1 — sponsor is Solara Lotto
 *            (/earn/s/solara-lotto), not "Solara".
 *        l20 steve-agent-arena-... — sponsor is OOBE Protocol (/earn/s/oobeprotocol). "Steve"
 *            is the product in the title, not the sponsor.
 *        l21 summitvideos — sponsored by Goatfish, not Superteam Vietnam.
 *        l23 trade-tweet-and-earn-1 — sponsor is Spectrumfi, pool 500 USDC (250/150/100), and
 *            it has 9 submissions. Was WOOFi / 2,000 USDC / 187, i.e. the app was calling a
 *            wide-open bounty 'crowded' and telling the reader the opposite of the truth.
 *      The rows not listed here were not re-checked and may be stale in the same way.
 *
 * A live refresh may introduce a region the seed filter has never seen — EarnLive.audit() checks
 * Listing shape only, so a consumer merging live rows should union listing.region into its filter.
 *
 * IF YOU GO LIVE
 *   The highest-value fields to refresh are `submissions`, `status` and `deadline` — the premise
 *   of the app rests on them and all three decay. On a rendered listing page submissions appear
 *   as a bare "Submissions<N>" string and deadlines only as a relative countdown ("Due in 4d"),
 *   so an absolute deadline must be computed at scrape time. Closed listings show
 *   "Winners Announced"; ones past deadline but undecided show "Submissions in Review".
 */
(function (global) {
  'use strict';

  var GENERATED_AT = '2026-09-19';

  var TYPES = ['bounty', 'project', 'grant'];
  var SKILL_IDS = ['content', 'design', 'development', 'growth', 'community', 'other'];
  var TOKENS = ['USDC', 'USDG', 'SOL'];
  var STATUSES = ['open', 'in-review', 'completed'];
  var DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
  var ISO_DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

  /* ---------------------------------------------------------------- helpers */

  function toText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function toNumber(value, fallback) {
    var n = NaN;
    if (typeof value === 'number') {
      n = value;
    } else if (typeof value === 'string') {
      n = parseFloat(value.replace(/[^0-9eE.+-]/g, ''));
    }
    return isFinite(n) ? n : fallback;
  }

  function isIsoDate(value) {
    if (!ISO_DATE.test(toText(value))) { return false; }
    var parsed = new Date(value + 'T00:00:00Z');
    return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function sum(numbers) {
    var total = 0;
    for (var i = 0; i < numbers.length; i += 1) { total += numbers[i]; }
    return total;
  }

  /* ------------------------------------------------------------- seed data */

  var SKILLS = [
    { id: 'development', en: 'Development', th: 'งานพัฒนา / เขียนโค้ด', emoji: '💻' },
    { id: 'design', en: 'Design', th: 'งานออกแบบ', emoji: '🎨' },
    { id: 'content', en: 'Content', th: 'คอนเทนต์', emoji: '✍️' },
    { id: 'growth', en: 'Growth', th: 'โกรท / การตลาด', emoji: '📈' },
    { id: 'community', en: 'Community', th: 'คอมมูนิตี้', emoji: '🤝' },
    { id: 'other', en: 'Other', th: 'อื่น ๆ', emoji: '🧩' }
  ];

  /* Only regions that at least one listing uses — an empty filter option reads as a broken app. */
  var REGIONS = [
    'Global', 'Ireland', 'Germany', 'Turkey', 'Canada', 'Vietnam'
  ];

  var LISTINGS = [
    {
      id: 'l01',
      title: 'Adrena x Autonom Trading Competition: Design & Development',
      slug: 'adrena-x-autonom-trading-competition-design-and-development-1',
      url: 'https://superteam.fun/earn/listing/adrena-x-autonom-trading-competition-design-and-development-1',
      sponsor: { name: 'Superteam Ireland', handle: '@superteamie' },
      type: 'bounty',
      skill: 'development',
      reward: { amount: 5000, token: 'USDC', usd: 5000 },
      prizes: [2500, 1500, 1000],
      submissions: 9,
      deadline: '2026-10-03',
      status: 'open',
      region: 'Ireland',
      difficulty: 'advanced',
      estimatedHours: 40,
      tags: ['pro', 'trading', 'defi', 'frontend', 'thin-competition']
    },
    {
      id: 'l02',
      title: 'CastleDAO Content Challenge',
      slug: 'castledao-content-challenge',
      url: 'https://superteam.fun/earn/listing/castledao-content-challenge',
      sponsor: { name: 'Superteam Ireland', handle: '@superteamIE' },
      type: 'bounty',
      skill: 'content',
      reward: { amount: 1000, token: 'USDC', usd: 1000 },
      prizes: [500, 300, 200],
      submissions: 152,
      deadline: '2026-09-26',
      status: 'completed',
      region: 'Global',
      difficulty: 'beginner',
      estimatedHours: 5,
      tags: ['writing', 'twitter-thread', 'gaming', 'crowded']
    },
    {
      id: 'l03',
      title: 'Create a Short Video Explainer for Hisa — $5,000 Up For Grabs',
      slug: 'create-a-short-video-explainer-for-hisa-dollar5000-up-for-grabs',
      url: 'https://superteam.fun/earn/listing/create-a-short-video-explainer-for-hisa-dollar5000-up-for-grabs',
      sponsor: { name: 'Hisa', handle: '@HisaFinance' },
      type: 'bounty',
      skill: 'content',
      reward: { amount: 5000, token: 'USDC', usd: 5000 },
      prizes: [2500, 1250, 750, 500],
      submissions: 94,
      deadline: '2026-10-10',
      status: 'open',
      region: 'Global',
      difficulty: 'intermediate',
      estimatedHours: 14,
      tags: ['video', 'explainer', 'editing', 'rwa']
    },
    {
      id: 'l04',
      title: 'Create an App on Cookie Chain',
      slug: 'create-an-app-on-cookie-chain-app',
      url: 'https://superteam.fun/earn/listing/create-an-app-on-cookie-chain-app',
      sponsor: { name: 'Cookie Chain', handle: '@cookiedotfun' },
      type: 'bounty',
      skill: 'development',
      reward: { amount: 2500, token: 'USDC', usd: 2500 },
      prizes: [1500, 700, 300],
      submissions: 12,
      deadline: '2026-10-17',
      status: 'open',
      region: 'Global',
      difficulty: 'advanced',
      estimatedHours: 35,
      tags: ['dapp', 'typescript', 'ai-agents', 'thin-competition']
    },
    {
      id: 'l05',
      title: 'Create Content for Breakpoint 2026',
      slug: 'create-content-for-breakpoint-2026',
      url: 'https://superteam.fun/earn/listing/create-content-for-breakpoint-2026',
      sponsor: { name: 'Superteam', handle: '@SuperteamDAO' },
      type: 'bounty',
      skill: 'content',
      reward: { amount: 8000, token: 'USDG', usd: 8000 },
      prizes: [800, 800, 800, 800, 800, 800, 800, 800, 800, 800],
      submissions: 312,
      deadline: '2026-09-05',
      status: 'completed',
      region: 'Global',
      difficulty: 'beginner',
      estimatedHours: 6,
      tags: ['event', 'breakpoint', 'video', 'many-winners', 'crowded']
    },
    {
      id: 'l06',
      title: 'Create Content on Top Projects',
      slug: 'create-content-on-top-projects',
      url: 'https://superteam.fun/earn/listing/create-content-on-top-projects',
      sponsor: { name: 'Superteam Germany', handle: '@SuperteamDE' },
      type: 'bounty',
      skill: 'content',
      reward: { amount: 4500, token: 'USDG', usd: 4500 },
      prizes: [1500, 1000, 750, 500, 400, 350],
      submissions: 33,
      deadline: '2026-10-31',
      status: 'open',
      region: 'Germany',
      difficulty: 'intermediate',
      estimatedHours: 12,
      tags: ['pro', 'research', 'writing', 'many-winners']
    },
    {
      id: 'l07',
      title: "Design a T-Shirt for Superteam Türkiye Inspired by Colosseum's Crypto World's Fair",
      slug: 'design-a-t-shirt-for-superteam-turkiye-inspired-by-colosseumcrypto-worlds-fair',
      url: 'https://superteam.fun/earn/listing/design-a-t-shirt-for-superteam-turkiye-inspired-by-colosseumcrypto-worlds-fair',
      sponsor: { name: 'Superteam Turkey', handle: '@superteamtr' },
      type: 'bounty',
      skill: 'design',
      reward: { amount: 750, token: 'USDC', usd: 750 },
      prizes: [400, 250, 100],
      submissions: 64,
      deadline: '2026-09-22',
      status: 'open',
      region: 'Turkey',
      difficulty: 'beginner',
      estimatedHours: 6,
      tags: ['merch', 'illustration', 'colosseum', 'closing-soon']
    },
    {
      id: 'l08',
      title: 'Design the Superteam Hall of Fame',
      slug: 'design-superteam-hall-of-fame',
      url: 'https://superteam.fun/earn/listing/design-superteam-hall-of-fame',
      sponsor: { name: 'Superteam', handle: '@SuperteamDAO' },
      type: 'project',
      skill: 'design',
      reward: { amount: 1000, token: 'USDC', usd: 1000 },
      prizes: [1000],
      submissions: 28,
      deadline: '2026-09-29',
      status: 'open',
      region: 'Global',
      difficulty: 'intermediate',
      estimatedHours: 20,
      tags: ['ui', 'web-design', 'figma', 'one-winner']
    },
    {
      id: 'l09',
      title: 'Develop an Analytics Platform for Xandeum pNodes',
      slug: 'develop-analytics-platform-for-xandeum-pnodes',
      url: 'https://superteam.fun/earn/listing/develop-analytics-platform-for-xandeum-pnodes',
      sponsor: { name: 'Xandeum', handle: '@XandeumNetwork' },
      type: 'bounty',
      skill: 'development',
      reward: { amount: 2500, token: 'USDC', usd: 2500 },
      prizes: [1500, 700, 300],
      submissions: 7,
      deadline: '2026-10-17',
      status: 'open',
      region: 'Global',
      difficulty: 'advanced',
      estimatedHours: 45,
      tags: ['infra', 'dashboard', 'storage', 'rust', 'thin-competition']
    },
    {
      id: 'l10',
      title: '$1,000 USDC Manic Bug Bounty',
      slug: 'dollar1000-usdc-manic-bug-bounty',
      url: 'https://superteam.fun/earn/listing/dollar1000-usdc-manic-bug-bounty',
      sponsor: { name: 'Manic', handle: '@manic' },
      type: 'bounty',
      skill: 'development',
      reward: { amount: 1000, token: 'USDC', usd: 1000 },
      prizes: [500, 300, 200],
      submissions: 14,
      deadline: '2026-09-08',
      status: 'completed',
      region: 'Global',
      difficulty: 'advanced',
      estimatedHours: 10,
      tags: ['qa', 'bug-bounty', 'security', 'thin-competition']
    },
    {
      id: 'l11',
      title: 'Ideathon: Submit Innovative Ideas for the Hackathon',
      slug: 'ideathon-submit-innovative-ideas-for-the-hackathon',
      url: 'https://superteam.fun/earn/listing/ideathon-submit-innovative-ideas-for-the-hackathon',
      sponsor: { name: 'Superteam', handle: '@SuperteamDAO' },
      type: 'bounty',
      skill: 'other',
      reward: { amount: 2000, token: 'USDG', usd: 2000 },
      prizes: [750, 550, 400, 300],
      submissions: 178,
      deadline: '2026-09-24',
      status: 'open',
      region: 'Global',
      difficulty: 'beginner',
      estimatedHours: 4,
      tags: ['ideation', 'hackathon', 'writing', 'crowded', 'low-effort']
    },
    {
      id: 'l12',
      title: 'Kriptok League: Trading Experience Bounty',
      slug: 'kriptok-league-trading-experience-bounty',
      url: 'https://superteam.fun/earn/listing/kriptok-league-trading-experience-bounty',
      sponsor: { name: 'Kriptok', handle: '@kriptok' },
      type: 'bounty',
      skill: 'growth',
      reward: { amount: 2000, token: 'USDC', usd: 2000 },
      prizes: [1000, 600, 400],
      submissions: 58,
      deadline: '2026-10-03',
      status: 'open',
      region: 'Turkey',
      difficulty: 'intermediate',
      estimatedHours: 10,
      tags: ['trading', 'campaign', 'social', 'community']
    },
    {
      id: 'l13',
      title: 'LayerZero Solana Breakout Track',
      slug: 'layerzero-solana-breakout-track',
      url: 'https://superteam.fun/earn/listing/layerzero-solana-breakout-track',
      sponsor: { name: 'LayerZero', handle: '@LayerZero_Core' },
      type: 'bounty',
      skill: 'development',
      reward: { amount: 20000, token: 'USDC', usd: 20000 },
      prizes: [10000, 7000, 2500, 100, 100, 100, 100, 100],
      submissions: 57,
      deadline: '2026-11-14',
      status: 'completed',
      region: 'Global',
      difficulty: 'advanced',
      estimatedHours: 60,
      tags: ['hackathon-track', 'interop', 'rust', 'anchor', 'big-prize']
    },
    {
      id: 'l14',
      title: 'Post: Why Flint Beats Building Your Own Prop AMM',
      slug: 'post-why-flint-beats-building-your-own-prop-amm',
      url: 'https://superteam.fun/earn/listing/post-why-flint-beats-building-your-own-prop-amm',
      sponsor: { name: 'Flint', handle: '@flint_trade_' },
      type: 'bounty',
      skill: 'content',
      reward: { amount: 1500, token: 'USDC', usd: 1500 },
      prizes: [750, 500, 250],
      submissions: 353,
      deadline: '2026-09-21',
      status: 'in-review',
      region: 'Global',
      difficulty: 'beginner',
      estimatedHours: 3,
      tags: ['twitter-thread', 'defi', 'amm', 'crowded', 'closing-soon', 'low-effort']
    },
    {
      id: 'l15',
      title: 'Road to Colosseum Hackathon: Build Your MVP',
      slug: 'road-to-colosseum-hackathon-build-your-mvp',
      url: 'https://superteam.fun/earn/listing/road-to-colosseum-hackathon-build-your-mvp',
      sponsor: { name: 'Superteam', handle: '@SuperteamDAO' },
      type: 'bounty',
      skill: 'development',
      reward: { amount: 7000, token: 'USDG', usd: 7000 },
      prizes: [3000, 2000, 1000, 700, 300],
      submissions: 23,
      deadline: '2026-10-31',
      status: 'open',
      region: 'Global',
      difficulty: 'advanced',
      estimatedHours: 60,
      tags: ['hackathon', 'mvp', 'colosseum', 'many-winners', 'thin-competition']
    },
    {
      id: 'l16',
      title: 'Show the World: Solara Content — Seeker dApp Reviews',
      slug: 'show-the-world-solara-content-seeker-dapp-reviews-1',
      url: 'https://superteam.fun/earn/listing/show-the-world-solara-content-seeker-dapp-reviews-1',
      sponsor: { name: 'Solara Lotto' },
      type: 'bounty',
      skill: 'content',
      reward: { amount: 1000, token: 'USDC', usd: 1000 },
      prizes: [400, 300, 200, 100],
      submissions: 166,
      deadline: '2026-09-26',
      status: 'open',
      region: 'Global',
      difficulty: 'beginner',
      estimatedHours: 4,
      tags: ['review', 'mobile', 'seeker', 'video', 'crowded']
    },
    {
      id: 'l17',
      title: 'Solana Audit Subsidy Program — Cohort VI',
      slug: 'solana-audit-subsidy-program-cohort-vi-applications-by-march-7th-1',
      url: 'https://superteam.fun/earn/listing/solana-audit-subsidy-program-cohort-vi-applications-by-march-7th-1',
      sponsor: { name: 'Areta', handle: '@areta' },
      type: 'grant',
      skill: 'development',
      reward: { amount: 7100, token: 'USDC', usd: 7100 },
      prizes: [],
      submissions: 9,
      deadline: '2026-11-14',
      status: 'open',
      region: 'Global',
      difficulty: 'advanced',
      estimatedHours: 20,
      tags: ['pro', 'grant', 'security', 'audit', 'kyc-required', 'thin-competition']
    },
    {
      id: 'l18',
      title: 'Solana Socials 101',
      slug: 'solana-socials-101',
      url: 'https://superteam.fun/earn/listing/solana-socials-101',
      sponsor: { name: 'Superteam', handle: '@SuperteamEarn' },
      type: 'bounty',
      skill: 'growth',
      reward: { amount: 4000, token: 'USDC', usd: 4000 },
      prizes: [2000, 1000, 600, 400],
      submissions: 20,
      deadline: '2026-10-10',
      status: 'open',
      region: 'Global',
      difficulty: 'intermediate',
      estimatedHours: 16,
      tags: ['pro', 'playbook', 'social-media', 'strategy', 'thin-competition']
    },
    {
      id: 'l19',
      title: 'Solana Summit Canada Creator Challenge (Part 1)',
      slug: 'solana-summit-canada-creator-challenge-part-1',
      url: 'https://superteam.fun/earn/listing/solana-summit-canada-creator-challenge-part-1',
      sponsor: { name: 'Superteam Canada', handle: '@SuperteamCAN' },
      type: 'bounty',
      skill: 'content',
      reward: { amount: 2000, token: 'USDG', usd: 2000 },
      prizes: [1000, 600, 400],
      submissions: 128,
      deadline: '2026-09-29',
      status: 'open',
      region: 'Canada',
      difficulty: 'beginner',
      estimatedHours: 7,
      tags: ['event', 'creator', 'video', 'summit', 'crowded']
    },
    {
      id: 'l20',
      title: 'Steve Agent Arena: Launch Your Agent and Win 500 USDC',
      slug: 'steve-agent-arena-launch-your-agent-and-win-500-usdc',
      url: 'https://superteam.fun/earn/listing/steve-agent-arena-launch-your-agent-and-win-500-usdc',
      sponsor: { name: 'OOBE Protocol' },
      type: 'bounty',
      skill: 'development',
      reward: { amount: 500, token: 'USDC', usd: 500 },
      prizes: [500],
      submissions: 16,
      deadline: '2026-09-24',
      status: 'open',
      region: 'Global',
      difficulty: 'intermediate',
      estimatedHours: 12,
      tags: ['ai-agents', 'one-winner', 'agent-eligible', 'thin-competition']
    },
    {
      id: 'l21',
      title: 'Summit Videos',
      slug: 'summitvideos',
      url: 'https://superteam.fun/earn/listing/summitvideos',
      sponsor: { name: 'Goatfish' },
      type: 'bounty',
      skill: 'content',
      reward: { amount: 1500, token: 'USDC', usd: 1500 },
      prizes: [700, 500, 300],
      submissions: 96,
      deadline: '2026-09-15',
      status: 'in-review',
      region: 'Vietnam',
      difficulty: 'beginner',
      estimatedHours: 8,
      tags: ['video', 'event', 'summit', 'editing', 'crowded']
    },
    {
      id: 'l22',
      title: 'Develop a Telegram Bot for Superteam Earn Notifications',
      slug: 'telegram-bot-for-earn',
      url: 'https://superteam.fun/earn/listing/telegram-bot-for-earn',
      sponsor: { name: 'Superteam Earn', handle: '@SuperteamEarn' },
      type: 'project',
      skill: 'development',
      reward: { amount: 2500, token: 'USDC', usd: 2500 },
      prizes: [2500],
      submissions: 13,
      deadline: '2026-10-03',
      status: 'open',
      region: 'Global',
      difficulty: 'advanced',
      estimatedHours: 32,
      tags: ['telegram', 'bot', 'api', 'typescript', 'one-winner', 'thin-competition']
    },
    {
      id: 'l23',
      title: 'Trade, Tweet & Earn',
      slug: 'trade-tweet-and-earn-1',
      url: 'https://superteam.fun/earn/listing/trade-tweet-and-earn-1',
      sponsor: { name: 'Spectrumfi' },
      type: 'bounty',
      skill: 'growth',
      reward: { amount: 500, token: 'USDC', usd: 500 },
      prizes: [250, 150, 100],
      submissions: 9,
      deadline: '2026-09-22',
      status: 'open',
      region: 'Global',
      difficulty: 'beginner',
      estimatedHours: 3,
      tags: ['trading', 'twitter', 'campaign', 'thin-competition', 'closing-soon', 'low-effort']
    },
    {
      id: 'l24',
      title: 'Video Recap of the Solana Ecosystem in 2025',
      slug: 'video-recap-of-the-solana-ecosystem-in-2025',
      url: 'https://superteam.fun/earn/listing/video-recap-of-the-solana-ecosystem-in-2025',
      sponsor: { name: 'Superteam', handle: '@SuperteamDAO' },
      type: 'bounty',
      skill: 'content',
      reward: { amount: 2500, token: 'USDC', usd: 2500 },
      prizes: [1250, 750, 500],
      submissions: 72,
      deadline: '2026-09-12',
      status: 'in-review',
      region: 'Global',
      difficulty: 'intermediate',
      estimatedHours: 18,
      tags: ['video', 'recap', 'editing', 'research']
    },
    {
      id: 'l31',
      title: 'Agentic Engineering Grant: Ideas → Prompt → Prod',
      slug: 'agentic-engineering-grants',
      url: 'https://superteam.fun/earn/grants/agentic-engineering/',
      sponsor: { name: 'Superteam', handle: '@SuperteamDAO' },
      type: 'grant',
      skill: 'development',
      reward: { amount: 10000, token: 'USDC', usd: 10000 },
      prizes: [],
      submissions: 46,
      deadline: '2026-11-14',
      status: 'open',
      region: 'Global',
      difficulty: 'advanced',
      estimatedHours: 60,
      tags: ['grant', 'ai-agents', 'kyc-required', '50-percent-upfront', 'no-deadline-race']
    },
    {
      id: 'l35',
      title: 'Beginner Developer Challenge: Automated Rent-Reclaim Bot for Kora Operators',
      slug: 'beginner-developer-challenge-automated-rent-reclaim-bot-for-kora-operators',
      url: 'https://superteam.fun/earn/listing/beginner-developer-challenge-automated-rent-reclaim-bot-for-kora-operators',
      sponsor: { name: 'Kora', handle: '@kora' },
      type: 'bounty',
      skill: 'development',
      reward: { amount: 1000, token: 'USDC', usd: 1000 },
      prizes: [500, 300, 200],
      submissions: 34,
      deadline: '2026-10-03',
      status: 'open',
      region: 'Global',
      difficulty: 'beginner',
      estimatedHours: 10,
      tags: ['beginner-friendly', 'rust', 'bot', 'onchain', 'good-entry-point']
    }
  ];

  var STATS = {
    totalPaidUsd: 15922040,
    listingsLive: LISTINGS.length,
    talent: 210000,
    sponsors: 2710
  };

  /*
   * sourceNotes is READER-FACING and bilingual: app.js renders it in the footer. Every number
   * the hero shows is qualified here, in the language the reader is reading. If you add a
   * statistic to the page, qualify it here in BOTH locales or do not show it.
   */
  var META = {
    generatedAt: GENERATED_AT,
    sourceNotes: {
      th: 'ที่มาของตัวเลข: ยอดจ่ายสะสม 15,922,040 ดอลลาร์ คือตัวเลข “Total Value Earned” ที่แสดงบน ' +
        'superteam.fun/earn/bounties เก็บเมื่อ 2026-09-19 · ตัวเลขผู้สร้าง 210,000+ และสปอนเซอร์ 2,710+ ' +
        'มาจากกล่องชวนเป็นสปอนเซอร์บน superteam.fun/earn — เป็นคำโฆษณาที่ Superteam ประกาศเอง ' +
        'ไม่มีใครตรวจสอบ และไม่ได้แปลว่ามีคนได้เงินเท่านั้น · ' +
        'จำนวนงานที่หน้านี้นับได้ เป็นจำนวนแถวในสแนปช็อตชุดนี้เท่านั้น ไม่ใช่จำนวนงานที่เปิดรับจริงบน Earn ' +
        'ซึ่งมีมากกว่านี้มาก · ' +
        'ข้อมูลรายงาน (จำนวนคนส่ง เงินรางวัล สถานะ) เก็บด้วยมือเมื่อ 2026-09-19 และเก่าลงทุกวัน ' +
        'กดเข้าไปดูหน้าประกาศจริงก่อนตัดสินใจลงแรงเสมอ · ' +
        'หน้านี้ไม่ได้ตรวจสอบสถานะ “sponsor ยืนยันแล้ว” ของ Earn จึงไม่แสดงเครื่องหมายรับรองใด ๆ',
      en: 'Where these numbers come from: the 15,922,040 USD lifetime payout is the ' +
        '"Total Value Earned" counter rendered on superteam.fun/earn/bounties, captured ' +
        '2026-09-19. The 210,000+ builders and 2,710+ sponsors figures come from the ' +
        '"Become a Sponsor" block on superteam.fun/earn — they are Superteam\'s own marketing ' +
        'claims, not audited, and they are counts of sign-ups, not of people who got paid. ' +
        'The listing count on this page is the number of rows in this snapshot, NOT a count of ' +
        'what is currently open on Earn, which is far larger. ' +
        'Listing fields (submissions, prize pools, status) were captured by hand on 2026-09-19 ' +
        'and go stale daily — open the real listing before you spend hours on it. ' +
        'This page does not check Earn\'s own sponsor-verification state, so it shows no ' +
        'verification badge of any kind.'
    },
    liveApi: 'Superteam Earn publishes no documented public API. EarnLive.fetchListings targets an ' +
      'undocumented endpoint, is expected to fail on file:// and under CORS, and always resolves ' +
      'to { ok, listings, error } so the seed data stays on screen.',
    linkingRule: 'Always read listing.url rather than rebuilding one from listing.slug: the live ' +
      'normaliser and the seed may disagree about how a slug maps to a URL.'
  };

  /* ------------------------------------------------- live payload handling */

  var SKILL_KEYWORDS = [
    ['development', /(develop|engineer|program|coding|code|rust|anchor|solidity|contract|frontend|front-end|backend|back-end|full-?stack|mobile|blockchain|protocol|api|bot|dapp|qa|bug|audit|security|data)/],
    ['design', /(design|ui|ux|graphic|illustrat|brand|figma|logo|merch|art|motion)/],
    ['content', /(content|writ|video|thread|article|blog|copy|editor|translat|creator|story|film)/],
    ['growth', /(growth|marketing|social|campaign|bd|business|sales|seo|ambassador)/],
    ['community', /(community|moderat|event|meetup|manager|support)/]
  ];

  function collectSkillText(raw) {
    var out = [];
    function push(value) {
      var text = toText(value);
      if (text) { out.push(text.toLowerCase()); }
    }
    push(raw.skill);
    push(raw.category);
    var list = Array.isArray(raw.skills) ? raw.skills : [];
    for (var i = 0; i < list.length; i += 1) {
      var entry = list[i];
      if (typeof entry === 'string') {
        push(entry);
      } else if (entry && typeof entry === 'object') {
        push(entry.skills);
        push(entry.skill);
        var subs = Array.isArray(entry.subskills) ? entry.subskills : [];
        for (var j = 0; j < subs.length; j += 1) { push(subs[j]); }
      }
    }
    return out;
  }

  function normaliseSkill(raw) {
    var candidates = collectSkillText(raw);
    var i;
    var k;
    for (i = 0; i < candidates.length; i += 1) {
      if (SKILL_IDS.indexOf(candidates[i]) >= 0) { return candidates[i]; }
    }
    for (i = 0; i < candidates.length; i += 1) {
      for (k = 0; k < SKILL_KEYWORDS.length; k += 1) {
        if (SKILL_KEYWORDS[k][1].test(candidates[i])) { return SKILL_KEYWORDS[k][0]; }
      }
    }
    return 'other';
  }

  function normaliseType(raw) {
    var value = toText(raw.type || raw.listingType).toLowerCase();
    if (value.indexOf('grant') >= 0) { return 'grant'; }
    if (value.indexOf('project') >= 0) { return 'project'; }
    return 'bounty';
  }

  function normaliseToken(raw) {
    var token = toText(raw.token || (raw.reward && raw.reward.token) || 'USDC').toUpperCase();
    if (token === 'USD' || token === 'USDT') { return 'USDC'; }
    return TOKENS.indexOf(token) >= 0 ? token : '';
  }

  function normaliseDeadline(raw) {
    var value = raw.deadline || raw.deadlineAt || raw.endsAt || raw.expiresAt;
    var text = toText(value);
    if (!text) { return ''; }
    var parsed = new Date(text);
    if (isNaN(parsed.getTime())) { return ''; }
    return parsed.toISOString().slice(0, 10);
  }

  function normaliseStatus(raw, deadline, nowIso) {
    if (raw.isWinnersAnnounced === true) { return 'completed'; }
    var value = toText(raw.status || raw.state).toLowerCase().replace(/[\s_]+/g, '-');
    if (value === 'completed' || value === 'closed' || value === 'payment-pending') { return 'completed'; }
    if (value === 'in-review' || value === 'verifying' || value === 'reviewing') { return 'in-review'; }
    if (deadline && deadline < nowIso) { return 'in-review'; }
    return 'open';
  }

  function normalisePrizes(raw, type, amount) {
    if (type === 'grant') { return []; }
    var source = raw.rewards || raw.prizes;
    var values = [];
    var i;
    if (Array.isArray(source)) {
      for (i = 0; i < source.length; i += 1) {
        var fromArray = toNumber(source[i], 0);
        if (fromArray > 0) { values.push(fromArray); }
      }
    } else if (source && typeof source === 'object') {
      var ranks = Object.keys(source).filter(function (key) { return /^\d+$/.test(key); });
      ranks.sort(function (a, b) { return Number(a) - Number(b); });
      for (i = 0; i < ranks.length; i += 1) {
        var fromMap = toNumber(source[ranks[i]], 0);
        if (fromMap > 0) { values.push(fromMap); }
      }
    }
    if (!values.length) { return amount > 0 ? [amount] : []; }
    var total = sum(values);
    if (total > amount) {
      /* Live payloads sometimes list bonus tiers beyond the headline pool — rescale, never exceed. */
      values = values.map(function (value) { return Math.round((value * amount) / total); });
      values = values.filter(function (value) { return value > 0; });
    }
    return values;
  }

  function normaliseRegion(raw) {
    var text = toText(raw.region || (raw.sponsor && raw.sponsor.region)).replace(/[-_]+/g, ' ');
    if (!text) { return 'Global'; }
    if (text.toLowerCase() === 'global') { return 'Global'; }
    return text.toLowerCase().replace(/\b[a-z]/g, function (char) { return char.toUpperCase(); });
  }

  var BASE_HOURS = {
    development: 24, design: 10, content: 6, growth: 8, community: 12, other: 8
  };

  function estimateHours(skill, usd, type) {
    var base = BASE_HOURS[skill] || 8;
    var scale = usd >= 7500 ? 2 : usd >= 3000 ? 1.5 : usd >= 1000 ? 1 : 0.6;
    if (type === 'project' || type === 'grant') { scale *= 1.5; }
    return Math.max(1, Math.round(base * scale));
  }

  function estimateDifficulty(skill, usd) {
    if (skill === 'development') { return usd >= 2500 ? 'advanced' : 'intermediate'; }
    if (skill === 'content' || skill === 'growth') { return usd >= 1500 ? 'intermediate' : 'beginner'; }
    return usd >= 5000 ? 'advanced' : 'intermediate';
  }

  function slugifyTag(value) {
    return toText(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function buildTags(raw, skill, submissions, type) {
    var tags = ['live'];
    var candidates = collectSkillText(raw);
    for (var i = 0; i < candidates.length && tags.length < 8; i += 1) {
      var tag = slugifyTag(candidates[i]);
      if (tag && tag !== skill && tags.indexOf(tag) < 0) { tags.push(tag); }
    }
    if (type === 'grant' && tags.indexOf('grant') < 0) { tags.push('grant'); }
    if (submissions >= 80) { tags.push('crowded'); } else if (submissions <= 25) { tags.push('thin-competition'); }
    return tags;
  }

  /**
   * Pure: turn one raw live record into a Listing, or null when it cannot be trusted.
   * `nowIso` is injectable so the mapping stays deterministic in tests.
   */
  function normalise(raw, nowIso) {
    if (!raw || typeof raw !== 'object') { return null; }
    var today = isIsoDate(nowIso) ? nowIso : todayIso();

    var slug = slugifyTag(raw.slug || raw.id || raw.title);
    var title = toText(raw.title || raw.name);
    if (!slug || !title) { return null; }

    var token = normaliseToken(raw);
    if (!token) { return null; }

    var amount = toNumber(raw.rewardAmount, toNumber(raw.reward && raw.reward.amount, 0));
    var usd = toNumber(raw.usdValue, toNumber(raw.reward && raw.reward.usd, 0));
    if (!(usd > 0) && (token === 'USDC' || token === 'USDG')) { usd = amount; }
    if (!(amount > 0) && usd > 0 && token !== 'SOL') { amount = usd; }
    if (!(amount > 0) || !(usd > 0)) { return null; }

    var deadline = normaliseDeadline(raw);
    if (!isIsoDate(deadline)) { return null; }

    var type = normaliseType(raw);
    var skill = normaliseSkill(raw);
    var submissions = Math.max(0, Math.round(toNumber(
      raw.submissionCount,
      toNumber(raw._count && raw._count.Submission, toNumber(raw.submissions, 0))
    )));
    var sponsorRaw = (raw.sponsor && typeof raw.sponsor === 'object') ? raw.sponsor : {};
    var handle = toText(sponsorRaw.twitter || sponsorRaw.handle || sponsorRaw.slug);
    if (handle) {
      handle = '@' + handle.replace(/^.*\//, '').replace(/^@/, '');
    }

    return {
      id: 'live-' + slug,
      title: title,
      slug: slug,
      url: 'https://superteam.fun/earn/listing/' + slug,
      sponsor: {
        name: toText(sponsorRaw.name) || 'Unknown sponsor',
        handle: handle || ''
      },
      type: type,
      skill: skill,
      reward: { amount: amount, token: token, usd: usd },
      prizes: normalisePrizes(raw, type, amount),
      submissions: submissions,
      deadline: deadline,
      status: normaliseStatus(raw, deadline, today),
      region: normaliseRegion(raw),
      difficulty: DIFFICULTIES.indexOf(toText(raw.difficulty).toLowerCase()) >= 0
        ? toText(raw.difficulty).toLowerCase()
        : estimateDifficulty(skill, usd),
      estimatedHours: Math.max(1, Math.round(toNumber(raw.estimatedHours, estimateHours(skill, usd, type)))),
      tags: buildTags(raw, skill, submissions, type)
    };
  }

  function extractRows(payload) {
    if (Array.isArray(payload)) { return payload; }
    if (!payload || typeof payload !== 'object') { return []; }
    var keys = ['data', 'listings', 'results', 'items', 'bounties'];
    for (var i = 0; i < keys.length; i += 1) {
      if (Array.isArray(payload[keys[i]])) { return payload[keys[i]]; }
    }
    return [];
  }

  function httpError(status) {
    var error = new Error('HTTP ' + status);
    error.httpStatus = status;
    return error;
  }

  function timeoutError() {
    var error = new Error('Live fetch timed out.');
    error.name = 'AbortError';
    return error;
  }

  function describeError(error) {
    if (!error) { return 'Live fetch failed for an unknown reason.'; }
    if (error.name === 'AbortError') {
      return 'Live fetch timed out before the API answered — keeping the bundled snapshot.';
    }
    if (error.httpStatus) {
      return 'Live fetch failed: HTTP ' + error.httpStatus + ' — keeping the bundled snapshot.';
    }
    var message = toText(error.message) || String(error);
    if (/failed to fetch|networkerror|load failed/i.test(message)) {
      return 'Live fetch blocked (CORS or offline) — Superteam Earn exposes no public API. ' +
        'Showing the bundled 2026-09-19 snapshot instead.';
    }
    return 'Live fetch failed: ' + message;
  }

  var ENDPOINT = 'https://earn.superteam.fun/api/listings/';

  /**
   * Never rejects. Always resolves to { ok, listings, error }.
   * opts: { endpoint, limit, timeoutMs, now }
   */
  async function fetchListings(opts) {
    var options = (opts && typeof opts === 'object') ? opts : {};
    var endpoint = toText(options.endpoint) || ENDPOINT;
    var timeoutMs = Math.max(1000, Math.min(30000, toNumber(options.timeoutMs, 8000)));
    var limit = Math.max(1, Math.min(500, Math.round(toNumber(options.limit, 100))));
    var timer = null;

    try {
      if (global.location && global.location.protocol === 'file:') {
        return {
          ok: false,
          listings: [],
          error: 'Live refresh is unavailable over file:// — the browser blocks cross-origin ' +
            'requests from local files. Serving the bundled ' + GENERATED_AT + ' snapshot.'
        };
      }
      if (typeof global.fetch !== 'function') {
        return { ok: false, listings: [], error: 'This browser has no fetch() — bundled snapshot only.' };
      }

      var init = { method: 'GET', mode: 'cors', credentials: 'omit', headers: { Accept: 'application/json' } };
      var controller = typeof global.AbortController === 'function' ? new global.AbortController() : null;
      if (controller) { init.signal = controller.signal; }

      var url = endpoint + (endpoint.indexOf('?') >= 0 ? '&' : '?') + 'take=' + limit;
      /* Promise.race subscribes to both sides, so neither rejection is ever left unhandled. */
      var work = global.fetch(url, init).then(function (response) {
        if (!response || !response.ok) { throw httpError((response && response.status) || 'no response'); }
        return response.json();
      });

      var payload;
      if (typeof global.setTimeout === 'function') {
        var deadline = new Promise(function (_resolve, reject) {
          timer = global.setTimeout(function () {
            if (controller) { controller.abort(); }
            reject(timeoutError());
          }, timeoutMs);
        });
        payload = await Promise.race([work, deadline]);
      } else {
        payload = await work;
      }

      var rows = extractRows(payload);
      var listings = [];
      var seen = {};
      for (var i = 0; i < rows.length; i += 1) {
        var listing = normalise(rows[i], toText(options.now));
        if (listing && !seen[listing.id]) {
          seen[listing.id] = true;
          listings.push(listing);
        }
      }
      if (!listings.length) {
        return { ok: false, listings: [], error: 'Live response parsed but held no usable listings.' };
      }
      return { ok: true, listings: listings, error: null };
    } catch (error) {
      return { ok: false, listings: [], error: describeError(error) };
    } finally {
      if (timer !== null && typeof global.clearTimeout === 'function') { global.clearTimeout(timer); }
    }
  }

  /* ------------------------------------------------------------ self-check */

  /** Pure: returns an array of human-readable schema problems (empty when clean). */
  function audit(listings) {
    var problems = [];
    var seen = {};
    var rows = Array.isArray(listings) ? listings : [];

    rows.forEach(function (listing, index) {
      var where = (listing && listing.id) ? listing.id : 'index ' + index;
      if (!listing || typeof listing !== 'object') {
        problems.push(where + ': not an object');
        return;
      }
      if (!toText(listing.id)) { problems.push(where + ': missing id'); }
      if (seen[listing.id]) { problems.push(where + ': duplicate id'); }
      seen[listing.id] = true;
      if (!toText(listing.title)) { problems.push(where + ': missing title'); }
      if (!/^https:\/\//.test(toText(listing.url))) { problems.push(where + ': url is not an https URL'); }
      if (TYPES.indexOf(listing.type) < 0) { problems.push(where + ': bad type "' + listing.type + '"'); }
      if (SKILL_IDS.indexOf(listing.skill) < 0) { problems.push(where + ': bad skill "' + listing.skill + '"'); }
      if (STATUSES.indexOf(listing.status) < 0) { problems.push(where + ': bad status "' + listing.status + '"'); }
      if (DIFFICULTIES.indexOf(listing.difficulty) < 0) { problems.push(where + ': bad difficulty "' + listing.difficulty + '"'); }
      if (!isIsoDate(listing.deadline)) { problems.push(where + ': deadline "' + listing.deadline + '" is not a real ISO date'); }
      if (!toText(listing.region)) { problems.push(where + ': missing region'); }

      var reward = listing.reward || {};
      if (TOKENS.indexOf(reward.token) < 0) { problems.push(where + ': bad token "' + reward.token + '"'); }
      if (!(typeof reward.amount === 'number' && isFinite(reward.amount) && reward.amount > 0)) {
        problems.push(where + ': reward.amount must be a positive number');
      }
      if (!(typeof reward.usd === 'number' && isFinite(reward.usd) && reward.usd > 0)) {
        problems.push(where + ': reward.usd must be a positive number');
      }

      if (!Array.isArray(listing.prizes)) {
        problems.push(where + ': prizes must be an array');
      } else {
        if (listing.type === 'grant' && listing.prizes.length) {
          problems.push(where + ': grants must carry an empty prizes array');
        }
        var bad = listing.prizes.some(function (prize) {
          return !(typeof prize === 'number' && isFinite(prize) && prize > 0);
        });
        if (bad) { problems.push(where + ': prizes contains a non-positive or NaN value'); }
        if (!bad && listing.prizes.length && sum(listing.prizes) > reward.amount) {
          problems.push(where + ': prizes sum (' + sum(listing.prizes) + ') exceeds reward.amount (' + reward.amount + ')');
        }
      }

      if (!(typeof listing.submissions === 'number' && isFinite(listing.submissions) && listing.submissions >= 0)) {
        problems.push(where + ': submissions must be a number >= 0');
      }
      if (!(typeof listing.estimatedHours === 'number' && isFinite(listing.estimatedHours) && listing.estimatedHours > 0)) {
        problems.push(where + ': estimatedHours must be a number > 0');
      }
      if (!Array.isArray(listing.tags)) { problems.push(where + ': tags must be an array'); }
      if (!listing.sponsor || !toText(listing.sponsor.name)) { problems.push(where + ': missing sponsor.name'); }
    });

    return problems;
  }

  /** Seed-only consistency on top of the shape audit: size floor + region-filter coverage. */
  function auditSeed() {
    var problems = audit(LISTINGS);
    if (LISTINGS.length < 15) {
      problems.push('seed holds only ' + LISTINGS.length + ' listings (15 minimum)');
    }
    var used = {};
    LISTINGS.forEach(function (listing) {
      used[listing.region] = true;
      if (REGIONS.indexOf(listing.region) < 0) {
        problems.push(listing.id + ': region "' + listing.region + '" is missing from EARN_DATA.regions, ' +
          'so the region filter would hide it');
      }
    });
    /* The reverse direction matters too: a region no listing uses is a filter option that is
       guaranteed to return an empty board, which reads as a broken app. */
    REGIONS.forEach(function (region) {
      if (!used[region]) {
        problems.push('EARN_DATA.regions lists "' + region + '", which no listing uses, ' +
          'so selecting it would always return zero rows');
      }
    });
    return problems;
  }

  /* ---------------------------------------------------------------- export */

  global.EARN_DATA = {
    generatedAt: GENERATED_AT,
    stats: STATS,
    skills: SKILLS,
    regions: REGIONS,
    listings: LISTINGS,
    meta: META
  };

  global.EarnLive = {
    ENDPOINT: ENDPOINT,
    fetchListings: fetchListings,
    normalise: normalise,
    audit: audit
  };

  try {
    var problems = auditSeed();
    if (problems.length && global.console && typeof global.console.warn === 'function') {
      global.console.warn('[EARN_DATA] seed self-check found ' + problems.length +
        ' issue(s):\n- ' + problems.join('\n- '));
    }
  } catch (error) {
    if (global.console && typeof global.console.warn === 'function') {
      global.console.warn('[EARN_DATA] seed self-check could not run: ' + error.message);
    }
  }
}(typeof window !== 'undefined' ? window : globalThis));
