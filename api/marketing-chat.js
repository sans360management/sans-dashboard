// Vercel Serverless Function: /api/marketing-chat
// 「Marketing 大脑」：能看整个看板数据（广告 / 门店销售 / 各分店漏斗 / Meta 账号）的营销分析 chatbot。
// 复用 get_ad_data 工具（lib/meta.js）按需拉任意时段的 Meta 广告明细。
// 密码门控；需 ANTHROPIC_API_KEY（+ META_TOKEN/META_AD_ACCOUNT 才能用工具）。⚠️ 数据会发送到 Anthropic API。
import Anthropic from "@anthropic-ai/sdk";
import { resolvePeriod, fetchAdLevel, fetchAccount, summarizeAdLevel, summarizeAccount } from "../lib/meta.js";
import { resolveUser } from "../lib/users.js";

export const config = { maxDuration: 60 };

const rm = (n) => "RM " + Math.round(Number(n) || 0).toLocaleString();
const orDash = (v) => (v == null ? "—" : v);

function buildContext(d) {
  d = d || {};
  const ads = (d.ads || []).map((a) =>
    `${a.m}: 广告花费(含税) ${rm(a.spend)} | Leads ${a.leads} | 信息 ${a.msg} | CPL ${a.cpl != null ? rm(a.cpl) : "—"} | New Lead Sales ${a.sales != null ? rm(a.sales) : "—"} | ROAS ${a.roas != null ? a.roas + "×" : "—"}`).join("\n");

  const outlet = (d.outlet || []).map((o) =>
    `${o.m}: 实际收款(MTD) ${rm(o.actual)} | 新客 First Course ${rm(o.newLead)} | Consultation ${orDash(o.consult)} | Enrolment ${orDash(o.enrol)}`).join("\n");

  const meta = (d.meta || []).map((x) =>
    `${x.m}: 账号花费 ${rm(x.spend)} | CPM ${rm(x.cpm)} | 频次 ${(+x.freq || 0).toFixed(2)} | 信息 ${x.msg} | 注册 ${x.reg} | CTR ${(+x.ctr || 0).toFixed(2)}%`).join("\n");

  // 各分店累计 leads/预约/取消（来自 Lead Report）
  const perBranch = (d.branchMonthly || []).map((b) => {
    let leads = 0, appt = 0, cancel = 0;
    Object.keys(b.m || {}).forEach((mo) => { const x = b.m[mo] || {}; leads += x.leads || 0; appt += x.appt || 0; cancel += x.cancel || 0; });
    return { branch: b.branch, leads, appt, cancel };
  }).sort((a, b) => b.leads - a.leads);
  const branchTxt = perBranch.map((b) =>
    `${b.branch}: Leads ${b.leads} | 预约 ${b.appt} | 取消 ${b.cancel} | 约访率 ${b.leads ? Math.round((b.appt / b.leads) * 100) : 0}%`).join("\n");
  const bt = perBranch.reduce((a, b) => ({ leads: a.leads + b.leads, appt: a.appt + b.appt, cancel: a.cancel + b.cancel }), { leads: 0, appt: 0, cancel: 0 });

  const daily = (d.dailySales || []).map((x) => {
    const t = x.total || {};
    return `${x.date}: 当天收款 ${rm(t.today)} | MTD ${rm(t.mtd)} | First Course ${rm(t.first)} | Consult ${orDash(t.consult)} | Enrol ${orDash(t.enrol)}`;
  }).join("\n");

  // ===== 原始逐条明细（让大脑能查到每一条数据）=====
  const adsDailyTxt = Object.keys(d.adsDaily || {}).map((m) => {
    const rows = (d.adsDaily[m] || []).map((r) => `  d${r.d}: 花费 ${rm(r.spend)} | Leads ${r.leads} | 信息 ${r.msg} | CPL ${r.cpl != null ? rm(r.cpl) : "—"}`).join("\n");
    return `${m}:\n${rows}`;
  }).join("\n");
  const branchDailyTxt = Object.keys(d.branchDaily || {}).map((br) => {
    const months = d.branchDaily[br] || {};
    const lines = Object.keys(months).map((m) => `  ${m}: ` + (months[m] || []).map((r) => `d${r[0]}(${r[1]}/${r[2]}/${r[3]})`).join(" ")).join("\n");
    return `${br}:\n${lines}`;
  }).join("\n");
  const salesDetailTxt = (d.dailySales || []).map((x) => {
    const t = x.total || {};
    const head = `${x.date}（合计 当天 ${rm(t.today)} / MTD ${rm(t.mtd)} / First ${rm(t.first)} / Consult ${orDash(t.consult)} / Enrol ${orDash(t.enrol)}）`;
    const rows = (x.branches || []).map((b) => `  ${b.branch}: 当天 ${rm(b.today)} | MTD ${rm(b.mtd)} | Consult ${orDash(b.consult)} | Enrol ${orDash(b.enrol)} | First ${rm(b.first)}`).join("\n");
    return `${head}\n${rows}`;
  }).join("\n");

  // 各分店门店销售：最新一天明细 + 最近几天的分店级 Consult/Enrol/First 对比（数值=当日月累计 MTD）
  const db = (d.dailySales || []).slice(-4);
  let salesBranch = "", branchTrend = "", latestDate = "", trendDates = "";
  if (db.length) {
    const latest = db[db.length - 1];
    latestDate = latest.date || "";
    const rows = (latest.branches || [])
      .map((b) => ({ ...b, conv: b.consult ? (b.enrol / b.consult) * 100 : null }))
      .sort((a, b) => (a.conv == null ? 1 : b.conv == null ? -1 : a.conv - b.conv));
    salesBranch = rows.map((b) =>
      `${b.branch}: Consultation ${orDash(b.consult)} | Enrolment ${orDash(b.enrol)} | Consult→Enrol ${b.conv != null ? b.conv.toFixed(0) + "%" : "—"} | First Course ${rm(b.first)} | MTD ${rm(b.mtd)}`).join("\n");
    trendDates = db.map((x) => x.date).join(" → ");
    const get = (day, br, f) => { const x = (day.branches || []).find((b) => b.branch === br); return x ? x[f] : null; };
    const brSet = [...new Set(db.flatMap((x) => (x.branches || []).map((b) => b.branch)))];
    branchTrend = brSet.map((br) => {
      const c = db.map((day) => orDash(get(day, br, "consult"))).join("→");
      const e = db.map((day) => orDash(get(day, br, "enrol"))).join("→");
      const fr = db.map((day) => { const v = get(day, br, "first"); return v != null ? Math.round(v) : "—"; }).join("→");
      return `${br}: Consult ${c} | Enrol ${e} | First ${fr}`;
    }).join("\n");
  }

  return `# Sans Wellness 看板全量数据（今天 ${d.today || ""}）

## 月度广告（Ads Report）
${ads || "（无）"}

## 月度门店销售（Actual Outlet Sales；New Lead Sales=First Course=新客销售；Actual Sales=MTD Collection=整体收款）
${outlet || "（无）"}

## 各分店累计漏斗（Lead Report：Leads → 预约 → 取消）
${branchTxt || "（无）"}
全公司合计：Leads ${bt.leads} | 预约 ${bt.appt} | 取消 ${bt.cancel} | 约访率 ${bt.leads ? Math.round((bt.appt / bt.leads) * 100) : 0}%

## 各分店门店销售（最新一天 ${latestDate}，月累计；含 per-branch Consultation/Enrolment）
${salesBranch || "（无逐日 Sales 数据，无法给分店级 Consult/Enrol）"}

## 各分店逐日（日期顺序 ${trendDates || "—"}；数值=当日月累计 MTD，相邻两天相减即"当天净增"，可回答"今天 vs 昨天哪家店 Consult/Enrol 增最多"）
${branchTrend || "（无）"}

## Meta 账号月度
${meta || "（无）"}

## 逐日门店销售（全公司，所有天）
${daily || "（无）"}

## ===== 原始逐条明细（每一条数据；做合计/排名优先用上面的汇总，查具体某条用这里）=====

### 广告逐日（每月每天：花费 / Leads / 信息 / CPL）
${adsDailyTxt || "（无）"}

### 各分店漏斗逐日（格式 d日(Leads/预约/取消)，来自 Lead Report）
${branchDailyTxt || "（无）"}

### 门店销售逐日 × 逐店（每天每店：当天收款 / MTD累计 / Consult / Enrol / First Course）
${salesDetailTxt || "（无）"}`;
}

const TOOL = {
  name: "get_ad_data",
  description: "查询 Meta 广告投放数据（看板月度概览里没有每条广告明细时用）。level=ad 返回每条广告成效（按目标分组+评级）；level=account 返回账号总览。period 选预设时段或 custom 配 since/until(YYYY-MM-DD)。",
  input_schema: {
    type: "object",
    properties: {
      level: { type: "string", enum: ["account", "ad"] },
      period: { type: "string", enum: ["today", "last_7d", "last_14d", "last_30d", "this_month", "last_month", "custom"] },
      since: { type: "string", description: "YYYY-MM-DD（period=custom 时）" },
      until: { type: "string", description: "YYYY-MM-DD（period=custom 时）" },
    },
    required: ["level", "period"],
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const user = resolveUser(body.password);
  if (!user) { res.status(401).json({ error: "unauthorized" }); return; }
  if (!user.tabs.includes("brain")) { res.status(403).json({ error: "无权访问 Marketing 大脑" }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(500).json({ error: "AI 未配置：请在 Vercel 加环境变量 ANTHROPIC_API_KEY" }); return; }
  const mToken = process.env.META_TOKEN, mAct = process.env.META_AD_ACCOUNT;

  let messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!messages.length || messages[0].role !== "user") {
    messages = [{ role: "user", content: "看一遍整个看板，给我一份营销诊断：哪里在赚钱、哪里在漏、最该改的 3 件事。" }];
  }

  const today = (body.data && body.data.today) || new Date().toISOString().slice(0, 10);
  const PERSONA = `你是 Sans Wellness（马来西亚颈肩理疗连锁，靠 Meta 广告 + Messenger/落地页获客，再到门店成交）的"市场营销大脑"——一位资深营销与增长分析师。今天是 ${today}。
你能看到整个看板的**全部数据**：既有汇总（月度广告、门店销售、各分店累计漏斗、Meta 账号月度），也有**逐条原始明细**（广告逐日、各分店漏斗逐日、门店销售逐日×逐店）——也就是说看板里**每一条数据你都有**。
用法：做合计/排名/趋势时**优先用"汇总"区块**（更准，别去心算几百行）；查"某天某店某项"的具体数值时**用"原始逐条明细"区块**。两者对不上时以原始明细为准并说明。
口径：New Lead Sales = First Course = 新客销售；Actual Sales = MTD Collection = 整体收款（含旧客复购）；ROAS = 营收 ÷ 广告花费（同口径同时段）；约访率 = 预约 ÷ Leads；门店销售里 Consult/Enrol/First/MTD 都是"当月累计 MTD"，相邻两天相减=当天净增。
需要"每条广告"明细或看板里没有的时段时，调用 get_ad_data 工具去 Meta 拉。
回答要：用简体中文；具体、引用看板里的真实数字；先结论后依据；给可执行建议；简洁、可继续追问。**绝不编造**没有的数据——查不到就说看板里没有。`;
  const context = buildContext({ ...(body.data || {}), today });

  try {
    const client = new Anthropic();
    for (let round = 0; round < 5; round++) {
      const stream = client.messages.stream({
        model: "claude-opus-4-8",
        max_tokens: 1800,
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
        system: [{ type: "text", text: PERSONA }, { type: "text", text: context, cache_control: { type: "ephemeral" } }],
        tools: [TOOL],
        messages,
      });
      const msg = await stream.finalMessage();
      const toolUses = (msg.content || []).filter((b) => b.type === "tool_use");
      if (msg.stop_reason === "tool_use" && toolUses.length) {
        if (!mToken || !mAct) { res.status(500).json({ error: "Meta 未配置（META_TOKEN / META_AD_ACCOUNT）" }); return; }
        messages.push({ role: "assistant", content: msg.content });
        const results = [];
        for (const tu of toolUses) {
          let content;
          try {
            const inp = tu.input || {};
            const { since, until } = resolvePeriod(inp.period, inp.since, inp.until, today);
            content = inp.level === "account"
              ? summarizeAccount(await fetchAccount(mToken, mAct, since, until))
              : summarizeAdLevel(await fetchAdLevel(mToken, mAct, since, until));
          } catch (e) { content = "查询失败：" + (e && e.message ? e.message : String(e)); }
          results.push({ type: "tool_result", tool_use_id: tu.id, content });
        }
        messages.push({ role: "user", content: results });
        continue;
      }
      const text = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({ text: text || "（没有可显示的回复，请换个问法）" });
      return;
    }
    res.status(200).json({ text: "查询轮数过多，请把问题问得更具体一点再试。" });
  } catch (e) {
    res.status(502).json({ error: "AI 回复失败：" + (e && e.message ? e.message : String(e)) });
  }
}
