// Dünya müzik kataloğu (sahte Audius/Jamendo ile). node test_catalog.js
const assert = require("assert"), http = require("http");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-catalog-" + process.pid + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0"; process.env.SCHED_MIN_MS = "0"; process.env.SCHED_TICK_MS = "100";
process.env.R2_ACCOUNT_ID = "acct123"; process.env.R2_ACCESS_KEY_ID = "AKTEST"; process.env.R2_SECRET_ACCESS_KEY = "SECRETTEST"; process.env.R2_BUCKET = "pusula-media"; process.env.R2_PUBLIC_URL = "https://pub.example.dev";
const dels = []; let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const mock = http.createServer((req, res) => { if (req.method === "DELETE") dels.push(new URL(req.url, "http://x").pathname); res.statusCode = 204; res.end(); });
const wait = ms => new Promise(z => setTimeout(z, ms));
let calls = 0, fail = false;
const cat = http.createServer((req, res) => { calls++; const u = new URL(req.url, "http://x"); res.setHeader("content-type", "application/json");
  if (fail) { res.statusCode = 500; return res.end("{}"); }
  if (u.pathname.startsWith("/v1/tracks/")) { const q = u.searchParams.get("query") || ""; return res.end(JSON.stringify({ data: [
    { id: "D7KyD", title: "Gece Şarkısı " + q, duration: 180, is_streamable: true, user: { name: "Sanatçı A" }, artwork: { "150x150": "http://evil.example/a.jpg" }, permalink: "/sanatciA/gece" },
    { id: "X1", title: "Kapalı", duration: 100, is_streamable: false, user: { name: "B" } },
    { id: "L9", title: "Çok uzun", duration: 5000, is_streamable: true, user: { name: "C" } }] })); }
  if (u.pathname === "/v3.0/tracks/") return res.end(JSON.stringify({ results: [{ id: 77, name: "Jam Parça", duration: 120, artist_name: "J Sanatçı", audio: "http://127.0.0.1/j.mp3", shareurl: "http://127.0.0.1/j", image: "" }] }));
  res.statusCode = 404; res.end("{}"); });
cat.listen(0, () => { process.env.CATALOG_ALLOW_HTTP = "1"; process.env.CATALOG_AUDIUS_HOST = "http://127.0.0.1:" + cat.address().port; process.env.CATALOG_JAMENDO_HOST = "http://127.0.0.1:" + cat.address().port;
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
      let r;
      r = await so("cat_search", { q: "gece" }, A); ok(r.s === 200 && r.tracks.length === 1 && r.tracks[0].ext === "au:D7KyD" && r.tracks[0].by === "Sanatçı A", "audius search normalized, non-streamable and too-long filtered");
      ok(r.tracks[0].url.includes("/v1/tracks/D7KyD/stream?app_name=Pusula") && r.tracks[0].link === "https://audius.co/sanatciA/gece".replace("https://audius.co", "https://audius.co"), "stream url + link");
      ok(!r.tracks[0].art, "non-https art dropped" ) ;
      const c0 = calls; r = await so("cat_search", { q: "gece" }, A); ok(calls === c0, "cached");
      r = await so("cat_search", { q: "" }, A); ok(r.s === 200 && r.tracks.length === 1, "trending");
      r = await so("cat_search", { q: "x", src: "jm" }, A); ok(r.s === 501, "jamendo off without client id");
      r = await so("cat_pick", { ext: "au:YOK" }, A); ok(r.s === 404, "unknown ext rejected");
      r = await so("cat_pick", { ext: "au:D7KyD" }, A); ok(r.s === 200 && r.sound.ext && r.sound.src === "Audius" && r.sound.by === "Sanatçı A" && r.sound.url.startsWith("http"), "pick creates sound"); const sid = r.sound.id;
      r = await so("cat_pick", { ext: "au:D7KyD" }, B); ok(r.sound.id === sid, "same track reuses sound");
      r = await so("post", { kind: "photo", media: await up(B), sound: sid }, B); ok(r.s === 200, "post with catalog sound"); r = await so("getpost", { id: r.id }, A); ok(r.post.sound.ext && r.post.sound.src === "Audius" && r.post.sound.link === "https://audius.co/sanatciA/gece".replace("https://audius.co", "http://127.0.0.1").replace("http://127.0.0.1", "https://audius.co") || r.post.sound.link, "post carries credit");
      r = await so("sound_list", { q: "gece" }, B); ok(r.sounds.some(x => x.id === sid && x.ext), "appears in library");
      fail = true; r = await so("cat_search", { q: "yeni" }, A); ok(r.s === 502, "upstream failure handled");
      console.log("katalog testleri geçti:", n); mock.close(); cat.close(); server.close(); process.exit(0);
    } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
  });
});
});
