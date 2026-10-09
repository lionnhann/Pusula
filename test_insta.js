// Instagram paketi: gizli hesap, yakın arkadaşlar, öne çıkanlar, yorumlar. node test_insta.js
const assert = require("assert"), http = require("http");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-insta-" + process.pid + ".db");
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
      const A = await reg("a@x.com", "Ali", "ali"), B = await reg("b@x.com", "Bora", "bora"), C = await reg("c@x.com", "Can", "can");
      const up = async (t, ty) => (await so("upload", { type: ty || "image/jpeg", size: 100 }, t)).key;
      let r;
      // ---- gizli hesap
      const pa = await so("post", { kind: "text", text: "gizli gönderi #gizli" }, A); const pid = pa.id;
      r = await so("profile", { private: true }, A); ok(r.s === 200 && r.profile.private === true, "private on");
      r = await so("getpost", { id: pid }, B); ok(r.s === 404, "stranger cannot open private post");
      r = await so("feed", { mode: "all" }, B); ok(!r.posts.some(p => p.id === pid), "private post hidden from general feed");
      r = await so("tag", { tag: "gizli" }, B); ok(r.posts.length === 0, "private post hidden from tag");
      r = await so("feed", { mode: "user", handle: "ali" }, B); ok(r.posts.length === 0, "user feed empty for stranger");
      r = await so("user", { handle: "ali" }, B); ok(r.private === true && r.locked === true && r.requested === false, "profile locked");
      r = await so("like", { id: pid }, B); ok(r.s === 404, "cannot like private"); r = await so("comment", { id: pid, text: "x" }, B); ok(r.s === 404, "cannot comment private");
      r = await so("feed", { mode: "user", handle: "ali" }, A); ok(r.posts.length === 1, "owner sees own");
      r = await so("follow", { handle: "ali", on: true }, B); ok(r.requested === true, "follow becomes request");
      r = await so("user", { handle: "ali" }, B); ok(r.requested === true && r.isFollowing === false, "requested state");
      r = await so("fr_list", {}, A); ok(r.requests.length === 1 && r.requests[0].handle === "bora", "request listed");
      r = await so("notifs", {}, A); ok(r.notifs.some(n => n.type === "freq"), "request notification");
      r = await so("fr_answer", { handle: "bora", accept: true }, A); ok(r.s === 200, "accept");
      r = await so("getpost", { id: pid }, B); ok(r.s === 200, "follower sees private post");
      r = await so("user", { handle: "ali" }, B); ok(r.isFollowing === true && r.locked === false, "unlocked after accept");
      r = await so("notifs", {}, B); ok(r.notifs.some(n => n.type === "facc"), "accept notification");
      await so("follow", { handle: "ali", on: true }, C); r = await so("fr_answer", { handle: "can", accept: false }, A); r = await so("user", { handle: "ali" }, C); ok(r.locked && !r.requested, "declined stays locked");
      await so("follow", { handle: "ali", on: true }, C); await so("follow", { handle: "ali", on: false }, C); r = await so("fr_list", {}, A); ok(r.requests.length === 0, "cancel request");
      await so("follow", { handle: "ali", on: true }, C); r = await so("profile", { private: false }, A); r = await so("user", { handle: "ali" }, C); ok(r.isFollowing === true && r.locked === false, "going public approves pending");
      await so("profile", { private: true }, A);
      // ---- yakın arkadaşlar
      r = await so("cf_list", {}, A); ok(r.people.length === 2 && r.people.every(x => !x.on), "followers listed, none close");
      r = await so("cf_set", { handle: "bora", on: true }, A); ok(r.s === 200 && r.count === 1, "add close friend");
      r = await so("cf_set", { handle: "ali", on: true }, B); ok(r.s === 404, "can't add non-follower");
      r = await so("story_new", { kind: "text", text: "sadece yakınlar", close: true }, A); const cs = r.id; r = await so("story_new", { kind: "text", text: "herkese" }, A);
      r = await so("stories", {}, B); const gb = r.stories.find(g => g.handle === "ali"); ok(gb && gb.items.length === 2 && gb.items.some(i => i.close), "close friend sees both");
      r = await so("stories", {}, C); const gc = r.stories.find(g => g.handle === "ali"); ok(gc && gc.items.length === 1 && !gc.items[0].close, "other follower sees only public story");
      r = await so("story_view", { id: cs }, C); ok(r.s === 404, "cannot view close story");
      r = await so("story_view", { id: cs }, B); ok(r.s === 200, "close friend views");
      r = await so("cf_set", { handle: "bora", on: false }, A); r = await so("stories", {}, B); ok(r.stories.find(g => g.handle === "ali").items.length === 1, "removed close friend loses access");
      // ---- arşiv + öne çıkanlar
      const mk = await up(A); r = await so("story_new", { kind: "photo", media: mk }, A); const ps = r.id;
      r = await so("hl_new", { title: "Yaz", stories: [ps, cs] }, A); ok(r.s === 200, "highlight created"); const hid = r.id;
      r = await so("hl_list", { handle: "ali" }, B); ok(r.highlights.length === 1 && r.highlights[0].title === "Yaz" && r.highlights[0].items.length === 2, "follower sees highlight");
      r = await so("hl_list", { handle: "ali" }, C); ok(r.highlights.length === 1, "follower C sees highlight");
      r = await call("/api/register", { email: "d@x.com", password: "parola-123", name: "D" }); await so("profile", { handle: "dora" }, r.token); const Dt = r.token;
      r = await so("hl_list", { handle: "ali" }, Dt); ok(r.highlights.length === 0, "stranger can't see private highlights");
      r = await so("hl_new", { title: "x", stories: [ps] }, B); ok(r.s === 400, "cannot highlight others' stories");
      dels.length = 0; await so("story_delete", { id: ps }, A); await wait(150); ok(!dels.includes("/pusula-media/" + mk), "story delete keeps media used by highlight");
      r = await so("hl_list", { handle: "ali" }, B); ok(r.highlights[0].items.length === 2, "highlight survives story delete");
      const itm = r.highlights[0].items.find(i => i.kind === "photo"); dels.length = 0;
      r = await so("hl_edit", { id: hid, remove: [itm.id], title: "Yaz 2" }, A); await wait(150); ok(r.s === 200 && dels.includes("/pusula-media/" + mk), "removing last use frees media");
      r = await so("hl_list", { handle: "ali" }, B); ok(r.highlights[0].title === "Yaz 2" && r.highlights[0].items.length === 1, "edited");
      r = await so("hl_del", { id: hid }, B); ok(r.s === 404, "only owner deletes"); r = await so("hl_del", { id: hid }, A); ok(r.s === 200, "deleted"); r = await so("hl_list", { handle: "ali" }, B); ok(r.highlights.length === 0, "gone");
      r = await so("story_archive", {}, A); ok(Array.isArray(r.stories), "archive endpoint");
      // ---- yorumlar
      await so("profile", { private: false }, A);
      const c1 = (await so("comment", { id: pid, text: "ilk yorum" }, B)).id; const c2 = (await so("comment", { id: pid, text: "ikinci" }, C)).id;
      r = await so("comment", { id: pid, text: "yanıt", parent: c1 }, A); ok(r.s === 200, "reply"); const rp = r.id;
      r = await so("comment", { id: pid, text: "yanıtın yanıtı", parent: rp }, C); ok(r.s === 200, "reply to reply flattens");
      r = await so("comment", { id: pid, text: "x", parent: "yok" }, C); ok(r.s === 404, "bad parent");
      r = await so("notifs", {}, B); ok(r.notifs.some(n => n.type === "reply"), "reply notification");
      r = await so("comments", { id: pid }, C); ok(r.comments.map(x => x.text).join("|") === "ilk yorum|yanıt|yanıtın yanıtı|ikinci" && r.comments[1].parent === c1 && r.comments[2].parent === c1, "ordering with replies grouped");
      r = await so("comment_like", { id: c1, on: true }, C); ok(r.likes === 1, "like comment"); await so("comment_like", { id: c1, on: true }, C);
      r = await so("comments", { id: pid }, C); ok(r.comments[0].likes === 1 && r.comments[0].liked === true, "like state");
      r = await so("comment_like", { id: c1, on: false }, C); ok(r.likes === 0, "unlike");
      r = await so("comment_pin", { id: c2, on: true }, B); ok(r.s === 404, "only post owner pins");
      r = await so("comment_pin", { id: c2, on: true }, A); r = await so("comments", { id: pid }, C); ok(r.comments[0].id === c2 && r.comments[0].pinned, "pinned first");
      r = await so("comment_pin", { id: c1, on: true }, A); r = await so("comments", { id: pid }, C); ok(r.comments[0].id === c1 && r.comments.filter(x => x.pinned).length === 1, "single pin");
      r = await so("comment_pin", { id: rp, on: true }, A); ok(r.s === 404, "replies can't be pinned");
      r = await so("delcomment", { id: c1 }, B); r = await so("comments", { id: pid }, C); ok(r.comments.length === 1 && r.comments[0].id === c2, "deleting comment removes replies");
      console.log("instagram testleri geçti:", n); mock.close(); server.close(); process.exit(0);
    } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
  });
});
