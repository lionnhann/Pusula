// Fotoğraf albümü + gönderi düzenleme. node test_album.js
const assert = require("assert"), http = require("http");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-album-" + process.pid + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0"; process.env.SCHED_MIN_MS = "0"; process.env.SCHED_TICK_MS = "100";
process.env.R2_ACCOUNT_ID = "acct123"; process.env.R2_ACCESS_KEY_ID = "AKTEST"; process.env.R2_SECRET_ACCESS_KEY = "SECRETTEST"; process.env.R2_BUCKET = "pusula-media"; process.env.R2_PUBLIC_URL = "https://pub.example.dev";
const dels = []; let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const mock = http.createServer((req, res) => { if (req.method === "DELETE") dels.push(new URL(req.url, "http://x").pathname); res.statusCode = 204; res.end(); });
const wait = ms => new Promise(z => setTimeout(z, ms));
mock.listen(0, () => {
  process.env.R2_ENDPOINT_BASE = "http://127.0.0.1:" + mock.address().port;
  const { server } = require("./server.js");
  server.listen(0, async () => {
    const base = "http://127.0.0.1:" + server.address().port;
    const call = async (p, b, tok) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
    const so = (p, b, t) => call("/api/social/" + p, b, t);
    try {
      const reg = async (e, nm, h) => { const t = (await call("/api/register", { email: e, password: "parola-123", name: nm })).token; await so("profile", { handle: h }, t); return t; };
      const A = await reg("a@x.com", "Ali", "ali"), B = await reg("b@x.com", "Bora", "bora");
      const up = async (t, ty) => (await so("upload", { type: ty || "image/jpeg", size: 100 }, t)).key;
      const k = []; for (let i = 0; i < 4; i++) k.push(await up(A));
      let r = await so("post", { kind: "photo", media: k[0], more: [k[1], k[2], k[3]], text: "Album #tatil" }, A); ok(r.s === 200, "album posted"); const pid = r.id;
      r = await so("getpost", { id: pid }, B); ok(r.post.images.length === 4 && r.post.images[0].endsWith(k[0]) && r.post.images[3].endsWith(k[3]), "images returned in order");
      r = await so("post", { kind: "photo", media: k[0], more: ["m/baska/x.jpg"] }, A); ok(r.s === 400, "foreign key in album rejected");
      r = await so("post", { kind: "photo", media: await up(A), more: [k[1], k[1]] }, A); ok(r.s === 400, "duplicate rejected");
      const many = []; for (let i = 0; i < 10; i++) many.push(await up(A)); r = await so("post", { kind: "photo", media: await up(A), more: many }, A); ok(r.s === 400, "max 10 photos total");
      r = await so("post", { kind: "text", text: "x", more: [k[1]] }, A); ok(r.s === 400, "album only for photos");
      const single = await up(A); r = await so("post", { kind: "photo", media: single }, A); r = await so("getpost", { id: r.id }, B); ok(r.post.images === undefined, "single photo has no images array");
      // düzenleme
      r = await so("post_edit", { id: pid, text: "Yeni açıklama #deniz" }, B); ok(r.s === 404, "only owner edits");
      r = await so("post_edit", { id: pid, text: "Yeni açıklama #deniz" }, A); ok(r.s === 200, "edit");
      r = await so("getpost", { id: pid }, B); ok(r.post.text === "Yeni açıklama #deniz", "text updated");
      r = await so("tag", { tag: "deniz" }, B); ok(r.posts.length === 1, "new tag indexed"); r = await so("tag", { tag: "tatil" }, B); ok(r.posts.length === 0, "old tag removed");
      const t = (await so("post", { kind: "text", text: "yazı" }, A)).id; r = await so("post_edit", { id: t, text: "" }, A); ok(r.s === 400, "text post cannot be emptied");
      // zamanlanmış albüm
      const s = []; for (let i = 0; i < 2; i++) s.push(await up(A));
      r = await so("sched_new", { kind: "photo", media: s[0], more: [s[1]], text: "zamanlı albüm", at: Date.now() + 300 }, A); ok(r.s === 200, "schedule album"); await wait(900);
      r = await so("feed", { mode: "user", handle: "ali" }, B); ok(r.posts.some(p => p.text === "zamanlı albüm" && p.images && p.images.length === 2), "scheduled album published with images");
      // silme hepsini temizler
      dels.length = 0; r = await so("delete", { id: pid }, A); await wait(200); ok(r.s === 200 && k.every(x => dels.includes("/pusula-media/" + x)), "delete removes every album photo");
      // hesap silme
      const bk = [await up(B), await up(B)]; await so("post", { kind: "photo", media: bk[0], more: [bk[1]] }, B);
      dels.length = 0; r = await call("/api/delete", { password: "parola-123" }, B); await wait(250); ok(r.s === 200 && bk.every(x => dels.includes("/pusula-media/" + x)), "account deletion purges album photos");
      console.log("albüm testleri geçti:", n); mock.close(); server.close(); process.exit(0);
    } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
  });
});
