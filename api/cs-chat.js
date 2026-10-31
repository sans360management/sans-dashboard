// Vercel Serverless Function: /api/cs-chat
// 客服助手：客服在 /cs 页面问 Lead 的状态、哪些要回复/跟进，Claude 用工具去 GHL（Sans sub-account）查。
// 只读 —— 工具只有查询，不会发信息给顾客、不改 GHL 资料。
// 门控：CS_KEY（链接 /cs?k=… 带的 key）。需 ANTHROPIC_API_KEY + GHL_TOKEN + GHL_LOCATION_ID。
// ⚠️ 顾客名字/电话/聊天内容会送到 Anthropic API 处理。
import Anthropic from "@anthropic-ai/sdk";
import { listConversations, findContact, getConversation, getContact, listNewLeads, listAppointments, listWindowClosing } from "../lib/ghl.js";

// 一次查几十个 Lead（每人要查对话）+ AI 思考，60 秒不够
export const config = { maxDuration: 120 };

const TOOLS = [
  {
    name: "list_window_closing",
    description: "列出 WhatsApp 24 小时窗口还开着、但客服还没回过的对话（窗口 = 顾客最后一条 WhatsApp 后 24 小时，关闭后只能发模板）。回答「哪些人窗口快关闭」「24 小时内要回谁」「客服漏回了谁」都用这个。已排除客服已回的；自动 workflow、群发不算客服回复。结果分组：🔴 客服还没回（剩余时间少的在前）、🟡 只回自动提醒 OK/收到/谢谢、⚠️ 可疑文件（.zip/.iso、叫人用电脑打开、invoice —— 可能被盗号）、⚠️查询失败。每人有：名字、电话、剩几小时、顾客最后说什么、阶段、语言。",
    input_schema: {
      type: "object",
      properties: {
        max_hours_left: { type: "number", description: "只看剩不到几小时的（例如 6 = 6 小时内关闭），默认 24 = 全部还开着的" },
      },
    },
  },
  {
    name: "list_appointments",
    description: "按「预约日期」（马来西亚时间）列预约，按分店分组 —— 回答「今天/明天要来店几个人」「这星期某分店有几个预约」「谁取消了」都用这个。一次拿全部分店的日历，数字精确。每个预约有：时间、顾客名字电话、状态（confirmed/showed/noshow/cancelled）、负责员工、哪天约的、是否同一时段重复预约。",
    input_schema: {
      type: "object",
      properties: {
        date_from: { type: "string", description: "马来西亚日期 YYYY-MM-DD，默认今天" },
        date_to: { type: "string", description: "马来西亚日期 YYYY-MM-DD（含），默认等于 date_from；最多 31 天" },
        branch: { type: "string", description: "只看分店名字包含这个字的，例如 'Kota Damansara'、'Molek'；不填 = 全部分店" },
        include_cancelled: { type: "boolean", description: "是否列出已取消的，默认 true" },
      },
    },
  },
  {
    name: "list_new_leads",
    description: "按「注册日期」（进入 pipeline 的时间，马来西亚时间）列新 Lead —— 回答「今天/昨天/这星期有几个人 register」「今天的 Lead 约到几个」都用这个，数字是精确的。每个人附带：注册时间、阶段、负责员工、预约（时间+分店）、最后一条信息是谁发的、我们的信息已读没、要不要回。默认 RM199 pipeline。",
    input_schema: {
      type: "object",
      properties: {
        date_from: { type: "string", description: "马来西亚日期 YYYY-MM-DD，默认今天" },
        date_to: { type: "string", description: "马来西亚日期 YYYY-MM-DD（含），默认等于 date_from；最多 31 天" },
        pipeline: { type: "string", description: "pipeline 名字里的关键字，默认 'rm199'；'all' = 全部 pipeline" },
      },
    },
  },
  {
    name: "list_conversations",
    description: "列出顾客对话（最新在前）。filter：need_reply=顾客最后发信息、我们还没回；need_followup=我们最后发信息、顾客还没回；unread=未读；all=全部。可用 min_hours（至少多久没动）/ max_hours（只看最近多久内）/ tag（tag 包含这个字）筛选。返回每个对话的状态、最后信息、tags、pipeline 阶段、conversationId、contactId。",
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
  list_window_closing: listWindowClosing,
  list_appointments: listAppointments,
  list_new_leads: listNewLeads,
  list_conversations: listConversations,
  find_contact: findContact,
  get_conversation: getConversation,
  get_contact: getContact,
};

const PERSONA = `你是 Sans Wellness（马来西亚颈肩理疗连锁，主打 RM199 NeckFix 体验，靠 Meta 广告 + WhatsApp 获客，再约到门店）的客服助手。客服会问你关于 Lead 的状态、哪些顾客要回复或跟进。你用工具去公司的客户系统查真实数据。

状态怎么看：同时看 pipeline 阶段 和 tags。
- "需要回复" = 顾客最后发信息，我们还没回（list_conversations filter=need_reply）。
- "需要跟进" = 我们最后发信息（客服、自动 workflow 或群发都算），顾客还没回（filter=need_followup）。
- 常见 pipeline：「RM199 Landing Page Form Submission」（LP Registered → Pending Appointment → Done Appointment / Cancel Appointment / Not Interested / No Response）、「NeckFix Lead Status」。tags 常见：月份（如 "2026 oct leads"）、日期（如 "5-oct-26"）、语言（english/chinese/malay）、分店名、"rm199 neckfix register lp" 等。

回答规则：
- 问「几个人 register / 新 Lead / 今天进来的 Lead / 约到几个」→ 一定用 list_new_leads，直接给精确数字，不要用 tags 或最后信息时间去猜。结果按状态分组（✅ 已约：预约时间+分店；⏳ 已发时段等顾客选；🔴 顾客回了要回复；其他），并点出谁的信息还没读、谁该再追。手动导入的 Lead 要和落地页当天注册的分开讲（导入日是进系统的日子，拿到联系的日期看日期 tag）。
- 问「今天/明天要来店几个人」「某天有几个预约」「谁取消了」→ 用 list_appointments（按预约日期），不要用 list_new_leads 去凑。数字说「有效预约 X 个（Y 人）」，按分店列；同一时段重复预约要指出来。
- 问「24 小时窗口」「窗口快关闭 / 快过期」「哪些人还没回、过了就不能回」「客服漏回了谁」→ 一定用 list_window_closing，不要用 list_conversations 去凑（need_reply 看不到「workflow 自动回了、其实客服没回」的人）。照工具的分组回答：🔴 先列，剩余时间最少的在最前，每人一行：名字 · 电话 · 剩几小时 · 顾客最后说什么 · 阶段 · 语言；🟡 只回 OK/收到 的简单带过；⚠️ 可疑文件要明确提醒「不要打开附件、不要点链接，可能是被盗号」。提醒客服：窗口关闭后只能发已审核的模板。
- 用客服问的语言回答（华语就用华语，英文就用英文）。简洁、直接，列表要好扫：名字 · 电话 · 状态 · 多久没动 · 要做什么。
- 列"需要回复"时，把只回"收到/OK/谢谢/👍"之类不需要再回的，和真正在问问题、要预约的分开；真正要回的放前面。
- 被问到某个顾客时，先 find_contact，再按需要 get_conversation / get_contact，说清楚：现在在哪个阶段、最后谁说了什么、下一步建议怎么回（可以给一段可直接复制的回复草稿，语言跟顾客一样）。
- 发送失败的信息（⚠️发送失败）要特别提醒。
- 工具结果写「⚠️查询失败」= 这次没查到，不代表没有。绝对不要说成「没有预约 / 没有对话」，也不要据此推论系统坏了；要说「这几位暂时查不到，请稍后再问一次或到系统里看」。
- 绝不编造：查不到就说查不到。你只能查看，不能替客服发信息或改资料 —— 被要求时就说明要到系统里操作。
- 用词：一律把这个客户系统叫「系统」。绝对不要说出系统的品牌或产品名称（例如 GHL、GoHighLevel、HighLevel、LeadConnector），回复草稿里也不要。`;

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const key = process.env.CS_KEY;
  if (!key || body.k !== key) { res.status(401).json({ error: "链接无效或已更换，请向管理员索取新链接" }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(500).json({ error: "AI 未配置：请在 Vercel 加环境变量 ANTHROPIC_API_KEY" }); return; }
  if (!process.env.GHL_TOKEN || !process.env.GHL_LOCATION_ID) { res.status(500).json({ error: "系统未配置，请联系管理员" }); return; }

  let messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length) { res.status(400).json({ error: "请输入问题" }); return; }

  // 客服在页面上选：sonnet（默认，省钱）或 opus（细腻，约贵一倍）。只接受这两个，别的一律当 sonnet。
  const MODELS = { sonnet: "claude-sonnet-5-5", opus: "claude-opus-5-5" };
  const modelKey = body.model === "opus" ? "opus" : "sonnet";

  const now = new Date().toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "full", timeStyle: "short" });
  const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

  try {
    const client = new Anthropic();
    for (let round = 0; round < 8; round++) {
      const stream = client.beta.messages.stream({
        // effort 两个模型都保持 medium（老板要求）
        model: MODELS[modelKey],
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system: [
          { type: "text", text: PERSONA, cache_control: { type: "ephemeral" } },
          { type: "text", text: `现在是马来西亚时间 ${now}（今天日期 ${today}）。` },
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
      res.status(200).json({ text: text || "（没有可显示的回复，请换个问法）", model: modelKey });
      return;
    }
    res.status(200).json({ text: "查询太多轮了，请把问题问得更具体一点再试。" });
  } catch (e) {
    res.status(502).json({ error: "AI 回复失败：" + (e && e.message ? e.message : String(e)) });
  }
}
