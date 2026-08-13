// Vercel Serverless Function: /api/ads-report
// 从私密 "Ads Report" Google Sheet（经 Apps Script 读表）取当天 8 项 Ads KPI → 按老板锁定 Format 发 Telegram。
// 由 GitHub Actions 每日定时触发（?key=<REPORT_KEY>）。也支持 ?date=YYYY-MM-DD 手动指定（复核/按需）。
// 数据源、token、Telegram 凭证只在服务器端环境变量；仓库是 PUBLIC，绝不入码。

export const config = { maxDuration: 60 };

const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-07-31" -> "31 Jul 2026"
function fmtDMY(ymd) {
  const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(ymd);
  return `${+m[3]} ${MON3[(+m[2]) - 1]} ${m[1]}`;
}
const num = (v) => {
  if (typeof v === "number") return v;
  const n = Number(String(v == null ? "" : v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
};
const rm = (n) => "RM " + Number(n).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = (n) => Number(Math.round(num(n))).toLocaleString("en-MY");

export default async function handler(req, res) {
  const key = (req.query && req.query.key) || "";
  if (process.env.REPORT_KEY && key !== process.env.REPORT_KEY) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const scriptUrl = process.env.ADS_SCRIPT_URL;
  const token = process.env.ADS_SCRIPT_TOKEN || process.env.APPS_SCRIPT_TOKEN;
  if (!scriptUrl || !token) {
    return res.status(500).json({ error: "未配置（缺 ADS_SCRIPT_URL / ADS_SCRIPT_TOKEN）" });
  }

  try {
    // 向 Apps Script 取当天（或 ?date 指定）那一行 8 项 KPI
    const sep = scriptUrl.includes("?") ? "&" : "?";
    let u = scriptUrl + sep + "token=" + encodeURIComponent(token);
    const date = (req.query && req.query.date) || "";
    if (date) u += "&date=" + encodeURIComponent(date);
    const r = await fetch(u, { redirect: "follow" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) throw new Error(d.error || ("Apps Script HTTP " + r.status));
    if (!d.date) throw new Error("找不到对应日期的 Ads 数据行");

    // 按老板锁定 Format 拼消息（全角空格用于对齐，务必保留）
    const msg =
      `📅 ${fmtDMY(d.date)}\n` +
      `Ads Spent (Total Msg)(Total Comment)\n` +
      `　${rm(d.adsSpent)}　(${int(d.totalMsg)})(${int(d.totalComment)})\n` +
      `Cost per Msg (${rm(d.costPerMsg)})\n` +
      `Messenger CPL (${rm(d.msgCPL)})　　Total Lead from Messenger (${int(d.msgLead)})\n` +
      `CPL (${rm(d.cpl)})\n` +
      `Total New Lead (${int(d.newLead)})　　Total LP Lead (${int(d.lpLead)})`;

    // 只测不发：?dry=1 返回拼好的文本，不发 Telegram（用于复核）
    if (req.query && req.query.dry) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ ok: true, date: d.date, message: msg });
    }

    const tgRes = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: msg }),
    });
    const tgData = await tgRes.json();
    if (!tgData.ok) return res.status(500).json({ error: "Telegram failed", detail: tgData });
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ success: true, date: fmtDMY(d.date) });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
