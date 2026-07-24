// Vercel Serverless Function: /api/send-report
// 由 GitHub Actions 每晚 23:59(马来西亚)定时触发 → 读销售数据 → 发 Telegram。完全云端，不用开电脑。
// 安全：设了环境变量 REPORT_KEY 后，必须带 ?key=<REPORT_KEY> 才能触发（防别人乱发）。

export default async function handler(req, res) {
  const key = (req.query && req.query.key) || "";
  if (process.env.REPORT_KEY && key !== process.env.REPORT_KEY) {
    return res.status(401).json({ error: "unauthorized" });
  }
  try {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;

    const dataRes = await fetch(`${proto}://${host}/api/data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: process.env.DASHBOARD_PASSWORD })
    });
    const data = await dataRes.json();

    if (!data.dailySales || data.dailySales.length < 2) {
      return res.status(200).json({ error: 'Not enough data' });
    }

    // 日期 TZ-safe 规整："2026-06-18" 或 Apps Script 的 "Thu Jun 18 2026 ... GMT+0800" 都 → "YYYY-MM-DD"
    const MON3 = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
    const ymd = (s) => {
      s = String(s);
      let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return `${m[1]}-${m[2]}-${m[3]}`;
      m = s.match(/\b([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{4})/);
      if (m && MON3[m[1]]) return `${m[3]}-${MON3[m[1]]}-${String(+m[2]).padStart(2, '0')}`;
      return s.slice(0, 10);
    };
    const daily = [...data.dailySales].sort((a, b) => ymd(a.date).localeCompare(ymd(b.date)));
    const t = daily[daily.length - 1];
    const y = daily[daily.length - 2];
    const sum = (day, f) => day ? day.branches.reduce((s, b) => s + (b[f] || 0), 0) : 0;

    // 逐店：按分店名把「今天 vs 昨天」配对，算 New Lead Sales(first) / Consult / Enroll 的日增量
    const branchMap = (day) => {
      const m = {};
      ((day && day.branches) || []).forEach((b) => { const k = String(b.branch || "").trim(); if (k) m[k] = b; });
      return m;
    };
    const yMap = branchMap(y);
    const perBranch = ((t.branches) || []).map((b) => {
      const k = String(b.branch || "").trim();
      const yb = yMap[k] || {};
      return {
        branch: k,
        dFirst: (b.first || 0) - (yb.first || 0),
        dConsult: (b.consult || 0) - (yb.consult || 0),
        dEnrol: (b.enrol || 0) - (yb.enrol || 0),
      };
    }).filter((x) => x.branch);
    // 只列「今天有变化」的分店，按 New Lead Sales 增长从高到低
    const active = perBranch.filter((x) => x.dFirst || x.dConsult || x.dEnrol).sort((a, b) => b.dFirst - a.dFirst);

    const todaySales  = sum(t, 'today');
    const mtdSales    = sum(t, 'mtd');
    const mtdFirst    = sum(t, 'first');
    const newLeads    = sum(t, 'first')   - sum(y, 'first');
    const consult     = sum(t, 'consult') - sum(y, 'consult');
    const enrol       = sum(t, 'enrol')   - sum(y, 'enrol');

    const MONTHLY_TARGET = Number(process.env.MONTHLY_TARGET) || 2000000;
    const [tY, tM] = ymd(t.date).split('-').map(Number);
    const daysInMonth = new Date(tY, tM, 0).getDate();
    const dailyTarget = MONTHLY_TARGET / daysInMonth;
    const mtdGap      = MONTHLY_TARGET - mtdSales;
    const mtdPct      = (mtdSales / MONTHLY_TARGET * 100).toFixed(1);
    const dailyGap    = todaySales - dailyTarget;
    const dailyPct    = (todaySales / dailyTarget * 100).toFixed(1);
    const newLeadsPct = mtdSales > 0 ? (mtdFirst / mtdSales * 100).toFixed(1) : '0.0';

    const fmtDMY = (s) => { const [y, m, d] = ymd(s).split('-'); return `${d}-${m}-${y}`; };
    const fmtNum = (n, dec=2) => Number(n).toLocaleString('en-MY', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const sign = (n) => n >= 0 ? '+' : '';
    const month = tM;

    // 今日销售拆分：新客(New Lead Sales=first 日增量) vs 旧客(今日总收−新客)
    const existingSales = todaySales - newLeads;
    // 逐店明细行
    const branchLines = active.length
      ? active.map((x) => `• ${x.branch}: ${sign(x.dFirst)}${fmtNum(x.dFirst, 0)} | Consult ${sign(x.dConsult)}${x.dConsult} | Enroll ${sign(x.dEnrol)}${x.dEnrol}`).join('\n')
      : '（今日各分店暂无变化）';

    const msg = `${month}月 Target - 2Mil
🗓️ ${fmtDMY(t.date)}
➖➖➖
目标：${fmtNum(MONTHLY_TARGET, 0)}
现状: ${fmtNum(mtdSales)}
差距：${fmtNum(mtdGap)}
目前完成度：${mtdPct}%
➖➖➖
每日目标结果: ${fmtNum(dailyTarget, 0)}
今日现状结果：${fmtNum(todaySales)}
差距: ${sign(dailyGap)}${fmtNum(dailyGap)}
今日完成度：${dailyPct}%
➖➖➖
New Leads Sales: ${fmtNum(newLeads)}
Total Consult: ${consult}
Total Enrolment: ${enrol}
➖➖➖
对比昨天（${fmtDMY(y.date)}）增加：
New Leads Sales: ${sign(newLeads)}${fmtNum(newLeads)}
Total Consult: ${sign(consult)}${consult}
Total Enrolment: ${sign(enrol)}${enrol}
➖➖➖
New Leads Sales 占 Total Sales 比例：
${newLeadsPct}%
➖➖➖
🆕 今日销售拆分：
New Sales（新客）: ${fmtNum(newLeads)}
Existing Sales（旧客）: ${fmtNum(existingSales)}
➖➖➖
🏬 各分店（对比昨天 ${fmtDMY(y.date)}）
New Lead Sales | +Consult | +Enroll
${branchLines}`;

    const tgRes = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: msg })
    });
    const tgData = await tgRes.json();
    if (!tgData.ok) return res.status(500).json({ error: 'Telegram failed', detail: tgData });
    return res.status(200).json({ success: true, date: fmtDMY(t.date) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
