// Testler için: sahte (ama biçimi doğru) uçtan uca zarflar ve anahtar kaydı
const crypto = require("crypto");
module.exports = function (call) {
  const fps = new Map(), hand = new Map(), rb = n => crypto.randomBytes(n).toString("base64url");
  return {
    async key(tok, handle) { const e = crypto.createECDH("prime256v1"); e.generateKeys(); const r = await call("/api/social/e2e_set", { pub: e.getPublicKey().toString("base64url") }, tok); fps.set(tok, r.fp); if (handle) hand.set(handle, r.fp); return r.fp; },
    fp: tok => fps.get(tok), hfp: h => hand.get(h),
    env: (fromTok, toHandle) => "e2e1:" + fps.get(fromTok) + "." + hand.get(toHandle) + ":" + rb(40),
    genv: ep => "e2e1:g" + ep + ":" + rb(40),
    wrap: () => rb(60),
    async gkeys(creatorTok, gid, members /* [{tok,handle}] */, epoch) { return call("/api/social/gkeys_put", { id: gid, epoch: epoch || 1, items: members.map(m => ({ handle: m.handle, wrapped: rb(60), to_fp: fps.get(m.tok) })) }, creatorTok); },
  };
};
