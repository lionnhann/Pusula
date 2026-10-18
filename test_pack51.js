// Paket 54: paylaşım içgörüsü (seri + en iyi saat)
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p51-" + process.pid + "-" + Date.now() + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0"; process.env.EXPIRE_TICK_MS = "3600000";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const { server, db } = require("./server.js"), D = 86400e3;
server.listen(0, async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (p, b, tok) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
  const so = (p, b, t) => call("/api/social/" + p, b, t);
  try {
    const reg = async (e, nm, h) => { const x = await call("/api/register", { email: e, password: "kaplan-gece-51", name: nm }); await so("profile", { handle: h }, x.token); return x.token; };
    const A = await reg("a@x.com", "Ali", "ali"), B = await reg("b@x.com", "Bora", "bora"), C = await reg("c@x.com", "Can", "can");
    ok((await call("/api/social/insights", {})).s === 401, "needs auth");
    const empty = await so("insights", { tz: 0 }, C); ok(empty.s === 200 && empty.streak === 0 && empty.best === 0 && empty.total === 0 && empty.slots.length === 0, "empty user");
    const t = Date.now(), dayStart = Math.floor(t / D) * D;
    const mk = async (tok, created) => { const r = await so("post", { kind: "text", text: "p" + Math.random() }, tok); ok(r.ok, "post"); db.prepare("UPDATE posts SET created=? WHERE id=?").run(created, r.id); return r.id; };
    // Ali: bugün, dün, evvelsi gün (seri 3), 5 gün önce (kopuk), 6 ve 7 gün önce (ikili) -> best 3
    const at = (k, h) => dayStart - k * D + h * 3600e3 + 600e3;
    const ids = [];
    for (const [k, h] of [[0, 8], [1, 20], [2, 20], [5, 20], [6, 20], [7, 9]]) ids.push(await mk(A, at(k, h)));
    // 20:00 saatindeki gönderilere etkileşim ver
    db.prepare("INSERT INTO likes(post_id,user_id) VALUES(?,?)").run(ids[1], (db.prepare("SELECT user_id FROM profiles WHERE handle='bora'").get()).user_id);
    await so("comment", { id: ids[2], text: "güzel" }, B);
    const r = await so("insights", { tz: 0 }, A);
    ok(r.s === 200 && r.total === 6, "total 6: " + JSON.stringify(r));
    ok(r.streak === 3, "streak 3: " + r.streak); ok(r.best === 3, "best 3: " + r.best);
    ok(r.slots.length >= 1 && r.slots[0].hour === 20, "best hour 20: " + JSON.stringify(r.slots));
    ok(r.slots[0].posts === 4 && r.slots[0].avg > 0, "slot stats " + JSON.stringify(r.slots[0]));
    ok(r.slots.length <= 3, "max 3 slots");
    ok(Array.isArray(r.top) && r.top.length === 2 && r.top[0].id === ids[2] && r.top[0].comments === 1 && r.top[1].id === ids[1] && r.top[1].likes === 1, "top posts by engagement: " + JSON.stringify(r.top));
    ok(typeof r.top[0].text === "string" && r.top[0].text.length <= 60, "top text snippet");
    ok(r.growth && r.growth.weeks.length === 8 && r.growth.total === 0 && r.growth.gain7 === 0, "growth empty");
    await so("follow", { handle: "ali", on: true }, B); await so("follow", { handle: "ali", on: true }, C);
    const rg = await so("insights", { tz: 0 }, A); ok(rg.growth.total === 2 && rg.growth.gain7 === 2 && rg.growth.weeks[7] === 2 && rg.growth.weeks[6] === 0, "growth counts: " + JSON.stringify(rg.growth));
    db.prepare("UPDATE follows SET created=? WHERE follower=(SELECT user_id FROM profiles WHERE handle='can') AND followee=(SELECT user_id FROM profiles WHERE handle='ali')").run(Date.now() - 10 * D);
    const rg2 = await so("insights", { tz: 0 }, A); ok(rg2.growth.gain7 === 1 && rg2.growth.weeks[6] === 1 && rg2.growth.total === 2, "older follow lands in previous week: " + JSON.stringify(rg2.growth));
    // tz kayması: +180 dk -> 20:00 UTC = 23:00 yerel
    const r3 = await so("insights", { tz: 180 }, A); ok(r3.slots[0].hour === 23, "tz shift: " + JSON.stringify(r3.slots));
    ok((await so("insights", { tz: 99999 }, A)).s === 200 && (await so("insights", { tz: "x" }, A)).s === 200, "bad tz tolerated");
    // dün başlayan seri hâlâ sayılır (bugün paylaşım yok)
    db.prepare("DELETE FROM posts WHERE id=?").run(ids[0]); const r2 = await so("insights", { tz: 0 }, A);
    ok(r2.streak === 2, "streak from yesterday: " + r2.streak);
    // yeterli veri yoksa saat önerisi yok
    for (let i = 0; i < 3; i++) await mk(B, at(i, 10)); const rb = await so("insights", { tz: 0 }, B);
    ok(rb.total === 3 && rb.slots.length === 0 && rb.streak === 3, "needs 5 posts for slots: " + JSON.stringify(rb));
    // başkasının verisi karışmaz, arşivli/gizli sayılmaz
    const arch = await mk(B, at(3, 10)); db.prepare("UPDATE posts SET archived=1 WHERE id=?").run(arch);
    const hid = await mk(B, at(4, 10)); db.prepare("UPDATE posts SET hidden=1 WHERE id=?").run(hid);
    const rb2 = await so("insights", { tz: 0 }, B); ok(rb2.total === 3 && rb2.streak === 3, "archived/hidden ignored: " + JSON.stringify(rb2));
    const html = fs.readFileSync(fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public/index.html") : path.join(__dirname, "..", "si/index.html"), "utf8");
    ["\"insights\"", "bzTaxCal", "bzSleepy", "Vergi takvimi", "Uyuyan müşteriler"].forEach(k => ok(html.includes(k), "client has " + k));
    console.log("pack51 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
