// 共用：GHL（GoHighLevel）只读查询 —— 给 /api/cs-chat 的客服助手用。
// 只做 GET / search，不发信息、不改资料。需环境变量 GHL_TOKEN（Private Integration Token）
// + GHL_LOCATION_ID（Sans 那个 sub-account）。

const BASE = "https://services.leadconnectorhq.com";
const TZ = "Asia/Kuala_Lumpur";

function cfg() {
  const token = process.env.GHL_TOKEN, loc = process.env.GHL_LOCATION_ID;
  if (!token || !loc) throw new Error("GHL 未配置：请在 Vercel 加 GHL_TOKEN / GHL_LOCATION_ID");
  return { token, loc };
}

async function ghl(path, params, version = "2021-07-28") {
  const { token } = cfg();
  const qs = params ? "?" + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== "")).toString() : "";
  const r = await fetch(BASE + path + qs, {
    headers: { Authorization: "Bearer " + token, Version: version, Accept: "application/json" },
  });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch (e) { j = null; }
  if (!r.ok) throw new Error(`GHL ${r.status}: ${(j && (j.message || j.error)) || txt.slice(0, 200)}`);
  return j || {};
}

/* ------------------------------------------------------------ 格式化 */
const fmtTime = (ms) => {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-GB", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
};
const ago = (ms) => {
  if (!ms) return "";
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 60) return m + " 分钟前";
  const h = Math.round(m / 60);
  if (h < 48) return h + " 小时前";
  return Math.round(h / 24) + " 天前";
};
const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n) + "…" : s; };
const toMs = (v) => (typeof v === "number" ? v : v ? Date.parse(v) : 0);

/* ------------------------------------------------------------ pipeline 阶段名（缓存在函数实例里） */
let stageCache = null, stageAt = 0;
async function stageMap() {
  if (stageCache && Date.now() - stageAt < 10 * 60 * 1000) return stageCache;
  const { loc } = cfg();
  const j = await ghl("/opportunities/pipelines", { locationId: loc });
  const map = {};
  (j.pipelines || []).forEach((p) => (p.stages || []).forEach((s) => { map[s.id] = { pipeline: p.name, stage: s.name }; }));
  stageCache = map; stageAt = Date.now();
  return map;
}
function oppText(opps, stages) {
  if (!opps || !opps.length) return "无 pipeline";
  return opps.map((o) => {
    const s = stages[o.pipelineStageId] || {};
    return `${s.pipeline || "?"} → ${s.stage || "?"}${o.status && o.status !== "open" ? ` (${o.status})` : ""}`;
  }).join("；");
}

/* ------------------------------------------------------------ 对话 → 一行 */
function convLine(c, stages) {
  const inbound = c.lastMessageDirection === "inbound";
  const state = c.isLastMessageInternalComment ? "最后是内部备注"
    : inbound ? "🔴 需要回复（顾客最后发信息，我们还没回）"
    : "🟡 需要跟进（我们最后发信息，顾客还没回）";
  const who = inbound ? "顾客" : (c.lastOutboundMessageAction === "manual" ? "客服" : "系统/自动");
  return [
    `• ${c.fullName || c.contactName || "(无名)"} ${c.phone || ""}`,
    `  状态: ${state}`,
    `  最后信息: ${fmtTime(c.lastMessageDate)}（${ago(c.lastMessageDate)}）由${who}发 [${(c.lastMessageType || "").replace("TYPE_", "")}]：「${clip(c.lastMessageBody, 140)}」`,
    `  未读: ${c.unreadCount || 0} | Tags: ${(c.tags || []).join(", ") || "—"}`,
    `  Pipeline: ${oppText(c.opportunities, stages)}`,
    `  conversationId=${c.id} contactId=${c.contactId}`,
  ].join("\n");
}

/* ------------------------------------------------------------ 工具实现 */

// 列出对话：need_reply = 顾客最后发（inbound）；need_followup = 我们最后发（outbound）
export async function listConversations({ filter = "need_reply", limit = 30, min_hours, max_hours, tag } = {}) {
  const { loc } = cfg();
  const stages = await stageMap();
  limit = Math.max(1, Math.min(Number(limit) || 30, 100));
  const dir = filter === "need_reply" ? "inbound" : filter === "need_followup" ? "outbound" : undefined;
  const now = Date.now();
  const minMs = min_hours != null ? Number(min_hours) * 3600e3 : null;
  const maxMs = max_hours != null ? Number(max_hours) * 3600e3 : null;
  const tagLc = tag ? String(tag).toLowerCase() : null;

  const out = [], seen = new Set();
  let startAfterDate, total = null, scanned = 0;
  // 最新的在前；最多翻 5 页（500 条）找够符合条件的
  for (let page = 0; page < 5 && out.length < limit; page++) {
    const j = await ghl("/conversations/search", {
      locationId: loc, sortBy: "last_message_date", sort: "desc", limit: 100,
      lastMessageDirection: dir, status: filter === "unread" ? "unread" : undefined, startAfterDate,
    }, "2021-04-15");
    if (total == null) total = j.total;
    const list = j.conversations || [];
    if (!list.length) break;
    let stop = false;
    for (const c of list) {
      if (seen.has(c.id)) continue;
      seen.add(c.id); scanned++;
      const age = now - toMs(c.lastMessageDate);
      if (maxMs != null && age > maxMs) { stop = true; break; } // 再往后只会更旧
      if (minMs != null && age < minMs) continue;
      if (c.isLastMessageInternalComment) continue;
      if (tagLc && !(c.tags || []).some((t) => String(t).toLowerCase().includes(tagLc))) continue;
      out.push(c);
      if (out.length >= limit) break;
    }
    if (stop || list.length < 100) break;
    const last = list[list.length - 1];
    startAfterDate = (last.sort && last.sort[0]) || last.lastMessageDate;
  }
  const label = { need_reply: "需要回复", need_followup: "需要跟进", unread: "未读", all: "全部" }[filter] || filter;
  const head = `【${label}】GHL 符合方向的对话总数约 ${total ?? "?"}；按条件筛选后显示 ${out.length} 条（扫描了最近 ${scanned} 条，最新在前）。现在时间 ${fmtTime(now)}。`;
  return head + "\n\n" + (out.map((c) => convLine(c, stages)).join("\n\n") || "（没有符合条件的对话）");
}

// 用名字 / 电话 / 关键字找顾客
export async function findContact({ query }) {
  const { loc } = cfg();
  if (!query) return "请提供名字或电话。";
  const stages = await stageMap();
  // 电话：去掉空格横线；GHL 存的是 +60…，马来西亚 0 开头的号码补成 +60
  let q = String(query).trim();
  if (/^[\d\s+\-()]+$/.test(q)) { q = q.replace(/[\s\-()]/g, ""); if (/^0\d{8,10}$/.test(q)) q = "+6" + q; }
  const j = await ghl("/conversations/search", { locationId: loc, query: q, limit: 10, sortBy: "last_message_date", sort: "desc" }, "2021-04-15");
  const list = j.conversations || [];
  if (!list.length) return `找不到「${query}」的对话。可以换电话号码或名字的一部分再试。`;
  return `找到 ${list.length} 个对话（最新在前）：\n\n` + list.map((c) => convLine(c, stages)).join("\n\n");
}

// 读一个对话的聊天记录
export async function getConversation({ conversationId, limit = 25 }) {
  if (!conversationId) return "缺 conversationId。";
  limit = Math.max(1, Math.min(Number(limit) || 25, 60));
  const j = await ghl(`/conversations/${conversationId}/messages`, { limit }, "2021-04-15");
  const msgs = ((j.messages && j.messages.messages) || []).slice().reverse(); // 旧 → 新
  if (!msgs.length) return "这个对话没有信息。";
  const src = (m) => {
    if (m.direction === "inbound") return "顾客";
    if (m.source === "workflow") return "自动(workflow)";
    if (m.source === "bulk_actions") return "群发";
    if (m.source === "app" || m.userId) return "客服";
    return "我们";
  };
  const lines = msgs.map((m) => {
    const t = (m.messageType || "").replace("TYPE_", "");
    const fail = m.status === "failed" ? ` ⚠️发送失败${m.error ? "：" + clip(m.error, 60) : ""}` : "";
    const att = m.attachments && m.attachments.length ? ` [附件×${m.attachments.length}]` : "";
    return `[${fmtTime(toMs(m.dateAdded))}] ${src(m)} (${t})${fail}${att}：${clip(m.body, 600) || "（无文字）"}`;
  });
  return `最近 ${msgs.length} 条信息（旧→新，现在 ${fmtTime(Date.now())}）：\n` + lines.join("\n");
}

// 顾客资料 + tags + pipeline + 预约 + 备注
export async function getContact({ contactId }) {
  if (!contactId) return "缺 contactId。";
  const { loc } = cfg();
  const stages = await stageMap();
  const [cj, aj, nj, oj] = await Promise.all([
    ghl(`/contacts/${contactId}`),
    ghl(`/contacts/${contactId}/appointments`).catch(() => ({})),
    ghl(`/contacts/${contactId}/notes`).catch(() => ({})),
    ghl("/opportunities/search", { location_id: loc, contact_id: contactId, limit: 10 }).catch(() => ({})),
  ]);
  const c = cj.contact || {};
  const opps = (oj.opportunities || []).map((o) => {
    const s = stages[o.pipelineStageId] || {};
    return `${s.pipeline || "?"} → ${s.stage || "?"} (${o.status || "open"}) · 更新 ${fmtTime(toMs(o.lastStageChangeAt || o.updatedAt))}`;
  });
  const appts = (aj.events || []).slice(-5).map((e) => `${fmtTime(toMs(e.startTime))} · ${e.title || ""} · ${e.appointmentStatus || e.status || ""}`);
  const notes = (nj.notes || []).slice(0, 5).map((n) => `${fmtTime(toMs(n.dateAdded))}：${clip(n.body, 200)}`);
  return [
    `顾客：${[c.firstName, c.lastName].filter(Boolean).join(" ") || c.contactName || "(无名)"} | 电话 ${c.phone || "—"} | Email ${c.email || "—"}`,
    `加入时间：${fmtTime(toMs(c.dateAdded))} | 来源：${c.source || "—"}`,
    `Tags：${(c.tags || []).join(", ") || "—"}`,
    `Pipeline：${opps.join("；") || "无"}`,
    `预约（最近 5 个）：${appts.join("；") || "无"}`,
    `备注（最新 5 条）：${notes.join("；") || "无"}`,
  ].join("\n");
}
