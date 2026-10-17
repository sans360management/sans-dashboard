// Vercel Serverless Function: /api/cs-chat
// 客服助手：客服在 /cs 页面问 Lead 的状态、哪些要回复/跟进，Claude 用工具去 GHL（Sans sub-account）查。
// 只读 —— 工具只有查询，不会发信息给顾客、不改 GHL 资料。
// 门控：CS_KEY（链接 /cs?k=… 带的 key）。需 ANTHROPIC_API_KEY + GHL_TOKEN + GHL_LOCATION_ID。
// ⚠️ 顾客名字/电话/聊天内容会送到 Anthropic API 处理。
import Anthropic from "@anthropic-ai/sdk";
import { listConversations, findContact, getConversation, getContact } from "../lib/ghl.js";

export const config = { maxDuration: 60 };

const TOOLS = [
  {
    name: "list_conversations",
    description: "列出 GHL 对话（最新在前）。filter：need_reply=顾客最后发信息、我们还没回；need_followup=我们最后发信息、顾客还没回；unread=未读；all=全部。可用 min_hours（至少多久没动）/ max_hours（只看最近多久内）/ tag（tag 包含这个字）筛选。返回每个对话的状态、最后信息、tags、pipeline 阶段、conversationId、contactId。",
    input_schema: {
      type: "object",
      properties: {
        filter: { type: "string", enum: ["need_reply", "need_followup", "unread", "all"] },
        limit: { type: "integer", description: "最多返回几条，默认 30，最多 100" },
        min_hours: { type: "number", description: "最后信息至少是几小时前（例如 2 = 超过 2 小时没动）" },
        max_hours: { type: "number", description: "最后信息在几小时内（例如 24 = 只看今天/最近一天）" },
        tag: { type: "string", description: "只看 tag 包含这个字的（不分大小写），例如 'oct leads'、'rm199'" },
      },
      required: ["filter"],
    },
  },
  {
    name: "find_contact",
    description: "用名字、电话或关键字找顾客的对话。马来西亚电话 0 开头也可以。返回状态、tags、pipeline、conversationId、contactId。",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "get_conversation",
    description: "读某个对话的最近聊天记录（旧→新），看得到谁发的（顾客/客服/自动 workflow/群发）、发送失败的信息。",
    input_schema: {
      type: "object",
      properties: { conversationId: { type: "string" }, limit: { type: "integer", description: "几条，默认 25，最多 60" } },
      required: ["conversationId"],
    },
  },
  {
    name: "get_contact",
    description: "看顾客完整资料：tags、所有 pipeline 阶段、最近预约、备注。",
    input_schema: { type: "object", properties: { contactId: { type: "string" } }, required: ["contactId"] },
  },
];

const RUN = {
  list_conversations: listConversations,
  find_contact: findContact,
  get_conversation: getConversation,
  get_contact: getContact,
};

const PERSONA = `你是 Sans Wellness（马来西亚颈肩理疗连锁，主打 RM199 NeckFix 体验，靠 Meta 广告 + WhatsApp 获客，再约到门店）的客服助手。客服会问你关于 Lead 的状态、哪些顾客要回复或跟进。你用工具去 GHL（GoHighLevel）查真实数据。

状态怎么看：同时看 pipeline 阶段 和 tags。
- "需要回复" = 顾客最后发信息，我们还没回（list_conversations filter=need_reply）。
- "需要跟进" = 我们最后发信息（客服、自动 workflow 或群发都算），顾客还没回（filter=need_followup）。
- 常见 pipeline：「RM199 Landing Page Form Submission」（LP Registered → Pending Appointment → Done Appointment / Cancel Appointment / Not Interested / No Response）、「NeckFix Lead Status」。tags 常见：月份（如 "2026 oct leads"）、日期（如 "5-oct-26"）、语言（english/chinese/malay）、分店名、"rm199 neckfix register lp" 等。

回答规则：
- 用客服问的语言回答（华语就用华语，英文就用英文）。简洁、直接，列表要好扫：名字 · 电话 · 状态 · 多久没动 · 要做什么。
- 列"需要回复"时，把只回"收到/OK/谢谢/👍"之类不需要再回的，和真正在问问题、要预约的分开；真正要回的放前面。
- 被问到某个顾客时，先 find_contact，再按需要 get_conversation / get_contact，说清楚：现在在哪个阶段、最后谁说了什么、下一步建议怎么回（可以给一段可直接复制的回复草稿，语言跟顾客一样）。
- 发送失败的信息（⚠️发送失败）要特别提醒。
- 绝不编造：查不到就说查不到。你只能查看，不能替客服发信息或改 GHL —— 被要求时就说明要到 GHL 里操作。`;

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const key = process.env.CS_KEY;
  if (!key || body.k !== key) { res.status(401).json({ error: "链接无效或已更换，请向管理员索取新链接" }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(500).json({ error: "AI 未配置：请在 Vercel 加环境变量 ANTHROPIC_API_KEY" }); return; }
  if (!process.env.GHL_TOKEN || !process.env.GHL_LOCATION_ID) { res.status(500).json({ error: "GHL 未配置：请在 Vercel 加 GHL_TOKEN / GHL_LOCATION_ID" }); return; }

  let messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length) { res.status(400).json({ error: "请输入问题" }); return; }

  const now = new Date().toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "full", timeStyle: "short" });

  try {
    const client = new Anthropic();
    for (let round = 0; round < 8; round++) {
      const stream = client.beta.messages.stream({
        model: "claude-opus-5-5",
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
        system: [
          { type: "text", text: PERSONA, cache_control: { type: "ephemeral" } },
          { type: "text", text: `现在是马来西亚时间 ${now}。` },
        ],
        tools: TOOLS,
        messages,
      });
      const msg = await stream.finalMessage();
      if (msg.stop_reason === "refusal") { res.status(200).json({ text: "这个问题没办法回答，请换个问法。" }); return; }
      const toolUses = (msg.content || []).filter((b) => b.type === "tool_use");
      if (msg.stop_reason === "tool_use" && toolUses.length) {
        messages.push({ role: "assistant", content: msg.content });
        const results = await Promise.all(toolUses.map(async (tu) => {
          const fn = RUN[tu.name];
          try {
            if (!fn) throw new Error("未知工具 " + tu.name);
            return { type: "tool_result", tool_use_id: tu.id, content: await fn(tu.input || {}) };
          } catch (e) {
            return { type: "tool_result", tool_use_id: tu.id, content: "查询失败：" + (e && e.message ? e.message : String(e)), is_error: true };
          }
        }));
        messages.push({ role: "user", content: results });
        continue;
      }
      const text = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({ text: text || "（没有可显示的回复，请换个问法）" });
      return;
    }
    res.status(200).json({ text: "查询太多轮了，请把问题问得更具体一点再试。" });
  } catch (e) {
    res.status(502).json({ error: "AI 回复失败：" + (e && e.message ? e.message : String(e)) });
  }
}
