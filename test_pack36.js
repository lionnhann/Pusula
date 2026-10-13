// Paket 36: takipçi listesinde arama, haftalık alışkanlık hedefi, asistan görev süresi. node test_pack36.js
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p36-" + process.pid + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const { server } = require("./server.js");
server.listen(0, async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (p, b, tok) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
  try {
    const reg = async (e, nm, h) => { const t = (await call("/api/register", { email: e, password: "parola-123", name: nm })).token; await call("/api/social/profile", { handle: h }, t); return t; };
    const B = await reg("b@x.com", "Bora", "bora");
    for (const h of ["ahmet", "ayse", "mehmet", "a_li", "ali_x"]) { const t = await reg(h + "@x.com", h, h); await call("/api/social/follow", { handle: "bora", on: true }, t); }
    const L = async q => (await call("/api/social/follow_list", { handle: "bora", kind: "followers", q }, B)).users.map(u => u.handle).sort();
    ok((await L(undefined)).length === 5, "no query lists all");
    ok(JSON.stringify(await L("a")) === JSON.stringify(["a_li", "ahmet", "ali_x", "ayse"]), "substring search");
    ok(JSON.stringify(await L("A_L")) === JSON.stringify(["a_li"]), "case-insensitive, underscore is literal");
    ok((await L("%")).length === 5 && (await L("zzz")).length === 0, "wildcards stripped; no match is empty");
    ok((await L("'; drop table profiles;--")).length === 0, "injection-safe");
    ok((await call("/api/social/follow_list", { handle: "bora", kind: "following", q: "x" }, B)).users.length === 0, "following works with q");
    const html = fs.readFileSync(fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public/index.html") : path.join(__dirname, "..", "si/index.html"), "utf8");
    ["function habWk","data-hwk", "id=\"hbw\"", "id=\"flq\"", "sure:{type:\"number\"", "wk:Math.max(1,Math.min(7"].forEach(k => ok(html.includes(k), "client has " + k));
    for (const l of ["de", "es", "fr", "pt", "ru", "ar", "az", "id", "ja"]) { const pk = JSON.parse(fs.readFileSync(path.join(__dirname, fs.existsSync(path.join(__dirname, "public")) ? "public" : "../si", "lang", l + ".json"), "utf8")); ["Search list", "Weekly goal", "# days a week"].forEach(k => ok(pk[k], l + " " + k)); }
    console.log("pack36 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, e.stack.split("\n")[1]); process.exit(1); }
});
