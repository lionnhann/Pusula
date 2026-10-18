// Paket 60: yorum kitlesi + toplu arşiv
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p60-" + process.pid + "-" + Date.now() + ".db");
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
    await so("follow", { handle: "ali", on: true }, B);
    const P = await so("post", { kind: "text", text: "merhaba" }, A); ok(P.ok, "post");
    // ---- yorum kitlesi
    ok((await so("comment", { id: P.id, text: "herkes" }, C)).ok, "default: anyone can comment");
    ok((await call("/api/social/post_opts", { id: P.id, toggle: "audience" })).s === 401, "auth");
    ok((await so("post_opts", { id: P.id, toggle: "audience" }, B)).s === 404, "only owner");
    let o = await so("post_opts", { id: P.id, toggle: "audience" }, A); ok(o.ok && o.comAud === true && o.noCom === false, "audience on " + JSON.stringify(o));
    const r1 = await so("comment", { id: P.id, text: "yabancı" }, C); ok(r1.s === 403 && r1.error === "comments_followers", "non-follower blocked " + JSON.stringify(r1));
    ok((await so("comment", { id: P.id, text: "takipçi" }, B)).ok, "follower can comment");
    ok((await so("comment", { id: P.id, text: "sahibi" }, A)).ok, "owner can comment");
    const fd = await so("feed", { mode: "user", handle: "ali" }, B); const px = fd.posts.find(x => x.id === P.id); ok(px && px.comAud === true, "feed flags comAud");
    await so("post_opts", { id: P.id, toggle: "comments" }, A); const r2 = await so("comment", { id: P.id, text: "x" }, B); ok(r2.error === "comments_off", "comments_off wins");
    await so("post_opts", { id: P.id, toggle: "comments" }, A);
    o = await so("post_opts", { id: P.id, toggle: "audience" }, A); ok(o.comAud === false, "audience off"); ok((await so("comment", { id: P.id, text: "artık açık" }, C)).ok, "anyone again");
    const fd2 = await so("feed", { mode: "user", handle: "ali" }, B); ok(!fd2.posts.find(x => x.id === P.id).comAud, "flag cleared");
    ok((await so("post_opts", { id: P.id, toggle: "yok" }, A)).error === "bad_toggle", "bad toggle");
    // ---- toplu arşiv
    const D = 86400e3, tnow = Date.now(), uA = uid("ali");
    const mk = (id, ageDays, extra) => db.prepare("INSERT INTO posts(id,user_id,kind,text,media,created) VALUES(?,?,?,?,?,?)").run(id, uA, "text", "t", "", tnow - ageDays * D);
    mk("old100", 100); mk("old200", 200); mk("old400", 400); mk("old500pin", 500); mk("fresh", 5);
    db.prepare("UPDATE profiles SET pinned=? WHERE user_id=?").run("old500pin", uA);
    mk("oldcap", 450); db.prepare("UPDATE posts SET capsule=? WHERE id='oldcap'").run(tnow + 10 * D);
    ok((await call("/api/social/bulk_archive", { days: 90 })).s === 401, "ba auth");
    ok((await so("bulk_archive", { days: 10 }, A)).error === "bad_days", "too small"); ok((await so("bulk_archive", { days: 99999 }, A)).error === "bad_days", "too large"); ok((await so("bulk_archive", {}, A)).error === "bad_days", "missing");
    let d = await so("bulk_archive", { days: 90, dry: true }, A); ok(d.dry && d.n === 3, "dry 90d = old100,old200,old400: " + JSON.stringify(d));
    ok(db.prepare("SELECT COUNT(*) n FROM posts WHERE user_id=? AND archived=1").get(uA).n === 0, "dry changes nothing");
    d = await so("bulk_archive", { days: 365, dry: true }, A); ok(d.n === 1, "dry 365d = only old400 (pinned & capsule skipped): " + d.n);
    d = await so("bulk_archive", { days: 365 }, A); ok(d.ok && d.n === 1, "archived 1");
    const st = id => db.prepare("SELECT archived a FROM posts WHERE id=?").get(id).a;
    ok(st("old400") === 1 && st("old200") === 0 && st("old500pin") === 0 && st("oldcap") === 0 && st("fresh") === 0, "only the right post archived");
    d = await so("bulk_archive", { days: 90 }, A); ok(d.n === 2 && st("old100") === 1 && st("old200") === 1, "second run: 2 more");
    d = await so("bulk_archive", { days: 90 }, A); ok(d.n === 0, "idempotent");
    const other = await so("bulk_archive", { days: 30, dry: true }, B); ok(other.n === 0, "other user unaffected");
    const arc = await so("archived_list", {}, A); ok(arc.posts.length === 3, "archive screen lists them: " + arc.posts.length);
    const html = fs.readFileSync(fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public/index.html") : path.join(__dirname, "..", "si/index.html"), "utf8");
    ["data-popt=\"audience", "data-bac=", "data-bau", "bzPayCal", "bzPayInfo", "ivinfo:", "pcd:"].forEach(k => ok(html.includes(k), "client has " + k));
    console.log("pack60 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
