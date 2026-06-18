// 共用：用户/角色解析 + 按 tab 过滤数据（被所有 api 端点复用，做"真正隔离"的权限）
// 老板：DASHBOARD_PASSWORD = 全部 tab。受限用户：环境变量 DASHBOARD_USERS（JSON：密码 -> {name, tabs}）。

export const ALL_TABS = ["overview", "sales", "ads", "ops", "meta", "winners", "brain"];

// 每个 tab 需要的 /api/data 数据键（winners 不靠 /api/data，用 meta-ads/ad-insights 端点）
const TAB_DATA_KEYS = {
  overview: ["ads", "adsMonths", "branches", "branchMonths", "outletSales", "dailySales"],
  sales: ["outletSales", "dailySales"],
  ads: ["ads", "adsMonths", "adsDaily", "branchDaily", "outletSales"],
  ops: ["branches", "branchMonths", "branchDaily"],
  meta: ["meta"],
  winners: [],
  brain: ["ads", "adsMonths", "branches", "branchMonths", "adsDaily", "branchDaily", "outletSales", "dailySales", "meta"],
};

// 密码 -> { name, tabs }，无效返回 null
export function resolveUser(password) {
  if (!password) return null;
  const owner = process.env.DASHBOARD_PASSWORD;
  if (owner && password === owner) return { name: "Owner", tabs: ALL_TABS.slice() };
  const raw = process.env.DASHBOARD_USERS;
  if (raw) {
    try {
      const map = JSON.parse(raw);
      const u = map[password];
      if (u) {
        const tabs = (Array.isArray(u.tabs) ? u.tabs : []).filter((t) => ALL_TABS.includes(t));
        if (tabs.length) return { name: u.name || "User", tabs };
      }
    } catch (e) { /* 忽略坏的 DASHBOARD_USERS */ }
  }
  return null;
}

// 把完整 data 只保留这些 tab 需要的数据键，其余键置空（真正不下发）
export function filterData(data, tabs) {
  if (!data || typeof data !== "object") return data;
  const keep = new Set();
  (tabs || []).forEach((t) => (TAB_DATA_KEYS[t] || []).forEach((k) => keep.add(k)));
  // 所有可能出现的数据键
  const allKeys = ["ads", "adsMonths", "branches", "branchMonths", "adsDaily", "branchDaily", "outletSales", "dailySales", "meta"];
  const out = { ...data };
  for (const k of allKeys) {
    if (!keep.has(k) && k in out) {
      out[k] = Array.isArray(out[k]) ? [] : (out[k] && typeof out[k] === "object" && !Array.isArray(out[k]) ? {} : null);
    }
  }
  return out;
}
