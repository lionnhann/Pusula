// Paket 53: Anılar ("bu gün geçen yıllarda"). Yalnızca kendi, görünür, kalıcı gönderiler; doğru yıl etiketi.
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p50-" + process.pid + "-" + Date.now() + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0"; process.env.EXPIRE_TICK_MS = "3600000";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const { server, db } = require("./server.js");
server.listen(0, async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (p, b, tok) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
  const so = (p, b, t) => call("/api/social/" + p, b, t);
  try {
    const reg = async (e, nm, h) => { const x = await call("/api/register", { email: e, password: "kaplan-gece-50", name: nm }); await so("profile", { handle: h }, x.token); return x.token; };
    const A = await reg("a@x.com", "Ali", "ali"), B = await reg("b@x.com", "Bora", "bora");
    ok((await call("/api/social/memories", {})).s === 401, "needs auth");
    const loc = new Date(), y = loc.getUTCFullYear(), m = loc.getUTCMonth(), d = loc.getUTCDate();
    const at = k => Date.UTC(y - k, m, d, 12, 0, 0);
    const mk = async (tok, text, k) => { const r = await so("post", { kind: "text", text }, tok); ok(r.ok, "post " + text); if (k) db.prepare("UPDATE posts SET created=? WHERE id=?").run(at(k), r.id); return r.id; };
    const ks = [1, 2, 3].filter(k => new Date(Date.UTC(y - k, m, d)).getUTCMonth() === m);
    ok(ks.length >= 2, "years available");
    const p1 = await mk(A, "geçen yıl", ks[0]), p2 = await mk(A, "iki yıl önce", ks[1]), pToday = await mk(A, "bugün");
    const pOther = await mk(B, "başkasının", ks[0]);
    const arch = await mk(A, "arşivli", ks[0]); db.prepare("UPDATE posts SET archived=1 WHERE id=?").run(arch);
    const hid = await mk(A, "gizli", ks[0]); db.prepare("UPDATE posts SET hidden=1 WHERE id=?").run(hid);
    const com = await mk(A, "topluluk", ks[0]); db.prepare("UPDATE posts SET community='x' WHERE id=?").run(com);
    const sealed = await mk(A, "mühürlü", ks[0]); db.prepare("UPDATE posts SET capsule=? WHERE id=?").run(Date.now() + 3600e3, sealed);
    const open = await mk(A, "açılmış kapsül", ks[0]); db.prepare("UPDATE posts SET capsule=? WHERE id=?").run(Date.now() - 3600e3, open);
    const r = await so("memories", { tz: 0 }, A); ok(r.s === 200 && Array.isArray(r.posts), "memories ok");
    const ids = r.posts.map(p => p.id);
    ok(ids.includes(p1) && ids.includes(p2) && ids.includes(open), "own past posts present");
    ok(!ids.includes(pToday) && !ids.includes(pOther) && !ids.includes(arch) && !ids.includes(hid) && !ids.includes(com) && !ids.includes(sealed), "excluded: today/other/archived/hidden/community/sealed");
    ok(r.posts.find(p => p.id === p1).years === ks[0] && r.posts.find(p => p.id === p2).years === ks[1], "years labels");
    ok(JSON.stringify(r).indexOf("mühürlü") < 0, "no sealed leak");
    ok(r.posts[0].years <= r.posts[r.posts.length - 1].years, "newest year first");
    const rb = await so("memories", { tz: 0 }, B); ok(rb.posts.length === 1 && rb.posts[0].id === pOther, "only own memories");
    ok((await so("memories", { tz: 99999 }, A)).s === 200 && (await so("memories", { tz: "abc" }, A)).s === 200 && (await so("memories", {}, A)).s === 200, "bad tz tolerated");
    ok((await so("memories", { tz: 180 }, A)).posts.length >= 0, "tz ok");
    // 10 sınırı
    for (let i = 0; i < 12; i++) await mk(A, "x" + i, 1);
    ok((await so("memories", { tz: 0 }, A)).posts.length <= 10, "capped at 10");
    const html = fs.readFileSync(fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public/index.html") : path.join(__dirname, "..", "si/index.html"), "utf8");
    ["soExtras", "Günün konusu", "bzWeek", "bzGoal", "gununkonusu", "\"memories\""].forEach(k => ok(html.includes(k), "client has " + k));
    console.log("pack50 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
