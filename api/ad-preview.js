// Vercel Serverless Function: /api/ad-preview
// 按需取某条广告的 Meta 官方"广告预览"(返回一段 <iframe>，能播视频)。
// 懒加载：前端点了哪张卡才调一次。token 只在服务器端（META_TOKEN）。
import { resolveUser } from "../lib/users.js";

export const config = { maxDuration: 30 };

const V = "v21.0";
const FORMATS = ["MOBILE_FEED_STANDARD", "DESKTOP_FEED_STANDARD", "INSTAGRAM_STANDARD", "INSTAGRAM_STORY"];

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

  const token = process.env.META_TOKEN;
  if (!token) { res.status(500).json({ error: "Meta 未配置（META_TOKEN）" }); return; }

  const adId = String(body.adId || "").trim();
  if (!adId || !/^\d+$/.test(adId)) { res.status(400).json({ error: "缺少有效的 adId" }); return; }

  const format = FORMATS.includes(body.format) ? body.format : "MOBILE_FEED_STANDARD";

  try {
    const j = await gj(`https://graph.facebook.com/${V}/${encodeURIComponent(adId)}/previews?ad_format=${format}&access_token=${encodeURIComponent(token)}`);
    const html = (j.data && j.data[0] && j.data[0].body) || "";
    const m = html.match(/src="([^"]+)"/);
    const previewUrl = m ? m[1].replace(/&amp;/g, "&") : null;

    // 降级用的 Facebook 链接：单独最佳努力获取，失败也不影响预览
    let permalink = null;
    try {
      const p = await gj(`https://graph.facebook.com/${V}/${encodeURIComponent(adId)}?fields=preview_shareable_link&access_token=${encodeURIComponent(token)}`);
      permalink = p.preview_shareable_link || null;
    } catch (e) { /* 忽略 */ }

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ previewUrl, permalink });
  } catch (e) {
    res.status(502).json({ error: "Meta 预览读取失败：" + e.message });
  }
}
