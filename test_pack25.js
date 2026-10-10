// Paket 25: 8 dilde e-posta + herkese açık gönderi sayfası /p/<id>. node test_pack25.js
const http = require("http"), assert = require("assert"), path = require("path"), os = require("os");
const mails = [];
const up = http.createServer((req, res) => { let b = ""; req.on("data", c => b += c); req.on("end", () => { mails.push(JSON.parse(b)); res.setHeader("content-type", "application/json"); res.end("{}"); }); });
up.listen(0, () => {
  process.env.DB_PATH = path.join(os.tmpdir(), "pusula-p25-" + process.pid + ".db"); process.env.TRUST_PROXY = "1"; process.env.REQUIRE_VERIFY = "0"; process.env.MEDIA_PROXY = "0";
  process.env.BREVO_API_KEY = "BK"; process.env.BREVO_API_URL = "http://127.0.0.1:" + up.address().port + "/v3/smtp/email"; process.env.MAIL_FROM = "Pusula <d@example.com>";
  let n = 0; const ok = (c, m) => { assert(c, m); n++; };
  const { server } = require("./server.js");
  server.listen(0, async () => {
    const base = "http://127.0.0.1:" + server.address().port;
    let xf = 0; const call = async (p, b, tok, hdr) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json", "X-Forwarded-For": "10.1.0." + (++xf) }, tok ? { Authorization: "Bearer " + tok } : {}, hdr || {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
    const so = (p, b, t) => call("/api/social/" + p, b, t);
    try {
      const reg = async (e, h) => { const t = (await call("/api/register", { email: e, password: "parola-123", name: h })).token; await so("profile", { handle: h }, t); return t; };
      const A = await reg("a@x.com", "aaa");
      // e-posta dilleri
      const exp = { de: "Passworts", es: "contraseña", fr: "mot de passe", pt: "senha", ru: "пароля", ar: "كلمة مرور", en: "password reset", tr: "parola sıfırlama" };
      let k = 0; for (const [l, w] of Object.entries(exp)) {
        const em = "m" + (k++) + "@x.com"; await reg(em, "mm" + k);
        mails.length = 0; await call("/api/forgot", { email: em, lang: l }); await new Promise(z => setTimeout(z, 250));
        ok(mails.length === 1 && mails[0].subject.toLowerCase().includes(w.toLowerCase()) && /\d{6}/.test(mails[0].textContent), "mail " + l);
      }
      mails.length = 0; await reg("d@x.com", "ddd"); await call("/api/forgot", { email: "d@x.com" }, null, { "Accept-Language": "de-DE,de;q=0.9" }); await new Promise(z => setTimeout(z, 250));
      ok(mails.length === 1 && mails[0].subject.includes("Passworts"), "accept-language de");
      mails.length = 0; await reg("j@x.com", "jjj"); mails.length = 0; await call("/api/forgot", { email: "j@x.com" }, null, { "Accept-Language": "it-IT" }); await new Promise(z => setTimeout(z, 250));
      ok(mails.length === 1 && mails[0].subject.includes("password reset"), "unknown lang -> en");
      for (const [lg, em, word] of [["ja-JP", "j2@x.com", "パスワード"], ["az-AZ", "a2@x.com", "parol"], ["id-ID", "i2@x.com", "kata sandi"]]) {
        await reg(em, lg.replace("-", "_")); mails.length = 0; await call("/api/forgot", { email: em }, null, { "Accept-Language": lg }); await new Promise(z => setTimeout(z, 250));
        ok(mails.length === 1 && mails[0].subject.includes(word), "mail dili " + lg);
      }
      // gönderi sayfası
      const id = (await so("post", { kind: "text", text: 'Merhaba <script>alert(1)</script> "dünya"' }, A)).id;
      let r = await fetch(base + "/p/" + id, { headers: { "Accept-Language": "fr" } }); let h = await r.text();
      ok(r.status === 200 && h.includes('og:title" content="@aaa sur Pusula Medya"') && !h.includes("<script>alert(1)") && h.includes("&lt;script&gt;") && h.includes('lang="fr"'), "post page + escaped");
      r = await fetch(base + "/p/nope-nope"); ok(r.status === 404 && (await r.text()).includes("noindex"), "unknown 404");
      const priv = 0;
      const pr = await so("profile", { handle: "aaa", private: true }, A);
      r = await fetch(base + "/p/" + id); ok(r.status === 404 || priv === 404, "private profile hidden");
      console.log("paket 25 testleri geçti:", n); server.close(); up.close(); process.exit(0);
    } catch (e) { console.error("FAIL", e.message); process.exit(1); }
  });
});
