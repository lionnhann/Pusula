// Yedek/geri yükleme testi: sahte bir GitHub API'siyle. node test_backup.js
const http = require("http"), { spawn } = require("child_process"), assert = require("assert"), os = require("os"), path = require("path"), fs = require("fs");
let stored = null, sha = 0, puts = 0;
const gh = http.createServer((req, res) => {
  let b = ""; req.on("data", c => b += c); req.on("end", () => {
    if (req.headers.authorization !== "Bearer TOK") { res.statusCode = 401; return res.end("{}"); }
    if (req.method === "GET") {
      if (!stored) { res.statusCode = 404; return res.end("{}"); }
      if ((req.headers.accept || "").includes("raw")) return res.end(Buffer.from(stored, "base64"));
      res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ sha: "s" + sha }));
    }
    const j = JSON.parse(b);
    if (stored && j.sha !== "s" + sha) { res.statusCode = 409; return res.end("{}"); }
    stored = j.content; sha++; puts++; res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ ok: true }));
  });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const start = (port, db, key) => { const p = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: port, DB_PATH: db, TRUST_PROXY: "0", BACKUP_GH_TOKEN: "TOK", BACKUP_GH_REPO: "u/r", BACKUP_KEY: key, BACKUP_GH_API: "http://127.0.0.1:" + gh.address().port, BACKUP_INTERVAL_MS: "500" }, stdio: ["ignore", "pipe", "pipe"] }); p.out = ""; p.stdout.on("data", d => p.out += d); p.stderr.on("data", d => p.out += d); return p; };
const call = async (port, m, p, b, t) => { const r = await fetch("http://127.0.0.1:" + port + p, { method: m, headers: { "Content-Type": "application/json", ...(t ? { Authorization: "Bearer " + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
const waitUp = async port => { for (let i = 0; i < 50; i++) { try { await fetch("http://127.0.0.1:" + port + "/api/health"); return; } catch (e) { await sleep(150); } } throw new Error("sunucu açılmadı"); };
gh.listen(0, async () => {
  let n = 0; const ok = (c, m) => { assert(c, m); n++; };
  const d1 = path.join(os.tmpdir(), "bk1-" + process.pid + ".db"), d2 = path.join(os.tmpdir(), "bk2-" + process.pid + ".db"), d3 = path.join(os.tmpdir(), "bk3-" + process.pid + ".db");
  try {
    const A = start(3121, d1, "gizli-anahtar"); await waitUp(3121);
    ok(/Yedek bulunamadı/.test(A.out), "ilk açılışta yedek yok");
    const r = await call(3121, "POST", "/api/register", { email: "bk@x.co", password: "parola-123", name: "Bk" }); ok(r.token, "kayıt");
    await call(3121, "PUT", "/api/data", { data: { tasks: ["önemli görev"] } }, r.token);
    await sleep(1500); ok(puts >= 1 && stored, "yedek GitHub'a yüklendi");
    ok(/^ok/.test((await call(3121, "GET", "/api/health")).backup), "health yedek durumunu gösteriyor");
    ok(!Buffer.from(stored, "base64").includes("bk@x.co"), "yedek şifreli (e-posta düz yazı görünmüyor)");
    A.kill("SIGTERM"); await sleep(800);
    const B = start(3122, d2, "gizli-anahtar"); await waitUp(3122);
    ok(/geri yüklendi/.test(B.out), "yedekten geri yüklendi");
    const l = await call(3122, "POST", "/api/login", { email: "bk@x.co", password: "parola-123" }); ok(l.token, "geri yüklenen hesapla giriş");
    const g = await call(3122, "GET", "/api/data", null, l.token); ok(g.data && g.data.tasks[0] === "önemli görev", "veri korunmuş");
    B.kill("SIGTERM"); await sleep(500);
    const before = stored, putsBefore = puts;
    const C = start(3123, d3, "yanlis-anahtar"); await waitUp(3123);
    ok(/GERİ YÜKLENEMEDİ/.test(C.out), "yanlış anahtarda uyarı");
    ok(/^HATA/.test((await call(3123, "GET", "/api/health")).backup), "health hatayı gösteriyor");
    await call(3123, "POST", "/api/register", { email: "yeni@x.co", password: "parola-123", name: "Y" });
    await sleep(1500); ok(stored === before && puts === putsBefore, "yanlış anahtarda mevcut yedeğin üstüne YAZILMADI");
    C.kill("SIGTERM");
    console.log("yedek testleri geçti:", n); process.exit(0);
  } catch (e) { console.error("FAIL", e.message); process.exit(1); }
});
