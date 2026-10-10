// E-posta testi (Brevo, sahte servisle): kayıtta doğrulama istenmez, "şifremi unuttum" kodu gelir. node test_mail.js
const http = require("http"), assert = require("assert");
const mails = [];
const up = http.createServer((req, res) => { let b = ""; req.on("data", c => b += c); req.on("end", () => { mails.push({ key: req.headers["api-key"], body: JSON.parse(b) }); res.setHeader("content-type", "application/json"); res.end("{}"); }); });
up.listen(0, () => {
  process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-mail-" + process.pid + ".db");
  process.env.TRUST_PROXY = "0"; process.env.BREVO_API_KEY = "BK"; process.env.BREVO_API_URL = "http://127.0.0.1:" + up.address().port + "/v3/smtp/email";
  process.env.MAIL_FROM = "Pusula <destek@example.com>"; process.env.REQUIRE_VERIFY = "0";
  const { server } = require("./server.js");
  server.listen(0, async () => {
    const base = "http://127.0.0.1:" + server.address().port; let n = 0; const ok = (c, m) => { assert(c, m); n++; };
    const call = async (p, b) => { const r = await fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
    try {
      const h = await (await fetch(base + "/api/health")).json(); ok(h.mail === true && h.verify === false, "mail on, verify off");
      let r = await call("/api/register", { email: "u@ornek.com", password: "parola-123", name: "U" }); ok(r.token && !r.verify, "register without verification");
      ok(mails.length === 0, "no mail on register");
      r = await call("/api/forgot", { email: "u@ornek.com" }); ok(r.s === 200, "forgot ok");
      await new Promise(z => setTimeout(z, 300));
      ok(mails.length === 1 && mails[0].key === "BK", "brevo called with key");
      const m = mails[0].body; ok(m.sender.email === "destek@example.com" && m.sender.name === "Pusula" && m.to[0].email === "u@ornek.com", "sender/to");
      const code = (m.textContent.match(/kodun: (\d{6})/) || [])[1]; ok(code, "code in mail");
      r = await call("/api/reset", { email: "u@ornek.com", code: "000000", password: "yeni-parola-1" }); ok(r.s === 400, "wrong code rejected");
      r = await call("/api/reset", { email: "u@ornek.com", code, password: "yeni-parola-1" }); ok(r.s === 200, "reset with code");
      r = await call("/api/login", { email: "u@ornek.com", password: "yeni-parola-1" }); ok(r.token, "login with new password");
      r = await call("/api/forgot", { email: "yok@ornek.com" }); ok(r.s === 200, "unknown email gives same answer");
      // 2FA açıkken parola sıfırlama TOTP olmadan tamamlanamaz (e-posta kodu yanmaz)
      {
        const crypto = require("crypto"), B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        const dec = s => { let bits = 0, v = 0; const o = []; for (const c of s) { v = (v << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { o.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); };
        const tc = (sec, ms) => { const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(Math.floor(ms / 30000))); const h = crypto.createHmac("sha1", dec(sec)).update(c).digest(), o = h[19] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, "0"); };
        const authed = async (p, b, tok) => { const x = await fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: JSON.stringify(b) }); const j = await x.json().catch(() => ({})); j.s = x.status; return j; };
        r = await call("/api/login", { email: "u@ornek.com", password: "yeni-parola-1" }); const tk = r.token;
        r = await authed("/api/2fa/setup", {}, tk); const S = r.secret; r = await authed("/api/2fa/enable", { code: tc(S, Date.now()) }, tk); ok(r.ok, "2fa on");
        mails.length = 0; await call("/api/forgot", { email: "u@ornek.com" }); await new Promise(z => setTimeout(z, 300));
        const c2 = (mails[0].body.textContent.match(/kodun: (\d{6})/) || [])[1];
        r = await call("/api/reset", { email: "u@ornek.com", code: c2, password: "baska-parola-9" }); ok(r.s === 401 && r.error === "totp_required", "reset needs 2fa code");
        r = await call("/api/reset", { email: "u@ornek.com", code: c2, password: "baska-parola-9", totp: "000000" }); ok(r.s === 401 && r.error === "bad_totp", "reset rejects wrong 2fa");
        r = await call("/api/reset", { email: "u@ornek.com", code: "000000", password: "baska-parola-9", totp: tc(S, Date.now() + 30000) }); ok(r.s === 400, "wrong email code still rejected");
        r = await call("/api/reset", { email: "u@ornek.com", code: c2, password: "baska-parola-9", totp: tc(S, Date.now() + 30000) }); ok(r.s === 200 && r.token, "reset succeeds with email code + 2fa");
      }
      console.log("e-posta testleri geçti:", n); up.close(); server.close(); process.exit(0);
    } catch (e) { console.error("FAIL", e.message); process.exit(1); }
  });
});
