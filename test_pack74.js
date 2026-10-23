// Paket 74: istemci özellikleri (Son gezdiklerim, Birikim, Başabaş)
const assert = require("assert"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8"); let n = 0;
["soRecSheet", "soRecAdd", "data-recl", "bzSavings", "bzBreakeven", "bzBeCalc", "sgsave", "sgadd", "sgtake", "besave", "o.sgs=", "o.be="].forEach(k => { assert(html.includes(k), "client has " + k); n++; });
console.log("pack74 testleri geçti:", n);
