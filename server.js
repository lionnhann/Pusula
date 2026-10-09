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
const HAS_MAIL = !!(process.env.BREVO_API_KEY || process.env.RESEND_API_KEY || process.env.SMTP_URL);
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
  if (process.env.BREVO_API_KEY) { // Brevo (ücretsiz: günde 300 e-posta, alan adı gerekmez; gönderen adresi Brevo'da doğrulanmalı)
    const m = MAIL_FROM.match(/^\s*(.*?)\s*<([^>]+)>\s*$/), sender = m ? { name: m[1].replace(/^"|"$/g, "") || "Pusula", email: m[2] } : { name: "Pusula", email: MAIL_FROM.trim() };
    const r = await fetch(process.env.BREVO_API_URL || "https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": process.env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ sender, to: [{ email: to }], subject, textContent: text }) });
    if (!r.ok) { let d = ""; try { d = String((await r.json()).message || "").slice(0, 120); } catch (e) {} throw new Error("Brevo " + r.status + (d ? ": " + d : "")); }
    return;
  }
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
const AI_KEYS = String(process.env.AI_KEY || "").split(/[\s,;]+/).map(x => x.replace(/^["']+|["']+$/g, "")).filter(Boolean), AI_KEY = AI_KEYS[0] || "", AI_PROVIDER = (process.env.AI_PROVIDER || "gemini").toLowerCase();
let aiRR = 0;
const AI_MODELS = String(process.env.AI_MODEL || (AI_PROVIDER === "gemini" ? "gemini-3.8-flash" : "gpt-4o-mini")).split(",").map(x => x.trim()).filter(Boolean); // virgülle yedek modeller: model1,model2
const AI_MODEL = AI_MODELS[0];
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

app.get("/api/health", (req, res) => res.json({ ok: true, mail: HAS_MAIL, verify: REQUIRE_VERIFY, billing: BILLING, ai: !!AI_KEY, social: typeof R2_ON !== "undefined" && R2_ON, google: typeof G_ON !== "undefined" && G_ON, backup: bkStatus }));

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
    const tries = [];
    for (let m = 0; m < AI_MODELS.length; m++) for (let k = 0; k < AI_KEYS.length; k++) tries.push([AI_MODELS[m], AI_KEYS[(start + k) % AI_KEYS.length]]);
    if (tries.length < 2 || AI_MODELS.length === 1) tries.push(tries[0]); // tek model: bir kez daha dene (geçici yoğunluk)
    for (let k = 0; k < tries.length; k++) {
      const model = tries[k][0], key = tries[k][1]; let r, j;
      if (k > 0 && lastSt >= 500) await new Promise(z => setTimeout(z, 1200));
      if (AI_PROVIDER === "gemini") {
        r = await fetch(AI_URL + "/models/" + encodeURIComponent(model) + ":generateContent", { method: "POST", signal: ac.signal, headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({ contents: turns.map(t => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] })), generationConfig: { maxOutputTokens: 8000 } }) });
      } else {
        r = await fetch(AI_URL + "/chat/completions", { method: "POST", signal: ac.signal, headers: { "content-type": "application/json", authorization: "Bearer " + key }, body: JSON.stringify({ model, messages: turns }) });
      }
      j = await r.json().catch(() => ({}));
      if (!r.ok) { lastSt = r.status; lastMsg = String((j.error && (j.error.message || j.error.status)) || "").replace(/AIza[\w-]+/g, "***").slice(0, 160); console.error("ai:", r.status, JSON.stringify(j).slice(0, 300)); if (r.status === 429 || r.status >= 500 || r.status === 401 || r.status === 403 || (r.status === 404 && AI_MODELS.length > 1) || (r.status === 400 && /api key|api_key/i.test(lastMsg))) continue; return res.status(502).json({ error: "ai_failed " + r.status + ": " + lastMsg }); }
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

// ===== BEGIN SOCIAL =====
// Sosyal özellikler: profil, paylaşım (yazı/foto/reels), takip, beğeni, yorum, mesajlaşma, şikâyet, engelleme.
// Medya dosyaları Cloudflare R2'ye (S3 uyumlu) tarayıcıdan doğrudan yüklenir; sunucuda yalnızca anahtar saklanır.
db.exec(`
CREATE TABLE IF NOT EXISTS profiles(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, handle TEXT UNIQUE NOT NULL COLLATE NOCASE, bio TEXT NOT NULL DEFAULT '', avatar TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, text TEXT NOT NULL DEFAULT '', media TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS posts_c ON posts(created DESC);
CREATE INDEX IF NOT EXISTS posts_u ON posts(user_id, created DESC);
CREATE TABLE IF NOT EXISTS follows(follower TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, followee TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created INTEGER NOT NULL, PRIMARY KEY(follower, followee));
CREATE TABLE IF NOT EXISTS likes(post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(post_id, user_id));
CREATE TABLE IF NOT EXISTS comments(id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, text TEXT NOT NULL, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS comments_p ON comments(post_id, created);
CREATE TABLE IF NOT EXISTS msgs(id INTEGER PRIMARY KEY AUTOINCREMENT, from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, to_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, text TEXT NOT NULL DEFAULT '', media TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL, read INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS msgs_pair ON msgs(from_id, to_id, id);
CREATE INDEX IF NOT EXISTS msgs_to ON msgs(to_id, read);
CREATE TABLE IF NOT EXISTS blocks(blocker TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, blocked TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(blocker, blocked));
CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY, reporter TEXT NOT NULL, kind TEXT NOT NULL, target TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS bans(user_id TEXT PRIMARY KEY, reason TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL);
`);
const R2 = { acct: process.env.R2_ACCOUNT_ID || "", key: process.env.R2_ACCESS_KEY_ID || "", sec: process.env.R2_SECRET_ACCESS_KEY || "", bucket: process.env.R2_BUCKET || "", pub: String(process.env.R2_PUBLIC_URL || "").replace(/\/+$/, ""), host: process.env.R2_ENDPOINT_HOST || "" };
R2.host = R2.host || (R2.acct ? R2.acct + ".r2.cloudflarestorage.com" : "");
const R2_ON = !!(R2.host && R2.key && R2.sec && R2.bucket && R2.pub);
const hmac = (k, s) => crypto.createHmac("sha256", k).update(s).digest();
const awsEnc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
// AWS Signature V4, sorgu dizesine imzalı (presigned) URL
function sigV4Presign({ method, host, pathName, keyId, secret, region, service, date, expires, extra }) {
  const ds = date.replace(/[-:]/g, "").replace(/\.\d+/, ""), day = ds.slice(0, 8), scope = day + "/" + region + "/" + service + "/aws4_request";
  const q = { "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": keyId + "/" + scope, "X-Amz-Date": ds, "X-Amz-Expires": String(expires), "X-Amz-SignedHeaders": "host", ...(extra || {}) };
  const cq = Object.keys(q).sort().map(k => awsEnc(k) + "=" + awsEnc(q[k])).join("&");
  const canon = [method, pathName.split("/").map(awsEnc).join("/"), cq, "host:" + host + "\n", "host", "UNSIGNED-PAYLOAD"].join("\n");
  const sts = ["AWS4-HMAC-SHA256", ds, scope, crypto.createHash("sha256").update(canon).digest("hex")].join("\n");
  const kd = hmac(hmac(hmac(hmac("AWS4" + secret, day), region), service), "aws4_request");
  return { query: cq + "&X-Amz-Signature=" + hmac(kd, sts).toString("hex"), signature: hmac(kd, sts).toString("hex") };
}
const MEDIA_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
const MAX_IMG = 4 * 1024 * 1024, MAX_VID = +process.env.MAX_VIDEO_BYTES || 40 * 1024 * 1024;
const mediaUrl = k => k && R2_ON ? R2.pub + "/" + k : "";
const HANDLE_RE = /^[a-z0-9_.]{3,20}$/i;
const cleanText = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f‪-‮⁦-⁩]/g, "").replace(/\r\n?/g, "\n").trim().slice(0, n);
const profOf = uid => db.prepare("SELECT user_id, handle, bio, avatar FROM profiles WHERE user_id=?").get(uid);
const profByHandle = h => HANDLE_RE.test(String(h || "")) ? db.prepare("SELECT user_id, handle, bio, avatar FROM profiles WHERE handle=?").get(String(h)) : null;
const isBanned = uid => !!db.prepare("SELECT 1 FROM bans WHERE user_id=?").get(uid);
const blockedEither = (a, b) => !!db.prepare("SELECT 1 FROM blocks WHERE (blocker=? AND blocked=?) OR (blocker=? AND blocked=?)").get(a, b, b, a);
const pubProf = p => p ? { handle: p.handle, bio: p.bio, avatar: mediaUrl(p.avatar) } : null;
const socialMw = (req, res, next) => {
  if (isBanned(req.user.id)) return res.status(403).json({ error: "banned" });
  req.prof = profOf(req.user.id); next();
};
const needProf = (req, res, next) => { if (!req.prof) return res.status(409).json({ error: "no_profile" }); next(); };
const S = (path, ...fns) => app.post("/api/social/" + path, auth, socialMw, ...fns);

function postRows(rows, me) {
  if (!rows.length) return [];
  const ids = rows.map(r => r.id), ph = ids.map(() => "?").join(",");
  const lk = Object.fromEntries(db.prepare(`SELECT post_id, COUNT(*) n FROM likes WHERE post_id IN (${ph}) GROUP BY post_id`).all(...ids).map(r => [r.post_id, r.n]));
  const cm = Object.fromEntries(db.prepare(`SELECT post_id, COUNT(*) n FROM comments WHERE post_id IN (${ph}) GROUP BY post_id`).all(...ids).map(r => [r.post_id, r.n]));
  const mine = new Set(db.prepare(`SELECT post_id FROM likes WHERE user_id=? AND post_id IN (${ph})`).all(me, ...ids).map(r => r.post_id));
  return rows.map(r => ({ id: r.id, kind: r.kind, text: r.text, media: mediaUrl(r.media), created: r.created, handle: r.handle, avatar: mediaUrl(r.avatar), likes: lk[r.id] || 0, comments: cm[r.id] || 0, liked: mine.has(r.id), own: r.user_id === me }));
}
const POST_SEL = "SELECT p.id, p.user_id, p.kind, p.text, p.media, p.created, f.handle, f.avatar FROM posts p JOIN profiles f ON f.user_id=p.user_id";
const NOT_BLOCKED = "AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker=? AND b.blocked=p.user_id) OR (b.blocker=p.user_id AND b.blocked=?))";
const NOT_BANNED = "AND NOT EXISTS(SELECT 1 FROM bans x WHERE x.user_id=p.user_id)";

S("me", (req, res) => res.json({ profile: pubProf(req.prof), storage: R2_ON, unread: db.prepare("SELECT COUNT(*) n FROM msgs WHERE to_id=? AND read=0").get(req.user.id).n }));

S("profile", (req, res) => {
  if (!limit("sprof:" + req.user.id, 20, 600e3)) return res.status(429).json({ error: "rate_limited" });
  const b = req.body || {}, bio = cleanText(b.bio, 160);
  let avatar = req.prof ? req.prof.avatar : "";
  if (b.avatar !== undefined) { if (b.avatar && !String(b.avatar).startsWith("m/" + req.user.id + "/")) return res.status(400).json({ error: "bad_media" }); avatar = String(b.avatar || ""); }
  if (!req.prof) {
    const h = String(b.handle || "").trim();
    if (!HANDLE_RE.test(h)) return res.status(400).json({ error: "bad_handle" });
    if (profByHandle(h)) return res.status(409).json({ error: "handle_taken" });
    db.prepare("INSERT INTO profiles(user_id,handle,bio,avatar,created) VALUES(?,?,?,?,?)").run(req.user.id, h, bio, avatar, now());
  } else db.prepare("UPDATE profiles SET bio=?, avatar=? WHERE user_id=?").run(bio, avatar, req.user.id);
  res.json({ profile: pubProf(profOf(req.user.id)) });
});

S("upload", needProf, (req, res) => {
  if (!R2_ON) return res.status(501).json({ error: "storage_off" });
  if (!limit("sup:" + req.user.id, 40, 24 * 3600e3)) return res.status(429).json({ error: "rate_limited" });
  const type = String((req.body || {}).type || "").toLowerCase(), size = Math.floor(+(req.body || {}).size || 0), ext = MEDIA_EXT[type];
  if (!ext) return res.status(400).json({ error: "bad_type" });
  const vid = type.startsWith("video/");
  if (size <= 0 || size > (vid ? MAX_VID : MAX_IMG)) return res.status(413).json({ error: "too_large", max: vid ? MAX_VID : MAX_IMG });
  const key = "m/" + req.user.id + "/" + rnd(12) + "." + ext;
  const sg = sigV4Presign({ method: "PUT", host: R2.host, pathName: "/" + R2.bucket + "/" + key, keyId: R2.key, secret: R2.sec, region: "auto", service: "s3", date: new Date().toISOString(), expires: 600 });
  res.json({ key, url: "https://" + R2.host + "/" + R2.bucket + "/" + key + "?" + sg.query, type });
});

S("post", needProf, (req, res) => {
  if (!limit("spost:" + req.user.id, 30, 3600e3)) return res.status(429).json({ error: "rate_limited" });
  const b = req.body || {}, kind = ["text", "photo", "reel"].includes(b.kind) ? b.kind : "", text = cleanText(b.text, 1000), media = String(b.media || "");
  if (!kind) return res.status(400).json({ error: "bad_kind" });
  if (kind === "text" && !text) return res.status(400).json({ error: "empty" });
  if (kind !== "text") {
    if (!R2_ON) return res.status(501).json({ error: "storage_off" });
    const okExt = kind === "photo" ? /\.(jpg|png|webp)$/ : /\.(mp4|webm|mov)$/;
    if (!media.startsWith("m/" + req.user.id + "/") || !okExt.test(media) || media.length > 120) return res.status(400).json({ error: "bad_media" });
  }
  const id = "p" + rnd(8);
  db.prepare("INSERT INTO posts(id,user_id,kind,text,media,created) VALUES(?,?,?,?,?,?)").run(id, req.user.id, kind, text, kind === "text" ? "" : media, now());
  res.json({ ok: true, id });
});

S("feed", needProf, (req, res) => {
  const b = req.body || {}, me = req.user.id, before = +b.before || now() + 1, mode = ["following", "all", "reels", "user"][["following", "all", "reels", "user"].indexOf(b.mode)] || "all";
  let rows;
  if (mode === "user") {
    const p = profByHandle(b.handle); if (!p) return res.status(404).json({ error: "no_user" });
    if (blockedEither(me, p.user_id)) return res.json({ posts: [] });
    rows = db.prepare(`${POST_SEL} WHERE p.user_id=? AND p.created<? ORDER BY p.created DESC LIMIT 20`).all(p.user_id, before);
  } else if (mode === "following") {
    rows = db.prepare(`${POST_SEL} WHERE (p.user_id=? OR p.user_id IN (SELECT followee FROM follows WHERE follower=?)) AND p.created<? ${NOT_BLOCKED} ${NOT_BANNED} ORDER BY p.created DESC LIMIT 20`).all(me, me, before, me, me);
  } else if (mode === "reels") {
    rows = db.prepare(`${POST_SEL} WHERE p.kind='reel' AND p.created<? ${NOT_BLOCKED} ${NOT_BANNED} ORDER BY p.created DESC LIMIT 12`).all(before, me, me);
  } else {
    rows = db.prepare(`${POST_SEL} WHERE p.created<? ${NOT_BLOCKED} ${NOT_BANNED} ORDER BY p.created DESC LIMIT 20`).all(before, me, me);
  }
  res.json({ posts: postRows(rows, me) });
});

S("like", needProf, (req, res) => {
  if (!limit("slike:" + req.user.id, 200, 600e3)) return res.status(429).json({ error: "rate_limited" });
  const id = String((req.body || {}).id || ""), p = db.prepare("SELECT user_id FROM posts WHERE id=?").get(id);
  if (!p || blockedEither(req.user.id, p.user_id)) return res.status(404).json({ error: "not_found" });
  if ((req.body || {}).on) db.prepare("INSERT OR IGNORE INTO likes(post_id,user_id) VALUES(?,?)").run(id, req.user.id); else db.prepare("DELETE FROM likes WHERE post_id=? AND user_id=?").run(id, req.user.id);
  res.json({ likes: db.prepare("SELECT COUNT(*) n FROM likes WHERE post_id=?").get(id).n });
});

S("comment", needProf, (req, res) => {
  if (!limit("scom:" + req.user.id, 60, 3600e3)) return res.status(429).json({ error: "rate_limited" });
  const id = String((req.body || {}).id || ""), text = cleanText((req.body || {}).text, 300), p = db.prepare("SELECT user_id FROM posts WHERE id=?").get(id);
  if (!p || blockedEither(req.user.id, p.user_id)) return res.status(404).json({ error: "not_found" });
  if (!text) return res.status(400).json({ error: "empty" });
  db.prepare("INSERT INTO comments(id,post_id,user_id,text,created) VALUES(?,?,?,?,?)").run("c" + rnd(8), id, req.user.id, text, now());
  res.json({ ok: true });
});
S("comments", needProf, (req, res) => {
  const id = String((req.body || {}).id || ""), p = db.prepare("SELECT user_id FROM posts WHERE id=?").get(id), me = req.user.id;
  if (!p || blockedEither(me, p.user_id)) return res.status(404).json({ error: "not_found" });
  const rows = db.prepare("SELECT c.id, c.user_id, c.text, c.created, f.handle FROM comments c JOIN profiles f ON f.user_id=c.user_id WHERE c.post_id=? AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker=? AND b.blocked=c.user_id) OR (b.blocker=c.user_id AND b.blocked=?)) ORDER BY c.created LIMIT 100").all(id, me, me);
  res.json({ comments: rows.map(r => ({ id: r.id, text: r.text, created: r.created, handle: r.handle, own: r.user_id === me || p.user_id === me })) });
});
S("delcomment", needProf, (req, res) => {
  const c = db.prepare("SELECT c.id, c.user_id, p.user_id AS owner FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.id=?").get(String((req.body || {}).id || ""));
  if (!c || (c.user_id !== req.user.id && c.owner !== req.user.id)) return res.status(404).json({ error: "not_found" });
  db.prepare("DELETE FROM comments WHERE id=?").run(c.id); res.json({ ok: true });
});

S("delete", needProf, (req, res) => {
  const id = String((req.body || {}).id || ""), p = db.prepare("SELECT user_id FROM posts WHERE id=?").get(id);
  if (!p || p.user_id !== req.user.id) return res.status(404).json({ error: "not_found" });
  db.prepare("DELETE FROM posts WHERE id=?").run(id); res.json({ ok: true });
});

S("user", needProf, (req, res) => {
  const p = profByHandle((req.body || {}).handle), me = req.user.id;
  if (!p || isBanned(p.user_id)) return res.status(404).json({ error: "no_user" });
  const blocked = blockedEither(me, p.user_id);
  res.json({ profile: pubProf(p), self: p.user_id === me, blocked, iBlocked: !!db.prepare("SELECT 1 FROM blocks WHERE blocker=? AND blocked=?").get(me, p.user_id),
    followers: db.prepare("SELECT COUNT(*) n FROM follows WHERE followee=?").get(p.user_id).n, following: db.prepare("SELECT COUNT(*) n FROM follows WHERE follower=?").get(p.user_id).n,
    posts: db.prepare("SELECT COUNT(*) n FROM posts WHERE user_id=?").get(p.user_id).n, isFollowing: !!db.prepare("SELECT 1 FROM follows WHERE follower=? AND followee=?").get(me, p.user_id) });
});
S("search", needProf, (req, res) => {
  const q = String((req.body || {}).q || "").trim().replace(/[^a-zA-Z0-9_.]/g, "").slice(0, 20);
  if (q.length < 2) return res.json({ users: [] });
  const rows = db.prepare("SELECT f.handle, f.bio, f.avatar, f.user_id FROM profiles f WHERE f.handle LIKE ? ESCAPE '\\' AND f.user_id<>? AND NOT EXISTS(SELECT 1 FROM bans x WHERE x.user_id=f.user_id) ORDER BY f.handle LIMIT 15").all(q.replace(/[_%]/g, "\\$&") + "%", req.user.id);
  res.json({ users: rows.filter(r => !blockedEither(req.user.id, r.user_id)).map(r => ({ handle: r.handle, bio: r.bio, avatar: mediaUrl(r.avatar) })) });
});
S("follow", needProf, (req, res) => {
  if (!limit("sfol:" + req.user.id, 100, 3600e3)) return res.status(429).json({ error: "rate_limited" });
  const p = profByHandle((req.body || {}).handle);
  if (!p || p.user_id === req.user.id || blockedEither(req.user.id, p.user_id)) return res.status(404).json({ error: "not_found" });
  if ((req.body || {}).on) db.prepare("INSERT OR IGNORE INTO follows(follower,followee,created) VALUES(?,?,?)").run(req.user.id, p.user_id, now()); else db.prepare("DELETE FROM follows WHERE follower=? AND followee=?").run(req.user.id, p.user_id);
  res.json({ ok: true, followers: db.prepare("SELECT COUNT(*) n FROM follows WHERE followee=?").get(p.user_id).n });
});
S("block", needProf, (req, res) => {
  const p = profByHandle((req.body || {}).handle);
  if (!p || p.user_id === req.user.id) return res.status(404).json({ error: "not_found" });
  if ((req.body || {}).on) { db.prepare("INSERT OR IGNORE INTO blocks(blocker,blocked) VALUES(?,?)").run(req.user.id, p.user_id); db.prepare("DELETE FROM follows WHERE (follower=? AND followee=?) OR (follower=? AND followee=?)").run(req.user.id, p.user_id, p.user_id, req.user.id); }
  else db.prepare("DELETE FROM blocks WHERE blocker=? AND blocked=?").run(req.user.id, p.user_id);
  res.json({ ok: true });
});
S("report", needProf, (req, res) => {
  if (!limit("srep:" + req.user.id, 20, 3600e3)) return res.status(429).json({ error: "rate_limited" });
  const b = req.body || {}, kind = ["post", "user", "comment", "msg"].includes(b.kind) ? b.kind : "";
  if (!kind) return res.status(400).json({ error: "bad_kind" });
  db.prepare("INSERT INTO reports(id,reporter,kind,target,reason,created) VALUES(?,?,?,?,?,?)").run("r" + rnd(8), req.user.id, kind, String(b.target || "").slice(0, 60), cleanText(b.reason, 300), now());
  res.json({ ok: true });
});

// Mesajlaşma (sunucu tarafında okunabilir; uçtan uca şifreli değil)
S("inbox", needProf, (req, res) => {
  const me = req.user.id;
  const rows = db.prepare(`SELECT m.id, m.from_id, m.to_id, m.text, m.media, m.created FROM msgs m WHERE m.id IN (SELECT MAX(id) FROM msgs WHERE from_id=? OR to_id=? GROUP BY CASE WHEN from_id=? THEN to_id ELSE from_id END) ORDER BY m.id DESC LIMIT 50`).all(me, me, me);
  const out = [];
  for (const r of rows) {
    const other = r.from_id === me ? r.to_id : r.from_id, p = profOf(other);
    if (!p || isBanned(other) || blockedEither(me, other)) continue;
    out.push({ handle: p.handle, avatar: mediaUrl(p.avatar), text: r.text || (r.media ? "📷 Fotoğraf" : ""), created: r.created, mine: r.from_id === me, unread: db.prepare("SELECT COUNT(*) n FROM msgs WHERE from_id=? AND to_id=? AND read=0").get(other, me).n });
  }
  res.json({ chats: out });
});
S("thread", needProf, (req, res) => {
  const me = req.user.id, p = profByHandle((req.body || {}).handle);
  if (!p || blockedEither(me, p.user_id)) return res.status(404).json({ error: "not_found" });
  const after = +(req.body || {}).after || 0;
  const rows = db.prepare("SELECT id, from_id, text, media, created FROM msgs WHERE id>? AND ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?)) ORDER BY id DESC LIMIT 60").all(after, me, p.user_id, p.user_id, me).reverse();
  db.prepare("UPDATE msgs SET read=1 WHERE from_id=? AND to_id=? AND read=0").run(p.user_id, me);
  res.json({ msgs: rows.map(r => ({ id: r.id, mine: r.from_id === me, text: r.text, media: mediaUrl(r.media), created: r.created })), handle: p.handle, avatar: mediaUrl(p.avatar) });
});
S("send", needProf, (req, res) => {
  const me = req.user.id, b = req.body || {}, p = profByHandle(b.handle), text = cleanText(b.text, 1000), media = String(b.media || "");
  if (!limit("smsg:" + me, 120, 600e3)) return res.status(429).json({ error: "rate_limited" });
  if (!p || p.user_id === me || blockedEither(me, p.user_id) || isBanned(p.user_id)) return res.status(404).json({ error: "not_found" });
  if (media && (!R2_ON || !media.startsWith("m/" + me + "/") || !/\.(jpg|png|webp)$/.test(media) || media.length > 120)) return res.status(400).json({ error: "bad_media" });
  if (!text && !media) return res.status(400).json({ error: "empty" });
  const r = db.prepare("INSERT INTO msgs(from_id,to_id,text,media,created) VALUES(?,?,?,?,?)").run(me, p.user_id, text, media, now());
  res.json({ ok: true, id: Number(r.lastInsertRowid) });
});

// Yönetici: şikâyetleri gör, içerik kaldır, kullanıcıyı yasakla
const admOk = (req, res) => {
  if (!ADMIN_TOKEN) { res.status(404).json({ error: "not_found" }); return false; }
  if (!limit("adm:" + req.ip, 30, 600e3)) { res.status(429).json({ error: "rate_limited" }); return false; }
  if (!safeEq(sha(String(req.headers["x-admin-token"] || "")), sha(ADMIN_TOKEN))) { res.status(401).json({ error: "unauthorized" }); return false; }
  return true;
};
app.post("/api/admin/reports", (req, res) => { if (!admOk(req, res)) return; res.json({ reports: db.prepare("SELECT * FROM reports ORDER BY created DESC LIMIT 100").all() }); });
app.post("/api/admin/remove", (req, res) => {
  if (!admOk(req, res)) return;
  const b = req.body || {};
  if (b.post) db.prepare("DELETE FROM posts WHERE id=?").run(String(b.post));
  if (b.comment) db.prepare("DELETE FROM comments WHERE id=?").run(String(b.comment));
  if (b.ban) { const p = profByHandle(b.ban); if (p) db.prepare("INSERT OR REPLACE INTO bans(user_id,reason,created) VALUES(?,?,?)").run(p.user_id, cleanText(b.reason, 200), now()); }
  if (b.unban) { const p = profByHandle(b.unban); if (p) db.prepare("DELETE FROM bans WHERE user_id=?").run(p.user_id); }
  if (b.clear) db.prepare("DELETE FROM reports WHERE id=?").run(String(b.clear));
  res.json({ ok: true });
});
// ===== END SOCIAL =====

// Uygulamanın kendisini de sun (aynı adres, ek ayar gerekmez)
// ===== BEGIN GOOGLE =====
// Google Takvim + Gmail bağlantısı (OAuth 2.0, sunucu tarafı). Yenileme anahtarı AES-256-GCM ile şifrelenip saklanır.
// Gerekli ortam değişkenleri: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET. İsteğe bağlı: GOOGLE_REDIRECT_URI, PUBLIC_URL.
const G = {
  id: process.env.GOOGLE_CLIENT_ID || "", sec: process.env.GOOGLE_CLIENT_SECRET || "",
  auth: process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth",
  token: process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token",
  info: process.env.GOOGLE_USERINFO_URL || "https://openidconnect.googleapis.com/v1/userinfo",
  api: (process.env.GOOGLE_API_BASE || "https://www.googleapis.com").replace(/\/+$/, ""),
  revoke: process.env.GOOGLE_REVOKE_URL || "https://oauth2.googleapis.com/revoke",
};
const G_ON = !!(G.id && G.sec);
const G_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"];
db.exec("CREATE TABLE IF NOT EXISTS google(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, email TEXT NOT NULL DEFAULT '', refresh_enc TEXT NOT NULL, scope TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL)");
const gKey = crypto.scryptSync(process.env.BACKUP_KEY || G.sec || "pusula", "pusula-google-v1", 32);
const gEnc = s => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", gKey, iv), ct = Buffer.concat([c.update(String(s), "utf8"), c.final()]); return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64"); };
const gDec = s => { const b = Buffer.from(String(s), "base64"), d = crypto.createDecipheriv("aes-256-gcm", gKey, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8"); };
const gState = uid => { const t = Date.now().toString(36), m = crypto.createHmac("sha256", gKey).update(uid + "." + t).digest("hex").slice(0, 32); return Buffer.from(uid + "." + t + "." + m).toString("base64url"); };
function gUnstate(s) {
  try { const [uid, t, m] = Buffer.from(String(s), "base64url").toString().split("."); const ok = crypto.createHmac("sha256", gKey).update(uid + "." + t).digest("hex").slice(0, 32); if (!uid || !t || !m || !safeEq(m, ok) || Date.now() - parseInt(t, 36) > 15 * 60000) return null; return uid; } catch (e) { return null; }
}
const gRedirect = req => process.env.GOOGLE_REDIRECT_URI || ((process.env.PUBLIC_URL || (String(req.headers["x-forwarded-proto"] || "http").split(",")[0] + "://" + (req.headers.host || "localhost"))).replace(/\/+$/, "") + "/api/google/callback");
const gTok = new Map(); // user -> {t, exp}
async function gForm(url, o) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString(), signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({})); return { s: r.status, j };
}
async function gAccess(uid) {
  const c = gTok.get(uid); if (c && c.exp > Date.now() + 30000) return c.t;
  const row = db.prepare("SELECT refresh_enc FROM google WHERE user_id=?").get(uid); if (!row) throw { status: 409, error: "google_not_linked" };
  let rt; try { rt = gDec(row.refresh_enc); } catch (e) { db.prepare("DELETE FROM google WHERE user_id=?").run(uid); throw { status: 409, error: "google_relink" }; }
  const { s, j } = await gForm(G.token, { client_id: G.id, client_secret: G.sec, refresh_token: rt, grant_type: "refresh_token" });
  if (s === 400 || s === 401) { if (j.error === "invalid_grant" || j.error === "invalid_client") { db.prepare("DELETE FROM google WHERE user_id=?").run(uid); gTok.delete(uid); throw { status: 409, error: "google_relink" }; } }
  if (s !== 200 || !j.access_token) throw { status: 502, error: "google_failed" };
  gTok.set(uid, { t: j.access_token, exp: Date.now() + (+j.expires_in || 3000) * 1000 }); return j.access_token;
}
async function gApi(uid, method, p, body) {
  const t = await gAccess(uid);
  const r = await fetch(G.api + p, { method, headers: Object.assign({ Authorization: "Bearer " + t }, body ? { "Content-Type": "application/json" } : {}), body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  if (r.status === 401) gTok.delete(uid);
  if (r.status === 204) return {};
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw { status: r.status === 403 ? 403 : r.status === 404 ? 404 : r.status === 429 ? 429 : 502, error: r.status === 403 ? "google_scope" : r.status === 404 ? "not_found" : r.status === 429 ? "rate_limited" : "google_failed" };
  return j;
}
const gMw = (req, res, next) => {
  if (!G_ON) return res.status(503).json({ error: "google_off" });
  if (!limit("g:" + req.user.id, 60, 60000)) return res.status(429).json({ error: "rate_limited" });
  next();
};
const gScoped = need => (req, res, next) => {
  const row = db.prepare("SELECT scope FROM google WHERE user_id=?").get(req.user.id);
  if (!row) return res.status(409).json({ error: "google_not_linked" });
  if (!row.scope.split(" ").some(s => s.endsWith("/" + need))) return res.status(403).json({ error: "google_scope" });
  next();
};
const gRoute = (p, need, h) => app.post("/api/google/" + p, auth, gMw, ...(need ? [gScoped(need)] : []), async (req, res) => {
  try { await h(req, res); } catch (e) { if (e && e.status) return res.status(e.status).json({ error: e.error }); console.error("google", e && e.message || e); res.status(502).json({ error: "google_failed" }); }
});
const gClip = (s, n) => cleanText(s, n);
app.post("/api/google/status", auth, (req, res) => {
  const row = db.prepare("SELECT email, scope FROM google WHERE user_id=?").get(req.user.id);
  res.json({ configured: G_ON, linked: !!row, email: row ? row.email : "", cal: !!row && /calendar\.events/.test(row.scope), mail: !!row && /gmail\.readonly/.test(row.scope), draft: !!row && /gmail\.compose/.test(row.scope) });
});
app.post("/api/google/link", auth, gMw, (req, res) => {
  const q = new URLSearchParams({ client_id: G.id, redirect_uri: gRedirect(req), response_type: "code", scope: G_SCOPES.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", state: gState(req.user.id) });
  res.json({ url: G.auth + "?" + q.toString() });
});
app.get("/api/google/callback", async (req, res) => {
  const q = new URL(req.url, "http://x").searchParams, page = (ok, msg) => { res.statusCode = 200; res.setHeader("Content-Type", "text/html; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pusula</title><body style="font-family:system-ui;background:#070c15;color:#e8f0ff;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center"><div style="padding:24px"><h2>${ok ? "✅ Google bağlandı" : "⚠ Bağlanamadı"}</h2><p>${msg}</p><p><a style="color:#56c8f5" href="/?google=${ok ? "ok" : "hata"}">Pusula'ya dön</a></p></div>${ok ? '<script>setTimeout(function(){location.replace("/?google=ok")},1500)</script>' : ""}`); };
  if (!G_ON) return page(false, "Google bağlantısı bu sunucuda kapalı.");
  if (q.get("error")) return page(false, "İzin verilmedi.");
  const uid = gUnstate(q.get("state")); if (!uid || !db.prepare("SELECT 1 FROM users WHERE id=?").get(uid)) return page(false, "Bağlantı süresi doldu, uygulamadan yeniden dene.");
  try {
    const { s, j } = await gForm(G.token, { code: String(q.get("code") || ""), client_id: G.id, client_secret: G.sec, redirect_uri: gRedirect(req), grant_type: "authorization_code" });
    if (s !== 200 || !j.access_token) return page(false, "Google kodu kabul etmedi.");
    const old = db.prepare("SELECT refresh_enc FROM google WHERE user_id=?").get(uid);
    let rt = j.refresh_token; if (!rt && old) { try { rt = gDec(old.refresh_enc); } catch (e) {} }
    if (!rt) return page(false, "Google yenileme izni vermedi. Pusula'yı Google hesabından kaldırıp tekrar dene.");
    let email = ""; try { const ir = await fetch(G.info, { headers: { Authorization: "Bearer " + j.access_token }, signal: AbortSignal.timeout(10000) }); email = String((await ir.json()).email || "").slice(0, 120); } catch (e) {}
    db.prepare("INSERT INTO google(user_id,email,refresh_enc,scope,created) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email, refresh_enc=excluded.refresh_enc, scope=excluded.scope, created=excluded.created").run(uid, email, gEnc(rt), String(j.scope || "").slice(0, 600), now());
    gTok.set(uid, { t: j.access_token, exp: Date.now() + (+j.expires_in || 3000) * 1000 });
    page(true, "Takvim ve e-posta erişimi açıldı. Uygulamaya dönebilirsin.");
  } catch (e) { page(false, "Google'a ulaşılamadı."); }
});
gRoute("unlink", null, async (req, res) => {
  const row = db.prepare("SELECT refresh_enc FROM google WHERE user_id=?").get(req.user.id);
  if (row) { try { await fetch(G.revoke, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "token=" + encodeURIComponent(gDec(row.refresh_enc)), signal: AbortSignal.timeout(8000) }); } catch (e) {} }
  db.prepare("DELETE FROM google WHERE user_id=?").run(req.user.id); gTok.delete(req.user.id); res.json({ ok: true });
});
const evOut = e => ({ id: e.id, title: gClip(e.summary || "(başlıksız)", 120), start: (e.start || {}).dateTime || (e.start || {}).date || "", end: (e.end || {}).dateTime || (e.end || {}).date || "", allDay: !!(e.start && e.start.date), where: gClip(e.location, 120) });
gRoute("cal/list", "calendar.events", async (req, res) => {
  const b = req.body, days = Math.min(60, Math.max(1, +b.days || 7)), max = Math.min(40, Math.max(1, +b.max || 20));
  const from = b.from && !isNaN(Date.parse(b.from)) ? new Date(b.from) : new Date();
  const q = new URLSearchParams({ timeMin: from.toISOString(), timeMax: new Date(from.getTime() + days * 864e5).toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: String(max) });
  const j = await gApi(req.user.id, "GET", "/calendar/v3/calendars/primary/events?" + q.toString());
  res.json({ events: (j.items || []).filter(e => e.status !== "cancelled").map(evOut) });
});
const TZ_RE = /^[A-Za-z_]+(\/[A-Za-z_+\-0-9]+){0,2}$/, DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^\d{2}:\d{2}$/;
gRoute("cal/add", "calendar.events", async (req, res) => {
  const b = req.body, title = gClip(b.title, 120), tz = TZ_RE.test(String(b.tz || "")) ? b.tz : "Europe/Istanbul";
  if (!title || !DATE_RE.test(String(b.date || "")) || isNaN(Date.parse(b.date))) return res.status(400).json({ error: "bad_input" });
  let ev = { summary: title, description: gClip(b.desc, 1000), location: gClip(b.where, 120) };
  if (b.time && TIME_RE.test(b.time)) {
    const st = b.date + "T" + b.time + ":00", mins = Math.min(1440, Math.max(5, +b.minutes || 60)), d = new Date(st + "Z"); d.setUTCMinutes(d.getUTCMinutes() + mins);
    ev.start = { dateTime: st, timeZone: tz }; ev.end = { dateTime: d.toISOString().slice(0, 19), timeZone: tz };
  } else { const d = new Date(b.date + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); ev.start = { date: b.date }; ev.end = { date: d.toISOString().slice(0, 10) }; }
  const j = await gApi(req.user.id, "POST", "/calendar/v3/calendars/primary/events", ev);
  res.json({ ok: true, event: evOut(j) });
});
gRoute("cal/delete", "calendar.events", async (req, res) => {
  const id = String(req.body.id || ""); if (!/^[A-Za-z0-9_\-]{1,100}$/.test(id)) return res.status(400).json({ error: "bad_input" });
  await gApi(req.user.id, "DELETE", "/calendar/v3/calendars/primary/events/" + id); res.json({ ok: true });
});
const hdr = (m, n) => { const h = ((m.payload || {}).headers || []).find(x => x.name.toLowerCase() === n); return h ? h.value : ""; };
const mailOut = m => ({ id: m.id, from: gClip(hdr(m, "from"), 120), subject: gClip(hdr(m, "subject"), 160), date: gClip(hdr(m, "date"), 40), snippet: gClip(m.snippet, 200), unread: (m.labelIds || []).includes("UNREAD") });
gRoute("mail/list", "gmail.readonly", async (req, res) => {
  const b = req.body, max = Math.min(15, Math.max(1, +b.max || 8));
  let q = gClip(b.q, 200); if (b.unread) q = ("is:unread " + q).trim(); if (!/\bin:|label:/.test(q)) q = (q + " in:inbox").trim();
  const l = await gApi(req.user.id, "GET", "/gmail/v1/users/me/messages?" + new URLSearchParams({ q, maxResults: String(max) }).toString());
  const out = [];
  for (const m of (l.messages || []).slice(0, max)) { const d = await gApi(req.user.id, "GET", "/gmail/v1/users/me/messages/" + encodeURIComponent(m.id) + "?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date"); out.push(mailOut(d)); }
  res.json({ mails: out });
});
function mailText(p) {
  if (!p) return "";
  const dec = d => Buffer.from(String(d || ""), "base64url").toString("utf8");
  const walk = (x, mime) => { if (x.mimeType === mime && x.body && x.body.data) return dec(x.body.data); for (const c of x.parts || []) { const r = walk(c, mime); if (r) return r; } return ""; };
  let t = walk(p, "text/plain");
  if (!t) t = walk(p, "text/html").replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  return t.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n");
}
gRoute("mail/read", "gmail.readonly", async (req, res) => {
  const id = String(req.body.id || ""); if (!/^[A-Za-z0-9]{1,40}$/.test(id)) return res.status(400).json({ error: "bad_input" });
  const m = await gApi(req.user.id, "GET", "/gmail/v1/users/me/messages/" + id + "?format=full");
  res.json(Object.assign(mailOut(m), { body: gClip(mailText(m.payload), 4000) }));
});
const noCRLF = s => String(s || "").replace(/[\r\n]+/g, " ").trim();
gRoute("mail/draft", "gmail.compose", async (req, res) => {
  const b = req.body, to = noCRLF(b.to).slice(0, 120), subj = noCRLF(b.subject).slice(0, 200), body = gClip(b.body, 8000);
  if (!okEmail(to) || !body) return res.status(400).json({ error: "bad_input" });
  const raw = ["To: " + to, "Subject: =?UTF-8?B?" + Buffer.from(subj || "(konusuz)", "utf8").toString("base64") + "?=", "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", Buffer.from(body, "utf8").toString("base64")].join("\r\n");
  const j = await gApi(req.user.id, "POST", "/gmail/v1/users/me/drafts", { message: { raw: Buffer.from(raw).toString("base64url") } });
  res.json({ ok: true, id: j.id || "" });
});
// ===== END GOOGLE =====
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

let bkLast = -1, bkBusy = false, bkStatus = BK_ON ? (BK_SAFE ? "bekliyor" : "HATA: geri yükleme başarısız, yedek yükleme kapalı (BACKUP_KEY/erişim anahtarı/depo adını kontrol et)") : "kapalı";
const bkWhy = async r => { let m = ""; try { m = (await r.json()).message || ""; } catch (e) {} const hint = r.status === 401 ? " (erişim anahtarı geçersiz veya süresi dolmuş)" : r.status === 403 ? " (anahtarın bu depoya Contents: Read and write izni yok)" : r.status === 404 ? " (depo adı yanlış, depo özel/erişimsiz veya anahtar bu depoyu kapsamıyor)" : ""; return "GitHub " + r.status + hint + (m ? " - " + String(m).slice(0, 80) : ""); };
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
      if (g.ok) sha = (await g.json()).sha; else if (g.status !== 404) throw new Error(await bkWhy(g));
      const r = await fetch(url, { method: "PUT", headers: H, body: JSON.stringify({ message: "yedek " + new Date().toISOString(), content: blob, ...(sha ? { sha } : {}) }) });
      if (r.ok) { bkLast = n; bkStatus = "ok (" + new Date().toISOString() + ")"; break; }
      if (r.status !== 409 && r.status !== 422) throw new Error(await bkWhy(r));
    }
  } catch (e) { bkStatus = "HATA: " + e.message; console.error("yedek:", e.message); }
  finally { bkBusy = false; }
}

if (require.main === module) {
  if (BK_ON) {
    setTimeout(() => bkRun(true), 4000);
    setInterval(() => bkRun(false), +process.env.BACKUP_INTERVAL_MS || 60000);
    process.on("SIGTERM", async () => { for (let i = 0; i < 50 && bkBusy; i++) await new Promise(r => setTimeout(r, 200)); await bkRun(true); process.exit(0); });
  }
  server.listen(PORT, () => console.log(`Pusula sunucusu :${PORT} · e-posta: ${HAS_MAIL ? "açık" : "kapalı (kodlar günlüğe yazılır)"} · doğrulama: ${REQUIRE_VERIFY ? "açık" : "kapalı"}`));
}
module.exports = { server, db, sigV4Presign };
