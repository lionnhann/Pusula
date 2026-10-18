// Paket 49: kendi kendini silen gönderi (ttl). Süre dolunca akıştan hemen gizlenir, tick ile medyasıyla silinir.
const assert = require("assert"), fs = require("fs"), path = require("path"), http = require("http");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p49-" + process.pid + "-" + Date.now() + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0"; process.env.EXPIRE_TICK_MS = "3600000";
process.env.R2_ACCOUNT_ID = "acct123"; process.env.R2_ACCESS_KEY_ID = "AKTEST"; process.env.R2_SECRET_ACCESS_KEY = "SECRETTEST"; process.env.R2_BUCKET = "pusula-media"; process.env.R2_PUBLIC_URL = "https://pub.example.dev";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const dels = [], wait = ms => new Promise(r => setTimeout(r, ms));
const mock = http.createServer((req, res) => { if (req.method === "DELETE") dels.push(req.url.split("?")[0]); req.resume(); req.on("end", () => { res.statusCode = 200; res.end(); }); });
mock.listen(0, () => {
  process.env.R2_ENDPOINT_BASE = "http://127.0.0.1:" + mock.address().port;
  const { server, db, expireTick } = require("./server.js");
  server.listen(0, async () => {
    const base = "http://127.0.0.1:" + server.address().port;
    const call = async (p, b, tok) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
    const so = (p, b, t) => call("/api/social/" + p, b, t);
    try {
      const reg = async (e, nm, h) => { const x = await call("/api/register", { email: e, password: "kaplan-gece-49", name: nm }); await so("profile", { handle: h }, x.token); return x.token; };
      const A = await reg("a@x.com", "Ali", "ali"), B = await reg("b@x.com", "Bora", "bora");
      const uidA = db.prepare("SELECT user_id FROM profiles WHERE handle='ali'").get().user_id;
      // doğrulama
      for (const bad of [0, -5, 721, "abc", 1e9]) ok((await so("post", { kind: "text", text: "x", ttl: bad }, A)).error === "bad_ttl", "bad ttl " + bad);
      ok(db.prepare("SELECT COUNT(*) n FROM posts").get().n === 0, "invalid ttl creates nothing");
      // normal gönderi etkilenmez
      const plain = await so("post", { kind: "text", text: "kalıcı" }, A); ok(plain.ok, "plain post");
      ok((await so("post", { kind: "text", text: "boş ttl", ttl: "" }, A)).ok && (await so("post", { kind: "text", text: "null ttl", ttl: null }, A)).ok, "empty ttl ok");
      // süreli gönderi
      const t0 = Date.now(), p1 = await so("post", { kind: "text", text: "24 saatlik", ttl: 24 }, A); ok(p1.ok, "ttl post");
      const row = db.prepare("SELECT expires FROM posts WHERE id=?").get(p1.id); ok(Math.abs(row.expires - (t0 + 24 * 3600e3)) < 5000, "expires set");
      const feed = (await so("feed", { mode: "user", handle: "ali" }, B)).posts, f1 = feed.find(p => p.id === p1.id);
      ok(f1 && f1.expires === row.expires, "feed shows expires"); ok(feed.find(p => p.id === plain.id).expires === undefined, "plain has no expires");
      const p30 = await so("post", { kind: "text", text: "30 gün", ttl: 720 }, A); ok(p30.ok, "max ttl 720 ok");
      // süre dolunca hemen gizlenir (tick'ten önce), sonra silinir
      const key = "m/" + uidA + "/gecicifoto1.jpg", pf = await so("post", { kind: "photo", text: "foto", media: key, ttl: 1 }, A); ok(pf.ok, "photo ttl");
      const cm = await so("comment", { id: p1.id, text: "yorum" }, B); 
      db.prepare("UPDATE posts SET expires=? WHERE id IN (?,?)").run(Date.now() - 1000, p1.id, pf.id);
      db.prepare("UPDATE profiles SET pinned=? WHERE user_id=?").run(p1.id, uidA);
      const f2 = JSON.stringify(await so("feed", { mode: "user", handle: "ali" }, B)); ok(!f2.includes(p1.id) && !f2.includes("gecicifoto1"), "expired hidden before sweep");
      ok(JSON.stringify(await so("feed", { mode: "all" }, B)).includes(p1.id) === false, "expired hidden in all feed");
      dels.length = 0; expireTick(); await wait(300);
      ok(!db.prepare("SELECT 1 FROM posts WHERE id=?").get(p1.id) && !db.prepare("SELECT 1 FROM posts WHERE id=?").get(pf.id), "expired posts deleted");
      ok(db.prepare("SELECT COUNT(*) n FROM comments WHERE post_id=?").get(p1.id).n === 0, "comments cascade");
      ok(dels.includes("/pusula-media/" + key), "media freed: " + JSON.stringify(dels));
      ok(db.prepare("SELECT pinned FROM profiles WHERE user_id=?").get(uidA).pinned === "", "pin cleared");
      ok(db.prepare("SELECT 1 FROM posts WHERE id=?").get(plain.id) && db.prepare("SELECT 1 FROM posts WHERE id=?").get(p30.id), "others kept");
      expireTick(); ok(db.prepare("SELECT COUNT(*) n FROM posts WHERE expires>0").get().n === 1, "only 30-day post still timed");
      const html = fs.readFileSync(fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public/index.html") : path.join(__dirname, "..", "si/index.html"), "utf8");
      ["ex-ttl", "bzPrice", "Fiyat Pusulası", "sonra silinir"].forEach(k => ok(html.includes(k), "client has " + k));
      console.log("pack49 testleri geçti:", n); server.close(); mock.close(); process.exit(0);
    } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
  });
});
