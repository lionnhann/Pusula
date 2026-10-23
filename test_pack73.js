// Paket 73: hesabı dondur
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p73-" + process.pid + "-" + Date.now() + ".db");
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


    const A = await reg("ali"), B = await reg("bora"), C = await reg("can");
    ok((await call("/api/social/freeze_set", { on: true })).s === 401, "auth");
    ok((await so("me", {}, A)).frozen === false, "not frozen by default");
    const pa = (await so("post", { kind: "text", text: "merhaba dünya" }, A)); ok(pa.post || pa.id || pa.s === 200, "post created " + JSON.stringify(pa).slice(0, 120));
    await so("follow", { handle: "ali", on: true }, B);
    ok((await so("search", { q: "ali" }, B)).users.length === 1, "found before");
    ok((await so("user", { handle: "ali" }, B)).profile.handle === "ali", "visible before");
    let f = (await so("feed", { mode: "all" }, B)); const cnt0 = JSON.stringify(f).includes("merhaba dünya"); ok(cnt0, "post in feed before");
    let r = await so("freeze_set", { on: true }, A); ok(r.ok && r.frozen === true, "frozen");
    ok((await so("me", {}, A)).frozen === true, "me.frozen");
    ok((await so("search", { q: "ali" }, B)).users.length === 0, "hidden from search");
    ok((await so("user", { handle: "ali" }, B)).s === 404, "profile 404 for others");
    ok((await so("user", { handle: "ali" }, A)).profile.handle === "ali", "own profile still works");
    f = (await so("feed", { mode: "all" }, B)); ok(!JSON.stringify(f).includes("merhaba dünya"), "post gone from feed");
    ok((await so("me", {}, A)).profile.handle === "ali", "owner still operates (not 403)");
    r = await so("freeze_set", { on: false }, A); ok(r.ok && r.frozen === false, "unfrozen");
    ok((await so("search", { q: "ali" }, B)).users.length === 1, "back in search");
    ok((await so("user", { handle: "ali" }, B)).profile.handle === "ali", "back visible");
    f = (await so("feed", { mode: "all" }, B)); ok(JSON.stringify(f).includes("merhaba dünya"), "post back in feed");
    // gerçek yasak hâlâ 403
    db.prepare("INSERT INTO bans(user_id,reason,created) VALUES(?,?,?)").run(db.prepare("SELECT user_id FROM profiles WHERE handle='can'").get().user_id, "x", Date.now());
    ok((await so("me", {}, C)).s === 403, "ban still 403");
    ok((await so("search", { q: "can" }, B)).users.length === 0, "banned hidden");
    const html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
    ["freeze_set", "data-frz", "bzBudget", "bzLoans", "bgsave", "lnsave", "lnpay", "o.bgs=", "o.lns="].forEach(k => ok(html.includes(k), "client has " + k));
    console.log("pack73 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
