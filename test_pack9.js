// Paket 9: yorum kapatma, beğeni gizleme, profil ziyareti. node test_pack9.js
const assert = require("assert");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-p9-" + process.pid + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const { server } = require("./server.js");
server.listen(0, async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (p, b, tok) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
  const so = (p, b, t) => call("/api/social/" + p, b, t);
  try {
    const reg = async (e, nm, h) => { const t = (await call("/api/register", { email: e, password: "parola-123", name: nm })).token; await so("profile", { handle: h }, t); return t; };
    const A = await reg("a@x.com", "Ali", "ali"), B = await reg("b@x.com", "Bora", "bora");
    let r = await so("post", { kind: "text", text: "merhaba" }, A); const P = r.id;
    r = await so("comment", { id: P, text: "güzel" }, B); ok(r.s === 200, "comments on by default");
    r = await so("post_opts", { id: P, toggle: "comments" }, B); ok(r.s === 404, "only owner");
    r = await so("post_opts", { id: P, toggle: "x" }, A); ok(r.s === 400, "bad toggle");
    r = await so("post_opts", { id: P, toggle: "comments" }, A); ok(r.noCom === true, "comments off");
    r = await so("comment", { id: P, text: "yeni" }, B); ok(r.s === 403 && r.error === "comments_off", "comment refused");
    r = await so("feed", { mode: "user", handle: "ali" }, B); ok(r.posts[0].noCom === true && r.posts[0].comments === 1, "flag in feed, old comments kept");
    r = await so("post_opts", { id: P, toggle: "comments" }, A); r = await so("comment", { id: P, text: "yine" }, B); ok(r.s === 200, "comments back on");
    // beğeni gizleme
    await so("like", { id: P, on: true }, B);
    r = await so("feed", { mode: "user", handle: "ali" }, B); ok(r.posts[0].likes === 1 && !r.posts[0].hideLikes, "likes visible");
    r = await so("post_opts", { id: P, toggle: "likes" }, A); ok(r.hideLikes === true, "hide likes");
    r = await so("feed", { mode: "user", handle: "ali" }, B); ok(r.posts[0].hideLikes === true && r.posts[0].likes === 0, "viewer sees no count");
    r = await so("feed", { mode: "user", handle: "ali" }, A); ok(r.posts[0].hideLikes === true && r.posts[0].likes === 1, "owner still sees count");
    // profil ziyareti
    await so("user", { handle: "ali" }, B); await so("user", { handle: "ali" }, B); await so("user", { handle: "ali" }, A);
    r = await so("creator_stats", { days: 7 }, A); ok(r.pviews === 1 && r.series.pviews.reduce((a, b) => a + b, 0) === 1, "one unique view per day, self excluded");
    const C = await reg("c@x.com", "Can", "can_x"); await so("user", { handle: "ali" }, C);
    r = await so("creator_stats", { days: 7 }, A); ok(r.pviews === 2, "second viewer counted");
    await so("block", { handle: "ali", on: true }, C); await so("user", { handle: "ali" }, C);
    r = await so("creator_stats", { days: 30 }, A); ok(r.pviews === 2, "blocked view not counted again");
    console.log("paket 9 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
