// Paket 66: yorum düzenleme + toplu istek
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p66-" + process.pid + "-" + Date.now() + ".db");
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


    const A = await reg("ali"), B = await reg("bora"), C = await reg("can"), D = await reg("dara");
    let r = await so("post", { text: "gönderi", kind: "text" }, A); const pid = (await so("feed", { mode: "user", handle: "ali" }, A)).posts[0].id;
    r = await so("comment", { id: pid, text: "ilk yorum" }, B); const cid = r.id; ok(cid, "comment created");
    ok((await call("/api/social/comment_edit", { id: cid, text: "x" })).s === 401, "auth");
    ok((await so("comment_edit", { id: cid, text: "başkası" }, C)).s === 404, "only the author can edit");
    ok((await so("comment_edit", { id: cid, text: "ali düzenler" }, A)).s === 404, "post owner cannot edit someone else's comment");
    ok((await so("comment_edit", { id: "yok", text: "x" }, B)).s === 404, "unknown comment");
    ok((await so("comment_edit", { id: cid, text: "   " }, B)).error === "empty", "empty refused");
    r = await so("comment_edit", { id: cid, text: "ilk yorum" }, B); ok(r.ok && r.edited === false, "same text is a no-op");
    let l = await so("comments", { id: pid }, A); ok(l.comments[0].edited === false, "not marked edited yet");
    r = await so("comment_edit", { id: cid, text: "  düzeltilmiş <b>yorum</b>  " }, B); ok(r.ok && r.edited === true && r.text === "düzeltilmiş <b>yorum</b>", "edited + trimmed: " + JSON.stringify(r));
    l = await so("comments", { id: pid }, A); ok(l.comments[0].text === "düzeltilmiş <b>yorum</b>" && l.comments[0].edited === true, "list shows new text and edited flag");
    r = await so("comment_edit", { id: cid, text: "y".repeat(900) }, B); l = await so("comments", { id: pid }, A); ok(l.comments[0].text.length === 300, "length capped 300");
    db.prepare("UPDATE comments SET created=? WHERE id=?").run(Date.now() - 16 * 60e3, cid);
    r = await so("comment_edit", { id: cid, text: "geç kaldım" }, B); ok(r.s === 403 && r.error === "edit_expired", "15 minute window: " + JSON.stringify(r));
    db.prepare("UPDATE comments SET created=? WHERE id=?").run(Date.now() - 14 * 60e3, cid); ok((await so("comment_edit", { id: cid, text: "zamanında" }, B)).ok, "inside window");
    await so("block", { handle: "bora", on: true }, A); ok((await so("comment_edit", { id: cid, text: "engelli" }, B)).s === 404, "blocked by post owner cannot edit");
    await so("block", { handle: "bora", on: false }, A);
    // toplu takip isteği
    await so("profile", { private: true }, A);
    for (const [u, t] of [["bora", B], ["can", C], ["dara", D]]) await so("follow", { handle: "ali", on: true }, t);
    ok((await so("fr_list", {}, A)).requests.length === 3, "three pending requests");
    ok((await call("/api/social/fr_bulk", { accept: true })).s === 401, "bulk auth");
    ok((await so("fr_bulk", { accept: true }, B)).n === 0, "no requests for bora => 0");
    await so("block", { handle: "dara", on: true }, A); db.prepare("INSERT OR IGNORE INTO follow_requests(follower,followee,created) VALUES(?,?,?)").run(uid("dara"), uid("ali"), Date.now());
    r = await so("fr_bulk", { accept: true }, A); ok(r.ok && r.accepted === true && r.n === 2, "accepted two, blocked request dropped: " + JSON.stringify(r));
    ok((await so("fr_list", {}, A)).requests.length === 0, "queue empty");
    const fol = h => db.prepare("SELECT 1 FROM follows WHERE follower=? AND followee=?").get(uid(h), uid("ali"));
    ok(fol("bora") && fol("can") && !fol("dara"), "bora+can follow ali, blocked dara does not");
    await so("block", { handle: "dara", on: false }, A); await so("follow", { handle: "ali", on: true }, D);
    r = await so("fr_bulk", { accept: false }, A); ok(r.n === 1 && r.accepted === false, "decline all"); ok(!fol("dara"), "declined: not following"); ok((await so("fr_list", {}, A)).requests.length === 0, "queue empty after decline");
    const html = fs.readFileSync(fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public/index.html") : path.join(__dirname, "..", "si/index.html"), "utf8");
    ["comment_edit", "fr_bulk", "data-ced", "data-frb", "bzIvTools", "bzClTools", "bzCliStat"].forEach(k => ok(html.includes(k), "client has " + k));
    console.log("pack66 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
