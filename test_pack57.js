// Paket 57: başarılar + gizlilik kontrolü
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p57-" + process.pid + "-" + Date.now() + ".db");
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
    const A = await reg("ali"), B = await reg("bora"), C = await reg("can");
    const ach = async t => (await so("achievements", { tz: 180 }, t));
    ok((await call("/api/social/achievements", {})).s === 401, "needs auth");
    let r = await ach(A); ok(r.total === 12 && r.badges.length === 12 && r.done === 0, "fresh: 0/12");
    ok(r.badges.every(b => b.v === 0 && !b.done && b.goal > 0), "fresh values");
    const p1 = await so("post", { kind: "text", text: "ilk" }, A); ok(p1.ok, "post");
    r = await ach(A); const g = id => r.badges.find(b => b.id === id);
    ok(g("post1").done && g("post10").v === 1 && !g("post10").done, "first post earned, progress on 10");
    ok(g("streak7").v === 1, "streak progress 1 day");
    await so("like", { id: p1.id, on: true }, B); await so("like", { id: p1.id, on: true }, C); await so("like", { id: p1.id, on: true }, A);
    r = await ach(A); ok(g("like10").v === 2, "likes received excludes self: " + g("like10").v);
    await so("follow", { handle: "ali", on: true }, B); r = await ach(A); ok(g("fol10").v === 1, "follower counted");
    for (let i = 0; i < 3; i++) await so("comment", { id: p1.id, text: "c" + i }, A);
    r = await ach(A); ok(g("cmt10").v === 3, "comments written counted");
    const hid = await so("post", { kind: "text", text: "gizli" }, A); await so("post_archive", { id: hid.id, on: true }, A);
    r = await ach(A); ok(g("post10").v === 2 - 1 || g("post10").v === 1, "archived posts not counted: " + g("post10").v);
    const at = Date.now() + 2 * 86400e3; const cap = await so("capsule_new", { text: "sır", hint: "x", unlock: at }, A); ok(cap.ok, "capsule");
    r = await ach(A); ok(g("cap1").done, "capsule badge");
    ok(r.done === r.badges.filter(b => b.done).length, "done matches");
    // seri: art arda 7 gün
    const uA = db.prepare("SELECT user_id FROM profiles WHERE handle='ali'").get().user_id, D = 86400e3, tnow = Date.now();
    for (let i = 1; i <= 9; i++) db.prepare("INSERT INTO posts(id,user_id,kind,text,media,created) VALUES(?,?,?,?,?,?)").run("seed" + i, uA, "text", "s", "", tnow - i * D);
    r = await ach(A); ok(g("streak7").done && !g("streak30").done, "7-day streak earned: " + g("streak7").v); ok(g("post10").done, "10 posts earned");
    // ---- gizlilik kontrolü
    ok((await call("/api/social/privacy_check", {})).s === 401, "pc auth");
    let pc = await so("privacy_check", {}, B); ok(pc.private === false && pc.totp === false && pc.blocks === 0 && pc.mutes === 0 && pc.words === 0 && pc.closeFriends === 0 && pc.requests === 0, "pc fresh " + JSON.stringify(pc));
    await so("mw_set", { word: "spoiler" }, B); await so("block", { handle: "can", on: true }, B); await so("mute", { handle: "ali", on: true }, B);
    pc = await so("privacy_check", {}, B); ok(pc.words === 1 && pc.blocks === 1 && pc.mutes === 1, "pc counts " + JSON.stringify(pc));
    await so("follow", { handle: "bora", on: true }, A); await so("cf_set", { handle: "ali", on: true }, B); pc = await so("privacy_check", {}, B); ok(pc.closeFriends === 1, "close friends counted");
    await so("profile", { private: true }, C); pc = await so("privacy_check", {}, C); ok(pc.private === true, "private flag");
    const html = fs.readFileSync(fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public/index.html") : path.join(__dirname, "..", "si/index.html"), "utf8");
    ["soAch", "soPcc", "data-ach=", "data-pcc=", "lprs:", "bzPromBroken", "promise:cDate"].forEach(k => ok(html.includes(k), "client has " + k));
    console.log("pack57 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
