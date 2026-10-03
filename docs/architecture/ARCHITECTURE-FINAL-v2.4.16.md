# GAIN Niaga Koin v2.4.16 — Final Architecture (Architecture 25)

Tanggal implementasi: 2 Oktober 2026

## 1. Keputusan arsitektur final

Arsitektur GAIN dipisahkan menjadi enam lapisan yang independen:

1. **Identity** — Google/Firebase Authentication menjawab siapa pengguna.
2. **Member** — lifecycle member GAIN (`active`, `suspended`, `closed`) menjawab apakah akun dapat digunakan.
3. **License / Entitlement** — status lisensi (`none`, `active`, `suspended`, `expired`) menjawab fitur berbayar yang dimiliki.
4. **Security Session** — verifikasi email OTP 6 digit membuat sesi keamanan elevated selama 24 jam; mekanisme ini **on-demand** dan bukan gerbang dashboard/login.
5. **Transaction Security** — Google Authenticator/TOTP dipakai untuk tindakan finansial berisiko tinggi sesuai kebijakan server.
6. **Resource / Execution Authorization** — sebelum eksekusi, server memeriksa exchange credential, mode sandbox/live, quota bot, gas reserve, dan guardrail lain yang relevan.

Alur konseptual:

```text
Google/Firebase Authentication
            |
            v
        GAIN Member
            |
            +-------------------------+
            |                         |
            v                         v
     License = NONE            License = ACTIVE
            |                         |
            +-----------+-------------+
                        |
                        v
                User Action / Route
                        |
                        v
               Authorization Gate
                        |
          +-------------+-------------+
          |             |             |
          v             v             v
         LOW          MEDIUM         HIGH
          |             |             |
       allow       Security OTP    OTP + TOTP
                                      |
                                      v
                               Resource checks
                                      |
                                      v
                                  Execute
```

## 2. Definisi User 1 dan User 2

### User 2 — member tanpa lisensi aktif

```text
memberStatus = active
licenseStatus = none
```

User tetap dapat masuk dashboard setelah Google Authentication dan menggunakan fitur yang tidak mensyaratkan lisensi. User tidak mendapatkan entitlement live trading berbayar.

### User 1 — member dengan lisensi aktif

```text
memberStatus = active
licenseStatus = active
```

User mendapatkan entitlement paket lisensi sesuai `licenseTier`, termasuk quota bot dan fitur live yang diizinkan. **User tidak lagi dipaksa memasukkan OTP ketika membuka dashboard.**

## 3. Arti `accountStatus`

`accountStatus` dipertahankan sebagai **compatibility/read-model alias** untuk source/UI lama.

```text
licenseStatus = active  -> accountStatus = active
licenseStatus != active -> accountStatus = non-active
```

Kode baru sebaiknya memakai `licenseStatus` untuk keputusan entitlement dan `memberStatus` untuk lifecycle member. `accountStatus` tidak boleh dijadikan satu-satunya dasar security authorization.

## 4. Security Session 24 jam

OTP 6 digit sekarang diposisikan sebagai **Security Session Elevation**.

Endpoint utama:

```text
GET  /api/security/session-status
POST /api/security/send-code
POST /api/security/verify-code
POST /api/security/session-logout
```

Sesi elevated tidak memblokir dashboard. Backend mengeluarkan:

```text
403 SESSION_ELEVATION_REQUIRED
```

ketika sebuah tindakan memang membutuhkan elevated security. Client mendengarkan error ini dan membuka `SecurityVerificationModal` secara on-demand.

Karakteristik:

- kode dikirim lewat email;
- kode 6 digit hanya untuk security elevation;
- sesi elevated berlaku 24 jam;
- logout mencabut sesi elevated;
- verifikasi tidak otomatis menjalankan ulang tindakan terakhir — user mengulang tindakan setelah modal sukses.

## 5. License authorization

Helper server:

```ts
requireActiveLicense(uid)
requireLicensedSecuritySession(req, uid)
```

`requireLicensedSecuritySession` dipakai jika sebuah route membutuhkan **dua hal sekaligus**:

1. lisensi aktif; dan
2. security session 24 jam.

`requireSecuritySession` dipakai bila tindakan memerlukan elevated security tetapi tidak harus mempunyai lisensi.

## 6. Policy endpoint utama

| Area | Member | License | Security Session | TOTP |
|---|---:|---:|---:|---:|
| Dashboard / identity | ✅ | ❌ | ❌ | ❌ |
| Market / edukasi / referral | ✅ | ❌ | ❌ | ❌ |
| Aktivasi lisensi / aksi pembayaran | ✅ | belum | ✅ | sesuai payment policy |
| Exchange credential sandbox | ✅ | ❌ | ✅ | ❌ |
| Exchange credential live | ✅ | ✅ | ✅ | sesuai policy |
| Bot testnet/sandbox | ✅ | ❌ | ✅ | ❌ |
| Bot live | ✅ | ✅ | ✅ | sesuai policy |
| Live order | ✅ | ✅ | ✅ | ✅ bila diwajibkan server |
| Micro-live certification | ✅ | ✅ | ✅ | sesuai policy |
| Transfer / withdrawal | ✅ | sesuai policy | ✅ | ✅ |
| Recovery / pause / kill switch | ✅ | sesuai policy | ✅ | sesuai action policy |

Catatan: tabel merupakan policy target untuk source v2.4.16. Validasi E2E eksternal tetap diperlukan di environment target.

## 7. Proteksi startup bot

Startup recovery tetap **fail-closed** secara default.

Jika `BOT_STARTUP_AUTO_RESUME` diaktifkan secara eksplisit:

- runner testnet boleh auto-resume setelah reconciliation jika policy lainnya terpenuhi;
- runner live wajib masih memiliki license `ACTIVE`;
- jika lisensi tidak aktif, runner live tetap `paused` dengan alasan `LICENSE_REQUIRED`.

Tidak ada persisted live runner yang boleh menjadi aktif hanya karena proses Node restart.

## 8. Perubahan UX

Sebelumnya:

```text
Google Login
  -> User 1?
  -> minta OTP
  -> baru dashboard
```

Sekarang:

```text
Google Login
  -> Dashboard
```

Kemudian ketika user melakukan tindakan protected:

```text
User Action
  -> 403 SESSION_ELEVATION_REQUIRED
  -> SecurityVerificationModal
  -> OTP
  -> elevated session 24h
  -> user mengulangi tindakan
```

Dengan model ini, user belum berlisensi tidak diperlakukan sebagai user yang "tidak aman". Mereka hanya tidak mempunyai entitlement live/paid.

## 9. Hubungan dengan 2FA

Google Authenticator/TOTP tidak digantikan oleh email OTP.

- **Firebase/Google Auth** = identity authentication.
- **Email OTP security session** = recent security elevation.
- **TOTP** = authorization tingkat tinggi untuk aksi finansial berisiko.

Ketiganya mempunyai tanggung jawab berbeda.

## 10. Backward compatibility

Tidak ada migrasi besar yang memaksa penghapusan `accountStatus` pada v2.4.16.

Backend read model sekarang mengambil:

- `member_status` dari user;
- `license_status`, `license_tier`, `license_type`, `license_name`, `max_active_bots`, `license_expires_at` dari lisensi aktif;
- `accountStatus` diturunkan dari `licenseStatus` untuk kompatibilitas UI lama.

Store Firestore/member directory juga membawa field license/member baru.

## 11. Validasi source yang sudah dijalankan

- `node scripts/roadmap-source-gate.mjs` → `sourceGate: true`, `failedCount: 0`.
- `node scripts/public-readiness-gate.mjs` → `sourceGate: true`, `failedCount: 0`.

### Belum terverifikasi di container

`npm run lint`, `npm run build`, dan test runtime penuh belum dapat diverifikasi di container karena `node_modules` dari arsip berisi native package macOS/ARM64 sedangkan runner validasi adalah Linux/x64. Ini adalah keterbatasan environment dependency, bukan bukti bahwa source pasti gagal.

Pada Mac target, lakukan instalasi dependency bersih sebelum validasi:

```bash
rm -rf node_modules
npm ci
npm run lint
npm run build
npm test
npm run test:core
```

## 12. Acceptance checklist Architecture 25

- [x] Login Google/Firebase tidak lagi digate oleh security OTP.
- [x] User tanpa license dapat masuk dashboard.
- [x] User dengan license mendapat entitlement melalui `licenseStatus`.
- [x] Security OTP tetap tersedia sebagai session elevation on-demand.
- [x] `SESSION_ELEVATION_REQUIRED` membuka modal security secara global.
- [x] Live routes memeriksa active license di server.
- [x] Live bot startup auto-resume memeriksa active license.
- [x] TOTP tetap diposisikan sebagai high-risk transaction security.
- [x] `accountStatus` dipertahankan sebagai backward-compatible alias.
- [x] Startup bot default tetap fail-closed.
- [x] Architecture-25 source gate tersedia dan memeriksa pemisahan member/license/security/TOTP.
- [ ] External E2E, DB migration, replay matrix, chaos/recovery, soak, dan backup/restore masih harus dijalankan di target environment.
