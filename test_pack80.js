// Paket 80: profil vurgu rengi
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p80-" + process.pid + "-" + Date.now() + ".db");
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
    const A = await reg("ali"), B = await reg("bora");
    ok((await call("/api/social/accent_set", { color: "blue" })).s === 401, "auth");
    ok((await so("me", {}, A)).accent === "", "default empty");
    ok((await so("user", { handle: "ali" }, B)).accent === "", "user default empty");
    ok((await so("accent_set", { color: "#ff0000" }, A)).s === 400, "hex rejected");
    ok((await so("accent_set", { color: "<b>" }, A)).s === 400, "markup rejected");
    ok((await so("accent_set", { color: 5 }, A)).s === 400, "non-string rejected");
    let r = await so("accent_set", { color: "purple" }, A); ok(r.ok && r.accent === "purple", "set");
    ok((await so("me", {}, A)).accent === "purple", "me shows it");
    ok((await so("user", { handle: "ali" }, B)).accent === "purple", "others see it");
    ok((await so("user", { handle: "bora" }, A)).accent === "", "bora unaffected");
    r = await so("accent_set", { color: "gold" }, A); ok(r.accent === "gold", "change");
    ok(db.prepare("SELECT COUNT(*) c FROM profile_accent").get().c === 1, "single row");
    r = await so("accent_set", { color: "" }, A); ok(r.ok && r.accent === "", "clear");
    ok(db.prepare("SELECT COUNT(*) c FROM profile_accent").get().c === 0, "row removed");
    for (const c of ["blue", "green", "purple", "pink", "orange", "red", "teal", "gold"]) ok((await so("accent_set", { color: c }, B)).accent === c, "palette " + c);
    const html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
    ["accent_set", "data-acc", "data-acck", "bzQuick", "bzMonthly", "o.qcs="].forEach(k => ok(html.includes(k), "client has " + k));
    console.log("pack80 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
