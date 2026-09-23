/**
 * ForecastCalculator.gs — Lead & Ads Budget Calculator
 *
 * 装在「2026 目标与现状表」(1k6PeqGH4TEKZtcK1hafi73cGAkG9SWJj07zIxOjbjlQ)
 * 的 9月广告费Forecast tab 上。
 *
 * 用途：只填 3 个蓝色格 —— 月 Sales 目标、New Lead Sales 占比、Cost Per Lead
 * —— 就自动倒推整条 funnel (Lead > Appointment > Show Up > Enroll) 同需要几多广告预算，
 * 再反推「现有预算能带多少 Sales」同达标差距。
 *
 * 安装步骤（只做一次）：
 *   1. 开表 → 扩展程序 → Apps Script
 *   2. 删掉预设的 Code.gs 内容，整份贴上这个档案，储存
 *   3. 上方函式选 setupForecastCalculator → 执行 → 授权
 *   4. 回到 9月广告费Forecast tab，确认数字出来了
 *
 * 跑完之后表内全部是活公式，不再依赖这个脚本。
 * 换月份／换年份：改下面的 SHEET_NAME 同 TITLE，再跑一次即可。
 */

var SHEET_NAME = "9月广告费Forecast";              // 目标 tab 名
var TITLE = "September 2026 Sales Forecast";      // 表头标题
var BACKUP = true;                                 // 覆写前先备份一份旧 tab
var WEEKS_PER_MONTH = 4;                           // 每周预算 × 几 = 每月预算
var TRIM_GRID = false;                             // true = 把多余的空白行/栏删掉（大表容易超时，预设关）
var TZ = "Asia/Kuala_Lumpur";

// 预设值（第一次铺表时填进蓝色输入格，之后用户自己改）
var DEF_SALES = 5000000;       // 月 Sales 目标
var DEF_NEW_PCT = 0.24;        // New Lead Sales 占比
var DEF_CPL = 70;              // Cost Per Lead
var DEF_AVG_VALUE = 3500;      // Average Customer Value per Enrollment
var DEF_SHOWUP_ENROLL = 0.5;   // Show Up → Enroll
var DEF_APPT_SHOWUP = 1;       // Appointment → Show Up
var DEF_LEAD_APPT = 0.5;       // Lead → Appointment
var DEF_WEEKLY_BUDGET = 15000; // 现有每周广告预算

// 配色
var C_INPUT = "#d9e8fb";    // 蓝色 = 可填
var C_HEAD = "#1f3864";     // 标题列底色
var C_RESULT = "#fff2cc";   // 重点答案标黄
var C_SECTION = "#f2f2f2";  // 次标题底色

/**
 * 唯一要手动跑的进入点。
 */
function setupForecastCalculator() {
  FAILURES = [];
  var ss = SpreadsheetApp.getActive();
  var sh = findSheet_(ss);
  if (BACKUP) backupSheet_(ss, sh);
  buildLayout_(sh);

  // 格式失败绝对不可以连累已经写好的资料，所以整段包起来。
  // （每一步自己 flush，这里不再放裸 flush —— 裸 flush 一爆就绕过所有重试。）
  try {
    applyFormat_(sh);
  } catch (e) {
    FAILURES.push("applyFormat_ 整段中断 ✗ " + e.message);
  }
  reportFailures_(sh);
  ss.setActiveSheet(sh);
}

var FAILURES = [];  // 每次执行开头清空；失败原因会写进表里，不会只藏在 Logger

/**
 * 这份试算表很大，Google 偶尔会丢 "Service Spreadsheets failed while accessing
 * document" 的临时错误。重试 3 次，每次之前先 flush 并停一下。
 * 每个操作各自呼叫一次 retry_，不要捆在一起 —— 捆在一起的话前面一项失败，
 * 后面全部陪葬。
 */
function step_(label, fn) {
  return retry_(label, function () {
    fn();
    // 关键：flush 一定要在 retry 里面。Apps Script 的写入是延后的，
    // set 系列只是排队就回传成功，真正的失败要 flush 才浮出来。
    // 以前 flush 放在 retry 外面，所以每个 retry 都以为自己成功了。
    SpreadsheetApp.flush();
  });
}

function retry_(label, fn) {
  var i, last = "";
  for (i = 1; i <= 3; i++) {
    try {
      fn();
      return true;
    } catch (e) {
      last = e.message;
      Logger.log(label + " 第 " + i + " 次失败：" + last);
      SpreadsheetApp.flush();
      Utilities.sleep(1500 * i);
    }
  }
  FAILURES.push(label + " ✗ " + last);
  Logger.log(label + " 三次都失败，已跳过。");
  return false;
}

/** 把失败原因写进表里（A35 起），让人不用开 Logger 都看得到 */
function reportFailures_(sh) {
  if (!FAILURES.length) {
    Logger.log("完成：全部步骤成功");
    return;
  }
  Logger.log("以下步骤失败：\n" + FAILURES.join("\n"));
  try {
    var out = [["⚠ 以下步骤失败了，把这几行贴给 Claude："]];
    var i;
    for (i = 0; i < FAILURES.length; i++) out.push([FAILURES[i]]);
    sh.getRange(35, 1, out.length, 1).setValues(out);
    SpreadsheetApp.flush();
  } catch (e) {
    Logger.log("连错误报告都写不进去：" + e.message);
  }
}

/** 找目标 tab：先精准比对，再退而求其次找含 "Forecast" 的 */
function findSheet_(ss) {
  var sh = ss.getSheetByName(SHEET_NAME);
  if (sh) return sh;

  var all = ss.getSheets();
  var names = [];
  var i;
  for (i = 0; i < all.length; i++) {
    names.push(all[i].getName());
    if (all[i].getName().indexOf("Forecast") !== -1) sh = all[i];
  }
  if (sh) return sh;

  throw new Error(
    '找不到 tab "' + SHEET_NAME + '"。这份表现有的 tab 是：\n' +
    names.join("\n") +
    '\n\n请把上面正确的名字填回脚本顶部的 SHEET_NAME，再跑一次。'
  );
}

/** 覆写前备份旧 tab（同名备份已存在就跳过） */
function backupSheet_(ss, sh) {
  var stamp = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
  var name = sh.getName() + " (备份 " + stamp + ")";
  if (ss.getSheetByName(name)) return;
  var bk = sh.copyTo(ss);
  bk.setName(name);
  bk.hideSheet();
}

/** 铺标签 + 公式 */
function buildLayout_(sh) {
  var rows = [];

  // 输入区
  rows.push(["输入以下资料计算 — 只需填蓝色格：C2、C3、C4、C11、B13、B14、B15、B20",
             "", ""]);                                                          // 1
  rows.push(["1. 这个月 Sales 目标是几多？", "", DEF_SALES]);                     // 2
  rows.push(["2. New Lead Sales 占几多 %？", "", DEF_NEW_PCT]);                   // 3
  rows.push(["3. Cost Per Lead 预算几多？", "", DEF_CPL]);                        // 4
  rows.push(["", "", ""]);                                                        // 5

  // 正推：目标 → 需要几多预算
  rows.push([TITLE, "", ""]);                                                     // 6
  rows.push(["Total Sales Expected", "", "=C2"]);                                 // 7
  rows.push(["Existing Customer Sales%", "=1-B9", "=C7*B8"]);                     // 8
  rows.push(["New Customer Sales%", "=C3", "=C7*B9"]);                            // 9
  rows.push(["", "", ""]);                                                        // 10
  rows.push(["Average Customer Value per Enrollment", "", DEF_AVG_VALUE]);        // 11
  rows.push(["Total New Customer Enrollment（Pax）", "",
             "=IFERROR(ROUNDUP(C9/C11,0),0)"]);                                   // 12
  rows.push(["Total Show Up Required（Show Up→Enroll %）", DEF_SHOWUP_ENROLL,
             "=IFERROR(ROUNDUP(C12/B13,0),0)"]);                                  // 13
  rows.push(["Total Appointment Required（Appt→Show Up %）", DEF_APPT_SHOWUP,
             "=IFERROR(ROUNDUP(C13/B14,0),0)"]);                                  // 14
  rows.push(["Total New Lead Required（Lead→Appt %）", DEF_LEAD_APPT,
             "=IFERROR(ROUNDUP(C14/B15,0),0)"]);                                  // 15
  rows.push(["Cost Per New Lead", "=C4", ""]);                                    // 16
  rows.push(["★ Estimate Ads Budget Required 需要广告预算", "", "=C15*B16"]);     // 17
  rows.push(["", "", ""]);                                                        // 18

  // 反推：现有预算 → 能带多少 Sales
  rows.push(["现有预算反推 Reverse Check", "", ""]);                              // 19
  rows.push(["Current Ads Budget（Per Week）", DEF_WEEKLY_BUDGET,
             "=B20*" + WEEKS_PER_MONTH]);                                         // 20
  rows.push(["Estimate Lead Achieve", "", "=IFERROR(ROUNDDOWN(C20/B16,0),0)"]);   // 21
  rows.push(["Estimate New Lead Appt", "=B15", "=ROUNDDOWN(C21*B22,0)"]);         // 22
  rows.push(["Estimate Show Up", "=B14", "=ROUNDDOWN(C22*B23,0)"]);               // 23
  rows.push(["Estimate New Lead Enrollment", "=B13", "=ROUNDDOWN(C23*B24,0)"]);   // 24
  rows.push(["Average Customer Value per Enrollment", "", "=C11"]);               // 25
  rows.push(["★ Estimate Lead Sales with Current Budget 现预算能带的 Sales",
             "", "=C24*C25"]);                                                    // 26
  rows.push(["", "", ""]);                                                        // 27

  // 达标检查
  rows.push(["达标检查 Gap Check", "", ""]);                                      // 28
  rows.push(["建议每周预算（达标）", "", "=C17/" + WEEKS_PER_MONTH]);             // 29
  rows.push(["预算差距（还差多少）", "", "=C17-C20"]);                            // 30
  rows.push(["现有预算达标率", "", '=IF(C17=0,"",C20/C17)']);                     // 31
  rows.push(["New Sales 差距（现有预算 vs 目标）", "", "=C26-C9"]);               // 32

  // 确保够位（第二次跑时表已被裁到 40 列×4 栏）
  if (sh.getMaxRows() < 40) sh.insertRowsAfter(sh.getMaxRows(), 40 - sh.getMaxRows());
  if (sh.getMaxColumns() < 4) sh.insertColumnsAfter(sh.getMaxColumns(), 4 - sh.getMaxColumns());

  // 逐项分开做，每项各自 flush + 重试。以前捆在一起，第一项失败就全部陪葬。
  var wipe = sh.getRange(1, 1, 40, 4);
  step_("拆合并格", function () { wipe.breakApart(); });
  step_("清内容", function () { wipe.clearContent(); });
  step_("清格式", function () { wipe.clearFormat(); });
  step_("清验证", function () { wipe.clearDataValidations(); });
  step_("清备注", function () { wipe.clearNote(); });
  step_("清条件格式", function () { sh.setConditionalFormatRules([]); });

  // 资料是最重要的东西，单独一步落盘，后面任何一步出事都带不走它。
  step_("写入资料", function () {
    sh.getRange(1, 1, rows.length, 3).setValues(rows);
  });

  step_("合并标题列", function () {
    sh.getRange("A1:C1").merge();
    sh.getRange("A6:C6").merge();
    sh.getRange("A19:C19").merge();
    sh.getRange("A28:C28").merge();
  });
}

/**
 * 备用：只写资料同公式，完全不碰格式。
 * 万一 setupForecastCalculator 又被 Google 中断，跑这个先把数字救回来。
 */
function writeValuesOnly() {
  FAILURES = [];
  var ss = SpreadsheetApp.getActive();
  var sh = findSheet_(ss);
  buildLayout_(sh);
  reportFailures_(sh);
  ss.setActiveSheet(sh);
}

/**
 * 只套格式，不碰资料。资料已经对、只是外观没上色时跑这个。
 */
function formatOnly() {
  FAILURES = [];
  var ss = SpreadsheetApp.getActive();
  var sh = findSheet_(ss);
  applyFormat_(sh);
  reportFailures_(sh);
  ss.setActiveSheet(sh);
}

/**
 * 数字格式、配色、验证、条件格式。
 *
 * 全部用 getRangeList() 一次过套到一组格上，而不是逐格 set —— 这张试算表很大，
 * 零碎的呼叫会被 Google 掐断（"Service Spreadsheets failed"）。
 * 每一步都经过 step_()：自己 flush、自己重试、自己记录失败原因。
 */
function applyFormat_(sh) {
  // 「RM」一定要用引号包住。数字格式里 M = 月份的保留符号，
  // 写成 RM#,##0.00 会被当成日期+数字混搭 → 整条格式被 Google 拒绝
  // （而且只回一句笼统的 "Service Spreadsheets failed"，很难查）。
  var MONEY = '"RM"#,##0.00';
  var PCT = "0%";
  var INT = "#,##0";

  var MONEY_CELLS = ["C2", "C4", "C7", "C8", "C9", "C11", "B16", "C17",
                     "B20", "C20", "C25", "C26", "C29", "C30", "C32"];
  var PCT_CELLS = ["C3", "B8", "B9", "B13", "B14", "B15", "B22", "B23", "B24", "C31"];
  var INT_CELLS = ["C12", "C13", "C14", "C15", "C21", "C22", "C23", "C24"];
  var INPUT_CELLS = ["C2", "C3", "C4", "C11", "B13", "B14", "B15", "B20"];
  var HEAD_ROWS = ["A1:C1", "A6:C6"];
  var SUB_ROWS = ["A19:C19", "A28:C28"];
  var RESULT_ROWS = ["A17:C17", "A26:C26"];

  step_("清旧格式", function () {
    sh.getRange("A1:C32").clearFormat();
  });
  step_("B:C 右对齐", function () {
    sh.getRange("B1:C32").setHorizontalAlignment("right");
  });

  // 万一带 RM 的格式在某些 locale 下还是被拒，退回不带货币符号的版本，
  // 至少千分位同两位小数保得住。
  if (!step_("金额格式", function () {
        sh.getRangeList(MONEY_CELLS).setNumberFormat(MONEY);
      })) {
    step_("金额格式（退回无 RM 版）", function () {
      sh.getRangeList(MONEY_CELLS).setNumberFormat("#,##0.00");
    });
  }
  step_("百分比格式", function () {
    sh.getRangeList(PCT_CELLS).setNumberFormat(PCT);
  });
  step_("人数格式", function () {
    sh.getRangeList(INT_CELLS).setNumberFormat(INT);
  });

  // 蓝色输入格放最前面上色 —— 这是整张表最重要的视觉提示，
  // 就算后面全部失败，至少它已经落盘了。
  step_("★ 蓝色输入格", function () {
    sh.getRangeList(INPUT_CELLS)
      .setBackground(C_INPUT)
      .setFontWeight("bold")
      .setBorder(true, true, true, true, false, false,
                 "#1155cc", SpreadsheetApp.BorderStyle.SOLID_THICK);
  });
  step_("深色标题列", function () {
    sh.getRangeList(HEAD_ROWS)
      .setBackground(C_HEAD).setFontColor("#ffffff")
      .setFontWeight("bold").setFontSize(12)
      .setHorizontalAlignment("center");
  });
  step_("灰色次标题", function () {
    sh.getRangeList(SUB_ROWS)
      .setBackground(C_SECTION).setFontWeight("bold")
      .setHorizontalAlignment("center");
  });
  step_("黄色答案格", function () {
    sh.getRangeList(RESULT_ROWS)
      .setBackground(C_RESULT).setFontWeight("bold");
  });

  step_("栏宽", function () {
    sh.setColumnWidth(1, 420);
    sh.setColumnWidth(2, 150);
    sh.setColumnWidth(3, 180);
  });

  step_("备注", function () {
    sh.getRange("B13").setNote("Show Up → Enroll 转化率。100 个到场，有几多个买 Package。");
    sh.getRange("B14").setNote("Appointment → Show Up 转化率。预约了有几多个真的来。");
    sh.getRange("B15").setNote("Lead → Appointment 转化率。100 个 lead 约到几多个。");
    sh.getRange("C20").setNote("每周预算 × " + WEEKS_PER_MONTH + " = 每月预算");
  });

  step_("输入验证", function () {
    setVal_(sh, "C2", 0, null, "月 Sales 目标，填数字（例：5000000）");
    setVal_(sh, "C3", 0, 1, "New Lead Sales 占比，填 0% – 100%");
    setVal_(sh, "C4", 0, null, "Cost Per Lead，填数字（例：70）");
    setVal_(sh, "C11", 0, null, "每个 Enrollment 的平均客单价（例：3500）");
    setVal_(sh, "B13", 0, 1, "Show Up 之后有几多 % 成交，填 0% – 100%");
    setVal_(sh, "B14", 0, 1, "Appointment 之后有几多 % 真的到场，填 0% – 100%");
    setVal_(sh, "B15", 0, 1, "Lead 之后有几多 % 约到，填 0% – 100%");
    setVal_(sh, "B20", 0, null, "现有每周广告预算（例：15000）");
  });

  // 预算差距：还差钱 = 红，够 = 绿
  step_("条件格式 C30", function () {
    var gap = sh.getRange("C30");
    var over = SpreadsheetApp.newConditionalFormatRule()
      .whenNumberGreaterThan(0)
      .setFontColor("#cc0000").setBold(true)
      .setRanges([gap]).build();
    var ok = SpreadsheetApp.newConditionalFormatRule()
      .whenNumberLessThanOrEqualTo(0)
      .setFontColor("#188038").setBold(true)
      .setRanges([gap]).build();
    sh.setConditionalFormatRules([over, ok]);
  });

  if (TRIM_GRID) {
    step_("裁掉多余行栏", function () {
      if (sh.getMaxRows() > 40) sh.deleteRows(41, sh.getMaxRows() - 40);
      if (sh.getMaxColumns() > 4) sh.deleteColumns(5, sh.getMaxColumns() - 4);
    });
  }
}

function setVal_(sh, cell, min, max, help) {
  var b = SpreadsheetApp.newDataValidation();
  if (max === null) b = b.requireNumberGreaterThanOrEqualTo(min);
  else b = b.requireNumberBetween(min, max);
  sh.getRange(cell).setDataValidation(
    b.setAllowInvalid(false).setHelpText(help).build()
  );
}
