// Paket 70: beğendiğim yorumlar
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p70-" + process.pid + "-" + Date.now() + ".db");
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
    ok((await call("/api/social/liked_comments", {})).s === 401, "auth");
    ok((await so("liked_comments", {}, A)).comments.length === 0, "empty");
    await so("post", { text: "bora gönderisi", kind: "text" }, B); await so("post", { text: "can gönderisi", kind: "text" }, C);
    const pid = h => db.prepare("SELECT p.id FROM posts p JOIN profiles f ON f.user_id=p.user_id WHERE f.handle=?").get(h).id;
    const pb = pid("bora"), pc = pid("can");
    await so("comment", { id: pb, text: "c1 bora altında" }, C); await so("comment", { id: pb, text: "c2 bora altında" }, B); await so("comment", { id: pc, text: "c3 can altında" }, B);
    const cm = async (p, t) => (await so("comments", { id: p }, A)).comments.find(c => c.text === t).id;
    const c1 = await cm(pb, "c1 bora altında"), c2 = await cm(pb, "c2 bora altında"), c3 = await cm(pc, "c3 can altında");
    for (const c of [c1, c2, c3]) ok((await so("comment_like", { id: c, on: true }, A)).ok, "like " + c);
    let r = await so("liked_comments", {}, A);
    ok(r.comments.length === 3 && r.comments[0].text === "c3 can altında" && r.comments[2].text === "c1 bora altında", "newest like first: " + JSON.stringify(r.comments.map(c => c.text)));
    ok(r.comments[0].by === "bora" && r.comments[0].handle === "can" && r.comments[0].snippet === "can gönderisi" && r.comments[0].pid === pc, "author + post info");
    ok((await so("liked_comments", {}, B)).comments.length === 0, "personal");
    ok((await so("comment_like", { id: c3, on: false }, A)).ok && (await so("liked_comments", {}, A)).comments.length === 2, "unlike removes");
    await so("block", { handle: "bora", on: true }, A); r = await so("liked_comments", {}, A); ok(r.comments.length === 1 && r.comments[0].text === "c1 bora altında" ? false : r.comments.length === 0 || r.comments.every(c => c.by !== "bora" && c.handle !== "bora"), "blocked author/post hidden: " + JSON.stringify(r.comments)); await so("block", { handle: "bora", on: false }, A);
    await so("profile", { private: true }, B); r = await so("liked_comments", {}, A); ok(!r.comments.some(c => c.handle === "bora"), "private post hidden"); await so("profile", { private: false }, B);
    ok((await so("liked_comments", {}, A)).comments.length === 2, "restored");
    const t0 = (await so("liked_comments", {}, A)).comments; const cur = db.prepare("SELECT created FROM comment_likes WHERE cid=? AND user_id=(SELECT user_id FROM profiles WHERE handle='ali')").get(t0[t0.length - 1].id).created;
    ok((await so("liked_comments", { before: cur }, A)).comments.length === 0, "cursor");
    await so("delcomment", { id: c2 }, B); ok((await so("liked_comments", {}, A)).comments.length === 1, "deleted comment gone");
    const html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
    ["liked_comments", "data-lcm", "bzOrders", "bzAppts", "orsave", "apsave", "o.ords=", "o.apts="].forEach(k => ok(html.includes(k), "client has " + k));
    console.log("pack70 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
