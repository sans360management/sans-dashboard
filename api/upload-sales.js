// Vercel Serverless Function: /api/upload-sales
// 月度（旧）：action "parse"/"save" —— 解析月末 PDF 的 MTD Collection + First Course，按月写表。
// 逐日（新）：action "parse-daily"/"save-daily" —— 按坐标解析每日 Sales Report 的每个分店 6 列数据，按日期写表。
// 截图（新）：action "parse-image" —— 用 Claude 视觉识别图片里的报表，TOTAL 行自动核对。
// 密码门控；不持久化任何金额在本函数。
import pdf from "pdf-parse/lib/pdf-parse.js";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUser } from "../lib/users.js";

export const config = { maxDuration: 60 };

const M = (s) => parseFloat(String(s).replace(/,/g, "")) || 0;

/* ---------- 旧：月度合计行（多数投票解决整数列粘连） ---------- */
const moneyRe = /\d{1,3}(?:,\d{3})*\.\d{2}/g;
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
  return { actual: groupFromEnd(toks, 2), newLead: groupFromEnd(toks, 0) };
}

/* ---------- 新：逐日报表按坐标解析（每个数字带 x/y，按列归位，不依赖绝对坐标） ---------- */
const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const isNum = (s) => /^-?[\d,]+(\.\d+)?$/.test(String(s).trim());
// 10 列固定顺序（左→右）
const COLS = ["todaySW", "mtdSW", "todayHG", "mtdHG", "today", "mtd", "consult", "enrol", "pct", "first"];

async function extractItems(buf) {
  const store = { items: [], page: 0 };
  await pdf(buf, {
    pagerender: (pageData) =>
      pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false }).then((tc) => {
        const off = store.page * 100000; // 不同页的 y 错开，避免串行
        for (const it of tc.items) {
          store.items.push({ x: Math.round(it.transform[4]), y: Math.round(it.transform[5]) + off, s: it.str });
        }
        store.page++;
        return "";
      }),
  });
  return store.items;
}

function parseDailyReport(items) {
  // 日期：Printed on: 11 June 2026
  let date = null;
  for (const it of items) {
    const m = it.s.match(/Printed on:\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (m) {
      const mi = MON[m[2].slice(0, 3).toLowerCase()];
      if (mi != null) date = `${m[3]}-${String(mi + 1).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`;
      break;
    }
  }

  // 按 y 分组
  const byY = {};
  for (const it of items) (byY[it.y] = byY[it.y] || []).push(it);

  // 数据行：最左是行号 #(整数 1..30)，右侧 ≥10 个数字单元格（合计行有 ~40 个，排除）
  const dataRows = [];
  for (const y of Object.keys(byY).map(Number)) {
    const nums = byY[y].filter((it) => isNum(it.s)).sort((a, b) => a.x - b.x);
    if (nums.length < 11 || nums.length > 13) continue;
    const head = nums[0];
    const n0 = +head.s.replace(/,/g, "");
    if (!(Number.isInteger(n0) && n0 >= 1 && n0 <= 30)) continue;
    if (nums[1].x - head.x < 20) continue;
    dataRows.push({ y, num: n0, cols: nums.slice(-10), head }); // 最右 10 个 = 10 列
  }
  if (!dataRows.length) return { date, branches: [], total: emptyTotal() };
  dataRows.sort((a, b) => b.y - a.y);

  // 已消费单元格（# + 10 列）；其余名字区文本 = 分店名（含 "Kota Damansara 2" 的独立 "2"）
  const consumed = new Set();
  for (const r of dataRows) { consumed.add(r.head); r.cols.forEach((c) => consumed.add(c)); }
  const minY = Math.min(...dataRows.map((r) => r.y)) - 16;
  const maxY = Math.max(...dataRows.map((r) => r.y)) + 16;
  const dataColMinX = Math.min(...dataRows.flatMap((r) => r.cols.map((c) => c.x)));
  const nearestRowY = (y) => {
    let best = null, bd = 1e9;
    for (const r of dataRows) { const d = Math.abs(r.y - y); if (d < bd) { bd = d; best = r.y; } }
    return bd <= 14 ? best : null;
  };
  const names = {};
  for (const r of dataRows) names[r.y] = [];
  for (const it of items) {
    if (consumed.has(it) || !it.s.trim()) continue;
    if (it.y < minY || it.y > maxY) continue;
    if (it.x >= dataColMinX - 8) continue; // 数据列左侧才是名字
    const ry = nearestRowY(it.y);
    if (ry != null) names[ry].push({ y: it.y, x: it.x, s: it.s.trim() });
  }

  const branches = dataRows.map((r) => {
    const name = names[r.y].sort((a, b) => b.y - a.y || a.x - b.x).map((n) => n.s).join(" ").replace(/\s+/g, " ").trim();
    const c = {};
    r.cols.forEach((cell, i) => { c[COLS[i]] = M(cell.s); });
    return { branch: name, today: c.today, mtd: c.mtd, consult: c.consult, enrol: c.enrol, first: c.first };
  }).filter((b) => b.branch);

  const total = branches.reduce((a, b) => ({
    today: a.today + b.today, mtd: a.mtd + b.mtd, consult: a.consult + b.consult, enrol: a.enrol + b.enrol, first: a.first + b.first,
  }), emptyTotal());
  return { date, branches, total };
}
function emptyTotal() { return { today: 0, mtd: 0, consult: 0, enrol: 0, first: 0 }; }

/* ---------- 截图：Claude 视觉识别 + TOTAL 行核对 ---------- */
const REPORT_TOOL = {
  name: "report_data",
  description: "从 Daily Sales Report 图片中提取的结构化数据。",
  input_schema: {
    type: "object",
    properties: {
      date: { type: "string", description: "报表日期 YYYY-MM-DD（取图上 'Printed on: D Month YYYY'）" },
      branches: {
        type: "array",
        description: "每个分店一行（不含底部 TOTAL 行）",
        items: {
          type: "object",
          properties: {
            branch: { type: "string", description: "分店名（Outlet 列，如 'Mahkota Cheras'、'Kota Damansara 2'）" },
            today: { type: "number", description: "Today Collection (SW+HG) 金额" },
            mtd: { type: "number", description: "MTD Collection (SW+HG) 金额" },
            consult: { type: "number", description: "Consultation 整数" },
            enrol: { type: "number", description: "Enrolment 整数" },
            first: { type: "number", description: "First Course 金额" },
          },
          required: ["branch", "today", "mtd", "consult", "enrol", "first"],
        },
      },
      printedTotal: {
        type: "object",
        description: "底部 TOTAL 行（用于核对）。读不到就省略。",
        properties: {
          today: { type: "number" }, mtd: { type: "number" }, consult: { type: "number" }, enrol: { type: "number" }, first: { type: "number" },
        },
      },
    },
    required: ["date", "branches"],
  },
};

const VISION_PROMPT = `这是一份 Sans Wellness 的 "Daily Sales Report" 表格截图。请把它读成结构化数据，只用 report_data 工具输出。
表格每个分店一行，数字列从左到右依次是：Today Collection(SW)、MTD Collection(SW)、Today Collection(HG)、MTD Collection(HG)、Today Collection(SW+HG)、MTD Collection(SW+HG)、Consultation、Enrolment、Enrolment %、First Course。
- 每个分店只取 **SW+HG 合并列**：today=Today Collection(SW+HG)、mtd=MTD Collection(SW+HG)；以及 consult=Consultation、enrol=Enrolment、first=First Course。不要 Enrolment %。
- consult、enrol 是整数（顾客人数）；today、mtd、first 是金额（去掉千分位逗号，保留小数）。
- 分店名照抄 Outlet 列（含末尾数字，如 "Kota Damansara 2"、"Nusa Bestari 2"、"Puchong 2"）。把所有分店行都列出（包括数字为 0 的）。
- date 取顶部 "Printed on: D Month YYYY"，转成 YYYY-MM-DD。
- 底部 "TOTAL" 那一行单独放进 printedTotal（同样取 SW+HG 的 today/mtd + consult/enrol/first）。
务必逐格仔细看准数字，不要漏行或串列。`;

function totalsClose(a, b) {
  if (!a || !b) return null;
  const moneyOk = (x, y) => Math.abs((Number(x) || 0) - (Number(y) || 0)) <= 1;
  const intOk = (x, y) => Math.round(Number(x) || 0) === Math.round(Number(y) || 0);
  return moneyOk(a.today, b.today) && moneyOk(a.mtd, b.mtd) && intOk(a.consult, b.consult) && intOk(a.enrol, b.enrol) && moneyOk(a.first, b.first);
}

async function parseImageReport(imageBase64, mediaType) {
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1800,
    tools: [REPORT_TOOL],
    tool_choice: { type: "tool", name: "report_data" },
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
        { type: "text", text: VISION_PROMPT },
      ],
    }],
  });
  const tu = (msg.content || []).find((b) => b.type === "tool_use");
  if (!tu) throw new Error("AI 未能识别表格，请换一张更清晰/完整的截图，或改用 PDF");
  const inp = tu.input || {};
  const branches = (Array.isArray(inp.branches) ? inp.branches : []).map((b) => ({
    branch: String(b.branch || "").trim(),
    today: Number(b.today) || 0, mtd: Number(b.mtd) || 0,
    consult: Math.round(Number(b.consult) || 0), enrol: Math.round(Number(b.enrol) || 0),
    first: Number(b.first) || 0,
  })).filter((b) => b.branch);
  const computedTotal = branches.reduce((a, b) => ({
    today: a.today + b.today, mtd: a.mtd + b.mtd, consult: a.consult + b.consult, enrol: a.enrol + b.enrol, first: a.first + b.first,
  }), emptyTotal());
  const printedTotal = inp.printedTotal || null;
  const ok = totalsClose(computedTotal, printedTotal);
  return { date: inp.date || null, branches, total: computedTotal, check: { ok, printedTotal, computedTotal } };
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const user = resolveUser(body.password);
  if (!user) { res.status(401).json({ error: "unauthorized" }); return; }
  if (!user.tabs.includes("sales")) { res.status(403).json({ error: "无权上传 Sales 数据" }); return; }

  try {
    // ---- 逐日：解析 ----
    if (body.action === "parse-daily") {
      if (!body.pdfBase64) { res.status(400).json({ error: "缺少 PDF" }); return; }
      const items = await extractItems(Buffer.from(body.pdfBase64, "base64"));
      const r = parseDailyReport(items);
      if (!r.date) { res.status(422).json({ error: "无法识别报表日期（找不到 'Printed on: …'），请确认是 Daily Sales Report" }); return; }
      if (!r.branches.length) { res.status(422).json({ error: "无法解析出任何分店行，请确认 PDF 格式" }); return; }
      res.status(200).json(r);
      return;
    }

    // ---- 截图：用 Claude 视觉识别 ----
    if (body.action === "parse-image") {
      if (!body.imageBase64) { res.status(400).json({ error: "缺少图片" }); return; }
      if (!process.env.ANTHROPIC_API_KEY) { res.status(500).json({ error: "AI 未配置：请在 Vercel 加环境变量 ANTHROPIC_API_KEY" }); return; }
      const mediaType = /^image\/(png|jpeg|jpg|webp|gif)$/.test(body.mediaType || "") ? body.mediaType.replace("image/jpg", "image/jpeg") : "image/png";
      const r = await parseImageReport(body.imageBase64, mediaType);
      if (!r.date) { res.status(422).json({ error: "无法识别报表日期，请确认截图含顶部 'Printed on: …'，或改用 PDF" }); return; }
      if (!r.branches.length) { res.status(422).json({ error: "无法识别出任何分店行，请换更清晰/完整的截图，或改用 PDF" }); return; }
      res.status(200).json(r);
      return;
    }

    // ---- 逐日：保存（转发给 Apps Script doPost） ----
    if (body.action === "save-daily") {
      const url = process.env.APPS_SCRIPT_URL, token = process.env.APPS_SCRIPT_TOKEN;
      if (!url || !token) { res.status(500).json({ error: "服务器未配置 APPS_SCRIPT_URL/TOKEN" }); return; }
      const date = String(body.date || "").trim();
      const branches = Array.isArray(body.branches) ? body.branches : [];
      if (!date || !branches.length) { res.status(400).json({ error: "缺少 date/branches" }); return; }
      const sep = url.includes("?") ? "&" : "?";
      const r = await fetch(url + sep + "token=" + encodeURIComponent(token), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daily: true, date, branches }), redirect: "follow",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || ("Apps Script HTTP " + r.status));

      // 保存成功后：自动触发 /api/send-report → 发一份 Telegram Summary（失败不影响保存本身）
      let summary = null;
      try {
        const proto = req.headers["x-forwarded-proto"] || "https";
        const host = req.headers["x-forwarded-host"] || req.headers.host;
        const q = process.env.REPORT_KEY ? "?key=" + encodeURIComponent(process.env.REPORT_KEY) : "";
        const sr = await fetch(`${proto}://${host}/api/send-report${q}`);
        summary = await sr.json().catch(() => ({}));
      } catch (e) { summary = { error: e.message }; }

      res.status(200).json({ ok: true, date, branches: branches.length, summary });
      return;
    }

    // ---- 旧月度：解析 ----
    if (body.action === "parse") {
      if (!body.pdfBase64) { res.status(400).json({ error: "缺少 PDF" }); return; }
      const data = await pdf(Buffer.from(body.pdfBase64, "base64"));
      const r = parseSales(data.text || "");
      if (!r || !r.actual) { res.status(422).json({ error: "无法从这份 PDF 解析出金额，请确认是月度 Daily Sales Report" }); return; }
      res.status(200).json(r);
      return;
    }

    // ---- 旧月度：保存 ----
    if (body.action === "save") {
      const url = process.env.APPS_SCRIPT_URL, token = process.env.APPS_SCRIPT_TOKEN;
      if (!url || !token) { res.status(500).json({ error: "服务器未配置 APPS_SCRIPT_URL/TOKEN" }); return; }
      const month = String(body.month || "").trim();
      const actual = Number(body.actual) || 0, newLead = Number(body.newLead) || 0;
      if (!month || !actual) { res.status(400).json({ error: "缺少 month/actual" }); return; }
      const sep = url.includes("?") ? "&" : "?";
      const r = await fetch(url + sep + "token=" + encodeURIComponent(token), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, actual, newLead }), redirect: "follow",
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
