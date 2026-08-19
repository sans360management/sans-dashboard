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

## 4. 放进 GHL

### 打包指令

```bash
cd anniversary-26
python3 build-ghl.py              # → dist/ghl-embed.html（82 KB，图片走网址）
python3 build-ghl.py --embed-img  # → dist/ghl-embed-with-images.html（420 KB，图片内嵌）
python3 build-single.py           # → dist/index.html（独立网页 / 预览用）
```

`build-ghl.py` 跟 `build-single.py` 的差别，是它为了在 GHL 里存活多做了四件事：

1. **拿掉 `<!doctype>/<html>/<head>/<body>`** —— GHL 的 Custom Code 只吃片段
2. **所有类别自动加 `s26-` 前缀** —— GHL 本身也有 `.card` `.btn` `.nav` `.section`，
   而且常常带 `!important`。光靠 CSS 作用域挡不住 `!important`，改名才是根治
3. **CSS 全部限定在 `#sans26` 容器内** —— 我们的样式也不会外溢去弄乱 GHL 的元素
4. **自动解开外层容器的 `overflow` / `transform`** —— 否则 GHL 的 row 会让吸顶导览列失效

JS 的查询也会限定在容器内（`app.js` 里的 `SCOPE` / `ROOT`），所以不会选到 GHL 自己的元素。

### 贴进 GHL 的步骤

1. GHL → **Media Library** 上传 `hero-poster.jpg` 和 `SW_LOGO-removebg-preview.png`，各自复制网址
2. 把 `assets/config.js` 的 `images` 改成那两个绝对网址
3. 跑 `python3 build-ghl.py`，打开 `dist/ghl-embed.html`，**全选复制**
4. GHL → Funnels → 新增一个 **Blank** 页面步骤
5. 加一个 Row → 设成 **Full Width**，左右上下 padding 全部归零
6. 在 Row 里加 **Custom JS/HTML** 元素，把刚才复制的内容整段贴进去
7. Page Settings → 背景色设成 `#FDF6EC`（避免左右出现白边）
8. Save → Preview → Publish

> 懒得上传图片的话，直接用 `dist/ghl-embed-with-images.html`（图片已 base64 内嵌，
> 不用改 config、不用 Media Library），代价是贴上去的内容从 82 KB 变成 420 KB。
> GHL 编辑器处理这么大一段会有点顿，建议还是走 Media Library。

### 贴完检查三件事

- 吸顶导览列滚动时有没有跟着？（没有 → 该 Row 或 Section 还有 `overflow: hidden`，到设定里关掉）
- 手机版底部的固定登记列有没有出现？
- 表单有没有正常显示、高度有没有自动撑开？

### 另一条路：外部主机 + GHL 只收资料

把 `anniversary-26/` 整个丢上 Vercel / Netlify，网域指过去，表单照样送进 GHL。
样式 100% 可控，不用跟编辑器打架，日后改版也只要重新部署 —— 不必再贴一次。

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

- [ ] `hl.1.body` ~ `hl.4.body` — 四大亮点的说明文字是我按主视觉拟的，请校对
- [ ] `prog.*` — 当天流程，请校对（尤其中文楼层：地面层 / 一楼 / 三楼）

已填好的：日期、时间、场地、地址、着装要求（White / Orange）、地图、倒数、四大亮点、当天完整流程。

> 页面区块顺序：Hero → 四大亮点 → 活动流程 → 活动地点 → 登记。
> 原本的「品牌传承 Legacy」区块已依需求移除。
