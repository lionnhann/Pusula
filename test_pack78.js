// Paket 78: okundu bilgisi
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p78-" + process.pid + "-" + Date.now() + ".db");
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


    const E = require("./e2e_help.js")(call);
    const A = await reg("ali"), B = await reg("bora");
    await E.key(A, "ali"); await E.key(B, "bora");
    const send = (tok, h) => so("send", { handle: h, text: E.env(tok, h) }, tok);
    ok((await call("/api/social/receipts_set", { on: false })).s === 401, "auth");
    ok((await so("me", {}, A)).receipts === true, "default on");
    const m1 = (await send(A, "bora")).id; const m2 = (await send(A, "bora")).id;
    let r = await so("thread", { handle: "bora" }, A); ok(r.seen === 0 && r.receipts === true, "not seen before bora opens: " + r.seen);
    await so("thread", { handle: "ali" }, B);
    r = await so("thread", { handle: "bora" }, A); ok(r.seen === m2, "seen after bora opens: " + r.seen + " vs " + m2);
    const m3 = (await send(A, "bora")).id; r = await so("thread", { handle: "bora" }, A); ok(r.seen === m2 && r.seen < m3, "new message not yet seen");
    ok((await so("thread", { handle: "ali" }, B)).seen === 0, "bora has none of own sent msgs seen");
    r = await so("receipts_set", { on: false }, B); ok(r.ok && r.receipts === false, "bora turns off");
    ok((await so("me", {}, B)).receipts === false, "me.receipts false");
    await so("thread", { handle: "ali" }, B); r = await so("thread", { handle: "bora" }, A); ok(r.seen === 0, "hidden when peer receipts off (reciprocal)");
    ok((await so("thread", { handle: "ali" }, B)).receipts === false, "own flag reported");
    await so("receipts_set", { on: true }, B); await so("receipts_set", { on: false }, A);
    r = await so("thread", { handle: "bora" }, A); ok(r.seen === 0 && r.receipts === false, "hidden when my receipts off");
    await so("receipts_set", { on: true }, A); r = await so("thread", { handle: "bora" }, A); ok(r.seen === m3, "visible again: " + r.seen);
    ok(!db.prepare("SELECT 1 FROM receipts_off").get(), "rows removed");
    const html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
    ["receipts_set", "data-rcp", "sot-seen", "bzCategories", "bzChecklists", "ktsave", "tlrun", "o.tpl="].forEach(k => ok(html.includes(k), "client has " + k));
    console.log("pack78 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
