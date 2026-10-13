// Paket 37: kaydedilenlerde arama, "kısa işler önce" sıralaması. node test_pack37.js
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p37-" + process.pid + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const { server } = require("./server.js");
server.listen(0, async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (p, b, tok) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
  try {
    const reg = async (e, nm, h) => { const t = (await call("/api/register", { email: e, password: "parola-123", name: nm })).token; await call("/api/social/profile", { handle: h }, t); return t; };
    const A = await reg("a@x.com", "Ali", "ali"), B = await reg("b@x.com", "Bora", "bora");
    const texts = ["Kedi videosu #kedi", "Yüzde 100 emin", "alt_çizgi_test", "Köpek parkı"];
    for (const t of texts) { const p = await call("/api/social/post", { kind: "text", text: t }, A); await call("/api/social/save", { id: p.id, on: true }, B); }
    const Q = async q => (await call("/api/social/saved", q === undefined ? {} : { q }, B)).posts.map(p => p.text).sort();
    ok((await Q()).length === 4, "no q lists all saved");
    ok((await Q("KEDİ")).length === 1 && (await Q("KEDI")).length === 1, "Turkish uppercase İ/I matches");
    ok((await Q("kopek")).length === 1 && (await Q("KÖPEK")).length === 1, "diacritic-insensitive");
    ok((await Q("kedi"))[0] === "Kedi videosu #kedi", "case-insensitive ascii");
    ok((await Q("100")).length === 1, "digits");
    ok((await Q("%")).length === 0, "% is literal, not wildcard");
    ok((await Q("_")).length === 1 && (await Q("_"))[0] === "alt_çizgi_test", "_ is literal");
    ok((await Q("zzz")).length === 0, "no match is empty");
    ok((await Q("'; drop table posts;--")).length === 0, "injection-safe");
    ok((await call("/api/social/saved", { q: "kedi" }, A)).posts.length === 0, "other users' saves not visible");
    const html = fs.readFileSync(fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public/index.html") : path.join(__dirname, "..", "si/index.html"), "utf8");
    ["async function soSavedLoad", "\"man\",\"est\"", "id=\"svq\"", "m===\"est\"", "Kısa işler önce"].forEach(k => ok(html.includes(k), "client has " + k));
    for (const l of ["de", "es", "fr", "pt", "ru", "ar", "az", "id", "ja"]) { const pk = JSON.parse(fs.readFileSync(path.join(__dirname, fs.existsSync(path.join(__dirname, "public")) ? "public" : "../si", "lang", l + ".json"), "utf8")); ["Search saved posts", "Quick tasks first"].forEach(k => ok(pk[k], l + " " + k)); }
    console.log("pack37 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, e.stack.split("\n")[1]); process.exit(1); }
});
