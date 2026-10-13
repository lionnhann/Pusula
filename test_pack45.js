// Paket 45: sohbet sabitle/sessize, listeler (istemci)
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p45-" + process.pid + "-" + Date.now() + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const { server } = require("./server.js");
server.listen(0, async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (p, b, tok) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
  try {
    const reg = async (e, nm, h) => { const t = (await call("/api/register", { email: e, password: "kaplan-gece-47", name: nm })).token; await call("/api/social/profile", { handle: h }, t); return t; };
    const A = await reg("a@x.com", "Ali", "ali"), B = await reg("b@x.com", "Bora", "bora"), C = await reg("c@x.com", "Can", "can_x");
    const E = require("./e2e_help.js")(call); await E.key(A, "ali"); await E.key(B, "bora"); await E.key(C, "can_x"); const tk = { bora: B, can_x: C, ali: A }; const send = (t, to, who) => call("/api/social/send", { handle: to, text: E.env(t, to) }, t);
    await call("/api/social/follow", { handle: "ali", on: true }, B); await call("/api/social/follow", { handle: "ali", on: true }, C); await call("/api/social/follow", { handle: "bora", on: true }, A); await call("/api/social/follow", { handle: "can_x", on: true }, A);
    await send(B, "ali"); await new Promise(r => setTimeout(r, 15)); await send(C, "ali");
    let r = await call("/api/social/chats", {}, A); ok(r.chats.length === 2 && r.chats[0].handle === "can_x" && r.unread === 2, "baseline order/unread " + JSON.stringify(r.chats.map(c => c.handle)));
    ok((await call("/api/social/chat_pref", { handle: "bora", pin: true }, A)).pin === true, "pin");
    r = await call("/api/social/chats", {}, A); ok(r.chats[0].handle === "bora" && r.chats[0].pin === true, "pinned first");
    ok((await call("/api/social/chat_pref", { handle: "can_x", mute: true }, A)).mute === true, "mute");
    r = await call("/api/social/chats", {}, A); ok(r.unread === 1 && r.chats.find(c => c.handle === "can_x").mute === true && r.chats.find(c => c.handle === "can_x").unread === 1, "muted not counted in total " + r.unread);
    const me = await call("/api/social/me", {}, A); ok(me.unread === 1, "me.unread excludes muted " + me.unread);
    ok((await call("/api/social/chat_pref", { handle: "bora", pin: false }, A)).pin === false, "unpin keeps mute? n/a");
    r = await call("/api/social/chats", {}, A); ok(r.chats.find(c => c.handle === "bora").pin !== true, "unpinned");
    ok((await call("/api/social/chat_pref", { handle: "nobody", pin: true }, A)).s === 404, "unknown user");
    ok((await call("/api/social/chat_pref", { handle: "ali", pin: true }, A)).s === 404, "not self");
    ok((await call("/api/social/chat_pref", { group: "gxxxx", pin: true }, A)).s === 404, "not group member");
    ok((await call("/api/social/chat_pref", { handle: "can_x", mute: false }, A)).mute === false, "unmute");
    r = await call("/api/social/chats", {}, A); ok(r.unread === 2, "unmuted counts again");
    // başkasının tercihi benimkini etkilemez
    await call("/api/social/chat_pref", { handle: "ali", pin: true }, B); r = await call("/api/social/chats", {}, A); ok(!r.chats.some(c => c.pin), "prefs per user");
    const html = fs.readFileSync(fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public/index.html") : path.join(__dirname, "..", "si/index.html"), "utf8");
    ["function listCard", "data-lsa", "data-lsc", "o.lists=", "data-cpin", "data-cmut", "chat_pref"].forEach(k => ok(html.includes(k), "client has " + k));
    const keys = JSON.parse('["Lists", "New list name (shopping, packing…)", "Add item", "Clear completed", "Delete list", "Pin", "Unpin", "Mute", "Unmute", "You can pin up to # chats"]');
    for (const lg2 of ["de", "es", "fr", "pt", "ru", "ar", "az", "id", "ja"]) { const pk = JSON.parse(fs.readFileSync(path.join(__dirname, fs.existsSync(path.join(__dirname, "public")) ? "public" : "../si", "lang", lg2 + ".json"), "utf8")); keys.forEach(k => ok(pk[k], lg2 + " " + k)); }
    console.log("pack45 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, e.stack.split("\n")[1]); process.exit(1); }
});
