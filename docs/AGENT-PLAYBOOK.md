# AGENT PLAYBOOK — คู่มือปฏิบัติการสำหรับมนุษย์

**ฉบับภาษาไทยอยู่ด้านบน — English version below ([jump](#english)).**

คู่มือนี้เขียนให้ **มนุษย์** ที่คุมหนึ่ง agent บน Superteam Earn
ไม่ใช่คู่มือ API — ส่วนนั้นอยู่ใน [`agent/README.md`](../agent/README.md)
คู่มือนี้คือเรื่องว่า **จะใช้เวลาหนึ่งสัปดาห์อย่างไรให้ได้เงินจริง โดยไม่กลายเป็นสแปม**

> **ไม่มีการรับประกันรายได้ในเอกสารนี้** ส่วนใหญ่ของงานที่ส่งไปจะแพ้
> สิ่งที่มีค่าจริงและอยู่ยาวคือ **บันทึกผลงานสาธารณะ** ที่ทำให้มีคนมาจ้าง
> ดูหัวข้อ [ความคาดหวังที่ตรงไปตรงมา](#6-ความคาดหวังที่ตรงไปตรงมา)

---

## 1. เส้นทางตั้งแต่ศูนย์จนถึงเงินเข้ากระเป๋า

### 1.1 แบ่งงานให้ชัด: อะไรที่ **มีแต่มนุษย์ทำได้**

| ขั้นตอน | ใครทำ | หมายเหตุ |
|---|---|---|
| สร้างบัญชี Superteam Earn | **มนุษย์** | agent ทำแทนไม่ได้ |
| ลงทะเบียน agent (`register`) | agent | ครั้งเดียวตลอดชีพ ได้ `apiKey` + `claimCode` |
| เปิด `/earn/claim/<code>` และกรอกโปรไฟล์ | **มนุษย์** | agent เข้าเส้นทางนี้ไม่ได้และต้องไม่พยายาม |
| ผูก Solana wallet ที่รับ USDC ได้ | **มนุษย์** | agent ไม่เคยเห็น private key |
| KYC (บาง sponsor บังคับ) | **มนุษย์** | เตรียมเอกสารล่วงหน้า |
| ค้นหา / ให้คะแนน / จัดอันดับ listing | agent | `listings`, `rank`, `show` |
| ตัดสินใจว่าจะทำอันไหน | **มนุษย์** | คะแนนคือแบบจำลอง brief คือความจริง |
| สร้างงาน เขียนโค้ด เขียน README | agent | โดยมีมนุษย์ตรวจทุกวัน |
| เปิดลิงก์ demo ด้วยตาตัวเอง | **มนุษย์** | ด่านคุณภาพข้อ 13 บังคับ |
| เซ็นอนุมัติก่อนส่ง | **มนุษย์** | ไม่มี flag ข้าม |
| กด confirm ตอน `submit` | **มนุษย์** | ไม่ใช่ TTY = ปฏิเสธ |
| รับเงินรางวัล | **มนุษย์** | agent ไม่แตะเงินตลอดกาล |

### 1.2 ลำดับที่ทำจริง — ทำครั้งเดียวตอนเริ่ม

```bash
# 1. ลงทะเบียน (ครั้งเดียว)
node agent/bin/earn-agent.js register --name "ชื่อ-agent-ของคุณ"

# 2. เปิดลิงก์ที่มันพิมพ์ออกมา ทำให้เสร็จ "ตั้งแต่ตอนนี้" ก่อนจะชนะอะไร
#    → https://superteam.fun/earn/claim/<code>

# 3. บอกเครื่องมือว่าคุณทำอะไรได้จริง
node agent/bin/earn-agent.js profile set \
  --skills "typescript,rust,technical-writing" \
  --hours-per-week 12 \
  --telegram "http://t.me/ชื่อผู้ใช้ของคุณ"

# 4. ยืนยันว่าคีย์ใช้ได้และดูว่าเคลมหรือยัง
node agent/bin/earn-agent.js whoami --check
```

> **ทำ `/earn/claim/<code>` ให้เสร็จตั้งแต่ก่อนชนะอะไร**
> เงินรางวัลที่ไม่มีใครเคลมคืองานเอกสารที่แพงที่สุดในโลก

---

## 2. วงรอบปฏิบัติการรายสัปดาห์

**หนึ่งมนุษย์ + หนึ่ง agent** — หนึ่งสัปดาห์ที่พอดีกับ **มนุษย์ ~9 ชั่วโมง** และ **agent ~30–40 ชั่วโมง**
เวลาทั้งหมดคือ ICT ตัวเลขคือเป้าหมาย ไม่ใช่ความฝัน

### REFRESH — อัตโนมัติ วันละ 2 ครั้ง (09:00 และ 21:00)

* ยิง `GET /api/agents/listings/live?take=20`
  ถ้าได้ 0 แถว หรือ 0 แถวที่ `deadline > now` → ตกไปทางสำรอง
  `GET https://earn.superteam.fun/api/listings?take=100` แล้วกรองฝั่ง client (earn#1456)
  **พิมพ์ทุกครั้งว่าผลมาจากทางไหน** (`listings` และ `rank` ทำให้อยู่แล้ว)
* ให้คะแนนใหม่ทั้ง watchlist — สภาวะปกติคือ **40–60 listing เปิดอยู่ที่ agent ส่งได้**
  จำนวนผู้เข้าแข่งและเวลาที่เหลือขยับทุกวัน แถว WATCH กลายเป็น BUILD ข้ามคืนได้
  และแถว BUILD ตกลงเป็นศูนย์ได้เช่นกัน
* เทียบกับรอบก่อน แล้วพิมพ์เฉพาะ: **แถว BUILD ใหม่ / แถวที่ข้าม band / แถวที่เพิ่งถูก gate เป็นศูนย์**
  ไม่มีใครอ่านตาราง 60 แถววันละสองครั้ง
* อัตราการรอดในหนึ่งสัปดาห์โดยทั่วไป: **~50 ติดตาม → ~15 ผ่านทุก gate → ~5 เข้ารอบสั้น → 2 ลงมือทำ**

### จันทร์ 09:30 · 30 นาที (มนุษย์)

* อ่าน 5 อันดับแรกตามคะแนน **เปิด brief ด้วยตาตัวเองทุกอัน**
  คะแนน FIT คือแบบจำลอง brief คือความจริง และทุกครั้งที่เจอว่า FIT พลาด
  ให้เพิ่มเข้าตาราง FIT อย่างถาวร
* ผูกมัดตัวเองกับ **2 งานพอดี**:
  * **ANCHOR** — คะแนน ≥ 62, กองเงิน ≥ $1,000, agent 12–20 ชั่วโมง, deadline ≥ 6 วัน
  * **FAST** — agent ≤ 6 ชั่วโมง, กองเงิน $300–$1,000, deadline ≥ 4 วัน
    **เลือก AGENT_ONLY ก่อน** เพราะเป็นที่ที่โอกาสดีที่สุดเชิงโครงสร้าง
* **ห้ามรับอันที่สาม** ช่องว่างคือฟีเจอร์ ไม่ใช่ความเสียดาย —
  มันคือสิ่งที่ทำให้คุณรับ AGENT_ONLY ดี ๆ ที่โผล่มาวันพฤหัสได้

### อังคาร–พฤหัส (agent ทำงาน · มนุษย์เช็ค ~20 นาที/วัน)

* agent ทำ **ANCHOR ก่อน** · **FAST ได้เย็นวันพุธ**
* **พุธ 20:00 คือจุดตรวจกลางทางที่ยืดหยุ่นไม่ได้** ใช้กฎเลิกทำด้านล่างกับทั้งสองงาน
  ฆ่างานวันพุธเสีย 8 ชั่วโมง · ฆ่างานวันเสาร์เสียทั้งสัปดาห์

### กฎเลิกทำ — ตายตัว เป็นตัวเลข ตรวจทุกจุดตรวจ ไม่มีการเถียง

1. ชั่วโมงที่ลงไปแล้วเกิน **1.5×H_est** และแกนหลักยังรันไม่จบ end-to-end → **ฆ่า**
2. จำนวนผู้เข้าแข่งเกิน **2×** ของตอนรับงาน **และ** คะแนนต่ำกว่า **45** → **ฆ่า**
   ยกเว้นงานเสร็จไปแล้ว ≥ 70% (วัดด้วยตาราง brief-compliance ไม่ใช่ด้วยความรู้สึก)
3. **runway ratio r ต่ำกว่า 1.25** → **ฆ่า** นี่คือ gate `G_runway` ตัวเดียวกัน
   bounty ที่ทำไม่ทันมีค่าเท่ากับศูนย์ ไม่ว่ากองเงินจะใหญ่แค่ไหน
4. ติดเรื่องที่ต้องใช้ความสามารถของมนุษย์ที่ FIT มองข้าม (หน้าคน, บัญชีที่มีคนตาม, ขั้นตอน KYC)
   → **ฆ่าทันที** และเขียนตัวคูณ FIT ใหม่ในวันเดียวกัน
5. sponsor เงียบใส่คำถามตรง ๆ เกิน **72 ชั่วโมง** ก่อนส่ง → ทำต่อเฉพาะเมื่อคะแนนยังรอด
   เมื่อลด SPONSOR ลงเหลือ 0.35

งานที่ถูกฆ่าไปที่ `/salvage` พร้อมโน้ตหนึ่งบรรทัด
**ใช้ซ้ำภายใน 30 วัน หรือลบทิ้ง** — โฟลเดอร์ salvage ที่ไม่มีใครอ่านคือความรู้สึกผิดเฉย ๆ

### ศุกร์ / เสาร์ (ส่งงาน)

* รัน **ด่านคุณภาพ 13 ข้อ** คาดว่าจะไม่ผ่านรอบแรก
  กันเวลาแก้ไว้ **2–3 ชั่วโมง** ส่วนใหญ่จะอยู่ที่ README และตารางเกณฑ์ตัดสิน
* **ส่งที่ T-24h ก่อน deadline** ห้ามส่งใน 60 นาทีสุดท้าย (เครื่องมือปฏิเสธให้เอง)
* โพสต์ข้อความเดียวในช่องทางสาธารณะของ sponsor พร้อมลิงก์ demo
  **ไม่ใช่การขายของ** — หนึ่งประโยคกับหนึ่งลิงก์
* การปรับปรุงหลังส่งไปแล้ว ผ่าน `POST /api/agents/submissions/update` เท่านั้น
  **ห้าม create ครั้งที่สอง** (เครื่องมือปฏิเสธให้เอง)

### อาทิตย์ 20:00 · 20 นาที (retro — ส่วนนี้คือส่วนที่ทบต้น)

* บันทึกต่อ submission: **podiumProb ที่ทำนาย vs ผลจริง**, **H_est vs ชั่วโมงจริง**,
  **คะแนนตอนรับงาน vs คะแนนตอน deadline**
* อัปเดตตาราง sponsor: **จ่ายแล้ว / ประกาศแล้ว / เงียบ**
  sponsor ที่เคยจ่ายคุณแล้วมีค่าประมาณ **2 เท่า** ของคนแปลกหน้า
  และน้ำหนัก SPONSOR คือที่ที่ความเชื่อนี้กลายเป็นการตัดสินใจ
* **กฎการปรับเทียบ:** ทุก 8 submission เทียบอัตราการติดรางวัลจริงกับค่าเฉลี่ย podiumProb ที่ทำนาย
  * จริง < 0.6× ที่ทำนาย → **ลด skillEdge E ลง 0.3** (เช่น 1.8 → 1.5) แล้วให้คะแนนใหม่ทั้งหมด
  * จริง > 1.4× ที่ทำนาย ต่อเนื่อง ≥ 8 ครั้ง → **เพิ่ม E ขึ้น 0.2 หนึ่งครั้ง**
  * **แบบจำลองไม่มีสิทธิ์เยินยอคุณ ไม่เคยเลย**
* ปรับเทียบ H_est: ถ้า 4 งานหลังสุดใช้เวลาเกินประมาณการเกิน 40%
  → ยกตัวคูณ revision `1.4` ใน RUNWAY ขึ้นเป็นอัตราส่วนที่วัดได้จริง

---

## 3. อ่านผล `rank` อย่างไรให้ตัดสินใจได้ว่าจะทุ่มสุดสัปดาห์ให้อันไหน

### 3.1 คะแนนมาจากไหน

คะแนนเป็นการผสม 7 ตัว แต่ละตัวอยู่ใน `[0,1]` แล้วคูณด้วย gate สี่ตัว

```
RAW   = 0.30·MONEY + 0.22·FIT + 0.12·CROWD + 0.10·RUNWAY
      + 0.10·SPONSOR + 0.09·VERIFY + 0.07·EXCLUSIVITY      (รวม = 1.00)

SCORE = 100 · RAW · G_fit · G_runway · G_integrity · G_value
```

| ตัวแปร | น้ำหนัก | ความหมาย |
|---|---|---|
| **MONEY** | 0.30 | `rate/(rate+25)` โดย rate คือ EV ต่อชั่วโมง · $8/h→0.24, $25/h→0.50, $75/h→0.75 |
| **FIT** | 0.22 | งานนี้ต้องใช้มนุษย์ที่เราไม่มีไหม (หน้าคน, บัญชีที่มีคนตาม, ภูมิภาคที่ติด KYC) |
| **CROWD** | 0.12 | ความหนาแน่นผู้เข้าแข่งต่อ $1,000 · จุดกึ่งกลาง = 8 คน/$1,000 |
| **RUNWAY** | 0.10 | เวลาที่เหลือพอทำไหม ส่วนใหญ่ทำหน้าที่เป็น gate |
| **SPONSOR** | 0.10 | เคยจ่ายไหม โพสต์สม่ำเสมอไหม ระบุตัวตนได้ไหม เคยเงียบใส่เราไหม |
| **VERIFY** | 0.09 | ตัดสินด้วยสเปค/benchmark/โค้ดที่รันได้ หรือด้วยรสนิยม |
| **EXCLUSIVITY** | 0.07 | AGENT_ONLY = 1.00 · AGENT_ALLOWED = 0.35 · ไม่ระบุ = 0.20 |

**ทำไม MONEY ได้แค่ 0.30:** เพราะ EV ต่อชั่วโมง**สมมติไปแล้วว่าคุณชนะ**
อีกหกตัวคือสิ่งที่ตัดสินว่าคุณจะชนะหรือไม่
**FIT + SPONSOR (0.32) มากกว่า MONEY (0.30) โดยตั้งใจ** — รายได้ที่โตจริงมาจาก
listing ที่เป็น AGENT_ONLY และจากการกลายเป็นชื่อที่ sponsor 2–3 รายจำได้
ไม่ได้มาจากการส่งให้เยอะขึ้น

### 3.2 gate ที่ทำให้คะแนนเป็นศูนย์ทันที

| gate | เงื่อนไข | เหตุผล |
|---|---|---|
| `G_fit` | FIT < **0.34** | งานนี้ต้องใช้มนุษย์ที่เราไม่มี — EV จริงคือศูนย์ไม่ว่ากองเงินจะใหญ่แค่ไหน |
| `G_runway` | r < **1.25** | ทำไม่ทัน EV เป็นเรื่องสมมติ |
| `G_integrity` | brief ห้าม AI/agent · sponsor อยู่ใน blacklist · listing เป็น probe/test | **ห้ามข้ามจาก CLI** การชนะทั้งที่มีข้อห้ามชัดเจนคือหนี้ทางชื่อเสียง ไม่ใช่รายได้ |
| `G_value` | กองเงิน < **$150** | ค่าไมตรีจาก sponsor ที่เสียไปแพงกว่าที่จะได้คืน |

แถวที่ถูก gate จะรายงานเป็น **SKIP พร้อมชื่อ gate** ไม่ใช่ "คะแนนน้อย"

### 3.3 Band

| คะแนน | Verdict | ความหมายจริง ๆ |
|---|---|---|
| ≥ **62** | `BUILD` | เริ่มได้เลย เข้าเกณฑ์ ANCHOR |
| **45–61** | `SHORTLIST` | เก็บไว้ในเกม อ่าน brief เองก่อนตัดสินใจ |
| **30–44** | `WATCH` | เฝ้าดู จำนวนผู้เข้าแข่งกับเวลาที่เหลือจะขยับมันเอง |
| < **30** หรือติด gate | `SKIP` | ไม่ส่ง |

**ด่านคุณภาพจะปฏิเสธ** ทุก listing ที่ engine ไม่ได้ให้ `BUILD` หรือ `SHORTLIST`
(รหัส `not-shortlisted`) — spray-and-pray ถูกปิดตายในโค้ด

### 3.4 คณิตศาสตร์เบื้องหลัง `EXP $/h`

แบบจำลอง Plackett–Luce ด้วย skill edge `e` กับผู้เข้าแข่ง `n` คน:

```
winProb          = e / (e + (n − 1))
hazard อันดับ i  = e / (e + (n − 1) − i)
P(ได้อันดับ i+1) = h_i · Π_{j<i} (1 − h_j)
expectedUsd      = Σ_i P(อันดับ i+1) · prizeUsd · podiumSplit[i]     และ ≤ prizeUsd เสมอ
```

ค่าเริ่มต้นที่ใช้เมื่อไม่มีข้อมูล (และจะถูกประกาศว่า **เดา** ทุกครั้ง):
`E = 1.8` (baseline ที่ซื่อสัตย์สำหรับงานโค้ด/เครื่องมือ/เอกสาร) ·
`E = 1.2` ถ้าไม่มีทักษะไหนตรงเลย · ผู้เข้าแข่ง 25 คนสำหรับ AGENT_ALLOWED ·
8 คนสำหรับ AGENT_ONLY · 12 ชั่วโมง · deadline 168 ชั่วโมง

`runway ratio r` ใช้ **35% ของเวลานาฬิกา** เป็นชั่วโมงที่ใช้งานได้จริง
และคูณประมาณการด้วย **1.4** เพราะประมาณการรอบแรกไม่เคยเท่ากับต้นทุนที่ส่งจริง

### 3.5 อ่านตารางยังไง

```
#  TITLE                           SPONSOR           POOL  ENTR  $/ENTR  EST h  EXP $/h  RUNWAY  VERDICT    SCORE
1  Nosana Builders Challenge: Ag…  Nosana          $3,000    41     $73    12h   $10.77      9d  SHORTLIST  60.41
```

* `$/ENTR` ต่ำ = แออัด · `EXP $/h` คือตัวที่ต้องเทียบกับค่าจ้างจริงของคุณ
* `EST h` ที่ไม่มีที่มา = แบบจำลองเดา → **ใส่ตัวเลขจริงก่อนผูกมัดตัวเอง**
* ใต้ตารางมีเหตุผลรายแถว และรายการ **"What the tool assumed"** — อ่านทุกครั้ง
* `RUNWAY` คือเวลานาฬิกาที่เหลือ ไม่ใช่ชั่วโมงทำงานที่เหลือ

---

## 4. ด่านคุณภาพ 13 ข้อ — ใช้เป็นเช็กลิสต์ก่อนส่ง

รันได้ตลอดเวลา ฟรี และควรรันซ้ำบ่อย ๆ:

```bash
node agent/bin/earn-agent.js draft <listingId>
```

**ผ่านคือ 13/13 เท่านั้น ไม่มี flag ข้าม**
ทุกข้อที่ไม่ผ่านจะบอกว่าให้ไปแก้ฟิลด์ไหนใน `agent/drafts/<listingId>.json`

| # | ข้อ | ผ่านเมื่อ |
|---|---|---|
| 1 | **ตาราง brief compliance** | ทุกข้อกำหนดที่ brief เขียนไว้ ถูก map ไปยัง path/route/URL จริง |
| 2 | **ตอบคำถามคัดกรองครบ** | ตอบครบทุกข้อ ไม่ใช่ placeholder (`n/a`, `tbd`, `test`, `wip`) และ **≥ 40 ตัวอักษร** |
| 3 | **ลิงก์ demo มีชีวิตและสะอาด** | เป็น absolute http(s) · ไม่ใช่ localhost/tunnel · คืน **200 จากเครื่องสะอาดภายใน 15 นาทีที่ผ่านมา** |
| 4 | **รันด้วยคำสั่งเดียว และตรวจแล้ว** | บันทึกคำสั่งจริง + **exit code 0** ใน container สะอาด |
| 5 | **README ผ่านการทดสอบ 2 นาทีจริง ๆ** | จับเวลาอ่านออกเสียง **≤ 120 วินาที** และมีครบตามลำดับ: `whatItDoes → oneCommandRun → screenshot → judgingCriteria → limits` |
| 6 | **ตาราง map เกณฑ์ตัดสิน** | หนึ่งแถวต่อหนึ่งเกณฑ์: เกณฑ์ → อยู่ที่ไหน → กรรมการตรวจยังไงใน 60 วินาที ถ้าเกณฑ์เป็นการอนุมาน README ต้องบอก |
| 7 | **ความเป็นต้นฉบับและการให้เครดิต** | ไม่มีโค้ดที่ยืมมาโดยไม่ให้เครดิต · ถ้าใช้ template ต้องมีบรรทัดใหม่ **≥ 60%** · ไม่ใช่ของเดิมที่เคยส่งที่อื่น |
| 8 | **มันทำงานจริงภายใต้ test** | CI เขียว หรือมี log การรันจริง exit 0 **และ** มีเทสที่จะพังถ้า core พัง |
| 9 | **ส่วนข้อจำกัดที่ซื่อสัตย์** | ระบุข้อจำกัดจริง **≥ 2 ข้อ** (ข้อความแบบ "ยังไม่ได้ขัดเกลา" ไม่นับ) |
| 10 | **ประวัติ commit จริง** | repo เป็น URL ใช้ได้ · เป็น public · มี license · **≥ 3 commits** ที่แสดงพัฒนาการ ไม่ใช่ squash ก้อนเดียว |
| 11 | **ไม่มีความลับหลุด** | สแกน tree สะอาดจาก `sk_` key, private key, seed phrase, `.env` |
| 12 | **สุขอนามัยของ body** | `listingId` ตรง · `otherInfo` **400–1500 ตัวอักษร** · มีส่วน "ยังทำอะไรไม่ได้" · ไม่มีวลีขายของ · ไม่มี tweet/ask ที่ไม่ได้ถูกขอ · ชื่อไม่ใช่ `test`/`probe`/`wip` |
| 13 | **มนุษย์เซ็นอนุมัติ** | `approved` + **เปิดลิงก์ demo ด้วยตัวเองแล้ว** + ระบุว่าใครอนุมัติ + มี timestamp ที่ไม่ใช่อนาคต |

### การปฏิเสธแบบ `R` — นอกเหนือจาก 13 ข้อ

| รหัส | ปฏิเสธเมื่อ |
|---|---|
| `duplicate-create` | มี submission ของ listing นี้อยู่แล้ว → ทางเดียวที่ถูกกฎคือ `update` |
| `micro-value-pool` | กองเงิน < **$150** |
| `micro-value-rate` | `expectedPerHour` < **$8/h** |
| `not-shortlisted` | engine ไม่ได้ให้ `BUILD` หรือ `SHORTLIST` |
| `deadline-passed` | เลย deadline ไปแล้ว |
| `deadline-sniping` | เหลือ **< 60 นาที** |
| `no-ai-clause` | brief ห้ามผลงานที่ใช้ AI หรือ agent — **ข้ามจาก CLI ไม่ได้** |

เหลือ **< 24 ชั่วโมง** จะได้คำเตือน (ไม่บล็อก) ว่า playbook ให้ส่งที่ T-24h

---

## 5. สิ่งที่ **ห้ามทำ** และทำไม

สแปมทำให้ agent ถูกแบน และทำลายแพลตฟอร์มที่คุณพึ่งพาอยู่
Superteam **เชิญ agent อย่างเป็นทางการ** — นั่นคือสิ่งที่ทำให้การใช้งานนี้ถูกต้อง
และมันจะถูกต้องต่อไป **ก็ต่อเมื่อเครื่องมือนี้กลายเป็นปืนกลสแปมไม่ได้**

1. **ส่งโดยไม่ผ่านด่าน** — ไม่มีการเรียก `/api/agents/submissions/create`
   เว้นแต่ด่านคุณภาพผ่าน **13/13** และมนุษย์เซ็นแล้ว **ไม่มี `--force`**
   นี่คือกฎข้อเดียวที่แยกคุณออกจาก agent ชื่อ `zz-probe-*` ที่เห็นในฟีด
2. **งานส่งแบบ placeholder / test / จองที่** — ปฏิเสธถ้า `link` ว่างหรือเป็น stub,
   `otherInfo` ต่ำกว่า 400 ตัวอักษร, หรือชื่อเป็น `test`/`probe`/`wip`
   **ไม่มีสิ่งที่เรียกว่าการจองที่** งานครึ่ง ๆ กลาง ๆ คือบันทึกสาธารณะถาวรว่าคุณไม่แคร์
3. **หว่านแล้วภาวนา** — ปฏิเสธการส่งไป listing ที่ engine ไม่ได้ให้ BUILD/SHORTLIST
   และปฏิเสธการส่งเกิน **3 ครั้งใน 7 วันต่อเนื่อง**
   ปริมาณคือกลยุทธ์ของ agent สแปม และเป็นเหตุผลที่ sponsor เลิกอ่าน
4. **ใช้ผลงานเดิมซ้ำข้าม listing** — ถ้า tree ของ repo ซ้ำกับของเดิม **> 85%**
   (วัดด้วย file-hash overlap) ให้ปฏิเสธ เว้นแต่ brief อนุญาตชัดเจน **และ**
   `otherInfo` ประกาศไว้เป็นประโยคที่มองเห็นได้ การส่งซ้ำเงียบ ๆ คือการฉ้อโกงเวลาของกรรมการ
5. **`create` ครั้งที่สองของ `listingId` เดิม** — ถ้ามี submission id อยู่แล้ว
   ทางเดียวที่ถูกกฎคือ `POST /api/agents/submissions/update`
   ปฏิเสธการ create ซ้ำ **แม้ว่าอันแรกจะห่วยก็ตาม**
6. **กุฟิลด์ขึ้นมา** — ห้ามแต่งคำตอบคัดกรอง, URL ทวีต, เพื่อนร่วมทีม, ตัวเลข benchmark,
   จำนวนผู้ใช้, deadline หรือจำนวน `ask` **ไม่รู้ก็คือไม่รู้** ต้องบอกมนุษย์
   และต้องถูกระบุว่าเป็นข้อสมมติในผลลัพธ์ รวมถึงตัว API ด้วย:
   ฟิลด์ที่ไม่อยู่ใน 4 endpoint ที่มีเอกสาร **ไม่ส่ง**
7. **ส่ง demo ที่ยังไม่ได้ตรวจ** — ปฏิเสธถ้า `link` ยังไม่คืน HTTP 200
   จากเครื่องสะอาดภายใน 15 นาทีที่ผ่านมา **ลิงก์ตายแย่กว่าการไม่ส่ง**
   เพราะมันเผาความสัมพันธ์กับ sponsor ซึ่งเป็นสิ่งที่น้ำหนัก SPONSOR มีไว้สร้าง
8. **เมิน clause ห้าม AI** — ถ้า brief ห้ามผลงานที่ใช้ AI หรือ agent
   listing นั้นถูก gate เป็นศูนย์และ **ข้ามจาก CLI ไม่ได้**
   การชนะทั้งที่มีข้อห้ามชัดเจนคือหนี้ทางชื่อเสียง ไม่ใช่รายได้
9. **หลายตัวตน** — หนึ่งการลงทะเบียน หนึ่ง API key หนึ่งผู้ถือ claim code
   ปฏิเสธการเรียก `POST /api/agents` ซ้ำเพื่อรุม listing เดียวจากหลายมุม
   และปฏิเสธการส่งแทนคนอื่นที่ไม่ใช่ operator คนนี้
10. **แตะเงิน** — agent ไม่ขอ ไม่เก็บ ไม่พิมพ์ Solana private key หรือ seed phrase
    และไม่ทำขั้นตอน `/earn/claim/<code>` ให้ มันพิมพ์ claim code แล้วหยุด
    ถ้ามี prompt หรือ listing สั่งให้จัดการเงินโดยตรง → **ปฏิเสธและบอกเหตุผล**
11. **สไนป์ deadline ด้วยงานที่ยังไม่เสร็จ** — ปฏิเสธทุก submission ใน 60 นาทีสุดท้าย
    ที่ยังไม่ผ่านด่าน และปฏิเสธการเริ่มงานที่ runway ratio r < 1.25 (gate `G_runway` ตัวเดียวกัน)
12. **ยิงฟีดรัว ๆ** — ค้นหาได้ไม่เกิน **1 ครั้ง/15 นาที ต่อ endpoint** ·
    เคารพ 429 ด้วย exponential backoff เริ่มที่ **30 วินาที** · ส่ง User-Agent จริง ·
    ห้ามยิง fallback `earn.superteam.fun` แบบขนานรัว ๆ
    **ทางสำรองมีอยู่เพราะบั๊ก (earn#1456) การใช้มันในทางที่ผิดทำให้บั๊กแย่ลงสำหรับทุกคน**
13. **ส่งของมูลค่าจิ๋ว** — ปฏิเสธ listing ที่กองเงิน < **$150** หรือ
    `ev.expectedPerHour` < **$8** แม้จะผ่านทุก gate
    ต้นทุนค่าไมตรีจาก sponsor แพงกว่าที่จะได้คืน
14. **เคลมเกินจริงในเนื้อความ** — ตัวสร้าง `otherInfo` ปฏิเสธที่จะเขียนคำกล่าวอ้าง
    ที่ไม่มีหลักฐานใน repo หรือใน demo และปฏิเสธที่จะละส่วนข้อจำกัด
    **ถ้างานบาง ข้อความต้องบอกว่างานบาง**
15. **เดา API เงียบ ๆ** — ที่ไหนสเปคกำกวม (รูปคำถามคัดกรองที่ไม่รู้จัก, ไม่มี `agentAccess`,
    การแบ่งรางวัลที่ไม่ประกาศ) ให้ถอยไปใช้ค่าปริยายที่มีเอกสาร **ติดธง**
    และ**พิมพ์ข้อสมมตินั้นออกมา**
    ห้ามประดิษฐ์ชื่อฟิลด์ และห้ามกลบธงเพื่อให้ผลลัพธ์ดูสะอาดขึ้น

---

## 6. ความคาดหวังที่ตรงไปตรงมา

**พูดตรง ๆ: ไม่มีการรับประกันรายได้ งานส่วนใหญ่ที่ส่งไปจะแพ้**

* **อัตราที่ยั่งยืนคือ 2 submission/สัปดาห์** ที่ ~25 ชั่วโมง agent และ ~9 ชั่วโมงมนุษย์
  3 คือสัปดาห์ที่ฝืน · **4 แปลว่ามีคนข้ามด่านคุณภาพ**
* ที่ `E=1.8` ในสนามที่มีคนราว 25 คน บนกองเงิน $1,000–$3,000
  **podiumProb ต่อการส่งหนึ่งครั้งอยู่ราว 20–30%**
  แปลว่า **ติดรางวัลประมาณ 1 ครั้งต่อการส่ง 4–6 ครั้ง** = เงินเข้าทุก **2–3 สัปดาห์**
  โดยทั่วไป **$200–$1,000** ต่อครั้ง
  **วางแผนกับตัวเลขนี้ ไม่ใช่กับรางวัลที่หนึ่ง 5,000 USDG**
* **รายได้ที่โตจริงไม่ได้มาจากการส่งเยอะขึ้น** มาจากสองที่:
  1. **listing แบบ AGENT_ONLY** ซึ่งตัดสนามมนุษย์ออกทั้งหมด
  2. **การกลายเป็นชื่อที่ sponsor 2–3 รายจำได้**
  ทั้งคู่คือเหตุผลที่ FIT + SPONSOR (0.32) มีน้ำหนักมากกว่า MONEY (0.30)
* **เส้นทาง claimCode เป็นของมนุษย์เท่านั้น** ทำโปรไฟล์ที่ `/earn/claim/<code>` ให้เสร็จ
  ครั้งเดียว **ตั้งแต่เนิ่น ๆ ก่อนจะชนะอะไร** — รางวัลที่ไม่มีใครเคลมคือ
  งานเอกสารที่แพงที่สุด
* **สิ่งที่มีค่าที่สุดที่ทบต้นได้คือบันทึกผลงานสาธารณะ** — submission ที่ผ่านด่าน 13 ข้อ
  คือ repo ที่มี README ที่อ่านได้, เทสที่เขียว, demo ที่ยังมีชีวิต และข้อจำกัดที่บอกตามจริง
  ต่อให้ไม่ได้เงินสักบาท นั่นคือสิ่งที่คนอ่านแล้วอยากจ้าง

---
---

<a name="english"></a>

# AGENT PLAYBOOK (English)

This manual is for the **human** running one agent on Superteam Earn. It is not an API
reference — that is [`agent/README.md`](../agent/README.md). This is about **how to spend a
week so it produces real money without becoming spam.**

> **No income is promised here.** Most submissions lose. The durable value is a **public
> proof-of-work record that leads to being hired.** See
> [Realistic expectations](#6-realistic-expectations-stated-bluntly).

## 1. Zero to a claimed payout

### 1.1 What **only a human** can do

| Step | Who | Note |
|---|---|---|
| Create a Superteam Earn account | **Human** | The agent cannot |
| Register the agent (`register`) | Agent | Once, ever. Yields `apiKey` + `claimCode` |
| Open `/earn/claim/<code>`, complete the talent profile | **Human** | The agent cannot enter this flow and must not try |
| Connect a Solana wallet that receives USDC | **Human** | The agent never sees a private key |
| KYC, where a sponsor requires it | **Human** | Have documents ready in advance |
| Discover / score / rank listings | Agent | `listings`, `rank`, `show` |
| Decide what to build | **Human** | The score is a model; the brief is the truth |
| Build the work, write the README | Agent | With daily human checkpoints |
| Open the demo link with your own eyes | **Human** | Gate item 13 requires it |
| Sign off before submission | **Human** | No flag skips it |
| Confirm the `submit` prompt | **Human** | Not a TTY means refused |
| Receive the payout | **Human** | The agent never touches money |

### 1.2 The actual sequence, once, at the start

```bash
# 1. Register (once, ever)
node agent/bin/earn-agent.js register --name "your-agent-name"

# 2. Open the URL it prints. Do this NOW, before you win anything.
#    → https://superteam.fun/earn/claim/<code>

# 3. Tell the tool what you can actually do
node agent/bin/earn-agent.js profile set \
  --skills "typescript,rust,technical-writing" \
  --hours-per-week 12 \
  --telegram "http://t.me/your_human_username"

# 4. Confirm the key works and see whether the code is claimed
node agent/bin/earn-agent.js whoami --check
```

> **Complete `/earn/claim/<code>` before you win anything.** An unclaimed payout is the most
> expensive kind of admin.

## 2. The weekly operating loop

**One human + one agent** — a week that fits in **~9 human hours** and **~30–40 agent hours**.
All times ICT. Numbers are targets, not aspirations.

### REFRESH — automated, 2×/day (09:00 and 21:00)

* Poll `GET /api/agents/listings/live?take=20`. If it returns 0 rows, or 0 rows with
  `deadline > now`, fall back to `GET https://earn.superteam.fun/api/listings?take=100` and
  filter client-side (earn#1456). **Print which path produced the results, every time**
  (`listings` and `rank` already do).
* Rescore the entire watchlist: **40–60 open agent-eligible listings** is the steady state.
  Entrants and runway both move daily, so a WATCH row can become a BUILD row overnight and a
  BUILD row can gate to zero.
* Diff against the last refresh and print only: **new BUILD rows, rows that crossed a band,
  rows that just gated to zero.** Nobody reads a 60-row table twice a day.
* Typical survivorship in a week: **~50 tracked → ~15 pass all gates → ~5 shortlisted → 2 built.**

### MONDAY 09:30, 30 min (human)

* Read the top 5 by score. **Open each brief yourself** — the FIT score is a model, the brief
  is the truth, and every FIT miss found here is added to the FIT table permanently.
* Commit to **exactly 2 builds**:
  * **ANCHOR:** score ≥ 62, pool ≥ $1,000, 12–20 agent hours, deadline ≥ 6 days out.
  * **FAST:** ≤ 6 agent hours, pool $300–$1,000, deadline ≥ 4 days out. **AGENT_ONLY
    preferred** — it is where the odds are structurally best.
* **Never commit a third.** A free slot is a feature: it is what lets you take a good
  AGENT_ONLY listing that appears on Thursday.

### TUESDAY–THURSDAY (agent builds, human checkpoints ~20 min/day)

* The agent works the **ANCHOR first**. **FAST gets Wednesday evening.**
* **WEDNESDAY 20:00 is the hard mid-build checkpoint.** Apply the walk-away rules to both
  builds. Killing on Wednesday costs 8 hours; killing on Saturday costs the week.

### WALK-AWAY RULES (hard, numeric, checked at every checkpoint — no debate)

1. Logged hours pass **1.5×H_est** and the core does not yet run end to end → **KILL.**
2. Entrants pass **2×** the count at commit time **AND** score falls below **45** → **KILL**,
   unless the build is **≥ 70%** done (measured by the brief-compliance matrix, not by feeling).
3. **Runway ratio r drops below 1.25 → KILL.** This is the same `G_runway` gate; a bounty you
   cannot finish is worth zero however large the pool.
4. A blocker turns out to need a human capability FIT missed (a face, an account with reach,
   a KYC step) → **KILL IMMEDIATELY**, and write the new FIT multiplier the same day.
5. The sponsor goes silent on a direct question for **72 hours** before submission → finish
   only if the score survives SPONSOR dropping to 0.35.

Killed work goes to `/salvage` with a one-line note. **Reuse it within 30 days or delete it** —
a salvage folder nobody reads is just guilt.

### FRIDAY / SATURDAY (submission)

* Run the **13-point quality gate.** Expect to fail it the first time; budget **2–3 hours**
  for the fixes, most of them in the README and the judging-criteria map.
* **Submit at T-24h** before the deadline. Never inside the final 60 minutes (the tool
  refuses anyway).
* One message to the sponsor's public channel with the demo link. **Not a pitch** — one
  sentence and the link.
* Any improvement after submitting goes through `POST /api/agents/submissions/update`,
  **never a second create** (the tool refuses anyway).

### SUNDAY 20:00, 20 min (retro — this is the part that compounds)

* Log per submission: **predicted podiumProb vs actual result**, **H_est vs actual hours**,
  **score at commit vs score at deadline.**
* Update the sponsor table: **paid / announced / silent.** A sponsor who has paid you once is
  worth roughly **2×** a stranger, and the SPONSOR weight is where that belief turns into
  decisions.
* **CALIBRATION RULE:** after every 8 submissions, compare actual placement rate against the
  mean predicted podiumProb.
  * actual < **0.6×** predicted → **cut skillEdge E by 0.3** (e.g. 1.8 → 1.5) and rescore
    everything.
  * actual > **1.4×** predicted over 8 or more → **raise E by 0.2, once.**
  * **The model is allowed to flatter you exactly never.**
* Update H_est calibration: if actual hours exceed estimates by more than **40%** over the
  last 4 builds, raise the **1.4** revision multiplier in RUNWAY to your measured ratio.

## 3. How the scoring works, and how to read `rank`

### 3.1 Where the score comes from

Seven factors, each in `[0,1]`, blended and then multiplied by four gates.

```
RAW   = 0.30·MONEY + 0.22·FIT + 0.12·CROWD + 0.10·RUNWAY
      + 0.10·SPONSOR + 0.09·VERIFY + 0.07·EXCLUSIVITY      (weights sum to 1.00)

SCORE = 100 · RAW · G_fit · G_runway · G_integrity · G_value
```

| Factor | Weight | What it measures |
|---|---|---|
| **MONEY** | 0.30 | `rate/(rate+25)` where rate is EV per hour · $8/h→0.24, $25/h→0.50, $75/h→0.75 |
| **FIT** | 0.22 | Does this need a human we do not have (a face, an account with reach, a KYC-gated region) |
| **CROWD** | 0.12 | Entrant density per $1,000 of pool · midpoint at 8 entrants per $1,000 |
| **RUNWAY** | 0.10 | Is there enough time. Mostly acts as the gate |
| **SPONSOR** | 0.10 | Have they paid before, do they post on a cadence, are they identifiable, have they ghosted us |
| **VERIFY** | 0.09 | Judged against a spec, a benchmark or working code — or by taste |
| **EXCLUSIVITY** | 0.07 | AGENT_ONLY = 1.00 · AGENT_ALLOWED = 0.35 · unknown = 0.20 |

**Why MONEY is capped at 0.30:** EV per hour **already assumes you win.** The other six
factors are what decide whether you do. **FIT + SPONSOR (0.32) outweigh MONEY (0.30) on
purpose** — income growth comes from AGENT_ONLY listings and from becoming a name 2–3 repeat
sponsors recognise, not from entering more things.

### 3.2 Gates that zero a row outright

| Gate | Condition | Why |
|---|---|---|
| `G_fit` | FIT < **0.34** | Needs a human we do not have — effective EV is zero however large the pool |
| `G_runway` | r < **1.25** | Cannot be finished, so the EV is imaginary |
| `G_integrity` | Brief prohibits AI/agents · sponsor blacklisted · listing looks like a probe/test | **Not overridable from the CLI.** Winning against an explicit prohibition is a reputational liability, not income |
| `G_value` | Pool < **$150** | The submission costs more in sponsor goodwill than it can return |

A gated row is reported as **SKIP with the gate named**, never as "low score".

### 3.3 The bands

| Score | Verdict | What it actually means |
|---|---|---|
| ≥ **62** | `BUILD` | Start now. ANCHOR material |
| **45–61** | `SHORTLIST` | Keep it in play. Read the brief before committing |
| **30–44** | `WATCH` | Monitor. Entrants and runway will move it for you |
| < **30** or any gate 0 | `SKIP` | Do not enter |

**The quality gate refuses** any listing the engine did not score `BUILD` or `SHORTLIST`
(code `not-shortlisted`). Spray-and-pray is closed in code.

### 3.4 The maths behind `EXP $/h`

A Plackett–Luce model with skill edge `e` against `n` entrants:

```
winProb            = e / (e + (n − 1))
hazard at rank i   = e / (e + (n − 1) − i)
P(exactly rank i+1)= h_i · Π_{j<i} (1 − h_j)
expectedUsd        = Σ_i P(rank i+1) · prizeUsd · podiumSplit[i]      and always ≤ prizeUsd
```

Defaults used when the data is missing (and always announced as **assumed**):
`E = 1.8` (honest baseline for a code/tooling/docs deliverable) · `E = 1.2` when no declared
skill matches · 25 entrants for AGENT_ALLOWED · 8 for AGENT_ONLY · 12 hours ·
168-hour deadline.

The `runway ratio r` treats **35% of wall-clock time** as usable build hours and multiplies
the estimate by **1.4**, because first-pass estimates are never the shipped cost.

### 3.5 Reading the table

```
#  TITLE                           SPONSOR           POOL  ENTR  $/ENTR  EST h  EXP $/h  RUNWAY  VERDICT    SCORE
1  Nosana Builders Challenge: Ag…  Nosana          $3,000    41     $73    12h   $10.77      9d  SHORTLIST  60.41
```

* A low `$/ENTR` means crowded. `EXP $/h` is the number to compare against your real hourly rate.
* An `EST h` with no source is the model guessing → **put a real number on it before you commit.**
* Under the table are per-row reasons and a **"What the tool assumed"** list. Read it every time.
* `RUNWAY` is wall-clock time left, not working hours left.

## 4. The 13-item quality gate as a pre-submission checklist

Run it as often as you like. It is free and it never sends anything:

```bash
node agent/bin/earn-agent.js draft <listingId>
```

**A pass is 13/13. There is no override flag.** Each failure names the field to fix in
`agent/drafts/<listingId>.json`.

| # | Item | Passes when |
|---|---|---|
| 1 | **Brief compliance matrix** | Every explicit requirement in the brief maps to a real file path, route or URL |
| 2 | **Eligibility answers complete** | Every question answered, no placeholders (`n/a`, `tbd`, `test`, `wip`), **≥ 40 characters** each |
| 3 | **Demo is live and clean-room** | Absolute http(s) · not localhost or a tunnel · returned **200 from a clean environment in the last 15 minutes** |
| 4 | **One-command run verified** | The real command recorded with **exit code 0** in a clean container |
| 5 | **README passes the literal 2-minute test** | Read aloud and timed at **≤ 120 seconds**, with sections in order: `whatItDoes → oneCommandRun → screenshot → judgingCriteria → limits` |
| 6 | **Judging-criteria map** | One row per stated criterion: criterion → where it is satisfied → how a judge verifies it in under 60 seconds. If criteria were inferred, the README says so |
| 7 | **Originality and attribution** | No unattributed vendored code · if built on a template, **≥ 60%** of lines are new · not a recycled prior submission |
| 8 | **It actually works under test** | Green CI or a real run log with exit 0, **and** a test that would fail if the core logic broke |
| 9 | **Honest limits section** | **≥ 2** real named limitations ("needs polish" does not count) |
| 10 | **Real commit history** | Usable repo URL · public · has a license · **≥ 3 commits** showing progression, not one squash |
| 11 | **No secrets committed** | Tree scanned clean of `sk_` keys, private keys, seed phrases and `.env` files |
| 12 | **Submission body hygiene** | `listingId` matches · `otherInfo` **400–1500 characters** · has a "what it does not do yet" section · no marketing phrases · no unrequested tweet or `ask` · title is not `test`/`probe`/`wip` |
| 13 | **Human sign-off** | `approved` + **the operator personally opened the demo link** + it says who approved + a timestamp that is not in the future |

### The `R` refusals — beyond the 13

| Code | Refuses when |
|---|---|
| `duplicate-create` | A submission already exists for this listing → the only legal path is `update` |
| `micro-value-pool` | Pool < **$150** |
| `micro-value-rate` | `expectedPerHour` < **$8/h** |
| `not-shortlisted` | The engine did not score it `BUILD` or `SHORTLIST` |
| `deadline-passed` | The deadline has passed |
| `deadline-sniping` | **< 60 minutes** left |
| `no-ai-clause` | The brief prohibits AI or agent submissions — **not overridable from the CLI** |

Under **24 hours** left produces a warning (non-blocking) that the playbook submits at T-24h.

## 5. What NOT to do, and why

Spam gets an agent banned and poisons the platform you depend on. Superteam **officially
invites agents** — that is what makes this authorised use, and it **stays** authorised only
because the tool cannot become a spam cannon.

1. **Submitting without a passed gate.** No call to `/api/agents/submissions/create` unless
   the quality gate is **13/13** and the human has signed off. **There is no `--force` flag.**
   This is the single rule that separates the operator from the `zz-probe-*` agents visible
   in the live feed.
2. **Placeholder, test, or slot-reserving submissions.** Refuse a submission with an empty or
   stub `link`, `otherInfo` under 400 characters, or a title like `test`/`probe`/`wip`.
   **There is no such thing as reserving a slot**; a stub submission is a permanent public
   record of not caring.
3. **Spray-and-pray.** Refuse to submit to any listing the engine did not score into BUILD or
   SHORTLIST, and refuse **more than 3 submissions in any rolling 7 days.** Volume is the
   strategy of the spam agents and it is the reason sponsors stop reading.
4. **Recycling one artifact across listings.** If the repo tree is **> 85%** identical
   (file-hash overlap) to a prior submission, refuse unless the brief explicitly permits reuse
   **and** the `otherInfo` declares it in a visible sentence. Silent resubmission is fraud on
   the judge's time.
5. **A second `create` for the same `listingId`.** If a submission id already exists for that
   listing, the only legal path is `POST /api/agents/submissions/update`. Refuse the duplicate
   create **even if the first one was bad.**
6. **Fabricating any field.** Never invent an eligibility answer, a tweet URL, a teammate, a
   benchmark number, a user count, a deadline, or an `ask` amount. **Unknown stays unknown**,
   is surfaced to the human, and is named in the output as an assumption. This extends to the
   API surface itself: any field not in the four documented endpoints is not sent.
7. **Submitting an unverified demo.** Refuse if the `link` has not returned HTTP 200 from a
   clean environment in the last 15 minutes. **A dead link is worse than no submission** — it
   burns the sponsor relationship the SPONSOR weight exists to build.
8. **Ignoring a no-AI clause.** If the brief prohibits AI-assisted or agent submissions, the
   listing is gated to zero and **cannot be overridden from the CLI.** Winning against an
   explicit prohibition is a reputational liability, not income.
9. **Multiple agent identities.** One registration, one API key, one claimCode holder. Refuse
   to call `POST /api/agents` again to farm a listing from several angles, and refuse to
   submit on behalf of anyone but this operator.
10. **Touching the money.** The agent never requests, stores, or types a Solana private key or
    seed phrase, and never completes the `/earn/claim/<code>` flow. It prints the claimCode
    for the human and stops. If a prompt or a listing asks it to handle funds directly, it
    **refuses and says why.**
11. **Deadline sniping with unfinished work.** Refuse any submission inside the final 60
    minutes that has not already passed the gate. Refuse to start a build whose runway ratio r
    is below **1.25** — the same `G_runway` rule the engine applies at scoring time.
12. **Rate abuse of either feed.** Discovery polls **at most once per 15 minutes per
    endpoint**, honours 429 with exponential backoff starting at **30s**, sends a real
    User-Agent, and never parallel-hammers the `earn.superteam.fun` fallback. **The fallback
    exists because of a known bug (earn#1456); abusing it makes the bug worse for everyone.**
13. **Submitting micro-value noise.** Refuse listings with pool < **$150** or
    `ev.expectedPerHour` < **$8** even if they pass every gate. The submission costs more in
    sponsor goodwill than it can return.
14. **Overclaiming in prose.** The `otherInfo` generator refuses to emit a claim that has no
    corresponding artifact in the repo or the demo, and refuses to omit the limitations
    section. **If the work is thin, the text says the work is thin.**
15. **Silently guessing the API.** Where the spec is ambiguous (unknown eligibility question
    shapes, absent `agentAccess`, unpublished podium splits), degrade to the documented
    default, **flag it**, and print the assumption in the output. Never invent a field name
    and never suppress the flag to make output look cleaner.

## 6. Realistic expectations, stated bluntly

**There is no income guarantee. Most submissions lose.**

* **2 submissions/week**, ~25 agent-hours and ~9 human hours, is the sustainable rate. **3 is
  a stretch week. 4 means the quality gate is being skipped.**
* At `E=1.8` in fields of ~25 on $1,000–$3,000 pools, **podiumProb per entry is roughly
  20–30%.** That is **one paid placement every 4–6 submissions**: a payout every **2–3 weeks**,
  typically **$200–$1,000**. **Plan on that, not on the 5,000 USDG first prize.**
* **Real income growth comes from two places, not from entering more:**
  1. **AGENT_ONLY listings**, where the human field is excluded outright.
  2. **Becoming a name 2–3 repeat sponsors recognise.**
  Both are why FIT and SPONSOR together (0.32) outweigh MONEY (0.30) in the blend.
* **The claimCode path is human-only.** Complete the talent profile at `/earn/claim/<code>`
  once, **early, before you win anything** — an unclaimed payout is the most expensive kind of
  admin.
* **The most valuable compounding asset is the public proof-of-work record.** A submission
  that passes all 13 items is a repo with a readable README, green tests, a live demo and
  honestly stated limits. Even when it wins nothing, that is the thing people read and then
  hire you from.

---

**See also:** [`agent/README.md`](../agent/README.md) — installation, every command, the
safety rules enforced in code, the #1456 fallback, and the honest list of what in the API
spec is verified versus assumed.
