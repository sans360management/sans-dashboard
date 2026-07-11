// Vercel Serverless Function: /api/ad-video-stats
// 按广告名(子串)匹配指定 video 广告，拉「全生命周期(date_preset=maximum)」的 Meta 指标：
// CPL / 花费 / Leads / Hook Rate(3秒/展示) / CTR(link) / 平均观看时长 / 完播率 / LP转化率。
// 做法：先轻量取 id+name 匹配目标 → 只对这几支广告逐个拉 insights（避免账号级 maximum 超时）。
// 密码门控(winners)；token 只在服务器端(META_TOKEN / META_AD_ACCOUNT)。
import { resolveUser } from "../lib/users.js";

export const config = { maxDuration: 60 };
const V = "v21.0";
const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };
const av = (arr, t) => { const x = (arr || []).find((y) => y.action_type === t); return x ? Number(x.value) : 0; };
const vv = (arr) => { if (!Array.isArray(arr) || !arr.length) return 0; const x = arr.find((y) => y.action_type === "video_view") || arr[0]; return Number(x.value) || 0; };
async function gj(url) { const r = await fetch(url); const j = await r.json(); if (j.error) throw new Error(j.error.message || "Meta error"); return j; }

const DEFAULT_NAMES = ["6月口播16", "6月口播13", "6月口播12", "6月口播7", "6月口播14", "自然疗法-KL-Video-CC V2", "5月Sans护理口播15"];

async function allAds(token, act) {
  let url = `https://graph.facebook.com/${V}/${act}/ads?fields=id,name,effective_status,created_time&limit=250&access_token=${encodeURIComponent(token)}`;
  const out = [];
  for (let p = 0; p < 40 && url; p++) {
    const j = await gj(url);
    if (Array.isArray(j.data)) out.push(...j.data);
    url = j.paging && j.paging.next ? j.paging.next : null;
  }
  return out;
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

  const names = Array.isArray(body.names) && body.names.length ? body.names : DEFAULT_NAMES;

  try {
    const ads = await allAds(token, act);
    const matched = ads.filter((a) => names.some((n) => (a.name || "").includes(n)));

    const fields = "spend,impressions,inline_link_clicks,inline_link_click_ctr,actions,video_avg_time_watched_actions,video_thruplay_watched_actions,video_p100_watched_actions,video_play_actions";
    const out = await Promise.all(matched.map(async (a) => {
      let d = {};
      try {
        const j = await gj(`https://graph.facebook.com/${V}/${a.id}/insights?date_preset=maximum&fields=${fields}&access_token=${encodeURIComponent(token)}`);
        d = (j.data || [])[0] || {};
      } catch (e) { /* 该广告无 insights */ }
      const spend = num(d.spend), impr = num(d.impressions);
      const regs = av(d.actions, "complete_registration");
      const leads = regs || av(d.actions, "lead") || av(d.actions, "onsite_conversion.messaging_conversation_started_7d");
      const lpv = av(d.actions, "landing_page_view");
      const sec3 = av(d.actions, "video_view");
      const plays = vv(d.video_play_actions);
      const p100 = vv(d.video_p100_watched_actions);
      return {
        name: a.name, status: a.effective_status, created: a.created_time,
        spend, leads, regs,
        cpl: leads ? spend / leads : null,
        impressions: impr, linkClicks: num(d.inline_link_clicks),
        ctrLink: num(d.inline_link_click_ctr),
        sec3, hookRate: impr ? (sec3 / impr) * 100 : null,
        plays, p100,
        completionRate: plays ? (p100 / plays) * 100 : null,
        avgWatch: vv(d.video_avg_time_watched_actions),
        lpv, lpCvr: lpv ? (regs / lpv) * 100 : null,
      };
    }));
    out.sort((a, b) => b.spend - a.spend);

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ count: out.length, ads: out });
  } catch (e) {
    res.status(502).json({ error: "Meta 读取失败：" + e.message });
  }
}
