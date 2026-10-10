// Paket 19: 2FA anahtarı şifreli saklanır, aktif oturumlar. node test_pack19.js
const assert = require("assert"), path = require("path"), os = require("os");
const DB = path.join(os.tmpdir(), "pusula-p19-" + process.pid + ".db");
process.env.DB_PATH = DB; process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const { server } = require("./server.js");
server.listen(0, async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (p, b, tok, m, ua) => { const r = await fetch(base + p, { method: m || "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}, ua ? { "User-Agent": ua } : {}), body: m === "GET" ? undefined : JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
  try {
    const R = await call("/api/register", { email: "a@x.com", password: "parola-123", name: "Ali" }, null, null, "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36"); const T = R.token;
    const L2 = await call("/api/login", { email: "a@x.com", password: "parola-123" }, null, null, "Mozilla/5.0 (Linux; Android 14) Chrome/120.0 Mobile Safari/537.36"); const T2 = L2.token;
    let r = await call("/api/sessions", null, T, "GET"); ok(r.sessions.length === 2, "two sessions");
    ok(r.sessions.filter(s => s.current).length === 1 && r.sessions.find(s => s.current).device === "Chrome · Windows", "current device parsed");
    const other = r.sessions.find(s => !s.current); ok(other.device === "Chrome · Android" && /^[0-9a-f]{16}$/.test(other.id), "other device parsed");
    ok(JSON.stringify(r).indexOf(T) < 0, "no raw tokens leaked");
    r = await call("/api/sessions/revoke", { id: r.sessions.find(s => s.current).id }, T); ok(r.s === 404, "cannot revoke own current session here");
    r = await call("/api/sessions/revoke", { id: "zz" }, T); ok(r.s === 400, "bad id");
    r = await call("/api/sessions/revoke", { id: other.id }, T); ok(r.ok, "revoke other");
    r = await call("/api/me", null, T2, "GET"); ok(r.s === 401, "revoked session is dead");
    r = await call("/api/sessions", null, T, "GET"); ok(r.sessions.length === 1, "one left");
    // başka kullanıcının oturumu iptal edilemez
    const B = await call("/api/register", { email: "b@x.com", password: "parola-123", name: "Bora" }); const sb = (await call("/api/sessions", null, B.token, "GET")).sessions[0];
    r = await call("/api/sessions/revoke", { id: sb.id }, T); ok(r.s === 404, "cannot revoke someone else's");
    // 2FA anahtarı şifreli
    r = await call("/api/2fa/setup", {}, T); const S = r.secret;
    const { DatabaseSync } = require("node:sqlite"); const d2 = new DatabaseSync(DB, { readOnly: true });
    const row = d2.prepare("SELECT secret FROM totp").get(); ok(row.secret.startsWith("v1:") && !row.secret.includes(S), "secret encrypted at rest");
    d2.close();
    console.log("paket 19 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
