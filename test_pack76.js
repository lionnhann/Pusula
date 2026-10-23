// Paket 76: profil durumu
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p76-" + process.pid + "-" + Date.now() + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0"; process.env.EXPIRE_TICK_MS = "3600000";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const { server, db } = require("./server.js");
server.listen(0, async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (p, b, tok) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
  const so = (p, b, t) => call("/api/social/" + p, b, t);
  try {
    let seq = 0;
    const reg = async (h) => { seq++; const x = await call("/api/register", { email: "u" + seq + "@x.com", password: "kaplan-gece-52", name: h }); await so("profile", { handle: h }, x.token); return x.token; };
    const uid = h => db.prepare("SELECT user_id FROM profiles WHERE handle=?").get(h).user_id;


    const A = await reg("ali"), B = await reg("bora");
    ok((await call("/api/social/status_set", { kind: "busy" })).s === 401, "auth");
    ok((await so("me", {}, A)).status === null, "no status by default");
    ok((await so("status_set", { kind: "nope" }, A)).error === "bad_status", "bad kind");
    ok((await so("status_set", { kind: "busy", hours: 3 }, A)).error === "bad_duration", "bad duration");
    let r = await so("status_set", { kind: "vacation", text: "  Tatildeyim <b>!</b> " + "x".repeat(60), hours: 24 }, A);
    ok(r.ok && r.status.kind === "vacation" && r.status.text.length <= 40 && r.status.until > Date.now() + 23 * 3600e3, "set with duration: " + JSON.stringify(r.status));
    ok((await so("me", {}, A)).status.kind === "vacation", "me has status");
    ok((await so("user", { handle: "ali" }, B)).status.kind === "vacation", "others see status");
    r = await so("status_set", { kind: "avail" }, A); ok(r.status.kind === "avail" && r.status.until === 0, "no expiry = until 0, replaced");
    await so("status_set", { kind: "focus", hours: 1 }, A); db.prepare("UPDATE user_status SET until=? WHERE user_id=?").run(Date.now() - 1000, uid("ali"));
    ok((await so("user", { handle: "ali" }, B)).status === null, "expired hidden");
    ok(!db.prepare("SELECT 1 FROM user_status WHERE user_id=?").get(uid("ali")), "expired row cleaned");
    await so("status_set", { kind: "busy", hours: 4 }, A); r = await so("status_set", { clear: true }, A); ok(r.ok && r.status === null && (await so("me", {}, A)).status === null, "cleared");
    const html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
    ["status_set", "data-stt", "soStatusSheet", "bzBirthdays", "bzPrices", "bdsave", "plsave", "o.bds=", "o.pls="].forEach(k => ok(html.includes(k), "client has " + k));
    console.log("pack76 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
