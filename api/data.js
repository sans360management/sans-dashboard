// Vercel Serverless Function: /api/data
// 验证访问密码 → 从私密 Google Sheet（Apps Script）取数据 → 返回 JSON。
// 所有凭证只存在服务器端环境变量，浏览器永远看不到。
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Vercel 会自动把 JSON body 解析到 req.body；兜底再解析一次
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const password = body && body.password;

  const REAL = process.env.DASHBOARD_PASSWORD;
  const url = process.env.APPS_SCRIPT_URL;
  const token = process.env.APPS_SCRIPT_TOKEN;

  if (!REAL || !url || !token) {
    res.status(500).json({
      error: "服务器未配置（缺少 DASHBOARD_PASSWORD / APPS_SCRIPT_URL / APPS_SCRIPT_TOKEN）",
    });
    return;
  }

  if (!password || password !== REAL) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  try {
    const sep = url.includes("?") ? "&" : "?";
    const r = await fetch(url + sep + "token=" + encodeURIComponent(token), {
      redirect: "follow",
    });
    if (!r.ok) throw new Error("Google 返回 HTTP " + r.status);
    const data = await r.json();
    if (data && data.error) throw new Error("Apps Script: " + data.error);

    // 补充尚未进入 live 表的月份（如 June，来自 PDF）—— 存在 Vercel 环境变量 OUTLET_EXTRA（私密、不进代码）
    // 格式：{"Jun 26":{"actual":648412,"newLead":254887.2}}
    if (data && Array.isArray(data.outletSales) && process.env.OUTLET_EXTRA) {
      try {
        const extra = JSON.parse(process.env.OUTLET_EXTRA);
        const has = (m) => data.outletSales.some((o) => o.m === m);
        for (const m in extra) {
          if (!has(m)) {
            const x = extra[m];
            const actual = Number(x.actual) || 0;
            const newLead = Number(x.newLead) || 0;
            data.outletSales.push({ m, actual, newLead, other: Math.max(0, actual - newLead) });
          }
        }
        const MIDX = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
        const key = (s) => { const p = String(s).split(" "); return (2000 + parseInt(p[1], 10)) * 100 + (MIDX[p[0]] || 0); };
        data.outletSales.sort((a, b) => key(a.m) - key(b.m));
      } catch (e) { /* 忽略坏的 OUTLET_EXTRA */ }
    }

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: "读取表格失败：" + e.message });
  }
}
