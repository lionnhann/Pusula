// Paket 65: kullanıcı listeleri
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p65-" + process.pid + "-" + Date.now() + ".db");
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


    const A = await reg("ali"), B = await reg("bora"), C = await reg("can"), D = await reg("dara");
    ok((await call("/api/social/ulist_all", {})).s === 401, "auth");
    ok((await so("ulist_all", {}, A)).lists.length === 0, "empty");
    ok((await so("ulist_save", { name: "  " }, A)).error === "list_name", "name required");
    let r = await so("ulist_save", { name: "  Tasarımcı   dostlar " }, A); ok(r.ok && r.name === "Tasarımcı dostlar", "created, spaces collapsed"); const L1 = r.id;
    ok((await so("ulist_save", { id: L1, name: "Tasarım" }, A)).name === "Tasarım", "rename");
    ok((await so("ulist_save", { id: L1, name: "Hack" }, B)).s === 404, "cannot rename foreign list");
    ok((await so("ulist_member", { id: L1, handle: "bora", on: true }, B)).s === 404, "cannot add to foreign list");
    ok((await so("ulist_member", { id: L1, handle: "yokkk", on: true }, A)).s === 404, "unknown handle");
    ok((await so("ulist_member", { id: L1, handle: "ali", on: true }, A)).error === "self", "cannot add self");
    ok((await so("ulist_member", { id: L1, handle: "bora", on: true }, A)).ok, "add bora"); ok((await so("ulist_member", { id: L1, handle: "bora", on: true }, A)).ok, "add twice is idempotent");
    ok((await so("ulist_member", { id: L1, handle: "can", on: true }, A)).ok, "add can");
    let l = await so("ulist_all", { handle: "bora" }, A); ok(l.lists[0].n === 2 && l.lists[0].has === true, "count + has flag: " + JSON.stringify(l));
    ok((await so("ulist_all", { handle: "dara" }, A)).lists[0].has === false, "has false for non-member");
    ok((await so("ulist_all", {}, B)).lists.length === 0, "lists are private");
    let m = await so("ulist_members", { id: L1 }, A); ok(m.members.length === 2 && m.name === "Tasarım", "members listed");
    ok((await so("ulist_members", { id: L1 }, B)).s === 404, "members of foreign list refused");
    await so("post", { text: "bora gönderisi", kind: "text" }, B); await so("post", { text: "can gönderisi", kind: "text" }, C); await so("post", { text: "dara gönderisi", kind: "text" }, D); await so("post", { text: "ali gönderisi", kind: "text" }, A);
    let f = await so("ulist_feed", { id: L1 }, A); ok(f.posts.length === 2 && f.posts.every(p => ["bora", "can"].includes(p.handle || (p.user && p.user.handle) || p.by)), "feed has only members: " + JSON.stringify(f.posts.map(p => p.text)));
    ok(f.posts.map(p => p.text).sort().join() === "bora gönderisi,can gönderisi", "feed texts");
    ok((await so("ulist_feed", { id: L1 }, B)).s === 404, "feed of foreign list refused");
    await so("profile", { private: true }, C); f = await so("ulist_feed", { id: L1 }, A); ok(f.posts.length === 1, "private non-followed member hidden from feed");
    await so("follow", { handle: "can", on: true }, A); await so("follow_answer", {}, A).catch(() => 0);
    await so("profile", { private: false }, C);
    await so("block", { handle: "bora", on: true }, A); f = await so("ulist_feed", { id: L1 }, A); ok(!f.posts.some(p => p.text === "bora gönderisi"), "blocked member excluded from feed");
    m = await so("ulist_members", { id: L1 }, A); ok(!m.members.some(x => x.handle === "bora"), "blocked member excluded from list view");
    ok((await so("ulist_member", { id: L1, handle: "bora", on: true }, A)).error === "blocked", "cannot add blocked user");
    await so("block", { handle: "bora", on: false }, A);
    r = await so("ulist_member", { id: L1, handle: "bora", on: false }, A); ok(r.ok && r.on === false, "remove member"); ok((await so("ulist_all", {}, A)).lists[0].n === 1, "count after removal");
    for (let i = 0; i < 9; i++) await so("ulist_save", { name: "L" + i }, A);
    ok((await so("ulist_save", { name: "fazla" }, A)).error === "too_many_lists", "max 10 lists");
    db.exec("PRAGMA foreign_keys=OFF"); for (let i = 0; i < 100; i++) db.prepare("INSERT OR IGNORE INTO ulist_members(list_id,member,added) VALUES(?,?,?)").run(L1, "fake" + i, Date.now()); db.exec("PRAGMA foreign_keys=ON");
    ok((await so("ulist_member", { id: L1, handle: "dara", on: true }, A)).error === "list_full", "max 100 members");
    r = await so("ulist_del", { id: L1 }, B); ok(r.removed === false, "cannot delete foreign list");
    r = await so("ulist_del", { id: L1 }, A); ok(r.removed === true, "deleted"); ok(db.prepare("SELECT COUNT(*) n FROM ulist_members WHERE list_id=?").get(L1).n === 0, "members cascade-deleted");
    ok((await so("ulist_del", { id: "yok" }, A)).removed === false, "unknown id harmless");
    const html = fs.readFileSync(fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public/index.html") : path.join(__dirname, "..", "si/index.html"), "utf8");
    ["soUl", "data-ul=", "ulist_feed", "bzTg", "data-tg"].forEach(k => ok(html.includes(k), "client has " + k));
    console.log("pack65 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
