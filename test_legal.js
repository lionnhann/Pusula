// Yasal sayfa yer tutucuları. node test_legal.js
const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path");
process.env.DB_PATH = path.join(os.tmpdir(), "pusula-legal-" + process.pid + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0";
process.env.CONTACT_EMAIL = "destek@ornek.com"; process.env.OWNER_NAME = "Emirhan <Test>"; process.env.BACKUP_DAYS = "14";
const pub = path.join(__dirname, "public"); fs.mkdirSync(pub, { recursive: true });
const made = [];
for (const [f, b] of [["index.html", "<html><head></head><body>x</body></html>"], ["gizlilik.html", '<p>Son: <span class="todo">[TARİH]</span> <span class="todo">[ADIN / ŞİRKET ADIN]</span> <span class="todo">[E-POSTA ADRESİN]</span> <span class="todo">[30]</span></p>']]) { const p = path.join(pub, f); if (!fs.existsSync(p)) { fs.writeFileSync(p, b); made.push(p); } }
const { server } = require("./server.js");
server.listen(0, async () => {
  let n = 0; const ok = (c, m) => { assert(c, m); n++; };
  try {
    const t = await (await fetch("http://127.0.0.1:" + server.address().port + "/gizlilik.html")).text();
    ok(t.includes("destek@ornek.com") && !t.includes("[E-POSTA ADRESİN]"), "email filled");
    ok(t.includes("Emirhan &lt;Test&gt;"), "owner escaped");
    ok(!t.includes("[TARİH]") && /20\d\d/.test(t), "date filled");
    ok(t.includes(">14<") || /\b14\b/.test(t), "backup days filled"); ok(!t.includes("[30]"), "30 replaced");
    console.log("yasal sayfa testleri geçti:", n);
  } catch (e) { console.error("FAIL", e.message); process.exitCode = 1; }
  made.forEach(p => { try { fs.unlinkSync(p); } catch (e) {} }); try { fs.rmdirSync(pub); } catch (e) {}
  server.close(); process.exit(process.exitCode || 0);
});
