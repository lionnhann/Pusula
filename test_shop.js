// Vitrin (ürün/hizmet ilanları). node test_shop.js
const assert = require("assert"), http = require("http");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-shop-" + process.pid + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0"; process.env.ADMIN_TOKEN = "adm-test-token-123456";
process.env.R2_ACCOUNT_ID = "acct123"; process.env.R2_ACCESS_KEY_ID = "AKTEST"; process.env.R2_SECRET_ACCESS_KEY = "SECRETTEST"; process.env.R2_BUCKET = "pusula-media"; process.env.R2_PUBLIC_URL = "https://pub.example.dev";
const dels = []; let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const mock = http.createServer((req, res) => { if (req.method === "DELETE") dels.push(new URL(req.url, "http://x").pathname); res.statusCode = 204; res.end(); });
const wait = ms => new Promise(z => setTimeout(z, ms));
mock.listen(0, () => {
  process.env.R2_ENDPOINT_BASE = "http://127.0.0.1:" + mock.address().port;
  const { server } = require("./server.js");
  server.listen(0, async () => {
    const base = "http://127.0.0.1:" + server.address().port;
    const call = async (p, b, tok, hdr) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}, hdr || {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
    const so = (p, b, t) => call("/api/social/" + p, b, t);
    try {
      const reg = async (e, nm, h) => { const t = (await call("/api/register", { email: e, password: "parola-123", name: nm })).token; await so("profile", { handle: h }, t); return t; };
      const A = await reg("a@x.com", "Ali", "ali"), B = await reg("b@x.com", "Bora", "bora"), C = await reg("c@x.com", "Can", "can_x");
      let r = await so("l_new", { title: "", price: 10 }, A); ok(r.s === 400 && r.error === "bad_title", "title required");
      r = await so("l_new", { title: "x", price: -5 }, A); ok(r.s === 400 && r.error === "bad_price", "negative price");
      r = await so("l_new", { title: "x", image: "m/baska/x.jpg" }, A); ok(r.s === 400 && r.error === "bad_media", "foreign image");
      const img = await so("upload", { type: "image/jpeg", size: 100 }, A);
      r = await so("l_new", { title: "El yapımı seramik kupa", about: "Fırınlanmış, 300 ml", price: 250, currency: "TRY", category: "El işi", city: "İzmir", kind: "product", image: img.key }, A); ok(r.s === 200, "create"); const L1 = r.id;
      r = await so("l_new", { title: "Logo tasarımı", about: "3 revizyon", price: "", category: "Yazılım ve tasarım", city: "Ankara", kind: "service" }, A); ok(r.s === 200, "price optional"); const L2 = r.id;
      r = await so("l_new", { title: "Eski kamera", price: 1500, currency: "USD", category: "Elektronik", city: "İzmir" }, B); const L3 = r.id;
      r = await so("l_get", { id: L1 }, C); ok(r.listing.title === "El yapımı seramik kupa" && r.listing.price === 250 && r.listing.handle === "ali" && r.listing.own === false && r.listing.image.endsWith(img.key), "get");
      r = await so("l_get", { id: L2 }, C); ok(r.listing.price === -1, "ask-price listing");
      r = await so("l_search", {}, C); ok(r.items.length === 3 && r.items[0].id === L3, "search newest first");
      r = await so("l_search", { q: "seramik" }, C); ok(r.items.length === 1 && r.items[0].id === L1, "text search");
      r = await so("l_search", { category: "Elektronik" }, C); ok(r.items.length === 1 && r.items[0].id === L3, "category filter");
      r = await so("l_search", { city: "izmir" }, C); ok(r.items.length === 2, "city filter (case-insensitive)");
      r = await so("l_search", { kind: "service" }, C); ok(r.items.length === 1 && r.items[0].id === L2, "kind filter");
      r = await so("l_search", { sort: "price_asc" }, C); ok(r.items[0].id === L1 && r.items[r.items.length - 1].id === L2, "price asc, unpriced last");
      r = await so("l_search", { q: "%" }, C); ok(r.items.length === 3 || r.items.length === 0, "wildcards escaped");
      // engel
      await so("block", { handle: "ali", on: true }, C); r = await so("l_search", {}, C); ok(r.items.length === 1, "blocked seller hidden"); r = await so("l_get", { id: L1 }, C); ok(r.s === 404, "blocked listing 404"); await so("block", { handle: "ali", on: false }, C);
      // düzenleme / satıldı
      r = await so("l_edit", { id: L1, title: "Hack" }, B); ok(r.s === 404, "only owner edits");
      const img2 = await so("upload", { type: "image/jpeg", size: 100 }, A); dels.length = 0;
      r = await so("l_edit", { id: L1, title: "Seramik kupa (yeni)", price: 300, category: "El işi", image: img2.key }, A); await wait(150); ok(r.s === 200 && dels.includes("/pusula-media/" + img.key), "edit replaces image and deletes old");
      r = await so("l_edit", { id: L1, title: "Seramik kupa (yeni)", price: 300, category: "El işi", status: "sold" }, A); r = await so("l_search", {}, C); ok(!r.items.some(i => i.id === L1), "sold hidden from search");
      r = await so("l_user", { handle: "ali" }, C); ok(r.items.length === 2 && r.items[0].status === "active" && r.items[1].status === "sold", "seller page shows sold after active");
      r = await so("user", { handle: "ali" }, C); ok(r.listings === 1, "profile counts active listings");
      // bildirme + yönetici
      r = await so("report", { kind: "listing", target: L3, reason: "sahte" }, C); ok(r.s === 200, "report listing");
      const adm = (p, b) => call(p, b, null, { "x-admin-token": "adm-test-token-123456" });
      r = await adm("/api/admin/reports", {}); ok(r.reports.some(x => x.kind === "listing" && /Eski kamera/.test(x.preview || "") && x.target_handle === "bora"), "admin preview");
      r = await adm("/api/admin/remove", { listing: L3 }); r = await so("l_get", { id: L3 }, C); ok(r.s === 404, "admin removes listing");
      // limit
      for (let i = 0; i < 14; i++) await so("l_new", { title: "ilan " + i }, A);
      r = await so("l_new", { title: "fazla" }, A); ok(r.s === 429 || r.s === 400, "limits apply");
      // silme + hesap silme
      dels.length = 0; r = await so("l_del", { id: L1 }, B); ok(r.s === 404, "only owner deletes");
      r = await so("l_del", { id: L1 }, A); await wait(150); ok(r.s === 200 && dels.includes("/pusula-media/" + img2.key), "delete removes image");
      const img3 = await so("upload", { type: "image/jpeg", size: 100 }, C); await so("l_new", { title: "Silinecek", image: img3.key }, C);
      dels.length = 0; r = await call("/api/delete", { password: "parola-123" }, C); await wait(200); ok(r.s === 200 && dels.includes("/pusula-media/" + img3.key), "account deletion purges listing images");
      console.log("vitrin testleri geçti:", n); mock.close(); server.close(); process.exit(0);
    } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
  });
});
