// Paket 63: ek profil bağlantıları
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p63-" + process.pid + "-" + Date.now() + ".db");
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


    const A = await reg("ali"), B = await reg("bora");
    ok((await call("/api/social/links_set", { links: [] })).s === 401, "auth");
    ok((await so("me", {}, A)).links.length === 0, "me: empty at start");
    ok((await so("links_set", {}, A)).error === "bad_links", "links must be an array");
    ok((await so("links_set", { links: [1, 2, 3, 4].map(i => ({ t: "t" + i, u: "https://a" + i + ".com" })) }, A)).error === "too_many_links", "max 3");
    ok((await so("links_set", { links: [{ t: "Site", u: "http://a.com" }] }, A)).error === "bad_url", "http refused");
    ok((await so("links_set", { links: [{ t: "Site", u: "javascript:alert(1)" }] }, A)).error === "bad_url", "javascript: refused");
    ok((await so("links_set", { links: [{ t: "Site", u: "https://a.com/<x>" }] }, A)).error === "bad_url", "angle brackets refused");
    ok((await so("links_set", { links: [{ t: "Site", u: "https://nodot" }] }, A)).error === "bad_url", "no dot refused");
    ok((await so("links_set", { links: [{ t: "Site", u: "https://a.com/" + "x".repeat(200) }] }, A)).error === "bad_url", "too long refused");
    ok((await so("links_set", { links: [{ t: "", u: "https://a.com" }] }, A)).error === "link_title", "title required");
    let r = await so("links_set", { links: [{ t: "  Portfolyo   sitem  ", u: "https://portfolyo.example.com/ali" }, { t: "YouTube", u: "https://youtube.com/@ali" }, { t: "Kopya", u: "HTTPS://YOUTUBE.com/@ali" }] }, A);
    ok(r.ok && r.links.length === 2 && r.links[0].t === "Portfolyo sitem" && r.links[1].u === "https://youtube.com/@ali", "saved, spaces collapsed, duplicate (case-insensitive) dropped: " + JSON.stringify(r));
    ok((await so("links_set", { links: [{ t: "", u: "" }, { t: "Tek", u: "https://tek.example.com" }] }, A)).links.length === 1, "blank rows skipped");
    await so("links_set", { links: r.links }, A);
    ok((await so("me", {}, A)).links.length === 2, "me returns links");
    let u = await so("user", { handle: "ali" }, B); ok(u.links.length === 2 && u.links[0].t === "Portfolyo sitem", "other users see links: " + JSON.stringify(u.links));
    ok((await so("user", { handle: "bora" }, A)).links.length === 0, "links are per user");
    ok(!JSON.stringify((await so("feed", {}, B)) || {}).includes("portfolyo.example.com"), "links are not leaked into other payloads");
    r = await so("links_set", { links: [] }, A); ok(r.ok && r.links.length === 0, "clear"); ok((await so("me", {}, A)).links.length === 0, "cleared");
    db.prepare("UPDATE profiles SET xlinks=? WHERE user_id=?").run("{bozuk", uid("ali")); ok((await so("me", {}, A)).links.length === 0, "corrupt data does not break me");
    const html = fs.readFileSync(fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public/index.html") : path.join(__dirname, "..", "si/index.html"), "utf8");
    ["soLinks", "data-xl", "bzDefDue", "bzDefNote", "bzb-dd", "bzc-d", "dd:Math.max"].forEach(k => ok(html.includes(k), "client has " + k));
    console.log("pack63 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
