# Bounty Heat Board

กระดานงานแบบออฟไลน์ที่ให้คะแนน "ความแออัด" ของแต่ละ bounty บน Superteam Earn ก่อนคุณจะทุ่มเวลาทั้งสุดสัปดาห์ลงไป
An offline board that scores how crowded each Superteam Earn listing is *before* you spend a weekend on it.

**ภาษา / Language:** [ไทย](#thai) · [English](#english)

---

> ## ⚠️ คำชี้แจง / Disclaimer
>
> **ไทย —** นี่คือโปรเจกต์ **อิสระ ไม่เป็นทางการ** ที่ทำขึ้นเพื่อสำรวจโอกาสบน Superteam Earn
> **ไม่ได้สังกัด ไม่ได้รับการรับรอง และไม่ได้ดำเนินการโดย Superteam หรือ Solana Foundation**
> ข้อมูลงานที่ฝังมาในแอปเป็น **สแนปช็อตที่สร้างด้วยมือ ลงวันที่ 2026-09-19** ไม่ใช่ฟีดสด
> แหล่งข้อมูลจริงมีที่เดียวคือ <https://superteam.fun/earn> — ก่อนส่งงานทุกครั้งให้เปิดหน้าประกาศจริงเช็กเงื่อนไข เงินรางวัล และเส้นตายเสมอ
> เอกสารนี้และแอปนี้ **ไม่การันตีรายได้ใด ๆ** และไม่มีลิงก์ชวนสมัคร (referral) แฝงอยู่
>
> **English —** This is an **independent, unofficial** companion app for exploring Superteam Earn opportunities.
> It is **not affiliated with, endorsed by, or operated by Superteam or the Solana Foundation.**
> The bundled listings are a **hand-built seeded snapshot dated 2026-09-19**, not a live feed.
> The single source of truth is <https://superteam.fun/earn> — always open the real listing page to confirm the brief, the reward and the deadline before you submit.
> Neither this document nor the app promises any income, and there are no referral links anywhere in it.

---

<a id="thai"></a>

# 🇹🇭 ไทย

## เริ่มตรงนี้

ถ้าคุณเพิ่งเจอ Superteam Earn และอยากรู้ว่าควรเริ่มยังไง — **อ่าน [PLAYBOOK.md](PLAYBOOK.md) ก่อน** แล้วค่อยเปิดแอป
คู่มือนั้นมี 6 ขั้นตอนเริ่มต้น, 10 วิธีที่ใช้ได้จริง, 8 ข้อผิดพลาดที่เจอบ่อย และ FAQ 8 ข้อ ทั้งไทยและอังกฤษ
เนื้อหาชุดเดียวกันนี้ถูกเรนเดอร์อยู่ในหน้าเว็บด้วย (ส่วน "คู่มือ") โดยอ่านจาก `assets/js/playbook.js`

## วิธีรัน

แอปนี้ **ไม่ต้อง build ไม่ต้อง npm install ไม่ต้องต่อเน็ต** เป็น HTML + CSS + JavaScript ธรรมดาล้วน ๆ

**วิธีที่ 1 — ดับเบิลคลิก**

```
เปิดไฟล์ index.html ด้วยเบราว์เซอร์ได้เลย (โปรโตคอล file://)
```

ทุกฟีเจอร์ทำงานครบ ยกเว้นปุ่ม "ลองดึงข้อมูลสด" ที่เบราว์เซอร์จะบล็อกเสมอบน `file://` (แอปจะบอกเหตุผลให้เอง แล้วใช้สแนปช็อตต่อ)

**วิธีที่ 2 — เสิร์ฟผ่าน HTTP (ถ้าอยากให้ปุ่มข้อมูลสดมีโอกาสทำงาน)**

```bash
cd /home/user/DWE
python3 -m http.server 8000
# แล้วเปิด http://localhost:8000
```

ต่อให้เสิร์ฟผ่าน HTTP แล้ว ปุ่มข้อมูลสดก็ยังอาจถูก CORS บล็อกอยู่ดี — ดูหัวข้อ [ข้อจำกัด](#limitations-th)

## ฟีเจอร์

**สองอย่างนี้คือเหตุผลที่แอปนี้มีอยู่:**

- **เรียงตาม EV ต่อชั่วโมง (ค่าเริ่มต้น)** — กระดานเปิดมาเรียงด้วย "เงินที่คาดว่าจะได้ต่อชั่วโมงที่ลงแรง" ไม่ใช่เรียงตามเงินรางวัลก้อนโต
  bounty $10,000 ที่มีคนส่ง 300 คน แพ้ bounty $2,000 ที่มีคนส่ง 12 คน แบบไม่เห็นฝุ่น และการเรียงแบบนี้บอกคุณตรง ๆ ว่า **งานไหนคุ้มเวลาคุณ**
- **แถบความแออัด (competition heat) 5 ระดับ** — ทุกการ์ดมีแถบวัดว่าสนามนี้แน่นแค่ไหน (โล่ง / เริ่มมีคน / คึกคัก / แน่น / เดือด)
  พร้อมตัวเลขคาดการณ์ว่าถึงวันปิดจะมีคนส่งกี่คน และบอกด้วยว่าคนไหลเข้าเร็วหรือช้ากว่าค่ากลางของสกิลนั้น

**ที่เหลือ:**

- เครื่องคำนวณค่าคาดหวัง (EV) แบบปรับตัวเลขเองได้ พร้อมรายการ "งานคุ้มที่สุดตอนนี้" 5 อันดับ และปุ่มยัดตัวเลขจากการ์ดเข้าเครื่องคำนวณในคลิกเดียว
- ตัวกรอง: แท็บประเภท (บาวน์ตี้ / โปรเจกต์ / ทุน), ค้นหา (หน่วงเวลาพิมพ์), สกิล 6 หมวด, เงินรางวัลขั้นต่ำ ($500+ / $1,000+ / $5,000+), region, ระดับความยาก, สถานะ, สกุลเงิน และสวิตช์ "ซ่อนงานที่คนแย่งเยอะ"
- 4 วิธีเรียง: EV ต่อชั่วโมง / เงินรางวัลสูงสุด / ใกล้ปิดรับ / ลงใหม่ล่าสุด
- นับถอยหลังถึงเส้นตายแบบสด ๆ ในแต่ละการ์ด
- สองภาษา ไทย (ค่าเริ่มต้น) และอังกฤษ สลับได้ทั้งหน้า รวมถึงป้ายในเครื่องคำนวณ
- ธีมสว่าง / ตามระบบ / มืด จำค่าไว้ใน `localStorage` (คีย์ `bh.theme`, `bh.lang`)
- สถานะตัวกรองเก็บใน URL hash → ก็อปลิงก์ส่งให้เพื่อนได้เลย เช่น `#skills=development&crowded=hide`
- คู่มือฉบับเต็มเรนเดอร์อยู่ในหน้าเดียวกัน
- แผ่นตัวกรองแบบ bottom sheet บนจอมือถือ, ลิงก์ข้ามไปเนื้อหา, `aria-label` ครบ, เคารพ `prefers-reduced-motion`
- ปุ่มดึงข้อมูลสด (best-effort — ดูข้อจำกัด)

## โมเดล EV ทำงานยังไง

> **นี่คือโมเดล ไม่ใช่การทำนาย** ตัวเลขทุกตัวที่ออกมาคือผลของสมมติฐานที่คุณใส่เข้าไปเอง
> มันไม่รู้ว่ากรรมการชอบอะไร ไม่รู้ว่าสปอนเซอร์เคยเลือกใคร และไม่รู้ว่างานคุณดีแค่ไหนจริง ๆ
> ใช้มันเพื่อ **เปรียบเทียบงานสองชิ้น** ไม่ใช่เพื่อเชื่อว่าคุณจะได้เงินเท่านั้นจริง ๆ

คณิตศาสตร์ทั้งหมดอยู่ใน `assets/js/calculator.js` ฟังก์ชัน `computeEV()` ใช้โมเดล **Plackett–Luce** (โมเดลการจัดอันดับ) ไม่ใช่การเดา

กำหนดให้

- `n` = จำนวนคนในสนามรวมตัวคุณ = `max(1, submissions)`
- `e` = "ฝีมือคุณเหนือคนทั่วไปกี่เท่า" (skillEdge) บีบอยู่ในช่วง 0.5–5
- มองสนามเป็น: คุณ 1 คนน้ำหนัก `e` + คู่แข่ง `n − 1` คน คนละน้ำหนัก 1

**โอกาสได้ที่ 1**

```
winProb = e / (e + (n − 1))
```

**โอกาสติดรางวัลอันดับถัด ๆ ไป** — ถ้าคุณไม่ได้ที่ 1 แปลว่ามีคู่แข่ง 1 คนออกจากสนามไปแล้ว สนามจึงเล็กลงเรื่อย ๆ
โอกาสถูกเรียกชื่อที่อันดับ `i+1` (โดยที่ยังไม่ถูกเรียกมาก่อน) คือ

```
h_i = e / (e + (n − 1) − i)
P(ได้อันดับ i+1) = h_i × ∏(1 − h_j)  สำหรับทุก j < i
podiumProb       = ผลรวมของ P(ได้อันดับ i+1) ทุกอันดับที่มีรางวัล
```

จุดสำคัญ: โค้ด **ไม่** ใช้สูตรลวก ๆ อย่าง `1 − (1 − winProb)^k` เพราะแต่ละอันดับไม่ได้เป็นอิสระต่อกัน — สนามหดลงทุกครั้งที่มีคนได้รางวัล
และถ้าคนส่งน้อยกว่าจำนวนอันดับที่จ่าย (เช่นจ่าย 5 อันดับ แต่มีคนส่ง 3 คน) โมเดลจะจ่ายแค่ 3 อันดับ เงินที่เหลือคือเงินที่ไม่มีใครได้ ไม่ใช่บั๊ก

**เงิน**

```
expectedUsd     = Σ P(ได้อันดับ i+1) × prizeUsd × podiumSplit[i]
expectedPerHour = expectedUsd / max(hours, 0.25)
breakEvenRate   = expectedPerHour
```

`breakEvenRate` อ่านเป็นภาษาคนว่า **"คุณกำลังเสนอขายเวลาตัวเองชั่วโมงละเท่านี้"** ถ้าค่าแรงจริงของคุณสูงกว่านี้ ก็ไม่ควรรับงานนี้

**คำตัดสิน (verdict)** — เป็นความเห็น ไม่ใช่ข้อเท็จจริง โค้ดเขียนไว้ตรง ๆ ว่าเกณฑ์นี้ตั้งมาจากมุมของฟรีแลนซ์รีโมตที่ทำงานได้ระดับหนึ่ง

| ค่าคาดหวังต่อชั่วโมง | คำตัดสิน |
| --- | --- |
| ≥ $50 | คุ้มมาก |
| ≥ $20 | คุ้ม |
| ≥ $8 | ก้ำกึ่ง |
| ต่ำกว่านั้น | ข้ามไปเถอะ |

คนที่เพิ่งเริ่มสร้างพอร์ตควรอ่านเลื่อนลงหนึ่งขั้น ส่วนคนที่มีงานประจำคิดชั่วโมงละ $120 ควรเลื่อนขึ้นหนึ่งขั้น

**สมมติฐานที่โมเดลนี้แบกไว้ (พูดให้ชัด)**

1. กรรมการเลือกงานแบบสุ่มตามน้ำหนักฝีมือ — ในความจริงกรรมการมีรสนิยม มีคนที่รู้จักอยู่แล้ว และมีอคติ
2. `skillEdge` คือตัวเลขที่ **คุณเดาเอง** ถ้าเข้าข้างตัวเอง ผลลัพธ์ก็เข้าข้างคุณตามไปด้วย
3. ทุกคนที่ส่งงานถูกนับเท่ากัน ทั้งคนที่ทำจริงจังและคนที่ส่งขอไปที
4. จำนวนคนส่งในสแนปช็อตนี้เป็นตัวแทนของสถานการณ์จริง ไม่ใช่ตัวเลขสด
5. เวลาที่ใช้ (`hours`) คือค่ากลางที่ประเมินไว้ ไม่ใช่เวลาจริงของคุณ
6. หารด้วยขั้นต่ำ 15 นาทีเสมอ เพื่อไม่ให้ตัวเลข "ต่อชั่วโมง" ระเบิดเมื่อใส่ 0 ชั่วโมง

`computeEV()` **ไม่มีทาง throw และไม่มีทางคืน NaN** — ค่าติดลบ ศูนย์ สตริง null ถูกบีบเข้ากรอบหมด

### การเรียงกระดานด้วย EV

`rankListings(listings, profile)` ใน `calculator.js` คือสิ่งที่กระดานเรียกใช้จริง

- คิดเฉพาะงานที่ `status === 'open'` เท่านั้น
- สัดส่วนรางวัลคำนวณจาก `listing.prizes` หารด้วย **ขนาด pool** ไม่ใช่หารด้วยผลรวมของรางวัลที่ประกาศ — ถ้าสปอนเซอร์โฆษณา $5,000 แต่ประกาศรางวัลรวมแค่ $4,000 ส่วนต่าง $1,000 คือเงินที่คุณชนะไม่ได้ สัดส่วนจึงรวมกันได้ 0.8 ไม่ใช่ถูกปั๊มกลับเป็น 1
- ถ้าสกิลของงานตรงกับสกิลที่คุณกรองอยู่ `skillEdge` จะถูกคูณ 1.25 (เป็นความเห็น: รู้เรื่องในสายนั้นย่อมมีโอกาสมากกว่า) แล้วบีบกลับเข้าช่วง 0.5–5
- กระดานส่งค่า `skillEdge: 1` เป็นค่าตั้งต้น (เท่าคนทั่วไป) เพราะคนอ่านหน้านี้คือมือใหม่ จะตั้ง 1.5 ให้ไม่ได้
- เรียงจาก `expectedPerHour` มากไปน้อย ถ้าเท่ากันใช้ `expectedUsd` ตัดสิน งานที่ปิดแล้วไปต่อท้ายเสมอ

### โมเดลความแออัด (คนละตัวกับ EV)

อยู่ใน `assets/js/app.js` และเลข "EV" บนการ์ดเป็นคนละตัวกับเครื่องคำนวณ — บนการ์ดคือ **ส่วนแบ่งเฉลี่ยต่อหัว** ไม่ใช่ค่าคาดหวังของคุณ

```
posted    = deadline − ระยะเวลาที่สมมติ (บาวน์ตี้ 21 วัน, โปรเจกต์ 30 วัน, ทุน 45 วัน)
ratio     = min(2.5, ช่วงเวลาทั้งหมด / เวลาที่ผ่านไปแล้ว)
projected = max(คนส่งตอนนี้, round(คนส่งตอนนี้ × ratio))
evPerEntry = pool / (projected + 1)
```

ระดับความแออัดจากจำนวนที่คาดการณ์: `0–8` = 1 (โล่ง), `9–24` = 2, `25–59` = 3, `60–119` = 4, `120+` = 5 (เดือด)
"เร็ว / ช้า" เทียบอัตราคนส่งต่อวันของงานนั้นกับค่ากลางของสกิลเดียวกันในชุดข้อมูล (เร็วกว่า 1.25 เท่า = กำลังมา, ช้ากว่า 0.75 เท่า = กำลังซา)

**สแนปช็อตนี้ไม่มีวันที่ประกาศงาน** ระยะเวลา 21/30/45 วันจึงเป็นสมมติฐานล้วน ๆ และเพดาน 2.5 เท่าใส่ไว้กันไม่ให้ตัวเลขระเบิด
เรื่องนี้เขียนบอกไว้ตรง ๆ ในกล่อง "วิธีคิดความแออัด" บนหน้าเว็บด้วย และการเรียงแบบ "ลงใหม่ล่าสุด" ก็อาศัยสมมติฐานเดียวกันนี้

## โครงสร้างไฟล์

```
index.html                 โครงหน้าเว็บ + สคริปต์เรียงลำดับตายตัว
assets/css/styles.css      สไตล์ทั้งหมด (ตัวแปร CSS, ธีมสว่าง/มืด, ไม่มีฟอนต์หรือไฟล์จากภายนอกเลย)
assets/js/data.js          สแนปช็อต 26 งาน + ตัวดึงข้อมูลสด
assets/js/playbook.js      เนื้อหาคู่มือสองภาษา (ข้อมูลล้วน ไม่แตะ DOM)
assets/js/calculator.js    เครื่องยนต์ EV + ตัวจัดอันดับ + UI ของเครื่องคำนวณ
assets/js/app.js           boot, กระดาน, ตัวกรอง, ความแออัด, i18n, ธีม, ปุ่มข้อมูลสด
PLAYBOOK.md                คู่มือฉบับเต็มแบบอ่านนอกเว็บ
README.md                  ไฟล์นี้
```

`agent/` เป็นชุดเครื่องมือ Node แยกต่างหาก (ESM, ต้อง Node 18+, zero-dependency) ที่ **ไม่ได้ถูกโหลดโดยหน้าเว็บ** และไม่จำเป็นต้องมีเพื่อรันแอป
ตอนนี้มีแค่ `agent/lib/` (api, rank, store) กับ `agent/test/` ส่วน `agent/bin/` ยังว่าง จึงยังไม่มีคำสั่ง CLI ให้เรียก

### ลำดับการโหลดสคริปต์ (ห้ามสลับ)

```html
<script src="assets/js/data.js"></script>
<script src="assets/js/playbook.js"></script>
<script src="assets/js/calculator.js"></script>
<script src="assets/js/app.js"></script>
```

ทุกไฟล์เป็น `<script>` ธรรมดา ผูกตัวเองไว้กับ `window` — ไม่มี ES module ไม่มี import ไม่มี CDN

### สัญญาระหว่างไฟล์ (`window.*`)

| Global | เจ้าของ | เนื้อหา |
| --- | --- | --- |
| `window.EARN_DATA` | `data.js` | `{ generatedAt, stats, skills, regions, listings, meta }` |
| `window.EarnLive` | `data.js` | `{ ENDPOINT, fetchListings(opts), normalise(raw, nowIso), audit(listings) }` |
| `window.EARN_PLAYBOOK` | `playbook.js` | `{ th: Locale, en: Locale }` — แต่ละภาษามี `title, subtitle, steps[6], plays[10], mistakes[8], faq[8]` |
| `window.EarnCalculator` | `calculator.js` | `{ computeEV(input), rankListings(listings, profile), mount(rootEl, opts) }` |
| `window.EarnApp` | `app.js` | `{ boot(), setLang(lang), getState(), render() }` |

- `app.js` เรียก `EarnApp.boot()` เองเมื่อ DOM พร้อม และ `boot()` จะเรียก `EarnCalculator.mount(document.getElementById('ev-calculator'), { data, lang })`
- เครื่องคำนวณสร้าง DOM ภายในของตัวเองทั้งหมด `index.html` มีแค่ `<div id="ev-calculator"></div>` เปล่า ๆ
- ตอนสลับภาษา `app.js` ยิง `document.dispatchEvent(new CustomEvent('earn:langchange', { detail: { lang } }))` และ `calculator.js` ดักฟังเพื่อเปลี่ยนป้ายของตัวเอง
- ถ้าไฟล์ไหนหายไป `boot()` จะไม่พังเงียบ ๆ — มันขึ้นกล่องแจ้งเตือนสองภาษาบอกว่าไฟล์ไหนหาย

## อัปเดตข้อมูล

**วิธีที่ 1 — แก้มือ (แนะนำ)**
เปิด `assets/js/data.js` แล้วแก้อาร์เรย์ `LISTINGS` ตามรูปแบบของ `Listing` (ดูตัวอย่างแถวแรกในไฟล์) อย่าลืมขยับ `GENERATED_AT` ด้วย
ฟิลด์ที่คุ้มค่าที่สุดที่ควรอัปเดตคือ `submissions` กับ `deadline` เพราะทั้งแอปตั้งอยู่บนสองตัวนี้
ไฟล์มี self-check ในตัว: ถ้ารูปแบบแถวผิด หรือ region ที่ใส่ไม่มีในลิสต์ `REGIONS` (ซึ่งจะทำให้ตัวกรองซ่อนแถวนั้น) มันจะเตือนใน console ตอนโหลด

**วิธีที่ 2 — ปุ่ม "ลองดึงข้อมูลสด"**
ปุ่มอยู่เหนือกระดาน เรียก `EarnLive.fetchListings({ limit: 100 })` ซึ่งยิงไปที่ `https://earn.superteam.fun/api/listings/`
ถ้าสำเร็จ ข้อมูลสดจะถูก merge ทับตาม `id` แล้วคำนวณความแออัด ตัวกรอง และเครื่องคำนวณใหม่ทั้งหมด
ฟังก์ชันนี้ **ไม่มีวัน reject** — คืนค่า `{ ok, listings, error }` เสมอ และล้มเหลวอย่างเงียบสงบโดยที่สแนปช็อตยังอยู่บนจอ (timeout 8 วินาที)

<a id="limitations-th"></a>

## ข้อจำกัด (ที่ควรรู้ก่อนใช้)

- **ข้อมูลสดมีโอกาสใช้ไม่ได้สูงมาก** บน `file://` เบราว์เซอร์บล็อกตั้งแต่ต้นทาง (โค้ดตรวจเจอและคืน error ทันทีโดยไม่ยิงเน็ตเลย) ส่วนบน `http://localhost` ก็ยังต้องผ่านด่าน CORS ของเซิร์ฟเวอร์ปลายทาง และ **Superteam Earn ไม่ได้ประกาศ public API อย่างเป็นทางการ** endpoint ที่ใช้จึงเป็นของที่ไม่มีเอกสารรองรับและพังได้ทุกเมื่อ
- **จำนวนคนส่ง (`submissions`) ในสแนปช็อตเป็นตัวแทน ไม่ใช่ตัวเลขสด** บางแถวมาจากค่าที่อ่านได้จริงตอนเก็บข้อมูล ที่เหลือถูกประมาณตามรูปแบบที่สังเกตได้ (คอนเทนต์สายมือใหม่ 80–400 คน, งานระดับกลาง 20–130, งาน dev ขั้นสูง 3–25) ตัวเลขนี้เปลี่ยนได้ทุกชั่วโมงบนของจริง
- **ทุกแถวมี slug จริงและเปิดหน้าประกาศจริงได้** เวอร์ชันก่อนหน้าเคยมี 9 แถวที่แต่งขึ้นเอง (`l25`–`l30`, `l32`–`l34`) โดยใส่ชื่อองค์กรจริง (Jupiter, Superteam ไทย/อินเดีย/ไนจีเรีย/ออสเตรเลีย/แคนาดา/เวียดนาม) พร้อมเงินรางวัลและจำนวนผู้ส่งที่แต่งขึ้น แถวเหล่านั้นถูกลบออกแล้ว **ห้ามใส่แถวจำลองกลับเข้ามา** เพราะหน้านี้แสดงผลเป็นกระดานงานจริง — **ให้อ่าน `listing.url` เสมอ ห้ามประกอบ URL เองจาก `listing.slug`**
- **โมเดล EV ไม่รู้จักอคติของสปอนเซอร์และความเป็นอัตวิสัยของการตัดสิน** มันไม่รู้ว่าสปอนเซอร์เคยให้รางวัลใคร ไม่รู้ว่ากรรมการชอบสไตล์ไหน ไม่รู้ว่ามีใครได้คุยกับทีมมาก่อนหรือเปล่า และไม่รู้ว่างานที่ส่งไปคุณภาพจริง ๆ เป็นยังไง
- **ไม่มีวันที่ประกาศงานในชุดข้อมูล** ระยะเวลา 21/30/45 วันจึงเป็นสมมติฐาน ซึ่งกระทบทั้งตัวเลขคาดการณ์คนส่ง ระดับความแออัด และการเรียงแบบ "ลงใหม่ล่าสุด"
- **`stats.listingsLive` คือ 26 = จำนวนแถวในสแนปช็อตนี้** ไม่ใช่จำนวนงานที่เปิดอยู่จริงบนแพลตฟอร์ม ส่วน `talent` (210,000+) และ `sponsors` (2,710+) เป็นตัวเลขการตลาดที่ Superteam แสดงบนหน้าเว็บของเขาเอง ไม่ได้ผ่านการตรวจสอบ ที่มาของทุกตัวเลขอยู่ใน `EARN_DATA.meta.sourceNotes` ซึ่งเป็นข้อความสองภาษา `{ th, en }` และ **app.js แสดงมันไว้ที่ฟุตเตอร์** อย่าปล่อยให้หลุดออกจากหน้า
- **ตัวเลขเงินรางวัลคือค่าที่สปอนเซอร์ประกาศไว้ ณ วันที่เก็บข้อมูล** ไม่ใช่จำนวนเงินที่จ่ายจริง
- หน้าเว็บไม่มี build step จึงไม่มี minify ไม่มี test runner ไม่มี lint ที่รันอัตโนมัติ — `data.js` มีแค่ self-check ที่เตือนผ่าน console

---

<a id="english"></a>

# 🇬🇧 English

## Start here

New to Superteam Earn? **Read [PLAYBOOK.md](PLAYBOOK.md) first**, then open the app.
It has six onboarding steps, ten concrete plays, eight common mistakes and eight FAQs, in both Thai and English.
The same content is rendered inside the page (the "Playbook" section), sourced from `assets/js/playbook.js`.

## How to run it

Zero build. No npm install, no bundler, no framework, no network at load. Plain HTML, CSS and classic scripts.

**Option 1 — double-click**

```
Open index.html in any browser (file:// protocol)
```

Everything works except the "Try live data" button, which browsers always block on `file://`. The app says so plainly and keeps showing the snapshot.

**Option 2 — serve over HTTP (so the live fetch has any chance at all)**

```bash
cd /home/user/DWE
python3 -m http.server 8000
# then open http://localhost:8000
```

Even over HTTP the live fetch may still be blocked by CORS — see [Limitations](#limitations).

## Features

**These two are why this project exists:**

- **Sort by expected $/hour (the default).** The board opens ranked by expected dollars per hour of *your* effort, not by headline prize size. A $10,000 bounty with 300 entries loses badly to a $2,000 bounty with 12 entries. This sort answers the only question that matters: **which listing is worth your hours.**
- **A five-level competition-heat strip on every card.** Wide open / Warming / Busy / Crowded / Red zone, plus a projection of how many entries the listing will have by its deadline, and whether entries are arriving faster or slower than the median for that skill.

**Everything else:**

- An interactive expected-value calculator with a live "best value open listings" top five, and a one-click button on each card that loads that listing's numbers into it
- Filters: type tabs (bounty / project / grant), debounced search, six skill chips, minimum reward ($500+ / $1,000+ / $5,000+), region, difficulty, status, token, and a "hide crowded" switch
- Four sorts: best $/hour (EV), highest reward, closing soon, newest
- Live countdown to each deadline
- Fully bilingual, Thai by default, including the calculator's own labels
- Light / system / dark theme, remembered in `localStorage` (`bh.theme`, `bh.lang`)
- Filter state lives in the URL hash, so a filtered board is a shareable link: `#skills=development&crowded=hide`
- The full playbook rendered in-page
- Mobile bottom-sheet filters, skip link, `aria-label`s throughout, `prefers-reduced-motion` respected
- A best-effort live-data button (see Limitations)

## How the EV model works

> **This is a model, not a prediction.** Every number it prints is a consequence of assumptions you fed it.
> It does not know the judge's taste, the sponsor's history, or how good your submission actually is.
> Use it to **compare two listings against each other**, not to believe you will be paid that amount.

The maths lives in `assets/js/calculator.js`. `computeEV()` implements a **Plackett–Luce** ranking model — derived, not hand-waved.

Let

- `n` = the size of the field *including you* = `max(1, submissions)`
- `e` = `skillEdge`, how many times more likely you are to be picked than a random entrant, clamped to 0.5–5
- Model the field as one entrant of weight `e` (you) plus `n − 1` entrants of weight 1

**Chance of first place**

```
winProb = e / (e + (n − 1))
```

**Chance of placing anywhere paid.** If you were not drawn first, exactly one rival has left the pool, so the field shrinks beneath you. The hazard of being drawn at step `i` (0-indexed), given you are still unranked, is

```
h_i = e / (e + (n − 1) − i)
P(exactly rank i+1) = h_i × ∏(1 − h_j)  for all j < i
podiumProb          = Σ P(exactly rank i+1) over the paid ranks
```

The code deliberately does **not** use the naive `1 − (1 − winProb)^k`: the ranks are not independent draws, and the field shrinks as prizes are handed out.
If the field is smaller than the podium (a five-deep split with three entrants), only three ranks pay. That shortfall is real — the unreachable prize money is never paid to anyone — not a bug.

**Money**

```
expectedUsd     = Σ P(exactly rank i+1) × prizeUsd × podiumSplit[i]
expectedPerHour = expectedUsd / max(hours, 0.25)
breakEvenRate   = expectedPerHour
```

`breakEvenRate` reads in plain language as **"you are effectively bidding your time at $X/hour."** If your real rate is higher, don't take the listing.

**The verdict is an opinion, not a fact.** The code says so outright: the thresholds are calibrated to a competent remote freelancer.

| Expected $/hour | Verdict |
| --- | --- |
| ≥ $50 | Great |
| ≥ $20 | Good |
| ≥ $8 | Marginal |
| below that | Skip |

Someone building a portfolio from zero should read one tier lower; someone with a day job billing $120/hour should read one tier higher.

**Assumptions the model carries, stated plainly**

1. Judges pick proportionally to weight. In reality they have taste, prior relationships and bias.
2. `skillEdge` is **a number you guess about yourself.** Flatter yourself and the output flatters you back.
3. Every submission counts as one rival, whether it was a week of work or a two-minute throwaway.
4. The submission counts in the snapshot are representative, not live.
5. `hours` is an honest median estimate of effort, not your actual speed.
6. The $/hour division uses a 15-minute floor so a zero-hour entry cannot blow the rate up to infinity.

`computeEV()` **never throws and never returns NaN or Infinity** — negatives, zero, strings, `null` and `NaN` are all clamped.

### How the board's EV sort works

`rankListings(listings, profile)` in `calculator.js` is what the board actually calls.

- Only listings with `status === 'open'` are scored.
- Prize shares come from `listing.prizes` divided by the **pool size**, not by the sum of the published prizes. If a sponsor advertises $5,000 but only lists $4,000 of podium prizes, that missing $1,000 is money you cannot win, so the shares sum to 0.8 rather than being inflated back to 1.
- If a listing's skill matches the skills you have filtered to, `skillEdge` is multiplied by 1.25 (an opinion: knowing the domain makes you likelier to place), then re-clamped into 0.5–5.
- The board passes `skillEdge: 1` as its baseline — "no better than the average entrant". This page's readers are new by definition, so a 1.5 baseline would bake an unearned ~48% uplift into the first ranking they see.
- Rows sort by `expectedPerHour` descending, tie-broken by `expectedUsd`. Closed listings keep their place at the end.

### The competition-heat model (a different thing from EV)

This one lives in `assets/js/app.js`. Note that the "EV" chip on a card is **not** the calculator's EV — it is the naive fair share per entrant.

```
posted     = deadline − an assumed window (bounty 21d, project 30d, grant 45d)
ratio      = min(2.5, total window / time elapsed so far)
projected  = max(entries now, round(entries now × ratio))
evPerEntry = prize pool / (projected + 1)
```

Heat level from the projection: `0–8` = 1 (wide open), `9–24` = 2, `25–59` = 3, `60–119` = 4, `120+` = 5 (red zone).
"Rising / steady / cooling" compares a listing's entries-per-day against the median entries-per-day for the same skill in the current dataset (above 1.25× is rising, below 0.75× is cooling).

**The snapshot carries no posted-at date**, so the 21/30/45-day windows are pure assumption, and the 2.5× cap exists to stop the projection exploding when a deadline sits beyond the assumed window. The page states this verbatim in its "How heat is scored" panel, and the "Newest" sort reads from the same assumption.

## File layout

```
index.html                 page shell + the fixed script order
assets/css/styles.css      all styling (CSS custom properties, light/dark themes, zero external assets)
assets/js/data.js          the 26-listing snapshot + the live fetcher
assets/js/playbook.js      bilingual playbook content (pure data, no DOM, no side effects)
assets/js/calculator.js    the EV engine, the ranker, and the calculator panel UI
assets/js/app.js           boot, board, filters, heat model, i18n, theme, live button
PLAYBOOK.md                the full guide, readable outside the app
README.md                  this file
```

`agent/` is a separate Node toolkit (ESM, Node 18+, zero dependencies). It is **not loaded by the page** and is not needed to run the app. Today it contains only `agent/lib/` (api, rank, store) and `agent/test/`; `agent/bin/` is empty, so there is no CLI entry point yet.

### Script load order (fixed)

```html
<script src="assets/js/data.js"></script>
<script src="assets/js/playbook.js"></script>
<script src="assets/js/calculator.js"></script>
<script src="assets/js/app.js"></script>
```

Every file is a classic `<script>` that attaches to `window`. No ES modules, no imports, no CDN tags anywhere — the page renders fully offline.

### The `window.*` contracts between files

| Global | Owner | Shape |
| --- | --- | --- |
| `window.EARN_DATA` | `data.js` | `{ generatedAt, stats, skills, regions, listings, meta }` |
| `window.EarnLive` | `data.js` | `{ ENDPOINT, fetchListings(opts), normalise(raw, nowIso), audit(listings) }` |
| `window.EARN_PLAYBOOK` | `playbook.js` | `{ th: Locale, en: Locale }`, each with `title, subtitle, steps[6], plays[10], mistakes[8], faq[8]` |
| `window.EarnCalculator` | `calculator.js` | `{ computeEV(input), rankListings(listings, profile), mount(rootEl, opts) }` |
| `window.EarnApp` | `app.js` | `{ boot(), setLang(lang), getState(), render() }` |

- `app.js` calls `EarnApp.boot()` itself once the DOM is ready, and `boot()` calls `EarnCalculator.mount(document.getElementById('ev-calculator'), { data, lang })`.
- The calculator builds its entire inner DOM; `index.html` supplies only an empty `<div id="ev-calculator"></div>`.
- On a language switch `app.js` fires `document.dispatchEvent(new CustomEvent('earn:langchange', { detail: { lang } }))`, and `calculator.js` listens for it to re-render its own labels.
- If a file fails to load, `boot()` does not fail silently: it shows a bilingual banner naming the missing dependency.

Listing shape, for reference:

```js
{
  id, title, slug, url,
  sponsor: { name, handle? },
  type: 'bounty' | 'project' | 'grant',
  skill: 'content' | 'design' | 'development' | 'growth' | 'community' | 'other',
  reward: { amount, token: 'USDC' | 'USDG' | 'SOL', usd },
  prizes: [],                 // podium split in token units; empty for grants
  submissions, deadline,      // ISO 'YYYY-MM-DD'
  status: 'open' | 'in-review' | 'completed',
  region, difficulty, estimatedHours, tags: []
}
```

What is actually in the snapshot: 26 listings (19 open, 4 completed, 3 in review) — 22 bounties, 2 projects, 2 grants; rewards from $500 to $20,000, all in USDC (21) or USDG (5), so `reward.usd === reward.amount` everywhere and no SOL price is baked in; submission counts from 7 to 353; estimated effort from 3 to 60 hours; six regions.

`sponsor.handle` is optional: it is present only where the social handle was actually observed on the source page, and absent rather than guessed everywhere else. There is no `sponsor.verified` field — the snapshot never checked Superteam Earn's own sponsor-verification state, so the UI draws no trust tick.

## Refreshing the data

**Option 1 — edit the file (recommended).**
Open `assets/js/data.js` and edit the `LISTINGS` array, following the `Listing` shape above. Bump `GENERATED_AT` while you are there.
The highest-value fields to refresh are `submissions` and `deadline` — the entire premise of the app rests on them.
The file self-checks on load: malformed rows, and any `region` missing from the `REGIONS` list (which would make the region filter hide that row), are reported as a `console.warn`.

**Option 2 — the "Try live data" button.**
It sits above the board and calls `EarnLive.fetchListings({ limit: 100 })` against `https://earn.superteam.fun/api/listings/`.
On success, live rows are merged over the snapshot by `id`, and the heat index, filters, hero stats and calculator are all rebuilt.
The function **never rejects** — it always resolves to `{ ok, listings, error }`, times out after 8 seconds, and fails quietly with the snapshot still on screen.

<a id="limitations"></a>

## Limitations, honestly stated

- **The live fetch will usually not work.** On `file://` the browser blocks cross-origin requests outright, and the code detects this and returns an error without touching the network. Over `http://localhost` it still has to survive the remote server's CORS policy. **Superteam Earn publishes no documented public API**, so the endpoint used here is undocumented and can break at any time.
- **Submission counts in the seed are representative, not live.** Some rows carry counts read off real pages at capture time; the rest are modelled on observed patterns (beginner content 80–400 entries, intermediate work 20–130, advanced development 3–25). On the real site these change by the hour.
- **Every row carries a real slug and opens a real listing.** An earlier revision shipped nine invented rows (`l25`–`l30`, `l32`–`l34`) attributed to real organisations (Jupiter, Superteam Thailand/India/Nigeria/Australia/Canada/Vietnam) with invented prize pools, submission counts and deadlines, pointing at `/earn/all`. They have been deleted. **Do not reintroduce a modelled row**: this data renders as an opportunity board, so a row the reader cannot open and check is a false claim about a named organisation no matter how it is captioned. **Always read `listing.url`; never rebuild a URL from `listing.slug`.**
- **Seven rows were re-checked against the live listing pages and were wrong** — see the CORRECTIONS block at the top of `data.js` for each one. The worst was `l23 trade-tweet-and-earn-1`, shipped as WOOFi / 2,000 USDC / 187 submissions / `crowded` when the real listing is Spectrumfi / 500 USDC / 9 submissions: the board's core signal was inverted. Rows not listed there were not re-checked and may be stale the same way.
- **The EV model ignores sponsor bias and judging subjectivity.** It knows nothing about who a sponsor has rewarded before, which style a judge prefers, who talked to the team in Discord first, or how good the work you submit actually is.
- **There is no posted-at date in the dataset**, so the 21/30/45-day windows are an assumption that drives the entry projection, the heat level and the "Newest" sort.
- **`stats.listingsLive` is 26 = the number of rows in this snapshot**, not a count of currently open listings on the platform. `talent` (210,000+) and `sponsors` (2,710+) are marketing figures Superteam displays on its own site, unaudited. Provenance for every number is recorded in `EARN_DATA.meta.sourceNotes`, which is a bilingual `{ th, en }` reader-facing string that **app.js renders in the footer**. If you add a statistic to the page, qualify it there in both locales or do not show it.
- **Rewards are shown as posted by sponsors at capture time**, not as amounts actually paid out.
- No build step means no minification, no automated test runner and no lint on the page itself; `data.js` carries only a console-level self-check.

---

**License / usage.** Personal, non-commercial companion tool. All listing titles, sponsor names and reward figures belong to their respective sponsors and to Superteam. Before acting on anything here, open the real listing at <https://superteam.fun/earn>.
