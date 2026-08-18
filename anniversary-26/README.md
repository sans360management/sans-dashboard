# Sans Wellness · 26th Anniversary — Landing Page + Guest Register

纯静态页面，无需 build、无框架、无依赖。双击 `index.html` 就能看，丢到任何静态主机就能上线。

```
anniversary-26/
├── index.html          ← Landing Page（品牌故事 / 四大支柱 / 流程 / CTA）
├── register.html       ← Guest Register Page（RSVP 表单）
└── assets/
    ├── config.js       ← ⭐ 只改这个：Webhook URL、活动资料、联络方式、邀请类别
    ├── i18n.js         ← 双语文案（EN / 中文）
    ├── styles.css      ← 品牌样式
    ├── app.js          ← 语言切换 / 资料注入 / 动画
    └── form.js         ← 表单验证 + 送出 GHL
```

---

## 1. 接上 GHL（必做）

1. GHL → **Automation → Workflows → Create Workflow**
2. Trigger 选 **Inbound Webhook**，复制它给的 Webhook URL
3. 打开 `assets/config.js`，贴进去：

```js
ghlWebhookUrl: 'https://services.leadconnectorhq.com/hooks/xxxxx/webhook-trigger/xxxxx',
```

4. 回 GHL，用 **Run Test / Send Test Request** 抓一次栏位对应（先在网页送一笔测试资料，GHL 才认得出栏位）
5. 在 Workflow 加 Action：**Create/Update Contact** → 把栏位对上

### 页面会送出的栏位

| 送出的 key | 内容 | 对应 GHL |
|---|---|---|
| `full_name` / `first_name` / `last_name` | 姓名 | 标准栏位 |
| `phone` | 完整号码，已含国码（如 `+60123456789`） | 标准栏位 Phone |
| `email` | 电邮 | 标准栏位 Email |
| `companyName` / `company` | 公司 | 标准栏位 Company Name |
| `designation` | 职位 | Custom Field |
| `invitation_category` | 邀请类别 | Custom Field |
| `invited_by` | 邀请人 | Custom Field |
| `form_language` | `en` 或 `zh` | Custom Field（可用来决定确认函语言）|
| `event` / `source` / `page_url` / `submitted_at` | 来源标记 | 选用 |

> `designation`、`invitation_category`、`invited_by`、`form_language` 需要先在 GHL
> **Settings → Custom Fields** 建好，Workflow 才能对应。

**关于按钮颜色**：这套表单是自订 HTML，不是 GHL 内建表单 —— 按钮已经是品牌橙 `#F08321`，
不需要进 GHL 编辑器改样式。之前提到的 GHL 表单样式限制，用这个方案就绕过了。

---

## 2. 还没填的资料（TBC）

以下目前是占位文字，正式资料到手后改 `assets/config.js`：

- [ ] `event.date` — 活动日期
- [ ] `event.time` — 时间（现为 6:30 PM – 10:30 PM）
- [ ] `event.venue` / `event.address` — 场地与地址
- [ ] `event.dress` — 着装要求（现为 Formal / Cocktail）
- [ ] `event.rsvpBy` — RSVP 截止日期
- [ ] `event.startISO` / `endISO` — 填了才会出现「加入日历」按钮
- [ ] `contact.phone` / `whatsapp` / `email` — 联络方式

改 `assets/i18n.js` 的部分：

- [ ] `journey.*` — 发展历程年份与事件（2000 / 2008 / 2015 / 2020 目前是推测的，需校对）
- [ ] `prog.*` — 当晚流程与时间（暂定）
- [ ] `pillar.*` / `pillars.*` — 四大支柱命名（现为 Heritage / Science / Care / Community，
      对应 传承 / 科研 / 关怀 / 共好，可换成品牌正式说法）
- [ ] `quote.text` — 创办人语录（现为暂拟）

---

## 3. 双语

右上角 EN / 中文 一键切换，**同一份表单**，不需要像 GHL 内建表单那样准备两个 iframe。
语言会记在 `localStorage`，也支援网址参数：`register.html?lang=zh`。
分享连结时可以直接发中文版或英文版。

---

## 4. 上线

任选一个：

- **Vercel / Netlify** — 把 `anniversary-26/` 整个资料夹拖上去即可
- **GHL 自家 Funnel** — 把 `index.html` 内容贴进 Custom Code element（`assets/` 需改成绝对网址）
- **任何虚拟主机** — FTP 上传整个资料夹

本地预览：

```bash
cd anniversary-26
python3 -m http.server 8080
# 打开 http://localhost:8080
```

> 用 `file://` 直接开也能看，但表单送出会被浏览器 CORS 挡下 —— 测试表单请用上面的本地伺服器或正式网址。

---

## 5. 表单行为

- 7 个栏位全部必填，前端即时验证（空白 / 电邮格式 / 号码格式）
- 号码自动组成国际格式：`+60` + 去掉开头 0 的号码
- 内建蜜罐栏位挡机器人
- `ghlWebhookUrl` 留空时进入「示范模式」：可以完整走一遍流程看画面，但不会真的送出
- 送出后直接在页面显示成功画面；若想跳转到独立感谢页，设 `redirectAfterSubmit`
