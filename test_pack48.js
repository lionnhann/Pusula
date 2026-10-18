// Paket 48: Zaman kapsülü (mühürlü gönderi). İçerik açılışa kadar sızmaz; tarih gelince açılır, bildirim gider, medya temizlenir.
const assert = require("assert"), fs = require("fs"), path = require("path"), http = require("http");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p48-" + process.pid + "-" + Date.now() + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0";
process.env.CAPSULE_MIN_MS = "1500"; process.env.CAPSULE_TICK_MS = "3600000";
process.env.R2_ACCOUNT_ID = "acct123"; process.env.R2_ACCESS_KEY_ID = "AKTEST"; process.env.R2_SECRET_ACCESS_KEY = "SECRETTEST"; process.env.R2_BUCKET = "pusula-media"; process.env.R2_PUBLIC_URL = "https://pub.example.dev";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const dels = [], wait = ms => new Promise(r => setTimeout(r, ms));
const mock = http.createServer((req, res) => { if (req.method === "DELETE") dels.push(req.url.split("?")[0]); req.resume(); req.on("end", () => { res.statusCode = 200; res.end(); }); });
mock.listen(0, () => {
  process.env.R2_ENDPOINT_BASE = "http://127.0.0.1:" + mock.address().port;
  const { server, db, capsuleTick } = require("./server.js");
  server.listen(0, async () => {
    const base = "http://127.0.0.1:" + server.address().port;
    const call = async (p, b, tok) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
    const so = (p, b, t) => call("/api/social/" + p, b, t);
    try {
      const reg = async (e, nm, h) => { const x = await call("/api/register", { email: e, password: "kaplan-gece-48", name: nm }); await so("profile", { handle: h }, x.token); return { t: x.token, id: x.user && x.user.id }; };
      const A = (await reg("a@x.com", "Ali", "ali")).t, B = (await reg("b@x.com", "Bora", "bora")).t, C = (await reg("c@x.com", "Can", "can")).t;
      const SECRET = "gizli-mesaj-" + Math.random().toString(36).slice(2, 8);
      const at = Date.now() + 2500;
      // --- doğrulamalar ---
      ok((await so("capsule_new", { text: SECRET, unlock: Date.now() - 1000 }, A)).error === "bad_time", "past rejected");
      ok((await so("capsule_new", { text: SECRET, unlock: Date.now() + 200 }, A)).error === "bad_time", "too soon rejected");
      ok((await so("capsule_new", { text: SECRET, unlock: Date.now() + 6 * 365 * 864e5 }, A)).error === "bad_time", ">5y rejected");
      ok((await so("capsule_new", { text: "", unlock: at }, A)).error === "empty", "empty text rejected");
      ok((await so("capsule_new", { text: SECRET, unlock: at }, null)).s === 401, "auth needed");
      const mk = await so("capsule_new", { text: SECRET + " #kapsul", hint: "Yeni yıl için bir sürprizim var", unlock: at }, A);
      ok(mk.ok && /^p[0-9a-f]+$/.test(mk.id) && mk.unlock === at, "capsule created");
      // --- sızıntı yok ---
      const feedB = await so("feed", { mode: "user", handle: "ali" }, B), pb = feedB.posts.find(p => p.id === mk.id);
      ok(pb && pb.text === "Yeni yıl için bir sürprizim var" && pb.capsule === at && pb.watching === false, "public sees only hint + capsule time");
      ok(!JSON.stringify(feedB).includes(SECRET), "secret not in feed");
      for (const mode of ["all", "foryou"]) ok(!JSON.stringify(await so("feed", { mode }, B)).includes(SECRET), "secret not in " + mode);
      ok(!JSON.stringify(await so("explore", {}, B)).includes(SECRET), "secret not in explore");
      ok(!JSON.stringify(await so("search", { q: "kapsul" }, B)).includes(SECRET), "secret not in search");
      const pg = await fetch(base + "/p/" + mk.id); const html = await pg.text(); ok(!html.includes(SECRET), "secret not in share page");
      // --- yazar kendi kapsüllerini görür, başkası görmez ---
      const mineA = await so("capsule_mine", {}, A), mineB = await so("capsule_mine", {}, B);
      ok(mineA.items.length === 1 && mineA.items[0].text.startsWith(SECRET) && mineA.items[0].unlock === at, "author sees sealed content");
      ok(mineB.items.length === 0, "others see none");
      // --- haber ver ---
      ok((await so("capsule_watch", { id: "pyok" }, B)).s === 404, "watch unknown 404");
      let w = await so("capsule_watch", { id: mk.id }, B); ok(w.watching === true && w.n === 1, "watch on");
      ok((await so("feed", { mode: "user", handle: "ali" }, B)).posts.find(p => p.id === mk.id).watching === true, "watching flag in feed");
      w = await so("capsule_watch", { id: mk.id }, B); ok(w.watching === false && w.n === 0, "watch toggles off");
      ok((await so("capsule_watch", { id: mk.id, on: true }, B)).watching === true, "watch on explicit");
      ok((await so("capsule_watch", { id: mk.id, on: true }, C)).watching === true, "second watcher");
      const norm = await so("post", { kind: "text", text: "normal gönderi" }, A);
      ok((await so("capsule_watch", { id: norm.id }, B)).s === 404, "normal posts have no capsule watch");
      // engelleyen göremez
      await so("block", { handle: "ali", on: true }, C); ok((await so("capsule_watch", { id: mk.id, on: true }, C)).s === 404, "blocked user cannot watch");
      await so("block", { handle: "ali", on: false }, C);
      // --- tarih gelmeden açılmaz ---
      capsuleTick(); ok(db.prepare("SELECT COUNT(*) n FROM capsules").get().n === 1, "not opened early");
      ok(!JSON.stringify(await so("feed", { mode: "user", handle: "ali" }, B)).includes(SECRET), "still sealed");
      // --- açılış ---
      await wait(Math.max(0, at - Date.now()) + 300); capsuleTick();
      const after = (await so("feed", { mode: "user", handle: "ali" }, B)).posts.find(p => p.id === mk.id);
      ok(after && after.text.startsWith(SECRET) && after.capsule === at && after.watching === undefined, "opened: real text, capsule marker stays");
      ok(Date.now() - after.created < 10000, "opened post bumped to top");
      ok(db.prepare("SELECT COUNT(*) n FROM capsules").get().n === 0 && db.prepare("SELECT COUNT(*) n FROM capsule_watch").get().n === 0, "sealed row + watchers cleaned");
      ok((await so("capsule_mine", {}, A)).items.length === 0, "mine empty after opening");
      const nb = (await so("notifs", {}, B)).notifs.filter(x => x.type === "capsule"); ok(nb.length === 1 && nb[0].handle === "ali" && nb[0].post === mk.id, "watcher notified once");
      ok((await so("notifs", {}, C)).notifs.some(x => x.type === "capsule"), "second watcher notified");
      ok(db.prepare("SELECT COUNT(*) n FROM tags WHERE post_id=? AND tag='kapsul'").get(mk.id).n === 1, "hashtag indexed on open");
      capsuleTick(); ok((await so("notifs", {}, B)).notifs.filter(x => x.type === "capsule").length === 1, "no duplicate notice");
      // --- fotoğraf kapsülü + silme + yetim medya temizliği ---
      const uidA = db.prepare("SELECT user_id FROM profiles WHERE handle='ali'").get().user_id;
      const key1 = "m/" + uidA + "/kapsulfoto1.jpg", key2 = "m/" + uidA + "/kapsulfoto2.jpg";
      const p1 = await so("capsule_new", { kind: "photo", media: key1, text: "foto", unlock: Date.now() + 2500 }, A); ok(p1.ok, "photo capsule");
      ok((await so("capsule_new", { kind: "photo", media: "m/baskasi/x.jpg", unlock: Date.now() + 3000 }, A)).error === "bad_media", "foreign media rejected");
      const mp = await so("capsule_mine", {}, A); ok(mp.items[0].media.includes("kapsulfoto1.jpg"), "author sees sealed photo url");
      ok(!JSON.stringify(await so("feed", { mode: "user", handle: "ali" }, B)).includes("kapsulfoto1"), "sealed photo key not exposed");
      dels.length = 0; ok((await so("delete", { id: p1.id }, A)).ok === true, "delete sealed capsule post"); capsuleTick(); await wait(250);
      ok(dels.includes("/pusula-media/" + key1), "orphan sealed media freed: " + JSON.stringify(dels));
      // açılan fotoğraf kapsülü gönderiye geçer, medya silinmez
      const p2 = await so("capsule_new", { kind: "photo", media: key2, text: "foto2", unlock: Date.now() + 1800 }, A); ok(p2.ok, "photo capsule 2");
      await wait(2000); dels.length = 0; capsuleTick(); await wait(200);
      const row2 = db.prepare("SELECT kind, media FROM posts WHERE id=?").get(p2.id); ok(row2.kind === "photo" && row2.media === key2, "photo opens into post");
      ok(!dels.includes("/pusula-media/" + key2), "opened photo kept");
      // --- sınır ---
      const D = (await reg("d@x.com", "Deniz", "deniz")).t;
      for (let i = 0; i < 10; i++) ok((await so("capsule_new", { text: "k" + i, unlock: Date.now() + 5000 }, D)).ok, "cap " + i);
      ok((await so("capsule_new", { text: "k11", unlock: Date.now() + 5000 }, D)).error === "too_many_capsules", "cap limit");
      // --- hesap silinince mühürlü medya silinir ---
      const keyD = "m/" + db.prepare("SELECT user_id FROM profiles WHERE handle='deniz'").get().user_id + "/kapsuldeniz.jpg";
      db.prepare("UPDATE capsules SET kind='photo', media=? WHERE post_id=(SELECT post_id FROM capsules WHERE user_id=(SELECT user_id FROM profiles WHERE handle='deniz') LIMIT 1)").run(keyD);
      dels.length = 0; const dr = await call("/api/delete", { password: "kaplan-gece-48" }, D); await wait(300); ok(dr.s === 200 && dels.includes("/pusula-media/" + keyD), "account deletion frees sealed media");
      // --- istemci ---
      const html2 = fs.readFileSync(fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public/index.html") : path.join(__dirname, "..", "si/index.html"), "utf8");
      ["capsule_new", "capsule_mine", "capsule_watch", "Zaman kapsülü"].forEach(k => ok(html2.includes(k), "client has " + k));
      console.log("pack48 testleri geçti:", n); server.close(); mock.close(); process.exit(0);
    } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
  });
});
