// Abonelik testi: node test_billing.js  (Lemon Squeezy imzalı webhook'ları yerelde taklit eder)
const os = require("os"), path = require("path"), crypto = require("crypto"), assert = require("assert");
process.env.DB_PATH = path.join(os.tmpdir(), "pusula-bill-" + process.pid + ".db");
process.env.REQUIRE_VERIFY = "0"; process.env.TRUST_PROXY = "0";
process.env.LS_CHECKOUT_URL = "https://pusula.lemonsqueezy.com/checkout/buy/abc-123"; process.env.LS_WEBHOOK_SECRET = "whsec_test";
process.env.TRIAL_DAYS = "14"; process.env.FREE_MAX_DATA_BYTES = "2000"; process.env.ADMIN_TOKEN = "admin-secret"; process.env.PRO_PRICE_LABEL = "$3/ay";
const { server, db } = require("./server.js");
const ol = console.log; console.log = () => {};
server.listen(0, async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (m, p, b, t, h) => { const r = await fetch(base + p, { method: m, headers: { "Content-Type": "application/json", ...(t ? { Authorization: "Bearer " + t } : {}), ...(h || {}) }, body: b ? (typeof b === "string" ? b : JSON.stringify(b)) : undefined }); let j = {}; try { j = await r.json(); } catch (e) {} return { s: r.status, ...j }; };
  const hook = (body, secret) => { const raw = JSON.stringify(body); return call("POST", "/api/billing/webhook", raw, null, { "X-Signature": crypto.createHmac("sha256", secret || "whsec_test").update(raw).digest("hex") }); };
  const sub = (uid, status, extra) => ({ meta: { event_name: "subscription_updated", custom_data: { user_id: uid } }, data: { type: "subscriptions", id: "77", attributes: { status, user_email: "x@y.co", renews_at: new Date(Date.now() + 30 * 864e5).toISOString(), ends_at: null, updated_at: new Date().toISOString(), urls: { customer_portal: "https://pusula.lemonsqueezy.com/billing?s=1" }, ...extra } } });
  let n = 0; const ok = (c, m) => { assert(c, m); n++; };
  try {
    ok((await call("GET", "/api/health")).billing === true, "health billing");
    let r = await call("POST", "/api/register", { email: "pay@x.co", password: "parola-123", name: "Pay" }); const tok = r.token, uid = r.user.id;
    ok(r.user.plan.state === "trial" && r.user.plan.billing && r.user.plan.price === "$3/ay", "trial on signup");
    const big = { data: { x: "a".repeat(5000) } };
    ok((await call("PUT", "/api/data", big, tok)).ok, "trial allows big data");
    db.prepare("UPDATE users SET created=? WHERE id=?").run(Date.now() - 20 * 864e5, uid);
    r = await call("GET", "/api/me", null, tok); ok(r.user.plan.state === "trial", "old account still in trial: counts from billing start");
    db.prepare("UPDATE meta SET v=? WHERE k='billing_since'").run(String(Date.now() - 20 * 864e5));
    r = await call("GET", "/api/me", null, tok); ok(r.user.plan.state === "free", "free after trial");
    r = await call("PUT", "/api/data", big, tok); ok(r.s === 402 && r.error === "pro_required", "free limit 402");
    ok((await call("PUT", "/api/data", { data: { x: "ok" } }, tok)).ok, "free small ok");
    r = await call("POST", "/api/billing/checkout", {}, tok); ok(r.url && r.url.startsWith("https://pusula.lemonsqueezy.com/checkout/buy/abc-123?") && r.url.includes(encodeURIComponent("checkout[custom][user_id]") ) && r.url.includes(uid) && r.url.includes("pay%40x.co"), "checkout url " + r.url);
    ok((await call("POST", "/api/billing/portal", {}, tok)).s === 404, "no portal yet");
    ok((await hook(sub(uid, "active"), "yanlis")).s === 401, "bad signature");
    ok((await call("POST", "/api/billing/webhook", sub(uid, "active"))).s === 401, "no signature");
    r = await hook(sub(uid, "active")); ok(r.ok, "webhook active");
    r = await call("GET", "/api/me", null, tok); ok(r.user.plan.state === "pro" && r.user.plan.manage && r.user.plan.until > Date.now(), "pro after active");
    ok((await call("PUT", "/api/data", big, tok)).ok, "pro big data");
    ok((await call("POST", "/api/billing/checkout", {}, tok)).s === 409, "already pro");
    ok((await call("POST", "/api/billing/portal", {}, tok)).url.includes("billing"), "portal");
    ok((await call("POST", "/api/delete", { password: "parola-123" }, tok)).error === "cancel_subscription_first", "delete blocked while active");
    // eski olay yok sayılır
    r = await hook(sub(uid, "expired", { updated_at: new Date(Date.now() - 864e5).toISOString() })); ok(r.stale, "stale ignored");
    // iptal: dönem sonuna kadar Pro
    r = await hook(sub(uid, "cancelled", { ends_at: new Date(Date.now() + 5 * 864e5).toISOString(), updated_at: new Date(Date.now() + 1000).toISOString() })); ok(r.ok, "cancelled");
    r = await call("GET", "/api/me", null, tok); ok(r.user.plan.state === "pro" && r.user.plan.cancelling, "pro until period end");
    // süresi doldu
    r = await hook(sub(uid, "expired", { updated_at: new Date(Date.now() + 2000).toISOString() })); ok(r.ok, "expired");
    r = await call("GET", "/api/me", null, tok); ok(r.user.plan.state === "free", "free after expiry");
    // custom_data yoksa doğrulanmış e-postadan eşleşir
    db.prepare("UPDATE users SET verified=1 WHERE id=?").run(uid);
    r = await hook({ meta: { event_name: "subscription_created" }, data: { type: "subscriptions", id: "78", attributes: { status: "active", user_email: "PAY@x.co", updated_at: new Date(Date.now() + 3000).toISOString(), urls: {} } } }); ok(r.ok && !r.unknown, "email fallback");
    ok((await call("GET", "/api/me", null, tok)).user.plan.state === "pro", "pro via email match");
    r = await hook({ meta: {}, data: { type: "subscription-invoices", id: "1", attributes: {} } }); ok(r.ignored, "invoice ignored");
    r = await hook(sub("uyok", "active", { user_email: "nobody@x.co" })); ok(r.unknown, "unknown user acked");
    // yönetici ile elle Pro
    db.prepare("DELETE FROM plans WHERE user_id=?").run(uid);
    ok((await call("POST", "/api/admin/plan", { email: "pay@x.co", days: 30 })).s === 401, "admin needs token");
    r = await call("POST", "/api/admin/plan", { email: "pay@x.co", days: 30 }, null, { "X-Admin-Token": "admin-secret" }); ok(r.plan.state === "pro", "admin grant");
    r = await call("POST", "/api/admin/plan", { email: "pay@x.co", days: 0 }, null, { "X-Admin-Token": "admin-secret" }); ok(r.plan.state === "free", "admin revoke");
    ol(`TAMAM: ${n} abonelik kontrolü geçti`);
  } catch (e) { ol("HATA:", e.stack.split("\n").slice(0, 3).join(" | ")); process.exitCode = 1; }
  server.close(); setTimeout(() => process.exit(), 200);
});
