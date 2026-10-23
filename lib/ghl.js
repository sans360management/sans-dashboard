// 共用：GHL（GoHighLevel）只读查询 —— 给 /api/cs-chat 的客服助手用。
// 只做 GET / search，不发信息、不改资料。需环境变量 GHL_TOKEN（Private Integration Token）
// + GHL_LOCATION_ID（Sans 那个 sub-account）。

const BASE = "https://services.leadconnectorhq.com";
const TZ = "Asia/Kuala_Lumpur";

function cfg() {
  const token = process.env.GHL_TOKEN, loc = process.env.GHL_LOCATION_ID;
  if (!token || !loc) throw new Error("系统未配置，请联系管理员");
  return { token, loc };
}

// 系统每 10 秒最多 100 个请求（每个 location）。一次查几十个 Lead 会超过，
// 超过的请求回 429 —— 以前被当成「没有资料」，客服就看到「没预约、没对话」。
// 所以：请求之间至少隔 GAP 毫秒排队发，遇到 429 / 5xx 等一下再重试。
const GAP = 130;
let nextSlot = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function slot() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + GAP;
  if (at > now) await sleep(at - now);
}

async function ghl(path, params, version = "2021-07-28") {
  const { token } = cfg();
  const qs = params ? "?" + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== "")).toString() : "";
  for (let attempt = 0; ; attempt++) {
    await slot();
    const r = await fetch(BASE + path + qs, {
      headers: { Authorization: "Bearer " + token, Version: version, Accept: "application/json" },
    });
    const txt = await r.text();
    let j; try { j = JSON.parse(txt); } catch (e) { j = null; }
    if (r.ok) return j || {};
    if ((r.status === 429 || r.status >= 500) && attempt < 4) {
      const ra = Number(r.headers.get("retry-after"));
      await sleep(ra > 0 ? Math.min(ra * 1000, 10000) : 1000 * 2 ** attempt);
      continue;
    }
    throw new Error(`系统 ${r.status}: ${(j && (j.message || j.error)) || txt.slice(0, 200)}`);
  }
}
// 查询失败时不要当成「没有」：回传带 __err 的对象，显示时写「查询失败」
const soft = (pr) => pr.catch((e) => ({ __err: e && e.message ? e.message : String(e) }));

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
// 按字符（code point）截，不按 UTF-16 单位 —— 否则会把 emoji 切成半个，
// 留下孤立的 surrogate，送去 Anthropic API 时整个请求 JSON 无效（400）。
const clip = (s, n) => { const a = Array.from(String(s || "").replace(/\s+/g, " ").trim()); return a.length > n ? a.slice(0, n).join("") + "…" : a.join(""); };
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
// 员工 id → 名字、日历 id → 名字（日历名通常就是分店）
let userCache = null, userAt = 0, calCache = null, calAt = 0, calGroups = [], calLoose = [];
async function userMap() {
  if (userCache && Date.now() - userAt < 30 * 60 * 1000) return userCache;
  const { loc } = cfg();
  const j = await ghl("/users/", { locationId: loc }).catch(() => ({}));
  const map = {};
  (j.users || []).forEach((u) => { map[u.id] = u.name || [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || u.id; });
  userCache = map; userAt = Date.now();
  return map;
}
async function calendarMap() {
  if (calCache && Date.now() - calAt < 30 * 60 * 1000) return calCache;
  const { loc } = cfg();
  const j = await ghl("/calendars/", { locationId: loc }, "2021-04-15").catch(() => ({}));
  const map = {}, groups = new Set(), loose = [];
  (j.calendars || []).forEach((c) => {
    map[c.id] = c.name;
    if (c.groupId) groups.add(c.groupId); else loose.push(c.id);
  });
  calCache = map; calAt = Date.now(); calGroups = [...groups]; calLoose = loose;
  return map;
}
// 预约的 startTime 可能是 "2026-10-18 16:00:00"（已是分店当地时间）或 ISO 时间戳
const WD = ["日", "一", "二", "三", "四", "五", "六"];
function apptTime(v) {
  if (typeof v === "string") {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?$/);
    if (m) return `${+m[2]}/${+m[3]}（${WD[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()]}）${m[4]}:${m[5]}`;
  }
  const ms = toMs(v);
  if (!ms) return "—";
  const d = new Date(ms + 8 * 3600e3); // 马来西亚 = UTC+8，没有夏令时
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WD[d.getUTCDay()]}）${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
// 同时最多跑 n 个，避免一下打太多请求被系统限流
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k).catch((e) => ({ error: e.message })); }
  }));
  return out;
}
const msgStatus = (m) => ({ read: "已读", delivered: "已送达未读", sent: "已发出", failed: "发送失败", pending: "发送中" }[m.status] || m.status || "");
const msgWho = (m, users) => {
  if (m.direction === "inbound") return "顾客";
  if (m.source === "workflow") return "自动(workflow)";
  if (m.source === "bulk_actions") return "群发" + (m.userId && users[m.userId] ? `(${users[m.userId]})` : "");
  if (m.userId) return users[m.userId] ? `客服 ${users[m.userId]}` : "客服";
  if (m.source === "app") return "客服";
  return "我们";
};

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
  const head = `【${label}】系统里符合方向的对话总数约 ${total ?? "?"}；按条件筛选后显示 ${out.length} 条（扫描了最近 ${scanned} 条，最新在前）。现在时间 ${fmtTime(now)}。`;
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
  const [j, users] = await Promise.all([ghl(`/conversations/${conversationId}/messages`, { limit }, "2021-04-15"), userMap()]);
  const msgs = ((j.messages && j.messages.messages) || []).slice().reverse(); // 旧 → 新
  if (!msgs.length) return "这个对话没有信息。";
  const lines = msgs.map((m) => {
    const t = (m.messageType || "").replace("TYPE_", "");
    const fail = m.status === "failed" ? ` ⚠️发送失败${m.error ? "：" + clip(m.error, 60) : ""}`
      : m.direction === "outbound" && m.status ? ` [${msgStatus(m)}]` : "";
    const att = m.attachments && m.attachments.length ? ` [附件×${m.attachments.length}]` : "";
    return `[${fmtTime(toMs(m.dateAdded))}] ${msgWho(m, users)} (${t})${fail}${att}：${clip(m.body, 600) || "（无文字）"}`;
  });
  return `最近 ${msgs.length} 条信息（旧→新，现在 ${fmtTime(Date.now())}）：\n` + lines.join("\n");
}

// 顾客资料 + tags + pipeline + 预约 + 备注
export async function getContact({ contactId }) {
  if (!contactId) return "缺 contactId。";
  const { loc } = cfg();
  const [stages, cals] = await Promise.all([stageMap(), calendarMap()]);
  const [cj, aj, nj, oj] = await Promise.all([
    ghl(`/contacts/${contactId}`),
    soft(ghl(`/contacts/${contactId}/appointments`)),
    soft(ghl(`/contacts/${contactId}/notes`)),
    soft(ghl("/opportunities/search", { location_id: loc, contact_id: contactId, limit: 10 })),
  ]);
  const c = cj.contact || {};
  const opps = (oj.opportunities || []).map((o) => {
    const s = stages[o.pipelineStageId] || {};
    return `${s.pipeline || "?"} → ${s.stage || "?"} (${o.status || "open"}) · 更新 ${fmtTime(toMs(o.lastStageChangeAt || o.updatedAt))}`;
  });
  const appts = (aj.events || []).slice(-5).map((e) => `${apptTime(e.startTime)} · ${cals[e.calendarId] || e.title || ""} · ${e.appointmentStatus || e.status || ""}`);
  const notes = (nj.notes || []).slice(0, 5).map((n) => `${fmtTime(toMs(n.dateAdded))}：${clip(n.body, 200)}`);
  return [
    `顾客：${[c.firstName, c.lastName].filter(Boolean).join(" ") || c.contactName || "(无名)"} | 电话 ${c.phone || "—"} | Email ${c.email || "—"}`,
    `加入时间：${fmtTime(toMs(c.dateAdded))} | 来源：${c.source || "—"}`,
    `Tags：${(c.tags || []).join(", ") || "—"}`,
    `Pipeline：${oj.__err ? "⚠️查询失败（不代表没有）" : opps.join("；") || "无"}`,
    `预约（最近 5 个）：${aj.__err ? "⚠️查询失败（不代表没有）" : appts.join("；") || "无"}`,
    `备注（最新 5 条）：${nj.__err ? "⚠️查询失败（不代表没有）" : notes.join("；") || "无"}`,
  ].join("\n");
}

/* ------------------------------------------------------------ 预约（整批，按日历组） */

// 一个日历组一次就拿到组里所有分店的预约；不在组里的日历再逐个查。
// 范围切成 30 天一段，避免一次要太多。按 startTime 筛到 [fromT, toT)，按 id 去重。
async function fetchAppointments(fromT, toT) {
  const { loc } = cfg();
  const names = await calendarMap();
  const targets = [...calGroups.map((id) => ({ groupId: id })), ...calLoose.map((id) => ({ calendarId: id }))];
  if (!targets.length) throw new Error("找不到任何日历");
  const out = new Map();
  for (let a = fromT; a < toT; a += 30 * 86400e3) {
    const b = Math.min(a + 30 * 86400e3, toT);
    for (const t of targets) {
      const j = await ghl("/calendars/events", { locationId: loc, ...t, startTime: a, endTime: b }, "2021-04-15");
      for (const e of j.events || []) {
        if (e.deleted) continue;
        const st = toMs(e.startTime);
        if (st >= fromT && st < toT) out.set(e.id, { ...e, branch: names[e.calendarId] || e.calendarId });
      }
    }
  }
  return [...out.values()].sort((x, y) => toMs(x.startTime) - toMs(y.startTime));
}
const apptState = (e) => String(e.appointmentStatus || e.status || "").toLowerCase();
const isCancelled = (e) => /cancel|invalid/.test(apptState(e));
const branchName = (n) => String(n || "?").replace(/^SANS\s+/i, "").replace(/\s+APT$/i, "");

// 列某几天的预约（马来西亚日期），按分店分组 —— 回答「今天/明天要来店几个人」
export async function listAppointments({ date_from, date_to, branch, include_cancelled = true } = {}) {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(date_from || "") ? date_from : todayMY();
  const to = /^\d{4}-\d{2}-\d{2}$/.test(date_to || "") ? date_to : from;
  const startMs = myStart(from), endMs = myStart(to) + 86400e3;
  if (!(endMs > startMs)) return "日期不对：date_to 要在 date_from 之后。";
  if (endMs - startMs > 31 * 86400e3) return "一次最多查 31 天，请缩短日期范围。";
  const [events, users] = await Promise.all([fetchAppointments(startMs, endMs), userMap()]);
  const kw = branch ? String(branch).toLowerCase() : null;
  const list = events.filter((e) => !kw || String(e.branch).toLowerCase().includes(kw));
  const range = from === to ? from : `${from} ~ ${to}`;
  const live = list.filter((e) => !isCancelled(e));
  const cancelled = list.length - live.length;
  // 同一个人同一时间被约了两次
  const key = (e) => e.contactId + "|" + toMs(e.startTime);
  const seenKey = {};
  live.forEach((e) => { seenKey[key(e)] = (seenKey[key(e)] || 0) + 1; });
  const dupCount = Object.values(seenKey).filter((n) => n > 1).length;
  const people = new Set(live.map((e) => e.contactId)).size;
  const stateCount = {};
  live.forEach((e) => { const k = apptState(e) || "?"; stateCount[k] = (stateCount[k] || 0) + 1; });

  const byBranch = {};
  (include_cancelled ? list : live).forEach((e) => { (byBranch[branchName(e.branch)] = byBranch[branchName(e.branch)] || []).push(e); });
  const head = [
    `【预约】马来西亚日期 ${range}${kw ? ` · 分店包含「${branch}」` : ""} · 有效预约 ${live.length} 个（${people} 人${dupCount ? `，其中 ${dupCount} 人同一时段被重复预约` : ""}）· 已取消 ${cancelled} 个。现在 ${fmtTime(Date.now())}。`,
    `有效预约状态：${Object.entries(stateCount).map(([k, v]) => `${k} ${v}`).join("｜") || "—"}`,
    `各分店（有效）：${Object.entries(byBranch).map(([b, arr]) => `${b} ${arr.filter((e) => !isCancelled(e)).length}`).join("｜") || "—"}`,
  ].join("\n");
  if (!list.length) return head;
  const body = Object.entries(byBranch).sort((a, b) => a[0].localeCompare(b[0])).map(([b, arr]) => {
    const rows = arr.map((e) => {
      const f = (e.appointmentMeta && e.appointmentMeta.defaultFormDetails) || {};
      const phone = f.phone || "";
      const dup = !isCancelled(e) && seenKey[key(e)] > 1 ? " ⚠️重复预约" : "";
      return `  • ${apptTime(e.startTime)} · ${String(e.title || "").trim() || "(无名)"} ${phone} · ${apptState(e)}${dup}` +
        `${e.assignedUserId ? ` · 负责 ${users[e.assignedUserId] || e.assignedUserId}` : ""} · ${fmtTime(toMs(e.dateAdded))} 约的 · contactId=${e.contactId}`;
    });
    return `■ ${b}（${arr.filter((e) => !isCancelled(e)).length} 个有效）\n${rows.join("\n")}`;
  });
  return head + "\n\n" + body.join("\n\n");
}

/* ------------------------------------------------------------ 新 Lead（按注册日期，马来西亚时间） */

const pad = (n) => String(n).padStart(2, "0");
const mdy = (d) => `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}-${d.getUTCFullYear()}`; // 系统的日期格式
const todayMY = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
// "YYYY-MM-DD"（马来西亚日期）→ 那天 00:00 MYT 的 UTC 毫秒
const myStart = (ymd) => Date.parse(ymd + "T00:00:00+08:00");

// 按「进入 pipeline 的时间」列新 Lead。系统的日期筛选按 UTC 日期算，马来西亚早上 8 点前注册的
// 在 UTC 还是前一天 —— 所以用 UTC 日期去查（会多抓前一天晚上的），再按马来西亚时间自己筛。
export async function listNewLeads({ date_from, date_to, pipeline = "rm199" } = {}) {
  const { loc } = cfg();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(date_from || "") ? date_from : todayMY();
  const to = /^\d{4}-\d{2}-\d{2}$/.test(date_to || "") ? date_to : from;
  const startMs = myStart(from), endMs = myStart(to) + 86400e3;
  if (!(endMs > startMs)) return "日期不对：date_to 要在 date_from 之后。";
  if (endMs - startMs > 31 * 86400e3) return "一次最多查 31 天，请缩短日期范围。";

  // pipeline：默认 RM199；"all" = 全部；其他 = 名字包含这个字
  const pj = await ghl("/opportunities/pipelines", { locationId: loc });
  const pipes = pj.pipelines || [];
  let pipe = null;
  if (String(pipeline).toLowerCase() !== "all") {
    const kw = String(pipeline).toLowerCase();
    pipe = pipes.find((p) => p.name.toLowerCase().includes(kw));
    if (!pipe) return `找不到名字包含「${pipeline}」的 pipeline。现有：${pipes.map((p) => p.name).join("、")}`;
  }
  const stages = await stageMap();

  const utcFrom = new Date(startMs), utcTo = new Date(endMs - 1); // MYT 00:00 = 前一天 UTC 16:00
  const opps = [], seen = new Set();
  let startAfter, startAfterId;
  for (let page = 0; page < 20; page++) {
    const j = await ghl("/opportunities/search", {
      location_id: loc, pipeline_id: pipe ? pipe.id : undefined,
      date: mdy(utcFrom), endDate: mdy(utcTo), limit: 100, order: "added_desc", startAfter, startAfterId,
    });
    const list = j.opportunities || [];
    for (const o of list) {
      if (seen.has(o.id)) continue; seen.add(o.id);
      const c = toMs(o.createdAt);
      if (c >= startMs && c < endMs) opps.push(o);
    }
    const m = j.meta || {};
    if (list.length < 100 || !m.startAfterId) break;
    startAfter = m.startAfter; startAfterId = m.startAfterId;
  }
  opps.sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));

  const range = from === to ? from : `${from} ~ ${to}`;
  const pipeName = pipe ? pipe.name : "全部 pipeline";
  // 同一个人可能进 pipeline 两次（重复报名）
  const byContact = {};
  opps.forEach((o) => { byContact[o.contactId] = (byContact[o.contactId] || 0) + 1; });
  const dup = Object.values(byContact).filter((n) => n > 1).length;

  const stageCount = {};
  opps.forEach((o) => { const n = (stages[o.pipelineStageId] || {}).stage || "?"; stageCount[n] = (stageCount[n] || 0) + 1; });
  // 来源：落地页表格 = 当天注册；csv_import = 手动导入（导入日 ≠ 拿到联系的日期，日期看 tag）
  const origin = (o) => {
    const at = o.attributions || [];
    const first = at.find((x) => x.isFirst) || at[0] || {};
    const m = String(first.medium || "").toLowerCase();
    if (m === "csv_import" || at.some((x) => String(x.medium || "").toLowerCase() === "csv_import")) return "import";
    if (m === "form") return "form";
    return m || "other";
  };
  const originCount = { form: 0, import: 0, other: 0 };
  opps.forEach((o) => { const g = origin(o); originCount[g === "form" || g === "import" ? g : "other"]++; });
  const head = [
    `【新 Lead】${pipeName} · 马来西亚日期 ${range} · 共 ${opps.length} 个（按进入 pipeline 的时间算，精确数字）${dup ? `，其中 ${dup} 人重复报名` : "，没有重复"}。现在 ${fmtTime(Date.now())}。`,
    `来源：落地页当天注册 ${originCount.form}｜手动导入 ${originCount.import}${originCount.other ? `｜其他 ${originCount.other}` : ""}（手动导入的「进系统时间」是导入日，拿到联系的日期看日期 tag）`,
    `各阶段：${Object.entries(stageCount).map(([k, v]) => `${k} ${v}`).join("｜") || "—"}`,
  ].join("\n");
  if (!opps.length) return head;

  // 预约：整批从日历拿（注册那天起到未来 120 天），再按 contactId 对上 —— 不用一个人查一次
  const [users, cals] = await Promise.all([userMap(), calendarMap()]);
  const apptAll = await soft(fetchAppointments(startMs - 86400e3, Date.now() + 120 * 86400e3));
  const apptBy = {};
  if (!apptAll.__err) apptAll.forEach((e) => { (apptBy[e.contactId] = apptBy[e.contactId] || []).push(e); });
  // 对话要逐个查（每人 2 个请求）；人太多就只查前 80 个
  const detail = opps.length <= 80;
  const extra = detail ? await pool(opps, 3, async (o) => {
    const aj = apptAll.__err ? { __err: apptAll.__err } : { events: apptBy[o.contactId] || [] };
    const cj = await soft(ghl("/conversations/search", { locationId: loc, contactId: o.contactId, limit: 1, sortBy: "last_message_date", sort: "desc" }, "2021-04-15"));
    const conv = (cj.conversations || [])[0];
    let msgs = [], msgErr = null;
    if (conv) {
      const mj = await soft(ghl(`/conversations/${conv.id}/messages`, { limit: 4 }, "2021-04-15"));
      if (mj.__err) msgErr = mj.__err;
      msgs = (mj.messages && mj.messages.messages) || []; // 最新在前
    }
    const now = Date.now();
    const all = aj.events || [];
    const live = all.filter((e) => !isCancelled(e) && !/noshow/.test(apptState(e)));
    const upcoming = live.filter((e) => toMs(e.startTime) >= now - 6 * 3600e3);
    return { apptErr: aj.__err, convErr: cj.__err, msgErr, conv, msgs, appts: (upcoming.length ? upcoming : live).slice(0, 2), cancelled: all.filter((e) => /cancel/i.test(e.appointmentStatus || "")).length };
  }) : [];

  const lines = opps.map((o, i) => {
    const ct = o.contact || {};
    const st = stages[o.pipelineStageId] || {};
    const tags = ct.tags || [];
    const lang = ["chinese", "english", "malay"].find((t) => tags.includes(t));
    const g = origin(o);
    const dateTag = tags.find((t) => /^\d{1,2}-[a-z]{3}-\d{2}$/i.test(t));
    const how = g === "import" ? `手动导入${dateTag ? `（拿到联系：${dateTag}）` : ""}` : g === "form" ? "落地页注册" : `来源 ${g}`;
    const row = [
      `• ${fmtTime(toMs(o.createdAt))} ${how} · ${ct.name || o.name} · ${ct.phone || "无电话"}${lang ? " · " + lang : ""}${byContact[o.contactId] > 1 ? " · ⚠️重复报名" : ""}`,
      `  阶段：${st.stage || "?"}${o.status && o.status !== "open" ? `（${o.status}）` : ""}${o.assignedTo ? ` · 负责 ${users[o.assignedTo] || o.assignedTo}` : ""}`,
    ];
    const x = extra[i];
    if (x && !x.error) {
      row.push(`  预约：${x.apptErr ? "⚠️查询失败（不代表没有）" : x.appts.length ? x.appts.map((e) => `${apptTime(e.startTime)} @ ${branchName(e.branch || cals[e.calendarId])}（${apptState(e)}）`).join("；") : "无"}${x.cancelled ? ` · 已取消过 ${x.cancelled} 次` : ""}`);
      if (x.convErr) {
        row.push("  对话：⚠️查询失败（不代表没有对话）");
      } else if (x.conv) {
        const last = x.msgs[0];
        const lastOut = x.msgs.find((m) => m.direction === "outbound");
        const lastIn = x.msgs.find((m) => m.direction === "inbound");
        row.push(`  最后信息：${x.msgErr ? "⚠️查询失败" : last ? `${fmtTime(toMs(last.dateAdded))} ${msgWho(last, users)}：「${clip(last.body, 90) || "（无文字）"}」` : "—"}`);
        row.push(`  对话状态：${x.conv.lastMessageDirection === "inbound" ? "🔴 顾客最后发，要回复" : "🟡 我们最后发，等顾客"}` +
          `${lastOut ? ` · 我们最后一条 ${msgStatus(lastOut)}` : ""}${lastIn ? "" : " · 最近几条里顾客没发信息"} · 未读 ${x.conv.unreadCount || 0} · conversationId=${x.conv.id}`);
      } else {
        row.push("  对话：没有 WhatsApp/信息对话（可能是电话联系或还没开始）");
      }
    } else if (x && x.error) {
      row.push(`  （预约/聊天查询失败：${x.error}）`);
    }
    row.push(`  contactId=${o.contactId}`);
    return row.join("\n");
  });
  return head + (detail ? "" : "\n（人数超过 80，只列基本资料；要看预约和聊天请缩短日期）") + "\n\n" + lines.join("\n\n");
}
