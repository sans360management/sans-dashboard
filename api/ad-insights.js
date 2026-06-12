// Vercel Serverless Function: /api/ad-insights
// 广告 AI 助手（多轮对话）。接收对话历史 + 当前广告数据上下文 → 调用 Claude → 返回回复。
// 密码门控；需环境变量 ANTHROPIC_API_KEY。⚠️ 数据会发送到 Anthropic API。
import Anthropic from "@anthropic-ai/sdk";

export const config = { maxDuration: 60 };

const rm = (n) => "RM " + Math.round(Number(n) || 0).toLocaleString();

function line(a) {
  const cost = a.costPerResult != null ? rm(a.costPerResult) : "—";
  return `· ${String(a.name).slice(0, 50)} | 成本/结果 ${cost} | 结果数 ${a.result} | CTR ${(+a.ctr).toFixed(2)}% | 花费 ${rm(a.spend)} | ${a.active ? "ACTIVE" : "PAUSED"}`;
}

// 把广告数据拼成给模型的背景（只取够样本的、各组 top/worst，控制 token）
function buildContext(p) {
  const ads = Array.isArray(p.ads) ? p.ads : [];
  const sections = [];
  for (const [obj, label, unit] of [["messaging", "Messaging 广告（按每条信息成本）", "每条信息"], ["lead", "Landing Page 广告（按每个注册成本）", "每个注册"]]) {
    const grp = ads.filter((a) => a.objective === obj && a.eligible && a.costPerResult != null).sort((a, b) => a.costPerResult - b.costPerResult);
    const med = (p.medians && p.medians[obj]) || 0;
    const top = grp.slice(0, 8).map(line).join("\n");
    const worst = grp.slice(-6).reverse().map(line).join("\n");
    sections.push(`### ${label}\n中位数（${unit}成本）= ${rm(med)}，共 ${grp.length} 条够样本\nTOP 表现：\n${top || "（无）"}\n最差表现：\n${worst || "（无）"}`);
  }
  const trend = (p.trend || []).map((t) => `${t.m}: CPM ${rm(t.cpm)} / Frequency ${(+t.freq).toFixed(2)}`).join("　|　");
  return `当前广告数据（最近 ${p.window} 天）：\n\n${sections.join("\n\n")}\n\n账号近月趋势：${trend || "（无）"}\n实际销售中新客占比：${p.newPct != null ? Math.round(p.newPct) + "%" : "未知"}`;
}

const PERSONA = `你是资深 Facebook/Meta 广告投放优化师，服务马来西亚的健康理疗连锁 Sans Wellness（主打颈肩理疗，靠 Messenger 对话 + 落地页注册获客）。下方 system 里有当前的广告数据。用户会让你分析或向你提问。
规则：
1. 广告分两类目标，结果类型不同，必须只在同类内比较——Messaging 看"每条信息成本"、Landing Page 看"每个注册成本"，绝不可混比。
2. 用简体中文回答，具体、引用广告名和数字。
3. 简洁、直接、可对话；用户追问时只针对问题答，不要每次重复完整分析。
4. 只能依据给定数据；数据里没有的就说"数据里看不到"，不要编。`;

const DEFAULT_ANALYZE = `请基于数据做一次优化分析，分四部分（每部分 2-4 条要点，引用广告名和数字）：① 建议扩量 ② 建议关停/换素材（成本远高于同类中位、或 CTR 低、或账号 Frequency>4 且 CPM 在涨）③ 素材规律 ④ 账号健康一句话。`;

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const REAL = process.env.DASHBOARD_PASSWORD;
  if (!REAL) { res.status(500).json({ error: "服务器未配置 DASHBOARD_PASSWORD" }); return; }
  if (!body.password || body.password !== REAL) { res.status(401).json({ error: "unauthorized" }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(500).json({ error: "AI 未配置：请在 Vercel 加环境变量 ANTHROPIC_API_KEY" }); return; }

  // 对话历史；缺省则当作"做一次分析"
  let messages = Array.isArray(body.messages) ? body.messages : [];
  messages = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!messages.length || messages[0].role !== "user") {
    messages = [{ role: "user", content: DEFAULT_ANALYZE }];
  }

  try {
    const client = new Anthropic();
    const stream = client.messages.stream({
      model: "claude-opus-4-8",
      max_tokens: 1500,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system: [
        { type: "text", text: PERSONA },
        { type: "text", text: buildContext(body), cache_control: { type: "ephemeral" } },
      ],
      messages,
    });
    const msg = await stream.finalMessage();
    const text = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ text });
  } catch (e) {
    res.status(502).json({ error: "AI 回复失败：" + (e && e.message ? e.message : String(e)) });
  }
}
