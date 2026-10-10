// Paket 22: uluslararası destek. node test_intl.js
const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path");
process.env.DB_PATH = path.join(os.tmpdir(), "pusula-intl-" + process.pid + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "1"; process.env.MEDIA_PROXY = "0";
process.env.CONTACT_EMAIL = "help@example.com"; process.env.OWNER_NAME = "Acme Ltd"; process.env.BACKUP_DAYS = "20";
const pub = path.join(__dirname, "public"), hadPub = fs.existsSync(pub); fs.mkdirSync(pub, { recursive: true });
const made = [];
for (const f of ["index.html", "privacy.html", "rules.html", "delete-account.html"]) {
  const p = path.join(pub, f); if (!fs.existsSync(p)) { fs.writeFileSync(p, f === "index.html" ? "<html><head></head><body>x</body></html>" : '<html lang="en"><body><span class="todo">[DATE]</span>|<span class="todo">[YOUR EMAIL]</span>|<span class="todo">[YOUR NAME / COMPANY]</span>|<span class="todo">[30]</span></body></html>'); made.push(p); }
}
const logs = []; const ol = console.log; console.log = (...a) => { logs.push(a.join(" ")); };
const { server } = require("./server.js");
server.listen(0, async () => {
  let n = 0; const ok = (c, m) => { assert(c, m); n++; };
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (p, b, tok, hdr) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}, hdr || {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
  try {
    const last = () => logs.filter(l => l.includes("e-posta ayarlı değil")).pop() || "";
    await call("/api/register", { email: "a@x.com", password: "parola-123", name: "Ann", lang: "en" }); await new Promise(r => setTimeout(r, 50));
    ok(/verification code/.test(last()) && /Hello Ann/.test(last()), "english verify mail via body lang");
    await call("/api/register", { email: "b@x.com", password: "parola-123", name: "Bora", lang: "tr" }); await new Promise(r => setTimeout(r, 50));
    ok(/doğrulama kodu/.test(last()), "turkish verify mail via body lang");
    await call("/api/register", { email: "c@x.com", password: "parola-123", name: "Cem" }, null, { "Accept-Language": "it-IT,it;q=0.9" }); await new Promise(r => setTimeout(r, 50));
    ok(/verification code/.test(last()), "accept-language fallback -> english");
    await call("/api/register", { email: "d@x.com", password: "parola-123", name: "Deniz" }, null, { "Accept-Language": "tr-TR,tr;q=0.9" }); await new Promise(r => setTimeout(r, 50));
    ok(/doğrulama kodu/.test(last()), "accept-language tr -> turkish");
    await call("/api/forgot", { email: "a@x.com", lang: "en" }); await new Promise(r => setTimeout(r, 50));
    ok(/password reset code/.test(logs.filter(l => l.includes("e-posta")).pop()), "english reset mail");
    // yasal sayfalar
    for (const f of ["privacy.html", "rules.html", "delete-account.html"]) {
      const t = await (await fetch(base + "/" + f)).text();
      ok(!/\[DATE\]|\[YOUR EMAIL\]|\[YOUR NAME \/ COMPANY\]|\[30\]/.test(t), f + " placeholders filled");
      ok(t.includes("help@example.com") || f === "x", f + " has email");
    }
    const rp = [path.join(__dirname, "..", "si", "privacy.html"), path.join(__dirname, "public", "privacy.html")].find(f => fs.existsSync(f) && !made.includes(f));
    if (rp) { const real = fs.readFileSync(rp, "utf8"); ok(/Privacy Policy/.test(real) && /GDPR/.test(real) && /\[DATE\]/.test(real), "english privacy page present"); }
    console.log = ol; console.log("uluslararası testler geçti:", n);
  } catch (e) { console.log = ol; console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exitCode = 1; }
  made.forEach(p => { try { fs.unlinkSync(p); } catch (e) {} }); if (!hadPub) try { fs.rmdirSync(pub); } catch (e) {}
  server.close(); process.exit(process.exitCode || 0);
});
