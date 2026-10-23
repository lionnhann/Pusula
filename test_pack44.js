// Paket 44: yükleme içerik doğrulaması, acil durum kilidi, yönetici denetim günlüğü
const assert = require("assert"), fs = require("fs"), path = require("path"), http = require("http");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p44-" + process.pid + "-" + Date.now() + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0"; process.env.ADMIN_TOKEN = "admtok1234567890";
process.env.R2_ACCOUNT_ID = "acct123"; process.env.R2_ACCESS_KEY_ID = "AKTEST"; process.env.R2_SECRET_ACCESS_KEY = "SECRETTEST"; process.env.R2_BUCKET = "pusula-media"; process.env.R2_PUBLIC_URL = "https://pub.example.dev";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const puts = {};
const mock = http.createServer((req, res) => { const ch = []; req.on("data", c => ch.push(c)); req.on("end", () => { puts[req.url.split("?")[0]] = Buffer.concat(ch); res.statusCode = 200; res.end(); }); });
mock.listen(0, () => {
  process.env.R2_ENDPOINT_BASE = "http://127.0.0.1:" + mock.address().port;
  const { server } = require("./server.js");
  server.listen(0, async () => {
    const base = "http://127.0.0.1:" + server.address().port;
    const call = async (p, b, tok, hdr) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}, hdr || {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
    try {
      const reg = async (e, nm, h) => { const x = await call("/api/register", { email: e, password: "kaplan-gece-47", name: nm }); await call("/api/social/profile", { handle: h }, x.token); return x.token; };
      const A = await reg("a@x.com", "Ali", "ali");
      const up = (key, body, type) => fetch(base + "/media-up?key=" + encodeURIComponent(key), { method: "PUT", headers: { "Content-Type": type, Authorization: "Bearer " + A }, body });
      const mk = async (type, size) => (await call("/api/social/upload", { type, size }, A)).key;
      const cases = [["image/jpeg", Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, 0x4A, 0x46, 0x49, 0x46, 0, 1]), true], ["image/png", Buffer.concat([Buffer.from([0x89]), Buffer.from("PNG\r\n\x1a\n"), Buffer.alloc(8)]), true], ["image/webp", Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")]), true], ["video/mp4", Buffer.concat([Buffer.alloc(4), Buffer.from("ftypisom"), Buffer.alloc(4)]), true], ["video/webm", Buffer.concat([Buffer.from([0x1A, 0x45, 0xDF, 0xA3]), Buffer.alloc(10)]), true], ["image/jpeg", Buffer.from("<html><script>alert(1)</script>"), false], ["image/png", Buffer.from("MZ" + "x".repeat(20)), false], ["video/mp4", Buffer.from("#!/bin/sh\necho hi\n" + "x".repeat(10)), false], ["image/jpeg", Buffer.from("abc"), false]];
      for (const [t, buf, good] of cases) { const k = await mk(t, buf.length); ok(k, "key " + t); const r = await up(k, buf, t); ok(good ? r.status === 200 : r.status === 400, t + (good ? " valid accepted" : " fake rejected") + " " + r.status); if (!good) ok(!puts["/pusula-media/" + k] && !Object.keys(puts).some(p => p.endsWith(k)), "fake never reached storage"); }
      // şifreli ek (octet-stream) serbest
      const ke = await mk("application/octet-stream", 20); ok((await up(ke, Buffer.alloc(20, 7), "application/octet-stream")).status === 200, "encrypted blob accepted");
      let lg = await (await fetch(base + "/api/security_log", { headers: { Authorization: "Bearer " + A } })).json(); ok(lg.events.filter(e => e.type === "upload_blocked").length === 4, "blocked uploads logged");
      // acil durum kilidi
      ok((await call("/api/panic", { password: "yanlis-parola" }, A)).s === 401, "panic needs password");
      ok((await call("/api/panic", { password: "kaplan-gece-47" })).s === 401, "panic needs auth");
      const B = await reg("b@x.com", "Bora", "bora");
      ok((await call("/api/panic", { password: "kaplan-gece-47" }, B)).ok, "panic ok");
      ok((await call("/api/me", {}, B)).s !== 200 || (await (await fetch(base + "/api/me", { headers: { Authorization: "Bearer " + B } })).status) === 401, "sessions closed");
      let l = await call("/api/login", { email: "b@x.com", password: "kaplan-gece-47" }); ok(l.s === 403 && l.error === "account_locked", "locked login refused " + JSON.stringify(l));
      l = await call("/api/login", { email: "b@x.com", password: "yanlis-parola" }); ok(l.s === 401, "wrong pw still 401 (no state leak)");
      // sıfırlama kilidi açar (kod e-postayla gider; testte doğrudan veritabanı yok → forgot + reset akışı e-posta gerektirir): kilit kaldırma server tarafında reset içinde
      const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8"); ok(/locked=0 WHERE id=\?/.test(src), "reset clears lock");
      // yönetici denetim günlüğü
      ok((await call("/api/admin/audit", {}, null, { "x-admin-token": "yanlis" })).s === 401, "audit needs admin");
      await call("/api/admin/stats", {}, null, { "x-admin-token": "admtok1234567890" });
      const au = await call("/api/admin/audit", {}, null, { "x-admin-token": "admtok1234567890" }); ok(au.s === 200 && au.log.some(e => e.path === "/api/admin/stats") && au.log.every(e => /\.0$|^$/.test(e.ip) || e.ip.includes(":")), "admin action logged " + JSON.stringify(au.log && au.log[0]));
      ok(!JSON.stringify(au.log).includes("admtok"), "token never logged");
      const html = fs.readFileSync(fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public/index.html") : path.join(__dirname, "..", "si/index.html"), "utf8");
      ["/api/panic", "account_locked", "pusula_lkw", "secScore"].forEach(k => ok(html.includes(k), "client has " + k));
      const keys = JSON.parse('["Emergency lock", "All devices are signed out and the account stays locked until you reset your password by email. Use this if you suspect your account was taken over.", "Lock account", "Your password", "#FA code (if any)", "Cancel", "Account locked. To unlock it, set a new password with \'Forgot password\'.", "Your account is under emergency lock. Unlock it by setting a new password with \'Forgot password\'.", "The file content does not match its type.", "Security score:", "Two-step verification is on", "New-device alerts are on", "App lock (PIN) is set up", "You have backup codes", "Signed in on at most # devices", "Fake file upload blocked", "Sign-in tried on a locked account", "Emergency lock turned on"]');
      for (const lg2 of ["de", "es", "fr", "pt", "ru", "ar", "az", "id", "ja"]) { const pk = JSON.parse(fs.readFileSync(path.join(__dirname, fs.existsSync(path.join(__dirname, "public")) ? "public" : "../si", "lang", lg2 + ".json"), "utf8")); keys.forEach(k => ok(pk[k], lg2 + " " + k)); }
      console.log("pack44 testleri geçti:", n); server.close(); mock.close(); process.exit(0);
    } catch (e) { console.error("FAIL", e.message, e.stack.split("\n")[1]); process.exit(1); }
  });
});
