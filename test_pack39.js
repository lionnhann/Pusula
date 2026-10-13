// Paket 39: fotoğraf alternatif metni, ortak takipçiler, gün çizelgesi (istemci). node test_pack39.js
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p39-" + process.pid + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0";
process.env.R2_ACCOUNT_ID = "acct123"; process.env.R2_ACCESS_KEY_ID = "AKTEST"; process.env.R2_SECRET_ACCESS_KEY = "SECRETTEST"; process.env.R2_BUCKET = "pusula-media"; process.env.R2_PUBLIC_URL = "https://pub.example.dev";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const { server } = require("./server.js");
server.listen(0, async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (p, b, tok) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
  try {
    const U = {}, reg = async (e, nm, h) => { const x = await call("/api/register", { email: e, password: "parola-123", name: nm }); U[h] = x.user.id; await call("/api/social/profile", { handle: h }, x.token); return x.token; };
    const A = await reg("a@x.com", "Ali", "ali"), B = await reg("b@x.com", "Bora", "bora"), C = await reg("c@x.com", "Can", "can_x"), D = await reg("d@x.com", "Deniz", "deniz"), E = await reg("e@x.com", "Ece", "ece");
    // alt metin
    let r = await call("/api/social/post", { kind: "photo", text: "foto", media: "m/" + U.ali + "/a.jpg", alt: "  Sahilde gün batımı  " }, A); ok(r.ok, "photo post " + JSON.stringify(r));
    let f = await call("/api/social/feed", { mode: "all" }, B); let p = f.posts.find(x => x.id === r.id); ok(p && p.alt === "Sahilde gün batımı", "alt returned trimmed");
    const long = "x".repeat(500); let r2 = await call("/api/social/post", { kind: "photo", text: "u", media: "m/" + U.ali + "/b.jpg", alt: long }, A); f = await call("/api/social/feed", { mode: "all" }, B); ok(f.posts.find(x => x.id === r2.id).alt.length === 200, "alt capped at 200");
    let r3 = await call("/api/social/post", { kind: "photo", text: "n", media: "m/" + U.ali + "/c.jpg" }, A); f = await call("/api/social/feed", { mode: "all" }, B); ok(f.posts.find(x => x.id === r3.id).alt === undefined, "no alt when empty");
    let t = await call("/api/social/post", { kind: "text", text: "yazı", alt: "yok" }, A); await call("/api/social/post_edit", { id: t.id, text: "yazı2", alt: "yok" }, A); f = await call("/api/social/feed", { mode: "all" }, B); ok(f.posts.find(x => x.id === t.id).alt === undefined, "text post never gets alt");
    ok((await call("/api/social/post_edit", { id: r.id, text: "foto", alt: "Yeni açıklama" }, B)).s === 404, "only owner edits alt");
    ok((await call("/api/social/post_edit", { id: r.id, text: "foto", alt: "Yeni açıklama" }, A)).ok, "edit alt");
    f = await call("/api/social/feed", { mode: "all" }, B); ok(f.posts.find(x => x.id === r.id).alt === "Yeni açıklama", "alt updated");
    await call("/api/social/post_edit", { id: r.id, text: "foto" }, A); f = await call("/api/social/feed", { mode: "all" }, B); ok(f.posts.find(x => x.id === r.id).alt === "Yeni açıklama", "alt kept when omitted");
    await call("/api/social/post_edit", { id: r.id, text: "foto", alt: "" }, A); f = await call("/api/social/feed", { mode: "all" }, B); ok(f.posts.find(x => x.id === r.id).alt === undefined, "alt cleared");
    // ortak takipçiler: B ve C ve D, ali'yi takip ediyor; E, B/C/D'yi takip ediyor
    for (const t2 of [B, C, D]) await call("/api/social/follow", { handle: "ali", on: true }, t2);
    for (const h of ["bora", "can_x", "deniz"]) await call("/api/social/follow", { handle: h, on: true }, E);
    let u = await call("/api/social/user", { handle: "ali" }, E); ok(u.mutual && u.mutual.n === 3 && u.mutual.names.length === 3, "mutual 3 " + JSON.stringify(u.mutual));
    await call("/api/social/follow", { handle: "ece", on: true }, E); // kendini takip edemez, yoksayılır
    u = await call("/api/social/user", { handle: "ali" }, A); ok(u.mutual.n === 0, "own profile no mutual");
    u = await call("/api/social/user", { handle: "ali" }, B); ok(u.mutual.n === 0, "no mutual without common follows");
    await call("/api/social/block", { handle: "can_x", on: true }, E); u = await call("/api/social/user", { handle: "ali" }, E); ok(u.mutual.n === 2 && !u.mutual.names.includes("can_x"), "blocked excluded");
    // gizli hesap: takip etmeyen için kilitli → boş
    await call("/api/social/profile", { handle: "deniz" }, D);
    const html = fs.readFileSync(fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public/index.html") : path.join(__dirname, "..", "si/index.html"), "utf8");
    ["function dayPlan", "function dayCard", 'id="dtl"', 'id="ph-alt"', 'id="pe-alt"', "somut", "Gün çizelgesi"].forEach(k => ok(html.includes(k), "client has " + k));
    const keys = ["Day schedule", "Overlaps", "Tasks without a time:", "Free slots:", "Place untimed tasks", "No free slot found that fits", "# tasks placed", "# tasks placed, # did not fit", "Alternative text (for visually impaired users, optional)", "Mutual followers:", "and # more"];
    for (const lg of ["de", "es", "fr", "pt", "ru", "ar", "az", "id", "ja"]) { const pk = JSON.parse(fs.readFileSync(path.join(__dirname, fs.existsSync(path.join(__dirname, "public")) ? "public" : "../si", "lang", lg + ".json"), "utf8")); keys.forEach(k => { ok(pk[k], lg + " " + k); ok((pk[k].match(/#/g) || []).length === (k.match(/#/g) || []).length, lg + " # " + k); }); }
    console.log("pack39 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, e.stack.split("\n")[1]); process.exit(1); }
});
