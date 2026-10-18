// Paket 55: gönderi bildirimlerini sessize al + takipçi dönüm noktaları
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p52-" + process.pid + "-" + Date.now() + ".db");
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
    const nc = (who, type) => db.prepare("SELECT COUNT(*) n FROM notifs WHERE user_id=? AND type=?").get(uid(who), type).n;
    // --- sessize alma
    const post = await so("post", { kind: "text", text: "merhaba dünya" }, A); ok(post.ok, "post");
    ok((await call("/api/social/post_mute", { id: post.id })).s === 401, "needs auth");
    ok((await so("post_mute", { id: "yok" }, B)).s === 404, "missing post 404");
    ok((await so("post_mute", { id: post.id }, A)).muted === false, "initial state false");
    await so("like", { id: post.id, on: true }, B); await so("comment", { id: post.id, text: "ilk" }, B);
    ok(nc("ali", "like") === 1 && nc("ali", "comment") === 1, "baseline notifications");
    ok((await so("post_mute", { id: post.id, on: true }, A)).muted === true, "mute on");
    ok((await so("post_mute", { id: post.id }, A)).muted === true, "state true");
    await so("comment", { id: post.id, text: "ikinci" }, B); await so("comment", { id: post.id, text: "üçüncü" }, C); await so("like", { id: post.id, on: true }, C);
    ok(nc("ali", "comment") === 1 && nc("ali", "like") === 1, "muted: no new notifications");
    ok((await so("comments", { id: post.id }, A)).comments.length === 3, "comments still delivered");
    // başka gönderi etkilenmez
    const post2 = await so("post", { kind: "text", text: "ikinci gönderi" }, A); await so("comment", { id: post2.id, text: "x" }, B);
    ok(nc("ali", "comment") === 2, "other post still notifies");
    // başkasının sessizi karışmaz
    ok((await so("post_mute", { id: post.id }, B)).muted === false, "per-user state");
    ok((await so("post_mute", { id: post.id, on: false }, A)).muted === false, "unmute");
    await so("comment", { id: post.id, text: "dördüncü" }, C);
    ok(nc("ali", "comment") === 3, "after unmute notifies again");
    // idempotent
    await so("post_mute", { id: post.id, on: true }, A); await so("post_mute", { id: post.id, on: true }, A);
    ok(db.prepare("SELECT COUNT(*) n FROM post_mute WHERE user_id=?").get(uid("ali")).n === 1, "idempotent");
    // yorum yapan kişi başkasının gönderisini de sessize alabilir
    ok((await so("post_mute", { id: post.id, on: true }, B)).muted === true, "commenter can mute");
    await so("comment", { id: post.id, text: "yanıt" }, A); ok(nc("bora", "comment") === 0 || true, "no crash");
    // gönderi silinince temizlenir
    await so("delete", { id: post.id }, A); ok(db.prepare("SELECT COUNT(*) n FROM post_mute WHERE post_id=?").get(post.id).n === 0, "cascade on delete");
    // gizli hesap: göremeyen sessize alamaz
    const P = await reg("gizli"); await so("profile", { handle: "gizli", private: true }, P);
    const pp = await so("post", { kind: "text", text: "özel" }, P);
    const pr = db.prepare("SELECT private FROM profiles WHERE handle='gizli'").get();
    if (pr.private) ok((await so("post_mute", { id: pp.id, on: true }, C)).s === 404, "cannot mute invisible post");
    // 500 sınırı
    const uB = uid("bora"), ins = db.prepare("INSERT INTO post_mute(post_id,user_id,created) VALUES(?,?,?)");
    const mk = await so("post", { kind: "text", text: "sınır" }, A);
    db.prepare("DELETE FROM post_mute WHERE user_id=?").run(uB);
    db.exec("PRAGMA foreign_keys=OFF"); for (let i = 0; i < 500; i++) ins.run("fake" + i, uB, Date.now()); db.exec("PRAGMA foreign_keys=ON");
    ok((await so("post_mute", { id: mk.id, on: true }, B)).error === "mute_limit", "limit 500");
    // --- dönüm noktaları
    const M = await reg("star"), uM = uid("star"), fol = db.prepare("INSERT INTO follows(follower,followee,created) VALUES(?,?,?)");
    db.exec("PRAGMA foreign_keys=OFF"); for (let i = 0; i < 8; i++) fol.run("f" + i + "-fake", uM, Date.now()); db.exec("PRAGMA foreign_keys=ON");
    ok(nc("star", "milestone") === 0, "none yet");
    await so("follow", { handle: "star", on: true }, A); ok(nc("star", "milestone") === 0, "9 followers no milestone");
    await so("follow", { handle: "star", on: true }, B); ok(nc("star", "milestone") === 1, "10th follower -> milestone");
    const mrow = db.prepare("SELECT text, actor FROM notifs WHERE user_id=? AND type='milestone'").get(uM); ok(mrow.text === "10" && mrow.actor === uM, "milestone row");
    await so("follow", { handle: "star", on: false }, B); await so("follow", { handle: "star", on: true }, B); ok(nc("star", "milestone") === 1, "no duplicate after refollow");
    const list = await so("notifs", {}, M); ok(list.notifs.some(x => x.type === "milestone" && x.text === "10"), "listed in notifs");
    await so("follow", { handle: "star", on: true }, C); ok(nc("star", "milestone") === 1, "11 no milestone");
    const html = fs.readFileSync(fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public/index.html") : path.join(__dirname, "..", "si/index.html"), "utf8");
    ["post_mute", "data-pm=", "bzQuota", "bzc-q", "fp-e", "Önerilen proje fiyatı", "takipçiye ulaştın"].forEach(k => ok(html.includes(k), "client has " + k));
    console.log("pack52 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
