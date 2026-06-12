// Vercel Serverless Function: /api/upload-sales
// action "parse": 收 PDF(base64) → 解析出 Actual(MTD Collection) + New Lead Sales(First Course)
// action "save" : 把 {month, actual, newLead} 转发给 Apps Script(doPost) 写进私密表
// 密码门控；不持久化任何金额在本函数。
import pdf from "pdf-parse/lib/pdf-parse.js";

const moneyRe = /\d{1,3}(?:,\d{3})*\.\d{2}/g;
const M = (s) => parseFloat(String(s).replace(/,/g, "")) || 0;

// 从末尾第 idx 组（每组 4 个重复 token）取多数值，解决整数列粘连污染
function groupFromEnd(toks, idx) {
  const end = toks.length - 4 * idx;
  const slice = toks.slice(end - 4, end);
  const c = {};
  slice.forEach((t) => (c[t] = (c[t] || 0) + 1));
  let best = null, bc = 0;
  for (const k in c) if (c[k] > bc) { bc = c[k]; best = k; }
  return M(best);
}

function parseSales(text) {
  const i = text.indexOf("Powered by");
  const seg = i >= 0 ? text.slice(0, i) : text;
  const toks = seg.match(moneyRe) || [];
  if (toks.length < 12) return null;
  // 合计行列序(从末尾)：[0]=First Course, [1]=Consultation, [2]=MTD Collection(SW+HG)=Actual
  return { actual: groupFromEnd(toks, 2), newLead: groupFromEnd(toks, 0) };
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const REAL = process.env.DASHBOARD_PASSWORD;
  if (!REAL) { res.status(500).json({ error: "服务器未配置 DASHBOARD_PASSWORD" }); return; }
  if (!body.password || body.password !== REAL) { res.status(401).json({ error: "unauthorized" }); return; }

  try {
    if (body.action === "parse") {
      if (!body.pdfBase64) { res.status(400).json({ error: "缺少 PDF" }); return; }
      const buf = Buffer.from(body.pdfBase64, "base64");
      const data = await pdf(buf);
      const r = parseSales(data.text || "");
      if (!r || !r.actual) { res.status(422).json({ error: "无法从这份 PDF 解析出金额，请确认是月度 Daily Sales Report" }); return; }
      res.status(200).json(r);
      return;
    }

    if (body.action === "save") {
      const url = process.env.APPS_SCRIPT_URL, token = process.env.APPS_SCRIPT_TOKEN;
      if (!url || !token) { res.status(500).json({ error: "服务器未配置 APPS_SCRIPT_URL/TOKEN" }); return; }
      const month = String(body.month || "").trim();
      const actual = Number(body.actual) || 0, newLead = Number(body.newLead) || 0;
      if (!month || !actual) { res.status(400).json({ error: "缺少 month/actual" }); return; }
      const sep = url.includes("?") ? "&" : "?";
      const r = await fetch(url + sep + "token=" + encodeURIComponent(token), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, actual, newLead }),
        redirect: "follow",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || ("Apps Script HTTP " + r.status));
      res.status(200).json({ ok: true, month });
      return;
    }

    res.status(400).json({ error: "unknown action" });
  } catch (e) {
    res.status(502).json({ error: "处理失败：" + e.message });
  }
}
