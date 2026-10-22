# Jepreto Top 100 Templates Collection

Koleksi Top 100 template/frame photobooth terpopuler dari Jepreto yang telah diunduh dan diorganisir untuk ConstBooth.

---

## Struktur Folder

```text
public/assets/jepreto-frames/
├── catalog.json              # Kamus metadata lengkap (posisi foto, nama, pembuat, dll)
├── README.md                 # Dokumentasi implementasi
├── strips/                   # 50 Template rasio 1:3 (Strip vertikal klasik 3-4 foto)
├── cards/                    # 40 Template rasio 2:3 (Format kartu / collage 4-6 foto)
├── others/                   # 10 Template format lainnya (A4/A3, custom)
└── thumbnails/               # 100 Thumbnail WebP untuk preview di UI
```

---

## Konvensi Penamaan File

Setiap file gambar diberi nama deskriptif dengan pola:
`[nama-template]_[rasio]_[jumlah-slot]slots_[shortId].[png|webp]`

Contoh:
* `1975-about-you-4_1x3_3slots_63d758.png`
* `toy-story-2x3_2x3_6slots_9ccc89.png`
* `5th-treasure2_1x3_4slots_6bd870.png`

Dengan format ini, kamu langsung mengetahui:
1. **Nama tema** (`1975-about-you-4`)
2. **Rasio strip** (`1x3` atau `2x3`)
3. **Jumlah foto yang dibutuhkan** (`3slots`, `6slots`)

---

## Struktur Data `catalog.json`

Setiap entri template di `catalog.json` berisi:

```json
{
  "id": "63d75807-c7e7-4bdc-a18f-bc610b32a820",
  "shortId": "63d758",
  "name": "1975 - About you (4)",
  "creator": "Jepreto",
  "ratio": "1:3",
  "subfolder": "strips",
  "slotsCount": 3,
  "usedTimes": 119018,
  "frameFile": "1975-about-you-4_1x3_3slots_63d758.png",
  "frameUrl": "/assets/jepreto-frames/strips/1975-about-you-4_1x3_3slots_63d758.png",
  "thumbnailUrl": "/assets/jepreto-frames/thumbnails/1975-about-you-4_1x3_3slots_63d758.webp",
  "positions": [
    {
      "index": 0,
      "top": 6.0,
      "left": 2.0,
      "width": 95.0,
      "height": 21.0,
      "type": "landscape",
      "rotation": 0
    }
  ]
}
```

* `top`, `left`, `width`, `height` bernilai **persentase (%)** dari dimensi total frame.

---

## Panduan Rendering (Canvas 2D)

Semua frame adalah **PNG transparan** (area fotonya berlubang / transparan).

Langkah rendering:
1. Load gambar frame: `const frameImg = new Image(); frameImg.src = template.frameUrl;`
2. Atur ukuran canvas sesuai ukuran asli frame:
   ```javascript
   canvas.width = frameImg.naturalWidth;
   canvas.height = frameImg.naturalHeight;
   ```
3. Gambar setiap foto hasil jepretan kamera pada koordinat slot-nya:
   ```javascript
   template.positions.forEach((pos, idx) => {
     const photo = capturedPhotos[idx];
     const dx = (pos.left / 100) * canvas.width;
     const dy = (pos.top / 100) * canvas.height;
     const dw = (pos.width / 100) * canvas.width;
     const dh = (pos.height / 100) * canvas.height;
     
     // Render foto (dengan object-fit cover / center crop jika aspek rasio berbeda)
     ctx.drawImage(photo, dx, dy, dw, dh);
   });
   ```
4. Gambar frame overlay di atas foto:
   ```javascript
   ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);
   ```
5. Ekspor canvas menjadi gambar strip final (JPEG / PNG / WebP)!
