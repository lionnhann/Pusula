// Topluluklar. node test_comm.js
const assert = require("assert"), http = require("http");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-comm-" + process.pid + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0"; process.env.ADMIN_TOKEN = "adm-test-token-123456";
process.env.R2_ACCOUNT_ID = "acct123"; process.env.R2_ACCESS_KEY_ID = "AKTEST"; process.env.R2_SECRET_ACCESS_KEY = "SECRETTEST"; process.env.R2_BUCKET = "pusula-media"; process.env.R2_PUBLIC_URL = "https://pub.example.dev";
const dels = []; let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const mock = http.createServer((req, res) => { if (req.method === "DELETE") dels.push(new URL(req.url, "http://x").pathname); res.statusCode = 204; res.end(); });
mock.listen(0, () => {
  process.env.R2_ENDPOINT_BASE = "http://127.0.0.1:" + mock.address().port;
  const { server } = require("./server.js");
  server.listen(0, async () => {
    const base = "http://127.0.0.1:" + server.address().port;
    const call = async (p, b, tok, hdr) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}, hdr || {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
    const so = (p, b, t) => call("/api/social/" + p, b, t);
    try {
      const reg = async (e, nm, h) => { const t = (await call("/api/register", { email: e, password: "parola-123", name: nm })).token; await so("profile", { handle: h }, t); return t; };
      const A = await reg("a@x.com", "Ali", "ali"), B = await reg("b@x.com", "Bora", "bora"), C = await reg("c@x.com", "Can", "can_x"), D = await reg("d@x.com", "Deniz", "deniz");
      let r = await so("c_create", { handle: "Bad Name", name: "x" }, A); ok(r.s === 400 && r.error === "bad_handle", "bad handle");
      r = await so("c_create", { handle: "girisimciler", name: "Girişimciler", about: "Kendi işini kuranlar", rules: "Saygılı ol", icon: "🚀" }, A); ok(r.s === 200, "create");
      r = await so("c_create", { handle: "girisimciler", name: "x" }, B); ok(r.s === 409, "handle taken");
      r = await so("c_get", { handle: "girisimciler" }, B); ok(r.community.members === 1 && r.community.role === "" && r.community.icon === "🚀", "get as outsider");
      r = await so("c_get", { handle: "girisimciler" }, A); ok(r.community.role === "owner", "owner role");
      // yalnızca üyeler paylaşır
      r = await so("post", { kind: "text", text: "selam", community: "girisimciler" }, B); ok(r.s === 403 && r.error === "not_member", "outsider cannot post");
      r = await so("c_join", { handle: "girisimciler", on: true }, B); ok(r.community.role === "member" && r.community.members === 2, "join");
      r = await so("post", { kind: "text", text: "Merhaba topluluk #isfikri", community: "girisimciler" }, B); ok(r.s === 200, "member posts"); const pid = r.id;
      r = await so("post", { kind: "text", text: "genel gönderi" }, B); ok(r.s === 200, "normal post");
      // genel akışlarda görünmez
      r = await so("feed", { mode: "all" }, C); ok(r.posts.length === 1 && r.posts[0].text === "genel gönderi", "community post hidden from public feed");
      r = await so("feed", { mode: "user", handle: "bora" }, C); ok(r.posts.length === 1, "hidden from profile");
      r = await so("tag", { tag: "isfikri" }, C); ok(r.posts.length === 0, "hidden from tag feed");
      r = await so("explore", {}, C); ok(r.posts.every(p => p.text !== "Merhaba topluluk #isfikri"), "hidden from explore");
      // topluluk akışı
      r = await so("c_feed", { handle: "girisimciler" }, C); ok(r.posts.length === 1 && r.posts[0].community.handle === "girisimciler" && r.role === "", "community feed visible to anyone");
      // liste/arama
      r = await so("c_list", { mode: "mine" }, B); ok(r.communities.length === 1 && r.communities[0].role === "member", "mine");
      r = await so("c_list", { mode: "popular" }, C); ok(r.communities[0].members === 2, "popular");
      r = await so("c_list", { q: "girişim" }, C); ok(r.communities.length === 1, "search by name");
      r = await so("c_list", { q: "zzz" }, C); ok(r.communities.length === 0, "search empty");
      // sahip ayrılamaz, rol atama
      r = await so("c_join", { handle: "girisimciler", on: false }, A); ok(r.s === 409, "owner cannot leave");
      r = await so("c_role", { handle: "girisimciler", user: "bora", role: "mod" }, B); ok(r.s === 403, "member cannot set roles");
      r = await so("c_role", { handle: "girisimciler", user: "bora", role: "mod" }, A); ok(r.s === 200, "owner promotes");
      r = await so("c_members", { handle: "girisimciler" }, C); ok(r.members[0].role === "owner" && r.members[1].role === "mod", "members sorted by role");
      // yalnızca yöneticiler (duyuru kanalı)
      r = await so("c_update", { handle: "girisimciler", name: "Girişimciler", about: "x", rules: "y", icon: "🚀", posting: "mods" }, B); ok(r.s === 403, "mod cannot edit settings");
      r = await so("c_update", { handle: "girisimciler", name: "Girişimciler", about: "x", rules: "y", icon: "🚀", posting: "mods" }, A); ok(r.community.posting === "mods", "owner edits");
      await so("c_join", { handle: "girisimciler", on: true }, C);
      r = await so("post", { kind: "text", text: "duyuru?", community: "girisimciler" }, C); ok(r.s === 403 && r.error === "mods_only", "members cannot post in announcement mode");
      r = await so("post", { kind: "text", text: "Duyuru: toplantı", community: "girisimciler" }, B); ok(r.s === 200, "mod can post in announcement mode");
      // moderasyon
      await so("c_update", { handle: "girisimciler", name: "Girişimciler", about: "x", rules: "y", icon: "🚀", posting: "all" }, A);
      r = await so("post", { kind: "text", text: "spam spam", community: "girisimciler" }, C); const spam = r.id;
      r = await so("c_remove_post", { handle: "girisimciler", id: spam }, D); ok(r.s === 403, "non-member cannot moderate");
      r = await so("c_remove_post", { handle: "girisimciler", id: spam }, B); ok(r.s === 200, "mod removes post");
      r = await so("c_remove_post", { handle: "girisimciler", id: pid }, B); r = await so("getpost", { id: pid }, B); ok(r.s === 404, "post gone");
      r = await so("c_kick", { handle: "girisimciler", user: "ali", ban: true }, B); ok(r.s === 400, "cannot kick owner");
      r = await so("c_role", { handle: "girisimciler", user: "can_x", role: "mod" }, A); r = await so("c_kick", { handle: "girisimciler", user: "can_x" }, B); ok(r.s === 403, "mod cannot kick mod");
      r = await so("c_role", { handle: "girisimciler", user: "can_x", role: "member" }, A);
      const up = await so("upload", { type: "image/jpeg", size: 100 }, C); r = await so("post", { kind: "photo", media: up.key, text: "reklam", community: "girisimciler" }, C); ok(r.s === 200, "member photo post");
      dels.length = 0; r = await so("c_kick", { handle: "girisimciler", user: "can_x", ban: true, purge: true }, B); await new Promise(z => setTimeout(z, 150)); ok(r.s === 200 && dels.includes("/pusula-media/" + up.key), "ban + purge deletes posts and media");
      r = await so("c_join", { handle: "girisimciler", on: true }, C); ok(r.s === 403 && r.error === "banned_here", "banned user cannot rejoin");
      r = await so("post", { kind: "text", text: "tekrar", community: "girisimciler" }, C); ok(r.s === 403, "banned cannot post");
      // bildirme + yönetici paneli
      r = await so("report", { kind: "community", target: "girisimciler", reason: "test" }, D); ok(r.s === 200, "report community");
      const adm = (p, b) => call(p, b, null, { "x-admin-token": "adm-test-token-123456" });
      r = await adm("/api/admin/reports", {}); ok(r.reports.some(x => x.kind === "community" && /Girişimciler/.test(x.preview || "")), "admin sees community preview");
      r = await adm("/api/admin/stats", {}); ok(r.communities === 1, "stats count");
      // silme
      r = await so("c_delete", { handle: "girisimciler" }, B); ok(r.s === 403, "only owner deletes");
      await so("c_join", { handle: "girisimciler", on: true }, D); r = await so("post", { kind: "text", text: "silinecek", community: "girisimciler" }, D);
      r = await so("c_delete", { handle: "girisimciler" }, A); ok(r.s === 200, "owner deletes");
      r = await so("c_get", { handle: "girisimciler" }, B); ok(r.s === 404, "gone");
      r = await so("feed", { mode: "all" }, C); ok(r.posts.length === 1, "community posts removed with community");
      // sahibi hesabını silerse toplulukları da gider
      await so("c_create", { handle: "gecici", name: "Geçici" }, D); r = await so("c_join", { handle: "gecici", on: true }, B); 
      r = await call("/api/delete", { password: "parola-123" }, D); ok(r.s === 200, "owner account deleted");
      r = await so("c_get", { handle: "gecici" }, B); ok(r.s === 404, "owned community removed with account");
      console.log("topluluk testleri geçti:", n); mock.close(); server.close(); process.exit(0);
    } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
  });
});
