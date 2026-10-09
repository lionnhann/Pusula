// Sosyal özellikler testi: profil, paylaşım, takip, akış, beğeni, yorum, mesaj, engel, şikâyet, yükleme imzası. node test_social.js
const assert = require("assert");
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "pusula-soc-" + process.pid + ".db");
process.env.TRUST_PROXY = "0"; process.env.REQUIRE_VERIFY = "0"; process.env.ADMIN_TOKEN = "adm-secret";
process.env.R2_ACCOUNT_ID = "acct123"; process.env.R2_ACCESS_KEY_ID = "AKTEST"; process.env.R2_SECRET_ACCESS_KEY = "SECRETTEST"; process.env.R2_BUCKET = "pusula-media"; process.env.R2_PUBLIC_URL = "https://pub.example.dev";
const { server, sigV4Presign } = require("./server.js");
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
// AWS belgelerindeki resmi örnek (presigned GET): imza birebir eşleşmeli
const v = sigV4Presign({ method: "GET", host: "examplebucket.s3.amazonaws.com", pathName: "/test.txt", keyId: "AKIAIOSFODNN7EXAMPLE", secret: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", region: "us-east-1", service: "s3", date: "2013-05-24T00:00:00Z", expires: 86400 });
ok(v.signature === "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404", "sigv4 matches AWS reference vector");
server.listen(0, async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (p, b, tok, hdr) => { const r = await fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}, hdr || {}), body: JSON.stringify(b || {}) }); const j = await r.json().catch(() => ({})); j.s = r.status; return j; };
  try {
    const reg = async (e, nm) => (await call("/api/register", { email: e, password: "parola-123", name: nm })).token;
    const A = await reg("a@x.com", "Ali"), B = await reg("b@x.com", "Bora"), C = await reg("c@x.com", "Can");
    let r = await call("/api/social/me", {}, A); ok(r.s === 200 && r.profile === null && r.storage === true, "no profile yet, storage on");
    r = await call("/api/social/feed", { mode: "all" }, A); ok(r.s === 409 && r.error === "no_profile", "feed needs profile");
    r = await call("/api/social/profile", { handle: "a!" }, A); ok(r.s === 400, "bad handle");
    r = await call("/api/social/profile", { handle: "ali", bio: "merhaba <b>" }, A); ok(r.s === 200 && r.profile.handle === "ali", "create profile");
    r = await call("/api/social/profile", { handle: "ALI" }, B); ok(r.s === 409, "handle unique (case-insensitive)");
    await call("/api/social/profile", { handle: "bora" }, B); await call("/api/social/profile", { handle: "can_x" }, C);
    // paylaşım
    r = await call("/api/social/post", { kind: "text", text: "ilk gönderi" }, A); ok(r.s === 200 && r.id, "text post");
    const pid = r.id;
    r = await call("/api/social/post", { kind: "photo", media: "m/baska/x.jpg" }, A); ok(r.s === 400, "foreign media key rejected");
    r = await call("/api/social/upload", { type: "image/jpeg", size: 100000 }, A); ok(r.s === 200 && /^m\/u[0-9a-f]+\/[0-9a-f]+\.jpg$/.test(r.key) && r.url.includes("acct123.r2.cloudflarestorage.com/pusula-media/") && r.url.includes("X-Amz-Signature="), "presigned upload url");
    const key = r.key;
    r = await call("/api/social/upload", { type: "application/x-sh", size: 10 }, A); ok(r.s === 400, "bad type");
    r = await call("/api/social/upload", { type: "video/mp4", size: 999999999 }, A); ok(r.s === 413, "too large video");
    r = await call("/api/social/post", { kind: "photo", text: "foto", media: key }, A); ok(r.s === 200, "photo post with own key");
    r = await call("/api/social/upload", { type: "video/mp4", size: 5e6 }, A); const vkey = r.key;
    r = await call("/api/social/post", { kind: "reel", text: "reel", media: vkey }, A); ok(r.s === 200, "reel post");
    r = await call("/api/social/post", { kind: "reel", media: key }, A); ok(r.s === 400, "reel with image key rejected");
    // akış
    r = await call("/api/social/feed", { mode: "following" }, B); ok(r.posts.length === 0, "following feed empty before follow");
    r = await call("/api/social/follow", { handle: "ali", on: true }, B); ok(r.s === 200 && r.followers === 1, "follow");
    r = await call("/api/social/feed", { mode: "following" }, B); ok(r.posts.length === 3 && r.posts[0].handle === "ali", "following feed shows posts");
    ok(r.posts.some(p => p.media === "https://pub.example.dev/" + key), "media url built from R2_PUBLIC_URL");
    r = await call("/api/social/feed", { mode: "reels" }, B); ok(r.posts.length === 1 && r.posts[0].kind === "reel", "reels feed");
    // beğeni/yorum
    r = await call("/api/social/like", { id: pid, on: true }, B); ok(r.likes === 1, "like");
    r = await call("/api/social/like", { id: pid, on: true }, B); ok(r.likes === 1, "like idempotent");
    r = await call("/api/social/comment", { id: pid, text: "güzel" }, B); ok(r.s === 200, "comment");
    r = await call("/api/social/comments", { id: pid }, A); ok(r.comments.length === 1 && r.comments[0].handle === "bora" && r.comments[0].own === true, "owner sees comment as deletable");
    const cid = r.comments[0].id;
    r = await call("/api/social/feed", { mode: "all" }, B); const pp = r.posts.find(p => p.id === pid); ok(pp.liked && pp.likes === 1 && pp.comments === 1 && !pp.own, "counts and liked flag");
    r = await call("/api/social/delcomment", { id: cid }, C); ok(r.s === 404, "stranger cannot delete comment");
    r = await call("/api/social/delcomment", { id: cid }, A); ok(r.s === 200, "post owner deletes comment");
    // profil
    r = await call("/api/social/user", { handle: "ali" }, B); ok(r.followers === 1 && r.posts === 3 && r.isFollowing && !r.self, "profile stats");
    r = await call("/api/social/search", { q: "al" }, B); ok(r.users.length === 1 && r.users[0].handle === "ali", "search");
    // mesaj
    r = await call("/api/social/send", { handle: "ali", text: "selam" }, B); ok(r.s === 200, "send message");
    r = await call("/api/social/send", { handle: "bora", text: "<img src=x onerror=1>" }, A); ok(r.s === 200, "reply");
    r = await call("/api/social/inbox", {}, A); ok(r.chats.length === 1 && r.chats[0].handle === "bora", "inbox");
    r = await call("/api/social/thread", { handle: "bora" }, A); ok(r.msgs.length === 2 && r.msgs[0].text === "selam" && r.msgs[0].mine === false, "thread order and sides");
    r = await call("/api/social/inbox", {}, B); ok(r.chats[0].unread === 1, "unread count for recipient");
    r = await call("/api/social/thread", { handle: "ali" }, B); r = await call("/api/social/inbox", {}, B); ok(r.chats[0].unread === 0, "read after opening thread");
    r = await call("/api/social/send", { handle: "ali", media: "m/baska/x.jpg" }, B); ok(r.s === 400, "foreign media in dm rejected");
    r = await call("/api/social/send", { handle: "bora", text: "kendime" }, B); ok(r.s === 404, "cannot message self");
    // engel
    r = await call("/api/social/block", { handle: "bora", on: true }, A); ok(r.s === 200, "block");
    r = await call("/api/social/send", { handle: "ali", text: "hey" }, B); ok(r.s === 404, "blocked user cannot message");
    r = await call("/api/social/feed", { mode: "all" }, B); ok(!r.posts.some(p => p.handle === "ali"), "blocked author hidden from blocked user's feed");
    r = await call("/api/social/feed", { mode: "all" }, A); ok(!r.posts.some(p => p.handle === "bora"), "and vice versa");
    r = await call("/api/social/like", { id: pid, on: true }, B); ok(r.s === 404, "cannot like blocked user's post");
    r = await call("/api/social/inbox", {}, A); ok(r.chats.length === 0, "blocked chat hidden in inbox");
    await call("/api/social/block", { handle: "bora", on: false }, A);
    // şikâyet + yönetici
    r = await call("/api/social/report", { kind: "post", target: pid, reason: "spam" }, C); ok(r.s === 200, "report");
    r = await call("/api/admin/reports", {}, null, { "x-admin-token": "yanlis" }); ok(r.s === 401, "admin wrong token");
    r = await call("/api/admin/reports", {}, null, { "x-admin-token": "adm-secret" }); ok(r.reports.length === 1 && r.reports[0].target === pid, "admin sees reports");
    r = await call("/api/admin/remove", { post: pid, ban: "bora", reason: "test" }, null, { "x-admin-token": "adm-secret" }); ok(r.ok, "admin removes post and bans");
    r = await call("/api/social/feed", { mode: "all" }, C); ok(!r.posts.some(p => p.id === pid), "removed post gone");
    r = await call("/api/social/post", { kind: "text", text: "yasaklı" }, B); ok(r.s === 403 && r.error === "banned", "banned user cannot post");
    r = await call("/api/social/user", { handle: "bora" }, C); ok(r.s === 404, "banned profile hidden");
    // silme
    r = await call("/api/social/delete", { id: pid }, C); ok(r.s === 404, "cannot delete foreign post (or already gone)");
    r = await call("/api/social/post", { kind: "text", text: "silinecek" }, C); const did = r.id;
    r = await call("/api/social/delete", { id: did }, C); ok(r.s === 200, "delete own post");
    // hesap silinince sosyal veriler gider
    r = await call("/api/delete", { password: "parola-123" }, C); ok(r.s === 200, "delete account");
    console.log("sosyal testler geçti:", n); server.close(); process.exit(0);
  } catch (e) { console.error("FAIL", e.message, e.stack.split("\n")[1]); process.exit(1); }
});
