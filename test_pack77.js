// Paket 77: mesaj izni
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p77-" + process.pid + "-" + Date.now() + ".db");
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


    const E = require("./e2e_help.js")(call);
    const A = await reg("ali"), B = await reg("bora"), C = await reg("can");
    await E.key(A, "ali"); await E.key(B, "bora"); await E.key(C, "can");
    const send = (tok, h) => so("send", { handle: h, text: E.env(tok, h) }, tok);
    ok((await call("/api/social/dm_policy_set", { who: "none" })).s === 401, "auth");
    ok((await so("me", {}, B)).dmWho === "all", "default all");
    ok((await so("dm_policy_set", { who: "x" }, B)).error === "bad_policy", "bad value");
    ok((await send(A, "bora")).s === 200, "open by default");
    ok((await so("user", { handle: "bora" }, A)).canDm === true, "canDm true by default");
    let r = await so("dm_policy_set", { who: "following" }, B); ok(r.ok && r.who === "following", "set following");
    ok((await so("me", {}, B)).dmWho === "following", "me.dmWho");
    ok((await send(C, "bora")).error === "dm_closed", "stranger blocked");
    ok((await so("user", { handle: "bora" }, C)).canDm === false, "canDm false for stranger");
    await so("follow", { handle: "ali", on: true }, B); ok((await send(A, "bora")).s === 200, "followed-by-bora sender allowed");
    ok((await so("user", { handle: "bora" }, A)).canDm === true, "canDm true for followed");
    r = await so("dm_policy_set", { who: "none" }, B); ok(r.who === "none", "set none");
    ok((await send(C, "bora")).error === "dm_closed", "none blocks stranger");
    ok((await send(A, "bora")).error === "dm_closed", "none blocks even followed sender");
    ok((await send(B, "can")).s === 200, "bora can still write out");
    ok((await send(C, "bora")).s === 200, "reply allowed after bora wrote to can");
    await so("dm_policy_set", { who: "all" }, B); ok((await so("me", {}, B)).dmWho === "all" && !db.prepare("SELECT 1 FROM dm_policy").get(), "back to all, row removed");
    ok((await send(A, "bora")).s === 200, "open again");
    ok((await so("user", { handle: "bora" }, B)).canDm === true, "self canDm");
    const html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
    ["dm_policy_set", "data-dmw", "soDmSheet", "dm_closed", "bzCheques", "bzCoupons", "cksave", "cpsave", "o.chq=", "o.cps="].forEach(k => ok(html.includes(k), "client has " + k));
    console.log("pack77 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
