// Paket 42: hikâye soru kutusu + öncelik matrisi
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p42-" + process.pid + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const { server } = require("./server.js");
server.listen(0, async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (p, b, tok) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
  try {
    const reg = async (e, nm, h) => { const t = (await call("/api/register", { email: e, password: "parola-123", name: nm })).token; await call("/api/social/profile", { handle: h }, t); return t; };
    const A = await reg("a@x.com", "Ali", "ali"), B = await reg("b@x.com", "Bora", "bora"), C = await reg("c@x.com", "Can", "can_x");
    await call("/api/social/follow", { handle: "ali", on: true }, B);
    const st = await call("/api/social/story_new", { kind: "text", text: "merhaba", question: "  En sevdiğin renk?  " }, A); ok(st.ok, "story with question");
    const plain = await call("/api/social/story_new", { kind: "text", text: "sorusuz" }, A);
    const items = async t => { const r = await call("/api/social/stories", {}, t); return r.stories.flatMap(g => g.items); };
    let it = (await items(B)).find(x => x.id === st.id); ok(it.q === "En sevdiğin renk?" && it.qa.done === false, "viewer sees question " + JSON.stringify(it));
    ok((await items(B)).find(x => x.id === plain.id).q === undefined, "no question");
    ok((await call("/api/social/story_answer", { id: st.id, text: "mavi" }, C)).s === 404, "non-follower cannot answer");
    ok((await call("/api/social/story_answer", { id: st.id, text: "mavi" }, A)).s === 404, "owner cannot answer own");
    ok((await call("/api/social/story_answer", { id: plain.id, text: "x" }, B)).s === 404, "no question → 404");
    ok((await call("/api/social/story_answer", { id: st.id, text: "  " }, B)).s === 400, "empty answer");
    ok((await call("/api/social/story_answer", { id: st.id, text: "mavi" }, B)).ok, "answer");
    ok((await call("/api/social/story_answer", { id: st.id, text: "yeşil" }, B)).ok, "answer replaces");
    it = (await items(B)).find(x => x.id === st.id); ok(it.qa.done === true, "done flag");
    it = (await items(A)).find(x => x.id === st.id); ok(it.qa.n === 1, "owner count 1");
    ok((await call("/api/social/story_answers", { id: st.id }, B)).s === 404, "only owner lists");
    const l = await call("/api/social/story_answers", { id: st.id }, A); ok(l.question === "En sevdiğin renk?" && l.answers.length === 1 && l.answers[0].text === "yeşil" && l.answers[0].handle === "bora", "owner list");
    ok((await call("/api/social/notifs", {}, A)).notifs.some(x => x.type === "sanswer"), "owner notified");
    const long = await call("/api/social/story_new", { kind: "text", text: "u", question: "x".repeat(300) }, A); ok((await items(B)).find(x => x.id === long.id).q.length === 80, "question capped 80");
    const html = fs.readFileSync(fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public/index.html") : path.join(__dirname, "..", "si/index.html"), "utf8");
    ["function cdCard", "data-cdx", "o.cds=", "geri_sayim_ekle", "const soQHtml", 'id="sg-q"', "data-sqa", "data-sqs", "sanswer:"].forEach(k => ok(html.includes(k), "client has " + k));
    const keys = JSON.parse('["Add a question box (optional)", "Answer", "Write an answer…", "Your answer was sent", "See answers", "No answers yet.", "Answers", "answered the question in your story", "Countdown", "What for? (exam, launch, birthday…)", "days left", "Tomorrow", "Every year", "Name and date are required"]');
    for (const lg of ["de", "es", "fr", "pt", "ru", "ar", "az", "id", "ja"]) { const pk = JSON.parse(fs.readFileSync(path.join(__dirname, fs.existsSync(path.join(__dirname, "public")) ? "public" : "../si", "lang", lg + ".json"), "utf8")); keys.forEach(k => ok(pk[k], lg + " " + k)); }
    console.log("pack42 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, e.stack.split("\n")[1]); process.exit(1); }
});
