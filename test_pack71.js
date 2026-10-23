// Paket 71: takip önerileri
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p71-" + process.pid + "-" + Date.now() + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0"; process.env.EXPIRE_TICK_MS = "3600000";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const { server, db } = require("./server.js");
server.listen(0, async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (p, b, tok) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
  const so = (p, b, t) => call("/api/social/" + p, b, t);
  try {
    let seq = 0;
    const reg = async (h) => { seq++; const x = await call("/api/register", { email: "u" + seq + "@x.com", password: "kaplan-gece-52", name: h }); await so("profile", { handle: h }, x.token); return x.token; };
    const uid = h => db.prepare("SELECT user_id FROM profiles WHERE handle=?").get(h).user_id;


    const A = await reg("ali"), B = await reg("bora"), C = await reg("can"), D = await reg("dara"), E = await reg("ece"), F = await reg("fatih");
    ok((await call("/api/social/suggest_users", {})).s === 401, "auth");
    ok((await so("suggest_users", {}, A)).users.length === 0, "empty when following nobody");
    // ali -> bora, can ; bora -> dara, ece ; can -> dara, fatih ; fatih -> ali
    const f = (t, h) => so("follow", { handle: h, on: true }, t);
    await f(A, "bora"); await f(A, "can"); await f(B, "dara"); await f(B, "ece"); await f(C, "dara"); await f(C, "fatih"); await f(F, "ali"); await f(D, "ali");
    let r = await so("suggest_users", {}, A); const hs = r.users.map(u => u.handle);
    ok(hs[0] === "dara" && r.users[0].n === 2, "dara first with 2 mutual: " + JSON.stringify(r.users));
    ok(hs.includes("ece") && hs.includes("fatih") && hs.length === 3, "ece + fatih too: " + hs);
    ok(!hs.includes("ali") && !hs.includes("bora") && !hs.includes("can"), "no self / already followed");
    ok(r.users[0].via.length === 2 && r.users[0].via.every(v => ["bora", "can"].includes(v)), "via names");
    ok(typeof r.users[0].private === "boolean", "private flag");
    ok((await so("suggest_users", {}, D)).users.map(u => u.handle).sort().join() === "bora,can", "dara (follows ali) gets ali's follows suggested");
    await f(A, "ece"); ok(!(await so("suggest_users", {}, A)).users.some(u => u.handle === "ece"), "followed user disappears");
    await so("profile", { private: true }, F); await f(A, "fatih");
    ok(!(await so("suggest_users", {}, A)).users.some(u => u.handle === "fatih"), "pending request disappears");
    await so("follow", { handle: "fatih", on: false }, A);
    ok((await so("suggest_users", {}, A)).users.some(u => u.handle === "fatih" && u.private === true), "private user suggested with flag");
    await so("block", { handle: "fatih", on: true }, A); ok(!(await so("suggest_users", {}, A)).users.some(u => u.handle === "fatih"), "blocked hidden"); await so("block", { handle: "fatih", on: false }, A);
    ok((await so("suggest_hide", { handle: "yokkk" }, A)).s === 404 && (await so("suggest_hide", { handle: "ali" }, A)).s === 404, "hide validation");
    ok((await so("suggest_hide", { handle: "dara" }, A)).ok, "hide dara"); ok((await so("suggest_hide", { handle: "dara" }, A)).ok, "idempotent");
    hs.length = 0; ok(!(await so("suggest_users", {}, A)).users.some(u => u.handle === "dara"), "hidden stays hidden");
    ok((await so("suggest_users", {}, B)).users.some(u => u.handle === "dara") === false, "bora already follows dara");
    const html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
    ["suggest_users", "suggest_hide", "data-sgl", "bzTeam", "bzAssets", "temsave", "assave", "o.team=", "o.assets="].forEach(k => ok(html.includes(k), "client has " + k));
    console.log("pack71 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
