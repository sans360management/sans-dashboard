// Vercel Serverless Function: /api/send-report
// Triggered by Vercel Cron at 23:59 daily — no computer needed

export default async function handler(req, res) {
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

    const daily = [...data.dailySales].sort((a, b) => new Date(a.date) - new Date(b.date));
    const t = daily[daily.length - 1];
    const y = daily[daily.length - 2];
    const sum = (day, f) => day ? day.branches.reduce((s, b) => s + (b[f] || 0), 0) : 0;

    const todaySales  = sum(t, 'today');
    const mtdSales    = sum(t, 'mtd');
    const mtdFirst    = sum(t, 'first');
    const newLeads    = sum(t, 'first')   - sum(y, 'first');
    const consult     = sum(t, 'consult') - sum(y, 'consult');
    const enrol       = sum(t, 'enrol')   - sum(y, 'enrol');

    const MONTHLY_TARGET = Number(process.env.MONTHLY_TARGET) || 2000000;
    const tDate = new Date(t.date);
    const yDate = new Date(y.date);
    const daysInMonth = new Date(tDate.getFullYear(), tDate.getMonth() + 1, 0).getDate();
    const dailyTarget = MONTHLY_TARGET / daysInMonth;
    const mtdGap      = MONTHLY_TARGET - mtdSales;
    const mtdPct      = (mtdSales / MONTHLY_TARGET * 100).toFixed(1);
    const dailyGap    = todaySales - dailyTarget;
    const dailyPct    = (todaySales / dailyTarget * 100).toFixed(1);
    const newLeadsPct = mtdSales > 0 ? (mtdFirst / mtdSales * 100).toFixed(1) : '0.0';

    const fmt2 = (d) => `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
    const fmtNum = (n, dec=2) => Number(n).toLocaleString('en-MY', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const sign = (n) => n >= 0 ? '+' : '';
    const month = tDate.getMonth() + 1;

    const msg = `${month}月 Target - 2Mil
🗓️ ${fmt2(tDate)}
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
对比昨天（${fmt2(yDate)}）增加：
New Leads Sales: ${sign(newLeads)}${fmtNum(newLeads)}
Total Consult: ${sign(consult)}${consult}
Total Enrolment: ${sign(enrol)}${enrol}
➖➖➖
New Leads Sales 占 Total Sales 比例：
${newLeadsPct}%`;

    const tgRes = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: msg })
    });
    const tgData = await tgRes.json();
    if (!tgData.ok) return res.status(500).json({ error: 'Telegram failed', detail: tgData });
    return res.status(200).json({ success: true, date: fmt2(tDate) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
