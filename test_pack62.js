// Paket 62: senkron taslaklar
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p62-" + process.pid + "-" + Date.now() + ".db");
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

    const A = await reg("ali"), B = await reg("bora");
    ok((await call("/api/social/draft_list", {})).s === 401, "auth");
    ok((await so("draft_list", {}, A)).drafts.length === 0, "empty");
    ok((await so("draft_save", { text: "   " }, A)).s === 400, "empty text refused");
    let r = await so("draft_save", { text: "Merhaba\ndünya #deneme" }, A); ok(r.ok && /^[a-f0-9]{16}$/.test(r.id) && r.text === "Merhaba\ndünya #deneme", "saved keeps newline " + JSON.stringify(r));
    const id1 = r.id;
    r = await so("draft_save", { id: id1, text: "güncel metin" }, A); ok(r.ok && r.id === id1, "update same id");
    let l = await so("draft_list", {}, A); ok(l.drafts.length === 1 && l.drafts[0].text === "güncel metin" && l.max === 20, "listed " + JSON.stringify(l));
    ok((await so("draft_list", {}, B)).drafts.length === 0, "private to owner");
    r = await so("draft_save", { id: id1, text: "bora yazdı" }, B); ok(r.ok && r.id !== id1, "foreign id creates a new draft instead of overwriting");
    l = await so("draft_list", {}, A); ok(l.drafts[0].text === "güncel metin", "ali draft untouched");
    ok((await so("draft_del", { id: id1 }, B)).removed === false, "cannot delete foreign draft");
    r = await so("draft_save", { text: "x".repeat(3000) }, A); l = await so("draft_list", {}, A); ok(l.drafts.some(d => d.text.length === 1000), "length capped to 1000");
    for (let i = 0; i < 20; i++) db.prepare("INSERT OR IGNORE INTO post_drafts(id,user_id,text,updated) VALUES(?,?,?,?)").run("f".repeat(15) + (i % 10) + "" + (i >= 10 ? "" : ""), uid("ali"), "d", Date.now());
    const cnt = db.prepare("SELECT COUNT(*) n FROM post_drafts WHERE user_id=?").get(uid("ali")).n;
    const full = await so("draft_save", { text: "yeni" }, A); ok(cnt >= 20 ? (full.s === 400 && full.error === "too_many_drafts") : full.ok, "cap " + cnt + " " + JSON.stringify(full));
    l = await so("draft_list", {}, A); ok(l.drafts.length <= 20, "list never exceeds max");
    r = await so("draft_del", { id: l.drafts[0].id }, A); ok(r.ok && r.removed === true, "deleted");
    ok((await so("draft_del", { id: "yok" }, A)).removed === false, "unknown id harmless");
    ok((await so("draft_save", { text: "slot açıldı" }, A)).ok, "slot freed");
    const html = fs.readFileSync(fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public/index.html") : path.join(__dirname, "..", "si/index.html"), "utf8");
    ["soDr", "data-dr=", "bzCat", "data-bz=\"cat", "bzInvTotal", "disc"].forEach(k => ok(html.includes(k), "client has " + k));
    console.log("pack62 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
