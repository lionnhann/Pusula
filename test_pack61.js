// Paket 61: profil rozet vitrini
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p61-" + process.pid + "-" + Date.now() + ".db");
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
    ok((await call("/api/social/ach_showcase", { ids: [] })).s === 401, "auth");
    let r = await so("achievements", {}, A); ok(Array.isArray(r.showcase) && r.showcase.length === 0, "empty showcase initially");
    ok((await so("ach_showcase", { ids: "post1" }, A)).error === "bad_ids", "ids must be array");
    ok((await so("ach_showcase", { ids: ["post1"] }, A)).error === "not_earned", "cannot show unearned");
    ok((await so("ach_showcase", { ids: ["nope"] }, A)).error === "not_earned", "unknown id");
    const p1 = await so("post", { kind: "text", text: "ilk" }, A); ok(p1.ok, "post");
    await so("follow", { handle: "ali", on: true }, B);
    r = await so("ach_showcase", { ids: ["post1", "post1"] }, A); ok(r.ok && r.showcase.length === 1 && r.showcase[0] === "post1", "deduped + saved " + JSON.stringify(r));
    r = await so("achievements", {}, A); ok(r.showcase[0] === "post1", "achievements returns showcase");
    let u = await so("user", { handle: "ali" }, B); ok(u.showcase.length === 1 && u.showcase[0] === "post1", "visible to others");
    u = await so("user", { handle: "bora" }, A); ok(Array.isArray(u.showcase) && u.showcase.length === 0, "others without showcase get []");
    ok((await so("ach_showcase", { ids: ["post1", "like10", "fol10", "cap1"] }, A)).error === "showcase_max", "max 3 enforced before earned check");
    ok((await so("ach_showcase", { ids: ["post1", "like10"] }, A)).error === "not_earned", "mix with unearned rejected");
    // rozet kaybolursa vitrinden de düşer
    await so("post_archive", { id: p1.id, on: true }, A);
    u = await so("user", { handle: "ali" }, B); ok(u.showcase.length === 0, "lost badge hidden from profile");
    await so("post_archive", { id: p1.id, on: false }, A); u = await so("user", { handle: "ali" }, B); ok(u.showcase.length === 1, "back when earned again");
    r = await so("ach_showcase", { ids: [] }, A); ok(r.ok && r.showcase.length === 0, "clear"); u = await so("user", { handle: "ali" }, B); ok(u.showcase.length === 0, "cleared on profile");
    // üç rozet: gönderi, takipçi dışı → 10 gönderi
    const uA = uid("ali"), tnow = Date.now(), D = 86400e3;
    for (let i = 1; i <= 9; i++) db.prepare("INSERT INTO posts(id,user_id,kind,text,media,created) VALUES(?,?,?,?,?,?)").run("s" + i, uA, "text", "s", "", tnow - i * D);
    r = await so("ach_showcase", { ids: ["post1", "post10", "streak7"] }, A); ok(r.ok && r.showcase.length === 3, "three allowed: " + JSON.stringify(r));
    u = await so("user", { handle: "ali" }, B); ok(u.showcase.join() === "post1,post10,streak7", "order kept");
    const html = fs.readFileSync(fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public/index.html") : path.join(__dirname, "..", "si/index.html"), "utf8");
    ["data-achs=", "SOACHG", "bzClInc", "Geçerlilik tarihi", "ach_showcase"].forEach(k => ok(html.includes(k), "client has " + k));
    console.log("pack61 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
