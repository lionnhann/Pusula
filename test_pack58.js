// Paket 58: takip dengesi + özel notlar
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p58-" + process.pid + "-" + Date.now() + ".db");
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
    ok((await call("/api/social/follow_balance", {})).s === 401, "auth");
    let r = await so("follow_balance", {}, A); ok(r.notBackTotal === 0 && r.fansTotal === 0 && r.mutual === 0 && r.following === 0, "empty " + JSON.stringify(r));
    await so("follow", { handle: "bora", on: true }, A); await so("follow", { handle: "can", on: true }, A); await so("follow", { handle: "ali", on: true }, B); await so("follow", { handle: "ali", on: true }, D);
    r = await so("follow_balance", {}, A);
    ok(r.following === 2 && r.followers === 2, "counts " + JSON.stringify(r)); ok(r.mutual === 1, "mutual = bora");
    ok(r.notBackTotal === 1 && r.notBack[0].handle === "can", "can does not follow back");
    ok(r.fansTotal === 1 && r.fans[0].handle === "dara", "dara is a fan I do not follow");
    ok(r.notBack[0].avatar === "" || typeof r.notBack[0].avatar === "string", "avatar field");
    await so("block", { handle: "can", on: true }, A); r = await so("follow_balance", {}, A); ok(r.notBackTotal === 0, "blocked excluded");
    await so("block", { handle: "can", on: false }, A); await so("follow", { handle: "can", on: true }, A);
    db.prepare("INSERT INTO bans(user_id,reason,created) VALUES(?,?,?)").run(uid("dara"), "t", Date.now()); r = await so("follow_balance", {}, A); ok(r.fansTotal === 0, "banned excluded");
    r = await so("follow_balance", {}, C); ok(r.following === 0 && r.fansTotal === 1 && r.fans[0].handle === "ali", "can sees ali as a fan");
    // ---- özel notlar
    ok((await call("/api/social/pnote_set", { handle: "bora", note: "x" })).s === 401, "pn auth");
    ok((await so("pnote_set", { handle: "ali", note: "ben" }, A)).s === 404, "no self note");
    ok((await so("pnote_set", { handle: "yokkk", note: "x" }, A)).s === 404, "missing handle");
    r = await so("pnote_set", { handle: "bora", note: "  Tasarımcı, <b>fiyat</b> sor  " }, A); ok(r.ok && r.note === "Tasarımcı, <b>fiyat</b> sor", "set + trimmed (client escapes on render): " + r.note);
    let l = await so("pnote_list", {}, A); ok(l.count === 1 && l.notes.bora === r.note, "listed by lowercase handle");
    ok((await so("pnote_list", {}, B)).count === 0, "private to owner");
    await so("pnote_set", { handle: "bora", note: "güncel" }, A); l = await so("pnote_list", {}, A); ok(l.count === 1 && l.notes.bora === "güncel", "overwrite");
    await so("pnote_set", { handle: "can", note: "x".repeat(500) }, A); l = await so("pnote_list", {}, A); ok(l.notes.can.length <= 200, "length capped " + l.notes.can.length);
    await so("pnote_set", { handle: "bora", note: "" }, A); l = await so("pnote_list", {}, A); ok(l.count === 1 && !l.notes.bora, "empty deletes");
    // --- 300 not sınırı
    db.exec("PRAGMA foreign_keys=OFF");
    for (let i = 0; i < 300; i++) db.prepare("INSERT OR IGNORE INTO user_notes(owner,target,note,created) VALUES(?,?,?,?)").run(uid("can"), "fake" + i, "n", Date.now());
    db.exec("PRAGMA foreign_keys=ON");
    const full = await so("pnote_set", { handle: "ali", note: "yeni" }, C); ok(full.s === 400 && full.error === "too_many_notes", "cap at 300: " + JSON.stringify(full));
    db.prepare("DELETE FROM user_notes WHERE owner=? AND target='fake0'").run(uid("can"));
    ok((await so("pnote_set", { handle: "ali", note: "yeni" }, C)).ok, "slot freed after delete");
    const html = fs.readFileSync(fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public/index.html") : path.join(__dirname, "..", "si/index.html"), "utf8");
    ["soFb", "soPn", "data-fbl=", "data-pn=", "bzVat", "bzLogEd", "bzLastTalk", "lgs:", "log:cArr"].forEach(k => ok(html.includes(k), "client has " + k));
    console.log("pack58 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
