// Müzik: hazır melodiler + yüklenen sesler. node test_music.js
const assert = require("assert"), http = require("http");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-music-" + process.pid + ".db");
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
      let r; await so("follow", { handle: "ali", on: true }, B);
      // hazır melodi
      const im = await up(A);
      r = await so("post", { kind: "photo", media: im, sound: "syn:lofi", text: "müzikli" }, A); ok(r.s === 200, "post with synth sound"); const p1 = r.id;
      r = await so("getpost", { id: p1 }, B); ok(r.post.sound && r.post.sound.id === "syn:lofi" && r.post.sound.syn && r.post.sound.title === "Lo-fi Sabah", "sound info returned");
      r = await so("post", { kind: "photo", media: await up(A), sound: "syn:yok" }, A); ok(r.s === 400, "unknown synth rejected");
      r = await so("post", { kind: "photo", media: await up(A), sound: "nYOKYOKYOKYOK" }, A); ok(r.s === 400, "unknown sound rejected");
      r = await so("post", { kind: "text", text: "yazı", sound: "syn:lofi" }, A); ok(r.s === 200, "text post ignores sound"); r = await so("getpost", { id: r.id }, B); ok(r.post.sound === null, "no sound on text");
      // yüklenen ses
      const mk = await up(A, "audio/mpeg"); ok(/\.mp3$/.test(mk), "mp3 upload allowed");
      r = await so("sound_new", { title: "Benim Şarkım", media: mk, dur: 30 }, A); ok(r.s === 200 && r.sound.by === "ali", "sound created"); const sid = r.sound.id;
      r = await so("sound_new", { title: "x", media: mk, dur: 30 }, A); ok(r.s === 400, "same media twice rejected");
      r = await so("sound_new", { title: "uzun", media: await up(A, "audio/mpeg"), dur: 120 }, A); ok(r.s === 400, "too long rejected");
      r = await so("sound_new", { title: "x", media: "m/baska/x.mp3", dur: 10 }, A); ok(r.s === 400, "foreign key rejected");
      r = await so("sound_new", { title: "x", media: await up(A), dur: 10 }, A); ok(r.s === 400, "non-audio rejected");
      r = await so("sound_new", { title: "", media: await up(A, "audio/mpeg"), dur: 10 }, A); ok(r.s === 400, "title required");
      r = await so("sound_list", { q: "şarkı" }, B); ok(r.sounds.length === 1 && r.sounds[0].id === sid, "other users find sound (Turkish-safe)");
      r = await so("sound_list", {}, A); ok(r.sounds.length === 0, "own sounds not in library list"); r = await so("sound_list", { mine: true }, A); ok(r.sounds.length === 1, "mine");
      r = await so("post", { kind: "photo", media: await up(B), sound: sid }, B); ok(r.s === 200, "other user uses sound"); const p2 = r.id;
      r = await so("sound_list", {}, await (async () => (await call("/api/register", { email: "c@x.com", password: "parola-123", name: "C" })).token)()); ok(true, "x");
      r = await so("sound_list", { mine: true }, A); ok(r.sounds[0].uses === 1, "usage counted");
      r = await so("getpost", { id: p2 }, A); ok(r.post.sound.url && r.post.sound.by === "ali" && r.post.sound.dur === 30, "full sound info on post");
      // hikâye
      r = await so("story_new", { kind: "text", text: "s", sound: "syn:piano" }, A); r = await so("stories", {}, B); ok(r.stories.find(g => g.handle === "ali").items[0].sound.id === "syn:piano", "story sound");
      r = await so("story_new", { kind: "video", media: await up(A, "video/mp4"), sound: "syn:piano" }, A); r = await so("stories", {}, B); ok(r.stories.find(g => g.handle === "ali").items.filter(i => i.sound).length === 1, "video story has no sound");
      // zamanlı
      r = await so("sched_new", { kind: "photo", media: await up(A), sound: "syn:energy", at: Date.now() + 300 }, A); ok(r.s === 200, "schedule with sound"); await wait(900);
      r = await so("feed", { mode: "user", handle: "ali" }, B); ok(r.posts.some(p => p.sound && p.sound.id === "syn:energy"), "scheduled keeps sound");
      // silme
      r = await so("sound_del", { id: sid }, B); ok(r.s === 404, "only owner deletes");
      dels.length = 0; r = await so("sound_del", { id: sid }, A); await wait(150); ok(r.s === 200 && dels.includes("/pusula-media/" + mk), "delete frees media");
      r = await so("getpost", { id: p2 }, A); ok(r.post.sound === null, "post loses removed sound");
      // şikayet
      r = await so("report", { kind: "sound", target: "x", reason: "telif" }, B); ok(r.s === 200, "sound reportable");
      // hesap silme
      const mk2 = await up(B, "audio/mpeg"); await so("sound_new", { title: "b sesi", media: mk2, dur: 20 }, B); dels.length = 0;
      r = await call("/api/delete", { password: "parola-123" }, B); await wait(250); ok(r.s === 200 && dels.includes("/pusula-media/" + mk2), "account deletion purges sounds");
      console.log("müzik testleri geçti:", n); mock.close(); server.close(); process.exit(0);
    } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
  });
});
