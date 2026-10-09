// Paket 2: konum, koleksiyon, notlar. node test_pack2.js
const assert = require("assert"), http = require("http");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-pack2-" + process.pid + ".db");
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
      let r; await so("follow", { handle: "ali", on: true }, B);
      // konum
      const p1 = (await so("post", { kind: "text", text: "kahve", place: "İzmir, Alsancak" }, A)).id; await so("post", { kind: "text", text: "başka", place: "Ankara" }, A);
      r = await so("getpost", { id: p1 }, B); ok(r.post.place === "İzmir, Alsancak", "place returned");
      r = await so("place", { place: "izmir, alsancak" }, B); ok(r.posts.length === 1 && r.posts[0].id === p1 && r.place === "İzmir, Alsancak", "place search is Turkish-safe");
      r = await so("place", { place: "" }, B); ok(r.s === 400, "empty place rejected");
      r = await so("places", {}, B); ok(r.places.length === 2, "popular places");
      r = await so("post_edit", { id: p1, text: "kahve", place: "Bornova" }, A); r = await so("place", { place: "Bornova" }, B); ok(r.posts.length === 1, "edit place");
      r = await so("post", { kind: "text", text: "zamanlı", place: "Bursa", }, A);
      r = await so("sched_new", { kind: "text", text: "zamanlı konum", place: "Edirne", at: Date.now() + 300 }, A); ok(r.s === 200, "schedule"); await wait(900);
      r = await so("place", { place: "Edirne" }, B); ok(r.posts.length === 1 && r.posts[0].text === "zamanlı konum", "scheduled post keeps place");
      await so("profile", { private: true }, A); r = await so("place", { place: "Bornova" }, await reg("c@x.com", "Can", "can")); ok(r.posts.length === 0, "private posts hidden in place feed"); await so("profile", { private: false }, A);
      // koleksiyonlar
      r = await so("coll_new", { name: "Yemek" }, B); const k1 = r.id; ok(r.s === 200, "collection created");
      r = await so("save", { id: p1, on: true, coll: k1 }, B); r = await so("saved", { coll: k1 }, B); ok(r.posts.length === 1, "saved into collection");
      const p2 = (await so("post", { kind: "text", text: "ikinci" }, A)).id; await so("save", { id: p2, on: true }, B);
      r = await so("saved", {}, B); ok(r.posts.length === 2, "all saved"); r = await so("saved", { coll: k1 }, B); ok(r.posts.length === 1, "filter works");
      r = await so("coll_list", {}, B); ok(r.total === 2 && r.collections[0].n === 1, "counts");
      r = await so("coll_set", { id: p2, coll: k1 }, B); r = await so("saved", { coll: k1 }, B); ok(r.posts.length === 2, "move into collection");
      r = await so("coll_set", { id: p2, coll: k1 }, A); ok(r.s === 404, "can't touch others' saves");
      r = await so("coll_del", { id: k1 }, A); ok(r.s === 404, "only owner deletes collection");
      r = await so("coll_del", { id: k1 }, B); r = await so("saved", {}, B); ok(r.posts.length === 2, "deleting collection keeps saves"); r = await so("coll_list", {}, B); ok(r.collections.length === 0, "collection gone");
      // notlar
      r = await so("note_set", { text: "Kahve molası ☕" }, A); ok(r.s === 200, "note set");
      r = await so("notes", {}, B); ok(r.notes.length === 1 && r.notes[0].handle === "ali" && !r.notes[0].own, "follower sees note");
      r = await so("notes", {}, A); ok(r.notes[0].own, "own note flagged");
      const D = await reg("d@x.com", "Dora", "dora"); r = await so("notes", {}, D); ok(r.notes.length === 0, "non-follower doesn't see");
      r = await so("note_set", { text: "güncel" }, A); r = await so("notes", {}, B); ok(r.notes.length === 1 && r.notes[0].text === "güncel", "note replaced");
      await so("note_set", { text: "" }, A); r = await so("notes", {}, B); ok(r.notes.length === 0, "note cleared");
      console.log("paket2 testleri geçti:", n); mock.close(); server.close(); process.exit(0);
    } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
  });
});
