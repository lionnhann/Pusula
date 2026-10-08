# Pusula'yı internete açma (adım adım)

Üç yol var. **Yeni başlıyorsan A'yı seç.** Hepsinde aynı şey olur: sunucu çalışır, uygulama aynı adresten açılır, hesaplar ve eşitleme çalışır.

> Önemli: veritabanı bir dosya (SQLite). Barındırıcıda **kalıcı disk** olmazsa her yeniden başlatmada hesaplar silinir. Bu yüzden üçünde de disk bağlanıyor.

## A) Render (en kolay, tıkla-kur)
1. GitHub'da (ücretsiz) yeni bir **private** depo aç, bu klasörün içindekileri yükle (`data/` ve `.env` hariç; `.gitignore` bunu zaten yapar).
2. render.com → hesap aç → **New → Blueprint** → depoyu seç. `render.yaml` her şeyi kurar (Docker, 1 GB disk, sağlık kontrolü).
3. Kurulum sırasında sorulan değişkenleri doldur (aşağıdaki tabloya bak). Boş bırakılanlar kapalı kalır.
4. Bitince Render'ın verdiği `https://pusula-xxxx.onrender.com` adresini aç → giriş ekranı görünür.
- Not: kalıcı disk ücretli plan ister; güncel fiyatı Render'ın sayfasından kontrol et.

## B) Fly.io
1. `flyctl` kur, `fly auth login`.
2. Bu klasörde: `fly launch --no-deploy --copy-config` (uygulama adını `fly.toml`'da değiştir).
3. `fly volumes create pusula_data --size 1 --region fra`
4. Değişkenler: `fly secrets set MAIL_FROM="Pusula <no-reply@alanadin.com>" RESEND_API_KEY=... ADMIN_TOKEN=$(openssl rand -hex 24)` (+ abonelik için `LS_CHECKOUT_URL`, `LS_WEBHOOK_SECRET`).
5. `fly deploy` → `fly open`.

## C) Kendi sunucun (VPS) — en ucuz ve tam kontrol
1. Ubuntu bir VPS kirala, Docker kur, alan adının DNS A kaydını sunucunun IP'sine yönlendir.
2. Klasörü sunucuya kopyala. `Caddyfile` içine alan adını yaz.
3. `.env.example` dosyasını `.env` olarak kopyala ve doldur.
4. `docker compose up -d` → Caddy HTTPS sertifikasını otomatik alır.
5. Yedek: `docker run --rm -v pusula_pusula-data:/d -v $PWD:/b alpine tar czf /b/yedek.tgz /d` komutunu cron ile günde bir çalıştır.

## Ortam değişkenleri
| Değişken | Ne için | Zorunlu mu |
|---|---|---|
| `RESEND_API_KEY` + `MAIL_FROM` | Doğrulama/parola sıfırlama e-postaları (resend.com, alan adını doğrulaman gerekir). Alternatif: `SMTP_URL` | Önerilir. Yoksa kodlar sadece sunucu günlüğüne yazılır |
| `ADMIN_TOKEN` | Elle Pro verme komutu | İsteğe bağlı |
| `LS_CHECKOUT_URL`, `LS_WEBHOOK_SECRET`, `PRO_PRICE_LABEL` | Aylık abonelik (Lemon Squeezy) | Para alacaksan |
| `TRIAL_DAYS`, `FREE_MAX_DATA_BYTES` | Deneme süresi ve ücretsiz plan sınırı | Hayır |

## Kurulumdan sonra kontrol listesi
1. `https://ADRESIN/api/health` → `{"ok":true,...}` döner.
2. Adresi aç, kayıt ol, e-postadaki kodu gir, bir görev ekle; ikinci tarayıcıda giriş yapıp görevi gör.
3. Abonelik kullanacaksan Lemon Squeezy'de webhook adresini `https://ADRESIN/api/billing/webhook` yap ve **test modunda** bir deneme satın alma yap.
4. `data/pusula.db` (ya da disk) için düzenli yedek planla.

## Uygulamayı mağaza / ayrı site sürümlerine bağlama
`Pusula-store` içindeki `www/config.js` → `serverUrl: "https://ADRESIN"`. Ayrı barındırılan web sürümü için `ALLOWED_ORIGINS=https://o-adres` ver.


## Yapay zekâ anahtarı (önemli)
Kullanıcılar anahtar girmesin istiyorsan barındırıcıdaki ortam değişkenlerine `AI_KEY` ekle (Gemini anahtarı: aistudio.google.com/apikey). Ayrıntı: README.md → "Yerleşik yapay zekâ". Anahtarı asla uygulama dosyalarına yazma.
