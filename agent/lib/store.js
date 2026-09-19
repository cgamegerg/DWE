/**
 * agent/lib/store.js — credential + state persistence for the Earn agent CLI.
 *
 * Zero dependencies. Node 18+ built-ins only. ESM.
 *
 * The API key and claim code live here. Both are shown by the server exactly
 * once and are UNRECOVERABLE — there is no rotate/regenerate endpoint anywhere
 * in the Earn codebase, so losing this file means registering a brand-new agent
 * (and a new claim code with it). Accordingly:
 *   - the file is written atomically (tmp + rename) so a crash mid-write cannot
 *     truncate it to nothing;
 *   - it is mode 0600, owner-only;
 *   - a corrupt file is BACKED UP rather than silently overwritten;
 *   - load() never throws.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)); // .../agent/lib
const DEFAULT_AGENT_DIR = path.resolve(HERE, '..'); // .../agent
const CONFIG_BASENAME = '.earn-agent.json';
const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

/** Bump when the on-disk shape changes so a future load() can migrate. */
export const STATE_VERSION = 1;

/** Daily submission cap default. Quality over volume — the operator asked. */
export const DEFAULT_DAILY_CAP = 3;

/**
 * Where the state file lives. `EARN_AGENT_HOME` overrides the directory (used
 * by the test suite so a run can never clobber real credentials).
 */
export function agentDir() {
  const override = process.env.EARN_AGENT_HOME;
  return override && override.trim() !== ''
    ? path.resolve(override.trim())
    : DEFAULT_AGENT_DIR;
}

/** @returns {string} absolute path to agent/.earn-agent.json */
export function configPath() {
  return path.join(agentDir(), CONFIG_BASENAME);
}

/* -------------------------------------------------------------------------- */
/* Masking                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * 'sk_...abcd' — never reveals more than the last 4 characters.
 * A key too short to mask safely reveals nothing at all.
 */
export function maskKey(key) {
  if (typeof key !== 'string') return '(none)';
  const k = key.trim();
  if (k === '') return '(none)';
  if (k.length <= 8) return 'sk_...****';
  return `sk_...${k.slice(-4)}`;
}

/** Same rule for the claim code: it is a bearer secret until the human uses it. */
export function maskClaimCode(code) {
  if (typeof code !== 'string' || code.trim() === '') return '(none)';
  const c = code.trim();
  if (c.length <= 8) return '****';
  return `${c.slice(0, 4)}...${c.slice(-4)}`;
}

/* -------------------------------------------------------------------------- */
/* Defaults                                                                    */
/* -------------------------------------------------------------------------- */

export function defaultProfile() {
  return {
    skills: [],
    skillEdge: null,
    hoursPerWeek: 10,
    canDoVideo: false,
    canDoOnCamera: false,
    hasTwitterReach: false,
    regions: ['Global'],
    telegram: null,
  };
}

export function defaultState() {
  return {
    version: STATE_VERSION,
    apiKey: null,
    claimCode: null,
    claimUrl: null,
    agentName: null,
    agentId: null,
    username: null,
    registeredAt: null,
    dailyCap: DEFAULT_DAILY_CAP,
    submissions: [],
    profile: defaultProfile(),
  };
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

/** Local-time YYYY-MM-DD. The daily cap is about the operator's day. */
export function localDateKey(value) {
  const d = value === undefined || value === null ? new Date() : new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* -------------------------------------------------------------------------- */
/* Load                                                                        */
/* -------------------------------------------------------------------------- */

function coerceProfile(raw) {
  const base = defaultProfile();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  return {
    skills: Array.isArray(raw.skills) ? raw.skills.filter((s) => typeof s === 'string') : base.skills,
    skillEdge: typeof raw.skillEdge === 'string' ? raw.skillEdge : base.skillEdge,
    hoursPerWeek:
      typeof raw.hoursPerWeek === 'number' && Number.isFinite(raw.hoursPerWeek)
        ? raw.hoursPerWeek
        : base.hoursPerWeek,
    canDoVideo: raw.canDoVideo === true,
    canDoOnCamera: raw.canDoOnCamera === true,
    hasTwitterReach: raw.hasTwitterReach === true,
    regions: Array.isArray(raw.regions)
      ? raw.regions.filter((r) => typeof r === 'string')
      : base.regions,
    telegram: typeof raw.telegram === 'string' ? raw.telegram : base.telegram,
  };
}

function coerceSubmissions(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const listingId = typeof entry.listingId === 'string' ? entry.listingId : null;
    if (!listingId) continue;
    out.push({
      listingId,
      listingTitle: typeof entry.listingTitle === 'string' ? entry.listingTitle : null,
      slug: typeof entry.slug === 'string' ? entry.slug : null,
      submissionId: typeof entry.submissionId === 'string' ? entry.submissionId : null,
      link: typeof entry.link === 'string' ? entry.link : null,
      mode: entry.mode === 'update' ? 'update' : 'create',
      submittedAt: typeof entry.submittedAt === 'string' ? entry.submittedAt : null,
      date:
        typeof entry.date === 'string'
          ? entry.date
          : localDateKey(entry.submittedAt) || null,
    });
  }
  return out;
}

/**
 * Never throws. A missing file yields defaults; a corrupt one yields defaults
 * plus `corrupt` metadata and a best-effort backup of the damaged bytes.
 *
 * @returns {object} state, with `_meta: { exists, corrupt, backupPath, path, warnings[] }`
 */
export function load() {
  const file = configPath();
  const state = defaultState();
  const meta = { exists: false, corrupt: false, backupPath: null, path: file, warnings: [] };

  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
    meta.exists = true;
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      meta.warnings.push(`Could not read ${file}: ${err.code || err.message}`);
    }
    return { ...state, _meta: meta };
  }

  // Warn loudly if the permissions drifted — this file holds a live API key.
  try {
    const mode = fs.statSync(file).mode & 0o777;
    if (mode !== FILE_MODE) {
      meta.warnings.push(
        `${file} has mode ${mode.toString(8)}, expected 600. Run: chmod 600 "${file}"`,
      );
    }
  } catch { /* non-fatal */ }

  let parsed;
  try {
    parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('state file is not a JSON object');
    }
  } catch (err) {
    meta.corrupt = true;
    meta.warnings.push(
      `${file} is corrupt (${err.message}). Falling back to defaults — the stored API key and ` +
        'claim code could not be read. They are NOT recoverable from the server; check the backup.',
    );
    // Preserve the damaged bytes: a partially-readable key beats none at all.
    try {
      const backup = `${file}.corrupt-${Date.now()}`;
      fs.writeFileSync(backup, text, { mode: FILE_MODE });
      try { fs.chmodSync(backup, FILE_MODE); } catch { /* best effort */ }
      meta.backupPath = backup;
      meta.warnings.push(`Damaged file backed up to ${backup}`);
    } catch (backupErr) {
      meta.warnings.push(`Could not back up the corrupt file: ${backupErr.message}`);
    }
    return { ...state, _meta: meta };
  }

  const dailyCap =
    typeof parsed.dailyCap === 'number' && Number.isFinite(parsed.dailyCap) && parsed.dailyCap >= 0
      ? Math.trunc(parsed.dailyCap)
      : DEFAULT_DAILY_CAP;

  return {
    version: typeof parsed.version === 'number' ? parsed.version : STATE_VERSION,
    apiKey: typeof parsed.apiKey === 'string' && parsed.apiKey.trim() !== '' ? parsed.apiKey : null,
    claimCode:
      typeof parsed.claimCode === 'string' && parsed.claimCode.trim() !== '' ? parsed.claimCode : null,
    claimUrl: typeof parsed.claimUrl === 'string' ? parsed.claimUrl : null,
    agentName: typeof parsed.agentName === 'string' ? parsed.agentName : null,
    agentId: typeof parsed.agentId === 'string' ? parsed.agentId : null,
    username: typeof parsed.username === 'string' ? parsed.username : null,
    registeredAt: typeof parsed.registeredAt === 'string' ? parsed.registeredAt : null,
    dailyCap,
    submissions: coerceSubmissions(parsed.submissions),
    profile: coerceProfile(parsed.profile),
    _meta: meta,
  };
}

/* -------------------------------------------------------------------------- */
/* Save                                                                        */
/* -------------------------------------------------------------------------- */

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true, mode: DIR_MODE });
  } catch (err) {
    if (!err || err.code !== 'EEXIST') throw err;
  }
}

/**
 * Atomic, owner-only write. The temp file is created in the SAME directory so
 * the rename is a true atomic replace (a cross-device rename is not).
 *
 * @param {object} state
 * @returns {string} the path written
 */
export function save(state) {
  const file = configPath();
  ensureDir(path.dirname(file));

  const input = state && typeof state === 'object' ? state : {};
  const out = {
    version: STATE_VERSION,
    apiKey: typeof input.apiKey === 'string' && input.apiKey.trim() !== '' ? input.apiKey.trim() : null,
    claimCode:
      typeof input.claimCode === 'string' && input.claimCode.trim() !== ''
        ? input.claimCode.trim()
        : null,
    claimUrl: typeof input.claimUrl === 'string' ? input.claimUrl : null,
    agentName: typeof input.agentName === 'string' ? input.agentName : null,
    agentId: typeof input.agentId === 'string' ? input.agentId : null,
    username: typeof input.username === 'string' ? input.username : null,
    registeredAt: typeof input.registeredAt === 'string' ? input.registeredAt : null,
    dailyCap:
      typeof input.dailyCap === 'number' && Number.isFinite(input.dailyCap) && input.dailyCap >= 0
        ? Math.trunc(input.dailyCap)
        : DEFAULT_DAILY_CAP,
    submissions: coerceSubmissions(input.submissions),
    profile: coerceProfile(input.profile),
  };

  const tmp = path.join(
    path.dirname(file),
    `.${CONFIG_BASENAME}.tmp-${process.pid}-${Date.now()}`,
  );

  let fd;
  try {
    // 'wx' + explicit mode: the file is 0600 from the instant it exists, so the
    // key is never briefly world-readable.
    fd = fs.openSync(tmp, 'wx', FILE_MODE);
    fs.writeFileSync(fd, `${JSON.stringify(out, null, 2)}\n`, { encoding: 'utf8' });
    try { fs.fsyncSync(fd); } catch { /* not all filesystems support it */ }
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { /* best effort */ }
    }
  }

  try {
    // umask can strip bits from the open() mode; set them explicitly.
    fs.chmodSync(tmp, FILE_MODE);
    fs.renameSync(tmp, file);
    fs.chmodSync(file, FILE_MODE);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* best effort */ }
    throw err;
  }

  return file;
}

/* -------------------------------------------------------------------------- */
/* Submission ledger                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Append a submission record and persist immediately. The ledger is what
 * enforces "one submission per listing" and the daily cap, so it must hit disk
 * before the caller moves on.
 *
 * @param {{listingId:string, submissionId?:string, listingTitle?:string,
 *          slug?:string, link?:string, mode?:'create'|'update'}} entry
 */
export function recordSubmission(entry) {
  if (!entry || typeof entry !== 'object' || typeof entry.listingId !== 'string') {
    throw new TypeError('recordSubmission requires an object with a string listingId');
  }
  const state = load();
  const now = new Date();
  const record = {
    listingId: entry.listingId,
    listingTitle: typeof entry.listingTitle === 'string' ? entry.listingTitle : null,
    slug: typeof entry.slug === 'string' ? entry.slug : null,
    submissionId: typeof entry.submissionId === 'string' ? entry.submissionId : null,
    link: typeof entry.link === 'string' ? entry.link : null,
    mode: entry.mode === 'update' ? 'update' : 'create',
    submittedAt: now.toISOString(),
    date: localDateKey(now),
  };
  state.submissions.push(record);
  save(state);
  return record;
}

/** Submissions (creates only) recorded for today, local time. */
export function submittedToday(state) {
  const s = state && Array.isArray(state.submissions) ? state : load();
  const today = localDateKey();
  return s.submissions.filter(
    (entry) => entry.mode !== 'update' && (entry.date || localDateKey(entry.submittedAt)) === today,
  ).length;
}

/** Have we already created a submission for this listing? */
export function hasSubmittedTo(listingId, state) {
  if (typeof listingId !== 'string' || listingId.trim() === '') return false;
  const s = state && Array.isArray(state.submissions) ? state : load();
  return s.submissions.some(
    (entry) => entry.listingId === listingId && entry.mode !== 'update',
  );
}

/** The full record for a listing, or null — lets the CLI offer update-instead. */
export function findSubmission(listingId, state) {
  if (typeof listingId !== 'string') return null;
  const s = state && Array.isArray(state.submissions) ? state : load();
  for (let i = s.submissions.length - 1; i >= 0; i -= 1) {
    if (s.submissions[i].listingId === listingId) return s.submissions[i];
  }
  return null;
}

/** Remaining submissions allowed today under the configured cap. */
export function remainingToday(state) {
  const s = state && Array.isArray(state.submissions) ? state : load();
  const cap =
    typeof s.dailyCap === 'number' && Number.isFinite(s.dailyCap) ? s.dailyCap : DEFAULT_DAILY_CAP;
  return Math.max(0, cap - submittedToday(s));
}

/** A printable, secret-free summary of the stored state. */
export function describe(state) {
  const s = state && typeof state === 'object' ? state : load();
  return {
    path: configPath(),
    exists: Boolean(s._meta && s._meta.exists),
    corrupt: Boolean(s._meta && s._meta.corrupt),
    agentName: s.agentName,
    username: s.username,
    apiKey: maskKey(s.apiKey),
    claimCode: maskClaimCode(s.claimCode),
    registeredAt: s.registeredAt,
    dailyCap: s.dailyCap,
    submittedToday: submittedToday(s),
    remainingToday: remainingToday(s),
    totalSubmissions: s.submissions.length,
    warnings: (s._meta && s._meta.warnings) || [],
  };
}

export default {
  configPath,
  agentDir,
  load,
  save,
  maskKey,
  maskClaimCode,
  recordSubmission,
  submittedToday,
  hasSubmittedTo,
  findSubmission,
  remainingToday,
  describe,
  defaultState,
  defaultProfile,
  localDateKey,
  STATE_VERSION,
  DEFAULT_DAILY_CAP,
};
