// Canlı yayın. node test_live.js
const assert = require("assert"), http = require("http");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-live-" + process.pid + ".db");
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
      const MIME = "video/webm;codecs=vp8,opus";
      const seg = (len) => { const b = Buffer.alloc(len || 200, 7); b.writeUInt32BE(0x1A45DFA3, 0); return b; };
      const put = async (tok, id, key, n, body) => { const r = await fetch(base + "/live-up?id=" + id + "&key=" + key + "&n=" + n, { method: "PUT", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/octet-stream" }, body }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
      const get = async (tok, id, n) => { const r = await fetch(base + "/live-seg?id=" + id + "&n=" + n, { headers: { Authorization: "Bearer " + tok } }); return { s: r.status, b: Buffer.from(await r.arrayBuffer()) }; };
      let r; await so("follow", { handle: "ali", on: true }, B);
      r = await so("live_start", { title: "Merhaba", mime: "video/mp4" }, A); ok(r.s === 400, "only webm accepted");
      r = await so("live_start", { title: "Merhaba dünya", mime: MIME }, A); ok(r.s === 200 && r.id && r.key, "live started"); const { id, key } = r;
      r = await so("notifs", {}, B); ok(r.notifs.some(n => n.type === "live" && n.post === id), "follower notified");
      r = await so("live_list", {}, B); ok(r.lives.length === 0, "not listed before first segment");
      r = await put(A, id, "yanlis", 0, seg()); ok(r.s === 400, "wrong key rejected");
      r = await put(B, id, key, 0, seg()); ok(r.s === 400, "non-owner can't upload");
      r = await put(A, id, key, 0, Buffer.from("not webm data")); ok(r.s === 400, "non-webm rejected");
      r = await put(A, id, key, 0, seg(2 * 1024 * 1024)); ok(r.s === 413, "oversize rejected");
      r = await put(A, id, key, 0, seg()); ok(r.s === 200, "segment 0");
      r = await so("live_list", {}, B); ok(r.lives.length === 1 && r.lives[0].handle === "ali" && r.lives[0].fol, "listed for follower");
      r = await get(B, id, 0); ok(r.s === 200 && r.b.length === 200, "viewer gets segment");
      const pend = get(B, id, 1); await wait(150); await put(A, id, key, 1, seg(300)); r = await pend; ok(r.s === 200 && r.b.length === 300, "long-poll resolves on new segment");
      for (let i = 2; i < 14; i++) await put(A, id, key, i, seg());
      r = await get(B, id, 0); ok(r.s === 410, "old segment gone");
      r = await get(B, id, "latest"); ok(r.s === 200, "latest works");
      r = await so("live_state", { id }, B); ok(r.s === 200 && r.viewers === 1 && !r.ended && r.segN === 13 && r.mime === MIME, "state + viewer count");
      await so("live_state", { id }, C); r = await so("live_say", { id, text: "selam" }, B); r = await so("live_say", { id, text: "ben de" }, C); r = await so("live_state", { id, since: 0 }, A); ok(r.chat.length === 2 && r.chat[0].handle === "bora" && r.viewers === 2, "chat + 2 viewers");
      r = await so("live_state", { id, since: 1 }, A); ok(r.chat.length === 1, "chat since");
      r = await so("live_heart", { id }, B); ok(r.hearts === 1, "heart");
      r = await so("block", { handle: "can", on: true }, A); r = await so("live_state", { id }, C); ok(r.s === 404, "blocked viewer can't join"); r = await so("live_list", {}, C); ok(r.lives.length === 0, "not listed to blocked");
      await so("block", { handle: "can", on: false }, A);
      await so("profile", { private: true }, A); r = await so("live_state", { id }, C); ok(r.s === 404, "private host: stranger can't watch"); r = await so("live_state", { id }, B); ok(r.s === 200, "private host: follower can"); await so("profile", { private: false }, A);
      r = await so("live_end", { id }, B); ok(r.s === 404, "only host ends");
      const pend2 = get(B, id, 14); await wait(100); r = await so("live_end", { id }, A); ok(r.s === 200, "host ends"); r = await pend2; ok(r.s === 410, "waiting viewer released on end");
      r = await so("live_state", { id }, B); ok(r.ended === true, "state shows ended"); r = await so("live_list", {}, B); ok(r.lives.length === 0, "ended not listed");
      r = await put(A, id, key, 99, seg()); ok(r.s === 400, "no upload after end");
      // yeni yayın eskisini kapatır, rapor
      const l2 = await so("live_start", { title: "ikinci", mime: MIME }, A); await put(A, l2.id, l2.key, 0, seg());
      r = await so("report", { kind: "live", target: l2.id, reason: "uygunsuz" }, B); ok(r.s === 200, "live reportable");
      const l3 = await so("live_start", { title: "üçüncü", mime: MIME }, A); r = await so("live_state", { id: l2.id }, B); ok(r.ended === true, "new live ends previous");
      console.log("canlı yayın testleri geçti:", n); mock.close(); server.close(); process.exit(0);
    } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
  });
});
