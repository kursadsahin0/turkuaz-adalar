# Play Console — adım adım, hazır cevaplarla

Tidelark (`com.tidelark.game`) için Play Console'da doldurulacak her şey bu
dosyada. Geliştirici üyeliği alındığı gün yukarıdan aşağı ilerle; metinler
[`listing.md`](listing.md) dosyasında, görseller bu klasörde.

Yüklenecek paket: `android/app/build/outputs/bundle/release/app-release.aab`
(yeniden üretmek için: `npm run android:release`).

---

## 0. Üyelikten önce yapılabilecekler (ücretsiz)

- [ ] **Commit ve push** (gizlilik politikasının son hali yayına çıkar).
- [ ] **Upload anahtarını yedekle:** `android/release/turkuaz-upload.jks` ve
      şifresi bir şifre yöneticisinde ya da bilgisayar dışında dursun.
- [ ] **12 test kullanıcısı topla.** Yeni kişisel hesaplarda üretime
      geçmeden önce en az 12 kişinin 14 gün kapalı testte kalması gerekiyor.
      En kolayı bir Google Grubu açmak (groups.google.com → "tidelark-test")
      ve arkadaşlarını oraya eklemek; Play Console'da grubu tek satırla
      eklersin. Testçilerin Android telefonu ve Google hesabı olmalı.
- [ ] **app-ads.txt sitesini şimdiden kur** (ücretsiz): GitHub'da tam adı
      `kursadsahin0.github.io` olan herkese açık bir depo aç, içine
      `store/app-ads.txt` dosyasını `app-ads.txt` adıyla koy. Birkaç dakika
      sonra https://kursadsahin0.github.io/app-ads.txt açılmalı.
- [ ] **AdMob ödeme bilgileri** (istersen şimdi, istersen sonra):
      Ödemeler → Ödeme bilgileri → banka hesabı (IBAN) ve
      Ödemeler → Ayarlar → ABD vergi bilgileri → **W-8BEN**.

## 1. Geliştirici hesabı (tek ücretli adım)

play.google.com/console → **Kişisel** hesap → 25 $ tek seferlik ücret →
kimlik doğrulama (birkaç gün sürebilir). İletişim e-postası olarak
`kursatsahin565@gmail.com` kullan (gizlilik politikasındakiyle aynı).

## 2. Uygulama oluştur

| Alan                   | Cevap                                                            |
| ---------------------- | ---------------------------------------------------------------- |
| Uygulama adı           | Tidelark                                                         |
| Varsayılan dil         | Türkçe – tr-TR                                                   |
| Uygulama mı oyun mu    | **Oyun**                                                         |
| Ücretsiz mi ücretli mi | **Ücretsiz**                                                     |
| Beyanlar               | Geliştirici Program Politikaları ve ABD ihracat yasaları: onayla |

## 3. Uygulama içeriği (Politika → Uygulama içeriği)

### Gizlilik politikası

`https://kursadsahin0.github.io/turkuaz-adalar/privacy.html`

### Uygulama erişimi

**Tüm işlevler herhangi bir özel erişim gerektirmeden kullanılabilir** (giriş,
hesap yok).

### Reklamlar

**Evet, uygulamam reklam içeriyor.**

### Reklam kimliği

- Uygulamanız reklam kimliği kullanıyor mu? **Evet**
- Amaç: **Reklam veya pazarlama**, **Analiz**, **Dolandırıcılığı önleme,
  güvenlik ve uygunluk**

### İçerik derecelendirmesi (IARC anketi)

- E-posta: kursatsahin565@gmail.com — Kategori: **Oyun**
- Şiddet: **Hayır** (engellere çarpmak dışında şiddet yok)
- Korku, cinsellik, küfür, uyuşturucu, alkol, tütün: **Hayır**
- Kumar / şans oyunu, gerçek para: **Hayır**
- Kullanıcılar birbiriyle etkileşime giriyor ya da içerik paylaşıyor mu:
  **Hayır** (skor paylaşımı telefonun kendi paylaşım menüsüyle yapılıyor,
  oyunun içinde sohbet ya da kullanıcı içeriği yok)
- Konum paylaşımı: **Hayır**
- Dijital ürün satın alma: **Hayır** (coin ve kristal yalnızca oyunda
  kazanılıyor, gerçek parayla satılmıyor)
- Beklenen sonuç: PEGI 3 / Herkes

### Hedef kitle ve içerik

- Yaş grupları: **13–15, 16–17, 18 ve üzeri** (13 yaş altını seçme)
- Uygulama yanlışlıkla çocuklara hitap edebilir mi: **Hayır**

### Veri güvenliği

Oyunun kendisi veri toplamıyor (kayıtlar cihazda, çökme raporu ve analiz
kapalı). Toplayan, reklamları gösteren Google AdMob SDK'sı. Cevaplar
Google'ın rehberine göre:
https://developers.google.com/admob/android/privacy/play-data-disclosure

- Uygulama gerekli kullanıcı veri türlerini topluyor ya da paylaşıyor mu:
  **Evet**
- Aktarım sırasında tüm veriler şifreleniyor mu: **Evet**
- Kullanıcılar verilerinin silinmesini isteyebilir mi: **Hayır** (hesap yok;
  reklam kimliği telefon ayarlarından sıfırlanabiliyor)

| Veri türü                                                                 | Toplanıyor | Paylaşılıyor | Amaç                                                  |
| ------------------------------------------------------------------------- | ---------- | ------------ | ----------------------------------------------------- |
| Konum → **Yaklaşık konum** (IP'den)                                       | Evet       | Evet         | Reklam veya pazarlama, Analiz, Dolandırıcılığı önleme |
| Uygulama etkinliği → **Uygulama etkileşimleri**                           | Evet       | Evet         | Reklam veya pazarlama, Analiz                         |
| Uygulama bilgileri ve performansı → **Kilitlenme günlükleri**, **Teşhis** | Evet       | Evet         | Analiz, Dolandırıcılığı önleme                        |
| Cihaz veya diğer kimlikler → **Cihaz veya diğer kimlikler**               | Evet       | Evet         | Reklam veya pazarlama, Analiz, Dolandırıcılığı önleme |

Her biri için: **İşlem geçici değil**, **toplanması zorunlu** (reklamlar
çalışsın diye; kişiselleştirme oyuncunun seçimine bağlı).

Sentry ya da PostHog eklenirse: "Kilitlenme günlükleri" ve "Uygulama
etkileşimleri" satırlarına **Analiz / Uygulama işlevi** amacıyla **senin
tarafından toplandığını** da ekle.

### Diğer beyanlar

- Haber uygulaması: **Hayır** — Kamu sağlığı (COVID-19): **Hayır** —
  Devlet uygulaması: **Hayır** — Finansal özellikler: **Yok**
- Ön plan hizmeti / tam zamanlı alarm izni: **sorulmaz** (pakette yok)

## 4. Mağaza sayfası (Büyüme → Mağaza varlığı → Ana mağaza girişi)

| Alan                      | Kaynak                                                         |
| ------------------------- | -------------------------------------------------------------- |
| Uygulama adı              | Tidelark                                                       |
| Kısa ve tam açıklama      | `listing.md` → Türkçe; Çeviri ekle → en-US, de-DE, es-ES       |
| Uygulama simgesi          | `store/icon-512.png`                                           |
| Öne çıkan grafik          | `store/feature-graphic-1024x500.png`                           |
| Telefon ekran görüntüleri | `store/screenshots/play/<dil>/` (her dilde 7 tane)             |
| Kategori                  | Oyun → **Arcade** — Etiketler: Runner, Arcade, Casual, Offline |
| E-posta                   | kursatsahin565@gmail.com                                       |
| Web sitesi                | `https://kursadsahin0.github.io` (app-ads.txt burada)          |

## 5. Kapalı test (Test → Kapalı test)

1. **Kanal oluştur** (ör. "Kapalı test"), **Testçiler** → Google Grubu ya da
   e-posta listesi ekle, geri bildirim e-postası: kursatsahin565@gmail.com.
2. **Ülkeler:** Türkiye (istersen tüm ülkeler).
3. **Yeni sürüm oluştur** → **Play App Signing**'i kabul et (Google'ın
   anahtarı; upload anahtarın kaybolursa sıfırlamayı mümkün kılar).
4. `app-release.aab` dosyasını yükle. Sürüm adı otomatik gelir:
   **1.0.0 (10000)**.
5. Sürüm notları: `listing.md` → "Bu sürümdeki yenilikler" (diğer diller
   için What's new / Neuerungen / Novedades).
6. **İncelemeye gönder.** Onaydan sonra testçilere davet bağlantısını
   gönder; 12 kişinin katılıp 14 gün kalması gerekiyor.

## 6. Üretime geçiş

14 gün dolunca Kontrol paneli → **Üretim erişimi başvurusu** (test hakkında
birkaç soru soruluyor: kaç kişi test etti, ne geri bildirim geldi, ne
düzelttin). Onaydan sonra Üretim → yeni sürüm → aynı ya da yeni paket.

## 7. Yayından sonra

- AdMob → Uygulamalar → Tidelark → **Uygulama ayarları → Uygulama mağazası
  ayrıntıları**: Play'deki uygulamaya bağla (AdMob inceleme başlar; o zamana
  kadar reklamlar sınırlı).
- AdMob → **app-ads.txt** → kontrolü başlat (bir gün kadar sürebilir).
- Her güncellemeden önce sürümü yükselt, sonra paketi al:
  `npm version patch --no-git-tag-version` ve `npm run android:release`.
