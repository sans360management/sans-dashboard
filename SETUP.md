# Dashboard 实时更新 + 私密化 设置说明

改造后，dashboard 不再把数据写在代码里，而是：
**输入密码 → 后台去你的私密 Google Sheet 取数据 → 每 5 分钟自动刷新。**

数据流：`Google Sheet → Apps Script(带 token) → Vercel /api/data(验密码) → 网页`

下面按顺序设置（一次性）。

---

## 第 1 步：准备 Google Sheet 的 3 个标签页

在你的 Google Sheet 里准备这 3 个标签页（名称要一模一样）：

| 标签页 | 列（第一行表头） |
|--------|------------------|
| `AdsDaily` | 日期 \| 花费 \| Leads \| 信息 |
| `Sales` | 月份(如 `Jan 26`) \| 营业额 |
| `BranchDaily` | 分店 \| 日期 \| Leads \| 预约 \| 取消 |

- 日期列用真实日期（如 `2026-01-01`），系统会自动归月。
- 月度数字（花费/Leads/预约等）由系统从每日数据自动加总，你只填每日明细即可。
- `Sales` 单独填每月营业额；ROAS 自动算（营业额 ÷ 当月花费）。

> 如果你现有表格的排版不一样，把表格截图发我，我改读取脚本来适配你的排版（不用你重排）。

---

## 第 2 步：装 Apps Script（让脚本能读这张表）

1. 打开你的 Google Sheet → 顶部菜单 **扩展程序 (Extensions) → Apps Script**
2. 把 `google-apps-script/Code.gs` 里的全部内容，粘贴进去（覆盖原有的）
3. 把第 17 行的 `TOKEN` 改成一串你自己的随机字符（如 `sans-7h3k9x2m...`）——**记下来，第 4 步要用**
4. 点 **部署 (Deploy) → 新建部署 (New deployment)**
   - 类型选 **Web app（网页应用）**
   - **Execute as（执行身份）**：选 **Me（我自己）**
   - **Who has access（谁有权访问）**：选 **Anyone（任何人）**
   - 点 **Deploy**，按提示授权（选你的 Google 账号 → Advanced → 允许）
5. 复制部署后给出的 **Web app URL**（形如 `https://script.google.com/macros/s/AKfy.../exec`）——**第 4 步要用**

> 说明：选 "Anyone" 看似公开，但这个 URL 和 token 只存在 Vercel 服务器端，浏览器永远拿不到；没有 token 脚本会拒绝返回数据。

---

## 第 3 步：想一个 dashboard 访问密码

自己定一个密码（打开网站时要输的），记下来，第 4 步用。

---

## 第 4 步：在 Vercel 填 3 个环境变量

打开 Vercel → 你的项目 `sans-dashboard` → **Settings → Environment Variables**，添加 3 个：

| Name | Value |
|------|-------|
| `DASHBOARD_PASSWORD` | 你第 3 步定的密码 |
| `APPS_SCRIPT_URL` | 第 2 步复制的 Web app URL |
| `APPS_SCRIPT_TOKEN` | 第 2 步设的 TOKEN（要和脚本里一致） |

三个都选所有环境（Production / Preview / Development）。保存。

---

## 第 5 步：上线

告诉我"设置好了"，我会把改造后的代码 push 上去，Vercel 自动部署。
之后打开网站 → 输入密码 → 看到数据。以后你改 Google Sheet，网站每 5 分钟自动更新（或点右下角"刷新"立即更新）。

---

## 以后怎么更新数据

直接在 Google Sheet 里加/改每日数据行即可，**完全不用碰代码或 Vercel**。
网站会自动反映最新数字。
