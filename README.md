# Katnis

App Mac untuk rangkuman harian (daily standup) tim BIS. Katnis membaca jejak kerja di Mac-mu, merangkumnya lewat Claude Code, lalu menyajikannya sebagai catatan yang bisa langsung diedit dan disalin ke Slack/WA.

Catatan per hari punya tiga bagian, berurutan:

1. **Dikerjakan**: apa yang dikerjakan, termasuk keputusan ("Memutuskan …")
2. **Kendala**: blocker
3. **Selanjutnya**: yang dikerjakan berikutnya

## Pasang

1. Unduh `Katnis-x.y.z.dmg` dari halaman Releases, buka, lalu seret **Katnis** ke **Applications**.
2. Karena app ditandatangani ad-hoc (belum notarisasi), buka pertama kali dengan klik kanan › **Buka**.
3. Butuh [Claude Code](https://claude.com/claude-code) yang sudah login (`claude` di Terminal). Tanpa Claude Code, catatan tetap disusun dari jejak, hanya tidak dirangkum.

## Sumber jejak (bisa dimatikan satu per satu di panel Sumber & blocker)

| Sumber | Yang dibaca |
|---|---|
| Claude Code | Prompt di `~/.claude/history.jsonl`, artifact yang terbit, file yang diubah per sesi |
| Figma | File Figma yang dibuka di browser atau diubah lewat Claude Code |
| Riwayat browser | Chrome, Arc, Brave, Edge: judul dan alamat halaman kerja saja (media sosial, belanja, bank, email, dan pencarian disaring) |
| Catatan suara | Rekaman yang ditranskripsi macOS (Speech). Audio tidak disimpan |
| Chat ditempel | Potongan chat yang kamu tempel sendiri. Nomor HP, email, dan ID pelanggan disamarkan |
| File lokal | File yang disimpan/diubah hari itu di Desktop, Downloads, Documents, plus foto & file yang kamu tambahkan |

Semua jejak dibaca di Mac ini. Yang dikirim ke Claude hanya teks jejak hari yang kamu Generate, lewat `claude -p` milikmu sendiri.

## Fitur

- Papan 2 hari / 4 hari / seminggu, geser per rentang
- **Generate** per hari: tiap poin punya titik sumber, klik untuk melihat jejak aslinya
- Edit langsung di jendela catatan: Enter = poin baru, Backspace di poin kosong = hapus, × saat hover
- **+ Poin** ke bagian mana pun, plus lampiran yang disarankan (artifact, Figma, file)
- **Tambah** › Rekam suara, Ambil foto (kamera Mac), Upload file, Tempel chat, untuk hari mana pun di 7 hari terakhir. Kalau hari itu sudah punya catatan, poin barunya langsung masuk; kalau belum, ikut dirangkum saat Generate. Foto dan file dibaca Claude supaya isinya ikut masuk
- **Rangkum chat**: chat yang ditempel dipilah jadi Permintaan / Perlu dibalas / Info
- Blocker aktif terkumpul di panel samping sampai ditandai beres
- Salin teks standup (⌘⇧C untuk hari ini), tema gelap/terang

Data disimpan di `~/Library/Application Support/Katnis/` (`store.json` + folder `lampiran/`).

## Build

```sh
./build.sh            # → dist/Katnis-1.0.1.dmg
VER=1.1.0 ./build.sh  # versi lain
```

Butuh Xcode Command Line Tools (macOS 13+, Apple Silicon).

Mode uji:

```sh
build/Katnis.app/Contents/MacOS/Katnis --jejak 2026-11-19 --only claude   # JSON jejak satu hari
build/Katnis.app/Contents/MacOS/Katnis --demo                             # data contoh, tidak menyimpan

# Rekam suara tanpa mikrofon (audio dari file, mis. hasil `say -v Damayanti -o tes.aiff "..."`).
# Pakai `open` supaya izin Pengenalan Ucapan atas nama Katnis, bukan Terminal.
open -n -W -a build/Katnis.app --args --tes-rekam "$PWD/tes.aiff" --out "$PWD/hasil.txt"
open -n -W -a build/Katnis.app --args --tes-suara "$PWD/tes.aiff" --out "$PWD/hasil.txt" --server
```

Transkripsi suara mencoba on-device dulu. Kalau Dikte macOS mati atau model id-ID belum terpasang,
otomatis pindah ke server Apple (audio tidak disimpan Katnis).

Pratinjau UI di browser: buka `web/index.html` (otomatis memakai data contoh), mis. `web/index.html#gen,gelap`.

## Struktur

- `src/main.swift`: shell AppKit + WKWebView, pembaca jejak, `claude -p`, suara, file
- `web/`: UI (HTML/CSS/JS), token tema di `theme.css`, font Geist
- `assets/Katnis.icns`: ikon app (logo Mata Panah)
