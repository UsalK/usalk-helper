# usalk-helper üzerinden Etsy'ye yükleme talimatı

Ürettiğin görselleri usalk-helper arka ucu üzerinden Etsy mağazalarına dağıtırsın.
Mockup üretimi, SEO metni ve bölüm seçimi arka uçta otomatik yapılır. Senin işin:
dosyaları diske yazmak, işi başlatmak, bitmesini beklemek, rapor vermek.

## Ortam

- Arka uç: `http://localhost:3001/api` — kimlik doğrulama yok.
- Başlamadan önce `GET /api/health` çağır. `{"status":"ok"}` dönmüyorsa dur ve
  kullanıcıya "arka uç çalışmıyor" de. Kendin başlatmaya çalışma.
- Görseller bu makinenin diskinde olmalı. Uzak URL veya base64 kabul edilmez;
  iş kuyruğu mutlak dosya yolu ister.
- Kabul edilen formatlar: `.jpg` `.jpeg` `.png` `.webp`

## Değiştirilemez kural: mağazalar sırayla işlenir

Arka uçta tek bir "aktif mağaza" vardır. Yükleme adımı ve Etsy token'ı her zaman
o anki aktif mağazadan okunur — işin oluşturulduğu andaki mağazadan değil.

Bu yüzden:

- Aynı anda birden fazla mağaza için iş çalıştırma.
- Bir iş `running` durumundayken **mağaza değiştirme.** Değiştirirsen o işin kalan
  ürünleri yanlış mağazaya yüklenir; bu geri alınamaz.
- Sıra her zaman: mağazaya geç → işi başlat → `completed` olana kadar bekle →
  sonraki mağazaya geç.

## Akış

### 1. Mağazaları öğren

```
GET /api/etsy/status
→ { connected, activeShop, shops: [ { shop_id, shop_name, is_active } ] }
```

`connected: false` ise dur; kullanıcının Etsy bağlantısını yenilemesi gerekir.

### 2. Görselleri mağazalara böl

N görseli mağaza sayısına eşit dağıt, kalan olursa ilk mağazalara birer fazla ver.
Dağıtımı sen yaparsın — arka uçta round-robin yoktur.

### 3. Her mağaza için, sırayla

**3a — Mağazaya geç**

```
POST /api/etsy/switch    { "shopId": "65571647" }
→ { success: true, activeShopId }
```

**3b — O mağazanın varsayılanlarını oku**

```
GET /api/settings
→ { default_shipping_profile_id, default_return_policy_id,
    default_readiness_state_id, default_listing_state, ... }
```

Bu ID'ler **mağazaya özeldir.** Önceki mağazadan aldığın değeri asla tekrar
kullanma, her switch'ten sonra yeniden oku.

`default_shipping_profile_id` boşsa o mağaza için işi başlatma — yükleme adımı
400 ile patlar. Kullanıcıya "şu mağazada kargo şablonu tanımlı değil" de ve
o mağazayı atla, diğerlerine devam et.

Gerekirse ham listeler: `GET /api/etsy/shipping-profiles`,
`/return-policies`, `/readiness-states` — hepsi aktif mağazaya göre döner.

**3c — İşi başlat**

```
POST /api/bulk-jobs
{
  "mode": "create",
  "filePaths": ["C:\\...\\gorsel1.png", "C:\\...\\gorsel2.png"],
  "config": {
    "shipping_profile_id": <3b'den>,
    "return_policy_id":    <3b'den>,
    "readiness_state_id":  <3b'den>,
    "listing_state": "draft",
    "auto_section": true,
    "target_market": "US/UK",
    "shop_style": "vintage poster, art deco",
    "dry_run": false
  }
}
→ { id, total_items, status, ... }
```

Dönen `total_items` gönderdiğin dosya sayısından azsa, bulunamayan veya format
dışı yollar **sessizce elenmiştir.** Farkı kullanıcıya bildir.

**3d — Bitene kadar yokla**

```
GET /api/bulk-jobs/{id}     # 10 saniyede bir
→ { status, current_step, total_items, done_items, failed_items,
    items: [ { file_name, status, step, error, listing_id } ] }
```

`status` `running`'den `completed` / `error` / `cancelled`'a döner.
**`completed` görmeden bir sonraki mağazaya geçme.**

İptal gerekirse: `POST /api/bulk-jobs/{id}/cancel`

### 4. Rapor

Mağaza başına: kaç başarılı, kaç hatalı, hatalıların dosya adı ve `error` metni.

## config alanları

| alan | zorunlu | açıklama |
|---|---|---|
| `shipping_profile_id` | evet | 3b'den. Yoksa yükleme 400 verir. |
| `return_policy_id` | hayır | Verilmezse mağaza ayarına düşer. |
| `readiness_state_id` | hayır | Verilmezse mağaza ayarına düşer. |
| `listing_state` | hayır | `draft` veya `active`. Varsayılan `draft`. |
| `auto_section` | hayır | `true` ise bölümü AI seçer. |
| `shop_section_id` | hayır | `auto_section` kapalıyken elle bölüm. |
| `dry_run` | hayır | `true` ise Etsy'ye hiçbir şey gönderilmez. |
| `target_market` | hayır | Varsayılan `US/UK`. |
| `shop_style` | hayır | Varsayılan `vintage poster, art deco`. |
| `variation_profile_id` | hayır | Verilmezse görsel oranından otomatik eşlenir. |

## Arka ucun kendi yaptıkları — tekrar etme

- **Mockup:** varyasyon profiline göre üretilir; profil görselin en-boy oranından
  otomatik seçilir.
- **SEO:** başlık, etiketler ve açıklama AI ile yazılır. Sen başlık veya tag
  üretip göndermeye çalışma, üzerine yazılır.
- **Bölüm:** `auto_section: true` ise mağazanın bölümleri AI'a verilir ve uygun
  olan seçilip ürüne yazılır.

## İlk çalıştırma

İlk denemeyi `"dry_run": true` ile, tek mağazada 2–3 görselle yap. Etsy'ye hiçbir
şey gitmez; ürün, mockup ve SEO hazırlanır, kullanıcı panelden inceler. Sonuç
iyiyse `dry_run: false` ile gerçeğini çalıştır.

## Yapma

- Bir iş çalışırken aktif mağazayı değiştirme.
- Hata alan bir dosyayı kendiliğinden yeniden gönderme — hata yükleme sırasında
  oluştuysa Etsy'de listing açılmış olabilir, ikinci deneme kopya üretir.
  Hataları raporla, kararı kullanıcı versin.
- `listing_state: "active"` ile başlama. `draft` ile yükle, kullanıcı panelden
  kontrol edip yayınlasın.
