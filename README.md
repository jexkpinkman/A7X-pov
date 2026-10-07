# POV Konser A7X di JIS

Static site (tanpa build step) + 2 fungsi API opsional.

## Deploy ke Vercel
1. Push folder ini ke GitHub, lalu "Add New Project" di vercel.com dan import repo-nya.
   Atau dari folder ini jalanin `npx vercel --prod`.
2. Framework Preset: **Other**. Build Command dan Output Directory dikosongin.

## Opsional: counter kunjungan dan "Cari teman"
Butuh Upstash Redis. Isi Environment Variables di Vercel:
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Kalau nggak diisi, webnya tetap jalan. Counter dan bagian "Cari teman" otomatis disembunyiin.

## Musik
Edit array `SONGS` di `app.js`, isi `id` dengan ID video YouTube (11 karakter). Entri dengan id kosong dilewati.

## Catatan
- three.js r147 dimuat dari CDN jsDelivr (lihat tag script di `index.html`).
- Geometri stadion, posisi door, dan layout panggung adalah perkiraan.
