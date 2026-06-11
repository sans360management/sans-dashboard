# Dashboard 实时更新 + 私密化 设置说明

改造后：**输入密码 → 后台读取你的两个 Google Sheet → 每 5 分钟自动刷新。**
数据流：`你的两个表格 → Apps Script(带 token) → Vercel /api/data(验密码) → 网页`

> ✅ 好消息：**你完全不用改表格排版**。脚本直接读你现有的：
> - **Ads Report**（每月标签页，如 `Jan 2026`）
> - **Daily Leads Status**（每月标签页，如 `JANUARY 2026 Lead Report`）
>
> 已用你原始 dashboard 的数字逐条验证，Jan–May 完全吻合。

---

## 第 1 步：部署 Apps Script（让脚本能读你的表格）

1. 打开 **https://script.google.com** → 左上角 **新建项目 (New project)**
2. 把项目里默认的代码全删掉，粘贴 `google-apps-script/Code.gs` 的**全部内容**
   （表格 ID 我已经帮你填好了，会自动读你那两个表）
3. 把第 17 行的 `TOKEN` 改成一串你自己的随机字符，例如：
   `var TOKEN = "sans-x9k2m7qp4w8z";`
   —— **记下来，第 3 步要用**
4. 点 💾 保存。然后右上角 **部署 (Deploy) → 新建部署 (New deployment)**
   - 齿轮图标选 **Web app（网页应用）**
   - **Execute as（执行身份）**：**Me（我自己）**
   - **Who has access（谁有权访问）**：**Anyone（任何人）**
   - 点 **Deploy**
5. 第一次会要**授权**：选你的 Google 账号 → 出现"未验证"警告 → 点 **Advanced（高级）→ Go to project（继续前往）→ Allow（允许）**
   （这是允许脚本读你自己的表格，安全）
6. 复制部署后给出的 **Web app URL**（形如 `https://script.google.com/macros/s/AKfy.../exec`）
   —— **第 3 步要用**

> ⚠️ 一定要选 **Anyone**（不是 "Anyone with Google account"），否则后台读不到。
> 这个 URL 和 token 只存在 Vercel 服务器端，浏览器永远看不到；没 token 脚本会拒绝。

---

## 第 2 步：想一个 dashboard 访问密码

自己定一个打开网站要输的密码，记下来。

---

## 第 3 步：在 Vercel 填 3 个环境变量

Vercel → 项目 `sans-dashboard` → **Settings → Environment Variables**，添加 3 个（都选所有环境）：

| Name | Value |
|------|-------|
| `DASHBOARD_PASSWORD` | 你第 2 步定的密码 |
| `APPS_SCRIPT_URL` | 第 1 步复制的 Web app URL |
| `APPS_SCRIPT_TOKEN` | 第 1 步设的 TOKEN（要和脚本里完全一致） |

---

## 第 4 步：上线

告诉我"设置好了"，我把改造后的代码 push 上去，Vercel 自动部署。
打开网站 → 输入密码 → 看到数据。

---

## 以后怎么更新数据

直接在你原来的两个 Google Sheet 里照常填每日数据，**完全不用碰代码或 Vercel**。
网站每 5 分钟自动更新（或点右下角"刷新"立即更新）。

### 几点说明（脚本现在的规则）
- **广告月度花费**含 6% SST（= 每日花费之和 × 1.06）；每日明细图表用税前数字。
- **营业额**读自每月广告标签页摘要区（`New Leads Sales`）；某月没填则显示"—"。
- 只显示 **2026 年起**的月份；新月份的标签页（如 `July 2026`、`JULY 2026 Lead Report`）会被**自动识别**，不用改脚本。
- 分店名自动去掉括号备注（如 `Kota Damansara 1 (RHB Bank同排)` → `Kota Damansara 1`）。
