// Pusula Medya 2 testi: hikâye, bildirim, etiket, keşfet, grup, tepki, yazıyor, sesli mesaj, depolama temizliği. node test_social2.js
const assert = require("assert"), http = require("http");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-soc2-" + process.pid + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0";
process.env.R2_ACCOUNT_ID = "acct123"; process.env.R2_ACCESS_KEY_ID = "AKTEST"; process.env.R2_SECRET_ACCESS_KEY = "SECRETTEST"; process.env.R2_BUCKET = "pusula-media"; process.env.R2_PUBLIC_URL = "https://pub.example.dev";
const dels = [];
const mock = http.createServer((req, res) => { if (req.method === "DELETE") dels.push(new URL(req.url, "http://x").pathname); res.statusCode = 204; res.end(); });
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
mock.listen(0, () => {
  process.env.R2_ENDPOINT_BASE = "http://127.0.0.1:" + mock.address().port;
  const { server } = require("./server.js");
  server.listen(0, async () => {
    const base = "http://127.0.0.1:" + server.address().port;
    const call = async (p, b, tok) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}), body: JSON.stringify(b || {}) }); return Object.assign({ s: r.status }, await r.json().catch(() => ({}))); };
    try {
      const reg = async (e, nm, h) => { const t = (await call("/api/register", { email: e, password: "parola-123", name: nm })).token; await call("/api/social/profile", { handle: h }, t); return t; };
      const A = await reg("a@x.com", "Ali", "ali"), B = await reg("b@x.com", "Bora", "bora"), C = await reg("c@x.com", "Can", "can_x"), D = await reg("d@x.com", "Deniz", "deniz");
      const up = async (tok, type, size) => (await call("/api/social/upload", { type, size }, tok));
      const E = require("./e2e_help.js")(call); await E.key(A, "ali"); await E.key(B, "bora"); await E.key(C, "can_x"); await E.key(D, "deniz");
      // --- etiket + anma + bildirim
      let r = await call("/api/social/post", { kind: "text", text: "Merhaba #Pusula #ÇAY dünyası @bora ve @yok_kimse #a" }, A); ok(r.s === 200, "post with tags");
      const pid = r.id;
      r = await call("/api/social/tag", { tag: "#pusula" }, B); ok(r.posts.length === 1 && r.posts[0].id === pid, "tag search case-insensitive");
      r = await call("/api/social/tag", { tag: "çay" }, B); ok(r.posts.length === 1, "turkish tag lowercase (ÇAY→çay)");
      r = await call("/api/social/tag", { tag: "a" }, B); ok(r.s === 400, "too short tag");
      r = await call("/api/social/notifs", {}, B); ok(r.notifs.length === 1 && r.notifs[0].type === "mention" && r.notifs[0].handle === "ali", "mention notification");
      r = await call("/api/social/me", {}, B); ok(r.notif === 1, "me shows unread notifs");
      await call("/api/social/like", { id: pid, on: true }, B); await call("/api/social/like", { id: pid, on: false }, B); await call("/api/social/like", { id: pid, on: true }, B);
      await call("/api/social/comment", { id: pid, text: "güzel @can_x" }, B);
      await call("/api/social/follow", { handle: "ali", on: true }, B); await call("/api/social/follow", { handle: "ali", on: false }, B); await call("/api/social/follow", { handle: "ali", on: true }, B);
      r = await call("/api/social/notifs", {}, A); const ty = r.notifs.map(x => x.type).sort().join(","); ok(ty === "comment,follow,like", "like/follow notified once, comment notified: " + ty);
      await call("/api/social/like", { id: pid, on: true }, A); ok((await call("/api/social/notifs", {}, A)).notifs.length === 3, "no self notification");
      r = await call("/api/social/notifs", {}, C); ok(r.notifs.some(x => x.type === "mention" && x.handle === "bora"), "mention in comment");
      await call("/api/social/notifs_read", {}, A); r = await call("/api/social/me", {}, A); ok(r.notif === 0, "notifs marked read");
      await call("/api/social/block", { handle: "deniz", on: true }, A); await call("/api/social/comment", { id: pid, text: "x" }, D);
      r = await call("/api/social/notifs", {}, A); ok(!r.notifs.some(x => x.handle === "deniz"), "blocked user cannot notify");
      await call("/api/social/block", { handle: "deniz", on: false }, A);
      // --- tek gönderi + keşfet
      r = await call("/api/social/getpost", { id: pid }, C); ok(r.post.id === pid && r.post.likes === 2, "getpost");
      r = await call("/api/social/getpost", { id: "nope" }, C); ok(r.s === 404, "getpost 404");
      r = await call("/api/social/explore", {}, D); ok(r.tags.some(t => t.tag === "pusula") && r.posts[0].id === pid && r.people.some(p => p.handle === "ali") && !r.people.some(p => p.handle === "deniz"), "explore: tags, popular, people");
      await call("/api/social/follow", { handle: "ali", on: true }, D); r = await call("/api/social/explore", {}, D); ok(!r.people.some(p => p.handle === "ali"), "already followed not suggested");
      // --- hikâye
      r = await up(A, "image/jpeg", 1000); const k1 = r.key;
      r = await call("/api/social/story_new", { kind: "photo", media: k1 }, A); ok(r.s === 200, "photo story"); const s1 = r.id;
      r = await call("/api/social/story_new", { kind: "text", text: "yazı hikâyesi", bg: 3 }, A); ok(r.s === 200, "text story");
      r = await call("/api/social/story_new", { kind: "photo", media: "m/başka/x.jpg" }, A); ok(r.s === 400, "foreign media rejected");
      r = await call("/api/social/story_new", { kind: "text", text: "" }, A); ok(r.s === 400, "empty text story");
      r = await call("/api/social/stories", {}, B); ok(r.stories.length === 1 && r.stories[0].handle === "ali" && r.stories[0].items.length === 2 && !r.stories[0].seen && r.stories[0].items[0].media === "https://pub.example.dev/" + k1, "follower sees stories");
      r = await call("/api/social/stories", {}, C); ok(r.stories.length === 0, "non-follower sees none");
      r = await call("/api/social/stories", {}, A); ok(r.stories[0].own && r.stories[0].seen, "own first, seen");
      await call("/api/social/story_view", { id: s1 }, B); r = await call("/api/social/stories", {}, B); ok(!r.stories[0].items[0].seen === false && r.stories[0].items[0].seen === true && r.stories[0].items[1].seen === false && !r.stories[0].seen, "per-item seen");
      r = await call("/api/social/story_view", { id: s1 }, C); ok(r.s === 404, "non-follower cannot view story");
      r = await call("/api/social/story_viewers", { id: s1 }, A); ok(r.viewers.length === 1 && r.viewers[0].handle === "bora", "owner sees viewers");
      r = await call("/api/social/story_viewers", { id: s1 }, B); ok(r.s === 404, "others cannot list viewers");
      await call("/api/social/block", { handle: "bora", on: true }, A); r = await call("/api/social/stories", {}, B); ok(r.stories.length === 0, "blocked hides stories"); await call("/api/social/block", { handle: "bora", on: false }, A);
      await call("/api/social/follow", { handle: "ali", on: true }, B);
      r = await call("/api/social/story_delete", { id: s1 }, B); ok(r.s === 404, "others cannot delete story");
      dels.length = 0; r = await call("/api/social/story_delete", { id: s1 }, A); await new Promise(z => setTimeout(z, 150)); ok(r.s === 200 && dels.some(p => p === "/pusula-media/" + k1), "delete removes R2 object: " + dels.join());
      // --- gönderi silinince depolama temizliği
      r = await up(A, "image/png", 1000); const k2 = r.key; r = await call("/api/social/post", { kind: "photo", media: k2, text: "foto" }, A); dels.length = 0;
      await call("/api/social/delete", { id: r.id }, A); await new Promise(z => setTimeout(z, 100)); ok(dels.includes("/pusula-media/" + k2), "post delete removes media");
      // --- sesli / video mesaj
      r = await up(A, "audio/webm", 50000); ok(r.s === 200 && r.key.endsWith(".weba"), "audio upload type");
      const ak = r.key; r = await call("/api/social/send", { handle: "bora", media: ak, text: E.env(A, "bora") }, A); ok(r.s === 400, "plain media rejected (e2e)"); r = await up(A, "application/octet-stream", 9000); const ek = r.key; ok(ek.endsWith(".enc"), "enc upload"); r = await call("/api/social/send", { handle: "bora", media: ek, text: E.env(A, "bora") }, A); ok(r.s === 200, "voice message");
      r = await up(A, "audio/webm", 7e6); ok(r.s === 413, "audio too large");
      r = await up(A, "application/octet-stream", 5e6); const vk = r.key; const klip = E.env(A, "bora"); r = await call("/api/social/send", { handle: "bora", media: vk, text: klip }, A); ok(r.s === 200, "video message in DM");
      r = await call("/api/social/send", { handle: "bora", media: "m/x/y.exe" }, A); ok(r.s === 400, "bad media in DM");
      // --- tepki + yazıyor (birebir)
      r = await call("/api/social/thread", { handle: "ali" }, B); ok(r.msgs.length === 2 && r.msgs[0].media.endsWith(".enc"), "thread shows encrypted media");
      const mid = r.msgs[0].id; r = await call("/api/social/react", { kind: "d", id: mid, emoji: "🔥" }, B); ok(r.re["🔥"] === 1 && r.my === "🔥", "react");
      r = await call("/api/social/react", { kind: "d", id: mid, emoji: "💩" }, B); ok(r.s === 400, "emoji whitelist");
      r = await call("/api/social/react", { kind: "d", id: mid, emoji: "👍" }, C); ok(r.s === 404, "stranger cannot react");
      await call("/api/social/react", { kind: "d", id: mid, emoji: "😂" }, A);
      r = await call("/api/social/thread", { handle: "bora" }, A); ok(r.msgs[0].re["🔥"] === 1 && r.msgs[0].re["😂"] === 1 && r.msgs[0].my === "😂", "reactions in thread");
      await call("/api/social/typing", { handle: "bora" }, A); r = await call("/api/social/thread", { handle: "ali" }, B); ok(r.typing === true, "typing visible to peer");
      r = await call("/api/social/thread", { handle: "bora" }, A); ok(r.typing === false, "typing not echoed");
      r = await call("/api/social/react", { kind: "d", id: mid, emoji: "" }, B); ok(r.my === "" && !r.re["🔥"], "remove reaction");
      // --- grup
      r = await call("/api/social/gcreate", { name: "Ekip", members: ["bora", "@can_x", "yok_yok", "ali"] }, A); ok(r.s === 200 && r.id, "group create"); const gid = r.id; r = await E.gkeys(A, gid, [{ tok: A, handle: "ali" }, { tok: B, handle: "bora" }, { tok: C, handle: "can_x" }], 1); ok(r.s === 200 && r.count === 3, "group key epoch 1");
      r = await call("/api/social/gcreate", { name: "Boş", members: ["yok_yok"] }, A); ok(r.s === 400, "group needs members");
      r = await call("/api/social/gcreate", { name: "", members: ["bora"] }, A); ok(r.s === 400, "group needs name");
      r = await call("/api/social/gsend", { id: gid, text: E.genv(1) }, A); ok(r.s === 200, "group send");
      r = await call("/api/social/gsend", { id: gid, text: "hey" }, D); ok(r.s === 404, "non-member cannot send");
      r = await call("/api/social/gthread", { id: gid }, D); ok(r.s === 404, "non-member cannot read");
      r = await call("/api/social/chats", {}, B); const gc = r.chats.find(c => c.type === "group"); ok(gc && gc.name === "Ekip" && gc.unread === 1 && gc.members === 3 && gc.from === "ali", "chats lists group with unread");
      ok(r.chats.some(c => c.type === "dm" && c.handle === "ali" && c.text === klip), "chats lists dm with last text");
      r = await call("/api/social/gthread", { id: gid }, B); ok(r.msgs.length === 1 && r.msgs[0].handle === "ali" && !r.msgs[0].mine && r.members.length === 3 && r.name === "Ekip", "group thread");
      r = await call("/api/social/chats", {}, B); ok(r.chats.find(c => c.type === "group").unread === 0, "group read marks unread 0");
      const gm = (await call("/api/social/gthread", { id: gid }, C)).msgs[0].id;
      r = await call("/api/social/react", { kind: "g", id: gm, emoji: "❤️" }, C); ok(r.re["❤️"] === 1, "group react");
      r = await call("/api/social/react", { kind: "g", id: gm, emoji: "❤️" }, D); ok(r.s === 404, "non-member cannot react in group");
      await call("/api/social/typing", { group: gid }, C); r = await call("/api/social/gthread", { id: gid }, B); ok(r.typing.join() === "can_x", "group typing");
      r = await up(B, "application/octet-stream", 2000); r = await call("/api/social/gsend", { id: gid, media: r.key, text: E.genv(1) }, B); ok(r.s === 200, "group voice");
      r = await call("/api/social/gadd", { id: gid, handle: "deniz" }, B); ok(r.s === 404, "only owner adds");
      r = await call("/api/social/gadd", { id: gid, handle: "deniz" }, A); ok(r.s === 200, "owner adds member");
      r = await call("/api/social/gthread", { id: gid }, D); ok(r.s === 200 && r.members.length === 4, "added member reads");
      r = await call("/api/social/me", {}, C); ok(r.unread >= 1, "me.unread includes group messages");
      r = await call("/api/social/gleave", { id: gid }, A); ok(r.s === 200, "owner leaves");
      r = await call("/api/social/gthread", { id: gid }, B); ok(r.s === 200 && r.members.length === 3, "group survives, owner transferred");
      for (const t of [B, C, D]) await call("/api/social/gleave", { id: gid }, t);
      r = await call("/api/social/gthread", { id: gid }, B); ok(r.s === 404, "empty group deleted");
      r = await call("/api/social/report", { kind: "story", target: "s1", reason: "x" }, B); ok(r.s === 200, "story report kind");
      console.log("OK " + n + " kontrol");
    } catch (e) { console.error("FAIL", e.message, "\n", e.stack.split("\n").slice(0, 4).join("\n")); process.exitCode = 1; }
    server.close(); mock.close(); setTimeout(() => process.exit(process.exitCode || 0), 100);
  });
});
