// Paket 38: yorum sıralaması (en eski / en beğenilen), günlük harcama payı. node test_pack38.js
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p38-" + process.pid + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const { server } = require("./server.js");
server.listen(0, async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (p, b, tok) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
  try {
    const reg = async (e, nm, h) => { const t = (await call("/api/register", { email: e, password: "parola-123", name: nm })).token; await call("/api/social/profile", { handle: h }, t); return t; };
    const A = await reg("a@x.com", "Ali", "ali"), B = await reg("b@x.com", "Bora", "bora"), C = await reg("c@x.com", "Can", "can_x"), D = await reg("d@x.com", "Deniz", "deniz");
    const post = await call("/api/social/post", { kind: "text", text: "yorum al" }, A);
    const mk = async (t, txt, parent) => (await call("/api/social/comment", { id: post.id, text: txt, parent }, t));
    const c1 = await mk(B, "birinci"), c2 = await mk(C, "ikinci"), c3 = await mk(D, "üçüncü");
    const r1 = await mk(A, "yanıt-1", c1.id || (await call("/api/social/comments", { id: post.id }, A)).comments[0].id);
    const texts = r => r.comments.map(c => c.text);
    let l = await call("/api/social/comments", { id: post.id }, A);
    ok(JSON.stringify(texts(l).filter(t => !t.startsWith("yanıt"))) === JSON.stringify(["birinci", "ikinci", "üçüncü"]), "default oldest first");
    const ids = Object.fromEntries(l.comments.map(c => [c.text, c.id]));
    await call("/api/social/comment_like", { id: ids["üçüncü"], on: true }, A); await call("/api/social/comment_like", { id: ids["üçüncü"], on: true }, B); await call("/api/social/comment_like", { id: ids["ikinci"], on: true }, A);
    l = await call("/api/social/comments", { id: post.id, sort: "top" }, A);
    const top = texts(l).filter(t => !t.startsWith("yanıt"));
    ok(JSON.stringify(top) === JSON.stringify(["üçüncü", "ikinci", "birinci"]), "top sort by likes " + top);
    ok(texts(l).indexOf("yanıt-1") === texts(l).indexOf("birinci") + 1, "replies stay under their parent");
    await call("/api/social/comment_pin", { id: ids["birinci"], on: true }, A);
    l = await call("/api/social/comments", { id: post.id, sort: "top" }, A); ok(texts(l)[0] === "birinci", "pinned stays first in top sort");
    l = await call("/api/social/comments", { id: post.id, sort: "zzz" }, A); ok(texts(l)[0] === "birinci", "unknown sort falls back to default");
    const html = fs.readFileSync(fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public/index.html") : path.join(__dirname, "..", "si/index.html"), "utf8");
    ["id=\"sos-so\"", "SO.csort", "function kasaPayi","function homePayi", "Günlük harcama payı:"].forEach(k => ok(html.includes(k), "client has " + k));
    for (const lg of ["de", "es", "fr", "pt", "ru", "ar", "az", "id", "ja"]) { const pk = JSON.parse(fs.readFileSync(path.join(__dirname, fs.existsSync(path.join(__dirname, "public")) ? "public" : "../si", "lang", lg + ".json"), "utf8")); ["Comment order", "Most liked", "Daily spending allowance:"].forEach(k => ok(pk[k], lg + " " + k)); }
    console.log("pack38 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, e.stack.split("\n")[1]); process.exit(1); }
});
