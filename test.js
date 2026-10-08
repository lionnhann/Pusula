// Uçtan uca test: node test.js  (geçici veritabanıyla sunucuyu açar)
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-test-" + process.pid + ".db");
process.env.REQUIRE_VERIFY = "1"; process.env.TRUST_PROXY = "0";
const { server, db } = require("./server.js");
const assert = require("assert");
let logs = []; const ol = console.log; console.log = (...a) => { logs.push(a.join(" ")); };
server.listen(0, async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (m, p, b, t) => { const r = await fetch(base + p, { method: m, headers: { "Content-Type": "application/json", ...(t ? { Authorization: "Bearer " + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); let j = {}; try { j = await r.json(); } catch (e) {} return { s: r.status, ...j }; };
  const lastCode = () => { const l = logs.filter(x => /\b\d{6}\b/.test(x)).pop() || ""; return (l.match(/\b(\d{6})\b/) || [])[1]; };
  let n = 0; const ok = (c, m) => { assert(c, m); n++; };
  try {
    ok((await call("GET", "/api/health")).ok, "health");
    ok((await call("POST", "/api/register", { email: "bad", password: "12345678", name: "A" })).s === 400, "bad email");
    ok((await call("POST", "/api/register", { email: "a@b.co", password: "123", name: "A" })).error === "weak_password", "weak");
    let r = await call("POST", "/api/register", { email: "A@B.co", password: "parola-123", name: "Ali" });
    ok(r.verify && r.s === 200, "register→verify");
    ok((await call("POST", "/api/register", { email: "a@b.co", password: "parola-123", name: "Ali" })).s === 409, "dup");
    ok((await call("POST", "/api/login", { email: "a@b.co", password: "parola-123" })).error === "verify_required", "login blocked before verify");
    const code = lastCode(); ok(code, "code logged: " + logs.join("|"));
    ok((await call("POST", "/api/verify", { email: "a@b.co", code: "000000" })).s === 400, "bad code");
    r = await call("POST", "/api/verify", { email: "a@b.co", code }); ok(r.token && r.user.verified, "verify ok");
    let tok = r.token;
    ok((await call("GET", "/api/me", null, tok)).user.email === "a@b.co", "me");
    ok((await call("GET", "/api/me")).s === 401, "no token");
    ok((await call("GET", "/api/data", null, tok)).s === 404, "no data yet");
    ok((await call("PUT", "/api/data", { data: { tasks: [1, 2] } }, tok)).rev === 1, "put 1");
    r = await call("PUT", "/api/data", { data: { tasks: [1, 2, 3] } }, tok); ok(r.rev === 2, "put 2");
    r = await call("GET", "/api/data", null, tok); ok(r.data.tasks.length === 3 && r.rev === 2, "get");
    ok((await call("PUT", "/api/data", { data: [1] }, tok)).s === 400, "bad data");
    r = await call("POST", "/api/login", { email: "a@b.co", password: "parola-123" }); ok(r.token, "login"); const tok2 = r.token;
    ok((await call("POST", "/api/login", { email: "a@b.co", password: "yanlis" })).s === 401, "wrong pw");
    ok((await call("POST", "/api/password", { old: "yanlis", password: "yeni-parola-1" }, tok)).s === 401, "pw change wrong old");
    ok((await call("POST", "/api/password", { old: "parola-123", password: "yeni-parola-1" }, tok)).ok, "pw change");
    ok((await call("GET", "/api/me", null, tok2)).s === 401, "other sessions revoked");
    ok((await call("GET", "/api/me", null, tok)).user, "current session kept");
    await call("POST", "/api/forgot", { email: "a@b.co" }); const rc = lastCode();
    ok((await call("POST", "/api/forgot", { email: "yok@b.co" })).ok, "forgot unknown silent");
    ok((await call("POST", "/api/reset", { email: "a@b.co", code: rc, password: "sifirla-parola-9" })).token, "reset");
    ok((await call("GET", "/api/me", null, tok)).s === 401, "sessions revoked after reset");
    r = await call("POST", "/api/login", { email: "a@b.co", password: "sifirla-parola-9" }); ok(r.token, "login new pw"); tok = r.token;
    ok((await call("GET", "/api/data", null, tok)).data.tasks.length === 3, "data survives");
    ok((await call("POST", "/api/delete", { password: "x" }, tok)).s === 401, "delete wrong pw");
    ok((await call("POST", "/api/delete", { password: "sifirla-parola-9" }, tok)).ok, "delete");
    ok((await call("GET", "/api/me", null, tok)).s === 401, "gone");
    ok(db.prepare("SELECT COUNT(*) c FROM data").get().c === 0, "cascade");
    // kaba kuvvet kilidi
    await call("POST", "/api/register", { email: "c@d.co", password: "parola-123", name: "C" });
    let last; for (let i = 0; i < 6; i++) last = await call("POST", "/api/login", { email: "c@d.co", password: "x" + i });
    ok(last.s === 429 && last.error === "locked", "lockout");
    const home = await fetch(base + "/"); ok(home.status === 200, "static root");
    ol(`TAMAM: ${n} kontrol geçti`);
  } catch (e) { ol("HATA:", e.message); process.exitCode = 1; }
  server.close(); setTimeout(() => process.exit(), 200);
});
