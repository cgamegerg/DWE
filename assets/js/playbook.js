/*!
 * playbook.js — window.EARN_PLAYBOOK (CONTRACT B)
 *
 * Bilingual editorial content for the Superteam Earn guide. Pure data: no DOM,
 * no network, no side effects beyond the single window assignment below. Safe to
 * load from file:// with a classic <script> tag.
 *
 * Shape:
 *   window.EARN_PLAYBOOK = { th: Locale, en: Locale }
 *   Locale = {
 *     title:    string
 *     subtitle: string
 *     steps:    [{ n: number, title: string, body: string }]      // onboarding, in order
 *     plays:    [{ title: string, body: string, tags: string[] }] // concrete tactics
 *     mistakes: [{ title: string, body: string }]                 // anti-patterns
 *     faq:      [{ q: string, a: string }]
 *   }
 *
 * The two locales are parallel: same section lengths, same order, same meaning.
 * Renderers may therefore index th/en interchangeably when switching language.
 *
 * Editorial rules baked into this copy: no income guarantees, no referral links,
 * no affiliate codes. Figures are illustrative ranges, not promises.
 */
window.EARN_PLAYBOOK = {
  "th": {
    "title": "หาเงินจริงบน Superteam Earn: คู่มือแบบไม่ขายฝัน",
    "subtitle": "แผนงานที่ทำได้จริงสำหรับคนไทยที่เพิ่งเจอ superteam.fun/earn — มีตัวเลข มีข้อจำกัด และไม่มีการการันตีรายได้ครับ",
    "steps": [
      {
        "n": 1,
        "title": "สมัคร ยืนยันอีเมล แล้วทำโปรไฟล์ให้จบใน 20 นาที",
        "body": "เข้า superteam.fun/earn สมัครด้วยอีเมลที่ใช้จริงแล้วกดยืนยันให้เรียบร้อย ถ้าไม่ยืนยันจะส่ง submission ไม่ได้ครับ จากนั้นกรอกโปรไฟล์ให้ครบ: ชื่อ, bio สั้น ๆ ที่บอกว่าคุณทำอะไรได้, skills ที่เลือกจริง (ไม่ใช่ติ๊กทุกช่อง), region ที่คุณอยู่จริง และลิงก์ GitHub / X / Behance / Dribbble / เว็บส่วนตัว sponsor เปิดโปรไฟล์คุณดูก่อนตัดสินเสมอ โปรไฟล์ว่าง ๆ คือเหตุผลที่ดีที่สุดที่เขาจะข้ามคุณไป"
      },
      {
        "n": 2,
        "title": "ตั้ง wallet Solana และเตรียมเอกสาร KYC ตั้งแต่วันแรก",
        "body": "ติดตั้ง Phantom, Solflare หรือ Backpack สร้าง wallet เก็บ seed phrase ไว้ออฟไลน์ และห้ามส่งให้ใครเด็ดขาดแม้จะอ้างว่าเป็นทีมงาน จากนั้นใส่ address ลงในโปรไฟล์ Earn รางวัลจ่ายเป็นสเตเบิลคอยน์บน Solana ส่วนใหญ่เป็น USDC หรือ USDG เช็ค address ซ้ำสองรอบเพราะโอนผิดคือหายถาวร และเตรียมพาสปอร์ตหรือบัตรประชาชนไว้ด้วย เพราะ listing ที่ Superteam หรือ Solana Foundation เป็นสปอนเซอร์ต้องผ่าน KYC ก่อนโอน ชื่อในเอกสารต้องตรงกับชื่อที่กรอกไว้"
      },
      {
        "n": 3,
        "title": "สร้าง proof-of-work 3 ชิ้นก่อนลงแข่งจริง",
        "body": "ก่อนส่ง submission แรก ทำงานของตัวเอง 3 ชิ้นที่คนเปิดดูแล้วเข้าใจภายใน 30 วินาที เช่น repo ที่รันได้จริงพร้อม README ที่อ่านรู้เรื่อง, งาน Figma หรือ case study หนึ่งหน้า, บทความหนึ่งชิ้นที่มีข้อมูลจริงไม่ใช่ลมเปล่า แล้วรวมทั้งหมดเป็นลิงก์เดียว จะเป็น Notion, GitHub Pages หรือเว็บตัวเองก็ได้ นี่แหละคือสิ่งที่ทำให้ sponsor กล้าเลือกคนที่ยังไม่เคยชนะอะไรเลยครับ"
      },
      {
        "n": 4,
        "title": "เลือก listing แรกด้วยตัวเลข ไม่ใช่ด้วยความอยาก",
        "body": "ก่อนลงมือ ดู 5 อย่าง: จำนวน submissions ตอนนี้, ขนาด pool, เวลาที่เหลือ, ประเภท (Bounty / Project / Grant) และงานนี้ตรงกับสิ่งที่คุณทำได้ดีจริงไหม เกณฑ์ที่ใช้ได้เลยสำหรับงานแรกคือ submissions ต่ำกว่า 25 คน, pool ตั้งแต่ $1,000 ขึ้นไป และเหลือเวลาอย่างน้อย 5 วัน ถ้าวันนี้หาไม่เจอก็ไม่ต้องฝืนส่ง รอพรุ่งนี้ได้ครับ การไม่ส่งงานที่ค่าคาดหวังแย่ก็ถือเป็นการตัดสินใจที่ดีเหมือนกัน"
      },
      {
        "n": 5,
        "title": "ส่งงานแบบที่กรรมการตัดสินง่าย",
        "body": "เปิด brief แล้วแปลงเป็น checklist ทีละข้อ — ความยาว, format, ต้องแนบอะไร, ต้อง tag ใคร, ต้องลองใช้ product จริงไหม ทำให้ครบทุกข้อก่อนค่อยคิดเรื่องความสวย ตั้งลิงก์เป็น public แล้วลองเปิดใน incognito เช็คว่าเข้าถึงได้จริง และเขียนสรุป 3-5 บรรทัดว่าคุณทำอะไร ใช้วิธีไหน ได้ผลลัพธ์อะไร sponsor มีเวลาให้งานคุณประมาณ 60 วินาที ทำให้ 60 วินาทีนั้นเข้าใจง่ายที่สุดครับ"
      },
      {
        "n": 6,
        "title": "ตามฟีดวันละ 15 นาที และรู้ว่าหลังชนะต้องทำอะไรต่อ",
        "body": "เข้า Earn วันละครั้ง ใช้ filter ตาม skill และ region ของคุณ ไล่ดูของใหม่ราว 10 นาที แล้วจดไว้ 2-3 listing ที่น่าลง ตาม X และ Discord ของ Superteam ด้วย เพราะงานหลายอันถูกพูดถึงที่นั่นก่อนคนทั่วไปจะเห็นในฟีด ถ้าชนะ คุณต้องกรอก payment form (และ KYC ถ้าเข้าเงื่อนไข) แล้วปกติรออีกประมาณ 7 วันกว่าเงินจะเข้า wallet ไม่ใช่เข้าทันทีที่ประกาศผลนะครับ"
      }
    ],
    "plays": [
      {
        "title": "คิดค่าคาดหวัง (EV) ก่อนลงมือทุกครั้ง",
        "body": "EV คร่าว ๆ = pool ÷ จำนวน submissions แล้วคูณด้วย edge จริงของคุณ content bounty pool $1,000 ที่มีคนส่ง 300 คน เท่ากับเฉลี่ยหัวละ $3.3 และถ้าคุณเพิ่งเริ่ม edge คุณยังต่ำกว่าค่าเฉลี่ยด้วยซ้ำ นั่นคือหวยครับ ส่วน dev bounty pool $2,000 ที่มีคนส่ง 12 คน เท่ากับหัวละ $167 และถ้าคุณเขียนโค้ดได้จริง edge อาจเป็น 3-5 เท่าของค่าเฉลี่ย งานที่สองใช้เวลามากกว่า 5 เท่า แต่คุ้มกว่าหลายสิบเท่า",
        "tags": [
          "EV",
          "เลือกงาน",
          "ตัวเลข"
        ]
      },
      {
        "title": "ไปในสนามที่คนไม่ไป",
        "body": "bounty สาย dev (Rust / Anchor / TypeScript SDK) และสาย design/motion มักมีคนส่ง 5-30 คน ขณะที่ content bounty แบบ 'เขียน thread' หรือ 'ตัดคลิปสั้น' ที่เงินพอ ๆ กันมีคนส่ง 150-400 คน คู่แข่งต่างกัน 10-30 เท่าโดยที่ pool แทบไม่ต่างกันเลย ถ้าคุณเขียนโค้ดหรือทำ design ได้ระดับพอใช้ อย่าไปแย่งในสนาม content ครับ และถ้ายังทำไม่ได้ การลงแรง 2-3 เดือนเรียน Anchor คือการย้ายตัวเองไปสนามที่คู่แข่งน้อยกว่าเป็นสิบเท่าแบบถาวร",
        "tags": [
          "dev",
          "design",
          "คู่แข่งน้อย"
        ]
      },
      {
        "title": "ใช้ regional listing ให้เป็นอาวุธ",
        "body": "Superteam มี chapter แยกตามภูมิภาค และ listing จำนวนมากเปิดเฉพาะคนใน region นั้น ตั้ง region ในโปรไฟล์ให้ตรงกับที่คุณอยู่จริง แล้วไล่ดู listing ฝั่งเอเชียตะวันออกเฉียงใต้ที่คุณมีสิทธิ์ ถ้า listing หนึ่งเป็น global มีคนส่ง 250 คน แต่อีกอันจำกัด region มีคนส่ง 18 คน โอกาสต่างกันเกือบ 14 เท่าทั้งที่เหนื่อยพอกัน และอย่าโกหกเรื่อง region นะครับ ตอน KYC เขาเช็คจริง",
        "tags": [
          "region",
          "SEA",
          "คู่แข่งน้อย"
        ]
      },
      {
        "title": "แยกให้ออกว่า Bounty, Project, Grant ต่างกันตรงไหน",
        "body": "Bounty คือการแข่ง ทุกคนทำงานเต็มที่แต่ได้เงินไม่กี่คน = จ่ายค่าดวงบวกคุณภาพ ส่วน Project คือการสมัครงาน ส่ง proposal กับ portfolio แล้วเขาเลือกคนเดียวไปทำ = จ่ายค่าเวลา คนที่มี proof-of-work อยู่แล้วควรยิง Project ให้มากขึ้น เพราะเขียน proposal 45 นาทีเพื่อชิง 1 ใน 15 ดีกว่าลงแรงทำงานจริง 12 ชั่วโมงเพื่อชิง 1 ใน 300 ครับ",
        "tags": [
          "Projects",
          "Bounties",
          "กลยุทธ์"
        ]
      },
      {
        "title": "Grants คือประตูที่แทบไม่มีคนเคาะ",
        "body": "Grant ไม่มี deadline ให้แข่งกัน ไม่มีตัวเลข submissions ให้เห็น และมีคนสมัครน้อยเรื้อรังเพราะต้องเขียน scope เอง ซึ่งคนส่วนใหญ่ขี้เกียจทำ ถ้าคุณมีของที่อยากสร้างจริง เขียนให้ชัด: ปัญหาคืออะไร ใครจะใช้ คุณจะส่งมอบอะไรใน 4-8 สัปดาห์ แบ่งเป็น milestone กี่ก้อน ขอเท่าไหร่และเอาไปทำอะไรบ้าง แล้วแนบลิงก์ของเก่าที่เคยทำ ขอ $5,000 สำหรับงานที่ scope ชัด มีโอกาสมากกว่าไปชิง bounty $5,000 ที่มีคนส่ง 200 คนอยู่มากครับ",
        "tags": [
          "Grants",
          "scope",
          "คู่แข่งน้อย"
        ]
      },
      {
        "title": "อ่านงานที่ sponsor เคยเลือก ก่อนเริ่มทำงานชิ้นแรก",
        "body": "เปิดหน้าของ sponsor นั้นแล้วดู listing เก่าที่ปิดไปแล้ว คลิกดูงานที่ชนะจริง 3-5 ชิ้น แล้วจดว่า: ยาวแค่ไหน ลงลึกระดับไหน มีโค้ด ตัวเลข หรือภาพประกอบไหม โทนเป็นทางการหรือกันเอง แล้วทำงานให้ตรงกับสิ่งที่เขาเลือกจริง ไม่ใช่สิ่งที่คุณคิดเองว่าดี 20 นาทีตรงนี้เปลี่ยนผลลัพธ์มากกว่าการนั่งขัดงานเพิ่มอีก 3 ชั่วโมง",
        "tags": [
          "research",
          "sponsor",
          "ก่อนเริ่ม"
        ]
      },
      {
        "title": "ส่งเร็วพอที่จะได้ feedback ไม่ใช่ส่งตอนตี 3 ของวันสุดท้าย",
        "body": "ส่งก่อนปิดสัก 3-5 วัน sponsor หลายรายเข้ามาดูงานระหว่างทางและคอมเมนต์ บาง listing ยังแก้ submission ได้ก่อนปิดรับ แปลว่าคุณได้แก้ตามคำใบ้ของกรรมการแบบฟรี ๆ ส่วนคนที่ส่งนาทีสุดท้ายต้องเจอ sponsor ที่กำลังไล่อ่านงาน 300 ชิ้นรวดเดียวและเหนื่อยแล้ว งานที่มาถึงตอนนั้นต้องดีกว่าเดิมมากเพื่อให้ถูกมองเห็นเท่ากัน",
        "tags": [
          "timing",
          "feedback",
          "deadline"
        ]
      },
      {
        "title": "สะสม submission ให้กลายเป็น portfolio ที่พาไปถูกจ้าง",
        "body": "ทุก submission เป็นงานสาธารณะที่ผูกกับโปรไฟล์คุณไปตลอด ต่อให้แพ้ก็ยังเป็นหลักฐานว่าคุณทำงานจริง ส่ง 10 ครั้งในสามเดือนแล้วชนะ 1 ครั้ง คุณไม่ได้มีแค่เงินก้อนเดียว — คุณมีงาน 10 ชิ้นให้ชี้ตอนสมัคร Project หรือตอนมีทีมทักมาใน DM เงินก้อนใหญ่จริง ๆ ใน ecosystem นี้มาจากการถูกจ้างเป็น contractor ต่อเนื่อง ไม่ใช่จากการชนะ bounty รัว ๆ ครับ",
        "tags": [
          "proof-of-work",
          "portfolio",
          "ระยะยาว"
        ]
      },
      {
        "title": "ใช้ความได้เปรียบเรื่องภาษาและ timezone ของคนไทย",
        "body": "งาน localization ภาษาไทย, ทำ docs หรือ tutorial ภาษาไทย, จัด community call ภาษาไทย, จัด meetup ในกรุงเทพฯ — พวกนี้คู่แข่งมักมีแค่หลักหน่วยถึงหลักสิบ เทียบกับ bounty ภาษาอังกฤษที่ต้องชนกับคนทั้งอินเดียและเวียดนาม และการอยู่ UTC+7 ทำให้คุณทำงานเสร็จตอนที่ทีมฝั่ง US เพิ่งตื่น ถ้า listing เปิดตอนเช้าเวลาไทย คุณมีเวลาเกือบทั้งวันก่อนคู่แข่งฝั่งตะวันตกจะเริ่มด้วยซ้ำ",
        "tags": [
          "ไทย",
          "localization",
          "timezone"
        ]
      },
      {
        "title": "ถ้าอ่านโค้ดได้ ให้ดู bug bounty และงาน audit",
        "body": "หลายโปรเจกต์บน Solana มีหน้า security หรือโปรแกรม bug bounty ของตัวเอง จ่ายตั้งแต่หลักพันถึงหลักแสนดอลลาร์ตามความรุนแรงของบั๊ก และคนแข่งน้อยกว่ามากเพราะต้องอ่าน Rust/Anchor เป็นจริง ๆ แต่พูดกันตรง ๆ ว่านี่คืองานที่อาจนั่งอ่านทั้งเดือนแล้วไม่เจออะไรเลยและได้ $0 เหมาะเป็นเป้าระยะกลางหลังคุณอ่าน program ได้คล่องแล้ว ไม่ใช่งานชิ้นแรกครับ",
        "tags": [
          "bug bounty",
          "audit",
          "Rust"
        ]
      }
    ],
    "mistakes": [
      {
        "title": "ยิงรัว ๆ 20 อันแบบลวก",
        "body": "ส่ง 20 submission ลวก ๆ ใน 1 สัปดาห์ แพ้ทั้งหมดแทบจะแน่นอน แถมยังทิ้งร่องรอยงานคุณภาพต่ำไว้ในโปรไฟล์สาธารณะของคุณด้วย 2 ชิ้นที่ทุ่มจริงต่อสัปดาห์ชนะกว่าเสมอครับ"
      },
      {
        "title": "ข้ามข้อบังคับที่ brief เขียนไว้ชัด ๆ",
        "body": "รอบแรก sponsor คัดโดยการตัดคนที่ทำไม่ครบตาม brief ทิ้ง ไม่ใช่โดยการมองหาคนเก่งที่สุด ลืม tag, ลิงก์เปิดไม่ได้, ยาวเกินกำหนด, ส่งผิด format = ตกรอบตั้งแต่ยังไม่มีใครอ่านเนื้อหาของคุณเลย"
      },
      {
        "title": "ไล่ล่า pool ที่ใหญ่ที่สุดในหน้าแรก",
        "body": "pool ใหญ่ดึงคนเยอะเป็นเงาตามตัว bounty $10,000 ที่มีคนส่ง 500 คน มีค่าคาดหวังแย่กว่า bounty $1,500 ที่มีคนส่ง 15 คนหลายเท่า ให้ดูอัตราส่วน อย่าดูแค่ตัวเลขใหญ่"
      },
      {
        "title": "ไม่เตรียม wallet และ KYC ไว้ล่วงหน้า",
        "body": "ชนะแล้วค่อยไปหา wallet ค่อยไปรื้อหาพาสปอร์ต = เงินค้างเป็นสัปดาห์หรือเป็นเดือน บาง sponsor ยังมีกำหนดเวลาให้กรอกฟอร์มด้วย พลาดแล้วยุ่งครับ เตรียมให้เสร็จตั้งแต่ยังไม่ชนะ"
      },
      {
        "title": "แพ้ 2 ครั้งแล้วเลิก",
        "body": "คนที่ได้เงินก้อนแรกส่วนใหญ่ส่งมาแล้ว 5-10 ครั้งแบบจริงจัง การเลิกที่ครั้งที่ 2 คือจ่ายค่าเรียนรู้ไปแล้วแต่ไม่รับปริญญา ถ้าจะเลิกควรเลิกเพราะตัวเลขไม่ขยับหลังส่งจริงจัง 10 ครั้ง ไม่ใช่เพราะเสียใจ"
      },
      {
        "title": "ส่ง output จาก AI แบบดิบ ๆ",
        "body": "ใช้ AI ช่วยร่าง ช่วยดีบัก ช่วยเกลาภาษาอังกฤษได้หมดครับ แต่งานที่ไม่มี research ของตัวเอง ไม่มีตัวเลขจริง ไม่เคยลองใช้ product จริง กรรมการดูออกภายใน 10 วินาที เพราะวันนั้นเขาเพิ่งอ่านงานหน้าตาเหมือนกันมาแล้ว 50 ชิ้น"
      },
      {
        "title": "พลาด deadline เพราะ timezone",
        "body": "deadline บนเว็บแสดงตามโซนเวลาที่กำหนด ไม่ใช่ 'เที่ยงคืนบ้านคุณ' ไทยคือ UTC+7 ซึ่งเร็วกว่า UTC อยู่ 7 ชั่วโมง ตั้งเตือนไว้ 24 ชั่วโมงก่อนปิด แล้วตั้งเป้าส่งจริงก่อนหน้านั้นอีกชั้นหนึ่ง"
      },
      {
        "title": "ลาออกจากงานประจำมาล่า bounty",
        "body": "อย่าครับ รายได้จาก Earn ไม่สม่ำเสมอโดยธรรมชาติ เดือนนี้ $0 เดือนหน้า $800 เป็นเรื่องปกติมาก ทำควบคู่ไปก่อนจนกว่าจะมีคนจ้างเป็นสัญญาต่อเนื่อง ตรงนั้นค่อยมาคุยกันเรื่องเปลี่ยนงาน"
      }
    ],
    "faq": [
      {
        "q": "ต้องเขียนโค้ดเป็นไหมถึงจะหาเงินได้?",
        "a": "ไม่จำเป็นครับ มี bounty สาย content, design, video, research และ community อยู่ตลอด แต่ต้องรู้ความจริงว่าฝั่ง non-code แข่งหนักกว่ามาก content bounty มีคนส่งหลักร้อยเป็นเรื่องปกติ ขณะที่ dev bounty อยู่หลักสิบ ถ้าไม่เขียนโค้ด ทางรอดคือเลือก niche ให้แคบลง เช่น design บวก motion, research เชิงลึก หรืองานภาษาไทยโดยเฉพาะ"
      },
      {
        "q": "ได้เงินเร็วแค่ไหน?",
        "a": "ไม่ใช่วันเดียวแน่นอนครับ ลำดับคือ ปิดรับ → sponsor ตัดสิน (ไม่กี่วันถึงหลายสัปดาห์) → ประกาศผล → คุณกรอก payment form และ KYC ถ้าเข้าเงื่อนไข → โอนจริง ซึ่งปกติราว 7 วันหลังกรอกฟอร์ม และช้ากว่านั้นได้ถ้า sponsor ช้า จ่ายเป็นสเตเบิลคอยน์ (USDC หรือ USDG) เข้า wallet Solana ที่คุณใส่ไว้ อย่าวางแผนเอาเงินก้อนนี้ไปจ่ายค่าเช่าเดือนนี้"
      },
      {
        "q": "ต้องทำ KYC ไหม?",
        "a": "listing ที่ Superteam หรือ Solana Foundation เป็นสปอนเซอร์ต้องผ่าน KYC ก่อนจ่ายเงิน ใช้เอกสารระบุตัวตนอย่างพาสปอร์ตหรือบัตรประชาชน และชื่อต้องตรงกับที่กรอกในโปรไฟล์ ส่วน listing ของ sponsor รายอื่นขึ้นอยู่กับเงื่อนไขของแต่ละราย อ่านในหน้า listing ให้จบก่อนลงมือทำงานครับ"
      },
      {
        "q": "ใช้ AI ช่วยได้ไหม?",
        "a": "ได้ครับถ้า brief ไม่ได้ห้าม ใช้เป็นเครื่องมือ — ร่าง outline, ดีบัก, ตรวจภาษาอังกฤษ, ทำ draft แรก แต่ส่งข้อความดิบจาก AI โดยไม่มีมุมของตัวเองคือแพ้แน่นอน บาง listing ระบุชัดว่าห้ามหรือให้แจ้ง ถ้าไม่ทำตามอาจโดนตัดสิทธิ์ อ่าน brief ทุกครั้ง"
      },
      {
        "q": "ถ้าแพ้ ได้อะไรกลับมาบ้าง?",
        "a": "ได้ $0 ครับ พูดกันตรง ๆ เวลาที่ลงไปไม่มีใครคืนให้ สิ่งที่เหลือคือ submission สาธารณะที่ใช้เป็น portfolio ได้, ความเข้าใจว่า sponsor ตัดสินจากอะไร, และบางครั้งก็มี feedback หรือคนในทีม sponsor ที่จำชื่อคุณได้ นี่คือเหตุผลที่ควรเลือกทำงานที่ต่อให้แพ้ก็ยังเอาไปโชว์ได้ ไม่ใช่งานทิ้งขว้าง"
      },
      {
        "q": "มือใหม่เดือนแรกได้จริงเท่าไหร่?",
        "a": "ตรง ๆ เลยครับ ส่วนใหญ่ได้ $0 ในเดือนแรก คนที่ได้มักได้จาก bounty เดียวราว $250-$1,000 หลังส่งงานจริงจังไปหลายครั้ง อย่าตั้งเป้าเป็นรายได้ต่อเดือน ให้ตั้งเป้าเป็น 'ส่งงานคุณภาพ 6 ชิ้นใน 8 สัปดาห์' แล้ววัดผลจากจำนวนคนที่ทักมาคุยเรื่องจ้างงาน เพราะเงินที่ยั่งยืนกว่ามาจากการถูกจ้าง ไม่ใช่จากการถูกหวย"
      },
      {
        "q": "อยู่ประเทศไทยทำได้ไหม?",
        "a": "ได้ครับ งานเป็น remote และส่งออนไลน์ทั้งหมด listing ที่เป็น global เปิดให้ทุกที่ ส่วน regional listing ต้องตรงกับ region ที่คุณตั้งไว้จริง เรื่องภาษีและกฎเกณฑ์คริปโตในไทยผมไม่ให้คำแนะนำตรงนี้ — เก็บหลักฐานการรับเงินให้ครบ และปรึกษาผู้เชี่ยวชาญด้านภาษีเมื่อเริ่มมีรายได้เป็นเรื่องเป็นราว"
      },
      {
        "q": "ควรให้เวลากับมันสัปดาห์ละเท่าไหร่?",
        "a": "8-12 ชั่วโมงต่อสัปดาห์กำลังพอดีสำหรับคนที่ยังมีงานประจำ แบ่งเป็น 1 ชั่วโมงหาและคัด listing, 6-9 ชั่วโมงทำงานจริง 1-2 ชิ้น และ 1 ชั่วโมงไล่อ่านงานที่คนอื่นชนะเพื่อเรียนรู้รูปแบบ ทำแบบนี้ 8 สัปดาห์แล้วค่อยประเมินว่าจะไปต่อไหมครับ"
      }
    ]
  },
  "en": {
    "title": "Actually Earning on Superteam Earn: The Honest Playbook",
    "subtitle": "A concrete plan for a Thai builder who just found superteam.fun/earn — with real numbers, real constraints, and no promised income.",
    "steps": [
      {
        "n": 1,
        "title": "Sign up, verify your email, and finish your profile in 20 minutes",
        "body": "Go to superteam.fun/earn, register with an email you actually use, and confirm it — without verification you cannot submit. Then fill the profile out completely: name, a short bio that says what you can do, skills you genuinely have (not every checkbox), the region you actually live in, and links to GitHub / X / Behance / Dribbble / your own site. Sponsors open your profile before they judge you. An empty profile is the easiest reason they will ever have to skip you."
      },
      {
        "n": 2,
        "title": "Set up a Solana wallet and get your KYC documents ready on day one",
        "body": "Install Phantom, Solflare or Backpack, create a wallet, keep the seed phrase offline, and never send it to anyone — not even someone claiming to be from the team. Put the address in your Earn profile. Rewards pay in dollar stablecoins on Solana — usually USDC or USDG; check the address twice, because a wrong transfer is gone permanently. Also have your passport or national ID ready: listings sponsored by Superteam or the Solana Foundation require KYC before payout, and the name on the document must match the name you entered."
      },
      {
        "n": 3,
        "title": "Build three pieces of proof-of-work before you compete",
        "body": "Before your first submission, make three of your own pieces that anyone can understand in 30 seconds: a repo that actually runs with a readable README, a one-page Figma or case study, one article with real data instead of hot air. Collect them behind a single link — Notion, GitHub Pages or your own site all work. This is what makes a sponsor willing to pick someone who has never won anything yet."
      },
      {
        "n": 4,
        "title": "Choose your first listing with numbers, not with excitement",
        "body": "Before starting, check five things: current submission count, pool size, time remaining, type (Bounty / Project / Grant), and whether the work matches something you are genuinely good at. A usable filter for your first one: fewer than 25 submissions, a pool of $1,000 or more, and at least 5 days left. If nothing qualifies today, do not force a submission — tomorrow is fine. Declining a bad expected-value listing is also a decision."
      },
      {
        "n": 5,
        "title": "Submit in a way that makes the judge's job easy",
        "body": "Turn the brief into a line-by-line checklist — length, format, required attachments, who to tag, whether you must actually use the product. Clear every item before you think about polish. Make your links public and test them in an incognito window to confirm they open. Then write a 3-5 line summary of what you did, how you did it, and what the result was. A sponsor gives your entry about 60 seconds; make those 60 seconds as easy as possible."
      },
      {
        "n": 6,
        "title": "Work the feed 15 minutes a day, and know what happens after you win",
        "body": "Open Earn once a day, filter by your skills and region, scan new listings for about 10 minutes, and note the 2-3 worth entering. Follow Superteam on X and Discord too, since many listings get talked about there before most people see them in the feed. If you win, you fill out a payment form (plus KYC if it applies) and then typically wait around 7 days for the funds to hit your wallet — not instantly at announcement."
      }
    ],
    "plays": [
      {
        "title": "Calculate expected value before you start anything",
        "body": "Rough EV = pool ÷ submissions, multiplied by your real edge. A content bounty with a $1,000 pool and 300 submissions averages $3.3 per entrant — and as a beginner your edge is below average, so that is a lottery ticket. A dev bounty with a $2,000 pool and 12 submissions averages $167 per entrant, and if you can genuinely code your edge may be 3-5x average. The second one takes five times the hours and is worth many times more.",
        "tags": [
          "EV",
          "listing selection",
          "numbers"
        ]
      },
      {
        "title": "Go where the crowd isn't",
        "body": "Dev bounties (Rust / Anchor / TypeScript SDK) and design/motion bounties typically draw 5-30 submissions, while a similarly paid content bounty — 'write a thread', 'cut a short video' — draws 150-400. That is 10-30x the competition for roughly the same pool. If you can code or design at even a decent level, stop fighting in the content arena. And if you can't yet, spending 2-3 months learning Anchor permanently moves you into a field with a fraction of the entrants.",
        "tags": [
          "dev",
          "design",
          "less competition"
        ]
      },
      {
        "title": "Use regional listings as a weapon",
        "body": "Superteam runs regional chapters, and many listings are open only to people in that region. Set the region on your profile to where you genuinely live, then work through the Southeast Asian listings you are eligible for. If one global listing has 250 submissions and a regional one has 18, that is nearly 14x better odds for the same amount of work. Do not lie about your region — it gets checked at KYC.",
        "tags": [
          "region",
          "SEA",
          "less competition"
        ]
      },
      {
        "title": "Know the difference between Bounties, Projects and Grants",
        "body": "A Bounty is a contest: everyone does the full work, only a few get paid — you are being paid for luck plus quality. A Project is a job application: you send a proposal and portfolio, one person is chosen to do the work — you are being paid for your time. Once you have proof-of-work, lean harder into Projects: a 45-minute proposal with a 1-in-15 shot beats 12 hours of real work for a 1-in-300 shot.",
        "tags": [
          "Projects",
          "Bounties",
          "strategy"
        ]
      },
      {
        "title": "Grants are the door almost nobody knocks on",
        "body": "Grants have no competing deadline, no visible submission counter, and are chronically under-applied-for because you have to define the scope yourself and most people can't be bothered. If you have something you genuinely want to build, spell it out: what problem, who uses it, what you will ship in 4-8 weeks, how many milestones, how much you're asking for and what it pays for, plus links to past work. Asking for $5,000 on a tightly scoped build is a far better bet than chasing a $5,000 bounty with 200 entrants.",
        "tags": [
          "Grants",
          "scope",
          "less competition"
        ]
      },
      {
        "title": "Read the sponsor's past winners before you write a line",
        "body": "Open the sponsor's page and look at their closed listings. Click through 3-5 entries that actually won and write down: how long they were, how deep they went, whether they included code, numbers or visuals, and whether the tone was formal or casual. Then build what that sponsor actually picks, not what you assume is good. Those 20 minutes change the outcome more than 3 extra hours of polishing.",
        "tags": [
          "research",
          "sponsor",
          "before you start"
        ]
      },
      {
        "title": "Submit early enough to get feedback, not at 3am on the last night",
        "body": "Submit 3-5 days before close. Many sponsors review entries as they arrive and leave comments, and some listings let you edit your submission before the deadline — which means you get to revise on the judge's own hints, for free. Last-minute entrants meet a sponsor burning through 300 submissions in one sitting and already tired. Work arriving then has to be much better just to get the same attention.",
        "tags": [
          "timing",
          "feedback",
          "deadline"
        ]
      },
      {
        "title": "Stack submissions into a portfolio that gets you hired",
        "body": "Every submission is public work permanently attached to your profile. Even a loss is evidence that you ship. Submit 10 times over three months and win once, and you don't just have one payout — you have 10 pieces to point at when you apply for a Project or when a team slides into your DMs. The real money in this ecosystem comes from being hired on an ongoing contract, not from winning bounty after bounty.",
        "tags": [
          "proof-of-work",
          "portfolio",
          "long game"
        ]
      },
      {
        "title": "Use your language and timezone advantage as a Thai builder",
        "body": "Thai localization, Thai-language docs and tutorials, Thai community calls, a Bangkok meetup — these usually attract single-digit or low-double-digit competition, versus English bounties where you are up against all of India and Vietnam. And being at UTC+7 means you finish work while US teams are just waking up. When a listing drops in the Thai morning, you get most of a working day before Western competitors even start.",
        "tags": [
          "Thailand",
          "localization",
          "timezone"
        ]
      },
      {
        "title": "If you can read code, look at bug bounties and audit programmes",
        "body": "Many Solana projects run their own security page or bug bounty programme, paying from a few thousand to six figures depending on severity, with far fewer competitors because you must genuinely read Rust/Anchor. But honestly: you can spend a month reading programs, find nothing, and earn $0. Treat it as a mid-term target once you read programs fluently, not as your first listing.",
        "tags": [
          "bug bounty",
          "audit",
          "Rust"
        ]
      }
    ],
    "mistakes": [
      {
        "title": "Mass-submitting 20 low-effort entries",
        "body": "Twenty rushed submissions in one week will almost certainly lose all twenty, and they leave a public trail of weak work attached to your profile. Two seriously worked entries per week beat that every time."
      },
      {
        "title": "Ignoring the brief's explicit requirements",
        "body": "The first cut is the sponsor deleting everyone who didn't follow the brief, not hunting for the most talented person. A missing tag, a link that won't open, going over the length limit, the wrong format — you're out before anyone reads a word of your actual work."
      },
      {
        "title": "Chasing the biggest pool on the front page",
        "body": "Big pools pull big crowds. A $10,000 bounty with 500 submissions has far worse expected value than a $1,500 bounty with 15. Look at the ratio, not the headline number."
      },
      {
        "title": "Not having your wallet and KYC ready in advance",
        "body": "Hunting for a wallet and digging out your passport after you win means your money sits in limbo for weeks or months. Some sponsors also set a deadline for the payment form, and missing it gets messy. Get it all done before you win anything."
      },
      {
        "title": "Quitting after two losses",
        "body": "Most people who land a first payout had already made 5-10 serious submissions. Quitting at attempt two means paying the tuition and never collecting the degree. If you quit, quit because the numbers haven't moved after 10 serious attempts, not because you feel bad."
      },
      {
        "title": "Shipping raw AI output",
        "body": "Use AI to draft, to debug, to clean up your English — all fine. But an entry with no research of your own, no real numbers, and no evidence you actually used the product is spotted in 10 seconds, because the judge already read 50 entries that look exactly like it that same day."
      },
      {
        "title": "Missing the deadline on a timezone mistake",
        "body": "The deadline shown on the site is in a specific timezone, not 'midnight at your house'. Thailand is UTC+7, seven hours ahead of UTC. Set a reminder 24 hours before close, and aim to submit well before that."
      },
      {
        "title": "Quitting your job to chase bounties",
        "body": "Don't. Earn income is inherently lumpy — $0 this month and $800 the next is completely normal. Run it alongside your job until someone hires you on an ongoing contract. That's the point where changing jobs is worth discussing."
      }
    ],
    "faq": [
      {
        "q": "Do I need to code to make money here?",
        "a": "No. There are always content, design, video, research and community bounties. But be realistic: the non-code side is far more crowded — content bounties routinely draw hundreds of submissions while dev bounties draw dozens. If you don't code, your way through is a narrower niche: design plus motion, deep research, or Thai-language work specifically."
      },
      {
        "q": "How fast do I get paid?",
        "a": "Not the same day. The sequence is: submissions close → sponsor judges (a few days to several weeks) → winners announced → you fill the payment form and KYC if it applies → the transfer, which typically takes around 7 days after the form, and longer if the sponsor is slow. Payment is a dollar stablecoin — USDC or USDG — to the Solana wallet on your profile. Don't plan to pay this month's rent with it."
      },
      {
        "q": "Do I need KYC?",
        "a": "Listings sponsored by Superteam or the Solana Foundation require KYC before payout — an ID document such as a passport or national ID, with the name matching your profile. Other sponsors set their own conditions. Read the listing page fully before you start working."
      },
      {
        "q": "Can I use AI?",
        "a": "Yes, if the brief doesn't forbid it. Use it as a tool — outlining, debugging, polishing your English, producing a first draft. But submitting raw AI text with no point of view of your own loses. Some listings explicitly ban it or require disclosure, and ignoring that can disqualify you. Read the brief every time."
      },
      {
        "q": "What do I get if I lose?",
        "a": "$0. Bluntly: nobody reimburses the hours. What remains is a public submission you can use as portfolio material, a clearer understanding of how sponsors judge, and sometimes feedback or someone on the sponsor's team remembering your name. That's why you should pick work that's still worth showing even when it loses, not throwaway entries."
      },
      {
        "q": "How much can a realistic beginner make in month one?",
        "a": "Straight answer: most people make $0 in their first month. Those who do earn something usually land a single bounty worth roughly $250-$1,000 after several serious submissions. Don't set a monthly income target; set a target like 'six quality submissions in eight weeks' and measure how many people reach out about hiring you. The durable money comes from being hired, not from winning the lottery."
      },
      {
        "q": "Is this available from Thailand?",
        "a": "Yes. Everything is remote and submitted online. Global listings are open everywhere; regional listings require the region on your profile to be genuinely yours. On Thai tax and crypto regulations I won't advise you — keep complete records of what you receive and talk to a tax professional once the income becomes meaningful."
      },
      {
        "q": "How many hours a week should I give this?",
        "a": "8-12 hours a week is about right if you still have a day job: 1 hour finding and filtering listings, 6-9 hours doing real work on one or two entries, and 1 hour reading other people's winning submissions to learn the patterns. Run that for eight weeks, then decide whether to continue."
      }
    ]
  }
};
