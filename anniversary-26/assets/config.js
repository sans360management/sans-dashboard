/* ============================================================
   Sans Wellness · the Legacy of Wellbeing (26th Anniversary)
   配置文件 —— 只需要改这个档案，其他档案都不用碰。
   ============================================================ */

window.SANS26_CONFIG = {

  /* ---- 1. 表单送出方式 ------------------------------------
     'custom' = 用本页自订表单，POST 到 GHL Inbound Webhook（推荐，
                样式完全可控，按钮已是品牌橙）
     'iframe' = 直接嵌入 GHL 内建表单（样式受 GHL 限制）
  --------------------------------------------------------- */
  formMode: 'iframe',

  /* formMode: 'custom' 时使用 —— GHL Workflow 的 Inbound Webhook URL
     留空 = 示范模式：可以走完整流程看画面，但不会送出资料 */
  ghlWebhookUrl: '',

  /* formMode: 'iframe' 时使用 —— GHL 表单的 Embed URL
     （GHL → Sites → Forms → 选表单 → Integrate → 复制 iframe 的 src）

     只有一份表单就填字串；想让 EN / 中文 各用一份表单，改成：
       ghlFormEmbedUrl: { en: 'https://.../form/AAA', zh: 'https://.../form/BBB' },
     切换语言时会自动换表单。 */
  ghlFormEmbedUrl: 'https://api.qiai.tech/widget/form/DqxErWPgs2XWAdiGcVui',

  /* 送出成功后要不要跳转？留空 = 留在本页显示成功讯息 */
  redirectAfterSubmit: '',

  /* ---- 2. 活动资料（双语）--------------------------------- */
  event: {
    date:    { en: 'Friday, 4 September 2026', zh: '2026年9月4日（星期五）' },
    time:    { en: '10:30 AM — 6:00 PM',       zh: '上午 10:30 — 傍晚 6:00' },
    venue:   { en: 'Sans Wellness Kota Damansara', zh: 'Sans Wellness Kota Damansara' },
    address: {
      en: '32-1, Jalan PJU 5/16, Dataran Sunway Kota Damansara, 47810 Petaling Jaya, Selangor',
      zh: '32-1, Jalan PJU 5/16, Dataran Sunway Kota Damansara, 47810 Petaling Jaya, Selangor',
    },
    dress:   { en: 'White / Orange', zh: '白色 / 橙色' },


    /* 倒数计时 + 加入日历用（马来西亚时间 UTC+8） */
    startISO: '2026-09-04T10:30:00+08:00',
    endISO:   '2026-09-04T18:00:00+08:00',
  },


  /* ---- 3. 邀请类别（表单下拉选单）-------------------------- */
  invitationCategories: [
    { value: 'VIP Guest',            en: 'VIP Guest',            zh: 'VIP 贵宾' },
    { value: 'Corporate Partner',    en: 'Corporate Partner',    zh: '企业伙伴' },
    { value: 'Business Associate',   en: 'Business Associate',   zh: '商业伙伴' },
    { value: 'Media',                en: 'Media / Press',        zh: '媒体' },
    { value: 'Industry Association', en: 'Industry Association', zh: '商会 / 公会' },
    { value: 'Sans Member',          en: 'Sans Member',          zh: 'Sans 会员' },
    { value: 'Sans Team',            en: 'Sans Team',            zh: 'Sans 团队' },
    { value: 'Others',               en: 'Others',               zh: '其他' },
  ],

  /* ---- 4. 图片 --------------------------------------------
     把档案放进 assets/img/ 就会自动出现；档案不在时页面会
     自动 fallback 到橙色「26」图形版，不会破版。
  --------------------------------------------------------- */
  images: {
    // hero-poster.jpg 是由你上传的 KV.png 压缩而来（1.87MB → 211KB）
    // 想换主视觉：丢新档进 assets/img/，把下面路径改掉即可
    poster: 'assets/img/hero-poster.jpg',
    logo:   'assets/img/SW_LOGO-removebg-preview.png',
    // 活动流程图 —— 档案放进去就会出现在 Programme 区块；没有就自动不显示
    programme: 'assets/img/programme.jpg',
  },
};
