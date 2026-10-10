// Paket 27: haftalık özet e-postası. node test_pack27.js
const http = require("http"), assert = require("assert"), path = require("path"), os = require("os");
const mails = [];
const up = http.createServer((req, res) => { let b = ""; req.on("data", c => b += c); req.on("end", () => { mails.push(JSON.parse(b)); res.setHeader("content-type", "application/json"); res.end("{}"); }); });
up.listen(0, () => {
  process.env.DB_PATH = path.join(os.tmpdir(), "pusula-p27-" + process.pid + ".db"); process.env.TRUST_PROXY = "1"; process.env.REQUIRE_VERIFY = "0";
  process.env.BREVO_API_KEY = "BK"; process.env.BREVO_API_URL = "http://127.0.0.1:" + up.address().port + "/v3/smtp/email"; process.env.MAIL_FROM = "Pusula <d@example.com>";
  let n = 0; const ok = (c, m) => { assert(c, m); n++; };
  const { server, digestRun } = require("./server.js");
  server.listen(0, async () => {
    const base = "http://127.0.0.1:" + server.address().port; let xf = 0;
    const call = async (p, b, tok, m) => { const r = await fetch(base + p, { method: m || "POST", headers: Object.assign({ "Content-Type": "application/json", "X-Forwarded-For": "10.3.0." + (++xf) }, tok ? { Authorization: "Bearer " + tok } : {}), body: m === "GET" ? undefined : JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
    const wait = () => new Promise(z => setTimeout(z, 200));
    try {
      const mk = async (e, name) => (await call("/api/register", { email: e, password: "parola-123", name })).token;
      const A = await mk("a@x.com", "Ali"), B = await mk("b@x.com", "Bora");
      // Pazartesi 2026-10-12 06:00 UTC; Ali Türkiye (UTC+3 -> getTimezoneOffset=-180) => yerelde 09:00
      const mon = Date.UTC(2026, 9, 12, 6, 0);
      const data = { tasks: [{ id: "1", text: "Gecikmiş iş", due: "2026-10-08", done: false }, { id: "2", text: "Bu hafta iş", due: "2026-10-14", done: false }, { id: "3", text: "Bitti", due: "2026-10-06", done: true, doneAt: "2026-10-07" }, { id: "4", text: "Eski bitti", due: "2026-09-01", done: true, doneAt: "2026-09-02" }], cash: [{ kind: "in", amt: 1000, date: "2026-10-08" }, { kind: "out", amt: 250.5, date: "2026-10-09" }, { kind: "in", amt: 99, date: "2026-09-01" }] };
      let r = await call("/api/data", { data }, A, "PUT"); ok(r.ok, "data saved");
      await call("/api/data", { data: { tasks: [], cash: [] } }, B, "PUT");
      r = await call("/api/digest", null, A, "GET"); ok(r.on === false, "default off");
      ok(await digestRun(mon) === 0, "nobody opted in");
      r = await call("/api/digest", { on: true, tz: -180, lang: "de" }, A); ok(r.ok && r.on, "opt in");
      await call("/api/digest", { on: true, tz: -180 }, B);
      r = await call("/api/digest", null, A, "GET"); ok(r.on === true, "on persisted");
      ok(await digestRun(Date.UTC(2026, 9, 13, 6, 0)) === 0, "not monday");
      ok(await digestRun(Date.UTC(2026, 9, 12, 4, 0)) === 0, "monday but before 08:00 local (07:00)");
      const sent = await digestRun(mon); await wait(); ok(sent === 2 && mails.length === 2, "two digests sent: " + sent);
      const m = mails.find(x => x.to[0].email === "a@x.com"); ok(m && m.subject.includes("Wochenübersicht"), "german subject");
      ok(m.textContent.includes("1 erledigte Aufgaben") && m.textContent.includes("Einnahmen 1000") && m.textContent.includes("Ausgaben 250.5") && m.textContent.includes("netto 749.5"), "numbers: " + m.textContent);
      ok(m.textContent.includes("Überfällige Aufgaben: 1") && m.textContent.includes("1 fällige Aufgaben") && m.textContent.includes("• Gecikmiş iş"), "tasks listed");
      ok(await digestRun(mon + 3600e3) === 0, "once per monday");
      ok(await digestRun(Date.UTC(2026, 9, 19, 6, 0)) === 2, "next monday again");
      await wait(); mails.length = 0;
      await call("/api/digest", { on: false }, A); ok(await digestRun(Date.UTC(2026, 9, 26, 6, 0)) === 1, "opt out respected");
      r = await call("/api/digest", {}, null); ok(r.s === 401, "auth needed");
      // New York (UTC-4 => offset 240): Monday 12:00 UTC = 08:00 local
      await call("/api/digest", { on: true, tz: 240, lang: "xx" }, A);
      ok(await digestRun(Date.UTC(2026, 10, 2, 11, 0)) === 1, "only Bora (UTC+3) at 11:00 UTC; Ali (UTC-4) still 07:00");
      ok(await digestRun(Date.UTC(2026, 10, 2, 12, 0)) === 1, "Ali at 08:00 New York time; unknown lang falls back");
      console.log("paket 27 testleri geçti:", n); server.close(); up.close(); process.exit(0);
    } catch (e) { console.error("FAIL", e.message); process.exit(1); }
  });
});
