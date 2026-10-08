"use strict";
// Pusula sunucusu: e-posta + parola ile kayıt/giriş, e-posta doğrulama, parola sıfırlama, hesap silme ve
// kullanıcı verisinin (tek JSON belge) cihazlar arası senkronu. Tek dosya, SQLite, ek servis gerekmez.
const http = require("http");
const tls = require("tls");
const { DatabaseSync } = require("node:sqlite");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PORT = +process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "pusula.db");
const ORIGINS = (process.env.ALLOWED_ORIGINS || "*").split(",").map(s => s.trim()).filter(Boolean);
const SESSION_DAYS = +process.env.SESSION_DAYS || 60;
const MAX_DATA = +process.env.MAX_DATA_BYTES || 2 * 1024 * 1024;
// Abonelik (Lemon Squeezy). İkisi de boşsa ödeme kapalıdır ve herkes Pro gibi davranır.
const LS_URL = process.env.LS_CHECKOUT_URL || "", LS_SECRET = process.env.LS_WEBHOOK_SECRET || "";
const BILLING = !!(LS_URL && LS_SECRET);
const TRIAL_DAYS = process.env.TRIAL_DAYS !== undefined && process.env.TRIAL_DAYS !== "" ? +process.env.TRIAL_DAYS : 14;
const FREE_MAX_DATA = +process.env.FREE_MAX_DATA_BYTES || 100 * 1024;
const PRICE_LABEL = String(process.env.PRO_PRICE_LABEL || "").slice(0, 40);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const MAIL_FROM = process.env.MAIL_FROM || "Pusula <no-reply@localhost>";
const HAS_MAIL = !!(process.env.RESEND_API_KEY || process.env.SMTP_URL);
// E-posta doğrulaması: varsayılan olarak e-posta ayarlıysa açık, değilse kapalı. REQUIRE_VERIFY=0/1 ile zorla.
const REQUIRE_VERIFY = process.env.REQUIRE_VERIFY ? process.env.REQUIRE_VERIFY === "1" : HAS_MAIL;
const TRUST_PROXY = process.env.TRUST_PROXY !== "0";

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
// ---- Kalıcılık: kalıcı diski olmayan (ücretsiz) barındırıcılar için şifreli yedek ----
// BACKUP_GH_TOKEN + BACKUP_GH_REPO + BACKUP_KEY doluysa veritabanı AES-256-GCM ile şifrelenip özel bir GitHub deposuna yedeklenir;
// sunucu yeniden başlayıp dosya yoksa oradan geri yüklenir.
const BK = { token: process.env.BACKUP_GH_TOKEN || "", repo: process.env.BACKUP_GH_REPO || "", key: process.env.BACKUP_KEY || "", file: process.env.BACKUP_GH_PATH || "pusula.db.enc", api: (process.env.BACKUP_GH_API || "https://api.github.com").replace(/\/+$/, "") };
const BK_ON = !!(BK.token && BK.repo && BK.key);
let BK_SAFE = true; // geri yükleme doğrulanmadan yedek yükleme yapılmaz: boş veritabanı iyi yedeğin üstüne yazmasın
const BK_RESTORE_JS = `
const fs=require("fs"),crypto=require("crypto");
const E=process.env,url=(E.BACKUP_GH_API||"https://api.github.com").replace(/\\/+$/,"")+"/repos/"+E.BACKUP_GH_REPO+"/contents/"+encodeURI(E.BACKUP_GH_PATH||"pusula.db.enc");
(async()=>{
 const r=await fetch(url,{headers:{Authorization:"Bearer "+E.BACKUP_GH_TOKEN,Accept:"application/vnd.github.raw+json","User-Agent":"pusula"}});
 if(r.status===404)process.exit(3);
 if(!r.ok){console.error("yedek indirilemedi: HTTP "+r.status);process.exit(4)}
 const b=Buffer.from(await r.arrayBuffer());
 if(b.length<33||b.subarray(0,4).toString()!=="PSB1"){console.error("yedek biçimi tanınmadı");process.exit(5)}
 const k=crypto.scryptSync(E.BACKUP_KEY,"pusula-backup-v1",32),d=crypto.createDecipheriv("aes-256-gcm",k,b.subarray(4,16));d.setAuthTag(b.subarray(16,32));
 fs.writeFileSync(E.DB_PATH_OUT,Buffer.concat([d.update(b.subarray(32)),d.final()]));
})().catch(e=>{console.error("yedek hatası (anahtar yanlış olabilir): "+e.message);process.exit(4)});`;
if (BK_ON && !fs.existsSync(DB_PATH)) {
  try {
    require("child_process").execFileSync(process.execPath, ["-e", BK_RESTORE_JS], { env: { ...process.env, DB_PATH_OUT: DB_PATH }, stdio: ["ignore", "inherit", "inherit"], timeout: 60000 });
    console.log("Veritabanı yedekten geri yüklendi.");
  } catch (e) {
    if (e && e.status === 3) console.log("Yedek bulunamadı; boş veritabanıyla başlanıyor.");
    else { BK_SAFE = false; console.error("!!! YEDEK GERİ YÜKLENEMEDİ (kod " + (e && e.status) + "). Mevcut yedeğin üstüne yazmamak için yedek yükleme KAPALI. Ayarları kontrol edip yeniden başlat."); }
  }
}
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
db.exec(`
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL DEFAULT '', pw_hash TEXT NOT NULL, pw_salt TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created INTEGER NOT NULL, expires INTEGER NOT NULL, ua TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS codes(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, code_hash TEXT NOT NULL, expires INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id, kind));
CREATE TABLE IF NOT EXISTS plans(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT '', provider TEXT NOT NULL DEFAULT '', ext_id TEXT NOT NULL DEFAULT '', renews INTEGER NOT NULL DEFAULT 0, ends INTEGER NOT NULL DEFAULT 0, portal TEXT NOT NULL DEFAULT '', stamp INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS data(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, json TEXT NOT NULL, rev INTEGER NOT NULL DEFAULT 1, updated INTEGER NOT NULL);
`);

const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const rnd = n => crypto.randomBytes(n).toString("hex");
const now = () => Date.now();
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => e ? rej(e) : res(k.toString("hex"))));
const safeEq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const okEmail = e => typeof e === "string" && e.length <= 120 && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(e);
const cleanName = n => String(n || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 40);
const pwOk = p => typeof p === "string" && p.length >= 8 && p.length <= 100;

// ---- e-posta ----
// Küçük SMTP istemcisi (yalnızca smtps:// = 465 numaralı kapı, örn. smtps://kullanici:parola@smtp.gmail.com:465)
function smtpSend(url, to, subject, text) {
  const u = new URL(url), user = decodeURIComponent(u.username), pass = decodeURIComponent(u.password), host = u.hostname, port = +u.port || 465;
  const from = (MAIL_FROM.match(/<([^>]+)>/) || [0, MAIL_FROM])[1];
  const hdr = v => String(v).replace(/[\r\n]+/g, " ");
  const msg = ["From: " + hdr(MAIL_FROM), "To: " + hdr(to), "Subject: =?UTF-8?B?" + Buffer.from(subject).toString("base64") + "?=", "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "", Buffer.from(text).toString("base64").replace(/(.{76})/g, "$1\r\n")].join("\r\n");
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host, port, servername: host });
    let buf = "", step = 0, done = false;
    const fin = e => { if (done) return; done = true; try { sock.destroy(); } catch (x) {} e ? reject(e) : resolve(); };
    sock.setTimeout(20000, () => fin(new Error("SMTP zaman aşımı")));
    sock.on("error", fin);
    const send = l => sock.write(l + "\r\n");
    const seq = [null, "EHLO pusula", "AUTH LOGIN", Buffer.from(user).toString("base64"), Buffer.from(pass).toString("base64"), "MAIL FROM:<" + from + ">", "RCPT TO:<" + hdr(to) + ">", "DATA", msg + "\r\n.", "QUIT"];
    const want = [220, 250, 334, 334, 235, 250, 250, 354, 250, 221];
    sock.on("data", d => {
      buf += d.toString();
      while (true) {
        const m = buf.match(/^(\d{3})([ -])[^\n]*\n/); if (!m) break;
        buf = buf.slice(m[0].length); if (m[2] === "-") continue;
        if (+m[1] !== want[step]) return fin(new Error("SMTP " + m[1]));
        step++; if (step >= seq.length) return fin();
        send(seq[step]);
      }
    });
  });
}
async function sendMail(to, subject, text) {
  if (process.env.RESEND_API_KEY) {
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "Authorization": "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ from: MAIL_FROM, to: [to], subject, text }) });
    if (!r.ok) throw new Error("Resend " + r.status);
    return;
  }
  if (process.env.SMTP_URL) return smtpSend(process.env.SMTP_URL, to, subject, text);
  console.log(`[e-posta ayarlı değil] ${to} · ${subject}\n${text}\n`);
}
function makeCode(userId, kind, minutes) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  db.prepare("INSERT OR REPLACE INTO codes(user_id,kind,code_hash,expires,tries) VALUES(?,?,?,?,0)").run(userId, kind, sha(userId + ":" + kind + ":" + code), now() + minutes * 60000);
  return code;
}
function checkCode(userId, kind, code) {
  const r = db.prepare("SELECT * FROM codes WHERE user_id=? AND kind=?").get(userId, kind);
  if (!r || r.expires < now() || r.tries >= 5) return false;
  if (!safeEq(sha(userId + ":" + kind + ":" + String(code || "").trim()), r.code_hash)) { db.prepare("UPDATE codes SET tries=tries+1 WHERE user_id=? AND kind=?").run(userId, kind); return false; }
  db.prepare("DELETE FROM codes WHERE user_id=? AND kind=?").run(userId, kind);
  return true;
}
const sendVerify = (u) => sendMail(u.email, "Pusula doğrulama kodu", `Merhaba ${u.name || ""},\n\nPusula doğrulama kodun: ${makeCode(u.id, "verify", 30)}\nKod 30 dakika geçerlidir. Bu isteği sen yapmadıysan bu e-postayı yok say.`);

// ---- hız sınırı (bellek içi) ----
const hits = new Map();
function limit(key, max, ms) {
  const t = now(), a = (hits.get(key) || []).filter(x => t - x < ms);
  a.push(t); hits.set(key, a);
  return a.length <= max;
}
setInterval(() => { const t = now(); for (const [k, a] of hits) { const f = a.filter(x => t - x < 3600e3); if (f.length) hits.set(k, f); else hits.delete(k); } db.prepare("DELETE FROM sessions WHERE expires<?").run(t); db.prepare("DELETE FROM codes WHERE expires<?").run(t); }, 10 * 60000).unref();
const fails = new Map(); // e-posta -> {n, until}
function lockedFor(email) { const f = fails.get(email); return f && f.until > now() ? Math.ceil((f.until - now()) / 1000) : 0; }
function noteFail(email) { const f = fails.get(email) || { n: 0, until: 0 }; f.n++; if (f.n >= 5) f.until = now() + Math.min(900, 30 * Math.pow(2, f.n - 5)) * 1000; fails.set(email, f); }

// ---- uygulama ----
const routes = [];
const route = (method, p, ...fns) => routes.push({ method, p, fns });
const app = { get: (p, ...f) => route("GET", p, ...f), post: (p, ...f) => route("POST", p, ...f), put: (p, ...f) => route("PUT", p, ...f) };
function readJson(req, max) {
  return new Promise((resolve, reject) => {
    let n = 0, over = false; const ch = [];
    req.on("data", c => { n += c.length; if (n > max) { if (!over) { over = true; ch.length = 0; reject({ status: 413, error: "too_large" }); } } else if (!over) ch.push(c); });
    req.on("end", () => { if (over) return; req.raw = Buffer.concat(ch); if (!n) return resolve({}); try { const j = JSON.parse(Buffer.concat(ch).toString("utf8")); resolve(j && typeof j === "object" ? j : {}); } catch (e) { reject({ status: 400, error: "bad_json" }); } });
    req.on("error", reject);
  });
}
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8" };
const server = http.createServer(async (req, res) => {
  res.json = (o, st) => { res.statusCode = st || res.statusCode || 200; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(o)); };
  res.status = c => { res.statusCode = c; return res; };
  const ip = TRUST_PROXY ? String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress : req.socket.remoteAddress;
  req.ip = ip || "?";
  const o = req.headers.origin;
  if (o && (ORIGINS.includes("*") || ORIGINS.includes(o))) {
    res.setHeader("Access-Control-Allow-Origin", ORIGINS.includes("*") ? "*" : o);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Max-Age", "600");
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  const url = new URL(req.url, "http://x"), pathname = url.pathname;
  try {
    if (pathname.startsWith("/api/")) {
      if (!limit("ip:" + req.ip, 240, 60000)) return res.json({ error: "rate_limited" }, 429);
      const r = routes.find(x => x.method === req.method && x.p === pathname);
      if (!r) return res.json({ error: "not_found" }, 404);
      req.body = req.method === "GET" ? {} : await readJson(req, MAX_DATA + 1024);
      for (const f of r.fns) { let nextCalled = false; await f(req, res, () => { nextCalled = true; }); if (!nextCalled) break; }
      return;
    }
    return serveStatic(req, res, pathname);
  } catch (e) {
    if (e && e.status) { if (e.status === 413) { res.setHeader("Connection", "close"); res.on("finish", () => req.destroy()); } return res.json({ error: e.error }, e.status); }
    console.error(e); if (!res.headersSent) res.json({ error: "server_error" }, 500);
  }
});
// ---- Yerleşik yapay zekâ: anahtar yalnızca sunucuda durur, kullanıcıdan anahtar istenmez ----
const AI_KEYS = String(process.env.AI_KEY || "").split(",").map(x => x.trim()).filter(Boolean), AI_KEY = AI_KEYS[0] || "", AI_PROVIDER = (process.env.AI_PROVIDER || "gemini").toLowerCase();
let aiRR = 0;
const AI_MODEL = process.env.AI_MODEL || (AI_PROVIDER === "gemini" ? "gemini-3.8-flash" : "gpt-4o-mini");
const AI_URL = (process.env.AI_URL || (AI_PROVIDER === "gemini" ? "https://generativelanguage.googleapis.com/v1beta" : "https://api.openai.com/v1")).replace(/\/+$/, "");
const AI_DAILY = +process.env.AI_DAILY_LIMIT || 40, AI_DAILY_PRO = +process.env.AI_DAILY_LIMIT_PRO || 200, AI_MAX_IN = 200000;
db.exec("CREATE TABLE IF NOT EXISTS ai_usage(user_id TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id, day))");

const newSession = (userId, req) => { const token = rnd(32); db.prepare("INSERT INTO sessions(token_hash,user_id,created,expires,ua) VALUES(?,?,?,?,?)").run(sha(token), userId, now(), now() + SESSION_DAYS * 864e5, String(req.headers["user-agent"] || "").slice(0, 120)); return token; };
// Ödeme ilk açıldığı an kaydedilir: eski kullanıcıların 14 günlük denemesi de o günden başlar.
if (BILLING && !db.prepare("SELECT 1 FROM meta WHERE k='billing_since'").get()) db.prepare("INSERT INTO meta(k,v) VALUES('billing_since',?)").run(String(Date.now()));
const billingSince = () => { const r = db.prepare("SELECT v FROM meta WHERE k='billing_since'").get(); return r ? +r.v || 0 : 0; };
function planOf(u) {
  const p = db.prepare("SELECT * FROM plans WHERE user_id=?").get(u.id) || {}, t = now();
  const base = { billing: BILLING, price: PRICE_LABEL, limit: FREE_MAX_DATA, manage: !!p.portal };
  const live = (["active", "on_trial", "past_due"].includes(p.status) && (p.provider !== "manual" || p.ends > t)) || (p.status === "cancelled" && p.ends > t);
  if (live) return { ...base, state: "pro", cancelling: p.status === "cancelled", until: p.status === "cancelled" ? p.ends : (p.renews || p.ends || 0) };
  if (!BILLING) return { ...base, state: "pro", until: 0 };
  const trialEnd = Math.max(u.created, billingSince()) + TRIAL_DAYS * 864e5;
  if (trialEnd > t) return { ...base, state: "trial", until: trialEnd };
  return { ...base, state: "free", until: 0 };
}
const pub = u => ({ id: u.id, email: u.email, name: u.name, verified: !!u.verified, plan: planOf(u) });
function auth(req, res, next) {
  const h = String(req.headers.authorization || ""), t = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!t) return res.status(401).json({ error: "unauthorized" });
  const s = db.prepare("SELECT s.user_id, s.expires FROM sessions s WHERE s.token_hash=?").get(sha(t));
  if (!s || s.expires < now()) return res.status(401).json({ error: "unauthorized" });
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(s.user_id);
  if (!u) return res.status(401).json({ error: "unauthorized" });
  req.user = u; req.tokenHash = sha(t); next();
}
const wrap = f => f;

app.get("/api/health", (req, res) => res.json({ ok: true, mail: HAS_MAIL, verify: REQUIRE_VERIFY, billing: BILLING, ai: !!AI_KEY }));

app.post("/api/register", wrap(async (req, res) => {
  if (!limit("reg:" + req.ip, 10, 3600e3)) return res.status(429).json({ error: "rate_limited" });
  const email = String((req.body || {}).email || "").trim().toLowerCase(), password = (req.body || {}).password, name = cleanName((req.body || {}).name);
  if (!okEmail(email)) return res.status(400).json({ error: "bad_email" });
  if (!pwOk(password)) return res.status(400).json({ error: "weak_password" });
  if (!name) return res.status(400).json({ error: "bad_name" });
  if (db.prepare("SELECT 1 FROM users WHERE email=?").get(email)) return res.status(409).json({ error: "email_taken" });
  const id = "u" + rnd(9), salt = rnd(16), hash = await scrypt(password, salt);
  db.prepare("INSERT INTO users(id,email,name,pw_hash,pw_salt,verified,created) VALUES(?,?,?,?,?,?,?)").run(id, email, name, hash, salt, REQUIRE_VERIFY ? 0 : 1, now());
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(id);
  if (REQUIRE_VERIFY) { sendVerify(u).catch(e => console.error("posta:", e.message)); return res.json({ verify: true, email }); }
  res.json({ token: newSession(id, req), user: pub(u) });
}));

app.post("/api/login", wrap(async (req, res) => {
  const email = String((req.body || {}).email || "").trim().toLowerCase(), password = String((req.body || {}).password || "");
  if (!limit("login:" + req.ip, 30, 600e3)) return res.status(429).json({ error: "rate_limited" });
  const w = lockedFor(email); if (w) return res.status(429).json({ error: "locked", wait: w });
  const u = okEmail(email) ? db.prepare("SELECT * FROM users WHERE email=?").get(email) : null;
  const hash = await scrypt(password.slice(0, 100), u ? u.pw_salt : "0".repeat(32)); // zamanlama farkını azalt
  if (!u || !safeEq(hash, u.pw_hash)) { noteFail(email); return res.status(401).json({ error: "bad_credentials" }); }
  fails.delete(email);
  if (REQUIRE_VERIFY && !u.verified) { sendVerify(u).catch(() => {}); return res.status(403).json({ error: "verify_required", email }); }
  res.json({ token: newSession(u.id, req), user: pub(u) });
}));

app.post("/api/verify", wrap(async (req, res) => {
  const email = String((req.body || {}).email || "").trim().toLowerCase(), code = (req.body || {}).code;
  if (!limit("ver:" + req.ip, 20, 600e3)) return res.status(429).json({ error: "rate_limited" });
  const u = okEmail(email) ? db.prepare("SELECT * FROM users WHERE email=?").get(email) : null;
  if (!u || !checkCode(u.id, "verify", code)) return res.status(400).json({ error: "bad_code" });
  db.prepare("UPDATE users SET verified=1 WHERE id=?").run(u.id);
  res.json({ token: newSession(u.id, req), user: pub({ ...u, verified: 1 }) });
}));

app.post("/api/resend", wrap(async (req, res) => {
  const email = String((req.body || {}).email || "").trim().toLowerCase();
  if (!limit("res:" + req.ip, 5, 600e3) || !limit("res:" + email, 3, 600e3)) return res.status(429).json({ error: "rate_limited" });
  const u = okEmail(email) ? db.prepare("SELECT * FROM users WHERE email=? AND verified=0").get(email) : null;
  if (u) sendVerify(u).catch(() => {});
  res.json({ ok: true });
}));

app.post("/api/forgot", wrap(async (req, res) => {
  const email = String((req.body || {}).email || "").trim().toLowerCase();
  if (!limit("fg:" + req.ip, 5, 600e3) || !limit("fg:" + email, 3, 600e3)) return res.status(429).json({ error: "rate_limited" });
  const u = okEmail(email) ? db.prepare("SELECT * FROM users WHERE email=?").get(email) : null;
  if (u) sendMail(u.email, "Pusula parola sıfırlama kodu", `Merhaba ${u.name || ""},\n\nParola sıfırlama kodun: ${makeCode(u.id, "reset", 15)}\nKod 15 dakika geçerlidir. Bu isteği sen yapmadıysan bu e-postayı yok say; parolan değişmez.`).catch(e => console.error("posta:", e.message));
  res.json({ ok: true }); // hesap var mı yok mu belli etme
}));

app.post("/api/reset", wrap(async (req, res) => {
  const email = String((req.body || {}).email || "").trim().toLowerCase(), code = (req.body || {}).code, password = (req.body || {}).password;
  if (!limit("rs:" + req.ip, 20, 600e3)) return res.status(429).json({ error: "rate_limited" });
  if (!pwOk(password)) return res.status(400).json({ error: "weak_password" });
  const u = okEmail(email) ? db.prepare("SELECT * FROM users WHERE email=?").get(email) : null;
  if (!u || !checkCode(u.id, "reset", code)) return res.status(400).json({ error: "bad_code" });
  const salt = rnd(16), hash = await scrypt(password, salt);
  db.prepare("UPDATE users SET pw_hash=?, pw_salt=?, verified=1 WHERE id=?").run(hash, salt, u.id);
  db.prepare("DELETE FROM sessions WHERE user_id=?").run(u.id); // tüm cihazlardan çıkar
  fails.delete(email);
  res.json({ token: newSession(u.id, req), user: pub({ ...u, verified: 1 }) });
}));

app.get("/api/me", auth, (req, res) => res.json({ user: pub(req.user) }));
app.put("/api/me", auth, (req, res) => { const n = cleanName((req.body || {}).name); if (!n) return res.status(400).json({ error: "bad_name" }); db.prepare("UPDATE users SET name=? WHERE id=?").run(n, req.user.id); res.json({ user: pub({ ...req.user, name: n }) }); });
app.post("/api/logout", auth, (req, res) => { db.prepare("DELETE FROM sessions WHERE token_hash=?").run(req.tokenHash); res.json({ ok: true }); });
app.post("/api/logout-all", auth, (req, res) => { db.prepare("DELETE FROM sessions WHERE user_id=? AND token_hash<>?").run(req.user.id, req.tokenHash); res.json({ ok: true }); });

app.post("/api/password", auth, wrap(async (req, res) => {
  const { old, password } = req.body || {};
  if (!limit("pw:" + req.user.id, 10, 600e3)) return res.status(429).json({ error: "rate_limited" });
  if (!pwOk(password)) return res.status(400).json({ error: "weak_password" });
  if (!safeEq(await scrypt(String(old || "").slice(0, 100), req.user.pw_salt), req.user.pw_hash)) return res.status(401).json({ error: "bad_credentials" });
  const salt = rnd(16), hash = await scrypt(password, salt);
  db.prepare("UPDATE users SET pw_hash=?, pw_salt=? WHERE id=?").run(hash, salt, req.user.id);
  db.prepare("DELETE FROM sessions WHERE user_id=? AND token_hash<>?").run(req.user.id, req.tokenHash);
  res.json({ ok: true });
}));

app.post("/api/delete", auth, wrap(async (req, res) => {
  if (!limit("del:" + req.user.id, 5, 600e3)) return res.status(429).json({ error: "rate_limited" });
  if (!safeEq(await scrypt(String((req.body || {}).password || "").slice(0, 100), req.user.pw_salt), req.user.pw_hash)) return res.status(401).json({ error: "bad_credentials" });
  const pl = db.prepare("SELECT status, provider FROM plans WHERE user_id=?").get(req.user.id);
  if (pl && pl.provider === "ls" && ["active", "on_trial", "past_due"].includes(pl.status)) return res.status(409).json({ error: "cancel_subscription_first" });
  db.prepare("DELETE FROM users WHERE id=?").run(req.user.id); // sessions, codes, data zincirleme silinir
  res.json({ ok: true });
}));

app.post("/api/billing/checkout", auth, (req, res) => {
  if (!BILLING) return res.status(400).json({ error: "billing_off" });
  if (REQUIRE_VERIFY && !req.user.verified) return res.status(403).json({ error: "verify_required" });
  if (planOf(req.user).state === "pro") return res.status(409).json({ error: "already_pro" });
  const u = new URL(LS_URL);
  u.searchParams.set("checkout[email]", req.user.email);
  if (req.user.name) u.searchParams.set("checkout[name]", req.user.name);
  u.searchParams.set("checkout[custom][user_id]", req.user.id);
  res.json({ url: u.toString() });
});
app.post("/api/billing/portal", auth, (req, res) => {
  const p = db.prepare("SELECT portal FROM plans WHERE user_id=?").get(req.user.id);
  if (!p || !p.portal) return res.status(404).json({ error: "no_subscription" });
  res.json({ url: p.portal });
});
app.post("/api/billing/webhook", (req, res) => {
  if (!BILLING) return res.status(404).json({ error: "not_found" });
  const sig = String(req.headers["x-signature"] || ""), mac = crypto.createHmac("sha256", LS_SECRET).update(req.raw || Buffer.alloc(0)).digest("hex");
  if (!sig || !safeEq(sig, mac)) return res.status(401).json({ error: "bad_signature" });
  const ev = req.body || {}, meta = ev.meta || {}, d = ev.data || {}, a = d.attributes || {};
  if (d.type !== "subscriptions") return res.json({ ok: true, ignored: true });
  const uid = String((meta.custom_data || {}).user_id || "");
  let u = uid ? db.prepare("SELECT * FROM users WHERE id=?").get(uid) : null;
  if (!u && a.user_email) u = db.prepare("SELECT * FROM users WHERE email=? AND verified=1").get(String(a.user_email).trim().toLowerCase());
  if (!u) return res.json({ ok: true, unknown: true }); // 200: sağlayıcı sonsuza dek yeniden denemesin
  const stamp = Date.parse(a.updated_at) || now(), cur = db.prepare("SELECT stamp FROM plans WHERE user_id=?").get(u.id);
  if (cur && cur.stamp > stamp) return res.json({ ok: true, stale: true });
  const status = ["on_trial", "active", "paused", "past_due", "unpaid", "cancelled", "expired"].includes(a.status) ? a.status : "";
  const portal = /^https:\/\//.test((a.urls || {}).customer_portal || "") ? a.urls.customer_portal.slice(0, 500) : "";
  const ms = v => { const x = Date.parse(v); return Number.isFinite(x) ? x : 0; };
  db.prepare("INSERT INTO plans(user_id,status,provider,ext_id,renews,ends,portal,stamp) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET status=excluded.status, provider=excluded.provider, ext_id=excluded.ext_id, renews=excluded.renews, ends=excluded.ends, portal=CASE WHEN excluded.portal<>'' THEN excluded.portal ELSE plans.portal END, stamp=excluded.stamp")
    .run(u.id, status, "ls", String(d.id || "").slice(0, 40), ms(a.renews_at), ms(a.ends_at), portal, stamp);
  res.json({ ok: true });
});
// Yönetici: elle Pro ver (ör. havale/IBAN ile ödeyenler). days=0 → kaldır.
app.post("/api/admin/plan", (req, res) => {
  if (!ADMIN_TOKEN) return res.status(404).json({ error: "not_found" });
  if (!limit("adm:" + req.ip, 10, 600e3)) return res.status(429).json({ error: "rate_limited" });
  if (!safeEq(sha(String(req.headers["x-admin-token"] || "")), sha(ADMIN_TOKEN))) return res.status(401).json({ error: "unauthorized" });
  const email = String((req.body || {}).email || "").trim().toLowerCase(), days = Math.max(0, Math.min(3650, Math.floor(+(req.body || {}).days || 0)));
  const u = okEmail(email) ? db.prepare("SELECT * FROM users WHERE email=?").get(email) : null;
  if (!u) return res.status(404).json({ error: "no_user" });
  db.prepare("INSERT INTO plans(user_id,status,provider,ends,stamp) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET status=excluded.status, provider=excluded.provider, ends=excluded.ends, stamp=excluded.stamp")
    .run(u.id, days ? "active" : "", "manual", days ? now() + days * 864e5 : 0, now());
  res.json({ ok: true, plan: planOf(u) });
});

app.post("/api/ai", auth, async (req, res) => {
  if (!AI_KEY) return res.status(503).json({ error: "ai_off" });
  if (!limit("ai:" + req.user.id, 20, 60000)) return res.status(429).json({ error: "rate_limited" });
  const msgs = Array.isArray((req.body || {}).messages) ? req.body.messages.slice(-60) : [];
  const turns = msgs.filter(t => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content).map(t => ({ role: t.role, content: t.content }));
  if (!turns.length || turns[turns.length - 1].role !== "user") return res.status(400).json({ error: "bad_request" });
  if (turns.reduce((n, t) => n + t.content.length, 0) > AI_MAX_IN) return res.status(413).json({ error: "too_large" });
  const day = new Date().toISOString().slice(0, 10), ps = planOf(req.user).state, max = !BILLING ? AI_DAILY : ps === "pro" ? AI_DAILY_PRO : ps === "free" ? Math.min(AI_DAILY, 15) : AI_DAILY;
  const used = (db.prepare("SELECT n FROM ai_usage WHERE user_id=? AND day=?").get(req.user.id, day) || {}).n || 0;
  if (used >= max) return res.status(429).json({ error: "ai_quota", limit: max });
  db.prepare("INSERT INTO ai_usage(user_id,day,n) VALUES(?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET n=n+1").run(req.user.id, day);
  db.prepare("DELETE FROM ai_usage WHERE day<?").run(new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10));
  const ac = new AbortController(), to = setTimeout(() => ac.abort(), 90000);
  try {
    let text = "", trunc = false, lastSt = 0, lastMsg = "";
    const start = aiRR++ % AI_KEYS.length;
    for (let k = 0; k < AI_KEYS.length; k++) {
      const key = AI_KEYS[(start + k) % AI_KEYS.length]; let r, j;
      if (AI_PROVIDER === "gemini") {
        r = await fetch(AI_URL + "/models/" + encodeURIComponent(AI_MODEL) + ":generateContent", { method: "POST", signal: ac.signal, headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({ contents: turns.map(t => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] })), generationConfig: { maxOutputTokens: 8000 } }) });
      } else {
        r = await fetch(AI_URL + "/chat/completions", { method: "POST", signal: ac.signal, headers: { "content-type": "application/json", authorization: "Bearer " + key }, body: JSON.stringify({ model: AI_MODEL, messages: turns }) });
      }
      j = await r.json().catch(() => ({}));
      if (!r.ok) { lastSt = r.status; lastMsg = String((j.error && (j.error.message || j.error.status)) || "").replace(/AIza[\w-]+/g, "***").slice(0, 160); console.error("ai:", r.status, JSON.stringify(j).slice(0, 300)); if (r.status === 429 || r.status >= 500 || r.status === 401 || r.status === 403) continue; return res.status(502).json({ error: "ai_failed " + r.status + ": " + lastMsg }); }
      if (AI_PROVIDER === "gemini") {
        const c = (j.candidates || [])[0];
        if ((j.promptFeedback && j.promptFeedback.blockReason) || (c && c.finishReason === "SAFETY")) return res.json({ refused: true });
        text = ((c && c.content && c.content.parts) || []).map(p => p.text || "").join(""); trunc = !!c && c.finishReason === "MAX_TOKENS";
      } else {
        const c = (j.choices || [])[0] || {}; text = (c.message && c.message.content) || ""; trunc = c.finish_reason === "length";
        if (c.finish_reason === "content_filter") return res.json({ refused: true });
      }
      break;
    }
    if (!text && lastSt) return res.status(502).json({ error: (lastSt === 429 ? "ai_busy " : "ai_failed ") + lastSt + ": " + lastMsg });
    if (!text) return res.status(502).json({ error: "ai_empty" });
    res.json({ text, truncated: trunc, left: Math.max(0, max - used - 1) });
  } catch (e) { console.error("ai:", e.message); res.status(502).json({ error: "ai_failed: " + String(e.message).slice(0, 80) }); }
  finally { clearTimeout(to); }
});

app.get("/api/data", auth, (req, res) => {
  const r = db.prepare("SELECT json, rev, updated FROM data WHERE user_id=?").get(req.user.id);
  if (!r) return res.status(404).json({ error: "no_data" });
  res.json({ data: JSON.parse(r.json), rev: r.rev, updated: r.updated });
});
app.put("/api/data", auth, (req, res) => {
  const d = (req.body || {}).data;
  if (!d || typeof d !== "object" || Array.isArray(d)) return res.status(400).json({ error: "bad_data" });
  const s = JSON.stringify(d);
  const size = Buffer.byteLength(s);
  if (size > MAX_DATA) return res.status(413).json({ error: "too_large" });
  if (size > FREE_MAX_DATA && planOf(req.user).state === "free") return res.status(402).json({ error: "pro_required", limit: FREE_MAX_DATA });
  const cur = db.prepare("SELECT rev FROM data WHERE user_id=?").get(req.user.id), rev = (cur ? cur.rev : 0) + 1;
  db.prepare("INSERT INTO data(user_id,json,rev,updated) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET json=excluded.json, rev=excluded.rev, updated=excluded.updated").run(req.user.id, s, rev, now());
  res.json({ ok: true, rev });
});

// Uygulamanın kendisini de sun (aynı adres, ek ayar gerekmez)
const PUB = path.join(__dirname, "public");
let INDEX = null;
function loadIndex() {
  const f = path.join(PUB, "index.html");
  if (!fs.existsSync(f)) return null;
  return fs.readFileSync(f, "utf8").replace("<head>", '<head><script>window.PUSULA_CONFIG=Object.assign(window.PUSULA_CONFIG||{},{serverUrl:"auto"});</script>');
}
function serveStatic(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") return res.json({ error: "not_found" }, 404);
  if (INDEX === null) INDEX = loadIndex() || "";
  if (!INDEX) { res.statusCode = 200; res.setHeader("Content-Type", "text/plain; charset=utf-8"); return res.end("Pusula sunucusu çalışıyor. Uygulama dosyaları için public/index.html ekleyin."); }
  let p;
  try { p = decodeURIComponent(pathname); } catch (e) { return res.json({ error: "bad_request" }, 400); }
  if (p === "/" || p === "/index.html") { res.setHeader("Content-Type", MIME[".html"]); res.setHeader("Cache-Control", "no-cache"); return res.end(req.method === "HEAD" ? undefined : INDEX); }
  const f = path.normalize(path.join(PUB, p));
  if (!f.startsWith(PUB + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) {
    res.setHeader("Content-Type", MIME[".html"]); res.setHeader("Cache-Control", "no-cache"); return res.end(INDEX); // SPA
  }
  res.setHeader("Content-Type", MIME[path.extname(f)] || "application/octet-stream");
  res.setHeader("Cache-Control", f.endsWith("sw.js") ? "no-cache" : "public, max-age=3600");
  fs.createReadStream(f).pipe(res);
}

let bkLast = -1, bkBusy = false;
async function bkRun(force) {
  if (!BK_ON || !BK_SAFE || bkBusy) return;
  const n = db.prepare("SELECT total_changes() AS n").get().n;
  if (!force && n === bkLast) return;
  bkBusy = true;
  try {
    const tmp = DB_PATH + ".bk"; try { fs.unlinkSync(tmp); } catch (e) {}
    db.exec("VACUUM INTO '" + tmp.replace(/'/g, "''") + "'");
    const plain = fs.readFileSync(tmp); try { fs.unlinkSync(tmp); } catch (e) {}
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", crypto.scryptSync(BK.key, "pusula-backup-v1", 32), iv), ct = Buffer.concat([c.update(plain), c.final()]);
    const blob = Buffer.concat([Buffer.from("PSB1"), iv, c.getAuthTag(), ct]).toString("base64");
    const url = BK.api + "/repos/" + BK.repo + "/contents/" + encodeURI(BK.file), H = { Authorization: "Bearer " + BK.token, Accept: "application/vnd.github+json", "User-Agent": "pusula", "content-type": "application/json" };
    for (let tries = 0; tries < 2; tries++) {
      let sha; const g = await fetch(url, { headers: H });
      if (g.ok) sha = (await g.json()).sha; else if (g.status !== 404) throw new Error("GitHub HTTP " + g.status);
      const r = await fetch(url, { method: "PUT", headers: H, body: JSON.stringify({ message: "yedek " + new Date().toISOString(), content: blob, ...(sha ? { sha } : {}) }) });
      if (r.ok) { bkLast = n; break; }
      if (r.status !== 409 && r.status !== 422) throw new Error("yükleme HTTP " + r.status);
    }
  } catch (e) { console.error("yedek:", e.message); }
  finally { bkBusy = false; }
}

if (require.main === module) {
  if (BK_ON) {
    setInterval(() => bkRun(false), +process.env.BACKUP_INTERVAL_MS || 60000);
    process.on("SIGTERM", async () => { for (let i = 0; i < 50 && bkBusy; i++) await new Promise(r => setTimeout(r, 200)); await bkRun(true); process.exit(0); });
  }
  server.listen(PORT, () => console.log(`Pusula sunucusu :${PORT} · e-posta: ${HAS_MAIL ? "açık" : "kapalı (kodlar günlüğe yazılır)"} · doğrulama: ${REQUIRE_VERIFY ? "açık" : "kapalı"}`));
}
module.exports = { server, db };
