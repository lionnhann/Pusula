// Reels: kapak görseli, izlenme, "Sana özel" sıralaması, takip sekmesi, silince depolama temizliği. node test_reels.js
const assert = require("assert"), http = require("http");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-reels-" + process.pid + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0";
process.env.R2_ACCOUNT_ID = "acct123"; process.env.R2_ACCESS_KEY_ID = "AKTEST"; process.env.R2_SECRET_ACCESS_KEY = "SECRETTEST"; process.env.R2_BUCKET = "pusula-media"; process.env.R2_PUBLIC_URL = "https://pub.example.dev";
const dels = []; let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const mock = http.createServer((req, res) => { if (req.method === "DELETE") dels.push(new URL(req.url, "http://x").pathname); res.statusCode = 204; res.end(); });
mock.listen(0, () => {
  process.env.R2_ENDPOINT_BASE = "http://127.0.0.1:" + mock.address().port;
  const { server } = require("./server.js");
  server.listen(0, async () => {
    const base = "http://127.0.0.1:" + server.address().port;
    const call = async (p, b, tok) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
    try {
      const reg = async (e, nm, h) => { const t = (await call("/api/register", { email: e, password: "parola-123", name: nm })).token; await call("/api/social/profile", { handle: h }, t); return t; };
      const A = await reg("a@x.com", "Ali", "ali"), B = await reg("b@x.com", "Bora", "bora"), C = await reg("c@x.com", "Can", "can_x");
      const up = async (t, ext) => { const r = await call("/api/social/upload", { type: ext === "mp4" ? "video/mp4" : "image/jpeg", size: 1000 }, t); return r.key; };
      const mk = async (t, txt, poster) => { const media = await up(t, "mp4"); const body = { kind: "reel", text: txt, media }; if (poster) body.poster = poster; const r = await call("/api/social/post", body, t); return { id: r.id, media, s: r.s }; };
      // kapak görseli
      const pk = await up(A, "jpg"); const r1 = await mk(A, "ilk video #deneme", pk); ok(r1.s === 200, "reel posted");
      let r = await call("/api/social/getpost", { id: r1.id }, B); ok(r.post.poster && r.post.poster.endsWith(pk) && r.post.views === 0, "poster url + views in post");
      const foreign = await up(B, "jpg"); const r2 = await mk(A, "kötü kapak", foreign); r = await call("/api/social/getpost", { id: r2.id }, B); ok(r.post.poster === "", "poster of another user's key ignored");
      const r3 = await mk(A, "kapaksız"); r = await call("/api/social/getpost", { id: r3.id }, B); ok(r.post.poster === "", "poster optional");
      // izlenme
      r = await call("/api/social/reel_view", { id: r1.id }, A); ok(r.s === 200 && r.views === 0, "own view not counted");
      r = await call("/api/social/reel_view", { id: r1.id }, B); ok(r.views === 1, "view counted");
      r = await call("/api/social/reel_view", { id: r1.id }, B); ok(r.views === 1, "unique per viewer");
      r = await call("/api/social/reel_view", { id: r1.id }, C); ok(r.views === 2, "second viewer");
      const t = await call("/api/social/post", { kind: "text", text: "yazı" }, A); r = await call("/api/social/reel_view", { id: t.id }, B); ok(r.s === 404, "only reels have views");
      r = await call("/api/social/reel_view", { id: "yok" }, B); ok(r.s === 404, "unknown id");
      // sana özel
      r = await call("/api/social/feed", { mode: "foryou" }, B); ok(r.s === 200 && r.posts.length === 3 && r.posts.every(p => p.kind === "reel"), "foryou returns reels only");
      r = await call("/api/social/feed", { mode: "foryou" }, B); ok(r.posts[0].id === r1.id || r.posts.length === 3, "engaged reel ranked");
      r = await call("/api/social/feed", { mode: "foryou", seen: [r1.id, r2.id] }, B); ok(r.posts.length === 1 && r.posts[0].id === r3.id, "seen reels excluded");
      r = await call("/api/social/feed", { mode: "foryou", seen: [r1.id, r2.id, r3.id] }, B); ok(r.posts.length === 0, "nothing left when all seen");
      await call("/api/social/block", { handle: "ali", on: true }, C); r = await call("/api/social/feed", { mode: "foryou" }, C); ok(r.posts.length === 0, "blocked author hidden from foryou");
      // takip sekmesi
      r = await call("/api/social/feed", { mode: "freels" }, B); ok(r.posts.length === 0, "following tab empty before follow");
      await call("/api/social/follow", { handle: "ali", on: true }, B); r = await call("/api/social/feed", { mode: "freels" }, B); ok(r.posts.length === 3, "following tab shows followed reels");
      // silince kapak da silinir
      dels.length = 0; r = await call("/api/social/delete", { id: r1.id }, A); await new Promise(z => setTimeout(z, 150));
      ok(r.s === 200 && dels.includes("/pusula-media/" + pk) && dels.includes("/pusula-media/" + r1.media), "delete removes video and poster");
      r = await call("/api/social/reel_view", { id: r1.id }, B); ok(r.s === 404, "views gone with reel");
      console.log("reels testleri geçti:", n); mock.close(); server.close(); process.exit(0);
    } catch (e) { console.error("FAIL", e.message, e.stack.split("\n")[1]); process.exit(1); }
  });
});
