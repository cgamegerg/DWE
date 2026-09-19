/*!
 * app.js — window.EarnApp (CONTRACT D)
 *
 * Classic <script>, no modules, no imports, no network at load. Owns index.html and
 * styles.css; consumes window.EARN_DATA, window.EARN_PLAYBOOK, window.EarnCalculator
 * and window.EarnLive exactly as their contracts publish them.
 *
 * Responsibilities
 *   - boot + guarded degradation when a dependency is missing
 *   - the board: tabs, debounced search, filters, sorts (incl. EV via EarnCalculator)
 *   - the competition-heat model (the reason this page exists)
 *   - bilingual UI chrome (th default / en), theme, URL-hash filter state
 *   - playbook rendering from EARN_PLAYBOOK
 *   - the live-refresh control over EarnLive.fetchListings()
 *
 * HONESTY NOTES BAKED INTO THE MODEL
 *   The snapshot publishes `submissions` and `deadline` but no posted-at date, so the
 *   pace projection assumes a listing window by type (bounty 21d, project 30d, grant 45d).
 *   That assumption is stated verbatim in the heat legend on the page and drives both the
 *   projection and the "Newest" sort. Nothing here invents a submission count or a payout.
 */
(function (global) {
  'use strict';

  var doc = global.document;
  var DAY = 864e5;

  /* ------------------------------------------------------------------ *
   * Dependencies (read once, guarded)                                   *
   * ------------------------------------------------------------------ */

  var DATA = global.EARN_DATA;
  var PLAYBOOK = global.EARN_PLAYBOOK;
  var CALC = global.EarnCalculator;
  var LIVE = global.EarnLive;

  /* ------------------------------------------------------------------ *
   * Tiny DOM + formatting helpers                                       *
   * ------------------------------------------------------------------ */

  function byId(id) { return doc.getElementById(id); }

  function el(tag, className, text) {
    var node = doc.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined && text !== null) { node.textContent = String(text); }
    return node;
  }

  function setText(id, value) {
    var node = byId(id);
    if (node) { node.textContent = value; }
    return node;
  }

  function clear(node) {
    if (!node) { return; }
    while (node.firstChild) { node.removeChild(node.firstChild); }
  }

  var ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  /** The dataset is untrusted: nothing reaches innerHTML without passing through here. */
  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/[&<>"']/g, function (ch) { return ESCAPES[ch]; });
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  var nfCache = {};
  function nf(options) {
    var key = JSON.stringify(options);
    if (!nfCache[key]) {
      try { nfCache[key] = new global.Intl.NumberFormat('en-US', options); }
      catch (error) { nfCache[key] = { format: function (n) { return String(Math.round(n)); } }; }
    }
    return nfCache[key];
  }

  function fmtInt(value) { return nf({ maximumFractionDigits: 0 }).format(Math.round(num(value, 0))); }

  function fmtUsd(value) {
    var n = num(value, 0);
    var frac = (n > 0 && n < 100) ? (n < 10 ? 2 : 1) : 0;
    return nf({ style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: frac }).format(n);
  }

  function fmtUsdCompact(value) {
    var n = Math.abs(num(value, 0));
    if (n >= 1e6) { return '$' + nf({ minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n / 1e6) + 'M'; }
    if (n >= 1e3) { return '$' + nf({ maximumFractionDigits: 0 }).format(n / 1e3) + 'K'; }
    return fmtUsd(n);
  }

  function fmtCount(value) {
    var n = Math.round(num(value, 0));
    if (n >= 1000) { return nf({ maximumFractionDigits: 0 }).format(n) + '+'; }
    return fmtInt(n);
  }

  function num(value, fallback) {
    var n = typeof value === 'number' ? value : parseFloat(value);
    return (typeof n === 'number' && isFinite(n)) ? n : fallback;
  }

  function median(values) {
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    if (!sorted.length) { return 0; }
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function isNarrow() {
    try { return global.matchMedia('(max-width: 599px)').matches; } catch (error) { return false; }
  }

  function prefersReducedMotion() {
    try { return global.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (error) { return false; }
  }

  function scrollBehavior() { return prefersReducedMotion() ? 'auto' : 'smooth'; }

  function store(key, value) {
    try { global.localStorage.setItem(key, value); } catch (error) { /* private mode: ignore */ }
  }

  function restore(key) {
    try { return global.localStorage.getItem(key); } catch (error) { return null; }
  }

  /* ------------------------------------------------------------------ *
   * Copy — UI chrome only. Editorial copy comes from EARN_PLAYBOOK.      *
   * ------------------------------------------------------------------ */

  var COPY = {
    th: {
      lang: 'ไทย', htmlLang: 'th',
      skip: 'ข้ามไปที่รายการงาน',
      nav: { label: 'ส่วนต่าง ๆ ของหน้า', board: 'กระดานงาน', playbook: 'คู่มือ', calc: 'เครื่องคำนวณ' },
      langLabel: 'ภาษา',
      theme: { label: 'ธีมสี', light: 'สว่าง', system: 'ตามระบบ', dark: 'มืด' },
      hero: {
        eyebrow: function (open, date) { return 'สแนปช็อตนี้: ' + fmtInt(open) + ' งานที่ยังเปิดรับ · เก็บข้อมูล ' + date; },
        h1: 'ดูก่อนว่างานไหน{g}กับสุดสัปดาห์ของคุณ',
        gradWord: 'คุ้ม',
        sub: 'ไม่ต้องยิงทุกงาน — ดูก่อนว่ามีคนแย่งกี่คน แล้วเลือกงานที่ EV ต่อชั่วโมงคุ้มที่สุด',
        subAlt: 'Every listing is scored for crowding before you open it.',
        subAltLang: 'en',
        counterLabel: 'ยอดที่ Superteam Earn จ่ายให้ผู้สร้าง "ทั้งแพลตฟอร์ม" ตั้งแต่เปิดมา',
        counterReality: 'นี่คือยอดรวมของคนทั้งหมดตลอดหลายปี ไม่ใช่สิ่งที่คุณจะได้ — ' +
          'คนที่เพิ่งเริ่ม "ส่วนใหญ่ได้ $0 ในเดือนแรก" และเงินเกือบทั้งหมดตกกับคนไม่กี่คนที่ชนะ ' +
          'หน้านี้มีไว้ช่วยให้คุณเลือกงานที่คุ้มกับเวลา ไม่ใช่รับประกันว่าจะได้เงิน',
        counterSub: function (sponsors, talent, date) {
          return 'ตัวเลขโฆษณาที่ Superteam Earn ประกาศเอง ไม่มีการตรวจสอบ เก็บไว้เมื่อ ' + date +
            ' · สปอนเซอร์ที่สมัครไว้ ' + fmtCount(sponsors) + ' ราย · ผู้สร้างที่สมัครไว้ ' + fmtCount(talent) +
            ' (จำนวนคนสมัคร ไม่ใช่จำนวนคนที่ได้เงิน)';
        },
        ctaPrimary: 'ไปดูงานจริงที่ Earn',
        ctaSecondary: 'วิธีคิดคะแนนความแออัด',
        ctaNote: 'ปุ่มแรกเปิด superteam.fun/earn ในแท็บใหม่ — หน้านี้เป็นเครื่องมือช่วยคิด ไม่ใช่เว็บทางการ',
        tickerLabel: 'เงินรางวัลของงานในชุดข้อมูลนี้'
      },
      pills: {
        open: 'เปิดรับ (ในสแนปช็อตนี้)', median: 'เงินรางวัล (มัธยฐานในสแนปช็อตนี้)',
        ev: 'EV ต่อคน (มัธยฐานในสแนปช็อตนี้)', talent: 'ผู้สร้างที่สมัครไว้ (ทั้งแพลตฟอร์ม)'
      },
      tabs: { label: 'ประเภทงาน', all: 'ทั้งหมด', bounty: 'บาวน์ตี้', project: 'โปรเจกต์', grant: 'ทุน' },
      filters: {
        searchLabel: 'ค้นหางาน',
        searchPlaceholder: 'ค้นหาบาวน์ตี้ สกิล หรือสปอนเซอร์',
        button: 'ตัวกรอง', quick: 'ตัวกรองด่วน', skill: 'สกิล',
        sortLabel: 'เรียงลำดับ',
        region: 'ทุกภูมิภาค', difficulty: 'ทุกระดับ', status: 'ทุกสถานะ', token: 'ทุกสกุลเงิน',
        hideCrowded: 'ซ่อนงานที่คนแย่งเยอะ',
        min500: '$500+', min1k: '$1,000+', min5k: '$5,000+'
      },
      diff: { beginner: 'มือใหม่', intermediate: 'ปานกลาง', advanced: 'ขั้นสูง' },
      /* Region values in the dataset are English. Translate the ones we ship; anything a live
         refresh introduces falls back to the raw value rather than showing a blank option. */
      regionNames: {
        Global: 'ทั่วโลก', Thailand: 'ไทย', Vietnam: 'เวียดนาม', India: 'อินเดีย',
        Nigeria: 'ไนจีเรีย', Turkey: 'ตุรกี', Australia: 'ออสเตรเลีย', Canada: 'แคนาดา',
        Ireland: 'ไอร์แลนด์', Germany: 'เยอรมนี', Brazil: 'บราซิล', Poland: 'โปแลนด์'
      },
      status: { open: 'เปิดรับ', 'in-review': 'กำลังตัดสิน', completed: 'จบแล้ว' },
      sort: { ev: 'EV ต่อชั่วโมงดีที่สุด', reward: 'เงินรางวัลสูงสุด', deadline: 'ใกล้ปิดรับ', newest: 'ลงใหม่ล่าสุด' },
      result: function (n, ev) { return fmtInt(n) + ' งาน · EV ต่อคน (มัธยฐาน) ' + fmtUsd(ev); },
      card: {
        hours: function (h) { return '~' + fmtInt(h) + ' ชม.'; },
        entries: 'คนส่งแล้ว',
        ev: 'EV',
        evAria: function (usd, title) { return 'เปิดเครื่องคำนวณ EV สำหรับ ' + title + ' — ส่วนแบ่งเฉลี่ยราว ' + fmtUsd(usd) + ' ต่อคน'; },
        openAria: 'เปิดหน้าประกาศในแท็บใหม่',
        closing: 'ใกล้ปิด', review: 'กำลังตัดสิน', done: 'จบแล้ว',
        type: { bounty: 'บาวน์ตี้', project: 'โปรเจกต์', grant: 'ทุน' }
      },
      time: {
        left: function (parts) { return 'เหลือ ' + parts; },
        closed: function (parts) { return 'ปิดไปแล้ว ' + parts; },
        d: 'วัน', h: 'ชม.', m: 'นาที', ago: '', justClosed: 'ปิดรับแล้ว'
      },
      heat: {
        levels: ['โล่ง', 'เริ่มมีคน', 'คึกคัก', 'แน่น', 'เดือด'],
        aria: function (label, level, subs, projected) {
          return 'ความแออัด: ' + label + ' ระดับ ' + level + ' จาก 5 · ตอนนี้ ' + fmtInt(subs) +
            ' คน คาดว่าถึงวันปิดราว ' + fmtInt(projected) + ' คน';
        },
        pace: { rising: 'คนส่งเร็วกว่าค่ากลางของสกิลนี้', steady: 'คนส่งพอ ๆ กับค่ากลางของสกิลนี้', cooling: 'คนส่งช้ากว่าค่ากลางของสกิลนี้' },
        paceTitle: function (perDay, med, skill) {
          return fmtRate1(perDay) + ' คน/วัน เทียบกับค่ากลาง ' + fmtRate1(med) + ' คน/วัน ของสกิล ' + skill;
        },
        legendTitle: 'วิธีคิดคะแนนความแออัด',
        ranges: ['0–8 คน', '9–24 คน', '25–59 คน', '60–119 คน', '120+ คน'],
        method: 'คาดจำนวนผู้ส่ง = จำนวนตอนนี้ × (ความยาวรอบรับสมัครทั้งหมด ÷ เวลาที่ผ่านไปแล้ว) โดยจำกัดตัวคูณไว้ไม่เกิน 2.5 เท่า · ' +
          'EV ต่อคน = เงินรางวัล ÷ (จำนวนที่คาด + 1) · ' +
          'ชุดข้อมูลไม่มีวันที่ประกาศ จึงตั้งรอบรับสมัครไว้ที่ บาวน์ตี้ 21 วัน / โปรเจกต์ 30 วัน / ทุน 45 วัน และใช้ค่านี้กับการเรียง “ลงใหม่ล่าสุด” ด้วย'
      },
      live: {
        button: 'ลองดึงข้อมูลสด',
        loading: 'กำลังติดต่อ API…',
        ok: function (n) { return 'รวมข้อมูลสดแล้ว ' + fmtInt(n) + ' รายการ'; },
        fallback: 'ดึงข้อมูลสดไม่ได้ — กำลังแสดงสแนปช็อตที่มากับหน้านี้',
        noModule: 'โมดูลข้อมูลสดไม่ถูกโหลด — กำลังแสดงสแนปช็อตที่มากับหน้านี้'
      },
      empty: {
        title: 'ไม่มีงานที่ตรงกับตัวกรองนี้',
        body: 'ลองปลดตัวกรองบางอัน หรือเพิ่มช่วงเงินรางวัลให้กว้างขึ้น',
        active: 'ตัวกรองที่เปิดอยู่',
        clear: 'ล้างตัวกรองทั้งหมด',
        uncrowd: 'แสดงงานที่คนแย่งเยอะด้วย',
        hint: function (n) { return 'ตอนนี้มี ' + fmtInt(n) + ' งานถูกซ่อนด้วยตัวกรอง “ซ่อนงานที่คนแย่งเยอะ”'; }
      },
      sheet: { title: 'ตัวกรอง', apply: 'ใช้ตัวกรอง', clear: 'ล้างทั้งหมด', close: 'ปิด' },
      calc: { region: 'เครื่องคำนวณค่าคาดหวัง', eyebrow: 'เครื่องคำนวณ EV', from: 'จากงาน: ', clear: 'ล้าง' },
      playbook: {
        eyebrow: 'คู่มือ',
        steps: 'เริ่มต้นทีละขั้น', plays: 'กลยุทธ์ที่ใช้ได้จริง',
        mistakes: 'ข้อผิดพลาดที่เจอบ่อย', faq: 'คำถามที่ถามกันบ่อย',
        foot: 'เนื้อหาทั้งหมดมาจากไฟล์คู่มือของโปรเจกต์นี้ ไม่ใช่คำแนะนำการลงทุน และไม่มีการรับประกันรายได้'
      },
      footer: {
        blurb: 'กระดานอิสระที่ให้คะแนนว่างานหนึ่ง ๆ มีคนแย่งแค่ไหน ก่อนคุณจะทุ่มสุดสัปดาห์ลงไป',
        meta: function (n, date) { return 'ข้อมูลสแนปช็อต ' + date + ' · ติดตาม ' + fmtInt(n) + ' งาน'; },
        browse: 'ดูงาน', learn: 'เรียนรู้', about: 'เกี่ยวกับ',
        leastCrowded: 'งานที่คนแย่งน้อย',
        heat: 'วิธีคิดความแออัด', calc: 'เครื่องคำนวณ EV', playbookLink: 'คู่มือฉบับเต็ม',
        official: 'เว็บ Superteam Earn ตัวจริง',
        allListings: 'รายการงานทั้งหมดบน Earn',
        disclaimerLink: 'คำชี้แจงและที่มาข้อมูล',
        copy: '© 2026 Bounty Heat Board',
        disclaimer: 'โปรเจกต์อิสระ ไม่ได้สังกัด ไม่ได้รับการรับรอง และไม่ได้ดำเนินการโดย Superteam หรือ Solana Foundation · ' +
          'ข้อมูลเป็นสแนปช็อตที่จัดทำเอง ณ วันที่ 2026-09-19 · เงินรางวัลเป็นไปตามที่สปอนเซอร์ประกาศไว้ ณ เวลานั้น'
      },
      bootError: 'หน้านี้โหลดไฟล์ข้อมูลไม่ครบ จึงแสดงกระดานงานไม่ได้ กรุณาโหลดใหม่อีกครั้ง — ไฟล์ที่หายไป: '
    },

    en: {
      lang: 'EN', htmlLang: 'en',
      skip: 'Skip to the listings',
      nav: { label: 'Sections', board: 'Board', playbook: 'Playbook', calc: 'Calculator' },
      langLabel: 'Language',
      theme: { label: 'Colour theme', light: 'Light', system: 'System', dark: 'Dark' },
      hero: {
        eyebrow: function (open, date) { return 'This snapshot: ' + fmtInt(open) + ' still open · captured ' + date; },
        h1: 'Find the bounties actually {g} your weekend.',
        gradWord: 'worth',
        sub: 'Do not enter everything. See how many people you are up against, then spend your hours where the EV per hour is highest.',
        subAlt: 'ทุกงานถูกให้คะแนนความแออัดก่อนคุณจะกดเข้าไปดู',
        subAltLang: 'th',
        counterLabel: 'Paid out by Superteam Earn to ALL builders, all time',
        counterReality: 'That is everyone, over years — it is not what you will make. ' +
          'Most people earn $0 in their first month, and most of this money went to the ' +
          'few entrants who won. This page exists to help you pick listings worth your ' +
          'hours; it does not promise you any of it.',
        counterSub: function (sponsors, talent, date) {
          return "Superteam Earn's own marketing figures, unaudited, captured " + date + ' · ' +
            fmtCount(sponsors) + ' sponsors signed up · ' + fmtCount(talent) +
            ' builders signed up (sign-ups, not people who got paid)';
        },
        ctaPrimary: 'Browse open listings',
        ctaSecondary: 'How heat is scored',
        ctaNote: 'The first button opens superteam.fun/earn in a new tab — this page is an independent scoring tool, not the official site.',
        tickerLabel: 'Prize pools in this snapshot'
      },
      pills: {
        open: 'Open in this snapshot', median: 'Median reward in snapshot',
        ev: 'Median EV / entry in snapshot', talent: 'Builders signed up (platform)'
      },
      tabs: { label: 'Listing type', all: 'All', bounty: 'Bounties', project: 'Projects', grant: 'Grants' },
      filters: {
        searchLabel: 'Search listings',
        searchPlaceholder: 'Search a bounty, a skill or a sponsor',
        button: 'Filters', quick: 'Quick filters', skill: 'Skill',
        sortLabel: 'Sort',
        region: 'All regions', difficulty: 'All levels', status: 'All statuses', token: 'All tokens',
        hideCrowded: 'Hide crowded',
        min500: '$500+', min1k: '$1,000+', min5k: '$5,000+'
      },
      diff: { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' },
      regionNames: {},
      status: { open: 'Open', 'in-review': 'In review', completed: 'Completed' },
      sort: { ev: 'Best $/hour (EV)', reward: 'Highest reward', deadline: 'Closing soon', newest: 'Newest' },
      result: function (n, ev) { return fmtInt(n) + ' listings · median EV ' + fmtUsd(ev) + ' / entry'; },
      card: {
        hours: function (h) { return '~' + fmtInt(h) + 'h'; },
        entries: 'entries',
        ev: 'EV',
        evAria: function (usd, title) { return 'Open the EV calculator for ' + title + '. Fair-share EV about ' + fmtUsd(usd) + ' per entry.'; },
        openAria: 'opens the listing in a new tab',
        closing: 'Closing', review: 'In review', done: 'Completed',
        type: { bounty: 'Bounty', project: 'Project', grant: 'Grant' }
      },
      time: {
        left: function (parts) { return parts + ' left'; },
        closed: function (parts) { return 'closed ' + parts + ' ago'; },
        d: 'd', h: 'h', m: 'm', ago: '', justClosed: 'closed'
      },
      heat: {
        levels: ['Wide open', 'Warming', 'Busy', 'Crowded', 'Red zone'],
        aria: function (label, level, subs, projected) {
          return 'Competition: ' + label + ', level ' + level + ' of 5. ' + fmtInt(subs) +
            ' entries now, about ' + fmtInt(projected) + ' projected by close.';
        },
        pace: { rising: 'entries rising', steady: 'entries steady', cooling: 'entries cooling' },
        paceTitle: function (perDay, med, skill) {
          return fmtRate1(perDay) + ' entries/day against a ' + fmtRate1(med) + '/day median for ' + skill;
        },
        legendTitle: 'How heat is scored',
        ranges: ['0–8', '9–24', '25–59', '60–119', '120+'],
        method: 'Projected entries = current entries × (the whole assumed window ÷ the time elapsed so far), with that multiplier capped at 2.5x. ' +
          'EV = prize pool / (projected + 1). The snapshot carries no posted-at date, so the window is assumed: ' +
          '21 days for bounties, 30 for projects, 45 for grants. The "Newest" sort reads from that same assumption.'
      },
      live: {
        button: 'Try live data',
        loading: 'Contacting the API…',
        ok: function (n) { return 'Merged ' + fmtInt(n) + ' live listings.'; },
        fallback: 'Live refresh unavailable — showing the bundled snapshot.',
        noModule: 'The live-data module did not load — showing the bundled snapshot.'
      },
      empty: {
        title: 'Nothing matches these filters.',
        body: 'Drop a filter or two, or widen the reward range.',
        active: 'Active filters',
        clear: 'Clear all filters',
        uncrowd: 'Show crowded listings too',
        hint: function (n) { return fmtInt(n) + ' listings are hidden by "Hide crowded" right now.'; }
      },
      sheet: { title: 'Filters', apply: 'Apply', clear: 'Clear all', close: 'Close' },
      calc: { region: 'Expected value calculator', eyebrow: 'EV calculator', from: 'From: ', clear: 'clear' },
      playbook: {
        eyebrow: 'The playbook',
        steps: 'Start here, in order', plays: 'Tactics that actually work',
        mistakes: 'Mistakes that cost people money', faq: 'Questions people actually ask',
        foot: 'All of the above comes from this project’s playbook file. Not financial advice, and no income is promised.'
      },
      footer: {
        blurb: 'An independent board that scores how crowded a bounty is before you spend a weekend on it.',
        meta: function (n, date) { return 'snapshot ' + date + ' · ' + fmtInt(n) + ' listings tracked'; },
        browse: 'Browse', learn: 'Learn', about: 'About',
        leastCrowded: 'Least crowded',
        heat: 'How heat is scored', calc: 'EV calculator', playbookLink: 'The full playbook',
        official: 'Superteam Earn (official site)',
        allListings: 'All listings on Earn',
        disclaimerLink: 'Disclaimer and data source',
        copy: '© 2026 Bounty Heat Board',
        disclaimer: 'Independent project. Not affiliated with, endorsed by, or operated by Superteam or the Solana Foundation. ' +
          'Data is a hand-built snapshot dated 2026-09-19. Rewards are shown as posted by sponsors at that time.'
      },
      bootError: 'This page could not load all of its data files, so the board cannot render. Please reload. Missing: '
    }
  };

  function fmtRate1(value) { return nf({ minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(num(value, 0)); }

  function t() { return COPY[state.lang] || COPY.th; }

  /* ------------------------------------------------------------------ *
   * State                                                               *
   * ------------------------------------------------------------------ */

  var DEFAULTS = {
    type: 'all', q: '', skills: [], min: 0, region: 'all',
    difficulty: 'all', status: 'all', token: 'all', hideCrowded: false, sort: 'ev'
  };

  var state = {
    lang: 'th',
    theme: 'system',
    type: 'all', q: '', skills: [], min: 0, region: 'all',
    difficulty: 'all', status: 'all', token: 'all', hideCrowded: false, sort: 'ev'
  };

  var allListings = [];
  var heatIndex = {};          /* listing.id -> heat record */
  var visible = [];            /* current filtered + sorted rows */
  var countdownNodes = [];
  var countdownTimer = null;
  var searchTimer = null;
  var prefilled = null;
  var booted = false;

  var WINDOW_DAYS = { bounty: 21, project: 30, grant: 45 };
  var HEAT_BOUNDS = [8, 24, 59, 119];
  /* The snapshot publishes no posted-at date, so the pace projection is capped. Without a
     cap a listing whose deadline sits beyond the modelled window has ~no elapsed time and
     the ratio explodes (9 entries would "project" to 810). 2.5x is the honest ceiling. */
  var MAX_PROJECTION = 2.5;

  /* ------------------------------------------------------------------ *
   * Heat model                                                          *
   * ------------------------------------------------------------------ */

  function deadlineMs(listing) {
    var parsed = Date.parse(String(listing.deadline) + 'T23:59:59Z');
    return isFinite(parsed) ? parsed : Date.now();
  }

  function postedMs(listing) {
    return deadlineMs(listing) - (WINDOW_DAYS[listing.type] || 21) * DAY;
  }

  function heatLevel(projected) {
    for (var i = 0; i < HEAT_BOUNDS.length; i += 1) {
      if (projected <= HEAT_BOUNDS[i]) { return i + 1; }
    }
    return 5;
  }

  /** Rebuilds heatIndex for the current listing set. Two passes: per-day rates, then medians. */
  function buildHeatIndex(listings) {
    var now = Date.now();
    var rows = [];
    var bySkill = {};
    var i;

    for (i = 0; i < listings.length; i += 1) {
      var listing = listings[i];
      var deadline = deadlineMs(listing);
      var posted = postedMs(listing);
      var subs = Math.max(0, Math.round(num(listing.submissions, 0)));
      var elapsedDays = Math.max(1, (now - posted) / DAY);
      var totalDays = Math.max(elapsedDays, (deadline - posted) / DAY);
      var ratio = Math.min(MAX_PROJECTION, totalDays / elapsedDays);
      var projected = Math.max(subs, Math.round(subs * ratio));
      var pool = Math.max(0, num(listing.reward && listing.reward.usd, 0));
      var perDay = subs / elapsedDays;

      if (!bySkill[listing.skill]) { bySkill[listing.skill] = []; }
      bySkill[listing.skill].push(perDay);

      rows.push({
        id: listing.id,
        posted: posted,
        deadline: deadline,
        closed: now > deadline,
        subs: subs,
        projected: projected,
        level: heatLevel(projected),
        evPerEntry: pool / (projected + 1),
        perDay: perDay,
        skill: listing.skill
      });
    }

    var medians = {};
    for (var skill in bySkill) {
      if (Object.prototype.hasOwnProperty.call(bySkill, skill)) { medians[skill] = median(bySkill[skill]); }
    }

    var index = {};
    for (i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      var med = medians[row.skill] || 0;
      row.medianPerDay = med;
      row.pace = (med > 0 && row.perDay > med * 1.25) ? 'rising'
        : (med > 0 && row.perDay < med * 0.75) ? 'cooling' : 'steady';
      index[row.id] = row;
    }
    heatIndex = index;
  }

  function heatOf(listing) {
    return heatIndex[listing.id] || { level: 1, subs: 0, projected: 0, evPerEntry: 0, closed: false, pace: 'steady', perDay: 0, medianPerDay: 0, deadline: Date.now(), posted: Date.now() };
  }

  /* ------------------------------------------------------------------ *
   * Countdown                                                           *
   * ------------------------------------------------------------------ */

  function countdownParts(msLeft) {
    var copy = t().time;
    var abs = Math.abs(msLeft);
    var days = Math.floor(abs / DAY);
    var hours = Math.floor((abs % DAY) / 36e5);
    var mins = Math.floor((abs % 36e5) / 6e4);
    if (days >= 2) { return fmtInt(days) + ' ' + copy.d; }
    if (days >= 1) { return fmtInt(days) + ' ' + copy.d + ' ' + fmtInt(hours) + ' ' + copy.h; }
    if (hours >= 1) { return fmtInt(hours) + ' ' + copy.h + ' ' + fmtInt(mins) + ' ' + copy.m; }
    return fmtInt(Math.max(1, mins)) + ' ' + copy.m;
  }

  function countdownFor(deadline) {
    var copy = t().time;
    var left = deadline - Date.now();
    if (left <= 0) {
      var since = Math.abs(left);
      return { tier: 'ended', text: since < 6e4 ? copy.justClosed : copy.closed(countdownParts(left)) };
    }
    var tier = left < 12 * 36e5 ? 'urgent'
      : left < 48 * 36e5 ? 'warn'
        : left < 7 * DAY ? 'soon' : 'none';
    return { tier: tier, text: copy.left(countdownParts(left)) };
  }

  function refreshCountdowns() {
    var soonest = Infinity;
    for (var i = 0; i < countdownNodes.length; i += 1) {
      var entry = countdownNodes[i];
      if (!entry.node.isConnected) { continue; }
      var view = countdownFor(entry.deadline);
      entry.node.textContent = view.text;
      entry.node.setAttribute('data-tier', view.tier);
      var left = entry.deadline - Date.now();
      if (left > 0 && left < soonest) { soonest = left; }
    }
    var next = soonest < 36e5 ? 1000 : 60000;
    if (countdownTimer) { global.clearTimeout(countdownTimer); }
    countdownTimer = global.setTimeout(refreshCountdowns, next);
  }

  /* ------------------------------------------------------------------ *
   * URL hash state                                                      *
   * ------------------------------------------------------------------ */

  var HASH_KEYS = ['type', 'q', 'skills', 'min', 'region', 'difficulty', 'status', 'token', 'crowded', 'sort'];
  var SORT_KEYS = ['ev', 'newest', 'reward', 'deadline'];
  var DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
  var STATUSES = ['open', 'in-review', 'completed'];

  function readHash() {
    var raw = String(global.location.hash || '').replace(/^#/, '');
    if (!raw || raw.indexOf('=') < 0) { return; }
    var parts = raw.split('&');
    var found = {};
    var hits = 0;
    for (var i = 0; i < parts.length; i += 1) {
      var pair = parts[i].split('=');
      var key = decodeURIComponent(pair[0] || '');
      if (HASH_KEYS.indexOf(key) < 0) { continue; }
      found[key] = decodeURIComponent((pair[1] || '').replace(/\+/g, ' '));
      hits += 1;
    }
    /* A hash that carries filter keys is authoritative: whatever it leaves out goes back to
       its default, so the URL and the board can never disagree. Bare anchors (#playbook,
       #listings) carry no '=' and returned above, so they never clear anyone's filters. */
    if (!hits) { return; }
    state.type = DEFAULTS.type;
    state.q = DEFAULTS.q;
    state.skills = [];
    state.min = DEFAULTS.min;
    state.region = DEFAULTS.region;
    state.difficulty = DEFAULTS.difficulty;
    state.status = DEFAULTS.status;
    state.token = DEFAULTS.token;
    state.sort = DEFAULTS.sort;

    if (found.type && ['all', 'bounty', 'project', 'grant'].indexOf(found.type) >= 0) { state.type = found.type; }
    if (typeof found.q === 'string') { state.q = found.q.slice(0, 120); }
    if (found.skills) {
      state.skills = found.skills.split(',').filter(function (id) { return skillIds().indexOf(id) >= 0; });
    }
    if (found.min) { state.min = Math.max(0, num(found.min, 0)); }
    /* region and token are open sets — a live refresh can introduce values the seed never had. */
    if (found.region) { state.region = found.region; }
    if (found.token) { state.token = found.token; }
    /* difficulty, status and sort are closed enums. indexOf, not a property lookup: a bare
       `COPY.en.sort[key]` test passes for prototype keys like "constructor". */
    if (found.difficulty && DIFFICULTIES.indexOf(found.difficulty) >= 0) { state.difficulty = found.difficulty; }
    if (found.status && STATUSES.indexOf(found.status) >= 0) { state.status = found.status; }
    if (found.sort && SORT_KEYS.indexOf(found.sort) >= 0) { state.sort = found.sort; }
    state.hideCrowded = found.crowded === 'hide';
  }

  function writeHash() {
    var parts = [];
    function add(key, value) { parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(value)); }
    if (state.type !== DEFAULTS.type) { add('type', state.type); }
    if (state.q) { add('q', state.q); }
    if (state.skills.length) { add('skills', state.skills.join(',')); }
    if (state.min) { add('min', state.min); }
    if (state.region !== DEFAULTS.region) { add('region', state.region); }
    if (state.difficulty !== DEFAULTS.difficulty) { add('difficulty', state.difficulty); }
    if (state.status !== DEFAULTS.status) { add('status', state.status); }
    if (state.token !== DEFAULTS.token) { add('token', state.token); }
    if (state.hideCrowded) { add('crowded', 'hide'); }
    if (state.sort !== DEFAULTS.sort) { add('sort', state.sort); }

    var hash = parts.length ? '#' + parts.join('&') : '';
    var url = global.location.pathname + global.location.search + hash;
    try { global.history.replaceState(null, '', url); }
    catch (error) { /* file:// can refuse replaceState — the page still works */ }
  }

  function activeFilterCount() {
    var n = 0;
    if (state.q) { n += 1; }
    n += state.skills.length;
    if (state.min) { n += 1; }
    if (state.region !== 'all') { n += 1; }
    if (state.difficulty !== 'all') { n += 1; }
    if (state.status !== 'all') { n += 1; }
    if (state.token !== 'all') { n += 1; }
    if (state.hideCrowded) { n += 1; }
    return n;
  }

  function skillIds() {
    var out = [];
    var skills = (DATA && DATA.skills) || [];
    for (var i = 0; i < skills.length; i += 1) { out.push(skills[i].id); }
    return out;
  }

  /** Region names ship as English strings in the dataset; the Thai UI needs Thai labels. */
  function regionLabel(value) {
    var names = t().regionNames || {};
    return names[value] || value;
  }

  function skillLabel(id) {
    var skills = (DATA && DATA.skills) || [];
    for (var i = 0; i < skills.length; i += 1) {
      if (skills[i].id === id) { return state.lang === 'en' ? skills[i].en : skills[i].th; }
    }
    return id;
  }

  function skillEmoji(id) {
    var skills = (DATA && DATA.skills) || [];
    for (var i = 0; i < skills.length; i += 1) {
      if (skills[i].id === id) { return skills[i].emoji || ''; }
    }
    return '';
  }

  /* ------------------------------------------------------------------ *
   * Filtering + sorting                                                 *
   * ------------------------------------------------------------------ */

  function matchesQuery(listing, needle) {
    if (!needle) { return true; }
    var sponsor = listing.sponsor || {};
    var hay = (listing.title + ' ' + (sponsor.name || '') + ' ' +
      (sponsor.handle || '') + ' ' + (listing.tags || []).join(' ')).toLowerCase();
    return hay.indexOf(needle) >= 0;
  }

  /** `skipType` lets the tab counter ask "how many would match if this type were selected?" */
  function filterListings(skipType) {
    var needle = state.q.trim().toLowerCase();
    var out = [];
    for (var i = 0; i < allListings.length; i += 1) {
      var listing = allListings[i];
      if (!skipType && state.type !== 'all' && listing.type !== state.type) { continue; }
      if (state.skills.length && state.skills.indexOf(listing.skill) < 0) { continue; }
      if (state.region !== 'all' && listing.region !== state.region) { continue; }
      if (state.difficulty !== 'all' && listing.difficulty !== state.difficulty) { continue; }
      if (state.status !== 'all' && listing.status !== state.status) { continue; }
      if (state.token !== 'all' && (!listing.reward || listing.reward.token !== state.token)) { continue; }
      if (state.min && num(listing.reward && listing.reward.usd, 0) < state.min) { continue; }
      if (state.hideCrowded && heatOf(listing).level >= 4) { continue; }
      if (!matchesQuery(listing, needle)) { continue; }
      out.push(listing);
    }
    return out;
  }

  function sortListings(rows) {
    var sorted = rows.slice();
    if (state.sort === 'reward') {
      sorted.sort(function (a, b) { return num(b.reward.usd, 0) - num(a.reward.usd, 0); });
      return sorted;
    }
    if (state.sort === 'deadline') {
      sorted.sort(function (a, b) {
        var ad = heatOf(a), bd = heatOf(b);
        if (ad.closed !== bd.closed) { return ad.closed ? 1 : -1; }
        return ad.deadline - bd.deadline;
      });
      return sorted;
    }
    if (state.sort === 'newest') {
      sorted.sort(function (a, b) { return heatOf(b).posted - heatOf(a).posted; });
      return sorted;
    }

    /* Best $/hour — the whole point of the app. EarnCalculator owns the maths. */
    if (!CALC || typeof CALC.rankListings !== 'function') { return sorted; }
    /* skillEdge 1.0 = "no better than the average entrant". This board's audience is new by
       definition, so the default ranking must not quietly assume an edge they have not shown. */
    var ranked = CALC.rankListings(sorted, {
      skills: state.skills,
      skillEdge: 1,
      hoursAvailable: 0
    });
    var order = [];
    var seen = {};
    for (var i = 0; i < ranked.length; i += 1) {
      order.push(ranked[i].listing);
      seen[ranked[i].listing.id] = true;
    }
    /* rankListings only scores open listings; closed rows keep their place at the end. */
    for (var j = 0; j < sorted.length; j += 1) {
      if (!seen[sorted[j].id]) { order.push(sorted[j]); }
    }
    return order;
  }

  /* ------------------------------------------------------------------ *
   * Card rendering                                                      *
   * ------------------------------------------------------------------ */

  function initials(name) {
    var words = String(name || '?').trim().split(/\s+/).slice(0, 2);
    var out = '';
    for (var i = 0; i < words.length; i += 1) { out += words[i].charAt(0); }
    return out.toUpperCase() || '?';
  }

  /** The one place data reaches innerHTML: the search-term highlight inside a card title. */
  function paintTitle(anchor, title, needle) {
    if (!needle) { anchor.textContent = title; return; }
    var re = new RegExp(escapeRegExp(needle), 'ig');
    if (!re.test(title)) { anchor.textContent = title; return; }
    re.lastIndex = 0;
    anchor.innerHTML = escapeHtml(title).replace(
      new RegExp(escapeRegExp(escapeHtml(needle)), 'ig'),
      function (hit) { return '<mark>' + hit + '</mark>'; }
    );
  }

  function buildHeatStrip(listing, heat, copy) {
    var strip = el('div', 'card__heat');
    var label = copy.heat.levels[heat.level - 1];

    var meter = el('span', 'heat-meter');
    meter.setAttribute('role', 'img');
    meter.setAttribute('aria-label', copy.heat.aria(label, heat.level, heat.subs, heat.projected));
    for (var i = 1; i <= 5; i += 1) {
      var cell = el('i', 'heat-cell' + (i <= heat.level ? ' is-on' : '') + (i === heat.level ? ' is-last' : ''));
      cell.style.setProperty('--i', String(i - 1));
      meter.appendChild(cell);
    }
    strip.appendChild(meter);

    strip.appendChild(el('span', 'heat-label', label));
    strip.appendChild(el('span', 'heat-sep', '·'));

    var count = el('span', 'heat-count');
    count.appendChild(el('b', null, fmtInt(heat.subs)));
    count.appendChild(doc.createTextNode(' '));
    count.appendChild(el('span', null, copy.card.entries));
    strip.appendChild(count);

    var pace = el('span', 'heat-pace');
    pace.setAttribute('data-pace', heat.pace);
    pace.title = copy.heat.paceTitle(heat.perDay, heat.medianPerDay, skillLabel(listing.skill));
    var glyph = el('span', null, heat.pace === 'rising' ? '▲' : heat.pace === 'cooling' ? '▼' : '▬');
    glyph.setAttribute('aria-hidden', 'true');
    pace.appendChild(glyph);
    pace.appendChild(el('span', 'sr-only', copy.heat.pace[heat.pace]));
    strip.appendChild(pace);

    var evBtn = el('button', 'heat-ev');
    evBtn.type = 'button';
    evBtn.setAttribute('aria-label', copy.card.evAria(heat.evPerEntry, listing.title));
    evBtn.appendChild(el('span', 'label-micro', copy.card.ev));
    evBtn.appendChild(el('span', 'num', fmtUsd(heat.evPerEntry)));
    evBtn.addEventListener('click', function () { prefillCalculator(listing); });
    strip.appendChild(evBtn);

    return strip;
  }

  function buildCard(listing, needle) {
    var copy = t();
    var heat = heatOf(listing);
    var card = el('article', 'card');
    card.setAttribute('data-heat', String(heat.level));
    card.setAttribute('data-id', listing.id);
    if (heat.closed || listing.status === 'completed') { card.setAttribute('data-closed', 'true'); }

    var logo = el('div', 'card__logo', initials(listing.sponsor && listing.sponsor.name));
    logo.setAttribute('aria-hidden', 'true');
    card.appendChild(logo);

    var body = el('div', 'card__body');

    var badges = el('div', 'card__badges');
    badges.appendChild(el('span', 'badge', copy.card.type[listing.type] || listing.type));
    if (listing.status === 'in-review') { badges.appendChild(el('span', 'badge badge--review', copy.card.review)); }
    else if (listing.status === 'completed') { badges.appendChild(el('span', 'badge badge--done', copy.card.done)); }
    else if (!heat.closed && heat.deadline - Date.now() < 48 * 36e5) { badges.appendChild(el('span', 'badge badge--closing', copy.card.closing)); }
    body.appendChild(badges);

    var title = el('h3', 'card__title');
    var link = el('a', 'card__hit');
    link.href = listing.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    paintTitle(link, listing.title, needle);
    link.appendChild(el('span', 'sr-only', ' (' + copy.card.openAria + ')'));
    title.appendChild(link);
    body.appendChild(title);

    var sponsor = el('p', 'card__sponsor');
    sponsor.appendChild(el('span', 'card__sponsor-name', (listing.sponsor && listing.sponsor.name) || ''));
    /* No verification tick. The snapshot never checked Earn's sponsor-verification state, so
       the page has no basis to vouch for a sponsor and must not draw a trust mark. */
    sponsor.appendChild(el('span', 'card__meta',
      '· ' + regionLabel(listing.region) + ' · ' + copy.card.hours(listing.estimatedHours)));
    body.appendChild(sponsor);

    var skills = el('ul', 'card__skills');
    var skillChip = el('li', 'card__skill', skillEmoji(listing.skill) + ' ' + skillLabel(listing.skill));
    skills.appendChild(skillChip);
    /* The design caps the chip row at 2 chips + "+N" on a 360px card, 3 above it. */
    var tags = (listing.tags || []).slice(0, isNarrow() ? 1 : 2);
    for (var i = 0; i < tags.length; i += 1) { skills.appendChild(el('li', 'card__skill', tags[i])); }
    var extra = (listing.tags || []).length - tags.length;
    if (extra > 0) { skills.appendChild(el('li', 'card__skill', '+' + fmtInt(extra))); }
    body.appendChild(skills);

    card.appendChild(body);

    var reward = el('div', 'card__reward');
    reward.appendChild(el('span', 'card__amount num', fmtInt(listing.reward.amount)));
    reward.appendChild(el('span', 'card__token', listing.reward.token));
    var view = countdownFor(heat.deadline);
    var time = el('time', 'countdown', view.text);
    time.setAttribute('datetime', new Date(heat.deadline).toISOString());
    time.setAttribute('data-tier', view.tier);
    reward.appendChild(time);
    countdownNodes.push({ node: time, deadline: heat.deadline });
    var chev = el('span', 'card__chevron', '›');
    chev.setAttribute('aria-hidden', 'true');
    reward.appendChild(chev);
    card.appendChild(reward);

    card.appendChild(buildHeatStrip(listing, heat, copy));
    return card;
  }

  /* ------------------------------------------------------------------ *
   * Calculator bridge                                                   *
   * ------------------------------------------------------------------ */

  function calcRoot() { return byId('ev-calculator'); }

  function setCalcInput(key, value) {
    var root = calcRoot();
    if (!root || typeof root.querySelector !== 'function') { return false; }
    var input = root.querySelector('input.calc-input[id$="-' + key + '"]');
    if (!input) { return false; }
    input.value = String(value);
    input.dispatchEvent(new global.Event('input', { bubbles: true }));
    return true;
  }

  function renderCalcEyebrow() {
    var node = byId('calc-eyebrow');
    if (!node) { return; }
    clear(node);
    if (!prefilled) {
      node.textContent = t().calc.eyebrow;
      return;
    }
    node.appendChild(doc.createTextNode(t().calc.from + prefilled.title));
    var btn = el('button', 'calc-best-use', t().calc.clear);
    btn.type = 'button';
    btn.style.marginLeft = '8px';
    btn.addEventListener('click', function () {
      prefilled = null;
      renderCalcEyebrow();
    });
    node.appendChild(btn);
  }

  /* Loads the listing's OWN published numbers. It must not substitute heat.projected here:
     the submissions field is documented to the reader as "the Submissions count on the
     listing", and the calculator's "use these numbers" button fills that same actual count.
     Two controls that claim to load one listing have to load the same listing. */
  function prefillCalculator(listing) {
    var ok = setCalcInput('prizeUsd', Math.round(num(listing.reward.usd, 0)));
    setCalcInput('submissions', Math.max(0, Math.floor(num(listing.submissions, 0))));
    setCalcInput('hours', listing.estimatedHours);
    if (!ok) { return; }
    prefilled = listing;
    renderCalcEyebrow();
    var panel = byId('calc');
    if (panel) {
      panel.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      panel.focus({ preventScroll: true });
    }
  }

  function mountCalculator(dataView) {
    var root = calcRoot();
    if (!root || !CALC || typeof CALC.mount !== 'function') { return; }
    CALC.mount(root, { data: dataView, lang: state.lang });
  }

  /* ------------------------------------------------------------------ *
   * Static chrome renderers                                             *
   * ------------------------------------------------------------------ */

  function applyStaticCopy() {
    var copy = t();
    var i, nodes;

    nodes = doc.querySelectorAll('[data-i18n]');
    for (i = 0; i < nodes.length; i += 1) {
      var value = lookup(copy, nodes[i].getAttribute('data-i18n'));
      if (typeof value === 'string') { nodes[i].textContent = value; }
    }
    nodes = doc.querySelectorAll('[data-i18n-aria-label]');
    for (i = 0; i < nodes.length; i += 1) {
      var aria = lookup(copy, nodes[i].getAttribute('data-i18n-aria-label'));
      if (typeof aria === 'string') { nodes[i].setAttribute('aria-label', aria); }
    }
  }

  function lookup(root, path) {
    var parts = String(path).split('.');
    var node = root;
    for (var i = 0; i < parts.length; i += 1) {
      if (!node || typeof node !== 'object') { return null; }
      node = node[parts[i]];
    }
    return node;
  }

  function renderHero() {
    var copy = t();
    var stats = (DATA && DATA.stats) || {};
    var openCount = 0;
    var rewards = [];
    var evs = [];
    for (var i = 0; i < allListings.length; i += 1) {
      if (allListings[i].status === 'open' && !heatOf(allListings[i]).closed) { openCount += 1; }
      rewards.push(num(allListings[i].reward.usd, 0));
      evs.push(heatOf(allListings[i]).evPerEntry);
    }

    setText('hero-eyebrow', copy.hero.eyebrow(openCount, (DATA && DATA.generatedAt) || ''));

    var h1 = byId('hero-h1');
    if (h1) {
      /* escapeHtml guards the copy before the one gradient span is spliced in. */
      h1.innerHTML = escapeHtml(copy.hero.h1).replace('{g}',
        '<span class="grad-word">' + escapeHtml(copy.hero.gradWord) + '</span>');
    }

    setText('hero-sub', copy.hero.sub);
    var alt = setText('hero-sub-alt', copy.hero.subAlt);
    if (alt) { alt.lang = copy.hero.subAltLang; }

    setText('counter-label', copy.hero.counterLabel);
    /* The base rate sits with the number it qualifies. Moving it further down the page is how
       a lifetime platform total ends up reading as a personal forecast. */
    setText('counter-reality', copy.hero.counterReality);
    setText('counter-sub', copy.hero.counterSub(stats.sponsors, stats.talent, (DATA && DATA.generatedAt) || ''));

    var pills = byId('hero-pills');
    if (pills) {
      clear(pills);
      var rows = [
        [copy.pills.open, fmtInt(openCount)],
        [copy.pills.median, fmtUsd(median(rewards))],
        [copy.pills.ev, fmtUsd(median(evs))],
        [copy.pills.talent, fmtCount(stats.talent)]
      ];
      for (var p = 0; p < rows.length; p += 1) {
        var pill = el('li', 'pill');
        pill.appendChild(el('span', 'label-micro', rows[p][0]));
        pill.appendChild(el('span', 'pill__value', rows[p][1]));
        pills.appendChild(pill);
      }
    }

    setText('cta-primary', copy.hero.ctaPrimary);
    setText('cta-secondary', copy.hero.ctaSecondary);
    setText('cta-note', copy.hero.ctaNote);
    setText('ticker-label', copy.hero.tickerLabel);

    renderTicker();
  }

  function renderTicker() {
    var track = byId('ticker-track');
    var stat = byId('ticker-static');
    if (!track || !stat) { return; }
    clear(track);
    clear(stat);

    var rows = allListings.slice().sort(function (a, b) {
      return num(b.reward.usd, 0) - num(a.reward.usd, 0);
    }).slice(0, 10);

    function item(listing) {
      var node = el('span', 'ticker__item');
      var sponsor = listing.sponsor || {};
      var credit = sponsor.handle || sponsor.name || '';
      node.appendChild(el('b', null, fmtUsd(listing.reward.usd)));
      node.appendChild(doc.createTextNode(' — ' + listing.title + (credit ? ' · ' + credit : '')));
      return node;
    }

    for (var pass = 0; pass < 2; pass += 1) {
      for (var i = 0; i < rows.length; i += 1) { track.appendChild(item(rows[i])); }
    }
    for (var s = 0; s < 3 && s < rows.length; s += 1) {
      var li = el('li');
      li.appendChild(item(rows[s]));
      stat.appendChild(li);
    }
  }

  function animateCounter() {
    var node = byId('paidCounter');
    if (!node) { return; }
    var target = num(DATA && DATA.stats && DATA.stats.totalPaidUsd, 0);
    var fmt = nf({ style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    var final = fmt.format(target);
    node.setAttribute('aria-label', final);

    if (prefersReducedMotion() || !global.requestAnimationFrame) {
      node.textContent = final;
      return;
    }
    var from = Math.round(target * 0.9);
    var start = 0;
    var dur = 1400;
    function frame(now) {
      if (!start) { start = now; }
      var p = Math.min(1, (now - start) / dur);
      var eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      node.textContent = fmt.format(Math.round(from + (target - from) * eased));
      if (p < 1) { global.requestAnimationFrame(frame); }
      else { node.textContent = final; }
    }
    global.requestAnimationFrame(frame);
  }

  /* ---- tabs ---- */

  var TAB_TYPES = ['all', 'bounty', 'project', 'grant'];

  function buildTabs() {
    var host = byId('tabs');
    if (!host) { return; }
    clear(host);
    for (var i = 0; i < TAB_TYPES.length; i += 1) {
      (function (type) {
        var btn = el('button', 'tab');
        btn.type = 'button';
        btn.setAttribute('role', 'tab');
        btn.setAttribute('data-type', type);
        btn.appendChild(el('span', 'tab__label'));
        btn.appendChild(el('span', 'tab__count num'));
        btn.addEventListener('click', function () { selectTab(type, false); });
        btn.addEventListener('keydown', onTabKey);
        host.appendChild(btn);
      }(TAB_TYPES[i]));
    }
  }

  function onTabKey(event) {
    var keys = { ArrowLeft: -1, ArrowRight: 1 };
    var host = byId('tabs');
    if (!host) { return; }
    var tabs = host.querySelectorAll('.tab');
    var index = TAB_TYPES.indexOf(state.type);
    if (index < 0) { index = 0; }
    var next = null;
    if (Object.prototype.hasOwnProperty.call(keys, event.key)) {
      next = (index + keys[event.key] + TAB_TYPES.length) % TAB_TYPES.length;
    } else if (event.key === 'Home') { next = 0; }
    else if (event.key === 'End') { next = TAB_TYPES.length - 1; }
    if (next === null) { return; }
    event.preventDefault();
    selectTab(TAB_TYPES[next], false);
    if (tabs[next]) { tabs[next].focus(); }
  }

  function selectTab(type, silent) {
    state.type = type;
    render();
    if (!silent) { writeHash(); }
  }

  function paintTabs(counts) {
    var host = byId('tabs');
    if (!host) { return; }
    var copy = t();
    var tabs = host.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i += 1) {
      var type = tabs[i].getAttribute('data-type');
      var selected = type === state.type;
      tabs[i].setAttribute('aria-selected', selected ? 'true' : 'false');
      tabs[i].tabIndex = selected ? 0 : -1;
      var label = tabs[i].querySelector('.tab__label');
      var count = tabs[i].querySelector('.tab__count');
      if (label) { label.textContent = copy.tabs[type]; }
      if (count) { count.textContent = fmtInt(counts[type] || 0); }
    }
    host.classList.toggle('is-scrollable', host.scrollWidth > host.clientWidth + 1);
  }

  /* ---- filters ---- */

  var filtersWired = false;

  function buildFilters() {
    var copy = t();

    var search = byId('q');
    if (search) {
      search.value = state.q;
      search.placeholder = copy.filters.searchPlaceholder;
      search.setAttribute('lang', copy.htmlLang);
      if (!filtersWired) { search.addEventListener('input', function () {
        if (searchTimer) { global.clearTimeout(searchTimer); }
        searchTimer = global.setTimeout(function () {
          state.q = search.value;
          render();
          writeHash();
        }, 200);
      }); }
    }

    var skillHost = byId('chips-skill');
    if (skillHost) {
      clear(skillHost);
      var skills = (DATA && DATA.skills) || [];
      for (var i = 0; i < skills.length; i += 1) {
        (function (skill) {
          var chip = el('button', 'chip');
          chip.type = 'button';
          chip.setAttribute('data-skill', skill.id);
          chip.setAttribute('aria-pressed', 'false');
          chip.appendChild(el('span', 'chip__emoji', skill.emoji || ''));
          chip.appendChild(el('span', 'chip__label'));
          chip.addEventListener('click', function () { toggleSkill(skill.id); });
          skillHost.appendChild(chip);
        }(skills[i]));
      }
    }

    var miscHost = byId('chips-misc');
    if (miscHost) {
      clear(miscHost);
      var tiers = [[500, 'min500'], [1000, 'min1k'], [5000, 'min5k']];
      for (var m = 0; m < tiers.length; m += 1) {
        (function (tier) {
          var chip = el('button', 'chip');
          chip.type = 'button';
          chip.setAttribute('data-min', String(tier[0]));
          chip.setAttribute('data-copy', tier[1]);
          chip.setAttribute('aria-pressed', 'false');
          chip.appendChild(el('span', 'chip__label'));
          chip.addEventListener('click', function () {
            state.min = state.min === tier[0] ? 0 : tier[0];
            render();
            writeHash();
          });
          miscHost.appendChild(chip);
        }(tiers[m]));
      }
      var crowd = el('button', 'chip chip--heat');
      crowd.type = 'button';
      crowd.id = 'chip-crowded';
      crowd.setAttribute('aria-pressed', 'false');
      crowd.appendChild(el('span', 'chip__label'));
      crowd.addEventListener('click', function () { toggleCrowded(); });
      miscHost.appendChild(crowd);
    }

    var selects = byId('selects');
    if (selects) {
      clear(selects);
      selects.appendChild(buildSelect('region', regionOptions()));
      selects.appendChild(buildSelect('difficulty', DIFFICULTIES));
      selects.appendChild(buildSelect('status', STATUSES));
      selects.appendChild(buildSelect('token', tokenOptions()));
    }

    var sort = byId('sort');
    if (sort) {
      clear(sort);
      var sorts = SORT_KEYS;
      for (var s = 0; s < sorts.length; s += 1) {
        var opt = doc.createElement('option');
        opt.value = sorts[s];
        opt.textContent = copy.sort[sorts[s]];
        sort.appendChild(opt);
      }
      sort.value = state.sort;
      if (!filtersWired) {
        sort.addEventListener('change', function () {
          state.sort = sort.value;
          render();
          writeHash();
        });
      }
    }
    filtersWired = true;
  }

  function regionOptions() {
    var seen = {};
    var out = [];
    var declared = (DATA && DATA.regions) || [];
    var i;
    for (i = 0; i < declared.length; i += 1) { seen[declared[i]] = true; }
    /* a live refresh can introduce a region the seed filter never saw */
    for (i = 0; i < allListings.length; i += 1) { seen[allListings[i].region] = true; }
    for (var key in seen) {
      if (Object.prototype.hasOwnProperty.call(seen, key)) { out.push(key); }
    }
    return out.sort();
  }

  function tokenOptions() {
    var seen = {};
    for (var i = 0; i < allListings.length; i += 1) {
      if (allListings[i].reward && allListings[i].reward.token) { seen[allListings[i].reward.token] = true; }
    }
    var out = [];
    for (var key in seen) {
      if (Object.prototype.hasOwnProperty.call(seen, key)) { out.push(key); }
    }
    return out.sort();
  }

  function buildSelect(key, values) {
    var wrap = el('div', 'selectwrap');
    var select = el('select', 'select');
    select.id = 'filter-' + key;
    select.setAttribute('data-filter', key);
    var label = el('label', 'sr-only', key);
    label.setAttribute('for', select.id);
    var head = doc.createElement('option');
    head.value = 'all';
    select.appendChild(head);
    for (var i = 0; i < values.length; i += 1) {
      var opt = doc.createElement('option');
      opt.value = values[i];
      select.appendChild(opt);
    }
    select.value = state[key];
    select.addEventListener('change', function () {
      state[key] = select.value;
      render();
      writeHash();
    });
    wrap.appendChild(label);
    wrap.appendChild(select);
    return wrap;
  }

  function optionLabel(key, value) {
    var copy = t();
    if (value === 'all') { return copy.filters[key]; }
    if (key === 'difficulty') { return copy.diff[value] || value; }
    if (key === 'status') { return copy.status[value] || value; }
    if (key === 'region') { return regionLabel(value); }
    return value;
  }

  function paintFilters() {
    var copy = t();
    var i, nodes;

    /* The search box is built once but its placeholder is language-dependent, and a language
       switch only re-paints — it never rebuilds the filter bar. Re-paint the two localised
       attributes here or the placeholder stays in whichever language booted the page. */
    var searchBox = byId('q');
    if (searchBox) {
      searchBox.placeholder = copy.filters.searchPlaceholder;
      searchBox.setAttribute('lang', copy.htmlLang);
    }

    nodes = doc.querySelectorAll('#chips-skill .chip');
    for (i = 0; i < nodes.length; i += 1) {
      var id = nodes[i].getAttribute('data-skill');
      nodes[i].setAttribute('aria-pressed', state.skills.indexOf(id) >= 0 ? 'true' : 'false');
      var label = nodes[i].querySelector('.chip__label');
      if (label) { label.textContent = skillLabel(id); }
    }

    nodes = doc.querySelectorAll('#chips-misc .chip[data-min]');
    for (i = 0; i < nodes.length; i += 1) {
      var minValue = num(nodes[i].getAttribute('data-min'), 0);
      nodes[i].setAttribute('aria-pressed', state.min === minValue ? 'true' : 'false');
      var minLabel = nodes[i].querySelector('.chip__label');
      if (minLabel) { minLabel.textContent = copy.filters[nodes[i].getAttribute('data-copy')]; }
    }

    var crowd = byId('chip-crowded');
    if (crowd) {
      crowd.setAttribute('aria-pressed', state.hideCrowded ? 'true' : 'false');
      var crowdLabel = crowd.querySelector('.chip__label');
      if (crowdLabel) { crowdLabel.textContent = copy.filters.hideCrowded; }
    }

    nodes = doc.querySelectorAll('.select[data-filter]');
    for (i = 0; i < nodes.length; i += 1) {
      var key = nodes[i].getAttribute('data-filter');
      var options = nodes[i].options;
      for (var o = 0; o < options.length; o += 1) {
        options[o].textContent = optionLabel(key, options[o].value);
      }
      if (nodes[i].value !== state[key]) { nodes[i].value = state[key]; }
      var srLabel = doc.querySelector('label[for="' + nodes[i].id + '"]');
      if (srLabel) { srLabel.textContent = copy.filters[key]; }
    }

    var sort = byId('sort');
    if (sort) {
      for (var s = 0; s < sort.options.length; s += 1) {
        sort.options[s].textContent = copy.sort[sort.options[s].value];
      }
      if (sort.value !== state.sort) { sort.value = state.sort; }
    }

    var count = activeFilterCount();
    var badge = byId('filters-count');
    if (badge) {
      badge.textContent = fmtInt(count);
      badge.hidden = count === 0;
    }

    var legendShortcut = byId('legend-shortcut');
    if (legendShortcut) {
      legendShortcut.textContent = copy.filters.hideCrowded;
      legendShortcut.setAttribute('aria-pressed', state.hideCrowded ? 'true' : 'false');
      legendShortcut.className = 'chip chip--heat legend__shortcut';
    }
  }

  function toggleSkill(id) {
    var at = state.skills.indexOf(id);
    if (at >= 0) { state.skills.splice(at, 1); } else { state.skills.push(id); }
    render();
    writeHash();
  }

  function toggleCrowded() {
    state.hideCrowded = !state.hideCrowded;
    render();
    writeHash();
  }

  function clearFilters() {
    state.q = DEFAULTS.q;
    state.skills = [];
    state.min = DEFAULTS.min;
    state.region = DEFAULTS.region;
    state.difficulty = DEFAULTS.difficulty;
    state.status = DEFAULTS.status;
    state.token = DEFAULTS.token;
    state.hideCrowded = false;
    var search = byId('q');
    if (search) { search.value = ''; }
    render();
    writeHash();
  }

  /* ---- heat legend ---- */

  function renderLegend() {
    var copy = t();
    setText('legend-summary-text', copy.heat.legendTitle);
    setText('legend-method', copy.heat.method);
    var list = byId('legend-list');
    if (!list) { return; }
    clear(list);
    for (var level = 1; level <= 5; level += 1) {
      var row = el('li', 'legend__row');
      row.style.setProperty('--heat', 'var(--heat-' + level + ')');
      row.style.setProperty('--heat-ink', 'var(--heat-' + level + '-ink)');
      var meter = el('span', 'heat-meter');
      meter.setAttribute('aria-hidden', 'true');
      for (var i = 1; i <= 5; i += 1) {
        var cell = el('i', 'heat-cell' + (i <= level ? ' is-on' : ''));
        cell.style.setProperty('--i', String(i - 1));
        meter.appendChild(cell);
      }
      row.appendChild(meter);
      row.appendChild(el('span', 'legend__row-label', copy.heat.levels[level - 1]));
      row.appendChild(el('span', 'legend__row-range num', copy.heat.ranges[level - 1]));
      list.appendChild(row);
    }
  }

  /* ---- playbook ---- */

  function renderPlaybook() {
    var copy = t();
    var locale = PLAYBOOK && (PLAYBOOK[state.lang] || PLAYBOOK.th);
    if (!locale) { return; }

    setText('playbook-eyebrow', copy.playbook.eyebrow);
    setText('playbook-title', locale.title);
    setText('playbook-sub', locale.subtitle);
    setText('playbook-foot', copy.playbook.foot);
    setText('pb-steps-h', copy.playbook.steps);
    setText('pb-plays-h', copy.playbook.plays);
    setText('pb-mistakes-h', copy.playbook.mistakes);
    setText('pb-faq-h', copy.playbook.faq);

    var steps = byId('pb-steps');
    if (steps) {
      clear(steps);
      var frag = doc.createDocumentFragment();
      for (var i = 0; i < locale.steps.length; i += 1) {
        var step = locale.steps[i];
        var li = el('li', 'step');
        li.appendChild(el('span', 'step__n', String(step.n).length < 2 ? '0' + step.n : String(step.n)));
        li.appendChild(el('h4', 'step__title', step.title));
        li.appendChild(el('p', 'step__body', step.body));
        frag.appendChild(li);
      }
      steps.appendChild(frag);
    }

    var plays = byId('pb-plays');
    if (plays) {
      clear(plays);
      var playFrag = doc.createDocumentFragment();
      for (var p = 0; p < locale.plays.length; p += 1) {
        var play = locale.plays[p];
        var card = el('article', 'play');
        card.appendChild(el('h4', 'play__title', play.title));
        card.appendChild(el('p', 'play__body', play.body));
        var tags = el('div', 'play__tags');
        for (var tg = 0; tg < (play.tags || []).length; tg += 1) {
          tags.appendChild(el('span', 'play__tag', play.tags[tg]));
        }
        card.appendChild(tags);
        playFrag.appendChild(card);
      }
      plays.appendChild(playFrag);
    }

    var mistakes = byId('pb-mistakes');
    if (mistakes) {
      clear(mistakes);
      var mFrag = doc.createDocumentFragment();
      for (var m = 0; m < locale.mistakes.length; m += 1) {
        var li2 = el('li', 'mistake');
        li2.appendChild(el('h4', 'mistake__title', locale.mistakes[m].title));
        li2.appendChild(el('p', 'mistake__body', locale.mistakes[m].body));
        mFrag.appendChild(li2);
      }
      mistakes.appendChild(mFrag);
    }

    var faq = byId('pb-faq');
    if (faq) {
      clear(faq);
      var fFrag = doc.createDocumentFragment();
      for (var f = 0; f < locale.faq.length; f += 1) {
        var details = el('details', 'faq__item');
        var summary = el('summary', 'faq__q', locale.faq[f].q);
        details.appendChild(summary);
        details.appendChild(el('div', 'faq__a', locale.faq[f].a));
        fFrag.appendChild(details);
      }
      faq.appendChild(fFrag);
    }
  }

  /* ---- footer ---- */

  /** meta.sourceNotes ships as { th, en }; tolerate an older plain-string dataset. */
  function sourceNotesText() {
    var notes = DATA && DATA.meta && DATA.meta.sourceNotes;
    if (!notes) { return ''; }
    if (typeof notes === 'string') { return notes; }
    return notes[state.lang] || notes.en || notes.th || '';
  }

  function renderFooter() {
    var copy = t();
    setText('footer-blurb', copy.footer.blurb);
    setText('footer-meta', copy.footer.meta(allListings.length, (DATA && DATA.generatedAt) || ''));
    setText('footer-copy', copy.footer.copy);
    setText('footer-disclaimer', copy.footer.disclaimer);
    /* EARN_DATA.meta.sourceNotes qualifies every statistic the page prints. It is reader-facing
       and bilingual; leaving it unrendered puts unaudited figures on screen bare. */
    setText('footer-sources', sourceNotesText());

    fillFooterList('footer-browse', [
      { label: copy.tabs.all, action: function () { state.type = 'all'; } },
      { label: copy.tabs.bounty, action: function () { state.type = 'bounty'; } },
      { label: copy.tabs.project, action: function () { state.type = 'project'; } },
      { label: copy.tabs.grant, action: function () { state.type = 'grant'; } },
      { label: copy.footer.leastCrowded, action: function () { state.hideCrowded = true; state.sort = 'ev'; } }
    ]);

    fillFooterList('footer-learn', [
      { label: copy.footer.playbookLink, href: '#playbook' },
      { label: copy.footer.heat, href: '#legend', action: openLegend },
      { label: copy.footer.calc, href: '#calc' }
    ]);

    fillFooterList('footer-about', [
      { label: copy.footer.official, href: 'https://superteam.fun/earn/', external: true },
      { label: copy.footer.allListings, href: 'https://superteam.fun/earn/all', external: true },
      { label: copy.footer.disclaimerLink, href: '#footer-disclaimer' }
    ]);
  }

  function fillFooterList(id, rows) {
    var host = byId(id);
    if (!host) { return; }
    clear(host);
    for (var i = 0; i < rows.length; i += 1) {
      (function (row) {
        var li = el('li');
        var a = el('a', null, row.label);
        a.href = row.href || '#listings';
        if (row.external) {
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
        } else if (row.action) {
          a.addEventListener('click', function () {
            row.action();
            render();
            writeHash();
          });
        }
        li.appendChild(a);
        host.appendChild(li);
      }(rows[i]));
    }
  }

  function openLegend() {
    var legend = byId('legend');
    if (legend) { legend.open = true; }
  }

  /* ---- empty state ---- */

  function renderEmpty(hiddenByCrowding) {
    var copy = t();
    setText('empty-title', copy.empty.title);
    setText('empty-body', copy.empty.body);
    setText('empty-active-label', copy.empty.active);
    setText('empty-clear', copy.empty.clear);
    setText('empty-uncrowd', copy.empty.uncrowd);
    setText('empty-hint', copy.empty.hint(hiddenByCrowding));

    var hint = byId('empty-hint');
    if (hint) { hint.hidden = !state.hideCrowded; }
    var uncrowd = byId('empty-uncrowd');
    if (uncrowd) { uncrowd.hidden = !state.hideCrowded; }

    var chips = byId('empty-chips');
    if (!chips) { return; }
    clear(chips);

    var active = [];
    if (state.q) { active.push({ label: '"' + state.q + '"', off: function () { state.q = ''; var s = byId('q'); if (s) { s.value = ''; } } }); }
    for (var i = 0; i < state.skills.length; i += 1) {
      (function (id) { active.push({ label: skillLabel(id), off: function () { state.skills.splice(state.skills.indexOf(id), 1); } }); }(state.skills[i]));
    }
    if (state.min) { active.push({ label: fmtUsd(state.min) + '+', off: function () { state.min = 0; } }); }
    if (state.region !== 'all') { active.push({ label: regionLabel(state.region), off: function () { state.region = 'all'; } }); }
    if (state.difficulty !== 'all') { active.push({ label: optionLabel('difficulty', state.difficulty), off: function () { state.difficulty = 'all'; } }); }
    if (state.status !== 'all') { active.push({ label: optionLabel('status', state.status), off: function () { state.status = 'all'; } }); }
    if (state.token !== 'all') { active.push({ label: state.token, off: function () { state.token = 'all'; } }); }
    if (state.hideCrowded) { active.push({ label: copy.filters.hideCrowded, off: function () { state.hideCrowded = false; } }); }

    for (var a = 0; a < active.length; a += 1) {
      (function (row) {
        var chip = el('button', 'chip', row.label);
        chip.type = 'button';
        chip.setAttribute('aria-pressed', 'true');
        chip.addEventListener('click', function () {
          row.off();
          render();
          writeHash();
        });
        chips.appendChild(chip);
      }(active[a]));
    }
  }

  /* ------------------------------------------------------------------ *
   * Main render                                                         *
   * ------------------------------------------------------------------ */

  function render() {
    if (!booted) { return; }
    var copy = t();
    var list = byId('listings');
    var empty = byId('empty');
    if (!list) { return; }

    var withoutType = filterListings(true);
    var counts = { all: withoutType.length, bounty: 0, project: 0, grant: 0 };
    for (var c = 0; c < withoutType.length; c += 1) {
      if (counts[withoutType[c].type] !== undefined) { counts[withoutType[c].type] += 1; }
    }
    paintTabs(counts);
    paintFilters();

    visible = sortListings(filterListings(false));
    countdownNodes = [];

    var needle = state.q.trim();
    var frag = doc.createDocumentFragment();
    for (var i = 0; i < visible.length; i += 1) { frag.appendChild(buildCard(visible[i], needle)); }

    /* Park the calculator in the rail before wiping the feed — clearing the feed while the
       panel is parked inside it would detach it from the document and lose it for good. */
    var host = byId('calc-host');
    var rail = byId('rail');
    if (host && rail && host.parentNode === list) { rail.insertBefore(host, rail.firstChild); }

    clear(list);
    list.appendChild(frag);

    var evs = [];
    for (var e = 0; e < visible.length; e += 1) { evs.push(heatOf(visible[e]).evPerEntry); }
    setText('resultline', copy.result(visible.length, median(evs)));

    var hiddenByCrowding = 0;
    if (state.hideCrowded) {
      var wasHiding = state.hideCrowded;
      state.hideCrowded = false;
      hiddenByCrowding = filterListings(false).length - visible.length;
      state.hideCrowded = wasHiding;
    }

    if (empty) {
      empty.hidden = visible.length > 0;
      if (!empty.hidden) { renderEmpty(Math.max(0, hiddenByCrowding)); }
    }
    list.hidden = visible.length === 0;

    placeCalculator();
    syncStickyOffset();
    refreshCountdowns();
  }

  /* The calculator lives in the rail at >=1100px and inline after the 5th card below that. */
  function placeCalculator() {
    var host = byId('calc-host');
    var rail = byId('rail');
    var list = byId('listings');
    if (!host || !rail || !list) { return; }
    if (host.contains(doc.activeElement)) { return; }

    var wide = false;
    try { wide = global.matchMedia('(min-width: 1100px)').matches; } catch (error) { wide = false; }

    if (wide) {
      if (host.parentNode !== rail) { rail.insertBefore(host, rail.firstChild); }
      return;
    }
    var anchor = list.children[5] || null;
    if (host.parentNode === list && host.nextSibling === anchor) { return; }
    if (list.children.length) { list.insertBefore(host, anchor); }
    else if (host.parentNode !== rail) { rail.insertBefore(host, rail.firstChild); }
  }

  /* ------------------------------------------------------------------ *
   * Language + theme                                                    *
   * ------------------------------------------------------------------ */

  function setLang(lang) {
    var next = lang === 'en' ? 'en' : 'th';
    if (next === state.lang && booted) { return; }
    state.lang = next;
    store('bh.lang', next);
    doc.documentElement.lang = next;

    var radios = doc.querySelectorAll('#lang-toggle input[type="radio"]');
    for (var i = 0; i < radios.length; i += 1) { radios[i].checked = radios[i].value === next; }

    applyStaticCopy();
    renderHero();
    renderLegend();
    renderPlaybook();
    renderFooter();
    renderCalcEyebrow();
    renderLiveControl();
    renderSheetCopy();
    render();

    doc.dispatchEvent(new global.CustomEvent('earn:langchange', { detail: { lang: next } }));
  }

  function applyTheme(theme) {
    state.theme = theme;
    if (theme === 'light' || theme === 'dark') { doc.documentElement.setAttribute('data-theme', theme); }
    else { doc.documentElement.removeAttribute('data-theme'); }
    store('bh.theme', theme);

    var dark = theme === 'dark';
    if (theme === 'system') {
      try { dark = global.matchMedia('(prefers-color-scheme: dark)').matches; } catch (error) { dark = false; }
    }
    var meta = byId('meta-theme-color');
    if (meta) { meta.setAttribute('content', dark ? '#0B0A11' : '#FAF9FC'); }

    var radios = doc.querySelectorAll('[data-theme-toggle] input[type="radio"]');
    for (var i = 0; i < radios.length; i += 1) { radios[i].checked = radios[i].value === theme; }
  }

  function wireToggles() {
    var langRadios = doc.querySelectorAll('#lang-toggle input[type="radio"]');
    for (var i = 0; i < langRadios.length; i += 1) {
      langRadios[i].addEventListener('change', function (event) {
        if (event.target.checked) { setLang(event.target.value); }
      });
    }
    var themeRadios = doc.querySelectorAll('[data-theme-toggle] input[type="radio"]');
    for (var j = 0; j < themeRadios.length; j += 1) {
      themeRadios[j].addEventListener('change', function (event) {
        if (event.target.checked) { applyTheme(event.target.value); }
      });
    }
  }

  /* ------------------------------------------------------------------ *
   * Live refresh                                                        *
   * ------------------------------------------------------------------ */

  function renderLiveControl() {
    setText('live-refresh', t().live.button);
  }

  function setLiveMessage(text, tone) {
    var node = byId('live-msg');
    if (!node) { return; }
    node.textContent = text || '';
    node.className = 'live__msg' + (tone ? ' is-' + tone : '');
  }

  function wireLive() {
    var btn = byId('live-refresh');
    if (!btn) { return; }
    btn.addEventListener('click', function () {
      var copy = t();
      if (!LIVE || typeof LIVE.fetchListings !== 'function') {
        setLiveMessage(copy.live.noModule, 'warn');
        return;
      }
      var skeletons = byId('live-skeletons');
      btn.disabled = true;
      setLiveMessage(copy.live.loading, null);
      if (skeletons) { skeletons.hidden = false; }

      LIVE.fetchListings({ limit: 100 }).then(function (result) {
        btn.disabled = false;
        if (skeletons) { skeletons.hidden = true; }
        var nowCopy = t();
        if (result && result.ok && result.listings && result.listings.length) {
          mergeListings(result.listings);
          setLiveMessage(nowCopy.live.ok(result.listings.length), 'ok');
        } else {
          setLiveMessage((result && result.error) || nowCopy.live.fallback, 'warn');
        }
      }, function () {
        /* fetchListings is contracted never to reject; this is belt and braces. */
        btn.disabled = false;
        if (skeletons) { skeletons.hidden = true; }
        setLiveMessage(t().live.fallback, 'warn');
      });
    });
  }

  function mergeListings(incoming) {
    var byIdMap = {};
    var i;
    for (i = 0; i < allListings.length; i += 1) { byIdMap[allListings[i].id] = i; }
    for (i = 0; i < incoming.length; i += 1) {
      var row = incoming[i];
      if (!row || !row.id) { continue; }
      if (byIdMap[row.id] !== undefined) { allListings[byIdMap[row.id]] = row; }
      else { allListings.push(row); }
    }
    buildHeatIndex(allListings);
    buildFilters();
    renderHero();
    /* mountCalculator rebuilds the panel from scratch, so its inputs go back to the defaults.
       Drop the prefill marker with them — otherwise the eyebrow keeps claiming "From: <listing>"
       above numbers that no longer belong to that listing. */
    prefilled = null;
    mountCalculator(viewData());
    renderCalcEyebrow();
    render();
  }

  function viewData() {
    return {
      generatedAt: DATA.generatedAt,
      stats: DATA.stats,
      skills: DATA.skills,
      regions: regionOptions(),
      listings: allListings
    };
  }

  /* ------------------------------------------------------------------ *
   * Bottom sheet (mobile filters)                                       *
   * ------------------------------------------------------------------ */

  var sheetReturnFocus = null;

  function renderSheetCopy() {
    var copy = t();
    setText('sheet-title', copy.sheet.title);
    setText('sheet-apply', copy.sheet.apply);
    setText('sheet-clear', copy.sheet.clear);
  }

  function openSheet() {
    var sheet = byId('sheet');
    var backdrop = byId('sheet-backdrop');
    var body = byId('sheet-body');
    var advanced = byId('filters-advanced');
    var trigger = byId('filters-open');
    if (!sheet || !backdrop || !body || !advanced) { return; }

    sheetReturnFocus = trigger;
    body.appendChild(advanced);
    advanced.classList.add('is-in-sheet');
    sheet.hidden = false;
    backdrop.hidden = false;
    if (trigger) { trigger.setAttribute('aria-expanded', 'true'); }
    global.requestAnimationFrame(function () {
      sheet.classList.add('is-open');
      backdrop.classList.add('is-open');
    });
    var close = byId('sheet-close');
    if (close) { close.focus(); }
    doc.addEventListener('keydown', onSheetKey);
  }

  function closeSheet() {
    var sheet = byId('sheet');
    var backdrop = byId('sheet-backdrop');
    var advanced = byId('filters-advanced');
    var filters = byId('filters');
    var sortwrap = doc.querySelector('.sortwrap');
    if (!sheet || !backdrop || !advanced || !filters) { return; }

    sheet.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    sheet.hidden = true;
    backdrop.hidden = true;
    advanced.classList.remove('is-in-sheet');
    filters.insertBefore(advanced, sortwrap || null);

    var trigger = byId('filters-open');
    if (trigger) { trigger.setAttribute('aria-expanded', 'false'); }
    doc.removeEventListener('keydown', onSheetKey);
    if (sheetReturnFocus && typeof sheetReturnFocus.focus === 'function') { sheetReturnFocus.focus(); }
    sheetReturnFocus = null;
  }

  function onSheetKey(event) {
    if (event.key === 'Escape') { event.preventDefault(); closeSheet(); return; }
    if (event.key !== 'Tab') { return; }
    var sheet = byId('sheet');
    if (!sheet) { return; }
    var focusable = sheet.querySelectorAll('button, input, select, a[href], [tabindex]:not([tabindex="-1"])');
    var usable = [];
    for (var i = 0; i < focusable.length; i += 1) {
      if (!focusable[i].disabled && focusable[i].offsetParent !== null) { usable.push(focusable[i]); }
    }
    if (!usable.length) { return; }
    var first = usable[0];
    var last = usable[usable.length - 1];
    if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function wireSheet() {
    var open = byId('filters-open');
    var close = byId('sheet-close');
    var backdrop = byId('sheet-backdrop');
    var apply = byId('sheet-apply');
    var clearAll = byId('sheet-clear');
    if (open) { open.addEventListener('click', openSheet); }
    if (close) { close.addEventListener('click', closeSheet); }
    if (backdrop) { backdrop.addEventListener('click', closeSheet); }
    if (apply) { apply.addEventListener('click', closeSheet); }
    if (clearAll) {
      clearAll.addEventListener('click', function () {
        clearFilters();
        closeSheet();
      });
    }
  }

  /* ------------------------------------------------------------------ *
   * Boot                                                                *
   * ------------------------------------------------------------------ */

  function missingDependencies() {
    var missing = [];
    if (!DATA || !DATA.listings || !DATA.listings.length) { missing.push('data.js (EARN_DATA)'); }
    if (!PLAYBOOK || !PLAYBOOK.th) { missing.push('playbook.js (EARN_PLAYBOOK)'); }
    if (!CALC || typeof CALC.mount !== 'function') { missing.push('calculator.js (EarnCalculator)'); }
    return missing;
  }

  function degrade(missing) {
    var box = byId('boot-error');
    if (box) {
      box.hidden = false;
      clear(box);
      /* Bilingual on purpose: the language toggle lives in the UI that just failed to boot. */
      var th = el('p', null, COPY.th.bootError + missing.join(', '));
      th.lang = 'th';
      var en = el('p', null, COPY.en.bootError + missing.join(', '));
      en.lang = 'en';
      box.appendChild(th);
      box.appendChild(en);
    }
    var main = byId('main');
    if (main) { main.hidden = true; }
  }

  /* The control bar's height changes with viewport and language, and the sticky rail plus
     every in-page anchor has to clear it. Measure rather than guess. */
  function syncStickyOffset() {
    var header = doc.querySelector('.site-header');
    var controls = byId('controls');
    if (!header || !controls) { return; }
    var total = Math.round(header.getBoundingClientRect().height + controls.getBoundingClientRect().height);
    if (total > 0) { doc.documentElement.style.setProperty('--stick-top', total + 'px'); }
  }

  function syncLegendOpenState() {
    var legend = byId('legend');
    if (!legend) { return; }
    try { legend.open = global.matchMedia('(min-width: 1100px)').matches; }
    catch (error) { legend.open = false; }
  }

  function boot() {
    if (booted) { return; }
    var missing = missingDependencies();
    if (missing.length) { degrade(missing); return; }

    allListings = DATA.listings.slice();
    buildHeatIndex(allListings);

    var storedLang = restore('bh.lang');
    state.lang = storedLang === 'en' ? 'en' : 'th';
    var storedTheme = restore('bh.theme');
    state.theme = (storedTheme === 'light' || storedTheme === 'dark') ? storedTheme : 'system';

    readHash();
    booted = true;

    doc.documentElement.lang = state.lang;
    applyTheme(state.theme);
    wireToggles();
    wireSheet();
    wireLive();

    var calcSection = byId('calc');
    if (calcSection) { calcSection.tabIndex = -1; }

    buildTabs();
    buildFilters();
    applyStaticCopy();
    renderHero();
    renderLegend();
    renderPlaybook();
    renderFooter();
    renderLiveControl();
    renderSheetCopy();
    renderCalcEyebrow();
    syncLegendOpenState();
    syncStickyOffset();

    var langRadios = doc.querySelectorAll('#lang-toggle input[type="radio"]');
    for (var i = 0; i < langRadios.length; i += 1) { langRadios[i].checked = langRadios[i].value === state.lang; }

    /* CONTRACT D: the app mounts the calculator with the canonical dataset. */
    mountCalculator(DATA);

    render();
    animateCounter();

    var empty = byId('empty-clear');
    if (empty) { empty.addEventListener('click', clearFilters); }
    var uncrowd = byId('empty-uncrowd');
    if (uncrowd) { uncrowd.addEventListener('click', toggleCrowded); }
    var legendShortcut = byId('legend-shortcut');
    if (legendShortcut) { legendShortcut.addEventListener('click', toggleCrowded); }

    global.addEventListener('hashchange', function () {
      readHash();
      var search = byId('q');
      if (search) { search.value = state.q; }
      render();
    });

    var wasNarrow = isNarrow();
    global.addEventListener('resize', function () {
      placeCalculator();
      syncLegendOpenState();
      syncStickyOffset();
      if (isNarrow() !== wasNarrow) { wasNarrow = isNarrow(); render(); }
      var host = byId('tabs');
      if (host) { host.classList.toggle('is-scrollable', host.scrollWidth > host.clientWidth + 1); }
      var sheet = byId('sheet');
      if (sheet && !sheet.hidden) {
        var narrow = true;
        try { narrow = global.matchMedia('(max-width: 599px)').matches; } catch (error) { narrow = true; }
        if (!narrow) { closeSheet(); }
      }
    });

    try {
      var mq = global.matchMedia('(prefers-color-scheme: dark)');
      var onScheme = function () { if (state.theme === 'system') { applyTheme('system'); } };
      if (typeof mq.addEventListener === 'function') { mq.addEventListener('change', onScheme); }
    } catch (error) { /* matchMedia unavailable: the page still renders */ }
  }

  global.EarnApp = {
    boot: boot,
    setLang: setLang,
    getState: function () {
      return {
        lang: state.lang, theme: state.theme, type: state.type, q: state.q,
        skills: state.skills.slice(), min: state.min, region: state.region,
        difficulty: state.difficulty, status: state.status, token: state.token,
        hideCrowded: state.hideCrowded, sort: state.sort,
        visible: visible.length, total: allListings.length
      };
    },
    render: render
  };

  if (doc.readyState === 'loading') { doc.addEventListener('DOMContentLoaded', boot); }
  else { boot(); }

}(typeof window !== 'undefined' ? window : globalThis));
