// 临时诊断（无敏感信息，不需要密码）：确认 OUTLET_EXTRA 环境变量是否在当前部署中生效。
export default function handler(req, res) {
  const raw = process.env.OUTLET_EXTRA || null;
  let months = null, parseOk = false;
  if (raw) {
    try { months = Object.keys(JSON.parse(raw)); parseOk = true; } catch (e) { parseOk = false; }
  }
  res.status(200).json({
    outletExtraSet: !!raw,
    outletExtraParseOk: parseOk,
    outletExtraMonths: months,           // 仅月份键名，如 ["Jun 26"]；无金额
    rawLength: raw ? raw.length : 0,
    appsScriptConfigured: !!(process.env.APPS_SCRIPT_URL && process.env.APPS_SCRIPT_TOKEN),
    passwordConfigured: !!process.env.DASHBOARD_PASSWORD,
  });
}
