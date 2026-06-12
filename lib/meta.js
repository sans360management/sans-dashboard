// 共享：Meta Marketing API 取数 + 评分（被 api/ad-insights.js 的工具调用复用）
const V = "v21.0";
const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };
const av = (actions, t) => { const x = (actions || []).find((y) => y.action_type === t); return x ? Number(x.value) : 0; };
const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const rm = (n) => "RM " + Math.round(Number(n) || 0).toLocaleString();
async function gj(url) { const r = await fetch(url); const j = await r.json(); if (j.error) throw new Error(j.error.message || "Meta error"); return j; }
const iso = (d) => d.toISOString().slice(0, 10);

// 分页拉 insights：小页(50) + 跟 paging.next 游标，避免「Please reduce the amount of data」(错误码1)。
// baseUrl 不要带 limit/after；遇到「数据太多」自动把页大小降到 25 重试当前页。
export async function fetchInsightsPaged(baseUrl) {
  const sep = baseUrl.includes("?") ? "&" : "?";
  let url = `${baseUrl}${sep}limit=50`;
  const out = [];
  for (let page = 0; page < 40 && url; page++) {
    let j;
    try {
      j = await gj(url);
    } catch (e) {
      // 兜底：该页还是太大 → 用更小的页(25)重试一次同一个 url
      if (/reduce the amount of data/i.test(e.message || "") && /([?&])limit=50(\b|&)/.test(url)) {
        j = await gj(url.replace(/([?&])limit=50(\b|&)/, "$1limit=25$2"));
      } else { throw e; }
    }
    if (Array.isArray(j.data)) out.push(...j.data);
    url = j.paging && j.paging.next ? j.paging.next : null;
  }
  return out;
}

// period -> {since, until}（today 为 ISO 字符串）
export function resolvePeriod(period, since, until, todayISO) {
  const today = new Date((todayISO || new Date().toISOString().slice(0, 10)) + "T00:00:00Z");
  const back = (n) => iso(new Date(today.getTime() - n * 86400000));
  const u = iso(today);
  switch (period) {
    case "today": return { since: u, until: u };
    case "last_7d": return { since: back(6), until: u };
    case "last_14d": return { since: back(13), until: u };
    case "last_30d": return { since: back(29), until: u };
    case "this_month": return { since: iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))), until: u };
    case "last_month": {
      const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
      return { since: iso(first), until: iso(last) };
    }
    case "custom":
    default:
      return { since: since || back(29), until: until || u };
  }
}

// 每条广告 + 同目标中位数评级（不取缩图，省 token；带 active 状态）
export async function fetchAdLevel(token, act, since, until) {
  const tr = encodeURIComponent(JSON.stringify({ since, until }));
  const fields = "ad_id,ad_name,spend,impressions,inline_link_clicks,ctr,cpm,actions";
  const rows = await fetchInsightsPaged(`https://graph.facebook.com/${V}/${act}/insights?level=ad&fields=${fields}&time_range=${tr}&access_token=${encodeURIComponent(token)}`);
  const ids = rows.map((r) => r.ad_id);
  const status = {};
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50).join(",");
    if (!batch) continue;
    const j = await gj(`https://graph.facebook.com/${V}/?ids=${batch}&fields=effective_status&access_token=${encodeURIComponent(token)}`);
    Object.assign(status, j);
  }
  let ads = rows.map((r) => {
    const spend = num(r.spend);
    const msg = av(r.actions, "onsite_conversion.messaging_conversation_started_7d");
    const reg = av(r.actions, "complete_registration");
    const objective = msg >= reg ? (msg > 0 ? "messaging" : "other") : "lead";
    const result = objective === "messaging" ? msg : objective === "lead" ? reg : 0;
    const st = (status[r.ad_id] || {}).effective_status || "UNKNOWN";
    return { name: r.ad_name || "(unnamed)", spend, msg, reg, ctr: num(r.ctr), cpm: num(r.cpm),
      objective, result, costPerResult: result > 0 ? spend / result : null, active: st === "ACTIVE", badge: null, eligible: false };
  });
  const medians = {};
  for (const obj of ["messaging", "lead"]) {
    const grp = ads.filter((a) => a.objective === obj && a.costPerResult != null && (a.spend >= 150 || a.result >= 5));
    const md = median(grp.map((a) => a.costPerResult));
    medians[obj] = md;
    grp.forEach((a) => { a.eligible = true; a.badge = md > 0 ? (a.costPerResult < md * 0.8 ? "good" : a.costPerResult <= md * 1.3 ? "ok" : "poor") : "ok"; });
  }
  return { since, until, medians, ads };
}

// 账号总览
export async function fetchAccount(token, act, since, until) {
  const tr = encodeURIComponent(JSON.stringify({ since, until }));
  const fields = "spend,impressions,inline_link_clicks,ctr,cpm,reach,frequency,actions";
  const j = await gj(`https://graph.facebook.com/${V}/${act}/insights?fields=${fields}&time_range=${tr}&access_token=${encodeURIComponent(token)}`);
  const d = (j.data || [])[0] || {};
  const spend = num(d.spend), msg = av(d.actions, "onsite_conversion.messaging_conversation_started_7d"), reg = av(d.actions, "complete_registration");
  return {
    since, until, spend, impr: num(d.impressions), clicks: num(d.inline_link_clicks),
    ctr: num(d.ctr), cpm: num(d.cpm), reach: num(d.reach), freq: num(d.frequency),
    msg, reg, comment: av(d.actions, "comment"), leads: av(d.actions, "lead"),
    costPerMsg: msg ? spend / msg : null, costPerReg: reg ? spend / reg : null,
  };
}

const adLine = (a) => `· ${String(a.name).slice(0, 50)} | 成本/结果 ${a.costPerResult != null ? rm(a.costPerResult) : "—"} | 结果数 ${a.result} | CTR ${a.ctr.toFixed(2)}% | 花费 ${rm(a.spend)} | ${a.active ? "ACTIVE" : "PAUSED"}`;

export function summarizeAdLevel(res) {
  const out = [`时段 ${res.since} ~ ${res.until}`];
  for (const [obj, label, unit] of [["messaging", "Messaging 广告（每条信息成本）", "每条信息"], ["lead", "Landing Page 广告（每个注册成本）", "每个注册"]]) {
    const grp = res.ads.filter((a) => a.objective === obj && a.eligible && a.costPerResult != null).sort((a, b) => a.costPerResult - b.costPerResult);
    out.push(`\n### ${label}\n中位数（${unit}）= ${rm(res.medians[obj] || 0)}，共 ${grp.length} 条够样本\nTOP：\n${grp.slice(0, 8).map(adLine).join("\n") || "（无）"}\n最差：\n${grp.slice(-6).reverse().map(adLine).join("\n") || "（无）"}`);
  }
  return out.join("\n");
}

export function summarizeAccount(a) {
  return `时段 ${a.since} ~ ${a.until} 账号总览：\n花费 ${rm(a.spend)} | 展示 ${a.impr.toLocaleString()} | 链接点击 ${a.clicks.toLocaleString()} | CTR ${a.ctr.toFixed(2)}% | CPM ${rm(a.cpm)} | 触达 ${a.reach.toLocaleString()} | 频次 ${a.freq.toFixed(2)}\n发起信息 ${a.msg} | 落地页注册 ${a.reg} | 评论 ${a.comment} | Meta-Lead ${a.leads}\n每条信息成本 ${a.costPerMsg != null ? rm(a.costPerMsg) : "—"} | 每个注册成本 ${a.costPerReg != null ? rm(a.costPerReg) : "—"}`;
}
