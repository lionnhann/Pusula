// Paket 43: güvenlik başlıkları, yaygın parola engeli, güvenlik günlüğü
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p43-" + process.pid + "-" + Date.now() + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const { server } = require("./server.js");
server.listen(0, async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (p, b, tok, method) => { const r = await fetch(base + p, { method: method || "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}), body: method === "GET" ? undefined : JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
  try {
    const h = await fetch(base + "/api/health"); 
    ok(h.headers.get("x-frame-options") === "DENY", "x-frame-options");
    ok(/frame-ancestors 'none'/.test(h.headers.get("content-security-policy") || ""), "csp frame-ancestors");
    ok(/microphone=\(self\)/.test(h.headers.get("permissions-policy") || ""), "permissions-policy");
    ok(h.headers.get("x-content-type-options") === "nosniff", "nosniff kept");
    ok(!h.headers.get("strict-transport-security"), "no HSTS on plain http without proto");
    const h2 = await fetch(base + "/api/health", { headers: { "x-forwarded-proto": "https" } }); ok(/max-age=31536000/.test(h2.headers.get("strict-transport-security") || ""), "HSTS when https");
    for (const bad of ["12345678", "password123", "AAAAAAAAAA", "87654321", "Parola123", "qwertyui", "1234567890"]) ok((await call("/api/register", { email: "w" + bad + "@x.com", password: bad, name: "W" })).error === "weak_password", "weak " + bad);
    const r = await call("/api/register", { email: "a@x.com", password: "kaplan-gece-47", name: "Ali" }); ok(r.token, "strong ok"); const T = r.token;
    ok((await call("/api/login", { email: "a@x.com", password: "kaplan-gece-47" })).token, "login");
    for (let i = 0; i < 3; i++) ok((await call("/api/login", { email: "a@x.com", password: "yanlis-parola" })).s === 401, "bad login " + i);
    let lg = await call("/api/security_log", null, T, "GET");
    ok(lg.s === 200 && lg.fails24 === 3, "fails24 " + lg.fails24);
    ok(lg.events.filter(e => e.type === "login_fail").length === 3 && lg.events.some(e => e.type === "login_ok"), "events recorded");
    ok(lg.events.every(e => !e.ip || /\.0$/.test(e.ip)), "ip masked " + JSON.stringify(lg.events[0]));
    ok((await call("/api/security_log", null, undefined, "GET")).s === 401, "needs auth");
    ok((await call("/api/password", { old: "kaplan-gece-47", password: "12345678" }, T)).error === "weak_password", "weak change refused");
    ok((await call("/api/password", { old: "kaplan-gece-47", password: "yeni-kaplan-91" }, T)).ok, "pw change");
    lg = await call("/api/security_log", null, T, "GET"); ok(lg.events[0].type === "pw_change", "pw_change logged");
    await call("/api/logout-all", {}, T); lg = await call("/api/security_log", null, T, "GET"); ok(lg.events[0].type === "logout_all", "logout_all logged");
    // başka kullanıcı kendi günlüğünü görür
    const r2 = await call("/api/register", { email: "b@x.com", password: "kaplan-gece-48", name: "Bora" }); lg = await call("/api/security_log", null, r2.token, "GET"); ok(lg.events.length === 0 && lg.fails24 === 0, "isolated per user");
    const html = fs.readFileSync(fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public/index.html") : path.join(__dirname, "..", "si/index.html"), "utf8");
    ["ses-log", "/api/security_log", "const SEC=", "çok yaygın bir parola"].forEach(k => ok(html.includes(k), "client has " + k));
    const keys = JSON.parse('["Security log", "Signed in", "Failed sign-in attempt", "Password changed", "Password reset", "Two-step verification turned on", "Two-step verification turned off", "Backup codes renewed", "Signed out of other devices", "A device was signed out", "Failed sign-in attempts in the last # hours:", "If you don\'t recognize them, change your password.", "No records yet."]');
    for (const lg2 of ["de", "es", "fr", "pt", "ru", "ar", "az", "id", "ja"]) { const pk = JSON.parse(fs.readFileSync(path.join(__dirname, fs.existsSync(path.join(__dirname, "public")) ? "public" : "../si", "lang", lg2 + ".json"), "utf8")); keys.forEach(k => ok(pk[k], lg2 + " " + k)); }
    console.log("pack43 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, e.stack.split("\n")[1]); process.exit(1); }
});
