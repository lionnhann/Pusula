// Paket 68: yorumlarım
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p68-" + process.pid + "-" + Date.now() + ".db");
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
    ok((await call("/api/social/my_comments", {})).s === 401, "auth");
    ok((await so("my_comments", {}, A)).comments.length === 0, "empty");
    await so("post", { text: "bora gönderisi", kind: "text" }, B); await so("post", { text: "can gönderisi", kind: "text" }, C); await so("post", { text: "ali gönderisi", kind: "text" }, A);
    const pid = h => db.prepare("SELECT p.id FROM posts p JOIN profiles f ON f.user_id=p.user_id WHERE f.handle=?").get(h).id;
    const pb = pid("bora"), pc = pid("can"), pa = pid("ali");
    await so("comment", { id: pb, text: "ali -> bora" }, A); await so("comment", { id: pc, text: "ali -> can" }, A); await so("comment", { id: pa, text: "ali -> kendi" }, A); await so("comment", { id: pb, text: "can -> bora" }, C);
    let r = await so("my_comments", {}, A);
    ok(r.comments.length === 3, "3 own comments: " + JSON.stringify(r.comments.map(c => c.text)));
    ok(r.comments.every(c => c.text.startsWith("ali")), "only own comments");
    ok(r.comments[0].text === "ali -> kendi" && r.comments[2].text === "ali -> bora", "newest first");
    ok(r.comments.find(c => c.text === "ali -> bora").handle === "bora" && r.comments.find(c => c.text === "ali -> bora").snippet === "bora gönderisi" && r.comments[0].pid === pa, "post info attached");
    ok((await so("my_comments", {}, B)).comments.length === 0, "personal");
    await so("block", { handle: "bora", on: true }, A);
    r = await so("my_comments", {}, A); ok(r.comments.length === 2 && !r.comments.some(c => c.handle === "bora"), "blocked author's post hidden");
    await so("block", { handle: "bora", on: false }, A);
    await so("profile", { private: true }, C);
    r = await so("my_comments", {}, A); ok(r.comments.length === 2 && !r.comments.some(c => c.handle === "can"), "private post hidden when not following");
    await so("profile", { private: false }, C);
    const cid = (await so("comments", { id: pb }, A)).comments.find(c => c.text === "ali -> bora").id;
    ok((await so("comment_edit", { id: cid, text: "ali -> bora (düzeltme)" }, A)).ok, "edit");
    r = await so("my_comments", {}, A); ok(r.comments.find(c => c.id === cid).edited === true, "edited flag");
    ok((await so("delcomment", { id: cid }, A)).ok, "delete own"); ok((await so("my_comments", {}, A)).comments.length === 2, "gone after delete");
    const t0 = r.comments[r.comments.length - 1].created;
    ok((await so("my_comments", { before: t0 }, A)).comments.length === 0, "before cursor");
    for (let i = 0; i < 25; i++) await so("comment", { id: pc, text: "toplu " + i }, A);
    r = await so("my_comments", {}, A); ok(r.comments.length === 20 && r.more === true, "page of 20 + more: " + r.comments.length + " " + r.more);
    const html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
    ["my_comments", "data-mycm", "bzContracts", "bzKm", "ctnew", "kmadd", "o.ctr=", "o.kms="].forEach(k => ok(html.includes(k), "client has " + k));
    console.log("pack68 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
