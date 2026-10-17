/* =============================================================================
 * /cs —— 客服助手（GHL Lead 状态查询聊天）
 *
 * 客服打开 /cs?k=<CS_KEY> 就能用，不用登录。问题送到 /api/cs-chat，
 * Claude 用只读工具去 GHL（Sans sub-account）查对话、pipeline、tags。
 * 换掉 Vercel 的 CS_KEY 再部署 = 旧链接失效。
 * ========================================================================== */
import React, { useEffect, useRef, useState } from "react";

const C = {
  brown: "#552102", ink: "#3A2A1C", sub: "#8A7763",
  sand: "#F4EDE1", surface: "#FBF7F0", line: "#E7DCC9", clay: "#B5663F",
};

const KEY = (() => { try { return new URLSearchParams(location.search).get("k") || ""; } catch (e) { return ""; } })();
const STORE = "sans_cs_chat";

const SUGGEST = [
  "现在有哪些顾客需要回复？",
  "哪些顾客我们发了信息超过 24 小时还没回？",
  "今天新进来的 Lead 有哪些？",
  "Which leads need a reply right now?",
];

// 很小的 markdown：**粗体**、行首 - / • / 1. 列表、## 标题；其余照原样换行
function Md({ text }) {
  const inline = (s, k) => String(s).split(/\*\*/).map((p, i) => (i % 2 ? <b key={k + "-" + i}>{p}</b> : <span key={k + "-" + i}>{p}</span>));
  return (
    <div>
      {String(text).split("\n").map((ln, i) => {
        const h = ln.match(/^#{1,4}\s+(.*)/);
        if (h) return <div key={i} style={{ fontWeight: 700, marginTop: i ? 8 : 0 }}>{inline(h[1], i)}</div>;
        const li = ln.match(/^(\s*)([-•*]|\d+\.)\s+(.*)/);
        if (li) return (
          <div key={i} style={{ display: "flex", gap: 6, paddingLeft: li[1].length ? 14 : 0 }}>
            <span style={{ color: C.sub, flex: "none" }}>{/\d/.test(li[2]) ? li[2] : "•"}</span>
            <span>{inline(li[3], i)}</span>
          </div>
        );
        if (!ln.trim()) return <div key={i} style={{ height: 6 }} />;
        return <div key={i}>{inline(ln, i)}</div>;
      })}
    </div>
  );
}

function Copy({ text }) {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard?.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); }); }}
      style={{ border: "none", background: "transparent", color: C.sub, fontSize: 12, cursor: "pointer", padding: "4px 0 0" }}>
      {ok ? "已复制 ✓" : "复制"}
    </button>
  );
}

export default function CsApp() {
  const [chat, setChat] = useState(() => { try { return JSON.parse(sessionStorage.getItem(STORE) || "[]"); } catch (e) { return []; } });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const endRef = useRef(null);
  const taRef = useRef(null);

  useEffect(() => { try { sessionStorage.setItem(STORE, JSON.stringify(chat)); } catch (e) { /* 无痕模式 */ } }, [chat]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [chat, busy]);

  const send = async (content) => {
    if (busy || !content || !content.trim()) return;
    const next = [...chat, { role: "user", text: content.trim() }];
    setChat(next); setInput(""); setBusy(true); setErr("");
    if (taRef.current) taRef.current.style.height = "auto";
    try {
      const r = await fetch("/api/cs-chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ k: KEY, messages: next.map((m) => ({ role: m.role, content: m.text })) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || ("HTTP " + r.status));
      setChat((c) => [...c, { role: "assistant", text: j.text || "" }]);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!KEY) {
    return (
      <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: C.surface, color: C.ink, padding: 16, textAlign: "center" }}>
        <div>链接不完整，请向管理员索取客服助手链接。</div>
      </div>
    );
  }

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: C.surface, color: C.ink, fontFamily: "system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif" }}>
      <header style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${C.line}`, background: "#fff" }}>
        <div>
          <div style={{ fontWeight: 700, color: C.brown, fontSize: 16 }}>Sans 客服助手</div>
          <div style={{ fontSize: 12, color: C.sub }}>查 GHL 顾客状态 · 只能查看，不会发信息给顾客</div>
        </div>
        {chat.length > 0 && (
          <button onClick={() => { setChat([]); setErr(""); }} disabled={busy}
            style={{ border: `1px solid ${C.line}`, background: C.sand, color: C.ink, borderRadius: 8, padding: "6px 10px", fontSize: 12.5, cursor: "pointer" }}>新对话</button>
        )}
      </header>

      <main style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {chat.length === 0 && !busy && (
            <div style={{ marginTop: 24 }}>
              <div style={{ color: C.sub, fontSize: 14, marginBottom: 12 }}>可以问顾客现在的状态、谁需要回复、谁需要跟进。也可以直接打名字或电话。</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {SUGGEST.map((s) => (
                  <button key={s} onClick={() => send(s)}
                    style={{ border: `1px solid ${C.line}`, background: "#fff", color: C.ink, borderRadius: 999, padding: "8px 14px", fontSize: 13.5, cursor: "pointer", textAlign: "left" }}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {chat.map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: m.role === "user" ? "85%" : "100%" }}>
              <div style={{
                background: m.role === "user" ? C.brown : "#fff", color: m.role === "user" ? "#fff" : C.ink,
                border: m.role === "user" ? "none" : `1px solid ${C.line}`,
                borderRadius: 12, padding: "10px 14px", fontSize: 14, lineHeight: 1.6, overflowWrap: "anywhere",
                whiteSpace: m.role === "user" ? "pre-wrap" : "normal",
              }}>
                {m.role === "user" ? m.text : <Md text={m.text} />}
              </div>
              {m.role === "assistant" && <Copy text={m.text} />}
            </div>
          ))}
          {busy && <div style={{ color: C.sub, fontSize: 13 }}>正在查 GHL…（约 10–40 秒）</div>}
          {err && <div style={{ color: C.clay, fontSize: 13 }}>{err}</div>}
          <div ref={endRef} />
        </div>
      </main>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }}
        style={{ flex: "none", borderTop: `1px solid ${C.line}`, background: "#fff", padding: "10px 16px calc(10px + env(safe-area-inset-bottom))" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea ref={taRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)} disabled={busy}
            onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px"; }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input); } }}
            placeholder="问顾客状态、名字或电话…"
            style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.line}`, background: C.surface, color: C.ink, fontSize: 15, lineHeight: 1.5, outline: "none", resize: "none", maxHeight: 140 }} />
          <button type="submit" disabled={busy || !input.trim()}
            style={{ border: "none", background: C.brown, color: "#fff", borderRadius: 10, padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: (busy || !input.trim()) ? 0.5 : 1 }}>发送</button>
        </div>
      </form>
    </div>
  );
}
