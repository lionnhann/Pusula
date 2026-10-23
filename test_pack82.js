// Paket 82: son görülme
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p82-" + process.pid + "-" + Date.now() + ".db");
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
    const A = await reg("ali"), B = await reg("bora"), C = await reg("cem");
    ok((await call("/api/social/lastseen_set", { on: false })).s === 401, "auth");
    ok((await so("me", {}, A)).lastSeen === true, "default on");
    let r = await so("thread", { handle: "bora" }, A); ok(r.lastSeen > 0 && Math.abs(r.lastSeen - Date.now()) < 60e3, "peer last seen is recent: " + r.lastSeen);
    // oturum etkinliği ilerler
    db.prepare("UPDATE sessions SET last=? WHERE user_id=?").run(Date.now() - 3600e3, uid("bora"));
    r = await so("thread", { handle: "bora" }, A); ok(r.lastSeen > 0, "still reports");
    r = await so("lastseen_set", { on: false }, B); ok(r.ok && r.lastSeen === false, "bora turns off");
    ok((await so("me", {}, B)).lastSeen === false, "me reports off");
    ok((await so("thread", { handle: "bora" }, A)).lastSeen === 0, "hidden when peer off");
    ok((await so("thread", { handle: "ali" }, B)).lastSeen === 0, "reciprocal: bora cannot see ali either");
    await so("lastseen_set", { on: true }, B); await so("lastseen_set", { on: false }, A);
    ok((await so("thread", { handle: "bora" }, A)).lastSeen === 0, "hidden when I am off");
    await so("lastseen_set", { on: true }, A);
    ok((await so("thread", { handle: "bora" }, A)).lastSeen > 0, "visible again");
    ok(!db.prepare("SELECT 1 FROM lastseen_off").get(), "rows removed");
    // banned / blocked peers reveal nothing
    await so("block", { handle: "cem", on: true }, A);
    ok((await so("thread", { handle: "cem" }, A)).s === 404, "blocked thread not available");
    await so("block", { handle: "cem", on: false }, A);
    // expired sessions are ignored
    db.prepare("UPDATE sessions SET expires=? WHERE user_id=?").run(Date.now() - 1000, uid("cem"));
    ok((await so("thread", { handle: "cem" }, A)).lastSeen === 0, "expired sessions ignored");
    const html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
    ["lastseen_set", "data-lsn", "sot-ls", "data-cflt", "bzCart", "bzTax", "o.sls=", "o.txp="].forEach(k => ok(html.includes(k), "client has " + k));
    console.log("pack82 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
