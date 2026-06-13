/**
 * Sans Dashboard — Google Sheet 数据接口（Apps Script Web App）
 *
 * 直接读取你现有的两个表格（不用改表格排版）：
 *   1) Ads Report          —— 每月一个标签页（如 "Jan 2026"），每天一行
 *   2) Daily Leads Status  —— 每月一个标签页（如 "JANUARY 2026 Lead Report"），横向按日期
 *
 * 自动按月汇总、自动识别新月份。只有带正确 token 的请求才返回数据。
 *
 * 设置：① 把下面 TOKEN 改成你自己的随机字符串（和 Vercel 的 APPS_SCRIPT_TOKEN 一致）
 *      ② 部署为 Web app（执行身份=我，访问权限=任何人）
 */

// ⚠️ 改成你自己的随机字符串
var TOKEN = "CHANGE_ME_to_a_long_random_string";

var ADS_ID    = "1ZiriEdDq4EzTbqKC70CPQXxKVRaR2nkJjkBpq6Utuv0"; // Ads Report
var LEADS_ID  = "1QMqcPyihO-7xABaVvyTHTdU99xuhaDdlGgRhnVNV18A"; // Daily Leads Status
var OUTLET_ID = "18Sz-sGUka4MmjpEy4_SvmjcEETSdJqlBI3GESDYiO6w"; // Actual Outlet Sales (每月一个标签页)

var TZ = "Asia/Kuala_Lumpur";
var SST = 1.06;       // 月度广告花费含 6% SST（日明细为税前）
var YEAR_MIN = 2026;  // 只显示 2026 年起的月份

var MON = { jan:"Jan",feb:"Feb",mar:"Mar",apr:"Apr",may:"May",jun:"Jun",
            jul:"Jul",aug:"Aug",sep:"Sep",oct:"Oct",nov:"Nov",dec:"Dec" };
var MIDX = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };

function doGet(e) {
  try {
    if (!e || !e.parameter || e.parameter.token !== TOKEN) return json({ error: "unauthorized" });
    return json(buildData());
  } catch (err) {
    return json({ error: String(err && err.stack || err) });
  }
}

// 接收 dashboard 上传的数据：
//   1) 逐日（body.daily）：每个分店一行写进 "Daily Sales" 标签页，按日期去重
//   2) 月度（旧）：写进 "Outlet Upload" 标签页，按月去重
function doPost(e) {
  try {
    if (!e || !e.parameter || e.parameter.token !== TOKEN) return json({ error: "unauthorized" });
    var body = JSON.parse((e.postData && e.postData.contents) || "{}");
    if (body.daily) return saveDaily(body);

    var month = String(body.month || "").trim();
    if (!month) return json({ error: "missing month" });
    var actual = Number(body.actual) || 0, newLead = Number(body.newLead) || 0;
    var ss = SpreadsheetApp.openById(ADS_ID);
    var sh = ss.getSheetByName("Outlet Upload");
    if (!sh) { sh = ss.insertSheet("Outlet Upload"); sh.appendRow(["Month", "Actual Sales", "New Lead Sales"]); }
    var data = sh.getDataRange().getValues();
    var rowIdx = -1;
    for (var i = 1; i < data.length; i++) { if (String(data[i][0]).trim() === month) { rowIdx = i + 1; break; } }
    if (rowIdx > 0) sh.getRange(rowIdx, 1, 1, 3).setValues([[month, actual, newLead]]);
    else sh.appendRow([month, actual, newLead]);
    return json({ ok: true, month: month });
  } catch (err) {
    return json({ error: String(err) });
  }
}

// 逐日：把某日期所有分店行写进 "Daily Sales"（先删该日期旧行，再整批写入）
function saveDaily(body) {
  var date = String(body.date || "").trim();
  var branches = body.branches || [];
  if (!date || !branches.length) return json({ error: "missing date/branches" });
  var ss = SpreadsheetApp.openById(ADS_ID);
  var sh = ss.getSheetByName("Daily Sales");
  if (!sh) { sh = ss.insertSheet("Daily Sales"); sh.appendRow(["Date", "Branch", "Today", "MTD", "Consultation", "Enrolment", "FirstCourse"]); }
  var data = sh.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) { if (String(data[i][0]).trim() === date) sh.deleteRow(i + 1); }
  var rows = branches.map(function (b) {
    return [date, String(b.branch || ""), num(b.today), num(b.mtd), num(b.consult), num(b.enrol), num(b.first)];
  });
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
  return json({ ok: true, date: date, branches: rows.length });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- 工具 ----------
function num(v) {
  if (typeof v === "number") return v;
  if (v == null) return 0;
  var s = String(v).replace(/[^0-9.\-]/g, "");
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function dayOf(v) {
  if (v instanceof Date) return Number(Utilities.formatDate(v, TZ, "d"));
  var m = String(v).match(/^\s*(\d{1,2})/);
  return m ? parseInt(m[1], 10) : 0;
}
function isDailyA(v) {
  if (v instanceof Date) return true;
  return /^\s*\d{1,2}\s*[-\/]\s*[A-Za-z]/.test(String(v));
}
function r1(n) { return Math.round(n * 10) / 10; }
function r2(n) { return Math.round(n * 100) / 100; }
function normBranch(s) { return String(s).replace(/\(.*?\)/g, "").trim(); }
function sortKey(label) { var p = label.split(" "); return (2000 + parseInt(p[1], 10)) * 100 + (MIDX[p[0]] || 0); }

// 标签页名 -> "Mon YY"（仅限月度标签页），否则 null
function adsMonth(name) {
  var m = String(name).match(/^([A-Za-z]+)\.?\s+(20\d\d)$/);
  if (!m) return null;
  var mon = MON[m[1].slice(0, 3).toLowerCase()];
  if (!mon || parseInt(m[2], 10) < YEAR_MIN) return null;
  return mon + " " + (parseInt(m[2], 10) % 100);
}
function leadsMonth(name) {
  var m = String(name).match(/^([A-Za-z]+)\s+(20\d\d)\s+Lead\s+Report$/i);
  if (!m) return null;
  var mon = MON[m[1].slice(0, 3).toLowerCase()];
  if (!mon || parseInt(m[2], 10) < YEAR_MIN) return null;
  return mon + " " + (parseInt(m[2], 10) % 100);
}

// ---------- 主逻辑 ----------
function buildData() {
  var adsSS = SpreadsheetApp.openById(ADS_ID);
  var leadsSS = SpreadsheetApp.openById(LEADS_ID);

  var adsDaily = {};   // month -> [{d,spend,leads,msg,cpl}]
  var ads = [];        // 月度
  var monthsSet = {};

  adsSS.getSheets().forEach(function (sh) {
    var m = adsMonth(sh.getName());
    if (!m) return;
    var rows = sh.getDataRange().getValues();
    var dstart = rows.length;
    for (var i = 0; i < rows.length; i++) { if (isDailyA(rows[i][0])) { dstart = i; break; } }

    var daily = [], spendPre = 0, leads = 0, msg = 0;
    for (var j = dstart; j < rows.length; j++) {
      if (!isDailyA(rows[j][0])) continue;
      var sp = num(rows[j][1]), ms = num(rows[j][3]), ld = num(rows[j][5]);
      daily.push({ d: dayOf(rows[j][0]), spend: sp, leads: ld, msg: ms, cpl: ld > 0 ? r1(sp / ld) : null });
      spendPre += sp; leads += ld; msg += ms;
    }
    daily.sort(function (a, b) { return a.d - b.d; });

    // 营业额：摘要区 C 列(index2)最大值；若没填(≈花费)则视为空
    var spendTax = spendPre * SST;
    var maxC = 0;
    for (var k = 0; k < dstart; k++) { var v = num(rows[k][2]); if (v > maxC) maxC = v; }
    var sales = maxC > spendTax * 1.5 ? maxC : null;

    adsDaily[m] = daily;
    ads.push({
      m: m, spend: r2(spendTax), leads: leads, msg: msg,
      cpl: leads > 0 ? r2(spendTax / leads) : null,
      sales: sales, roas: (sales != null && spendTax > 0) ? r2(sales / spendTax) : null
    });
    monthsSet[m] = 1;
  });

  // ----- 分店 -----
  var branchDaily = {};  // branch -> month -> [[d,leads,appt,cancel]]
  var branchAgg = {};    // branch -> month -> {leads,appt,cancel}
  var branchMonthsSet = {};

  leadsSS.getSheets().forEach(function (sh) {
    var m = leadsMonth(sh.getName());
    if (!m) return;
    var rows = sh.getDataRange().getValues();
    if (!rows.length) return;
    var hdr = rows[0];
    var cols = [];
    for (var c = 1; c < hdr.length; c += 3) {
      var mt = String(hdr[c] == null ? "" : (hdr[c] instanceof Date ? Utilities.formatDate(hdr[c], TZ, "MMMM d, yyyy") : hdr[c])).match(/(\d{1,2}),?\s*20\d\d/);
      cols.push({ c: c, day: mt ? parseInt(mt[1], 10) : (hdr[c] instanceof Date ? Number(Utilities.formatDate(hdr[c], TZ, "d")) : null) });
    }
    for (var r = 1; r < rows.length; r++) {
      var raw = String(rows[r][0] == null ? "" : rows[r][0]).trim();
      if (/^total/i.test(raw)) break;
      if (!raw || /no select/i.test(raw)) continue;
      var b = normBranch(raw);
      for (var t = 0; t < cols.length; t++) {
        var cc = cols[t].c, day = cols[t].day;
        if (day == null) continue;
        var ld = num(rows[r][cc]), ap = num(rows[r][cc + 1]), ca = num(rows[r][cc + 2]);
        if (ld || ap || ca) {
          ((branchDaily[b] = branchDaily[b] || {})[m] = (branchDaily[b][m] || [])).push([day, ld, ap, ca]);
          var ba = (branchAgg[b] = branchAgg[b] || {});
          var bm = (ba[m] = ba[m] || { leads: 0, appt: 0, cancel: 0 });
          bm.leads += ld; bm.appt += ap; bm.cancel += ca;
          branchMonthsSet[m] = 1;
        }
      }
    }
  });

  Object.keys(branchDaily).forEach(function (b) {
    Object.keys(branchDaily[b]).forEach(function (m) {
      branchDaily[b][m].sort(function (x, y) { return x[0] - y[0]; });
    });
  });

  var adsMonths = Object.keys(monthsSet).sort(function (a, b) { return sortKey(a) - sortKey(b); });
  var branchMonths = Object.keys(branchMonthsSet).sort(function (a, b) { return sortKey(a) - sortKey(b); });
  ads.sort(function (a, b) { return sortKey(a.m) - sortKey(b.m); });

  var branches = Object.keys(branchAgg).map(function (b) { return { branch: b, m: branchAgg[b] }; });

  // ----- Actual Outlet Sales（独立私密表，每月一个标签页 "Jan 2026"…，读每页 TOTAL 行）-----
  var outletSales = [];
  try {
    SpreadsheetApp.openById(OUTLET_ID).getSheets().forEach(function (sh) {
      var m = adsMonth(sh.getName());            // "Jan 2026" -> "Jan 26"（跳过 Yearly Summary 等）
      if (!m) return;
      var rows = sh.getDataRange().getValues();
      for (var i = rows.length - 1; i >= 0; i--) {
        if (String(rows[i][0]).trim().toUpperCase() === "TOTAL") {
          var actual = num(rows[i][6]);          // MTD Collection (SW+HG)
          var newLead = num(rows[i][10]);        // First Course = New Lead Sales
          outletSales.push({ m: m, actual: actual, newLead: newLead, other: Math.max(0, actual - newLead) });
          break;
        }
      }
    });
    outletSales.sort(function (a, b) { return sortKey(a.m) - sortKey(b.m); });
  } catch (e) {}

  // 合并 dashboard 上传的月份（"Outlet Upload" 标签页），只补 live 表里还没有的月份
  var upSheet = adsSS.getSheetByName("Outlet Upload");
  if (upSheet) {
    upSheet.getDataRange().getValues().slice(1).forEach(function (r) {
      if (!r[0]) return;
      var m = String(r[0]).trim();
      if (outletSales.some(function (o) { return o.m === m; })) return;
      var actual = num(r[1]), newLead = num(r[2]);
      outletSales.push({ m: m, actual: actual, newLead: newLead, other: Math.max(0, actual - newLead) });
    });
    outletSales.sort(function (a, b) { return sortKey(a.m) - sortKey(b.m); });
  }

  // ----- 逐日门店销售（"Daily Sales" 标签页，每个分店一行）-----
  var dailySales = [];
  var dsh = adsSS.getSheetByName("Daily Sales");
  if (dsh) {
    var dvals = dsh.getDataRange().getValues();
    var byDate = {};
    for (var di = 1; di < dvals.length; di++) {
      var dr = dvals[di], date = String(dr[0]).trim();
      if (!date) continue;
      (byDate[date] = byDate[date] || []).push({
        branch: String(dr[1]).trim(), today: num(dr[2]), mtd: num(dr[3]),
        consult: num(dr[4]), enrol: num(dr[5]), first: num(dr[6])
      });
    }
    dailySales = Object.keys(byDate).sort().map(function (date) {
      var bs = byDate[date].sort(function (a, b) { return b.mtd - a.mtd; });
      var total = bs.reduce(function (a, b) {
        return { today: a.today + b.today, mtd: a.mtd + b.mtd, consult: a.consult + b.consult, enrol: a.enrol + b.enrol, first: a.first + b.first };
      }, { today: 0, mtd: 0, consult: 0, enrol: 0, first: 0 });
      return { date: date, branches: bs, total: total };
    });
  }

  return {
    ads: ads,
    adsMonths: adsMonths,
    branchMonths: branchMonths,
    branches: branches,
    adsDaily: adsDaily,
    branchDaily: branchDaily,
    outletSales: outletSales,
    dailySales: dailySales
  };
}
