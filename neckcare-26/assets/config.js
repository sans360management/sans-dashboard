/* ============================================================
   Sans Wellness · 26 周年「元气肩颈」免费体验会
   Neckcare Open House — 配置文件
   只需要改这个档案，其他档案都不用碰。
   ============================================================ */

window.SANS26_CONFIG = {

  /* ---- 1. 表单送出方式 ------------------------------------
     'iframe' = 直接嵌入 GHL 内建表单（这一页用这个）
     'custom' = 用本页自订表单，POST 到 GHL Inbound Webhook
  --------------------------------------------------------- */
  formMode: 'iframe',

  /* formMode: 'iframe' 时使用 —— GHL 表单的 Embed URL
     GHL → Sites → Forms → 选表单 → Integrate → 复制 iframe 的 src

     ⚠️ 这一场要用**新开的一份表单**（跟周年庆 VIP 邀请那份分开），
        建好之后把网址贴进下面这行就会自动生效。
        留空 = 示范模式：显示占位提示，页面不会破。 */
  ghlFormEmbedUrl: '',

  /* formMode: 'custom' 时使用 —— GHL Workflow 的 Inbound Webhook URL */
  ghlWebhookUrl: '',

  /* 送出成功后要不要跳转？留空 = 留在本页显示成功讯息 */
  redirectAfterSubmit: '',

  /* ---- 2. 活动资料（双语）--------------------------------- */
  event: {
    date:    { en: 'Friday, 4 September 2026',      zh: '2026年9月4日（星期五）' },
    time:    { en: '10:30 AM — 6:00 PM',            zh: '上午 10:30 — 傍晚 6:00' },
    duration:{ en: 'About 2 hours per guest',       zh: '每位来宾约 2 小时' },
    venue:   { en: 'Sans Wellness Kota Damansara',  zh: 'Sans Wellness Kota Damansara' },
    address: {
      en: '32-1, Jalan PJU 5/16, Dataran Sunway Kota Damansara, 47810 Petaling Jaya, Selangor',
      zh: '32-1, Jalan PJU 5/16, Dataran Sunway Kota Damansara, 47810 Petaling Jaya, Selangor',
    },

    /* 倒数计时 + 加入日历用（马来西亚时间 UTC+8） */
    startISO: '2026-09-04T10:30:00+08:00',
    endISO:   '2026-09-04T18:00:00+08:00',
  },

  /* ---- 3. 交通连结 ---------------------------------------- */
  links: {
    googleMaps: 'https://maps.app.goo.gl/xucAu9Zn7V6siwYB9',
    waze: 'https://ul.waze.com/ul?place=ChIJ42iU_3tPzDERndfEFM8AKvk&ll=3.15293410%2C101.59231950&navigate=yes',
    /* 停车影片（Central Park Parking 指引）—— 有连结才会出现按钮 */
    parkingVideo: '',
    facebook: '',
    instagram: '',
  },

  /* ---- 4. 影片 --------------------------------------------
     brand        = 品牌介绍影片：填 YouTube ID（如 'dQw4w9WgXcQ'）
                    或 .mp4 完整网址都可以
     testimonials = 顾客见证影片：YouTube ID 阵列，最多放 3 支
     留空 = 该区块自动不显示，不会留下空洞。
  --------------------------------------------------------- */
  videos: {
    brand: '',
    testimonials: ['', '', ''],
  },

  /* ---- 5. 图片 --------------------------------------------
     把档案放进 assets/img/（档名一模一样）就会自动出现；
     档案不在时该处自动降级，页面不会破版。
     详细规格看 assets/img/README.md
  --------------------------------------------------------- */
  images: {
    logo:        'assets/img/logo.png',
    hero:        'assets/img/hero-neck.jpg',        // 主视觉：刮痧特写
    poster:      'assets/img/poster-neckcare.jpg',  // 直式海报（选用）
    sym1:        'assets/img/sym-1.jpg',            // 手麻痹 / 肩颈酸痛 / 富贵包
    sym2:        'assets/img/sym-2.jpg',            // 失眠 / 多梦 / 偏头痛
    sym3:        'assets/img/sym-3.jpg',            // 肩颈僵硬 / 头痛头晕
    sym4:        'assets/img/sym-4.jpg',            // 走路气喘 / 腿脚无力
    offer1:      'assets/img/offer-1.jpg',          // 元气肩颈疏通护理
    offer2:      'assets/img/offer-2.jpg',          // 1 对 1 健康咨询
    offer3:      'assets/img/offer-3.jpg',          // 4 合 1 健康检测
    valueGrid:   'assets/img/value-grid.jpg',       // 四宫格（NECKFIX STUDIO + 团队）
    awards:      'assets/img/awards.png',           // 奖项墙长条
    brandCover:  'assets/img/brand-video-cover.jpg',// 品牌影片封面（26 周年版）
  },

  /* ---- 6. 表单下拉：「你最想解决的问题」-------------------- */
  concerns: [
    { value: 'Neck & shoulder pain', en: 'Neck & shoulder pain, numb hands', zh: '肩颈酸痛、手麻痹' },
    { value: 'Headache & dizziness', en: 'Headaches, migraines, dizziness',   zh: '头痛、偏头痛、头晕' },
    { value: 'Insomnia',             en: 'Insomnia, restless sleep',          zh: '失眠、多梦' },
    { value: 'Dowager hump',         en: 'Dowager’s hump / posture',          zh: '富贵包、体态问题' },
    { value: 'Low energy',           en: 'Low energy, heavy legs',            zh: '疲倦无力、腿脚沉重' },
    { value: 'Others',               en: 'Something else',                    zh: '其他' },
  ],

  /* ---- 7. 名额（稀缺文案用）------------------------------- */
  capacity: 60,
};
