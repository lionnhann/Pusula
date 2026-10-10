// Paket 17: mesaj istekleri. node test_pack17.js
const assert = require("assert");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-p17-" + process.pid + ".db");
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
    const E = require("./e2e_help.js")(call); await E.key(A, "ali"); await E.key(B, "bora"); await E.key(C, "can_x");
    let r = await so("send", { handle: "bora", text: E.env(A, "bora") }, A); ok(r.ok, "stranger can send");
    r = await so("inbox", {}, B); ok(r.chats.length === 1 && r.chats[0].request === true, "marked as request");
    r = await so("inbox", {}, A); ok(r.chats[0].request === false, "sender sees normal chat");
    // takip edince istek olmaz
    await so("follow", { handle: "ali", on: true }, B); r = await so("inbox", {}, B); ok(r.chats[0].request === false, "following -> normal");
    await so("follow", { handle: "ali", on: false }, B); r = await so("inbox", {}, B); ok(r.chats[0].request === true, "unfollow -> request again");
    // cevap verince normal
    r = await so("send", { handle: "ali", text: E.env(B, "ali") }, B); ok(r.ok, "reply");
    r = await so("inbox", {}, B); ok(r.chats[0].request === false, "replied -> normal");
    // reddet
    await so("send", { handle: "bora", text: E.env(C, "bora") }, C);
    r = await so("inbox", {}, B); ok(r.chats.length === 2 && r.chats.find(c => c.handle === "can_x").request, "second request");
    r = await so("req_decline", { handle: "can_x" }, B); ok(r.ok, "decline");
    r = await so("inbox", {}, B); ok(r.chats.length === 1 && r.chats[0].handle === "ali", "declined hidden");
    r = await so("inbox", {}, C); ok(r.chats.length === 1, "sender unaffected");
    r = await so("req_decline", { handle: "yok_yok" }, B); ok(r.s === 404, "unknown");
    r = await so("chats", {}, B); ok(r.chats.length === 1 && r.chats[0].request === false, "chats endpoint: normal after reply");
    await so("send", { handle: "bora", text: E.env(C, "bora") }, C); r = await so("chats", {}, B); ok(r.chats.length === 1, "declined stays hidden in chats");
    const D = await reg("d@x.com", "Deniz", "deniz"); await E.key(D, "deniz"); await so("send", { handle: "bora", text: E.env(D, "bora") }, D);
    r = await so("chats", {}, B); ok(r.chats.find(c => c.handle === "deniz").request === true, "chats endpoint marks request");
    console.log("paket 17 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
