// Paket 26: yeni cihazdan giriş uyarısı. node test_pack26.js
const http = require("http"), assert = require("assert"), path = require("path"), os = require("os");
const mails = [];
const up = http.createServer((req, res) => { let b = ""; req.on("data", c => b += c); req.on("end", () => { mails.push(JSON.parse(b)); res.setHeader("content-type", "application/json"); res.end("{}"); }); });
up.listen(0, () => {
  process.env.DB_PATH = path.join(os.tmpdir(), "pusula-p26-" + process.pid + ".db"); process.env.TRUST_PROXY = "1"; process.env.REQUIRE_VERIFY = "0";
  process.env.BREVO_API_KEY = "BK"; process.env.BREVO_API_URL = "http://127.0.0.1:" + up.address().port + "/v3/smtp/email"; process.env.MAIL_FROM = "Pusula <d@example.com>";
  let n = 0; const ok = (c, m) => { assert(c, m); n++; };
  const { server } = require("./server.js");
  server.listen(0, async () => {
    const base = "http://127.0.0.1:" + server.address().port; let xf = 0;
    const call = async (p, b, tok, hdr, m) => { const r = await fetch(base + p, { method: m || "POST", headers: Object.assign({ "Content-Type": "application/json", "X-Forwarded-For": "10.2.0." + (++xf) }, tok ? { Authorization: "Bearer " + tok } : {}, hdr || {}), body: m === "GET" ? undefined : JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
    const wait = () => new Promise(z => setTimeout(z, 250));
    const login = (ua, lang) => call("/api/login", { email: "a@x.com", password: "parola-123", lang }, null, { "User-Agent": ua });
    try {
      const reg = await call("/api/register", { email: "a@x.com", password: "parola-123", name: "Ali" }, null, { "User-Agent": "DeviceA" });
      await wait(); ok(reg.token && mails.length === 0, "no alert on register");
      await login("DeviceA"); await wait(); ok(mails.length === 0, "known device: no alert");
      await login("DeviceB"); await wait(); ok(mails.length === 1 && mails[0].textContent.includes("DeviceB") && /yeni bir cihaz/i.test(mails[0].subject), "new device alert (tr)");
      await login("DeviceB"); await wait(); ok(mails.length === 1, "same device again: no alert");
      mails.length = 0; await login("DeviceC", "de"); await wait(); ok(mails.length === 1 && mails[0].subject.includes("neuen Gerät"), "alert in german");
      mails.length = 0; await login("DeviceD", "ar"); await wait(); ok(mails.length === 1 && mails[0].textContent.includes("DeviceD"), "alert in arabic");
      const t = reg.token;
      let r = await call("/api/login_alerts", null, t, null, "GET"); ok(r.on === true, "default on");
      r = await call("/api/login_alerts", { on: false }, t); ok(r.ok && r.on === false, "turn off");
      r = await call("/api/login_alerts", null, t, null, "GET"); ok(r.on === false, "persisted off");
      mails.length = 0; await login("DeviceE"); await wait(); ok(mails.length === 0, "no alert when off");
      r = await call("/api/login_alerts", { on: true }, t); ok(r.on === true, "turn on");
      r = await call("/api/login_alerts", {}, null); ok(r.s === 401, "needs auth");
      console.log("paket 26 testleri geçti:", n); server.close(); up.close(); process.exit(0);
    } catch (e) { console.error("FAIL", e.message); process.exit(1); }
  });
});
