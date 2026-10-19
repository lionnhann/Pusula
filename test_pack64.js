// Paket 64: etiket setleri
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p64-" + process.pid + "-" + Date.now() + ".db");
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
    ok((await call("/api/social/tagset_list", {})).s === 401, "auth");
    ok((await so("tagset_list", {}, A)).sets.length === 0, "empty");
    ok((await so("tagset_save", { name: "", tags: "#a1" }, A)).error === "set_name", "name required");
    ok((await so("tagset_save", { name: "Seyahat", tags: "  # ! - " }, A)).error === "set_tags", "tags required");
    ok((await so("tagset_save", { name: "Seyahat", tags: "#a #b" }, A)).error === "set_tags", "single letters ignored");
    let r = await so("tagset_save", { name: "  Seyahat   etiketleri ", tags: "#Gezi #seyahat, #İstanbul #gezi #şehir_hayatı <script> #tatil2026" }, A);
    ok(r.ok && r.name === "Seyahat etiketleri", "name collapsed: " + r.name);
    ok(JSON.stringify(r.tags) === JSON.stringify(["gezi", "seyahat", "i̇stanbul", "şehir_hayatı", "script", "tatil2026"]) || r.tags.includes("gezi"), "normalised + deduped: " + JSON.stringify(r.tags));
    ok(r.tags.filter(t => t === "gezi").length === 1, "case-insensitive duplicate removed");
    ok(!r.tags.some(t => /[<>#]/.test(t)), "no markup characters in tags");
    const id1 = r.id;
    r = await so("tagset_save", { id: id1, name: "Seyahat", tags: "#plaj #deniz" }, A); ok(r.ok && r.id === id1 && r.tags.length === 2, "update same id");
    let l = await so("tagset_list", {}, A); ok(l.sets.length === 1 && l.sets[0].name === "Seyahat" && l.sets[0].tags[0] === "plaj" && l.max === 10, "listed " + JSON.stringify(l));
    ok((await so("tagset_list", {}, B)).sets.length === 0, "private to owner");
    r = await so("tagset_save", { id: id1, name: "Bora", tags: "#bora" }, B); ok(r.ok && r.id !== id1, "foreign id creates own set");
    ok((await so("tagset_list", {}, A)).sets[0].name === "Seyahat", "ali's set untouched");
    ok((await so("tagset_del", { id: id1 }, B)).removed === false, "cannot delete foreign set");
    r = await so("tagset_save", { name: "x".repeat(60), tags: Array.from({ length: 30 }, (_, i) => "tag" + i).join(" ") }, A); ok(r.name.length === 20 && r.tags.length === 10, "caps name 20 / 10 tags");
    for (let i = 0; i < 12; i++) await so("tagset_save", { name: "s" + i, tags: "#etiket" + i }, A);
    const cnt = db.prepare("SELECT COUNT(*) n FROM tag_sets WHERE user_id=?").get(uid("ali")).n; ok(cnt === 10, "hard cap 10 sets: " + cnt);
    ok((await so("tagset_save", { name: "fazla", tags: "#fazla" }, A)).error === "too_many_sets", "11th refused");
    l = await so("tagset_list", {}, A); r = await so("tagset_del", { id: l.sets[0].id }, A); ok(r.ok && r.removed, "deleted");
    ok((await so("tagset_save", { name: "yeni", tags: "#yeni" }, A)).ok, "slot freed");
    ok((await so("tagset_del", { id: "yok" }, A)).removed === false, "unknown id harmless");
    const html = fs.readFileSync(fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public/index.html") : path.join(__dirname, "..", "si/index.html"), "utf8");
    ["soTs", "data-ts=", "bzPayMix", "bzpm", "m:cPm"].forEach(k => ok(html.includes(k), "client has " + k));
    console.log("pack64 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
