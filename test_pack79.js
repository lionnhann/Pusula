// Paket 79: yıldızlı mesajlar
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p79-" + process.pid + "-" + Date.now() + ".db");
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
    const A = await reg("ali"), B = await reg("bora"), C = await reg("cem");
    await E.key(A, "ali"); await E.key(B, "bora"); await E.key(C, "cem");
    const send = (tok, h) => so("send", { handle: h, text: E.env(tok, h) }, tok);
    ok((await call("/api/social/star_set", { id: 1 })).s === 401, "auth");
    const m1 = (await send(A, "bora")).id, m2 = (await send(B, "ali")).id, m3 = (await send(A, "bora")).id;
    ok((await so("star_set", { kind: "d", id: 0 }, A)).s === 400, "bad id");
    ok((await so("star_set", { kind: "d", id: 99999 }, A)).s === 404, "missing msg");
    ok((await so("star_set", { kind: "d", id: m1 }, C)).s === 404, "outsider cannot star");
    let r = await so("star_set", { kind: "d", id: m1, on: true }, A); ok(r.ok && r.star === true, "star mine");
    r = await so("star_set", { kind: "d", id: m2, on: true }, A); ok(r.ok, "star received");
    await so("star_set", { kind: "d", id: m1, on: true }, A);
    ok(db.prepare("SELECT COUNT(*) c FROM msg_stars WHERE user_id=?").get(uid("ali")).c === 2, "idempotent, 2 rows");
    r = await so("thread", { handle: "bora" }, A);
    const by = Object.fromEntries(r.msgs.map(x => [x.id, x]));
    ok(by[m1].star === true && by[m2].star === true && !by[m3].star, "thread flags star");
    r = await so("thread", { handle: "ali" }, B); ok(r.msgs.every(x => !x.star), "stars are private to the starrer");
    r = await so("star_list", { kind: "d", handle: "bora" }, A); ok(r.msgs.length === 2 && r.msgs[0].id === m2 && r.msgs[1].id === m1, "list newest first");
    ok(r.msgs[0].mine === false && r.msgs[1].mine === true && typeof r.msgs[0].text === "string", "list shape");
    ok((await so("star_list", { kind: "d", handle: "cem" }, A)).msgs.length === 0, "other chat empty");
    ok((await so("star_list", { kind: "d", handle: "nobody" }, A)).s === 404, "unknown handle");
    ok((await so("star_list", { kind: "d", handle: "bora" }, B)).msgs.length === 0, "bora has no stars");
    r = await so("star_set", { kind: "d", id: m2, on: false }, A); ok(r.ok && r.star === false, "unstar");
    ok((await so("star_list", { kind: "d", handle: "bora" }, A)).msgs.length === 1, "one left");
    // deleting the message removes the star
    ok((await so("msg_delete", { kind: "d", id: m1 }, A)).ok, "delete own msg");
    ok(!db.prepare("SELECT 1 FROM msg_stars WHERE kind='d' AND msg_id=?").get(m1), "star removed with message");
    // blocking hides it
    await so("star_set", { kind: "d", id: m3, on: true }, A);
    await so("block", { handle: "bora", on: true }, A);
    ok((await so("star_set", { kind: "d", id: m3, on: false }, A)).s === 404, "blocked peer: no star change");
    ok((await so("star_list", { kind: "d", handle: "bora" }, A)).s === 404, "blocked peer: no list");
    await so("block", { handle: "bora", on: false }, A);
    // groups
    const gid = "g79test", aid = uid("ali"), bid = uid("bora"), cid = uid("cem");
    db.prepare("INSERT INTO chat_groups(id,name,owner,created) VALUES(?,?,?,?)").run(gid, "Grup", aid, Date.now());
    for (const u of [aid, bid]) db.prepare("INSERT INTO group_members(group_id,user_id) VALUES(?,?)").run(gid, u);
    const g1 = Number(db.prepare("INSERT INTO gmsgs(group_id,from_id,text,created) VALUES(?,?,?,?)").run(gid, bid, "x", Date.now()).lastInsertRowid);
    ok((await so("star_set", { kind: "g", id: g1 }, C)).s === 404, "non-member cannot star group msg");
    ok((await so("star_set", { kind: "g", id: g1 }, A)).ok, "member stars group msg");
    r = await so("gthread", { id: gid }, A); ok(r.msgs[0].star === true, "gthread flags star");
    r = await so("gthread", { id: gid }, B); ok(!r.msgs[0].star, "private in group too");
    r = await so("star_list", { kind: "g", id: gid }, A); ok(r.msgs.length === 1 && r.msgs[0].handle === "bora", "group list");
    ok((await so("star_list", { kind: "g", id: gid }, C)).s === 404, "non-member list");
    // limit
    const ins = db.prepare("INSERT OR IGNORE INTO msg_stars(user_id,kind,msg_id,created) VALUES(?,?,?,?)");
    for (let i = 1; i <= 600; i++) ins.run(aid, "z", 1000000 + i, 1);
    const cnt = db.prepare("SELECT COUNT(*) c FROM msg_stars WHERE user_id=?").get(aid).c;
    ok(cnt >= 500, "filled");
    ok((await so("star_set", { kind: "g", id: g1, on: true }, A)).ok, "existing star can be re-set at limit");
    const m4 = (await send(A, "bora")).id; ok((await so("star_set", { kind: "d", id: m4 }, A)).error === "star_limit", "limit enforced");
    const hz = await (await fetch(base + "/api/health")).json(); ok(hz.app === true, "health reports app index ok");
    const root = await (await fetch(base + "/")).text(); ok(/id="main"/.test(root), "root serves the app");
    const html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
    ["star_set", "star_list", "data-mstar", "soStarSheet", "data-stl", "bzTarget", "bzPartners", "o.tgs=", "o.pts="].forEach(k => ok(html.includes(k), "client has " + k));
    console.log("pack79 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
