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

### 4. Persiapan Android (APK)

Proyek ini telah dikonfigurasi dengan Capacitor untuk build Android.

**Langkah Build APK:**
1. Pastikan Anda memiliki Android Studio.
2. Jalankan `npm run cap:sync` untuk sinkronisasi aset web terbaru ke folder Android.
3. Buka folder `android` di Android Studio atau jalankan `npm run cap:open`.
4. Di Android Studio: **Build > Build Bundle(s) / APK(s) > Build APK(s)**.

**Konfigurasi Firebase untuk Android:**
Agar Google Login berfungsi di Android:
1. Buka [Firebase Console](https://console.firebase.google.com/).
2. Tambahkan App Android baru dengan package name: `com.cineboard.ai`.
3. Download `google-services.json` dan letakkan di `android/app/`.
4. Masukkan **SHA-1 fingerprint** dari keystore Anda di setelan Firebase App Android tersebut.

### 5. Persiapan Aplikasi Laptop (Khusus Laptop)

Aplikasi ini telah dikonfigurasi dengan **Electron** (Software Native) untuk laptop.

**Langkah Membangun Aplikasi Laptop:**
1. Pastikan Node.js sudah terinstall di laptop Anda.
2. Jalankan perintah: `npm run build:laptop`.
3. Installer aplikasi (.exe) akan otomatis dibuat di folder `dist-desktop/`.
   - File yang dihasilkan adalah versi *Portable* (Tinggal klik dan jalankan).
   - Sudah termasuk menu navigasi profesional (File, Edit, View, dsb).

**Menjalankan secara lokal (Dev Mode):**
`npm run electron:dev`

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
