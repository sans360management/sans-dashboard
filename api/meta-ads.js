// Vercel Serverless Function: /api/meta-ads
// 拉 Meta ad 层级数据（指定时间窗口）→ 按目标(messaging/lead)分组、和同组中位数比 → 评级 🟢🟡🔴
// 密码门控；token 只在服务器端（META_TOKEN / META_AD_ACCOUNT）。
import { fetchInsightsPaged } from "../lib/meta.js";

export const config = { maxDuration: 60 }; // 异步报表需要轮询，给足时间

import { resolveUser } from "../lib/users.js";

const V = "v21.0";
const av = (actions, t) => { const x = (actions || []).find((y) => y.action_type === t); return x ? Number(x.value) : 0; };
const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
async function gj(url) {
  const r = await fetch(url);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || "Meta error");
  return j;
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const user = resolveUser(body.password);
  if (!user) { res.status(401).json({ error: "unauthorized" }); return; }
  if (!user.tabs.includes("winners")) { res.status(403).json({ error: "无权访问 Winning Ads" }); return; }

  const token = process.env.META_TOKEN, act = process.env.META_AD_ACCOUNT;
  if (!token || !act) { res.status(500).json({ error: "Meta 未配置（META_TOKEN / META_AD_ACCOUNT）" }); return; }

  const days = [3, 7, 14, 30].includes(Number(body.window)) ? Number(body.window) : 30;
  const until = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);

  try {
    const tr = encodeURIComponent(JSON.stringify({ since, until }));
    const fields = "ad_id,ad_name,campaign_name,spend,impressions,inline_link_clicks,ctr,cpm,actions";
    const rows = await fetchInsightsPaged(`https://graph.facebook.com/${V}/${act}/insights?level=ad&fields=${fields}&time_range=${tr}&access_token=${encodeURIComponent(token)}`);

    // 批量取 状态 + 缩图（每 50 个一批）
    const ids = rows.map((r) => r.ad_id);
    const meta = {};
    for (let i = 0; i < ids.length; i += 25) {
      const batch = ids.slice(i, i + 25).join(",");
      if (!batch) continue;
      // 状态+缩图是锦上添花：单批失败就跳过（不让整个 Winning Ads 报错）
      try {
        const j = await gj(`https://graph.facebook.com/${V}/?ids=${batch}&fields=effective_status,creative%7Bthumbnail_url%7D&access_token=${encodeURIComponent(token)}`);
        Object.assign(meta, j);
      } catch (e) { /* 跳过该批的状态/缩图 */ }
    }

    let ads = rows.map((r) => {
      const spend = Number(r.spend) || 0;
      const msg = av(r.actions, "onsite_conversion.messaging_conversation_started_7d");
      const reg = av(r.actions, "complete_registration");
      const objective = msg >= reg ? (msg > 0 ? "messaging" : "other") : "lead";
      const result = objective === "messaging" ? msg : objective === "lead" ? reg : 0;
      const m = meta[r.ad_id] || {};
      return {
        id: r.ad_id, name: r.ad_name || "(unnamed)", campaign: r.campaign_name || "",
        spend, msg, reg, comment: av(r.actions, "comment"),
        ctr: Number(r.ctr) || 0, cpm: Number(r.cpm) || 0,
        objective, result, costPerResult: result > 0 ? spend / result : null,
        status: m.effective_status || "UNKNOWN",
        active: m.effective_status === "ACTIVE",
        thumb: (m.creative && m.creative.thumbnail_url) || null,
        badge: null, eligible: false,
      };
    });

    // 同目标内，够样本(spend≥150 或 result≥5)的才和中位数比，评级
    const medians = {};
    for (const obj of ["messaging", "lead"]) {
      const grp = ads.filter((a) => a.objective === obj && a.costPerResult != null && (a.spend >= 150 || a.result >= 5));
      const md = median(grp.map((a) => a.costPerResult));
      medians[obj] = md;
      grp.forEach((a) => {
        a.eligible = true;
        a.badge = md > 0 ? (a.costPerResult < md * 0.8 ? "good" : a.costPerResult <= md * 1.3 ? "ok" : "poor") : "ok";
      });
    }

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ window: days, since, until, medians, ads });
  } catch (e) {
    res.status(502).json({ error: "Meta 读取失败：" + e.message });
  }
}
