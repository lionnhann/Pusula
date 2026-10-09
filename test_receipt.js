// Fiş okuma testi (sahte Gemini ile). node test_receipt.js
const http = require("http"), assert = require("assert");
let seen = null, reply = '{"okundu":true,"tutar":149.9,"tarih":"2026-10-01","aciklama":"Migros <b>Market</b>","kategori":"Ürün ve stok"}';
const up = http.createServer((req, res) => { let b = ""; req.on("data", c => b += c); req.on("end", () => { seen = JSON.parse(b); res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: reply }] }, finishReason: "STOP" }] })); }); });
up.listen(0, () => {
  process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-rc-" + process.pid + ".db");
  process.env.TRUST_PROXY = "0"; process.env.AI_KEY = "K"; process.env.AI_URL = "http://127.0.0.1:" + up.address().port + "/v1beta"; process.env.AI_DAILY_LIMIT = "4";
  const { server } = require("./server.js");
  server.listen(0, async () => {
    const base = "http://127.0.0.1:" + server.address().port; let n = 0; const ok = (c, m) => { assert(c, m); n++; };
    const call = async (p, b, t) => { const r = await fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json", ...(t ? { Authorization: "Bearer " + t } : {}) }, body: JSON.stringify(b) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
    try {
      const tok = (await call("/api/register", { email: "r@y.co", password: "parola-123", name: "R" })).token;
      const img = { mime: "image/jpeg", data: Buffer.alloc(300, 7).toString("base64") };
      ok((await call("/api/receipt", { image: img })).s === 401, "login gerekli");
      ok((await call("/api/receipt", { image: { mime: "text/html", data: img.data } }, tok)).s === 400, "mime reddedilir");
      ok((await call("/api/receipt", { image: { mime: "image/png", data: "<x>" } }, tok)).s === 400, "base64 dışı reddedilir");
      let r = await call("/api/receipt", { image: img }, tok);
      ok(r.read === true && r.amount === 149.9 && r.date === "2026-10-01" && r.cat === "Ürün ve stok", "alanlar okundu");
      ok(!/[<>]/.test(r.note), "etiketler temizlendi");
      const parts = seen.contents[0].parts; ok(parts[1].inline_data.mime_type === "image/jpeg" && parts[1].inline_data.data === img.data, "görsel iletildi");
      reply = '{"okundu":false}'; r = await call("/api/receipt", { image: img }, tok); ok(r.s === 200 && r.read === false, "okunamayan fiş");
      reply = 'saçma'; r = await call("/api/receipt", { image: img }, tok); ok(r.read === false, "bozuk cevap");
      reply = '{"okundu":true,"tutar":-5}'; r = await call("/api/receipt", { image: img }, tok); ok(r.read === false || r.s === 429, "negatif tutar");
      r = await call("/api/receipt", { image: img }, tok); ok(r.s === 429 && r.error === "ai_quota", "günlük hak paylaşılır");
      console.log("fiş testleri geçti:", n); up.close(); server.close(); process.exit(0);
    } catch (e) { console.error("FAIL", e.message); process.exit(1); }
  });
});
