// Üretici Stüdyosu: istatistik, zamanlanmış paylaşım, sabitleme. node test_studio.js
const assert = require("assert"), http = require("http");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-studio-" + process.pid + ".db");
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
      const A = await reg("a@x.com", "Ali", "ali"), B = await reg("b@x.com", "Bora", "bora"), C = await reg("c@x.com", "Can", "can_x");
      // sabitleme
      const p1 = (await so("post", { kind: "text", text: "ilk" }, A)).id; await wait(5);
      const p2 = (await so("post", { kind: "text", text: "ikinci" }, A)).id; await wait(5);
      const p3 = (await so("post", { kind: "text", text: "üçüncü" }, A)).id;
      let r = await so("pin", { id: p1 }, B); ok(r.s === 404, "cannot pin someone else's post");
      r = await so("pin", { id: p1 }, A); ok(r.s === 200, "pin");
      r = await so("feed", { mode: "user", handle: "ali" }, B); ok(r.posts[0].id === p1 && r.posts[0].pinned === true && r.posts.length === 3 && r.posts[1].id === p3, "pinned first, no duplicate");
      r = await so("feed", { mode: "user", handle: "ali", before: Date.now() + 1000 }, B); ok(r.posts.every(p => !p.pinned), "pin only on first page");
      await so("pin", { id: "" }, A); r = await so("feed", { mode: "user", handle: "ali" }, B); ok(r.posts[0].id === p3 && !r.posts.some(p => p.pinned), "unpin");
      // istatistik
      await so("follow", { handle: "ali", on: true }, B); await so("follow", { handle: "ali", on: true }, C);
      await so("like", { id: p1, on: true }, B); await so("like", { id: p1, on: true }, C); await so("like", { id: p2, on: true }, B);
      await so("like", { id: p1, on: true }, A);
      await so("comment", { id: p1, text: "güzel" }, B);
      const vk = await so("upload", { type: "video/mp4", size: 1000 }, A); const rp = (await so("post", { kind: "reel", text: "video", media: vk.key }, A)).id;
      await so("reel_view", { id: rp }, B); await so("reel_view", { id: rp }, C);
      r = await so("creator_stats", { days: 7, tz: 180 }, A);
      ok(r.followers === 2 && r.newFollowers === 2 && r.likes === 3 && r.comments === 1 && r.views === 2 && r.posts === 4, "totals (self-likes excluded)");
      ok(r.series.followers.length === 7 && r.series.followers[6] === 2 && r.series.likes[6] === 3 && r.series.views[6] === 2, "daily series ends today");
      ok(r.top[0].id === p1 && r.top[0].likes === 3 && r.top[0].comments === 1, "top post");
      ok(Array.isArray(r.bestHours) && r.bestHours.length >= 1 && r.bestHours[0].hour >= 0 && r.bestHours[0].hour < 24, "best hours");
      r = await so("creator_stats", { days: 999 }, A); ok(r.days === 7, "days clamped");
      r = await so("creator_stats", { days: 30 }, B); ok(r.followers === 0 && r.posts === 0 && r.top.length === 0 && r.bestHours.length === 0, "other user's stats are their own");
      // zamanlanmış paylaşım
      r = await so("sched_new", { kind: "text", text: "x", at: Date.now() - 5000 }, A); ok(r.s === 400 && r.error === "bad_time", "past time rejected");
      r = await so("sched_new", { kind: "text", text: "x", at: Date.now() + 40 * 864e5 }, A); ok(r.s === 400, "too far rejected");
      r = await so("sched_new", { kind: "text", text: "", at: Date.now() + 5000 }, A); ok(r.s === 400, "empty rejected");
      r = await so("sched_new", { kind: "photo", media: "m/baska/x.jpg", at: Date.now() + 5000 }, A); ok(r.s === 400 && r.error === "bad_media", "foreign media rejected");
      r = await so("sched_new", { kind: "text", text: "Zamanlanmış gönderi #plan", at: Date.now() + 400 }, A); ok(r.s === 200, "schedule text"); const sid = r.id;
      const pk = await so("upload", { type: "image/jpeg", size: 100 }, A);
      r = await so("sched_new", { kind: "photo", media: pk.key, text: "iptal edilecek", at: Date.now() + 60000 }, A); const cid = r.id; ok(r.s === 200, "schedule photo");
      r = await so("sched_list", {}, A); ok(r.items.length === 2 && r.items[0].id === sid, "list sorted by time");
      r = await so("sched_list", {}, B); ok(r.items.length === 0, "list is private");
      r = await so("sched_cancel", { id: cid }, B); ok(r.s === 404, "cannot cancel others'");
      dels.length = 0; r = await so("sched_cancel", { id: cid }, A); await wait(150); ok(r.s === 200 && dels.includes("/pusula-media/" + pk.key), "cancel removes row and media");
      await wait(900);
      r = await so("feed", { mode: "user", handle: "ali" }, B); ok(r.posts.some(p => p.text === "Zamanlanmış gönderi #plan"), "published on time");
      r = await so("tag", { tag: "plan" }, B); ok(r.posts.length === 1, "hashtags processed on publish");
      r = await so("sched_list", {}, A); ok(r.items.length === 0, "queue empty after publish");
      // topluluğa zamanlama + üyelik kontrolü
      await so("c_create", { handle: "oda", name: "Oda" }, A);
      r = await so("sched_new", { kind: "text", text: "c", community: "oda", at: Date.now() + 300 }, B); ok(r.s === 403, "non-member cannot schedule to community");
      r = await so("sched_new", { kind: "text", text: "toplulukta zamanlı", community: "oda", at: Date.now() + 300 }, A); ok(r.s === 200, "schedule to community");
      await wait(900); r = await so("c_feed", { handle: "oda" }, B); ok(r.posts.length === 1 && r.posts[0].text === "toplulukta zamanlı", "published into community");
      // hesap silinince kuyruk temizlenir
      const pk2 = await so("upload", { type: "image/jpeg", size: 100 }, C); await so("sched_new", { kind: "photo", media: pk2.key, at: Date.now() + 600000 }, C);
      dels.length = 0; r = await call("/api/delete", { password: "parola-123" }, C); await wait(200); ok(r.s === 200 && dels.includes("/pusula-media/" + pk2.key), "account deletion purges scheduled media");
      console.log("stüdyo testleri geçti:", n); mock.close(); server.close(); process.exit(0);
    } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
  });
});
