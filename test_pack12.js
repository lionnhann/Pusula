// Paket 12: beğenenler listesi. node test_pack12.js
const assert = require("assert");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-p12-" + process.pid + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const { server } = require("./server.js");
server.listen(0, async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (p, b, tok) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
  const so = (p, b, t) => call("/api/social/" + p, b, t);
  try {
    const reg = async (e, nm, h) => { const t = (await call("/api/register", { email: e, password: "parola-123", name: nm })).token; await so("profile", { handle: h }, t); return t; };
    const A = await reg("a@x.com", "Ali", "ali"), B = await reg("b@x.com", "Bora", "bora"), C = await reg("c@x.com", "Can", "can_x");
    const P = (await so("post", { kind: "text", text: "x" }, A)).id;
    await so("like", { id: P, on: true }, B); await so("like", { id: P, on: true }, C);
    let r = await so("post_likers", { id: P }, A); ok(r.users.length === 2 && r.total === 2 && r.users[0].handle === "can_x", "owner sees likers newest first");
    r = await so("post_likers", { id: P }, B); ok(r.s === 404, "others cannot");
    await so("block", { handle: "bora", on: true }, A); r = await so("post_likers", { id: P }, A); ok(r.users.length === 1, "blocked hidden");
    await so("like", { id: P, on: true }, A); r = await so("post_likers", { id: P }, A); ok(!r.users.some(u => u.handle === "ali"), "self excluded");
    console.log("paket 12 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
