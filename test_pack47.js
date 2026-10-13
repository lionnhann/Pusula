// Paket 47: Google Play aboneliği (Pusula Pro). Google API'si yerelde taklit edilir.
const assert = require("assert"), path = require("path"), http = require("http"), crypto = require("crypto");
process.env.DB_PATH = path.join(require("os").tmpdir(), "pusula-p47-" + process.pid + "-" + Date.now() + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0";
process.env.ADMIN_TOKEN = "admin-secret"; process.env.PLAY_RTDN_KEY = "rtdn-secret"; process.env.PLAY_PRODUCT_ID = "pusula_pro";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.PLAY_SERVICE_ACCOUNT = Buffer.from(JSON.stringify({ client_email: "svc@pusula.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) })).toString("base64");
// --- sahte Google ---
const G = { state: "SUBSCRIPTION_STATE_ACTIVE", expiry: new Date(Date.now() + 30 * 864e5).toISOString(), sku: "pusula_pro", acct: "", ack: "ACKNOWLEDGEMENT_STATE_PENDING", acked: [], gets: 0, tokens: 0, jwtOk: true, invalid: false, down: false };
const mock = http.createServer((req, res) => {
  let b = ""; req.on("data", c => b += c); req.on("end", () => {
    const send = (c, o) => { res.writeHead(c, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (req.url === "/token") {
      G.tokens++; const a = new URLSearchParams(b).get("assertion") || "", [h, p, sg] = a.split(".");
      const pub = crypto.createPublicKey(privateKey); G.jwtOk = crypto.createVerify("RSA-SHA256").update(h + "." + p).verify(pub, Buffer.from(sg || "", "base64url")) && JSON.parse(Buffer.from(p, "base64url")).iss === "svc@pusula.iam.gserviceaccount.com";
      return G.jwtOk ? send(200, { access_token: "at-1", expires_in: 3600 }) : send(401, {});
    }
    if (req.headers.authorization !== "Bearer at-1") return send(401, {});
    let m;
    if ((m = req.url.match(/\/purchases\/subscriptionsv2\/tokens\/([^/?]+)$/)) && req.method === "GET") {
      G.gets++; if (G.down) return send(500, {}); if (G.invalid) return send(404, {});
      const o = { subscriptionState: G.state, acknowledgementState: G.ack, lineItems: [{ productId: G.sku, expiryTime: G.expiry }] };
      if (G.acct) o.externalAccountIdentifiers = { obfuscatedExternalAccountId: G.acct };
      return send(200, o);
    }
    if ((m = req.url.match(/\/purchases\/subscriptions\/([^/]+)\/tokens\/([^/:]+):acknowledge$/)) && req.method === "POST") { G.acked.push(m[1] + "|" + m[2]); G.ack = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED"; return send(200, {}); }
    send(404, {});
  });
});
mock.listen(0, () => {
  const mp = mock.address().port;
  process.env.PLAY_API_BASE = "http://127.0.0.1:" + mp + "/androidpublisher/v3"; process.env.PLAY_TOKEN_URL = "http://127.0.0.1:" + mp + "/token";
  const { server, db, playSyncAll } = require("./server.js"); const ol = console.log; console.log = () => {};
  server.listen(0, async () => {
    const base = "http://127.0.0.1:" + server.address().port;
    const call = async (m, p, b, t) => { const r = await fetch(base + p, { method: m, headers: { "Content-Type": "application/json", ...(t ? { Authorization: "Bearer " + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); let j = {}; try { j = await r.json(); } catch (e) {} return { s: r.status, ...j }; };
    const TK = x => "tok_" + x + "_abcdefghijklmnopqrstuvwxyz0123456789";
    try {
      ok((await call("GET", "/api/health")).billing === true, "health billing on with Play only");
      let r = await call("POST", "/api/register", { email: "a@x.co", password: "parola-123", name: "A" }); const ta = r.token, ua = r.user.id;
      ok(r.user.plan.state === "trial" && r.user.plan.play && r.user.plan.play.sku === "pusula_pro" && r.user.plan.play.pkg === "com.emirhan.pusula" && r.user.plan.play.acct.length === 32, "plan.play exposed " + JSON.stringify(r.user.plan));
      ok(r.user.plan.web === false && r.user.plan.ai.max === 40 && r.user.plan.ai.used === 0 && r.user.plan.ai.pro === 200 && r.user.plan.ai.free === 15, "ai info on trial");
      ok((await call("POST", "/api/billing/checkout", {}, ta)).error === "billing_off", "LS checkout off");
      ok((await call("POST", "/api/billing/webhook", {})).s === 404, "LS webhook off");
      db.prepare("UPDATE users SET created=? WHERE id=?").run(Date.now() - 30 * 864e5, ua); db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('billing_since',?)").run(String(Date.now() - 30 * 864e5));
      r = await call("GET", "/api/me", null, ta); ok(r.user.plan.state === "free" && r.user.plan.ai.max === 15, "free after trial: 15 AI/day");
      ok((await call("POST", "/api/billing/play", {}, ta)).s === 400, "no token");
      ok((await call("POST", "/api/billing/play", { token: "kisa" }, ta)).s === 400, "short token");
      ok((await call("POST", "/api/billing/play", { token: "a/b?c=d&e=f_____________" }, ta)).s === 400, "token charset");
      ok((await call("POST", "/api/billing/play", { token: TK(1) })).s === 401, "needs login");
      // yanlış ürün
      G.sku = "baska_urun"; r = await call("POST", "/api/billing/play", { token: TK(1) }, ta); ok(r.s === 400 && r.error === "wrong_product", "wrong product");
      G.sku = "pusula_pro";
      // başka hesaba ait satın alma
      G.acct = "x".repeat(32); r = await call("POST", "/api/billing/play", { token: TK(1) }, ta); ok(r.s === 409 && r.error === "wrong_account", "wrong account");
      // geçersiz jeton
      G.acct = ua ? (await call("GET", "/api/me", null, ta)).user.plan.play.acct : ""; G.invalid = true;
      r = await call("POST", "/api/billing/play", { token: TK(1) }, ta); ok(r.s === 400 && r.error === "invalid_purchase", "invalid token");
      G.invalid = false; G.down = true; r = await call("POST", "/api/billing/play", { token: TK(1) }, ta); ok(r.s === 502 && r.error === "play_unavailable", "google down -> 502");
      G.down = false;
      // beklemede (ödeme tamamlanmadı)
      G.state = "SUBSCRIPTION_STATE_PENDING"; r = await call("POST", "/api/billing/play", { token: TK(1) }, ta); ok(r.ok && r.pending && r.user.plan.state === "free", "pending does not grant");
      // başarılı satın alma
      G.state = "SUBSCRIPTION_STATE_ACTIVE";
      r = await call("POST", "/api/billing/play", { token: TK(1) }, ta);
      ok(r.ok && r.user.plan.state === "pro" && r.user.plan.src === "play" && r.user.plan.manage && r.user.plan.until > Date.now() + 25 * 864e5 && r.user.plan.ai.max === 200, "pro after purchase " + JSON.stringify(r));
      ok(G.jwtOk && G.acked.length === 1 && G.acked[0] === "pusula_pro|" + TK(1), "JWT signed correctly + acknowledged once " + G.acked);
      ok((await call("GET", "/api/me", null, ta)).user.plan.state === "pro", "pro persists");
      // aynı jeton başka hesapta
      r = await call("POST", "/api/register", { email: "b@x.co", password: "parola-123", name: "B" }); const tb = r.token;
      G.acct = ""; r = await call("POST", "/api/billing/play", { token: TK(1) }, tb); ok(r.s === 409 && r.error === "token_used", "token cannot be shared");
      // hesap silme: aktif Play aboneliği varken engellenir
      r = await call("POST", "/api/delete", { password: "parola-123" }, ta); ok(r.error === "cancel_subscription_first", "delete blocked while subscribed");
      // iptal (süre sonuna kadar Pro)
      G.state = "SUBSCRIPTION_STATE_CANCELED"; r = await call("POST", "/api/billing/play", { token: TK(1) }, ta); ok(r.user.plan.state === "pro" && r.user.plan.cancelling, "cancelled keeps pro until expiry");
      // RTDN
      const rt = (key, ev) => fetch(base + "/api/billing/play-rtdn" + (key === null ? "" : "?key=" + key), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: { data: Buffer.from(JSON.stringify(ev)).toString("base64") } }) }).then(async x => ({ s: x.status, ...(await x.json().catch(() => ({}))) }));
      ok((await rt("yanlis", {})).s === 401 && (await rt(null, {})).s === 401, "rtdn key required");
      ok((await rt("rtdn-secret", { packageName: "com.baska", subscriptionNotification: { purchaseToken: TK(1) } })).ignored, "rtdn other package ignored");
      ok((await rt("rtdn-secret", { packageName: "com.emirhan.pusula", subscriptionNotification: { purchaseToken: TK(99) } })).unknown, "rtdn unknown token acked");
      G.state = "SUBSCRIPTION_STATE_EXPIRED"; G.expiry = new Date(Date.now() - 864e5).toISOString();
      ok((await rt("rtdn-secret", { packageName: "com.emirhan.pusula", subscriptionNotification: { purchaseToken: TK(1) } })).ok, "rtdn expired");
      r = await call("GET", "/api/me", null, ta); ok(r.user.plan.state === "free" && !r.user.plan.manage, "free after expiry");
      // yenileme: RTDN ile tekrar etkin
      G.state = "SUBSCRIPTION_STATE_ACTIVE"; G.expiry = new Date(Date.now() + 30 * 864e5).toISOString();
      ok((await rt("rtdn-secret", { packageName: "com.emirhan.pusula", subscriptionNotification: { purchaseToken: TK(1) } })).ok, "rtdn renewed");
      ok((await call("GET", "/api/me", null, ta)).user.plan.state === "pro", "pro again after renewal");
      // periyodik senkron: süresi yaklaşan abonelik tazelenir
      db.prepare("UPDATE plans SET ends=? WHERE user_id=?").run(Date.now() + 3600e3, ua); G.gets = 0;
      ok((await playSyncAll()) === 1 && G.gets === 1, "sync refreshes expiring sub");
      r = await call("GET", "/api/me", null, ta); ok(r.user.plan.until > Date.now() + 25 * 864e5, "sync extended period");
      db.prepare("UPDATE plans SET ends=? WHERE user_id=?").run(Date.now() + 20 * 864e5, ua); G.gets = 0;
      ok((await playSyncAll()) === 0 && G.gets === 0, "sync skips far-off expiry");
      // süre bitti ve Google'a ulaşılamıyor → erişim kapanır (ends geçmiş)
      db.prepare("UPDATE plans SET ends=? WHERE user_id=?").run(Date.now() - 1000, ua);
      ok((await call("GET", "/api/me", null, ta)).user.plan.state === "free", "expired locally without sync -> free (no free ride)");
      // yönetici elle Pro verme hâlâ çalışır
      const adm = await fetch(base + "/api/admin/plan", { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": "admin-secret" }, body: JSON.stringify({ email: "b@x.co", days: 30 }) }).then(x => x.json());
      ok(adm.ok && adm.plan.state === "pro", "admin grant still works");
      ok((await call("POST", "/api/billing/play", { token: TK(7) }, tb)).s !== 500, "play call over manual plan does not crash");
      console.log = ol; console.log("pack47 testleri geçti:", n); server.close(); mock.close(); process.exit(0);
    } catch (e) { console.log = ol; console.error("HATA", e); process.exit(1); }
  });
});
