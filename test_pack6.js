// Paket 6: Vitrin siparişleri, Reels yanıtı. node test_pack6.js
const assert = require("assert"), http = require("http");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-p6-" + process.pid + ".db");
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
      // sipariş
      let r = await so("l_new", { title: "Seramik kupa", price: 250, category: "El işi" }, A); const L = r.id;
      r = await so("o_new", { listing: L, offer: 200 }, A); ok(r.s === 404, "cannot order own");
      r = await so("o_new", { listing: L, offer: -5 }, B); ok(r.s === 400, "bad offer");
      r = await so("o_new", { listing: "yok" }, B); ok(r.s === 404, "unknown listing");
      r = await so("o_new", { listing: L, offer: 200, note: "Hafta sonu alabilir miyim?" }, B); ok(r.s === 200, "offer"); const O = r.id;
      r = await so("o_new", { listing: L }, B); ok(r.s === 409 && r.error === "order_exists", "one open order");
      r = await so("notifs", {}, A); ok(r.notifs.some(x => x.type === "order" && /200/.test(x.text)), "seller notified");
      r = await so("o_list", { role: "sell" }, A); ok(r.orders.length === 1 && r.open === 1 && r.orders[0].other === "bora" && r.orders[0].offer === 200 && r.orders[0].mine === false, "seller list");
      r = await so("o_list", { role: "buy" }, B); ok(r.orders.length === 1 && r.orders[0].other === "ali" && r.orders[0].mine === true, "buyer list");
      r = await so("o_list", { role: "sell" }, C); ok(r.orders.length === 0, "stranger sees none");
      r = await so("o_act", { id: O, act: "accept" }, B); ok(r.s === 409, "buyer cannot accept");
      r = await so("o_act", { id: O, act: "accept" }, C); ok(r.s === 404, "stranger cannot act");
      r = await so("o_act", { id: O, act: "done" }, A); ok(r.s === 409, "cannot finish before accept");
      r = await so("seller_rate", { handle: "ali", stars: 5 }, B); ok(r.s === 403, "no rating before accept");
      r = await so("o_act", { id: O, act: "accept" }, A); ok(r.s === 200 && r.status === "accepted", "accept");
      r = await so("notifs", {}, B); ok(r.notifs.some(x => x.type === "order_accepted"), "buyer notified");
      r = await so("seller_rate", { handle: "ali", stars: 5, text: "Harika" }, B); ok(r.s === 200, "can rate after accepted order");
      r = await so("o_act", { id: O, act: "done", sold: true }, A); ok(r.s === 200 && r.status === "done", "done");
      r = await so("l_get", { id: L }, C); ok(r.listing.status === "sold", "listing marked sold");
      r = await so("o_act", { id: O, act: "cancel" }, B); ok(r.s === 409, "cannot cancel done");
      r = await so("o_new", { listing: L }, C); ok(r.s === 404, "sold listing not orderable");
      r = await so("l_new", { title: "Logo", price: 100 }, A); const L2 = r.id;
      r = await so("o_new", { listing: L2 }, C); const O2 = r.id; ok(r.s === 200, "plain order");
      r = await so("o_act", { id: O2, act: "decline" }, A); ok(r.status === "declined", "decline");
      r = await so("o_new", { listing: L2 }, C); ok(r.s === 200, "can reorder after decline"); const O3 = r.id;
      r = await so("o_act", { id: O3, act: "cancel" }, C); ok(r.status === "cancelled", "buyer cancels");
      // reels yanıtı
      const up = async t => (await so("upload", { type: "video/mp4", size: 1000 }, t)).key;
      r = await so("post", { kind: "reel", text: "orijinal", media: await up(A) }, A); const R1 = r.id;
      r = await so("post", { kind: "reel", text: "yanıt", media: await up(B), replyTo: R1 }, B); const R2 = r.id; ok(r.s === 200, "reply reel");
      r = await so("feed", { mode: "user", handle: "bora" }, C); const rp = r.posts.find(x => x.id === R2); ok(rp && rp.replyTo && rp.replyTo.id === R1 && rp.replyTo.handle === "ali", "replyTo in feed");
      r = await so("notifs", {}, A); ok(r.notifs.some(x => x.type === "reelreply"), "original author notified");
      r = await so("post", { kind: "reel", text: "x", media: await up(C), replyTo: "yok" }, C); ok(r.s === 200, "bad target ignored");
      r = await so("feed", { mode: "user", handle: "can_x" }, A); ok(!r.posts[0].replyTo, "no label for bad target");
      r = await so("block", { handle: "ali", on: true }, C);
      r = await so("post", { kind: "reel", text: "y", media: await up(C), replyTo: R1 }, C); r = await so("feed", { mode: "user", handle: "can_x" }, B); ok(!r.posts[0].replyTo, "blocked target ignored");
      console.log("paket 6 testleri geçti:", n); mock.close(); server.close(); process.exit(0);
    } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
  });
});
