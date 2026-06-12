// Vercel Serverless Function: /api/ad-insights
// 接收已评分的 ad 数据 → 调用 Claude（Anthropic SDK）→ 返回中文优化建议。
// 密码门控；需环境变量 ANTHROPIC_API_KEY。⚠️ 数据会发送到 Anthropic API。
import Anthropic from "@anthropic-ai/sdk";

export const config = { maxDuration: 60 };

const rm = (n) => "RM " + Math.round(Number(n) || 0).toLocaleString();

function line(a) {
  const cost = a.costPerResult != null ? rm(a.costPerResult) : "—";
  return `· ${String(a.name).slice(0, 50)} | 成本/结果 ${cost} | 结果数 ${a.result} | CTR ${(+a.ctr).toFixed(2)}% | 花费 ${rm(a.spend)} | ${a.active ? "ACTIVE" : "PAUSED"}`;
}

function buildUserPrompt(p) {
  const ads = Array.isArray(p.ads) ? p.ads : [];
  const sections = [];
  for (const [obj, label, unit] of [["messaging", "Messaging 广告（按每条信息成本）", "每条信息"], ["lead", "Landing Page 广告（按每个注册成本）", "每个注册"]]) {
    const grp = ads.filter((a) => a.objective === obj && a.eligible && a.costPerResult != null).sort((a, b) => a.costPerResult - b.costPerResult);
    const med = (p.medians && p.medians[obj]) || 0;
    const top = grp.slice(0, 6).map(line).join("\n");
    const worst = grp.slice(-5).reverse().map(line).join("\n");
    sections.push(`### ${label}\n中位数（${unit}成本）= ${rm(med)}，共 ${grp.length} 条够样本\nTOP 表现：\n${top || "（无）"}\n最差表现：\n${worst || "（无）"}`);
  }
  const trend = (p.trend || []).map((t) => `${t.m}: CPM ${rm(t.cpm)} / Frequency ${(+t.freq).toFixed(2)}`).join("　|　");
  return `时间窗口：最近 ${p.window} 天。\n\n${sections.join("\n\n")}\n\n账号近月趋势：${trend || "（无）"}\n实际销售中新客占比：${p.newPct != null ? Math.round(p.newPct) + "%" : "未知"}\n\n请输出建议。`;
}

const SYSTEM = `你是资深 Facebook/Meta 广告投放优化师，服务一家马来西亚的健康理疗连锁（Sans Wellness，主打颈肩理疗，靠 Messenger 对话 + 落地页注册获客）。
重要：广告分两类目标，结果类型不同，必须只在同类目标内比较——Messaging 广告看"每条信息成本"，Landing Page 广告看"每个注册成本"，两者不可混比。
基于用户给的数据，用简体中文输出具体、可执行的建议，必须引用广告名和数字。分四个部分，每部分 2-4 条要点：
1. 【建议扩量】哪些广告表现好且够量，值得加预算
2. 【建议关停/换素材】哪些在烧钱（成本远高于同类中位、或 CTR 低），或账号 Frequency>4 且 CPM 在涨（受众疲劳）
3. 【素材规律】从赢家广告名里总结什么主题/形式在赢（如口播见证、护理类、特定城市）
4. 【账号健康】一句话总结
只输出这四部分的最终建议，不要复述数据、不要写思考过程、不要客套。`;

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const REAL = process.env.DASHBOARD_PASSWORD;
  if (!REAL) { res.status(500).json({ error: "服务器未配置 DASHBOARD_PASSWORD" }); return; }
  if (!body.password || body.password !== REAL) { res.status(401).json({ error: "unauthorized" }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(500).json({ error: "AI 未配置：请在 Vercel 加环境变量 ANTHROPIC_API_KEY" }); return; }

  try {
    const client = new Anthropic();
    const stream = client.messages.stream({
      model: "claude-opus-4-8",
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content: buildUserPrompt(body) }],
    });
    const msg = await stream.finalMessage();
    const text = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ text });
  } catch (e) {
    res.status(502).json({ error: "AI 分析失败：" + (e && e.message ? e.message : String(e)) });
  }
}
