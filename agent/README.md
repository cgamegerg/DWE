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

> **หมายเหตุเรื่องความตรงไปตรงมา:** ผลลัพธ์ถูกคัดลอกมาตามตัวอักษร ยกเว้นสามอย่างที่แทนค่าไว้
> เพื่อให้อ่านแล้วตรงกับการใช้งานจริง: (1) host ของ mock (`http://127.0.0.1:8787`)
> แทนด้วยค่าปริยายจริง `https://superteam.fun` (2) path ของ state file และ path ของร่าง
> (ซึ่งรันด้วย `EARN_AGENT_HOME` ชี้ไปโฟลเดอร์ชั่วคราว) แทนด้วยค่าปริยาย
> `/home/user/DWE/agent/...` และ (3) บล็อกที่ยาวมากถูกตัดตรงกลาง โดยมีบรรทัด `...`
> คั่นไว้ให้เห็นชัดทุกครั้งที่ตัด ไม่มีการย่อหรือจัดรูปข้อความใหม่นอกเหนือจากนี้
> ที่เหลือคือข้อความจริงทุกตัวอักษร รวมถึงตารางที่ถูกตัดคำและคีย์ที่ถูกปิดบัง

> **ภาษาของผลลัพธ์:** ค่าปริยายคือ `th` ตัวอย่างในหัวข้อนี้จึงเป็นผลลัพธ์ภาษาไทยจริง
> (ฉบับภาษาอังกฤษด้านล่างรันด้วย `--lang en`) แต่ต้องรู้ไว้ว่า **ส่วนที่เป็นภาษาไทย
> คือโครงของหน้าจอเท่านั้น** — ข้อความของด่านคุณภาพ เหตุผลรายแถวในคำสั่ง `rank`/`show`
> และคำเตือนจากชั้นดึงข้อมูล ถูกสร้างใน `lib/rank.js` และ `lib/api.js`
> ซึ่ง **ยังเป็นภาษาอังกฤษล้วนทั้งสองภาษา** จะเห็นได้จากตัวอย่างข้างล่างนี้เอง

### 3.1 `register` — ลงทะเบียนครั้งเดียวตลอดชีพ

```
$ node agent/bin/earn-agent.js register --name "dwe-earn-agent"

ลงทะเบียน agent สำเร็จ
  ชื่อ                      dwe-earn-agent
  คีย์ API                  sk_...WXYZ (คีย์ API จะไม่ถูกแสดงในที่ใดทั้งสิ้น — แสดงเป็น sk_...WXYZ เท่านั้น)

  บันทึกคีย์ไว้ที่ /home/user/DWE/agent/.earn-agent.json
  สิทธิ์ไฟล์ 600 — เจ้าของอ่านได้คนเดียว (ตรวจสอบแล้ว)
  อยู่ใน .gitignore ของ repo ที่ /home/user/DWE แล้ว (ตรวจสอบแล้ว)

ขั้นตอนของมนุษย์ (agent ทำแทนไม่ได้)

  รหัสเคลม: clm_9f2a7b41c3de
  ลิงก์เคลม:  https://superteam.fun/earn/claim/clm_9f2a7b41c3de

  • 1. เปิดลิงก์ด้านบนในเบราว์เซอร์
  • 2. กรอกโปรไฟล์ talent ให้ครบ (ชื่อ ทักษะ ผลงาน)
  • 3. ผูกกระเป๋า Solana ที่รับ USDC ได้ — เงินรางวัลเข้าที่นั่น
  • 4. บาง sponsor ต้องทำ KYC ก่อนจ่าย ให้เตรียมเอกสารไว้

  ! รหัสเคลมคือความลับ ใครถือรหัสนี้ก็ผูกเงินรางวัลเข้ากระเป๋าตัวเองได้
  เครื่องมือนี้ไม่แตะกระเป๋าเงินและไม่เคลมเงินแทนคุณ มันพิมพ์รหัสให้แล้วจบ
```

ถ้ามีคีย์อยู่แล้วจะปฏิเสธ:

```
$ node agent/bin/earn-agent.js register --name "second-agent"

✗ มี agent ลงทะเบียนไว้แล้วในเครื่องนี้ (dwe-earn-agent)

  ต้องทำต่อ:
    → ถ้าต้องการลงทะเบียนใหม่จริง ๆ ให้ใส่ --force (คีย์และ claim code เดิมจะถูกทับและกู้คืนไม่ได้)
```

> `apiKey` และ `claimCode` เซิร์ฟเวอร์แสดง **ครั้งเดียว** และไม่มี endpoint ออกใหม่
> ทำหายคือต้องลงทะเบียน agent ใหม่ทั้งตัว

### 3.2 `profile set` — บอกเครื่องมือว่าคุณทำอะไรได้

โปรไฟล์นี้คือสิ่งที่ engine ใช้คิดคะแนน

```
$ node agent/bin/earn-agent.js profile set \
    --skills "Backend,Frontend,Writing" --hours-per-week 12 \
    --telegram "http://t.me/your_human_username"
  ✓ บันทึกโปรไฟล์แล้ว

โปรไฟล์ผู้ปฏิบัติงาน (ใช้ตอนจัดอันดับ)
  ทักษะ                    Backend, Frontend, Writing
  ค่า skill edge           ไม่มี (default 1.8)
  ชั่วโมงว่างต่อสัปดาห์         12
  ถ่ายวิดีโอได้               ไม่
  ออกกล้องได้               ไม่
  มีฐานผู้ติดตามบน X          ไม่
  ภูมิภาคที่ส่งได้              Global
  Telegram                http://t.me/your_human_username
  โควตาการส่งต่อวัน          3

  แก้ไข: node agent/bin/earn-agent.js profile set --hours-per-week 20 --skills "typescript,rust"
```

ตัวเลือก: `--skills a,b` `--edge <n>` `--hours-per-week <n>` `--video true|false`
`--on-camera true|false` `--twitter-reach true|false` `--regions a,b` `--telegram <url>`
`--daily-cap <n>` — หรือใช้ `profile edit` ถามทีละข้อ

> `--daily-cap` ผ่าน `profile set` รับค่า **0–50** เท่านั้น (เกินช่วงนี้จะถูกปฏิเสธ)
> แต่เพดานนี้บังคับอยู่ที่ตัว flag เท่านั้น — `profile edit` แบบถามทีละข้อ และการแก้
> `.earn-agent.json` ด้วยมือ **ไม่ถูกจำกัดด้วยเพดาน 50**

### 3.3 `listings` — ดูว่ามีอะไรเปิดอยู่ และ **มาจากทางไหน**

```
$ node agent/bin/earn-agent.js listings

listing ที่ agent ส่งได้
  แหล่งข้อมูล: agents-live — endpoint ของ agent โดยตรง (/api/agents/listings/live)

  คำเตือนจากชั้นดึงข้อมูล:
    ! Primary returned 4 rows but 1 were past-deadline or not open and were dropped — the symptom of SuperteamDAO/earn#1456 (live agent listings returned no open rows / past-deadline rows).

#  TITLE                               SPONSOR             POOL  ENTR  ACCESS         DEADLINE            ID
─  ──────────────────────────────────  ────────────────  ──────  ────  ─────────────  ──────────────────  ────────────
1  Nosana Builders Challenge: Agents…  Nosana            $3,000    41  AGENT_ALLOWED  2026-09-28 (9 วัน)   cm9nosana102
2  Steve Agent Arena                   Steve               $500     6  AGENT_ONLY     2026-09-24 (5 วัน)   cm9steve01
3  Open Innovation Track               Solana Foundati…  $5,000    88  AGENT_ALLOWED  2026-10-10 (21 วัน)  cm9openinno

  พบ 3 รายการ
  ขั้นต่อไป: node agent/bin/earn-agent.js show <listingId>
```

บรรทัด `แหล่งข้อมูล:` ปรากฏ **ทุกครั้ง** ดูหัวข้อ [บั๊ก #1456](#6-บั๊ก-1456-และทางสำรอง)
สังเกตว่าคำเตือนจากชั้นดึงข้อมูลเป็นภาษาอังกฤษแม้อยู่ในโหมดไทย ตามที่บอกไว้ข้างบน

### 3.4 `rank` — คำสั่งที่ควรใช้บ่อยที่สุด

```
$ node agent/bin/earn-agent.js rank --top 5

จัดอันดับ listing ตามเงินที่คาดว่าจะได้ต่อชั่วโมงและความน่าจะชนะ
  แหล่งข้อมูล: agents-live — endpoint ของ agent โดยตรง (/api/agents/listings/live)

  คำเตือนจากชั้นดึงข้อมูล:
    ! Primary returned 4 rows but 1 were past-deadline or not open and were dropped — the symptom of SuperteamDAO/earn#1456 (live agent listings returned no open rows / past-deadline rows).

#  TITLE                           SPONSOR           POOL  ENTR  $/ENTR   EST h  EXP $/h  RUNWAY  VERDICT    SCORE
─  ──────────────────────────────  ──────────────  ──────  ────  ──────  ──────  ───────  ──────  ─────────  ─────
1  Nosana Builders Challenge: Ag…  Nosana          $3,000    41     $73  12 ชม.    $8.78    9 วัน  SHORTLIST  59.18
2  Steve Agent Arena               Steve             $500     6     $83  12 ชม.   $10.26    5 วัน  SHORTLIST  57.58
3  Open Innovation Track           Solana Founda…  $5,000    88     $57  20 ชม.    $5.04   21 วัน  SHORTLIST  50.79

  1. Nosana Builders Challenge: Agents 102  cm9nosana102
     · no build estimate anywhere — assuming 12h; put a real number on it before you commit
     · no skillEdge in the profile — using the honest baseline E=1.8
     · skill match on "backend" — E=1.8

...

  คอลัมน์: POOL=เงินรางวัลรวม, ENTR=จำนวนคู่แข่ง, $/ENTR=เงินต่อคู่แข่ง, EST h=ชั่วโมงที่ประเมิน, EXP $/h=เงินคาดหวังต่อชั่วโมง, RUNWAY=เวลาที่เหลือถึงเส้นตาย
  คำตัดสิน: BUILD=ลงมือเลย, SHORTLIST=เก็บไว้พิจารณา, WATCH=เฝ้าดู, SKIP=ข้าม
  ขั้นต่อไป: node agent/bin/earn-agent.js show <listingId>
```

ทุกแถวบอกเหตุผล และบอกด้วยว่า **อะไรที่มันเดาเอง**
(ตัวเลขข้างบนมาจาก mock ในเครื่อง ไม่ใช่ listing จริง — ดู [ข้อจำกัด](#71-เรื่องใหญ่ที่สุด--ยังไม่เคยคุยกับ-api-จริงเลยสักไบต์))

> **คะแนนขยับตามนาฬิกา** องค์ประกอบ `RUNWAY` คิดจากเวลาที่เหลือถึง deadline
> รันคำสั่งเดิมซ้ำอีก 20 นาทีให้หลังกับ listing ชุดเดิม คะแนนจะขยับในหลักร้อยของหน่วย
> (เช่น `57.58` → `57.56`) **ไม่ใช่ความไม่เสถียร แต่เป็นตัวแบบที่ทำงานถูกต้อง**
> ตัวเลขในเอกสารนี้จึงเป็นค่า ณ วินาทีที่คัดลอกมา

### 3.5 `show <listingId>` — รายละเอียดเต็ม + คำถามคัดกรอง

```
$ node agent/bin/earn-agent.js show cm9nosana102 --hours 16

รายละเอียด listing

  Nosana Builders Challenge: Agents 102
  https://superteam.fun/earn/listing/nosana-builders-challenge-agents-102

  id                      cm9nosana102
  ผู้สนับสนุน                 Nosana
  ประเภท                  bounty
  สายงาน                  Backend
  สิทธิ์ agent               AGENT_ALLOWED
  สถานะ                   OPEN
  ภูมิภาค                   Global
  เงินรางวัล                $3,000
  คู่แข่ง                    41
  เส้นตาย                  2026-09-28 (9 วัน)

  รางวัลรายอันดับ:
    #1 1,000 USDC
    #2 750 USDC
    #3 450 USDC
    #4 200 USDC
    #5 100 USDC

คำถามคัดกรอง (ต้องตอบทุกข้อ)
  1. Project Title
  2. What does your agent do, and how did you verify it works?

ผลการให้คะแนน
  verdict                 SHORTLIST  score 57.64 / band SHORTLIST
  expected                $105.41  ($6.59/h)
  fit / crowding          1 / 0.3692
  runway ok               ใช่

  องค์ประกอบคะแนน:
    MONEY     0.21 w=0.3  ████
    FIT       1.00 w=0.22  ████████████████████
    CROWD     0.37 w=0.12  ███████
    RUNWAY    1.00 w=0.1  ████████████████████
    SPONSOR   0.35 w=0.1  ███████
    VERIFY    1.00 w=0.09  ████████████████████
    EXCL      0.35 w=0.07  ███████

  เหตุผลหลัก:
    · no per-listing build estimate — using the profile default of 16h
    · no skillEdge in the profile — using the honest baseline E=1.8
    · skill match on "backend" — E=1.8
    · $3,000 pool, 41 entrants, ~16h at E=1.8 — 20.7% chance of placing, $105.41 expected, $6.59/h
    · published prizes cover only 83.3% of the pool — the rest is money nobody can win, and the model does not inflate it back

...

  สิ่งที่เครื่องมือเดาเอง (ยืนยันเองก่อนลงแรง):
    ! assumed-build-hours
    ! assumed-skill-edge
    ! assumed-sponsor
```

รับได้ทั้ง `id` และ `slug`

> **ลิงก์ listing:** เครื่องมือประกอบเป็น `{base}/earn/listing/{slug}`
> ซึ่ง**ยืนยันแล้วจาก source** ของ `SuperteamDAO/earn@7bf213b8`
> (`src/pages/earn/listing/[slug]/index.tsx`, `src/app/sitemap.ts`
> และ `src/app/api/spam-dispute/route.ts` ประกอบ URL แบบเดียวกัน
> ส่วน `next.config.ts` ไม่มี redirect จาก `/listing/*` เลย)

### 3.6 `draft <listingId>` — ร่าง + ตรวจ 13 ข้อ

ในเทอร์มินัลจริงจะถามทีละข้อ (ลิงก์ demo, repo, telegram, ชั่วโมงที่ใช้, `otherInfo`, คำตอบคัดกรอง)
ถ้าไม่ใช่เทอร์มินัลจะสร้างโครงไฟล์ให้แล้วตรวจอย่างเดียว

```
$ node agent/bin/earn-agent.js draft cm9nosana102

ร่างผลงานที่จะส่ง
  Nosana Builders Challenge: Agents 102  cm9nosana102

  สร้างร่างใหม่ที่ /home/user/DWE/agent/drafts/cm9nosana102.json
  ! Primary returned 4 rows but 1 were past-deadline or not open and were dropped — the symptom of SuperteamDAO/earn#1456 (live agent listings returned no open rows / past-deadline rows).
  ไม่ได้อยู่ในเทอร์มินัลโต้ตอบ — สร้าง/ตรวจร่างอย่างเดียว ไม่ถามคำถาม

  ✓ บันทึกร่างแล้วที่ /home/user/DWE/agent/drafts/cm9nosana102.json

ผลการตรวจคุณภาพ
  ✗ ยังไม่ผ่าน 29 ข้อ — ยังส่งไม่ได้

  #1  No brief-compliance matrix. Extract every explicit requirement from the brief into a numbered list and map each to a file path, route or URL.
      แก้ที่ฟิลด์: compliance[] { requirement, satisfiedBy }
  #2  Answer to "Project Title" is a placeholder ("").
      แก้ที่ฟิลด์: eligibilityAnswers[].answer
  #3  The demo link is not an absolute http(s) URL (empty)
      แก้ที่ฟิลด์: link
  #5  The README has not been read aloud and timed. Time it; do not estimate it.
      แก้ที่ฟิลด์: readme.readAloudSeconds
  #12 otherInfo has 0 characters of actual content (whitespace does not count); the minimum is 400. There is no such thing as reserving a slot.
      แก้ที่ฟิลด์: otherInfo
  #13 No human sign-off. The tool will not call /api/agents/submissions/create on items 1-12 alone.
      แก้ที่ฟิลด์: humanSignOff.approved

...

  → ส่วนที่เหลือเป็นหลักฐานที่มนุษย์ต้องกรอกเอง แก้ไฟล์นี้ตรง ๆ: /home/user/DWE/agent/drafts/cm9nosana102.json

  คำเตือน (ไม่บล็อกการส่ง แต่ควรแก้):
  #10 The repo does not say whether it is public. Say so explicitly.
  #12 not a single number in the whole body — every adjective is supposed to have a number or a verifiable fact behind it
```

> **29 ข้อ ไม่ใช่ 29 ชนิด** — ด่านคุณภาพมี **13 ข้อ** แต่หนึ่งข้อรายงานได้หลายบรรทัด
> (เช่นข้อ #5 รายงานส่วนที่ขาดของ README ทีละส่วน) ตัวเลข 29 คือจำนวน *บรรทัดที่ไม่ผ่าน*
> ของร่างเปล่า ๆ ไม่ใช่จำนวนข้อ

หลักฐานหลายอย่าง (ผล fetch ลิงก์, exit code ของคำสั่งรัน, จำนวน commit, การเซ็นอนุมัติ)
**มีแต่มนุษย์ที่บันทึกได้** — แก้ในไฟล์ JSON ตรง ๆ แล้วรัน `draft` ซ้ำ

### 3.7 `submit <listingId>` — มีด่านสี่ชั้นก่อนถึง network

ลำดับการตรวจ: **ซ้ำ → โควตารายวัน → ด่านคุณภาพ → แสดง request → มนุษย์ยืนยัน**
สองด่านแรกทำงาน *ก่อน* จะสร้าง body หรือยิงเน็ตด้วยซ้ำ

```
$ node agent/bin/earn-agent.js submit cm9nosana102 --dry-run

ส่งผลงาน
  Nosana Builders Challenge: Agents 102  cm9nosana102
  ! Primary returned 4 rows but 1 were past-deadline or not open and were dropped — the symptom of SuperteamDAO/earn#1456 (live agent listings returned no open rows / past-deadline rows).

  verdict                 SHORTLIST score 59.18
  expected                $105.41 ($8.78/h)
  ส่งผลงานวันนี้              0 / 3

คำขอที่จะถูกส่งออกไปจริง

  POST https://superteam.fun/api/agents/submissions/create
  authorization: Bearer sk_...WXYZ
  content-type: application/json
  accept: application/json

  │ {
  │   "listingId": "cm9nosana102",
  │   "link": "https://github.com/example-operator/nosana-agent-102/releases/tag/v1.0.0",
  │   "tweet": "",
  │   "otherInfo": "What it does: routes Nosana job submissions to the cheapest healthy GPU node and writes a signed receipt for every dispatch, so a judge can replay any run from the receipt alone.\n\n...",
  │   "eligibilityAnswers": [
  │     {
  │       "question": "Project Title",
  │       "answer": "Nosana Cheapest-Node Router with Signed Receipts"
  │     },
  │     {
  │       "question": "What does your agent do, and how did you verify it works?",
  │       "answer": "It ranks the 12 live Nosana nodes by price per GPU-second and dispatches each job to the cheapest healthy one, writing a signed receipt. ..."
  │     }
  │   ],
  │   "ask": null,
  │   "telegram": "http://t.me/your_human_username"
  │ }

  ◎ โหมด --dry-run: ไม่ได้ส่งอะไรออกไป
```

> body ถูกพิมพ์ด้วย `JSON.stringify(body, null, 2)` ทุกครั้ง — วัตถุใน `eligibilityAnswers`
> จึงกางเป็นหลายบรรทัดเสมอ ไม่เคยถูกย่อเป็นบรรทัดเดียว ในบล็อกข้างบนมีแต่ค่าข้อความยาว ๆ
> ที่ถูกตัดกลางแล้วแทนด้วย `...` เท่านั้น

ถ้าด่านคุณภาพไม่ผ่าน — **ไม่มีทางข้าม**:

```
  ✗ ยังไม่ผ่าน 1 ข้อ — ยังส่งไม่ได้

  #6  The sponsor stated no criteria, so they were inferred from the brief. The README has to say that they were inferred.
      แก้ที่ฟิลด์: criteriaInferred

  → ส่วนที่เหลือเป็นหลักฐานที่มนุษย์ต้องกรอกเอง แก้ไฟล์นี้ตรง ๆ: /home/user/DWE/agent/drafts/cm9openinno.json

✗ ปฏิเสธ: ร่างไม่ผ่านการตรวจคุณภาพ 1 ข้อ

  ต้องทำต่อ:
    → ไม่มีตัวเลือกข้ามการตรวจ แก้ร่างแล้วรัน draft cm9openinno ใหม่
```

ถ้าไม่ใช่เทอร์มินัล และไม่ได้ใส่ `--yes` — ปฏิเสธ:

```
✗ ปฏิเสธ: ต้องยืนยันด้วยมนุษย์ แต่ไม่ได้อยู่ในเทอร์มินัลโต้ตอบ

  ต้องทำต่อ:
    → รันในเทอร์มินัลจริง หรือใส่ --yes (ข้ามการยืนยัน = คุณรับความเสี่ยงเอง)
```

ส่งสำเร็จ:

```
  ! ใช้ --yes: ข้ามการยืนยันของมนุษย์ตามที่ผู้ใช้สั่ง ความเสี่ยงอยู่ที่ผู้ใช้

ส่งสำเร็จ
  submissionId            sub_mock_7782
  สถานะ                   Pending
  ลิงก์                     https://github.com/example-operator/nosana-agent-102/releases/tag/v1.0.0

  ✓ บันทึกลงสมุดคุมแล้ว — listing นี้จะส่งซ้ำไม่ได้อีก
  เหลือโควตาวันนี้อีก 2 ครั้ง
```

ส่งซ้ำ listing เดิม:

```
✗ ปฏิเสธ: ส่ง listing นี้ไปแล้วเมื่อ 2026-09-19

  ต้องทำต่อ:
    → กฎหนึ่งผลงานต่อหนึ่ง listing แก้ของเดิมด้วย: node agent/bin/earn-agent.js update cm9nosana102
```

เต็มโควตารายวัน (ตัวอย่างนี้ตั้ง `--daily-cap 1`):

```
✗ ปฏิเสธ: ส่งครบโควตาวันนี้แล้ว (1/1)

  ต้องทำต่อ:
    → โควตารีเซ็ตเที่ยงคืนตามเวลาเครื่อง ปรับได้ด้วย: profile set --daily-cap N
```

### 3.8 `update <listingId>` — แก้ของที่ส่งไปแล้ว

เหมือน `submit` ทุกอย่าง แต่ยิง `POST /api/agents/submissions/update`
และต้องเคยส่ง listing นี้มาก่อน:

```
✗ ปฏิเสธ: ยังไม่เคยส่ง listing นี้ จึงไม่มีอะไรให้แก้

  ต้องทำต่อ:
    → ใช้คำสั่ง submit cm9steve01 แทน
```

`update` **ไม่กิน** โควตา create แต่มีเพดานของตัวเอง: แก้ listing เดียวได้ไม่เกิน `dailyCap` ครั้ง/วัน

### 3.9 `whoami` และ `claim`

```
$ node agent/bin/earn-agent.js whoami --check

ตัวตนของ agent
  ชื่อ                      dwe-earn-agent
  คีย์ API                  sk_...WXYZ
  รหัสเคลม                 clm_9f2a7b41c3de
  ลงทะเบียนเมื่อ             2026-09-19
  ไฟล์สถานะ                /home/user/DWE/agent/.earn-agent.json

โควตาการส่ง
  ส่งผลงานวันนี้              1 / 3
  เหลือวันนี้                 2
  ส่งผลงานสะสม             1

สถานะฝั่งเซิร์ฟเวอร์
  สถานะ                   ACTIVE
  รหัสเคลม                 ยังไม่มีมนุษย์เคลม — เงินรางวัลจะไปไหนไม่ได้จนกว่าจะเคลม
```

`--check` ยิง `GET /api/agents/status` เพื่อดูว่าคีย์ยังใช้ได้
`claim` พิมพ์รหัสเคลมและลิงก์ แล้ว**หยุด** — ไม่ทำอะไรต่อ

---

## 4. ตัวเลือกส่วนกลาง

| Flag | ผล |
|---|---|
| `--json` | ผลลัพธ์เป็น JSON ทุกคำสั่ง (คีย์ยังถูกปิดบัง) |
| `--dry-run` | พิมพ์ request ที่จะส่ง แล้วออก — ใช้ได้กับ `submit` และ `update` |
| `--yes`, `-y` | ข้ามการยืนยัน **ปิดอยู่โดยปริยาย** ความเสี่ยงของผู้ใช้ |
| `--base-url <u>` | ชี้ไปเซิร์ฟเวอร์อื่น (ใช้ทดสอบกับ mock) |
| `--fallback-base-url <u>` | ชี้ host ของทางสำรองชั้น 3–4 แยกจาก `--base-url` ค่าปริยายคือ `https://earn.superteam.fun` แต่ถ้าตั้ง `--base-url`/`EARN_BASE_URL` ไว้ ทางสำรองจะตามไปที่ host เดียวกันโดยอัตโนมัติ เพื่อไม่ให้การทดสอบกับ mock หลุดไปยิง production |
| `--lang th\|en` | ภาษา ค่าเริ่มต้น `th` อ่าน `EARN_LANG` ด้วย |
| `--no-color` | ปิดสี (`NO_COLOR` และ `TERM=dumb` ก็ได้ผลเหมือนกัน) |
| `--color` | **บังคับ**เปิดสี แม้ stdout ไม่ใช่ TTY (ใช้ตอน pipe เข้าตัวอ่านที่รองรับ ANSI) |
| `--timeout <ms>` | เวลารอสูงสุดต่อคำขอ |
| `--debug` | แสดง stack trace (คีย์ยังถูกปิดบังอยู่) |
| `--help`, `-h` | ความช่วยเหลือ — ใส่หลังชื่อคำสั่งเพื่อดูของคำสั่งนั้น |
| `--version` | พิมพ์ `earn-agent <version>` แล้วจบด้วยรหัส `0` |

> `--fallback-base-url`, `--color` และ `--version` **ไม่ได้อยู่ใน `--help` ของตัวเครื่องมือ**
> แต่มีอยู่จริงใน `OPTIONS` ของ `bin/earn-agent.js` และใช้งานได้ ตารางนี้คือที่เดียวที่บันทึกไว้

### ตัวเลือกเฉพาะคำสั่ง

| คำสั่ง | ตัวเลือก |
|---|---|
| `register` | `--name <n>` · `--force` |
| `whoami` | `--check` (ยิง `GET /api/agents/status`) |
| `listings` | `--take <n>` (1–50 เกินกว่านั้นถูกหั่นพร้อมแจ้ง) · `--cross-check` |
| `rank` | `--top <n>` (ค่าเริ่มต้น 10) · `--take <n>` · `--hours <n>` · **`--all`** (แสดงทุกแถวที่จัดอันดับได้ ไม่ตัดที่ `--top`) |
| `show <id>` | `--hours <n>` |
| `draft <id>` | `--hours <n>` |
| `submit <id>` / `update <id>` | `--dry-run` · `--yes` · `--hours <n>` |
| `profile set` | `--skills` `--edge` `--hours-per-week` `--video` `--on-camera` `--twitter-reach` `--regions` `--telegram` `--daily-cap` |
| `claim` | ไม่มี |

`--hours <n>` แทนที่ค่าประมาณชั่วโมงของรอบนั้นเท่านั้น ไม่ได้เขียนลงโปรไฟล์

**รหัสจบการทำงาน (ทดสอบแล้ว):** `0` สำเร็จ · `1` ผู้ใช้ผิด/ตรวจไม่ผ่าน · `2` เครือข่าย/API
ถ้า `submit`/`update` ยิงคำขอออกไปแล้วแต่อ่านคำตอบเป็นข้อมูลการส่งไม่ได้ (เช่น proxy หรือ CDN ตอบ 200 มาเป็น HTML)
จะจบด้วย `2` เช่นกัน พิมพ์ว่า *ส่งออกไปแล้ว แต่ยืนยันผลไม่ได้* และคงแถวในสมุดคุมไว้ — ห้ามยิงซ้ำ
ให้เปิดหน้า listing ตรวจเอง แล้วใช้คำสั่ง `update` แทน

**ตัวแปรสภาพแวดล้อม:** `EARN_AGENT_HOME` ย้ายที่เก็บ state ทั้งหมด (ใช้ตอนเทส
ทำให้รันเทสแล้วไม่ทับคีย์จริง) · `EARN_LANG` · `NO_COLOR`

---

## 5. กฎความปลอดภัยที่บังคับ **ในโค้ด** ไม่ใช่แค่เขียนไว้

ทุกข้อข้างล่างตรวจสอบได้เองด้วยการอ่านโค้ดตามบรรทัดที่ระบุ และทุกข้อถูกรันพิสูจน์แล้ว

| # | การรับประกัน | บังคับที่ไหน |
|---|---|---|
| 1 | **ไม่มีการส่งอัตโนมัติ** ทุก POST ที่สร้าง/แก้ผลงานต้องผ่านการยืนยันแบบโต้ตอบ ที่แสดง body จริงก่อน ถ้าไม่ใช่ TTY → ปฏิเสธ | `bin/earn-agent.js` `cmdSubmit()` หัวข้อ *Human confirmation* |
| 2 | **`--yes` ปิดอยู่โดยปริยาย** และพิมพ์คำเตือนว่าความเสี่ยงเป็นของผู้ใช้ | `cmdSubmit()` สาขา `flags.yes` |
| 3 | **1 submission ต่อ 1 listing ตลอดกาล** จองสิทธิ์ลง ledger **ก่อน** ยิง POST ภายใน lock ข้ามโปรเซส การรันพร้อมกันหลายตัวจึงผ่านด่านพร้อมกันไม่ได้ | `store.reserveSubmission()` + `cmdSubmit()` |
| 4 | **โควตารายวัน ค่าเริ่มต้น 3** (ปรับด้วย `profile set --daily-cap N` ซึ่งรับ 0–50; เพดาน 50 อยู่ที่ตัว flag เท่านั้น `profile edit` และการแก้ไฟล์ด้วยมือไม่ถูกจำกัด) ตรวจซ้ำใน lock เดียวกันตอนจะส่งจริง ไม่ใช่แค่ตอนเริ่ม รีเซ็ตเที่ยงคืนเวลาท้องถิ่น | `store.reserveSubmission()`, `store.submittedToday()` |
| 5 | **`update` มีเพดานแยก** — แก้ listing เดียวได้ไม่เกิน `dailyCap` ครั้ง/วัน | `cmdSubmit()` สาขา `mode === 'update'` |
| 6 | **ด่านคุณภาพ 13 ข้อ ไม่มี override** ผ่านต้อง 13/13 | `lib/rank.js` `qualityGate()` |
| 7 | **คีย์ไม่เคยถูกพิมพ์** ทุกไบต์ที่ออก stdout/stderr ผ่าน `scrub()` ซึ่งแทนคีย์จริงด้วย `sk_...last4` และแทน token `sk_` ที่หลุดมาด้วย `sk_[REDACTED]` — รวมถึงตอน `--json` และ `--debug` | `bin/earn-agent.js` ส่วนที่ 1 |
| 8 | **คีย์ไม่อยู่ใน URL** ส่งผ่าน `Authorization: Bearer` เท่านั้น | `lib/api.js` `authHeaders()` |
| 9 | **ไฟล์ state เป็น 0600** เขียนแบบ atomic (tmp + rename) ไฟล์เสียจะถูก backup ไม่ทับทิ้ง ไฟล์ backup และ tmp มีคีย์ดิบเหมือนกัน `.gitignore` จึงคลุม `agent/.earn-agent.json.*` ด้วย | `lib/store.js` `save()`, `.gitignore` |
| 10 | **`--dry-run` มีทุกคำสั่งที่เปลี่ยนสถานะ** และพิมพ์ method + URL + headers + body เป๊ะ ๆ | `client.describeSubmission()` |
| 11 | **ไม่ยิงซ้ำเมื่อโดน 429** พิมพ์เวลาที่ต้องรอแล้วหยุด | `cmdSubmit`/`printError` สาขา `status === 429`; `postSubmission` ตั้ง `retry: false` |
| 12 | **POST สร้าง/แก้ผลงานไม่เคย retry** เพราะ API ไม่มี Idempotency-Key การยิงซ้ำ create คือการสร้างของซ้ำ | `lib/api.js` `postSubmission()` |
| 13 | **ไม่แตะเงิน** ไม่มีโค้ดใดขอ private key, seed phrase หรือเรียก `/earn/claim/` | ทั้ง repo |

### สิ่งที่ข้อจำกัดเหล่านี้ **ป้องกันไม่ได้**

เขียนไว้ตรง ๆ เพราะตารางความปลอดภัยที่มีแต่ข้อดีคือใบโฆษณา ไม่ใช่เอกสาร

* **สมุดคุมอยู่ฝั่ง client และเป็นเพียงคำแนะนำ เซิร์ฟเวอร์คือผู้ชี้ขาด**
  ใครก็ตามที่ถือ API key แก้ `agent/.earn-agent.json` ด้วยมือ ล้าง `submissions[]` ทิ้ง
  แล้วเครื่องมือจะยอมสร้าง submission ที่สองให้กับ listing ที่เคยส่งไปแล้ว
  ไม่มี CLI ตัวไหนบนเครื่องผู้ใช้ที่ห้ามเรื่องนี้ได้ ตัวกันจริงคือ Earn API
  ซึ่งปฏิเสธของซ้ำด้วย `403` — และเครื่องมือนี้ไม่เคยยิง `403` ซ้ำจนกลายเป็นของซ้ำ

  มีสามอย่างที่จำกัดขอบเขตของช่องนี้ไว้ และทดสอบกับ mock server จริงแล้วทั้งสามข้อ:

  * ล้าง `submissions[]` แต่เก็บ `apiKey` ไว้ → ยิง POST เพิ่มได้จริง 1 ครั้ง
    เซิร์ฟเวอร์ตอบ `403`, CLI จบด้วยรหัส `2` และคืนการจองที่กันไว้กลับ
  * **ลบหรือทำไฟล์ state พัง = ทำลาย API key ไปด้วย** ทั้งสองทางจบที่
    `ยังไม่ได้ลงทะเบียน agent` รหัสจบ `1` และไม่มี HTTP request ออกเลย
    จะได้สมุดคุมเปล่า ๆ พร้อมคีย์ที่ยังใช้ได้ไปพร้อมกันไม่ได้
  * **คัดลอกไฟล์ไป `EARN_AGENT_HOME` ใหม่ = สมุดคุมตามไปด้วย** บ้านใหม่รายงาน
    ยอดส่งวันนี้และยอดสะสมเท่าเดิม ย้ายที่จึงไม่ใช่ทางเลี่ยงเช่นกัน
* **TTY พิสูจน์ได้แค่ว่ามีการโต้ตอบ ไม่ได้พิสูจน์ว่าเป็นมนุษย์**
  การยืนยันปฏิเสธ pipe และสภาพแวดล้อมที่ไม่ใช่ TTY ซึ่งหยุด `submit | tee` ที่เผลอพิมพ์
  และหยุด CI runner ทุกตัวได้จริง แต่หยุดคนที่ตั้งใจขับ prompt ด้วย `expect` หรือ `script` ไม่ได้
  ถึงจุดนั้นผู้ใช้ก็ทำสิ่งเดียวกับ `--yes` แค่อ้อมกว่า และรับความเสี่ยงก้อนเดียวกัน
* **ข้อ 1–11 ของด่านคุณภาพตรวจว่าหลักฐานถูก "บันทึก" ไม่ได้ตรวจว่ามันเป็น "ความจริง"**
  `linkCheck.status`, `runCheck.exitCode`, `tests.ci`, `secretScan.clean` และ `humanSignOff`
  ล้วนเป็นคำรับรองของผู้ใช้เอง ด่านนี้ทำให้การโกหกต้องจงใจและชัดแจ้ง แต่ทำให้เป็นไปไม่ได้ไม่ได้
  ส่วนที่วัดได้จากตัวร่างเอง — ความยาวเนื้อหา จำนวนคำที่ไม่ซ้ำ host ของลิงก์
  ความเก่าของการเช็กลิงก์และของลายเซ็นอนุมัติ — ถูก **วัดจริง** ไม่ได้เชื่อตามคำบอก
* **ผลที่เครือข่ายไม่เคยยืนยัน จะถูก "จองค้างไว้" ไม่ใช่ "ยิงซ้ำ"**
  ถ้า POST ของการส่งผลงานหมดเวลาหรือสายหลุด เครื่องมือจะเก็บแถวในสมุดคุมไว้
  พิมพ์ `ผลลัพธ์ไม่แน่ชัด` และปฏิเสธการ create ครั้งที่สองของ listing นั้น
  ให้เปิดหน้า listing ตรวจเอง แล้วใช้ `update` ถ้ามันเข้าไปแล้ว
  API ไม่มี Idempotency-Key การยิงซ้ำแบบมืด ๆ คือของซ้ำสาธารณะถาวร
* **การรันพร้อมกันถูกปฏิเสธ ไม่ได้เข้าคิว** `submit` ตัวที่สองที่เจอ lock ถูกถือไว้
  จะรอไม่เกิน **10 วินาที** แล้วปฏิเสธด้วย `ปฏิเสธ: มี earn-agent อีกตัวกำลังส่งผลงานอยู่`
  ส่วน lock ที่เก่ากว่า **2 นาที** จะถือว่าถูกทิ้งแล้วและถูกยึดไปใช้
* **ข้อความของด่านคุณภาพและเหตุผลรายแถวยังเป็นภาษาอังกฤษล้วน** แม้รันในโหมด `th`
  โครงหน้าจอเป็นไทย แต่เนื้อหาที่ต้องอ่านเพื่อแก้ร่างมาจาก `lib/rank.js` ซึ่งยังไม่มีตารางภาษา
  ผู้ปฏิบัติงานที่อ่านอังกฤษไม่คล่องจะเสียเปรียบตรงจุดนี้

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

> **สถานะของ issue (ตรวจแล้ว):** #1456 **ปิดไปแล้ว** ติดป้าย `duplicate`
> ชื่อเต็มคือ *"Agent API: `/api/agents/listings/live` returns no currently-open listings
> (omits an OPEN + AGENT_ALLOWED bounty, and defaults to past-deadline results)"*
> และในตัว source ที่อ่านมา (`7bf213b8`) บั๊กนี้ **แก้แล้ว** ด้วย commit `068eac1a`
> *"fixed deadline and filter params for live"* (2026-09-16) ซึ่ง `live.ts` ตอนนี้บังคับ
> `status: 'OPEN'` และ `deadline: { gte: ... }` แล้ว
> **ทางสำรองยังอยู่ เพราะ commit นั้นลงก่อน HEAD แค่หนึ่งวัน** และจากที่นี่พิสูจน์ไม่ได้ว่า
> production เสิร์ฟ build ไหนอยู่ ดู [ข้อจำกัด 7.1](#71-เรื่องใหญ่ที่สุด--ยังไม่เคยคุยกับ-api-จริงเลยสักไบต์)

**วิธีที่เครื่องมือนี้รับมือ** (4 ชั้น ไล่ลงมาอัตโนมัติ):

| ชั้น | endpoint | `source` ที่รายงาน |
|---|---|---|
| 1 | `GET {base}/api/agents/listings/live?take=N` | `agents-live` |
| 2 | `GET {base}/api/listings?context=agents&status=open&tab=all` | `fallback-filter` |
| 3 | `GET https://earn.superteam.fun/api/listings?context=agents&...` | `fallback-filter` |
| 4 | `GET https://earn.superteam.fun/api/listings?take=100` (ตามตัวอักษรใน issue) | `fallback-filter` |
| — | ลองครบทุกชั้นแล้วไม่พบ listing ที่ใช้ได้เลย | `none` |

`source` บอก "ผลลัพธ์มาจากทางไหน" ฉะนั้นมันมีความหมายก็ต่อเมื่อ *มี* ผลลัพธ์
ถ้าไล่ครบสี่ชั้นแล้วไม่ได้อะไรเลย คำตอบคือ `none` ไม่ใช่ `agents-live`
(เคยรายงานว่า `agents-live` ทั้งที่ endpoint นั้นเพิ่งพลาดไป — เป็นการอ้างที่มาที่ไม่จริง)

ทุกครั้งที่ตกไปชั้น 2–4 จะบอกเสมอว่ามาจากทางไหนและเพราะอะไร:

```
listing ที่ agent ส่งได้
  แหล่งข้อมูล: fallback-filter — ทางสำรองสาธารณะ (/api/listings) — เพราะ endpoint หลักมีบั๊ก #1456

  คำเตือนจากชั้นดึงข้อมูล:
    ! Primary GET /api/agents/listings/live returned 0 listings — the exact symptom of SuperteamDAO/earn#1456 (live agent listings returned no open rows / past-deadline rows). Falling back.
    ! Results came from the public fallback (https://superteam.fun/api/listings?context=agents), not the agent API. This path is cached up to 5 minutes (Cache-Control: private, max-age=300, stale-while-revalidate=600), so it may be slightly stale.
```

**ทำไมชั้น 2 ไม่ใช่สูตรใน issue ตรง ๆ:** วิธีที่ issue เขียนไว้
(`GET https://earn.superteam.fun/api/listings?take=100` แล้วกรอง
`agentAccess in ("AGENT_ALLOWED","AGENT_ONLY")` และ `status == "OPEN"` ฝั่ง client)
มีจุดบกพร่องสามอย่าง — **ทั้งสามข้อยืนยันแล้วจาก source** ที่ `7bf213b8`:

1. `take` ไม่อยู่ใน `QueryParamsSchema` (`src/features/listings/constants/schema.ts`) — zod ตัดทิ้ง
   และ `buildListingQuery` ใส่ `take` ให้เฉพาะ `context` เป็น `home`/`region` เท่านั้น
   ผลลัพธ์จึง **ไม่ถูกจำกัดจำนวน** จริง ๆ (ตัวเครื่องมือจำกัดเองฝั่ง client)
2. ค่าปริยาย `context=all` ทำให้ server บังคับ `agentAccess: { not: 'AGENT_ONLY' }`
   (`src/features/listings/utils/query-builder.ts` บรรทัด 171–174)
   → **listing AGENT_ONLY มองไม่เห็นเลย** ซึ่งเป็นกลุ่มที่โอกาสชนะดีที่สุด
3. ไม่มี `sponsor.isVerified` gate — เงื่อนไขนี้ถูกเติมเมื่อ `context === 'agents'` เท่านั้น
   → บางแถวจะ 404 ตอนดึงรายละเอียด

`context=agents` เป็นค่า enum ของ server เอง (`ListingContextSchema`) และแก้ทั้งสามข้อ
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
   → ไม่มีสัญญาณล่วงหน้า ต้องนับเอง: **60 ครั้ง (create+update รวมกัน) ต่อ agent ต่อ 1 ชั่วโมง**
   ตัวเลขนี้ **ยืนยันแล้วสองทาง**: `agentSubmitRateLimiter` ใน `src/lib/ratelimit.ts` คือ
   `Ratelimit.fixedWindow(60, '1 h')` ผูกกับ `agentId` และทั้ง `create.ts`/`update.ts` ใช้ limiter
   ตัวเดียวกัน ส่วน `public/skill.md` ก็ระบุตรงกันว่า *"Agent submissions (create + update):
   60 per agent per hour."* — และเป็น **fixed window ไม่ใช่ rolling window**
   โควตาจึงรีเซ็ตเป็นก้อนเมื่อหน้าต่างชั่วโมงเปลี่ยน ไม่ได้ค่อย ๆ คืนทีละครั้ง
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
14. ~~**รูป URL ของ listing** (`{base}/listing/{slug}`) เป็นการเดา~~
    **แก้แล้ว — เรื่องนี้ไม่ใช่การเดา และของเดิมผิด** ตรวจกับ source ที่ `7bf213b8` แล้วพบว่า
    หน้า listing สาธารณะคือ **`{base}/earn/listing/{slug}`**
    (`src/pages/earn/listing/[slug]/index.tsx`; `src/app/sitemap.ts` และ
    `src/app/api/spam-dispute/route.ts` ก็ประกอบ URL แบบเดียวกัน) และ `next.config.ts`
    **ไม่มี** redirect จาก `/listing/*` เลย รูปเดิมจึงเป็น 404
    `lib/api.js` `normaliseListing()` ถูกแก้ให้ประกอบ `/earn/listing/{slug}` แล้ว
    **ค่าคงที่ที่ยังเป็นการเดาจริง ๆ คือ host** (ดูข้อ 10) ไม่ใช่ path

### 7.3 ข้อจำกัดเชิงปฏิบัติอื่น ๆ

* ตัวเลขทุกตัวที่ engine พิมพ์เป็น**แบบจำลอง** ไม่ใช่คำทำนาย — `FIT` คือแบบจำลอง แต่ brief คือความจริง
  เปิดอ่าน brief เองทุกครั้งก่อนตัดสินใจลงแรง
* โควตารายวันนับตาม**เวลาท้องถิ่น**ของเครื่อง เปลี่ยน timezone แล้วผลเปลี่ยน
* ledger อยู่บนเครื่องนี้เท่านั้น — ถ้าย้ายเครื่องแล้วไม่ย้าย state ไฟล์
  เครื่องมือจะไม่รู้ว่าเคยส่งอะไรไปแล้ว และ**การป้องกันส่งซ้ำจะหายไป**
* `updatesToday` นับจากตัว ledger เอง ไม่ใช่จาก server
* **ภาษาไทยครอบได้แค่โครงหน้าจอ** — ข้อความของด่านคุณภาพ เหตุผลรายแถว
  และคำเตือนจากชั้นดึงข้อมูล มาจาก `lib/rank.js`/`lib/api.js` ซึ่งยังไม่มีตารางภาษา
  จึงเป็นอังกฤษล้วนในทั้งสองโหมด
* `--daily-cap` รับเฉพาะ**จำนวนเต็ม** 0–50 เท่านั้น ค่าอย่าง `2.7` จะถูก**ปฏิเสธ**
  ไม่ใช่ปัดลงเงียบ ๆ เพราะมันคือเพดานการส่งงาน — การเปลี่ยนค่าให้ต่างจากที่พิมพ์
  โดยไม่บอกคือการแก้กลไกความปลอดภัยลับหลังผู้ใช้

---

## 8. ความปลอดภัยของ `agent/.earn-agent.json` — อ่านให้จบ

ไฟล์นี้เก็บ **API key ที่ใช้งานได้จริง** และ **claim code** ซึ่งเป็นความลับทั้งคู่

* **สิทธิ์ `0600`** เจ้าของอ่าน/เขียนได้คนเดียว เขียนแบบ atomic ไฟล์เสียถูก backup ไม่ทับทิ้ง
  ตรวจได้: `ls -l agent/.earn-agent.json` → `-rw------- 1 <you> <you> … .earn-agent.json`
* **การคุ้มครองจาก `.gitignore` ถูก "ตรวจจริง" ไม่ใช่ "เชื่อเอา"**
  ทั้ง `agent/.earn-agent.json` และ `agent/drafts/` อยู่ใน `.gitignore` ของ repo นี้
  และคำสั่ง `register` กับ `whoami` จะอ่านจากดิสก์จริงทุกครั้ง ไม่ใช่พิมพ์ประโยคตายตัว:
  จะขึ้นว่า `อยู่ใน .gitignore ของ repo ที่ <root> แล้ว (ตรวจสอบแล้ว)` ก็ต่อเมื่อมีกฎตรงจริง ๆ
  ถ้า `EARN_AGENT_HOME` ย้ายไฟล์ไปไว้ใน git working tree ที่ไม่มีกฎครอบคลุม
  จะเตือนด้วยสีแดงพร้อมบอกบรรทัดที่ต้องเพิ่ม และถ้าอยู่นอก repo ก็จะบอกตรง ๆ
  แทนที่จะอ้างการคุ้มครองที่ไม่มีอยู่จริง
  ตรวจเองได้: `git check-ignore -v agent/.earn-agent.json`
* **ห้าม commit เด็ดขาด** ห้ามแปะใน issue, log, screenshot, prompt หรือ pastebin
  และห้ามใส่ใน URL
* **`claimCode` อันตรายพอ ๆ กับคีย์** ใครถือ code นี้ก็ผูกเงินรางวัลเข้ากระเป๋าตัวเองได้
* **ถ้าหลุด:** ไม่มี endpoint ออกคีย์ใหม่หรือ revoke ให้ในโค้ดสาธารณะ ให้ติดต่อ Superteam ทันที
  แล้วถือว่า agent ตัวนั้นถูกยึดไปแล้ว
* **backup ไฟล์นี้แบบเข้ารหัส** เพราะคีย์กับ claim code ถูกแสดงครั้งเดียว กู้ไม่ได้
  ทำหาย = ลงทะเบียนใหม่ทั้งตัว และได้ claim code ใหม่ด้วย
* `EARN_AGENT_HOME` ย้ายที่เก็บได้ — ถ้าย้ายออกนอก repo **ต้องดูแล backup เอง**
  และกฎ gitignore ของ repo นี้จะไม่คุ้มครองอีกต่อไป แต่เครื่องมือยังตรวจสิทธิ์ไฟล์
  และตรวจว่าที่ใหม่นั้นถูก git มองเห็นหรือไม่ แล้วเตือนให้เสมอ

---

## 9. รันเทส

```
$ node --test 'agent/test/*.test.js'
# pass 66
# fail 0
```

ตอนที่วัดล่าสุด: `rank.test.js` 41 เคส · `regression.test.js` 24 เคส ·
`api-store.test.js` เป็นเคสเดียวที่ห่อการตรวจภายในไว้ (`66 passed, 0 failed`)
รวมเป็น **66 เคสระดับบนสุด** — ตัวเลขนี้ขยับทุกครั้งที่มีคนเพิ่มเทส
**อย่าเชื่อตัวเลขในเอกสาร ให้รันคำสั่งข้างบนแล้วดูของจริง** ที่ต้องเป็นจริงเสมอคือ `# fail 0`

> **ข้อควรระวัง:** `node --test agent/test/` (ชี้ที่โฟลเดอร์) **พัง** ด้วย
> `Cannot find module '/home/user/DWE/agent/test'` ใช้รูปแบบ glob หรือระบุไฟล์ทีละไฟล์แทน
> และโปรดทราบว่า `node --test` ที่พังแบบนี้ยัง **จบด้วยรหัส 0** จึงต้องดูบรรทัด
> `# fail` เอง ไม่ใช่ดูแค่ exit code

---

## 10. แผนผังไฟล์

```
agent/
  bin/earn-agent.js        ตัว CLI — อ่าน argument, แสดงผล, ปิดบังความลับ, ด่านความปลอดภัยทั้งหมด
  lib/api.js               HTTP client, การค้นหา 4 ชั้น, การแปลงรูป listing, ApiError
  lib/rank.js              engine คิดคะแนนล้วน ๆ + ด่านคุณภาพ 13 ข้อ (ไม่มี I/O ไม่เคย throw)
  lib/store.js             เก็บคีย์ + สมุดคุม (0600, atomic, ปิดบังคีย์)
  test/                    ชุดเทส node:test ของทั้งสามไลบรารี
  package.json             {"type":"module"}, engines >=18, ไม่มี dependency
  .earn-agent.json         ความลับของคุณ — 0600, อยู่ใน .gitignore, ห้าม commit
  drafts/<listingId>.json  ร่างผลงาน — อยู่ใน .gitignore
docs/
  AGENT-PLAYBOOK.md        คู่มือปฏิบัติการสำหรับมนุษย์: วงรอบรายสัปดาห์ และสิ่งที่ห้ามทำ
```

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

> **Honesty note:** the output is copied verbatim except for three substitutions made so it
> reads as it will in real use: (1) the mock host (`http://127.0.0.1:8787`) is shown as the
> real default `https://superteam.fun`; (2) the state-file and draft paths (the runs used
> `EARN_AGENT_HOME` pointed at a scratch directory) are shown under the default
> `/home/user/DWE/agent/`; and (3) very long blocks are cut in the middle, always with a
> visible `...` line at the cut. Nothing is otherwise shortened or reflowed — including the
> column truncation and the masked key, which are exactly what the tool printed.

> **Output language:** the default is `th`, so the Thai half above shows real Thai output and
> these blocks were produced with `--lang en`. Either way, note that **only the screen
> furniture is translated** — quality-gate messages, the per-row reasons under `rank`/`show`,
> and the discovery-layer warnings come from `lib/rank.js` and `lib/api.js`, which have no
> message table and are **English-only in both languages.** The blocks below show it.

### 3.1 `register` — once, ever

```
$ node agent/bin/earn-agent.js register --name "dwe-earn-agent" --lang en

Agent registered
  Name                    dwe-earn-agent
  API key                 sk_...WXYZ (The API key is never printed anywhere — only as sk_...WXYZ)

  Key stored at /home/user/DWE/agent/.earn-agent.json
  mode 600, owner-only (verified on disk)
  covered by the .gitignore of the repo at /home/user/DWE (verified)

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
    → Pass --force to register a new one. The stored key and claim code are overwritten and cannot be recovered.
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

  Edit: node agent/bin/earn-agent.js profile set --hours-per-week 20 --skills "typescript,rust"
```

Flags: `--skills a,b` `--edge <n>` `--hours-per-week <n>` `--video true|false`
`--on-camera true|false` `--twitter-reach true|false` `--regions a,b` `--telegram <url>`
`--daily-cap <n>`. Or run `profile edit` for a guided prompt.

> `--daily-cap` accepts **0–50** through `profile set` and rejects anything outside it. That
> ceiling lives on the flag only: the interactive `profile edit` prompt and hand-editing
> `.earn-agent.json` are **not** bounded by 50.

### 3.3 `listings` — what is open, and **which endpoint answered**

```
$ node agent/bin/earn-agent.js listings --lang en

Agent-eligible listings
  Source: agents-live — the agent endpoint itself (/api/agents/listings/live)

  Discovery-layer warnings:
    ! Primary returned 4 rows but 1 were past-deadline or not open and were dropped — the symptom of SuperteamDAO/earn#1456 (live agent listings returned no open rows / past-deadline rows).

#  TITLE                               SPONSOR             POOL  ENTR  ACCESS         DEADLINE          ID
─  ──────────────────────────────────  ────────────────  ──────  ────  ─────────────  ────────────────  ────────────
1  Nosana Builders Challenge: Agents…  Nosana            $3,000    41  AGENT_ALLOWED  2026-09-28 (9d)   cm9nosana102
2  Steve Agent Arena                   Steve               $500     6  AGENT_ONLY     2026-09-24 (5d)   cm9steve01
3  Open Innovation Track               Solana Foundati…  $5,000    88  AGENT_ALLOWED  2026-10-10 (21d)  cm9openinno

  3 listing(s)
  Next: node agent/bin/earn-agent.js show <listingId>
```

The `Source:` line prints **every time**. See [the #1456 fallback](#6-the-1456-bug-and-the-fallback).

### 3.4 `rank` — the command to live in

```
$ node agent/bin/earn-agent.js rank --top 5 --lang en

Listings ranked by expected $/hour and odds of placing
  Source: agents-live — the agent endpoint itself (/api/agents/listings/live)

  Discovery-layer warnings:
    ! Primary returned 4 rows but 1 were past-deadline or not open and were dropped — the symptom of SuperteamDAO/earn#1456 (live agent listings returned no open rows / past-deadline rows).

#  TITLE                           SPONSOR           POOL  ENTR  $/ENTR  EST h  EXP $/h  RUNWAY  VERDICT    SCORE
─  ──────────────────────────────  ──────────────  ──────  ────  ──────  ─────  ───────  ──────  ─────────  ─────
1  Nosana Builders Challenge: Ag…  Nosana          $3,000    41     $73    12h    $8.78      9d  SHORTLIST  59.18
2  Steve Agent Arena               Steve             $500     6     $83    12h   $10.26      5d  SHORTLIST  57.58
3  Open Innovation Track           Solana Founda…  $5,000    88     $57    20h    $5.04     21d  SHORTLIST  50.79

  1. Nosana Builders Challenge: Agents 102  cm9nosana102
     · no build estimate anywhere — assuming 12h; put a real number on it before you commit
     · no skillEdge in the profile — using the honest baseline E=1.8
     · skill match on "backend" — E=1.8

...

  Columns: POOL=total prize, ENTR=entrants, $/ENTR=pool per entrant, EST h=estimated build hours, EXP $/h=expected dollars per hour, RUNWAY=time left to the deadline
  Verdicts: BUILD=start now, SHORTLIST=keep in play, WATCH=monitor, SKIP=do not enter
  Next: node agent/bin/earn-agent.js show <listingId>
```

Every row explains itself, and says **what it assumed**. The numbers above come from a local
mock, not from real listings — see [Limitations](#71-the-big-one).

> **Scores move with the clock.** The `RUNWAY` factor is computed from the time left to the
> deadline, so re-running the same command against the same listings twenty minutes later
> shifts a score in the hundredths (`57.58` → `57.56`). That is the model working, not
> instability — but it does mean every number printed here is a value as of the second it was
> captured.

### 3.5 `show <listingId>` — full detail and the eligibility questions

```
$ node agent/bin/earn-agent.js show cm9nosana102 --hours 16 --lang en

Listing detail

  Nosana Builders Challenge: Agents 102
  https://superteam.fun/earn/listing/nosana-builders-challenge-agents-102

  id                      cm9nosana102
  Sponsor                 Nosana
  Type                    bounty
  Skill                   Backend
  Agent access            AGENT_ALLOWED
  Status                  OPEN
  Region                  Global
  Pool                    $3,000
  Entrants                41
  Deadline                2026-09-28 (9d)

  Prizes by position:
    #1 1,000 USDC
    #2 750 USDC
    #3 450 USDC
    #4 200 USDC
    #5 100 USDC

Eligibility questions (every one must be answered)
  1. Project Title
  2. What does your agent do, and how did you verify it works?

Score
  verdict                 SHORTLIST  score 57.64 / band SHORTLIST
  expected                $105.41  ($6.59/h)
  fit / crowding          1 / 0.3692
  runway ok               yes

  Score breakdown:
    MONEY     0.21 w=0.3  ████
    FIT       1.00 w=0.22  ████████████████████
    CROWD     0.37 w=0.12  ███████
    RUNWAY    1.00 w=0.1  ████████████████████
    SPONSOR   0.35 w=0.1  ███████
    VERIFY    1.00 w=0.09  ████████████████████
    EXCL      0.35 w=0.07  ███████

  Top reasons:
    · no per-listing build estimate — using the profile default of 16h
    · no skillEdge in the profile — using the honest baseline E=1.8
    · skill match on "backend" — E=1.8
    · $3,000 pool, 41 entrants, ~16h at E=1.8 — 20.7% chance of placing, $105.41 expected, $6.59/h
    · published prizes cover only 83.3% of the pool — the rest is money nobody can win, and the model does not inflate it back

...

  What the tool assumed (verify these yourself before building):
    ! assumed-build-hours
    ! assumed-skill-edge
    ! assumed-sponsor
```

Accepts either the listing `id` or its `slug`. Note that the prizes print **one per line** —
the tool never packs them onto one row.

> **Listing permalink:** the tool builds `{base}/earn/listing/{slug}`, which is **verified in
> source** at `SuperteamDAO/earn@7bf213b8` (`src/pages/earn/listing/[slug]/index.tsx`, and the
> same shape in `src/app/sitemap.ts` and `src/app/api/spam-dispute/route.ts`). `next.config.ts`
> declares no redirect from `/listing/*`, so the shorter form 404s.

### 3.6 `draft <listingId>` — build it, then run the 13-item gate

In a real terminal it asks for the demo link, repo, telegram, hours, `otherInfo` and each
eligibility answer. Outside a TTY it scaffolds the file and checks only.

```
$ node agent/bin/earn-agent.js draft cm9nosana102 --lang en

Submission draft
  Nosana Builders Challenge: Agents 102  cm9nosana102

  Created a new draft at /home/user/DWE/agent/drafts/cm9nosana102.json
  ! Primary returned 4 rows but 1 were past-deadline or not open and were dropped — the symptom of SuperteamDAO/earn#1456 (live agent listings returned no open rows / past-deadline rows).
  Not an interactive terminal — scaffolding and checking only, no questions asked

  ✓ Draft saved to /home/user/DWE/agent/drafts/cm9nosana102.json

Quality gate
  ✗ 29 item(s) failing — not submittable yet

  #1  No brief-compliance matrix. Extract every explicit requirement from the brief into a numbered list and map each to a file path, route or URL.
      fix in: compliance[] { requirement, satisfiedBy }
  #2  Answer to "Project Title" is a placeholder ("").
      fix in: eligibilityAnswers[].answer
  #3  The demo link is not an absolute http(s) URL (empty)
      fix in: link
  #5  The README has not been read aloud and timed. Time it; do not estimate it.
      fix in: readme.readAloudSeconds
  #12 otherInfo has 0 characters of actual content (whitespace does not count); the minimum is 400. There is no such thing as reserving a slot.
      fix in: otherInfo
  #13 No human sign-off. The tool will not call /api/agents/submissions/create on items 1-12 alone.
      fix in: humanSignOff.approved

...

  → The rest is evidence only a human can record. Edit the file directly: /home/user/DWE/agent/drafts/cm9nosana102.json

  Warnings (do not block submission, but fix them):
  #10 The repo does not say whether it is public. Say so explicitly.
  #12 not a single number in the whole body — every adjective is supposed to have a number or a verifiable fact behind it
```

> **29 failures, not 29 items.** The gate has **13 items**; one item can report several
> failing lines (item #5 reports each missing README section separately). 29 is the number of
> *failing lines* an empty draft produces, not a number of items.

Several kinds of evidence (the live fetch of the demo link, the exit code of the run command,
the commit count, the sign-off) **only a human can record**. Edit the JSON and re-run `draft`.

### 3.7 `submit <listingId>` — four gates before a single byte leaves

Order of checks: **duplicate → daily cap → quality gate → show the request → human confirms.**
The first two run *before* the body is built or any network call is made.

```
$ node agent/bin/earn-agent.js submit cm9nosana102 --dry-run --lang en

Submit
  Nosana Builders Challenge: Agents 102  cm9nosana102
  ! Primary returned 4 rows but 1 were past-deadline or not open and were dropped — the symptom of SuperteamDAO/earn#1456 (live agent listings returned no open rows / past-deadline rows).

  verdict                 SHORTLIST score 59.18
  expected                $105.41 ($8.78/h)
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
  │   "otherInfo": "What it does: routes Nosana job submissions to the cheapest healthy GPU node and writes a signed receipt for every dispatch, so a judge can replay any run from the receipt alone.\n\n...",
  │   "eligibilityAnswers": [
  │     {
  │       "question": "Project Title",
  │       "answer": "Nosana Cheapest-Node Router with Signed Receipts"
  │     },
  │     {
  │       "question": "What does your agent do, and how did you verify it works?",
  │       "answer": "It ranks the 12 live Nosana nodes by price per GPU-second and dispatches each job to the cheapest healthy one, writing a signed receipt. ..."
  │     }
  │   ],
  │   "ask": null,
  │   "telegram": "http://t.me/your_human_username"
  │ }

  ◎ --dry-run: nothing was sent
```

> The body is always printed with `JSON.stringify(body, null, 2)`, so the objects inside
> `eligibilityAnswers` always expand across several lines — they are never collapsed onto one.
> The only edit in the block above is that the two long string values are cut and replaced
> with `...`.

A failing gate has **no override**:

```
  ✗ 1 item(s) failing — not submittable yet

  #6  The sponsor stated no criteria, so they were inferred from the brief. The README has to say that they were inferred.
      fix in: criteriaInferred

  → The rest is evidence only a human can record. Edit the file directly: /home/user/DWE/agent/drafts/cm9openinno.json

✗ REFUSED: the draft fails 1 quality-gate item(s)

  Next step:
    → There is no override. Fix the draft and re-run draft cm9openinno.
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
  submissionId            sub_mock_7782
  Status                  Pending
  Link                    https://github.com/example-operator/nosana-agent-102/releases/tag/v1.0.0

  ✓ Recorded in the ledger — this listing can never be submitted to again
  2 submission(s) left in today's cap
```

A second create for the same listing:

```
✗ REFUSED: already submitted to this listing on 2026-09-19

  Next step:
    → One submission per listing. Change the existing one with: node agent/bin/earn-agent.js update cm9nosana102
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

`--check` calls `GET /api/agents/status`. `claim` prints the code and the URL, and **stops**.

## 4. Global flags

| Flag | Effect |
|---|---|
| `--json` | Machine-readable output on every command (the key stays masked) |
| `--dry-run` | Print the request that would be sent and exit — on `submit` and `update` |
| `--yes`, `-y` | Skip the confirmation. **Off by default.** Operator-accepted risk |
| `--base-url <u>` | Point at another server (testing against a mock) |
| `--fallback-base-url <u>` | Host for discovery tiers 3–4, separately from `--base-url`. Defaults to `https://earn.superteam.fun`, but if `--base-url`/`EARN_BASE_URL` is set the fallback follows it to the same host, so a mock run can never leak to production |
| `--lang th\|en` | Language. Default `th`; `EARN_LANG` is honoured |
| `--no-color` | Disable colour (`NO_COLOR` and `TERM=dumb` work too) |
| `--color` | **Force** colour on even when stdout is not a TTY (piping into an ANSI-aware pager) |
| `--timeout <ms>` | Per-request timeout |
| `--debug` | Show stack traces (the key stays masked) |
| `--help`, `-h` | Help; put it after a command name for that command's help |
| `--version` | Print `earn-agent <version>` and exit `0` |

> `--fallback-base-url`, `--color` and `--version` are **absent from the tool's own `--help`
> output**, but they are real entries in `OPTIONS` in `bin/earn-agent.js` and they work. This
> table is the only place they are documented.

### Per-command flags

| Command | Flags |
|---|---|
| `register` | `--name <n>` · `--force` |
| `whoami` | `--check` (calls `GET /api/agents/status`) |
| `listings` | `--take <n>` (1–50; above 50 it is clamped and says so) · `--cross-check` |
| `rank` | `--top <n>` (default 10) · `--take <n>` · `--hours <n>` · **`--all`** (print every ranked row instead of stopping at `--top`) |
| `show <id>` | `--hours <n>` |
| `draft <id>` | `--hours <n>` |
| `submit <id>` / `update <id>` | `--dry-run` · `--yes` · `--hours <n>` |
| `profile set` | `--skills` `--edge` `--hours-per-week` `--video` `--on-camera` `--twitter-reach` `--regions` `--telegram` `--daily-cap` |
| `claim` | none |

`--hours <n>` overrides the build estimate for that run only; it is not written to the profile.

**Exit codes (verified by running them):** `0` success · `1` user/validation error ·
`2` network/API error. A `submit`/`update` whose POST left the machine but whose answer could
not be read as a submission row (a proxy or CDN answering 200 with HTML) also exits `2`, prints
*Sent, but the result could NOT be confirmed*, and keeps the ledger row — never re-send it,
check the listing page and use `update`.

**Environment:** `EARN_AGENT_HOME` relocates all state (the test suite uses it so a run can
never clobber real credentials) · `EARN_LANG` · `NO_COLOR`.

## 5. Safety rules enforced **in code**

Each row is a guarantee you can verify by reading the named code. Each was also exercised
against a mock server.

| # | Guarantee | Enforced in |
|---|---|---|
| 1 | **Never auto-submits.** Every mutating POST needs an interactive confirmation that shows the exact body first. Not a TTY → refused | `bin/earn-agent.js` `cmdSubmit()`, *Human confirmation* |
| 2 | **`--yes` is off by default** and prints a warning naming the operator as the risk holder | `cmdSubmit()`, `flags.yes` branch |
| 3 | **One submission per listing, ever.** The slot is claimed in the ledger *before* the POST, inside a cross-process lock, so parallel runs cannot both pass the check | `store.reserveSubmission()` + `cmdSubmit()` |
| 4 | **Daily cap, default 3** (`profile set --daily-cap N` accepts 0–50; that ceiling is on the flag only — `profile edit` and hand-editing the file are unbounded). Re-checked inside the same lock at send time, not only at start-up. Resets at local midnight | `store.reserveSubmission()`, `store.submittedToday()` |
| 5 | **Updates have their own ceiling** — `dailyCap` rewrites of one listing per day | `cmdSubmit()`, `mode === 'update'` |
| 6 | **13-item quality gate, no override.** Pass means 13/13 | `lib/rank.js` `qualityGate()` |
| 7 | **The key is never printed.** Every byte to stdout/stderr passes `scrub()`, which replaces the live key with `sk_...last4` and any stray `sk_` token with `sk_[REDACTED]` — including under `--json` and `--debug` | `bin/earn-agent.js` section 1 |
| 8 | **The key is never in a URL** — `Authorization: Bearer` only | `lib/api.js` `authHeaders()` |
| 9 | **State file is 0600**, written atomically (tmp + rename); a corrupt file is backed up, never silently overwritten. The backup and the write temp file hold the same cleartext key, so `.gitignore` covers `agent/.earn-agent.json.*` too | `lib/store.js` `save()`, `.gitignore` |
| 10 | **`--dry-run` on every mutating command**, printing exact method, URL, headers and body | `client.describeSubmission()` |
| 11 | **A 429 is never retried automatically.** It prints how long to wait and stops | `printError()` `status === 429`; `postSubmission` sets `retry: false` |
| 12 | **Submission POSTs are never retried** — the API has no Idempotency-Key, so a retried create is a duplicate | `lib/api.js` `postSubmission()` |
| 13 | **Never touches money.** No code requests a private key or seed phrase, or calls `/earn/claim/` | whole repo |

### What these limits do NOT protect against

Stated plainly, because a safety table that only lists wins is a marketing document.

* **The ledger is client-side and advisory. The server is authoritative.** Anyone holding
  the API key can hand-edit `agent/.earn-agent.json`, empty `submissions[]`, and the tool
  will offer to create a second submission for a listing it already answered. Nothing a
  local CLI does can prevent that. The real backstop is the Earn API, which refuses a
  duplicate with a 403 — and this tool never retries a 403 into one.

  Three things bound that hole, and all three were reproduced against a mock server:

  * Wiping `submissions[]` while keeping `apiKey` **does** send one extra POST. The server
    answers `403`, the CLI exits `2`, and the reservation it took is released again.
  * **Deleting or corrupting the state file destroys the API key with it.** Both attacks
    end at `No agent registered — there is no API key on this machine`, exit `1`, with
    zero HTTP requests made. A blank ledger and a working key do not come free together.
  * **Copying the file to a fresh `EARN_AGENT_HOME` carries the ledger along.** The new
    home reports the same `Submissions today` and `Submissions total`, so relocating is
    not an evasion either.
* **A TTY proves interactivity, not humanity.** The confirmation refuses a pipe and a
  non-TTY environment, which stops the accidental `submit | tee` and every CI runner. It
  does not stop someone who deliberately drives the prompt with `expect` or `script`.
  At that point the operator has done the same thing `--yes` does, with extra steps, and
  owns the same risk.
* **Items 1-11 of the gate check that evidence was RECORDED, not that it is TRUE.**
  `linkCheck.status`, `runCheck.exitCode`, `tests.ci`, `secretScan.clean` and
  `humanSignOff` are all operator attestations. The gate makes lying deliberate and
  explicit rather than accidental; it cannot make it impossible. Items that can be
  measured from the draft itself — content length, distinct words, link host, staleness
  of the link check and of the sign-off — are measured, not taken on trust.
* **An outcome the network never confirmed stays reserved, not retried.** If a submission
  POST times out or the connection drops, the tool keeps the ledger slot, prints
  `UNKNOWN OUTCOME`, and refuses a second create for that listing. Check the listing page
  and use `update` if it went through. The API has no Idempotency-Key, so a blind retry
  is a permanent public duplicate.
* **Parallel runs are refused, not queued.** A second `submit` that finds the lock held
  waits up to 10 seconds and then refuses with `REFUSED: another earn-agent process is
  already mid-submission`. A lock older than 2 minutes is treated as abandoned and stolen.
* **The Thai localisation stops at the chrome.** Running in `th` translates headings, labels
  and refusals, but every quality-gate message and every per-row ranking reason is generated
  in `lib/rank.js` and is **English-only**. An operator who reads English poorly is worst
  served exactly where the tool is most prescriptive — the list of what to fix in the draft.

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

> **Issue status (checked):** #1456 is **closed**, labelled `duplicate`. Its full title is
> *"Agent API: `/api/agents/listings/live` returns no currently-open listings (omits an
> OPEN + AGENT_ALLOWED bounty, and defaults to past-deadline results)"*, and in the source
> this tool was written against (`7bf213b8`) the bug is **already fixed** by commit
> `068eac1a` *"fixed deadline and filter params for live"* (2026-09-16): `live.ts` now forces
> `status: 'OPEN'` and `deadline: { gte: ... }`.
> **The fallback stays anyway**, because that commit landed one day before HEAD and nothing
> here can prove which build production serves. See [7.1](#71-the-big-one).

**How this tool handles it** — four tiers, descended automatically:

| Tier | Endpoint | Reported `source` |
|---|---|---|
| 1 | `GET {base}/api/agents/listings/live?take=N` | `agents-live` |
| 2 | `GET {base}/api/listings?context=agents&status=open&tab=all` | `fallback-filter` |
| 3 | `GET https://earn.superteam.fun/api/listings?context=agents&…` | `fallback-filter` |
| 4 | `GET https://earn.superteam.fun/api/listings?take=100` (the issue's literal text) | `fallback-filter` |
| — | every tier walked, nothing eligible anywhere | `none` |

`source` names the path the **results** came from, so it only means anything when
there are results. When all four tiers come back empty the answer is `none`, not
`agents-live`: reporting the agent endpoint there credited a path that had just
failed, printing "Source: agents-live — the agent endpoint itself" directly above
warnings saying it had hit #1456 and three fallbacks had been tried.

Whenever it descends, it says so and why:

```
Agent-eligible listings
  Source: fallback-filter — the public fallback (/api/listings) — because the primary hit bug #1456

  Discovery-layer warnings:
    ! Primary GET /api/agents/listings/live returned 0 listings — the exact symptom of SuperteamDAO/earn#1456 (live agent listings returned no open rows / past-deadline rows). Falling back.
    ! Results came from the public fallback (https://superteam.fun/api/listings?context=agents), not the agent API. This path is cached up to 5 minutes (Cache-Control: private, max-age=300, stale-while-revalidate=600), so it may be slightly stale.
```

**Why tier 2 is not the issue's literal recipe.** The workaround as written in the issue is
`GET https://earn.superteam.fun/api/listings?take=100`, then filter client-side on
`agentAccess in ("AGENT_ALLOWED","AGENT_ONLY")` and `status == "OPEN"`. It has three defects,
**all three confirmed in source** at `7bf213b8`:

1. `take` is not in `QueryParamsSchema` (`src/features/listings/constants/schema.ts`) — zod
   strips it, and `buildListingQuery` only supplies a `take` when `context` is `home` or
   `region`. So the response really is **unbounded**, not 100. The client caps it locally.
2. With the default `context=all` the server applies `agentAccess: { not: 'AGENT_ONLY' }`
   (`src/features/listings/utils/query-builder.ts`, lines 171–174), so the issue's own filter
   **can never match an AGENT_ONLY row** — it silently drops exactly the agent-exclusive
   listings it exists to rescue, and those are where the odds are best.
3. It omits the `sponsor.isVerified` gate, which the server adds only when
   `context === 'agents'`, so it can surface rows whose details endpoint 404s.

`context=agents` is a first-class enum value on the server (`ListingContextSchema`) and fixes
all three. Tier 4 keeps the literal recipe as a last resort, and when it is used it warns
loudly that the result is **incomplete**.

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
   create+update per agent per one-hour window.** That number is **confirmed twice**:
   `agentSubmitRateLimiter` in `src/lib/ratelimit.ts` is `Ratelimit.fixedWindow(60, '1 h')`
   keyed on `agentId`, and both `create.ts` and `update.ts` pass that same limiter; and
   `public/skill.md` states *"Agent submissions (create + update): 60 per agent per hour."*
   It is a **fixed window, not a rolling one** — the budget resets in a block when the hour
   rolls over rather than trickling back request by request. (A CDN in front of the app could
   add its own headers; that is invisible from source.)
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
14. ~~**The public listing permalink shape** (`{base}/listing/{slug}`) is an assumption.~~
    **Corrected — this was not an assumption, and the old shape was wrong.** Checked against
    source at `7bf213b8`: the public listing page is **`{base}/earn/listing/{slug}`**
    (`src/pages/earn/listing/[slug]/index.tsx`; `src/app/sitemap.ts` and
    `src/app/api/spam-dispute/route.ts` build the same URL), and `next.config.ts` declares
    **no** redirect from `/listing/*`, so the old shape was a 404 on every `show` and in every
    `--json` payload. `normaliseListing()` in `lib/api.js` now builds `/earn/listing/{slug}`.
    **What is still genuinely assumed is the host** (item 10), not the path.

### 7.3 Other practical limits

* Every number the engine prints is a **model, not a prediction.** `FIT` is a model; the
  brief is the truth. Open the brief yourself before spending a weekend.
* The daily cap uses the machine's **local time.** Change timezone and the boundary moves.
* The ledger is local to this machine. Move machines without moving the state file and the
  tool no longer knows what you submitted — **the duplicate protection is gone.**
* `updatesToday` is counted from the local ledger, not from the server.
* **Thai only reaches the screen furniture.** Quality-gate messages, per-row reasons and
  discovery-layer warnings come from `lib/rank.js` and `lib/api.js`, which carry no message
  table, so they are English in both language modes.
* `--daily-cap` takes a **whole number** in 0–50. A fractional value such as `2.7` is
  **refused**, not rounded down: it is a submission rate limit, and quietly storing a
  different number than the operator typed changes a safety control behind their back.

## 8. Security note: `agent/.earn-agent.json`

This file holds a **live API key** and the **claim code**. Both are secrets.

* **Mode `0600`**, owner-only, written atomically; a corrupt file is backed up rather than
  overwritten. Check it: `ls -l agent/.earn-agent.json` → `-rw------- 1 <you> <you> …`
* **Gitignore coverage is checked, not assumed.** `agent/.earn-agent.json` and
  `agent/drafts/` are covered by this repo's `.gitignore`, and `register` and `whoami`
  both re-read that from disk rather than asserting it: they print `covered by the
  .gitignore of the repo at <root> (verified)` only when a rule really matches. If
  `EARN_AGENT_HOME` has moved the file somewhere inside a git working tree that nothing
  ignores, they say so in red and give you the line to add. Outside any repository they
  say that instead of claiming a protection that does not exist.
  Check it yourself: `git check-ignore -v agent/.earn-agent.json`
* **Never commit it.** Never paste it into an issue, a log, a screenshot, a prompt or a
  pastebin, and never put it in a URL.
* **The `claimCode` is as dangerous as the key** — whoever holds it can bind the payouts to
  their own wallet.
* **If it leaks:** there is no reissue or revoke endpoint in the public codebase. Contact
  Superteam immediately and treat that agent identity as compromised.
* **Back it up, encrypted.** The key and claim code are shown once and are unrecoverable;
  losing the file means registering a brand-new agent and getting a new claim code with it.
* `EARN_AGENT_HOME` relocates the state. Move it outside the repo and **you own the
  backups** — this repo's gitignore rules no longer protect it. The tool still verifies
  the mode and the git exposure of wherever you moved it, and still warns.

## 9. Tests

```
$ node --test 'agent/test/*.test.js'
# pass 66
# fail 0
```

At the last measurement: `rank.test.js` 41 cases, `regression.test.js` 24 cases, and
`api-store.test.js` a single case wrapping its internal checks (`66 passed, 0 failed`) — 66
top-level cases in total. **That number moves every time somebody adds a test, so do not
trust the one printed here: run the command and read the real output.** The line that must
always hold is `# fail 0`.

> **Gotcha:** `node --test agent/test/` (pointing at the directory) **fails** with
> `Cannot find module '/home/user/DWE/agent/test'`. Use the glob form, or name the files.
> Note also that this failure still **exits 0**, so check the `# fail` line rather than the
> exit code.

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
