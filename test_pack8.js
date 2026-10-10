// Paket 8: topluluk etkinlikleri. node test_pack8.js
const assert = require("assert");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-p8-" + process.pid + ".db");
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
    await so("c_create", { handle: "oda", name: "Oda" }, A); await so("c_create", { handle: "gizli", name: "Gizli", priv: true }, A);
    await so("c_join", { handle: "oda", on: true }, B);
    const soon = Date.now() + 3 * 864e5;
    let r = await so("ev_new", { handle: "oda", title: "Buluşma", at: soon }, B); ok(r.s === 403, "member cannot create");
    r = await so("ev_new", { handle: "oda", title: "", at: soon }, A); ok(r.s === 400, "title required");
    r = await so("ev_new", { handle: "oda", title: "Geçmiş", at: Date.now() - 864e5 }, A); ok(r.s === 400 && r.error === "bad_date", "past rejected");
    r = await so("ev_new", { handle: "oda", title: "Çok uzak", at: Date.now() + 400 * 864e5 }, A); ok(r.s === 400, "too far rejected");
    r = await so("ev_new", { handle: "oda", title: "Kahve buluşması", place: "Kadıköy", about: "Herkes gelsin", at: soon }, A); ok(r.s === 200, "create"); const E = r.id;
    r = await so("ev_new", { handle: "oda", title: "Sonraki", at: soon + 864e5 }, A); ok(r.s === 200, "second");
    r = await so("ev_list", { handle: "oda" }, B); ok(r.events.length === 2 && r.events[0].id === E && r.events[0].going === 1 && r.events[0].mine === "" && r.events[0].by === "ali", "list ordered by date");
    r = await so("ev_rsvp", { id: E, status: "going" }, C); ok(r.s === 403, "non-member cannot rsvp");
    r = await so("ev_rsvp", { id: E, status: "going" }, B); ok(r.s === 200, "rsvp");
    r = await so("ev_list", { handle: "oda" }, B); ok(r.events[0].going === 2 && r.events[0].mine === "going", "count updates");
    r = await so("ev_rsvp", { id: E, status: "maybe" }, B); r = await so("ev_list", { handle: "oda" }, A); ok(r.events[0].going === 1 && r.events[0].maybe === 1, "change to maybe");
    r = await so("ev_rsvp", { id: E, status: "none" }, B); r = await so("ev_list", { handle: "oda" }, A); ok(r.events[0].maybe === 0 && r.events[0].mine === "going", "cancel rsvp");
    // özel topluluk
    r = await so("ev_new", { handle: "gizli", title: "Gizli buluşma", at: soon }, A); const G = r.id; ok(r.s === 200, "private event");
    r = await so("ev_list", { handle: "gizli" }, C); ok(r.s === 404, "private list hidden");
    r = await so("ev_rsvp", { id: G, status: "going" }, C); ok(r.s === 404, "private rsvp hidden");
    // silme
    r = await so("ev_del", { id: E }, B); ok(r.s === 403, "member cannot delete");
    r = await so("ev_del", { id: E }, A); ok(r.s === 200, "creator deletes");
    r = await so("ev_list", { handle: "oda" }, B); ok(r.events.length === 1, "deleted gone");
    await so("c_delete", { handle: "oda" }, A); r = await so("ev_list", { handle: "oda" }, B); ok(r.s === 404, "community delete cascades");
    console.log("paket 8 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
