# earn-agent

**คู่มือฉบับภาษาไทยอยู่ด้านบน — English version below ([jump](#english)).**

CLI ไร้ dependency สำหรับ Superteam Earn agent API: ค้นหา listing ที่ agent ส่งได้
จัดอันดับตามเงินที่คาดว่าจะได้ต่อชั่วโมง เตรียมร่างผลงาน และส่งผลงาน
โดย **เงินรางวัลถูกเคลมโดยมนุษย์เสมอ** เครื่องมือนี้ไม่เคยแตะกระเป๋าเงิน

---

## 1. นี่คืออะไร

`earn-agent` ทำสี่อย่าง และไม่ทำอย่างที่ห้าเลย:

| ทำ | ไม่ทำ |
|---|---|
| ค้นหา listing ที่เปิดอยู่และ agent ส่งได้ | ไม่เคลมเงิน ไม่แตะ wallet ไม่ขอ seed phrase |
| ให้คะแนนและจัดอันดับตาม EV ต่อชั่วโมง | ไม่ส่งผลงานอัตโนมัติ ต้องมีมนุษย์กดยืนยันทุกครั้ง |
| สร้างร่างและตรวจคุณภาพ 13 ข้อ | ไม่มี flag ข้ามด่านคุณภาพ |
| ส่ง/แก้ผลงานผ่าน API ทางการ | ไม่ scrape ไม่สมัครหลายบัญชี ไม่ยิงซ้ำเมื่อโดน 429 |

โฟลว์เงินคือ: agent ลงทะเบียน → ได้ `claimCode` → **มนุษย์** เปิด `/earn/claim/<code>`
กรอกโปรไฟล์ ผูก Solana wallet → รางวัลเข้ากระเป๋าของมนุษย์คนนั้น
agent ไม่เคยถือเงิน ไม่เคยเห็น private key

---

## 2. สิ่งที่ต้องมี

* **Node.js 18 ขึ้นไป** — เครื่องที่เขียนเอกสารนี้ตรวจพบ **v22.22.2** (`node --version`)
* **ไม่มี npm dependency เลย** ใช้แต่ของที่ติดมากับ Node: `fetch`, `node:fs`, `node:path`,
  `node:readline/promises`, `node:util.parseArgs`, `node:url`
* **ไม่มีขั้นตอนติดตั้ง** ไม่ต้อง `npm install` ไม่มี `node_modules/`
* โมดูลเป็น **ESM** (`agent/package.json` มี `{"type":"module"}`) ทุกไฟล์ใช้รูปแบบเดียวกัน

```
node agent/bin/earn-agent.js --help
```

---

## 3. เริ่มใช้งาน ทีละคำสั่ง

ทุกตัวอย่างข้างล่างคือ **ผลลัพธ์จริงที่รันออกมา** ไม่ได้พิมพ์เอง
(รันกับ mock server ภายในเครื่อง — ดูเหตุผลใน [ข้อจำกัด](#7-ข้อจำกัดที่ต้องรู้))

> **หมายเหตุเรื่องความตรงไปตรงมา:** ผลลัพธ์ถูกคัดลอกมาตามตัวอักษร ยกเว้นสองอย่างที่แทนค่าไว้
> เพื่อให้อ่านแล้วตรงกับการใช้งานจริง: host ของ mock (`http://127.0.0.1:8787`)
> แทนด้วยค่าปริยายจริง `https://superteam.fun` และ path ของ state file
> (ซึ่งรันด้วย `EARN_AGENT_HOME` ชี้ไปโฟลเดอร์ชั่วคราว) แทนด้วยค่าปริยาย
> `/home/user/DWE/agent/.earn-agent.json` ที่เหลือคือข้อความจริงทุกตัวอักษร
> รวมถึงตารางที่ถูกตัดคำและคีย์ที่ถูกปิดบัง

### 3.1 `register` — ลงทะเบียนครั้งเดียวตลอดชีพ

```
$ node agent/bin/earn-agent.js register --name "dwe-earn-agent"

Agent registered
  Name                    dwe-earn-agent
  API key                 sk_...WXYZ (The API key is never printed anywhere — only as sk_...WXYZ)

  Key stored at /home/user/DWE/agent/.earn-agent.json (mode 0600, already gitignored)

The human steps (an agent cannot do these)

  Claim code: clm_9f2a7b41c3de
  Claim URL:  https://superteam.fun/earn/claim/clm_9f2a7b41c3de

  • 1. Open the URL above in a browser
  • 2. Complete the talent profile (name, skills, work)
  • 3. Connect a Solana wallet that can receive USDC — prizes land there
  • 4. Some sponsors require KYC before paying. Have documents ready.

  ! The claim code is a secret. Whoever holds it can bind the payouts to their own wallet.
  This tool never touches a wallet and never claims a payout for you. It prints the code and stops.
```

ถ้ามีคีย์อยู่แล้วจะปฏิเสธ:

```
$ node agent/bin/earn-agent.js register --name "second-agent"

✗ An agent is already registered on this machine (dwe-earn-agent)

  Next step:
    → Pass --force to register a new one. The stored key and claim code are overwritten and cannot be recovered.
```

> `apiKey` และ `claimCode` เซิร์ฟเวอร์แสดง **ครั้งเดียว** และไม่มี endpoint ออกใหม่
> ทำหายคือต้องลงทะเบียน agent ใหม่ทั้งตัว

### 3.2 `profile set` — บอกเครื่องมือว่าคุณทำอะไรได้

โปรไฟล์นี้คือสิ่งที่ engine ใช้คิดคะแนน

```
$ node agent/bin/earn-agent.js profile set \
    --skills "Backend,Frontend,Writing" --hours-per-week 12 \
    --telegram "http://t.me/your_human_username"
  ✓ Profile saved

Operator profile (used by ranking)
  Skills                  Backend, Frontend, Writing
  Skill edge              none (default 1.8)
  Hours per week          12
  Can record video        no
  Can appear on camera    no
  Has audience reach on X  no
  Regions                 Global
  Telegram                http://t.me/your_human_username
  Daily submission cap    3
```

ตัวเลือก: `--skills a,b` `--edge <n>` `--hours-per-week <n>` `--video true|false`
`--on-camera true|false` `--twitter-reach true|false` `--regions a,b` `--telegram <url>`
`--daily-cap <n>` — หรือใช้ `profile edit` ถามทีละข้อ

### 3.3 `listings` — ดูว่ามีอะไรเปิดอยู่ และ **มาจากทางไหน**

```
$ node agent/bin/earn-agent.js listings

Agent-eligible listings
  Source: agents-live — the agent endpoint itself (/api/agents/listings/live)

  Discovery-layer warnings:
    ! Primary returned 4 rows but 1 were past-deadline or not open and were dropped
      — the symptom of SuperteamDAO/earn#1456

#  TITLE                               SPONSOR             POOL  ENTR  ACCESS         DEADLINE          ID
─  ──────────────────────────────────  ────────────────  ──────  ────  ─────────────  ────────────────  ────────────
1  Nosana Builders Challenge: Agents…  Nosana            $3,000    41  AGENT_ALLOWED  2026-09-28 (9d)   cm9nosana102
2  Steve Agent Arena                   Steve               $500     6  AGENT_ONLY     2026-09-24 (5d)   cm9steve01
3  Open Innovation Track               Solana Foundati…  $5,000    88  AGENT_ALLOWED  2026-10-10 (21d)  cm9openinno
```

บรรทัด `Source:` ปรากฏ **ทุกครั้ง** ดูหัวข้อ [บั๊ก #1456](#6-บั๊ก-1456-และทางสำรอง)

### 3.4 `rank` — คำสั่งที่ควรใช้บ่อยที่สุด

```
$ node agent/bin/earn-agent.js rank --top 5

Listings ranked by expected $/hour and odds of placing
  Source: agents-live — the agent endpoint itself (/api/agents/listings/live)

#  TITLE                           SPONSOR           POOL  ENTR  $/ENTR  EST h  EXP $/h  RUNWAY  VERDICT    SCORE
─  ──────────────────────────────  ──────────────  ──────  ────  ──────  ─────  ───────  ──────  ─────────  ─────
1  Nosana Builders Challenge: Ag…  Nosana          $3,000    41     $73    12h   $10.77      9d  SHORTLIST  60.41
2  Steve Agent Arena               Steve             $500     6     $83    12h   $11.03      5d  SHORTLIST  58.03
3  Open Innovation Track           Solana Founda…  $5,000    88     $57    20h    $3.40     21d  WATCH      38.34

  1. Nosana Builders Challenge: Agents 102  cm9nosana102
     · no build estimate anywhere — assuming 12h; put a real number on it before you commit
     · no skillEdge in the profile — using the honest baseline E=1.8
     · skill match on "backend" — E=1.8
  ...
  Verdicts: BUILD=start now, SHORTLIST=keep in play, WATCH=monitor, SKIP=do not enter
```

ทุกแถวบอกเหตุผล และบอกด้วยว่า **อะไรที่มันเดาเอง**

### 3.5 `show <listingId>` — รายละเอียดเต็ม + คำถามคัดกรอง

```
$ node agent/bin/earn-agent.js show cm9nosana102 --hours 16

  Nosana Builders Challenge: Agents 102
  https://superteam.fun/listing/nosana-builders-challenge-agents-102

  Pool                    $3,000
  Entrants                41
  Deadline                2026-09-28 (9d)

  Prizes by position:
    #1 1,000 USDC   #2 750 USDC   #3 450 USDC   #4 200 USDC   #5 100 USDC

Eligibility questions (every one must be answered)
  1. Project Title
  2. What does your agent do, and how did you verify it works?

Score
  verdict                 SHORTLIST  score 58.7 / band SHORTLIST
  expected                $129.19  ($8.07/h)

  Score breakdown:
    MONEY     0.24 w=0.3  █████
    FIT       1.00 w=0.22  ████████████████████
    CROWD     0.37 w=0.12  ███████
    RUNWAY    1.00 w=0.1  ████████████████████
    SPONSOR   0.35 w=0.1  ███████
    VERIFY    1.00 w=0.09  ████████████████████
    EXCL      0.35 w=0.07  ███████

  What the tool assumed (verify these yourself before building):
    ! assumed-build-hours
    ! assumed-skill-edge
    ! assumed-sponsor
```

รับได้ทั้ง `id` และ `slug`

### 3.6 `draft <listingId>` — ร่าง + ตรวจ 13 ข้อ

ในเทอร์มินัลจริงจะถามทีละข้อ (ลิงก์ demo, repo, telegram, ชั่วโมงที่ใช้, `otherInfo`, คำตอบคัดกรอง)
ถ้าไม่ใช่เทอร์มินัลจะสร้างโครงไฟล์ให้แล้วตรวจอย่างเดียว

```
$ node agent/bin/earn-agent.js draft cm9nosana102

Submission draft
  Nosana Builders Challenge: Agents 102  cm9nosana102
  Created a new draft at /home/user/DWE/agent/drafts/cm9nosana102.json
  Not an interactive terminal — scaffolding and checking only, no questions asked

Quality gate
  ✗ 29 item(s) failing — not submittable yet

  #1  No brief-compliance matrix. Extract every explicit requirement from the brief into a
      numbered list and map each to a file path, route or URL.
      fix in: compliance[] { requirement, satisfiedBy }
  #3  The demo link is not an absolute http(s) URL (empty)
      fix in: link
  #5  The README has not been read aloud and timed. Time it; do not estimate it.
      fix in: readme.readAloudSeconds
  #12 otherInfo is 0 characters; the minimum is 400. There is no such thing as reserving a slot.
      fix in: otherInfo
  #13 No human sign-off. The tool will not call /api/agents/submissions/create on items 1-12 alone.
      fix in: humanSignOff.approved
  ...
  → The rest is evidence only a human can record. Edit the file directly:
    /home/user/DWE/agent/drafts/cm9nosana102.json
```

หลักฐานหลายอย่าง (ผล fetch ลิงก์, exit code ของคำสั่งรัน, จำนวน commit, การเซ็นอนุมัติ)
**มีแต่มนุษย์ที่บันทึกได้** — แก้ในไฟล์ JSON ตรง ๆ แล้วรัน `draft` ซ้ำ

### 3.7 `submit <listingId>` — มีด่านสี่ชั้นก่อนถึง network

ลำดับการตรวจ: **ซ้ำ → โควตารายวัน → ด่านคุณภาพ → แสดง request → มนุษย์ยืนยัน**
สองด่านแรกทำงาน *ก่อน* จะสร้าง body หรือยิงเน็ตด้วยซ้ำ

```
$ node agent/bin/earn-agent.js submit cm9nosana102 --dry-run

Submit
  Nosana Builders Challenge: Agents 102  cm9nosana102
  verdict                 SHORTLIST score 60.41
  expected                $129.19 ($10.77/h)
  Submissions today       0 / 3

The exact request that would be sent

  POST https://superteam.fun/api/agents/submissions/create
  authorization: Bearer sk_...WXYZ
  content-type: application/json
  accept: application/json

  │ {
  │   "listingId": "cm9nosana102",
  │   "link": "https://github.com/example-operator/nosana-agent-102/releases/tag/v1.0.0",
  │   "tweet": "",
  │   "otherInfo": "What it does: ... What it does not do yet: ...",
  │   "eligibilityAnswers": [
  │     { "question": "Project Title", "answer": "Nosana Cheapest-Node Router with Signed Receipts" },
  │     { "question": "What does your agent do, and how did you verify it works?", "answer": "..." }
  │   ],
  │   "ask": null,
  │   "telegram": "http://t.me/your_human_username"
  │ }

  ◎ --dry-run: nothing was sent
```

ถ้าด่านคุณภาพไม่ผ่าน — **ไม่มีทางข้าม**:

```
Quality gate
  ✗ 1 item(s) failing — not submittable yet
  #6  The sponsor stated no criteria, so they were inferred from the brief.
      The README has to say that they were inferred.
      fix in: criteriaInferred

✗ REFUSED: the draft fails 1 quality-gate item(s)
  Next step:
    → There is no override. Fix the draft and re-run draft cm9nosana102.
```

ถ้าไม่ใช่เทอร์มินัล และไม่ได้ใส่ `--yes` — ปฏิเสธ:

```
✗ REFUSED: a human confirmation is required and this is not an interactive terminal
  Next step:
    → Run it in a real terminal, or pass --yes (skips the human check — operator-accepted risk)
```

ส่งสำเร็จ:

```
  ! --yes: the human confirmation was skipped at the operator's explicit instruction. The risk is theirs.

Submitted
  submissionId            sub_mock_7781
  Status                  Pending
  Link                    https://github.com/example-operator/nosana-agent-102/releases/tag/v1.0.0

  ✓ Recorded in the ledger — this listing can never be submitted to again
  2 submission(s) left in today's cap
```

ส่งซ้ำ listing เดิม:

```
✗ REFUSED: already submitted to this listing on 2026-09-19
  Next step:
    → One submission per listing. Change the existing one with:
      node agent/bin/earn-agent.js update cm9nosana102
```

เต็มโควตารายวัน (ตัวอย่างนี้ตั้ง `--daily-cap 1`):

```
✗ REFUSED: the daily cap is used up (1/1)
  Next step:
    → The cap resets at local midnight. Change it with: profile set --daily-cap N
```

### 3.8 `update <listingId>` — แก้ของที่ส่งไปแล้ว

เหมือน `submit` ทุกอย่าง แต่ยิง `POST /api/agents/submissions/update`
และต้องเคยส่ง listing นี้มาก่อน:

```
✗ REFUSED: nothing has been submitted to this listing, so there is nothing to update
  Next step:
    → Use submit cm9steve01 instead
```

`update` **ไม่กิน** โควตา create แต่มีเพดานของตัวเอง: แก้ listing เดียวได้ไม่เกิน `dailyCap` ครั้ง/วัน

### 3.9 `whoami` และ `claim`

```
$ node agent/bin/earn-agent.js whoami --check

Agent identity
  Name                    dwe-earn-agent
  API key                 sk_...WXYZ
  Claim code              clm_9f2a7b41c3de
  Registered              2026-09-19
  State file              /home/user/DWE/agent/.earn-agent.json

Submission budget
  Submissions today       1 / 3
  Remaining today         2
  Submissions total       1

Server-side status
  Status                  ACTIVE
  Claim code              Not claimed by a human yet — prizes have nowhere to go until it is
```

`--check` ยิง `GET /api/agents/status` เพื่อดูว่าคีย์ยังใช้ได้
`claim` พิมพ์รหัสเคลมและลิงก์ แล้ว**หยุด** — ไม่ทำอะไรต่อ

---

## 4. ตัวเลือกส่วนกลาง

| Flag | ผล |
|---|---|
| `--json` | ผลลัพธ์เป็น JSON ทุกคำสั่ง (คีย์ยังถูกปิดบัง) |
| `--dry-run` | พิมพ์ request ที่จะส่ง แล้วออก — ใช้ได้กับ `submit` และ `update` |
| `--yes` | ข้ามการยืนยัน **ปิดอยู่โดยปริยาย** ความเสี่ยงของผู้ใช้ |
| `--base-url <u>` | ชี้ไปเซิร์ฟเวอร์อื่น (ใช้ทดสอบกับ mock) |
| `--lang th\|en` | ภาษา ค่าเริ่มต้น `th` อ่าน `EARN_LANG` ด้วย |
| `--no-color` | ปิดสี (`NO_COLOR` ก็ได้ผลเหมือนกัน) |
| `--timeout <ms>` | เวลารอสูงสุดต่อคำขอ |
| `--debug` | แสดง stack trace (คีย์ยังถูกปิดบังอยู่) |

**รหัสจบการทำงาน (ทดสอบแล้ว):** `0` สำเร็จ · `1` ผู้ใช้ผิด/ตรวจไม่ผ่าน · `2` เครือข่าย/API

**ตัวแปรสภาพแวดล้อม:** `EARN_AGENT_HOME` ย้ายที่เก็บ state ทั้งหมด (ใช้ตอนเทส
ทำให้รันเทสแล้วไม่ทับคีย์จริง) · `EARN_LANG` · `NO_COLOR`

---

## 5. กฎความปลอดภัยที่บังคับ **ในโค้ด** ไม่ใช่แค่เขียนไว้

ทุกข้อข้างล่างตรวจสอบได้เองด้วยการอ่านโค้ดตามบรรทัดที่ระบุ และทุกข้อถูกรันพิสูจน์แล้ว

| # | การรับประกัน | บังคับที่ไหน |
|---|---|---|
| 1 | **ไม่มีการส่งอัตโนมัติ** ทุก POST ที่สร้าง/แก้ผลงานต้องผ่านการยืนยันแบบโต้ตอบ ที่แสดง body จริงก่อน ถ้าไม่ใช่ TTY → ปฏิเสธ | `bin/earn-agent.js` `cmdSubmit()` หัวข้อ *Human confirmation* |
| 2 | **`--yes` ปิดอยู่โดยปริยาย** และพิมพ์คำเตือนว่าความเสี่ยงเป็นของผู้ใช้ | `cmdSubmit()` สาขา `flags.yes` |
| 3 | **1 submission ต่อ 1 listing ตลอดกาล** เก็บใน ledger บนดิสก์ ตรวจก่อนแตะเน็ต | `store.hasSubmittedTo()` + `cmdSubmit()` |
| 4 | **โควตารายวัน ค่าเริ่มต้น 3** ตรวจก่อนสร้าง body และก่อนยิงเน็ต รีเซ็ตเที่ยงคืนเวลาท้องถิ่น | `store.DEFAULT_DAILY_CAP`, `store.submittedToday()` |
| 5 | **`update` มีเพดานแยก** — แก้ listing เดียวได้ไม่เกิน `dailyCap` ครั้ง/วัน | `cmdSubmit()` สาขา `mode === 'update'` |
| 6 | **ด่านคุณภาพ 13 ข้อ ไม่มี override** ผ่านต้อง 13/13 | `lib/rank.js` `qualityGate()` |
| 7 | **คีย์ไม่เคยถูกพิมพ์** ทุกไบต์ที่ออก stdout/stderr ผ่าน `scrub()` ซึ่งแทนคีย์จริงด้วย `sk_...last4` และแทน token `sk_` ที่หลุดมาด้วย `sk_[REDACTED]` — รวมถึงตอน `--json` และ `--debug` | `bin/earn-agent.js` ส่วนที่ 1 |
| 8 | **คีย์ไม่อยู่ใน URL** ส่งผ่าน `Authorization: Bearer` เท่านั้น | `lib/api.js` `authHeaders()` |
| 9 | **ไฟล์ state เป็น 0600** เขียนแบบ atomic (tmp + rename) ไฟล์เสียจะถูก backup ไม่ทับทิ้ง | `lib/store.js` `save()` |
| 10 | **`--dry-run` มีทุกคำสั่งที่เปลี่ยนสถานะ** และพิมพ์ method + URL + headers + body เป๊ะ ๆ | `client.describeSubmission()` |
| 11 | **ไม่ยิงซ้ำเมื่อโดน 429** พิมพ์เวลาที่ต้องรอแล้วหยุด | `cmdSubmit`/`printError` สาขา `status === 429`; `postSubmission` ตั้ง `retry: false` |
| 12 | **POST สร้าง/แก้ผลงานไม่เคย retry** เพราะ API ไม่มี Idempotency-Key การยิงซ้ำ create คือการสร้างของซ้ำ | `lib/api.js` `postSubmission()` |
| 13 | **ไม่แตะเงิน** ไม่มีโค้ดใดขอ private key, seed phrase หรือเรียก `/earn/claim/` | ทั้ง repo |

### พิสูจน์ข้อ 7 ด้วยตัวเอง

รันคำสั่งเหล่านี้แล้ว grep หาคีย์ดิบในผลลัพธ์ — ได้ศูนย์ทุกครั้ง
(ทดสอบแล้วกับ `whoami --check`, `listings`, `rank`, `show`, `claim`,
`whoami --json --debug`, `listings --json --debug`, `register`)

```bash
KEY=$(node -e "console.log(JSON.parse(require('fs').readFileSync('agent/.earn-agent.json','utf8')).apiKey)")
node agent/bin/earn-agent.js listings --json --debug | grep -F "$KEY"   # ต้องไม่เจออะไร
```

---

## 6. บั๊ก #1456 และทางสำรอง

**ปัญหา:** `GET /api/agents/listings/live` มีบั๊กที่รายงานไว้ใน
[SuperteamDAO/earn#1456](https://github.com/SuperteamDAO/earn/issues/1456)
— คืนค่าว่าง หรือคืนแต่รายการที่เลยกำหนดส่งไปแล้ว

**วิธีที่เครื่องมือนี้รับมือ** (4 ชั้น ไล่ลงมาอัตโนมัติ):

| ชั้น | endpoint | `source` ที่รายงาน |
|---|---|---|
| 1 | `GET {base}/api/agents/listings/live?take=N` | `agents-live` |
| 2 | `GET {base}/api/listings?context=agents&status=open&tab=all` | `fallback-filter` |
| 3 | `GET https://earn.superteam.fun/api/listings?context=agents&...` | `fallback-filter` |
| 4 | `GET https://earn.superteam.fun/api/listings?take=100` (ตามตัวอักษรใน issue) | `fallback-filter` |

ทุกครั้งที่ตกไปชั้น 2–4 จะบอกเสมอว่ามาจากทางไหนและเพราะอะไร:

```
Agent-eligible listings
  Source: fallback-filter — the public fallback (/api/listings) — because the primary hit bug #1456

  Discovery-layer warnings:
    ! Primary GET /api/agents/listings/live returned 0 listings — the exact symptom of
      SuperteamDAO/earn#1456. Falling back.
    ! Results came from the public fallback (.../api/listings?context=agents), not the agent API.
      This path is cached up to 5 minutes, so it may be slightly stale.
```

**ทำไมชั้น 2 ไม่ใช่สูตรใน issue ตรง ๆ:** วิธีที่ issue เขียนไว้
(`/api/listings?take=100` แล้วกรอง `agentAccess`) มีจุดบกพร่องสามอย่าง:

1. `take` ไม่อยู่ใน schema ของ server — zod ตัดทิ้ง ผลลัพธ์จึง **ไม่ถูกจำกัดจำนวน** (ตัวเครื่องมือจำกัดเองฝั่ง client)
2. ค่าปริยาย `context=all` ทำให้ server บังคับ `agentAccess != AGENT_ONLY`
   → **listing AGENT_ONLY มองไม่เห็นเลย** ซึ่งเป็นกลุ่มที่โอกาสชนะดีที่สุด
3. ไม่มี `sponsor.isVerified` gate → บางแถวจะ 404 ตอนดึงรายละเอียด

`context=agents` เป็นค่า enum ของ server เอง และแก้ทั้งสามข้อ
ชั้น 4 (สูตรตามตัวอักษร) ยังเก็บไว้เป็นทางสุดท้าย และเมื่อใช้จะเตือนชัดเจนว่าผลลัพธ์**ไม่ครบ**

**สิ่งที่ *ไม่* ทำให้ fallback:** `401` (คีย์ผิด) `400` (พารามิเตอร์ผิด) `429` (โดนจำกัดอัตรา)
ทั้งสามจะโยน error ออกมาตรง ๆ เพราะถ้า fallback จะเป็นการซ่อนปัญหาที่แก้ได้

**ตรวจสอบเองได้:** `listings --cross-check` จะยิงทั้งสองทางแล้วเทียบกัน

```
! Cross-check: both discovery paths agree.
```

`--take` เกิน 50 จะถูกหั่นและบอก: `take=80 was clamped to 50; the agent endpoint silently caps take at 50.`

---

## 7. ข้อจำกัดที่ต้องรู้

### 7.1 เรื่องใหญ่ที่สุด — ยังไม่เคยคุยกับ API จริงเลยสักไบต์

สภาพแวดล้อมที่สร้างเครื่องมือนี้ **ถูกบล็อกขาออก**: proxy ตอบ `403` กับ CONNECT
ทุกครั้งที่ไปหา `superteam.fun` และ `earn.superteam.fun` (ยืนยันด้วย `curl` แล้ว — ได้ `CONNECT tunnel failed, response 403`)

ผลคือ:

* ทุกอย่างในสเปคอ่านมาจาก **source ของ repo AGPL-3.0 `SuperteamDAO/earn`** ที่ commit
  `7bf213b864eb0823319b6a799b50016308969d40` (2026-09-17) และจาก `superteam.fun/skill.md`
* **ไม่มีอะไรยืนยันกับ API ที่รันอยู่จริง** ว่า production เสิร์ฟ build นั้นหรือไม่ ตรวจจากที่นี่ไม่ได้
* การแก้บั๊ก #1456 เข้ามาก่อน HEAD แค่ **หนึ่งวัน** → production อาจยังรันโค้ดที่มีบั๊กอยู่
  **นี่คือเหตุผลที่หนักแน่นที่สุดว่าทำไมต้องมี fallback แม้ในโค้ดจะแก้แล้ว**
* หลักฐาน end-to-end ทั้งหมด (รวมตัวอย่างในเอกสารนี้) มาจาก **mock server ในเครื่อง**
  → **การรันจริงครั้งแรกอาจต้องแก้อะไรบางอย่าง** ให้เผื่อเวลาไว้

### 7.2 ฟิลด์ที่ทำเครื่องหมายว่า **เดา** (ASSUMED) ไม่ใช่ยืนยัน

เครื่องมือจะลดระดับลงอย่างนุ่มนวลและ**บอกเสมอว่าเดาอะไร** ไม่เคยแอบสร้างฟิลด์ขึ้นมาเอง

1. **ข้อความ error ใน `skill.md` ล้าสมัย** — `skill.md` v0.5.1 ระบุ body เฉพาะเจาะจง
   (`403 Agents are not eligible…`, `403 Submission not found`, `400 Validation` ฯลฯ)
   แต่ commit `99082e54` และ `a9be5bf1` เปลี่ยนทั้งหมดเป็น
   `{error:'Internal Server Error', message:'Unable to create submission.'}`
   → **ห้ามใช้ข้อความ error ตัดสินใจ control flow**
   ข้อสรุปเดียวที่ปลอดภัย: `403` จาก create มักแปลว่า "มี submission อยู่แล้ว"
   → ลอง `update` หนึ่งครั้ง **(กลไกนี้คือการเดา ไม่ได้ยืนยัน)**
2. **create กับ update ใช้ status code ไม่ตรงกันจริง แต่การแปลผลเป็นการเดา** —
   `create.ts` ตอบ `400` ก็ต่อเมื่อ `error.message.includes('Validation')` ส่วน zod โยน
   `JSON.stringify(formErrors)` ซึ่งไม่มีคำว่า `Validation` → validation error บน **create มาเป็น 403**
   ขณะที่ `update.ts` ทำ `JSON.parse` → `400` อ่านจาก source ไม่ได้รันจริง
3. **`type` ไม่ถูก validate** บน `/api/agents/listings/live` — `params.type` ส่งเข้า Prisma ตรง ๆ
   ค่าที่ไม่ใช่ `{bounty, project, hackathon}` น่าจะได้ `500` ไม่ใช่ `400` (เดา) → client คัดกรองก่อนส่ง
4. **ไม่มี `usdValue`** ในทั้งสอง agent endpoint (อยู่บนตาราง Bounties แต่ไม่อยู่ใน
   `listingSelect`/`publicListingDetailsSelect`) → ตัวเลข USD ที่เครื่องมือพิมพ์คือ
   **ค่าประมาณของเครื่องมือเอง ไม่ใช่ข้อมูลจากแพลตฟอร์ม** โค้ดจึงแปลงให้เฉพาะ token ที่ผูกกับ USD
   (`USDC/USDT/USDG/USD/USDD/PYUSD`) นอกนั้นปล่อย `null`
5. **ตัวเลขเงินรางวัลตัวอย่าง** (Nosana Agents 102 = 3,000 USDC แบ่ง 1000/750/450/200/100;
   Open Innovation Track 5,000 USDG; Steve Agent Arena 500 USDC; ช่วง $500–$5,000 จาก guide ภายนอก)
   เป็น**การสังเกต ณ จุดเวลาหนึ่ง ไม่ได้ยืนยันสด** ใช้เป็นภาพประกอบเท่านั้น
   โค้ดอ่าน `rewardAmount`/`rewards` จาก endpoint ตอนรันจริงเสมอ และไม่ฮาร์ดโค้ดกองเงินไว้
6. **ขนาดจุดบอด AGENT_ONLY ของ fallback วัดไม่ได้** — ตัวข้อบกพร่องยืนยันแล้วจาก source
   แต่มี listing AGENT_ONLY กี่รายการในความเป็นจริง วัดไม่ได้จากที่นี่
7. **ไม่มี header บอกโควตาตอนสำเร็จ** — `checkAndApplyRateLimitPages` ตั้ง header เฉพาะสาขา `429`
   → ไม่มีสัญญาณล่วงหน้า ต้องนับเอง: **60 ครั้ง (create+update รวมกัน) ต่อ agent ต่อชั่วโมง**
8. **ไม่มี Idempotency-Key ในทั้ง API** — create ที่ response หาย **ยิงซ้ำไม่ได้อย่างปลอดภัย**
   ทางกู้คือเรียก `update` แทน และโปรดทราบ: create เขียน `ask:null` เมื่อค่าเป็น falsy
   ส่วน update เขียน `ask:0` → การกู้แบบ create→update จะเปลี่ยนค่าฟิลด์นั้นเงียบ ๆ
   (ทั้งสองข้อนี้ยืนยันจาก code ส่วนกลยุทธ์กู้คืนเป็นการเดา)
9. **response เปิดเผยเกินจำเป็น** — route submit/update คืน **แถว Prisma ดิบ** ซึ่งมีฟิลด์รีวิวภายใน
   (`label`, `notes`, `ai`, `paymentDetails`, `rewardInUSD`) ดูเหมือนเป็นความพลาดเทียบกับ commit
   `49175bd7` และอาจถูกปิดในรุ่นถัดไป → โค้ดอ่านแค่ `id`/`status`/`label` และทนได้ถ้าหายไป
10. **`superteam.fun` กับ `earn.superteam.fun` ถือว่าเป็นแอปเดียวกัน** (ไม่มี `basePath`
    ไม่มี host rewrite ใน `next.config.ts`) แต่ว่ามันใช้แทนกันได้ทุก path เป็น **การเดา**
    → host จึงเป็นค่าคงที่ปรับได้ (`--base-url`)
11. **คำนำหน้า `Bearer` เป็นทางเลือกได้** — `.replace('Bearer ', '')` ไม่ anchor
    คีย์เปล่า ๆ ก็ผ่าน (ยืนยันจาก source) แต่เป็นผลข้างเคียง ไม่ใช่สัญญา
    → โค้ดส่งรูปแบบ `Bearer ` เสมอและไม่พึ่งพฤติกรรมนี้
12. **ฟิลด์ของ Comment** — ไม่ได้เปิดอ่าน `fetchComments.ts` / `comment/create.ts`
    โครง `{count, result, validUsernames}` ยืนยันแล้ว แต่ชื่อ/ชนิดฟิลด์ราย Comment เป็นการเดาจาก `skill.md`
13. **เงื่อนไขการถูกเพิกถอนสิทธิ์** — `enum AgentStatus {ACTIVE, REVOKED}` มีจริง และ
    `getAgentSession` ปฏิเสธสถานะที่ไม่ใช่ ACTIVE แต่**ไม่มี code path ไหนใน repo ที่ตั้งค่า REVOKED**
    น่าจะเป็นการกระทำของแอดมิน สาเหตุที่ทำให้ถูกเพิกถอนเป็นการเดา
    (คำเตือนเรื่องลอกผลงานใน `skill.md` ชี้ว่าการละเมิด code of conduct คือตัวจุดชนวน)
14. **รูป URL ของ listing** (`{base}/listing/{slug}`) เป็นการเดา

### 7.3 ข้อจำกัดเชิงปฏิบัติอื่น ๆ

* ตัวเลขทุกตัวที่ engine พิมพ์เป็น**แบบจำลอง** ไม่ใช่คำทำนาย — `FIT` คือแบบจำลอง แต่ brief คือความจริง
  เปิดอ่าน brief เองทุกครั้งก่อนตัดสินใจลงแรง
* โควตารายวันนับตาม**เวลาท้องถิ่น**ของเครื่อง เปลี่ยน timezone แล้วผลเปลี่ยน
* ledger อยู่บนเครื่องนี้เท่านั้น — ถ้าย้ายเครื่องแล้วไม่ย้าย state ไฟล์
  เครื่องมือจะไม่รู้ว่าเคยส่งอะไรไปแล้ว และ**การป้องกันส่งซ้ำจะหายไป**
* `updatesToday` นับจากตัว ledger เอง ไม่ใช่จาก server

---

## 8. ความปลอดภัยของ `agent/.earn-agent.json` — อ่านให้จบ

ไฟล์นี้เก็บ **API key ที่ใช้งานได้จริง** และ **claim code** ซึ่งเป็นความลับทั้งคู่

* **สิทธิ์ `0600`** เจ้าของอ่าน/เขียนได้คนเดียว เขียนแบบ atomic ไฟล์เสียถูก backup ไม่ทับทิ้ง
  ตรวจได้: `ls -l agent/.earn-agent.json` → `-rw------- 1 <you> <you> … .earn-agent.json`
* **อยู่ใน `.gitignore` แล้ว** ทั้ง `agent/.earn-agent.json` และ `agent/drafts/`
  ตรวจได้: `git check-ignore -v agent/.earn-agent.json`
* **ห้าม commit เด็ดขาด** ห้ามแปะใน issue, log, screenshot, prompt หรือ pastebin
  และห้ามใส่ใน URL
* **`claimCode` อันตรายพอ ๆ กับคีย์** ใครถือ code นี้ก็ผูกเงินรางวัลเข้ากระเป๋าตัวเองได้
* **ถ้าหลุด:** ไม่มี endpoint ออกคีย์ใหม่หรือ revoke ให้ในโค้ดสาธารณะ ให้ติดต่อ Superteam ทันที
  แล้วถือว่า agent ตัวนั้นถูกยึดไปแล้ว
* **backup ไฟล์นี้แบบเข้ารหัส** เพราะคีย์กับ claim code ถูกแสดงครั้งเดียว กู้ไม่ได้
  ทำหาย = ลงทะเบียนใหม่ทั้งตัว และได้ claim code ใหม่ด้วย
* `EARN_AGENT_HOME` ย้ายที่เก็บได้ — ถ้าย้ายออกนอก repo **ต้องดูแล permission และ backup เอง**
  และกฎ gitignore ของ repo นี้จะไม่คุ้มครองอีกต่อไป

---

## 9. รันเทส

```
$ node --test 'agent/test/*.test.js'
# pass 40
# fail 0
```

`rank.test.js` มี 39 เคส · `api-store.test.js` เป็นเคสเดียวที่ห่อการตรวจภายใน 50 ข้อ (50 passed, 0 failed)

> **ข้อควรระวัง:** `node --test agent/test/` (ชี้ที่โฟลเดอร์) **พัง** ด้วย
> `Cannot find module '/home/user/DWE/agent/test'` ใช้รูปแบบ glob หรือระบุไฟล์ทั้งสองแทน

---
---

<a name="english"></a>

# earn-agent (English)

A zero-dependency CLI for the Superteam Earn agent API: it discovers agent-eligible
listings, ranks them by expected value for an AI-agent operator, prepares submissions
and sends them. **The payout is always claimed by a human.** The tool never touches a wallet.

## 1. What this is

`earn-agent` does four things, and refuses a fifth:

| It does | It does not |
|---|---|
| Discover open, agent-eligible listings | Claim money, touch a wallet, or ask for a seed phrase |
| Score and rank them by EV per hour | Auto-submit — every mutating POST needs a human |
| Build a draft and run a 13-item quality gate | Offer any flag that skips the gate |
| Submit and update through the official API | Scrape around the API, register twice, or retry a 429 |

The money path is: the agent registers → receives a `claimCode` → **a human** opens
`/earn/claim/<code>`, completes a talent profile and connects a Solana wallet → prizes
land in that human's wallet. The agent never holds funds and never sees a private key.

## 2. Requirements

* **Node.js 18+** — the machine this was documented on reports **v22.22.2** (`node --version`)
* **Zero npm dependencies.** Node built-ins only: `fetch`, `node:fs`, `node:path`,
  `node:readline/promises`, `node:util.parseArgs`, `node:url`
* **No install step.** No `npm install`, no `node_modules/`
* **ESM throughout** — `agent/package.json` declares `{"type":"module"}` and every file matches

```
node agent/bin/earn-agent.js --help
```

## 3. Quick start, command by command

Every block below is **real captured output**, not hand-written. It was produced against a
local mock server — see [Limitations](#71-the-big-one) for why that matters.

> **Honesty note:** the output is copied verbatim except for two substitutions made so it
> reads as it will in real use: the mock host (`http://127.0.0.1:8787`) is shown as the real
> default `https://superteam.fun`, and the state-file path (the runs used `EARN_AGENT_HOME`
> pointed at a scratch directory) is shown as the default
> `/home/user/DWE/agent/.earn-agent.json`. Everything else — including the column truncation
> and the masked key — is exactly what the tool printed.

### 3.1 `register` — once, ever

```
$ node agent/bin/earn-agent.js register --name "dwe-earn-agent" --lang en

Agent registered
  Name                    dwe-earn-agent
  API key                 sk_...WXYZ (The API key is never printed anywhere — only as sk_...WXYZ)

  Key stored at /home/user/DWE/agent/.earn-agent.json (mode 0600, already gitignored)

The human steps (an agent cannot do these)

  Claim code: clm_9f2a7b41c3de
  Claim URL:  https://superteam.fun/earn/claim/clm_9f2a7b41c3de

  • 1. Open the URL above in a browser
  • 2. Complete the talent profile (name, skills, work)
  • 3. Connect a Solana wallet that can receive USDC — prizes land there
  • 4. Some sponsors require KYC before paying. Have documents ready.

  ! The claim code is a secret. Whoever holds it can bind the payouts to their own wallet.
  This tool never touches a wallet and never claims a payout for you. It prints the code and stops.
```

It refuses to overwrite an existing identity:

```
✗ An agent is already registered on this machine (dwe-earn-agent)
  Next step:
    → Pass --force to register a new one. The stored key and claim code are overwritten
      and cannot be recovered.
```

> `apiKey` and `claimCode` are shown by the server **exactly once**, and no endpoint in the
> public codebase reissues them. Losing the file means registering a brand-new agent.

### 3.2 `profile set` — tell the engine what you can actually do

```
$ node agent/bin/earn-agent.js profile set \
    --skills "Backend,Frontend,Writing" --hours-per-week 12 \
    --telegram "http://t.me/your_human_username"
  ✓ Profile saved

Operator profile (used by ranking)
  Skills                  Backend, Frontend, Writing
  Skill edge              none (default 1.8)
  Hours per week          12
  Can record video        no
  Can appear on camera    no
  Has audience reach on X  no
  Regions                 Global
  Telegram                http://t.me/your_human_username
  Daily submission cap    3
```

Flags: `--skills a,b` `--edge <n>` `--hours-per-week <n>` `--video true|false`
`--on-camera true|false` `--twitter-reach true|false` `--regions a,b` `--telegram <url>`
`--daily-cap <n>`. Or run `profile edit` for a guided prompt.

### 3.3 `listings` — what is open, and **which endpoint answered**

```
$ node agent/bin/earn-agent.js listings --lang en

Agent-eligible listings
  Source: agents-live — the agent endpoint itself (/api/agents/listings/live)

  Discovery-layer warnings:
    ! Primary returned 4 rows but 1 were past-deadline or not open and were dropped
      — the symptom of SuperteamDAO/earn#1456

#  TITLE                               SPONSOR             POOL  ENTR  ACCESS         DEADLINE          ID
─  ──────────────────────────────────  ────────────────  ──────  ────  ─────────────  ────────────────  ────────────
1  Nosana Builders Challenge: Agents…  Nosana            $3,000    41  AGENT_ALLOWED  2026-09-28 (9d)   cm9nosana102
2  Steve Agent Arena                   Steve               $500     6  AGENT_ONLY     2026-09-24 (5d)   cm9steve01
3  Open Innovation Track               Solana Foundati…  $5,000    88  AGENT_ALLOWED  2026-10-10 (21d)  cm9openinno
```

The `Source:` line prints **every time**. See [the #1456 fallback](#6-the-1456-bug-and-the-fallback).

### 3.4 `rank` — the command to live in

```
$ node agent/bin/earn-agent.js rank --top 5 --lang en

#  TITLE                           SPONSOR           POOL  ENTR  $/ENTR  EST h  EXP $/h  RUNWAY  VERDICT    SCORE
─  ──────────────────────────────  ──────────────  ──────  ────  ──────  ─────  ───────  ──────  ─────────  ─────
1  Nosana Builders Challenge: Ag…  Nosana          $3,000    41     $73    12h   $10.77      9d  SHORTLIST  60.41
2  Steve Agent Arena               Steve             $500     6     $83    12h   $11.03      5d  SHORTLIST  58.03
3  Open Innovation Track           Solana Founda…  $5,000    88     $57    20h    $3.40     21d  WATCH      38.34

  1. Nosana Builders Challenge: Agents 102  cm9nosana102
     · no build estimate anywhere — assuming 12h; put a real number on it before you commit
     · no skillEdge in the profile — using the honest baseline E=1.8
     · skill match on "backend" — E=1.8

  Columns: POOL=total prize, ENTR=entrants, $/ENTR=pool per entrant, EST h=estimated build
  hours, EXP $/h=expected dollars per hour, RUNWAY=time left to the deadline
  Verdicts: BUILD=start now, SHORTLIST=keep in play, WATCH=monitor, SKIP=do not enter
```

Every row explains itself, and says **what it assumed**.

### 3.5 `show <listingId>` — full detail and the eligibility questions

```
$ node agent/bin/earn-agent.js show cm9nosana102 --hours 16 --lang en

  Nosana Builders Challenge: Agents 102
  Pool                    $3,000      Entrants  41      Deadline  2026-09-28 (9d)

  Prizes by position:
    #1 1,000 USDC   #2 750 USDC   #3 450 USDC   #4 200 USDC   #5 100 USDC

Eligibility questions (every one must be answered)
  1. Project Title
  2. What does your agent do, and how did you verify it works?

Score
  verdict                 SHORTLIST  score 58.7 / band SHORTLIST
  expected                $129.19  ($8.07/h)

  Score breakdown:
    MONEY     0.24 w=0.3  █████
    FIT       1.00 w=0.22  ████████████████████
    CROWD     0.37 w=0.12  ███████
    RUNWAY    1.00 w=0.1  ████████████████████
    SPONSOR   0.35 w=0.1  ███████
    VERIFY    1.00 w=0.09  ████████████████████
    EXCL      0.35 w=0.07  ███████

  What the tool assumed (verify these yourself before building):
    ! assumed-build-hours
    ! assumed-skill-edge
    ! assumed-sponsor
```

Accepts either the listing `id` or its `slug`.

### 3.6 `draft <listingId>` — build it, then run the 13-item gate

In a real terminal it asks for the demo link, repo, telegram, hours, `otherInfo` and each
eligibility answer. Outside a TTY it scaffolds the file and checks only.

```
$ node agent/bin/earn-agent.js draft cm9nosana102 --lang en

Submission draft
  Created a new draft at /home/user/DWE/agent/drafts/cm9nosana102.json
  Not an interactive terminal — scaffolding and checking only, no questions asked

Quality gate
  ✗ 29 item(s) failing — not submittable yet

  #1  No brief-compliance matrix. Extract every explicit requirement from the brief into a
      numbered list and map each to a file path, route or URL.
      fix in: compliance[] { requirement, satisfiedBy }
  #3  The demo link is not an absolute http(s) URL (empty)
      fix in: link
  #5  The README has not been read aloud and timed. Time it; do not estimate it.
      fix in: readme.readAloudSeconds
  #12 otherInfo is 0 characters; the minimum is 400. There is no such thing as reserving a slot.
      fix in: otherInfo
  #13 No human sign-off. The tool will not call /api/agents/submissions/create on items 1-12 alone.
      fix in: humanSignOff.approved
  ...
  → The rest is evidence only a human can record. Edit the file directly:
    /home/user/DWE/agent/drafts/cm9nosana102.json
```

Several kinds of evidence (the live fetch of the demo link, the exit code of the run command,
the commit count, the sign-off) **only a human can record**. Edit the JSON and re-run `draft`.

### 3.7 `submit <listingId>` — four gates before a single byte leaves

Order of checks: **duplicate → daily cap → quality gate → show the request → human confirms.**
The first two run *before* the body is built or any network call is made.

```
$ node agent/bin/earn-agent.js submit cm9nosana102 --dry-run --lang en

Submit
  verdict                 SHORTLIST score 60.41
  expected                $129.19 ($10.77/h)
  Submissions today       0 / 3

The exact request that would be sent

  POST https://superteam.fun/api/agents/submissions/create
  authorization: Bearer sk_...WXYZ
  content-type: application/json
  accept: application/json

  │ {
  │   "listingId": "cm9nosana102",
  │   "link": "https://github.com/example-operator/nosana-agent-102/releases/tag/v1.0.0",
  │   "tweet": "",
  │   "otherInfo": "What it does: ... What it does not do yet: ...",
  │   "eligibilityAnswers": [
  │     { "question": "Project Title", "answer": "Nosana Cheapest-Node Router with Signed Receipts" },
  │     { "question": "What does your agent do, and how did you verify it works?", "answer": "..." }
  │   ],
  │   "ask": null,
  │   "telegram": "http://t.me/your_human_username"
  │ }

  ◎ --dry-run: nothing was sent
```

A failing gate has **no override**:

```
✗ REFUSED: the draft fails 1 quality-gate item(s)
  Next step:
    → There is no override. Fix the draft and re-run draft cm9nosana102.
```

No TTY and no `--yes`:

```
✗ REFUSED: a human confirmation is required and this is not an interactive terminal
  Next step:
    → Run it in a real terminal, or pass --yes (skips the human check — operator-accepted risk)
```

A successful send:

```
  ! --yes: the human confirmation was skipped at the operator's explicit instruction. The risk is theirs.

Submitted
  submissionId            sub_mock_7781
  Status                  Pending
  ✓ Recorded in the ledger — this listing can never be submitted to again
  2 submission(s) left in today's cap
```

A second create for the same listing:

```
✗ REFUSED: already submitted to this listing on 2026-09-19
  Next step:
    → One submission per listing. Change the existing one with:
      node agent/bin/earn-agent.js update cm9nosana102
```

Daily cap reached (this run had `--daily-cap 1`):

```
✗ REFUSED: the daily cap is used up (1/1)
  Next step:
    → The cap resets at local midnight. Change it with: profile set --daily-cap N
```

### 3.8 `update <listingId>`

Identical machinery, pointed at `POST /api/agents/submissions/update`, and it requires a
prior submission:

```
✗ REFUSED: nothing has been submitted to this listing, so there is nothing to update
  Next step:
    → Use submit cm9steve01 instead
```

Updates do **not** consume the create budget, but they have their own ceiling: at most
`dailyCap` rewrites of one listing per day.

### 3.9 `whoami` and `claim`

```
$ node agent/bin/earn-agent.js whoami --check --lang en

Agent identity
  Name                    dwe-earn-agent
  API key                 sk_...WXYZ
  Claim code              clm_9f2a7b41c3de
  State file              /home/user/DWE/agent/.earn-agent.json

Submission budget
  Submissions today       1 / 3
  Remaining today         2
  Submissions total       1

Server-side status
  Status                  ACTIVE
  Claim code              Not claimed by a human yet — prizes have nowhere to go until it is
```

`--check` calls `GET /api/agents/status`. `claim` prints the code and the URL, and **stops**.

## 4. Global flags

| Flag | Effect |
|---|---|
| `--json` | Machine-readable output on every command (the key stays masked) |
| `--dry-run` | Print the request that would be sent and exit — on `submit` and `update` |
| `--yes` | Skip the confirmation. **Off by default.** Operator-accepted risk |
| `--base-url <u>` | Point at another server (testing against a mock) |
| `--lang th\|en` | Language. Default `th`; `EARN_LANG` is honoured |
| `--no-color` | Disable colour (`NO_COLOR` works too) |
| `--timeout <ms>` | Per-request timeout |
| `--debug` | Show stack traces (the key stays masked) |

**Exit codes (verified by running them):** `0` success · `1` user/validation error ·
`2` network/API error.

**Environment:** `EARN_AGENT_HOME` relocates all state (the test suite uses it so a run can
never clobber real credentials) · `EARN_LANG` · `NO_COLOR`.

## 5. Safety rules enforced **in code**

Each row is a guarantee you can verify by reading the named code. Each was also exercised
against a mock server.

| # | Guarantee | Enforced in |
|---|---|---|
| 1 | **Never auto-submits.** Every mutating POST needs an interactive confirmation that shows the exact body first. Not a TTY → refused | `bin/earn-agent.js` `cmdSubmit()`, *Human confirmation* |
| 2 | **`--yes` is off by default** and prints a warning naming the operator as the risk holder | `cmdSubmit()`, `flags.yes` branch |
| 3 | **One submission per listing, ever.** Ledger-enforced, checked before any network call | `store.hasSubmittedTo()` + `cmdSubmit()` |
| 4 | **Daily cap, default 3.** Checked before the body is built and before any request. Resets at local midnight | `store.DEFAULT_DAILY_CAP`, `store.submittedToday()` |
| 5 | **Updates have their own ceiling** — `dailyCap` rewrites of one listing per day | `cmdSubmit()`, `mode === 'update'` |
| 6 | **13-item quality gate, no override.** Pass means 13/13 | `lib/rank.js` `qualityGate()` |
| 7 | **The key is never printed.** Every byte to stdout/stderr passes `scrub()`, which replaces the live key with `sk_...last4` and any stray `sk_` token with `sk_[REDACTED]` — including under `--json` and `--debug` | `bin/earn-agent.js` section 1 |
| 8 | **The key is never in a URL** — `Authorization: Bearer` only | `lib/api.js` `authHeaders()` |
| 9 | **State file is 0600**, written atomically (tmp + rename); a corrupt file is backed up, never silently overwritten | `lib/store.js` `save()` |
| 10 | **`--dry-run` on every mutating command**, printing exact method, URL, headers and body | `client.describeSubmission()` |
| 11 | **A 429 is never retried automatically.** It prints how long to wait and stops | `printError()` `status === 429`; `postSubmission` sets `retry: false` |
| 12 | **Submission POSTs are never retried** — the API has no Idempotency-Key, so a retried create is a duplicate | `lib/api.js` `postSubmission()` |
| 13 | **Never touches money.** No code requests a private key or seed phrase, or calls `/earn/claim/` | whole repo |

### Verify #7 yourself

These commands were run and grepped for the raw key — zero hits each time
(`whoami --check`, `listings`, `rank`, `show`, `claim`, `whoami --json --debug`,
`listings --json --debug`, `register`):

```bash
KEY=$(node -e "console.log(JSON.parse(require('fs').readFileSync('agent/.earn-agent.json','utf8')).apiKey)")
node agent/bin/earn-agent.js listings --json --debug | grep -F "$KEY"   # expect no output
```

## 6. The #1456 bug and the fallback

**The problem:** `GET /api/agents/listings/live` has a reported bug,
[SuperteamDAO/earn#1456](https://github.com/SuperteamDAO/earn/issues/1456) — it returns
nothing, or returns only past-deadline rows.

**How this tool handles it** — four tiers, descended automatically:

| Tier | Endpoint | Reported `source` |
|---|---|---|
| 1 | `GET {base}/api/agents/listings/live?take=N` | `agents-live` |
| 2 | `GET {base}/api/listings?context=agents&status=open&tab=all` | `fallback-filter` |
| 3 | `GET https://earn.superteam.fun/api/listings?context=agents&…` | `fallback-filter` |
| 4 | `GET https://earn.superteam.fun/api/listings?take=100` (the issue's literal text) | `fallback-filter` |

Whenever it descends, it says so and why:

```
  Source: fallback-filter — the public fallback (/api/listings) — because the primary hit bug #1456

  Discovery-layer warnings:
    ! Primary GET /api/agents/listings/live returned 0 listings — the exact symptom of
      SuperteamDAO/earn#1456. Falling back.
    ! Results came from the public fallback (.../api/listings?context=agents), not the agent
      API. This path is cached up to 5 minutes, so it may be slightly stale.
```

**Why tier 2 is not the issue's literal recipe.** The workaround as written in the issue
(`/api/listings?take=100`, then filter on `agentAccess`) has three defects, all confirmed
in source:

1. `take` is not in the server's query schema — zod strips it, so the response is
   **unbounded**, not 100. The client caps it locally.
2. With the default `context=all` the server applies `agentAccess != AGENT_ONLY`, so the
   issue's own filter **can never match an AGENT_ONLY row** — it silently drops exactly the
   agent-exclusive listings it exists to rescue, and those are where the odds are best.
3. It omits the `sponsor.isVerified` gate, so it can surface rows whose details endpoint 404s.

`context=agents` is a first-class enum value on the server and fixes all three. Tier 4 keeps
the literal recipe as a last resort, and when it is used it warns loudly that the result is
**incomplete**.

**What does *not* trigger a fallback:** `401` (fix the key), `400` (fix the params) and
`429` (back off). All three are raised directly, because falling back would hide a real,
fixable error.

**Check it yourself:** `listings --cross-check` queries both paths and compares.

```
! Cross-check: both discovery paths agree.
```

A `--take` above 50 is clamped and announced:
`take=80 was clamped to 50; the agent endpoint silently caps take at 50.`

## 7. Honest limitations

### 7.1 The big one

The environment this tool was built in has **blocked egress**: the proxy answers `403` to
every CONNECT to `superteam.fun` and `earn.superteam.fun` (confirmed with `curl`:
`CONNECT tunnel failed, response 403`).

Consequences:

* Everything in the spec was read from the **AGPL-3.0 `SuperteamDAO/earn` source** at commit
  `7bf213b864eb0823319b6a799b50016308969d40` (2026-09-17), plus `superteam.fun/skill.md`.
* **Not one byte was confirmed against the live API.** Whether production currently serves
  that exact build is unverifiable from here.
* The #1456 fix landed only **one day** before that HEAD, so production may still be running
  the buggy discovery code. **That is the single strongest reason to ship the fallback even
  though the bug is fixed in source.**
* All end-to-end proof — including every example in this README — is against a **local mock
  server**. **The first real run may need adjustment.** Budget time for it.

### 7.2 Fields marked ASSUMED, not verified

The tool degrades gracefully and **always names what it assumed**. It never silently invents
a field.

1. **`skill.md` is stale on errors.** v0.5.1 documents specific bodies
   (`403 Agents are not eligible for this listing`, `403 Submission not found`,
   `403 Submission cannot be edited after rejection`, `400 Validation`). Commits `99082e54`
   ("changed error messages to generic to avoid internal error leaks") and `a9be5bf1`
   replaced all of them with an opaque
   `{error:'Internal Server Error', message:'Unable to create submission.'}`.
   **Never string-match an error body to decide control flow.** The one safe inference: a
   `403` from create most often means "submission already exists", so retry once against
   `/submissions/update`. **That retry heuristic is ASSUMED.**
2. **Create/update status-code inconsistency is real; the mapping is ASSUMED.** `create.ts`
   picks `400` only when `error.message.includes('Validation')`, while zod failures throw
   `JSON.stringify(formErrors)`, which contains `formErrors`/`fieldErrors` but never the word
   `Validation` — so **validation errors on create arrive as 403**. `update.ts` instead does
   `JSON.parse(error.message)` → `400`. Read from source; neither path was executed.
3. **`type` is unvalidated** on `/api/agents/listings/live`: `params.type` is cast straight
   into the Prisma filter with no zod guard. A value outside `{bounty, project, hackathon}`
   most likely yields a `500` rather than a `400` — **ASSUMED, not tested.** Whitelist
   client-side before sending.
4. **No `usdValue` is exposed** by either agent endpoint (it is on the Bounties table but
   absent from both `listingSelect` and `publicListingDetailsSelect`). **Any USD figure the
   CLI prints is its own estimate, not platform data.** The code converts only for
   USD-pegged tokens (`USDC/USDT/USDG/USD/USDD/PYUSD`) and leaves everything else `null`.
5. **The example prize pools** (Nosana Agents 102 = 3,000 USDC split 1000/750/450/200/100;
   Open Innovation Track 5,000 USDG; Steve Agent Arena 500 USDC; the $500–$5,000 range from a
   third-party guide) are **point-in-time observations, not verified live.** Illustrative only.
   The client reads `rewardAmount`/`rewards` at runtime and never hardcodes a pool.
6. **The fallback's AGENT_ONLY blind spot is unquantified.** The structural defect is
   verified from source; how many AGENT_ONLY listings exist in practice could not be measured.
7. **No rate-limit headers on success.** `checkAndApplyRateLimitPages` sets them only on the
   `429` branch, so there is no proactive budget signal. Count locally: **60 combined
   create+update per agent per rolling fixed hour.** (A CDN in front of the app could add its
   own headers; that is invisible from source.)
8. **No idempotency support anywhere.** A create whose response is lost cannot safely be
   retried as a create — it hits the "submission already exists" path (`403`, opaque).
   Recovery is to call update instead. Note also that create writes `ask:null` for a falsy
   `ask` while update writes `ask:0`, so a create→update recovery silently changes that
   field. Both facts are verified from code; **the recovery strategy built on them is ASSUMED.**
9. **Response over-exposure.** The agent submit/update routes return the **raw Prisma
   Submission row**, including internal review fields (`label`, `notes`, `ai`,
   `paymentDetails`, `rewardInUSD`). This looks like an oversight relative to commit
   `49175bd7` ("restrict listing info on agents endpoint") and may be tightened later. The
   code reads only `id`/`status`/`label` and tolerates their disappearance.
10. **Host equivalence is ASSUMED.** `superteam.fun` and `earn.superteam.fun` are treated as
    the same app (no `basePath`, no host rewrite in `next.config.ts`, and the CSP references
    `privy.earn.superteam.fun`). That they are interchangeable for every `/api/agents/*` path
    is an assumption, which is why the host is one configurable constant (`--base-url`).
11. **The `Bearer` prefix is optional in practice.** The unanchored `.replace('Bearer ', '')`
    means a bare key authenticates — verified from source, but clearly incidental rather than
    contractual. The client always sends the canonical `Bearer ` form and never relies on it.
12. **Comment object fields.** `fetchComments.ts` and `comment/create.ts` were not opened.
    The `{count, result, validUsernames}` envelope and the two pass-through `403` messages are
    verified; per-Comment field names and types are **ASSUMED** from `skill.md`. Parse defensively.
13. **Revocation triggers are ASSUMED.** `enum AgentStatus {ACTIVE, REVOKED}` exists and
    `getAgentSession` rejects anything non-ACTIVE, but **no code path in the repo sets
    REVOKED** — it appears to be a manual admin action. `skill.md`'s plagiarism warning
    suggests code-of-conduct violations are the trigger.
14. **The public listing permalink shape** (`{base}/listing/{slug}`) is an assumption.

### 7.3 Other practical limits

* Every number the engine prints is a **model, not a prediction.** `FIT` is a model; the
  brief is the truth. Open the brief yourself before spending a weekend.
* The daily cap uses the machine's **local time.** Change timezone and the boundary moves.
* The ledger is local to this machine. Move machines without moving the state file and the
  tool no longer knows what you submitted — **the duplicate protection is gone.**
* `updatesToday` is counted from the local ledger, not from the server.

## 8. Security note: `agent/.earn-agent.json`

This file holds a **live API key** and the **claim code**. Both are secrets.

* **Mode `0600`**, owner-only, written atomically; a corrupt file is backed up rather than
  overwritten. Check it: `ls -l agent/.earn-agent.json` → `-rw------- 1 <you> <you> …`
* **Already gitignored** — both `agent/.earn-agent.json` and `agent/drafts/`.
  Check it: `git check-ignore -v agent/.earn-agent.json`
* **Never commit it.** Never paste it into an issue, a log, a screenshot, a prompt or a
  pastebin, and never put it in a URL.
* **The `claimCode` is as dangerous as the key** — whoever holds it can bind the payouts to
  their own wallet.
* **If it leaks:** there is no reissue or revoke endpoint in the public codebase. Contact
  Superteam immediately and treat that agent identity as compromised.
* **Back it up, encrypted.** The key and claim code are shown once and are unrecoverable;
  losing the file means registering a brand-new agent and getting a new claim code with it.
* `EARN_AGENT_HOME` relocates the state. Move it outside the repo and **you own the
  permissions and the backups** — this repo's gitignore rules no longer protect it.

## 9. Tests

```
$ node --test 'agent/test/*.test.js'
# pass 40
# fail 0
```

`rank.test.js` contributes 39 cases; `api-store.test.js` is a single case wrapping 50
internal checks (`50 passed, 0 failed`).

> **Gotcha:** `node --test agent/test/` (pointing at the directory) **fails** with
> `Cannot find module '/home/user/DWE/agent/test'`. Use the glob form, or name both files.

## 10. File map

```
agent/
  bin/earn-agent.js        the CLI — arg parsing, output, secret scrubbing, all safety gates
  lib/api.js               HTTP client, 4-tier discovery, listing normalisation, ApiError
  lib/rank.js              pure scoring engine + the 13-item quality gate (no I/O, never throws)
  lib/store.js             credential + ledger persistence (0600, atomic, masked)
  test/                    node:test suites for all three libraries
  package.json             {"type":"module"}, engines >=18, zero dependencies
  .earn-agent.json         YOUR SECRETS — 0600, gitignored, never commit
  drafts/<listingId>.json  submission drafts — gitignored
docs/
  AGENT-PLAYBOOK.md        the human operating manual: the weekly loop, what not to do
```

---

Licensing and platform terms are Superteam's. Superteam officially invites agents, which is
what makes this authorised use — and it stays authorised only because the tool cannot become
a spam cannon. No income is promised here. See `docs/AGENT-PLAYBOOK.md` for what to
realistically expect.
