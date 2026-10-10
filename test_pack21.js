// Paket 21: İlgilenmiyorum + gizli kelimeler. node test_pack21.js
const assert = require("assert"), path = require("path"), os = require("os");
process.env.DB_PATH = path.join(os.tmpdir(), "pusula-p21-" + process.pid + ".db"); process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const { server } = require("./server.js");
server.listen(0, async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (p, b, tok) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
  const so = (p, b, t) => call("/api/social/" + p, b, t);
  try {
    const reg = async (e, h) => { const t = (await call("/api/register", { email: e, password: "parola-123", name: h })).token; await so("profile", { handle: h }, t); return t; };
    const A = await reg("a@x.com", "aaa"), B = await reg("b@x.com", "bbb"), C = await reg("c@x.com", "ccc");
    const p1 = (await so("post", { kind: "text", text: "Futbol maçı bugün" }, B)).id, p2 = (await so("post", { kind: "text", text: "Güzel yemek tarifi" }, B)).id, p3 = (await so("post", { kind: "text", text: "ÇIĞ köfte" }, B)).id, pa = (await so("post", { kind: "text", text: "futbol benim" }, A)).id;
    const ids = async (t, mode) => (await so("feed", { mode: mode || "all" }, t)).posts.map(p => p.id);
    ok((await ids(A)).length === 4, "all visible");
    let r = await so("ni_set", { id: p1 }, A); ok(r.ok, "ni set");
    let f = await ids(A); ok(!f.includes(p1) && f.includes(p2), "hidden only for me");
    ok((await ids(C)).includes(p1), "others unaffected");
    r = await so("feed", { mode: "user", handle: "bbb" }, A); ok(r.posts.some(p => p.id === p1), "profile view still shows it");
    r = await so("ni_set", { id: pa }, A); ok(r.s === 404, "cannot ni own post");
    r = await so("ni_set", { id: "nope" }, A); ok(r.s === 404, "unknown");
    r = await so("ni_set", { id: p1, on: false }, A); ok(r.ok && (await ids(A)).includes(p1), "undo");
    // kelimeler
    r = await so("mw_set", { word: "x" }, A); ok(r.error === "bad_word", "too short");
    r = await so("mw_set", { word: "  YEMEK  " }, A); ok(r.ok && r.words[0] === "yemek", "added normalized");
    r = await so("mw_set", { word: "ÇIĞ" }, A); ok(r.words.includes("çığ"), "turkish lowercase");
    f = await ids(A); ok(!f.includes(p2) && !f.includes(p3) && f.includes(p1) && f.includes(pa), "words hide others' posts only; own kept");
    ok((await ids(C)).length === 4, "other user unaffected");
    r = await so("mw_list", {}, A); ok(r.words.length === 2, "list");
    r = await so("mw_set", { word: "yemek", on: false }, A); ok(r.words.length === 1, "remove");
    ok((await ids(A)).includes(p2), "visible again");
    for (let i = 0; i < 29; i++) await so("mw_set", { word: "kelime" + i }, A);
    r = await so("mw_set", { word: "fazlalik" }, A); ok(r.error === "too_many_words", "cap 30");
    console.log("paket 21 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
