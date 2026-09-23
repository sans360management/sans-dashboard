/* =============================================================================
 * /team —— 分享给团队的 Lead & Ads 预算推算页
 *
 * 跟主 dashboard 完全分开的入口，用 TEAM_KEY 从 URL (?k=…) 进，拿不到主看板密码。
 * 后端 lib/users.js 把这个 key 解析成 tabs:["forecast"]，filterData() 会把其余
 * 数据键清空 —— 团队的浏览器里收不到 Meta 等数据，不是前端藏起来而已。
 *
 * 三页：1 目标（两种推算方向）· 2 现在（实况）· 3 对比（目标 vs 现在 + 历史趋势）
 * ========================================================================== */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { TXT } from "./team-i18n.js";

/* --------------------------------------------------------------- 调色板 */
const C = {
  brown: "#552102", ink: "#3A2A1C", sub: "#8A7763",
  sand: "#F4EDE1", surface: "#FBF7F0", line: "#E7DCC9",
  sage: "#6E8B5E", sageLt: "#A9BE97", gold: "#C99A3E", goldLt: "#E3C988",
  clay: "#B5663F", blue: "#8AA0B8",
};
const GOOD = C.sage, WARN = C.gold, CRIT = C.clay;

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKS = 4;

/* --------------------------------------------------------------- 格式化 */
const rm = (n, dp = 0) =>
  n == null || !isFinite(n) ? "—"
    : "RM" + Number(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const int = (n) => (n == null || !isFinite(n) ? "—" : Math.round(n).toLocaleString("en-US"));
const pct = (n, dp = 0) => (n == null || !isFinite(n) ? "—" : (n * 100).toFixed(dp) + "%");
const monthKey = (d) => MON[d.getMonth()] + " " + String(d.getFullYear()).slice(2);

// dailySales 的 date 不一定是 ISO —— 也会是 "Jun 11 2026" 这种。照 dashboard.jsx:310
// 的 normDate 先正规化，再用字串取月份键，不要 new Date() 去 parse：
// 格式一不对就 NaN，整批逐日 Sales 会被静静丢掉（业绩同 ROAS 就变空）。
const MNUM = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
function normDate(s) {
  s = String(s);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + "-" + m[2] + "-" + m[3];
  m = s.match(/\b([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{4})/);
  if (m && MNUM[m[1]]) return m[3] + "-" + String(MNUM[m[1]]).padStart(2, "0") + "-" + String(+m[2]).padStart(2, "0");
  return s;
}
const monthKeyFromISO = (iso) => {
  const p = String(iso).split("-");
  return p.length >= 2 ? MON[+p[1] - 1] + " " + String(p[0]).slice(2) : null;
};

// 文案里 **…** 的部分渲染成粗体等宽 —— 让两种语言各自决定强调哪一段，
// 不用把句子拆成一堆 JSX 碎片。
function Rich({ s }) {
  return <>{String(s).split(/\*\*/).map((p, i) => (i % 2
    ? <b key={i} style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700 }}>{p}</b>
    : <span key={i}>{p}</span>))}</>;
}

/* --------------------------------------------------------------- 小组件 */
function Card({ children, style }) {
  return (
    <div style={{
      background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14,
      padding: 16, ...style,
    }}>{children}</div>
  );
}
function Blk({ children, note }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
      <h2 style={{
        margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: ".09em",
        textTransform: "uppercase", color: C.sub,
      }}>{children}</h2>
      {note && <span style={{ fontSize: 12, color: C.sub }}>{note}</span>}
    </div>
  );
}
function Stat({ label, value, meta, accent }) {
  return (
    <div style={{ background: "#fff", padding: "14px 15px 15px" }}>
      <div style={{ fontSize: 12, color: C.sub, marginBottom: 8 }}>{label}</div>
      <div style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 24, fontWeight: 700, letterSpacing: "-.02em", lineHeight: 1.1,
        color: accent || C.ink, fontVariantNumeric: "tabular-nums",
      }}>{value}</div>
      {meta && <div style={{ marginTop: 7, fontSize: 12, color: C.sub, fontVariantNumeric: "tabular-nums" }}>{meta}</div>}
    </div>
  );
}
function StatRow({ children }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
      gap: 1, background: C.line, border: `1px solid ${C.line}`,
      borderRadius: 14, overflow: "hidden",
    }}>{children}</div>
  );
}
function Pill({ tone, children }) {
  const bg = { good: "#EAF0E4", warn: "#F7EDD9", crit: "#F5E3DA" }[tone] || C.sand;
  const fg = { good: GOOD, warn: "#8A6416", crit: CRIT }[tone] || C.sub;
  return (
    <span style={{
      display: "inline-block", fontFamily: "ui-monospace, monospace", fontSize: 11,
      fontWeight: 700, padding: "1px 7px", borderRadius: 6, background: bg, color: fg,
    }}>{children}</span>
  );
}
// 数字本身就是输入格 —— 拉杆调大概，打字调精确。`value` 一律是拉杆单位
// (金额用实数，百分比用 5–100)，所以格式化/解析只需要看 kind。
function Slider({ id, label, kind = "money", min, max, step, value, onChange, ends }) {
  const fmt = (v) => (kind === "pct" ? Math.round(v) + "%" : rm(v));
  const [draft, setDraft] = useState(null); // null = 不在编辑，显示格式化后的值

  const commit = (raw) => {
    setDraft(null);
    const cleaned = String(raw).replace(/[^\d.-]/g, "");
    const v = parseFloat(cleaned);
    if (!isFinite(v)) return;            // 打了乱七八糟的东西就还原，不要变 NaN
    onChange(Math.min(max, Math.max(min, v)));
  };

  const shown = draft != null ? draft : fmt(value);

  return (
    <div>
      <label htmlFor={id} style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        gap: 10, fontSize: 13, color: C.ink, marginBottom: 7,
      }}>
        <span style={{ minWidth: 0 }}>{label}</span>
        <input
          type="text" inputMode="decimal" aria-label={label}
          value={shown}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => { setDraft(String(value)); requestAnimationFrame(() => e.target.select()); }}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            else if (e.key === "Escape") { setDraft(null); e.currentTarget.blur(); }
          }}
          style={{
            fontFamily: "ui-monospace, monospace", fontSize: 15, fontWeight: 700,
            color: C.brown, fontVariantNumeric: "tabular-nums", textAlign: "right",
            // 宽度跟着内容走 —— 写死的话 RM5,000,000 会被切成 "RM5,000,"
            width: `calc(${Math.max(6, shown.length)}ch + 20px)`,
            flex: "none", padding: "4px 8px",
            background: draft != null ? "#fff" : C.surface,
            border: `1px solid ${draft != null ? C.brown : C.line}`,
            boxShadow: draft != null ? `0 0 0 3px ${C.sand}` : "none",
            borderRadius: 7, outline: "none", cursor: "text", minWidth: 0,
            transition: "border-color .12s, box-shadow .12s, background .12s",
          }} />
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(+e.target.value)}
        style={{ width: "100%", accentColor: C.brown, margin: 0, display: "block" }} />
      {ends && (
        <div style={{
          display: "flex", justifyContent: "space-between", fontSize: 10.5,
          color: C.sub, marginTop: 3, fontFamily: "ui-monospace, monospace",
        }}>
          <span>{ends[0]}</span><span>{ends[1]}</span>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- 推算 */
// mode "goal"   : Sales 目标 → 倒推需要几多 lead 同预算
// mode "budget" : 广告预算   → 正推拿到几多 lead，最后落到几多 New Lead Sales
function planFor(S, cpl, mode) {
  const o = {};
  if (mode === "budget") {
    o.budget = S.budget;
    o.leads = cpl > 0 ? Math.floor(S.budget / cpl) : 0;
    o.appt = Math.floor(o.leads * S.r1);
    o.showup = Math.floor(o.appt * S.r2);
    o.enroll = Math.floor(o.showup * S.r3);
    o.newSales = o.enroll * S.value;
  } else {
    o.newSales = S.sales * S.newPct;
    o.enroll = S.value > 0 ? Math.ceil(o.newSales / S.value) : 0;
    o.showup = S.r3 > 0 ? Math.ceil(o.enroll / S.r3) : 0;
    o.appt = S.r2 > 0 ? Math.ceil(o.showup / S.r2) : 0;
    o.leads = S.r1 > 0 ? Math.ceil(o.appt / S.r1) : 0;
    o.budget = o.leads * cpl;
  }
  o.roas = o.budget > 0 ? o.newSales / o.budget : null;
  return o;
}

/* --------------------------------------------------------------- 取数 */
// 复刻 dashboard.jsx:1427-1438 —— 用每月最后一天的 MTD 覆盖该月的 outlet 月度，
// 让 New Lead Sales 跟上传的逐日 Sales 走（Sep 26 的 First Course 就是这样来的）。
function buildMonthly(d) {
  const out = {};
  (d.outletSales || []).forEach((o) => { out[o.m] = { ...o }; });

  const latest = {};
  (d.dailySales || []).forEach((x) => {
    const date = normDate(x.date);
    const m = monthKeyFromISO(date);
    if (!m || !MON.includes(m.split(" ")[0])) return;
    if (!latest[m] || date > latest[m].date) latest[m] = { date, x };
  });
  Object.keys(latest).forEach((m) => {
    const t = latest[m].x.total || {};
    out[m] = {
      ...(out[m] || {}), m,
      actual: t.mtd || 0,
      newLead: t.first || 0,
      consult: t.consult || 0,
      enrol: t.enrol || 0,
      day: latest[m].date,
      branches: latest[m].x.branches || [],
    };
  });
  return out;
}

function deriveNow(d, cur) {
  const monthly = buildMonthly(d);
  const mo = monthly[cur] || null;

  // 本月没有逐日 Sales 时，讲清楚表里最新一天是几时 —— 比只写「等上传」有用得多
  let latestSalesDate = null;
  (d.dailySales || []).forEach((x) => {
    const iso = normDate(x.date);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso) && (!latestSalesDate || iso > latestSalesDate)) latestSalesDate = iso;
  });

  // Lead / Appointment —— 来自 Lead Report（branches[].m[cur]）
  let leads = 0, appt = 0, cancel = 0;
  const branchLead = [];
  (d.branches || []).forEach((b) => {
    const v = (b.m || {})[cur];
    if (!v) return;
    leads += v.leads || 0; appt += v.appt || 0; cancel += v.cancel || 0;
    if (v.leads || v.appt) branchLead.push({ branch: b.branch, leads: v.leads || 0, appt: v.appt || 0 });
  });
  branchLead.sort((a, b) => b.leads - a.leads);

  // 每日 Lead —— branchDaily[branch][cur] = [[day, leads, appt, cancel], …]
  const byDay = {};
  const bd = d.branchDaily || {};
  Object.keys(bd).forEach((b) => {
    (bd[b][cur] || []).forEach(([day, ld, ap]) => {
      const r = (byDay[day] = byDay[day] || { d: day, leads: 0, appt: 0 });
      r.leads += ld || 0; r.appt += ap || 0;
    });
  });
  const days = Object.keys(byDay).map(Number).sort((a, b) => a - b).map((k) => byDay[k]);
  const lastDay = days.length ? days[days.length - 1].d : 0;

  const adsRow = (d.ads || []).find((a) => a.m === cur) || null;
  const spend = adsRow ? adsRow.spend : null;

  const newLeadSales = mo ? mo.newLead : null;
  const enrol = mo ? mo.enrol : null;

  return {
    monthly, mo, leads, appt, cancel, branchLead, days, lastDay,
    spend,
    cplActual: spend && leads > 0 ? spend / leads : null,
    newLeadSales,
    enrol,
    avgValue: newLeadSales && enrol ? newLeadSales / enrol : null,
    roasActual: newLeadSales && spend ? newLeadSales / spend : null,
    branchSales: mo && mo.branches ? mo.branches.slice().sort((a, b) => b.first - a.first) : [],
    salesDay: mo ? mo.day : null,
    latestSalesDate,
  };
}

/* --------------------------------------------------------------- 主组件 */
const DEF = { sales: 5000000, newPct: 0.24, cpl: 70, value: 3500, budget: 96000, r1: 0.5, r2: 1, r3: 0.5 };

export default function TeamApp() {
  const [phase, setPhase] = useState("loading"); // loading | ready | auth | error
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [keyInput, setKeyInput] = useState("");
  const [tab, setTab] = useState(1);
  const [mode, setMode] = useState("goal");
  const [S, setS] = useState(DEF);
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem("sans_team_lang") === "zh" ? "zh" : "en"; } catch (e) { return "en"; }
  });
  const keyRef = useRef("");

  // t("key", ...args) —— 字典值是字串就直接用，是函数就带参数叫一次
  const t = useMemo(() => {
    const i = lang === "zh" ? 1 : 0;
    return (k, ...a) => {
      const v = TXT[k] && TXT[k][i];
      return typeof v === "function" ? v(...a) : (v == null ? k : v);
    };
  }, [lang]);
  const pickLang = (l) => {
    setLang(l);
    try { localStorage.setItem("sans_team_lang", l); } catch (e) { /* 无痕模式 */ }
  };

  const now = new Date();
  const cur = monthKey(now);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  /* ---- 取数 ---- */
  const load = async (k, quiet) => {
    if (!quiet) setPhase("loading");
    try {
      const r = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: k }),
      });
      if (r.status === 401) {
        const j = await r.json().catch(() => ({}));
        setPhase("auth");
        setErr(j.teamKeyConfigured === false ? "errNoTeamKey" : "errBadKey");
        return;
      }
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "HTTP " + r.status);
      keyRef.current = k;
      try { localStorage.setItem("sans_team_k", k); } catch (e) { /* 无痕模式 */ }
      setData(j);
      setUpdatedAt(new Date());
      setPhase("ready");
      setErr("");
    } catch (e) {
      setErr(String(e.message || e));
      setPhase(keyRef.current ? "error" : "auth");
    }
  };

  useEffect(() => {
    const url = new URL(window.location.href);
    let k = url.searchParams.get("k");
    if (!k) { try { k = localStorage.getItem("sans_team_k"); } catch (e) { k = null; } }
    if (k) load(k); else setPhase("auth");
  }, []);

  // 每 5 分钟静默刷新，跟主看板同一个节奏
  useEffect(() => {
    if (phase !== "ready") return;
    const t = setInterval(() => { if (keyRef.current) load(keyRef.current, true); }, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [phase]);

  const N = useMemo(() => (data ? deriveNow(data, cur) : null), [data, cur]);

  /* ---- 用表里的实况给拉杆一个合理起点（只做一次）---- */
  const seeded = useRef(false);
  useEffect(() => {
    if (!N || seeded.current) return;
    seeded.current = true;
    const next = { ...DEF };
    if (N.avgValue) next.value = Math.min(12000, Math.max(500, Math.round(N.avgValue / 100) * 100));
    if (N.leads && N.appt) next.r1 = Math.min(1, Math.max(0.05, N.appt / N.leads));
    if (N.spend) next.budget = Math.min(400000, Math.max(5000, Math.round((N.spend / Math.max(1, N.lastDay)) * daysInMonth / 1000) * 1000));
    setS(next);
  }, [N, daysInMonth]);

  const P = useMemo(() => planFor(S, S.cpl, mode), [S, mode]);

  /* ---- 进度 ---- */
  const prog = useMemo(() => {
    if (!N || !N.lastDay) return null;
    const elapsed = Math.max(1, N.lastDay);
    const remaining = Math.max(0, daysInMonth - elapsed);
    let cum = 0;
    const byDay = {};
    N.days.forEach((x) => { byDay[x.d] = x; });
    const series = [];
    for (let i = 1; i <= elapsed; i++) {
      cum += byDay[i] ? byDay[i].leads : 0;
      series.push({ d: i, cum, pace: Math.round((P.leads / daysInMonth) * i) });
    }
    const proj = (N.leads / elapsed) * daysInMonth;
    return {
      elapsed, remaining, series, proj,
      paceTarget: (P.leads / daysInMonth) * elapsed,
      projRate: P.leads ? proj / P.leads : null,
      paceRate: P.leads ? N.leads / ((P.leads / daysInMonth) * elapsed) : null,
      need: Math.max(0, P.leads - N.leads),
    };
  }, [N, P, daysInMonth]);

  /* ---- 历史月份 ---- */
  const history = useMemo(() => {
    if (!data || !N) return [];
    const adsBy = {};
    (data.ads || []).forEach((a) => { adsBy[a.m] = a; });
    return Object.keys(N.monthly)
      .map((m) => {
        const o = N.monthly[m], a = adsBy[m];
        const spend = a ? a.spend : null;
        return {
          m, newLead: o.newLead || 0, actual: o.actual || 0,
          spend, roas: spend && o.newLead ? o.newLead / spend : null,
        };
      })
      .filter((x) => x.newLead > 0 || x.spend > 0)
      .sort((a, b) => {
        const k = (s) => { const p = s.split(" "); return (2000 + +p[1]) * 100 + MON.indexOf(p[0]); };
        return k(a.m) - k(b.m);
      });
  }, [data, N]);

  /* ================================================================ 门禁 */
  if (phase === "auth" || (phase === "error" && !data)) {
    return (
      <Shell bare t={t} lang={lang} setLang={pickLang}>
        <Card style={{ maxWidth: 420, margin: "12vh auto 0" }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.ink, marginBottom: 6 }}>{t("appTitle")}</div>
          <p style={{ fontSize: 13.5, color: C.sub, margin: "0 0 14px", lineHeight: 1.6 }}>
            {t("authIntro")}
          </p>
          {err && <p style={{ fontSize: 13, color: CRIT, margin: "0 0 12px" }}>{TXT[err] ? t(err) : err}</p>}
          <form onSubmit={(e) => { e.preventDefault(); if (keyInput.trim()) load(keyInput.trim()); }}>
            <input
              type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)}
              placeholder={t("authKey")} autoFocus
              style={{
                width: "100%", padding: "10px 12px", fontSize: 15, borderRadius: 9,
                border: `1px solid ${C.line}`, background: C.surface, color: C.ink,
                fontFamily: "ui-monospace, monospace", boxSizing: "border-box",
              }} />
            <button type="submit" style={{
              marginTop: 10, width: "100%", padding: "10px 12px", fontSize: 14.5,
              fontWeight: 600, borderRadius: 9, border: 0, background: C.brown,
              color: "#fff", cursor: "pointer",
            }}>{t("authEnter")}</button>
          </form>
        </Card>
      </Shell>
    );
  }
  if (phase === "loading" || !N) {
    return (
      <Shell bare t={t} lang={lang} setLang={pickLang}>
        <div style={{ textAlign: "center", padding: "18vh 16px", color: C.sub, fontSize: 14 }}>
          {t("loading")}
        </div>
      </Shell>
    );
  }

  /* ================================================================ 页面 */
  const setV = (k) => (v) => setS((s) => ({ ...s, [k]: v }));
  const goal = mode === "goal";

  return (
    <Shell
      tab={tab} setTab={setTab} t={t} lang={lang} setLang={pickLang}
      stamp={updatedAt ? t("stamp", cur, updatedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })) : ""}
      onRefresh={() => keyRef.current && load(keyRef.current)}
      err={phase === "error" ? err : ""}
    >
      {tab === 1 && (
        <Page1 S={S} setV={setV} mode={mode} setMode={setMode} P={P} N={N} t={t} />
      )}
      {tab === 2 && (
        <Page2 N={N} cur={cur} t={t} />
      )}
      {tab === 3 && (
        <Page3 S={S} P={P} N={N} prog={prog} cur={cur} history={history} goal={goal} daysInMonth={daysInMonth} t={t} />
      )}
    </Shell>
  );
}

/* --------------------------------------------------------------- 外壳 */
function Shell({ children, tab, setTab, stamp, onRefresh, bare, err, t, lang, setLang }) {
  const TABS = [["1", t("tab1")], ["2", t("tab2")], ["3", t("tab3")]];
  return (
    <div style={{ minHeight: "100vh", background: C.surface, color: C.ink,
      fontFamily: '"Archivo","PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif' }}>
      <div style={{
        position: "sticky", top: 0, zIndex: 30, background: C.surface,
        borderBottom: `1px solid ${C.line}`, padding: "10px 16px 0",
      }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: bare ? 10 : 8 }}>
            <span style={{ fontWeight: 700, fontSize: 15.5, marginRight: "auto" }}>{t("appTitle")}</span>
            {stamp && <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11.5, color: C.sub }}>{stamp}</span>}
            <div style={{
              display: "inline-flex", background: C.sand, border: `1px solid ${C.line}`,
              borderRadius: 8, padding: 2, gap: 2,
            }} role="group" aria-label="Language">
              {[["en", "EN"], ["zh", "中文"]].map(([code, name]) => (
                <button key={code} onClick={() => setLang(code)} aria-pressed={lang === code} style={{
                  appearance: "none", border: 0, background: lang === code ? "#fff" : "none",
                  fontSize: 12, fontWeight: lang === code ? 700 : 500,
                  color: lang === code ? C.ink : C.sub, padding: "3px 9px", borderRadius: 6,
                  cursor: "pointer", whiteSpace: "nowrap",
                }}>{name}</button>
              ))}
            </div>
            {onRefresh && (
              <button onClick={onRefresh} style={{
                fontSize: 12.5, fontWeight: 600, padding: "5px 11px", borderRadius: 8,
                border: `1px solid ${C.line}`, background: "#fff", color: C.ink, cursor: "pointer",
              }}>{t("refresh")}</button>
            )}
          </div>
          {!bare && (
            <div style={{ display: "flex", gap: 2 }} role="tablist">
              {TABS.map(([n, lbl], i) => {
                const on = tab === i + 1;
                return (
                  <button key={n} role="tab" aria-selected={on} onClick={() => { setTab(i + 1); window.scrollTo(0, 0); }}
                    style={{
                      appearance: "none", border: 0, borderBottom: `2.5px solid ${on ? C.brown : "transparent"}`,
                      background: "none", fontSize: 14, fontWeight: on ? 700 : 500,
                      color: on ? C.ink : C.sub, padding: "8px 13px 9px", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap",
                    }}>
                    <span style={{
                      fontFamily: "ui-monospace, monospace", fontSize: 11, fontWeight: 700,
                      width: 17, height: 17, borderRadius: "50%", display: "grid", placeItems: "center",
                      background: on ? C.brown : C.sand, color: on ? "#fff" : C.sub,
                    }}>{n}</span>{lbl}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "22px 16px 56px" }}>
        {err && (
          <div style={{
            border: `1px solid ${C.line}`, borderLeft: `4px solid ${CRIT}`, borderRadius: 10,
            background: "#fff", padding: "11px 14px", marginBottom: 18, fontSize: 13, color: C.ink,
          }}>{t("refreshFail", err)}</div>
        )}
        {children}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- 第 1 页 */
function Page1({ S, setV, mode, setMode, P, N, t }) {
  const goal = mode === "goal";
  const steps = [
    { l: goal ? t("fNeedLead") : t("fGotLead"), v: P.leads, c: C.goldLt, conv: t("convAppt", goal ? "÷" : "×", pct(S.r1)) },
    { l: t("fAppt"), v: P.appt, c: C.gold, conv: t("convShow", goal ? "÷" : "×", pct(S.r2)) },
    { l: t("fShowUp"), v: P.showup, c: C.clay, conv: t("convClose", goal ? "÷" : "×", pct(S.r3)) },
    { l: t("fEnroll"), v: P.enroll, c: C.brown, conv: t("convValue", rm(S.value)) },
  ];
  const mx = Math.max(1, P.leads);
  const cpls = [
    { lbl: t("scenOpt"), v: Math.max(5, Math.round(S.cpl * 0.7)), c: C.goldLt },
    { lbl: t("scenTarget"), v: Math.round(S.cpl), c: C.gold, target: true },
    { lbl: t("scenBad"), v: Math.round(S.cpl * 1.4), c: C.clay },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <div style={{
          display: "inline-flex", background: C.sand, border: `1px solid ${C.line}`,
          borderRadius: 10, padding: 3, gap: 3, marginBottom: 12,
        }}>
          {[["goal", t("modeGoal")], ["budget", t("modeBudget")]].map(([m, lbl]) => (
            <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} style={{
              appearance: "none", border: 0, background: mode === m ? "#fff" : "none",
              fontSize: 13.5, fontWeight: mode === m ? 700 : 500,
              color: mode === m ? C.ink : C.sub, padding: "6px 14px", borderRadius: 7,
              cursor: "pointer", whiteSpace: "nowrap",
              boxShadow: mode === m ? "0 1px 2px rgba(85,33,2,.10)" : "none",
            }}>{lbl}</button>
          ))}
        </div>
        <p style={{ fontSize: 14, color: C.sub, margin: 0, maxWidth: "62ch", lineHeight: 1.6 }}>
          {goal ? t("blurbGoal") : t("blurbBudget")}
          {N.avgValue && t("blurbSeeded")}
          <b style={{ color: C.ink, fontWeight: 600 }}>{t("blurbType")}</b>
        </p>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 1,
        background: C.line, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden",
      }}>
        {goal ? (
          <>
            <div style={{ background: "#fff", padding: "15px 16px 17px" }}>
              <Slider id="s-sales" label={t("qSales")} kind="money" min={500000} max={10000000} step={100000}
                value={S.sales} onChange={setV("sales")} ends={["RM0.5M", "RM10M"]} />
            </div>
            <div style={{ background: "#fff", padding: "15px 16px 17px" }}>
              <Slider id="s-newpct" label={t("qNewPct")} kind="pct" min={5} max={100} step={1}
                value={Math.round(S.newPct * 100)} onChange={(v) => setV("newPct")(v / 100)} ends={["5%", "100%"]} />
            </div>
            <div style={{ background: "#fff", padding: "15px 16px 17px" }}>
              <Slider id="s-cpl" label={t("qCpl")} kind="money" min={10} max={300} step={5}
                value={S.cpl} onChange={setV("cpl")} ends={["RM10", "RM300"]} />
            </div>
          </>
        ) : (
          <>
            <div style={{ background: "#fff", padding: "15px 16px 17px" }}>
              <Slider id="s-budget" label={t("qBudget")} kind="money" min={5000} max={400000} step={1000}
                value={S.budget} onChange={setV("budget")} ends={["RM5K", "RM400K"]} />
            </div>
            <div style={{ background: "#fff", padding: "15px 16px 17px" }}>
              <Slider id="s-cpl2" label={t("qCplEst")} kind="money" min={10} max={300} step={5}
                value={S.cpl} onChange={setV("cpl")} ends={["RM10", "RM300"]} />
            </div>
            <div style={{ background: "#fff", padding: "15px 16px 17px" }}>
              <Slider id="s-value2" label={t("qValue")} kind="money" min={500} max={12000} step={100}
                value={S.value} onChange={setV("value")} ends={["RM500", "RM12K"]} />
            </div>
          </>
        )}
      </div>

      <details style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
        <summary style={{ cursor: "pointer", padding: "12px 16px", fontSize: 13.5, fontWeight: 600, color: C.sub }}>
          {t("advSummary")}
        </summary>
        <div style={{
          padding: "2px 16px 18px", display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 18,
        }}>
          <Slider id="s-value" label={t("qValue")} kind="money" min={500} max={12000} step={100}
            value={S.value} onChange={setV("value")} />
          <Slider id="s-r1" label={t("rLeadAppt")} kind="pct" min={5} max={100} step={1}
            value={Math.round(S.r1 * 100)} onChange={(v) => setV("r1")(v / 100)} />
          <Slider id="s-r2" label={t("rApptShow")} kind="pct" min={5} max={100} step={1}
            value={Math.round(S.r2 * 100)} onChange={(v) => setV("r2")(v / 100)} />
          <Slider id="s-r3" label={t("rShowEnroll")} kind="pct" min={5} max={100} step={1}
            value={Math.round(S.r3 * 100)} onChange={(v) => setV("r3")(v / 100)} />
        </div>
      </details>

      <div>
        <Blk>{goal ? t("funnelBack") : t("funnelFwd")}</Blk>
        <div style={{
          display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(240px,290px)", gap: 1,
          background: C.line, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden",
        }}>
          <div style={{ background: "#fff", padding: 17 }}>
            {steps.map((st) => (
              <div key={st.l} style={{ marginBottom: 9 }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(88px,120px) 1fr 66px", alignItems: "center", gap: 11 }}>
                  <span style={{ fontSize: 13, color: C.sub }}>{st.l}</span>
                  <span style={{
                    height: 26, borderRadius: "0 5px 5px 0", background: st.c,
                    width: `${Math.max(8, (st.v / mx) * 100).toFixed(1)}%`, minWidth: 40,
                  }} />
                  <span style={{
                    fontFamily: "ui-monospace, monospace", fontSize: 14, fontWeight: 700,
                    textAlign: "right", fontVariantNumeric: "tabular-nums",
                  }}>{int(st.v)}</span>
                </div>
                <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: C.sub, textAlign: "right", marginTop: 2 }}>
                  {st.conv}
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: C.sand, padding: 17, display: "flex", flexDirection: "column", justifyContent: "center", gap: 18 }}>
            <div>
              <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 6 }}>{goal ? t("budgetNeed") : t("budgetThis")}</div>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 30, fontWeight: 700, letterSpacing: "-.025em", fontVariantNumeric: "tabular-nums" }}>
                {rm(P.budget)}
              </div>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, color: C.sub, marginTop: 8 }}>
                {t("perWeekV", rm(P.budget / WEEKS))}<br />{t("leadsTimes", int(P.leads), rm(S.cpl))}
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 17 }}>
              <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 6 }}>{t("predSales")}</div>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 30, fontWeight: 700, letterSpacing: "-.025em", color: C.brown, fontVariantNumeric: "tabular-nums" }}>
                {rm(P.newSales)}
              </div>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, color: C.sub, marginTop: 8 }}>
                {t("enrolTimes", int(P.enroll), rm(S.value))}{P.roas ? <><br />ROAS {P.roas.toFixed(1)}×</> : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <Blk>{t("scenTitle")}</Blk>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 1,
          background: C.line, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden",
        }}>
          {cpls.map((sc) => {
            const p = planFor(S, sc.v, mode);
            return (
              <div key={sc.t} style={{ background: sc.target ? C.sand : "#fff", padding: "13px 14px" }}>
                <div style={{ height: 4, borderRadius: 2, background: sc.c, marginBottom: 9 }} />
                <div style={{ fontSize: 11, letterSpacing: ".07em", textTransform: "uppercase", color: C.sub, marginBottom: 3 }}>{sc.lbl}</div>
                <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 19, fontWeight: 700, marginBottom: 10, fontVariantNumeric: "tabular-nums" }}>
                  {rm(sc.v)}<span style={{ fontSize: 12, color: C.sub, fontWeight: 400 }}>{t("perLead")}</span>
                </div>
                {(goal
                  ? [[t("rowNeedBudget"), rm(p.budget)], [t("rowPerWeek"), rm(p.budget / WEEKS)], [t("rowNeedLead"), int(p.leads)]]
                  : [[t("rowGotLead"), int(p.leads)], [t("rowNLS"), rm(p.newSales)], [t("rowRoas"), p.roas ? p.roas.toFixed(1) + "×" : "—"]]
                ).map(([k, v], i) => (
                  <div key={k} style={{
                    display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5,
                    padding: "4px 0", borderTop: i ? `1px solid ${C.line}` : 0,
                  }}>
                    <span style={{ color: C.sub }}>{k}</span>
                    <b style={{ fontFamily: "ui-monospace, monospace", fontVariantNumeric: "tabular-nums" }}>{v}</b>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        {N.cplActual && (
          <p style={{ fontSize: 12.5, color: C.sub, margin: "10px 0 0", lineHeight: 1.6 }}>
            <Rich s={goal
              ? t("actualGoal", rm(N.cplActual, 2), rm(planFor(S, N.cplActual, "goal").budget), rm(planFor(S, N.cplActual, "goal").budget / WEEKS))
              : t("actualBudget", rm(N.cplActual, 2), int(planFor(S, N.cplActual, "budget").leads), rm(planFor(S, N.cplActual, "budget").newSales))} />
          </p>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- 第 2 页 */
function Page2({ N, cur, t }) {
  const rate = N.leads ? N.appt / N.leads : 0;
  const bmax = N.branchLead.length ? N.branchLead[0].leads : 1;
  const smax = N.branchSales.length ? N.branchSales[0].first : 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <p style={{ fontSize: 14, color: C.sub, margin: 0, maxWidth: "62ch", lineHeight: 1.6 }}>
        {t("p2Intro")}
      </p>

      <StatRow>
        <Stat label={t("sLead")} value={int(N.leads)} meta={N.lastDay ? t("mToDay", cur.split(" ")[0], N.lastDay) : "—"} />
        <Stat label={t("sAppt")} value={int(N.appt)} meta={t("mBooked")} />
        <Stat label={t("sRate")} value={pct(rate)} meta={t("mRateCalc")} />
        <Stat label={t("sAvgDay")} value={N.lastDay ? (N.leads / N.lastDay).toFixed(1) : "—"} meta={t("mDailyAvg")} />
      </StatRow>

      <StatRow>
        <Stat label={t("sNLS")} value={rm(N.newLeadSales)} accent={C.brown}
          meta={N.salesDay ? t("mSalesTo", N.salesDay)
            : N.latestSalesDate ? t("mSalesGap", N.latestSalesDate) : t("mSalesWait")} />
        <Stat label={t("sSpend")} value={rm(N.spend)} meta={t("mSST")} />
        <Stat label={t("sCPL")} value={rm(N.cplActual, 2)} meta={t("mCPL")} />
        <Stat label={t("sROAS")} value={N.roasActual ? N.roasActual.toFixed(1) + "×" : "—"} accent={C.brown}
          meta={t("mROAS")} />
      </StatRow>

      <div>
        <Blk note={t("noteLeadReport")}>{t("blkDaily")}</Blk>
        <Card>
          {N.days.length ? (
            <div style={{ width: "100%", height: 210 }}>
              <ResponsiveContainer>
                <BarChart data={N.days} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
                  <CartesianGrid stroke={C.line} vertical={false} />
                  <XAxis dataKey="d" tick={{ fill: C.sub, fontSize: 11 }} tickLine={false} axisLine={{ stroke: C.line }} />
                  <YAxis tick={{ fill: C.sub, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 12.5 }}
                    labelFormatter={(d) => `${cur.split(" ")[0]} ${d}`}
                    formatter={(v, k) => [v, k === "leads" ? "Lead" : "Appointment"]} />
                  <Bar dataKey="leads" fill={C.gold} radius={[4, 4, 0, 0]} name="leads" />
                  <Bar dataKey="appt" fill={C.sageLt} radius={[4, 4, 0, 0]} name="appt" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <div style={{ padding: 24, textAlign: "center", color: C.sub, fontSize: 13.5 }}>{t("emptyDaily")}</div>}
        </Card>
      </div>

      <div>
        <Blk note="Lead → Appointment">{t("blkBranchLead")}</Blk>
        <Card>
          <div style={{ overflowX: "auto" }}>
            <Table
              head={[t("thBranch"), t("thLeadVol"), t("thLead"), t("thAppt"), t("thApptRate")]}
              rows={N.branchLead.map((b) => {
                const r = b.leads ? b.appt / b.leads : 0;
                return [
                  b.branch,
                  <Bar100 key="b" w={(b.leads / bmax) * 100} color={C.gold} />,
                  int(b.leads), int(b.appt),
                  <span key="r" style={{ color: r < 0.3 ? CRIT : r < 0.5 ? WARN : C.ink, fontWeight: r < 0.3 ? 700 : 400 }}>{pct(r)}</span>,
                ];
              })}
              foot={[t("footAll", N.branchLead.length), "", int(N.leads), int(N.appt), pct(rate)]}
            />
          </div>
          <p style={{ fontSize: 12, color: C.sub, margin: "9px 0 0", lineHeight: 1.55 }}>
            {t("noteWeak")}
          </p>
        </Card>
      </div>

      <div>
        <Blk note={N.salesDay ? t("mSalesTo", N.salesDay) : ""}>{t("blkBranchSales")}</Blk>
        <Card>
          {N.branchSales.length ? (
            <div style={{ overflowX: "auto" }}>
              <Table
                head={[t("thBranch"), t("thNLS"), t("thSalesVal"), t("thEnrol"), t("thAOV"), t("thMTD")]}
                rows={N.branchSales.map((b) => [
                  b.branch,
                  <Bar100 key="b" w={(b.first / smax) * 100} color={C.brown} />,
                  rm(b.first), int(b.enrol),
                  b.enrol ? rm(b.first / b.enrol) : "—",
                  rm(b.mtd),
                ])}
                foot={[
                  t("footAll", N.branchSales.length), "",
                  rm(N.newLeadSales), int(N.enrol),
                  N.avgValue ? rm(N.avgValue) : "—",
                  rm(N.mo ? N.mo.actual : null),
                ]}
              />
            </div>
          ) : <div style={{ padding: 24, textAlign: "center", color: C.sub, fontSize: 13.5 }}>{t("emptyBranchSales")}</div>}
          <p style={{ fontSize: 12, color: C.sub, margin: "9px 0 0", lineHeight: 1.55 }}>
            {t("noteNLSdef")}
          </p>
        </Card>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- 第 3 页 */
function Page3({ S, P, N, prog, cur, history, goal, daysInMonth, t }) {
  const sev = prog && prog.projRate != null
    ? (prog.projRate >= 0.95 ? "good" : prog.projRate >= 0.8 ? "warn" : "crit")
    : null;
  const stripe = sev === "good" ? GOOD : sev === "warn" ? WARN : sev === "crit" ? CRIT : C.sub;

  const rows = [
    [t("rLead"), P.leads, N.leads, int, t("nFullMonth")],
    [t("rAppt"), P.appt, N.appt, int, t("nFullMonth")],
    [t("rEnroll"), P.enroll, N.enrol, int, t("nFromDaily")],
    [t("rNLS"), P.newSales, N.newLeadSales, (v) => rm(v), t("nFirstCourse")],
    [t("rBudget"), P.budget, N.spend, (v) => rm(v), t("nSpent")],
  ];

  const alerts = [];
  if (prog) {
    if (prog.paceRate < 0.85) alerts.push(["crit", t("aBehindT"),
      t("aBehindB", int(prog.paceTarget), int(N.leads), pct(prog.paceRate)),
      prog.remaining > 0
        ? t("aBehindA", prog.remaining, int(prog.need), (prog.need / prog.remaining).toFixed(1), (N.leads / prog.elapsed).toFixed(1))
        : t("aBehindAEnd")]);
    else if (prog.paceRate < 1) alerts.push(["warn", t("aSlowT"),
      t("aSlowB", int(prog.paceTarget), int(N.leads), pct(prog.paceRate)), t("aSlowA")]);
    else alerts.push(["good", t("aAheadT"),
      t("aSlowB", int(prog.paceTarget), int(N.leads), pct(prog.paceRate)), t("aAheadA")]);
  }
  if (N.cplActual) {
    const over = N.cplActual / S.cpl - 1;
    if (over > 0.2) alerts.push(["crit", t("aCplBadT"),
      t("aCplBadB", rm(N.cplActual, 2), rm(S.cpl), pct(over), pct(1 / (1 + over))), t("aCplBadA")]);
    else if (over > 0) alerts.push(["warn", t("aCplHiT"),
      t("aCplHiB", rm(N.cplActual, 2), rm(S.cpl), pct(over)), t("aCplHiA")]);
    else alerts.push(["good", t("aCplOkT"),
      t("aCplOkB", rm(N.cplActual, 2), rm(S.cpl), pct(-over)), t("aCplOkA")]);
  }
  if (N.roasActual && P.roas) {
    const r = N.roasActual / P.roas;
    if (r < 0.8) alerts.push(["crit", t("aRoasT"),
      t("aRoasB", N.roasActual.toFixed(1) + "×", P.roas.toFixed(1) + "×", pct(r)), t("aRoasA")]);
  }
  const weak = N.branchLead.filter((b) => b.leads >= 10 && b.appt / b.leads < 0.3);
  if (weak.length) alerts.push(["crit", t("aWeakT"),
    t("aWeakB",
      weak.slice(0, 3).map((b) => `${b.branch} (${pct(b.appt / b.leads)})`).join(", "),
      weak.length > 3 ? t("aWeakMore", weak.length) : ""),
    t("aWeakA")]);
  const order = { crit: 0, warn: 1, good: 2 };
  alerts.sort((a, b) => order[a[0]] - order[b[0]]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{
        display: "flex", border: `1px solid ${C.line}`, borderRadius: 14,
        overflow: "hidden", background: "#fff",
      }}>
        <div style={{ width: 6, flex: "none", background: stripe }} />
        <div style={{ padding: "14px 16px", minWidth: 0 }}>
          <div style={{
            display: "inline-block", fontFamily: "ui-monospace, monospace", fontSize: 11,
            letterSpacing: ".08em", textTransform: "uppercase", padding: "2px 8px",
            borderRadius: 999, marginBottom: 7,
            background: sev === "good" ? "#EAF0E4" : sev === "warn" ? "#F7EDD9" : sev === "crit" ? "#F5E3DA" : C.sand,
            color: stripe,
          }}>
            {sev === "good" ? t("vGood") : sev === "warn" ? t("vWarn") : sev === "crit" ? t("vCrit") : t("vWait")}
          </div>
          {prog ? (
            <>
              <p style={{ fontSize: 17, lineHeight: 1.45, margin: 0, textWrap: "balance" }}>
                <Rich s={P.leads - prog.proj > 0
                  ? t("verdictShort", (N.leads / prog.elapsed).toFixed(1), int(prog.proj), int(P.leads - prog.proj))
                  : t("verdictOver", (N.leads / prog.elapsed).toFixed(1), int(prog.proj), int(prog.proj - P.leads))} />
              </p>
              <p style={{ margin: "8px 0 0", fontSize: 13.5, color: C.sub }}>
                {[
                  prog.remaining > 0 && prog.need > 0
                    ? t("subCatchUp", prog.remaining, int(prog.need), (prog.need / prog.remaining).toFixed(1))
                    : prog.remaining === 0 ? t("subMonthDone") : null,
                  prog.remaining > 0 && prog.need > 0 && N.cplActual
                    ? t("subSpendDay", rm(N.cplActual, 2), rm((prog.need * N.cplActual) / prog.remaining))
                    : null,
                ].filter(Boolean).join(" · ")}
              </p>
            </>
          ) : <p style={{ fontSize: 15, margin: 0, color: C.sub }}>{t("verdictNoData")}</p>}
        </div>
      </div>

      <div>
        <Blk note={t("cmpNote", cur.split(" ")[0], N.lastDay)}>{t("cmpTitle")}</Blk>
        <Card>
          <div style={{ overflowX: "auto" }}>
            <Table
              head={[t("thMetric"), t("thTarget"), t("thNow"), t("thGap")]}
              align="right"
              rows={[
                ...rows.map(([label, t, n, f, note]) => {
                  const g = t != null && n != null ? n - t : null;
                  return [
                    <span key="l">{label}{note && <span style={{ color: C.sub, fontSize: 11.5 }}> {note}</span>}</span>,
                    t == null ? "—" : f(t),
                    n == null ? "—" : f(n),
                    <span key="g" style={{ color: g == null ? C.ink : g >= 0 ? GOOD : CRIT, fontWeight: 700 }}>
                      {g == null ? "—" : (g > 0 ? "+" : g < 0 ? "−" : "") + f(Math.abs(g))}
                    </span>,
                  ];
                }),
                ...(N.cplActual ? [[
                  t("rCPL"), rm(S.cpl), rm(N.cplActual, 2),
                  <Pill key="p" tone={N.cplActual <= S.cpl ? "good" : N.cplActual <= S.cpl * 1.2 ? "warn" : "crit"}>
                    {(N.cplActual >= S.cpl ? "+" : "−") + pct(Math.abs(N.cplActual / S.cpl - 1))}
                  </Pill>,
                ]] : []),
                ...(N.roasActual && P.roas ? [[
                  t("rROAS"), P.roas.toFixed(1) + "×", N.roasActual.toFixed(1) + "×",
                  <Pill key="p" tone={N.roasActual >= P.roas ? "good" : N.roasActual >= P.roas * 0.8 ? "warn" : "crit"}>
                    {(N.roasActual >= P.roas ? "+" : "−") + pct(Math.abs(N.roasActual / P.roas - 1))}
                  </Pill>,
                ]] : []),
              ]}
            />
          </div>
        </Card>
      </div>

      {prog && (
        <div>
          <Blk note={t("progNote")}>{t("progTitle")}</Blk>
          <Card>
            <div style={{ width: "100%", height: 250 }}>
              <ResponsiveContainer>
                <LineChart data={prog.series} margin={{ top: 8, right: 14, bottom: 4, left: -12 }}>
                  <CartesianGrid stroke={C.line} vertical={false} />
                  <XAxis dataKey="d" tick={{ fill: C.sub, fontSize: 11 }} tickLine={false} axisLine={{ stroke: C.line }} />
                  <YAxis tick={{ fill: C.sub, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 12.5 }}
                    labelFormatter={(d) => `${cur.split(" ")[0]} ${d}`}
                    formatter={(v, k) => [int(v), k === "cum" ? t("tipCum") : t("tipPace")]} />
                  <ReferenceLine y={P.leads} stroke={C.clay} strokeDasharray="6 5"
                    label={{ value: t("refTarget", int(P.leads)), position: "insideTopRight", fill: C.clay, fontSize: 11 }} />
                  <Line type="monotone" dataKey="pace" stroke={C.sub} strokeWidth={2} strokeDasharray="6 5" dot={false} name="pace" />
                  <Line type="monotone" dataKey="cum" stroke={C.brown} strokeWidth={2.5} dot={false} name="cum" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", gap: 15, flexWrap: "wrap", fontSize: 12.5, color: C.sub, marginTop: 8 }}>
              <span><i style={{ display: "inline-block", width: 15, height: 3, borderRadius: 2, background: C.brown, marginRight: 6, verticalAlign: "middle" }} />{t("legCum")}</span>
              <span><i style={{ display: "inline-block", width: 15, borderTop: `2px dashed ${C.sub}`, marginRight: 6, verticalAlign: "middle" }} />{t("legPace")}</span>
              <span><i style={{ display: "inline-block", width: 15, borderTop: `2px dashed ${C.clay}`, marginRight: 6, verticalAlign: "middle" }} />{t("legTarget", int(P.leads))}</span>
            </div>
          </Card>
        </div>
      )}

      {alerts.length > 0 && (
        <div>
          <Blk note={t("alertsNote")}>{t("alertsTitle")}</Blk>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(268px,1fr))", gap: 12 }}>
            {alerts.map(([lv, title, body, action]) => {
              const col = lv === "crit" ? CRIT : lv === "warn" ? WARN : GOOD;
              return (
                <div key={title} style={{
                  border: `1px solid ${C.line}`, borderLeft: `4px solid ${col}`,
                  borderRadius: 12, background: "#fff", padding: "12px 14px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 700, fontSize: 14, marginBottom: 5 }}>
                    <span aria-hidden style={{
                      fontFamily: "ui-monospace, monospace", fontSize: 12, fontWeight: 700,
                      width: 17, height: 17, borderRadius: "50%", display: "grid", placeItems: "center",
                      background: lv === "crit" ? "#F5E3DA" : lv === "warn" ? "#F7EDD9" : "#EAF0E4", color: col,
                    }}>{lv === "crit" ? "!" : lv === "warn" ? "△" : "✓"}</span>
                    {title}
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: C.sub, lineHeight: 1.5 }}>{body}</p>
                  <div style={{ marginTop: 7, fontSize: 13 }}><b>{t("advice")}</b> · {action}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {history.length > 1 && (
        <>
          <div>
            <Blk note={t("nFirstCourse")}>{t("histTitle")}</Blk>
            <Card>
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={history} margin={{ top: 8, right: 8, bottom: 4, left: 2 }}>
                    <CartesianGrid stroke={C.line} vertical={false} />
                    <XAxis dataKey="m" tick={{ fill: C.sub, fontSize: 11 }} tickLine={false} axisLine={{ stroke: C.line }} />
                    <YAxis tick={{ fill: C.sub, fontSize: 11 }} tickLine={false} axisLine={false}
                      tickFormatter={(v) => (v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : Math.round(v / 1000) + "K")} />
                    <Tooltip
                      contentStyle={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 12.5 }}
                      formatter={(v) => [rm(v), t("thNLS")]} />
                    <Bar dataKey="newLead" fill={C.brown} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div>
            <Blk note={t("roasNote")}>{t("roasTitle")}</Blk>
            <Card>
              <div style={{ width: "100%", height: 200 }}>
                <ResponsiveContainer>
                  <LineChart data={history.filter((h) => h.roas != null)} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
                    <CartesianGrid stroke={C.line} vertical={false} />
                    <XAxis dataKey="m" tick={{ fill: C.sub, fontSize: 11 }} tickLine={false} axisLine={{ stroke: C.line }} />
                    <YAxis tick={{ fill: C.sub, fontSize: 11 }} tickLine={false} axisLine={false}
                      tickFormatter={(v) => v + "×"} />
                    <Tooltip
                      contentStyle={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 12.5 }}
                      formatter={(v) => [v.toFixed(1) + "×", "ROAS"]} />
                    {P.roas && (
                      <ReferenceLine y={P.roas} stroke={C.clay} strokeDasharray="6 5"
                        label={{ value: t("refTarget", P.roas.toFixed(1) + "×"), position: "insideTopRight", fill: C.clay, fontSize: 11 }} />
                    )}
                    <Line type="monotone" dataKey="roas" stroke={C.sage} strokeWidth={2.5} dot={{ r: 3, fill: C.sage }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <Table
                  head={[t("thMonth"), t("thNLS"), t("thSpend"), t("rROAS")]}
                  align="right"
                  rows={history.slice().reverse().map((h) => [
                    h.m, rm(h.newLead), rm(h.spend),
                    h.roas ? <b key="r" style={{ color: P.roas && h.roas >= P.roas ? GOOD : C.ink }}>{h.roas.toFixed(1)}×</b> : "—",
                  ])}
                />
              </div>
            </Card>
          </div>
        </>
      )}

      <footer style={{ fontSize: 12, color: C.sub, lineHeight: 1.65, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
        <Rich s={t("foot1")} /><br />
        <Rich s={t("foot2")} /><br />
        <Rich s={t("foot3")} /><br />
        <Rich s={t("foot4")} />
      </footer>
    </div>
  );
}

/* --------------------------------------------------------------- 表格 */
function Table({ head, rows, foot, align }) {
  const td = {
    padding: "7px 0", borderBottom: `1px solid ${C.line}`, fontSize: 13.5,
    textAlign: "right", fontFamily: "ui-monospace, monospace", fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  };
  const td0 = { ...td, textAlign: "left", fontFamily: "inherit", paddingRight: 12 };
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: align === "right" ? 430 : 500 }}>
      <thead>
        <tr>{head.map((h, i) => (
          <th key={i} style={{
            textAlign: i === 0 ? "left" : "right", fontSize: 11, fontWeight: 700,
            letterSpacing: ".06em", textTransform: "uppercase", color: C.sub,
            padding: "0 0 8px", borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap",
            width: i === 1 && align !== "right" ? "32%" : undefined,
          }}>{h}</th>
        ))}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => <td key={j} style={j === 0 ? td0 : td}>{c}</td>)}</tr>
        ))}
        {foot && (
          <tr>{foot.map((c, j) => (
            <td key={j} style={{ ...(j === 0 ? td0 : td), borderBottom: 0, borderTop: `1px solid ${C.sub}`, fontWeight: 700 }}>{c}</td>
          ))}</tr>
        )}
      </tbody>
    </table>
  );
}
function Bar100({ w, color }) {
  return <span style={{ display: "block", width: "100%", paddingRight: 14 }}>
    <span style={{ display: "block", height: 15, borderRadius: "0 4px 4px 0", background: color, width: `${Math.max(2, w).toFixed(1)}%` }} />
  </span>;
}
