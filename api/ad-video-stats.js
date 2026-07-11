// Vercel Serverless Function: /api/ad-video-stats
// 按广告名(子串)匹配指定 video 广告，拉「全生命周期(date_preset=maximum)」的 Meta 指标：
// CPL / 花费 / Leads / Hook Rate(3秒/展示) / CTR(link) / 平均观看时长 / 完播率 / LP转化率。
// 密码门控(winners)；token 只在服务器端(META_TOKEN / META_AD_ACCOUNT)。
import { resolveUser } from "../lib/users.js";
import { fetchInsightsPaged } from "../lib/meta.js";

export const config = { maxDuration: 60 };
const V = "v21.0";
const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };
const av = (arr, t) => { const x = (arr || []).find((y) => y.action_type === t); return x ? Number(x.value) : 0; };
// video_* 字段是 [{action_type:'video_view', value}] 形式，取 video_view 或首个
const vv = (arr) => { if (!Array.isArray(arr) || !arr.length) return 0; const x = arr.find((y) => y.action_type === "video_view") || arr[0]; return Number(x.value) || 0; };

const DEFAULT_NAMES = ["6月口播16", "6月口播13", "6月口播12", "6月口播7", "6月口播14", "自然疗法-KL-Video-CC V2", "5月Sans护理口播15"];

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
    const fields = "ad_id,ad_name,spend,impressions,inline_link_clicks,inline_link_click_ctr,ctr,actions,video_avg_time_watched_actions,video_thruplay_watched_actions,video_p100_watched_actions,video_play_actions";
    const rows = await fetchInsightsPaged(`https://graph.facebook.com/${V}/${act}/insights?level=ad&date_preset=maximum&fields=${fields}&access_token=${encodeURIComponent(token)}`);

    const out = rows
      .filter((r) => names.some((n) => (r.ad_name || "").includes(n)))
      .map((r) => {
        const spend = num(r.spend), impr = num(r.impressions);
        const regs = av(r.actions, "complete_registration");
        const leadA = av(r.actions, "lead");
        const msg = av(r.actions, "onsite_conversion.messaging_conversation_started_7d");
        const leads = regs || leadA || msg; // 优先注册
        const lpv = av(r.actions, "landing_page_view");
        const sec3 = av(r.actions, "video_view"); // 3 秒播放
        const plays = vv(r.video_play_actions);
        const p100 = vv(r.video_p100_watched_actions);
        const thru = vv(r.video_thruplay_watched_actions);
        const avgWatch = vv(r.video_avg_time_watched_actions);
        return {
          name: r.ad_name,
          spend, leads, regs,
          cpl: leads ? spend / leads : null,
          impressions: impr,
          linkClicks: num(r.inline_link_clicks),
          ctrLink: num(r.inline_link_click_ctr),          // %
          sec3, hookRate: impr ? (sec3 / impr) * 100 : null, // 3秒/展示 %
          plays, p100, thru,
          completionRate: plays ? (p100 / plays) * 100 : null, // 完播 %
          avgWatch,                                        // 平均观看秒
          lpv, lpCvr: lpv ? (regs / lpv) * 100 : null,     // LP 转化 %（注册/落地页浏览）
        };
      })
      .sort((a, b) => b.spend - a.spend);

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ count: out.length, matchedNames: names, ads: out });
  } catch (e) {
    res.status(502).json({ error: "Meta 读取失败：" + e.message });
  }
}
