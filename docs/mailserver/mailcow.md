Menginstal **Mailcow** adalah langkah yang sangat pro karena Anda jadi punya server email kelas atas (lengkap dengan anti-spam, webmail, dan SMTP) layaknya punya Gmail sendiri!

Karena Mailcow ini sangat besar (terdiri dari banyak komponen seperti Postfix, Dovecot, Rspamd), Mailcow dijalankan menggunakan **Docker Compose**. 

Berikut adalah panduan lengkap cara menginstalnya (asumsi Anda menggunakan VPS dari Rumahweb dengan sistem operasi **Ubuntu 20.04 / 22.04** atau **Debian 11 / 12**):

### 💡 Syarat Mutlak Sebelum Menginstal
1. **VPS Baru yang Kosong (Fresh):** Jangan instal Mailcow di VPS yang sama dengan aplikasi GAIN jika Anda tidak paham cara mengatur *Port*. Mailcow akan memonopoli port `80`, `443` (HTTP/HTTPS), `25`, `465`, dan `587` (Email).
2. **Pengaturan DNS (Sangat Penting):** Di panel domain Rumahweb Anda, buat 2 *record* ini:
   - **A Record**: `mail.domainanda.com` arahkan ke IP VPS Anda.
   - **MX Record**: `domainanda.com` arahkan ke `mail.domainanda.com` (prioritas 10).

---

### 🛠️ Langkah-Langkah Instalasi di VPS Anda

**1. Masuk ke VPS Anda (via SSH)**
```bash
ssh root@IP_VPS_ANDA
```

**2. Pastikan Docker sudah terinstal**
Jika VPS Anda belum punya Docker, instal dulu dengan perintah ini:
```bash
curl -sSL https://get.docker.com/ | CHANNEL=stable sh
```

**3. Unduh (*Clone*) Mailcow dari Github resmi**
```bash
sudo su
cd /opt
git clone https://github.com/mailcow/mailcow-dockerized
cd mailcow-dockerized
```

**4. Buat File Konfigurasi (Generator)**
Jalankan perintah ini untuk membuat konfigurasi awal:
```bash
./generate_config.sh
```
*Nanti Anda akan ditanya **"Mail server hostname (FQDN)"**. Jawab dengan: `mail.domainanda.com`*

**5. Unduh & Jalankan Semua Mesin Mailcow**
Sekarang, perintahkan Docker untuk mengunduh dan menyalakan server emailnya:
```bash
docker compose pull
docker compose up -d
```
*(Tunggu sekitar 2-5 menit karena Docker sedang mengunduh seluruh sistem email).*

---

### 🎉 Cara Menggunakan Mailcow Anda
Jika perintah di atas selesai tanpa error, server email Anda sudah hidup!
1. Buka browser dan ketik: `https://mail.domainanda.com`
2. Login dengan akun bawaan:
   - **Username**: `admin`
   - **Password**: `moohoo` *(Langsung ganti password ini setelah berhasil login!)*
3. Di dalam panel admin Mailcow:
   - Pergi ke menu **Configuration > Mail Setup**.
   - Klik tab **Domains**, lalu tambahkan domain Anda (`domainanda.com`).
   - Klik tab **Mailboxes**, dan buat email baru (misalnya `admin@domainanda.com` beserta *password*-nya).

Selesai! Akun `admin@domainanda.com` dan *password* yang baru Anda buat itulah yang dimasukkan ke dalam file `.env` GAIN NiagaKoin Anda (`SMTP_USER` dan `SMTP_PASS`).