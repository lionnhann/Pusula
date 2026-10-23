// Paket 83: kaybolan mesajlar ve randevu / rezervasyon
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p83-" + process.pid + "-" + Date.now() + ".db");
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
    const A = await reg("ali"), B = await reg("bora"), C = await reg("cem");
    const pair = (a, b) => (a < b ? a + ":" + b : b + ":" + a);
    // ---------- kaybolan mesajlar ----------
    ok((await call("/api/social/ttl_set", { handle: "bora", ttl: 3600 })).s === 401, "auth");
    ok((await so("ttl_set", { handle: "bora", ttl: 123 }, A)).error === "bad_ttl", "bad ttl rejected");
    ok((await so("ttl_set", { handle: "ali", ttl: 3600 }, A)).s === 404, "cannot set on self");
    ok((await so("ttl_set", { handle: "nobody", ttl: 3600 }, A)).s === 404, "unknown peer");
    const ins = (a, b, t) => Number(db.prepare("INSERT INTO msgs(from_id,to_id,text,media,created) VALUES(?,?,?,?,?)").run(uid(a), uid(b), t, "", Date.now()).lastInsertRowid);
    const m0 = ins("ali", "bora", "e2e-eski");
    ok(db.prepare("SELECT exp FROM msgs WHERE id=?").get(m0).exp === 0, "no ttl -> exp 0");
    let r = await so("thread", { handle: "bora" }, A); ok(r.s === 200 && r.ttl === 0 && r.msgs.length === 1 && r.msgs[0].exp === 0, "thread ttl 0");
    r = await so("ttl_set", { handle: "ali", ttl: 3600 }, B); ok(r.ok && r.ttl === 3600, "bora sets 1h: " + JSON.stringify(r));
    ok((await so("thread", { handle: "bora" }, A)).ttl === 3600 && (await so("thread", { handle: "ali" }, B)).ttl === 3600, "both sides see the same ttl");
    const m1 = ins("bora", "ali", "e2e-yeni"), m2 = ins("ali", "bora", "e2e-yeni2");
    const e1 = db.prepare("SELECT exp, created FROM msgs WHERE id=?").get(m1);
    ok(e1.exp === e1.created + 3600e3, "trigger sets exp = created + ttl: " + e1.exp + " vs " + e1.created);
    ok(db.prepare("SELECT exp FROM msgs WHERE id=?").get(m0).exp === 0, "old message untouched");
    r = await so("thread", { handle: "bora" }, A); ok(r.msgs.length === 3 && r.msgs.find(x => x.id === m1).exp === e1.exp, "exp exposed to client");
    // süre dolduğunda silinir (okuma sırasında)
    db.prepare("UPDATE msgs SET exp=? WHERE id=?").run(Date.now() - 1000, m1);
    db.prepare("INSERT INTO msg_stars(user_id,kind,msg_id,created) VALUES(?,?,?,?)").run(uid("ali"), "d", m1, Date.now());
    db.prepare("INSERT INTO reacts(kind,msg_id,user_id,emoji) VALUES(?,?,?,?)").run("d", m1, uid("ali"), "👍");
    r = await so("thread", { handle: "bora" }, A); ok(r.msgs.length === 2 && !r.msgs.some(x => x.id === m1), "expired message removed on read");
    ok(!db.prepare("SELECT 1 FROM msg_stars WHERE msg_id=? AND kind='d'").get(m1) && !db.prepare("SELECT 1 FROM reacts WHERE msg_id=? AND kind='d'").get(m1), "stars and reactions cleaned");
    ok(!!db.prepare("SELECT 1 FROM msgs WHERE id=?").get(m2), "other message stays");
    // gelen kutusu ve sohbet listesi de süresi dolanı temizler
    db.prepare("UPDATE msgs SET exp=? WHERE id=?").run(Date.now() - 5, m2);
    r = await so("inbox", {}, A); ok(r.s === 200, "inbox ok"); ok(!db.prepare("SELECT 1 FROM msgs WHERE id=?").get(m2), "inbox purges expired");
    // kapatınca yeni mesajlar kalıcı olur, eskiler süreleriyle gider
    const m3 = ins("ali", "bora", "e2e-3"); const x3 = db.prepare("SELECT exp FROM msgs WHERE id=?").get(m3).exp; ok(x3 > 0, "still timed while on");
    r = await so("ttl_set", { handle: "bora", ttl: 0 }, A); ok(r.ok && r.ttl === 0, "turn off");
    const m4 = ins("ali", "bora", "e2e-4"); ok(db.prepare("SELECT exp FROM msgs WHERE id=?").get(m4).exp === 0, "after off: permanent");
    ok(db.prepare("SELECT exp FROM msgs WHERE id=?").get(m3).exp === x3, "earlier timed message keeps its deadline");
    ok(!db.prepare("SELECT 1 FROM chat_ttl WHERE ckey=?").get("d:" + pair(uid("ali"), uid("bora"))), "row removed when off");
    // engelli / yasaklı
    await so("block", { handle: "cem", on: true }, A);
    ok((await so("ttl_set", { handle: "cem", ttl: 3600 }, A)).s === 404, "blocked peer 404"); await so("block", { handle: "cem", on: false }, A);
    // grup: yalnızca sahibi
    const gid = "gtest1"; db.prepare("INSERT INTO chat_groups(id,name,owner,created) VALUES(?,?,?,?)").run(gid, "Ekip", uid("ali"), Date.now());
    for (const h of ["ali", "bora"]) db.prepare("INSERT INTO group_members(group_id,user_id,last_read) VALUES(?,?,0)").run(gid, uid(h));
    ok((await so("ttl_set", { id: gid, ttl: 86400 }, B)).error === "owner_only", "only the owner sets group ttl");
    ok((await so("ttl_set", { id: gid, ttl: 86400 }, C)).s === 404, "non-member 404");
    ok((await so("ttl_set", { id: gid, ttl: 86400 }, A)).ok, "owner sets group ttl");
    const g1 = Number(db.prepare("INSERT INTO gmsgs(group_id,from_id,text,media,created) VALUES(?,?,?,?,?)").run(gid, uid("bora"), "e2e-g", "", Date.now()).lastInsertRowid);
    const ge = db.prepare("SELECT exp, created FROM gmsgs WHERE id=?").get(g1); ok(ge.exp === ge.created + 86400e3, "group trigger sets exp");
    r = await so("gthread", { id: gid }, B); ok(r.s === 200 && r.ttl === 86400 && r.msgs[0].exp === ge.exp, "gthread exposes ttl and exp");
    db.prepare("UPDATE gmsgs SET exp=? WHERE id=?").run(Date.now() - 1, g1);
    r = await so("gthread", { id: gid }, B); ok(r.msgs.length === 0, "expired group message removed");
    await so("ttl_set", { id: gid, ttl: 0 }, A); ok(ttlOf0(gid) === 0, "group off");
    function ttlOf0(g) { const x = db.prepare("SELECT ttl FROM chat_ttl WHERE ckey=?").get("g:" + g); return x ? x.ttl : 0; }
    // ---------- randevu ----------
    ok((await call("/api/social/rv_cfg", {})).s === 401, "rv auth");
    r = await so("rv_cfg", {}, A); ok(r.cfg.enabled === false && r.cfg.hours[1][0][0] === "09:00", "default cfg");
    ok((await so("rv_get", { handle: "ali" }, B)).s === 404, "disabled -> 404");
    ok((await so("rv_set", { enabled: true, hours: {} }, A)).error === "no_hours", "enabling without hours rejected");
    const tz = 180, H = { 0: [], 1: [["09:00", "12:00"], ["11:00", "13:00"]], 2: [["09:00", "17:00"]], 3: [["09:00", "17:00"]], 4: [["09:00", "17:00"]], 5: [["09:00", "17:00"]], 6: [["10:00", "14:00"]], 9: [["01:00", "02:00"]] };
    r = await so("rv_set", { enabled: true, slot: 30, lead: 0, days: 14, auto: false, tz, note: "Not <b>x</b>", hours: H, svcs: [{ n: "Saç kesimi", min: 45, price: "500 TL" }, { n: "Boya", min: 120, price: "1500 TL" }, { n: "", min: 30 }] }, A);
    ok(r.ok && r.cfg.enabled && r.cfg.svcs.length === 2 && r.cfg.hours[1].length === 1 && r.cfg.hours[1][0][1] === "13:00", "saved; overlapping ranges merged; empty service dropped: " + JSON.stringify(r.cfg.hours[1]));
    ok(r.cfg.hours[9] === undefined && r.cfg.hours[0] === undefined, "invalid weekday / empty day dropped");
    ok(r.cfg.svcs[0].min === 45, "service minutes kept");
    ok((await so("rv_set", { enabled: true, slot: 7, lead: 9999, days: 999, tz: 99999, hours: H }, A)).cfg.slot === 30, "invalid slot falls back");
    r = await so("rv_cfg", {}, A); ok(r.cfg.lead === 168 && r.cfg.days === 60 && r.cfg.tz === 840, "clamped values");
    await so("rv_set", { enabled: true, slot: 30, lead: 0, days: 14, auto: false, tz, note: "Not", hours: H, svcs: [{ n: "Saç kesimi", min: 45, price: "500 TL" }, { n: "Boya", min: 120, price: "1500 TL" }] }, A);
    r = await so("rv_get", { handle: "ali" }, B); ok(r.s === 200 && r.svcs.length === 2 && r.svcs[0].id === "0" && r.free.length > 0 && r.tz === tz, "public view");
    const day = r.free[0].day; const wd = new Date(day + "T00:00:00Z").getUTCDay(); ok(H[wd] && H[wd].length, "free day is a working day");
    // gün içindeki aralıklar: ilk servis 45 dk -> 60 dk blok (slot=30 katı)
    r = await so("rv_get", { handle: "ali", day, svc: 0 }, B); ok(r.dur === 60 && r.slots.length > 0, "slots with 60min block");
    // bugünün saati geçtiyse boş olabilir; ilerideki bir gün seç
    const far = (() => { const d = new Date(Date.now() + tz * 60000); for (let i = 3; i < 14; i++) { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + i)); if ([2, 3, 4].includes(x.getUTCDay())) return x.toISOString().slice(0, 10); } })();
    r = await so("rv_get", { handle: "ali", day: far, svc: 0 }, B); ok(r.slots[0] === "09:00" && r.slots.includes("16:00") && !r.slots.includes("16:30"), "slots 09:00..16:00 for 60 min block: " + r.slots.join(","));
    r = await so("rv_get", { handle: "ali", day: far, svc: 1 }, B); ok(r.dur === 120 && r.slots.includes("15:00") && !r.slots.includes("15:30"), "120 min service");
    // oluştur
    ok((await so("rv_new", { handle: "ali", svc: 0, day: far, start: "09:00" }, A)).s === 404, "cannot book yourself");
    ok((await so("rv_new", { handle: "ali", svc: 5, day: far, start: "09:00" }, B)).error === "bad_service", "bad service");
    ok((await so("rv_new", { handle: "ali", svc: 0, day: "2020-01-01", start: "09:00" }, B)).error === "slot_taken", "past day");
    ok((await so("rv_new", { handle: "ali", svc: 0, day: far, start: "09:15" }, B)).error === "slot_taken", "off-grid time");
    ok((await so("rv_new", { handle: "ali", svc: 0, day: far, start: "xx" }, B)).error === "bad_time", "bad time");
    r = await so("rv_new", { handle: "ali", svc: 0, day: far, start: "09:00", note: "Merhaba <i>" }, B); ok(r.ok && r.status === "pending", "pending created");
    const bid = r.id;
    ok(db.prepare("SELECT dur, svc FROM rv_books WHERE id=?").get(bid).dur === 60, "duration stored");
    r = await so("rv_get", { handle: "ali", day: far, svc: 0 }, C); ok(!r.slots.includes("09:00") && !r.slots.includes("09:30") && r.slots.includes("10:00"), "slot blocked (overlap) after booking: " + r.slots.slice(0, 4).join(","));
    ok((await so("rv_new", { handle: "ali", svc: 1, day: far, start: "09:00" }, C)).error === "slot_taken", "double booking blocked");
    ok((await so("rv_new", { handle: "ali", svc: 0, day: far, start: "09:30" }, C)).error === "slot_taken", "overlapping blocked");
    // bildirim
    const nf = await so("notifs", {}, A); ok(nf.notifs.some(x => x.type === "rv" && x.text.includes(far + " 09:00")), "owner notified");
    // listeler
    r = await so("rv_list", { role: "own" }, A); ok(r.books.length === 1 && r.books[0].handle === "bora" && r.books[0].st === "pending" && r.pending === 1, "owner list");
    r = await so("rv_list", { role: "cust" }, B); ok(r.books.length === 1 && r.books[0].handle === "ali" && r.books[0].tz === tz, "customer list carries owner tz");
    ok((await so("rv_list", { role: "own" }, B)).books.length === 0, "customer has no owner rows");
    // işlemler
    ok((await so("rv_act", { id: bid, act: "ok" }, B)).error === "bad_state", "customer cannot confirm");
    ok((await so("rv_act", { id: bid, act: "ok" }, C)).s === 404, "stranger 404");
    r = await so("rv_act", { id: bid, act: "ok" }, A); ok(r.ok && r.status === "ok", "owner confirms");
    ok((await so("notifs", {}, B)).notifs.some(x => x.type === "rv_ok"), "customer notified of confirmation");
    ok((await so("rv_act", { id: bid, act: "no" }, A)).error === "bad_state", "cannot decline after confirm");
    r = await so("rv_act", { id: bid, act: "cancel" }, B); ok(r.ok && r.status === "cancel", "customer cancels");
    ok((await so("notifs", {}, A)).notifs.some(x => x.type === "rv_cancel"), "owner notified of cancel");
    r = await so("rv_get", { handle: "ali", day: far, svc: 0 }, C); ok(r.slots.includes("09:00"), "cancelled slot is free again");
    ok((await so("rv_act", { id: bid, act: "cancel" }, B)).error === "bad_state", "cannot cancel twice");
    // reddet
    const b2 = (await so("rv_new", { handle: "ali", svc: 0, day: far, start: "10:00" }, C)).id; r = await so("rv_act", { id: b2, act: "no" }, A); ok(r.status === "no", "decline");
    ok((await so("notifs", {}, C)).notifs.some(x => x.type === "rv_no"), "decline notified");
    // otomatik onay
    await so("rv_set", { enabled: true, slot: 30, lead: 0, days: 14, auto: true, tz, hours: H, svcs: [] }, A);
    r = await so("rv_get", { handle: "ali", day: far }, C); ok(r.svcs.length === 0 && r.dur === 30 && r.slots.includes("11:00"), "no services -> slot-length bookings");
    r = await so("rv_new", { handle: "ali", day: far, start: "11:00" }, C); ok(r.ok && r.status === "ok", "auto-confirmed");
    // sınırlar: aynı kişiden en fazla 3 aktif
    const t3 = (await so("rv_new", { handle: "ali", day: far, start: "12:00" }, C)); const t4 = (await so("rv_new", { handle: "ali", day: far, start: "13:00" }, C)); ok(t3.ok && t4.ok, "3 active allowed");
    ok((await so("rv_new", { handle: "ali", day: far, start: "14:00" }, C)).error === "too_many", "4th active blocked");
    // engel
    await so("block", { handle: "bora", on: true }, A);
    ok((await so("rv_get", { handle: "ali" }, B)).s === 404 && (await so("rv_new", { handle: "ali", day: far, start: "15:00" }, B)).s === 404, "blocked users cannot see or book");
    await so("block", { handle: "bora", on: false }, A);
    // kapalıyken gizli
    await so("rv_set", { enabled: false, slot: 30, hours: H }, A); ok((await so("rv_get", { handle: "ali" }, B)).s === 404 && (await so("user", { handle: "ali" }, B)).booking === false, "disabled hides the page");
    await so("rv_set", { enabled: true, slot: 30, lead: 0, days: 14, hours: H, tz }, A); ok((await so("user", { handle: "ali" }, B)).booking === true, "user flag");
    // bildirim tercihi grubu
    r = await so("notif_prefs", {}, A); ok(r.groups.some(g => g.grp === "booking"), "booking notification group exists");
    await so("notif_prefs", { grp: "booking", on: false }, A);
    const cnt = (await so("notifs", {}, A)).notifs.length; await so("rv_new", { handle: "ali", day: far, start: "16:00" }, B);
    ok((await so("notifs", {}, A)).notifs.length === cnt, "muted group: no notification");
    // hesap silinince randevular gider (FK)
    ok(db.prepare("SELECT COUNT(*) n FROM rv_books").get().n > 0, "bookings exist");
    // hesap silinince: randevular (FK) ile birlikte kaybolan mesaj ayarları da (sohbet + sahibi olduğu grup) temizlenir
    const D = await reg("deniz"), dId = uid("deniz");
    const slD = (await so("rv_get", { handle: "ali", day: far }, D)).slots; ok(slD && slD.length > 0, "free slot for deniz");
    ok((await so("rv_new", { handle: "ali", day: far, start: slD[0] }, D)).ok, "deniz books");
    ok((await so("ttl_set", { handle: "ali", ttl: 3600 }, D)).ok, "deniz sets chat ttl");
    db.prepare("INSERT INTO chat_groups(id,name,owner,created) VALUES(?,?,?,?)").run("gdel1", "Silinecek", dId, Date.now());
    for (const u of [dId, uid("ali")]) db.prepare("INSERT INTO group_members(group_id,user_id,last_read) VALUES(?,?,0)").run("gdel1", u);
    ok((await so("ttl_set", { id: "gdel1", ttl: 86400 }, D)).ok, "deniz sets group ttl");
    const ttlRows = () => db.prepare("SELECT COUNT(*) n FROM chat_ttl WHERE ckey LIKE ? OR ckey LIKE ? OR ckey=?").get("d:" + dId + ":%", "d:%:" + dId, "g:gdel1").n;
    ok(ttlRows() === 2, "two ttl rows before deletion");
    ok(db.prepare("SELECT COUNT(*) n FROM rv_books WHERE cust=?").get(dId).n === 1, "one booking before deletion");
    r = await call("/api/delete", { password: "kaplan-gece-52" }, D); ok(r.ok, "account deleted: " + JSON.stringify(r));
    ok(ttlRows() === 0, "ttl rows removed on account deletion");
    ok(db.prepare("SELECT COUNT(*) n FROM rv_books WHERE cust=?").get(dId).n === 0, "bookings removed on account deletion");
    ok(!db.prepare("SELECT 1 FROM chat_groups WHERE id='gdel1'").get(), "owned group removed (existing behaviour)");
    // grubun son üyesi çıkınca grubun ayarı da silinir
    db.prepare("INSERT INTO chat_groups(id,name,owner,created) VALUES(?,?,?,?)").run("gdel2", "Tek", uid("ali"), Date.now());
    db.prepare("INSERT INTO group_members(group_id,user_id,last_read) VALUES(?,?,0)").run("gdel2", uid("ali"));
    ok((await so("ttl_set", { id: "gdel2", ttl: 3600 }, A)).ok, "ttl on lone group");
    ok((await so("gleave", { id: "gdel2" }, A)).ok && !db.prepare("SELECT 1 FROM chat_ttl WHERE ckey='g:gdel2'").get(), "ttl row removed when the last member leaves");
    // istemci
    const html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
    ["ttl_set", "rv_set", "rv_new", "rv_list", "rv_act", "data-ttl", "data-rsvb", "data-rsvset", "data-rsvm", "ttl_set", "rv_get", "rv_cfg", "bzCashflow", "bzImport", "bzCustAn", "bzRecipes", "bzProdAn", "o.cfp=", "o.rcs=", "o.imr=", "o.hrc="].forEach(k => ok(html.includes(k), "client has " + k));
    console.log("pack83 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
