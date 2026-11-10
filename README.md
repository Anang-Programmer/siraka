# SIRAKA
### Sistem Informasi Penjadwalan dan Peminjaman Ruang Kelas dan Laboratorium

SIRAKA merupakan sistem informasi berbasis web yang dikembangkan untuk membantu pengelolaan jadwal, ketersediaan, dan peminjaman ruang kelas serta laboratorium di lingkungan kampus.

Sistem ini dirancang untuk mempermudah mahasiswa memperoleh informasi ruangan, membantu komting mengoordinasikan dan mengajukan peminjaman, serta membantu admin atau pengelola dalam mengelola data ruangan, jadwal, dan proses persetujuan peminjaman.

---

## Latar Belakang

Pengelolaan jadwal dan peminjaman ruang kelas maupun laboratorium yang belum terintegrasi dapat menimbulkan kesulitan dalam memperoleh informasi ketersediaan ruangan, pencatatan jadwal, serta potensi bentrok penggunaan ruangan.

Oleh karena itu, SIRAKA dikembangkan sebagai solusi berbasis web untuk menyediakan informasi ruangan secara terpusat dan mendukung proses peminjaman yang lebih terstruktur, transparan, dan mudah diakses.

## Tujuan Proyek

1. Menyediakan informasi ketersediaan dan jadwal penggunaan ruang kelas serta laboratorium secara terpusat.
2. Memfasilitasi proses pengajuan dan persetujuan peminjaman ruangan berdasarkan hak akses pengguna.
3. Menerapkan validasi ketersediaan dan pengecekan bentrok jadwal.
4. Membantu pengelolaan data ruangan dan riwayat peminjaman secara terorganisasi.

## Fitur Utama

### 1. Mahasiswa
- Login dan registrasi akun.
- Melihat dashboard mahasiswa.
- Melihat informasi ruang kelas dan laboratorium.
- Melihat jadwal dan ketersediaan ruangan.
- Melihat jadwal perkuliahan kelas pada hari berjalan.
- Menyampaikan kebutuhan peminjaman ruangan kepada komting.

### 2. Komting (Komisaris Tingkat)
- Login dan dashboard komting.
- Melihat informasi ruangan dan jadwal.
- Melihat daftar mahasiswa dan kebutuhan ruangan kelas.
- Mengajukan peminjaman melalui jalur prioritas berdasarkan KRS.
- Mengajukan peminjaman langsung ketika ruangan tersedia.
- Melihat status dan riwayat peminjaman.
- Mengelola atau membatalkan pengajuan sesuai ketentuan.

### 3. Admin / Pengelola
- Login dan dashboard admin.
- Mengelola data ruang kelas dan laboratorium.
- Menambah, mengubah, dan menghapus data ruangan.
- Mengelola data kelas dan jadwal penggunaan ruangan.
- Memeriksa pengajuan peminjaman.
- Memverifikasi data KRS.
- Menyetujui atau menolak pengajuan peminjaman.
- Mengelola akun dan hak akses pengguna.

## Alur Sistem

1. Pengguna melakukan login sesuai akun dan hak akses masing-masing.
2. Mahasiswa melihat informasi ruangan, jadwal, dan ketersediaan.
3. Mahasiswa menyampaikan kebutuhan peminjaman kepada komting.
4. Komting mengajukan peminjaman melalui jalur prioritas KRS atau peminjaman langsung.
5. Sistem melakukan validasi ketersediaan ruangan dan pengecekan bentrok jadwal.
6. Admin atau pengelola memeriksa pengajuan dan melakukan verifikasi KRS apabila diperlukan.
7. Admin atau pengelola memberikan keputusan berupa persetujuan atau penolakan.
8. Status dan riwayat peminjaman dapat dipantau melalui sistem.

## Teknologi yang Digunakan

| Teknologi | Kegunaan |
|---|---|
| Next.js | Framework pengembangan web |
| JavaScript / TypeScript | Bahasa pemrograman |
| Supabase | Database dan layanan backend |
| Git & GitHub | Version control dan kolaborasi tim |
| Visual Studio Code | Code editor |
| Vercel | Deployment aplikasi |

## Tim Pengembang

Proyek SIRAKA dikembangkan oleh Kelompok 1, Program Studi Pendidikan Teknologi Informatika dan Komputer, Fakultas Teknik, Universitas Negeri Medan.

| Nama | NIM | Peran dan Tanggung Jawab |
|---|---|---|
| Jaka Perdana | 5243151043 | Project Manager, pengelolaan repository, arsitektur sistem, database, backend, autentikasi dan hak akses, integrasi, deployment, serta dokumentasi teknis. |
| Firda Nabilah | 5243151005 | Analisis kebutuhan dan survei, desain UI/UX, wireframe, mockup, navigasi, implementasi tampilan admin, koordinasi pengujian/UAT, dan panduan pengguna. |
| Muhammad Yuhda Umama | 5242451007 | Penyusunan Project Charter, Scope Statement, SRS, WBS, Gantt Chart, jalur kritis, RAB, EVM, diagram sistem, implementasi frontend mahasiswa, komting, dan pengelola ruangan, serta penyatuan laporan akhir. |

## Instalasi dan Menjalankan Proyek

Ikuti langkah berikut untuk menjalankan SIRAKA di lingkungan lokal.

### 1. Persyaratan

Pastikan perangkat telah memiliki:
- Node.js dan npm.
- Git.
- Visual Studio Code atau code editor lainnya.
- Akun Supabase untuk konfigurasi database.

### 2. Clone Repository

```bash
git clone https://github.com/Anang-Programmer/siraka.git
```

Masuk ke direktori proyek:

```bash
cd siraka
```

### 3. Install Dependencies

Jalankan perintah:

```bash
npm install
```

Perintah ini akan menginstal seluruh dependencies yang dibutuhkan berdasarkan `package.json`.

### 4. Konfigurasi Environment Variables

Buat file `.env.local` pada direktori utama proyek.

Sesuaikan konfigurasi Supabase dengan file `.env.example` atau konfigurasi yang digunakan dalam source code proyek.

**Catatan:** Jangan mengunggah file `.env.local` yang berisi kredensial atau API key pribadi ke repository GitHub.

### 5. Jalankan Development Server

```bash
npm run dev
```

Buka browser dan akses:

```text
http://localhost:3000
```

### 6. Build untuk Production

Untuk memeriksa kesiapan aplikasi sebelum deployment:

```bash
npm run build
```

Untuk menjalankan hasil build:

```bash
npm start
```

## Dokumentasi Proyek

Dokumentasi pengembangan SIRAKA mencakup:

- Project Charter
- Scope Statement
- Software Requirements Specification (SRS)
- Work Breakdown Structure (WBS)
- Gantt Chart
- Critical Path
- Rencana Anggaran Biaya (RAB)
- Earned Value Management (EVM)
- Diagram sistem (UML dan ERD)
- Dokumentasi UI/UX
- Panduan pengguna

## Metodologi Pengembangan

Pengembangan SIRAKA menggunakan metode **Waterfall**, yang terdiri atas tahapan:

1. Requirement Analysis – Analisis kebutuhan sistem dan pengguna.
2. System Design – Perancangan arsitektur, database, diagram, dan antarmuka.
3. Implementation – Pengembangan frontend, backend, dan integrasi database.
4. Testing – Pengujian fungsi dan evaluasi sistem.
5. Deployment – Penerapan sistem agar dapat diakses pengguna.
6. Maintenance – Pemeliharaan dan perbaikan sistem.

## 🔗 Link Proyek

| Keterangan | Link |
|---|---|
| Website SIRAKA | [Kunjungi Website](https://www.siraka.web.id/) |
| Repository GitHub | [Source Code](https://github.com/Anang-Programmer/siraka) |
| Desain UI/UX Figma | [Lihat Desain](https://www.figma.com/design/3ohsa8FqlvQjoMEXrd2fjz/SIRAKA?node-id=4-2&t=uEIa8OlB1x5dOadm-1) |

## Informasi Akademik

**Mata Kuliah:** Manajemen Proyek Teknologi Informasi  
**Dosen Pengampu:** Harvei Desmon Hutahaean, S.Kom., M.Kom.  
**Program Studi:** Pendidikan Teknologi Informatika dan Komputer (PTIK)  
**Fakultas:** Teknik  
**Universitas:** Universitas Negeri Medan  
**Kelompok:** Kelompok 3 MPTI
**Tahun Akademik:** 2026/2027

---

© 2026 Tim Pengembang SIRAKA. All Rights Reserved.