// Paket 40: fotoğraf efektleri, ayarlar, portre, kamera (istemci statik kontrol)
const assert = require("assert"), fs = require("fs"), path = require("path"); let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const pub = fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public") : path.join(__dirname, "../si");
const html = fs.readFileSync(path.join(pub, "index.html"), "utf8");
["function sgDraw", "data-sga", "function sgInit", "function soStFilt", "data-sgf", "function phAdj", "const PHADJ", 'filter==="sepia"', 'filter==="noir"', 'id="ph-cam"', "data-phar", "data-phall", "capture=\"environment\"", "createRadialGradient"].forEach(k => ok(html.includes(k), k));
const keys = ["Sepia","Noir","Vintage","Dramatic","Matte","Sunset","Pastel","Adjustments","Brightness","Contrast","Saturation","Warmth","Vignette","Portrait (background blur)","Reset","Apply to all photos","Applied to all photos","Take a photo"];
for (const lg of ["de","es","fr","pt","ru","ar","az","id","ja"]) { const pk = JSON.parse(fs.readFileSync(path.join(pub, "lang", lg + ".json"), "utf8")); keys.forEach(k => ok(pk[k], lg + " " + k)); }
console.log("pack40 testleri geçti:", n);
