// Paket 15: etiket takibi ve etiket akışı. node test_pack15.js
const assert = require("assert");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-p15-" + process.pid + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const { server } = require("./server.js");
server.listen(0, async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (p, b, tok) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
  const so = (p, b, t) => call("/api/social/" + p, b, t);
  try {
    const reg = async (e, nm, h) => { const t = (await call("/api/register", { email: e, password: "parola-123", name: nm })).token; await so("profile", { handle: h }, t); return t; };
    const A = await reg("a@x.com", "Ali", "ali"), B = await reg("b@x.com", "Bora", "bora"), C = await reg("c@x.com", "Can", "can_x");
    await so("post", { kind: "text", text: "kahve #Kahve zamanı" }, A); await so("post", { kind: "text", text: "çay #cay" }, A);
    let r = await so("tag_feed", {}, B); ok(r.posts.length === 0, "empty before follow");
    r = await so("tag_follow", { tag: "#KAHVE", on: true }, B); ok(r.following && r.tag === "kahve", "follow normalizes");
    r = await so("tag_follow", { tag: "x", on: true }, B); ok(r.s === 400, "bad tag");
    r = await so("tag_follows", {}, B); ok(r.tags.length === 1 && r.tags[0] === "kahve", "list");
    r = await so("tag", { tag: "kahve" }, B); ok(r.following === true && r.posts.length === 1, "tag page flag");
    r = await so("tag", { tag: "kahve" }, C); ok(r.following === false, "per user");
    r = await so("tag_feed", {}, B); ok(r.posts.length === 1 && /kahve/.test(r.posts[0].text), "feed has followed tag only");
    await so("profile", { private: true }, A);
    r = await so("tag_feed", {}, B); ok(r.posts.length === 0, "private account hidden from tag feed");
    r = await so("tag", { tag: "kahve" }, B); ok(r.posts.length === 0, "private account hidden from tag page");
    r = await so("tag", { tag: "kahve" }, A); ok(r.posts.length === 1, "owner sees own");
    await so("follow", { handle: "ali", on: true }, B);
    for (let i = 0; i < 5; i++) { /* follow request flow may need acceptance */ }
    r = await so("tag_follow", { tag: "kahve", on: false }, B); r = await so("tag_follows", {}, B); ok(r.tags.length === 0, "unfollow");
    for (let i = 0; i < 30; i++) await so("tag_follow", { tag: "etiket" + i, on: true }, C);
    r = await so("tag_follow", { tag: "fazla", on: true }, C); ok(r.s === 400 && r.error === "too_many", "cap 30");
    console.log("paket 15 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
