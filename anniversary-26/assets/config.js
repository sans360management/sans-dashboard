/* ============================================================
   Sans Wellness 26th Anniversary — 配置文件
   只需要改这个档案，其他档案都不用碰。
   ============================================================ */

window.SANS26_CONFIG = {

  /* ---- 1. GHL Inbound Webhook ----------------------------
     在 GHL 建立 Workflow → Trigger 选 "Inbound Webhook"
     → 复制 Webhook URL 贴在下面。
     留空的话表单会进入「示范模式」：不送出，只显示成功画面。
  --------------------------------------------------------- */
  ghlWebhookUrl: '',

  /* 送出成功后要不要跳转？留空 = 留在本页显示成功讯息 */
  redirectAfterSubmit: '',

  /* ---- 2. 活动资料（双语）---------------------------------
     ⚠️ 以下均为暂定值（TBC），请替换成正式资料。
  --------------------------------------------------------- */
  event: {
    date:    { en: 'To Be Confirmed',        zh: '日期待定' },
    time:    { en: '6:30 PM — 10:30 PM',     zh: '晚上 6:30 — 10:30' },
    venue:   { en: 'To Be Confirmed',        zh: '场地待定' },
    address: { en: 'Kuala Lumpur, Malaysia', zh: '马来西亚 吉隆坡' },
    dress:   { en: 'Formal / Cocktail',      zh: '正式 / 鸡尾酒着装' },
    rsvpBy:  { en: 'To Be Confirmed',        zh: '截止日期待定' },

    /* 填上正式日期后，登记成功页会自动出现「加入日历」按钮。
       格式：YYYY-MM-DDTHH:MM:SS（当地时间）。留空则不显示按钮。 */
    startISO: '',   // 例如 '2026-11-15T18:30:00'
    endISO:   '',   // 例如 '2026-11-15T22:30:00'
  },

  /* ---- 3. 联络方式 --------------------------------------- */
  contact: {
    name:     'Sans Wellness Event Team',
    phone:    '+60 12-000 0000',      // TBC
    whatsapp: '60120000000',          // TBC，纯数字含国码
    email:    'events@sanswellness.com', // TBC
  },

  /* ---- 4. 邀请类别（表单下拉选单）------------------------- */
  invitationCategories: [
    { value: 'VIP Guest',           en: 'VIP Guest',           zh: 'VIP 贵宾' },
    { value: 'Corporate Partner',   en: 'Corporate Partner',   zh: '企业伙伴' },
    { value: 'Business Associate',  en: 'Business Associate',  zh: '商业伙伴' },
    { value: 'Media',               en: 'Media / Press',       zh: '媒体' },
    { value: 'Industry Association',en: 'Industry Association',zh: '商会 / 公会' },
    { value: 'Sans Team',           en: 'Sans Team',           zh: 'Sans 团队' },
    { value: 'Others',              en: 'Others',              zh: '其他' },
  ],
};
