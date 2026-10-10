// Paket 4: sessize alma, profil bağlantısı. node test_pack4.js
const assert = require("assert");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-p4-" + process.pid + ".db");
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
    await so("follow", { handle: "ali", on: true }, B);
    await so("post", { kind: "text", text: "merhaba" }, A); await so("story_new", { kind: "text", text: "hikaye" }, A);
    let r = await so("feed", { mode: "following" }, B); ok(r.posts.length === 1, "feed shows post");
    r = await so("stories", {}, B); ok(r.stories.length === 1, "story shown");
    r = await so("mute", { handle: "ali", on: true }, A); ok(r.s === 404, "cannot mute self");
    r = await so("mute", { handle: "ali", on: true }, B); ok(r.s === 200 && r.muted, "mute");
    r = await so("feed", { mode: "following" }, B); ok(r.posts.length === 0, "muted hidden from feed");
    r = await so("feed", { mode: "all" }, B); ok(r.posts.length === 0, "muted hidden from all");
    r = await so("stories", {}, B); ok(r.stories.length === 0, "muted hidden from stories");
    r = await so("feed", { mode: "user", handle: "ali" }, B); ok(r.posts.length === 1, "profile still shows posts");
    r = await so("user", { handle: "ali" }, B); ok(r.muted === true && r.isFollowing, "muted flag, still following");
    r = await so("mutes", {}, B); ok(r.mutes.length === 1 && r.mutes[0].handle === "ali", "mute list");
    r = await so("feed", { mode: "following" }, A); ok(r.posts.length === 1, "other users unaffected");
    r = await so("mute", { handle: "ali", on: false }, B); r = await so("feed", { mode: "following" }, B); ok(r.posts.length === 1, "unmute");
    // bağlantı
    r = await so("profile", { bio: "x", link: "javascript:alert(1)" }, A); ok(r.s === 400 && r.error === "bad_link", "js link rejected");
    r = await so("profile", { bio: "x", link: "https://ornek.com/benim" }, A); ok(r.s === 200 && r.profile.link === "https://ornek.com/benim", "link saved");
    r = await so("user", { handle: "ali" }, B); ok(r.profile.link === "https://ornek.com/benim", "link visible");
    r = await so("profile", { bio: "y" }, A); ok(r.profile.link === "https://ornek.com/benim", "link kept when omitted");
    r = await so("profile", { bio: "y", link: "" }, A); ok(r.profile.link === "", "link cleared");
    console.log("paket 4 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
