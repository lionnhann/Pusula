// Yedekten geri yükleme: önce sunucuyu durdur!
// Kullanım: node geri-yukle.js data/backups/pusula-20261101-1200.db
const fs = require("fs"), path = require("path");
const src = process.argv[2], DB = process.env.DB_PATH || path.join(__dirname, "data", "pusula.db");
if (!src || !fs.existsSync(src)) { console.error("Kullanım: node geri-yukle.js <yedek-dosyası.db>\nMevcut yedekler:", fs.existsSync(path.join(path.dirname(DB), "backups")) ? fs.readdirSync(path.join(path.dirname(DB), "backups")).join(", ") : "(yok)"); process.exit(1); }
if (fs.existsSync(DB)) { const old = DB + ".onceki-" + Date.now(); fs.copyFileSync(DB, old); console.log("Mevcut veritabanı saklandı:", old); }
for (const x of ["-wal", "-shm"]) { try { fs.unlinkSync(DB + x); } catch (e) { /* yok */ } }
fs.mkdirSync(path.dirname(DB), { recursive: true });
fs.copyFileSync(src, DB);
console.log("Geri yüklendi:", DB, "— şimdi sunucuyu başlat.");
