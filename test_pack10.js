// Paket 10: gönderi arşivi, takipçi listeleri, takipçi çıkarma. node test_pack10.js
const assert = require("assert");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-p10-" + process.pid + ".db");
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
    let r = await so("post", { kind: "text", text: "eski gönderi #arsiv" }, A); const P = r.id; await so("post", { kind: "text", text: "yeni" }, A);
    await so("follow", { handle: "ali", on: true }, B); await so("follow", { handle: "ali", on: true }, C);
    r = await so("feed", { mode: "following" }, B); ok(r.posts.length === 2, "both visible");
    r = await so("post_archive", { id: P, on: true }, B); ok(r.s === 404, "only owner archives");
    r = await so("post_archive", { id: P, on: true }, A); ok(r.archived === true, "archive");
    r = await so("feed", { mode: "following" }, B); ok(r.posts.length === 1 && r.posts[0].text === "yeni", "hidden from following feed");
    r = await so("feed", { mode: "user", handle: "ali" }, B); ok(r.posts.length === 1, "hidden from profile");
    r = await so("feed", { mode: "all" }, B); ok(r.posts.length === 1, "hidden from all");
    r = await so("tag", { tag: "arsiv" }, B); ok(r.posts.length === 0, "hidden from tag page");
    r = await so("getpost", { id: P }, B); ok(r.s === 404, "direct link hidden");
    r = await so("archived_list", {}, A); ok(r.posts.length === 1 && r.posts[0].id === P, "owner sees archive");
    r = await so("archived_list", {}, B); ok(r.posts.length === 0, "archive is private");
    r = await so("post_archive", { id: P, on: false }, A); r = await so("feed", { mode: "user", handle: "ali" }, B); ok(r.posts.length === 2, "restore");
    // listeler
    r = await so("follow_list", { handle: "ali", kind: "followers" }, B); ok(r.users.length === 2 && r.users.some(u => u.handle === "can_x") && r.users.some(u => u.me) && !r.self, "followers list");
    r = await so("follow_list", { handle: "bora", kind: "following" }, B); ok(r.users.length === 1 && r.users[0].handle === "ali" && r.self, "following list");
    await so("profile", { bio: "x", private: true }, A);
    r = await so("follow_list", { handle: "ali", kind: "followers" }, C); ok(r.s === 200, "follower can see private list");
    const D = await reg("d@x.com", "Deniz", "deniz"); r = await so("follow_list", { handle: "ali", kind: "followers" }, D); ok(r.s === 403, "stranger blocked from private list");
    await so("block", { handle: "can_x", on: true }, B); r = await so("follow_list", { handle: "ali", kind: "followers" }, B); ok(!r.users.some(u => u.handle === "can_x"), "blocked users hidden from list");
    // çıkarma
    r = await so("follower_remove", { handle: "bora" }, A); ok(r.s === 200, "remove follower");
    r = await so("follow_list", { handle: "ali", kind: "followers" }, C); ok(!r.users.some(u => u.handle === "bora"), "removed from list");
    r = await so("feed", { mode: "user", handle: "ali" }, B); ok(r.posts.length === 0, "private account closed to removed follower");
    r = await so("follower_remove", { handle: "ali" }, A); ok(r.s === 404, "cannot remove self");
    console.log("paket 10 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
