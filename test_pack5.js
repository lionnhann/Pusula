// Paket 5: özel topluluklar, ortak gönderi. node test_pack5.js
const assert = require("assert");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-p5-" + process.pid + ".db");
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
    // özel topluluk
    let r = await so("c_create", { handle: "gizli", name: "Gizli Oda", priv: true }, A); ok(r.s === 200, "create private");
    r = await so("c_get", { handle: "gizli" }, A); const code = r.community.code; ok(r.community.priv && /^[0-9a-f]{10}$/.test(code), "owner sees code");
    r = await so("c_get", { handle: "gizli" }, B); ok(r.community.priv && r.community.code === "" && r.community.role === "", "non-member no code");
    await so("c_create", { handle: "acik", name: "Açık Oda" }, A);
    r = await so("c_list", { mode: "popular" }, B); ok(r.communities.length === 1 && r.communities[0].handle === "acik", "private hidden from list");
    r = await so("c_list", { q: "gizli" }, B); ok(r.communities.length === 0, "private hidden from search");
    r = await so("c_list", { mode: "mine" }, A); ok(r.communities.some(c => c.handle === "gizli" && c.priv), "member sees own private");
    r = await so("c_join", { handle: "gizli", on: true }, B); ok(r.s === 403 && r.error === "need_code", "join needs code");
    r = await so("c_join", { handle: "gizli", on: true, code: "0000000000" }, B); ok(r.s === 403, "wrong code");
    r = await so("c_feed", { handle: "gizli" }, B); ok(r.s === 403, "feed locked");
    r = await so("c_members", { handle: "gizli" }, B); ok(r.s === 403, "members locked");
    r = await so("post", { kind: "text", text: "sır", community: "gizli" }, A); const pid = r.id; ok(r.s === 200, "post in private");
    r = await so("getpost", { id: pid }, B); ok(r.s === 404, "post hidden by id");
    r = await so("c_by_code", { code }, B); ok(r.handle === "gizli", "resolve code");
    r = await so("c_by_code", { code: "zzzzzzzzzz" }, B); ok(r.s === 404, "bad code");
    r = await so("c_join", { handle: "gizli", on: true, code }, B); ok(r.s === 200 && r.community.role === "member", "join with code");
    r = await so("c_feed", { handle: "gizli" }, B); ok(r.posts.length === 1, "member sees feed");
    r = await so("getpost", { id: pid }, B); ok(r.s === 200, "member sees post");
    r = await so("c_newcode", { handle: "gizli" }, B); ok(r.s === 403, "only owner rotates");
    r = await so("c_newcode", { handle: "gizli" }, A); ok(r.code && r.code !== code, "rotate code");
    r = await so("c_join", { handle: "gizli", on: true, code }, C); ok(r.s === 403, "old code dead");
    r = await so("c_update", { handle: "gizli", name: "Gizli Oda", priv: false }, A); ok(!r.community.priv, "made public");
    r = await so("c_list", { mode: "popular" }, C); ok(r.communities.length === 2, "public now listed");
    // collab
    r = await so("post", { kind: "text", text: "birlikte" }, A); const cp = r.id;
    r = await so("collab_invite", { id: cp, handle: "ali" }, A); ok(r.s === 404, "cannot invite self");
    r = await so("collab_invite", { id: cp, handle: "bora" }, B); ok(r.s === 404, "only author invites");
    r = await so("collab_invite", { id: cp, handle: "bora" }, A); ok(r.s === 200, "invite");
    r = await so("collab_invite", { id: cp, handle: "can_x" }, A); ok(r.s === 409, "one collab only");
    r = await so("feed", { mode: "user", handle: "bora" }, C); ok(r.posts.length === 0, "pending not on partner profile");
    r = await so("collab_inbox", {}, B); ok(r.invites.length === 1 && r.invites[0].id === cp && r.invites[0].handle === "ali", "inbox");
    r = await so("notifs", {}, B); ok(r.notifs.some(x => x.type === "collab"), "notified");
    r = await so("collab_respond", { id: cp, accept: true }, C); ok(r.s === 404, "only invitee responds");
    r = await so("collab_respond", { id: cp, accept: true }, B); ok(r.s === 200, "accept");
    r = await so("feed", { mode: "user", handle: "bora" }, C); ok(r.posts.length === 1 && r.posts[0].id === cp && r.posts[0].collab === "bora", "shows on partner profile");
    r = await so("feed", { mode: "user", handle: "ali" }, C); ok(r.posts.find(x => x.id === cp).collab === "bora", "collab tag on author profile");
    r = await so("collab_inbox", {}, B); ok(r.invites.length === 0, "inbox empty");
    r = await so("collab_cancel", { id: cp }, B); ok(r.s === 404, "only author cancels");
    r = await so("collab_cancel", { id: cp }, A); r = await so("feed", { mode: "user", handle: "bora" }, C); ok(r.posts.length === 0, "cancel removes");
    r = await so("post", { kind: "text", text: "red" }, A); const p2 = r.id; await so("collab_invite", { id: p2, handle: "can_x" }, A);
    r = await so("collab_respond", { id: p2, accept: false }, C); r = await so("collab_inbox", {}, C); ok(r.invites.length === 0, "decline");
    console.log("paket 5 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
