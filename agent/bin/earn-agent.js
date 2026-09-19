#!/usr/bin/env node
/**
 * agent/bin/earn-agent.js — the operator-facing CLI for the Superteam Earn agent API.
 *
 * ESM (agent/package.json has {"type":"module"}). ZERO npm dependencies: Node 18+
 * built-ins only — global fetch, node:fs, node:path, node:readline/promises,
 * node:util.parseArgs. Runs with `node agent/bin/earn-agent.js <command>`.
 *
 * HARD RULES ENFORCED HERE (not negotiable, not flag-able away):
 *   1. No POST to create/update a submission without an explicit interactive
 *      confirmation that shows the exact body first. `--yes` exists for scripted
 *      use, is OFF by default, and is documented as operator-accepted risk.
 *   2. At most one CREATE per listing, ever (ledger-enforced), and a daily cap
 *      (default 3) checked BEFORE the request body is built or any network call
 *      is made.
 *   3. A quality gate (lib/rank.js qualityGate, 13 items) must pass. There is no
 *      override.
 *   4. The API key is never printed. Every byte written to stdout/stderr passes
 *      through scrub(), which replaces the live key with `sk_...last4` and any
 *      stray sk_ token with `sk_[REDACTED]` — including --json and --debug.
 *   5. --dry-run on every mutating command prints the exact request and exits.
 *   6. No scraping around the API, no second account, no retry of a 429.
 *   7. The tool never claims a payout or touches a wallet. It prints the claim
 *      code and the /earn/claim/<code> URL and stops.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import * as readline from 'node:readline/promises';

import { createClient, ApiError, DEFAULT_BASE_URL } from '../lib/api.js';
import * as store from '../lib/store.js';
import * as rank from '../lib/rank.js';

const VERSION = '0.1.0';

/* ========================================================================== *
 * 1. SECRET SCRUBBING — every write to a stream goes through this            *
 * ========================================================================== */

/** Live secrets seen this process. Replaced with their mask on the way out. */
const SECRETS = new Set();

function registerSecret(value) {
  if (typeof value === 'string' && value.trim().length >= 8) SECRETS.add(value.trim());
}

/**
 * Note the {12,} and the character class without a dot: the mask `sk_...abcd`
 * can never match this, so masks survive scrubbing while real keys do not.
 */
const STRAY_KEY = /sk_[A-Za-z0-9_-]{12,}/g;

function scrub(text) {
  let s = typeof text === 'string' ? text : String(text);
  for (const secret of SECRETS) {
    if (s.includes(secret)) s = s.split(secret).join(store.maskKey(secret));
  }
  return s.replace(STRAY_KEY, 'sk_[REDACTED]');
}

let OUT_BUFFER = null; // when --json is active, plain output is suppressed

function out(line = '') {
  if (OUT_BUFFER) return;
  process.stdout.write(`${scrub(String(line))}\n`);
}

function warnOut(line = '') {
  process.stderr.write(`${scrub(String(line))}\n`);
}

function emitJson(value) {
  let text;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = JSON.stringify({ error: 'result was not serialisable' });
  }
  process.stdout.write(`${scrub(text)}\n`);
}

/* ========================================================================== *
 * 2. COLOUR                                                                  *
 * ========================================================================== */

let COLOR_ON = false;

const RAW = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  blue: '\u001b[34m',
  magenta: '\u001b[35m',
  cyan: '\u001b[36m',
  grey: '\u001b[90m',
};

function paint(name, text) {
  if (!COLOR_ON) return String(text);
  return `${RAW[name] || ''}${text}${RAW.reset}`;
}

const bold = (t) => paint('bold', t);
const dim = (t) => paint('dim', t);
const red = (t) => paint('red', t);
const green = (t) => paint('green', t);
const yellow = (t) => paint('yellow', t);
const cyan = (t) => paint('cyan', t);
const grey = (t) => paint('grey', t);
const magenta = (t) => paint('magenta', t);

function verdictColor(verdict) {
  switch (String(verdict || '').toUpperCase()) {
    case 'BUILD': return green(verdict);
    case 'SHORTLIST': return cyan(verdict);
    case 'WATCH': return yellow(verdict);
    case 'SKIP': return grey(verdict);
    default: return String(verdict || '');
  }
}

/* ========================================================================== *
 * 3. LANGUAGE                                                                *
 * ========================================================================== */

let LANG = 'th';

const MSG = {
  th: {
    'cli.tagline': 'เครื่องมือบรรทัดคำสั่งสำหรับ Superteam Earn agent API (ไม่มี dependency)',
    'cli.usage': 'วิธีใช้',
    'cli.commands': 'คำสั่ง',
    'cli.globalFlags': 'ตัวเลือกส่วนกลาง',
    'cli.examples': 'ตัวอย่าง',
    'cli.exitCodes': 'รหัสจบการทำงาน: 0 = สำเร็จ, 1 = ผู้ใช้/ตรวจสอบไม่ผ่าน, 2 = เครือข่าย/API',
    'cli.moreHelp': 'ดูรายละเอียดของแต่ละคำสั่งด้วย: node agent/bin/earn-agent.js <คำสั่ง> --help',
    'cli.unknownCommand': 'ไม่รู้จักคำสั่ง "{cmd}"',
    'cli.needCommand': 'ต้องระบุคำสั่ง',
    'cli.badOption': 'ตัวเลือกไม่ถูกต้อง: {msg}',
    'cli.badLang': '--lang รับได้เฉพาะ th หรือ en (ได้รับ "{v}")',

    'err.noKey': 'ยังไม่ได้ลงทะเบียน agent — ไม่มีคีย์ API ในเครื่องนี้',
    'err.noKey.next': 'รันคำสั่งนี้ก่อน: node agent/bin/earn-agent.js register --name "ชื่อ agent ของคุณ"',
    'err.blocked': 'เชื่อมต่อ {host} ไม่ได้ — เครือข่ายของเครื่องนี้บล็อกการเชื่อมต่อไว้',
    'err.blocked.next1': 'นี่ไม่ใช่ปัญหาฝั่ง Superteam แต่เป็น proxy/firewall ของเครื่องที่รันอยู่ปฏิเสธการออกเน็ต',
    'err.blocked.next2': 'ให้รันเครื่องมือนี้จากเครื่องที่ออกอินเทอร์เน็ตได้โดยตรง หรือชี้ --base-url ไปที่เซิร์ฟเวอร์ที่เข้าถึงได้',
    'err.egress': 'พร็อกซีขาออกของเครื่องนี้บล็อก {host} ไว้ — ไม่ใช่ Superteam ปฏิเสธคำขอ',
    'err.egress.detail': 'พร็อกซีตอบกลับมาว่า: {reason}',
    'err.nonJson': '{host} ตอบกลับมาเป็นหน้าเว็บ ไม่ใช่ JSON — คำขอไปไม่ถึง Earn API จริง',
    'err.nonJson.next1': 'มักเกิดจากหน้า error ของ CDN, captive portal หรือ proxy ที่คั่นกลาง ไม่ใช่บั๊ก #1456',
    'err.nonJson.next2': 'ตรวจว่าเครื่องนี้ออกเน็ตตรงถึง {host} ได้จริง แล้วลองใหม่',
    'err.tooLarge': '{host} ส่ง body ใหญ่เกินเพดานที่ตั้งไว้ — ตัดการอ่านทิ้งเพื่อกันหน่วยความจำบวม',
    'err.tooLarge.next': 'ลดจำนวนที่ขอด้วย --take หรือชี้ --base-url ไปยังเซิร์ฟเวอร์ที่ตอบขนาดปกติ',
    'err.timeout': 'หมดเวลารอ {host} — เครือข่ายช้าหรือถูกบล็อกเงียบ ๆ',
    'err.timeout.next': 'ลองใหม่ด้วย --timeout 30000 ถ้ายังไม่ได้ แปลว่าออกเน็ตไม่ได้จริง',
    'err.401': 'คีย์ API ใช้ไม่ได้ (401) — หาย ผิด หรือถูกเพิกถอน',
    'err.401.next1': 'เซิร์ฟเวอร์ตอบเหมือนกันทั้งสามกรณี ตรวจไฟล์ {path}',
    'err.401.next2': 'ถ้าคีย์หายจริง ต้อง register ใหม่ (จะได้ claim code ใหม่ด้วย) — ไม่มี endpoint สำหรับออกคีย์ซ้ำ',
    'err.429': 'ถูกจำกัดอัตราการเรียก (429) — เซิร์ฟเวอร์บอกให้รอ',
    'err.429.next': 'รออย่างน้อย {sec} วินาทีแล้วค่อยลองใหม่ เครื่องมือนี้จะไม่ยิงซ้ำอัตโนมัติ',
    'err.429.nextNoHeader': 'รออย่างน้อย 60 วินาทีแล้วค่อยลองใหม่ เครื่องมือนี้จะไม่ยิงซ้ำอัตโนมัติ',
    'err.403': 'เซิร์ฟเวอร์ปฏิเสธ (403) — endpoint ของ agent รวมทุกสาเหตุไว้ในข้อความเดียว',
    'err.403.next': 'สาเหตุที่พบบ่อย: ส่งซ้ำ, listing ปิดแล้ว, ไม่ผ่านเงื่อนไข หรือ body ไม่ครบ',
    'err.api': 'API ตอบกลับผิดพลาด (HTTP {status})',
    'err.stack': 'ดู stack trace ด้วย --debug',
    'err.unexpected': 'เกิดข้อผิดพลาดที่ไม่คาดคิด',

    'reg.already': 'มี agent ลงทะเบียนไว้แล้วในเครื่องนี้ ({name})',
    'reg.already.next': 'ถ้าต้องการลงทะเบียนใหม่จริง ๆ ให้ใส่ --force (คีย์และ claim code เดิมจะถูกทับและกู้คืนไม่ได้)',
    'reg.needName': 'ต้องระบุชื่อ agent',
    'reg.needName.next': 'ใส่ --name "ชื่อ" หรือรันในเทอร์มินัลแบบโต้ตอบ',
    'reg.prompt': 'ตั้งชื่อ agent (2-80 ตัวอักษร): ',
    'reg.ok': 'ลงทะเบียน agent สำเร็จ',
    'reg.saved': 'บันทึกคีย์ไว้ที่ {path}',
    'reg.modeOk': 'สิทธิ์ไฟล์ {mode} — เจ้าของอ่านได้คนเดียว (ตรวจสอบแล้ว)',
    'reg.modeBad': 'สิทธิ์ไฟล์เป็น {mode} ไม่ใช่ 600 — รัน: chmod 600 "{path}"',
    'reg.gitIgnored': 'อยู่ใน .gitignore ของ repo ที่ {repo} แล้ว (ตรวจสอบแล้ว)',
    'reg.gitNoRepo': 'ไม่ได้อยู่ใน git repository จึงไม่มี .gitignore มาคุ้มครอง — ดูแลเองว่าจะไม่ถูก commit หรือ backup ไปที่อื่น',
    'reg.gitExposed': 'ไฟล์นี้อยู่ใน git repository ที่ {repo} และ**ไม่มี**กฎใดใน .gitignore ครอบคลุม — `git add` จะ commit คีย์จริงขึ้นไป',
    'reg.gitExposed.next': 'เพิ่มบรรทัดนี้ใน {repo}/.gitignore ก่อนทำ commit ใด ๆ: {rel}',
    'reg.keyNotice': 'คีย์ API จะไม่ถูกแสดงในที่ใดทั้งสิ้น — แสดงเป็น {masked} เท่านั้น',

    'claim.header': 'ขั้นตอนของมนุษย์ (agent ทำแทนไม่ได้)',
    'claim.code': 'รหัสเคลม',
    'claim.url': 'ลิงก์เคลม',
    'claim.none': 'ยังไม่มีรหัสเคลม — ต้อง register ก่อน',
    'claim.step1': '1. เปิดลิงก์ด้านบนในเบราว์เซอร์',
    'claim.step2': '2. กรอกโปรไฟล์ talent ให้ครบ (ชื่อ ทักษะ ผลงาน)',
    'claim.step3': '3. ผูกกระเป๋า Solana ที่รับ USDC ได้ — เงินรางวัลเข้าที่นั่น',
    'claim.step4': '4. บาง sponsor ต้องทำ KYC ก่อนจ่าย ให้เตรียมเอกสารไว้',
    'claim.warn': 'เครื่องมือนี้ไม่แตะกระเป๋าเงินและไม่เคลมเงินแทนคุณ มันพิมพ์รหัสให้แล้วจบ',
    'claim.secret': 'รหัสเคลมคือความลับ ใครถือรหัสนี้ก็ผูกเงินรางวัลเข้ากระเป๋าตัวเองได้',

    'who.header': 'ตัวตนของ agent',
    'who.name': 'ชื่อ',
    'who.key': 'คีย์ API',
    'who.claim': 'รหัสเคลม',
    'who.registered': 'ลงทะเบียนเมื่อ',
    'who.file': 'ไฟล์สถานะ',
    'who.today': 'ส่งผลงานวันนี้',
    'who.total': 'ส่งผลงานสะสม',
    'who.cap': 'โควตาต่อวัน',
    'who.remaining': 'เหลือวันนี้',
    'who.serverStatus': 'สถานะฝั่งเซิร์ฟเวอร์',
    'who.claimed': 'มนุษย์เคลมแล้ว',
    'who.notClaimed': 'ยังไม่มีมนุษย์เคลม — เงินรางวัลจะไปไหนไม่ได้จนกว่าจะเคลม',

    'list.header': 'listing ที่ agent ส่งได้',
    'list.source': 'แหล่งข้อมูล',
    'list.sourcePrimary': 'endpoint ของ agent โดยตรง (/api/agents/listings/live)',
    'list.sourceFallback': 'ทางสำรองสาธารณะ (/api/listings) — เพราะ endpoint หลักมีบั๊ก #1456',
    'list.sourceNone': 'ไม่มีแหล่งข้อมูลใดให้ผลลัพธ์ (ลองครบทุกทางแล้ว แต่ไม่พบ listing ที่ใช้ได้)',
    'list.warnings': 'คำเตือนจากชั้นดึงข้อมูล',
    'list.empty': 'ไม่พบ listing ที่เปิดอยู่และ agent ส่งได้เลย',
    'list.count': 'พบ {n} รายการ',

    'rank.header': 'จัดอันดับ listing ตามเงินที่คาดว่าจะได้ต่อชั่วโมงและความน่าจะชนะ',
    'rank.empty': 'ไม่มี listing ให้จัดอันดับ',
    'rank.skipped': 'ตัดออก {n} รายการ (ไม่เข้าเกณฑ์ตั้งแต่ต้น)',
    'rank.reasons': 'เหตุผลหลัก',
    'rank.legend': 'คอลัมน์: POOL=เงินรางวัลรวม, ENTR=จำนวนคู่แข่ง, $/ENTR=เงินต่อคู่แข่ง, EST h=ชั่วโมงที่ประเมิน, EXP $/h=เงินคาดหวังต่อชั่วโมง, RUNWAY=เวลาที่เหลือถึงเส้นตาย',
    'rank.verdictLegend': 'คำตัดสิน: BUILD=ลงมือเลย, SHORTLIST=เก็บไว้พิจารณา, WATCH=เฝ้าดู, SKIP=ข้าม',
    'rank.next': 'ขั้นต่อไป: node agent/bin/earn-agent.js show <listingId>',

    'show.notFound': 'ไม่พบ listing "{id}" ในรายการที่ดึงมาได้',
    'show.notFound.next': 'ลองรัน listings --take 50 เพื่อดู id ที่ใช้ได้ หรือใส่ slug แทน id',
    'show.header': 'รายละเอียด listing',
    'show.questions': 'คำถามคัดกรอง (ต้องตอบทุกข้อ)',
    'show.noQuestions': 'listing นี้ไม่มีคำถามคัดกรอง (หรือ endpoint รายละเอียดดึงไม่ได้)',
    'show.score': 'ผลการให้คะแนน',
    'show.breakdown': 'องค์ประกอบคะแนน',
    'show.assumptions': 'สิ่งที่เครื่องมือเดาเอง (ยืนยันเองก่อนลงแรง)',
    'show.detailFailed': 'ดึงรายละเอียดเต็มไม่สำเร็จ ({msg}) — แสดงเท่าที่มีจากรายการรวม',
    'show.next': 'ขั้นต่อไป: node agent/bin/earn-agent.js draft {id}',

    'draft.header': 'ร่างผลงานที่จะส่ง',
    'draft.created': 'สร้างร่างใหม่ที่ {path}',
    'draft.loaded': 'โหลดร่างเดิมจาก {path}',
    'draft.saved': 'บันทึกร่างแล้วที่ {path}',
    'draft.interactive': 'กรอกข้อมูล (กด Enter เพื่อคงค่าเดิมในวงเล็บ)',
    'draft.link': 'ลิงก์ผลงาน (https:// เท่านั้น)',
    'draft.repo': 'ลิงก์ repo สาธารณะ',
    'draft.telegram': 'Telegram ของมนุษย์ (รูปแบบ http://t.me/username)',
    'draft.hours': 'ประเมินว่าต้องใช้กี่ชั่วโมงถึงจะส่งได้จริง',
    'draft.otherInfo': 'คำอธิบายผลงาน (otherInfo) — พิมพ์หลายบรรทัดได้ จบด้วยบรรทัดที่มีจุดเดียว "."',
    'draft.otherInfo.rule': 'ต้องยาว {min}-{max} ตัวอักษร และต้องมีหัวข้อ "What it does not do yet"',
    'draft.answer': 'ตอบคำถามข้อ {n} (อย่างน้อย {min} ตัวอักษร)',
    'draft.gate': 'ผลการตรวจคุณภาพ',
    'draft.gatePass': 'ผ่านครบ 13 ข้อ — ร่างนี้ส่งได้',
    'draft.gateFail': 'ยังไม่ผ่าน {n} ข้อ — ยังส่งไม่ได้',
    'draft.fixIn': 'แก้ที่ฟิลด์',
    'draft.editFile': 'ส่วนที่เหลือเป็นหลักฐานที่มนุษย์ต้องกรอกเอง แก้ไฟล์นี้ตรง ๆ: {path}',
    'draft.warnings': 'คำเตือน (ไม่บล็อกการส่ง แต่ควรแก้)',
    'draft.next': 'ขั้นต่อไป: node agent/bin/earn-agent.js submit {id} --dry-run',
    'draft.nonInteractive': 'ไม่ได้อยู่ในเทอร์มินัลโต้ตอบ — สร้าง/ตรวจร่างอย่างเดียว ไม่ถามคำถาม',

    'sub.header': 'ส่งผลงาน',
    'sub.headerUpdate': 'แก้ไขผลงานที่ส่งไปแล้ว',
    'sub.noDraft': 'ไม่มีร่างสำหรับ listing นี้ที่ {path}',
    'sub.noDraft.next': 'รัน draft {id} ก่อน',
    'sub.duplicate': 'ปฏิเสธ: ส่ง listing นี้ไปแล้วเมื่อ {when}',
    'sub.duplicate.next': 'กฎหนึ่งผลงานต่อหนึ่ง listing แก้ของเดิมด้วย: node agent/bin/earn-agent.js update {id}',
    'sub.noPrior': 'ปฏิเสธ: ยังไม่เคยส่ง listing นี้ จึงไม่มีอะไรให้แก้',
    'sub.noPrior.next': 'ใช้คำสั่ง submit {id} แทน',
    'sub.capped': 'ปฏิเสธ: ส่งครบโควตาวันนี้แล้ว ({used}/{cap})',
    'sub.capped.next': 'โควตารีเซ็ตเที่ยงคืนตามเวลาเครื่อง ปรับได้ด้วย: profile set --daily-cap N',
    'sub.updateCapped': 'ปฏิเสธ: แก้ listing นี้ครบ {n} ครั้งแล้ววันนี้',
    'sub.updateCapped.next': 'แก้ไขซ้ำ ๆ ในวันเดียวคือ spam รอพรุ่งนี้',
    'sub.gateFailed': 'ปฏิเสธ: ร่างไม่ผ่านการตรวจคุณภาพ {n} ข้อ',
    'sub.gateFailed.next': 'ไม่มีตัวเลือกข้ามการตรวจ แก้ร่างแล้วรัน draft {id} ใหม่',
    'sub.request': 'คำขอที่จะถูกส่งออกไปจริง',
    'sub.dryRun': 'โหมด --dry-run: ไม่ได้ส่งอะไรออกไป',
    'sub.confirmHeader': 'ยืนยันการส่ง',
    'sub.confirmBody': 'จะส่งผลงานนี้ไปยัง "{title}" เป็นบันทึกสาธารณะถาวร และแก้ทีหลังได้เฉพาะผ่านคำสั่ง update',
    'sub.confirmPrompt': 'พิมพ์ "yes" เพื่อส่ง หรือกด Enter เพื่อยกเลิก: ',
    'sub.cancelled': 'ยกเลิกแล้ว ไม่ได้ส่งอะไรออกไป',
    'sub.needTty': 'ปฏิเสธ: ต้องยืนยันด้วยมนุษย์ แต่ไม่ได้อยู่ในเทอร์มินัลโต้ตอบ',
    'sub.needTty.next': 'รันในเทอร์มินัลจริง หรือใส่ --yes (ข้ามการยืนยัน = คุณรับความเสี่ยงเอง)',
    'sub.yesWarn': 'ใช้ --yes: ข้ามการยืนยันของมนุษย์ตามที่ผู้ใช้สั่ง ความเสี่ยงอยู่ที่ผู้ใช้',
    'sub.lockBusy': 'ปฏิเสธ: มี earn-agent อีกตัวกำลังส่งผลงานอยู่',
    'sub.lockBusy.next': 'ห้ามรัน submit พร้อมกันหลายตัว รอให้ตัวเดิมเสร็จก่อนแล้วค่อยรันใหม่',
    'sub.ambiguous': 'ผลลัพธ์ไม่แน่ชัด: คำขออาจไปถึงเซิร์ฟเวอร์แล้ว สิทธิ์ของ {id} ยังถูกจองค้างไว้ ห้ามส่งซ้ำ ให้เปิดหน้า listing ตรวจเอง แล้วใช้คำสั่ง update ถ้ามันเข้าไปแล้วจริง',
    'sub.unconfirmed': 'ส่งออกไปแล้ว แต่ยืนยันผลไม่ได้',
    'sub.ok': 'ส่งสำเร็จ',
    'sub.okUpdate': 'แก้ไขสำเร็จ',
    'sub.recorded': 'บันทึกลงสมุดคุมแล้ว — listing นี้จะส่งซ้ำไม่ได้อีก',
    'sub.remaining': 'เหลือโควตาวันนี้อีก {n} ครั้ง',

    'prof.header': 'โปรไฟล์ผู้ปฏิบัติงาน (ใช้ตอนจัดอันดับ)',
    'prof.skills': 'ทักษะ',
    'prof.edge': 'ค่า skill edge',
    'prof.hours': 'ชั่วโมงว่างต่อสัปดาห์',
    'prof.video': 'ถ่ายวิดีโอได้',
    'prof.camera': 'ออกกล้องได้',
    'prof.reach': 'มีฐานผู้ติดตามบน X',
    'prof.regions': 'ภูมิภาคที่ส่งได้',
    'prof.telegram': 'Telegram',
    'prof.cap': 'โควตาการส่งต่อวัน',
    'prof.saved': 'บันทึกโปรไฟล์แล้ว',
    'prof.noChange': 'ไม่มีอะไรเปลี่ยน — ใส่ตัวเลือกอย่างน้อยหนึ่งตัวกับ `profile set` หรือใช้ `profile edit`',
    'prof.editHint': 'แก้ไข: node agent/bin/earn-agent.js profile set --hours-per-week 20 --skills "typescript,rust"',
    'prof.badEdge': 'ค่า --edge ต้องเป็นตัวเลขระหว่าง 0.5 ถึง 5',
    'prof.badNumber': 'ค่า {flag} ต้องเป็นตัวเลข',
    'prof.outOfRange': 'ค่า {flag} ต้องอยู่ระหว่าง {min} ถึง {max} (ได้รับ {got})',
    'prof.notInteger': 'ค่า {flag} ต้องเป็นจำนวนเต็ม (ได้รับ {got})',
    'prof.badBool': 'ค่า {flag} ต้องเป็น true หรือ false',

    'common.yes': 'ใช่',
    'common.no': 'ไม่',
    'common.none': 'ไม่มี',
    'common.unknown': 'ไม่ทราบ',
    'common.deadline': 'เส้นตาย',
    'common.sponsor': 'ผู้สนับสนุน',
    'common.pool': 'เงินรางวัล',
    'common.entrants': 'คู่แข่ง',
    'common.type': 'ประเภท',
    'common.skill': 'สายงาน',
    'common.region': 'ภูมิภาค',
    'common.access': 'สิทธิ์ agent',
    'common.status': 'สถานะ',
    'common.link': 'ลิงก์',
    'common.id': 'id',
    'common.warning': 'คำเตือน',
    'common.nextStep': 'ต้องทำต่อ',
    'common.days': 'วัน',
    'common.hours': 'ชม.',
  },

  en: {
    'cli.tagline': 'Zero-dependency CLI for the Superteam Earn agent API',
    'cli.usage': 'Usage',
    'cli.commands': 'Commands',
    'cli.globalFlags': 'Global flags',
    'cli.examples': 'Examples',
    'cli.exitCodes': 'Exit codes: 0 = success, 1 = user/validation error, 2 = network/API error',
    'cli.moreHelp': 'Per-command help: node agent/bin/earn-agent.js <command> --help',
    'cli.unknownCommand': 'Unknown command "{cmd}"',
    'cli.needCommand': 'A command is required',
    'cli.badOption': 'Bad option: {msg}',
    'cli.badLang': '--lang accepts only th or en (got "{v}")',

    'err.noKey': 'No agent registered — there is no API key on this machine',
    'err.noKey.next': 'Run this first: node agent/bin/earn-agent.js register --name "your agent name"',
    'err.blocked': 'Cannot reach {host} — this machine\'s network is blocking the connection',
    'err.blocked.next1': 'This is not a Superteam outage. The local egress proxy or firewall refused the connection.',
    'err.blocked.next2': 'Run this tool from a machine with open internet access, or point --base-url at a host you can reach.',
    'err.egress': 'This machine\'s egress proxy is blocking {host} — Superteam did not refuse the request',
    'err.egress.detail': 'The proxy answered: {reason}',
    'err.nonJson': '{host} answered with a web page, not JSON — the request never reached the Earn API',
    'err.nonJson.next1': 'This is usually a CDN error page, a captive portal or a proxy interstitial. It is NOT bug #1456.',
    'err.nonJson.next2': 'Confirm this machine can reach {host} directly, then retry.',
    'err.tooLarge': '{host} sent a body past the size cap — the read was aborted to bound memory',
    'err.tooLarge.next': 'Lower --take, or point --base-url at a server that answers a normal-sized body.',
    'err.timeout': 'Timed out reaching {host} — the network is slow or silently blocking',
    'err.timeout.next': 'Retry with --timeout 30000. If it still hangs, egress really is blocked.',
    'err.401': 'The API key was rejected (401) — missing, wrong, or revoked',
    'err.401.next1': 'The server returns an identical body for all three. Check {path}.',
    'err.401.next2': 'If the key is genuinely lost you must register again (new claim code too) — there is no re-issue endpoint.',
    'err.429': 'Rate limited (429) — the server told us to back off',
    'err.429.next': 'Wait at least {sec}s before retrying. This tool never retries a 429 automatically.',
    'err.429.nextNoHeader': 'Wait at least 60s before retrying. This tool never retries a 429 automatically.',
    'err.403': 'The server refused (403) — the agent routes collapse every cause into one body',
    'err.403.next': 'Common causes: already submitted, listing closed, not eligible, or a body the server rejected.',
    'err.api': 'The API returned an error (HTTP {status})',
    'err.stack': 'Re-run with --debug for the stack trace',
    'err.unexpected': 'Unexpected error',

    'reg.already': 'An agent is already registered on this machine ({name})',
    'reg.already.next': 'Pass --force to register a new one. The stored key and claim code are overwritten and cannot be recovered.',
    'reg.needName': 'An agent name is required',
    'reg.needName.next': 'Pass --name "..." or run in an interactive terminal',
    'reg.prompt': 'Agent name (2-80 characters): ',
    'reg.ok': 'Agent registered',
    'reg.saved': 'Key stored at {path}',
    'reg.modeOk': 'mode {mode}, owner-only (verified on disk)',
    'reg.modeBad': 'mode is {mode}, not 600 — run: chmod 600 "{path}"',
    'reg.gitIgnored': 'covered by the .gitignore of the repo at {repo} (verified)',
    'reg.gitNoRepo': 'not inside a git repository, so no .gitignore protects it — keep it out of backups and copies yourself',
    'reg.gitExposed': 'this file is inside the git repository at {repo} and NOTHING in .gitignore covers it — a `git add` would commit your live API key',
    'reg.gitExposed.next': 'Add this line to {repo}/.gitignore before you commit anything: {rel}',
    'reg.keyNotice': 'The API key is never printed anywhere — only as {masked}',

    'claim.header': 'The human steps (an agent cannot do these)',
    'claim.code': 'Claim code',
    'claim.url': 'Claim URL',
    'claim.none': 'No claim code yet — register first',
    'claim.step1': '1. Open the URL above in a browser',
    'claim.step2': '2. Complete the talent profile (name, skills, work)',
    'claim.step3': '3. Connect a Solana wallet that can receive USDC — prizes land there',
    'claim.step4': '4. Some sponsors require KYC before paying. Have documents ready.',
    'claim.warn': 'This tool never touches a wallet and never claims a payout for you. It prints the code and stops.',
    'claim.secret': 'The claim code is a secret. Whoever holds it can bind the payouts to their own wallet.',

    'who.header': 'Agent identity',
    'who.name': 'Name',
    'who.key': 'API key',
    'who.claim': 'Claim code',
    'who.registered': 'Registered',
    'who.file': 'State file',
    'who.today': 'Submissions today',
    'who.total': 'Submissions total',
    'who.cap': 'Daily cap',
    'who.remaining': 'Remaining today',
    'who.serverStatus': 'Server-side status',
    'who.claimed': 'Claimed by a human',
    'who.notClaimed': 'Not claimed by a human yet — prizes have nowhere to go until it is',

    'list.header': 'Agent-eligible listings',
    'list.source': 'Source',
    'list.sourcePrimary': 'the agent endpoint itself (/api/agents/listings/live)',
    'list.sourceFallback': 'the public fallback (/api/listings) — because the primary hit bug #1456',
    'list.sourceNone': 'no path produced results; every discovery tier was tried and none had an eligible listing',
    'list.warnings': 'Discovery-layer warnings',
    'list.empty': 'No open, agent-eligible listings found',
    'list.count': '{n} listing(s)',

    'rank.header': 'Listings ranked by expected $/hour and odds of placing',
    'rank.empty': 'Nothing to rank',
    'rank.skipped': '{n} listing(s) dropped before ranking (ineligible at step 0)',
    'rank.reasons': 'Top reasons',
    'rank.legend': 'Columns: POOL=total prize, ENTR=entrants, $/ENTR=pool per entrant, EST h=estimated build hours, EXP $/h=expected dollars per hour, RUNWAY=time left to the deadline',
    'rank.verdictLegend': 'Verdicts: BUILD=start now, SHORTLIST=keep in play, WATCH=monitor, SKIP=do not enter',
    'rank.next': 'Next: node agent/bin/earn-agent.js show <listingId>',

    'show.notFound': 'Listing "{id}" is not in the results we could fetch',
    'show.notFound.next': 'Run listings --take 50 to see usable ids, or pass the slug instead',
    'show.header': 'Listing detail',
    'show.questions': 'Eligibility questions (every one must be answered)',
    'show.noQuestions': 'No eligibility questions on this listing (or the details endpoint was unreachable)',
    'show.score': 'Score',
    'show.breakdown': 'Score breakdown',
    'show.assumptions': 'What the tool assumed (verify these yourself before building)',
    'show.detailFailed': 'Could not fetch full details ({msg}) — showing what the list endpoint gave us',
    'show.next': 'Next: node agent/bin/earn-agent.js draft {id}',

    'draft.header': 'Submission draft',
    'draft.created': 'Created a new draft at {path}',
    'draft.loaded': 'Loaded the existing draft from {path}',
    'draft.saved': 'Draft saved to {path}',
    'draft.interactive': 'Fill these in (Enter keeps the value in brackets)',
    'draft.link': 'Demo link (https:// only)',
    'draft.repo': 'Public repo URL',
    'draft.telegram': 'The human\'s Telegram (http://t.me/username)',
    'draft.hours': 'Honest estimate of hours to a shippable submission',
    'draft.otherInfo': 'Submission write-up (otherInfo) — multi-line, end with a line containing only "."',
    'draft.otherInfo.rule': 'Must be {min}-{max} characters and must contain a "What it does not do yet" section',
    'draft.answer': 'Answer to question {n} (at least {min} characters)',
    'draft.gate': 'Quality gate',
    'draft.gatePass': 'All 13 items pass — this draft is submittable',
    'draft.gateFail': '{n} item(s) failing — not submittable yet',
    'draft.fixIn': 'fix in',
    'draft.editFile': 'The rest is evidence only a human can record. Edit the file directly: {path}',
    'draft.warnings': 'Warnings (do not block submission, but fix them)',
    'draft.next': 'Next: node agent/bin/earn-agent.js submit {id} --dry-run',
    'draft.nonInteractive': 'Not an interactive terminal — scaffolding and checking only, no questions asked',

    'sub.header': 'Submit',
    'sub.headerUpdate': 'Update an existing submission',
    'sub.noDraft': 'No draft for this listing at {path}',
    'sub.noDraft.next': 'Run draft {id} first',
    'sub.duplicate': 'REFUSED: already submitted to this listing on {when}',
    'sub.duplicate.next': 'One submission per listing. Change the existing one with: node agent/bin/earn-agent.js update {id}',
    'sub.noPrior': 'REFUSED: nothing has been submitted to this listing, so there is nothing to update',
    'sub.noPrior.next': 'Use submit {id} instead',
    'sub.capped': 'REFUSED: the daily cap is used up ({used}/{cap})',
    'sub.capped.next': 'The cap resets at local midnight. Change it with: profile set --daily-cap N',
    'sub.updateCapped': 'REFUSED: this listing has already been updated {n} time(s) today',
    'sub.updateCapped.next': 'Repeatedly rewriting one submission in a day is spam. Wait until tomorrow.',
    'sub.gateFailed': 'REFUSED: the draft fails {n} quality-gate item(s)',
    'sub.gateFailed.next': 'There is no override. Fix the draft and re-run draft {id}.',
    'sub.request': 'The exact request that would be sent',
    'sub.dryRun': '--dry-run: nothing was sent',
    'sub.confirmHeader': 'Confirm',
    'sub.confirmBody': 'This posts your submission to "{title}". It is a permanent public record and can only be changed through the update command.',
    'sub.confirmPrompt': 'Type "yes" to send, or press Enter to cancel: ',
    'sub.cancelled': 'Cancelled. Nothing was sent.',
    'sub.needTty': 'REFUSED: a human confirmation is required and this is not an interactive terminal',
    'sub.needTty.next': 'Run it in a real terminal, or pass --yes (skips the human check — operator-accepted risk)',
    'sub.yesWarn': '--yes: the human confirmation was skipped at the operator\'s explicit instruction. The risk is theirs.',
    'sub.lockBusy': 'REFUSED: another earn-agent process is already mid-submission',
    'sub.lockBusy.next': 'Submissions are serialised on purpose. Wait for that run to finish, then retry — do not run submits in parallel.',
    'sub.ambiguous': 'UNKNOWN OUTCOME: the request may have reached the server. The slot for {id} stays reserved. Do NOT re-submit — check the listing page, then use the update command if it went through.',
    'sub.unconfirmed': 'Sent, but the result could NOT be confirmed',
    'sub.ok': 'Submitted',
    'sub.okUpdate': 'Updated',
    'sub.recorded': 'Recorded in the ledger — this listing can never be submitted to again',
    'sub.remaining': '{n} submission(s) left in today\'s cap',

    'prof.header': 'Operator profile (used by ranking)',
    'prof.skills': 'Skills',
    'prof.edge': 'Skill edge',
    'prof.hours': 'Hours per week',
    'prof.video': 'Can record video',
    'prof.camera': 'Can appear on camera',
    'prof.reach': 'Has audience reach on X',
    'prof.regions': 'Regions',
    'prof.telegram': 'Telegram',
    'prof.cap': 'Daily submission cap',
    'prof.saved': 'Profile saved',
    'prof.noChange': 'Nothing changed — pass at least one option to `profile set`, or use `profile edit`',
    'prof.editHint': 'Edit: node agent/bin/earn-agent.js profile set --hours-per-week 20 --skills "typescript,rust"',
    'prof.badEdge': '--edge must be a number between 0.5 and 5',
    'prof.badNumber': '{flag} must be a number',
    'prof.outOfRange': '{flag} must be between {min} and {max} (got {got})',
    'prof.notInteger': '{flag} must be a whole number (got {got})',
    'prof.badBool': '{flag} must be true or false',

    'common.yes': 'yes',
    'common.no': 'no',
    'common.none': 'none',
    'common.unknown': 'unknown',
    'common.deadline': 'Deadline',
    'common.sponsor': 'Sponsor',
    'common.pool': 'Pool',
    'common.entrants': 'Entrants',
    'common.type': 'Type',
    'common.skill': 'Skill',
    'common.region': 'Region',
    'common.access': 'Agent access',
    'common.status': 'Status',
    'common.link': 'Link',
    'common.id': 'id',
    'common.warning': 'Warning',
    'common.nextStep': 'Next step',
    'common.days': 'd',
    'common.hours': 'h',
  },
};

function t(key, vars) {
  const table = MSG[LANG] || MSG.en;
  let s = table[key];
  if (s === undefined) s = (MSG.en[key] !== undefined ? MSG.en[key] : key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}

/* ========================================================================== *
 * 4. FORMATTING                                                              *
 * ========================================================================== */

function groupDigits(intPart) {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fmtMoney(value, decimals = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(decimals);
  const [i, f] = fixed.split('.');
  return `${neg ? '-' : ''}$${groupDigits(i)}${f ? `.${f}` : ''}`;
}

function fmtNum(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return groupDigits(String(Math.round(Number(value))));
}

function fmtHours(h) {
  if (h === null || h === undefined || !Number.isFinite(Number(h))) return '—';
  const n = Number(h);
  // Thai puts a space between a number and its unit word; English does not.
  const sp = LANG === 'th' ? ' ' : '';
  if (n < 1) return `${Math.round(n * 60)}${sp}${LANG === 'th' ? 'นาที' : 'm'}`;
  if (n < 48) return `${Math.round(n)}${sp}${t('common.hours')}`;
  return `${Math.round(n / 24)}${sp}${t('common.days')}`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function runwayLabel(iso, now = Date.now()) {
  if (!iso) return '—';
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '—';
  const hours = (ms - now) / 3600000;
  if (hours <= 0) return LANG === 'th' ? 'หมดเวลา' : 'expired';
  return fmtHours(hours);
}

/* ========================================================================== *
 * 5. TABLE                                                                   *
 * ========================================================================== */

const ANSI = /\u001b\[[0-9;]*m/g;

function dispWidth(text) {
  const s = String(text).replace(ANSI, '');
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    // Thai vowels/tone marks and generic combining marks take no cell.
    if (c === 0x0e31 || (c >= 0x0e34 && c <= 0x0e3a) || (c >= 0x0e47 && c <= 0x0e4e)) continue;
    if (c >= 0x0300 && c <= 0x036f) continue;
    if (
      (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf)
      || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff)
      || (c >= 0xfe30 && c <= 0xfe6f) || (c >= 0xff00 && c <= 0xff60)
      || (c >= 0xffe0 && c <= 0xffe6) || (c >= 0x1f300 && c <= 0x1f9ff)
    ) { w += 2; continue; }
    w += 1;
  }
  return w;
}

function truncate(text, max) {
  const s = String(text);
  if (dispWidth(s) <= max) return s;
  let acc = '';
  for (const ch of s.replace(ANSI, '')) {
    if (dispWidth(acc + ch) > max - 1) break;
    acc += ch;
  }
  return `${acc}…`;
}

function pad(text, width, align) {
  const gap = Math.max(0, width - dispWidth(text));
  if (align === 'right') return ' '.repeat(gap) + text;
  return text + ' '.repeat(gap);
}

/**
 * @param {{key:string,label:string,align?:'left'|'right',max?:number}[]} cols
 * @param {object[]} rows  values may already contain ANSI
 */
function renderTable(cols, rows) {
  const widths = cols.map((c) => {
    let w = dispWidth(c.label);
    for (const r of rows) w = Math.max(w, dispWidth(r[c.key] === undefined ? '' : r[c.key]));
    return c.max ? Math.min(w, c.max) : w;
  });

  const header = cols
    .map((c, i) => pad(truncate(c.label, widths[i]), widths[i], c.align))
    .join('  ');
  out(bold(header));
  out(grey(widths.map((w) => '─'.repeat(w)).join('  ')));

  for (const r of rows) {
    const line = cols
      .map((c, i) => {
        const raw = r[c.key] === undefined || r[c.key] === null ? '' : String(r[c.key]);
        return pad(truncate(raw, widths[i]), widths[i], c.align);
      })
      .join('  ');
    out(line);
  }
}

function kv(label, value, width = 22) {
  out(`  ${pad(grey(label), width)}  ${value}`);
}

function heading(text) {
  out('');
  out(bold(cyan(text)));
}

function bullet(text, marker = '•') {
  out(`  ${grey(marker)} ${text}`);
}

/* ========================================================================== *
 * 6. ERRORS                                                                  *
 * ========================================================================== */

class UserError extends Error {
  constructor(message, next) {
    super(message);
    this.name = 'UserError';
    this.next = Array.isArray(next) ? next : (next ? [next] : []);
    this.exitCode = 1;
  }
}

const NET_CODES = new Set([
  'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'EHOSTUNREACH',
  'ENETUNREACH', 'EPROTO', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET',
  'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]);

function causeCodes(err) {
  const codes = [];
  let cur = err;
  for (let i = 0; i < 6 && cur; i += 1) {
    if (cur.code) codes.push(String(cur.code));
    if (cur.errno && typeof cur.errno === 'string') codes.push(cur.errno);
    cur = cur.cause;
  }
  return codes;
}

/**
 * A blocked egress proxy answers 403/407 with a plain-text or HTML body. Every
 * real Earn API route answers JSON, so a non-JSON body on a 403 means the request
 * never reached Superteam at all. Saying "the API refused you" there would send
 * the operator hunting a bug that does not exist.
 * api.js parks an unparseable body under `_raw`, which is the tell.
 */
const EGRESS_SIGNATURE =
  /not in allowlist|host_not_allowed|egress|proxy|blocked by (?:the )?(?:network|policy|firewall)|forbidden by policy|tunneling socket/i;

function egressBlockReason(err) {
  if (!(err instanceof ApiError)) return null;
  if (err.status === 407) return 'Proxy Authentication Required (407)';
  if (err.status !== 403) return null;

  const body = err.body;
  const raw = body && typeof body === 'object' && typeof body._raw === 'string'
    ? body._raw.trim()
    : (typeof body === 'string' ? body.trim() : '');

  if (raw !== '') return raw.slice(0, 200);
  return EGRESS_SIGNATURE.test(`${err.message} ${body ? JSON.stringify(body) : ''}`)
    ? String(err.message).slice(0, 200)
    : null;
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return String(url || 'the API');
  }
}

/**
 * Turn any thrown value into { lines[], next[], exitCode } with a real next action.
 * Never leaks a stack unless --debug.
 */
function explainError(err, ctx = {}) {
  const host = ctx.baseUrl ? hostOf(ctx.baseUrl) : hostOf(DEFAULT_BASE_URL);

  if (err instanceof UserError) {
    return { lines: [err.message], next: err.next, exitCode: 1, kind: 'user' };
  }

  if (err instanceof ApiError) {
    if (err.status === 401) {
      return {
        lines: [t('err.401')],
        next: [t('err.401.next1', { path: store.configPath() }), t('err.401.next2')],
        exitCode: 2,
        kind: 'auth',
      };
    }
    if (err.status === 429) {
      return {
        lines: [t('err.429'), dim(err.message)],
        next: [err.retryAfter !== null
          ? t('err.429.next', { sec: err.retryAfter })
          : t('err.429.nextNoHeader')],
        exitCode: 2,
        kind: 'ratelimit',
      };
    }
    // Checked BEFORE the API-403 branch: a proxy denial is not an API refusal.
    const egress = egressBlockReason(err);
    if (egress !== null) {
      return {
        lines: [t('err.egress', { host }), dim(t('err.egress.detail', { reason: egress }))],
        next: [t('err.blocked.next1'), t('err.blocked.next2')],
        exitCode: 2,
        kind: 'blocked',
      };
    }
    if (err.status === 403) {
      return { lines: [t('err.403'), dim(err.message)], next: [t('err.403.next')], exitCode: 2, kind: 'forbidden' };
    }
    if (err.code === 'TIMEOUT') {
      return { lines: [t('err.timeout', { host })], next: [t('err.timeout.next')], exitCode: 2, kind: 'timeout' };
    }
    // A 2xx carrying HTML, or a body past the cap, is neither an API refusal nor
    // an empty result. Name it before the generic "network is blocking" branch,
    // which would otherwise swallow the one sentence that says what happened.
    if (err.code === 'NON_JSON_BODY') {
      return {
        lines: [t('err.nonJson', { host }), dim(err.message)],
        next: [t('err.nonJson.next1'), t('err.nonJson.next2', { host })],
        exitCode: 2,
        kind: 'non-json',
      };
    }
    if (err.code === 'BODY_TOO_LARGE') {
      return {
        lines: [t('err.tooLarge', { host }), dim(err.message)],
        next: [t('err.tooLarge.next')],
        exitCode: 2,
        kind: 'too-large',
      };
    }
    const codes = causeCodes(err);
    const blocked = codes.some((c) => NET_CODES.has(c))
      || err.code === 'NETWORK'
      || /fetch failed|proxy|tunneling socket/i.test(err.message || '');
    if (blocked) {
      return {
        lines: [t('err.blocked', { host }), dim(`(${codes.join(', ') || err.code})`)],
        next: [t('err.blocked.next1'), t('err.blocked.next2')],
        exitCode: 2,
        kind: 'blocked',
      };
    }
    if (err.status && err.status >= 400) {
      return { lines: [t('err.api', { status: err.status }), dim(err.message)], next: [], exitCode: 2, kind: 'http' };
    }
    return { lines: [err.message], next: [], exitCode: 2, kind: 'api' };
  }

  const codes = causeCodes(err);
  if (codes.some((c) => NET_CODES.has(c))) {
    return {
      lines: [t('err.blocked', { host }), dim(`(${codes.join(', ')})`)],
      next: [t('err.blocked.next1'), t('err.blocked.next2')],
      exitCode: 2,
      kind: 'blocked',
    };
  }

  return {
    lines: [t('err.unexpected'), dim(String(err && err.message ? err.message : err))],
    next: [t('err.stack')],
    exitCode: 2,
    kind: 'unexpected',
  };
}

function printError(explained) {
  warnOut('');
  warnOut(`${red('✗')} ${bold(explained.lines[0])}`);
  for (const extra of explained.lines.slice(1)) warnOut(`  ${extra}`);
  if (explained.next.length) {
    warnOut('');
    warnOut(`  ${yellow(`${t('common.nextStep')}:`)}`);
    for (const n of explained.next) warnOut(`    → ${n}`);
  }
  warnOut('');
}

/* ========================================================================== *
 * 7. ARGUMENTS                                                               *
 * ========================================================================== */

const OPTIONS = {
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean' },
  json: { type: 'boolean' },
  'dry-run': { type: 'boolean' },
  yes: { type: 'boolean', short: 'y' },
  'base-url': { type: 'string' },
  'fallback-base-url': { type: 'string' },
  'no-color': { type: 'boolean' },
  color: { type: 'boolean' },
  lang: { type: 'string' },
  debug: { type: 'boolean' },
  timeout: { type: 'string' },

  name: { type: 'string' },
  force: { type: 'boolean' },
  take: { type: 'string' },
  top: { type: 'string' },
  all: { type: 'boolean' },
  hours: { type: 'string' },
  check: { type: 'boolean' },
  'cross-check': { type: 'boolean' },

  skills: { type: 'string' },
  edge: { type: 'string' },
  'hours-per-week': { type: 'string' },
  video: { type: 'string' },
  'on-camera': { type: 'string' },
  'twitter-reach': { type: 'string' },
  regions: { type: 'string' },
  telegram: { type: 'string' },
  'daily-cap': { type: 'string' },
};

const COMMANDS = [
  'register', 'whoami', 'listings', 'rank', 'show',
  'draft', 'submit', 'update', 'profile', 'claim', 'help',
];

/**
 * Every rejection here has to say WHICH rule the value broke. One shared
 * "must be a number" for the not-a-number, out-of-range and non-integer cases
 * told the operator that `--daily-cap 99` was not a number, which is false and
 * sends them looking in the wrong place; the real rule is the 0-50 range.
 *
 * `integer: true` REFUSES a fractional value rather than truncating it. The
 * only flag that uses it is --daily-cap, a submission rate limit: silently
 * storing 2 when the operator typed 2.7 changes a safety control behind their
 * back, and they would never see it unless they re-read `profile show`.
 */
function parseNumberFlag(flags, key, { min, max, integer } = {}) {
  const raw = flags[key];
  if (raw === undefined) return null;
  const flag = `--${key}`;
  const text = String(raw).trim();
  const n = text === '' ? NaN : Number(text);
  if (!Number.isFinite(n)) throw new UserError(t('prof.badNumber', { flag }));
  if ((min !== undefined && n < min) || (max !== undefined && n > max)) {
    throw new UserError(t('prof.outOfRange', {
      flag,
      min: min === undefined ? '-∞' : min,
      max: max === undefined ? '∞' : max,
      got: text,
    }));
  }
  if (integer && !Number.isInteger(n)) {
    throw new UserError(t('prof.notInteger', { flag, got: text }));
  }
  return n;
}

function parseBoolFlag(flags, key) {
  const raw = flags[key];
  if (raw === undefined) return null;
  const v = String(raw).trim().toLowerCase();
  if (['true', 'yes', 'y', '1', 'on'].includes(v)) return true;
  if (['false', 'no', 'n', '0', 'off'].includes(v)) return false;
  throw new UserError(t('prof.badBool', { flag: `--${key}` }));
}

/* ========================================================================== *
 * 8. HELP                                                                    *
 * ========================================================================== */

const CMD_HELP = {
  register: {
    th: ['ลงทะเบียน agent ใหม่และรับคีย์ API + รหัสเคลม',
      'คีย์จะถูกบันทึกลง agent/.earn-agent.json (สิทธิ์ 0600) และไม่แสดงบนหน้าจอ',
      'ถ้ามีคีย์อยู่แล้วจะปฏิเสธ เว้นแต่ใส่ --force'],
    en: ['Register a new agent and receive an API key plus a claim code.',
      'The key is written to agent/.earn-agent.json (mode 0600) and never displayed.',
      'Refuses if a key already exists unless --force is passed.'],
    flags: ['--name <n>', '--force'],
  },
  whoami: {
    th: ['แสดงชื่อ agent คีย์แบบปิดบัง รหัสเคลม และโควตาที่ใช้ไปวันนี้',
      '--check จะยิง GET /api/agents/status เพื่อตรวจว่าคีย์ยังใช้ได้'],
    en: ['Show the agent name, the masked key, the claim code, and today\'s cap usage.',
      '--check calls GET /api/agents/status to confirm the key still works.'],
    flags: ['--check'],
  },
  listings: {
    th: ['ดึง listing ที่ agent ส่งได้ และบอกว่ามาจาก endpoint ไหน',
      'ถ้า endpoint หลักคืนค่าว่าง (บั๊ก #1456) จะสลับไปทางสำรองให้อัตโนมัติและแจ้งเตือน'],
    en: ['Fetch agent-eligible listings and say which endpoint answered.',
      'If the primary returns nothing usable (bug #1456) it falls back automatically and says so.'],
    flags: ['--take <n>', '--cross-check'],
  },
  rank: {
    th: ['ดึง + ให้คะแนน + เรียงลำดับ listing ตามเงินคาดหวังต่อชั่วโมง',
      'นี่คือคำสั่งที่ควรใช้บ่อยที่สุด คอลัมน์ทุกช่องอธิบายว่าทำไมแถวนั้นได้คะแนนเท่านั้น'],
    en: ['Fetch, score and rank listings by expected dollars per hour.',
      'This is the command to live in. Every column explains why a row scored what it did.'],
    flags: ['--top <n>', '--take <n>', '--hours <n>', '--all'],
  },
  show: {
    th: ['แสดงรายละเอียด listing หนึ่งรายการ รวมคำถามคัดกรองทั้งหมด',
      'รับได้ทั้ง listing id และ slug'],
    en: ['Show one listing in full, including its eligibility questions.',
      'Accepts either the listing id or the slug.'],
    flags: ['--hours <n>'],
  },
  draft: {
    th: ['สร้าง/แก้ร่างผลงานแบบโต้ตอบ แล้วตรวจด้วย qualityGate 13 ข้อ',
      'บันทึกที่ agent/drafts/<listingId>.json — ส่วนที่เป็นหลักฐานต้องแก้ในไฟล์เอง'],
    en: ['Build a submission draft interactively, then run the 13-item quality gate.',
      'Saved to agent/drafts/<listingId>.json. The evidence fields are edited in the file.'],
    flags: ['--hours <n>'],
  },
  submit: {
    th: ['ส่งร่างไปยัง POST /api/agents/submissions/create',
      'ตรวจซ้ำ ตรวจโควตา ตรวจคุณภาพ พิมพ์ body จริง แล้วถามยืนยันก่อนยิง',
      '--dry-run พิมพ์อย่างเดียวไม่ส่ง / --yes ข้ามการยืนยัน (ความเสี่ยงของผู้ใช้)'],
    en: ['Send the draft to POST /api/agents/submissions/create.',
      'Duplicate check, daily cap, quality gate, exact body printed, then an explicit confirmation.',
      '--dry-run prints and exits. --yes skips the confirmation (operator-accepted risk).'],
    flags: ['--dry-run', '--yes', '--hours <n>'],
  },
  update: {
    th: ['เหมือน submit แต่ยิงไปที่ POST /api/agents/submissions/update',
      'ต้องเคยส่ง listing นี้มาก่อน และแก้ได้ไม่เกินโควตาต่อวันต่อ listing'],
    en: ['Like submit, but against POST /api/agents/submissions/update.',
      'Requires a prior submission, and is capped per listing per day.'],
    flags: ['--dry-run', '--yes', '--hours <n>'],
  },
  profile: {
    th: ['ดู/แก้โปรไฟล์ที่ใช้ตอนจัดอันดับ',
      'profile           แสดงค่าปัจจุบัน',
      'profile edit      แก้แบบถามทีละข้อ',
      'profile set ...   แก้ด้วยตัวเลือกบรรทัดคำสั่ง'],
    en: ['View or edit the profile that ranking uses.',
      'profile           show current values',
      'profile edit      interactive edit',
      'profile set ...   set values from flags'],
    flags: ['--skills a,b', '--edge <n>', '--hours-per-week <n>', '--video true|false',
      '--on-camera true|false', '--twitter-reach true|false', '--regions a,b',
      '--telegram <url>', '--daily-cap <n>'],
  },
  claim: {
    th: ['พิมพ์รหัสเคลมและลิงก์ /earn/claim/<code> พร้อมสิ่งที่มนุษย์ต้องทำต่อ',
      'เครื่องมือนี้ไม่เคลมเงินและไม่แตะกระเป๋าเงินให้'],
    en: ['Print the claim code, the /earn/claim/<code> URL, and what the human must do.',
      'This tool never claims a payout and never touches a wallet.'],
    flags: [],
  },
};

function printGlobalHelp() {
  out('');
  out(`${bold('earn-agent')} ${grey(`v${VERSION}`)} — ${t('cli.tagline')}`);
  out('');
  out(bold(`${t('cli.usage')}:`));
  out('  node agent/bin/earn-agent.js <command> [args] [flags]');
  out('');
  out(bold(`${t('cli.commands')}:`));
  const rows = [
    ['register [--name <n>]', LANG === 'th' ? 'ลงทะเบียน agent รับคีย์ + รหัสเคลม' : 'Register an agent; get a key + claim code'],
    ['whoami [--check]', LANG === 'th' ? 'ตัวตน คีย์แบบปิดบัง โควตาวันนี้' : 'Identity, masked key, today\'s cap usage'],
    ['listings [--take 50]', LANG === 'th' ? 'listing ที่ agent ส่งได้ + บอกแหล่งข้อมูล' : 'Agent-eligible listings + which source answered'],
    ['rank [--top 10]', LANG === 'th' ? 'จัดอันดับตามเงินคาดหวังต่อชั่วโมง' : 'Rank by expected $/hour'],
    ['show <listingId>', LANG === 'th' ? 'รายละเอียดเต็ม + คำถามคัดกรอง' : 'Full detail + eligibility questions'],
    ['draft <listingId>', LANG === 'th' ? 'ร่างผลงาน + ตรวจคุณภาพ 13 ข้อ' : 'Build a draft + run the 13-item gate'],
    ['submit <listingId>', LANG === 'th' ? 'ส่งผลงาน (ต้องยืนยันด้วยมนุษย์)' : 'Submit (explicit human confirmation)'],
    ['update <listingId>', LANG === 'th' ? 'แก้ผลงานที่ส่งไปแล้ว' : 'Update an existing submission'],
    ['profile [set|edit]', LANG === 'th' ? 'โปรไฟล์ที่ใช้จัดอันดับ' : 'The profile ranking uses'],
    ['claim', LANG === 'th' ? 'พิมพ์รหัสเคลม + สิ่งที่มนุษย์ต้องทำ' : 'Print the claim code + human steps'],
  ];
  const w = Math.max(...rows.map((r) => dispWidth(r[0])));
  for (const [cmd, desc] of rows) out(`  ${cyan(pad(cmd, w))}  ${desc}`);

  out('');
  out(bold(`${t('cli.globalFlags')}:`));
  const flags = [
    ['--json', LANG === 'th' ? 'ผลลัพธ์เป็น JSON (ทุกคำสั่ง)' : 'Machine-readable output (every command)'],
    ['--dry-run', LANG === 'th' ? 'พิมพ์คำขอที่จะส่ง แต่ไม่ส่งจริง' : 'Print the request that would be sent; send nothing'],
    ['--yes', LANG === 'th' ? 'ข้ามการยืนยัน (ปิดอยู่โดยปริยาย ความเสี่ยงของผู้ใช้)' : 'Skip confirmation (off by default; operator-accepted risk)'],
    ['--base-url <u>', LANG === 'th' ? 'ชี้ไปเซิร์ฟเวอร์อื่น (ทดสอบ/mock)' : 'Point at another server (testing/mock)'],
    ['--lang th|en', LANG === 'th' ? 'ภาษา (ค่าเริ่มต้น th, อ่าน EARN_LANG ด้วย)' : 'Language (default th; EARN_LANG honoured)'],
    ['--no-color', LANG === 'th' ? 'ปิดสี (NO_COLOR ก็ได้ผลเหมือนกัน)' : 'Disable colour (NO_COLOR works too)'],
    ['--timeout <ms>', LANG === 'th' ? 'เวลารอสูงสุดต่อคำขอ' : 'Per-request timeout'],
    ['--debug', LANG === 'th' ? 'แสดง stack trace (คีย์ยังถูกปิดบังอยู่)' : 'Show stack traces (the key stays masked)'],
    ['--help', LANG === 'th' ? 'ความช่วยเหลือ' : 'This help'],
  ];
  const fw = Math.max(...flags.map((r) => dispWidth(r[0])));
  for (const [f, d] of flags) out(`  ${yellow(pad(f, fw))}  ${d}`);

  out('');
  out(bold(`${t('cli.examples')}:`));
  out(grey('  node agent/bin/earn-agent.js register --name "my-agent"'));
  out(grey('  node agent/bin/earn-agent.js rank --top 5'));
  out(grey('  node agent/bin/earn-agent.js draft cm123abc'));
  out(grey('  node agent/bin/earn-agent.js submit cm123abc --dry-run'));
  out('');
  out(grey(`  ${t('cli.exitCodes')}`));
  out(grey(`  ${t('cli.moreHelp')}`));
  out('');
}

function printCommandHelp(cmd) {
  const h = CMD_HELP[cmd];
  if (!h) return printGlobalHelp();
  out('');
  out(`${bold(`earn-agent ${cmd}`)}`);
  out('');
  for (const line of h[LANG] || h.en) out(`  ${line}`);
  if (h.flags.length) {
    out('');
    out(bold(`  ${t('cli.globalFlags')}:`));
    for (const f of h.flags) out(`    ${yellow(f)}`);
  }
  out('');
  out(grey(`  ${t('cli.exitCodes')}`));
  out('');
  return undefined;
}

/* ========================================================================== *
 * 9. CLIENT + STATE                                                          *
 * ========================================================================== */

function resolveBaseUrls(flags) {
  const baseUrl = flags['base-url'] || process.env.EARN_BASE_URL || DEFAULT_BASE_URL;
  // If the operator redirected the base URL, do NOT let the fallback tier leak
  // back to production. Same host unless they said otherwise.
  const explicitBase = Boolean(flags['base-url'] || process.env.EARN_BASE_URL);
  const fallbackBaseUrl = flags['fallback-base-url']
    || (explicitBase ? baseUrl : undefined);
  return { baseUrl, fallbackBaseUrl };
}

function loadState() {
  const state = store.load();
  registerSecret(state.apiKey);
  if (state._meta && state._meta.warnings && state._meta.warnings.length) {
    for (const w of state._meta.warnings) warnOut(`${yellow('!')} ${w}`);
  }
  return state;
}

function requireKey(state) {
  if (!state.apiKey) throw new UserError(t('err.noKey'), [t('err.noKey.next')]);
  return state.apiKey;
}

function makeClient(flags, apiKey) {
  const { baseUrl, fallbackBaseUrl } = resolveBaseUrls(flags);
  const timeoutMs = flags.timeout ? Number(flags.timeout) : undefined;
  return createClient({
    baseUrl,
    fallbackBaseUrl,
    apiKey: apiKey || null,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : undefined,
    userAgent: `earn-agent/${VERSION} (+zero-dep node cli)`,
  });
}

/** Profile fed to rank.js — state profile plus per-run overrides. */
function rankingProfile(state, flags, extra = {}) {
  const p = { ...store.defaultProfile(), ...(state.profile || {}) };
  const hours = flags.hours !== undefined ? Number(flags.hours) : undefined;
  if (Number.isFinite(hours) && hours > 0) p.defaultHours = hours;
  if (extra.defaultHours && Number.isFinite(extra.defaultHours) && extra.defaultHours > 0) {
    p.defaultHours = extra.defaultHours;
  }
  return p;
}

/* ========================================================================== *
 * 10. PROMPTS                                                                *
 * ========================================================================== */

function isInteractive() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function withPrompt(fn) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on('SIGINT', () => {
    rl.close();
    process.stderr.write(`\n${t('sub.cancelled')}\n`);
    process.exit(1);
  });
  try {
    return await fn(rl);
  } finally {
    rl.close();
  }
}

async function ask(rl, question, current) {
  const suffix = current !== undefined && current !== null && String(current) !== ''
    ? ` ${grey(`[${truncate(String(current), 40)}]`)}`
    : '';
  const answer = await rl.question(`  ${question}${suffix}: `);
  const trimmed = answer.trim();
  if (trimmed === '') return current === undefined ? '' : current;
  return trimmed;
}

async function askMultiline(rl, current) {
  out(`  ${grey(LANG === 'th' ? '(พิมพ์ "." บรรทัดเดียวเพื่อจบ, "-" เพื่อคงค่าเดิม)' : '("." on its own line to finish, "-" to keep the current text)')}`);
  const lines = [];
  for (;;) {
    const line = await rl.question('  | ');
    if (line.trim() === '.') break;
    if (lines.length === 0 && line.trim() === '-') return current;
    lines.push(line);
  }
  const text = lines.join('\n').trim();
  return text === '' ? current : text;
}

/* ========================================================================== *
 * 11. DRAFTS                                                                 *
 * ========================================================================== */

function draftsDir() {
  return path.join(store.agentDir(), 'drafts');
}

function draftPath(listingId) {
  const safeName = String(listingId).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'listing';
  return path.join(draftsDir(), `${safeName}.json`);
}

function emptyDraft(listingId, listing) {
  return {
    listingId: String(listingId),
    listingTitle: listing ? listing.title : null,
    listingSlug: listing ? listing.slug : null,
    listingUrl: listing ? listing.url : null,

    // --- the submission body itself -------------------------------------
    link: '',
    tweet: '',
    otherInfo: '',
    ask: null,
    telegram: '',
    eligibilityAnswers: (listing && Array.isArray(listing.eligibilityQuestions)
      ? listing.eligibilityQuestions
      : []).map((q) => ({ question: q.question, answer: '' })),

    // --- the operator's own estimate ------------------------------------
    hoursEstimate: null,

    // --- evidence the 13-item gate demands ------------------------------
    compliance: [],
    judgingMap: [],
    criteriaInferred: false,
    linkCheck: { status: null, checkedAt: null, cleanRoom: null },
    runCheck: { command: '', exitCode: null, cleanContainer: null },
    readme: { timed: false, readAloudSeconds: null, sections: [], limits: [] },
    tests: { ci: null, hasFailingIfBrokenTest: false, runLog: { exitCode: null } },
    repo: { url: '', public: null, license: '', commits: null, commitSubjects: [] },
    attribution: {
      vendoredUnattributed: [], template: {}, priorSubmissionOverlap: null, statedInReadme: false,
    },
    secretScan: { clean: false, hits: [] },
    humanSignOff: { approved: false, openedLink: false, by: '', at: null },

    _meta: { createdAt: new Date().toISOString(), updatedAt: null, tool: `earn-agent/${VERSION}` },
  };
}

function loadDraft(listingId) {
  const file = draftPath(listingId);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveDraft(draft) {
  const dir = draftsDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = draftPath(draft.listingId);
  const body = { ...draft, _meta: { ...(draft._meta || {}), updatedAt: new Date().toISOString() } };
  // Drafts can contain unreleased work. Owner-only, same as the credential file.
  fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch { /* best effort */ }
  return file;
}

/** Which JSON field a gate failure code is fixed in. */
const FIX_HINTS = {
  'no-compliance-matrix': 'compliance[] { requirement, satisfiedBy }',
  'compliance-row-empty': 'compliance[].requirement',
  'compliance-unmapped': 'compliance[].satisfiedBy',
  'compliance-partial': 'compliance[].satisfiedBy',
  'compliance-missing-requirement': 'compliance[]',
  'question-unparsed': 'eligibilityAnswers[]',
  'answer-missing': 'eligibilityAnswers[].answer',
  'answer-placeholder': 'eligibilityAnswers[].answer',
  'answer-too-short': 'eligibilityAnswers[].answer',
  'answer-not-prose': 'eligibilityAnswers[].answer',
  'answer-na-unexplained': 'eligibilityAnswers[].answer',
  'link-unusable': 'link',
  'link-unverified': 'linkCheck { status, checkedAt, cleanRoom }',
  'link-not-200': 'linkCheck.status',
  'link-check-stale': 'linkCheck.checkedAt',
  'link-not-clean-room': 'linkCheck.cleanRoom',
  'link-clean-room-unknown': 'linkCheck.cleanRoom',
  'run-command-missing': 'runCheck.command',
  'run-unverified': 'runCheck.exitCode',
  'run-failed': 'runCheck.exitCode',
  'run-not-clean': 'runCheck.cleanContainer',
  'readme-untimed': 'readme.readAloudSeconds',
  'readme-too-long': 'readme.readAloudSeconds',
  'readme-timing-invalid': 'readme.readAloudSeconds',
  'readme-timing-not-attested': 'readme.timed',
  'readme-section-missing': 'readme.sections[]',
  'readme-section-order': 'readme.sections[]',
  'judging-map-missing': 'judgingMap[] { criterion, where, howToVerify }',
  'judging-row-no-criterion': 'judgingMap[].criterion',
  'judging-row-no-where': 'judgingMap[].where',
  'judging-row-no-how': 'judgingMap[].howToVerify',
  'judging-criterion-uncovered': 'judgingMap[]',
  'judging-criteria-inferred-unstated': 'criteriaInferred',
  'unattributed-code': 'attribution.vendoredUnattributed',
  'template-delta-unknown': 'attribution.template.newLineRatio',
  'template-delta-too-small': 'attribution.template.newLineRatio',
  'recycled-artifact': 'attribution.priorSubmissionOverlap + otherInfo',
  'tests-not-green': 'tests.ci / tests.runLog.exitCode',
  'no-meaningful-test': 'tests.hasFailingIfBrokenTest',
  'limit-not-a-limit': 'readme.limits[]',
  'limits-too-few': 'readme.limits[]',
  'repo-url-unusable': 'repo.url',
  'repo-private': 'repo.public',
  'repo-no-license': 'repo.license',
  'repo-commits-unknown': 'repo.commits',
  'repo-too-few-commits': 'repo.commits',
  'repo-squashed-history': 'repo.commitSubjects[]',
  'secret-scan-not-run': 'secretScan.clean',
  'secrets-found': 'secretScan.hits',
  'secret-in-submission-body': 'otherInfo / link / eligibilityAnswers',
  'listing-id-missing': 'listingId',
  'listing-id-mismatch': 'listingId',
  'other-info-too-short': 'otherInfo',
  'other-info-too-long': 'otherInfo',
  'other-info-filler': 'otherInfo',
  'other-info-prose': 'otherInfo',
  'tweet-unrequested': 'tweet',
  'tweet-required': 'tweet',
  'tweet-url-unusable': 'tweet',
  'ask-unrequested': 'ask',
  'ask-not-a-number': 'ask',
  'telegram-malformed': 'telegram',
  'stub-title': 'eligibilityAnswers[] (Project Title)',
  'no-human-signoff': 'humanSignOff.approved',
  'link-not-opened-by-human': 'humanSignOff.openedLink',
  'signoff-unattributed': 'humanSignOff.by',
  'signoff-untimed': 'humanSignOff.at',
  'signoff-in-future': 'humanSignOff.at',
  'signoff-stale': 'humanSignOff.at (re-approve the draft as it stands now)',
  'duplicate-create': '→ use the `update` command',
  'micro-value-rate': 'hoursEstimate (or skip the listing)',
  'gate-error': '(the draft JSON itself)',
};

function printGateResult(gate, file) {
  heading(t('draft.gate'));
  if (gate.pass) {
    out(`  ${green('✓')} ${t('draft.gatePass')}`);
  } else {
    out(`  ${red('✗')} ${t('draft.gateFail', { n: gate.failures.length })}`);
    out('');
    for (const f of gate.failures) {
      const item = String(f.item) === 'R' ? 'R' : `#${f.item}`;
      out(`  ${red(pad(item, 3))} ${f.message}`);
      const hint = FIX_HINTS[f.code];
      if (hint) out(`      ${grey(`${t('draft.fixIn')}: ${hint}`)}`);
    }
    if (file) {
      out('');
      out(`  ${yellow('→')} ${t('draft.editFile', { path: file })}`);
    }
  }
  if (gate.warnings && gate.warnings.length) {
    out('');
    out(`  ${yellow(t('draft.warnings'))}:`);
    for (const w of gate.warnings) out(`  ${yellow(pad(`#${w.item}`, 3))} ${w.message}`);
  }
}

/* ========================================================================== *
 * 12. LISTING HELPERS                                                        *
 * ========================================================================== */

async function fetchListings(client, flags) {
  const take = flags.take !== undefined ? Number(flags.take) : 20;
  return client.liveListings({
    take: Number.isFinite(take) ? take : 20,
    crossCheck: Boolean(flags['cross-check']),
  });
}

function sourceLabel(source) {
  if (source === 'agents-live') return t('list.sourcePrimary');
  if (source === 'none') return t('list.sourceNone');
  return t('list.sourceFallback');
}

/** Green only when the agent endpoint really answered; 'none' is not a source. */
function sourceColor(source) {
  if (source === 'agents-live') return green(source);
  if (source === 'none') return grey(source);
  return yellow(source);
}

function printSource(result) {
  out(`  ${grey(`${t('list.source')}:`)} ${sourceColor(result.source)} ${grey(`— ${sourceLabel(result.source)}`)}`);
  if (result.warnings && result.warnings.length) {
    out('');
    out(`  ${yellow(t('list.warnings'))}:`);
    for (const w of result.warnings) out(`    ${yellow('!')} ${w}`);
  }
}

/**
 * Find one listing by id or slug, preferring the details endpoint (the ONLY
 * place eligibility questions exist). Returns { listing, warnings, source }.
 */
async function resolveListing(client, idOrSlug, flags) {
  const warnings = [];
  let fromList = null;
  let source = null;

  try {
    const res = await fetchListings(client, { ...flags, take: flags.take ?? 50 });
    source = res.source;
    warnings.push(...res.warnings);
    fromList = res.listings.find((l) => l.id === idOrSlug || l.slug === idOrSlug) || null;
  } catch (err) {
    warnings.push(`listing discovery failed: ${err.message}`);
  }

  const slug = fromList ? fromList.slug : (/^[a-z0-9][a-z0-9-]*$/i.test(idOrSlug) ? idOrSlug : null);
  if (slug) {
    try {
      const detail = await client.listingDetails(slug);
      return { listing: detail.listing, warnings, source, detailed: true };
    } catch (err) {
      warnings.push(t('show.detailFailed', { msg: err.message }));
    }
  }

  if (!fromList) {
    throw new UserError(t('show.notFound', { id: idOrSlug }), [t('show.notFound.next')]);
  }
  return { listing: fromList, warnings, source, detailed: false };
}

/* ========================================================================== *
 * 13. COMMANDS                                                               *
 * ========================================================================== */

async function cmdRegister(flags) {
  const state = loadState();

  if (state.apiKey && !flags.force) {
    throw new UserError(
      t('reg.already', { name: state.agentName || '—' }),
      [t('reg.already.next')],
    );
  }

  let name = typeof flags.name === 'string' ? flags.name.trim() : '';
  if (!name) {
    if (!isInteractive() || flags.json) {
      throw new UserError(t('reg.needName'), [t('reg.needName.next')]);
    }
    name = await withPrompt((rl) => rl.question(`  ${t('reg.prompt')}`));
    name = String(name || '').trim();
    if (!name) throw new UserError(t('reg.needName'), [t('reg.needName.next')]);
  }

  const client = makeClient(flags, null);
  const result = await client.register({ name });
  registerSecret(result.apiKey);

  const next = {
    ...state,
    apiKey: result.apiKey,
    claimCode: result.claimCode,
    claimUrl: result.claimUrl,
    agentName: result.agent.name,
    agentId: result.agent.agentId,
    username: result.agent.username,
    registeredAt: new Date().toISOString(),
  };
  const file = store.save(next);

  if (flags.json) {
    return emitJson({
      ok: true,
      command: 'register',
      agentName: next.agentName,
      agentId: next.agentId,
      username: next.username,
      apiKey: store.maskKey(result.apiKey),
      claimCode: result.claimCode,
      claimUrl: result.claimUrl,
      statePath: file,
      keyProtection: store.configProtection(file),
    });
  }

  heading(t('reg.ok'));
  kv(t('who.name'), bold(next.agentName || '—'));
  kv(t('who.key'), `${store.maskKey(result.apiKey)} ${grey(`(${t('reg.keyNotice', { masked: store.maskKey(result.apiKey) })})`)}`);
  out('');
  printKeyProtection(file);
  printClaimBlock(next);
  return undefined;
}

/**
 * Say what was actually CHECKED about the file holding the live API key.
 *
 * The old wording was a constant: "(mode 0600, already gitignored)". The mode
 * half happened to be true; the gitignore half was an assumption about the
 * default location that EARN_AGENT_HOME can invalidate — including by moving
 * the key somewhere git IS watching, which is precisely when the operator
 * needs to be told. store.configProtection() reads both facts off disk.
 */
function printKeyProtection(file) {
  const prot = store.configProtection(file);
  const modeText = prot.mode === null ? '?' : prot.mode.toString(8);

  out(`  ${grey(t('reg.saved', { path: prot.path }))}`);
  out(`  ${prot.modeOk
    ? grey(t('reg.modeOk', { mode: modeText }))
    : yellow(`! ${t('reg.modeBad', { mode: modeText, path: prot.path })}`)}`);

  if (prot.gitStatus === 'ignored') {
    out(`  ${grey(t('reg.gitIgnored', { repo: prot.repoRoot }))}`);
  } else if (prot.gitStatus === 'no-repo') {
    out(`  ${grey(t('reg.gitNoRepo'))}`);
  } else {
    const rel = path.relative(prot.repoRoot, prot.path).split(path.sep).join('/');
    out('');
    out(`  ${red('!')} ${bold(red(t('reg.gitExposed', { repo: prot.repoRoot })))}`);
    out(`  ${yellow('→')} ${t('reg.gitExposed.next', { repo: prot.repoRoot, rel })}`);
  }
}

function printClaimBlock(state) {
  heading(t('claim.header'));
  if (!state.claimCode) {
    out(`  ${yellow('!')} ${t('claim.none')}`);
    return;
  }
  const url = state.claimUrl || `${DEFAULT_BASE_URL}/earn/claim/${state.claimCode}`;
  out('');
  out(`  ${bold(magenta(`${t('claim.code')}: ${state.claimCode}`))}`);
  out(`  ${bold(cyan(`${t('claim.url')}:  ${url}`))}`);
  out('');
  bullet(t('claim.step1'));
  bullet(t('claim.step2'));
  bullet(t('claim.step3'));
  bullet(t('claim.step4'));
  out('');
  out(`  ${yellow('!')} ${t('claim.secret')}`);
  out(`  ${grey(t('claim.warn'))}`);
}

async function cmdWhoami(flags) {
  const state = loadState();
  const info = store.describe(state);

  let server = null;
  let serverError = null;
  if (flags.check) {
    const apiKey = requireKey(state);
    const client = makeClient(flags, apiKey);
    try {
      server = await client.status();
    } catch (err) {
      serverError = explainError(err, { baseUrl: client.baseUrl });
    }
  }

  if (flags.json) {
    return emitJson({
      ok: true,
      command: 'whoami',
      registered: Boolean(state.apiKey),
      agentName: info.agentName,
      username: info.username,
      apiKey: info.apiKey,
      claimCode: state.claimCode,
      claimUrl: state.claimUrl,
      registeredAt: info.registeredAt,
      statePath: info.path,
      keyProtection: store.configProtection(info.path),
      dailyCap: info.dailyCap,
      submittedToday: info.submittedToday,
      remainingToday: info.remainingToday,
      totalSubmissions: info.totalSubmissions,
      server: server ? { status: server.status, claimed: server.claimed, claimedAt: server.claimedAt } : null,
      serverError: serverError ? serverError.lines.map((l) => l.replace(ANSI, '')) : null,
    });
  }

  heading(t('who.header'));
  if (!state.apiKey) {
    out(`  ${yellow('!')} ${t('err.noKey')}`);
    out(`  ${yellow('→')} ${t('err.noKey.next')}`);
    return undefined;
  }
  kv(t('who.name'), bold(info.agentName || '—'));
  kv(t('who.key'), info.apiKey);
  kv(t('who.claim'), state.claimCode ? magenta(state.claimCode) : grey(t('common.none')));
  kv(t('who.registered'), info.registeredAt ? fmtDate(info.registeredAt) : grey(t('common.unknown')));
  kv(t('who.file'), grey(info.path));

  // EARN_AGENT_HOME can be changed at any time after register, so re-check
  // rather than trusting whatever was true the day the key was created.
  const prot = store.configProtection(info.path);
  if (prot.gitStatus === 'not-ignored') {
    const rel = path.relative(prot.repoRoot, prot.path).split(path.sep).join('/');
    out('');
    out(`  ${red('!')} ${bold(red(t('reg.gitExposed', { repo: prot.repoRoot })))}`);
    out(`  ${yellow('→')} ${t('reg.gitExposed.next', { repo: prot.repoRoot, rel })}`);
  }
  // Mode drift is not repeated here: store.load() already warned about it on
  // stderr before this ran.

  heading(LANG === 'th' ? 'โควตาการส่ง' : 'Submission budget');
  kv(t('who.today'), `${bold(String(info.submittedToday))} / ${info.dailyCap}`);
  kv(t('who.remaining'), info.remainingToday > 0 ? green(String(info.remainingToday)) : red('0'));
  kv(t('who.total'), String(info.totalSubmissions));

  if (server) {
    heading(t('who.serverStatus'));
    kv(t('common.status'), server.status || grey(t('common.unknown')));
    kv(t('who.claim'), server.claimed ? green(t('who.claimed')) : yellow(t('who.notClaimed')));
  } else if (serverError) {
    printError(serverError);
    return serverError.exitCode;
  }
  return undefined;
}

async function cmdClaim(flags) {
  const state = loadState();
  if (flags.json) {
    return emitJson({
      ok: Boolean(state.claimCode),
      command: 'claim',
      claimCode: state.claimCode,
      claimUrl: state.claimUrl || (state.claimCode ? `${DEFAULT_BASE_URL}/earn/claim/${state.claimCode}` : null),
      humanSteps: [t('claim.step1'), t('claim.step2'), t('claim.step3'), t('claim.step4')],
      note: t('claim.warn'),
    });
  }
  if (!state.claimCode) {
    throw new UserError(t('claim.none'), [t('err.noKey.next')]);
  }
  printClaimBlock(state);
  return undefined;
}

async function cmdListings(flags) {
  const state = loadState();
  const apiKey = requireKey(state);
  const client = makeClient(flags, apiKey);
  const result = await fetchListings(client, flags);

  if (flags.json) {
    return emitJson({
      ok: true,
      command: 'listings',
      source: result.source,
      warnings: result.warnings,
      count: result.listings.length,
      listings: result.listings.map((l) => ({
        id: l.id, title: l.title, slug: l.slug, url: l.url, sponsor: l.sponsor,
        type: l.type, skill: l.skill, agentAccess: l.agentAccess, token: l.token,
        rewardUsd: l.rewardUsd, rewardAmount: l.rewardAmount, submissions: l.submissions,
        deadline: l.deadline, status: l.status, region: l.region,
      })),
    });
  }

  heading(t('list.header'));
  printSource(result);
  out('');

  if (!result.listings.length) {
    out(`  ${yellow('!')} ${t('list.empty')}`);
    return undefined;
  }

  const rows = result.listings.map((l, i) => ({
    n: String(i + 1),
    title: l.title,
    sponsor: l.sponsor || '—',
    pool: l.rewardUsd !== null ? fmtMoney(l.rewardUsd) : `${fmtNum(l.rewardAmount)} ${l.token || ''}`.trim(),
    entrants: fmtNum(l.submissions),
    access: l.agentAccess === 'AGENT_ONLY' ? green('AGENT_ONLY') : (l.agentAccess || '—'),
    deadline: `${fmtDate(l.deadline)} ${grey(`(${runwayLabel(l.deadline)})`)}`,
    id: l.id,
  }));

  renderTable([
    { key: 'n', label: '#', align: 'right' },
    { key: 'title', label: 'TITLE', max: 34 },
    { key: 'sponsor', label: 'SPONSOR', max: 16 },
    { key: 'pool', label: 'POOL', align: 'right' },
    { key: 'entrants', label: 'ENTR', align: 'right' },
    { key: 'access', label: 'ACCESS' },
    { key: 'deadline', label: 'DEADLINE' },
    { key: 'id', label: 'ID', max: 28 },
  ], rows);

  out('');
  out(`  ${grey(t('list.count', { n: result.listings.length }))}`);
  out(`  ${grey(t('rank.next'))}`);
  return undefined;
}

async function cmdRank(flags) {
  const state = loadState();
  const apiKey = requireKey(state);
  const client = makeClient(flags, apiKey);
  const result = await fetchListings(client, { ...flags, take: flags.take ?? 50 });

  const profile = rankingProfile(state, flags);
  const { ranked, skipped } = rank.partitionListings(result.listings, profile);
  const topN = flags.top !== undefined ? Number(flags.top) : 10;
  const limit = flags.all ? ranked.length : (Number.isFinite(topN) && topN > 0 ? topN : 10);
  const shown = ranked.slice(0, limit);

  if (flags.json) {
    return emitJson({
      ok: true,
      command: 'rank',
      source: result.source,
      warnings: result.warnings,
      profile: { ...profile },
      ranked: shown.map((e) => ({
        listingId: e.listing.id,
        title: e.listing.title,
        sponsor: e.listing.sponsor,
        slug: e.listing.slug,
        deadline: e.listing.deadline,
        score: e.result.score,
        verdict: e.result.verdict,
        band: e.result.band,
        expectedUsd: e.result.expectedUsd,
        expectedPerHour: e.result.expectedPerHour,
        fit: e.result.fit,
        crowding: e.result.crowding,
        runwayOk: e.result.runwayOk,
        inputs: e.result.inputs,
        reasons: e.result.reasons,
        assumptions: e.result.assumptions,
      })),
      skippedCount: skipped.length,
      skipped: skipped.map((e) => ({
        listingId: e.listing.id, title: e.listing.title, reasons: e.result.reasons,
      })),
    });
  }

  heading(t('rank.header'));
  printSource(result);
  out('');

  if (!shown.length) {
    out(`  ${yellow('!')} ${t('rank.empty')}`);
    if (skipped.length) out(`  ${grey(t('rank.skipped', { n: skipped.length }))}`);
    return undefined;
  }

  const rows = shown.map((e, i) => {
    const r = e.result;
    const pool = r.inputs.pool;
    const entrants = r.inputs.entrants;
    return {
      n: String(i + 1),
      title: e.listing.title,
      sponsor: e.listing.sponsor || '—',
      pool: fmtMoney(pool),
      entrants: fmtNum(entrants),
      perEntrant: entrants > 0 ? fmtMoney(pool / entrants) : '—',
      hours: fmtHours(r.inputs.hoursEstimate),
      perHour: r.expectedPerHour >= rank.CONSTANTS.MIN_RATE_USD
        ? green(fmtMoney(r.expectedPerHour, 2))
        : yellow(fmtMoney(r.expectedPerHour, 2)),
      runway: r.runwayOk ? fmtHours(r.inputs.hoursToDeadline) : red(fmtHours(r.inputs.hoursToDeadline)),
      verdict: verdictColor(r.verdict),
      score: String(r.score),
    };
  });

  renderTable([
    { key: 'n', label: '#', align: 'right' },
    { key: 'title', label: 'TITLE', max: 30 },
    { key: 'sponsor', label: 'SPONSOR', max: 14 },
    { key: 'pool', label: 'POOL', align: 'right' },
    { key: 'entrants', label: 'ENTR', align: 'right' },
    { key: 'perEntrant', label: '$/ENTR', align: 'right' },
    { key: 'hours', label: 'EST h', align: 'right' },
    { key: 'perHour', label: 'EXP $/h', align: 'right' },
    { key: 'runway', label: 'RUNWAY', align: 'right' },
    { key: 'verdict', label: 'VERDICT' },
    { key: 'score', label: 'SCORE', align: 'right' },
  ], rows);

  out('');
  for (let i = 0; i < shown.length; i += 1) {
    const e = shown[i];
    out(`  ${bold(`${i + 1}. ${e.listing.title}`)}  ${grey(e.listing.id)}`);
    const reasons = (e.result.reasons || []).slice(0, 3);
    for (const r of reasons) out(`     ${grey('·')} ${r}`);
    if (e.result.gates && e.result.gates.length) {
      for (const g of e.result.gates) out(`     ${red('✗')} ${g.reason}`);
    }
    out('');
  }

  if (skipped.length) out(`  ${grey(t('rank.skipped', { n: skipped.length }))}`);
  out(`  ${grey(t('rank.legend'))}`);
  out(`  ${grey(t('rank.verdictLegend'))}`);
  out(`  ${grey(t('rank.next'))}`);
  return undefined;
}

async function cmdShow(flags, positional) {
  const id = positional[1];
  if (!id) throw new UserError(LANG === 'th' ? 'ต้องระบุ listingId' : 'A listingId is required', ['node agent/bin/earn-agent.js show <listingId>']);

  const state = loadState();
  const apiKey = requireKey(state);
  const client = makeClient(flags, apiKey);
  const { listing, warnings, source, detailed } = await resolveListing(client, id, flags);

  const profile = rankingProfile(state, flags);
  const scored = rank.scoreListing(listing, profile);

  if (flags.json) {
    return emitJson({
      ok: true,
      command: 'show',
      source,
      detailed,
      warnings,
      listing: {
        id: listing.id, title: listing.title, slug: listing.slug, url: listing.url,
        sponsor: listing.sponsor, type: listing.type, skill: listing.skill,
        agentAccess: listing.agentAccess, token: listing.token, rewardUsd: listing.rewardUsd,
        rewardAmount: listing.rewardAmount, prizes: listing.prizes, submissions: listing.submissions,
        deadline: listing.deadline, status: listing.status, region: listing.region,
        eligibilityQuestions: listing.eligibilityQuestions,
      },
      score: scored,
    });
  }

  heading(t('show.header'));
  out('');
  out(`  ${bold(listing.title)}`);
  out(`  ${grey(listing.url || listing.id)}`);
  out('');
  kv(t('common.id'), listing.id);
  kv(t('common.sponsor'), listing.sponsor || grey(t('common.unknown')));
  kv(t('common.type'), listing.type || grey(t('common.unknown')));
  kv(t('common.skill'), listing.skill || grey(t('common.unknown')));
  kv(t('common.access'), listing.agentAccess || grey(t('common.unknown')));
  kv(t('common.status'), listing.status || grey(t('common.unknown')));
  kv(t('common.region'), listing.region || grey(t('common.unknown')));
  kv(t('common.pool'), listing.rewardUsd !== null
    ? bold(fmtMoney(listing.rewardUsd))
    : `${fmtNum(listing.rewardAmount)} ${listing.token || ''}`.trim());
  kv(t('common.entrants'), fmtNum(listing.submissions));
  kv(t('common.deadline'), `${fmtDate(listing.deadline)} ${grey(`(${runwayLabel(listing.deadline)})`)}`);

  if (listing.prizes && listing.prizes.length) {
    out('');
    out(`  ${grey(LANG === 'th' ? 'รางวัลรายอันดับ:' : 'Prizes by position:')}`);
    for (const p of listing.prizes) {
      out(`    ${grey(`#${p.position}`)} ${fmtNum(p.amount)} ${listing.token || ''}`);
    }
  }

  heading(t('show.questions'));
  if (!listing.eligibilityQuestions || !listing.eligibilityQuestions.length) {
    out(`  ${grey(t('show.noQuestions'))}`);
  } else {
    listing.eligibilityQuestions.forEach((q, i) => {
      out(`  ${cyan(`${i + 1}.`)} ${q.question}${q.optional ? grey(LANG === 'th' ? '  (ไม่บังคับ)' : '  (optional)') : ''}${q.type === 'link' ? grey('  [link]') : ''}`);
    });
  }

  heading(t('show.score'));
  kv('verdict', `${verdictColor(scored.verdict)}  ${grey(`score ${scored.score} / band ${scored.band}`)}`);
  kv('expected', `${fmtMoney(scored.expectedUsd, 2)}  ${grey(`(${fmtMoney(scored.expectedPerHour, 2)}/h)`)}`);
  kv('fit / crowding', `${scored.fit} / ${scored.crowding}`);
  kv('runway ok', scored.runwayOk ? green(t('common.yes')) : red(t('common.no')));

  out('');
  out(`  ${grey(`${t('show.breakdown')}:`)}`);
  const parts = [
    ['MONEY', scored.money, rank.WEIGHTS.MONEY],
    ['FIT', scored.fit, rank.WEIGHTS.FIT],
    ['CROWD', scored.crowding, rank.WEIGHTS.CROWD],
    ['RUNWAY', scored.runway, rank.WEIGHTS.RUNWAY],
    ['SPONSOR', scored.sponsor, rank.WEIGHTS.SPONSOR],
    ['VERIFY', scored.verify, rank.WEIGHTS.VERIFY],
    ['EXCL', scored.exclusivity, rank.WEIGHTS.EXCLUSIVITY],
  ];
  for (const [label, value, weight] of parts) {
    const v = Number(value) || 0;
    const bar = '█'.repeat(Math.max(0, Math.round(v * 20)));
    out(`    ${pad(label, 8)} ${pad(v.toFixed(2), 5, 'right')} ${grey(`w=${weight ?? '—'}`)}  ${cyan(bar)}`);
  }

  out('');
  out(`  ${grey(`${t('rank.reasons')}:`)}`);
  for (const r of (scored.reasons || []).slice(0, 8)) out(`    ${grey('·')} ${r}`);

  if (scored.assumptions && scored.assumptions.length) {
    out('');
    out(`  ${yellow(`${t('show.assumptions')}:`)}`);
    for (const a of scored.assumptions) out(`    ${yellow('!')} ${a}`);
  }

  if (warnings.length) {
    out('');
    for (const w of warnings) out(`  ${grey(`! ${w}`)}`);
  }

  out('');
  out(`  ${grey(t('show.next', { id: listing.id }))}`);
  return undefined;
}

async function cmdDraft(flags, positional) {
  const id = positional[1];
  if (!id) throw new UserError(LANG === 'th' ? 'ต้องระบุ listingId' : 'A listingId is required', ['node agent/bin/earn-agent.js draft <listingId>']);

  const state = loadState();
  const apiKey = requireKey(state);
  const client = makeClient(flags, apiKey);
  const { listing, warnings } = await resolveListing(client, id, flags);

  const file = draftPath(listing.id);
  const existing = loadDraft(listing.id);
  let draft = existing || emptyDraft(listing.id, listing);
  const isNew = !existing;

  // Keep the answer list in step with the listing's current questions.
  const questions = Array.isArray(listing.eligibilityQuestions) ? listing.eligibilityQuestions : [];
  const byQuestion = new Map((draft.eligibilityAnswers || []).map((a) => [a.question, a.answer]));
  draft.eligibilityAnswers = questions.map((q) => ({
    question: q.question,
    answer: byQuestion.get(q.question) || '',
  }));
  draft.listingTitle = listing.title;
  draft.listingSlug = listing.slug;
  draft.listingUrl = listing.url;
  if (!draft.telegram && state.profile && state.profile.telegram) draft.telegram = state.profile.telegram;

  const interactive = isInteractive() && !flags.json;

  if (!flags.json) {
    heading(t('draft.header'));
    out(`  ${bold(listing.title)}  ${grey(listing.id)}`);
    out('');
    out(`  ${grey(isNew ? t('draft.created', { path: file }) : t('draft.loaded', { path: file }))}`);
    for (const w of warnings) out(`  ${grey(`! ${w}`)}`);
  }

  if (interactive) {
    heading(t('draft.interactive'));
    await withPrompt(async (rl) => {
      draft.link = await ask(rl, t('draft.link'), draft.link);
      draft.repo = draft.repo || {};
      draft.repo.url = await ask(rl, t('draft.repo'), draft.repo.url);
      draft.telegram = await ask(rl, t('draft.telegram'), draft.telegram);

      const hours = await ask(rl, t('draft.hours'), draft.hoursEstimate ?? '');
      const hoursNum = Number(hours);
      draft.hoursEstimate = Number.isFinite(hoursNum) && hoursNum > 0 ? hoursNum : draft.hoursEstimate;

      out('');
      out(`  ${bold(t('draft.otherInfo'))}`);
      out(`  ${grey(t('draft.otherInfo.rule', {
        min: rank.CONSTANTS.OTHER_INFO_MIN, max: rank.CONSTANTS.OTHER_INFO_MAX,
      }))}`);
      draft.otherInfo = await askMultiline(rl, draft.otherInfo);

      for (let i = 0; i < draft.eligibilityAnswers.length; i += 1) {
        const entry = draft.eligibilityAnswers[i];
        out('');
        out(`  ${cyan(`Q${i + 1}.`)} ${entry.question}`);
        entry.answer = await ask(
          rl,
          t('draft.answer', { n: i + 1, min: rank.CONSTANTS.ANSWER_MIN_CHARS }),
          entry.answer,
        );
      }
    });
  } else if (!flags.json) {
    out(`  ${grey(t('draft.nonInteractive'))}`);
  }

  const saved = saveDraft(draft);
  draft = loadDraft(listing.id) || draft;

  const profile = rankingProfile(state, flags, { defaultHours: draft.hoursEstimate });
  const scored = rank.scoreListing(listing, profile);
  const prior = store.findSubmission(listing.id, state);
  const gate = rank.qualityGate(gateInput(draft, scored, prior, 'create'), listing);

  if (flags.json) {
    emitJson({
      ok: gate.pass,
      command: 'draft',
      listingId: listing.id,
      draftPath: saved,
      created: isNew,
      verdict: scored.verdict,
      expectedPerHour: scored.expectedPerHour,
      gate,
      warnings,
    });
    return gate.pass ? 0 : 1;
  }

  out('');
  out(`  ${green('✓')} ${t('draft.saved', { path: saved })}`);
  printGateResult(gate, saved);
  if (gate.pass) {
    out('');
    out(`  ${grey(t('draft.next', { id: listing.id }))}`);
  }
  return gate.pass ? 0 : 1;
}

/**
 * The draft as the gate sees it: the stored draft plus the three facts only the
 * CLI knows (engine verdict, EV per hour, and whether a submission already exists).
 * Those three drive the gate's refusal rules; they are never stored in the file
 * because they go stale the moment the listing changes.
 */
/**
 * Translate a store.LimitError raised at reservation time into the same
 * operator-facing refusal the pre-flight checks print. A limit that only trips
 * at the last moment (because a sibling process spent the budget) must read
 * exactly like one that tripped early — never like an internal error.
 */
function limitToUserError(err, id, mode) {
  const cap = err.details && err.details.cap;
  const used = err.details && err.details.used;
  switch (err.code) {
    case 'DUPLICATE': {
      const prior = err.details && err.details.prior;
      return new UserError(
        t('sub.duplicate', { when: prior && prior.submittedAt ? fmtDate(prior.submittedAt) : '—' }),
        [t('sub.duplicate.next', { id })],
      );
    }
    case 'DAILY_CAP':
      return new UserError(t('sub.capped', { used, cap }), [t('sub.capped.next')]);
    case 'NO_PRIOR':
      return new UserError(t('sub.noPrior'), [t('sub.noPrior.next', { id })]);
    case 'UPDATE_CAP':
      return new UserError(t('sub.updateCapped', { n: used }), [t('sub.updateCapped.next')]);
    case 'LOCK_BUSY':
      return new UserError(t('sub.lockBusy'), [t('sub.lockBusy.next')]);
    default:
      return new UserError(err.message, [t('cli.moreHelp')]);
  }
}

function gateInput(draft, scored, prior, mode) {
  return {
    ...draft,
    verdict: scored.verdict,
    expectedPerHour: scored.expectedPerHour,
    priorSubmissionId: mode === 'create' && prior ? (prior.submissionId || prior.listingId) : '',
  };
}

async function cmdSubmit(flags, positional, mode) {
  const id = positional[1];
  if (!id) {
    throw new UserError(
      LANG === 'th' ? 'ต้องระบุ listingId' : 'A listingId is required',
      [`node agent/bin/earn-agent.js ${mode} <listingId>`],
    );
  }

  const state = loadState();
  const apiKey = requireKey(state);

  /* ---- RATE LIMITS FIRST. Before the body, before the network. ---------- */
  const prior = store.findSubmission(id, state);
  const createdBefore = store.hasSubmittedTo(id, state);

  if (mode === 'create' && createdBefore) {
    throw new UserError(
      t('sub.duplicate', { when: prior && prior.submittedAt ? fmtDate(prior.submittedAt) : '—' }),
      [t('sub.duplicate.next', { id })],
    );
  }
  if (mode === 'update' && !createdBefore) {
    throw new UserError(t('sub.noPrior'), [t('sub.noPrior.next', { id })]);
  }

  const cap = Number.isFinite(state.dailyCap) ? state.dailyCap : store.DEFAULT_DAILY_CAP;
  if (mode === 'create') {
    const used = store.submittedToday(state);
    if (used >= cap) {
      throw new UserError(t('sub.capped', { used, cap }), [t('sub.capped.next')]);
    }
  } else {
    // Updates do not consume the create budget (store.js counts creates only),
    // so they get their own hard ceiling: `dailyCap` rewrites of one listing per day.
    const updatesToday = store.updatesTodayFor(id, state);
    if (updatesToday >= cap) {
      throw new UserError(t('sub.updateCapped', { n: updatesToday }), [t('sub.updateCapped.next')]);
    }
  }

  /* ---- Draft ------------------------------------------------------------ */
  const draft = loadDraft(id);
  if (!draft) {
    throw new UserError(t('sub.noDraft', { path: draftPath(id) }), [t('sub.noDraft.next', { id })]);
  }

  const client = makeClient(flags, apiKey);
  const { listing, warnings } = await resolveListing(client, id, flags);

  const profile = rankingProfile(state, flags, { defaultHours: draft.hoursEstimate });
  const scored = rank.scoreListing(listing, profile);
  const gate = rank.qualityGate(gateInput(draft, scored, prior, mode), listing);

  if (!flags.json) {
    heading(mode === 'update' ? t('sub.headerUpdate') : t('sub.header'));
    out(`  ${bold(listing.title)}  ${grey(listing.id)}`);
    for (const w of warnings) out(`  ${grey(`! ${w}`)}`);
    out('');
    kv('verdict', `${verdictColor(scored.verdict)} ${grey(`score ${scored.score}`)}`);
    kv('expected', `${fmtMoney(scored.expectedUsd, 2)} ${grey(`(${fmtMoney(scored.expectedPerHour, 2)}/h)`)}`);
    kv(t('who.today'), `${store.submittedToday(state)} / ${cap}`);
  }

  if (!gate.pass) {
    if (flags.json) {
      emitJson({
        ok: false, command: mode, refused: 'quality-gate',
        listingId: listing.id, gate, verdict: scored.verdict,
      });
      return 1;
    }
    printGateResult(gate, draftPath(id));
    printError({
      lines: [t('sub.gateFailed', { n: gate.failures.length })],
      next: [t('sub.gateFailed.next', { id })],
      exitCode: 1,
    });
    return 1;
  }

  /* ---- Build and show the exact request --------------------------------- */
  const payload = {
    listingId: listing.id,
    link: draft.link,
    tweet: draft.tweet || '',
    otherInfo: draft.otherInfo,
    eligibilityAnswers: draft.eligibilityAnswers,
    ask: draft.ask ?? null,
    telegram: draft.telegram,
  };
  const preview = client.describeSubmission(payload, { mode });

  if (!flags.json) {
    heading(t('sub.request'));
    out('');
    out(`  ${bold(`${preview.method} ${preview.url}`)}`);
    for (const [k, v] of Object.entries(preview.headers)) {
      out(`  ${grey(`${k}:`)} ${k === 'authorization' ? yellow(v) : v}`);
    }
    out('');
    for (const line of preview.bodyJson.split('\n')) out(`  ${grey('│')} ${line}`);
    out('');
  }

  if (flags['dry-run']) {
    if (flags.json) {
      emitJson({
        ok: true, command: mode, dryRun: true, listingId: listing.id,
        request: { method: preview.method, url: preview.url, headers: preview.headers, body: preview.body },
        gate: { pass: true, warnings: gate.warnings },
      });
      return 0;
    }
    out(`  ${yellow('◎')} ${bold(t('sub.dryRun'))}`);
    return 0;
  }

  /* ---- Human confirmation ------------------------------------------------ */
  if (!flags.yes) {
    if (!isInteractive() || flags.json) {
      const explained = { lines: [t('sub.needTty')], next: [t('sub.needTty.next')], exitCode: 1 };
      if (flags.json) {
        emitJson({ ok: false, command: mode, refused: 'no-confirmation', listingId: listing.id });
        return 1;
      }
      printError(explained);
      return 1;
    }
    heading(t('sub.confirmHeader'));
    out(`  ${yellow('!')} ${t('sub.confirmBody', { title: listing.title })}`);
    out('');
    const answer = await withPrompt((rl) => rl.question(`  ${bold(t('sub.confirmPrompt'))}`));
    const ok = ['yes', 'y', 'submit', 'ใช่'].includes(String(answer || '').trim().toLowerCase());
    if (!ok) {
      out('');
      out(`  ${yellow('◎')} ${t('sub.cancelled')}`);
      return 1;
    }
  } else if (!flags.json) {
    out(`  ${yellow('!')} ${t('sub.yesWarn')}`);
  }

  /* ---- Reserve the slot, THEN send --------------------------------------- */
  // The checks at the top of this function ran against a snapshot taken before
  // the draft was loaded, the listing fetched and a human answered a prompt.
  // Minutes can pass, and a sibling `earn-agent submit ... &` can spend the
  // budget in between. reserveSubmission() redoes both checks and writes the
  // row inside one cross-process lock, so the limits hold under concurrency.
  let reservation;
  try {
    reservation = store.reserveSubmission({
      listingId: listing.id,
      listingTitle: listing.title,
      slug: listing.slug,
      link: payload.link,
      mode,
    });
  } catch (err) {
    if (err instanceof store.LimitError) throw limitToUserError(err, listing.id, mode);
    throw err;
  }

  let result;
  try {
    result = mode === 'update'
      ? await client.updateSubmission(payload)
      : await client.createSubmission(payload);
  } catch (err) {
    // Did the server definitely not create anything? Then give the slot back.
    // If the outcome is UNKNOWN (timeout, dropped connection, 5xx) the row
    // stays: the submission may exist, and the API has no Idempotency-Key, so
    // a retried create would be a permanent public duplicate.
    const ambiguous = err instanceof ApiError
      && (err.code === 'TIMEOUT' || err.code === 'NETWORK' || err.status === 0 || err.status >= 500);
    if (ambiguous) {
      warnOut(`${yellow('!')} ${t('sub.ambiguous', { id: listing.id })}`);
    } else {
      store.releaseReservation(reservation.reservationId);
    }
    throw err;
  }

  store.finalizeSubmission(reservation.reservationId, {
    submissionId: result.submission.id,
    link: payload.link,
  });

  const after = store.load();
  const remaining = store.remainingToday(after);

  // A 2xx we could not read as a submission row is not proof of anything. Say so
  // loudly rather than printing a green "Submitted" the tool cannot stand behind.
  const unverified = result.unverified === true;

  if (flags.json) {
    emitJson({
      ok: true,
      command: mode,
      unverified,
      listingId: listing.id,
      submissionId: result.submission.id,
      status: result.submission.status,
      remainingToday: remaining,
      gateWarnings: gate.warnings,
      responseWarnings: Array.isArray(result.warnings) ? result.warnings : [],
    });
    return unverified ? 2 : 0;
  }

  if (unverified) {
    for (const w of (result.warnings || [])) warnOut(`${yellow('!')} ${w}`);
  }
  heading(unverified ? t('sub.unconfirmed') : (mode === 'update' ? t('sub.okUpdate') : t('sub.ok')));
  kv('submissionId', result.submission.id || grey(t('common.unknown')));
  kv(t('common.status'), result.submission.status || grey(t('common.unknown')));
  kv(t('common.link'), payload.link);
  out('');
  out(`  ${unverified ? yellow('?') : green('✓')} ${t('sub.recorded')}`);
  out(`  ${grey(t('sub.remaining', { n: remaining }))}`);
  return unverified ? 2 : 0;
}

async function cmdProfile(flags, positional) {
  const sub = positional[1] || 'show';
  const state = loadState();
  const profile = { ...store.defaultProfile(), ...(state.profile || {}) };
  let cap = Number.isFinite(state.dailyCap) ? state.dailyCap : store.DEFAULT_DAILY_CAP;

  if (sub === 'set') {
    let changed = false;
    if (flags.skills !== undefined) {
      profile.skills = String(flags.skills).split(',').map((s) => s.trim()).filter(Boolean);
      changed = true;
    }
    if (flags.regions !== undefined) {
      profile.regions = String(flags.regions).split(',').map((s) => s.trim()).filter(Boolean);
      changed = true;
    }
    if (flags.edge !== undefined) {
      const n = Number(flags.edge);
      if (!Number.isFinite(n) || n < 0.5 || n > 5) throw new UserError(t('prof.badEdge'));
      profile.skillEdge = n; changed = true;
    }
    const hpw = parseNumberFlag(flags, 'hours-per-week', { min: 0, max: 168 });
    if (hpw !== null) { profile.hoursPerWeek = hpw; changed = true; }

    const video = parseBoolFlag(flags, 'video');
    if (video !== null) { profile.canDoVideo = video; changed = true; }
    const cam = parseBoolFlag(flags, 'on-camera');
    if (cam !== null) { profile.canDoOnCamera = cam; changed = true; }
    const reach = parseBoolFlag(flags, 'twitter-reach');
    if (reach !== null) { profile.hasTwitterReach = reach; changed = true; }

    if (flags.telegram !== undefined) { profile.telegram = String(flags.telegram).trim(); changed = true; }

    const newCap = parseNumberFlag(flags, 'daily-cap', { min: 0, max: 50, integer: true });
    if (newCap !== null) { cap = newCap; changed = true; }

    if (!changed) throw new UserError(t('prof.noChange'), [t('prof.editHint')]);
    store.save({ ...state, profile, dailyCap: cap });
    if (!flags.json) out(`  ${green('✓')} ${t('prof.saved')}`);
  } else if (sub === 'edit') {
    if (!isInteractive() || flags.json) {
      throw new UserError(
        LANG === 'th' ? 'profile edit ต้องรันในเทอร์มินัลโต้ตอบ' : 'profile edit needs an interactive terminal',
        [t('prof.editHint')],
      );
    }
    heading(t('prof.header'));
    await withPrompt(async (rl) => {
      profile.skills = String(await ask(rl, t('prof.skills'), profile.skills.join(',')))
        .split(',').map((s) => s.trim()).filter(Boolean);
      const edge = await ask(rl, t('prof.edge'), profile.skillEdge ?? '');
      const edgeNum = Number(edge);
      profile.skillEdge = Number.isFinite(edgeNum) && edgeNum >= 0.5 && edgeNum <= 5 ? edgeNum : profile.skillEdge;
      const hours = Number(await ask(rl, t('prof.hours'), profile.hoursPerWeek));
      if (Number.isFinite(hours) && hours >= 0) profile.hoursPerWeek = hours;
      profile.canDoVideo = /^(y|yes|true|ใช่)$/i.test(String(await ask(rl, `${t('prof.video')} (y/n)`, profile.canDoVideo ? 'y' : 'n')));
      profile.canDoOnCamera = /^(y|yes|true|ใช่)$/i.test(String(await ask(rl, `${t('prof.camera')} (y/n)`, profile.canDoOnCamera ? 'y' : 'n')));
      profile.hasTwitterReach = /^(y|yes|true|ใช่)$/i.test(String(await ask(rl, `${t('prof.reach')} (y/n)`, profile.hasTwitterReach ? 'y' : 'n')));
      profile.regions = String(await ask(rl, t('prof.regions'), profile.regions.join(',')))
        .split(',').map((s) => s.trim()).filter(Boolean);
      profile.telegram = String(await ask(rl, t('prof.telegram'), profile.telegram || ''));
      const capIn = Number(await ask(rl, t('prof.cap'), cap));
      if (Number.isFinite(capIn) && capIn >= 0) cap = Math.trunc(capIn);
    });
    store.save({ ...state, profile, dailyCap: cap });
    out('');
    out(`  ${green('✓')} ${t('prof.saved')}`);
  } else if (sub !== 'show') {
    throw new UserError(t('cli.unknownCommand', { cmd: `profile ${sub}` }), ['profile | profile set | profile edit']);
  }

  const fresh = store.load();
  const p = { ...store.defaultProfile(), ...(fresh.profile || {}) };

  if (flags.json) {
    return emitJson({
      ok: true, command: 'profile', profile: p,
      dailyCap: Number.isFinite(fresh.dailyCap) ? fresh.dailyCap : store.DEFAULT_DAILY_CAP,
      statePath: store.configPath(),
    });
  }

  heading(t('prof.header'));
  kv(t('prof.skills'), p.skills.length ? p.skills.join(', ') : grey(t('common.none')));
  kv(t('prof.edge'), p.skillEdge === null ? grey(`${t('common.none')} (default ${rank.CONSTANTS.DEFAULT_EDGE})`) : String(p.skillEdge));
  kv(t('prof.hours'), String(p.hoursPerWeek));
  kv(t('prof.video'), p.canDoVideo ? green(t('common.yes')) : grey(t('common.no')));
  kv(t('prof.camera'), p.canDoOnCamera ? green(t('common.yes')) : grey(t('common.no')));
  kv(t('prof.reach'), p.hasTwitterReach ? green(t('common.yes')) : grey(t('common.no')));
  kv(t('prof.regions'), p.regions.length ? p.regions.join(', ') : grey(t('common.none')));
  kv(t('prof.telegram'), p.telegram || grey(t('common.none')));
  kv(t('prof.cap'), String(Number.isFinite(fresh.dailyCap) ? fresh.dailyCap : store.DEFAULT_DAILY_CAP));
  out('');
  out(`  ${grey(t('prof.editHint'))}`);
  return undefined;
}

/* ========================================================================== *
 * 14. MAIN                                                                   *
 * ========================================================================== */

async function main() {
  let parsed;
  try {
    parsed = parseArgs({
      args: process.argv.slice(2),
      options: OPTIONS,
      allowPositionals: true,
      strict: true,
    });
  } catch (err) {
    LANG = process.env.EARN_LANG === 'en' ? 'en' : 'th';
    printError({ lines: [t('cli.badOption', { msg: err.message })], next: [t('cli.moreHelp')], exitCode: 1 });
    return 1;
  }

  const flags = parsed.values;
  const positional = parsed.positionals;

  /* language */
  const langFlag = flags.lang || process.env.EARN_LANG;
  if (langFlag !== undefined && langFlag !== '') {
    const l = String(langFlag).trim().toLowerCase();
    if (l !== 'th' && l !== 'en') {
      LANG = 'th';
      printError({ lines: [t('cli.badLang', { v: langFlag })], next: ['--lang th | --lang en'], exitCode: 1 });
      return 1;
    }
    LANG = l;
  }

  /* colour */
  const noColor = flags['no-color'] || process.env.NO_COLOR !== undefined || process.env.TERM === 'dumb';
  COLOR_ON = flags.color ? true : (!noColor && Boolean(process.stdout.isTTY));

  if (flags.version) {
    process.stdout.write(`earn-agent ${VERSION}\n`);
    return 0;
  }

  const command = positional[0];

  if (!command || command === 'help') {
    const target = positional[1];
    if (target && CMD_HELP[target]) printCommandHelp(target);
    else printGlobalHelp();
    return command ? 0 : (flags.help ? 0 : 1);
  }

  if (!COMMANDS.includes(command)) {
    printError({ lines: [t('cli.unknownCommand', { cmd: command })], next: [t('cli.moreHelp')], exitCode: 1 });
    return 1;
  }

  if (flags.help) {
    printCommandHelp(command);
    return 0;
  }

  // In --json mode the decorative output is silenced; emitJson() writes the one
  // JSON document to stdout directly, so a caller can pipe it straight to jq.
  if (flags.json) OUT_BUFFER = true;

  const { baseUrl } = resolveBaseUrls(flags);

  try {
    let code;
    switch (command) {
      case 'register': code = await cmdRegister(flags); break;
      case 'whoami': code = await cmdWhoami(flags); break;
      case 'claim': code = await cmdClaim(flags); break;
      case 'listings': code = await cmdListings(flags); break;
      case 'rank': code = await cmdRank(flags); break;
      case 'show': code = await cmdShow(flags, positional); break;
      case 'draft': code = await cmdDraft(flags, positional); break;
      case 'submit': code = await cmdSubmit(flags, positional, 'create'); break;
      case 'update': code = await cmdSubmit(flags, positional, 'update'); break;
      case 'profile': code = await cmdProfile(flags, positional); break;
      default: code = 1;
    }
    return typeof code === 'number' ? code : 0;
  } catch (err) {
    const explained = explainError(err, { baseUrl });
    OUT_BUFFER = null;
    if (flags.json) {
      emitJson({
        ok: false,
        command,
        error: {
          kind: explained.kind,
          message: explained.lines.map((l) => String(l).replace(ANSI, '')).join(' '),
          next: explained.next.map((n) => String(n).replace(ANSI, '')),
          status: err instanceof ApiError ? err.status : null,
          code: err instanceof ApiError ? err.code : null,
        },
      });
    } else {
      printError(explained);
    }
    if (flags.debug && err && err.stack) {
      warnOut(grey(String(err.stack)));
      if (err.cause && err.cause.stack) warnOut(grey(`caused by: ${String(err.cause.stack)}`));
    }
    return explained.exitCode;
  }
}

main()
  .then((code) => { process.exitCode = typeof code === 'number' ? code : 0; })
  .catch((err) => {
    // Nothing above should reach here; if it does, still never leak a key.
    OUT_BUFFER = null;
    warnOut(`${red('✗')} ${t('err.unexpected')}: ${String(err && err.message ? err.message : err)}`);
    process.exitCode = 2;
  });
