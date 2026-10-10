// Paket 11: beğenilenler listesi, veri dışa aktarma. node test_pack11.js
const assert = require("assert");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-p11-" + process.pid + ".db");
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
    const p1 = (await so("post", { kind: "text", text: "bir" }, A)).id, p2 = (await so("post", { kind: "text", text: "iki" }, A)).id;
    await so("like", { id: p1, on: true }, B); await so("like", { id: p2, on: true }, B);
    let r = await so("liked_list", {}, B); ok(r.posts.length === 2 && r.posts[0].id === p2, "newest like first");
    r = await so("liked_list", {}, A); ok(r.posts.length === 0, "own likes only");
    await so("block", { handle: "ali", on: true }, B); r = await so("liked_list", {}, B); ok(r.posts.length === 0, "blocked author hidden");
    await so("block", { handle: "ali", on: false }, B);
    await so("follow", { handle: "ali", on: true }, B); await so("comment", { id: p1, text: "yorum" }, B);
    r = await so("data_export", {}, B); ok(r.s === 200 && r.profile.handle === "bora" && r.following.includes("ali") && r.comments.length === 1 && r.likes === 2, "export B");
    r = await so("data_export", {}, A); ok(r.posts.length === 2 && r.followers.includes("bora"), "export A");
    console.log("paket 11 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
