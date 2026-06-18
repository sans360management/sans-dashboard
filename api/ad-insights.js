// Vercel Serverless Function: /api/ad-insights
// 广告 AI 助手（多轮 + 工具）。AI 可用 get_ad_data 工具自取任意时段的 Meta 数据来分析。
// 密码门控；需 ANTHROPIC_API_KEY + META_TOKEN + META_AD_ACCOUNT。⚠️ 数据会发送到 Anthropic API。
import Anthropic from "@anthropic-ai/sdk";
import { resolvePeriod, fetchAdLevel, fetchAccount, summarizeAdLevel, summarizeAccount } from "../lib/meta.js";
import { resolveUser } from "../lib/users.js";

export const config = { maxDuration: 60 };

const rm = (n) => "RM " + Math.round(Number(n) || 0).toLocaleString();

function line(a) {
  const cost = a.costPerResult != null ? rm(a.costPerResult) : "—";
  return `· ${String(a.name).slice(0, 50)} | 成本/结果 ${cost} | 结果数 ${a.result} | CTR ${(+a.ctr).toFixed(2)}% | 花费 ${rm(a.spend)} | ${a.active ? "ACTIVE" : "PAUSED"}`;
}

function buildWindow(p) {
  const ads = Array.isArray(p.ads) ? p.ads : [];
  if (!ads.length) return "";
  const sections = [];
  for (const [obj, label, unit] of [["messaging", "Messaging 广告（每条信息成本）", "每条信息"], ["lead", "Landing Page 广告（每个注册成本）", "每个注册"]]) {
    const grp = ads.filter((a) => a.objective === obj && a.eligible && a.costPerResult != null).sort((a, b) => a.costPerResult - b.costPerResult);
    sections.push(`### ${label}\n中位数（${unit}）= ${rm((p.medians && p.medians[obj]) || 0)}，共 ${grp.length} 条够样本\nTOP：\n${grp.slice(0, 8).map(line).join("\n") || "（无）"}\n最差：\n${grp.slice(-6).reverse().map(line).join("\n") || "（无）"}`);
  }
  const trend = (p.trend || []).map((t) => `${t.m}: CPM ${rm(t.cpm)} / Frequency ${(+t.freq).toFixed(2)}`).join("　|　");
  return `## 当前窗口（最近 ${p.window} 天，每条广告）\n${sections.join("\n\n")}\n账号近月趋势：${trend || "（无）"}\n实际销售中新客占比：${p.newPct != null ? Math.round(p.newPct) + "%" : "未知"}`;
}

function buildMonthly(p) {
  const m = p.monthly || {};
  const ads = (m.ads || []).map((a) => `${a.m}: 广告花费(含税) ${rm(a.spend)} | Leads ${a.leads} | 信息 ${a.msg} | New Lead Sales ${a.sales != null ? rm(a.sales) : "—"} | ROAS ${a.roas != null ? a.roas + "×" : "—"}`).join("\n");
  const out = (m.outlet || []).map((o) => `${o.m}: 实际收款(MTD) ${rm(o.actual)}（其中新客 ${rm(o.newLead)}）`).join("\n");
  const meta = (m.meta || []).map((x) => `${x.m}: 账号花费 ${rm(x.spend)} / CPM ${rm(x.cpm)} / Freq ${(+x.freq).toFixed(2)}`).join("\n");
  if (!ads && !out && !meta) return "";
  return `## 每月概览（来自看板，营收类只有这里有，Meta 工具拿不到）\n广告(New Lead Sales 口径):\n${ads || "（无）"}\n\n实际门店销售(MTD Collection):\n${out || "（无）"}\n\nMeta 账号月度:\n${meta || "（无）"}`;
}

const TOOL = {
  name: "get_ad_data",
  description: "查询 Meta 广告数据。level=ad 返回每条广告成效（已按目标分组+评级）；level=account 返回账号总览（花费/展示/CTR/CPM/频次/信息/注册等）。period 选预设时段，或 period=custom 配 since/until（YYYY-MM-DD）。营收/ROAS 的营收用 system 里的每月概览，Meta 工具只给花费等投放数据。",
  input_schema: {
    type: "object",
    properties: {
      level: { type: "string", enum: ["account", "ad"], description: "account=账号总览，ad=每条广告" },
      period: { type: "string", enum: ["today", "last_7d", "last_14d", "last_30d", "this_month", "last_month", "custom"] },
      since: { type: "string", description: "YYYY-MM-DD（period=custom 时用）" },
      until: { type: "string", description: "YYYY-MM-DD（period=custom 时用）" },
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
  if (!user.tabs.includes("winners")) { res.status(403).json({ error: "无权访问 Winning Ads" }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(500).json({ error: "AI 未配置：请在 Vercel 加环境变量 ANTHROPIC_API_KEY" }); return; }
  const mToken = process.env.META_TOKEN, mAct = process.env.META_AD_ACCOUNT;

  let messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!messages.length || messages[0].role !== "user") {
    messages = [{ role: "user", content: "请基于数据做一次优化分析（扩量 / 关停换素材 / 素材规律 / 账号健康）。" }];
  }

  const today = new Date().toISOString().slice(0, 10);
  const PERSONA = `你是资深 Meta 广告优化师，服务马来西亚健康理疗连锁 Sans Wellness（颈肩理疗，靠 Messenger 对话 + 落地页注册获客）。今天是 ${today}。
你有一个工具 get_ad_data，可查询任意时段的 Meta 广告数据（level=ad 每条广告 / level=account 账号总览；period 可选 today/last_7d/last_14d/last_30d/this_month/last_month 或 custom 配 since/until）。
- system 里附了"当前窗口"和"每月概览"。用户问到当前窗口以外的时段（如某个完整月份、上个月、具体日期）时，主动调用 get_ad_data 取数后再答，不要说看不到或凭空猜。
- ROAS = 营收 ÷ 花费：营收用每月概览里的 New Lead Sales 或实际收款，花费用 Meta（工具或概览）；务必两者同口径、同时段。
规则：广告分两类目标，只在同类内比较（Messaging 看每条信息成本、Landing Page 看每个注册成本，不可混比）；用简体中文，具体、引用广告名和数字；简洁、可对话。`;
  const context = [buildWindow(body), buildMonthly(body)].filter(Boolean).join("\n\n");

  try {
    const client = new Anthropic();
    for (let round = 0; round < 5; round++) {
      const stream = client.messages.stream({
        model: "claude-opus-4-8",
        max_tokens: 1500,
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
