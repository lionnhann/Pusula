// Paket 7: gönderi anketi, gönderi arama, bildirim tercihleri, düet medyası. node test_pack7.js
const assert = require("assert"), http = require("http");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-p7-" + process.pid + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0";
process.env.R2_ACCOUNT_ID = "acct123"; process.env.R2_ACCESS_KEY_ID = "AKTEST"; process.env.R2_SECRET_ACCESS_KEY = "SECRETTEST"; process.env.R2_BUCKET = "pusula-media"; process.env.R2_PUBLIC_URL = "https://pub.example.dev";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const mock = http.createServer((req, res) => { res.statusCode = 204; res.end(); });
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
      // anket
      let r = await so("post", { kind: "text", text: "Hangisi?", poll: { opts: ["Çay"] } }, A); const P0 = r.id; r = await so("feed", { mode: "user", handle: "ali" }, B); ok(!r.posts.find(x => x.id === P0).poll, "single option is no poll");
      r = await so("post", { kind: "text", text: "Çay mı kahve mi?", poll: { opts: ["Çay", "Kahve", "Su", "Ayran", "Fazla"], hours: 24 } }, A); const P = r.id; ok(r.s === 200, "poll post");
      r = await so("feed", { mode: "user", handle: "ali" }, B); let pl = r.posts.find(x => x.id === P).poll; ok(pl && pl.opts.length === 4 && pl.mine === -1 && pl.show === false && pl.opts[0].n === undefined, "options capped at 4, results hidden before voting");
      r = await so("feed", { mode: "user", handle: "ali" }, A); pl = r.posts.find(x => x.id === P).poll; ok(pl.show === true && pl.total === 0, "author sees results");
      r = await so("post_vote", { id: P, choice: 9 }, B); ok(r.s === 400, "bad choice");
      r = await so("post_vote", { id: "yok", choice: 0 }, B); ok(r.s === 404, "unknown post");
      r = await so("post_vote", { id: P, choice: 1 }, B); ok(r.s === 200 && r.poll.mine === 1 && r.poll.opts[1].n === 1 && r.poll.total === 1, "vote");
      r = await so("post_vote", { id: P, choice: 0 }, B); ok(r.poll.mine === 1 && r.poll.total === 1, "cannot change vote");
      r = await so("post_vote", { id: P, choice: 0 }, C); ok(r.poll.total === 2 && r.poll.opts[0].n === 1, "second voter");
      r = await so("feed", { mode: "all" }, B); ok(r.posts.find(x => x.id === P).poll.show, "results visible after vote in feed");
      r = await so("block", { handle: "ali", on: true }, C); r = await so("post_vote", { id: P, choice: 0 }, C); ok(r.s === 404, "blocked cannot vote");
      // arama
      r = await so("post", { kind: "text", text: "Pusula ile seramik kupa yaptım" }, A);
      r = await so("search_posts", { q: "seramik" }, B); ok(r.posts.length === 1 && r.posts[0].handle === "ali", "search finds");
      r = await so("search_posts", { q: "s" }, B); ok(r.s === 400, "short query");
      r = await so("search_posts", { q: "%%" }, B); ok(r.s === 400, "wildcards escaped");
      r = await so("search_posts", { q: "seramik" }, C); ok(r.posts.length === 0, "blocked author hidden");
      await so("profile", { bio: "x", private: true }, B); await so("post", { kind: "text", text: "gizli seramik notu" }, B);
      r = await so("search_posts", { q: "gizli seramik" }, A); ok(r.posts.length === 0, "private account hidden from search");
      // bildirim tercihleri
      r = await so("notif_prefs", {}, A); ok(r.groups.length === 9 && r.groups.every(g => g.on), "all on by default");
      r = await so("notif_prefs", { grp: "nope", on: false }, A); ok(r.s === 400, "bad group");
      r = await so("notif_prefs", { grp: "like", on: false }, A); ok(!r.groups.find(g => g.grp === "like").on, "like off");
      await so("follow", { handle: "ali", on: true }, C);
      r = await so("post", { kind: "text", text: "beğen" }, A); const LP = r.id;
      await so("like", { id: LP, on: true }, B); r = await so("notifs", {}, A); ok(!r.notifs.some(x => x.type === "like"), "like notification suppressed");
      await so("comment", { id: LP, text: "güzel" }, B); r = await so("notifs", {}, A); ok(r.notifs.some(x => x.type === "comment"), "comment notification still arrives");
      r = await so("notif_prefs", { grp: "like", on: true }, A); ok(r.groups.find(g => g.grp === "like").on, "like back on");
      // düet medyası
      const up = async t => (await so("upload", { type: "video/mp4", size: 1000 }, t)).key;
      const k1 = await up(A); r = await so("post", { kind: "reel", text: "orijinal", media: k1 }, A); const R1 = r.id;
      r = await so("post", { kind: "reel", text: "düet", media: await up(B), replyTo: R1 }, B);
      r = await so("feed", { mode: "user", handle: "bora" }, B); const rp = r.posts.find(x => x.replyTo); ok(rp && rp.replyTo.media && rp.replyTo.media.includes(k1.split("/").pop()), "duet source media url present");
      console.log("paket 7 testleri geçti:", n); mock.close(); server.close(); process.exit(0);
    } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
  });
});
