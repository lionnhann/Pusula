// Yerleşik yapay zekâ testi: sahte bir Gemini servisiyle. node test_ai.js
const http = require("http"), assert = require("assert");
let seen = null;
const up = http.createServer((req, res) => { let b = ""; req.on("data", c => b += c); req.on("end", () => { seen = { url: req.url, key: req.headers["x-goog-api-key"], body: JSON.parse(b) }; if (seen.key === "BAD") { res.statusCode = 429; res.setHeader("content-type", "application/json"); return res.end("{}"); } res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Merhaba!" }] }, finishReason: "STOP" }] })); }); });
up.listen(0, async () => {
  process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-ai-" + process.pid + ".db");
  process.env.TRUST_PROXY = "0"; process.env.AI_KEY = "BAD, SECRET-KEY"; process.env.AI_URL = "http://127.0.0.1:" + up.address().port + "/v1beta"; process.env.AI_DAILY_LIMIT = "6";
  const { server } = require("./server.js");
  server.listen(0, async () => {
    const base = "http://127.0.0.1:" + server.address().port; let n = 0; const ok = (c, m) => { assert(c, m); n++; };
    const call = async (m, p, b, t) => { const r = await fetch(base + p, { method: m, headers: { "Content-Type": "application/json", ...(t ? { Authorization: "Bearer " + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
    try {
      ok((await call("GET", "/api/health")).ai === true, "health ai flag");
      let r = await call("POST", "/api/register", { email: "x@y.co", password: "parola-123", name: "X" }); const tok = r.token; ok(tok, "registered");
      const msgs = [{ role: "user", content: "Selam" }];
      ok((await call("POST", "/api/ai", { messages: msgs })).s === 401, "needs login");
      ok((await call("POST", "/api/ai", { messages: [] }, tok)).s === 400, "empty rejected");
      ok((await call("POST", "/api/ai", { messages: [{ role: "assistant", content: "x" }] }, tok)).s === 400, "must end with user");
      r = await call("POST", "/api/ai", { messages: [{ role: "system", content: "evil" }, { role: "user", content: "Selam" }] }, tok);
      ok(r.text === "Merhaba!" && r.left === 5, "reply + quota left");
      ok(seen.key === "SECRET-KEY" && seen.body.contents.length === 1 && seen.body.contents[0].role === "user", "working key used after BAD key got 429 (rotation), system role dropped");
      ok(!JSON.stringify(r).includes("SECRET"), "key never returned");
      for (let i = 0; i < 5; i++) { const x = await call("POST", "/api/ai", { messages: msgs }, tok); ok(x.text === "Merhaba!", "rotation call " + i); }
      r = await call("POST", "/api/ai", { messages: msgs }, tok); ok(r.s === 429 && r.error === "ai_quota", "daily quota");
      console.log("ai tests passed:", n); up.close(); server.close(); process.exit(0);
    } catch (e) { console.error("FAIL", e.message); process.exit(1); }
  });
});
