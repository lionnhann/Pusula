// Paket 69: gönderi hatırlatıcıları
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p69-" + process.pid + "-" + Date.now() + ".db");
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
    ok((await call("/api/social/remind_list", {})).s === 401, "auth");
    ok((await so("remind_list", {}, A)).items.length === 0, "empty");
    await so("post", { text: "bora gönderisi", kind: "text" }, B); await so("post", { text: "can gönderisi", kind: "text" }, C);
    const pid = h => db.prepare("SELECT p.id FROM posts p JOIN profiles f ON f.user_id=p.user_id WHERE f.handle=?").get(h).id;
    const pb = pid("bora"), pc = pid("can"), H = 3600e3;
    ok((await so("remind_set", { id: "yok", at: Date.now() + H }, A)).s === 404, "unknown post");
    ok((await so("remind_set", { id: pb, at: Date.now() - 1000 }, A)).error === "bad_time", "past time refused");
    ok((await so("remind_set", { id: pb, at: Date.now() + 10e3 }, A)).error === "bad_time", "too soon refused");
    ok((await so("remind_set", { id: pb, at: Date.now() + 100 * 864e5 }, A)).error === "bad_time", "too far refused");
    ok((await so("remind_set", { id: pb, at: "abc" }, A)).error === "bad_time", "garbage time");
    ok((await so("remind_set", { id: pb, at: Date.now() + 2 * H }, A)).ok, "set 1");
    ok((await so("remind_set", { id: pc, at: Date.now() + H }, A)).ok, "set 2");
    let r = await so("remind_list", {}, A);
    ok(r.items.length === 2 && r.items[0].handle === "can" && r.items[1].handle === "bora", "sorted by time: " + JSON.stringify(r.items.map(i => i.handle)));
    ok(r.due === 0 && r.items[0].snippet === "can gönderisi", "not due yet + snippet");
    ok((await so("remind_set", { id: pb, at: Date.now() + 5 * H }, A)).ok && (await so("remind_list", {}, A)).items.length === 2, "re-set updates, no duplicate");
    ok((await so("remind_list", {}, B)).items.length === 0, "personal");
    db.prepare("UPDATE post_rem SET at=? WHERE user_id=(SELECT user_id FROM profiles WHERE handle='ali') AND post_id=?").run(Date.now() - 1000, pc);
    r = await so("remind_list", {}, A); ok(r.due === 1 && r.items[0].due === true && r.items[1].due === false, "due flag");
    await so("block", { handle: "can", on: true }, A); r = await so("remind_list", {}, A); ok(r.items.length === 1 && r.items[0].handle === "bora", "blocked author hidden");
    await so("block", { handle: "can", on: false }, A);
    ok((await so("remind_set", { id: pc, at: Date.now() + H }, A)).ok, "set after unblock");
    await so("block", { handle: "bora", on: true }, A); ok((await so("remind_set", { id: pb, at: Date.now() + H }, A)).s === 404, "cannot set on blocked author"); await so("block", { handle: "bora", on: false }, A);
    await so("profile", { private: true }, B); ok((await so("remind_list", {}, A)).items.every(i => i.handle !== "bora"), "private non-followed hidden"); ok((await so("remind_set", { id: pb, at: Date.now() + H }, A)).s === 404, "cannot set on private"); await so("profile", { private: false }, B);
    ok((await so("remind_set", { id: pc, on: false }, A)).ok, "delete"); ok(!(await so("remind_list", {}, A)).items.some(i => i.handle === "can"), "gone");
    db.prepare("DELETE FROM posts WHERE id=?").run(pb); ok((await so("remind_list", {}, A)).items.length === 0, "removed with post (cascade)");
    const D = await reg("dara"), E = await reg("ece");
    for (let i = 0; i < 26; i++) { await so("post", { text: "dolgu d" + i, kind: "text" }, D); await so("post", { text: "dolgu e" + i, kind: "text" }, E); }
    const ids = db.prepare("SELECT id FROM posts WHERE user_id IN (SELECT user_id FROM profiles WHERE handle IN ('dara','ece'))").all().map(x => x.id);
    let okc = 0, last; for (const id of ids) { last = await so("remind_set", { id, at: Date.now() + H }, A); if (last.ok) okc++; }
    ok(okc === 50 && last.error === "too_many_reminders", "cap of 50: " + okc + " " + JSON.stringify(last));
    const html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
    ["remind_set", "remind_list", "data-prm", "bzMeetings", "bzSuppliers", "mtsave", "spsave", "o.mts=", "o.sups="].forEach(k => ok(html.includes(k), "client has " + k));
    console.log("pack69 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
