// İki adımlı doğrulama (TOTP). node test_2fa.js
const assert = require("assert"), crypto = require("crypto");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-2fa-" + process.pid + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
// Bağımsız TOTP (sunucu kodundan ayrı yazıldı; RFC 6238 vektörüyle doğrulanır)
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const dec = s => { let bits = 0, v = 0; const o = []; for (const c of s) { v = (v << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { o.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); };
const code = (sec, t, digits = 6) => { const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(Math.floor((t > 1e10 ? t / 1000 : t) / 30))); const h = crypto.createHmac("sha1", dec(sec)).update(c).digest(), o = h[19] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 10 ** digits).padStart(digits, "0"); };
ok(code("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59, 8) === "94287082", "RFC 6238 vector (test impl)");
const { server } = require("./server.js");
server.listen(0, async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (p, b, tok, m) => { const r = await fetch(base + p, { method: m || "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}), body: m === "GET" ? undefined : JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
  try {
    const R = await call("/api/register", { email: "a@x.com", password: "parola-123", name: "Ali" }); const T = R.token;
    let r = await call("/api/2fa", null, T, "GET"); ok(r.enabled === false, "off by default");
    r = await call("/api/login", { email: "a@x.com", password: "parola-123" }); ok(r.token, "plain login works when off");
    r = await call("/api/2fa/setup", {}, T); ok(/^[A-Z2-7]{32}$/.test(r.secret) && r.uri.startsWith("otpauth://totp/"), "setup"); const S = r.secret;
    r = await call("/api/2fa/enable", { code: "000000" }, T); ok(r.s === 400 && r.error === "bad_totp", "wrong code rejected");
    r = await call("/api/login", { email: "a@x.com", password: "parola-123" }); ok(r.token, "not enforced before enable");
    r = await call("/api/2fa/enable", { code: code(S, Date.now()) }, T); ok(r.ok && r.codes.length === 8 && /^[0-9a-f]{5}-[0-9a-f]{5}$/.test(r.codes[0]), "enable returns backup codes"); const BK = r.codes;
    r = await call("/api/2fa", null, T, "GET"); ok(r.enabled && r.backup_left === 8, "status");
    // giriş
    r = await call("/api/login", { email: "a@x.com", password: "parola-123" }); ok(r.s === 401 && r.error === "totp_required" && !r.token, "code required");
    r = await call("/api/login", { email: "a@x.com", password: "parola-123", code: "123456" }); ok(r.s === 401 && r.error === "bad_totp", "wrong code");
    r = await call("/api/login", { email: "a@x.com", password: "yanlis-parola", code: code(S, Date.now()) }); ok(r.error === "bad_credentials", "wrong password still rejected");
    // yeniden oynatma: enable'da kullanılan adım tekrar kullanılamaz
    r = await call("/api/login", { email: "a@x.com", password: "parola-123", code: code(S, Date.now()) }); ok(r.s === 401 && r.error === "bad_totp", "same step replay rejected");
    r = await call("/api/login", { email: "a@x.com", password: "parola-123", code: code(S, Date.now() + 30000) }); ok(r.token, "next step accepted"); const T2 = r.token;
    // yedek kod tek kullanımlık
    r = await call("/api/login", { email: "a@x.com", password: "parola-123", code: BK[0] }); ok(r.token, "backup code works");
    r = await call("/api/login", { email: "a@x.com", password: "parola-123", code: BK[0] }); ok(r.error === "bad_totp", "backup code single use");
    r = await call("/api/2fa", null, T2, "GET"); ok(r.backup_left === 7, "backup count");
    // parola sıfırlama 2FA'yı atlayamaz
    // devre dışı bırakma: parola + kod
    r = await call("/api/2fa/disable", { password: "yanlis", code: BK[3] }, T2); ok(r.s === 401, "disable needs password");
    r = await call("/api/2fa/disable", { password: "parola-123", code: "000000" }, T2); ok(r.s === 401, "disable needs code");
    r = await call("/api/2fa/backup_new", { password: "parola-123", code: BK[1] }, T2); ok(r.ok && r.codes.length === 8, "regenerate backups"); const NB = r.codes;
    r = await call("/api/login", { email: "a@x.com", password: "parola-123", code: BK[2] }); ok(r.error === "bad_totp", "old backups invalid after regenerate");
    r = await call("/api/2fa/disable", { password: "parola-123", code: NB[0] }, T2); ok(r.ok, "disable with backup code");
    r = await call("/api/login", { email: "a@x.com", password: "parola-123" }); ok(r.token, "login without code after disable");
    r = await call("/api/2fa/setup", {}, T2); ok(r.secret && r.secret !== S, "can set up again with new secret");
    console.log("2fa testleri geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, (e.stack || "").split("\n")[1]); process.exit(1); }
});
