/**
 * Sans Dashboard — Google Sheet 数据接口（Apps Script Web App）
 *
 * 作用：把你私密 Google Sheet 里的数据，转成 dashboard 需要的 JSON。
 * 只有带正确 token 的请求才会返回数据（token 只存在 Vercel 服务器端）。
 *
 * 需要的工作表（标签页）名称与列：
 *   1) AdsDaily    列: 日期 | 花费 | Leads | 信息(Messages)
 *   2) Sales       列: 月份(如 "Jan 26") | 营业额
 *   3) BranchDaily 列: 分店 | 日期 | Leads | 预约(Appt) | 取消(Cancel)
 *   （第一行都是表头，会被自动跳过）
 */

// ⚠️ 改成你自己的随机字符串，并把同样的值填到 Vercel 的 APPS_SCRIPT_TOKEN
var TOKEN = "CHANGE_ME_to_a_long_random_string";
var TZ = "Asia/Kuala_Lumpur";

function doGet(e) {
  try {
    if (!e || !e.parameter || e.parameter.token !== TOKEN) {
      return json({ error: "unauthorized" });
    }
    return json(buildData());
  } catch (err) {
    return json({ error: String(err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function monthLabel(d) {
  return Utilities.formatDate(new Date(d), TZ, "MMM yy"); // -> "Jan 26"
}

function buildData() {
  var monthOrder = {}; // 月份 -> 最早日期(用于排序)

  // ---- AdsDaily: 日期 | 花费 | Leads | 信息 ----
  var adsDaily = {};
  var adsAgg = {};
  readRows("AdsDaily").forEach(function (r) {
    if (!r[0]) return;
    var date = new Date(r[0]);
    var m = monthLabel(date);
    var spend = num(r[1]), leads = num(r[2]), msg = num(r[3]);
    (adsDaily[m] = adsDaily[m] || []).push({
      d: date.getDate(), spend: spend, leads: leads, msg: msg,
      cpl: leads > 0 ? round1(spend / leads) : null
    });
    var a = (adsAgg[m] = adsAgg[m] || { spend: 0, leads: 0, msg: 0 });
    a.spend += spend; a.leads += leads; a.msg += msg;
    monthOrder[m] = Math.min(monthOrder[m] || Infinity, date.getTime());
  });

  // ---- Sales: 月份 | 营业额 ----
  var salesByMonth = {};
  readRows("Sales").forEach(function (r) {
    if (!r[0]) return;
    var m = (r[0] instanceof Date) ? monthLabel(r[0]) : String(r[0]).trim();
    salesByMonth[m] = (r[1] === "" || r[1] == null) ? null : num(r[1]);
  });

  // ---- BranchDaily: 分店 | 日期 | Leads | 预约 | 取消 ----
  var branchDaily = {};
  var branchAgg = {};
  readRows("BranchDaily").forEach(function (r) {
    if (!r[0] || !r[1]) return;
    var branch = String(r[0]).trim();
    var date = new Date(r[1]);
    var m = monthLabel(date);
    var leads = num(r[2]), appt = num(r[3]), cancel = num(r[4]);
    var bd = (branchDaily[branch] = branchDaily[branch] || {});
    (bd[m] = bd[m] || []).push([date.getDate(), leads, appt, cancel]);
    var ba = (branchAgg[branch] = branchAgg[branch] || {});
    var bm = (ba[m] = ba[m] || { leads: 0, appt: 0, cancel: 0 });
    bm.leads += leads; bm.appt += appt; bm.cancel += cancel;
    monthOrder[m] = Math.min(monthOrder[m] || Infinity, date.getTime());
  });

  // 按时间排序的月份列表
  var months = Object.keys(monthOrder).sort(function (a, b) {
    return monthOrder[a] - monthOrder[b];
  });

  // 月度广告
  var ads = months.map(function (m) {
    var a = adsAgg[m] || { spend: 0, leads: 0, msg: 0 };
    var sales = (m in salesByMonth) ? salesByMonth[m] : null;
    var roas = (sales != null && a.spend > 0) ? round2(sales / a.spend) : null;
    return {
      m: m, spend: round2(a.spend), leads: a.leads, msg: a.msg,
      cpl: a.leads > 0 ? round2(a.spend / a.leads) : null,
      sales: sales, roas: roas
    };
  });

  // 分店月度汇总
  var branches = Object.keys(branchAgg).map(function (b) {
    return { branch: b, m: branchAgg[b] };
  });

  // 每日数据按天排序
  Object.keys(adsDaily).forEach(function (m) {
    adsDaily[m].sort(function (x, y) { return x.d - y.d; });
  });
  Object.keys(branchDaily).forEach(function (b) {
    Object.keys(branchDaily[b]).forEach(function (m) {
      branchDaily[b][m].sort(function (x, y) { return x[0] - y[0]; });
    });
  });

  return {
    ads: ads,
    adsMonths: months,
    branchMonths: months,
    branches: branches,
    adsDaily: adsDaily,
    branchDaily: branchDaily
  };
}

function readRows(sheetName) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sh) return [];
  return sh.getDataRange().getValues().slice(1); // 跳过表头
}
function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }
