// Paket 20: otomatik gizleme, kelime filtresi, yönetici geri yükle. node test_pack20.js
const assert = require("assert"), path = require("path"), os = require("os");
const DB = path.join(os.tmpdir(), "pusula-p20-" + process.pid + ".db");
process.env.DB_PATH = DB; process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0";
process.env.ADMIN_TOKEN = "adm-test-token-123456"; process.env.REPORT_HIDE = "3"; process.env.REPORT_MIN_AGE_H = "1"; process.env.BLOCKED_WORDS = "kötüsöz, Çirkin Kelime ,x";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const { server } = require("./server.js");
server.listen(0, async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (p, b, tok, adm) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}, adm ? { "x-admin-token": process.env.ADMIN_TOKEN } : {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
  const so = (p, b, t) => call("/api/social/" + p, b, t);
  try {
    const reg = async (e, nm, h) => { const t = (await call("/api/register", { email: e, password: "parola-123", name: nm })).token; await so("profile", { handle: h }, t); return t; };
    const O = await reg("o@x.com", "Owner", "owner"), A = await reg("a@x.com", "A", "aaa"), B = await reg("b@x.com", "B", "bbb"), C = await reg("c@x.com", "C", "ccc"), D = await reg("d@x.com", "D", "ddd"), V = await reg("v@x.com", "V", "vvv");
    const { DatabaseSync } = require("node:sqlite"); const d = new DatabaseSync(DB);
    d.prepare("UPDATE users SET created=created-7200000 WHERE email IN ('a@x.com','b@x.com','c@x.com','o@x.com')").run();
    // kelime filtresi
    let r = await so("post", { kind: "text", text: "Bu bir KÖTÜSÖZ içerir" }, O); ok(r.s === 400 && r.error === "blocked_content", "word blocked (case)");
    r = await so("post", { kind: "text", text: "çirkin   kelime burada" }, O); ok(r.error === "blocked_content", "multi-word blocked");
    r = await so("post", { kind: "text", text: "k.ö.t.ü.s.ö.z" }, O); ok(r.error === "blocked_content", "separator evasion blocked");
    r = await so("post", { kind: "text", text: "x" }, O); ok(r.ok, "1-char entries ignored");
    r = await so("post", { kind: "text", text: "Güzel bir gün" }, O); ok(r.ok, "clean post ok"); const id = r.id;
    r = await so("post_edit", { id, text: "kötüsöz oldu" }, O); ok(r.error === "blocked_content", "edit blocked");
    r = await so("comment", { id, text: "kötüsöz" }, A); ok(r.error === "blocked_content", "comment blocked");
    r = await so("comment", { id, text: "güzel" }, A); ok(r.ok, "clean comment ok");
    // otomatik gizleme
    const feed = async t => (await so("feed", { mode: "all" }, t)).posts.map(p => p.id);
    ok((await feed(V)).includes(id), "visible before reports");
    await so("report", { kind: "post", target: id, reason: "a" }, A);
    await so("report", { kind: "post", target: id, reason: "a again" }, A);
    await so("report", { kind: "post", target: id, reason: "b" }, B);
    ok((await feed(V)).includes(id), "2 distinct reporters (dup ignored) -> still visible");
    await so("report", { kind: "post", target: id, reason: "new acct" }, D);
    ok((await feed(V)).includes(id), "too-new reporter does not count");
    await so("report", { kind: "post", target: id, reason: "owner" }, O);
    ok((await feed(V)).includes(id), "owner self-report does not count");
    await so("report", { kind: "post", target: id, reason: "c" }, C);
    ok(!(await feed(V)).includes(id), "3rd distinct trusted reporter hides");
    r = await so("feed", { mode: "user", handle: "owner" }, V); ok(!r.posts.some(p => p.id === id), "hidden from others' profile view");
    r = await so("feed", { mode: "user", handle: "owner" }, O); ok(r.posts.some(p => p.id === id), "owner still sees own");
    r = await so("getpost", { id }, V); ok(r.s === 404, "direct view hidden");
    // yönetici
    r = await call("/api/admin/hidden", {}); ok(r.s === 401, "admin guard");
    r = await call("/api/admin/hidden", {}, null, true); ok(r.posts.length === 1 && r.posts[0].id === id && r.posts[0].reports === 5, "admin sees hidden with report count");
    r = await call("/api/admin/restore", { id: "nope" }, null, true); ok(r.s === 404, "restore unknown");
    r = await call("/api/admin/restore", { id }, null, true); ok(r.ok, "restore");
    ok((await feed(V)).includes(id), "visible after restore");
    const nr = await so("report", { kind: "post", target: id, reason: "again" }, C);
    await so("report", { kind: "post", target: id, reason: "x" }, A); await so("report", { kind: "post", target: id, reason: "x" }, B);
    ok((await feed(V)).includes(id), "reviewed post is not re-hidden");
    r = await call("/api/admin/hidden", {}, null, true); ok(r.posts.length === 0, "none hidden");
    d.close();
    console.log("paket 20 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
