// Pusula servis çalışanı: önce önbellek (anında açılış), arka planda güncelleme.
// Yalnızca kendi dosyalarını önbelleğe alır; yapay zekâ sağlayıcılarına giden istekler asla önbelleğe alınmaz.
const CACHE = "pusula-v271";
const CORE = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "icon-maskable-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== self.location.origin || u.pathname.startsWith("/api/") || u.pathname.startsWith("/media") || u.pathname === "/admin.html" || /^\/(en|de|es|fr|pt|ru|ar|az|id|ja)\/?$/.test(u.pathname) || /^\/(en|de|es|fr|pt|ru|ar|az|id|ja)\/(privacy|rules|delete-account)\.html$/.test(u.pathname) || /^\/(gizlilik|kurallar|hesap-sil|privacy|rules|delete-account)\.html$/.test(u.pathname)) return; // yasal sayfalar her zaman sunucudan gelir
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request);
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }          // önbellekte varsa hemen ver, arkada tazele
    return (await net) || (await c.match("index.html")) || new Response("Çevrimdışı", { status: 503 });
  }));
});
self.addEventListener("push", e => {
  let d = {}; try { d = e.data.json(); } catch (x) { /* düz metin */ }
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(l => {
    if (l.some(c => c.visibilityState === "visible" && c.focused) && d.k !== "call") return;   // uygulama önündeyse ayrıca bildirim gösterme
    return self.registration.showNotification(d.t || "Pusula", { body: d.b || "", tag: d.tag || "pusula", renotify: true, icon: "icon-192.png", badge: "icon-192.png", data: { k: d.k || "" }, requireInteraction: d.k === "call" });
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const k = (e.notification.data && e.notification.data.k) || "";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(l => {
    if (l.length) { l[0].postMessage({ pusulaPush: k }); return l[0].focus(); }
    return self.clients.openWindow("./" + (k ? "#push=" + k : ""));
  }));
});
