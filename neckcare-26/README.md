# Sans Wellness · 26 周年「元气肩颈」免费体验会

单页 Landing Page + 免费报名表单。纯静态、无 build、无框架、无依赖。
跟 `anniversary-26/` 是姐妹页 —— 同一套架构，各自独立演化，不共用档案。

```
neckcare-26/
├── index.html          ← 唯一页面（首页 + 报名表单都在这里）
└── assets/
    ├── config.js       ← ⭐ 只改这个：表单网址、活动资料、连结、影片、图片
    ├── i18n.js         ← 双语文案（EN / 中文）
    ├── styles.css      ← 品牌样式（跟周年庆页共用色票）+ 本页专属版型
    ├── app.js          ← 语言 / 图片 / 影片 / 倒数 / 数字滚动 / 地图
    ├── form.js         ← 表单验证 + 送出 GHL
    └── img/            ← ⭐ 把照片放这里，README 里有完整清单
```

---

## 内容来源

文案与结构参照用户提供的旧漏斗（`SW Parents' Day KD2 Open House`，
1–4 Aug 2025），把同样的三个免费项目——**元气肩颈疏通护理 / 1 对 1 健康咨询 /
4 合 1 健康检测**——换成 26 周年主题重新编排：

Hook → 症状自检 → 教育 → 免费项目 → 价值锚定 → 稀缺 → 品牌信任 →
顾客见证 → 场地 → 报名 → FAQ

跟旧漏斗不同的地方：
- 视觉换成周年庆色系（米白 + 品牌橙 + 深可可），不是深紫/红
- 双语 EN/中文（旧漏斗纯中文）
- CTA 顺序按转化漏斗重排，不是照抄旧页
- 「只有4天‖没有第二场」改写成「仅此一天 · 名额有限」（因为跟周年庆同一天办）

---

## 1. 活动资料（已填好）

`assets/config.js` 目前设定：2026 年 9 月 4 日（星期五）10:30 AM – 6:00 PM，
Sans Wellness Kota Damansara（跟 26 周年庆同一天）。

## 2. 表单（还没接）

这一场用**新开的一份 GHL 表单**（跟周年庆 VIP 邀请那份分开）。
建好之后，把 Embed URL 贴进 `assets/config.js`：

```js
formMode: 'iframe',
ghlFormEmbedUrl: '（GHL → Sites → Forms → 选表单 → Integrate → 复制 iframe 的 src）',
```

留空时页面会显示「示范模式」提示，不会破版，可以先看版面。

## 3. 图片（还没放）

全部是选配、缺档自动降级。完整清单跟规格看 `assets/img/README.md`。
目前只有 `logo.png`（复用周年庆页那份）。

## 4. 影片（还没接）

`assets/config.js` 的 `videos`：

```js
videos: {
  brand: '',                       // 品牌介绍影片：YouTube ID 或 .mp4 网址
  testimonials: ['', '', ''],      // 顾客见证，最多 3 支 YouTube ID
},
```

留空 = 对应区块整个不显示。顾客见证影片是「点击才载入」，不会一进页面就拉三个
YouTube iframe 拖慢速度。

## 5. 交通连结（部分已填）

```js
links: {
  googleMaps: '...',   // 已填
  waze: '...',         // 已填
  parkingVideo: '',    // 还没有 —— 停车指引影片连结
  facebook: '', instagram: '',
},
```

---

## 6. 放进 GHL

跟周年庆页完全同一套流程，唯一差别是**容器 id 和类别前缀不一样**
（`#sansnc` / `snc-` 前缀，而不是 `#sans26` / `s26-`），这样两个页面可以贴在
同一个 GHL site 里也不会互相打架。

```bash
cd neckcare-26
python3 build-ghl.py              # → dist/ghl-embed.html（图片走网址）
python3 build-ghl.py --embed-img  # → dist/ghl-embed-with-images.html（图片内嵌）
python3 build-single.py           # → dist/index.html（独立网页 / 预览用）
```

贴法：GHL → Funnels → 新增 Blank 页面步骤 → 加一个 Full Width Row（padding 归零）
→ 加 **Custom JS/HTML** 元素 → 整段贴进去 → Page 背景色设成 `#FDF6EC` → Save → Publish。

贴完检查：吸顶导览列会不会跟着滚动、手机固定报名列会不会出现、语言切换按钮、
表单高度会不会自动撑开。

本地预览：

```bash
cd neckcare-26
python3 -m http.server 8080   # http://localhost:8080
```

---

## 7. 已知要处理的事

- [ ] 三张 Offer 实拍、四张症状照、价值锚定四宫格、奖项墙、品牌影片封面 —— 全部待上传
- [ ] 品牌影片封面上写的「24 Years」要请设计重出成「26 Years」
- [ ] 新表单的 Embed URL
- [ ] 停车指引影片连结
- [ ] 品牌 / 顾客见证影片连结（YouTube ID）
