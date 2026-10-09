# Pusula · Mağaza yayın kontrol listesi

## 0. Önce doldur (3 sayfada sarı işaretli alanlar)
`gizlilik.html`, `kurallar.html`, `hesap-sil.html` içinde şunları ara ve değiştir:
- `[E-POSTA ADRESİN]` → herkese açık destek e-postan
- `[ADIN / ŞİRKET ADIN]`, `[TARİH]`, `[30]`
Üç dosyayı da düzenleyip GitHub `public/` klasörüne yeniden yükle.

## 1. Adresler (Play Console ve App Store Connect'e yazılacaklar)
- Gizlilik politikası: https://pusula-3ejq.onrender.com/gizlilik.html
- Hesap silme URL'si (Play zorunlu): https://pusula-3ejq.onrender.com/hesap-sil.html
- Topluluk kuralları: https://pusula-3ejq.onrender.com/kurallar.html
- Destek e-postası: yukarıdaki e-posta

## 2. Google Play · Veri güvenliği formu (önerilen cevaplar)
Veri toplanıyor mu: **Evet**. Aktarım sırasında şifreli: **Evet**. Silme talebi yolu: **Evet** (uygulama içi + web URL).
| Veri türü | Toplanır | Paylaşılır | Amaç |
|---|---|---|---|
| E-posta adresi | Evet | Hayır | Hesap yönetimi |
| Kullanıcı kimlikleri (kullanıcı adı) | Evet | Hayır | Uygulama işlevi, hesap |
| Mesajlar (uçtan uca şifreli) | Evet | Hayır | Uygulama işlevi |
| Fotoğraf/video | Evet | Hayır | Uygulama işlevi (Pusula Medya) |
| Diğer kullanıcı içeriği (görev, not, paylaşım) | Evet | **Evet** (yapay zekâ isteği: Google) | Uygulama işlevi |
| Finansal bilgi (kasa kayıtları) | Evet (kullanıcı girerse) | Evet (yapay zekâ bağlamı) | Uygulama işlevi |
| Takvim (Google bağlanırsa) | Evet | Hayır | Uygulama işlevi |
Reklam yok, izleme yok, veri satışı yok. Hepsi "isteğe bağlı olarak" değil, hesap açınca toplandığı için "Zorunlu" yerine hesap özelliklerinde **isteğe bağlı** seç (hesapsız kullanım mümkün).

## 3. Play · Kullanıcı Tarafından Oluşturulan İçerik (UGC) politikası — Pusula Medya buna girer
Gerekenler ve durum:
- Kurallar/EULA: `kurallar.html` ✔ (kayıtta kabul bilgisini göstermek için Medya profil oluştururken linki ver)
- Uygulama içinde içerik/kullanıcı şikâyet etme: ✔ (🚩)
- Kullanıcı engelleme: ✔
- Şikâyetleri inceleme ve içerik/hesap kaldırma: ✔ (`/admin.html`, ADMIN_TOKEN)
- Müstehcen içerik filtresi/denetim: elle (panel). Düzenli panele bak (günde en az bir kez).

## 4. İçerik derecelendirme anketi
- Kullanıcılar arası etkileşim/paylaşım: **Evet** · Kullanıcı üretimli içerik: **Evet** · Konum paylaşımı: Hayır · Satın alma: Hayır (şimdilik)
- Beklenen sonuç: genelde 12+/Teen. Yapay zekâ üretimli içerik varsa anketten "Evet" işaretle.

## 5. Mağaza metni (taslak)
**Başlık (30):** Pusula · Kişisel İş Asistanı
**Kısa açıklama (80):** Görev, kasa ve işlerini takip eden, seninle konuşan yapay zekâ asistanı.
**Uzun açıklama:**
Pusula, kendi işini yürüten herkes için kişisel asistan. Görevlerini, kasanı, hedeflerini ve alışkanlıklarını tek yerde tut; asistana yaz ya da konuş, plan çıkarsın, hatırlatsın, görev ve kasa kaydı eklesin.
• Günlük brif ve haftalık özet (pazartesileri otomatik)
• Tekrarlayan görevler: "her hafta", "her gün", "her ay"
• Kasa, hedef, iş hattı, odak zamanlayıcı
• Pusula Medya: paylaşım, hikâye, anket, mesajlaşma — mesajlar ve gruplar uçtan uca şifreli
• İstersen Google Takvim ve Gmail taslağı bağlantısı (asistan e-posta göndermez)
• Koyu/açık tema, çevrimdışı çalışır
Yapay zekâ hata yapabilir; yatırım, hukuk ve sağlık tavsiyesi değildir.

## 6. Ekran görüntüleri / varlıklar
`store/store-assets` ve `store/resources` içindekiler kullanılabilir. Pusula Medya, hikâye anketi ve haftalık özet için yeni ekran görüntüsü almak iyi olur (en az 2, tercihen 4–8).

## 7. Yayın öncesi son kontrol
- [ ] Render'da `ADMIN_TOKEN` tanımlı, `/admin.html` girişi çalışıyor
- [ ] Render'da `GOOGLE_CLIENT_ID/SECRET` (Google bağlantısı istiyorsan); OAuth ekranı "Yayında" ve gizlilik URL'si eklendi
- [ ] R2 anahtarı yenilendi (sohbette görünen eski anahtarı iptal et)
- [ ] İki gerçek telefonda şifreli mesaj + fotoğraf testi
- [ ] Hesap silme testi (hesap aç → sil → yeniden girmeyi dene)
- [ ] Gizlilik sayfasındaki sarı alanlar dolu
- [ ] Android: imzalı AAB (`store/MAGAZA-REHBERI.md` adımları) · iOS: Apple geliştirici hesabı gerekir (ücretli)
- [ ] Play: yeni kişisel geliştirici hesaplarında 12 test kullanıcısı / 14 gün kapalı test şartı geçerli olabilir
