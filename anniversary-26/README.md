# Sans Wellness · the Legacy of Wellbeing — 26th Anniversary

单页活动网站 + 嘉宾登记表单。纯静态、无 build、无框架、无依赖。

```
anniversary-26/
├── index.html          ← 唯一页面（首页 + 登记表单都在这里）
├── register.html       ← 旧连结转址用，会自动跳到 index.html#rsvp
└── assets/
    ├── config.js       ← ⭐ 只改这个：Webhook、活动资料、联络方式、图片
    ├── i18n.js         ← 双语文案（EN / 中文）
    ├── styles.css      ← 品牌样式 + 动画
    ├── app.js          ← 语言 / 图片 / 倒数 / 数字滚动 / 地图
    ├── form.js         ← 表单验证 + 送出 GHL
    └── img/            ← ⭐ 把海报和 Logo 放这里
```

---

## 1. 图片（已完成）

`assets/img/` 目前放着：

| 档案 | 说明 |
|---|---|
| `KV.png` | 主视觉原始档（1420×2000，1.87MB）—— 保留备用，网页不直接用 |
| `hero-poster.jpg` | 由 KV.png 压缩而来（1200×1690，211KB）—— **网页实际使用的是这张** |
| `SW_LOGO-removebg-preview.png` | 品牌 Logo，透明底，页脚会自动转白 |

要换主视觉：把新档丢进 `assets/img/`，改 `assets/config.js` 的 `images.poster` 路径即可。
新图请先压到 300KB 以内再上传 —— 直接用几 MB 的原始档，手机开起来会明显变慢。

档案万一遗失或路径打错，首页会自动 fallback 到橙色「26」图形版，不会破版。

---

## 2. 接上 GHL

### 方式 A：自订表单 → Inbound Webhook（预设，推荐）

样式完全可控，按钮已经是品牌橙 `#F08321`，不必进 GHL 编辑器改任何样式。

1. GHL → **Automation → Workflows → Create Workflow**
2. Trigger 选 **Inbound Webhook**，复制 URL
3. 贴进 `assets/config.js`：

```js
ghlWebhookUrl: 'https://services.leadconnectorhq.com/hooks/xxxxx/webhook-trigger/xxxxx',
```

4. 在网页送一笔测试资料 → 回 GHL 按 **Run Test / Fetch Sample** 抓栏位
5. 加 Action：**Create/Update Contact**，把栏位对上

### 方式 B：直接嵌 GHL 内建表单

如果你想用 GHL 表单编辑器管理栏位，改 `config.js`：

```js
formMode: 'iframe',
ghlFormEmbedUrl: '（GHL → Sites → Forms → Integrate → 复制 iframe 的 src）',
```

页面会用 iframe 显示 GHL 表单，其他版面照旧。代价是表单样式受 GHL 限制。

### 页面送出的栏位（方式 A）

| key | 内容 | 对应 GHL |
|---|---|---|
| `full_name` / `first_name` / `last_name` | 姓名 | 标准栏位 |
| `phone` | 完整号码含国码（`+60123456789`） | 标准栏位 Phone |
| `email` | 电邮 | 标准栏位 Email |
| `companyName` / `company` | 公司 | 标准栏位 Company Name |
| `designation` | 职位 | Custom Field |
| `invitation_category` | 邀请类别 | Custom Field |
| `invited_by` | 邀请人 | Custom Field |
| `form_language` | `en` / `zh`，可用来决定确认函语言 | Custom Field |
| `event` / `event_date` / `dress_code` / `source` / `page_url` / `submitted_at` | 来源标记 | 选用 |

> `designation`、`invitation_category`、`invited_by`、`form_language` 要先在
> **Settings → Custom Fields** 建好。

---

## 3. 动态效果一览

全部用原生 CSS/JS 做，没有任何外部函式库 —— 所以照样能整段贴进 GHL。

| 效果 | 说明 |
|---|---|
| 海报进场 + 缓慢缩放 | Ken Burns，26 秒一循环 |
| 漂浮橙色光晕 | 两颗，22 / 26 秒错开飘移 |
| 首屏依序淡入 | 标语 → 资讯 → 倒数 → 按钮 |
| **即时倒数** | 算到 2026-09-04 10:00（UTC+8）；当天自动变「活动进行中」，结束后变感谢语 |
| 数字滚动 | 26 / 12 滚到定位（滚到才触发） |
| 区块滚动淡入 | IntersectionObserver |
| 卡片 hover 浮起 | 图示同步放大 |
| **手机固定登记列** | 滑过首屏后从底部升起，进到表单区自动收起 |
| Google 地图 | 依 config 的地址自动生成，不需 API key |
| 加入日历 | 登记成功后出现，产生 .ics |

全部尊重 `prefers-reduced-motion`：使用者系统关了动画就自动静态化。

---

## 4. 放进 GHL 的做法

三选一：

**① GHL Funnel + Custom Code（一页搞定）**
1. 先把 `assets/` 里的图片上传到 GHL **Media Library**，拿到公开网址
2. 把 `config.js` 的 `images` 改成那些绝对网址
3. 产生单档版（CSS/JS 全内嵌），整段贴进 Funnel 的 **Custom Code / HTML** element
4. 把该 row 设成 full width、padding 归零

**② 外部主机 + GHL 只收资料（最省事）**
把 `anniversary-26/` 丢上 Vercel / Netlify，网域指过去，表单照样 POST 进 GHL。
样式 100% 可控，也不用跟 GHL 编辑器打架。

**③ 一般虚拟主机**
FTP 上传整个资料夹即可。

本地预览：

```bash
cd anniversary-26
python3 -m http.server 8080   # 打开 http://localhost:8080
```

> `file://` 直接开也能看版面，但表单送出会被浏览器 CORS 挡，测试表单请用上面的本地伺服器或正式网址。

---

## 5. 双语

右上角 EN / 中文 一键切换，**同一份表单**，不需要两个 GHL iframe。
语言记在 `localStorage`，也支援网址参数：`index.html?lang=zh` —— 分享时可直接发中文版连结。

---

## 6. 还没确定的（TBC）

改 `assets/config.js`：

- [ ] `event.rsvpBy` — 登记截止日期（目前显示「待定」）
- [ ] `contact.phone` / `whatsapp` / `email` — 目前是 `+60 12-000 0000` 等占位值

改 `assets/i18n.js`：

- [ ] `ag.*` — 当天流程（目前是「稍后公布」的占位区块，你补了 agenda 我换成时间轴）
- [ ] `hl.1.body` ~ `hl.4.body` — 四大亮点的说明文字是我按主视觉拟的，请校对
- [ ] `lg.p1` / `lg.p2` — 品牌故事段落，请校对

已填好的：日期、时间、场地、地址、着装要求（White / Orange）、地图、倒数、四大亮点标题。
