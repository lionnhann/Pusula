// Paket 67: bahsedilenler akışı
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p67-" + process.pid + "-" + Date.now() + ".db");
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


    const A = await reg("ali"), B = await reg("bora"), C = await reg("can"), D = await reg("dara"), E = await reg("ece");
    ok((await call("/api/social/mentions_feed", {})).s === 401, "auth");
    ok((await so("mentions_feed", {}, A)).posts.length === 0, "empty at start");
    const P = async (t, tok) => (await so("post", { text: t, kind: "text" }, tok));
    await P("selam @ali nasılsın", B);
    await P("yanlış kişi @alix burada", C);
    await P("noktalı bitiş @ali.", D);
    await P("büyük harf @ALI deneme", E);
    await P("kendime @ali yazdım", A);
    await P("bu da @ali.can adında biri", C);
    let r = await so("mentions_feed", {}, A);
    const tx = r.posts.map(p => p.text).sort();
    ok(r.posts.length === 3, "3 matches: " + JSON.stringify(tx));
    ok(tx.some(t => t.includes("nasılsın")) && tx.some(t => t.includes("noktalı")) && tx.some(t => t.includes("büyük harf")), "right posts");
    ok(!tx.some(t => t.includes("@alix")) && !tx.some(t => t.includes("kendime")) && !tx.some(t => t.includes("ali.can")), "no false positives, no own posts");
    ok((await so("mentions_feed", {}, B)).posts.length === 0, "feed is personal");
    // engelleme
    await so("block", { handle: "bora", on: true }, A);
    r = await so("mentions_feed", {}, A); ok(r.posts.length === 2 && !r.posts.some(p => p.text.includes("nasılsın")), "blocked user hidden");
    await so("block", { handle: "bora", on: false }, A);
    ok((await so("mentions_feed", {}, A)).posts.length === 3, "unblocked back");
    // özel hesap
    await so("profile", { private: true }, D);
    ok((await so("mentions_feed", {}, A)).posts.length === 2, "private non-followed hidden");
    await so("profile", { private: false }, D);
    // sayfalama
    const old = (await so("mentions_feed", {}, A)).posts; const last = old[old.length - 1];
    const created = db.prepare("SELECT created FROM posts WHERE id=?").get(last.id).created;
    r = await so("mentions_feed", { before: created }, A); ok(r.posts.length === 0, "before cursor pages");
    for (let i = 0; i < 25; i++) await P("toplu " + i + " @ali", B);
    r = await so("mentions_feed", {}, A); ok(r.posts.length === 20, "page capped at 20: " + r.posts.length);
    const c2 = db.prepare("SELECT created FROM posts WHERE id=?").get(r.posts[19].id).created;
    r = await so("mentions_feed", { before: c2 }, A); ok(r.posts.length > 0 && r.posts.length <= 20, "second page");
    const html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
    ["mentions_feed", "data-sub=\"mentions\"", "bzStock", "bzFxCard", "stsell", "fxadd", "o.stk=", "o.fx="].forEach(k => ok(html.includes(k), "client has " + k));
    console.log("pack67 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
