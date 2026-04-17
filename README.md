# CineBoard AI Studio

Proyek ini adalah aplikasi film production & content engine bertenaga AI untuk pre-produksi profesional, storyboarding, dan shotlist generation.

## 🚀 Persiapan Hosting di Vercel

Aplikasi ini sudah dikonfigurasi untuk dapat dideploy langsung ke Vercel sebagai **Single Page Application (SPA)**.

### 1. Prasyarat

- Pastikan Anda memiliki akun [Vercel](https://vercel.com).
- Pastikan Anda memiliki **Gemini API Key** yang valid dari [Google AI Studio](https://aistudio.google.com/app/apikey).

### 2. Langkah-langkah Deployment

1. **Hubungkan Repository**: Upload kode ini ke GitHub/GitLab/Bitbucket dan hubungkan ke Vercel.
2. **Konfigurasi Build**:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. **Environment Variables**:
   PENTING! Tambahkan variable berikut di Dashboard Vercel (Settings > Environment Variables):
   - `GEMINI_API_KEY`: Masukkan API Key Gemini Anda.

### 3. Konfigurasi Khusus (Sudah ditambahkan)

- **`vercel.json`**: Menangani routing SPA agar halaman tidak 404 saat direfresh di route tertentu.
- **`vite.config.ts`**: Secara otomatis menyuntikkan `GEMINI_API_KEY` dari environment variable saat proses build.

## 🛠️ Pengembangan Lokal

```bash
# Install dependencies
npm install

# Jalankan dev server
npm run dev
```

Pastikan Anda membuat file `.env` di root folder dengan isi:
```env
GEMINI_API_KEY=your_api_key_here
```
