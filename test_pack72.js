// Paket 72: ilgi alanları
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p72-" + process.pid + "-" + Date.now() + ".db");
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
    ok((await call("/api/social/interests_set", {})).s === 401, "auth");
    ok(JSON.stringify((await so("me", {}, A)).interests) === "[]", "me has empty interests");
    let r = await so("interests_set", { tags: "  Müzik, FOTOĞRAF ,müzik, a, kod yazma!!  , " }, A);
    ok(r.ok && JSON.stringify(r.interests) === JSON.stringify(["müzik", "fotoğraf", "kod yazma"]), "normalized, deduped, short dropped: " + JSON.stringify(r.interests));
    ok((await so("interests_set", { tags: ["bir", "iki", "üç", "dört", "beş", "altı"] }, A)).error === "too_many_interests", "max 5");
    ok(JSON.stringify((await so("me", {}, A)).interests) === JSON.stringify(["müzik", "fotoğraf", "kod yazma"]), "me returns them");
    ok(JSON.stringify((await so("user", { handle: "ali" }, B)).interests) === JSON.stringify(["müzik", "fotoğraf", "kod yazma"]), "user returns them");
    ok((await so("interests_set", { tags: ["x".repeat(30)] }, A)).interests.length === 0, "too long dropped");
    await so("interests_set", { tags: "müzik, yemek" }, A); await so("interests_set", { tags: ["müzik", "spor"] }, B); await so("interests_set", { tags: "Müzik" }, C); await so("interests_set", { tags: "spor" }, D);
    r = await so("interest_people", { tag: "MÜZİK" }, A); ok(r.tag === "müzik" && r.users.map(u => u.handle).sort().join() === "bora,can", "people with same interest, not self: " + JSON.stringify(r.users));
    ok(r.users.every(u => u.following === false && typeof u.private === "boolean"), "flags");
    await so("follow", { handle: "bora", on: true }, A); r = await so("interest_people", { tag: "müzik" }, A); ok(r.users.find(u => u.handle === "bora").following === true, "following flag");
    await so("block", { handle: "can", on: true }, A); r = await so("interest_people", { tag: "müzik" }, A); ok(r.users.map(u => u.handle).join() === "bora", "blocked hidden"); await so("block", { handle: "can", on: false }, A);
    ok((await so("interest_people", { tag: "!" }, A)).error === "bad_tag", "bad tag");
    ok((await so("interest_people", { tag: "yokbuilgi" }, A)).users.length === 0, "none");
    await so("interests_set", { tags: [] }, A); ok((await so("interest_people", { tag: "müzik" }, B)).users.map(u => u.handle).join() === "can", "cleared removes from lookup");
    const html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
    ["interests_set", "interest_people", "data-int", "se-int", "bzCashCount", "bzReturns", "ccsave", "rtsave", "o.ccs=", "o.rets="].forEach(k => ok(html.includes(k), "client has " + k));
    console.log("pack72 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
