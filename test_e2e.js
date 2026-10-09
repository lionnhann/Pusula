// Uçtan uca şifreleme sunucu testi (anahtar kaydı, zarf doğrulama, grup anahtarları, şifreli ek). node test_e2e.js
const assert = require("assert"), http = require("http"), crypto = require("crypto");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-e2e-" + process.pid + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.ADMIN_TOKEN = "adm-test-token-123456";
process.env.R2_ACCOUNT_ID = "acct123"; process.env.R2_ACCESS_KEY_ID = "AKTEST"; process.env.R2_SECRET_ACCESS_KEY = "SECRETTEST"; process.env.R2_BUCKET = "pusula-media";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const BLOB = crypto.randomBytes(3000);
const mock = http.createServer((req, res) => { if (req.method === "GET") { res.statusCode = 200; return res.end(BLOB); } res.statusCode = 204; res.end(); });
mock.listen(0, () => {
  process.env.R2_ENDPOINT_BASE = "http://127.0.0.1:" + mock.address().port; process.env.R2_PUBLIC_URL = "http://127.0.0.1:" + mock.address().port;
  const { server } = require("./server.js");
  server.listen(0, async () => {
    const base = "http://127.0.0.1:" + server.address().port;
    const call = async (p, b, tok) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}), body: JSON.stringify(b || {}) }); const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (e) {} return Object.assign({ s: r.status }, j); };
    try {
      const reg = async (e, nm, h) => { const t = (await call("/api/register", { email: e, password: "parola-123", name: nm })).token; await call("/api/social/profile", { handle: h }, t); return t; };
      const A = await reg("a@x.com", "Ali", "ali"), B = await reg("b@x.com", "Bora", "bora"), C = await reg("c@x.com", "Can", "can_x"), D = await reg("d@x.com", "Deniz", "deniz");
      const E = require("./e2e_help.js")(call);
      let r = await call("/api/health"); ok((await (await fetch(base + "/api/health")).json()).e2e === true, "health e2e flag");
      // --- anahtar kaydı
      r = await call("/api/social/e2e_set", { pub: "abc" }, A); ok(r.s === 400, "short key rejected");
      const bad = Buffer.alloc(65, 1); bad[0] = 4; r = await call("/api/social/e2e_set", { pub: bad.toString("base64url") }, A); ok(r.s === 400, "off-curve key rejected");
      r = await call("/api/social/e2e_set", { pub: "x" }); ok(r.s === 401, "auth needed");
      // anahtarsız durumlar
      r = await call("/api/social/send", { handle: "bora", text: "merhaba" }, A); ok(r.s === 400 && r.error === "e2e_required", "plaintext DM rejected");
      r = await call("/api/social/send", { handle: "bora", text: "e2e1:" + "a".repeat(16) + "." + "b".repeat(16) + ":" + "x".repeat(40) }, A); ok(r.s === 409 && r.error === "no_key", "sender needs key");
      const fa = await E.key(A, "ali"); ok(/^[0-9a-f]{16}$/.test(fa), "fp format");
      r = await call("/api/social/send", { handle: "bora", text: "e2e1:" + fa + "." + "b".repeat(16) + ":" + "x".repeat(40) }, A); ok(r.s === 409 && r.error === "peer_no_key", "peer needs key");
      r = await call("/api/social/gcreate", { name: "Ekip", members: ["bora", "can_x"] }, A); ok(r.s === 409 && r.error === "peer_no_key" && r.handles.length === 2, "group needs member keys");
      const fb = await E.key(B, "bora"), fc = await E.key(C, "can_x"); await E.key(D, "deniz");
      r = await call("/api/social/e2e_set", { pub: (() => { const e = crypto.createECDH("prime256v1"); e.generateKeys(); return e.getPublicKey().toString("base64url"); })() }, B); const fb2 = r.fp; ok(r.ok && fb2 !== fb, "key rotation");
      r = await call("/api/social/e2e_get", { handle: "bora" }, A); ok(r.keys.length === 2 && r.keys.find(k => k.active).fp === fb2 && r.keys.some(k => k.fp === fb && !k.active), "key history kept, one active");
      // eski anahtarı yeniden etkinleştir (başka cihazdan geri alma)
      const kk = r.keys.find(k => k.fp === fb); r = await call("/api/social/e2e_set", { pub: kk.pub }, B); ok(r.fp === fb, "re-activate old key"); r = await call("/api/social/e2e_get", { handle: "bora" }, A); ok(r.keys.filter(k => k.active).length === 1 && r.keys.find(k => k.active).fp === fb, "single active");
      // --- DM zarfı
      const env = "e2e1:" + fa + "." + fb + ":" + crypto.randomBytes(40).toString("base64url");
      r = await call("/api/social/send", { handle: "bora", text: env }, A); ok(r.s === 200, "valid envelope accepted");
      r = await call("/api/social/send", { handle: "bora", text: "e2e1:" + fa + "." + fc + ":" + "x".repeat(40) }, A); ok(r.s === 409 && r.error === "key_changed", "wrong recipient fp");
      r = await call("/api/social/send", { handle: "bora", text: "e2e1:" + fb + "." + fb + ":" + "x".repeat(40) }, A); ok(r.s === 409 && r.error === "key_changed", "spoofed sender fp");
      r = await call("/api/social/send", { handle: "bora", text: "e2e1:zz:1" }, A); ok(r.s === 400, "malformed envelope");
      r = await call("/api/social/thread", { handle: "ali" }, B); ok(r.msgs.length === 1 && r.msgs[0].text === env, "server stores ciphertext only " + JSON.stringify(r).slice(0, 200));
      const dbf = require("fs").readFileSync(process.env.DB_PATH).toString("latin1"); ok(!dbf.includes("merhaba"), "no plaintext in db");
      // e2e_get gizlilik
      r = await call("/api/social/block", { handle: "bora", on: true }, A); r = await call("/api/social/e2e_get", { handle: "bora" }, A); ok(r.s === 404, "no keys for blocked user"); await call("/api/social/block", { handle: "bora", on: false }, A);
      // --- ek: şifreli blob
      r = await call("/api/social/upload", { type: "image/png", size: 100 }, A); const pk = r.key; r = await call("/api/social/send", { handle: "bora", text: env, media: pk }, A); ok(r.s === 400, "plain media rejected in DM");
      r = await call("/api/social/upload", { type: "application/octet-stream", size: 3000 }, A); ok(r.s === 200 && r.key.endsWith(".enc"), "enc upload"); const ek = r.key;
      r = await call("/api/social/upload", { type: "application/octet-stream", size: 90e6 }, A); ok(r.s === 413, "enc too large");
      r = await call("/api/social/post", { kind: "photo", media: ek }, A); ok(r.s === 400, "enc media not allowed in public post");
      r = await call("/api/social/story_new", { kind: "photo", media: ek }, A); ok(r.s === 400, "enc media not allowed in story");
      r = await call("/api/social/send", { handle: "bora", text: env, media: ek }, A); ok(r.s === 200, "encrypted media DM");
      let rb = await fetch(base + "/api/social/e2e_blob", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + B }, body: JSON.stringify({ key: ek }) }); ok(rb.status === 200 && Buffer.from(await rb.arrayBuffer()).equals(BLOB), "recipient downloads via proxy");
      rb = await call("/api/social/e2e_blob", { key: ek }, C); ok(rb.s === 404, "outsider cannot proxy blob");
      rb = await call("/api/social/e2e_blob", { key: "m/x/../../etc.enc" }, A); ok(rb.s === 400, "bad blob key");
      // --- grup
      r = await call("/api/social/gcreate", { name: "Ekip", members: ["bora", "can_x"] }, A); ok(r.s === 200, "group create with keys"); const gid = r.id;
      r = await call("/api/social/gkeys", { id: gid }, A); ok(r.epoch === 0 && r.keys.length === 0 && r.members.length === 3 && r.members.every(m => !m.have && m.pub), "no epoch yet");
      r = await call("/api/social/gsend", { id: gid, text: E.genv(1) }, A); ok(r.s === 409 && r.error === "bad_epoch", "cannot send before epoch");
      r = await call("/api/social/gkeys_put", { id: gid, epoch: 2, items: [] }, A); ok(r.s === 400, "epoch must be next");
      r = await E.gkeys(A, gid, [{ tok: A, handle: "ali" }, { tok: B, handle: "bora" }], 1); ok(r.s === 200 && r.count === 2, "epoch 1 for two members");
      r = await call("/api/social/gkeys", { id: gid }, A); ok(r.epoch === 1 && r.keys.length === 1 && r.keys[0].by === "ali" && r.members.find(m => m.handle === "can_x").have === false && r.members.find(m => m.handle === "bora").have === true, "have flags");
      r = await call("/api/social/gkeys_put", { id: gid, epoch: 1, items: [{ handle: "can_x", wrapped: E.wrap(), to_fp: fc }] }, C); ok(r.s === 403, "member without key cannot wrap");
      r = await call("/api/social/gkeys_put", { id: gid, epoch: 1, items: [{ handle: "can_x", wrapped: E.wrap(), to_fp: "0".repeat(16) }] }, B); ok(r.s === 200 && r.count === 0, "stale target fp skipped");
      r = await call("/api/social/gkeys_put", { id: gid, epoch: 1, items: [{ handle: "can_x", wrapped: E.wrap(), to_fp: fc }, { handle: "deniz", wrapped: E.wrap(), to_fp: E.fp(D) }] }, B); ok(r.s === 200 && r.count === 1, "member wraps for another, non-member ignored");
      const w1 = (await call("/api/social/gkeys", { id: gid }, C)).keys[0].wrapped;
      r = await call("/api/social/gkeys_put", { id: gid, epoch: 1, items: [{ handle: "can_x", wrapped: E.wrap(), to_fp: fc }] }, A); ok(r.count === 0, "no overwrite of existing wrap"); ok((await call("/api/social/gkeys", { id: gid }, C)).keys[0].wrapped === w1, "wrap unchanged");
      r = await call("/api/social/gsend", { id: gid, text: "selam" }, A); ok(r.s === 400 && r.error === "e2e_required", "plaintext group rejected");
      r = await call("/api/social/gsend", { id: gid, text: E.genv(1) }, A); ok(r.s === 200, "group envelope ok");
      r = await call("/api/social/gsend", { id: gid, text: E.genv(2) }, A); ok(r.s === 409 && r.error === "bad_epoch", "future epoch rejected");
      r = await call("/api/social/gsend", { id: gid, text: E.genv(1), media: ek }, C); ok(r.s === 400, "media must belong to sender");
      r = await call("/api/social/upload", { type: "application/octet-stream", size: 100 }, C); r = await call("/api/social/gsend", { id: gid, text: E.genv(1), media: r.key }, C); ok(r.s === 200, "group encrypted media");
      rb = await call("/api/social/e2e_blob", { key: ek }, D); ok(rb.s === 404, "non-member cannot proxy group blob");
      // yeni üye: anahtar yok -> have=false
      r = await call("/api/social/gadd", { id: gid, handle: "deniz" }, A); ok(r.s === 200, "add member with key");
      r = await call("/api/social/gkeys", { id: gid }, D); ok(r.members.find(m => m.handle === "deniz").have === false && r.keys.length === 0, "new member has no key yet"); r = await E.gkeys(A, gid, [{ tok: D, handle: "deniz" }], 1); ok(r.count === 1, "wrapped for new member");
      // üye ayrılınca döndürme
      r = await call("/api/social/gleave", { id: gid }, C); ok(r.s === 200, "member leaves");
      r = await call("/api/social/gkeys", { id: gid }, A); ok(r.rotate === true, "rotation needed after leave");
      r = await E.gkeys(A, gid, [{ tok: A, handle: "ali" }, { tok: B, handle: "bora" }, { tok: D, handle: "deniz" }], 2); ok(r.s === 200 && r.count === 3, "epoch 2 created");
      r = await E.gkeys(B, gid, [{ tok: B, handle: "bora" }], 2); ok(r.s === 200, "second member adds wraps to existing epoch");
      r = await call("/api/social/gkeys_put", { id: gid, epoch: 2, items: [] }, A); ok(r.s === 200, "empty put ok");
      r = await call("/api/social/gkeys", { id: gid }, A); ok(r.epoch === 2 && r.rotate === false && r.keys.length === 2, "rotation done, old epoch keys kept for history");
      // üye yeni cihaz anahtarı -> yeniden sarma gerekir
      const e3 = crypto.createECDH("prime256v1"); e3.generateKeys(); r = await call("/api/social/e2e_set", { pub: e3.getPublicKey().toString("base64url") }, D);
      r = await call("/api/social/gkeys", { id: gid }, A); ok(r.members.find(m => m.handle === "deniz").have === false, "new device key needs re-wrap");
      // eşzamanlı epoch yarışı
      r = await call("/api/social/gkeys_put", { id: gid, epoch: 3, items: [] }, A); ok(r.s === 200, "epoch 3 by A"); r = await call("/api/social/gkeys_put", { id: gid, epoch: 3, items: [] }, B); ok(r.s === 403, "same epoch by non-holder rejected");
      // --- şikâyet kanıtı
      r = await call("/api/social/report", { kind: "msg", target: "1", reason: "taciz", evidence: "kötü bir mesaj" }, B); ok(r.s === 200, "report msg with evidence");
      const ar = await (await fetch(base + "/api/admin/reports", { method: "POST", headers: { "x-admin-token": "adm-test-token-123456", "Content-Type": "application/json" }, body: "{}" })).json(); ok(ar.reports.some(x => x.kind === "msg" && x.evidence === "kötü bir mesaj"), "admin sees evidence");
      console.log("OK " + n + " kontrol");
    } catch (e) { console.error("FAIL", e.message, "\n", e.stack.split("\n").slice(0, 3).join("\n")); process.exitCode = 1; }
    server.close(); mock.close(); setTimeout(() => process.exit(process.exitCode || 0), 100);
  });
});
