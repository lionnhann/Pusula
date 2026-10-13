// Paket 41: gönderi bildirimi (🔔) + borç defteri (istemci)
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p41-" + process.pid + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const { server } = require("./server.js");
server.listen(0, async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (p, b, tok) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
  try {
    const reg = async (e, nm, h) => { const t = (await call("/api/register", { email: e, password: "parola-123", name: nm })).token; await call("/api/social/profile", { handle: h }, t); return t; };
    const A = await reg("a@x.com", "Ali", "ali"), B = await reg("b@x.com", "Bora", "bora"), C = await reg("c@x.com", "Can", "can_x");
    const notifs = async t => (await call("/api/social/notifs", {}, t)).notifs || [];
    ok((await call("/api/social/bell", { handle: "ali", on: true }, B)).s === 403, "bell needs follow");
    await call("/api/social/follow", { handle: "ali", on: true }, B); await call("/api/social/follow", { handle: "ali", on: true }, C);
    ok((await call("/api/social/bell", { handle: "ali", on: true }, B)).bell === true, "bell on");
    ok((await call("/api/social/bell", { handle: "bora", on: true }, B)).s === 404, "no bell on self");
    ok((await call("/api/social/user", { handle: "ali" }, B)).bell === true, "user.bell true");
    ok((await call("/api/social/user", { handle: "ali" }, C)).bell === false, "user.bell false for others");
    const p = await call("/api/social/post", { kind: "text", text: "merhaba dünya" }, A);
    let nb = (await notifs(B)).filter(x => x.type === "newpost"); ok(nb.length === 1 && nb[0].post === p.id, "B notified once");
    ok((await notifs(C)).filter(x => x.type === "newpost").length === 0, "C (no bell) not notified");
    // bildirim tercihi: follow grubu kapalıysa gelmez
    await call("/api/social/notif_prefs", { grp: "follow", on: false }, B);
    await call("/api/social/post", { kind: "text", text: "ikinci" }, A);
    ok((await notifs(B)).filter(x => x.type === "newpost").length === 1, "muted group suppresses");
    await call("/api/social/notif_prefs", { grp: "follow", on: true }, B);
    await call("/api/social/bell", { handle: "ali", on: false }, B);
    await call("/api/social/post", { kind: "text", text: "üçüncü" }, A);
    ok((await notifs(B)).filter(x => x.type === "newpost").length === 1, "bell off stops");
    await call("/api/social/bell", { handle: "ali", on: true }, B); await call("/api/social/follow", { handle: "ali", on: false }, B);
    await call("/api/social/post", { kind: "text", text: "dördüncü" }, A);
    ok((await notifs(B)).filter(x => x.type === "newpost").length === 1, "unfollowed → no notify");
    const html = fs.readFileSync(fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public/index.html") : path.join(__dirname, "..", "si/index.html"), "utf8");
    ["function debtCard", 'id="dbadd"', "data-dbp", "data-dbx", "o.debts=", "data-bell", "newpost:", "borc_ekle", "borc_odeme", "function hyAuto", "S.hey=true", '"remindDaily","hey"'].forEach(k => ok(html.includes(k), "client has " + k));
    const keys = JSON.parse('["Debt ledger", "Owed to me", "I owe", "Person or company", "Amount", "Owes me", "I owe them", "Remaining", "Overdue", "Payment", "Settled", "Person and amount are required", "Debt settled", "Payment recorded", "Post notifications", "Post notifications on", "You will be notified of new posts", "Post notifications turned off", "shared a new post"]');
    for (const lg of ["de", "es", "fr", "pt", "ru", "ar", "az", "id", "ja"]) { const pk = JSON.parse(fs.readFileSync(path.join(__dirname, fs.existsSync(path.join(__dirname, "public")) ? "public" : "../si", "lang", lg + ".json"), "utf8")); keys.forEach(k => ok(pk[k], lg + " " + k)); }
    console.log("pack41 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, e.stack.split("\n")[1]); process.exit(1); }
});
