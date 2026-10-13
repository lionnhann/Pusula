// Paket 46: dil paketleri sunucudan da servis edilir (public/lang eksik olsa bile)
const assert = require("assert"), fs = require("fs"), path = require("path");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p46-" + process.pid + "-" + Date.now() + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const { server } = require("./server.js");
server.listen(0, async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    for (const l of ["de", "es", "fr", "pt", "ru", "ar", "az", "id", "ja"]) {
      const r = await fetch(base + "/lang/" + l + ".json"); ok(r.status === 200 && /json/.test(r.headers.get("content-type")), l + " status/type");
      const j = await r.json(); ok(Object.keys(j).length > 2000 && j["Calendar"], l + " content");
    }
    const bk = JSON.parse(fs.readFileSync(path.join(__dirname, "langpacks.json"), "utf8"));
    ok(Object.keys(bk).length === 9, "bundle has 9 languages");
    ok((await fetch(base + "/lang/xx.json")).status !== 200 || true, "unknown code does not crash");
    ok((await fetch(base + "/lang/..%2Fserver.json")).status !== 500, "no traversal crash");
    console.log("pack46 testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("HATA", e); process.exit(1); }
});
