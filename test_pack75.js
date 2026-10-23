// Paket 75: dondurulmuş hesap engeli
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p75-" + process.pid + "-" + Date.now() + ".db");
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
    await so("freeze_set", { on: true }, A);
    for (const [a, b] of [["post", { kind: "text", text: "x" }], ["comment", { id: "1", text: "x" }], ["like", { id: "1", on: true }], ["follow", { handle: "bora", on: true }], ["send", { handle: "bora", text: "x" }], ["story_new", {}], ["repost", { id: "1" }]]) {
      const r = await so(a, b, A); ok(r.s === 403 && r.error === "frozen", a + " blocked while frozen: " + JSON.stringify(r));
    }
    ok((await so("me", {}, A)).frozen === true, "read still works");
    ok((await so("notifs", {}, A)).s === 200, "notifs readable");
    ok((await so("freeze_set", { on: false }, A)).frozen === false, "can unfreeze");
    const p = await so("post", { kind: "text", text: "tekrar buradayım" }, A); ok(p.s === 200, "can post after unfreeze: " + JSON.stringify(p).slice(0, 100));
    ok((await so("follow", { handle: "bora", on: true }, A)).s === 200, "can follow after unfreeze");
    const html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8"); ok(html.includes("frozen:"), "client SOERR frozen");
    console.log("pack75 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
