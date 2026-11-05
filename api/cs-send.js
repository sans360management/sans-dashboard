// Vercel Serverless Function: /api/cs-send
// 客服在 /cs 按「确认发送」才会到这里 —— AI 自己不能发，只能准备草稿。
// 只限 username 顾客（系统收件箱不能打字的那种），发送前再查一次资格（窗口、有没有电话号码）。
// 门控：CS_KEY（链接的 k）+ 每位客服自己的 PIN（环境变量 CS_PINS，JSON：{"1234":"Anna", ...}）。
import { sendUsernameReply } from "../lib/ghl.js";

export const config = { maxDuration: 30 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function staffFor(pin) {
  try {
    const map = JSON.parse(process.env.CS_PINS || "{}");
    const name = map[String(pin || "").trim()];
    return typeof name === "string" && name.trim() ? name.trim() : null;
  } catch (e) { return null; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const key = process.env.CS_KEY;
  if (!key || body.k !== key) { res.status(401).json({ error: "链接无效或已更换，请向管理员索取新链接" }); return; }
  if (!process.env.CS_PINS) { res.status(500).json({ error: "还没设定客服 PIN，请联系管理员" }); return; }
  if (!process.env.GHL_TOKEN || !process.env.GHL_LOCATION_ID) { res.status(500).json({ error: "系统未配置，请联系管理员" }); return; }

  const staff = staffFor(body.pin);
  if (!staff) { await sleep(800); res.status(403).json({ error: "PIN 不对" }); return; } // 慢一点，减少乱试

  try {
    const r = await sendUsernameReply({ contactId: String(body.contactId || ""), message: body.message, staff });
    if (!r.ok) { res.status(400).json({ error: r.reason || "发不出去" }); return; }
    console.log(`[cs-send] ${staff} -> ${r.contactId || body.contactId} (${r.messageId})`);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ ok: true, staff, name: r.name, sentAt: Date.now() });
  } catch (e) {
    res.status(502).json({ error: "发送失败：" + (e && e.message ? e.message : String(e)) });
  }
}
