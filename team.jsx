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
function Slider({ id, label, out, min, max, step, value, onChange, ends }) {
  return (
    <div>
      <label htmlFor={id} style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        gap: 10, fontSize: 13, color: C.ink, marginBottom: 7,
      }}>
        <span>{label}</span>
        <output style={{
          fontFamily: "ui-monospace, monospace", fontSize: 15, fontWeight: 700,
          color: C.brown, fontVariantNumeric: "tabular-nums",
        }}>{out}</output>
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
  const keyRef = useRef("");

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
        setErr(j.teamKeyConfigured === false
          ? "这个部署还没设 TEAM_KEY。去 Vercel 的 Environment Variables 加上它（记得勾这个环境），然后重新 deploy 一次 —— 环境变量是在部署那一刻固定的，改完不重新 deploy 不会生效。"
          : "这条链接的 key 不对。核对 Vercel 里 TEAM_KEY 的值（注意前后空格同大小写）。");
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
      <Shell bare>
        <Card style={{ maxWidth: 420, margin: "12vh auto 0" }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.ink, marginBottom: 6 }}>Lead &amp; Ads 预算推算</div>
          <p style={{ fontSize: 13.5, color: C.sub, margin: "0 0 14px", lineHeight: 1.6 }}>
            这一页要用团队 key 打开。正常情况下链接里已经带了 key，一点就进。
            如果你是手动开的，把 key 贴在下面。
          </p>
          {err && <p style={{ fontSize: 13, color: CRIT, margin: "0 0 12px" }}>{err}</p>}
          <form onSubmit={(e) => { e.preventDefault(); if (keyInput.trim()) load(keyInput.trim()); }}>
            <input
              type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)}
              placeholder="团队 key" autoFocus
              style={{
                width: "100%", padding: "10px 12px", fontSize: 15, borderRadius: 9,
                border: `1px solid ${C.line}`, background: C.surface, color: C.ink,
                fontFamily: "ui-monospace, monospace", boxSizing: "border-box",
              }} />
            <button type="submit" style={{
              marginTop: 10, width: "100%", padding: "10px 12px", fontSize: 14.5,
              fontWeight: 600, borderRadius: 9, border: 0, background: C.brown,
              color: "#fff", cursor: "pointer",
            }}>进入</button>
          </form>
        </Card>
      </Shell>
    );
  }
  if (phase === "loading" || !N) {
    return (
      <Shell bare>
        <div style={{ textAlign: "center", padding: "18vh 16px", color: C.sub, fontSize: 14 }}>
          读取中…
        </div>
      </Shell>
    );
  }

  /* ================================================================ 页面 */
  const setV = (k) => (v) => setS((s) => ({ ...s, [k]: v }));
  const goal = mode === "goal";

  return (
    <Shell
      tab={tab} setTab={setTab}
      stamp={updatedAt ? `${cur} · 数据 ${updatedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}
      onRefresh={() => keyRef.current && load(keyRef.current)}
      err={phase === "error" ? err : ""}
    >
      {tab === 1 && (
        <Page1 S={S} setV={setV} mode={mode} setMode={setMode} P={P} N={N} />
      )}
      {tab === 2 && (
        <Page2 N={N} cur={cur} />
      )}
      {tab === 3 && (
        <Page3 S={S} P={P} N={N} prog={prog} cur={cur} history={history} goal={goal} daysInMonth={daysInMonth} />
      )}
    </Shell>
  );
}

/* --------------------------------------------------------------- 外壳 */
function Shell({ children, tab, setTab, stamp, onRefresh, bare, err }) {
  const TABS = [["1", "目标"], ["2", "现在"], ["3", "对比"]];
  return (
    <div style={{ minHeight: "100vh", background: C.surface, color: C.ink,
      fontFamily: '"Archivo","PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif' }}>
      <div style={{
        position: "sticky", top: 0, zIndex: 30, background: C.surface,
        borderBottom: `1px solid ${C.line}`, padding: "10px 16px 0",
      }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: bare ? 10 : 8 }}>
            <span style={{ fontWeight: 700, fontSize: 15.5, marginRight: "auto" }}>Lead &amp; Ads 预算推算</span>
            {stamp && <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11.5, color: C.sub }}>{stamp}</span>}
            {onRefresh && (
              <button onClick={onRefresh} style={{
                fontSize: 12.5, fontWeight: 600, padding: "5px 11px", borderRadius: 8,
                border: `1px solid ${C.line}`, background: "#fff", color: C.ink, cursor: "pointer",
              }}>重新读取</button>
            )}
          </div>
          {!bare && (
            <div style={{ display: "flex", gap: 2 }} role="tablist">
              {TABS.map(([n, t], i) => {
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
                    }}>{n}</span>{t}
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
          }}>刷新失败：{err}　—　下面显示的是上一次成功读到的数据。</div>
        )}
        {children}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- 第 1 页 */
function Page1({ S, setV, mode, setMode, P, N }) {
  const goal = mode === "goal";
  const steps = [
    { l: goal ? "需要 Lead" : "买到 Lead", v: P.leads, c: C.goldLt, conv: `${goal ? "÷" : "×"} ${pct(S.r1)} 约到率` },
    { l: "Appointment", v: P.appt, c: C.gold, conv: `${goal ? "÷" : "×"} ${pct(S.r2)} 到场率` },
    { l: "Show Up 到场", v: P.showup, c: C.clay, conv: `${goal ? "÷" : "×"} ${pct(S.r3)} 成交率` },
    { l: "Enroll 成交", v: P.enroll, c: C.brown, conv: `× ${rm(S.value)} 客单价` },
  ];
  const mx = Math.max(1, P.leads);
  const cpls = [
    { t: "乐观", v: Math.max(5, Math.round(S.cpl * 0.7)), c: C.goldLt },
    { t: "目标", v: Math.round(S.cpl), c: C.gold, target: true },
    { t: "悲观", v: Math.round(S.cpl * 1.4), c: C.clay },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <div style={{
          display: "inline-flex", background: C.sand, border: `1px solid ${C.line}`,
          borderRadius: 10, padding: 3, gap: 3, marginBottom: 12,
        }}>
          {[["goal", "以目标为导向"], ["budget", "以广告费为导向"]].map(([m, t]) => (
            <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} style={{
              appearance: "none", border: 0, background: mode === m ? "#fff" : "none",
              fontSize: 13.5, fontWeight: mode === m ? 700 : 500,
              color: mode === m ? C.ink : C.sub, padding: "6px 14px", borderRadius: 7,
              cursor: "pointer", whiteSpace: "nowrap",
              boxShadow: mode === m ? "0 1px 2px rgba(85,33,2,.10)" : "none",
            }}>{t}</button>
          ))}
        </div>
        <p style={{ fontSize: 14, color: C.sub, margin: 0, maxWidth: "62ch", lineHeight: 1.6 }}>
          {goal
            ? "给一个 Sales 目标，倒推出这个月要几多 Lead、要花几多广告预算。"
            : "给一笔广告预算，正推出这笔钱能带几多 Lead，最后落到几多 New Lead Sales。"}
          {N.avgValue && " 客单价同约到率的起点已经用你表里的实况填好。"}
        </p>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 1,
        background: C.line, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden",
      }}>
        {goal ? (
          <>
            <div style={{ background: "#fff", padding: "15px 16px 17px" }}>
              <Slider id="s-sales" label="这个月 Sales 目标" out={rm(S.sales)} min={500000} max={10000000} step={100000}
                value={S.sales} onChange={setV("sales")} ends={["RM0.5M", "RM10M"]} />
            </div>
            <div style={{ background: "#fff", padding: "15px 16px 17px" }}>
              <Slider id="s-newpct" label="New Lead Sales 占几多 %" out={pct(S.newPct)} min={5} max={100} step={1}
                value={Math.round(S.newPct * 100)} onChange={(v) => setV("newPct")(v / 100)} ends={["5%", "100%"]} />
            </div>
            <div style={{ background: "#fff", padding: "15px 16px 17px" }}>
              <Slider id="s-cpl" label="Cost Per Lead 预算" out={rm(S.cpl)} min={10} max={300} step={5}
                value={S.cpl} onChange={setV("cpl")} ends={["RM10", "RM300"]} />
            </div>
          </>
        ) : (
          <>
            <div style={{ background: "#fff", padding: "15px 16px 17px" }}>
              <Slider id="s-budget" label="这个月广告费打算花几多" out={rm(S.budget)} min={5000} max={400000} step={1000}
                value={S.budget} onChange={setV("budget")} ends={["RM5K", "RM400K"]} />
            </div>
            <div style={{ background: "#fff", padding: "15px 16px 17px" }}>
              <Slider id="s-cpl2" label="Cost Per Lead 估几多" out={rm(S.cpl)} min={10} max={300} step={5}
                value={S.cpl} onChange={setV("cpl")} ends={["RM10", "RM300"]} />
            </div>
            <div style={{ background: "#fff", padding: "15px 16px 17px" }}>
              <Slider id="s-value2" label="平均客单价" out={rm(S.value)} min={500} max={12000} step={100}
                value={S.value} onChange={setV("value")} ends={["RM500", "RM12K"]} />
            </div>
          </>
        )}
      </div>

      <details style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
        <summary style={{ cursor: "pointer", padding: "12px 16px", fontSize: 13.5, fontWeight: 600, color: C.sub }}>
          进阶假设 — 客单价同三段转化率
        </summary>
        <div style={{
          padding: "2px 16px 18px", display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 18,
        }}>
          <Slider id="s-value" label="平均客单价" out={rm(S.value)} min={500} max={12000} step={100}
            value={S.value} onChange={setV("value")} />
          <Slider id="s-r1" label="Lead → Appt" out={pct(S.r1)} min={5} max={100} step={1}
            value={Math.round(S.r1 * 100)} onChange={(v) => setV("r1")(v / 100)} />
          <Slider id="s-r2" label="Appt → Show Up" out={pct(S.r2)} min={5} max={100} step={1}
            value={Math.round(S.r2 * 100)} onChange={(v) => setV("r2")(v / 100)} />
          <Slider id="s-r3" label="Show Up → Enroll" out={pct(S.r3)} min={5} max={100} step={1}
            value={Math.round(S.r3 * 100)} onChange={(v) => setV("r3")(v / 100)} />
        </div>
      </details>

      <div>
        <Blk>{goal ? "倒推出来的 funnel" : "正推出来的 funnel"}</Blk>
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
              <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 6 }}>{goal ? "需要广告预算" : "这笔广告预算"}</div>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 30, fontWeight: 700, letterSpacing: "-.025em", fontVariantNumeric: "tabular-nums" }}>
                {rm(P.budget)}
              </div>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, color: C.sub, marginTop: 8 }}>
                每周 {rm(P.budget / WEEKS)}<br />{int(P.leads)} lead × {rm(S.cpl)}
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 17 }}>
              <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 6 }}>预测 New Lead Sales</div>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 30, fontWeight: 700, letterSpacing: "-.025em", color: C.brown, fontVariantNumeric: "tabular-nums" }}>
                {rm(P.newSales)}
              </div>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, color: C.sub, marginTop: 8 }}>
                {int(P.enroll)} 成交 × {rm(S.value)}{P.roas ? <><br />ROAS {P.roas.toFixed(1)}×</> : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <Blk>CPL 跑成不同价钱会怎样</Blk>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 1,
          background: C.line, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden",
        }}>
          {cpls.map((sc) => {
            const p = planFor(S, sc.v, mode);
            return (
              <div key={sc.t} style={{ background: sc.target ? C.sand : "#fff", padding: "13px 14px" }}>
                <div style={{ height: 4, borderRadius: 2, background: sc.c, marginBottom: 9 }} />
                <div style={{ fontSize: 11, letterSpacing: ".07em", textTransform: "uppercase", color: C.sub, marginBottom: 3 }}>{sc.t}</div>
                <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 19, fontWeight: 700, marginBottom: 10, fontVariantNumeric: "tabular-nums" }}>
                  {rm(sc.v)}<span style={{ fontSize: 12, color: C.sub, fontWeight: 400 }}> / lead</span>
                </div>
                {(goal
                  ? [["需要预算", rm(p.budget)], ["每周", rm(p.budget / WEEKS)], ["需要 Lead", int(p.leads)]]
                  : [["拿到 Lead", int(p.leads)], ["New Lead Sales", rm(p.newSales)], ["ROAS", p.roas ? p.roas.toFixed(1) + "×" : "—"]]
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
            你这个月实际跑在 <b style={{ color: C.ink, fontFamily: "ui-monospace, monospace" }}>{rm(N.cplActual, 2)} / lead</b>。
            {goal
              ? <> 按这个成本要做到上面的 Sales 目标，需要 <b style={{ color: C.ink }}>{rm(planFor(S, N.cplActual, "goal").budget)}</b>，每周 <b style={{ color: C.ink }}>{rm(planFor(S, N.cplActual, "goal").budget / WEEKS)}</b>。</>
              : <> 按这个成本，这笔预算只能买到 <b style={{ color: C.ink }}>{int(planFor(S, N.cplActual, "budget").leads)}</b> 个 lead，落到 <b style={{ color: C.ink }}>{rm(planFor(S, N.cplActual, "budget").newSales)}</b> New Lead Sales。</>}
          </p>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- 第 2 页 */
function Page2({ N, cur }) {
  const rate = N.leads ? N.appt / N.leads : 0;
  const bmax = N.branchLead.length ? N.branchLead[0].leads : 1;
  const smax = N.branchSales.length ? N.branchSales[0].first : 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <p style={{ fontSize: 14, color: C.sub, margin: 0, maxWidth: "62ch", lineHeight: 1.6 }}>
        本月到今天为止真的拿到几多。Lead / Appointment 来自 Lead Report，业绩来自逐日 Sales 上传。
      </p>

      <StatRow>
        <Stat label="本月 Lead" value={int(N.leads)} meta={N.lastDay ? `到 ${cur.split(" ")[0]} ${N.lastDay} 号` : "—"} />
        <Stat label="本月 Appointment" value={int(N.appt)} meta="已约到的数量" />
        <Stat label="约到率" value={pct(rate)} meta="Appointment ÷ Lead" />
        <Stat label="每日平均 Lead" value={N.lastDay ? (N.leads / N.lastDay).toFixed(1) : "—"} meta="每日平均" />
      </StatRow>

      <StatRow>
        <Stat label="New Lead 业绩（First Course）" value={rm(N.newLeadSales)} accent={C.brown}
          meta={N.salesDay ? `逐日 Sales 到 ${N.salesDay}`
            : N.latestSalesDate ? `本月未上传 · 表里最新到 ${N.latestSalesDate}` : "等上传"} />
        <Stat label="广告花费" value={rm(N.spend)} meta="含 6% SST" />
        <Stat label="实际 CPL" value={rm(N.cplActual, 2)} meta="花费 ÷ Lead Report 的 Lead" />
        <Stat label="实际 ROAS" value={N.roasActual ? N.roasActual.toFixed(1) + "×" : "—"} accent={C.brown}
          meta="New Lead 业绩 ÷ 花费" />
      </StatRow>

      <div>
        <Blk note="来自 Lead Report">每日 Lead</Blk>
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
          ) : <div style={{ padding: 24, textAlign: "center", color: C.sub, fontSize: 13.5 }}>本月还没有每日 Lead 数据。</div>}
        </Card>
      </div>

      <div>
        <Blk note="Lead → Appointment">分店 Lead 拆解</Blk>
        <Card>
          <div style={{ overflowX: "auto" }}>
            <Table
              head={["分店", "Lead 量", "Lead", "Appt", "约到率"]}
              rows={N.branchLead.map((b) => {
                const r = b.leads ? b.appt / b.leads : 0;
                return [
                  b.branch,
                  <Bar100 key="b" w={(b.leads / bmax) * 100} color={C.gold} />,
                  int(b.leads), int(b.appt),
                  <span key="r" style={{ color: r < 0.3 ? CRIT : r < 0.5 ? WARN : C.ink, fontWeight: r < 0.3 ? 700 : 400 }}>{pct(r)}</span>,
                ];
              })}
              foot={["全部 " + N.branchLead.length + " 间", "", int(N.leads), int(N.appt), pct(rate)]}
            />
          </div>
          <p style={{ fontSize: 12, color: C.sub, margin: "9px 0 0", lineHeight: 1.55 }}>
            约到率低过 30% 标红 —— lead 已经买回来但约不到人，问题在跟进不在广告。
          </p>
        </Card>
      </div>

      <div>
        <Blk note={N.salesDay ? `逐日 Sales 到 ${N.salesDay}` : ""}>分店业绩拆解</Blk>
        <Card>
          {N.branchSales.length ? (
            <div style={{ overflowX: "auto" }}>
              <Table
                head={["分店", "New Lead 业绩", "业绩", "成交", "客单价", "MTD 总收"]}
                rows={N.branchSales.map((b) => [
                  b.branch,
                  <Bar100 key="b" w={(b.first / smax) * 100} color={C.brown} />,
                  rm(b.first), int(b.enrol),
                  b.enrol ? rm(b.first / b.enrol) : "—",
                  rm(b.mtd),
                ])}
                foot={[
                  "全部 " + N.branchSales.length + " 间", "",
                  rm(N.newLeadSales), int(N.enrol),
                  N.avgValue ? rm(N.avgValue) : "—",
                  rm(N.mo ? N.mo.actual : null),
                ]}
              />
            </div>
          ) : <div style={{ padding: 24, textAlign: "center", color: C.sub, fontSize: 13.5 }}>本月还没有逐日 Sales 上传。</div>}
          <p style={{ fontSize: 12, color: C.sub, margin: "9px 0 0", lineHeight: 1.55 }}>
            New Lead 业绩 = First Course（新客第一个疗程），客单价 = 业绩 ÷ 成交数。
          </p>
        </Card>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- 第 3 页 */
function Page3({ S, P, N, prog, cur, history, goal, daysInMonth }) {
  const sev = prog && prog.projRate != null
    ? (prog.projRate >= 0.95 ? "good" : prog.projRate >= 0.8 ? "warn" : "crit")
    : null;
  const stripe = sev === "good" ? GOOD : sev === "warn" ? WARN : sev === "crit" ? CRIT : C.sub;

  const rows = [
    ["Lead", P.leads, N.leads, int, "整月目标"],
    ["Appointment", P.appt, N.appt, int, "整月目标"],
    ["Enroll 成交", P.enroll, N.enrol, int, "实际来自逐日 Sales"],
    ["New Lead 业绩", P.newSales, N.newLeadSales, (v) => rm(v), "First Course"],
    ["广告预算", P.budget, N.spend, (v) => rm(v), "已花"],
  ];

  const alerts = [];
  if (prog) {
    if (prog.paceRate < 0.85) alerts.push(["crit", "进度落后",
      `到今天应该有 ${int(prog.paceTarget)} 个 lead，实际 ${int(N.leads)} 个，只到 ${pct(prog.paceRate)}。`,
      prog.remaining > 0
        ? `剩 ${prog.remaining} 天要补 ${int(prog.need)} 个，等于每天 ${(prog.need / prog.remaining).toFixed(1)} 个 — 现在每天才 ${(N.leads / prog.elapsed).toFixed(1)} 个。`
        : "本月已结束，把差距带进下个月的目标。"]);
    else if (prog.paceRate < 1) alerts.push(["warn", "进度略慢",
      `到今天应有 ${int(prog.paceTarget)} 个，实际 ${int(N.leads)} 个（${pct(prog.paceRate)}）。`,
      "还追得上，维持现有投放，盯紧未来三天。"]);
    else alerts.push(["good", "进度领先",
      `到今天应有 ${int(prog.paceTarget)} 个，实际 ${int(N.leads)} 个（${pct(prog.paceRate)}）。`, "维持现状即可。"]);
  }
  if (N.cplActual) {
    const over = N.cplActual / S.cpl - 1;
    if (over > 0.2) alerts.push(["crit", "CPL 严重超标",
      `实际 ${rm(N.cplActual, 2)}，比目标 ${rm(S.cpl)} 贵 ${pct(over)}。同样的钱只买到目标数量的 ${pct(1 / (1 + over))}。`,
      "先砍掉最贵的广告组。现在加预算只会按这个价买更多贵 lead。"]);
    else if (over > 0) alerts.push(["warn", "CPL 偏高",
      `实际 ${rm(N.cplActual, 2)}，比目标 ${rm(S.cpl)} 贵 ${pct(over)}。`, "盯住表现最差的广告组，暂时不用动整体预算。"]);
    else alerts.push(["good", "CPL 达标",
      `实际 ${rm(N.cplActual, 2)}，比目标 ${rm(S.cpl)} 平 ${pct(-over)}。`,
      "这是加预算的窗口 — 成本在目标内，放量的边际回报最好。"]);
  }
  if (N.roasActual && P.roas) {
    const r = N.roasActual / P.roas;
    if (r < 0.8) alerts.push(["crit", "ROAS 低过目标",
      `实际 ${N.roasActual.toFixed(1)}× vs 目标 ${P.roas.toFixed(1)}×，只到 ${pct(r)}。`,
      "不是广告太贵就是客单价／成交率低过假设 — 先看第 2 页的实际客单价。"]);
  }
  const weak = N.branchLead.filter((b) => b.leads >= 10 && b.appt / b.leads < 0.3);
  if (weak.length) alerts.push(["crit", "分店约不到人",
    weak.slice(0, 3).map((b) => `${b.branch}（${pct(b.appt / b.leads)}）`).join("、") + (weak.length > 3 ? ` 等 ${weak.length} 间` : "") + " 的约到率低过 30%。",
    "Lead 已经买回来了，卡在跟进这一关 — 查这几间的回复速度同话术，比加广告预算划算得多。"]);
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
            {sev === "good" ? "在轨道上" : sev === "warn" ? "偏离目标" : sev === "crit" ? "严重落后" : "等数据"}
          </div>
          {prog ? (
            <>
              <p style={{ fontSize: 17, lineHeight: 1.45, margin: 0, textWrap: "balance" }}>
                照现在每日 <b style={{ fontFamily: "ui-monospace, monospace" }}>{(N.leads / prog.elapsed).toFixed(1)}</b> 个 lead 的速度，
                月底会拿到 <b style={{ fontFamily: "ui-monospace, monospace" }}>{int(prog.proj)}</b> 个，
                {P.leads - prog.proj > 0
                  ? <>差目标 <b style={{ fontFamily: "ui-monospace, monospace" }}>{int(P.leads - prog.proj)}</b> 个。</>
                  : <>比目标多 <b style={{ fontFamily: "ui-monospace, monospace" }}>{int(prog.proj - P.leads)}</b> 个。</>}
              </p>
              <p style={{ margin: "8px 0 0", fontSize: 13.5, color: C.sub }}>
                {[
                  prog.remaining > 0 && prog.need > 0
                    ? `剩 ${prog.remaining} 天要补 ${int(prog.need)} 个，等于每天 ${(prog.need / prog.remaining).toFixed(1)} 个`
                    : prog.remaining === 0 ? "本月已跑完" : null,
                  prog.remaining > 0 && prog.need > 0 && N.cplActual
                    ? `按实际 CPL ${rm(N.cplActual, 2)} 算，每天要花 ${rm((prog.need * N.cplActual) / prog.remaining)}`
                    : null,
                ].filter(Boolean).join(" · ")}
              </p>
            </>
          ) : <p style={{ fontSize: 15, margin: 0, color: C.sub }}>本月还没有每日 Lead 数据。</p>}
        </div>
      </div>

      <div>
        <Blk note={`Lead / Appointment 到 ${cur.split(" ")[0]} ${N.lastDay} 号`}>目标 vs 现在</Blk>
        <Card>
          <div style={{ overflowX: "auto" }}>
            <Table
              head={["指标", "目标", "现在", "差距"]}
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
                  "Cost Per Lead", rm(S.cpl), rm(N.cplActual, 2),
                  <Pill key="p" tone={N.cplActual <= S.cpl ? "good" : N.cplActual <= S.cpl * 1.2 ? "warn" : "crit"}>
                    {(N.cplActual >= S.cpl ? "+" : "−") + pct(Math.abs(N.cplActual / S.cpl - 1))}
                  </Pill>,
                ]] : []),
                ...(N.roasActual && P.roas ? [[
                  "ROAS", P.roas.toFixed(1) + "×", N.roasActual.toFixed(1) + "×",
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
          <Blk note="累积 Lead vs 达标应有的速度">进度追踪</Blk>
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
                    formatter={(v, k) => [int(v), k === "cum" ? "累积实际" : "达标节奏"]} />
                  <ReferenceLine y={P.leads} stroke={C.clay} strokeDasharray="6 5"
                    label={{ value: `目标 ${int(P.leads)}`, position: "insideTopRight", fill: C.clay, fontSize: 11 }} />
                  <Line type="monotone" dataKey="pace" stroke={C.sub} strokeWidth={2} strokeDasharray="6 5" dot={false} name="pace" />
                  <Line type="monotone" dataKey="cum" stroke={C.brown} strokeWidth={2.5} dot={false} name="cum" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", gap: 15, flexWrap: "wrap", fontSize: 12.5, color: C.sub, marginTop: 8 }}>
              <span><i style={{ display: "inline-block", width: 15, height: 3, borderRadius: 2, background: C.brown, marginRight: 6, verticalAlign: "middle" }} />累积实际 Lead</span>
              <span><i style={{ display: "inline-block", width: 15, borderTop: `2px dashed ${C.sub}`, marginRight: 6, verticalAlign: "middle" }} />达标节奏线</span>
              <span><i style={{ display: "inline-block", width: 15, borderTop: `2px dashed ${C.clay}`, marginRight: 6, verticalAlign: "middle" }} />整月目标 {int(P.leads)}</span>
            </div>
          </Card>
        </div>
      )}

      {alerts.length > 0 && (
        <div>
          <Blk note="按严重程度排序">预警</Blk>
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
                  <div style={{ marginTop: 7, fontSize: 13 }}><b>建议</b> · {action}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {history.length > 1 && (
        <>
          <div>
            <Blk note="First Course">历史月份 New Lead 业绩</Blk>
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
                      formatter={(v) => [rm(v), "New Lead 业绩"]} />
                    <Bar dataKey="newLead" fill={C.brown} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div>
            <Blk note="New Lead 业绩 ÷ 广告花费">实际 ROAS 追踪</Blk>
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
                        label={{ value: `目标 ${P.roas.toFixed(1)}×`, position: "insideTopRight", fill: C.clay, fontSize: 11 }} />
                    )}
                    <Line type="monotone" dataKey="roas" stroke={C.sage} strokeWidth={2.5} dot={{ r: 3, fill: C.sage }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <Table
                  head={["月份", "New Lead 业绩", "广告花费", "ROAS"]}
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
        <b>Lead / Appointment</b> · 「2026 目标与现状表」的 Lead Report 分页，逐店逐日加总。<br />
        <b>New Lead 业绩 · 成交 · 客单价</b> · 逐日 Sales 上传的 First Course / Enrolment（每月取最后一天的 MTD）。<br />
        <b>广告花费</b> · Ads Report 月度分页，含 6% SST。<br />
        <b>目标</b> · 第 1 页的拉杆，只存在你的浏览器，不会写回任何表。
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
