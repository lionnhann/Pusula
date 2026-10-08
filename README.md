# Pusula sunucusu

Gerçek hesap sistemi: e-posta + parola ile kayıt, e-posta doğrulama kodu, giriş, parola sıfırlama, parola değiştirme, hesap silme ve verinin cihazlar arası eşitlenmesi. Tek dosya (`server.js`), **sıfır bağımlılık** (Node 22.5+, yerleşik SQLite). Aynı sunucu uygulamanın kendisini de (`public/`) sunar; yani tek adres yeter.

## Hızlı başlangıç (kendi bilgisayarında)
```
node server.js        # http://localhost:3000
node test.js          # 33 uçtan uca kontrol
node test_billing.js  # 28 abonelik kontrolü
```
E-posta ayarlamazsan doğrulama kapalıdır ve kodlar konsola yazılır (deneme için uygun).

## İnternete açmak
1. Bu klasörü bir GitHub deposuna yükle.
2. Render / Railway / Fly.io / herhangi bir Docker barındırıcısında "Dockerfile'dan dağıt" de.
3. **Kalıcı disk** bağla ve `DB_PATH=/data/pusula.db` ver (disk yoksa veritabanı her dağıtımda silinir).
4. HTTPS barındırıcı tarafından sağlanır; uygulamayı `https://adresin` üzerinden aç.
5. E-posta için ortam değişkeni ekle: `RESEND_API_KEY` + `MAIL_FROM` (alan adını Resend'de doğrulaman gerekir) **veya** `SMTP_URL=smtps://kullanici:parola@smtp.sunucu.com:465`. Ayarlayınca kayıtta e-posta doğrulaması otomatik açılır.

## Mağaza / ayrı barındırılan sürümler
`Pusula-store` içindeki `www/config.js` dosyasına `serverUrl: "https://adresin"` ekle (aşağıya bak). Ayrı barındırılan web sürümünde `index.html` içinde `window.PUSULA_CONFIG={serverUrl:"https://adresin"}` tanımla ve sunucuda `ALLOWED_ORIGINS=https://web-adresin` ver. `serverUrl` boşsa uygulama eskisi gibi yalnızca-cihaz hesaplarıyla çalışır.

## Aylık abonelik (Pro)
Ödeme **Lemon Squeezy** üzerinden alınır; sunucu yalnızca webhook ile abonelik durumunu öğrenir, kart bilgisi hiç sunucuna gelmez. İkisi de boşsa ödeme tamamen kapalıdır ve herkes Pro gibi davranır.

1. lemonsqueezy.com'da mağaza aç, **abonelik (aylık)** türünde bir ürün oluştur, ödeme bağlantısını kopyala (`https://.../checkout/buy/...`).
2. Settings → Webhooks: adres `https://SUNUCUN/api/billing/webhook`, bir gizli anahtar (secret) yaz, **subscription_** ile başlayan tüm olayları seç.
3. Sunucuya ortam değişkenlerini ekle: `LS_CHECKOUT_URL` (1. adımdaki bağlantı), `LS_WEBHOOK_SECRET` (2. adımdaki anahtar), isteğe bağlı `PRO_PRICE_LABEL` (ör. `$3/ay`).
4. Önce Lemon Squeezy **test modunda** dene (test kartıyla), sonra canlıya geç.

**Plan mantığı:** herkes `TRIAL_DAYS` (varsayılan 14) gün Pro deneme alır. Süre, hesabın açıldığı günden ya da **ödemenin ilk açıldığı günden** (hangisi daha geçse) başlar; yani ödemeyi sonradan açtığında eski kullanıcılar da 14 günlük denemeyle başlar, bir anda ücretsize düşmez. Sonrasında abone değilse "Ücretsiz" olur: uygulama yine tamamen çalışır, ama bulut eşitleme `FREE_MAX_DATA_BYTES` (varsayılan 100 KB) ile sınırlanır; sınır aşılınca veri bu cihazda kalır ve Pro'ya geçince eşitlenir. İptal edilen abonelik dönem sonuna kadar Pro kalır. Aktif abonelikle hesap silinemez (önce iptal edilmeli).

**Elle Pro verme** (havale/IBAN vb.): `ADMIN_TOKEN` tanımla, sonra
`curl -X POST https://SUNUCUN/api/admin/plan -H "X-Admin-Token: ..." -H "Content-Type: application/json" -d '{"email":"kisi@ornek.com","days":30}'` (`days:0` kaldırır).

**Dürüst notlar**
- Lemon Squeezy ödemeleri **USD** olarak banka/PayPal'a yatırır (asgari 50 $, bekleme süresi var). **Türkiye'nin desteklenen ülkeler listesinde olup olmadığını** Lemon Squeezy'nin "Supported countries" sayfasından kendin doğrula; olmazsa başka bir sağlayıcı (ör. iyzico abonelik) için `server.js`'teki webhook işleyicisi uyarlanabilir, `/api/admin/plan` ise her durumda elle çalışır.
- Bu entegrasyon gerçek Lemon Squeezy hesabıyla denenmedi; imzalı webhook'lar yerelde taklit edilerek test edildi (`node test_billing.js`). Canlıya almadan test modunda uçtan uca dene.
- **Apple/Google mağaza uygulamalarında** dijital abonelik için mağazanın kendi ödeme sistemi (IAP) gerekir. Bu yüzden mağaza sürümünde "Pro'ya geç" düğmesi **gösterilmez**; yalnızca durum görünür. Ödeme web sürümünden yapılır. Mağaza kurallarını yayından önce güncel haliyle kontrol et.
- Vergi, fatura ve KDV yükümlülükleri için bir muhasebeciye danış (Lemon Squeezy "merchant of record" olarak satış vergisini kendisi toplar, ama Türkiye'deki gelir beyanı sana aittir).

## Güvenlik özeti
- Parolalar scrypt ile tuzlanıp saklanır; oturumlar rastgele belirteç (sunucuda yalnızca özeti tutulur), 60 gün.
- Kodlar 6 haneli, 5 deneme/30 dk (doğrulama) ve 15 dk (sıfırlama); IP ve hesap başına hız sınırı, art arda yanlış girişte artan kilit.
- Parola sıfırlama ve değiştirme diğer cihazların oturumlarını kapatır.
- Veri **sunucuda şifrelenmez** (düz JSON, SQLite dosyasında). Disk şifrelemesi/yedek barındırıcı tarafında yapılmalı.

## Sınırlar (dürüst notlar)
- Eşitleme "son yazan kazanır": iki cihazda aynı anda, çevrimdışıyken farklı değişiklik yaparsan biri ezilir.
- Hız sınırları bellek içidir; tek sunucu örneği için tasarlandı (birden çok kopyada paylaşılmaz).
- Kullanıcı başına 2 MB veri sınırı (`MAX_DATA_BYTES`).
- Yedek: `data/pusula.db` dosyasını düzenli kopyala.
- Bu paket gerçek bir barındırıcıda ve gerçek e-postayla henüz denenmedi; yerelde test edildi.


## Yerleşik yapay zekâ (kullanıcıdan API anahtarı istenmez)

Uygulamadaki sohbet, giriş yapmış kullanıcının mesajlarını `POST /api/ai` ile sunucuya gönderir; sunucu senin anahtarınla yapay zekâ servisine iletir. **Anahtar yalnızca sunucuda (ortam değişkeni) durur; uygulamaya veya APK'ya asla konmaz.**

1. Bir anahtar al (en kolayı Gemini: aistudio.google.com/apikey).
2. Sunucuda şunları ayarla: `AI_KEY=...` (gerekirse `AI_PROVIDER`, `AI_MODEL`, `AI_URL`; bkz. `.env.example`).
3. Sunucuyu yeniden başlat. `/api/health` cevabında `"ai": true` görünmeli.

Maliyet kontrolü: kullanıcı başına günlük mesaj sınırı (`AI_DAILY_LIMIT`, varsayılan 40; ödeme açıkken ücretsiz plan en fazla 15, Pro `AI_DAILY_LIMIT_PRO`=200) ve dakikada 20 istek sınırı vardır. Mesajlar sunucuda saklanmaz, yalnızca günlük sayaç tutulur. Anahtarın hesabındaki harcama limitini de servisin panelinden ayrıca düşük tut.
Not: Bu mod yalnızca sunucuya giriş yapılmışsa çalışır. Sunucu yoksa kullanıcı 🔑 düğmesinden kendi anahtarını girebilir.

### Para harcamadan (ücretsiz katman)
Gemini ve Groq gibi servisler kart istemeden ücretsiz kota verir; `AI_KEY`'e bunlardan alınmış anahtar(lar) yazılırsa fatura çıkmaz. Dikkat:
- Ücretsiz kota düşüktür (dakikalık/günlük sınır). Birden çok anahtarı virgülle yazabilirsin; kota dolunca sıradakine geçilir. Hepsi dolarsa kullanıcı "yapay zekâ yoğun, biraz sonra dene" mesajı görür.
- Birçok servis ücretsiz katmanda gelen verileri ürün geliştirmede kullanabilir; koşulları kontrol et. Uygulamanın onay penceresi kullanıcıya mesajların bir yapay zekâ servisine gittiğini söyler.
- Kullanıcı sayısı büyüyünce ücretsiz kota yetmez; o zaman Pro aboneliğinden gelen gelirle ücretli anahtara geçilir (aynı ayar, sadece anahtar değişir).
