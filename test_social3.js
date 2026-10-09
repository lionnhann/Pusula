// Pusula Medya 3: kaydedilenler, hikâye anketi, mesaj silme, yönetici uçları, hesap silerken depolama temizliği. node test_social3.js
const assert = require("assert"), http = require("http");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-soc3-" + process.pid + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0"; process.env.ADMIN_TOKEN = "adm-test-token-123456";
process.env.R2_ACCOUNT_ID = "acct123"; process.env.R2_ACCESS_KEY_ID = "AKTEST"; process.env.R2_SECRET_ACCESS_KEY = "SECRETTEST"; process.env.R2_BUCKET = "pusula-media"; process.env.R2_PUBLIC_URL = "https://pub.example.dev";
const dels = []; let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const mock = http.createServer((req, res) => { if (req.method === "DELETE") dels.push(new URL(req.url, "http://x").pathname); res.statusCode = 204; res.end(); });
mock.listen(0, () => {
  process.env.R2_ENDPOINT_BASE = "http://127.0.0.1:" + mock.address().port;
  const { server } = require("./server.js");
  server.listen(0, async () => {
    const base = "http://127.0.0.1:" + server.address().port;
    const call = async (p, b, tok, hdr) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}, hdr || {}), body: JSON.stringify(b || {}) }); return Object.assign({ s: r.status }, await r.json().catch(() => ({}))); };
    const adm = (p, b) => call(p, b, null, { "x-admin-token": "adm-test-token-123456" });
    try {
      const reg = async (e, nm, h) => { const t = (await call("/api/register", { email: e, password: "parola-123", name: nm })).token; await call("/api/social/profile", { handle: h }, t); return t; };
      const A = await reg("a@x.com", "Ali", "ali"), B = await reg("b@x.com", "Bora", "bora"), C = await reg("c@x.com", "Can", "can_x");
      const E = require("./e2e_help.js")(call); await E.key(A, "ali"); await E.key(B, "bora");
      await call("/api/social/follow", { handle: "ali", on: true }, B);
      let r = await call("/api/social/post", { kind: "text", text: "Merhaba dünya" }, A); const pid = r.id;
      // kaydedilenler
      r = await call("/api/social/save", { id: pid, on: true }, B); ok(r.s === 200 && r.saved, "save");
      r = await call("/api/social/saved", {}, B); ok(r.posts.length === 1 && r.posts[0].id === pid && r.posts[0].saved === true, "saved list");
      r = await call("/api/social/saved", {}, A); ok(r.posts.length === 0, "saved is private");
      r = await call("/api/social/feed", { mode: "all" }, B); ok(r.posts[0].saved === true, "feed shows saved flag");
      r = await call("/api/social/save", { id: "nope", on: true }, B); ok(r.s === 404, "save unknown post");
      await call("/api/social/block", { handle: "ali", on: true }, C); r = await call("/api/social/save", { id: pid, on: true }, C); ok(r.s === 404, "cannot save blocked user's post");
      r = await call("/api/social/save", { id: pid, on: false }, B); r = await call("/api/social/saved", {}, B); ok(r.posts.length === 0, "unsave");
      // hikâye anketi
      r = await call("/api/social/story_new", { kind: "text", text: "Hangisi?", poll: { a: "Çay", b: "" } }, A); ok(r.s === 400 && r.error === "bad_poll", "poll needs both options");
      r = await call("/api/social/story_new", { kind: "text", text: "Hangisi?", poll: { a: "Çay", b: "Kahve" } }, A); ok(r.s === 200, "poll story"); const sid = r.id;
      r = await call("/api/social/stories", {}, B); let it = r.stories[0].items[0]; ok(it.poll && it.poll.a === "Çay" && it.poll.b === "Kahve" && it.poll.votes === null && it.poll.my === -1, "viewer sees poll without results before voting");
      r = await call("/api/social/story_vote", { id: sid, choice: 1 }, A); ok(r.s === 404, "owner cannot vote");
      r = await call("/api/social/story_vote", { id: sid, choice: 1 }, C); ok(r.s === 404, "non-follower cannot vote");
      r = await call("/api/social/story_vote", { id: sid, choice: 5 }, B); ok(r.s === 404, "bad choice");
      r = await call("/api/social/story_vote", { id: sid, choice: 1 }, B); ok(r.s === 200 && r.poll.my === 1 && r.poll.votes[1] === 1 && r.poll.votes[0] === 0, "vote counted, results shown after voting");
      r = await call("/api/social/story_vote", { id: sid, choice: 0 }, B); ok(r.poll.my === 1 && r.poll.votes[0] === 0, "vote cannot be changed");
      r = await call("/api/social/stories", {}, A); ok(r.stories[0].items[0].poll.votes[1] === 1, "owner sees results");
      // mesaj silme
      const fa = E.fp(A), fb = E.fp(B);
      r = await call("/api/social/upload", { type: "application/octet-stream", size: 100 }, A); const mk = r.key;
      r = await call("/api/social/send", { handle: "bora", text: E.env(A, "bora"), media: mk }, A); const mid = r.id; ok(r.s === 200 && mid, "dm with media");
      r = await call("/api/social/msg_delete", { kind: "d", id: mid }, B); ok(r.s === 404, "recipient cannot delete sender's message");
      dels.length = 0; r = await call("/api/social/msg_delete", { kind: "d", id: mid }, A); await new Promise(z => setTimeout(z, 150)); ok(r.s === 200 && dels.includes("/pusula-media/" + mk), "sender deletes message and its media");
      r = await call("/api/social/thread", { handle: "ali" }, B); ok(r.msgs.length === 0, "message gone for recipient");
      // grup mesajı silme
      r = await E.key(C, "can_x"); await call("/api/social/block", { handle: "ali", on: false }, C);
      r = await call("/api/social/gcreate", { name: "Ekip", members: ["bora"] }, A); const gid = r.id; await E.gkeys(A, gid, [{ tok: A, handle: "ali" }, { tok: B, handle: "bora" }], 1);
      r = await call("/api/social/gsend", { id: gid, text: E.genv(1) }, A); const gm = r.id;
      r = await call("/api/social/msg_delete", { kind: "g", group: gid, id: gm }, B); ok(r.s === 404, "member cannot delete others' group message");
      r = await call("/api/social/msg_delete", { kind: "g", group: gid, id: gm }, A); ok(r.s === 200, "author deletes group message");
      r = await call("/api/social/gthread", { id: gid }, B); ok(r.msgs.length === 0, "group message gone");
      // yönetici
      r = await adm("/api/admin/stats", {}); ok(r.users === 3 && r.posts === 1 && r.profiles === 3 && r.stories === 1, "admin stats " + JSON.stringify(r));
      r = await call("/api/admin/stats", {}); ok(r.s === 401, "admin needs token");
      r = await adm("/api/admin/users", { q: "bor" }); ok(r.users.length === 1 && r.users[0].handle === "bora" && r.users[0].email === "b@x.com" && r.users[0].banned === false, "admin user search");
      r = await adm("/api/admin/posts", { handle: "ali" }); ok(r.posts.length === 1 && r.posts[0].text === "Merhaba dünya", "admin posts");
      await call("/api/social/report", { kind: "post", target: pid, reason: "spam" }, B);
      await call("/api/social/report", { kind: "msg", target: "d:99", reason: "taciz", evidence: "kötü söz" }, B);
      r = await adm("/api/admin/reports", {}); const rp = r.reports.find(x => x.kind === "post"); ok(rp && rp.reporter_handle === "bora" && rp.target_handle === "ali" && rp.preview === "Merhaba dünya", "report enriched");
      ok(r.reports.some(x => x.kind === "msg" && x.evidence === "kötü söz"), "report evidence");
      r = await call("/api/social/send", { handle: "bora", text: E.env(A, "bora") }, A); const m2 = r.id;
      r = await adm("/api/admin/remove", { msg: "d:" + m2 }); r = await call("/api/social/thread", { handle: "ali" }, B); ok(r.msgs.length === 0, "admin removes message");
      r = await adm("/api/admin/remove", { ban: "ali", reason: "test" }); r = await adm("/api/admin/users", { q: "ali" }); ok(r.users[0].banned === true, "admin ban");
      r = await adm("/api/admin/remove", { unban: "ali" }); r = await adm("/api/admin/users", { q: "ali" }); ok(r.users[0].banned === false, "admin unban");
      // hesap silme: depolamayı temizler
      r = await call("/api/social/upload", { type: "image/jpeg", size: 100 }, A); const pk = r.key; r = await call("/api/social/post", { kind: "photo", media: pk, text: "foto" }, A);
      dels.length = 0; r = await call("/api/delete", { password: "parola-123" }, A); await new Promise(z => setTimeout(z, 250)); ok(r.s === 200 && dels.includes("/pusula-media/" + pk), "account delete removes stored media: " + dels.join());
      console.log("OK " + n + " kontrol");
    } catch (e) { console.error("FAIL", e.message, "\n", e.stack.split("\n").slice(0, 3).join("\n")); process.exitCode = 1; }
    server.close(); mock.close(); setTimeout(() => process.exit(process.exitCode || 0), 100);
  });
});
