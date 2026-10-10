const {spawn}=require("child_process");const fs=require("fs");
const port=3920+Math.floor(Math.random()*50),db="/tmp/pusula-pseo"+process.pid+".db";
const p=spawn("node",["server.js"],{env:{...process.env,PORT:port,DB_PATH:db,REQUIRE_VERIFY:"0"},stdio:"ignore"});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ok=0;const t=(c,m)=>{if(!c){console.error("FAIL",m);p.kill();process.exit(1)}ok++};
(async()=>{await sleep(1500);const B="http://127.0.0.1:"+port;
for(const c of["en","de","es","fr","pt","ru","ar"]){const r=await fetch(B+"/"+c+"/");const h=await r.text();
t(r.status===200&&h.includes('lang="'+c+'"')&&h.includes('hreflang="x-default"')&&h.includes("application/ld+json")&&h.includes('href="/?lang='+c+'"'),"landing "+c);}
t((await(await fetch(B+"/ar/")).text()).includes('dir="rtl"'),"rtl");
const x=await fetch(B+"/sitemap.xml");t(x.status===200&&(x.headers.get("content-type")||"").includes("xml")&&(await x.text()).includes('hreflang="de"'),"sitemap.xml");
t((await(await fetch(B+"/robots.txt")).text()).includes("sitemap.xml"),"robots");
t((await(await fetch(B+"/")).text()).includes('hreflang="ru"'),"index hreflang");
console.log("seo testleri geçti:",ok);p.kill();try{fs.unlinkSync(db)}catch(e){}})();
