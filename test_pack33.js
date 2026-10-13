// Paket 33: yeniden paylaş / alıntıla. node test_pack33.js
const assert = require("assert");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-p33-" + process.pid + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const { server } = require("./server.js");
server.listen(0, async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (p, b, tok) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
  try {
    const reg = async (e, nm, h) => { const t = (await call("/api/register", { email: e, password: "parola-123", name: nm })).token; await call("/api/social/profile", { handle: h }, t); return t; };
    const A = await reg("a@x.com", "Ali", "ali"), B = await reg("b@x.com", "Bora", "bora"), C = await reg("c@x.com", "Can", "can_x");
    const p1 = await call("/api/social/post", { kind: "text", text: "merhaba dünya" }, A);
    let r = await call("/api/social/repost", { id: p1.id, text: "Çok doğru #fikir" }, B);
    ok(r.s === 200 && r.orig === p1.id, "repost ok");
    let g = await call("/api/social/getpost", { id: r.id }, C);
    ok(g.s === 200 && g.post.handle === "bora" && g.post.text === "Çok doğru #fikir\n[[rp:" + p1.id + "]]", "repost stored as text post with token");
    r = await call("/api/social/tag", { tag: "fikir" }, C); ok(r.s === 200 && JSON.stringify(r).includes("rp:"), "quote text tagged");
    r = await call("/api/social/notifs", {}, A); ok(r.notifs.some(x => x.type === "repost" && x.handle === "bora" && !x.text.includes("[[")), "author notified, token hidden");
    r = await call("/api/social/repost", { id: p1.id }, B); ok(r.s === 200, "no quote allowed");
    g = await call("/api/social/getpost", { id: r.id }, C); ok(g.post.text === "[[rp:" + p1.id + "]]", "plain repost");
    // repost of a repost resolves to root
    const rr = await call("/api/social/repost", { id: r.id, text: "yine" }, C); ok(rr.s === 200 && rr.orig === p1.id, "nested resolves to root");
    r = await call("/api/social/repost", { id: p1.id }, A); ok(r.s === 400 && r.error === "own_post", "cannot repost own");
    r = await call("/api/social/repost", { id: "yok" }, B); ok(r.s === 404, "unknown");
    r = await call("/api/social/repost", { id: "p1234", text: "x" }, B); ok(r.s === 404, "bad id");
    await call("/api/social/block", { handle: "ali", on: true }, C); r = await call("/api/social/repost", { id: p1.id }, C); ok(r.s === 404, "blocked cannot repost");
    // düzenleme işareti korur
    let ed = await call("/api/social/post_edit", { id: rr.id, text: "değişti [[rp:p0000000000000000]]" }, C); ok(ed.s === 200 && ed.text === "değişti", "edit returns text without token");
    g = await call("/api/social/getpost", { id: rr.id }, B); ok(g.post.text === "değişti\n[[rp:" + p1.id + "]]", "edit keeps original token, ignores forged one");
    ed = await call("/api/social/post_edit", { id: rr.id, text: "" }, C); ok(ed.s === 200, "empty quote allowed for repost");
    // private
    await call("/api/social/profile", { private: true }, A);
    const p2 = await call("/api/social/post", { kind: "text", text: "gizli" }, A);
    r = await call("/api/social/repost", { id: p2.id }, B); ok(r.s === 403 && r.error === "private", "private author refused");
    await call("/api/social/follow", { handle: "ali", on: true }, B); await call("/api/social/req_accept", { handle: "bora" }, A).catch(() => {});
    // notification preferences group exists
    r = await call("/api/social/notif_prefs", {}, A); ok(r.groups.some(x => x.grp === "repost"), "notif group");
    // rate limit
    let last; for (let i = 0; i < 22; i++) last = await call("/api/social/repost", { id: p1.id }, B); ok(last.s === 429, "rate limited");
    const fs = require("fs"), path = require("path"), root = fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public") : path.join(__dirname, "..", "si");
    const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
    ["function soRpDlg", "function soRpFill", "data-rpb", "kasa_duzenle", "RPRE"].forEach(k => ok(html.includes(k), "client has " + k));
    const dict = JSON.parse(html.match(/<script id="i18n-dict"[^>]*>([\s\S]*?)<\/script>/)[1]);
    ["Yeniden paylaş", "Yeniden paylaşıldı", "Bu gönderi artık yok", "gönderini yeniden paylaştı"].forEach(k => ok(dict[k], "dict " + k));
    for (const l of ["de", "es", "fr", "pt", "ru", "ar", "az", "id", "ja"]) { const pk = JSON.parse(fs.readFileSync(path.join(root, "lang", l + ".json"), "utf8")); ["Repost", "Reposted", "reposted your post", "This post is no longer available"].forEach(k => ok(pk[k], l + " " + k)); }
    console.log("pack33 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, e.stack.split("\n")[1]); process.exit(1); }
});
