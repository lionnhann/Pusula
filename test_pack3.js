// Paket 3: rozet, hikâye tepkisi, Vitrin favorileri, satıcı puanı. node test_pack3.js
const assert = require("assert");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-p3-" + process.pid + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0"; process.env.ADMIN_TOKEN = "adm-test-token-123456";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const { server } = require("./server.js");
server.listen(0, async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (p, b, tok, hdr) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}, hdr || {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
  const so = (p, b, t) => call("/api/social/" + p, b, t), adm = (p, b) => call(p, b, null, { "x-admin-token": "adm-test-token-123456" });
  try {
    const reg = async (e, nm, h) => { const t = (await call("/api/register", { email: e, password: "parola-123", name: nm })).token; await so("profile", { handle: h }, t); return t; };
    const A = await reg("a@x.com", "Ali", "ali"), B = await reg("b@x.com", "Bora", "bora"), C = await reg("c@x.com", "Can", "can_x");
    const E = require("./e2e_help.js")(call); await E.key(A, "ali"); await E.key(B, "bora");
    // rozet
    let r = await so("user", { handle: "ali" }, B); ok(r.profile.badge === false, "no badge by default");
    r = await adm("/api/admin/remove", { badge: "ali" }); ok(r.s === 200, "admin gives badge");
    r = await so("user", { handle: "ali" }, B); ok(r.profile.badge === true, "badge shown");
    r = await so("l_new", { title: "Kupa", price: 10 }, A); const L = r.id;
    r = await so("l_get", { id: L }, B); ok(r.listing.badge === true, "badge in listing");
    r = await adm("/api/admin/remove", { unbadge: "ali" }); r = await so("user", { handle: "ali" }, B); ok(r.profile.badge === false, "badge removed");
    // hikâye tepkisi
    r = await so("story_new", { kind: "text", text: "Selam" }, A); const sid = r.id;
    r = await so("story_react", { id: sid, emoji: "🔥" }, B); ok(r.s === 404, "must follow to react");
    await so("follow", { handle: "ali", on: true }, B);
    r = await so("story_react", { id: sid, emoji: "💩" }, B); ok(r.s === 400, "emoji allowlist");
    r = await so("story_react", { id: sid, emoji: "🔥" }, B); ok(r.s === 200, "react");
    r = await so("story_react", { id: sid, emoji: "❤️" }, B); ok(r.s === 200, "change reaction");
    r = await so("story_react", { id: sid, emoji: "🔥" }, A); ok(r.s === 404, "no self reaction");
    r = await so("story_reacts", { id: sid }, A); ok(r.reacts.length === 1 && r.reacts[0].emoji === "❤️" && r.reacts[0].handle === "bora", "owner sees reactions");
    r = await so("story_reacts", { id: sid }, B); ok(r.s === 404, "only owner lists");
    r = await so("notifs", {}, A); ok(r.notifs.some(x => x.type === "sreact" && x.text === "❤️"), "owner notified");
    // favoriler
    r = await so("l_fav", { id: L, on: true }, B); ok(r.s === 200, "fav");
    r = await so("l_fav", { id: "yok", on: true }, B); ok(r.s === 404, "fav unknown");
    r = await so("l_favs", {}, B); ok(r.items.length === 1 && r.items[0].id === L, "fav list");
    r = await so("l_extra", { id: L }, B); ok(r.fav === true && r.favs === 1 && r.rating.n === 0, "extra");
    r = await so("l_fav", { id: L, on: false }, B); r = await so("l_favs", {}, B); ok(r.items.length === 0, "unfav");
    // satıcı puanı
    r = await so("seller_rate", { handle: "ali", stars: 5 }, C); ok(r.s === 403 && r.error === "no_contact", "needs contact");
    r = await so("seller_info", { handle: "ali" }, B); ok(r.canRate === false, "cannot rate yet");
    r = await so("send", { handle: "ali", text: E.env(B, "ali") }, B); ok(r.s === 200, "dm sent");
    r = await so("seller_info", { handle: "ali" }, B); ok(r.canRate === true, "can rate after contact");
    r = await so("seller_rate", { handle: "ali", stars: 9 }, B); ok(r.s === 400, "bad stars");
    r = await so("seller_rate", { handle: "ali", stars: 4, text: "Hızlı kargo" }, B); ok(r.s === 200 && r.rating.n === 1 && r.rating.avg === 4, "rated");
    r = await so("seller_rate", { handle: "ali", stars: 2 }, B); ok(r.rating.n === 1 && r.rating.avg === 2, "re-rate replaces");
    r = await so("seller_rate", { handle: "ali", stars: 5 }, A); ok(r.s === 404, "no self rating");
    r = await so("seller_info", { handle: "ali" }, C); ok(r.reviews.length === 1 && r.reviews[0].handle === "bora" && r.rating.avg === 2, "reviews visible");
    r = await so("block", { handle: "bora", on: true }, A); r = await so("seller_info", { handle: "ali" }, B); ok(r.s === 404, "blocked hidden");
    console.log("paket 3 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
